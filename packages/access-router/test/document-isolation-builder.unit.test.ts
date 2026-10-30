import { mongo } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deepIsolateValue } from '../src/helpers/document';
import { attachPermissionsAlias } from '../src/output/permissions-alias';
import { legacyDeepIsolateValue as legacy } from './document-isolation.reference';

afterEach(() => vi.restoreAllMocks());

describe('PIPE-02 isolated record construction', () => {
  it('avoids per-key descriptor allocations without changing copies, aliases, cycles or metadata', () => {
    const shared = { value: 1, when: new Date(1), bytes: Buffer.from([1]), id: new mongo.BSON.ObjectId() };
    const source: Record<string, any> = {
      first: shared,
      second: shared,
      rows: [shared],
      _permissions: { owner: true },
    };
    source.self = source;
    attachPermissionsAlias(source, '_permissions');
    const define = vi.spyOn(Object, 'defineProperty');
    const before = legacy(source);
    const previous = define.mock.calls.length;
    define.mockClear();
    const after = deepIsolateValue(source);
    expect(define.mock.calls.length).toBeLessThan(previous);
    define.mockRestore();
    expect(after).toEqual(before);
    expect(after.first).toBe(after.second);
    expect(after.rows[0]).toBe(after.first);
    expect(after.self).toBe(after);
    expect(after.first).not.toBe(shared);
    expect(after.first.when).not.toBe(shared.when);
    expect(after.permissions).toBe(after._permissions);
  });

  it.each([false, true])('matches original getter/proxy/native/Map observations (flattenMaps=%s)', (flattenMaps) => {
    const run = (copy: typeof legacy) => {
      const events: string[] = [];
      const object = {
        first: 1,
        when: Object.assign(new Date(1), {
          getTime() {
            events.push('date');
            return 1;
          },
        }),
      };
      const value = new Proxy(object, {
        get(target, key, receiver) {
          events.push(`get:${String(key)}`);
          return Reflect.get(target, key, receiver);
        },
        getPrototypeOf(target) {
          events.push('prototype');
          return Reflect.getPrototypeOf(target);
        },
        ownKeys(target) {
          events.push('keys');
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, key) {
          events.push(`descriptor:${String(key)}`);
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      });
      const source = { value, shared: value, map: new Map([['x', value]]) };
      return { value: copy(source, new WeakMap(), flattenMaps), events };
    };
    expect(run(deepIsolateValue)).toEqual(run(legacy));
  });

  it('does not invoke inherited setters installed by a native callback during recursion', () => {
    const key = 'pipe02IsolationSetter';
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
    const setter = vi.fn(() => {
      throw new Error('must not run inherited setter');
    });
    try {
      const source = {
        [key]: Object.assign(new Date(1), {
          getTime() {
            Object.defineProperty(Object.prototype, key, { configurable: true, set: setter });
            return 1;
          },
        }),
      };
      expect(deepIsolateValue(source)[key]).toEqual(new Date(1));
      expect(setter).not.toHaveBeenCalled();
    } finally {
      if (previous) Object.defineProperty(Object.prototype, key, previous);
      else Reflect.deleteProperty(Object.prototype, key);
    }
  });

  it('retains definition fallback when a supplied cycle map lets native work replace the target prototype', () => {
    const run = (copy: typeof legacy) => {
      const seen = new WeakMap<object, unknown>();
      const has = vi.fn(() => {
        throw new Error('must not inspect a replaced prototype');
      });
      const prototype = new Proxy({}, { has });
      const source = {
        when: Object.assign(new Date(1), {
          getTime() {
            Object.setPrototypeOf(seen.get(source)!, prototype);
            return 1;
          },
        }),
      };
      const value = copy(source, seen);
      expect(Object.getPrototypeOf(value)).toBe(prototype);
      expect(value.when).toEqual(new Date(1));
      expect(has).not.toHaveBeenCalled();
    };
    run(legacy);
    run(deepIsolateValue);
  });

  it('keeps dangerous own keys inert data, null prototypes and non-enumerable source behavior', () => {
    const source = Object.create(null);
    for (const key of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty'])
      Object.defineProperty(source, key, { value: { safe: true }, enumerable: true });
    Object.defineProperty(source, 'hidden', { value: 1 });
    const value = deepIsolateValue(source);
    expect(value).toEqual(legacy(source));
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(value).not.toHaveProperty('hidden');
    expect(Object.getOwnPropertyDescriptor(value, '__proto__')?.value).toEqual({ safe: true });
  });
});
