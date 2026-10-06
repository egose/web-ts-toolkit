/**
 * VIRT-11 performance + N+1 guidance verification (measurement only).
 *
 * - Compares per-doc getter I/O (N+1) vs finalized populated-data getters.
 * - Records row/getter counts, adapter (driver) query counts, configured
 *   limits, peak active getter work, and timings (evidence, not thresholds).
 * - Confirms VIRT-03/VIRT-04 bounds hold under nested related/embedded
 *   outputs. No dataloader, no persistence-permit wrapper, no src changes.
 */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let counter = 0;
const activeRuntimes: Array<{ clearOpenApiRoutes(): void }> = [];

afterEach(() => {
  for (const entry of activeRuntimes.splice(0)) entry.clearOpenApiRoutes();
  try {
    mongoose.deleteModel(/Virt11.*/);
  } catch {
    // ignore
  }
  mongoose.set('debug', false as never);
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Driver (adapter) query capture via mongoose debug hook. Counts all driver
// operations issued while the callback runs; caller filters to reads.
const captureDriverQueries = async <T>(fn: () => Promise<T>) => {
  const calls: Array<{ coll: string; method: string }> = [];
  const cb = (coll: string, method: string) => {
    calls.push({ coll: String(coll), method: String(method) });
  };
  mongoose.set('debug', cb as never);
  try {
    const result = await fn();
    return { result, calls };
  } finally {
    mongoose.set('debug', false as never);
  }
};

const summarizeReads = (calls: Array<{ coll: string; method: string }>) => {
  const reads = calls.filter((c) => /find|distinct|count|aggregate/i.test(c.method));
  const byKey: Record<string, number> = {};
  for (const c of reads) {
    const k = `${c.coll}.${c.method}`;
    byKey[k] = (byKey[k] ?? 0) + 1;
  }
  return { totalOps: calls.length, readOps: reads.length, byKey };
};

describe('VIRT-11 N+1 vs populated measurement', () => {
  it('A: per-doc getter DB I/O (N+1 shape) — 24 rows x 2 getters, limit 4', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    const addrName = `Virt11AddrA${tag}`;
    const userName = `Virt11UserA${tag}`;
    const addrSchema = new mongoose.Schema({ label: String });
    addrSchema.plugin(permissionsPlugin, { modelName: addrName });
    const Addr = mongoose.model(addrName, addrSchema);
    const userSchema = new mongoose.Schema({
      name: String,
      addrId: { type: mongoose.Schema.Types.ObjectId, ref: addrName },
    });
    userSchema.plugin(permissionsPlugin, { modelName: userName });
    const User = mongoose.model(userName, userSchema);

    runtime.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => [],
      requestComplexity: { maxHookConcurrency: 4 },
    } as never);
    runtime.createRouter(Addr, {
      basePath: `/virt11-addra-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: { label: { list: true, read: true } },
    } as never);

    let active = 0;
    let peak = 0;
    let addrDbCalls = 0;
    const addrLabelGet = vi.fn(async function (this: unknown, doc: { addrId?: string }) {
      active += 1;
      peak = Math.max(peak, active);
      try {
        await delay(8);
        if (!doc.addrId) return undefined;
        addrDbCalls += 1;
        const found = (await Addr.findById(doc.addrId).lean()) as unknown as { label?: string } | null;
        return found?.label ? `label:${found.label}` : undefined;
      } finally {
        active -= 1;
      }
    });
    const upperGet = vi.fn(async function (this: unknown, doc: { name?: string }) {
      active += 1;
      peak = Math.max(peak, active);
      try {
        await delay(8);
        return doc.name ? String(doc.name).toUpperCase() : undefined;
      } finally {
        active -= 1;
      }
    });

    const userRouter = runtime.createRouter(User, {
      basePath: `/virt11-usera-${tag}`,
      operationAccess: { list: true },
      permissionSchema: {
        name: { list: true },
        addrId: { list: true },
        addrLabel: { list: true },
        upperName: { list: true },
      },
      virtuals: {
        addrLabel: { dependsOn: ['addrId'], list: addrLabelGet as never },
        upperName: { dependsOn: ['name'], list: upperGet as never },
      },
    } as never);

    const ROWS = 24;
    const addrs = await Addr.create(
      Array.from({ length: ROWS }, (_, i) => ({ label: `L${String(i).padStart(2, '0')}` })),
    );
    await User.create(
      (addrs as unknown as Array<{ _id: unknown }>).map((a, i) => ({
        name: `u${String(i).padStart(2, '0')}`,
        addrId: a._id,
      })),
    );
    const app = express();
    app.use(express.json());
    app.use(userRouter.routes);

    // Warm up (ensure indexes/collections exist outside measurement window).
    await request(app)
      .post(`/virt11-usera-${tag}/__query`)
      .send({ select: ['name'], limit: 1 })
      .expect(200);
    addrDbCalls = 0;
    addrLabelGet.mockClear();
    upperGet.mockClear();
    active = 0;
    peak = 0;

    const t0 = performance.now();
    const { result: res, calls } = await captureDriverQueries(() =>
      request(app)
        .post(`/virt11-usera-${tag}/__query`)
        .send({ select: ['name', 'addrLabel', 'upperName'], sort: 'name' })
        .expect(200),
    );
    const t1 = performance.now();
    const ms = t1 - t0;
    const summary = summarizeReads(calls);

    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(ROWS);
    expect(rows.map((r) => r.name)).toEqual(rows.map((r) => r.name).sort());
    expect(addrLabelGet).toHaveBeenCalledTimes(ROWS);
    expect(upperGet).toHaveBeenCalledTimes(ROWS);
    expect(addrDbCalls).toBe(ROWS);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(0);
    for (let i = 0; i < ROWS; i++) {
      expect(rows[i]).toHaveProperty('addrLabel', `label:L${String(i).padStart(2, '0')}`);
      expect(rows[i]).toHaveProperty('upperName', `U${String(i).padStart(2, '0')}`);
    }
    // Stable query-count evidence: 1 parent list + N per-row reads.
    expect(summary.readOps).toBeGreaterThanOrEqual(ROWS + 1);

    console.log(
      `[VIRT-11 A N+1] rows=${ROWS} getters=2 limit=4 peak=${peak} getterDb=${addrDbCalls} driverTotal=${summary.totalOps} driverReads=${summary.readOps} ms=${ms.toFixed(1)} detail=${JSON.stringify(summary.byKey)}`,
    );
  });

  it('B: finalized populated-data getters — 24 rows x 2 getters, limit 4, zero per-row DB', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    const addrName = `Virt11AddrB${tag}`;
    const userName = `Virt11UserB${tag}`;
    const addrSchema = new mongoose.Schema({ label: String });
    addrSchema.plugin(permissionsPlugin, { modelName: addrName });
    const Addr = mongoose.model(addrName, addrSchema);
    const userSchema = new mongoose.Schema({
      name: String,
      addrId: { type: mongoose.Schema.Types.ObjectId, ref: addrName },
    });
    userSchema.plugin(permissionsPlugin, { modelName: userName });
    const User = mongoose.model(userName, userSchema);

    runtime.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => [],
      requestComplexity: { maxHookConcurrency: 4 },
    } as never);
    runtime.createRouter(Addr, {
      basePath: `/virt11-addrb-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: { label: { list: true, read: true } },
    } as never);

    let active = 0;
    let peak = 0;
    let getterDbCalls = 0;
    // Reads the already-finalized populated object; issues zero DB calls.
    const addrLabelViaPop = vi.fn(async function (this: unknown, doc: { addrId?: unknown }) {
      active += 1;
      peak = Math.max(peak, active);
      try {
        await delay(8);
        const pop = doc.addrId as unknown as { label?: string } | string | null | undefined;
        if (pop && typeof pop === 'object' && typeof pop.label === 'string') return `label:${pop.label}`;
        return undefined;
      } finally {
        active -= 1;
      }
    });
    const upperGet = vi.fn(async function (this: unknown, doc: { name?: string }) {
      active += 1;
      peak = Math.max(peak, active);
      try {
        await delay(8);
        return doc.name ? String(doc.name).toUpperCase() : undefined;
      } finally {
        active -= 1;
      }
    });
    void getterDbCalls;

    const userRouter = runtime.createRouter(User, {
      basePath: `/virt11-userb-${tag}`,
      // Populate defaults to read target visibility (VIRT-05 preserved
      // `populateAccess ?? 'read'`), so the parent path needs a read grant
      // for populate to attach on list. Keep list+read (same as VIRT-09 nest).
      operationAccess: { list: true, read: true },
      permissionSchema: {
        name: { list: true, read: true },
        addrId: { list: true, read: true },
        addrLabelViaPop: { list: true, read: true },
        upperName: { list: true, read: true },
      },
      virtuals: {
        addrLabelViaPop: { dependsOn: ['addrId'], list: addrLabelViaPop as never, read: addrLabelViaPop as never },
        upperName: { dependsOn: ['name'], list: upperGet as never, read: upperGet as never },
      },
    } as never);

    const ROWS = 24;
    const addrs = await Addr.create(
      Array.from({ length: ROWS }, (_, i) => ({ label: `L${String(i).padStart(2, '0')}` })),
    );
    await User.create(
      (addrs as unknown as Array<{ _id: unknown }>).map((a, i) => ({
        name: `u${String(i).padStart(2, '0')}`,
        addrId: a._id,
      })),
    );
    const app = express();
    app.use(express.json());
    app.use(userRouter.routes);

    await request(app)
      .post(`/virt11-userb-${tag}/__query`)
      .send({ select: ['name'], limit: 1 })
      .expect(200);
    addrLabelViaPop.mockClear();
    upperGet.mockClear();
    active = 0;
    peak = 0;

    const t0 = performance.now();
    const { result: res, calls } = await captureDriverQueries(() =>
      request(app)
        .post(`/virt11-userb-${tag}/__query`)
        .send({
          select: ['name', 'addrLabelViaPop', 'upperName'],
          sort: 'name',
          populate: [{ path: 'addrId', select: ['label'] }],
        })
        .expect(200),
    );
    const t1 = performance.now();
    const ms = t1 - t0;
    const summary = summarizeReads(calls);

    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(ROWS);
    expect(addrLabelViaPop).toHaveBeenCalledTimes(ROWS);
    expect(upperGet).toHaveBeenCalledTimes(ROWS);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(0);
    for (let i = 0; i < ROWS; i++) {
      expect(rows[i]).toHaveProperty('addrLabelViaPop', `label:L${String(i).padStart(2, '0')}`);
      expect(rows[i]).toHaveProperty('upperName', `U${String(i).padStart(2, '0')}`);
    }
    // Populated path issues a small constant number of reads (parent + batched
    // populate), not N per-row reads. Bound loosely to avoid driver-version
    // brittleness while still proving the N+1 elimination.
    expect(summary.readOps).toBeLessThanOrEqual(5);
    expect(summary.readOps).toBeGreaterThanOrEqual(2);

    console.log(
      `[VIRT-11 B populated] rows=${ROWS} getters=2 limit=4 peak=${peak} getterDb=0 driverTotal=${summary.totalOps} driverReads=${summary.readOps} ms=${ms.toFixed(1)} detail=${JSON.stringify(summary.byKey)}`,
    );
  });

  it('C: nested populate + embedded bounds hold — 12 rows, limit 2, plus limit-1 completion', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    const targetName = `Virt11NestT${tag}`;
    const mainName = `Virt11NestM${tag}`;
    let active = 0;
    let peak = 0;
    const track = <T extends (doc: never) => Promise<string>>(fn: T): T => {
      const wrapped = (async (doc: never) => {
        active += 1;
        peak = Math.max(peak, active);
        try {
          await delay(6);
          return fn(doc);
        } finally {
          active -= 1;
        }
      }) as T;
      return wrapped;
    };
    const tGetInner = async (doc: { address?: string }) => `t:${doc.address}`;
    const nickInner = async (doc: { displayName?: string }) => `nick:${doc.displayName}`;
    const topInner = async (doc: { address?: string }) => `top:${doc.address}`;
    const tGet = vi.fn(track(tGetInner as never));
    const nickGet = vi.fn(track(nickInner as never));
    const topGet = vi.fn(track(topInner as never));

    const targetSchema = new mongoose.Schema({ name: String, address: String });
    targetSchema.plugin(permissionsPlugin, { modelName: targetName });
    const Target = mongoose.model(targetName, targetSchema);
    const contactSchema = new mongoose.Schema({ displayName: String });
    const mainSchema = new mongoose.Schema({
      name: String,
      address: String,
      targetRef: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
      contacts: [contactSchema],
    });
    mainSchema.plugin(permissionsPlugin, { modelName: mainName });
    const Main = mongoose.model(mainName, mainSchema);

    runtime.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => [],
      requestComplexity: { maxHookConcurrency: 2 },
    } as never);
    runtime.createRouter(Target, {
      basePath: `/virt11-nestt-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        tVirt: { list: true, read: true },
      },
      virtuals: { tVirt: { dependsOn: ['address'], list: tGet as never, read: tGet as never } },
    } as never);
    const mainRouter = runtime.createRouter(Main, {
      basePath: `/virt11-nestm-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        targetRef: { list: true, read: true },
        contacts: {
          list: true,
          read: true,
          sub: { displayName: { list: true, read: true }, nick: { list: true, read: true } },
        },
        top: { list: true, read: true },
      },
      virtuals: {
        top: { dependsOn: ['address'], list: topGet as never, read: topGet as never },
        contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } },
      },
    } as never);

    const ROWS = 12;
    const t = (await Target.create({ name: 't1', address: 'ta1' } as never)) as unknown as { _id: unknown };
    await Main.create(
      Array.from({ length: ROWS }, (_, i) => ({
        name: `m${String(i).padStart(2, '0')}`,
        address: `a${i}`,
        targetRef: t._id,
        contacts: [{ displayName: `D${i}` }],
      })) as never,
    );
    const app = express();
    app.use(express.json());
    app.use(mainRouter.routes);

    const t0 = performance.now();
    const { result: res, calls } = await captureDriverQueries(() =>
      request(app)
        .post(`/virt11-nestm-${tag}/__query`)
        .send({
          select: ['name', 'top', 'contacts', 'targetRef'],
          sort: 'name',
          populate: [{ path: 'targetRef', select: ['name', 'tVirt'] }],
        })
        .expect(200),
    );
    const t1 = performance.now();
    const ms = t1 - t0;
    const summary = summarizeReads(calls);

    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(ROWS);
    expect(rows.map((r) => r.name)).toEqual(rows.map((r) => r.name).sort());
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveProperty('top');
      expect((row.contacts as Array<Record<string, unknown>>)[0]).toHaveProperty('nick');
      expect(row.targetRef).toHaveProperty('tVirt', 't:ta1');
    }
    expect(tGet).toHaveBeenCalled();
    expect(nickGet).toHaveBeenCalledTimes(ROWS);
    expect(topGet).toHaveBeenCalledTimes(ROWS);

    console.log(
      `[VIRT-11 C nested limit=2] rows=${ROWS} getters=3(limit shared) peak=${peak} driverTotal=${summary.totalOps} driverReads=${summary.readOps} ms=${ms.toFixed(1)} detail=${JSON.stringify(summary.byKey)}`,
    );

    // Limit-1 must still complete (deadlock check) on a smaller slice.
    runtime.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => [],
      requestComplexity: { maxHookConcurrency: 1 },
    } as never);
    active = 0;
    peak = 0;
    tGet.mockClear();
    nickGet.mockClear();
    topGet.mockClear();
    const t2 = performance.now();
    const res2 = await request(app)
      .post(`/virt11-nestm-${tag}/__query`)
      .send({
        select: ['name', 'top', 'contacts', 'targetRef'],
        sort: 'name',
        limit: 4,
        populate: [{ path: 'targetRef', select: ['name', 'tVirt'] }],
      })
      .expect(200);
    const t3 = performance.now();
    expect(res2.body.data as unknown[]).toHaveLength(4);
    expect(peak).toBeLessThanOrEqual(1);
    console.log(`[VIRT-11 C nested limit=1] rows=4 peak=${peak} ms=${(t3 - t2).toFixed(1)} completes without deadlock`);
  });
});
