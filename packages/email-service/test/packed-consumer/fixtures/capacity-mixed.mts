import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import * as esm from '@web-ts-toolkit/email-service';
import { createMongooseEmailStore } from '@web-ts-toolkit/email-service/mongoose';
import { createSendGridProvider } from '@web-ts-toolkit/email-service/sendgrid';
import { createSmtpProvider, type SmtpProviderOptions } from '@web-ts-toolkit/email-service/smtp';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import cjs = require('@web-ts-toolkit/email-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import cjsMongo = require('@web-ts-toolkit/email-service/mongoose');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import cjsSmtp = require('@web-ts-toolkit/email-service/smtp');

const scope = 'packed-capacity';
const configError = { code: 'invalid_config' };
const snapshotError = { code: 'invalid_snapshot' };
const profile = { key: 'packed-smtp', host: 'smtp.example.invalid', tls: 'starttls' } satisfies SmtpProviderOptions;

const notice = esm.defineLocalTemplate({
  kind: 'handlebars',
  revision: 'v1',
  defaults: { from: { address: 'sender@example.invalid' } },
  subject: { kind: 'inline', content: 'Notice' },
  text: { kind: 'inline', content: 'Synthetic fixture' },
  parseInput(input) {
    assert(typeof input === 'number' && Number.isSafeInteger(input) && input > 0 && input <= 1_001);
    return input;
  },
  parseData: () => ({}),
  prepare(count) {
    const recipients = Array.from({ length: count }, (_, i) => ({ address: `recipient-${i}@example.invalid` }));
    return { to: recipients.slice(0, 1), cc: recipients.slice(1, 2), bcc: recipients.slice(2), values: {} };
  },
});
type Templates = { notice: typeof notice };

function command(count: number) {
  return {
    templateKey: 'notice',
    provider: { kind: 'smtp', mode: 'live', key: profile.key },
    key: { kind: 'single', idempotencyKey: `packed-${count}` },
    input: count,
    intent: count,
  } as const;
}

export async function verifyCapacityBindings(connection: Connection, v1Store: esm.EmailStore): Promise<void> {
  const low: cjs.SmtpCapacity = { format: 'smtp-v2', namespace: randomUUID(), maxRecipients: 51 };
  const high: esm.SmtpCapacity = { format: 'smtp-v2', namespace: randomUUID(), maxRecipients: 1_000 };
  const lowRegistry = cjs.createEmailTemplateRegistry({ notice }, { smtpCapacity: low });
  const highRegistry = esm.createEmailTemplateRegistry({ notice }, { smtpCapacity: high });
  const v1Registry = esm.createEmailTemplateRegistry({ notice });
  const lowStore = createMongooseEmailStore(connection, { smtpCapacity: low });
  const highStore = cjsMongo.createMongooseEmailStore(connection, { smtpCapacity: high });
  await lowStore.ready();
  await highStore.ready();

  // Supply the template map across the two declaration modules so inference doesn't widen it to TemplateMap.
  const v1 = cjs.createEmailService<Templates>({ scope, store: v1Store, registry: v1Registry });
  const small = esm.createEmailService<Templates>({ scope, store: lowStore, registry: lowRegistry, smtpCapacity: low });
  const large = cjs.createEmailService<Templates>({
    scope,
    store: highStore,
    registry: highRegistry,
    smtpCapacity: high,
  });
  const lowAdmin = cjs.createEmailAdmin({ scope, store: lowStore, smtpCapacity: low });
  const highAdmin = esm.createEmailAdmin({ scope, store: highStore, smtpCapacity: high });
  const otherScope = esm.createEmailAdmin({ scope: 'other-scope', store: highStore, smtpCapacity: high });
  const lowSmtp = createSmtpProvider({ ...profile, smtpCapacity: low });
  const highSmtp = cjsSmtp.createSmtpProvider({ ...profile, smtpCapacity: high });
  assert(Object.isFrozen(highSmtp.smtpCapacity));
  assert.deepEqual(highSmtp.smtpCapacity, high);
  assert.notEqual(highSmtp.smtpCapacity, high);

  const gridWithCapacity = { key: 'sendgrid', apiKey: 'synthetic-token', smtpCapacity: high };
  for (const create of [
    () => cjs.createMemoryEmailStore({ smtpCapacity: { ...low, maxRecipients: 50 } }),
    () => cjsSmtp.createSmtpProvider({ ...profile, smtpCapacity: { ...high, maxRecipients: 1_001 } }),
    () => createSendGridProvider(gridWithCapacity),
    () => createMongooseEmailStore(connection, { smtpCapacity: low, jobsCollection: 'email_jobs' }),
    () => esm.createEmailService<Templates>({ scope, store: highStore, registry: highRegistry }),
    () => esm.createEmailAdmin({ scope, store: lowStore, smtpCapacity: high }),
    () => cjs.createEmailWorker({ scope, store: highStore, smtpCapacity: high, providers: [lowSmtp] }),
  ]) {
    assert.throws(create, configError);
  }
  const conflicting = createMongooseEmailStore(connection, { smtpCapacity: { ...high, maxRecipients: 51 } });
  await assert.rejects(conflicting.ready(), { code: 'store_incompatible' });

  const legacy = await v1Registry.prepare(scope, command(50));
  assert(!Object.hasOwn(legacy, 'smtpCapacity'));
  assert(!Object.hasOwn(legacy.snapshot, 'smtpCapacity'));
  const legacyJob = (await v1.enqueuePrepared(legacy)).job;
  assert.equal(legacyJob.version, 1);
  assert(!Object.hasOwn(legacyJob, 'smtpCapacity'));
  await assert.rejects(v1.enqueue(command(51)), snapshotError);

  const bounded = await lowRegistry.prepare(scope, command(51));
  assert.deepEqual(bounded.smtpCapacity, low);
  const smallJob = (await small.enqueuePrepared(bounded)).job;
  const largerQueueJob = (await large.enqueue(command(51))).job;
  assert.deepEqual(smallJob.smtpCapacity, low);
  assert.deepEqual(largerQueueJob.smtpCapacity, high);
  assert.notEqual(smallJob.jobId, largerQueueJob.jobId); // Same scope and admission key, different backings.
  assert.equal(await highAdmin.getJob(smallJob.jobId), null);
  assert.equal(await otherScope.getJob(largerQueueJob.jobId), null);
  await assert.rejects(small.enqueue(command(52)), snapshotError);
  await assert.rejects(v1.enqueuePrepared(bounded), snapshotError);
  await assert.rejects(large.enqueuePrepared(bounded), snapshotError);

  const maximum = await highRegistry.prepare(scope, command(1_000));
  assert(maximum.snapshot.kind === 'smtp');
  assert.equal(maximum.snapshot.version, 1);
  assert.deepEqual(maximum.snapshot.smtpCapacity, high);
  const { to, cc, bcc } = maximum.snapshot.envelope;
  assert.deepEqual([to.length, cc.length, bcc.length], [1, 1, 998]);
  const maximumJob = (await large.enqueuePrepared(maximum)).job;
  assert.deepEqual(await highAdmin.getJob(maximumJob.jobId), maximumJob);
  assert.equal(await lowAdmin.getJob(maximumJob.jobId), null);
  await assert.rejects(large.enqueue(command(1_001)), snapshotError);

  const submission = { jobId: maximumJob.jobId, attemptId: randomUUID(), snapshot: maximum.snapshot, attachments: [] };
  assert.equal(typeof highSmtp.prepare(submission).submit, 'function'); // Real SMTP preflight; never submit.
  assert.throws(() => lowSmtp.prepare(submission), snapshotError);

  const worker = esm.createEmailWorker({ scope, store: highStore, providers: [highSmtp], smtpCapacity: high });
  try {
    assert.throws(() => esm.createEmailBatchService<Templates>({ service: large, worker }), configError);
    const batch = esm.createEmailBatchService<Templates>({ service: large, worker, smtpCapacity: high });
    const { key, ...item } = command(51);
    const result = await batch.enqueueBatch({
      batchId: 'mixed-builds',
      items: [{ itemId: key.idempotencyKey, command: item }],
    });
    const admitted = result.items[0];
    assert(admitted?.status === 'enqueued');
    assert.deepEqual(admitted.job.smtpCapacity, high);
    assert.deepEqual(await highAdmin.getJob(admitted.job.jobId), admitted.job);
    assert.equal((await batch.run({ signal: AbortSignal.abort() })).counts.providerCalls, 0);
  } finally {
    await worker.shutdown();
  }
}
