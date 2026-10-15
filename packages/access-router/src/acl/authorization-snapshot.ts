import { isDeepStrictEqual } from 'node:util';
import { mongo } from 'mongoose';
import JsonRouter from '@web-ts-toolkit/express-json-router';
import { Codes } from '../enums';
import type { ErrorResult } from '../interfaces/base';

/** Private controlled error; services can map `result`, helpers can throw it. */
export class ServiceAuthorizationError extends JsonRouter.clientErrors.BadRequestError {
  readonly result: ErrorResult<{ detail: string }>;

  constructor(detail: string) {
    const errors = [{ detail: `Service authorization: ${detail}` }];
    super('Bad Request', { errors });
    this.result = { success: false, kind: 'error', code: Codes.BadRequest, errors };
  }
}

export function authorizationError(detail: string): never {
  throw new ServiceAuthorizationError(detail);
}

const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);

export function authorizationRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    authorizationError(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Authority never aliases application values. Unlike general deep-clone helpers,
 * unsupported objects/accessors/cycles fail closed. Mutable leaf values are copied
 * again on reads: Object.freeze alone cannot make Date/Buffer/BSON immutable.
 * Functions are retained only in package-captured configuration, never raw policy.
 */
export function copyAuthorizationValue<T>(value: T, configuration: boolean | 'document' = false): T {
  const active = new WeakSet<object>();
  let nodes = 0;
  function copy(input: unknown, depth: number): unknown {
    if (++nodes > 20000 || depth > 100) authorizationError('snapshot exceeds structural limits');
    if (typeof input === 'function') {
      if (configuration === true) return input;
      authorizationError('functions are not policy values');
    }
    if (typeof input === 'symbol') authorizationError('symbols are not policy values');
    if (input === null || typeof input !== 'object') return input;
    if (active.has(input)) authorizationError('cyclic input');
    active.add(input);
    try {
      if (input instanceof Date) return new Date(input.getTime());
      if (Buffer.isBuffer(input)) return Buffer.from(input);
      if (input instanceof RegExp) {
        const result = new RegExp(input.source, input.flags);
        result.lastIndex = input.lastIndex;
        return result;
      }
      if (input instanceof mongo.BSON.BSONValue) {
        try {
          return mongo.BSON.deserialize(mongo.BSON.serialize({ value: input }), {
            promoteValues: false,
            bsonRegExp: true,
          }).value;
        } catch {
          authorizationError('unsupported BSON snapshot');
        }
      }
      if (configuration && input instanceof Map) {
        return new Map([...input].map(([key, entry]) => [copy(key, depth + 1), copy(entry, depth + 1)]));
      }
      if (configuration && input instanceof Set) return new Set([...input].map((entry) => copy(entry, depth + 1)));
      const array = Array.isArray(input);
      if (array && input.length > 20000) authorizationError('snapshot array exceeds structural limits');
      if (!array) authorizationRecord(input, 'snapshot');
      const result: Record<string, unknown> | unknown[] = array ? [] : {};
      for (const key of Reflect.ownKeys(input)) {
        if (array && key === 'length') continue;
        if (typeof key !== 'string' || unsafeKeys.has(key)) authorizationError('unsafe snapshot key');
        if (array && !/^(0|[1-9]\d*)$/.test(key)) authorizationError('invalid array property');
        const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
        if (!('value' in descriptor) || (!descriptor.enumerable && configuration !== 'document'))
          authorizationError('accessor/non-enumerable input');
        Object.defineProperty(result, key, {
          value: copy(descriptor.value, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      if (array) (result as unknown[]).length = (input as unknown[]).length;
      return Object.freeze(result);
    } finally {
      active.delete(input);
    }
  }
  return copy(value, 0) as T;
}

export function matchesAuthorizationSnapshot(value: unknown, snapshot: unknown): boolean {
  try {
    return isDeepStrictEqual(copyAuthorizationValue(value, 'document'), snapshot);
  } catch {
    return false;
  }
}

/** Exact graph identities supplement value checks (equal replacement is not provenance). */
export function outputIdentities(value: object): readonly object[] {
  const result: object[] = [];
  const seen = new WeakSet<object>();
  function visit(input: unknown): void {
    if (!input || typeof input !== 'object' || seen.has(input)) return;
    seen.add(input);
    result.push(input);
    if (input instanceof Map) {
      for (const [key, entry] of input) {
        visit(key);
        visit(entry);
      }
    } else if (input instanceof Set) {
      for (const entry of input) visit(entry);
    } else if (
      Array.isArray(input) ||
      Object.getPrototypeOf(input) === Object.prototype ||
      Object.getPrototypeOf(input) === null
    ) {
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(input))) {
        if ('value' in descriptor) visit(descriptor.value);
      }
    }
  }
  visit(value);
  return Object.freeze(result);
}
