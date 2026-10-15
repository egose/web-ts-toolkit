import { isArray, isPlainObject } from '@web-ts-toolkit/utils';
import type { ValidationError } from './validation/types';

export interface RequestComplexityOptions {
  maxDepth?: number;
  maxNodes?: number;
  maxLogicalClauses?: number;
  maxInValues?: number;
  maxBulkItems?: number;
  maxIncludeCount?: number;
  maxSubQueryCount?: number;
  /**
   * Defaults to 10. Shared request-and-runtime-owned ceiling on awaited model-service
   * adapter/document persistence operations, including nested includes/root entries.
   * Recursive orchestration holds no permit; internal map/run bounds are per call.
   * One operation may issue multiple driver commands via Mongoose middleware/populate;
   * direct DB/network calls from trusted application hooks are outside this ceiling.
   * Captured together with maxHookConcurrency on first request/runtime work-state use;
   * later configuration changes apply to new requests, not an existing pool.
   * Not a process-wide connection limit or protection against competing edits.
   */
  maxBulkConcurrency?: number;
  /**
   * Defaults to 10. Shared request/runtime ceiling on independently admitted
   * hook chains across services, root entries, includes, populate and subdocuments.
   * Covers model docPermissions (including pre-write/helper/owning-parent stages),
   * virtual getters, model/data decorate/decorateAll, service output decorators,
   * and data request-field selection/trimming stages. Other guards, row/ID filters,
   * model field-rule callbacks and write lifecycle hooks are outside this pool.
   *
   * A hook may await nested services, even at 1: descendants reuse its chain,
   * with ONE immediate child branch admitted per frame, FIFO through descendant
   * settlement. Promise.all sibling hooks serialize within that chain. Waiting
   * ancestors are additional callback frames, NOT additional permits; this is
   * not a bound on all unsettled callbacks/orchestration promises. Reentrant
   * admission is capped at 64 scopes per chain (including internal wrappers);
   * overflow rejects through the existing hook failure policy. A settled scope
   * closes to reentry and drains queued children before releasing; detached late
   * continuations reacquire root admission. Await hook work; avoid cross-branch
   * dependency cycles. Root and per-frame child queues each transfer permits FIFO.
   *
   * Captured with maxBulkConcurrency on first request/runtime work-state use.
   * Per-call row/traversal maps preserve input/output association independently
   * of completion order. Hooks/orchestration hold no persistence permits. Trusted
   * direct DB/network fan-out and query totals are not bounded by these pools;
   * neither is a process-wide connection limit or an N+1 batching mechanism.
   */
  maxHookConcurrency?: number;
  /** Cumulative correlated target executions per request/runtime (default 100); permit release does not refund this budget. */
  maxCorrelatedQueries?: number;
  /** Correlated template nesting bound (default 5), independent of persistence concurrency. */
  maxCorrelatedDepth?: number;
}

export const defaultRequestComplexity: Required<RequestComplexityOptions> = {
  maxDepth: 8,
  maxNodes: 500,
  maxLogicalClauses: 50,
  maxInValues: 100,
  maxBulkItems: 100,
  maxIncludeCount: 10,
  maxSubQueryCount: 10,
  maxBulkConcurrency: 10,
  maxHookConcurrency: 10,
  maxCorrelatedQueries: 100,
  maxCorrelatedDepth: 5,
};

type ComplexityScope = 'request' | 'filter';

const normalizePositiveInteger = (value: unknown, fallback: number) => {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
};

