import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_PREPARED_AT_SKEW_MS, PROJECTION_DRAIN_MS, PROJECTION_PERMIT_MS } from '../../src/constants';
import {
  A,
  AMBIGUOUS,
  B,
  CALL,
  DAY,
  GRID,
  LEASE,
  STOPPED,
  TRANSIENT,
  accepted,
  admission,
  applied,
  claim,
  claimData,
  finishClaim,
  finishData,
  fixtureId,
  insert,
  lostAck,
  type ExactClockFixture,
  type SetupStore,
} from './store-fixtures';

/** Exact millisecond lane. A live adapter should run the other suite and prove its real time guards separately. */
export function registerExactClockConformance(name: string, setup: SetupStore<ExactClockFixture>): void {
  describe(`${name}: exact V1 store time`, () => {
    let fixture: ExactClockFixture;
    beforeEach(async () => {
      fixture = await setup();
      await fixture.primary.ready();
      if (fixture.peer !== fixture.primary) await fixture.peer.ready();
    });
    afterEach(async () => fixture?.close?.());

    it('checks prepared skew and expiry only for new identities; due and expiry are half-open', async () => {
      const { primary, peer } = fixture;
      const now = await fixture.now();
      const tooFar = admission(A, now + MAX_PREPARED_AT_SKEW_MS + 1);
      await expect(primary.insert(A, tooFar, CALL)).rejects.toMatchObject({ code: 'invalid_snapshot' });
      const edge = admission(B, now + MAX_PREPARED_AT_SKEW_MS);
      expect(await insert(peer, edge)).toMatchObject({ nextAt: now, createdAt: now });
      const staged = admission(A, now, { scheduleAt: now + 10, expiresAt: now + 11 });
      const expiredUnleased = admission(B, now, { scheduleAt: now + 10, expiresAt: now + 11 });
      // Keep the skew check's queued job out of the expiry selector.
      await primary.cancel(B, edge.jobId, CALL);
      expect(await insert(primary, staged)).toMatchObject({ nextAt: now + 10 });
      await insert(primary, expiredUnleased);
      await fixture.advanceTo(now + 9);
      expect(await peer.claimNext(A, claimData(LEASE), CALL)).toEqual({ status: 'none' });
      await fixture.advanceTo(now + 10);
      const owned = await claim(peer, A, claimData(LEASE));
      expect(owned.lease.grantedAt).toBe(now + 10);
      expect(await primary.expireNext(A, CALL)).toEqual({ status: 'none' });
      expect(await primary.expireNext(B, CALL)).toEqual({ status: 'none' });
      await fixture.advanceTo(now + 11);
      expect(await peer.renew(A, owned.fence, LEASE, CALL)).toBeNull();
      expect(await primary.markHandoff(A, owned.fence, LEASE, CALL)).toBeNull();
      expect(await peer.cancel(A, staged.jobId, CALL)).toMatchObject({ status: 'too_late' });
      expect(await peer.cancel(B, expiredUnleased.jobId, CALL)).toMatchObject({ status: 'too_late' });
      expect(await peer.claimNext(B, claimData(LEASE), CALL)).toEqual({ status: 'none' });
      expect(applied(await peer.expireNext(B, CALL))).toMatchObject({
        jobId: expiredUnleased.jobId,
        attemptCount: 0,
        disposition: 'expired',
        terminalAt: now + 11,
      });
      expect(await primary.expireNext(A, CALL)).toEqual({ status: 'none' });
      const expired = { outcome: 'unsubmitted', retry: 'never', stage: 'pre_handoff', reason: 'expired' } as const;
      expect(await finishClaim(primary, A, finishData(owned, expired, 'pre_handoff'))).toMatchObject({
        disposition: 'expired',
        reason: 'expired',
        finishedAt: now + 11,
      });
      expect(await peer.insert(A, staged, CALL)).toEqual({ status: 'duplicate' });
      await expect(primary.insert(A, admission(A, now, { expiresAt: now + 11 }), CALL)).rejects.toMatchObject({
        code: 'expired',
      });
    });

    it('extends only live pre-handoff leases and recovers at equality, fencing the healed owner', async () => {
      const { primary, peer } = fixture;
      const now = await fixture.now();
      const row = await insert(primary, admission(A, now, { retry: { baseDelayMs: 100, maxDelayMs: 100 } }));
      const old = await claim(primary, A, claimData(LEASE));
      const originalEnd = now + LEASE;
      expect(old.lease.leaseEndsAt).toBe(originalEnd);
      await fixture.advanceTo(originalEnd - 1);
      expect(await peer.recoverNext(A, CALL)).toEqual({ status: 'none' });
      const renewed = await primary.renew(A, old.fence, LEASE, CALL);
      const end = originalEnd - 1 + LEASE;
      expect(renewed).toEqual({ grantedAt: originalEnd - 1, leaseEndsAt: end });
      await fixture.advanceTo(originalEnd);
      expect(await peer.recoverNext(A, CALL)).toEqual({ status: 'none' });
      await fixture.advanceTo(end);
      const oldResult = finishData(old, STOPPED, 'pre_handoff');
      expect(await primary.renew(A, old.fence, LEASE, CALL)).toBeNull();
      expect(await peer.markHandoff(A, old.fence, LEASE, CALL)).toBeNull();
      expect(await primary.finish(A, oldResult, CALL)).toBeNull();
      const recovered = applied(await peer.recoverNext(A, CALL));
      const bits = createHash('sha256').update(old.fence.attemptId).digest().readUInt32BE(0);
      const due = end + 50 + (bits % 51);
      expect(recovered).toMatchObject({
        jobId: row.jobId,
        attemptId: old.fence.attemptId,
        ordinal: 1,
        finishedAt: end,
        retryAt: due,
        result: { outcome: 'unsubmitted', reason: 'pre_handoff_lease_expired' },
        disposition: 'retry_scheduled',
      });
      expect(await primary.recoverNext(A, CALL)).toEqual({ status: 'none' });
      await fixture.advanceTo(due - 1);
      expect(await peer.claimNext(A, claimData(LEASE), CALL)).toEqual({ status: 'none' });
      await fixture.advanceTo(due);
      const next = await claim(peer, A, claimData(LEASE));
      expect(next).toMatchObject({ job: { jobId: row.jobId, attemptCount: 2 }, ordinal: 2, manual: false });
      expect(await primary.renew(A, old.fence, LEASE, CALL)).toBeNull();
      expect(await primary.markHandoff(A, old.fence, LEASE, CALL)).toBeNull();
      expect(await primary.finish(A, oldResult, CALL)).toBeNull();
      expect(await primary.findAttempt(A, row.jobId, old.fence.attemptId, CALL)).toEqual(recovered);
    });

    it('does not age away live acceptance, but recovery after a marker is unknown even past expiry', async () => {
      const { primary, peer } = fixture;
      const now = await fixture.now();
      const rows = await Promise.all([
        insert(primary, admission(A, now, { expiresAt: now + 1 })),
        insert(peer, admission(B, now, { expiresAt: now + 1 })),
      ]);
      const a = await claim(primary, A, claimData(LEASE));
      const b = await claim(peer, B, claimData(LEASE));
      await primary.markHandoff(A, a.fence, LEASE, CALL);
      await primary.markHandoff(B, b.fence, LEASE, CALL);
      await fixture.advanceTo(now + 1);
      expect(await finishClaim(peer, A, finishData(a, accepted(a.fence.attemptId)))).toMatchObject({
        handedOffAt: now,
        finishedAt: now + 1,
        disposition: 'accepted',
      });
      expect(await peer.cancel(A, rows[0].jobId, CALL)).toMatchObject({ status: 'too_late' });
      await fixture.advanceTo(now + LEASE - 1);
      expect(await peer.recoverNext(B, CALL)).toEqual({ status: 'none' });
      await fixture.advanceTo(now + LEASE);
      expect(await primary.finish(B, finishData(b, accepted(b.fence.attemptId)), CALL)).toBeNull();
      expect(applied(await peer.recoverNext(B, CALL))).toMatchObject({
        jobId: rows[1].jobId,
        handedOffAt: now,
        finishedAt: now + LEASE,
        disposition: 'unknown',
        result: { outcome: 'unknown', retry: 'never', reason: 'post_handoff_lease_expired' },
      });
      expect(await primary.findJob(B, rows[1].jobId, CALL)).toMatchObject({ unknownOpen: true });
      expect(await primary.claimNext(B, claimData(LEASE), CALL)).toEqual({ status: 'none' });
    });

    it('orders due claims by next time, descending priority, then binary job ID', async () => {
      const { primary, peer } = fixture;
      const now = await fixture.now();
      const earlier = now + 100;
      const later = earlier + 1;
      for (const [n, scheduleAt, priority] of [
        [50, later, 9],
        [22, earlier, 9],
        [10, earlier, 1],
        [21, earlier, 9],
      ] as const) {
        await insert(primary, admission(A, now, { jobId: fixtureId(n), scheduleAt, priority }));
      }
      await fixture.advanceTo(later);
      const actual = [];
      for (let i = 0; i < 4; i++) actual.push((await claim(peer, A, claimData(LEASE))).job.jobId);
      expect(actual).toEqual([21, 22, 10, 50].map(fixtureId));
      expect(await primary.claimNext(A, claimData(LEASE), CALL)).toEqual({ status: 'none' });
    });

    it('honors later provider and limiter floors and stops at the expiry floor', async () => {
      const { primary, peer } = fixture;
      const now = await fixture.now();
      const row = await insert(
        primary,
        admission(A, now, {
          provider: GRID,
          expiresAt: now + 4_000,
          retry: { baseDelayMs: 100, maxDelayMs: 100 },
        }),
      );
      const first = await claim(primary, A, claimData(LEASE));
      const deferred = {
        outcome: 'unsubmitted',
        retry: 'safe_transient',
        stage: 'rate_limit',
        reason: 'rate_deferred',
        retryHint: { delayMs: 1_500, notBefore: now + 2_000 },
      } as const;
      const committed = await finishClaim(peer, A, finishData(first, deferred, 'pre_handoff'));
      expect(committed.retryAt).toBe(now + 2_000);
      const projected = applied(await peer.reserveProjection(A, CALL));
      expect(projected.activity.result).not.toHaveProperty('retryHint');
      await fixture.advanceTo(now + 1_999);
      expect(await primary.claimNext(A, claimData(LEASE), CALL)).toEqual({ status: 'none' });
      await fixture.advanceTo(now + 2_000);
      const second = await claim(peer, A, claimData(LEASE));
      await primary.markHandoff(A, second.fence, LEASE, CALL);
      const throttle = {
        outcome: 'rejected',
        retry: 'safe_transient',
        stage: 'http',
        reason: 'sendgrid_throttled',
        retryHint: { delayMs: 2_000, notBefore: now + 2_500 },
      } as const;
      expect(await finishClaim(primary, A, finishData(second, throttle))).toMatchObject({
        disposition: 'expired',
        reason: 'expired',
        result: { outcome: 'rejected', reason: 'sendgrid_throttled' },
      });
      expect(await primary.findJob(A, row.jobId, CALL)).toMatchObject({ disposition: 'expired', attemptCount: 2 });
      expect(await peer.claimNext(A, claimData(LEASE), CALL)).toEqual({ status: 'none' });
    });

    it('allows a confirmed marker with local non-invocation proof to retry only within its ordinary budget', async () => {
      const { primary, peer } = fixture;
      const row = await insert(primary, admission(A, await fixture.now(), { retry: { maxAttempts: 2 } }));
      const first = await claim(primary, A, claimData(LEASE));
      await primary.markHandoff(A, first.fence, LEASE, CALL);
      const noInvocation = { ...STOPPED, reason: 'launch_window_closed' } as const;
      const result = await finishClaim(peer, A, finishData(first, noInvocation));
      expect(result).toMatchObject({
        disposition: 'retry_scheduled',
        result: { outcome: 'unsubmitted', reason: 'launch_window_closed' },
      });
      await fixture.advanceTo(result.retryAt!);
      const second = await claim(peer, A, claimData(LEASE));
      await peer.markHandoff(A, second.fence, LEASE, CALL);
      expect(await finishClaim(primary, A, finishData(second, TRANSIENT))).toMatchObject({
        disposition: 'rejected',
        reason: 'attempts_exhausted',
        result: { reason: 'smtp_transient_reply' },
      });
      expect(await primary.findJob(A, row.jobId, CALL)).toMatchObject({ state: 'terminal', attemptCount: 2 });
      expect(await peer.claimNext(A, claimData(LEASE), CALL)).toEqual({ status: 'none' });
    });

    it('does not let a safe transient manual attempt spend unused ordinary budget', async () => {
      const { primary, peer } = fixture;
      const row = await insert(primary, admission(A, await fixture.now(), { retry: { maxAttempts: 10 } }));
      const original = await claim(primary, A, claimData(LEASE));
      await primary.markHandoff(A, original.fence, LEASE, CALL);
      const originalCommit = await finishClaim(peer, A, finishData(original, AMBIGUOUS));
      await peer.resolveUnknown(
        A,
        { jobId: row.jobId, attemptId: originalCommit.attemptId, action: 'redrive', acknowledgeDuplicateRisk: true },
        CALL,
      );
      const manual = await claim(peer, A, claimData(LEASE));
      expect(manual).toMatchObject({ ordinal: 2, manual: true });
      const commit = await finishClaim(peer, A, finishData(manual, STOPPED, 'pre_handoff'));
      expect(commit).toMatchObject({ disposition: 'failed', reason: 'attempts_exhausted' });
      expect(commit).not.toHaveProperty('retryAt');
      expect(await primary.findAttempt(A, row.jobId, originalCommit.attemptId, CALL)).toEqual(originalCommit);
      expect(await primary.claimNext(A, claimData(LEASE), CALL)).toEqual({ status: 'none' });
    });

    it('bounds the complete ledger at ten ordinary claims plus one non-retryable manual claim', async () => {
      const { primary, peer } = fixture;
      const now = await fixture.now();
      const row = await insert(
        primary,
        admission(A, now, { retry: { maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 200 } }),
      );
      const attempts = [];
      for (let ordinal = 1; ordinal <= 10; ordinal++) {
        const owned = await claim(peer, A, claimData(LEASE));
        const start = await fixture.now();
        expect(owned).toMatchObject({ ordinal, manual: false });
        await primary.markHandoff(A, owned.fence, LEASE, CALL);
        const result = ordinal === 10 ? AMBIGUOUS : TRANSIENT;
        const commit = await finishClaim(peer, A, finishData(owned, result));
        attempts.push(commit);
        if (ordinal === 10) break;
        const cap = ordinal === 1 ? 100 : 200;
        const half = cap / 2;
        const bits = createHash('sha256').update(commit.attemptId).digest().readUInt32BE(0);
        const due = start + half + (bits % (half + 1));
        expect(commit.retryAt).toBe(due);
        await fixture.advanceTo(due);
      }
      const redrive = {
        jobId: row.jobId,
        attemptId: attempts.at(-1)!.attemptId,
        action: 'redrive',
        acknowledgeDuplicateRisk: true,
      } as const;
      await primary.resolveUnknown(A, redrive, CALL);
      const extra = await claim(peer, A, claimData(LEASE));
      expect(extra).toMatchObject({ ordinal: 11, manual: true });
      attempts.push(await finishClaim(peer, A, finishData(extra, STOPPED, 'pre_handoff')));
      expect(await primary.findJob(A, row.jobId, CALL)).toMatchObject({
        state: 'terminal',
        disposition: 'failed',
        attemptCount: 11,
        terminalReason: 'attempts_exhausted',
      });
      expect(await peer.claimNext(A, claimData(LEASE), CALL)).toEqual({ status: 'none' });
      for (const attempt of attempts) {
        expect(await peer.findAttempt(A, row.jobId, attempt.attemptId, CALL)).toEqual(attempt);
        const permit = applied(await primary.reserveProjection(A, CALL));
        expect(permit.activity).toMatchObject({ attemptId: attempt.attemptId, ordinal: attempt.ordinal });
        expect(await peer.putActivity(A, permit, CALL)).toBe('present');
        expect(await primary.ackProjection(A, permit, CALL)).toBe('acknowledged');
      }
      expect(await peer.reserveProjection(A, CALL)).toEqual({ status: 'none' });
      expect((await peer.listActivities(A, { jobId: row.jobId }, CALL)).items).toHaveLength(11);
    });

    it('keeps binary cursor order when multiple attempts and jobs finish in the same millisecond', async () => {
      const { primary, peer } = fixture;
      const now = await fixture.now();
      for (const n of [9, 1]) {
        const row = await insert(primary, admission(A, now, { jobId: fixtureId(n) }));
        const first = await claim(peer, A, claimData(LEASE, fixtureId(200 + n)));
        await primary.markHandoff(A, first.fence, LEASE, CALL);
        await finishClaim(peer, A, finishData(first, AMBIGUOUS));
        await primary.resolveUnknown(
          A,
          { jobId: row.jobId, attemptId: first.fence.attemptId, action: 'redrive', acknowledgeDuplicateRisk: true },
          CALL,
        );
        const second = await claim(peer, A, claimData(LEASE, fixtureId(100 + n)));
        await primary.markHandoff(A, second.fence, LEASE, CALL);
        await finishClaim(peer, A, finishData(second, accepted(second.fence.attemptId)));
      }
      for (let i = 0; i < 4; i++) {
        const permit = applied(await primary.reserveProjection(A, CALL));
        expect(permit.activity.finishedAt).toBe(now);
        await peer.putActivity(A, permit, CALL);
        await primary.ackProjection(A, permit, CALL);
      }
      const options = { limit: 1, from: now, before: now + 1 };
      let page = await peer.listActivities(A, options, CALL);
      const attemptIds = [];
      for (const expected of [101, 201, 109, 209]) {
        attemptIds.push(page.items[0]?.attemptId);
        expect(page.items[0]?.jobId).toBe(fixtureId(expected % 100));
        if (page.nextCursor) page = await peer.listActivities(A, { ...options, cursor: page.nextCursor }, CALL);
      }
      expect(attemptIds).toEqual([101, 201, 109, 209].map(fixtureId));
      expect(page).not.toHaveProperty('nextCursor');
      const byJob = { ...options, jobId: fixtureId(1) };
      const one = await primary.listActivities(A, byJob, CALL);
      const two = await peer.listActivities(A, { ...byJob, cursor: one.nextCursor! }, CALL);
      expect(two.items.map(({ attemptId }) => attemptId)).toEqual([fixtureId(201)]);
    });

    it('holds pending payloads, expires permits at equality, and drains the longest issued window before purge', async () => {
      const { primary, peer } = fixture;
      const now = await fixture.now();
      const value = admission(A, now, { retention: { payloadMs: 0, historyMs: DAY, idempotencyMs: DAY } });
      await insert(primary, value);
      const owned = await claim(peer, A, claimData(LEASE));
      await primary.markHandoff(A, owned.fence, LEASE, CALL);
      await finishClaim(primary, A, finishData(owned, accepted(owned.fence.attemptId)));
      await fixture.advanceTo(now + DAY + 1);
      expect(await primary.cleanupNext(A, CALL)).toEqual({ status: 'none' });
      const lost = applied(await primary.reserveProjection(A, CALL));
      expect(lost.permitUntil).toBe(now + DAY + 1 + PROJECTION_PERMIT_MS);
      await fixture.advanceTo(lost.permitUntil);
      expect(await peer.putActivity(A, lost, CALL)).toBe('permit_expired');
      expect(await peer.listActivities(A, {}, CALL)).toEqual({ items: [] });
      expect(await peer.ackProjection(A, lost, CALL)).toBe('stale');
      const fresh = applied(await peer.reserveProjection(A, CALL));
      await fixture.advanceTo(fresh.permitUntil - 1);
      expect(await primary.putActivity(A, fresh, CALL)).toBe('present');
      await fixture.advanceTo(fresh.permitUntil);
      expect(await peer.putActivity(A, fresh, CALL)).toBe('present'); // No new write is needed.
      expect(await peer.ackProjection(A, fresh, CALL)).toBe('acknowledged');
      expect(applied(await primary.cleanupNext(A, CALL))).toBe('payload_pruned');
      const drain = fresh.permitUntil + PROJECTION_DRAIN_MS;
      await fixture.advanceTo(drain - 1);
      expect(await primary.cleanupNext(A, CALL)).toEqual({ status: 'none' });
      await fixture.advanceTo(drain);
      expect(applied(await peer.cleanupNext(A, CALL))).toBe('retirement_started');
      expect(await primary.insert(A, value, CALL)).toEqual({ status: 'duplicate' });
      expect(await peer.listActivities(A, {}, CALL)).toEqual({ items: [fresh.activity] });
      expect(applied(await peer.cleanupNext(A, CALL))).toBe('purged');
      expect(await peer.findAdmission(A, value.command.key, CALL)).toBeNull();
      expect(await primary.findAttempt(A, value.jobId, owned.fence.attemptId, CALL)).toBeNull();
      expect(await peer.putActivity(A, lost, CALL)).toBe('permit_expired');
      expect(await peer.putActivity(A, fresh, CALL)).toBe('permit_expired');
      expect(await peer.ackProjection(A, fresh, CALL)).toBe('stale');
      expect(await primary.listActivities(A, {}, CALL)).toEqual({ items: [] });
      expect(await primary.cleanupNext(A, CALL)).toEqual({ status: 'none' });
    });

    it('starts retention only when an unknown is dismissed and honors later identity/history minima', async () => {
      const { primary, peer } = fixture;
      const now = await fixture.now();
      const value = admission(A, now, { retention: { payloadMs: 10, historyMs: DAY, idempotencyMs: 2 * DAY } });
      await insert(primary, value);
      const owned = await claim(primary, A, claimData(LEASE));
      await primary.markHandoff(A, owned.fence, LEASE, CALL);
      await finishClaim(primary, A, finishData(owned, AMBIGUOUS));
      const permit = applied(await peer.reserveProjection(A, CALL));
      await primary.putActivity(A, permit, CALL);
      await peer.ackProjection(A, permit, CALL);
      const late = now + 3 * DAY;
      await fixture.advanceTo(late);
      expect(await peer.cleanupNext(A, CALL)).toEqual({ status: 'none' });
      const resolve = { jobId: value.jobId, attemptId: owned.fence.attemptId };
      await expect(
        primary.resolveUnknown(A, { ...resolve, action: 'redrive', acknowledgeDuplicateRisk: true }, CALL),
      ).rejects.toMatchObject({
        code: 'expired',
      });
      const dismissed = { ...resolve, action: 'dismiss' } as const;
      expect(await primary.resolveUnknown(A, dismissed, CALL)).toMatchObject({
        status: 'resolved',
        job: { unknownOpen: false, disposition: 'unknown', terminalAt: now, resolutions: [{ at: late }] },
      });
      await fixture.advanceTo(late + 9);
      expect(await peer.cleanupNext(A, CALL)).toEqual({ status: 'none' });
      await fixture.advanceTo(late + 10);
      expect(applied(await peer.cleanupNext(A, CALL))).toBe('payload_pruned');
      expect(await primary.resolveUnknown(A, dismissed, CALL)).toMatchObject({ status: 'replayed' });
      expect(await primary.insert(A, value, CALL)).toEqual({ status: 'duplicate' });
      await fixture.advanceTo(late + 2 * DAY - 1);
      expect(await peer.cleanupNext(A, CALL)).toEqual({ status: 'none' });
      await fixture.advanceTo(late + 2 * DAY);
      expect(applied(await peer.cleanupNext(A, CALL))).toBe('retirement_started');
      expect(applied(await primary.cleanupNext(A, CALL))).toBe('purged');
      expect(await peer.findAdmission(A, value.command.key, CALL)).toBeNull();
      expect(await peer.listActivities(A, {}, CALL)).toEqual({ items: [] });
      expect((await insert(peer, admission(A, await fixture.now(), { key: value.command.key }))).jobId).not.toBe(
        value.jobId,
      );
    });

    it.each(['before_commit', 'after_commit'] as const)(
      'models %s marker ACK loss without authorizing another launch',
      async (mode) => {
        const { primary, peer } = fixture;
        const now = await fixture.now();
        const row = await insert(primary, admission(A, now));
        const owned = await claim(primary, A, claimData(LEASE));
        await expect(lostAck(mode, () => primary.markHandoff(A, owned.fence, LEASE, CALL))).rejects.toMatchObject({
          code: 'write_unconfirmed',
        });
        expect(await peer.findJob(A, row.jobId, CALL)).toMatchObject({
          phase: mode === 'after_commit' ? 'handed_off' : 'pre_handoff',
        });
        // Inspection is not a handoff ACK. The fixture does not invoke a provider or retry the marker.
        await fixture.advanceTo(now + LEASE);
        const recovery = applied(await peer.recoverNext(A, CALL));
        expect(recovery.disposition).toBe(mode === 'after_commit' ? 'unknown' : 'retry_scheduled');
        expect(await primary.markHandoff(A, owned.fence, LEASE, CALL)).toBeNull();
        expect(await primary.findAttempt(A, row.jobId, owned.fence.attemptId, CALL)).toEqual(recovery);
      },
    );
  });
}
