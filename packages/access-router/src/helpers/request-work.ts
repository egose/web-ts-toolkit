import type { AccessRuntime } from '../runtime';
import { resolveRequestComplexity } from '../request-complexity';
import { RequestConcurrencyScheduler } from './concurrency';

interface RequestWorkState {
  totalQueries: number;
  scheduler: RequestConcurrencyScheduler;
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
    state = {
      totalQueries: 0,
      scheduler: new RequestConcurrencyScheduler(
        resolveRequestComplexity(runtime.getGlobalOption('requestComplexity')).maxBulkConcurrency,
      ),
    };
    owners.set(runtime, state);
  }
  return state;
}
