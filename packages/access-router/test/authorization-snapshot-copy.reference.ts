/** Independent pre-PIPE-02 copier: retain native observations, order and limits. */
import { mongo } from 'mongoose';
import { authorizationError, authorizationRecord } from '../src/acl/authorization-snapshot';

const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);

export function legacyCopyAuthorizationValue<T>(value: T, configuration: boolean | 'document' = false): T {
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
      if (configuration && input instanceof Map)
        return new Map([...input].map(([key, entry]) => [copy(key, depth + 1), copy(entry, depth + 1)]));
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
