import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import * as esm from '@web-ts-toolkit/email-service';

const cjs = createRequire(import.meta.url)('@web-ts-toolkit/email-service');
const mixed = [
  { group: 'to', index: 0, status: 'rejected' },
  { group: 'cc', index: 0, status: 'rejected' },
  { group: 'bcc', index: 0, status: 'accepted' },
];
const allAccepted = mixed.map((entry) => ({ ...entry, status: 'accepted' }));
const allRejected = mixed.map((entry) => ({ ...entry, status: 'rejected' }));
const full = { outcome: 'accepted', retry: 'never', stage: 'data', reason: 'smtp_accepted' };
const partial = { outcome: 'partially_accepted', retry: 'never', stage: 'data', reason: 'smtp_partial' };
const messageId = `<${randomUUID()}@email.invalid>`;

function checkConstructor(make) {
  assert.deepEqual(make(allAccepted), { ...full, recipients: allAccepted });
  const input = mixed.map((entry) => ({ ...entry }));
  const result = make(input, messageId);
  assert.deepEqual(result, { ...partial, recipients: mixed, messageId });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(Reflect.ownKeys(result.recipients), ['0', '1', '2', 'length']);
  assert(Object.isFrozen(result) && Object.isFrozen(result.recipients) && result.recipients.every(Object.isFrozen));
  assert.throws(() => result.recipients.push(input[0]), TypeError);
  assert.throws(() => (result.recipients[0].status = 'accepted'), TypeError);
  input[0].status = 'accepted';
  input.reverse();
  assert.deepEqual(result.recipients, mixed);
  assert.deepEqual(make(input).recipients, input, 'preserve an arbitrary input order');

  const bad = { code: 'invalid_command' };
  let getterCalls = 0;
  const accessor = Object.defineProperty({ ...mixed[2] }, 'status', {
    get() {
      getterCalls++;
      return 'accepted';
    },
  });
  for (const recipients of [
    [],
    allRejected,
    null,
    Array(1), // sparse
    Array(1_001).fill(mixed[2]),
    [mixed[2], { ...mixed[2], status: 'rejected' }], // duplicate group/index
    [{ ...mixed[2], index: -1 }],
    [{ ...mixed[2], group: 'from' }],
    [{ ...mixed[2], status: 'queued' }],
    [{ ...mixed[2], address: 'private@example.invalid' }],
    [accessor],
  ]) {
    assert.throws(() => make(recipients), bad);
  }
  assert.throws(() => make(allAccepted, '<synthetic-do-not-report@example.invalid>'), bad);
  assert.throws(() => make(allAccepted, 10), bad);
  assert.equal(getterCalls, 0);
}

for (const [root, otherRoot] of [
  [esm, cjs],
  [cjs, esm],
]) {
  checkConstructor(root.createSmtpAcceptanceResult);
  const smtpCapacity = { format: 'smtp-v2', namespace: randomUUID(), maxRecipients: 51 };
  const scope = 'packed-provider-results';
  const store = root.createMemoryEmailStore({ smtpCapacity });
  await store.ready();
  const notice = root.defineLocalTemplate({
    kind: 'handlebars',
    revision: 'v1',
    defaults: { from: { address: 'from@example.invalid' } },
    subject: { kind: 'inline', content: 'Notice' },
    text: { kind: 'inline', content: 'Synthetic test' },
    parseInput: () => null,
    parseData: () => ({}),
    prepare: () => ({
      to: [{ address: 'to@example.invalid' }],
      cc: [{ address: 'cc@example.invalid' }],
      bcc: [{ address: 'bcc@example.invalid' }],
      values: {},
    }),
  });
  const registry = root.createEmailTemplateRegistry({ notice }, { smtpCapacity });
  const service = root.createEmailService({ scope, store, registry, smtpCapacity });
  const admin = root.createEmailAdmin({ scope, store, smtpCapacity });
  const ref = { kind: 'smtp', key: 'synthetic', mode: 'live' };
  const cases = [
    otherRoot.createSmtpAcceptanceResult(mixed), // Both statuses in capacity order, built by the other format.
    { ...full, recipients: [] }, // Pure JS can still bypass the type and constructor.
    { ...partial, recipients: allAccepted },
    otherRoot.createSmtpAcceptanceResult([...mixed].reverse()), // Checked mixed proof does not prove envelope order.
  ];
  let calls = 0;
  const worker = root.createEmailWorker({
    scope,
    store,
    smtpCapacity,
    providers: [{ ref, smtpCapacity, prepare: () => ({ submit: async () => cases[calls++] }) }],
  });
  try {
    for (const [index, result] of cases.entries()) {
      const key = { kind: 'single', idempotencyKey: `notice-${index}` };
      const { job } = await service.enqueue({ templateKey: 'notice', input: null, intent: index, key, provider: ref });
      const accepted = index === 0;
      const reason = accepted ? result.reason : 'transport_uncertain';
      const outcome = accepted ? result.outcome : 'unknown';
      const run = await worker.run({ limit: 1 });
      assert.equal(run.counts.providerCalls, 1);
      assert.equal(run.counts.retryScheduled, 0);
      assert.equal(run.items[0].reason, reason);
      const settled = await admin.getJob(job.jobId);
      assert.equal(settled.disposition, outcome);
      assert.equal(settled.unknownOpen, !accepted);
      assert.equal(settled.attemptCount, 1);
      assert.equal((await admin.reconcile()).acknowledged, 1);
      const history = await admin.listActivities({ jobId: job.jobId });
      assert.deepEqual(
        history.items[0].result,
        accepted ? result : { outcome: 'unknown', retry: 'never', stage: 'data', reason },
      );
      assert.doesNotMatch(JSON.stringify(history), /example\.invalid/);
      assert.equal((await worker.run()).counts.providerCalls, 0);
      assert.equal(calls, index + 1);
    }
  } finally {
    await worker.shutdown();
  }
}
