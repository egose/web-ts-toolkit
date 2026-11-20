import { randomUUID } from 'node:crypto';
import type { AttemptResult } from '../contracts/provider';
import { createBudgetUntil, monotonicNow } from './budget';
import type { FinishRequest } from './store-codecs';
import { allowedErrorCode } from './validation';
import { readOwnedCommit, safeLeaseEnd, type OwnedEvidence } from './worker-evidence';
import type { WorkerRun } from './worker-run';

/** At most two exact mutations and two point reads in one grace. The provider is never part of this path. */
export async function finishAttempt(
  run: WorkerRun,
  evidence: OwnedEvidence,
  providerInvoked: boolean,
  result: AttemptResult | undefined,
) {
  const { clock, store, scope, limits } = run.config;
  const {
    claim: { fence },
    handoff,
    lease,
  } = evidence;
  const now = monotonicNow(clock);
  const request: FinishRequest | undefined =
    result && handoff !== 'unconfirmed'
      ? Object.freeze({ fence, phase: handoff ? 'handed_off' : 'pre_handoff', operationId: randomUUID(), result })
      : undefined;
  const leaseEnd = safeLeaseEnd(handoff && handoff !== 'unconfirmed' ? handoff : lease);
  const grace = createBudgetUntil(clock, Math.min(now, run.budget.deadline) + limits.finalizeGraceMs);

  async function confirm() {
    try {
      return await run.callStore(grace, {
        effect: 'read',
        invoke: (call) => store.findAttempt(scope, fence.jobId, fence.attemptId, call),
        accept: (value) => (value === null ? null : readOwnedCommit(value, evidence, request, providerInvoked, false)),
      });
    } catch {
      return null; // Unavailable proof is not evidence of rollback or a missing commit.
    }
  }

  function write(exact: FinishRequest) {
    return run.callStore(grace, {
      effect: 'mutation',
      deadline: leaseEnd,
      invoke: (call) => store.finish(scope, exact, call),
      accept: (value) => (value === null ? null : readOwnedCommit(value, evidence, exact, providerInvoked, true)),
    });
  }

  try {
    if (!request || now >= leaseEnd) return await confirm();
    let retry = false;
    try {
      const committed = await write(request);
      if (committed) return committed;
      // A definite fence miss can only be confirmed, not renewed or retried.
    } catch (error) {
      retry = allowedErrorCode(error, ['write_unconfirmed']) !== undefined;
    }
    const winner = await confirm();
    if (winner || !retry || grace.remainingMs() < 1 || monotonicNow(clock) >= leaseEnd) return winner;
    try {
      const committed = await write(request); // Exact same object, fence, operation ID and evidence.
      if (committed) return committed;
    } catch {
      // There might still be a stored winner (including a concurrent recovery).
    }
    return await confirm();
  } finally {
    grace.close();
  }
}
