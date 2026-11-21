import { types } from 'node:util';
import { CLOCK_MARGIN_MS } from '../constants';
import type { AttemptResult, PreparedEmailSubmission, ProviderResult } from '../contracts/provider';
import type { ClaimedEmail, EmailStore, HandoffGrant, LeaseGrant } from '../contracts/store';
import type { EmailRunEntry } from '../contracts/worker';
import { readProviderResult } from './attempt-codecs';
import { createChildBudgetUntil, monotonicNow, waitForAbort, type OperationBudget } from './budget';
import { pendingCallback, type CallbackSlot } from './callbacks';
import { allowedErrorCode, invalid } from './validation';
import { readHandoff, readRenewed, safeLeaseEnd, type RpcTimes, type TimedGrant } from './worker-evidence';
import { finishAttempt } from './worker-finish';
import { prepareAttempt, stoppedPreflight, unsubmitted } from './worker-preflight';
import type { WorkerRun } from './worker-run';

type Mark = TimedGrant & { grant: HandoffGrant };

/** Only this attempt can write its owner fence. During preflight, join the renewal before moving to mark or finish. */
class AttemptOwner {
  lease: TimedGrant;
  handoff: Mark | 'unconfirmed' | undefined;
  readonly #lost = new AbortController();

  constructor(
    readonly run: WorkerRun,
    readonly claim: ClaimedEmail,
    times: RpcTimes,
  ) {
    this.lease = { ...times, grant: claim.lease };
  }

  get lost(): AbortSignal {
    return this.#lost.signal;
  }

  checkLease(): void {
    if (this.lost.aborted || monotonicNow(this.run.config.clock) >= safeLeaseEnd(this.lease)) {
      this.#lost.abort();
      invalid('aborted');
    }
  }

  async renewWhile(budget: OperationBudget, stopped: AbortSignal): Promise<void> {
    const { clock, limits } = this.run.config;
    const cadence = Math.floor(limits.leaseMs / 3);
    const waitSignal = AbortSignal.any([stopped, this.run.noLaunch]);
    while (!waitSignal.aborted) {
      try {
        budget.check();
        const due = this.lease.dispatchedAt + cadence;
        if (due >= budget.deadline) return;
        if (monotonicNow(clock) < due) {
          const wait = createChildBudgetUntil(clock, budget, due, waitSignal);
          try {
            await waitForAbort(wait.signal);
            // A broken clock/sleep is not permission to renew ahead of a grant or spin.
            if (allowedErrorCode(wait.signal.reason, ['invalid_config'])) invalid('invalid_config');
          } finally {
            wait.close();
          }
        }
        if (waitSignal.aborted) return;
        budget.check();
        this.checkLease();
        const grant = await this.#ownerWrite(budget, this.run.config.store.renew, readRenewed);
        if (!grant) return;
        this.lease = grant;
      } catch (error) {
        if (allowedErrorCode(error, ['invalid_config'])) this.#lost.abort();
        return;
      }
    }
  }

  async mark(budget: OperationBudget): Promise<Mark | null> {
    const grant = await this.#ownerWrite(budget, this.run.config.store.markHandoff, readHandoff, () => {
      this.handoff = 'unconfirmed';
    });
    this.handoff = grant ?? undefined;
    return grant;
  }

  async #ownerWrite<G extends LeaseGrant>(
    budget: OperationBudget,
    invoke: EmailStore['renew'],
    read: (value: unknown, last: TimedGrant, claim: ClaimedEmail, leaseMs: number, times: RpcTimes) => G,
    onDispatch?: () => void,
  ): Promise<(RpcTimes & { grant: G }) | null> {
    const {
      clock,
      scope,
      limits: { leaseMs },
    } = this.run.config;
    const { claim, lease } = this;
    const { fence } = claim;
    let dispatchedAt: number | undefined;
    try {
      const grant = await this.run.callStore(budget, {
        effect: 'mutation',
        authorize: true,
        deadline: safeLeaseEnd(lease),
        beforeInvoke: () => this.checkLease(),
        invoke: (call, start) => {
          dispatchedAt = start;
          onDispatch?.();
          return invoke(scope, fence, leaseMs, call);
        },
        accept: (value) => {
          if (value === null) return null;
          const times = { dispatchedAt: dispatchedAt!, confirmedAt: monotonicNow(clock) };
          return Object.freeze({ ...times, grant: read(value, lease, claim, leaseMs, times) });
        },
      });
      if (!grant) this.#lost.abort();
      return grant;
    } catch (error) {
      if (dispatchedAt !== undefined) this.#lost.abort();
      throw error;
    }
  }
}

