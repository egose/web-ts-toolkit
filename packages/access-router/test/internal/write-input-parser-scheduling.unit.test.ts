import { afterEach, describe, expect, it, vi } from 'vitest';
import { iterateQuery } from '../../src/helpers';
import { RequestConcurrencyScheduler } from '../../src/helpers/concurrency';
import { FilterOperator } from '../../src/enums';
import { writeOutputFixture } from '../support/private/write-output-test-fixture';
import { quietOutput, sourceModes } from '../support/private/owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

describe('ordinary input parser scheduling is observable on real write paths', () => {
  it.each(
    sourceModes.flatMap((mode) =>
      [1, 3].flatMap((limit) => ['create', 'update'].map((operation) => ({ mode, limit, operation }))),
    ),
  )('$mode $operation limit=$limit keeps marker-free sibling mutation exposure', async ({ mode, limit, operation }) => {
    let admitted: any;
    const f = writeOutputFixture(mode, {
      permissionSchema: { value: true, branch: true },
      validate: {
        create: (data) => {
          admitted = data;
          return true;
        },
        update: (data) => {
          admitted = data;
          return true;
        },
      },
    });
    vi.spyOn(f.direct, 'getRequestComplexity').mockReturnValue({
      ...f.direct.getRequestComplexity(),
      maxBulkConcurrency: limit,
    });
    const original = (f.direct as any).parseClientData.bind(f.direct);
    const events: string[] = [];
    vi.spyOn(f.direct as any, 'parseClientData').mockImplementation((data, scheduler, scheduled) => {
      const pending = original(data, scheduler, scheduled);
      queueMicrotask(() => {
        (data as any).branch.value = 'queued';
        events.push('queued');
      });
      return pending;
    });
    const data = { value: { held: { stable: 'ordinary' } }, branch: { value: 'before' } };
    const result =
      operation === 'create'
        ? await f.direct.create(data, { select: ['value', 'branch', '-_id'] }, quietOutput)
        : await f.direct.updateById('existing', data, { select: ['value', 'branch', '-_id'] }, quietOutput);
    const expected = operation === 'update' && limit === 1 ? 'queued' : 'before';
    expect(result.success).toBe(true);
    expect(admitted.branch.value).toBe(expected);
    expect(f.saved[0].branch).toMatchObject({ value: expected });
    expect(events).toEqual(['queued']);
    expect(data.branch.value).toBe('queued');
    expect(f.saves).toHaveBeenCalledTimes(operation === 'update' ? 1 : 0);
  });

  it.each([1, 3])('preserves native leaf identity, holes/order and marker truthiness at limit %i', async (limit) => {
    const date = new Date(7),
      sparse = new Array(2);
    sparse[1] = { at: { $$date: 9 } };
    const handler = vi.fn((operator, value) => (operator === FilterOperator.Date ? new Date(value as number) : value));
    const result: any = await iterateQuery(
      { native: date, zero: { $$date: 0 }, noQuery: { $$sq: false }, sparse },
      handler,
      new RequestConcurrencyScheduler(limit),
    );
    expect(result.native).toBe(date); // Input admission, not the parser, detaches this leaf later.
    expect(result.zero).toEqual({ $$date: 0 });
    expect(result.noQuery).toEqual({ $$sq: false });
    expect(Object.hasOwn(result.sparse, 0)).toBe(true);
    expect(result.sparse).toEqual([undefined, { at: new Date(9) }]);
    expect(Object.hasOwn(sparse, 0)).toBe(false);
    expect(handler).toHaveBeenCalledExactlyOnceWith(FilterOperator.Date, 9, 'at');
  });
});
