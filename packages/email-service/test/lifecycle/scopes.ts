import { expect, it } from 'vitest';
import { createEmailAdmin } from '../../src';
import { A } from '../conformance/store-fixtures';
import { PROFILE } from '../sendgrid/fixtures';
import { latch } from '../smtp/loopback';
import { atBarrier, NAME, PRIVATE_REPLY, type Lifecycle } from './fixture';

export function lifecycleScopes(fixture: () => Lifecycle) {
  it('keeps proven SMTP refusal and truncated SendGrid throttle isolated in overlapping scoped workers', async () => {
    const f = fixture();
    const otherScope = A.toLowerCase();
    const { primary, peer } = f.queue;
    const reply = latch<void>();
    const smtp = await f.scenario('smtp', 'final_refusal', {
      retry: { maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 100 },
    });
    const grid = await f.scenario('sendgrid', 'truncated_throttle', { responseGate: reply.reached });
    const local = smtp.service(primary, A);
    const remote = grid.service(peer, otherScope);
    expect(smtp.command.key).toEqual(grid.command.key);
    const [{ job: smtpJob }, { job: gridJob }] = await Promise.all([
      local.enqueue(smtp.command),
      remote.enqueue(grid.command),
    ]);
    expect(smtpJob.jobId).not.toBe(gridJob.jobId);
    const smtpAdmin = createEmailAdmin({ scope: A, store: peer });
    const gridAdmin = createEmailAdmin({ scope: otherScope, store: primary });
    const gridWorker = grid.worker({ scope: otherScope, store: peer, limits: { providerTimeoutMs: 5_000 } });
    const one = { limit: 1, maintenanceLimit: 0 };
    const remoteRun = gridWorker.run(one);
    let firstId: string;
    let retryAt: number;
    try {
      await atBarrier(grid.wire.received, 'SendGrid request while the response is held');
      expect(await smtpAdmin.getJob(gridJob.jobId)).toBeNull();
      expect(await gridAdmin.getJob(gridJob.jobId)).toMatchObject({ state: 'leased', phase: 'handed_off' });

      const first = await smtp.worker().run(one);
      firstId = first.items[0]!.attemptId!;
      expect(first).toMatchObject({
        items: [{ jobId: smtpJob.jobId, status: 'retry_scheduled', reason: 'smtp_transient_reply' }],
        counts: { providerCalls: 1, retryScheduled: 1, submitted: 0, persistenceFailures: 0 },
      });
      const refused = await f.attempt(smtpJob.jobId, firstId);
      expect(refused).toMatchObject({
        ordinal: 1,
        result: { outcome: 'rejected', retry: 'safe_transient', stage: 'data', reason: 'smtp_transient_reply' },
      });
      retryAt = refused!.retryAt!;
      expect(retryAt - refused!.finishedAt).toBeGreaterThanOrEqual(50);
      expect(retryAt - refused!.finishedAt).toBeLessThanOrEqual(100);
      expect(await smtpAdmin.reconcile({ limit: 1 })).toMatchObject({ reserved: 1, acknowledged: 1 });
      expect(await gridAdmin.reconcile({ limit: 1 })).toMatchObject({ stop: 'idle', reserved: 0 });
      expect(await gridAdmin.getJob(gridJob.jobId)).toMatchObject({ state: 'leased', phase: 'handed_off' });
    } finally {
      reply.release();
      await remoteRun;
    }

    const ambiguous = await remoteRun;
    const gridId = ambiguous.items[0]!.attemptId!;
    const unknown = { outcome: 'unknown', retry: 'never', stage: 'http', reason: 'transport_uncertain' };
    expect(ambiguous).toMatchObject({
      items: [{ jobId: gridJob.jobId, status: 'unknown', reason: 'transport_uncertain' }],
      counts: { providerCalls: 1, unknown: 1, retryScheduled: 0, persistenceFailures: 0 },
    });
    const gridCommit = await f.attempt(gridJob.jobId, gridId, otherScope);
    expect(gridCommit).toMatchObject({ ordinal: 1, disposition: 'unknown' });
    expect(gridCommit?.result).toEqual(unknown);
    expect(gridCommit).not.toHaveProperty('retryAt');
    expect(await gridAdmin.getJob(gridJob.jobId)).toMatchObject({ unknownOpen: true, attemptCount: 1 });
    expect(await gridAdmin.reconcile({ limit: 1 })).toMatchObject({ reserved: 1, acknowledged: 1 });

    await f.queue.waitFor(retryAt);
    const smtpPeer = smtp.worker({ store: peer });
    const second = await smtpPeer.run(one);
    const secondId = second.items[0]!.attemptId!;
    expect(secondId).not.toBe(firstId);
    expect(second).toMatchObject({
      items: [{ jobId: smtpJob.jobId, status: 'rejected', reason: 'attempts_exhausted' }],
      counts: { providerCalls: 1, rejected: 1, retryScheduled: 0, persistenceFailures: 0 },
    });
    expect(await f.attempt(smtpJob.jobId, secondId)).toMatchObject({
      ordinal: 2,
      disposition: 'rejected',
      result: { reason: 'smtp_transient_reply' },
    });
    expect(await smtpAdmin.reconcile({ limit: 1 })).toMatchObject({ reserved: 1, acknowledged: 1 });
    expect(await smtpAdmin.listActivities()).toMatchObject({
      items: [
        { scope: A, jobId: smtpJob.jobId, attemptId: secondId, disposition: 'rejected' },
        { scope: A, jobId: smtpJob.jobId, attemptId: firstId, disposition: 'retry_scheduled' },
      ],
    });
    const gridHistory = await gridAdmin.listActivities();
    expect(gridHistory).toMatchObject({
      items: [{ scope: otherScope, jobId: gridJob.jobId, attemptId: gridId, result: unknown }],
    });
    expect(gridHistory.items[0]?.result).toEqual(unknown);
    const history = JSON.stringify([await smtpAdmin.listActivities(), gridHistory]);
    for (const secret of [NAME, 'Example.INVALID', 'packet.bin', PROFILE.apiKey, PRIVATE_REPLY, 'retryHint']) {
      expect(history).not.toContain(secret);
    }
    expect(await local.enqueue(smtp.command)).toMatchObject({ status: 'replayed', job: { disposition: 'rejected' } });
    expect(await remote.enqueue(grid.command)).toMatchObject({ status: 'replayed', job: { disposition: 'unknown' } });
    expect((await gridWorker.run()).items).toEqual([]);
    expect((await smtpPeer.run()).items).toEqual([]);
    expect(smtp.prepare).toHaveBeenCalledOnce();
    expect(smtp.render).toHaveBeenCalledOnce();
    expect(grid.prepare).toHaveBeenCalledOnce();
    await smtp.wire.assertSubmission(firstId);
    await smtp.wire.assertSubmission(secondId, 1);
    await grid.wire.assertSubmission(gridId);
    smtp.wire.assertCount(2);
    grid.wire.assertCount(1);
  });
}