/** Returns no result only if submit was never invoked. Never race transport settlement against cancellation. */
async function launch(
  run: WorkerRun,
  owner: AttemptOwner,
  mark: Mark,
  submit: PreparedEmailSubmission['submit'],
  preflight: OperationBudget,
): Promise<AttemptResult | undefined> {
  const { clock, limits, capacity } = run.config;
  const { provider, envelope, expiresAt } = owner.claim.snapshot;
  const { attemptId } = owner.claim.fence;
  const launchEnd = Math.min(
    preflight.deadline,
    mark.dispatchedAt + (expiresAt - mark.grant.handoffAt) - CLOCK_MARGIN_MS,
  );
  const stage = provider.kind === 'smtp' ? 'data' : 'http';
  const unknown = (reason: 'transport_uncertain' | 'provider_aborted' | 'provider_timeout'): ProviderResult =>
    Object.freeze({ outcome: 'unknown', retry: 'never', stage, reason });
  let io: OperationBudget | undefined;
  try {
    run.checkLaunch();
    preflight.check();
    const now = monotonicNow(clock);
    if (now >= launchEnd) return;
    io = createChildBudgetUntil(
      clock,
      run.budget,
      Math.min(now + limits.providerTimeoutMs, safeLeaseEnd(mark) - limits.finalizeGraceMs),
    );
    run.checkLaunch();
    io.check();
    // No async gap or host property lookup between this check and submit.
    const before = monotonicNow(clock);
    const timeoutMs = Math.floor(io.deadline - before);
    if (before >= launchEnd || timeoutMs < 1 || io.signal.aborted || preflight.signal.aborted || run.noLaunch.aborted)
      return;
    try {
      const returned: unknown = submit(Object.freeze({ signal: io.signal, timeoutMs }));
      // Even a data-only thenable returned by an invalid port can represent active I/O.
      // Observe completion, but do not take its outcome as conforming evidence.
      const pending = pendingCallback(returned);
      if (!pending) return unknown('transport_uncertain');
      const raw: unknown = await pending;
      if (!types.isPromise(returned)) return unknown('transport_uncertain');
      let result: ProviderResult;
      try {
        result = readProviderResult(raw, provider, attemptId, envelope, capacity);
      } catch {
        return unknown('transport_uncertain');
      }
      try {
        io.check();
      } catch (error) {
        const code = allowedErrorCode(error, ['deadline', 'aborted']);
        return unknown(
          code === 'deadline' ? 'provider_timeout' : code === 'aborted' ? 'provider_aborted' : 'transport_uncertain',
        );
      }
      return result; // Captured now; a subsequent run abort cannot rewrite it during finish.
    } catch {
      return unknown('transport_uncertain');
    }
  } catch {
    return;
  } finally {
    io?.close();
  }
}

async function processOwned(owner: AttemptOwner, slot: CallbackSlot) {
  const { run, claim, lease } = owner;
  const { clock, limits } = run.config;
  const deadline = lease.dispatchedAt + limits.preHandoffTimeoutMs;
  let budget: OperationBudget | undefined;
  try {
    budget = createChildBudgetUntil(clock, run.budget, deadline);
    const host = createChildBudgetUntil(clock, budget, deadline, AbortSignal.any([run.noLaunch, owner.lost]));
    const stopRenewal = new AbortController();
    const renewal = owner.renewWhile(budget, stopRenewal.signal);
    let preflight;
    try {
      preflight = await prepareAttempt(
        run.config,
        claim,
        {
          ...host,
          check() {
            host.check();
            owner.checkLease();
          },
        },
        slot,
      );
    } finally {
      stopRenewal.abort(); // Wake the timer, but do not abandon an already invoked store call.
      host.close();
      await renewal;
    }
    if ('result' in preflight) return { result: preflight.result, providerInvoked: false };
    const mark = await owner.mark(budget);
    if (mark) {
      const result = await launch(run, owner, mark, preflight.submit, budget);
      return {
        result: result ?? unsubmitted('launch_window_closed'),
        providerInvoked: result !== undefined,
      };
    }
  } catch (error) {
    return { result: stoppedPreflight(error), providerInvoked: false };
  } finally {
    budget?.close();
  }
  return { providerInvoked: false };
}

export async function processClaim(
  run: WorkerRun,
  claim: ClaimedEmail,
  times: RpcTimes,
  slot: CallbackSlot,
): Promise<EmailRunEntry> {
  const owner = new AttemptOwner(run, claim, times);
  const { result, providerInvoked } = await processOwned(owner, slot);
  const commit = await finishAttempt(run, owner, providerInvoked, owner.lost.aborted ? undefined : result);
  return Object.freeze({
    operation: 'claim',
    jobId: claim.fence.jobId,
    attemptId: claim.fence.attemptId,
    providerInvoked,
    ...(commit ? { status: commit.disposition, reason: commit.reason } : { status: 'unconfirmed' }),
  });
}
