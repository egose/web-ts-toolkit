import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import * as esm from '@web-ts-toolkit/email-service';

const cjs = createRequire(import.meta.url)('@web-ts-toolkit/email-service');
const scope = 'packed-fixture';
assert.notEqual(esm.EmailError, cjs.EmailError);
assert.notEqual(esm.createEmailBatchAdmission, cjs.createEmailBatchAdmission);
assert.notEqual(esm.createEmailBatchService, cjs.createEmailBatchService);
for (const [facadeRoot, serviceRoot] of [
  [esm, cjs],
  [cjs, esm],
]) {
  const store = serviceRoot.createMemoryEmailStore();
  await store.ready();
  let prepared = 0;
  const registry = serviceRoot.createEmailTemplateRegistry({
    notice: serviceRoot.defineLocalTemplate({
      kind: 'handlebars',
      revision: 'v1',
      defaults: { from: { address: 'from@example.invalid' } },
      subject: { kind: 'inline', content: 'Notice' },
      text: { kind: 'inline', content: 'Example' },
      parseInput(input) {
        if (typeof input !== 'string') throw new Error('Fixture input must be a string');
        return input;
      },
      parseData: () => ({}),
      prepare() {
        prepared++;
        return { values: {}, to: [{ address: 'to@example.invalid' }] };
      },
    }),
  });
  const service = serviceRoot.createEmailService({ scope, store, registry });
  const batch = facadeRoot.createEmailBatchAdmission({ service });
  const command = {
    templateKey: 'notice',
    input: 'example',
    intent: 'example',
    provider: { kind: 'smtp', key: 'local', mode: 'live' },
  };
  const first = { itemId: 'valid', command };
  const bad = { itemId: 'invalid', command: { ...command, input: 42 } };
  const admitted = await batch.enqueueBatch({ batchId: 'mixed-formats', items: [first, bad] });
  assert.deepEqual(admitted.counts, { enqueued: 1, replayed: 0, failed: 1, notStarted: 0, persistenceFailures: 0 });
  assert.deepEqual(admitted.items[1], { itemId: 'invalid', status: 'failed', code: 'invalid_input' });
  assert.deepEqual(admitted.items[0].job.key, { kind: 'batch', batchId: 'mixed-formats', itemId: first.itemId });
  assert(Object.isFrozen(admitted.items[0].job));
  const replay = await batch.enqueueBatch({ batchId: 'mixed-formats', items: [first] });
  assert.equal(replay.items[0].status, 'replayed');
  assert.deepEqual(replay.items[0].job, admitted.items[0].job);
  assert.equal(prepared, 1);
  const admin = facadeRoot.createEmailAdmin({ scope, store });
  const { jobId } = admitted.items[0].job;
  assert.throws(() => facadeRoot.createEmailWorker({ scope, store, providers: [] }), { code: 'invalid_config' });
  assert.deepEqual(await admin.getJob(jobId), admitted.items[0].job);
  await assert.rejects(admin.getJob(jobId, { signal: AbortSignal.abort() }), { code: 'aborted' });
  assert.deepEqual(await admin.listActivities({ jobId }), { items: [] });
  assert.equal((await admin.cancel(jobId)).status, 'cancelled');
  assert.equal((await admin.reconcile()).acknowledged, 0);

  let submissions = 0;
  const provider = {
    ref: command.provider,
    prepare({ snapshot: { envelope } }) {
      const recipients = ['to', 'cc', 'bcc'].flatMap((group) =>
        envelope[group].map((_, index) => ({ group, index, status: 'accepted' })),
      );
      return {
        async submit() {
          submissions++;
          return serviceRoot.createSmtpAcceptanceResult(recipients);
        },
      };
    },
  };
  const worker = facadeRoot.createEmailWorker({ scope, store, providers: [provider] });
  try {
    const combined = facadeRoot.createEmailBatchService({ service, worker });
    const delivery = await combined.enqueueBatch({ batchId: 'delivery', items: [first] });
    assert.equal(delivery.items[0].status, 'enqueued');
    assert.equal((await combined.run({ signal: AbortSignal.abort() })).stop, 'aborted');
    const run = await combined.run({ limit: 1 });
    assert.equal(run.items[0].jobId, delivery.items[0].job.jobId);
    assert.equal(run.counts.accepted, 1);
    assert.equal(run.counts.providerCalls, 1);
    assert.equal((await combined.run()).stop, 'idle');
    assert.equal(submissions, 1);
  } finally {
    await worker.shutdown();
  }
}

// Even the opted-in core can use a bound store without loading either adapter peer.
const smtpCapacity = { format: 'smtp-v2', namespace: randomUUID(), maxRecipients: 51 };
const store = cjs.createMemoryEmailStore({ smtpCapacity });
await store.ready();
const admin = esm.createEmailAdmin({ scope, store, smtpCapacity });
assert.deepEqual(await admin.listActivities(), { items: [] });
