import { randomUUID } from 'node:crypto';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  createEmailAdmin,
  createEmailRelay,
  createEmailService,
  type PreparedEmailCommand,
  type StoreAdmission,
} from '../../src';
import { DEFAULT_RETENTION_POLICY, DEFAULT_RETRY_POLICY } from '../../src/constants';
import { systemEmailClock } from '../../src/internal/budget';
import { encodeAdmissionKey } from '../../src/internal/command-codecs';
import { expireJob, newJob } from '../../src/internal/job-transitions';
import { readCapacityOption } from '../../src/internal/smtp-capacity';
import { readStoreAdmission } from '../../src/internal/store-codecs';
import { createMongooseEmailStore } from '../../src/mongoose';
import { jobBson } from '../../src/stores/mongoose/records';
import { COMPOSITE_TYPES, stagedWithContentType } from '../conformance/smtp-attachment-fixture';
import { capacity, capacityCommand, capacityTemplate, laneCall } from '../conformance/smtp-capacity-fixture';
import { A, B, CALL, DAY } from '../conformance/store-fixtures';
import { commandTrace, dbOf, DURABLE, fixture, JOBS, replicaSet } from './fixture';

let repl: MongoMemoryReplSet;
beforeAll(async () => {
  repl = await replicaSet(1);
});
afterAll(async () => repl?.stop());

function admission(command: PreparedEmailCommand): StoreAdmission {
  return { command, jobId: randomUUID(), retry: DEFAULT_RETRY_POLICY, retention: DEFAULT_RETENTION_POLICY };
}

it.each(['V1', 'smtp-v2'] as const)(
  '%s reads and replays a retained legacy attachment, but rejects a staged miss without any Mongo write',
  async (lane) => {
    const queue = await fixture(repl);
    try {
      const smtpCapacity = lane === 'smtp-v2' ? capacity(51) : undefined;
      const binding = smtpCapacity ? { smtpCapacity } : {};
      const context = readCapacityOption(binding);
      const call = smtpCapacity ? laneCall(smtpCapacity) : CALL;
      const store = smtpCapacity ? createMongooseEmailStore(queue.first, binding) : queue.primary;
      const peer = smtpCapacity ? createMongooseEmailStore(queue.second, binding) : queue.peer;
      await store.ready();
      await peer.ready();
      const jobsName = smtpCapacity ? `email_smtp_v2.${smtpCapacity.namespace}.jobs` : JOBS;
      const jobs = dbOf(queue.first).collection<ReturnType<typeof jobBson>>(jobsName);
      const command = capacityCommand('legacy-smtp-attachment', 1);
      const preparedAt = (await queue.now()) - DAY - 1_000;
      const { registry, prepare } = capacityTemplate(smtpCapacity, {
        clock: { ...systemEmailClock, now: () => preparedAt },
        attachmentSizes: [1],
      });
      const leaf = await registry.prepare(A, command);
      const older: PreparedEmailCommand = JSON.parse(JSON.stringify(stagedWithContentType(leaf, COMPOSITE_TYPES[0])));
      const competingCommand = { ...command, intent: { changed: true } };
      const competingStage = stagedWithContentType(await registry.prepare(A, competingCommand), COMPOSITE_TYPES[0]);
      const input = admission(leaf);
      const { jobId } = input;
      const time = { now: preparedAt, revision: randomUUID() };
      const queued = newJob(readStoreAdmission(A, input, context), time, context);
      const expired = expireJob(queued, { now: leaf.snapshot.expiresAt, revision: randomUUID() });
      if (expired?.write?.kind !== 'replace') throw new Error('Expected a settled expired job');
      // Test fixture only: exact old row with its payload still retained. The old insert differed only
      // in snapshot/hash, so lay out the identical metadata and selectors with the maintained mapper.
      const persisted = jobBson({ ...expired.write.next, snapshot: older.snapshot, snapshotHash: older.snapshotHash });
      expect((await jobs.insertOne(persisted, { writeConcern: DURABLE })).acknowledged).toBe(true);
      const before = await jobs.findOne({ _id: persisted._id });

      prepare.mockClear();
      const options = { scope: A, store: peer, ...binding };
      const admin = createEmailAdmin(options);
      const summary = await admin.getJob(jobId); // Mongo decodes and verifies the full retained snapshot.
      expect(summary).toMatchObject({ ...binding, jobId, key: command.key, disposition: 'expired', attemptCount: 0 });
      const service = createEmailService({ ...options, registry });
      const relay = createEmailRelay(options);
      const replay = { status: 'replayed', job: summary };
      await expect(service.enqueue(command)).resolves.toEqual(replay);
      await expect(service.enqueuePrepared(older)).resolves.toEqual(replay);
      await expect(relay.enqueuePrepared(older)).resolves.toEqual(replay);
      await expect(service.enqueue(competingCommand)).rejects.toMatchObject({ code: 'idempotency_conflict' });
      await expect(relay.enqueuePrepared(competingStage)).rejects.toMatchObject({ code: 'idempotency_conflict' });
      expect(prepare).not.toHaveBeenCalled();
      await expect(peer.insert(A, admission(older), call)).resolves.toEqual({ status: 'duplicate' });
      await expect(createEmailAdmin({ ...options, scope: B }).getJob(jobId)).resolves.toBeNull();

      const current = capacityTemplate(smtpCapacity, { attachmentSizes: [1] });
      const foreignStage = stagedWithContentType(await current.registry.prepare(B, command), COMPOSITE_TYPES[1]);
      const foreignRelay = createEmailRelay({ scope: B, store, ...binding });
      const trace = commandTrace(queue.first);
      try {
        for (const invalid of [
          older, // Wrong scope.
          { ...foreignStage, snapshotHash: '0'.repeat(64) },
          { ...foreignStage, smtpCapacity: capacity(51) }, // Wrong (or unexpected) binding.
        ]) {
          await expect(foreignRelay.enqueuePrepared(invalid)).rejects.toMatchObject({ code: 'invalid_snapshot' });
        }
        expect(trace.commands).toHaveLength(0);
        await expect(foreignRelay.enqueuePrepared(foreignStage)).rejects.toMatchObject({ code: 'invalid_snapshot' });
        expect(trace.commands.map(({ commandName }) => commandName)).toEqual(['find']);
        expect(trace.commands[0]?.command).toMatchObject({
          find: jobsName,
          filter: { scope: B, admissionKey: encodeAdmissionKey(command.key) },
          readConcern: { level: 'linearizable' },
        });
        await expect(store.insert(B, admission(foreignStage), call)).rejects.toMatchObject({
          code: 'invalid_snapshot',
        });
        expect(trace.commands.map(({ commandName }) => commandName)).toEqual(['find', 'find', 'find']);
      } finally {
        trace.close();
      }
      expect(await jobs.countDocuments()).toBe(1);
      expect(await jobs.findOne({ _id: persisted._id })).toEqual(before);
    } finally {
      await queue.close();
    }
  },
);
