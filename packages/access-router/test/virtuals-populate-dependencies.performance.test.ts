import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
type Row = Record<string, any>;
let serial = 0;
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
afterEach(() => {
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^DpvBound/);
});

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

/** Hold the first admitted wave until the observer releases it; no timing assertion. */
function probe(expected: number) {
  const entered = latch();
  const released = latch();
  let active = 0;
  let peak = 0;
  let held = 0;
  return {
    entered: entered.promise,
    release: released.resolve,
    get active() {
      return active;
    },
    get peak() {
      return peak;
    },
    async start(hold = true) {
      active++;
      peak = Math.max(peak, active);
      if (hold) {
        if (++held === expected) entered.resolve();
        await released.promise;
      }
    },
    finish() {
      active--;
    },
  };
}

const queryIds = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') return [];
  const row = value as Row;
  if (row._id?.$in) return row._id.$in.map(String);
  return Object.values(row).flatMap((child) => (Array.isArray(child) ? child.flatMap(queryIds) : queryIds(child)));
};

describe.each(['lean', 'hydrated'] as const)('DPV-04 measured bounded batching (%s)', (hydration) => {
  it.each([1, 2])('1/24 rows, two model groups, four getters, limit %s', async (limit) => {
    const n = ++serial;
    const api = createAccessRuntime();
    runtimes.push(api);
    const aName = `DpvBoundA${n}`;
    const bName = `DpvBoundB${n}`;
    const sourceName = `DpvBoundSource${n}`;
    let persistence = probe(Math.min(limit, 2));
    let hooks = probe(limit);
    const observations: { model: string; ids: string[]; lean: boolean; projection: unknown }[] = [];
    const targetSchema = (model: string) => {
      const schema = new mongoose.Schema({
        name: String,
        balance: { type: Number, select: false },
        credit: Number,
        source: { type: mongoose.Schema.Types.ObjectId, ref: sourceName },
      });
      schema.pre('find', async function () {
        observations.push({
          model,
          ids: queryIds(this.getFilter()),
          lean: !!this.mongooseOptions().lean,
          projection: this.projection(),
        });
        await persistence.start();
      });
      schema.post('find', () => persistence.finish());
      return schema;
    };
    const A = mongoose.model(aName, targetSchema('A'));
    const B = mongoose.model(bName, targetSchema('B'));
    const aRef = { type: mongoose.Schema.Types.ObjectId, ref: aName };
    const Source = mongoose.model(
      sourceName,
      new mongoose.Schema({
        name: String,
        account: aRef,
        accounts: [aRef],
        other: { type: mongoose.Schema.Types.ObjectId, ref: bName },
        children: [{ account: aRef }],
      }),
    );
    api.setGlobalOptions({ requestComplexity: { maxBulkConcurrency: limit, maxHookConcurrency: limit } } as never);
    const privateGetter = vi.fn(() => {
      throw new Error('terminal private targets must not finalize');
    });
    for (const Target of [A, B])
      api.createRouter(Target, {
        operationAccess: { read: true },
        permissionSchema: { name: true, balance: false, credit: false, loop: true },
      } as never);
    const router = api.createRouter(Source, {
      basePath: `/dpv-bound-${n}`,
      operationAccess: { list: true, read: true },
      permissionSchema: {
        name: true,
        account: true,
        accounts: true,
        other: false,
        balance: true,
        credit: true,
        otherBalance: true,
        children: { list: true, read: true, sub: { balance: true } },
      },
      hydration: { publicList: hydration },
      stripPermissionsField: true,
      defaults: {
        publicListOptions: { includePermissions: false, includeFieldPermissions: false, includeCount: false },
      },
    } as never);
    const getter = vi.fn(async (_doc: Row, _permissions: unknown, context: Row, populated: Row) => {
      await hooks.start(context.scopePath.length === 0);
      try {
        return populated.account?.balance ?? populated.account?.credit ?? populated.other?.balance;
      } finally {
        hooks.finish();
      }
    });
    const descriptor = (path: string, select: string) => ({ get: getter, dependsOnPopulate: [{ path, select }] });
    api.setModelOptions(sourceName, {
      virtuals: {
        balance: descriptor('account', 'balance -_id'),
        credit: descriptor('account', 'credit -_id'),
        otherBalance: descriptor('other', 'balance -_id'),
        children: { sub: { balance: descriptor('account', 'balance -_id') } },
      },
    } as never);
    // A real cyclic declaration is valid, but these are terminal private reads.
    for (const Target of [A, B])
      api.setModelOptions(Target.modelName, {
        virtuals: { loop: { get: privateGetter, dependsOnPopulate: [{ path: 'source', select: 'name' }] } },
      } as never);
    const a = await A.create([
      { name: 'a0', balance: 10, credit: 1 },
      { name: 'a1', balance: 20, credit: 2 },
      { name: 'a2', balance: 30, credit: 3 },
    ]);
    const b = await B.create({ name: 'b', balance: 40 });
    const source = await Source.create(
      Array.from({ length: 24 }, (_, index) => ({
        name: String(index).padStart(2, '0'),
        account: a[index % 3]._id,
        accounts: [a[0]._id, a[0]._id, a[1]._id],
        other: b._id,
        children: [{ account: a[(index + 1) % 3]._id }],
      })),
    );
    await A.updateMany({}, { source: source[0]._id });
    await B.updateMany({}, { source: source[0]._id });
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    const sourceFind = vi.spyOn(Source.collection, 'find');
    const aFind = vi.spyOn(A.collection, 'find');
    const bFind = vi.spyOn(B.collection, 'find');
    const measurements: Row[] = [];
    for (const rows of [1, 24]) {
      sourceFind.mockClear();
      aFind.mockClear();
      bFind.mockClear();
      getter.mockClear();
      observations.length = 0;
      persistence = probe(Math.min(limit, 2));
      hooks = probe(limit);
      const pending = request(app)
        .post(`/dpv-bound-${n}/__query`)
        .send({
          select: ['name', 'account', 'accounts', 'balance', 'credit', 'otherBalance', 'children.balance'],
          populate: [
            { path: 'account', select: 'name -_id' },
            { path: 'accounts', select: 'name -_id' },
          ],
          limit: rows,
          sort: 'name',
        })
        .expect(200)
        .then((response) => response);
      try {
        await persistence.entered;
        expect(persistence.active).toBe(Math.min(limit, 2));
        persistence.release();
        await hooks.entered;
        expect(hooks.active).toBe(limit);
        hooks.release();
        const response = await pending;
        expect(response.body.data).toHaveLength(rows);
        expect(sourceFind).toHaveBeenCalledTimes(1);
        expect(aFind).toHaveBeenCalledTimes(1);
        expect(bFind).toHaveBeenCalledTimes(1);
        expect(getter).toHaveBeenCalledTimes(rows * 4);
        expect(privateGetter).not.toHaveBeenCalled();
        expect(persistence.peak).toBe(Math.min(limit, 2));
        expect(hooks.peak).toBe(limit);
        expect(persistence.active).toBe(0);
        expect(hooks.active).toBe(0);
        for (const [index, row] of response.body.data.entries()) {
          expect(row).toMatchObject({
            balance: ((index % 3) + 1) * 10,
            credit: (index % 3) + 1,
            otherBalance: 40,
            account: { name: `a${index % 3}` },
          });
          expect(row.accounts).toEqual([{ name: 'a0' }, { name: 'a0' }, { name: 'a1' }]);
          expect(row.children[0]).toHaveProperty('balance', (((index + 1) % 3) + 1) * 10);
          expect(row).not.toHaveProperty('other');
        }
        for (const observation of observations) {
          expect(observation.ids.length).toBe(new Set(observation.ids).size);
          expect(observation.ids.length).toBe(observation.model === 'A' ? (rows === 1 ? 2 : 3) : 1);
          expect(observation.lean).toBe(hydration === 'lean');
        }
        expect(observations.find((entry) => entry.model === 'A')!.projection).toMatchObject({
          balance: 1,
          credit: 1,
          name: 1,
        });
        measurements.push({
          rows,
          getters: getter.mock.calls.length,
          driverReads: sourceFind.mock.calls.length + aFind.mock.calls.length + bFind.mock.calls.length,
          targetGroups: observations.length,
          ids: observations.map((entry) => entry.ids.length).sort(),
          persistencePeak: persistence.peak,
          hookPeak: hooks.peak,
        });
      } finally {
        persistence.release();
        hooks.release();
      }
    }
    console.log(`[DPV-04 bounded ${hydration} limit=${limit}] ${JSON.stringify(measurements)}`);
  });
});
