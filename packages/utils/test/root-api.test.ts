import { describe, expect, it } from 'vitest';

// Explicit `.ts` specifier per UTILS-10: this smoke test must execute
// TypeScript source even with ignored compiled `.js` siblings present.
import * as utils from '../src/index.ts';

/**
 * UTILS-10 requirement 2 (part 1): root API/runtime smoke check over source.
 * The packed-consumer harness in `utils.packed-consumer.test.ts` repeats the
 * export-surface assertion against the real installed artifact; this file
 * pins the source-side contract it must match.
 */
const expectedExportNames = [
  'addLeadingSlash',
  'arrayToRecord',
  'assign',
  'castArray',
  'cloneDeep',
  'compact',
  'difference',
  'eachRight',
  'filter',
  'find',
  'flatten',
  'flattenDeep',
  'forEach',
  'get',
  'groupBy',
  'hasOwn',
  'intersection',
  'intersectionBy',
  'isArray',
  'isBoolean',
  'isEmpty',
  'isEqual',
  'isFunction',
  'isMatch',
  'isNaN',
  'isNil',
  'isNumber',
  'isObject',
  'isPlainObject',
  'isPromise',
  'isString',
  'isUndefined',
  'join',
  'keys',
  'map',
  'mapKeys',
  'mapValues',
  'mapValuesAsync',
  'noop',
  'omit',
  'omitBy',
  'orderBy',
  'padEnd',
  'parseBooleanString',
  'pick',
  'pickBy',
  'normalizeUrlPath',
  'reduce',
  'removeConsecutiveSlashesFromUrl',
  'set',
  'startCase',
  'sum',
  'sumBy',
  'toAsyncFn',
  'toStringRecord',
  'uniq',
  'uniqBy',
  'upperCase',
].sort();

describe('UTILS-10 root API smoke (source)', () => {
  it('exposes exactly the documented named root exports with no default export', () => {
    expect(Object.keys(utils).sort()).toEqual(expectedExportNames);
    expect((utils as Record<string, unknown>).default).toBeUndefined();
    for (const name of expectedExportNames) {
      expect(typeof (utils as Record<string, unknown>)[name], name).toBe('function');
    }
  });

  it('exercises core root helpers at runtime', () => {
    expect(utils.get({ user: { profile: { name: 'Ada' } } }, 'user.profile.name')).toBe('Ada');
    expect(utils.hasOwn({ name: 'Ada' }, 'name')).toBe(true);
    expect(utils.hasOwn(Object.create({ name: 'Ada' }), 'name')).toBe(false);

    const target: Record<string, unknown> = {};
    expect(utils.set(target, 'a.b', 1)).toBe(target);
    expect(utils.get(target, 'a.b')).toBe(1);

    expect(
      utils.groupBy(
        [
          { type: 'fruit', name: 'apple' },
          { type: 'vegetable', name: 'carrot' },
          { type: 'fruit', name: 'banana' },
        ],
        'type',
      ),
    ).toEqual({
      fruit: [
        { type: 'fruit', name: 'apple' },
        { type: 'fruit', name: 'banana' },
      ],
      vegetable: [{ type: 'vegetable', name: 'carrot' }],
    });

    const original = { nested: { value: 1 } };
    const copy = utils.cloneDeep(original);
    expect(utils.isEqual(original, copy)).toBe(true);
    expect(copy).not.toBe(original);
    copy.nested.value = 2;
    expect(original.nested.value).toBe(1);

    expect(utils.flattenDeep([1, [2, [3]]])).toEqual([1, 2, 3]);
    expect(utils.sum([1, 2, 3])).toBe(6);
  });
});
