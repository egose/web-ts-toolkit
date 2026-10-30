import { isDeepStrictEqual } from 'node:util';
import { mongo } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyAuthorizationValue, ServiceAuthorizationError } from '../src/acl/authorization-snapshot';
import { legacyCopyAuthorizationValue as legacy } from './authorization-snapshot-copy.reference';

afterEach(() => vi.restoreAllMocks());

function outcome(copy: typeof legacy, source: unknown, mode: boolean | 'document') {
  try {
    return { value: copy(source, mode) };
  } catch (error) {
    if (!(error instanceof ServiceAuthorizationError)) throw error;
    return { errors: error.result.errors };
  }
}

describe('PIPE-02 observation-preserving snapshot record builder', () => {
  it('removes per-record-property descriptor materialization without dropping array definitions or freezes', () => {
    const value = {
      rows: [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ],
      meta: { visible: true },
    };
    const definitions = vi.spyOn(Object, 'defineProperty');
    const before = legacy(value, 'document');
    expect(definitions).toHaveBeenCalledTimes(9);
    definitions.mockClear();
    const after = copyAuthorizationValue(value, 'document');
    expect(definitions).toHaveBeenCalledTimes(2); // Sparse/numeric array semantics retain the old builder.
    expect(after).toEqual(before);
    expect([after, after.rows, ...after.rows, after.meta].every(Object.isFrozen)).toBe(true);
  });

  it('agrees with the independent original copier on 512 seeded graphs in all three modes', () => {
    const primitives = [null, undefined, false, true, NaN, -0, 12n, '雪'];
    for (let seed = 1; seed <= 512; seed++) {
      let state = seed;
      const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
      const aliases: unknown[] = [];
      function generate(depth: number): unknown {
        if (!depth || next() % 4 === 0) return primitives[next() % primitives.length];
        if (aliases.length && next() % 7 === 0) return aliases[next() % aliases.length];
        const array = next() % 2 === 0;
        const value = array ? Array(next() % 5) : Object.create(next() % 2 ? Object.prototype : null);
        for (let index = 0, length = array ? value.length : next() % 5; index < length; index++) {
          if (array && next() % 3 === 0) continue;
          Object.defineProperty(value, array ? String(index) : `field${index}`, {
            value: generate(depth - 1),
            enumerable: next() % 3 !== 0,
          });
        }
        aliases.push(value);
        return value;
      }
      const source = generate(4);
      for (const mode of [false, true, 'document'] as const)
        expect(outcome(copyAuthorizationValue, source, mode)).toEqual(outcome(legacy, source, mode));
    }
  });

  it('does not invoke inherited setters and publishes normal-prototype frozen data properties', () => {
    const key = 'pipe02InheritedSetter';
    const setter = vi.fn(() => {
      throw new Error('inherited setter must not run');
    });
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
    try {
      Object.defineProperty(Object.prototype, key, { configurable: true, set: setter });
      const source = Object.defineProperty(Object.create(null), key, { value: { nested: 1 }, enumerable: true });
      const value = copyAuthorizationValue(source, 'document');
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
      expect(Object.getOwnPropertyDescriptor(value, key)).toEqual({
        value: { nested: 1 },
        enumerable: true,
        writable: false,
        configurable: false,
      });
      expect(setter).not.toHaveBeenCalled();
    } finally {
      if (previous) Object.defineProperty(Object.prototype, key, previous);
      else Reflect.deleteProperty(Object.prototype, key);
    }
  });

  it('rechecks inherited keys after native normalization installs a setter', () => {
    const key = 'pipe02DuringNormalization';
    const setter = vi.fn(() => {
      throw new Error('new inherited setter must not run');
    });
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
    try {
      const native = Object.assign(new mongo.BSON.ObjectId(), {
        toBSON() {
          Object.defineProperty(Object.prototype, key, { configurable: true, set: setter });
          return 'normalized';
        },
      });
      const source = { [key]: native };
      const value = copyAuthorizationValue(source, 'document');
      expect(value[key]).toBe('normalized');
      expect(setter).not.toHaveBeenCalled();
      expect(Object.getOwnPropertyDescriptor(value, key)).toEqual({
        value: 'normalized',
        enumerable: true,
        writable: false,
        configurable: false,
      });
    } finally {
      if (previous) Object.defineProperty(Object.prototype, key, previous);
      else Reflect.deleteProperty(Object.prototype, key);
    }
  });

  it('does not traverse a target prototype replaced during recursive native work', () => {
    const run = (copy: typeof legacy) => {
      let target: object | undefined;
      const has = vi.fn(() => {
        throw new Error('must not inspect replaced prototype');
      });
      const prototype = new Proxy({}, { has });
      const define = Object.defineProperty;
      const spy = vi.spyOn(Object, 'defineProperty').mockImplementation((object, key, descriptor) => {
        if (key === 'toString') target = object;
        return define(object, key, descriptor);
      });
      try {
        const source = {
          toString: 'data',
          when: Object.assign(new Date(1), {
            getTime() {
              Object.setPrototypeOf(target!, prototype);
              return 1;
            },
          }),
        };
        const value = copy(source, 'document');
        expect(Object.getPrototypeOf(value)).toBe(prototype);
        expect(Object.getOwnPropertyDescriptor(value, 'when')?.value).toEqual(new Date(1));
        expect(has).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    };
    run(legacy);
    run(copyAuthorizationValue);
  });

  it.each([false, true, 'document'] as const)('retains wire/native/proxy observation order in mode %s', (mode) => {
    const run = (copy: typeof legacy) => {
      const events: string[] = [];
      const source: Record<string, unknown> = { first: 'before' };
      source.date = Object.assign(new Date(1), {
        getTime() {
          events.push('date');
          return 1;
        },
      });
      source.native = Object.assign(new mongo.BSON.ObjectId('0123456789abcdef01234567'), {
        toBSON() {
          events.push('wire');
          source.first = 'changed';
          source.later = 'changed later';
          return 'normalized';
        },
      });
      source.proxy = new Proxy(
        { value: 1 },
        {
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
        },
      );
      source.later = 'before';
      return { result: outcome(copy, source, mode), events, final: source.first };
    };
    expect(run(copyAuthorizationValue)).toEqual(run(legacy));
  });

  it('keeps independent aliases, mutable leaves, Map/Set normalization and configuration functions', () => {
    const shared = { when: new Date(1), bytes: Buffer.from([1]), id: new mongo.BSON.ObjectId() };
    const fn = () => true;
    const source = { first: shared, second: shared, map: new Map([[shared, shared]]), set: new Set([shared]), fn };
    const value = copyAuthorizationValue(source, true);
    expect(isDeepStrictEqual(value, legacy(source, true))).toBe(true);
    expect(value.first).not.toBe(value.second);
    expect(value.first.when).not.toBe(value.second.when);
    expect(value.fn).toBe(fn);
    value.first.when.setTime(9);
    value.first.bytes[0] = 9;
    expect(value.second.when.getTime()).toBe(1);
    expect(value.second.bytes[0]).toBe(1);
    expect(shared.when.getTime()).toBe(1);
  });
});
