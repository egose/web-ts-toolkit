import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import * as esm from '@web-ts-toolkit/email-service';

const cjs = createRequire(import.meta.url)('@web-ts-toolkit/email-service');
const scope = 'packed-admission';
const batchId = 'mixed-builds';
const firstKey = { kind: 'batch', batchId, itemId: 'first' };
const command = {
  templateKey: 'notice',
  input: 'fixture',
  intent: 'fixture',
  provider: { kind: 'smtp', mode: 'live', key: 'local' },
};
const configError = { code: 'invalid_config' };
const unconfirmed = { code: 'write_unconfirmed' };
assert.notEqual(esm.createEmailBatchAdmission, cjs.createEmailBatchAdmission);
assert.notEqual(esm.createEmailRelay, cjs.createEmailRelay);

for (const [consumer, producer] of [
  [esm, cjs],
  [cjs, esm],
]) {
  for (const binding of [{}, { smtpCapacity: { format: 'smtp-v2', namespace: randomUUID(), maxRecipients: 51 } }]) {
    const store = producer.createMemoryEmailStore(binding);
    await store.ready();
    let prepared = 0;
    const notice = producer.defineLocalTemplate({
      kind: 'handlebars',
      revision: 'v1',
      defaults: { from: { address: 'from@example.invalid' } },
      subject: { kind: 'inline', content: 'Notice' },
      text: { kind: 'inline', content: 'Synthetic fixture' },
      parseInput(input) {
        assert.equal(input, command.input);
        return input;
      },
      parseData: () => ({}),
      prepare() {
        prepared++;
        return { values: {}, to: [{ address: 'to@example.invalid' }] };
      },
    });
    const registry = producer.createEmailTemplateRegistry({ notice }, binding);
    const writes = [];
    const reads = [];
    let abortAfterCommit;
    const port = {
      ...binding,
      findAdmission(readScope, key, call) {
        assert.equal(readScope, scope);
        assert.deepEqual(call.smtpCapacity, binding.smtpCapacity);
        reads.push(key);
        return store.findAdmission(readScope, key, call);
      },
      async insert(writeScope, admission, call) {
        assert.equal(writeScope, scope);
        assert.deepEqual(call.smtpCapacity, binding.smtpCapacity);
        const ack = await store.insert(writeScope, admission, call);
        assert.equal(ack.status, 'inserted');
        writes.push(ack.job);
        if (abortAfterCommit) {
          abortAfterCommit.abort();
          abortAfterCommit = undefined;
          throw new producer.EmailError('write_unconfirmed');
        }
        return ack;
      },
    };
    const service = producer.createEmailService({ scope, store: { ...store, ...port }, registry, ...binding });
    const admission = consumer.createEmailBatchAdmission({ service, ...binding });
    const relay = consumer.createEmailRelay({ scope, store: port, ...binding });
    assert.deepEqual(Object.keys(admission), ['enqueueBatch']);
    assert.deepEqual(Object.keys(relay), ['enqueuePrepared']);

    const wrongBinding = { format: 'smtp-v2', namespace: randomUUID(), maxRecipients: 51 };
    assert.throws(() => consumer.createEmailBatchAdmission({ service, smtpCapacity: wrongBinding }), configError);
    assert.throws(() => consumer.createEmailRelay({ scope, store: port, smtpCapacity: wrongBinding }), configError);

    // The actual insert commits, but the elapsed operation is stopped before any confirmation.
    const request = {
      batchId,
      items: [
        { itemId: 'first', command },
        { itemId: 'second', command },
      ],
    };
    abortAfterCommit = new AbortController();
    const uncertain = await admission.enqueueBatch(request, { signal: abortAfterCommit.signal });
    assert.deepEqual(uncertain.items, [
      { itemId: 'first', status: 'failed', ...unconfirmed },
      { itemId: 'second', status: 'not_started' },
    ]);
    assert.deepEqual(uncertain.counts, { enqueued: 0, replayed: 0, failed: 1, notStarted: 1, persistenceFailures: 1 });
    assert.deepEqual(reads, [firstKey]); // No remaining budget to confirm.
    assert.equal(writes.length, 1);
    assert.equal(prepared, 1);

    const calls = [];
    const wrapped = {
      scope,
      ...binding,
      enqueue(cmd, call) {
        assert.equal(this, wrapped);
        assert(!call.signal.aborted);
        calls.push(call);
        return service.enqueue(cmd, call);
      },
    };
    const resumed = await producer.createEmailBatchAdmission({ service: wrapped, ...binding }).enqueueBatch(request);
    assert.deepEqual(resumed.items[0], { itemId: 'first', status: 'replayed', job: writes[0] });
    assert.deepEqual(resumed.items[0].job.key, firstKey);
    assert.equal(resumed.items[1].status, 'enqueued');
    assert.equal(prepared, 2);
    assert.equal(writes.length, 2);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].signal, calls[1].signal);
    assert(calls[1].timeoutMs <= calls[0].timeoutMs);

    const key = { kind: 'single', idempotencyKey: 'outbox' };
    const serialized = JSON.stringify(await registry.prepare(scope, { ...command, key }));
    const foreign = consumer.createEmailRelay({ scope: 'foreign-scope', store: port, ...binding });
    await assert.rejects(foreign.enqueuePrepared(JSON.parse(serialized)), { code: 'invalid_snapshot' });
    abortAfterCommit = new AbortController();
    await assert.rejects(
      relay.enqueuePrepared(JSON.parse(serialized), { signal: abortAfterCommit.signal }),
      unconfirmed,
    );
    assert.deepEqual(reads.slice(1), [firstKey, { ...firstKey, itemId: 'second' }, key]);
    assert.equal(writes.length, 3);
    const replay = await relay.enqueuePrepared(JSON.parse(serialized));
    assert.deepEqual(replay, { status: 'replayed', job: writes[2] });
    assert.deepEqual(replay, await service.enqueuePrepared(JSON.parse(serialized)));
    assert.equal(prepared, 3);
    assert.equal(writes.length, 3);
  }
}
