import { types } from 'node:util';
import { mongo } from 'mongoose';
import JsonRouter from '@web-ts-toolkit/express-json-router';
import { Codes } from '../enums';
import { readOwnedAuthorizationCatalogWork } from './field-catalog';
import type { ErrorResult } from '../interfaces/base';
import {
  createTrustedOutputBudget,
  materializeTrustedOutputValue,
  visitTrustedOutput,
  prepareTrustedOutputPayload,
  preloadTrustedOutputBudget,
} from './trusted-output-materialization';
import { currentOutputWorkLedger, outsideOutputWorkLedger } from './output-work-ledger';

/** Private controlled error; services can map `result`, helpers can throw it. */
export class ServiceAuthorizationError extends JsonRouter.clientErrors.BadRequestError {
  readonly result: ErrorResult<{ detail: string }>;

  constructor(detail: string) {
    const errors = [{ detail: `Service authorization: ${detail}` }];
    super('Bad Request', { errors });
    this.result = { success: false, kind: 'error', code: Codes.BadRequest, errors };
    Object.freeze(errors[0]);
    Object.freeze(errors);
    Object.freeze(this.result);
    Object.defineProperty(this, 'result', {
      value: this.result,
      enumerable: true,
      writable: false,
      configurable: false,
    });
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
 * unsupported objects/accessors/cycles fail closed. Private readers may reuse
 * call-owned values; mutable leaves need copying at application exposure boundaries
 * because Object.freeze alone cannot make Date/Buffer/BSON immutable.
 * Functions are retained only in package-captured configuration, never raw policy.
 */
export function copyAuthorizationValue<T>(value: T, configuration: boolean | 'document' = false): T {
  const active = new WeakSet<object>();
  const budget = createTrustedOutputBudget();
  function copy(input: unknown, depth: number): unknown {
    visitTrustedOutput(budget, depth);
    if (typeof input === 'function') {
      if (configuration === true) return input;
      authorizationError('functions are not policy values');
    }
    if (typeof input === 'symbol') authorizationError('symbols are not policy values');
    if (input === null || typeof input !== 'object') {
      if (typeof input === 'string') prepareTrustedOutputPayload(budget, input);
      return input;
    }
    if (types.isProxy(input)) authorizationError('proxy snapshot input');
    const ownedCatalog = configuration === true ? readOwnedAuthorizationCatalogWork(input) : undefined;
    if (ownedCatalog) {
      // Only fresh library-generated frozen primitive catalogs qualify. Charge
      // the exact omitted traversal in this SAME capture budget/depth owner;
      // arbitrary frozen objects/native leaves still detach normally below.
      preloadTrustedOutputBudget(budget, depth + ownedCatalog.depth, ownedCatalog.slots - 1);
      return input;
    }
    if (active.has(input)) authorizationError('cyclic input');
    active.add(input);
    try {
      if (input instanceof Date) {
        const time = outsideOutputWorkLedger(() => input.getTime());
        prepareTrustedOutputPayload(budget, 8);
        return outsideOutputWorkLedger(() => new Date(time));
      }
      if (Buffer.isBuffer(input)) {
        if (!currentOutputWorkLedger()) return Buffer.from(input);
        // Preserve Node's canonical valueOf/coercion behavior. This opaque API
        // may normalize to different storage; raw-state scanning cannot predict
        // it. Its RETURN is admitted before our explicit canonical byte copy.
        const normalized = outsideOutputWorkLedger(() => Buffer.from(input));
        return materializeTrustedOutputValue(normalized, '', budget, { keep: () => true }, depth, true);
      }
      if (input instanceof RegExp) {
        const result = outsideOutputWorkLedger(() => new RegExp(input.source, input.flags));
        result.lastIndex = input.lastIndex;
        return currentOutputWorkLedger()
          ? materializeTrustedOutputValue(result, '', budget, { keep: () => true }, depth, true)
          : result;
      }
      if (input instanceof mongo.BSON.BSONValue) {
        try {
          // Even canonical-looking BSON leaves may have wire hooks overridden
          // before this module loads. Import-time prototype identities are not a
          // trusted baseline for bypassing serialization's normalization/validation.
          return materializeTrustedOutputValue(
            input,
            '',
            budget,
            { keep: () => true, rejectProtectedKeys: true },
            depth,
            true,
          );
        } catch (error) {
          if (error instanceof ServiceAuthorizationError) throw error;
          authorizationError('unsupported BSON snapshot');
        }
      }
      if (configuration && input instanceof Map) {
        const result = new Map();
        for (const [key, entry] of Map.prototype.entries.call(input))
          result.set(copy(key, depth + 1), copy(entry, depth + 1));
        return result;
      }
      if (configuration && input instanceof Set) {
        const result = new Set();
        for (const entry of Set.prototype.values.call(input)) result.add(copy(entry, depth + 1));
        return result;
      }
      const array = Array.isArray(input);
      if (array && input.length > 20000) authorizationError('snapshot array exceeds structural limits');
      if (!array) authorizationRecord(input, 'snapshot');
      const result: Record<string, unknown> | unknown[] = array ? [] : {};
      let definedProperty = false;
      for (const key of Reflect.ownKeys(input)) {
        if (array && key === 'length') continue;
        if (typeof key !== 'string' || unsafeKeys.has(key)) authorizationError('unsafe snapshot key');
        prepareTrustedOutputPayload(budget, key);
        if (array && !/^(0|[1-9]\d*)$/.test(key)) authorizationError('invalid array property');
        const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
        if (!('value' in descriptor) || (!descriptor.enumerable && configuration !== 'document'))
          authorizationError('accessor/non-enumerable input');
        const value = copy(descriptor.value, depth + 1);
        // The result starts as a private ordinary object, never a proxy. Check AFTER
        // recursively copying: native hooks can install inherited setters while
        // normalizing the value. An absent key can then be assigned without any
        // application execution; inherited keys retain CreateDataProperty behavior.
        // Arrays keep their original sparse/index/length definition semantics.
        // A replaced defineProperty could expose the target on the fallback path;
        // only then must later keys also re-prove its unchanged ordinary prototype.
        if (array || (definedProperty && Object.getPrototypeOf(result) !== Object.prototype) || key in result) {
          definedProperty = true;
          Object.defineProperty(result, key, {
            value,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        } else (result as Record<string, unknown>)[key] = value;
      }
      if (array) (result as unknown[]).length = (input as unknown[]).length;
      return Object.freeze(result);
    } finally {
      active.delete(input);
    }
  }
  return copy(value, 0) as T;
}
