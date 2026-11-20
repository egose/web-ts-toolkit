import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptResult, EmailActivity, ProjectionPermit } from '../../src';
import { activityDigest } from '../../src/internal/activity-codecs';
import {
  A,
  AMBIGUOUS,
  B,
  CALL,
  GRID,
  LIVE_LEASE,
  SANDBOX,
  STOPPED,
  accepted,
  admission,
  applied,
  claim,
  claimData,
  finishClaim,
  finishData,
  insert,
  lostAck,
  type SetupStore,
  type StoreFixture,
} from './store-fixtures';

/** Adapter-neutral tests using confirmed timestamps and wide live windows. No clock advancement or DB edits. */
export function registerStoreConformance(name: string, setup: SetupStore<StoreFixture>): void {
  describe(`${name}: V1 store conformance`, () => {
    let fixture: StoreFixture;
    beforeEach(async () => {
      fixture = await setup();
      await fixture.primary.ready();
      if (fixture.peer !== fixture.primary) await fixture.peer.ready();
    });
    afterEach(async () => fixture?.close?.());

    it('confirms one scoped winner and reads its current fingerprint and state across clients', async () => {
      const { primary, peer } = fixture;
      const now = await fixture.now();
      const key = { kind: 'single', idempotencyKey: 'stable' } as const;
      const first = admission(A, now, { key });
      const second = admission(A, now, { key, intent: 'different intent' });
      const competition = await Promise.all([primary.insert(A, first, CALL), peer.insert(A, second, CALL)]);
      expect(competition.map(({ status }) => status).sort()).toEqual(['duplicate', 'inserted']);
      const winner = competition[0]?.status === 'inserted' ? first : second;
      const loser = winner === first ? second : first;
      expect(await peer.findAdmission(A, key, CALL)).toMatchObject({
        job: { jobId: winner.jobId, attemptCount: 0, state: 'queued' },
        fingerprint: winner.command.fingerprint,
      });
      expect(loser.command.fingerprint).not.toBe(winner.command.fingerprint);
      expect(await primary.findJob(A, loser.jobId, CALL)).toBeNull();
      expect(await peer.findAdmission(B, key, CALL)).toBeNull();
      expect(await primary.findJob(B, winner.jobId, CALL)).toBeNull();

      await insert(peer, admission(B, now, { key, jobId: winner.jobId }));
      const batch = { kind: 'batch', batchId: 'stable', itemId: 'stable' } as const;
      await insert(primary, admission(A, now, { key: batch }));
      await insert(peer, admission(A, now, { key: { ...batch, batchId: 'separate' } }));
      const replay = admission(A, now, {
        key,
        intent: winner === second ? 'different intent' : 'stable business intent',
        content: 'New body',
      });
      expect(replay.command.fingerprint).toBe(winner.command.fingerprint);
      expect(replay.command.snapshotHash).not.toBe(winner.command.snapshotHash);
      expect(await peer.insert(A, replay, CALL)).toEqual({ status: 'duplicate' });
      expect(await primary.cancel(A, winner.jobId, CALL)).toMatchObject({ status: 'cancelled' });
      expect(await peer.findAdmission(A, key, CALL)).toMatchObject({
        job: { state: 'terminal', disposition: 'cancelled' },
      });
      expect(await peer.findAdmission(B, key, CALL)).toMatchObject({ job: { state: 'queued' } });
      expect(await peer.findAdmission(A, batch, CALL)).toMatchObject({ job: { state: 'queued' } });
    });

    it('rejects bad staged rows, policies, scope, and malformed read criteria before work', async () => {
      const { primary } = fixture;
      const valid = admission(A, await fixture.now());
      await expect(primary.insert(B, valid, CALL)).rejects.toMatchObject({ code: 'invalid_snapshot' });
      for (const command of [
        { ...valid.command, version: 2 },
        { ...valid.command, snapshotHash: '0'.repeat(64) },
        { ...valid.command, fingerprint: '0'.repeat(64) },
        { ...valid.command, rawInput: 'private' },
      ]) {
        await expect(primary.insert(A, { ...valid, command } as typeof valid, CALL)).rejects.toMatchObject({
          code: 'invalid_snapshot',
        });
      }
      await expect(
        primary.insert(A, { ...valid, retry: { ...valid.retry, maxAttempts: 11 } }, CALL),
      ).rejects.toMatchObject({
        code: 'invalid_command',
      });
      await expect(
        primary.insert(A, { ...valid, retry: { ...valid.retry, baseDelayMs: 200, maxDelayMs: 100 } }, CALL),
      ).rejects.toMatchObject({ code: 'invalid_command' });
      await expect(
        primary.insert(A, { ...valid, retention: { ...valid.retention, historyMs: 0 } }, CALL),
      ).rejects.toMatchObject({ code: 'invalid_command' });
      await expect(primary.findJob(A, 'not-a-job-id', CALL)).rejects.toMatchObject({ code: 'invalid_command' });
      await expect(
        primary.findAdmission(A, { kind: 'single', idempotencyKey: 'injection:tag' }, CALL),
      ).rejects.toMatchObject({ code: 'invalid_command' });
      await expect(primary.listActivities(A, { from: 2, before: 1 }, CALL)).rejects.toMatchObject({
        code: 'invalid_command',
      });
      await expect(primary.listActivities(A, { limit: 101 }, CALL)).rejects.toMatchObject({ code: 'invalid_command' });
      await expect(primary.findJob(A, valid.jobId, CALL)).resolves.toBeNull();
    });

    it.each(['before_commit', 'after_commit'] as const)(
      'models %s admission ACK loss without assuming a miss',
      async (mode) => {
        const { primary, peer } = fixture;
        const row = admission(A, await fixture.now());
        await expect(lostAck(mode, () => primary.insert(A, row, CALL))).rejects.toMatchObject({
          code: 'write_unconfirmed',
        });
        const inspected = await peer.findAdmission(A, row.command.key, CALL);
        if (mode === 'after_commit') expect(inspected?.job.jobId).toBe(row.jobId);
        else expect(inspected).toBeNull(); // Fixture knows the operation did not dispatch. Not a general live inference.
        const replay = await peer.insert(A, row, CALL);
        expect(replay.status).toBe(mode === 'after_commit' ? 'duplicate' : 'inserted');
        expect((await primary.findAdmission(A, row.command.key, CALL))?.job.jobId).toBe(row.jobId);
      },
    );

    it('has only one owner across competing clients and never overwrites accepted evidence', async () => {
      const { primary, peer } = fixture;
      const row = await insert(primary, admission(A, await fixture.now()));
      const replies = await Promise.all([
        primary.claimNext(A, claimData(), CALL),
        peer.claimNext(A, claimData(), CALL),
      ]);
      const wins = replies.filter(({ status }) => status === 'applied');
      expect(wins).toHaveLength(1);
      const owned = applied(wins[0]!);
      expect(owned.job).toMatchObject({ jobId: row.jobId, attemptCount: 1, phase: 'pre_handoff' });
      expect(Object.isFrozen(owned.snapshot.envelope.to[0])).toBe(true);
      expect(Object.isFrozen(owned.fence)).toBe(true);
      const wrong = { ...owned.fence, token: claimData().token };
      expect(await peer.renew(A, wrong, LIVE_LEASE, CALL)).toBeNull();
      expect(await peer.markHandoff(B, owned.fence, LIVE_LEASE, CALL)).toBeNull();
      expect(await peer.markHandoff(A, wrong, LIVE_LEASE, CALL)).toBeNull();
      const grant = await primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL);
      expect(grant?.leaseEndsAt).toBe((grant?.handoffAt ?? 0) + LIVE_LEASE);
      expect(await peer.renew(A, owned.fence, LIVE_LEASE, CALL)).toBeNull();
      expect(await peer.markHandoff(A, owned.fence, LIVE_LEASE, CALL)).toBeNull();
      expect(await peer.cancel(A, row.jobId, CALL)).toMatchObject({ status: 'too_late' });
      expect(await peer.finish(A, finishData(owned, STOPPED, 'pre_handoff'), CALL)).toBeNull();

      const final = finishData(owned, accepted(owned.fence.attemptId));
      await expect(lostAck('before_commit', () => primary.finish(A, final, CALL))).rejects.toMatchObject({
        code: 'write_unconfirmed',
      });
      expect(await peer.findAttempt(A, row.jobId, owned.fence.attemptId, CALL)).toBeNull();
      await expect(lostAck('after_commit', () => primary.finish(A, final, CALL))).rejects.toMatchObject({
        code: 'write_unconfirmed',
      });
      const read = await peer.findAttempt(A, row.jobId, owned.fence.attemptId, CALL);
      expect(read).toMatchObject({ disposition: 'accepted', operationId: final.operationId });
      const same = await peer.finish(A, final, CALL);
      expect(same).toEqual(read);
      expect(same?.result).not.toBe(read?.result);
      expect(Object.isFrozen(read?.result.recipients?.[0])).toBe(true);
      expect(await peer.finish(A, { ...final, fence: wrong }, CALL)).toBeNull();
      expect(await peer.finish(A, finishData(owned, AMBIGUOUS), CALL)).toBeNull();
      await expect(peer.finish(A, { ...final, result: AMBIGUOUS }, CALL)).rejects.toMatchObject({
        code: 'invalid_command',
      });
      expect(await primary.findJob(A, row.jobId, CALL)).toMatchObject({ state: 'terminal', disposition: 'accepted' });
      expect(await peer.findAttempt(B, row.jobId, owned.fence.attemptId, CALL)).toBeNull();
      expect(await primary.claimNext(A, claimData(), CALL)).toEqual({ status: 'none' });
    });

    it('linearizes cancel against the one-way marker; a cancelled attempt cannot finish', async () => {
      const { primary, peer } = fixture;
      const row = await insert(primary, admission(A, await fixture.now()));
      const owned = await claim(primary, A);
      const [cancel, marker] = await Promise.all([
        primary.cancel(A, row.jobId, CALL),
        peer.markHandoff(A, owned.fence, LIVE_LEASE, CALL),
      ]);
      if (cancel.status === 'cancelled') {
        expect(marker).toBeNull();
        expect(await peer.findAttempt(A, row.jobId, owned.fence.attemptId, CALL)).toMatchObject({
          result: { outcome: 'unsubmitted', reason: 'cancelled' },
          disposition: 'cancelled',
        });
        expect(await peer.finish(A, finishData(owned, STOPPED, 'pre_handoff'), CALL)).toBeNull();
        expect(await peer.cancel(A, row.jobId, CALL)).toMatchObject({ status: 'cancelled' });
      } else {
        expect(cancel.status).toBe('too_late');
        expect(marker).not.toBeNull();
        expect(await peer.findAttempt(A, row.jobId, owned.fence.attemptId, CALL)).toBeNull();
      }
      const queued = await insert(primary, admission(A, await fixture.now()));
      expect(await peer.cancel(A, queued.jobId, CALL)).toMatchObject({ status: 'cancelled', job: { attemptCount: 0 } });
      expect(await peer.cancel(B, queued.jobId, CALL)).toEqual({ status: 'not_found' });
    });

    it('rejects impossible phase, stage, evidence and recipient accounting without touching the attempt', async () => {
      const { primary, peer } = fixture;
      const row = await insert(primary, admission(A, await fixture.now()));
      const owned = await claim(peer, A);
      const smtp = accepted(owned.fence.attemptId);
      const expectBad = (result: unknown, phase: 'pre_handoff' | 'handed_off' = 'handed_off') =>
        expect(primary.finish(A, finishData(owned, result as AttemptResult, phase), CALL)).rejects.toMatchObject({
          code: 'invalid_command',
        });
      await expectBad(smtp, 'pre_handoff');
      await expectBad({ ...STOPPED, reason: 'pre_handoff_lease_expired' }, 'pre_handoff');
      await expectBad({ ...STOPPED, reason: 'launch_window_closed' }, 'pre_handoff');
      await expectBad({ ...STOPPED, retry: 'never', reason: 'cancelled' }, 'pre_handoff');
      await expectBad({ ...STOPPED, retry: 'never', reason: 'expired' }, 'pre_handoff');
      expect(await primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL)).not.toBeNull();
      for (const bad of [
        STOPPED,
        { ...smtp, reason: 'provider response leaked' },
        { ...smtp, response: 'private response' },
        { ...smtp, retry: 'safe_transient' },
        { ...smtp, stage: 'envelope' },
        { ...smtp, reason: 'sendgrid_accepted', stage: 'http' },
        { ...smtp, recipients: undefined },
        { ...smtp, recipients: smtp.recipients?.slice(0, 2) },
        { ...smtp, recipients: [smtp.recipients?.[0], smtp.recipients?.[0], smtp.recipients?.[2]] },
        {
          ...smtp,
          recipients: [smtp.recipients?.[0], smtp.recipients?.[1], { group: 'bcc', index: 1, status: 'accepted' }],
        },
        { ...smtp, outcome: 'partially_accepted', reason: 'smtp_partial' },
        { ...smtp, messageId: accepted(claimData().attemptId).messageId },
        { ...smtp, providerMessageId: 'SomeId' },
        { ...smtp, retryHint: { delayMs: 500 } },
        { ...AMBIGUOUS, retry: 'safe_transient' },
        { ...AMBIGUOUS, stage: 'pre_handoff', reason: 'post_handoff_lease_expired' },
      ]) {
        await expectBad(bad);
      }
      expect(await peer.findAttempt(A, row.jobId, owned.fence.attemptId, CALL)).toBeNull();
      const partial = {
        ...smtp,
        outcome: 'partially_accepted',
        reason: 'smtp_partial',
        recipients: smtp.recipients?.map((recipient) =>
          recipient.group === 'bcc' ? { ...recipient, status: 'rejected' } : recipient,
        ),
      } as AttemptResult;
      expect(await finishClaim(peer, A, finishData(owned, partial))).toMatchObject({
        disposition: 'partially_accepted',
      });
      expect(await primary.claimNext(A, claimData(), CALL)).toEqual({ status: 'none' });
      await expect(
        primary.resolveUnknown(
          A,
          { jobId: row.jobId, attemptId: owned.fence.attemptId, action: 'redrive', acknowledgeDuplicateRisk: true },
          CALL,
        ),
      ).rejects.toMatchObject({ code: 'resolution_conflict' });
    });

    it.each([GRID, SANDBOX])(
      'matches $mode SendGrid evidence without inventing recipient outcomes',
      async (provider) => {
        const { primary, peer } = fixture;
        await insert(primary, admission(A, await fixture.now(), { provider }));
        const owned = await claim(primary, A);
        await primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL);
        const good: AttemptResult =
          provider.mode === 'live'
            ? {
                outcome: 'accepted',
                reason: 'sendgrid_accepted',
                providerMessageId: 'sg-opaque_0=',
                retry: 'never',
                stage: 'http',
              }
            : { outcome: 'validated', reason: 'sendgrid_validated', retry: 'never', stage: 'http' };
        const opposite =
          provider.mode === 'live'
            ? { ...good, outcome: 'validated', reason: 'sendgrid_validated' }
            : { ...good, outcome: 'accepted', reason: 'sendgrid_accepted' };
        for (const evidence of [
          opposite,
          { ...good, recipients: [] },
          { ...good, stage: 'data' },
          { ...good, providerMessageId: 'private@example.invalid' },
          { ...good, retryHint: { delayMs: 1 } },
        ]) {
          await expect(peer.finish(A, finishData(owned, evidence as AttemptResult), CALL)).rejects.toMatchObject({
            code: 'invalid_command',
          });
        }
        const stored = await finishClaim(peer, A, finishData(owned, good));
        expect(stored.disposition).toBe(good.outcome);
        expect(stored.result).not.toHaveProperty('recipients');
      },
    );

    it('uses exact explicit redrive/dismiss decisions; a second unknown can only be dismissed', async () => {
      const { primary, peer } = fixture;
      const row = await insert(primary, admission(A, await fixture.now(), { retry: { maxAttempts: 1 } }));
      const original = await claim(primary, A);
      await primary.markHandoff(A, original.fence, LIVE_LEASE, CALL);
      const first = await finishClaim(primary, A, finishData(original, AMBIGUOUS));
      expect(first.disposition).toBe('unknown');
      expect(await peer.claimNext(A, claimData(), CALL)).toEqual({ status: 'none' });
      const redrive = {
        jobId: row.jobId,
        attemptId: first.attemptId,
        action: 'redrive',
        acknowledgeDuplicateRisk: true,
      } as const;
      await expect(peer.resolveUnknown(B, redrive, CALL)).rejects.toMatchObject({ code: 'not_found' });
      await expect(
        peer.resolveUnknown(A, { ...redrive, attemptId: claimData().attemptId }, CALL),
      ).rejects.toMatchObject({
        code: 'resolution_conflict',
      });
      await expect(
        peer.resolveUnknown(A, { ...redrive, acknowledgeDuplicateRisk: false } as unknown as typeof redrive, CALL),
      ).rejects.toMatchObject({ code: 'invalid_command' });
      expect(await peer.resolveUnknown(A, redrive, CALL)).toMatchObject({
        status: 'resolved',
        job: { state: 'queued' },
      });
      const manual = await claim(peer, A);
      expect(manual).toMatchObject({ ordinal: 2, manual: true });
      expect(manual.snapshot).toEqual(original.snapshot);
      expect(manual.snapshot).not.toBe(original.snapshot);
      expect(await primary.resolveUnknown(A, redrive, CALL)).toMatchObject({
        status: 'replayed',
        job: { state: 'leased' },
      });
      const dismiss = { jobId: row.jobId, attemptId: first.attemptId, action: 'dismiss' } as const;
      await expect(primary.resolveUnknown(A, dismiss, CALL)).rejects.toMatchObject({ code: 'resolution_conflict' });
      await peer.markHandoff(A, manual.fence, LIVE_LEASE, CALL);
      const second = await finishClaim(peer, A, finishData(manual, AMBIGUOUS));
      await expect(primary.resolveUnknown(A, { ...redrive, attemptId: second.attemptId }, CALL)).rejects.toMatchObject({
        code: 'resolution_conflict',
      });
      const finalAction = { ...dismiss, attemptId: second.attemptId };
      expect(await primary.resolveUnknown(A, finalAction, CALL)).toMatchObject({
        status: 'resolved',
        job: {
          disposition: 'unknown',
          unknownOpen: false,
          attemptCount: 2,
          resolutions: [{ action: 'redrive' }, { action: 'dismiss' }],
        },
      });
      expect(await peer.resolveUnknown(A, finalAction, CALL)).toMatchObject({ status: 'replayed' });
      expect(await peer.resolveUnknown(A, redrive, CALL)).toMatchObject({
        status: 'replayed',
        job: { disposition: 'unknown' },
      });
      expect(await peer.findAttempt(A, row.jobId, first.attemptId, CALL)).toEqual(first);
      expect(await peer.findAttempt(A, row.jobId, second.attemptId, CALL)).toEqual(second);
    });

    it('projects the exact redacted digest, survives an upsert/ACK interruption, and never changes acceptance', async () => {
      const { primary, peer } = fixture;
      const row = await insert(primary, admission(A, await fixture.now()));
      const owned = await claim(primary, A);
      await primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL);
      await finishClaim(primary, A, finishData(owned, accepted(owned.fence.attemptId)));
      expect(await peer.listActivities(A, {}, CALL)).toEqual({ items: [] });
      expect(await peer.findJob(A, row.jobId, CALL)).toMatchObject({
        disposition: 'accepted',
        latestAttempt: { outcome: 'accepted' },
      });
      const first = applied(await primary.reserveProjection(A, CALL));
      const second = applied(await peer.reserveProjection(A, CALL));
      expect(second.activity).toEqual(first.activity);
      expect(second.digest).toBe(first.digest);
      expect(second.permitUntil).toBeGreaterThanOrEqual(first.permitUntil);
      expect(await peer.ackProjection(A, first, CALL)).toBe('stale');
      const mutated: EmailActivity = { ...first.activity, correlation: { intent: 'forged' } };
      const forged: ProjectionPermit = { ...first, activity: mutated, digest: activityDigest(mutated) };
      expect(await primary.ackProjection(A, forged, CALL)).toBe('stale');
      await expect(primary.putActivity(A, forged, CALL)).rejects.toMatchObject({ code: 'invalid_command' });
      await expect(
        primary.putActivity(A, { ...second, permitUntil: second.permitUntil + 1 }, CALL),
      ).rejects.toMatchObject({
        code: 'invalid_command',
      });
      await expect(primary.putActivity(A, { ...first, activity: mutated }, CALL)).rejects.toMatchObject({
        code: 'invalid_command',
      });
      await expect(primary.putActivity(B, first, CALL)).rejects.toMatchObject({ code: 'invalid_command' });
      await expect(lostAck('after_commit', () => primary.putActivity(A, first, CALL))).rejects.toMatchObject({
        code: 'write_unconfirmed',
      });
      const page = await peer.listActivities(A, {}, CALL);
      expect(page.items).toEqual([first.activity]);
      expect(page.items[0]).not.toBe(first.activity);
      expect(Object.isFrozen(page.items[0]?.result.recipients)).toBe(true);
      expect(Object.isFrozen(page.items[0]?.correlation)).toBe(true);
      expect(Object.isFrozen(page.items)).toBe(true);
      expect(await peer.listActivities(B, {}, CALL)).toEqual({ items: [] });
      expect(await peer.putActivity(A, second, CALL)).toBe('present');
      expect(await peer.ackProjection(A, first, CALL)).toBe('acknowledged'); // Older windows remain valid.
      expect(await primary.ackProjection(A, second, CALL)).toBe('already_acknowledged');
      expect(await primary.reserveProjection(A, CALL)).toEqual({ status: 'none' });
      const summary = await peer.findJob(A, row.jobId, CALL);
      const serialized = JSON.stringify({ summary, page });
      for (const token of [
        'Private ',
        'example.invalid',
        owned.fence.token,
        first.digest,
        'snapshot',
        'attachments',
        'retryHint',
        'ownerDigest',
        'leaseEndsAt',
        'operationId',
        'intentHash',
        'permitUntil',
      ]) {
        expect(serialized).not.toContain(token);
      }
    });

    it('paginates complete activities with opaque scope/filter-bound cursors and half-open dates', async () => {
      const { primary, peer } = fixture;
      const activities: EmailActivity[] = [];
      for (const scope of [A, A, A, B]) {
        await insert(primary, admission(scope, await fixture.now()));
        const owned = await claim(peer, scope);
        await primary.markHandoff(scope, owned.fence, LIVE_LEASE, CALL);
        await finishClaim(peer, scope, finishData(owned, accepted(owned.fence.attemptId)));
        const permit = applied(await peer.reserveProjection(scope, CALL));
        await primary.putActivity(scope, permit, CALL);
        await peer.ackProjection(scope, permit, CALL);
        if (scope === A) activities.push(permit.activity);
      }
      activities.sort((a, b) => b.finishedAt - a.finishedAt || (a.jobId < b.jobId ? -1 : 1));
      const latest = activities[0]!;
      const oldest = activities.at(-1)!;
      const filters = { from: oldest.finishedAt, before: latest.finishedAt + 1 };
      const first = await primary.listActivities(A, { ...filters, limit: 1 }, CALL);
      expect(first.items).toEqual([latest]);
      expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]{1,512}$/);
      const cursor = first.nextCursor!;
      expect(await peer.listActivities(A, { ...filters, limit: 2, cursor }, CALL)).toEqual({
        items: activities.slice(1),
      });
      expect(await peer.listActivities(A, { jobId: oldest.jobId, ...filters }, CALL)).toEqual({ items: [oldest] });
      expect((await peer.listActivities(A, { before: latest.finishedAt }, CALL)).items).not.toContainEqual(latest);
      expect(await peer.listActivities(A, { from: latest.finishedAt, before: latest.finishedAt }, CALL)).toEqual({
        items: [],
      });
      await expect(peer.listActivities(B, { ...filters, cursor }, CALL)).rejects.toMatchObject({
        code: 'invalid_cursor',
      });
      await expect(peer.listActivities(A, { ...filters, jobId: oldest.jobId, cursor }, CALL)).rejects.toMatchObject({
        code: 'invalid_cursor',
      });
      await expect(peer.listActivities(A, { cursor }, CALL)).rejects.toMatchObject({ code: 'invalid_cursor' });
      const noncanonical = Buffer.from(` ${Buffer.from(cursor, 'base64url').toString('utf8')}`).toString('base64url');
      for (const corrupt of [cursor + '=', noncanonical, 'a'.repeat(513), 'e30', 'not-json', '!!!!', '']) {
        await expect(peer.listActivities(A, { ...filters, cursor: corrupt }, CALL)).rejects.toMatchObject({
          code: 'invalid_cursor',
        });
      }
    });
  });
}
