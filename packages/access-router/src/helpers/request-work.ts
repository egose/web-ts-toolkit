import type { AccessRuntime } from '../runtime';
import { resolveRequestComplexity } from '../request-complexity';
import { RequestConcurrencyScheduler, SharedHookGate } from './concurrency';

interface RequestWorkState {
  totalQueries: number;
  readonly scheduler: RequestConcurrencyScheduler;
  readonly hookGate: SharedHookGate;
}

// One Express request may traverse more than one runtime. Neither permits nor
// correlated totals may leak between their owners or between distinct requests.
const states = new WeakMap<object, WeakMap<AccessRuntime, RequestWorkState>>();

export function getRequestWorkState(req: object, runtime: AccessRuntime): RequestWorkState {
  let owners = states.get(req);
  if (!owners) {
    owners = new WeakMap();
    states.set(req, owners);
  }
  let state = owners.get(runtime);
  if (!state) {
    // Capture both resource limits together, once for this request/runtime.
    // Later runtime configuration changes apply to new request owners only.
    const limits = resolveRequestComplexity(runtime.getGlobalOption('requestComplexity'));
    state = {
      totalQueries: 0,
      scheduler: new RequestConcurrencyScheduler(limits.maxBulkConcurrency),
      hookGate: new SharedHookGate(limits.maxHookConcurrency),
    };
    owners.set(runtime, state);
  }
  return state;
}
