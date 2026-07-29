import { describe, expect, it } from 'vitest';
import hasOwn from '../src/hasOwn';
import omitBy from '../src/omitBy';
import uniqBy from '../src/uniqBy';

describe('common utility helpers', () => {
  it('checks own properties without being confused by the prototype chain', () => {
    const base = { inherited: true };
    const record = Object.create(base) as Record<string, unknown>;
    record.safe = 1;
    record.hasOwnProperty = false;

    expect(hasOwn(record, 'safe')).toBe(true);
    expect(hasOwn(record, 'inherited')).toBe(false);
    expect(hasOwn(record, 'hasOwnProperty')).toBe(true);
    expect(hasOwn(null, 'safe')).toBe(false);
  });

  it('omits object entries that match the predicate', () => {
    expect(omitBy({ empty: '', enabled: true, count: 0, pending: undefined }, (value) => value === undefined)).toEqual({
      empty: '',
      enabled: true,
      count: 0,
    });

    expect(omitBy({ empty: '', enabled: true, count: 0 }, (value) => !value)).toEqual({ enabled: true });
    expect(omitBy(null, () => true)).toEqual({});
  });

  it('deduplicates arrays by iteratee while preserving the first match', () => {
    expect(
      uniqBy(
        [
          { id: 'a', label: 'first' },
          { id: 'a', label: 'second' },
          { id: 'b', label: 'third' },
        ],
        'id',
      ),
    ).toEqual([
      { id: 'a', label: 'first' },
      { id: 'b', label: 'third' },
    ]);

    expect(uniqBy(['Ada', 'ALAN', 'Grace', 'alan'], (value) => value.toLowerCase())).toEqual(['Ada', 'ALAN', 'Grace']);
    expect(uniqBy(null, 'id')).toEqual([]);
  });
});
