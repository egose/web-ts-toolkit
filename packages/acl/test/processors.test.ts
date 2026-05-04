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
});
