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
   * Not a process-wide connection limit or protection against competing edits.
   */
  maxBulkConcurrency?: number;
  /**
   * Defaults to 10. Per-request/per-runtime ceiling on concurrently awaited
   * virtual-getter + row-finalization orchestration work (VIRT-00A D7), NOT a
   * per-row multiplier and NOT leaf persistence admission. Top-level lists
   * finalize rows through ONE bounded map with a shared hook gate held only
   * for getter bodies (stable index-keyed order regardless of completion
   * order), so peak active getter work stays at or below this limit — never
   * `rows × getters`. Nested include/populate/embedded work uses bounded
   * child maps with a finite bound derived from the same limit; recursion
   * depth is additionally bounded by `maxCorrelatedDepth` and the correlated
   * budgets. Recursive orchestration never holds leaf persistence permits
   * (`RequestConcurrencyScheduler.work`, which admits only leaf
   * adapter/document persistence ops) while awaiting descendants or hooks,
   * so limit-1 configurations complete. Trusted direct DB/network I/O issued
   * by virtual getters themselves runs outside the leaf persistence ceiling
   * (no dataloader/batching in v1). Not a process-wide connection limit.
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
