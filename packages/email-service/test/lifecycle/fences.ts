import { once } from 'node:events';
import { expect, it, vi } from 'vitest';
import type { AttachmentResolver, EmailStore, HandoffGrant, OwnerFence } from '../../src';
import { A, CALL, lostAck } from '../conformance/store-fixtures';
import { latch } from '../smtp/loopback';
import { atBarrier, SHORT_LEASE, type Lifecycle } from './fixture';

const sides = ['before_commit', 'after_commit'] as const;
const ONE = { limit: 1, maintenanceLimit: 0 } as const;

export function lifecycleFences(fixture: () => Lifecycle) {
  it.each(sides)('confirms a lost admission reply by exact scoped lookup only: %s', async (side) => {
    const f = fixture();
    const s = await f.scenario('smtp');
    const { primary, peer } = f.queue;
    const insert = vi.fn<EmailStore['insert']>((...args) => lostAck(side, () => primary.insert(...args)));
    const findAdmission = vi.fn(primary.findAdmission);
    const service = s.service({ ...primary, insert, findAdmission });
    const pending = service.enqueue(s.command);
    if (side === 'before_commit') {
      await expect(pending).rejects.toMatchObject({ code: 'write_unconfirmed' });
    } else await expect(pending).resolves.toMatchObject({ status: 'replayed' });
    expect(insert).toHaveBeenCalledOnce();
    expect(findAdmission.mock.calls.map(([scope, key]) => [scope, key])).toEqual([
      [A, s.command.key],
      [A, s.command.key],
    ]);
    const id = insert.mock.calls[0]![1].jobId;
    const stored = await peer.findAdmission(A, s.command.key, CALL);
    if (side === 'after_commit') {
      expect(stored?.job).toEqual((await pending).job);
      expect(stored?.job.jobId).toBe(id);
    } else {
      expect(stored).toBeNull();
      expect(await f.job(id)).toBeNull();
    }
    s.wire.assertCount(0);
    const next = await s.service(peer).enqueue(s.command);
    expect(next.status).toBe(side === 'after_commit' ? 'replayed' : 'enqueued');
    if (side === 'after_commit') expect(next.job).toEqual(stored?.job);
    else expect(next.job.jobId).not.toBe(id);
    expect(s.prepare).toHaveBeenCalledTimes(side === 'after_commit' ? 1 : 2);
  });

  for (const boundary of ['claim', 'renew', 'marker'] as const) {
    it.each(sides)(`does not submit when the ${boundary} response is simulated lost: %s`, async (side) => {
      const f = fixture();
      const s = await f.scenario(side === 'before_commit' ? 'smtp' : 'sendgrid', 'accept', {
        retry: { maxAttempts: 2, baseDelayMs: 4_000, maxDelayMs: 4_000 },
      });
      const { primary, peer } = f.queue;
      const { job } = await s.service().enqueue(s.command);
      let leaseEndsAt: number | undefined;
      let extended = false;
      const claimNext = vi.fn<EmailStore['claimNext']>((...args) => {
        const write = async () => {
          const next = await primary.claimNext(...args);
          if (next.status === 'applied') leaseEndsAt = next.value.lease.leaseEndsAt;
          return next;
        };
        return boundary === 'claim' ? lostAck(side, write) : write();
      });
      const renew = vi.fn<EmailStore['renew']>((...args) =>
        lostAck(side, async () => {
          const grant = await primary.renew(...args);
          extended = grant !== null && leaseEndsAt !== undefined && grant.leaseEndsAt > leaseEndsAt;
          if (grant) leaseEndsAt = grant.leaseEndsAt;
          return grant;
        }),
      );
      const markHandoff = vi.fn<EmailStore['markHandoff']>((...args) =>
        lostAck(side, async () => {
          const grant = await primary.markHandoff(...args);
          if (!grant) throw new Error('Expected a real handoff before cutting its response');
          leaseEndsAt = grant.leaseEndsAt;
          return grant;
        }),
      );
      // Keep preflight open until the real worker renewal cadence; release the host callback on owner loss.
      const hold: AttachmentResolver = async (_ref, { signal }) => {
        if (!signal.aborted) await once(signal, 'abort');
        return { status: 'unavailable' };
      };
      const finish = vi.fn(primary.finish);
      const worker = s.worker({
        store: { ...primary, claimNext, renew, markHandoff, finish },
        limits: SHORT_LEASE,
        ...(boundary === 'renew' ? { attachmentResolvers: { test: hold } } : {}),
      });

      const report = await worker.run(ONE);
      const { attemptId } = claimNext.mock.calls[0]![1];
      expect(report).toMatchObject({
        stop: 'store_error',
        items:
          boundary === 'claim' ? [] : [{ jobId: job.jobId, attemptId, status: 'unconfirmed', providerInvoked: false }],
        counts: { claimed: boundary === 'claim' ? 0 : 1, persistenceFailures: 1, providerCalls: 0 },
      });
      expect(claimNext).toHaveBeenCalledOnce();
      expect(renew).toHaveBeenCalledTimes(boundary === 'renew' ? 1 : 0);
      expect(extended).toBe(boundary === 'renew' && side === 'after_commit');
      expect(markHandoff).toHaveBeenCalledTimes(boundary === 'marker' ? 1 : 0);
      expect(finish).not.toHaveBeenCalled();
      const noClaim = boundary === 'claim' && side === 'before_commit';
      const handedOff = boundary === 'marker' && side === 'after_commit';
      expect(await f.job(job.jobId)).toMatchObject(
        noClaim
          ? { state: 'queued', attemptCount: 0 }
          : { state: 'leased', phase: handedOff ? 'handed_off' : 'pre_handoff', attemptCount: 1 },
      );
      expect(await f.attempt(job.jobId, attemptId)).toBeNull();
      s.wire.assertCount(0);
      if (boundary !== 'marker') return;

      // Let the independent worker (and its store time) decide which side of the marker committed.
      await f.queue.waitFor(leaseEndsAt!);
      const second = s.worker({ store: peer });
      const status = handedOff ? 'unknown' : 'retry_scheduled';
      expect(await second.run()).toMatchObject({
        items: [{ operation: 'recover', jobId: job.jobId, attemptId, status, providerInvoked: false }],
        counts: { recovered: 1, claimed: 0, persistenceFailures: 0 },
      });
      const stored = await f.attempt(job.jobId, attemptId);
      expect(stored).toMatchObject({
        ordinal: 1,
        disposition: status,
        result: handedOff
          ? { outcome: 'unknown', retry: 'never', reason: 'post_handoff_lease_expired' }
          : { outcome: 'unsubmitted', retry: 'safe_transient', reason: 'pre_handoff_lease_expired' },
      });
      if (handedOff) expect(stored?.handedOffAt).toBe(leaseEndsAt! - SHORT_LEASE.leaseMs);
      else expect(stored).not.toHaveProperty('handedOffAt');
      expect(await f.job(job.jobId)).toMatchObject(
        handedOff
          ? { state: 'terminal', disposition: 'unknown', attemptCount: 1, unknownOpen: true }
          : { state: 'queued', nextAt: stored?.retryAt, attemptCount: 1, unknownOpen: false },
      );
      const fence = markHandoff.mock.calls[0]![1];
      expect(await primary.markHandoff(A, fence, SHORT_LEASE.leaseMs, CALL)).toBeNull();
      expect(await primary.renew(A, fence, SHORT_LEASE.leaseMs, CALL)).toBeNull();
      s.wire.assertCount(0);
      if (!handedOff) {
        // With no committed marker the peer can take a fresh attempt, but only when its retry is due.
        await f.queue.waitFor(stored!.retryAt!);
        const next = await second.run(ONE);
        const nextId = next.items[0]!.attemptId!;
        expect(nextId).not.toBe(attemptId);
        expect(next.counts).toMatchObject({ providerCalls: 1, accepted: 1 });
        expect(await f.attempt(job.jobId, nextId)).toMatchObject({ ordinal: 2, disposition: 'accepted' });
        expect(await f.job(job.jobId)).toMatchObject({ disposition: 'accepted', attemptCount: 2 });
        await s.wire.assertSubmission(nextId);
      }
      expect((await second.run()).items).toEqual([]);
      expect(await f.attempt(job.jobId, attemptId)).toEqual(stored);
      expect(s.prepare).toHaveBeenCalledOnce();
      s.wire.assertCount(handedOff ? 0 : 1);
    });
  }

  it('never launches on a real positive marker reply held beyond its worker deadline', async () => {
    const f = fixture();
    const s = await f.scenario('sendgrid');
    const { job } = await s.service().enqueue(s.command);
    const { primary } = f.queue;
    const committed = latch<{ fence: OwnerFence; grant: HandoffGrant; signal: AbortSignal }>();
    const release = latch<void>();
    const markHandoff = vi.fn<EmailStore['markHandoff']>(async (...args) => {
      const grant = await primary.markHandoff(...args);
      if (!grant) throw new Error('Expected a real committed marker');
      committed.release({ fence: args[1], grant, signal: args[3].signal });
      await release.reached;
      return grant;
    });
    const finish = vi.fn(primary.finish);
    const worker = s.worker({ store: { ...primary, markHandoff, finish } });
    const pending = worker.run(ONE);
    try {
      const { fence, grant, signal } = await atBarrier(committed.reached, 'marker commit before its delayed ACK');
      expect(await f.job(job.jobId)).toMatchObject({
        state: 'leased',
        phase: 'handed_off',
        updatedAt: grant.handoffAt,
      });
      expect(await f.attempt(job.jobId, fence.attemptId)).toBeNull();
      expect(signal.aborted).toBe(false);
      s.wire.assertCount(0);
      await atBarrier(once(signal, 'abort'), 'worker deadline on the outstanding marker ACK');
      s.wire.assertCount(0);
      release.release();
      expect(await pending).toMatchObject({
        stop: 'store_error',
        items: [{ status: 'unconfirmed', attemptId: fence.attemptId, providerInvoked: false }],
        counts: { providerCalls: 0, persistenceFailures: 1 },
      });
      expect(markHandoff).toHaveBeenCalledOnce();
      expect(finish).not.toHaveBeenCalled();
      expect(await f.job(job.jobId)).toMatchObject({ phase: 'handed_off', attemptCount: 1 });
      expect(await f.attempt(job.jobId, fence.attemptId)).toBeNull();
      s.wire.assertCount(0);
    } finally {
      release.release();
      await pending;
    }
  });

  it('uses the peer cancellation winner when the worker has not committed the handoff', async () => {
    const f = fixture();
    const s = await f.scenario('smtp');
    const { job } = await s.service().enqueue(s.command);
    const { primary, peer } = f.queue;
    const aboutToMark = latch<OwnerFence>();
    const release = latch<void>();
    const markHandoff: EmailStore['markHandoff'] = async (...args) => {
      aboutToMark.release(args[1]);
      await release.reached;
      return primary.markHandoff(...args);
    };
    const finish = vi.fn(primary.finish);
    const pending = s.worker({ store: { ...primary, markHandoff, finish } }).run(ONE);
    try {
      const { attemptId } = await atBarrier(aboutToMark.reached, 'worker pre-marker boundary');
      expect(await f.job(job.jobId)).toMatchObject({ phase: 'pre_handoff', attemptCount: 1 });
      expect(await peer.cancel(A, job.jobId, CALL)).toMatchObject({
        status: 'cancelled',
        job: { state: 'terminal', disposition: 'cancelled' },
      });
      release.release();
      expect(await pending).toMatchObject({
        items: [{ status: 'cancelled', attemptId, providerInvoked: false }],
        counts: { providerCalls: 0, persistenceFailures: 0 },
      });
      const stored = await f.attempt(job.jobId, attemptId);
      expect(stored).toMatchObject({
        result: { outcome: 'unsubmitted', reason: 'cancelled' },
        disposition: 'cancelled',
      });
      expect(stored).not.toHaveProperty('handedOffAt');
      expect(finish).not.toHaveBeenCalled();
      s.wire.assertCount(0);
    } finally {
      release.release();
      await pending;
    }
  });

  it.each(sides)('confirms timely acceptance after run abort and simulated finish response loss: %s', async (side) => {
    const f = fixture();
    const kind = side === 'before_commit' ? 'smtp' : 'sendgrid';
    const s = await f.scenario(kind);
    const { primary } = f.queue;
    const { job } = await s.service().enqueue(s.command);
    const captured = latch<Parameters<EmailStore['finish']>[1]>();
    const release = latch<void>();
    const finish = vi.fn(primary.finish).mockImplementationOnce(async (...args) => {
      captured.release(args[1]);
      await release.reached;
      return lostAck(side, () => primary.finish(...args));
    });
    const findAttempt = vi.fn(primary.findAttempt);
    const controller = new AbortController();
    const pending = s.worker({ store: { ...primary, finish, findAttempt } }).run({ ...ONE, signal: controller.signal });
    try {
      const candidate = await atBarrier(captured.reached, 'finish dispatch after capturing provider acceptance');
      const { attemptId } = candidate.fence;
      expect(candidate.result).toMatchObject({
        outcome: 'accepted',
        reason: kind === 'smtp' ? 'smtp_accepted' : 'sendgrid_accepted',
      });
      expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'handed_off', attemptCount: 1 });
      expect(await f.attempt(job.jobId, attemptId)).toBeNull();
      await s.wire.assertSubmission(attemptId);
      controller.abort();
      expect(finish.mock.calls[0]![2].signal.aborted).toBe(false);
      release.release();
      expect(await pending).toMatchObject({
        stop: 'aborted',
        items: [{ jobId: job.jobId, attemptId, status: 'accepted', providerInvoked: true }],
        counts: { accepted: 1, providerCalls: 1, persistenceFailures: 1, unconfirmed: 0 },
      });
      expect(finish).toHaveBeenCalledTimes(side === 'before_commit' ? 2 : 1);
      if (side === 'before_commit') expect(finish.mock.calls[1]![1]).toBe(candidate);
      expect(findAttempt.mock.calls.map(([scope, id, attempt]) => [scope, id, attempt])).toEqual([
        [A, job.jobId, attemptId],
      ]);
      const stored = await f.attempt(job.jobId, attemptId);
      expect(stored).toMatchObject({
        operationId: candidate.operationId,
        disposition: 'accepted',
        result: candidate.result,
      });
      expect(await f.job(job.jobId)).toMatchObject({ state: 'terminal', disposition: 'accepted', attemptCount: 1 });
      expect((await s.worker({ store: f.queue.peer }).run()).items).toEqual([]);
      s.wire.assertCount(1);
    } finally {
      release.release();
      await pending;
    }
  });

  it('preserves a peer recovery winner over a stale finish after real wire acceptance', async () => {
    const f = fixture();
    const s = await f.scenario('smtp');
    const { primary, peer } = f.queue;
    const { job } = await s.service().enqueue(s.command);
    const markHandoff = vi.fn(primary.markHandoff);
    const finish = vi.fn<EmailStore['finish']>((...args) => lostAck('before_commit', () => primary.finish(...args)));
    const report = await s.worker({ store: { ...primary, markHandoff, finish }, limits: SHORT_LEASE }).run(ONE);
    const request = finish.mock.calls[0]![1];
    const { attemptId, jobId } = request.fence;
    expect(jobId).toBe(job.jobId);
    expect(report).toMatchObject({
      stop: 'store_error',
      items: [{ jobId, attemptId, status: 'unconfirmed', providerInvoked: true }],
      counts: { providerCalls: 1, persistenceFailures: 2, submitted: 0, unknown: 0, unconfirmed: 1 },
    });
    expect(request.result).toMatchObject({ outcome: 'accepted', reason: 'smtp_accepted' });
    expect(finish).toHaveBeenCalledTimes(2);
    expect(finish.mock.calls[1]![1]).toBe(request);
    await s.wire.assertSubmission(attemptId);
    expect(await f.attempt(jobId, attemptId)).toBeNull();
    expect(await f.job(jobId)).toMatchObject({ phase: 'handed_off', attemptCount: 1 });
    const grant = await markHandoff.mock.results[0]!.value;
    await f.queue.waitFor(grant!.leaseEndsAt);

    const successor = s.worker({ store: peer });
    expect(await successor.run()).toMatchObject({
      items: [{ operation: 'recover', jobId, attemptId, status: 'unknown', providerInvoked: false }],
    });
    const winner = await f.attempt(jobId, attemptId);
    expect(winner).toMatchObject({
      disposition: 'unknown',
      handedOffAt: grant?.handoffAt,
      result: { outcome: 'unknown', retry: 'never', reason: 'post_handoff_lease_expired' },
    });
    expect(winner?.operationId).not.toBe(request.operationId);
    // The stopped worker would not dispatch a new write. Probe the actual store fence with its stale request.
    expect(await primary.finish(A, request, CALL)).toBeNull();
    expect(await f.attempt(jobId, attemptId)).toEqual(winner);
    expect(await f.job(jobId)).toMatchObject({ state: 'terminal', disposition: 'unknown', attemptCount: 1 });
    expect((await successor.run()).items).toEqual([]);
    s.wire.assertCount(1);
  });
}
