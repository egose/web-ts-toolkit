/** Private parser observations, not public microtask or allocation guarantees. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { iterateQuery } from '../../src/helpers';
import { RequestConcurrencyScheduler } from '../../src/helpers/concurrency';
import { FilterOperator } from '../../src/enums';
import { deferred, turn } from '../support/public/hook-admission-fixture';

const observations: object[] = [];
const lanes = [
  { lane: 'no-scheduler', limit: 0, scheduled: false },
  { lane: 'row-scheduled', limit: 1, scheduled: true },
  { lane: 'entries-1', limit: 1, scheduled: false },
  { lane: 'entries-3', limit: 3, scheduled: false },
] as const;

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (!process.env.CWO04_BOUNDARIES_REPORT) return;
  const target = path.resolve(process.env.CWO04_BOUNDARIES_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});

describe('parser entry launch, error identity and active-worker draining', () => {
  it.each(lanes)('$lane retains async rejection capture before sibling launch', async ({ lane, limit, scheduled }) => {
    const failure = new Error('marker observation failed');
    const held = deferred<number>();
    const calls: number[] = [];
    let rejected = false;
    let finishedHeld = false;
    const broken = Object.defineProperty({}, '$$date', {
      get() {
        throw failure;
      },
    });
    const handler = vi.fn((operator: FilterOperator, value: unknown) => {
      expect(operator).toBe(FilterOperator.Date);
      calls.push(value as number);
      if (value === 2) {
        return held.promise.then((result) => {
          finishedHeld = true;
          return result;
        });
      }
      return value;
    });
    const scheduler = limit ? new RequestConcurrencyScheduler(limit) : undefined;
    const pending = iterateQuery(
      { broken, held: { $$date: 2 }, later: { $$date: 3 } },
      handler,
      scheduler,
      scheduled,
    ).catch((error: unknown) => {
      rejected = true;
      return error;
    });
    try {
      await turn();
      expect(calls).toEqual(lane === 'entries-1' ? [] : [2, 3]);
      expect(rejected).toBe(lane !== 'entries-3');
      expect(finishedHeld).toBe(false);
    } finally {
      held.resolve(2);
      await pending;
    }
    expect(await pending).toBe(failure);
    expect(finishedHeld).toBe(lane !== 'entries-1');
    observations.push({
      kind: 'entry-error-drain',
      lane,
      calls,
      sameError: true,
      rejectedBeforeActiveSiblingSettled: lane !== 'entries-3',
      activeSiblingFinished: finishedHeld,
    });
  });
});

describe('parser array traversal retains lazy element capture and native leaves', () => {
  it.each(lanes)(
    '$lane preserves sparse slots, nested-array identity and callback mutation exposure',
    async ({ lane, limit, scheduled }) => {
      const date = new Date(7);
      const buffer = Buffer.from('parser');
      const code = new mongoose.mongo.BSON.Code('return 1');
      const map = new Map([['value', 'native']]);
      const nested = [{ at: { $$date: 99 } }];
      const items = new Array(4);
      items[1] = { at: { $$date: 1 } };
      items[2] = { value: 'before' };
      items[3] = nested;
      const calls: unknown[] = [];
      const handler = vi.fn((operator: FilterOperator, value: unknown, key: string) => {
        calls.push([operator, value, key]);
        queueMicrotask(() => {
          items[2] = { value: 'queued' };
        });
        return new Date(value as number);
      });
      const scheduler = limit ? new RequestConcurrencyScheduler(limit) : undefined;
      const result: any = await iterateQuery(
        { '2': 'numeric-first', date, buffer, code, map, items, '1': 'numeric-before-2' },
        handler,
        scheduler,
        scheduled,
      );
      const expected = lane === 'entries-1' ? 'queued' : 'before';
      expect(result.items[2]).toEqual({ value: expected });
      expect(items[2]).toEqual({ value: 'queued' });
      expect(Object.hasOwn(result.items, 0)).toBe(true);
      expect(result.items[0]).toBeUndefined();
      expect(Object.hasOwn(items, 0)).toBe(false);
      expect(result.items).not.toBe(items);
      expect(result.items[3]).toBe(nested); // An array-valued element is not a plain-object parser root.
      expect(result.date).toBe(date);
      expect(result.buffer).toBe(buffer);
      expect(result.code).toBe(code);
      expect(result.map).toBe(map);
      expect(Object.keys(result)).toEqual(['1', '2', 'date', 'buffer', 'code', 'map', 'items']);
      expect(calls).toEqual([[FilterOperator.Date, 1, 'at']]);
      expect(await iterateQuery(items, handler, scheduler, scheduled)).toBe(items);
      observations.push({
        kind: 'array-native-capture',
        lane,
        laterValue: expected,
        sourceLaterValue: items[2].value,
        parsedHoleOwn: true,
        sourceHoleOwn: false,
        nestedArraySame: true,
        rootArraySame: true,
        nativeLeafIdentities: ['Date', 'Buffer', 'BSON.Code', 'Map'],
        keys: Object.keys(result),
        calls,
      });
    },
  );
});

describe('parser output commits own data slots after native/application observations', () => {
  it.each(lanes)(
    '$lane does not invoke an inherited output-key setter installed by a handler',
    async ({ lane, limit, scheduled }) => {
      const key = 'cwo04ParserSlot';
      const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
      let setters = 0;
      const handler = vi.fn(() => {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          set() {
            setters++;
            throw new Error('inherited parser output setter');
          },
        });
        return new Date(1);
      });
      const input = { at: { $$date: 1 }, [key]: 'captured' };
      const scheduler = limit ? new RequestConcurrencyScheduler(limit) : undefined;
      let result: any;
      try {
        result = await iterateQuery(input, handler, scheduler, scheduled);
      } finally {
        if (previous) Object.defineProperty(Object.prototype, key, previous);
        else Reflect.deleteProperty(Object.prototype, key);
      }
      expect(setters).toBe(0);
      expect(Object.getOwnPropertyDescriptor(result, key)).toEqual({
        value: 'captured',
        enumerable: true,
        configurable: true,
        writable: true,
      });
      expect(result.at).toEqual(new Date(1));
      expect(handler).toHaveBeenCalledExactlyOnceWith(FilterOperator.Date, 1, 'at');
      observations.push({ kind: 'own-parser-output-slot', lane, setters, ownValue: result[key] });
    },
  );
});
