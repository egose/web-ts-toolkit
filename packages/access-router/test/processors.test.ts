import { describe, expect, it } from 'vitest';

import { copyAndDepopulate } from '../dist/processors.mjs';

describe('processors', () => {
  it('copies a populated object before replacing it with its identifier', () => {
    const data = {
      apple: { _id: 'qwer', name: 'apple' },
      pear: { _id: 'asdf', name: 'pear' },
    };

    expect(copyAndDepopulate(data, [{ src: 'apple', dest: '_apple' }])).toEqual({
      apple: 'qwer',
      pear: { _id: 'asdf', name: 'pear' },
      _apple: { _id: 'qwer', name: 'apple' },
    });
  });

  it('supports immutable copies for nested arrays', () => {
    const data = {
      apple: { _id: 'qwer', name: 'apple' },
      pear: {
        _id: 'asdf',
        items: [
          { _id: 1, name: 'item1' },
          { _id: 2, name: 'item2' },
        ],
      },
    };

    const result = copyAndDepopulate(data, [{ src: 'pear.items', dest: '_items' }], { mutable: false });

    expect(result).not.toBe(data);
    expect(data.pear.items).toEqual([
      { _id: 1, name: 'item1' },
      { _id: 2, name: 'item2' },
    ]);
    expect(result).toEqual({
      apple: { _id: 'qwer', name: 'apple' },
      pear: {
        _id: 'asdf',
        items: [1, 2],
        _items: [
          { _id: 1, name: 'item1' },
          { _id: 2, name: 'item2' },
        ],
      },
    });
  });

  it('supports custom identifier fields when mutating nested collections', () => {
    const data = {
      pear: {
        _id: 'asdf',
        items: [
          {
            _id: 1,
            name: 'item1',
            samples: [
              { _id: 1, name: 'sample1' },
              { _id: 2, name: 'sample2' },
            ],
          },
          {
            _id: 2,
            name: 'item2',
            samples: [
              { _id: 3, name: 'sample3' },
              { _id: 4, name: 'sample4' },
            ],
          },
        ],
      },
    };

    const result = copyAndDepopulate(data, [{ src: 'pear.items.samples', dest: '_samples' }], { idField: 'name' });

    expect(result).toBe(data);
    expect(result).toEqual({
      pear: {
        _id: 'asdf',
        items: [
          {
            _id: 1,
            name: 'item1',
            samples: ['sample1', 'sample2'],
            _samples: [
              { _id: 1, name: 'sample1' },
              { _id: 2, name: 'sample2' },
            ],
          },
          {
            _id: 2,
            name: 'item2',
            samples: ['sample3', 'sample4'],
            _samples: [
              { _id: 3, name: 'sample3' },
              { _id: 4, name: 'sample4' },
            ],
          },
        ],
      },
    });
  });

  it('handles a large intermediate array without variadic argument limits (ARH-12)', () => {
    // Previous traversal used `ret.push(...next)`, passing one argument per
    // intermediate member and throwing RangeError once the stored array
    // exceeded the engine argument limit. Iterative appends preserve order
    // while completing for large intermediates on supported Node runtimes.
    const COUNT = 200_000;
    const buildItems = (): unknown[] =>
      Array.from({ length: COUNT }, (_, i) => {
        // Mixed intermediates: null/scalar entries are safe no-ops that must
        // stay in place and preserve overall ordering.
        if (i % 11 === 5) return null;
        if (i % 11 === 7) return `scalar-${i}`;
        return { leaf: { _id: i, n: `item-${i}` } };
      });

    const mutableInput = { items: buildItems() };
    const result = copyAndDepopulate(mutableInput, [{ src: 'items.leaf', dest: '_leaf' }]) as {
      items: unknown[];
    };

    expect(result).toBe(mutableInput);
    expect(result.items).toHaveLength(COUNT);
    const ordered = result.items.every((entry, i) => {
      if (i % 11 === 5) return entry === null;
      if (i % 11 === 7) return entry === `scalar-${i}`;
      if (typeof entry !== 'object' || entry === null) return false;
      const record = entry as { leaf?: unknown; _leaf?: unknown };
      return (
        record.leaf === i &&
        typeof record._leaf === 'object' &&
        record._leaf !== null &&
        (record._leaf as { _id?: unknown; n?: unknown })._id === i &&
        (record._leaf as { _id?: unknown; n?: unknown }).n === `item-${i}`
      );
    });
    expect(ordered).toBe(true);

    // Mutable/immutable value equivalence on the same large shape; the
    // immutable input must remain untouched.
    const immutableInput = { items: buildItems() };
    const immutableResult = copyAndDepopulate(immutableInput, [{ src: 'items.leaf', dest: '_leaf' }], {
      mutable: false,
    }) as { items: unknown[] };
    expect(immutableResult).not.toBe(immutableInput);
    expect(immutableResult).toEqual(result);
    expect(immutableInput.items).toHaveLength(COUNT);
    expect(immutableInput.items[0]).toEqual({ leaf: { _id: 0, n: 'item-0' } });
    expect(immutableInput.items[5]).toBeNull();
  });
});
