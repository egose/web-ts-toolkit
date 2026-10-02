import { describe, expect, it } from 'vitest';

import { sanitizeSortFields, validateSortFields } from '../src/helpers/sort-policy';

describe('sanitizeSortFields', () => {
  it('returns empty input as-is with no errors', () => {
    for (const empty of [null, undefined, ''] as const) {
      const result = sanitizeSortFields(empty, ['name']);
      expect(result.errors).toEqual([]);
      expect(result.stripped).toEqual([]);
      expect(result.sort).toBe(empty);
    }
  });

  it('returns the original reference when nothing is stripped', () => {
    const objectSort = { name: 1 as const };
    const objectResult = sanitizeSortFields(objectSort, ['name']);
    expect(objectResult.errors).toEqual([]);
    expect(objectResult.stripped).toEqual([]);
    expect(objectResult.sort).toBe(objectSort);

    const tupleSort: [string, 1][] = [['name', 1]];
    const tupleResult = sanitizeSortFields(tupleSort, ['name']);
    expect(tupleResult.sort).toBe(tupleSort);
  });

  it('strips denied keys from string sort while preserving direction', () => {
    const result = sanitizeSortFields('publicRank -secretRank', ['publicRank']);
    expect(result.errors).toEqual([]);
    expect(result.stripped).toEqual(['secretRank']);
    expect(result.sort).toBe('publicRank');
  });

  it('strips denied keys from object sort', () => {
    const result = sanitizeSortFields({ publicRank: 'asc', secretRank: -1 }, ['publicRank']);
    expect(result.errors).toEqual([]);
    expect(result.stripped).toEqual(['secretRank']);
    expect(result.sort).toEqual({ publicRank: 'asc' });
  });

  it('strips denied keys from tuple sort', () => {
    const result = sanitizeSortFields(
      [
        ['publicRank', 'asc'],
        ['secretRank', 'desc'],
      ],
      ['publicRank'],
    );
    expect(result.errors).toEqual([]);
    expect(result.stripped).toEqual(['secretRank']);
    expect(result.sort).toEqual([['publicRank', 'asc']]);
  });

  it('strips denied keys from Map sort and returns a Map', () => {
    const result = sanitizeSortFields(
      new Map([
        ['publicRank', 'asc'],
        ['secretRank', 'desc'],
      ]),
      ['publicRank'],
    );
    expect(result.errors).toEqual([]);
    expect(result.stripped).toEqual(['secretRank']);
    expect(result.sort).toBeInstanceOf(Map);
    expect([...(result.sort as Map<string, unknown>).entries()]).toEqual([['publicRank', 'asc']]);
  });

  it('returns undefined sort when every key is stripped', () => {
    const result = sanitizeSortFields('-secretRank', ['publicRank']);
    expect(result.errors).toEqual([]);
    expect(result.stripped).toEqual(['secretRank']);
    expect(result.sort).toBeUndefined();
  });

  it('returns syntax errors instead of stripping malformed sort', () => {
    const fieldResult = sanitizeSortFields({ $where: 1 } as never, ['publicRank']);
    expect(fieldResult.stripped).toEqual([]);
    expect(fieldResult.sort).toBeUndefined();
    expect(fieldResult.errors[0]).toMatchObject({ detail: 'Invalid sort field: $where', pointer: '#/sort' });

    const orderResult = sanitizeSortFields({ publicRank: 'sideways' } as never, ['publicRank']);
    expect(orderResult.stripped).toEqual([]);
    expect(orderResult.sort).toBeUndefined();
    expect(orderResult.errors[0]).toMatchObject({
      detail: 'Invalid sort order for field: publicRank',
      pointer: '#/sort',
    });
  });

  it('always allows id/_id without allowlisting them', () => {
    expect(sanitizeSortFields('_id', []).stripped).toEqual([]);
    expect(sanitizeSortFields('id', []).stripped).toEqual([]);
    expect(validateSortFields('_id', [])).toEqual([]);
  });
});
