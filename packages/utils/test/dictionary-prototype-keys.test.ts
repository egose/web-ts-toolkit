import { describe, expect, it } from 'vitest';

import arrayToRecord from '../src/arrayToRecord.ts';
import groupBy from '../src/groupBy.ts';
import mapKeys from '../src/mapKeys.ts';
import mapValues from '../src/mapValues.ts';
import omitBy from '../src/omitBy.ts';
import pickBy from '../src/pickBy.ts';
import toStringRecord from '../src/toStringRecord.ts';

const SPECIAL_KEYS = ['__proto__', 'constructor', 'prototype', 'toString'];

function expectOwnResult(result: Record<string, unknown>) {
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
}

describe('UTILS-01 dictionary prototype keys', () => {
  it('groupBy array accepts prototype-named groups as own properties', () => {
    const input = ['__proto__', 'constructor', 'prototype', 'toString', 'a', '__proto__'];
    const result = groupBy(input, (value) => value);
    expectOwnResult(result);
    for (const key of SPECIAL_KEYS) {
      expect(Object.hasOwn(result, key)).toBe(true);
    }
    expect(result['__proto__']).toEqual(['__proto__', '__proto__']);
    expect(result['constructor']).toEqual(['constructor']);
    expect(result['prototype']).toEqual(['prototype']);
    expect(result['toString']).toEqual(['toString']);
    expect(result['a']).toEqual(['a']);
  });

  it('groupBy record accepts prototype-named groups and preserves ordering', () => {
    const collection = JSON.parse('{"k1":"__proto__","k2":"constructor","k3":"a","k4":"__proto__"}');
    const visits: string[] = [];
    const result = groupBy(collection, (value, key) => {
      visits.push(String(key));
      return value;
    });
    expect(visits).toEqual(['k1', 'k2', 'k3', 'k4']);
    expectOwnResult(result);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.hasOwn(result, 'constructor')).toBe(true);
    expect(result['__proto__']).toEqual(['__proto__', '__proto__']);
  });

  it('arrayToRecord preserves __proto__ as own data property', () => {
    const result = arrayToRecord(['__proto__', 'constructor', 'a']);
    expectOwnResult(result);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.hasOwn(result, 'constructor')).toBe(true);
    expect(result['__proto__']).toBe(true);
    expect(result['constructor']).toBe(true);
    expect(result['a']).toBe(true);
  });

  it('mapKeys preserves object-valued mapped __proto__ without replacing prototype', () => {
    const input = JSON.parse('{"a":{"polluted":false},"b":1}');
    const result = mapKeys(input, (_value, key) => (key === 'a' ? '__proto__' : key));
    expectOwnResult(result);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(result['__proto__']).toEqual({ polluted: false });
    expect(Object.hasOwn(input, 'a')).toBe(true);
    expect(Object.hasOwn(input, '__proto__')).toBe(false);
  });

  it('mapKeys preserves callback ordering and duplicate-key overwrite', () => {
    const input = { a: 1, b: 2 };
    const visits: string[] = [];
    const result = mapKeys(input, (value, key, obj) => {
      visits.push(`${key}:${value}`);
      expect(obj).toBe(input);
      return 'same';
    });
    expect(visits).toEqual(['a:1', 'b:2']);
    expect(result).toEqual({ same: 2 });
  });

  it('mapValues preserves own __proto__ with object values and does not mutate input', () => {
    const input = JSON.parse('{"__proto__":{"x":1},"a":2}');
    const result = mapValues(input, (value) => value);
    expectOwnResult(result);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(result['__proto__']).toEqual({ x: 1 });
    expect(result['a']).toBe(2);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(input, '__proto__')).toBe(true);
    expect(input['a']).toBe(2);
  });

  it('pickBy preserves selected own keys including __proto__', () => {
    const input = JSON.parse('{"__proto__":1,"a":2,"b":3}');
    const result = pickBy(input, (value) => value !== 3);
    expectOwnResult(result);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.hasOwn(result, 'a')).toBe(true);
    expect(Object.hasOwn(result, 'b')).toBe(false);
    expect(result['__proto__']).toBe(1);
    expect(Object.hasOwn(input, 'b')).toBe(true);
  });

  it('omitBy preserves kept own keys including object-valued __proto__', () => {
    const input = JSON.parse('{"__proto__":{"x":1},"a":2,"drop":3}');
    const result = omitBy(input, (_value, key) => key === 'drop');
    expectOwnResult(result);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(result['__proto__']).toEqual({ x: 1 });
    expect(Object.hasOwn(result, 'a')).toBe(true);
    expect(Object.hasOwn(result, 'drop')).toBe(false);
    expect(Object.hasOwn(input, 'drop')).toBe(true);
  });

  it('toStringRecord preserves __proto__ as own string property', () => {
    const input = JSON.parse('{"__proto__":1,"a":2}');
    const result = toStringRecord(input);
    expect(result).toBeDefined();
    expectOwnResult(result as Record<string, unknown>);
    expect(Object.hasOwn(result as Record<string, unknown>, '__proto__')).toBe(true);
    expect((result as Record<string, string>)['__proto__']).toBe('1');
    expect((result as Record<string, string>)['a']).toBe('2');
    expect(Object.hasOwn(input, '__proto__')).toBe(true);
  });
});
