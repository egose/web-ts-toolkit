import { describe, expect, it } from 'vitest';
import { createMemoryEmailStore, type AttemptResult, type StoreCall } from '../../src';
import { MAX_STORE_CANDIDATES, MAX_UNIX_MS } from '../../src/constants';
import { registerExactClockConformance } from '../conformance/exact-clock-suite';
import {
  A,
  B,
  CALL,
  DAY,
  GRID,
  LEASE,
  STOPPED,
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
} from '../conformance/store-fixtures';
import { registerStoreConformance } from '../conformance/store-suite';
import { ManualClock, NOW } from './template-fixtures';

function fixture() {
  const clock = new ManualClock();
  const primary = createMemoryEmailStore({ clock });
  return {
    primary,
    peer: primary, // Two callers use the same in-process store. Separate stores never share data.
    now: () => clock.wall,
    advanceTo(target: number) {
      if (target < clock.wall) throw new Error('Test would rewind store time');
      clock.advance(target - clock.wall);
      clock.wall = target;
    },
  };
}

registerStoreConformance('memory', fixture);
registerExactClockConformance('memory', fixture);

describe('memory-specific V1 limits and simulated boundaries', () => {
  it('has global finite capacity, retains identities instead of evicting, and still projects and purges at capacity', async () => {
    for (const maxJobs of [0, 4_097, -1, 1.5, Infinity]) {
      expect(() => createMemoryEmailStore({ maxJobs })).toThrow(expect.objectContaining({ code: 'invalid_config' }));
    }
    const clock = new ManualClock();
    const store = createMemoryEmailStore({ clock, maxJobs: 1 });
    const another = createMemoryEmailStore({ clock, maxJobs: 1 });
    const a = admission(A, NOW, { retention: { payloadMs: 0, historyMs: DAY, idempotencyMs: DAY } });
    const b = admission(B, NOW, { expiresAt: NOW + 2 * DAY });
    await insert(store, a);
    expect(await another.findJob(A, a.jobId, CALL)).toBeNull();
    await expect(store.insert(B, b, CALL)).rejects.toMatchObject({ code: 'store_capacity' });
    expect(await store.insert(A, a, CALL)).toEqual({ status: 'duplicate' });
    const owned = await claim(store, A);
    await store.markHandoff(A, owned.fence, LEASE, CALL);
    await finishClaim(store, A, finishData(owned, accepted(owned.fence.attemptId)));
    const permit = applied(await store.reserveProjection(A, CALL));
    expect(await store.putActivity(A, permit, CALL)).toBe('present');
    expect(await store.ackProjection(A, permit, CALL)).toBe('acknowledged');
    expect(applied(await store.cleanupNext(A, CALL))).toBe('payload_pruned');
    await expect(store.insert(B, b, CALL)).rejects.toMatchObject({ code: 'store_capacity' });
    clock.wall += DAY;
    expect(applied(await store.cleanupNext(A, CALL))).toBe('retirement_started');
    expect(await store.insert(A, a, CALL)).toEqual({ status: 'duplicate' });
    await expect(store.insert(B, b, CALL)).rejects.toMatchObject({ code: 'store_capacity' });
    expect(applied(await store.cleanupNext(A, CALL))).toBe('purged');
    expect((await insert(store, b)).jobId).toBe(b.jobId);
    expect(await store.findJob(A, a.jobId, CALL)).toBeNull();
    expect(await store.listActivities(A, {}, CALL)).toEqual({ items: [] });
  });

  it('inspects only a bounded prefix of due candidates; expired work never hides across scopes', async () => {
    const { primary, advanceTo } = fixture();
    for (let i = MAX_STORE_CANDIDATES; i >= 1; i--) {
      await insert(primary, admission(A, NOW, { jobId: fixtureId(i), expiresAt: NOW + 1 }));
    }
    const stillLive = await insert(primary, admission(A, NOW, { scheduleAt: NOW + 1 }));
    const otherScope = await insert(primary, admission(B, NOW));
    advanceTo(NOW + 1);
    expect(await primary.claimNext(A, claimData(), CALL)).toEqual({ status: 'none' });
    expect((await claim(primary, B)).job.jobId).toBe(otherScope.jobId);
    expect(applied(await primary.expireNext(A, CALL)).jobId).toBe(fixtureId(1));
    expect((await claim(primary, A)).job.jobId).toBe(stillLive.jobId);
  });

  it('detaches caller data and output copies, and uses no accessors for untrusted DTOs', async () => {
    const { primary } = fixture();
    const original = admission(A, NOW);
    const subject = (original.command.snapshot as { subject: string }).subject;
    const recipient = original.command.snapshot.envelope.to[0]!.address;
    const inserted = await insert(primary, original);
    Object.assign(original.command.snapshot, { subject: 'mutated' });
    Object.assign(original.command.snapshot.envelope.to[0]!, { address: 'changed@example.invalid' });
    Object.assign(original.retry, { maxAttempts: 1 });
    expect(Object.isFrozen(inserted)).toBe(true);
    expect(Object.isFrozen(inserted.key)).toBe(true);
    expect(Object.isFrozen(inserted.correlation)).toBe(true);
    expect(() => Object.assign(inserted.correlation, { intent: 'tampered' })).toThrow();
    const owned = await claim(primary, A);
    expect(owned.snapshot).toMatchObject({ subject, envelope: { to: [{ address: recipient }] } });
    expect(owned.snapshot).not.toBe(original.command.snapshot);
    expect(owned.job.provider).not.toBe(owned.snapshot.provider);

    let getterCalls = 0;
    const evidence = Object.defineProperty({ ...STOPPED }, 'reason', {
      enumerable: true,
      get() {
        getterCalls++;
        return 'worker_stopped';
      },
    });
    await expect(primary.finish(A, finishData(owned, evidence, 'pre_handoff'), CALL)).rejects.toMatchObject({
      code: 'invalid_command',
    });
    expect(getterCalls).toBe(0);
    const commit = await finishClaim(primary, A, finishData(owned, STOPPED, 'pre_handoff'));
    expect(commit.disposition).toBe('retry_scheduled'); // Original frozen retry budget still applies.
    const permit = applied(await primary.reserveProjection(A, CALL));
    const payload = structuredClone(permit);
    expect(await primary.putActivity(A, payload, CALL)).toBe('present'); // JSON-shaped, not an object-identity token.
    Object.assign(payload.activity.correlation, { intent: 'tampered' });
    const projected = (await primary.listActivities(A, {}, CALL)).items[0];
    expect(projected?.correlation).toEqual({ intent: 'opaque-correlation' });
    expect(projected?.correlation).not.toBe(permit.activity.correlation);
  });

  it('checks abort and elapsed deadlines before mutation, not after reporting a success', async () => {
    const clock = new ManualClock();
    const store = createMemoryEmailStore({ clock });
    const row = await insert(store, admission(A, NOW));
    const abort = new AbortController();
    abort.abort(new Error('private diagnostic'));
    const stopped = { signal: abort.signal, timeoutMs: 50 };
    await expect(store.claimNext(A, claimData(), stopped)).rejects.toMatchObject({ code: 'aborted' });
    await expect(store.cancel(A, row.jobId, stopped)).rejects.toMatchObject({ code: 'aborted' });
    await expect(store.ready(stopped)).rejects.toMatchObject({ code: 'aborted' });
    await expect(store.findJob(A, row.jobId, { signal: {}, timeoutMs: 50 } as StoreCall)).rejects.toMatchObject({
      code: 'invalid_config',
    });
    const owned = await claim(store, A);
    let reads = 0;
    clock.monotonicNow = () => (++reads < 3 ? 0 : 1);
    // readClock retains its original bound methods, so use a new instance for custom elapsed timing.
    const bounded = createMemoryEmailStore({ clock });
    reads = -10;
    const other = await insert(bounded, admission(A, NOW));
    reads = 0;
    await expect(bounded.claimNext(A, claimData(), { ...CALL, timeoutMs: 1 })).rejects.toMatchObject({
      code: 'deadline',
    });
    expect(await bounded.findJob(A, other.jobId, CALL)).toMatchObject({ state: 'queued', attemptCount: 0 });
    const stillOwned = await store.findJob(A, row.jobId, CALL);
    expect(stillOwned).toMatchObject({ state: 'leased', attemptCount: 1 });
    expect(stillOwned).not.toHaveProperty('latestAttempt');
    expect(await store.markHandoff(A, owned.fence, LEASE, CALL)).not.toBeNull();
  });

  it('rechecks wall time immediately before the marker mutation and refuses observed time rewind', async () => {
    const clock = new ManualClock();
    let markerReads = 0;
    clock.now = () => clock.wall + (markerReads && ++markerReads >= 3 ? 1 : 0);
    const store = createMemoryEmailStore({ clock });
    const value = await insert(store, admission(A, NOW, { expiresAt: NOW + 1 }));
    const owned = await claim(store, A);
    markerReads = 1;
    expect(await store.markHandoff(A, owned.fence, LEASE, CALL)).toBeNull();
    expect(await store.findJob(A, value.jobId, CALL)).toMatchObject({ phase: 'pre_handoff' });
    markerReads = 0;
    await expect(store.cancel(A, value.jobId, CALL)).rejects.toMatchObject({ code: 'store_unavailable' });
    expect(await store.findAttempt(A, value.jobId, owned.fence.attemptId, CALL)).toBeNull();
  });

  it('saturates retry hints but never shortens a lease or retention promise past representable time', async () => {
    const clock = new ManualClock();
    const now = MAX_UNIX_MS - LEASE;
    clock.wall = now;
    const store = createMemoryEmailStore({ clock });
    await insert(store, admission(A, now, { expiresAt: MAX_UNIX_MS, provider: GRID }));
    const owned = await claim(store, A, claimData(LEASE));
    expect(owned.lease.leaseEndsAt).toBe(MAX_UNIX_MS);
    expect(await store.markHandoff(A, owned.fence, LEASE, CALL)).not.toBeNull();
    const overflow: AttemptResult = {
      outcome: 'rejected',
      retry: 'safe_transient',
      stage: 'http',
      reason: 'sendgrid_throttled',
      retryHint: { delayMs: Number.MAX_SAFE_INTEGER },
    };
    expect(await finishClaim(store, A, finishData(owned, overflow))).toMatchObject({
      disposition: 'expired',
      reason: 'expired',
    });
    await expect(store.reserveProjection(A, CALL)).rejects.toMatchObject({ code: 'store_unavailable' });
    const b = await insert(store, admission(B, now, { expiresAt: MAX_UNIX_MS, retention: { payloadMs: 0 } }));
    clock.wall = MAX_UNIX_MS - 1;
    await expect(store.claimNext(B, claimData(LEASE), CALL)).rejects.toMatchObject({ code: 'store_unavailable' });
    expect(await store.findJob(B, b.jobId, CALL)).toMatchObject({ state: 'queued', attemptCount: 0 });
    clock.wall = MAX_UNIX_MS;
    expect(applied(await store.expireNext(B, CALL))).toMatchObject({ disposition: 'expired', terminalAt: MAX_UNIX_MS });
    expect(applied(await store.cleanupNext(B, CALL))).toBe('payload_pruned');
    expect(await store.cleanupNext(B, CALL)).toEqual({ status: 'none' });
    expect(await store.findJob(B, b.jobId, CALL)).not.toBeNull();
  });

  it('leaves a committed but unacknowledged claim to recovery, including uncertain renewal', async () => {
    const { primary, peer, advanceTo } = fixture();
    const row = await insert(primary, admission(A, NOW));
    const data = claimData(LEASE);
    await expect(lostAck('before_commit', () => primary.claimNext(A, data, CALL))).rejects.toMatchObject({
      code: 'write_unconfirmed',
    });
    expect(await peer.findJob(A, row.jobId, CALL)).toMatchObject({ state: 'queued', attemptCount: 0 });
    await expect(lostAck('after_commit', () => primary.claimNext(A, data, CALL))).rejects.toMatchObject({
      code: 'write_unconfirmed',
    });
    expect(await peer.findJob(A, row.jobId, CALL)).toMatchObject({ state: 'leased', attemptCount: 1 });
    expect(await peer.claimNext(A, claimData(), CALL)).toEqual({ status: 'none' });
    advanceTo(NOW + LEASE);
    const first = applied(await peer.recoverNext(A, CALL));
    expect(first).toMatchObject({ attemptId: data.attemptId, disposition: 'retry_scheduled' });
    advanceTo(first.retryAt!);
    const owned = await claim(peer, A, claimData(LEASE));
    advanceTo(first.retryAt! + 10);
    await expect(lostAck('after_commit', () => primary.renew(A, owned.fence, LEASE, CALL))).rejects.toMatchObject({
      code: 'write_unconfirmed',
    });
    advanceTo(owned.lease.leaseEndsAt);
    expect(await peer.recoverNext(A, CALL)).toEqual({ status: 'none' });
    advanceTo(owned.lease.leaseEndsAt + 10);
    expect(applied(await peer.recoverNext(A, CALL))).toMatchObject({ result: { reason: 'pre_handoff_lease_expired' } });
  });
});
