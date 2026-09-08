import { describe, expect, it } from 'vitest';

import { deletePath, getPath, hasPath } from '../src/_internal.ts';
import omit from '../src/omit.ts';
import pick from '../src/pick.ts';
import set from '../src/set.ts';

describe('UTILS-02 inherited container safety', () => {
  it('shadows an inherited object container instead of mutating the ancestor', () => {
    const ancestor = { shared: { n: 1 } };
    const target = Object.create(ancestor);

    const returned = set(target, 'shared.n', 2);

    expect(returned).toBe(target);
    expect(ancestor.shared).toEqual({ n: 1 });
    expect(Object.prototype.hasOwnProperty.call(target, 'shared')).toBe(true);
    expect((target as Record<string, { n: number }>).shared).toEqual({ n: 2 });
  });

  it('leaves an inherited function container unmodified and creates an own object', () => {
    const sharedFn = Object.assign(() => {}, { n: 1 });
    const ancestor = { shared: sharedFn };
    const target = Object.create(ancestor);

    set(target, 'shared.n', 2);

    expect((ancestor.shared as unknown as Record<string, unknown>).n).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(sharedFn, 'n')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(target, 'shared')).toBe(true);
    expect((target as Record<string, unknown>).shared).toEqual({ n: 2 });
  });

  it('shadows an inherited primitive with an own container', () => {
    const ancestor = { shared: 1 };
    const target: Record<string, unknown> = Object.create(ancestor);

    set(target, 'shared.n', 2);

    expect(ancestor.shared).toBe(1);
    expect(target.shared).toEqual({ n: 2 });
  });

  it('bypasses inherited setters when shadowing intermediate and leaf segments', () => {
    let setterCalls = 0;
    const ancestor = {};
    Object.defineProperty(ancestor, 'shared', {
      configurable: true,
      enumerable: true,
      get() {
        return { n: 1 };
      },
      set() {
        setterCalls += 1;
      },
    });
    const target = Object.create(ancestor);

    set(target, 'shared.n', 2);

    expect(setterCalls).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(target, 'shared')).toBe(true);
    expect((target as Record<string, { n: number }>).shared).toEqual({ n: 2 });
  });

  it('does not delete ancestor state through an inherited container', () => {
    const ancestor = { shared: { n: 1, keep: true } };
    const target = Object.create(ancestor);

    deletePath(target, 'shared.n');

    expect(ancestor.shared).toEqual({ n: 1, keep: true });
    expect(Object.prototype.hasOwnProperty.call(target, 'shared')).toBe(false);
  });

  it('leaves ancestor state intact when omitting an inherited path', () => {
    const ancestor = { shared: { n: 1 } };
    const input = Object.create(ancestor);
    (input as Record<string, unknown>).own = 'kept';

    const result = omit(input, ['shared.n']);

    expect(ancestor.shared).toEqual({ n: 1 });
    expect((result as Record<string, unknown>).own).toBe('kept');
  });

  it('copies inherited values into an own pick result without mutating the ancestor', () => {
    const ancestor = { shared: { n: 1 } };
    const input = Object.create(ancestor);

    const result = pick(input, ['shared.n']);

    expect(result).toEqual({ shared: { n: 1 } });
    expect(Object.prototype.hasOwnProperty.call(result, 'shared')).toBe(true);
    expect(ancestor.shared).toBeDefined();
    expect(ancestor.shared).toEqual({ n: 1 });
  });

  it('preserves normal own-object and array paths and returns the target', () => {
    const target: Record<string, unknown> = { a: { b: 1 }, list: [{ v: 1 }] };

    const returned = set(target, 'a.c', 2);
    expect(returned).toBe(target);
    expect(target.a).toEqual({ b: 1, c: 2 });

    set(target, 'list[0].v', 9);
    expect((target.list as Array<Record<string, unknown>>)[0]).toEqual({ v: 9 });

    set(target, 'fresh[0].name', 'x');
    expect(target.fresh).toEqual([{ name: 'x' }]);
  });

  it('creates no mutation before a rejected reserved path', () => {
    const target: Record<string, unknown> = {};

    set(target, ['safe', '__proto__', 'polluted'], true);
    set(target, 'other.constructor.prototype.polluted', true);

    expect(target).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(target, 'safe')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(target, 'other')).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('preserves inherited reads while writes stay owned', () => {
    const ancestor = { shared: { n: 1 } };
    const target = Object.create(ancestor);

    expect(pick(target, ['missing.path'])).toEqual({});
    // Read inheritance is unchanged: has/get still observe the prototype.
    expect(hasPath(target, 'shared.n')).toBe(true);
    expect(getPath(target, 'shared.n')).toBe(1);
  });
});
