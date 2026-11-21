import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmailAdmin,
  createEmailWorker,
  createSmtpAcceptanceResult,
  type AttemptResult,
  type EmailActivity,
  type EmailProvider,
  type ProviderResult,
  type ProviderSubmission,
  type SmtpSnapshot,
} from '../../src';
import { deferred } from '../unit/template-fixtures';
import {
  A,
  AMBIGUOUS,
  B,
  CALL,
  DAY,
  GRID,
  LIVE_LEASE,
  RECIPIENTS,
  SANDBOX,
  SMTP,
  accepted,
  admission,
  claim,
  finishClaim,
  finishData,
  fixtureId,
  insert,
  lostAck,
  type SetupStore,
  type StoreFixture,
} from './store-fixtures';

/** A counted provider port; these cases do not open mail sockets. */
function syntheticSmtp(result: (submission: ProviderSubmission<SmtpSnapshot>) => ProviderResult) {
  const submit = vi.fn(async (submission: ProviderSubmission<SmtpSnapshot>) => result(submission));
  const prepare = vi.fn<EmailProvider<SmtpSnapshot>['prepare']>((submission) => ({
    submit: () => submit(submission),
  }));
  return { provider: { ref: SMTP, prepare }, submit };
}

export function registerAdminConformance(name: string, setup: SetupStore<StoreFixture>) {
  describe(`admin on ${name}`, () => {
    let f: StoreFixture;
    beforeEach(async () => {
      f = await setup();
      await f.primary.ready();
      if (f.peer !== f.primary) await f.peer.ready();
    });
    afterEach(async () => f?.close?.());

    it('recovers a failed and an unacknowledged upsert without resending partial SMTP acceptance', async () => {
      const smtp = syntheticSmtp(({ attemptId }) =>
        createSmtpAcceptanceResult(
          [RECIPIENTS[0], { ...RECIPIENTS[1], status: 'rejected' }, RECIPIENTS[2]],
          `<${attemptId}@email.invalid>`,
        ),
      );
      const { primary, peer } = f;
      const value = admission(A, await f.now(), { retention: { payloadMs: 0, historyMs: DAY, idempotencyMs: DAY } });
      const { jobId } = await insert(primary, value);
      const putActivity = vi
        .fn(primary.putActivity)
        .mockRejectedValueOnce({ code: 'store_unavailable', message: 'fixture-private-store-error' })
        .mockImplementationOnce((...args) => lostAck('after_commit', () => primary.putActivity(...args)));
      const ackProjection = vi.fn(primary.ackProjection);
      const finish = vi.fn(primary.finish);
      const pendingStore = { ...primary, putActivity, ackProjection, finish };
      const onActivity = vi.fn<(activity: EmailActivity) => void>(() => {
        throw new Error('fixture-private-observer-error');
      });
      const projector = createEmailAdmin({ scope: A, store: pendingStore, onActivity });
      const reader = createEmailAdmin({ scope: A, store: peer, onActivity });
      const worker = createEmailWorker({ scope: A, store: pendingStore, providers: [smtp.provider] });
      // Finalization does not try either projection primitive, even with a broken activity store.
      expect((await worker.run()).counts).toMatchObject({ partiallyAccepted: 1, submitted: 1, persistenceFailures: 0 });
      expect(putActivity).not.toHaveBeenCalled();
      expect(ackProjection).not.toHaveBeenCalled();
      const { attemptId, token } = finish.mock.calls[0]![1].fence;
      const committed = await peer.findAttempt(A, jobId, attemptId, CALL);
      expect(committed?.result.outcome).toBe('partially_accepted');
      expect(await reader.getJob(jobId)).toMatchObject({
        disposition: 'partially_accepted',
        latestAttempt: { attemptId, outcome: 'partially_accepted', reason: 'smtp_partial' },
      });
      expect(await reader.listActivities({ jobId })).toEqual({ items: [] });

      const stopped = {
        stop: 'store_error',
        reserved: 1,
        acknowledged: 0,
        permitsExpired: 0,
        persistenceFailures: 1,
        observerStarted: 0,
        observerSkipped: 0,
      };
      expect(await projector.reconcile()).toEqual(stopped);
      expect(await reader.listActivities({ jobId })).toEqual({ items: [] });
      expect(await projector.reconcile()).toEqual(stopped);
      expect(putActivity).toHaveBeenCalledTimes(2);
      expect(ackProjection).not.toHaveBeenCalled();
      expect(onActivity).not.toHaveBeenCalled();
      expect(await reader.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 0 });

      // A committed row is queryable before source ACK, but the ledger is still authoritative.
      const page = await reader.listActivities({ jobId });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toEqual({
        version: 1,
        scope: A,
        jobId,
        attemptId,
        ordinal: 1,
        provider: SMTP,
        template: { key: 'example', revision: 'v1' },
        correlation: { intent: 'opaque-correlation' },
        startedAt: committed?.startedAt,
        handedOffAt: committed?.handedOffAt,
        finishedAt: committed?.finishedAt,
        disposition: 'partially_accepted',
        result: committed?.result,
      });
      expect(await reader.reconcile()).toEqual({
        ...stopped,
        stop: 'idle',
        acknowledged: 1,
        persistenceFailures: 0,
        observerStarted: 1,
      });
      expect(onActivity).toHaveBeenCalledExactlyOnceWith(page.items[0]);
      const observed = onActivity.mock.calls[0]![0];
      expect(Object.isFrozen(observed.result.recipients?.[1])).toBe(true);
      expect(Object.isFrozen(observed.correlation)).toBe(true);
      expect(await projector.reconcile()).toMatchObject({ stop: 'idle', reserved: 0, acknowledged: 0 });
      expect(await reader.listActivities({ jobId })).toEqual(page);
      expect(await reader.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 1, jobsPurged: 0 });
      expect(await primary.insert(A, value, CALL)).toEqual({ status: 'duplicate' });
      await expect(
        reader.resolveUnknown({ jobId, attemptId, action: 'redrive', acknowledgeDuplicateRisk: true }),
      ).rejects.toMatchObject({ code: 'resolution_conflict' });
      expect(await worker.run()).toMatchObject({ stop: 'idle', items: [] });
      expect(smtp.submit).toHaveBeenCalledTimes(1);
      expect(await peer.findAttempt(A, jobId, attemptId, CALL)).toEqual(committed);
      const summary = await reader.getJob(jobId);
      const serialized = JSON.stringify({ summary, page, observed });
      for (const secret of [
        token,
        putActivity.mock.calls[1]![1].digest,
        'Private ',
        'example.invalid',
        'snapshot',
        'envelope',
        'retryHint',
        'leaseEndsAt',
        'operationId',
        'intentHash',
        'permitUntil',
        'attachments',
        'projectionAckAt',
      ])
        expect(serialized).not.toContain(secret);
    });

    it('counts idempotent ACKs in competing projectors without duplicating activity or observation', async () => {
      const { primary, peer } = f;
      const job = await insert(primary, admission(A, await f.now()));
      const owned = await claim(primary, A);
      await primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL);
      await finishClaim(primary, A, finishData(owned, accepted(owned.fence.attemptId)));
      const onActivity = vi.fn();
      const entered = deferred<void>();
      const release = deferred<void>();
      const delayed = vi.fn<typeof primary.ackProjection>(async (...args) => {
        entered.resolve();
        await release.promise;
        return primary.ackProjection(...args);
      });
      const admin = createEmailAdmin({ scope: A, store: { ...primary, ackProjection: delayed }, onActivity });
      const contender = createEmailAdmin({ scope: A, store: peer, onActivity });
      const first = admin.reconcile({ limit: 1 });
      try {
        await Promise.race([
          entered.promise,
          first.then(() => {
            throw new Error('Expected to reach projection ACK');
          }),
        ]);
        expect(onActivity).not.toHaveBeenCalled();
        expect(await contender.listActivities({ jobId: job.jobId })).toMatchObject({
          items: [{ attemptId: owned.fence.attemptId }],
        });
        expect(await contender.reconcile({ limit: 1 })).toMatchObject({
          stop: 'limit',
          reserved: 1,
          acknowledged: 1,
          observerStarted: 1,
          persistenceFailures: 0,
        });
      } finally {
        release.resolve();
        await first;
      }
      expect(await first).toMatchObject({
        stop: 'limit',
        reserved: 1,
        acknowledged: 1,
        observerStarted: 0,
        observerSkipped: 0,
        persistenceFailures: 0,
      });
      expect(onActivity).toHaveBeenCalledTimes(1);
      expect((await admin.listActivities()).items).toEqual([onActivity.mock.calls[0]![0]]);
      expect(await contender.reconcile()).toMatchObject({ stop: 'idle', reserved: 0, acknowledged: 0 });
    });

    it('does not count or observe a committed ACK whose response was lost', async () => {
      const { primary, peer } = f;
      const { jobId } = await insert(primary, admission(A, await f.now()));
      const owned = await claim(primary, A);
      await primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL);
      await finishClaim(primary, A, finishData(owned, accepted(owned.fence.attemptId)));
      const onActivity = vi.fn();
      const ackProjection: typeof primary.ackProjection = (...args) =>
        lostAck('after_commit', () => primary.ackProjection(...args));
      const interrupted = createEmailAdmin({ scope: A, store: { ...primary, ackProjection }, onActivity });
      const admin = createEmailAdmin({ scope: A, store: peer, onActivity });
      expect(await interrupted.reconcile()).toMatchObject({
        stop: 'store_error',
        reserved: 1,
        acknowledged: 0,
        persistenceFailures: 1,
        observerStarted: 0,
      });
      expect(await admin.reconcile()).toMatchObject({ stop: 'idle', reserved: 0, acknowledged: 0, observerStarted: 0 });
      expect(await admin.listActivities({ jobId })).toMatchObject({ items: [{ attemptId: owned.fence.attemptId }] });
      expect(await admin.getJob(jobId)).toMatchObject({ disposition: 'accepted' });
      expect(onActivity).not.toHaveBeenCalled();
    });

    it('pages only scoped, complete redacted activities with a half-open window and bound cursor', async () => {
      const { primary, peer } = f;
      const acceptedGrid = {
        outcome: 'accepted',
        retry: 'never',
        stage: 'http',
        reason: 'sendgrid_accepted',
        providerMessageId: 'synthetic-grid-id',
      } as const;
      const throttle = {
        outcome: 'rejected',
        retry: 'safe_transient',
        stage: 'http',
        reason: 'sendgrid_throttled',
        retryHint: { delayMs: 60_000 },
      } as const;
      const sandbox = {
        outcome: 'validated',
        retry: 'never',
        stage: 'http',
        reason: 'sendgrid_validated',
      } as const;
      async function record(scope: string, n: number, provider: typeof GRID | typeof SANDBOX, result: AttemptResult) {
        await insert(primary, admission(scope, await f.now(), { jobId: fixtureId(n), provider }));
        const owned = await claim(peer, scope);
        await primary.markHandoff(scope, owned.fence, LIVE_LEASE, CALL);
        return finishClaim(peer, scope, finishData(owned, result));
      }
      const lastId = await record(A, 3, GRID, acceptedGrid);
      const pendingRetry = await record(A, 2, GRID, throttle);
      const firstId = await record(A, 1, SANDBOX, sandbox);
      const other = await record(B, 1, GRID, acceptedGrid); // Same opaque job ID, different scope.
      const { retryHint, ...withoutHint } = throttle;
      expect(pendingRetry.retryAt).toBeGreaterThanOrEqual(pendingRetry.finishedAt + retryHint.delayMs);
      const admin = createEmailAdmin({ scope: A, store: primary });
      const reader = createEmailAdmin({ scope: A, store: peer });
      const foreign = createEmailAdmin({ scope: B, store: peer });
      expect(await admin.reconcile({ limit: 2 })).toMatchObject({ stop: 'limit', reserved: 2, acknowledged: 2 });
      expect((await reader.listActivities()).items).toHaveLength(2);
      expect(await foreign.listActivities()).toEqual({ items: [] });
      expect(await reader.reconcile()).toMatchObject({ stop: 'idle', reserved: 1, acknowledged: 1 });
      expect(await foreign.reconcile()).toMatchObject({ stop: 'idle', reserved: 1, acknowledged: 1 });
      expect((await foreign.getJob(other.jobId))?.latestAttempt?.attemptId).toBe(other.attemptId);
      expect((await reader.getJob(other.jobId))?.latestAttempt?.attemptId).toBe(firstId.attemptId);
      const ordered = [lastId, pendingRetry, firstId].sort(
        (a, b) => b.finishedAt - a.finishedAt || (a.jobId < b.jobId ? -1 : 1),
      );
      const newest = ordered[0]!;
      const oldest = ordered[2]!;
      const filters = { from: oldest.finishedAt, before: newest.finishedAt + 1 };
      const { items, nextCursor } = await admin.listActivities({ ...filters, limit: 1 });
      expect(items).toMatchObject([{ jobId: newest.jobId, attemptId: newest.attemptId }]);
      expect(nextCursor).toMatch(/^[A-Za-z0-9_-]{1,512}$/);
      const cursor = nextCursor!;
      const next = await reader.listActivities({ ...filters, cursor, limit: 2 });
      expect(next).not.toHaveProperty('nextCursor');
      expect([...items, ...next.items].map(({ attemptId }) => attemptId)).toEqual(
        ordered.map(({ attemptId }) => attemptId),
      );
      expect(await reader.listActivities({ jobId: pendingRetry.jobId, ...filters })).toMatchObject({
        items: [{ disposition: 'retry_scheduled', result: withoutHint }],
      });
      expect(await reader.getJob(pendingRetry.jobId)).toMatchObject({
        state: 'queued',
        nextAt: pendingRetry.retryAt,
        latestAttempt: { attemptId: pendingRetry.attemptId, outcome: 'rejected' },
      });
      expect([...items, ...next.items].find(({ jobId }) => jobId === pendingRetry.jobId)?.result).toEqual(withoutHint);
      expect([...items, ...next.items].find(({ jobId }) => jobId === lastId.jobId)?.result).toEqual(acceptedGrid);
      expect([...items, ...next.items].find(({ jobId }) => jobId === firstId.jobId)?.result).toEqual(sandbox);
      expect(await reader.listActivities({ from: newest.finishedAt, before: newest.finishedAt })).toEqual({
        items: [],
      });
      expect(
        (await reader.listActivities({ before: newest.finishedAt })).items.every(
          ({ finishedAt }) => finishedAt < newest.finishedAt,
        ),
      ).toBe(true);
      await expect(reader.listActivities({ cursor })).rejects.toMatchObject({ code: 'invalid_cursor' });
      await expect(reader.listActivities({ ...filters, cursor, jobId: newest.jobId })).rejects.toMatchObject({
        code: 'invalid_cursor',
      });
      await expect(foreign.listActivities({ ...filters, cursor })).rejects.toMatchObject({ code: 'invalid_cursor' });
      expect(await foreign.listActivities()).toMatchObject({ items: [{ scope: B, attemptId: other.attemptId }] });
      expect(JSON.stringify([items, next])).not.toMatch(/retryHint|templateId|example\.invalid|Private content/);
    });

    it('cancels only scoped unhanded work, with an activity only when a claim existed', async () => {
      const { primary, peer } = f;
      const admin = createEmailAdmin({ scope: A, store: peer });
      const foreign = createEmailAdmin({ scope: B, store: primary });
      const queued = await insert(primary, admission(A, await f.now()));
      expect(await foreign.getJob(queued.jobId)).toBeNull();
      expect(await foreign.cancel(queued.jobId)).toEqual({ status: 'not_found' });
      expect(await admin.cancel(queued.jobId)).toMatchObject({
        status: 'cancelled',
        job: { disposition: 'cancelled', attemptCount: 0 },
      });
      expect(await admin.cancel(queued.jobId)).toMatchObject({ status: 'cancelled' });
      expect(await admin.getJob(queued.jobId)).not.toHaveProperty('latestAttempt');
      const pre = await insert(primary, admission(A, await f.now()));
      const ownedPre = await claim(primary, A);
      expect(await admin.cancel(pre.jobId)).toMatchObject({
        status: 'cancelled',
        job: { disposition: 'cancelled', latestAttempt: { outcome: 'unsubmitted' } },
      });
      expect(await primary.markHandoff(A, ownedPre.fence, LIVE_LEASE, CALL)).toBeNull();
      const handed = await insert(primary, admission(A, await f.now()));
      const owned = await claim(primary, A);
      expect(await primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL)).not.toBeNull();
      expect(await admin.cancel(handed.jobId)).toMatchObject({
        status: 'too_late',
        job: { state: 'leased', phase: 'handed_off' },
      });
      expect(await admin.reconcile()).toMatchObject({ stop: 'idle', acknowledged: 1 });
      expect(await admin.listActivities()).toMatchObject({
        items: [{ jobId: pre.jobId, attemptId: ownedPre.fence.attemptId, disposition: 'cancelled' }],
      });
      expect((await admin.listActivities()).items).toHaveLength(1);
    });

    it.each(['before_commit', 'after_commit'] as const)(
      'repeats exact admin actions after simulated %s acknowledgement loss',
      async (side) => {
        const { primary, peer } = f;
        const cancel = vi.fn<typeof primary.cancel>((...args) => lostAck(side, () => primary.cancel(...args)));
        const resolveUnknown = vi.fn<typeof primary.resolveUnknown>((...args) =>
          lostAck(side, () => primary.resolveUnknown(...args)),
        );
        const interrupted = createEmailAdmin({ scope: A, store: { ...primary, cancel, resolveUnknown } });
        const admin = createEmailAdmin({ scope: A, store: peer });

        const cancellable = await insert(primary, admission(A, await f.now()));
        const beforeMarker = await claim(primary, A);
        await expect(interrupted.cancel(cancellable.jobId)).rejects.toMatchObject({ code: 'write_unconfirmed' });
        expect(cancel).toHaveBeenCalledOnce();
        expect(await admin.getJob(cancellable.jobId)).toMatchObject(
          side === 'before_commit' ? { phase: 'pre_handoff' } : { disposition: 'cancelled' },
        );
        expect(await admin.cancel(cancellable.jobId)).toMatchObject({
          status: 'cancelled',
          job: { attemptCount: 1, latestAttempt: { attemptId: beforeMarker.fence.attemptId, reason: 'cancelled' } },
        });
        expect(await primary.markHandoff(A, beforeMarker.fence, LIVE_LEASE, CALL)).toBeNull();

        const unknown = await insert(primary, admission(A, await f.now()));
        const handed = await claim(primary, A);
        await primary.markHandoff(A, handed.fence, LIVE_LEASE, CALL);
        const original = await finishClaim(primary, A, finishData(handed, AMBIGUOUS));
        const action = { jobId: unknown.jobId, attemptId: original.attemptId, action: 'dismiss' } as const;
        await expect(interrupted.resolveUnknown(action)).rejects.toMatchObject({ code: 'write_unconfirmed' });
        expect(resolveUnknown).toHaveBeenCalledOnce();
        expect(await admin.getJob(unknown.jobId)).toMatchObject({ unknownOpen: side === 'before_commit' });
        expect(await admin.resolveUnknown(action)).toMatchObject({
          status: side === 'before_commit' ? 'resolved' : 'replayed',
          job: {
            disposition: 'unknown',
            unknownOpen: false,
            resolutions: [{ action: 'dismiss', attemptId: action.attemptId }],
          },
        });
        expect(await peer.findAttempt(A, unknown.jobId, original.attemptId, CALL)).toEqual(original);
        expect(await admin.reconcile()).toMatchObject({ reserved: 2, acknowledged: 2 });
        expect((await admin.listActivities()).items.map(({ disposition }) => disposition).sort()).toEqual([
          'cancelled',
          'unknown',
        ]);
      },
    );

    it('redrives an exact unknown once, preserves both attempts, and dismisses without changing history', async () => {
      const { primary, peer } = f;
      const smtp = syntheticSmtp(() => AMBIGUOUS);
      const worker = createEmailWorker({ scope: A, store: primary, providers: [smtp.provider] });
      const admin = createEmailAdmin({ scope: A, store: peer });
      const foreign = createEmailAdmin({ scope: B, store: primary });
      const job = await insert(primary, admission(A, await f.now(), { retry: { maxAttempts: 1 } }));
      const { jobId } = job;
      expect((await worker.run()).counts).toMatchObject({ unknown: 1, providerCalls: 1, submitted: 0 });
      const unknown = await admin.getJob(jobId);
      expect(unknown).toMatchObject({ disposition: 'unknown', unknownOpen: true });
      const attemptId = unknown?.latestAttempt?.attemptId;
      if (!attemptId) throw new Error('Expected the authoritative unknown attempt');
      const redrive = { jobId, attemptId, action: 'redrive', acknowledgeDuplicateRisk: true } as const;
      await expect(foreign.resolveUnknown(redrive)).rejects.toMatchObject({ code: 'not_found' });
      await expect(admin.resolveUnknown({ ...redrive, attemptId: fixtureId(99) })).rejects.toMatchObject({
        code: 'resolution_conflict',
      });
      expect(await admin.reconcile()).toMatchObject({ acknowledged: 1 });
      const original = (await admin.listActivities({ jobId })).items[0]!;
      expect(original.result).toEqual(AMBIGUOUS);
      expect(await worker.run()).toMatchObject({ stop: 'idle', items: [] });

      const resolution = await admin.resolveUnknown(redrive);
      expect(resolution).toMatchObject({
        status: 'resolved',
        job: { jobId, expiresAt: job.expiresAt, state: 'queued', attemptCount: 1, unknownOpen: false },
      });
      expect(await admin.resolveUnknown(redrive)).toEqual({ status: 'replayed', job: resolution.job });
      await expect(admin.resolveUnknown({ jobId, attemptId, action: 'dismiss' })).rejects.toMatchObject({
        code: 'resolution_conflict',
      });
      expect(await admin.reconcile()).toMatchObject({ stop: 'idle', reserved: 0 });
      expect(smtp.submit).toHaveBeenCalledTimes(1); // Only an explicitly started worker can submit the manual claim.
      expect((await worker.run()).counts).toMatchObject({ unknown: 1, providerCalls: 1, retryScheduled: 0 });
      const second = (await admin.getJob(jobId))?.latestAttempt?.attemptId;
      if (!second) throw new Error('Expected a manual attempt');
      expect(second).not.toBe(attemptId);
      expect(smtp.submit.mock.calls[0]?.[0].snapshot).toEqual(smtp.submit.mock.calls[1]?.[0].snapshot);
      await expect(admin.resolveUnknown({ ...redrive, attemptId: second })).rejects.toMatchObject({
        code: 'resolution_conflict',
      });
      const dismiss = { jobId, attemptId: second, action: 'dismiss' } as const;
      expect(await admin.resolveUnknown(dismiss)).toMatchObject({
        status: 'resolved',
        job: { disposition: 'unknown', unknownOpen: false, latestAttempt: { attemptId: second } },
      });
      expect(await admin.resolveUnknown(dismiss)).toMatchObject({ status: 'replayed' });
      expect(await admin.resolveUnknown(redrive)).toMatchObject({ status: 'replayed', job: { attemptCount: 2 } });
      expect(await admin.reconcile()).toMatchObject({ acknowledged: 1 });
      const { items } = await admin.listActivities({ jobId });
      expect(items).toHaveLength(2);
      expect(items.find(({ ordinal }) => ordinal === 1)).toEqual(original);
      expect(items.find(({ ordinal }) => ordinal === 2)).toMatchObject({
        attemptId: second,
        result: AMBIGUOUS,
        disposition: 'unknown',
      });
      expect(await worker.run()).toMatchObject({ stop: 'idle', items: [] });
      expect(smtp.submit).toHaveBeenCalledTimes(2);
    });
  });
}
