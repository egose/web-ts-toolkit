import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PROJECTION_PERMIT_MS } from '../../src/constants';
import {
  activityPage,
  readActivityCriteria,
  readProjectionPermit,
  readStoredActivity,
} from '../../src/internal/activity-codecs';
import { readProviderResult } from '../../src/internal/attempt-codecs';
import { jobSelectors, jobSummary, readJobRecord, type JobRecord } from '../../src/internal/job-record';
import {
  acknowledgeJobProjection,
  claimJob,
  cleanupJob,
  decideActivityPut,
  finishJob,
  markJob,
  newJob,
  reserveJobProjection,
  resolveJob,
  type JobDecision,
} from '../../src/internal/job-transitions';
import { readClaim, readFinish, readStoreAdmission } from '../../src/internal/store-codecs';
import { A, AMBIGUOUS, B, DAY, LEASE, accepted, admission, claimData, finishData } from '../conformance/store-fixtures';
import { NOW } from './template-fixtures';

const at = (now: number) => ({ now, revision: randomUUID() });
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
function next<T>(decision: JobDecision<T> | null): JobRecord {
  if (decision?.write?.kind !== 'replace') throw new Error('Expected a replacement plan');
  const row = decision.write.next;
  expect(row.revision).not.toBe(decision.write.guard.revision);
  const decoded = readJobRecord(A, json(row));
  expect(decoded).toEqual(row);
  return decoded;
}

