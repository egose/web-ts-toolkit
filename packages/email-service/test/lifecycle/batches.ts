import { expect, it, vi } from 'vitest';
import {
  createEmailBatchAdmission,
  createEmailBatchService,
  createEmailWorker,
  type EmailRateLimiter,
  type EmailStore,
} from '../../src';
import { A, B, CALL, lostAck } from '../conformance/store-fixtures';
import type { commandFor, Lifecycle } from './fixture';

const BATCH = 'wire-batch';
const key = (itemId: string) => ({ kind: 'batch', batchId: BATCH, itemId }) as const;
const identity = { event: 'fixture-notice', revision: 1 };

function item(itemId: string, { key: singleKey, ...command }: ReturnType<typeof commandFor>) {
  void singleKey; // The facade supplies its own tagged key.
  return { itemId, command };
}

/** The same public batch composition and delivery assertions on both ready store backends. */
export function lifecycleBatches(fixture: () => Lifecycle) {
  it('resumes a partial mixed batch through the same scoped workers without another accepted submission', async () => {
    const f = fixture();
    const smtp = await f.scenario('smtp');
    const grid = await f.scenario('sendgrid');
    const { primary, peer } = f.queue;
    const providers = [smtp.wire.provider, grid.wire.provider];
    const tryAcquire = vi.fn<EmailRateLimiter['tryAcquire']>(() => ({ status: 'granted' }));
    const rateLimiter = { scope: 'shared', tryAcquire } as const;
    const worker = createEmailWorker({
      store: primary,
      scope: A,
      providers,
      rateLimiter,
      attachmentResolvers: smtp.attachmentResolvers,
    });
    const peerWorker = createEmailWorker({
      store: peer,
      scope: A,
      providers,
      rateLimiter,
      attachmentResolvers: smtp.attachmentResolvers,
    });
    const insert = vi.fn<EmailStore['insert']>((...args) => {
      const { key } = args[1].command;
      return key.kind === 'batch' && key.itemId === 'resume'
        ? lostAck('before_commit', () => primary.insert(...args))
        : primary.insert(...args);
    });
    const findAdmission = vi.fn(peer.findAdmission);
    const batch = createEmailBatchService({ service: smtp.service({ ...primary, insert }), worker });
    const replay = createEmailBatchService({
      service: smtp.service({ ...peer, findAdmission }),
      worker: peerWorker,
    });
    const otherScope = createEmailBatchAdmission({ service: smtp.service(peer, B) });
    const z = item('z-smtp', { ...smtp.command, intent: identity });
    const a = item('a-grid', { ...grid.command, intent: identity });
    const missing = item('resume', grid.command);

    try {
      const initial = await batch.enqueueBatch({ batchId: BATCH, items: [z, missing, a] });
      expect(initial).toMatchObject({
        items: [
          { itemId: z.itemId, status: 'enqueued' },
          { itemId: missing.itemId, status: 'failed', code: 'write_unconfirmed' },
          { itemId: a.itemId, status: 'enqueued' },
        ],
        counts: { enqueued: 2, replayed: 0, failed: 1, notStarted: 0, persistenceFailures: 1 },
      });
      expect(insert).toHaveBeenCalledTimes(3);
      expect(await peer.findAdmission(A, key(missing.itemId), CALL)).toBeNull();
      const zJob = (await peer.findAdmission(A, key(z.itemId), CALL))!.job;
      const aJob = (await peer.findAdmission(A, key(a.itemId), CALL))!.job;

      const standalone = await smtp
        .service()
        .enqueue({ ...smtp.command, key: { kind: 'single', idempotencyKey: z.itemId } });
      const other = await otherScope.enqueueBatch({ batchId: BATCH, items: [z] });
      const future = await replay.enqueueBatch({
        batchId: 'another-batch',
        items: [{ ...z, command: { ...z.command, scheduleAt: (await f.queue.now()) + 120_000 } }],
      });
      expect(other.counts.enqueued).toBe(1);
      expect(future.counts.enqueued).toBe(1);
      const otherJob = (await peer.findAdmission(B, key(z.itemId), CALL))!.job;
      expect(new Set([standalone.job.jobId, zJob.jobId, otherJob.jobId]).size).toBe(3);
      expect(await f.job(otherJob.jobId)).toBeNull();
      smtp.wire.assertCount(0);
      grid.wire.assertCount(0);

      const delivered = await batch.run({ limit: 3, concurrency: 1, maintenanceLimit: 0 });
      expect(delivered).toMatchObject({
        stop: 'limit',
        counts: { claimed: 3, accepted: 3, submitted: 3, providerCalls: 3 },
      });
      expect(new Set(delivered.items.map(({ jobId }) => jobId))).toEqual(
        new Set([zJob.jobId, aJob.jobId, standalone.job.jobId]),
      );
      for (const { jobId, attemptId } of delivered.items) {
        expect(await f.attempt(jobId, attemptId!)).toMatchObject({
          disposition: 'accepted',
          result: { outcome: 'accepted' },
        });
      }
      const attemptZ = delivered.items.find((entry) => entry.jobId === zJob.jobId)!.attemptId!;
      // Two SMTP transactions use the same To/Cc/Bcc envelope; validate their message IDs and exact content.
      const smtpOrder = delivered.items.filter((entry) => entry.jobId !== aJob.jobId);
      await smtp.wire.assertSubmission(
        attemptZ,
        smtpOrder.findIndex((entry) => entry.jobId === zJob.jobId),
      );
      await grid.wire.assertSubmission(delivered.items.find((entry) => entry.jobId === aJob.jobId)!.attemptId!);
      smtp.wire.assertCount(2);
      grid.wire.assertCount(1);

      findAdmission.mockClear();
      smtp.prepare.mockClear();
      smtp.render.mockClear();
      const reordered = await replay.enqueueBatch({
        batchId: BATCH,
        items: [{ ...a, command: { ...a.command, intent: { revision: 1, event: 'fixture-notice' } } }, missing, z],
      });
      expect(reordered).toMatchObject({
        items: [
          {
            itemId: a.itemId,
            status: 'replayed',
            job: { jobId: aJob.jobId, state: 'terminal', disposition: 'accepted' },
          },
          { itemId: missing.itemId, status: 'enqueued' },
          {
            itemId: z.itemId,
            status: 'replayed',
            job: { jobId: zJob.jobId, state: 'terminal', disposition: 'accepted' },
          },
        ],
        counts: { enqueued: 1, replayed: 2, failed: 0, notStarted: 0, persistenceFailures: 0 },
      });
      expect(findAdmission.mock.calls.map(([scope, admission]) => [scope, admission])).toEqual([
        [A, key(a.itemId)],
        [A, key(missing.itemId)],
        [A, key(z.itemId)],
      ]);
      expect(smtp.prepare).toHaveBeenCalledOnce(); // Only the earlier noncommit.
      expect(smtp.render).not.toHaveBeenCalled();
      expect(insert).toHaveBeenCalledTimes(3); // The original facade did not retry.

      const resumed = await replay.run({ limit: 2, concurrency: 1 });
      const resumedJob = (await primary.findAdmission(A, key(missing.itemId), CALL))!.job;
      expect(resumed).toMatchObject({
        items: [{ jobId: resumedJob.jobId, status: 'accepted' }],
        counts: { accepted: 1, submitted: 1, providerCalls: 1 },
      });
      await grid.wire.assertSubmission(resumed.items[0]!.attemptId!, 1); // No local batch ID on the wire.
      expect(await f.job(otherJob.jobId, B)).toMatchObject({ state: 'queued', attemptCount: 0 });
      const futureJob = await peer.findAdmission(A, { ...key(z.itemId), batchId: 'another-batch' }, CALL);
      expect(futureJob?.job).toMatchObject({ state: 'queued', attemptCount: 0 });
      expect((await batch.run()).items).toEqual([]);
      expect((await replay.run()).items).toEqual([]);
      smtp.wire.assertCount(2);
      grid.wire.assertCount(2);
      expect(tryAcquire.mock.calls.map(([req]) => [req.scope, req.provider.kind]).sort()).toEqual([
        [A, 'sendgrid'],
        [A, 'sendgrid'],
        [A, 'smtp'],
        [A, 'smtp'],
      ]);
    } finally {
      await Promise.all([worker.shutdown(), peerWorker.shutdown()]);
    }
  });
}
