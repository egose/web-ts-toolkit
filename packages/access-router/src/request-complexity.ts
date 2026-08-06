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
  maxBulkConcurrency?: number;
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
        continue;
      }

      visit(child, path.concat(key), depth + 1, key);
      if (errors.length > 0) return;
    }
  };

  visit(value, [], 0);
  return errors;
}