export const resolveRequestComplexity = (
  options?: RequestComplexityOptions | null,
): Required<RequestComplexityOptions> => ({
  maxDepth: normalizePositiveInteger(options?.maxDepth, defaultRequestComplexity.maxDepth),
  maxNodes: normalizePositiveInteger(options?.maxNodes, defaultRequestComplexity.maxNodes),
  maxLogicalClauses: normalizePositiveInteger(options?.maxLogicalClauses, defaultRequestComplexity.maxLogicalClauses),
  maxInValues: normalizePositiveInteger(options?.maxInValues, defaultRequestComplexity.maxInValues),
  maxBulkItems: normalizePositiveInteger(options?.maxBulkItems, defaultRequestComplexity.maxBulkItems),
  maxIncludeCount: normalizePositiveInteger(options?.maxIncludeCount, defaultRequestComplexity.maxIncludeCount),
  maxSubQueryCount: normalizePositiveInteger(options?.maxSubQueryCount, defaultRequestComplexity.maxSubQueryCount),
  maxBulkConcurrency: normalizePositiveInteger(
    options?.maxBulkConcurrency,
    defaultRequestComplexity.maxBulkConcurrency,
  ),
  maxHookConcurrency: normalizePositiveInteger(
    options?.maxHookConcurrency,
    defaultRequestComplexity.maxHookConcurrency,
  ),
  maxCorrelatedQueries: normalizePositiveInteger(
    options?.maxCorrelatedQueries,
    defaultRequestComplexity.maxCorrelatedQueries,
  ),
  maxCorrelatedDepth: normalizePositiveInteger(
    options?.maxCorrelatedDepth,
    defaultRequestComplexity.maxCorrelatedDepth,
  ),
});

export function validateRequestComplexity(
  value: unknown,
  options?: RequestComplexityOptions | null,
  scope: ComplexityScope = 'request',
): ValidationError[] {
  const limits = resolveRequestComplexity(options);
  const errors: ValidationError[] = [];
  let nodes = 0;
  let logicalClauses = 0;
  let includeCount = 0;
  let subQueryCount = 0;

  const pointer = (path: Array<string | number>) => (path.length === 0 ? '#' : `#/${path.join('/')}`);
  const pushError = (detail: string, path: Array<string | number>) => {
    if (errors.length === 0) {
      errors.push({ detail, pointer: pointer(path) });
    }
  };

  const visit = (current: unknown, path: Array<string | number>, depth: number, parentKey?: string) => {
    if (errors.length > 0) return;

    nodes += 1;
    if (nodes > limits.maxNodes) {
      pushError(`Request exceeds maximum node budget of ${limits.maxNodes}`, path);
      return;
    }

    if (depth > limits.maxDepth) {
      pushError(`Request exceeds maximum depth of ${limits.maxDepth}`, path);
      return;
    }

    if (isArray(current)) {
      if (parentKey === '$and' || parentKey === '$or' || parentKey === '$nor') {
        logicalClauses += current.length;
        if (logicalClauses > limits.maxLogicalClauses) {
          pushError(`Filter exceeds maximum logical clause budget of ${limits.maxLogicalClauses}`, path);
          return;
        }
      }

      if (parentKey === '$in') {
        if (current.length > limits.maxInValues) {
          pushError(`Filter exceeds maximum $in values of ${limits.maxInValues}`, path);
          return;
        }
      }

      for (let index = 0; index < current.length; index++) {
        visit(current[index], path.concat(index), depth + 1, parentKey);
        if (errors.length > 0) return;
      }

      return;
    }

    if (!isPlainObject(current)) return;

    for (const [key, child] of Object.entries(current)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        pushError(`Unsupported key: ${key}`, path.concat(key));
        return;
      }

      if (scope === 'request' && key === 'include') {
        includeCount += isArray(child) ? child.length : 1;
        if (includeCount > limits.maxIncludeCount) {
          pushError(`Request exceeds maximum include count of ${limits.maxIncludeCount}`, path.concat(key));
          return;
        }
      }

      if (key === '$$sq') {
        subQueryCount += 1;
        if (subQueryCount > limits.maxSubQueryCount) {
          pushError(`Request exceeds maximum subquery count of ${limits.maxSubQueryCount}`, path.concat(key));
          return;
        }
        // ARF-02: the $$sq payload is entirely client-supplied at validation
        // time. Recurse into it so nested depth, nodes, include count, nested
        // subqueries, collection limits, and dangerous keys are all bounded
        // before any target service work begins.
        visit(child, path.concat(key), depth + 1, key);
        if (errors.length > 0) return;
        continue;
      }

      visit(child, path.concat(key), depth + 1, key);
      if (errors.length > 0) return;
    }
  };

  visit(value, [], 0);
  return errors;
}
