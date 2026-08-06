import { describe, expect, it, vi } from 'vitest';

import { Codes } from '../src/enums';
import type { ListResult, Request, SingleResult } from '../src/interfaces';
import { formatListResponse } from '../src/http/response-pipelines/list-response';
import { unwrapServiceData } from '../src/http/response-pipelines/model-response';
import { toPublicServiceResult } from '../src/http/response-pipelines/service-result';

describe('response pipeline internals', () => {
  it('serializes root results to the public DTO without internal metadata', () => {
    const result: ListResult<string, { hidden: true }, { skip: number; limit: number }> = {
      success: true,
      kind: 'list',
      code: Codes.Success,
      data: ['a'],
      count: 1,
      totalCount: 5,
      input: { hidden: true },
      query: { skip: 2, limit: 1 },
      contexts: [{ operation: 'list' } as never],
    };

    expect(toPublicServiceResult(result)).toEqual({
      success: true,
      kind: 'list',
      code: Codes.Success,
      data: ['a'],
      count: 1,
      totalCount: 5,
    });
  });

  it('uses the same public serialization step for direct single-result unwrapping', () => {
    const result: SingleResult<{ id: string }, { hidden: true }, { filter: { id: string } }> = {
      success: true,
      kind: 'single',
      code: Codes.Success,
      data: { id: 'user-1' },
      input: { hidden: true },
      query: { filter: { id: 'user-1' } },
      context: { operation: 'read' } as never,
    };

    expect(unwrapServiceData(result)).toEqual({ id: 'user-1' });
  });

  it('uses the same public serialization step for direct list responses while deriving meta from query', () => {
    const setHeader = vi.fn();
    const req = { res: { setHeader } } as unknown as Request;
    const result: ListResult<{ id: string }, { hidden: true }, { skip: number; limit: number }> = {
      success: true,
      kind: 'list',
      code: Codes.Success,
      data: [{ id: 'user-1' }],
      count: 1,
      totalCount: 5,
      input: { hidden: true },
      query: { skip: 2, limit: 1 },
      contexts: [{ operation: 'list' } as never],
    };

    expect(formatListResponse(req, result, true, true)).toEqual({
      data: [{ id: 'user-1' }],
      meta: {
        returnedCount: 1,
        skip: 2,
        limit: 1,
        page: 3,
        pageSize: 1,
        hasPreviousPage: true,
        totalCount: 5,
        totalPages: 5,
        hasNextPage: true,
      },
    });
    expect(setHeader).toHaveBeenCalled();
  });
});
