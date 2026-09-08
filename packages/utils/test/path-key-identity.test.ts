import { describe, expect, it } from 'vitest';

import { toPath } from '../src/_internal.ts';
import get from '../src/get.ts';
import omit from '../src/omit.ts';
import pick from '../src/pick.ts';
import set from '../src/set.ts';

const hugeKey = '9007199254740993'; // 2**53 + 1, beyond MAX_SAFE_INTEGER
const hugeNeighbor = '9007199254740992';

describe('UTILS-03 exact path key identity', () => {
  it('keeps literal digit strings distinct from their numeric values', () => {
    expect(toPath(['01'])).toEqual(['01']);
    expect(get({ '01': 'correct', '1': 'wrong' }, ['01'])).toBe('correct');
    expect(get({ '01': 'correct', '1': 'wrong' }, ['1'])).toBe('wrong');
  });

  it('never rounds digit keys beyond MAX_SAFE_INTEGER', () => {
    expect(toPath([hugeKey])).toEqual([hugeKey]);
    const input = { [hugeKey]: 'exact', [hugeNeighbor]: 'neighbor' };

    expect(get(input, [hugeKey])).toBe('exact');
    expect(get(input, [hugeNeighbor])).toBe('neighbor');

    const target: Record<string, unknown> = {};
    set(target, [hugeKey], 'v');
    expect(Object.prototype.hasOwnProperty.call(target, hugeKey)).toBe(true);
    expect(get(target, [hugeKey])).toBe('v');
    expect(Object.prototype.hasOwnProperty.call(target, hugeNeighbor)).toBe(false);
  });

  it('addresses quoted digit keys literally', () => {
    const input = { a: { '01': 'quoted', '1': 'bare' } };

    expect(get(input, 'a["01"]')).toBe('quoted');
    expect(get(input, "a['01']")).toBe('quoted');
    expect(get(input, 'a["1"]')).toBe('bare');

    const target: Record<string, unknown> = {};
    set(target, 'a["01"]', 1);
    expect((target.a as Record<string, unknown>)['01']).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(target.a, '1')).toBe(false);
  });

  it('round-trips equivalent supported forms without collisions', () => {
    const input = { a: [{ b: 'indexed' }], '01': 'top' };

    expect(get(input, 'a[0].b')).toBe('indexed');
    expect(get(input, 'a["0"].b')).toBe('indexed');
    expect(get(input, ['a', '0', 'b'])).toBe('indexed');
    expect(get(input, ['a', 0, 'b'])).toBe('indexed');

    const viaString: Record<string, unknown> = {};
    set(viaString, 'a[0].b', 'x');
    const viaSegments: Record<string, unknown> = {};
    set(viaSegments, ['a', 0, 'b'], 'x');
    expect(viaSegments).toEqual(viaString);
    expect(get(viaString, 'a["0"].b')).toBe('x');

    // Leading-zero literal never touches the canonical sibling.
    const literal: Record<string, unknown> = { a: { '1': 'keep' } };
    set(literal, 'a["01"]', 'new');
    expect((literal.a as Record<string, unknown>)['01']).toBe('new');
    expect((literal.a as Record<string, unknown>)['1']).toBe('keep');
  });

  it('creates arrays for canonical indices but objects for leading-zero keys', () => {
    const target: Record<string, unknown> = {};
    set(target, 'fresh[0].name', 'x');
    expect(Array.isArray(target.fresh)).toBe(true);
    expect(target.fresh).toEqual([{ name: 'x' }]);

    const byNumber: Record<string, unknown> = {};
    set(byNumber, ['fresh', 0, 'name'], 'x');
    expect(byNumber).toEqual(target);

    const padded: Record<string, unknown> = {};
    set(padded, 'a[01]', 'v');
    expect(Array.isArray(padded.a)).toBe(false);
    expect(padded.a).toEqual({ '01': 'v' });
  });

  it('keeps pick/omit flat-list behavior and supports nested single paths', () => {
    const input = { a: { '01': 1, keep: 2 }, b: 3 };

    // Flat arrays remain a LIST of paths (shipped behavior, now documented).
    expect(pick(input, ['a', 'b'])).toEqual({ a: { '01': 1, keep: 2 }, b: 3 });
    // A nested array addresses one segmented path.
    expect(pick(input, [['a', '01']])).toEqual({ a: { '01': 1 } });
    expect(pick(input, ['a["01"]'])).toEqual({ a: { '01': 1 } });

    expect(omit(input, [['a', '01']])).toEqual({ a: { keep: 2 }, b: 3 });
    expect(omit(input, ['a["01"]'])).toEqual({ a: { keep: 2 }, b: 3 });
    expect(omit({ '01': 1, '1': 2 }, ['01'])).toEqual({ '1': 2 });
  });

  it('rejects reserved segments before mutation, including quoted forms', () => {
    const target: Record<string, unknown> = { '01': 'keep' };

    set(target, ['01', '__proto__', 'polluted'], true);
    set(target, 'a["__proto__"].polluted', true);
    set(target, 'other.constructor.prototype.polluted', true);

    expect(target).toEqual({ '01': 'keep' });
    expect(Object.prototype.hasOwnProperty.call(target, 'a')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(target, 'other')).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('treats empty paths as whole-root reads and mutation no-ops', () => {
    const input = { a: 1 };
    expect(toPath('')).toEqual([]);
    expect(get(input, '')).toBe(input);

    const target: Record<string, unknown> = { a: 1 };
    set(target, '', { hacked: true });
    expect(target).toEqual({ a: 1 });
  });
});