describe('backend-independent V1 logical job and activity port', () => {
  it('round-trips a complete fenced sequence, projecting and retiring via derived selectors', () => {
    const input = admission(A, NOW, { retention: { payloadMs: 0, historyMs: DAY, idempotencyMs: DAY } });
    const inserted = newJob(readStoreAdmission(A, input), at(NOW));
    let row = readJobRecord(A, json(inserted));
    expect(row).toEqual(inserted);
    expect(row.snapshot).not.toBe(inserted.snapshot);
    expect(jobSelectors(row)).toEqual({ state: 'queued', queuedExpiresAt: NOW + DAY, nextAt: NOW });
    const first = claimJob(row, readClaim(claimData(LEASE)), at(NOW))!;
    expect(first.write?.guard).toMatchObject({
      state: { state: 'queued', nextAt: NOW },
      atOrAfter: NOW,
      before: NOW + LEASE,
    });
    row = next(first);
    const firstFence = first.value.fence;
    expect(jobSelectors(row)).toEqual({ state: 'leased', leaseEndsAt: NOW + LEASE });
    row = next(markJob(row, firstFence, LEASE, at(NOW + 1)));
    const firstFinish = finishJob(row, readFinish(finishData(first.value, AMBIGUOUS)), at(NOW + 2));
    expect(firstFinish?.write?.guard).toMatchObject({
      scope: A,
      jobId: row.jobId,
      state: {
        state: 'leased',
        lease: { token: firstFence.token, handedOffAt: NOW + 1, leaseEndsAt: NOW + LEASE + 1 },
      },
      atOrAfter: NOW + 2,
      before: NOW + LEASE + 1,
    });
    row = next(firstFinish);
    expect(jobSummary(row)).toMatchObject({ disposition: 'unknown', unknownOpen: true });
    expect(jobSelectors(row)).toEqual({ state: 'terminal', pendingAt: NOW + 2 });
    row = next(
      resolveJob(
        row,
        { jobId: row.jobId, attemptId: firstFence.attemptId, action: 'redrive', acknowledgeDuplicateRisk: true },
        at(NOW + 3),
      ),
    );
    const manual = claimJob(row, readClaim(claimData(LEASE)), at(NOW + 4))!;
    row = next(manual);
    row = next(markJob(row, manual.value.fence, LEASE, at(NOW + 5)));
    const committed = finishJob(
      row,
      readFinish(finishData(manual.value, accepted(manual.value.fence.attemptId))),
      at(NOW + 6),
    );
    row = next(committed);
    expect(jobSelectors(row)).toEqual({ state: 'terminal', pendingAt: NOW + 2 });
    for (const ordinal of [1, 2]) {
      const plan = reserveJobProjection(row, at(NOW + 7))!;
      row = next(plan);
      const permit = readProjectionPermit(A, json(plan.value));
      expect(permit.activity.ordinal).toBe(ordinal);
      expect(permit.permitUntil).toBe(NOW + 7 + PROJECTION_PERMIT_MS);
      expect(decideActivityPut(row, permit, undefined, NOW + 7)).toBe('insert');
      const stored = readStoredActivity(A, json({ activity: permit.activity, digest: permit.digest }));
      row = next(acknowledgeJobProjection(row, permit, stored, at(NOW + 7)));
    }
    expect(jobSelectors(row)).toEqual({ state: 'terminal', nextCleanupAt: NOW + 7 });
    row = next(cleanupJob(row, at(NOW + 7)));
    expect(row).not.toHaveProperty('snapshot');
    expect(row.snapshotHash).toBe(inserted.snapshotHash);
    expect(jobSelectors(row)).toEqual({ state: 'terminal', nextCleanupAt: NOW + 6 + DAY });
    const retireAt = NOW + 6 + DAY;
    row = next(cleanupJob(row, at(retireAt)));
    const purge = cleanupJob(row, at(retireAt));
    expect(purge).toMatchObject({
      value: 'purged',
      write: {
        kind: 'purge',
        guard: { scope: A, jobId: row.jobId, revision: row.revision, retiring: true, atOrAfter: retireAt },
        attemptIds: [firstFence.attemptId, manual.value.fence.attemptId],
      },
    });
  });

  it('rejects mismatched snapshot, key, scope and logical history before backend use', () => {
    const row = newJob(readStoreAdmission(A, admission(A, NOW)), at(NOW));
    const claim = claimJob(row, readClaim(claimData(LEASE)), at(NOW))!;
    const leased = next(claim);
    const marked = next(markJob(leased, claim.value.fence, LEASE, at(NOW)));
    const commit = finishJob(
      marked,
      readFinish(finishData(claim.value, accepted(claim.value.fence.attemptId))),
      at(NOW),
    )!;
    const terminal = next(commit);
    const attempt = terminal.attempts[0]!;
    const badRows = [
      { ...row, scope: B },
      { ...row, version: 2 },
      { ...row, admissionKey: 'b:wrong:key' },
      { ...row, snapshotHash: '0'.repeat(64) },
      { ...row, priority: 9 },
      { ...row, recipientCounts: { to: 20, cc: 20, bcc: 20 } },
      { ...row, state: { state: 'queued', nextAt: NOW + 1 } },
      { ...row, snapshot: undefined }, // JSON omits it; a live row still cannot be pruned.
      { ...row, pendingAt: NOW }, // Physical selectors must not appear in logical JSON.
      { ...leased, state: { state: 'leased', lease: { ...claim.value.fence, leaseEndsAt: NOW } } },
      { ...terminal, attempts: [{ ...attempt, commit: { ...attempt.commit, ordinal: 2 } }] },
      { ...terminal, attempts: [{ ...attempt, commit: { ...attempt.commit, reason: 'attempts_exhausted' } }] },
      { ...terminal, attempts: [{ ...attempt, digest: '1'.repeat(64) }] },
      { ...terminal, attempts: [attempt, attempt] },
      { ...terminal, attempts: [{ ...attempt, projectionAckAt: NOW }] },
      { ...terminal, projectionPermitUntil: NOW + PROJECTION_PERMIT_MS },
      { ...terminal, resolutions: [{ attemptId: attempt.commit.attemptId, at: NOW, action: 'redrive' }] },
      { ...terminal, retiring: true },
    ];
    for (const invalid of badRows) {
      expect(() => readJobRecord(A, json(invalid))).toThrow(expect.objectContaining({ code: 'store_incompatible' }));
    }
    expect(() => markJob(leased, claim.value.fence, LEASE, at(NOW - 1))).toThrow(
      expect.objectContaining({ code: 'store_unavailable' }),
    );
  });

  it('rejects mismatching complete projections as corruption, not successful idempotence', () => {
    const row = newJob(readStoreAdmission(A, admission(A, NOW)), at(NOW));
    const owned = claimJob(row, readClaim(claimData(LEASE)), at(NOW))!;
    const marked = next(markJob(next(owned), owned.value.fence, LEASE, at(NOW)));
    const terminal = next(finishJob(marked, readFinish(finishData(owned.value, AMBIGUOUS)), at(NOW)));
    const reserved = reserveJobProjection(terminal, at(NOW))!;
    const source = next(reserved);
    const wrong = { activity: reserved.value.activity, digest: '0'.repeat(64) };
    expect(() => readStoredActivity(A, wrong)).toThrow(expect.objectContaining({ code: 'store_incompatible' }));
    expect(() => decideActivityPut(source, reserved.value, wrong, NOW)).toThrow(
      expect.objectContaining({ code: 'store_incompatible' }),
    );
    expect(() => acknowledgeJobProjection(source, reserved.value, wrong, at(NOW))).toThrow(
      expect.objectContaining({ code: 'store_incompatible' }),
    );
    const accurate = { ...wrong, digest: reserved.value.digest };
    const acknowledged = next(acknowledgeJobProjection(source, reserved.value, accurate, at(NOW)));
    expect(() => decideActivityPut(acknowledged, reserved.value, undefined, NOW)).toThrow(
      expect.objectContaining({ code: 'store_incompatible' }),
    );
    expect(() => activityPage(readActivityCriteria(A, { limit: 2 }), [accurate.activity, accurate.activity])).toThrow(
      expect.objectContaining({ code: 'store_incompatible' }),
    );
  });

  it('exports provider-result validation for a worker to downgrade invalid evidence to ambiguity', () => {
    const { snapshot } = admission(A, NOW).command;
    const attemptId = randomUUID();
    const pass = accepted(attemptId);
    expect(readProviderResult(pass, snapshot.provider, attemptId, snapshot.envelope)).toEqual(pass);
    for (const invalid of [
      { ...pass, retry: 'safe_transient' },
      { ...pass, messageId: '<forged@example.invalid>' },
      { ...pass, recipients: pass.recipients?.slice(1) },
      { ...pass, recipients: [{ group: 'to', index: 0, status: 'accepted', address: 'invalid@example.invalid' }] },
      { ...pass, stage: 'http', reason: 'sendgrid_accepted' },
      { ...pass, stage: 'pre_handoff', reason: 'launch_window_closed' },
    ]) {
      expect(() => readProviderResult(invalid, snapshot.provider, attemptId, snapshot.envelope)).toThrow(
        expect.objectContaining({ code: 'invalid_command' }),
      );
    }
  });
});
