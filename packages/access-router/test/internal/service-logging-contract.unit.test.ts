/** Baseline logging contracts, not lazy-summary work assertions. The rejected 90-test candidate is archived in ARPC-05/withdrawal. */
import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessRouterLogger } from '../../src/interfaces';
import { defaultLogger } from '../../src/logger-default';
import { quietOutput, sourceModes } from '../support/private/owned-stage-test-fixture';
import { writeOutputFixture } from '../support/private/write-output-test-fixture';

afterEach(() => vi.restoreAllMocks());

const messages = (debug: ReturnType<typeof vi.fn>) => debug.mock.calls.map(([message]) => JSON.parse(String(message)));

describe('baseline service logging contracts (no summary scheduling/count contract)', () => {
  it.each(sourceModes)(
    '%s keeps native queries, output and cardinality-only messages across logger postures',
    async (mode) => {
      const f = writeOutputFixture(mode, { readAuthorizationMode: mode, listAuthorizationMode: mode });
      const filter = {
        $and: [
          { $or: Array.from({ length: 24 }, (_, index) => ({ value: { $in: [`private-${index}`, /secret/i] } })) },
          { when: { $gte: new Date(7) }, payload: Buffer.from('private-buffer') },
          { ownerId: new mongoose.Types.ObjectId('0123456789abcdef01234567') },
        ],
      };
      const admitted = { $and: [{ ...filter.$and[1], ...filter.$and[2] }, filter.$and[0]] };
      f.adapter.find.mockResolvedValue([f.stored.toObject()]);
      const postures = ['disabled', 'enabled', 'missing-level', 'throwing-level', 'throwing-debug'] as const;
      for (const posture of postures) {
        const debug = vi.fn(function (this: AccessRouterLogger) {
          expect(this).toBe(logger);
          if (posture === 'throwing-debug') throw new Error('debug handler failed');
        });
        const level = vi.fn(function (this: AccessRouterLogger, name: string) {
          expect(this).toBe(logger);
          expect(name).toBe('debug');
          if (posture === 'throwing-level') throw new Error('level probe failed');
          return posture !== 'disabled';
        });
        const logger: AccessRouterLogger = { debug, ...(posture === 'missing-level' ? {} : { isLevelEnabled: level }) };
        f.runtime.setGlobalOptions({ logger });
        expect(await f.public._list(filter, { select: ['value', '-_id'], limit: 5 }, quietOutput)).toMatchObject({
          success: true,
          data: [{ value: 'before' }],
        });
        expect(f.adapter.find.mock.calls.at(-1)![0].filter).toEqual(admitted);
        expect(level).toHaveBeenCalledTimes(posture === 'missing-level' ? 0 : 2);
        expect(debug).toHaveBeenCalledTimes(posture === 'disabled' ? 0 : 2);
        if (posture !== 'disabled') {
          expect(messages(debug)).toEqual([
            {
              op: 'find',
              modelName: f.model.modelName,
              skip: 0,
              limit: 5,
              populateCount: 0,
              selectCount: 2,
              filterKeyValueCount: 29,
              startedAt: expect.any(Number),
            },
            {
              op: 'find',
              modelName: f.model.modelName,
              filterKeyValueCount: 29,
              durationMs: expect.any(Number),
              resultCode: 'success',
            },
          ]);
          expect(JSON.stringify(messages(debug))).not.toMatch(/private|secret|0123456789|\$and|\$in|REDACTED/);
        }
      }
      expect(f.adapter.find).toHaveBeenCalledTimes(postures.length);
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.stored.value).toBe('before');
    },
  );

  it.each(sourceModes.flatMap((mode) => [false, true].map((initial) => ({ mode, initial }))))(
    '$mode observes a midcall debug change from $initial without losing start/end timing',
    async ({ mode, initial }) => {
      const f = writeOutputFixture(mode, { listAuthorizationMode: mode });
      let enabled = initial;
      let now = 1000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const debug = vi.fn();
      const level = vi.fn(() => {
        now += 100;
        return enabled;
      });
      f.runtime.setGlobalOptions({ logger: { debug, isLevelEnabled: level } });
      f.adapter.find.mockImplementation(async () => {
        enabled = !initial;
        now = 1250;
        return [f.stored.toObject()];
      });
      expect(await f.direct.find({}, { select: ['value', '-_id'] }, quietOutput)).toMatchObject({ success: true });
      expect(level).toHaveBeenCalledTimes(2);
      expect(debug).toHaveBeenCalledTimes(1);
      expect(messages(debug)[0]).toMatchObject(
        initial ? { startedAt: 1000 } : { durationMs: 250, resultCode: 'success' },
      );
      expect(messages(debug)[0]).not.toHaveProperty(initial ? 'durationMs' : 'startedAt');
    },
  );

  it('resolves a replacement logger after the level probe and again at completion', async () => {
    const f = writeOutputFixture('isolated');
    const events: string[] = [];
    const replacement: AccessRouterLogger = {
      debug(message) {
        expect(this).toBe(replacement);
        events.push(JSON.parse(String(message)).resultCode ?? 'begin');
      },
      isLevelEnabled() {
        expect(this).toBe(replacement);
        events.push('replacement-level');
        return true;
      },
    };
    const original: AccessRouterLogger = {
      isLevelEnabled() {
        expect(this).toBe(original);
        events.push('original-level');
        f.runtime.setGlobalOptions({ logger: replacement });
        return true;
      },
      debug: vi.fn(),
    };
    f.runtime.setGlobalOptions({ logger: original });
    expect(await f.direct.find({}, {}, quietOutput)).toMatchObject({ success: true });
    expect(events).toEqual(['original-level', 'begin', 'replacement-level', 'success']);
    expect(original.debug).not.toHaveBeenCalled();
  });

  it('uses the default handler with the custom receiver when debug is absent', async () => {
    const f = writeOutputFixture('trusted');
    const logger: AccessRouterLogger = {};
    f.runtime.setGlobalOptions({ logger });
    const fallback = vi.spyOn(defaultLogger, 'debug').mockImplementation(function (this: unknown) {
      expect(this).toBe(logger);
      return defaultLogger;
    });
    expect(await f.direct.find({}, {}, quietOutput)).toMatchObject({ success: true });
    expect(fallback).toHaveBeenCalledTimes(2);
  });

  it.each(sourceModes)('%s CREATE retains its existing silent structured-debug behavior', async (mode) => {
    const f = writeOutputFixture(mode);
    const debug = vi.fn();
    const level = vi.fn(() => true);
    f.runtime.setGlobalOptions({ logger: { debug, isLevelEnabled: level } });
    expect(await f.direct.create({ value: 'submitted' }, { select: ['value', '-_id'] }, quietOutput)).toMatchObject({
      success: true,
    });
    expect(f.saved).toHaveLength(1);
    expect(debug).not.toHaveBeenCalled();
    expect(level).not.toHaveBeenCalled();
  });

  it.each(
    sourceModes.flatMap((mode) =>
      (['success', 'not_found', 'forbidden'] as const).map((outcome) => ({ mode, outcome })),
    ),
  )(
    '$mode DELETE $outcome keeps result codes, disabled handlers and structure-only events',
    async ({ mode, outcome }) => {
      for (const entry of ['direct', 'public'] as const) {
        const f = writeOutputFixture(mode, outcome === 'forbidden' ? { baseFilter: { delete: () => false } } : {});
        const remove = vi.spyOn(f.stored, 'deleteOne').mockResolvedValue(f.stored as never);
        if (outcome === 'not_found') f.adapter.findOne.mockResolvedValue(null);
        const debug = vi.fn();
        const level = vi.fn(() => false);
        f.runtime.setGlobalOptions({ logger: { debug, isLevelEnabled: level } });
        const invoke = () => (entry === 'direct' ? f.direct.delete('existing') : f.public._delete('existing'));
        expect(await invoke()).toMatchObject({ code: outcome });
        expect(debug).not.toHaveBeenCalled();
        level.mockReturnValue(true);
        expect(await invoke()).toMatchObject({ code: outcome });
        expect(messages(debug)).toEqual([
          {
            op: 'delete',
            modelName: f.model.modelName,
            filterKeyValueCount: outcome === 'forbidden' ? 0 : 1,
            startedAt: expect.any(Number),
          },
          {
            op: 'delete',
            modelName: f.model.modelName,
            filterKeyValueCount: outcome === 'forbidden' ? 0 : 1,
            durationMs: expect.any(Number),
            resultCode: outcome,
          },
        ]);
        expect(level).toHaveBeenCalledTimes(4);
        expect(remove).toHaveBeenCalledTimes(outcome === 'success' ? 2 : 0);
        expect(f.adapter.findOne).toHaveBeenCalledTimes(outcome === 'forbidden' ? 0 : 2);
      }
    },
  );
});
