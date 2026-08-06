import { describe, expect, it } from 'vitest';
import { genPagination } from '../src/helpers/query';

describe('genPagination overflow safety (ARF-04)', () => {
  it('clamps a derived page*limit offset that overflows the safe integer range', () => {
    // page and limit are individually safe integers, but (page - 1) * limit
    // overflows Number.MAX_SAFE_INTEGER. Before ARF-04 this produced an
    // unsafe skip value; now it is clamped to MAX_SAFE_INTEGER.
    const result = genPagination({ page: Number.MAX_SAFE_INTEGER, limit: Number.MAX_SAFE_INTEGER }, 100);

    expect(Number.isSafeInteger(result.skip)).toBe(true);
    expect(result.skip).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.limit).toBe(100);
  });

  it('computes the correct skip for ordinary page values', () => {
    expect(genPagination({ page: 3, limit: 10 }, 100)).toEqual({ skip: 20, limit: 10 });
    expect(genPagination({ page: 1, limit: 10 }, 100)).toEqual({ skip: 0, limit: 10 });
    expect(genPagination({ page: 2, limit: 5 }, 100)).toEqual({ skip: 5, limit: 5 });
  });

  it('uses the hard limit when page is provided but limit is missing', () => {
    const result = genPagination({ page: 2 }, 100);
    expect(result.limit).toBe(100);
    expect(result.skip).toBe(100);
  });

  it('respects an explicit skip over an explicit page', () => {
    expect(genPagination({ skip: 42, page: 5, limit: 10 }, 100)).toEqual({ skip: 42, limit: 10 });
  });

  it('normalizes negative or non-safe skip and limit defensively', () => {
    expect(genPagination({ skip: -1, limit: 10 }, 100)).toEqual({ skip: 0, limit: 10 });
    expect(genPagination({ limit: 0 }, 100)).toEqual({ skip: 0, limit: 100 });
  });
});
