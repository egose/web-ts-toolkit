import { describe, expect, it } from 'vitest';

import { copyAndDepopulate } from '../dist/processors.mjs';

describe('processors/copyAndDepopulate path hardening (AR-21)', () => {
  describe('malformed or missing intermediates are safe no-ops', () => {
    it('treats a missing intermediate path as a no-op without throwing', () => {
      const data = { a: 1 } as { a: number; x?: unknown };
      expect(copyAndDepopulate(data, [{ src: 'missing.path', dest: 'x' }])).toEqual({ a: 1 });
    });

    it('treats a null intermediate as a no-op without throwing', () => {
      const data = { a: null } as { a: null; x?: unknown };
      expect(copyAndDepopulate(data, [{ src: 'a.b', dest: 'x' }])).toEqual({ a: null });
    });

    it('treats a scalar intermediate (string in src) as a no-op', () => {
      const data = { a: 'scalar' } as { a: unknown; x?: unknown };
      expect(copyAndDepopulate(data, [{ src: 'a.b', dest: 'x' }])).toEqual({ a: 'scalar' });
    });

    it('returns the input object when no operations apply (mutable default)', () => {
      const data = { a: 1 };
      expect(copyAndDepopulate(data, [{ src: 'missing.path', dest: 'x' }])).toBe(data);
    });

    it('returns a distinct object (cloned) in immutable mode even when all ops are no-ops', () => {
      const data = { a: 1 };
      const result = copyAndDepopulate(data, [{ src: 'missing.path', dest: 'x' }], { mutable: false });
      expect(result).not.toBe(data);
      expect(result).toEqual({ a: 1 });
    });
  });

  describe('empty and missing operation fields are safe no-ops', () => {
    it('treats an empty src string as a no-op', () => {
      expect(copyAndDepopulate({ a: 1 } as { a: number; _a?: unknown }, [{ src: '', dest: '_a' }])).toEqual({ a: 1 });
    });

    it('treats an empty dest string as a no-op', () => {
      expect(copyAndDepopulate({ a: { _id: 1 } } as { a: unknown }, [{ src: 'a', dest: '' }])).toEqual({
        a: { _id: 1 },
      });
    });

    it('skips operations whose src/dest are not strings', () => {
      // Runtime calls into core.runTasks coerce args through castArray; protect
      // against malformed entries by treating non-string src/dest as no-ops
      // rather than throwing on property access. The accompanying scalar leaf
      // `a: 1` is itself a safe no-op so the document is left unchanged.
      expect(
        copyAndDepopulate({ a: 1 } as { a: number }, [
          { src: 'a', dest: '_a' },
          { src: null, dest: 'x' },
          { src: 'a', dest: 5 },
        ]),
      ).toEqual({ a: 1 });
    });
  });

  describe('scalar array entries cannot corrupt ids', () => {
    it('leaves a scalar primitive array in place (no null id corruption)', () => {
      const data = { list: [1, 2, 3] } as { list: number[]; _list?: unknown };
      const result = copyAndDepopulate(data, [{ src: 'list', dest: '_list' }]);
      expect(result).toEqual({ list: [1, 2, 3] });
      expect((result as { _list?: unknown })._list).toBeUndefined();
    });

    it('leaves a mixed (object + primitive) array in place to avoid partial depopulation', () => {
      const data = { items: [{ _id: 1 }, 2, { _id: 3 }] } as { items: unknown[]; _items?: unknown };
      const result = copyAndDepopulate(data, [{ src: 'items', dest: '_items' }]);
      expect(result.items).toEqual([{ _id: 1 }, 2, { _id: 3 }]);
    });

    it('depopulates a fully-populated record array into its id array', () => {
      const result = copyAndDepopulate({ items: [{ _id: 1 }, { _id: 2 }, { _id: 3 }] }, [
        { src: 'items', dest: '_items' },
      ]);
      expect(result).toEqual({
        items: [1, 2, 3],
        _items: [{ _id: 1 }, { _id: 2 }, { _id: 3 }],
      });
    });

    it('depopulates an empty array to an empty id array (preserves empty-list signal)', () => {
      const result = copyAndDepopulate({ items: [] as Array<{ _id: number }> }, [{ src: 'items', dest: '_items' }]);
      expect(result).toEqual({ items: [], _items: [] });
    });
  });

  describe('missing id fields produce descriptive errors instead of silent undefined ids', () => {
    it('throws a descriptive error when an array record is missing the id field', () => {
      expect(() =>
        copyAndDepopulate({ items: [{ name: 'a' }, { name: 'b' }] }, [{ src: 'items', dest: '_items' }]),
      ).toThrowError(/items\[0\].*missing the configured id field/);
    });

    it('throws a descriptive error when the object leaf is missing the id field', () => {
      expect(() =>
        copyAndDepopulate({ pear: { name: 'a' } } as { pear: unknown }, [{ src: 'pear', dest: '_pear' }]),
      ).toThrowError(/path 'pear'.*missing the configured id field/);
    });

    it('honors the configured idField when checking for missing ids (empty string counts as a valid id, like 0)', () => {
      const result = copyAndDepopulate({ items: [{ _id: 1, name: '' }] }, [{ src: 'items', dest: '_items' }], {
        idField: 'name',
      });
      expect(result).toEqual({ items: [''], _items: [{ _id: 1, name: '' }] });
    });

    it('does not throw when an idField resolves to a falsy id value of 0', () => {
      const result = copyAndDepopulate({ items: [{ _id: 0, name: 'a' }] }, [{ src: 'items', dest: '_items' }]);
      expect(result).toEqual({ items: [0], _items: [{ _id: 0, name: 'a' }] });
    });
  });

  describe('prototype-like keys are rejected before any mutation', () => {
    it('rejects __proto__ in src with a descriptive error', () => {
      expect(() => copyAndDepopulate({}, [{ src: '__proto__', dest: '_p' }])).toThrowError(/refusing path '__proto__'/);
    });

    it('rejects constructor in src with a descriptive error even if set on the object', () => {
      const data = { constructor: { _id: 'c' } } as { constructor: unknown };
      expect(() => copyAndDepopulate(data, [{ src: 'constructor', dest: '_c' }])).toThrowError(
        /refusing path 'constructor'/,
      );
    });

    it('rejects prototype in src with a descriptive error', () => {
      expect(() => copyAndDepopulate({}, [{ src: 'prototype', dest: '_p' }])).toThrowError(/refusing path 'prototype'/);
    });

    it('rejects __proto__ in dest with a descriptive error', () => {
      expect(() => copyAndDepopulate({ a: { _id: 1 } }, [{ src: 'a', dest: '__proto__' }])).toThrowError(
        /refusing path '__proto__'/,
      );
    });

    it('rejects unsafe segments anywhere within a nested src path', () => {
      expect(() => copyAndDepopulate({ a: {} }, [{ src: 'a.b.__proto__', dest: 'x' }])).toThrowError(
        /refusing path 'a.b.__proto__'/,
      );
    });

    it('rejects unsafe segments anywhere within a nested dest path', () => {
      expect(() => copyAndDepopulate({ a: { _id: 1 } }, [{ src: 'a', dest: 'b.constructor.x' }])).toThrowError(
        /refusing path 'b.constructor.x'/,
      );
    });

    it('does not mutate Object.prototype when an attacker supplies a __proto__ destination', () => {
      expect(() => copyAndDepopulate({ a: { _id: 1 } }, [{ src: 'a', dest: '__proto__' }])).toThrow();
      expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    });
  });

  describe('mutable and immutable modes behave identically except for object identity', () => {
    it('mutates the input when mutable is true (default)', () => {
      const input = { a: { _id: 1, n: 'x' } };
      const result = copyAndDepopulate(input, [{ src: 'a', dest: '_a' }]);
      expect(result).toBe(input);
      expect(result).toEqual({ a: 1, _a: { _id: 1, n: 'x' } });
    });

    it('returns a clone (distinct identity) when mutable is false and leaves the input untouched', () => {
      const input = { a: { _id: 1, n: 'x' } };
      const result = copyAndDepopulate(input, [{ src: 'a', dest: '_a' }], { mutable: false });
      expect(result).not.toBe(input);
      expect(input).toEqual({ a: { _id: 1, n: 'x' } });
      expect(result).toEqual({ a: 1, _a: { _id: 1, n: 'x' } });
    });

    it('produces value-identical output in mutable and immutable modes', () => {
      const data = {
        pear: {
          _id: 'asdf',
          items: [
            { _id: 1, n: 'i1' },
            { _id: 2, n: 'i2' },
          ],
        },
      };
      const mutable = copyAndDepopulate(structuredClone(data), [{ src: 'pear.items', dest: '_items' }], {
        mutable: true,
      });
      const immutable = copyAndDepopulate(structuredClone(data), [{ src: 'pear.items', dest: '_items' }], {
        mutable: false,
      });
      expect(mutable).toEqual(immutable);
    });

    it('honors an explicit mutable: true the same as the default', () => {
      const input = { a: { _id: 1 } };
      const explicit = copyAndDepopulate(input, [{ src: 'a', dest: '_a' }], { mutable: true });
      expect(explicit).toBe(input);
    });
  });

  describe('overlapping operations are sequential and well-defined', () => {
    it('runs operations in input order; the second op sees the first op output', () => {
      // First op moves the populated object to `b` and replaces `a` with its id.
      // Second op then sees `a` is now a scalar (the id `1`) - so it is a no-op.
      const data = { a: { _id: 1, n: 'x' } };
      const result = copyAndDepopulate(data, [
        { src: 'a', dest: 'b' },
        { src: 'a', dest: 'c' },
      ]);
      expect(result).toEqual({ a: 1, b: { _id: 1, n: 'x' } });
    });

    it('chains the dest value into a second depopulate if a later op targets the relocated value', () => {
      const data = { a: { _id: 'one', nested: { _id: 'two', n: 'nested' } } };
      // Op 1: depopulate a.nested -> _nested, replaces nested with 'two'
      // Op 2: depopulate a (now { _id: 'one', nested: 'two' }, _nested: { two } ) -> _a
      const result = copyAndDepopulate(data, [
        { src: 'a.nested', dest: '_nested' },
        { src: 'a', dest: '_a' },
      ]);
      expect(result).toEqual({
        a: 'one',
        _a: { _id: 'one', nested: 'two', _nested: { _id: 'two', n: 'nested' } },
      });
    });
  });

  describe('documented default mutable and idField behavior', () => {
    it('defaults mutable to true when options is omitted', () => {
      const input = { a: { _id: 7 } };
      expect(copyAndDepopulate(input, [{ src: 'a', dest: '_a' }])).toBe(input);
    });

    it('defaults mutable to true when options is an empty object', () => {
      const input = { a: { _id: 7 } };
      expect(copyAndDepopulate(input, [{ src: 'a', dest: '_a' }], {})).toBe(input);
    });

    it('defaults idField to _id when options is omitted', () => {
      const result = copyAndDepopulate({ a: { _id: 'root', name: 'a' } }, [{ src: 'a', dest: '_a' }]);
      expect(result).toEqual({ a: 'root', _a: { _id: 'root', name: 'a' } });
    });

    it('honors a custom idField of name across both single-object and array leaves', () => {
      const result = copyAndDepopulate(
        { owner: { name: 'a' }, items: [{ name: 'x' }, { name: 'y' }] },
        [
          { src: 'owner', dest: '_owner' },
          { src: 'items', dest: '_items' },
        ],
        { idField: 'name' },
      );
      expect(result).toEqual({
        owner: 'a',
        _owner: { name: 'a' },
        items: ['x', 'y'],
        _items: [{ name: 'x' }, { name: 'y' }],
      });
    });
  });

  describe('prototype integrity on real-world object shapes', () => {
    it('preserves a null-prototype object (Object.create(null)) after depopulation', () => {
      const plain = Object.create(null);
      plain.a = { _id: 1 };
      const result = copyAndDepopulate(plain, [{ src: 'a', dest: '_a' }]);
      expect(Object.getPrototypeOf(result)).toBeNull();
      expect(result).toEqual({ a: 1, _a: { _id: 1 } });
    });

    it('preserves Object.prototype on ordinary objects after depopulation', () => {
      const data = { a: { _id: 1 } };
      const result = copyAndDepopulate(data, [{ src: 'a.b', dest: 'x' }]);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    });
  });
});
