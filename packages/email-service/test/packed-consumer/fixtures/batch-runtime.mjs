import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '@web-ts-toolkit/email-service';

const cjs = createRequire(import.meta.url)('@web-ts-toolkit/email-service');
const scope = 'packed-fixture';
assert.notEqual(esm.EmailError, cjs.EmailError);
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
  const worker = facadeRoot.createEmailWorker({ scope, store, providers: [] });
  const batch = facadeRoot.createEmailBatchService({ service, worker });
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
  assert.deepEqual(await admin.getJob(jobId), admitted.items[0].job);
  await assert.rejects(admin.getJob(jobId, { signal: AbortSignal.abort() }), { code: 'aborted' });
  assert.deepEqual(await admin.listActivities({ jobId }), { items: [] });
  assert.equal((await admin.cancel(jobId)).status, 'cancelled');
  assert.equal((await admin.reconcile()).acknowledged, 0);
  assert.equal((await batch.run({ signal: AbortSignal.abort() })).stop, 'aborted');
  await worker.shutdown();
}
