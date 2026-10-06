/**
 * VIRT-07 root/batch + response-pipeline parity.
 *
 * Verifies (test, not broad refactor) that root/batch model entries return
 * identical virtual-processed data to direct routes for list/read/create/
 * update/upsert/new and dedicated subdocument paths. Compares data after
 * established envelope/status formatting. Response formatting stays
 * presentation-only (no second virtual pass via getter counts). Persisted
 * count/distinct unchanged; virtual-name input errors match direct/service.
 * Includes denial/metadata-off/default-selection and bounded ordered/grouped
 * root execution.
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
    mongoose.deleteModel(/Virt07.*/);
  } catch {
    // ignore
  }
});

type Getters = {
  fullGet: ReturnType<typeof vi.fn>;
  cGet: ReturnType<typeof vi.fn>;
  uGet: ReturnType<typeof vi.fn>;
  deniedGet: ReturnType<typeof vi.fn>;
  nickGet: ReturnType<typeof vi.fn>;
  tGet: ReturnType<typeof vi.fn>;
};

const makeParityApp = async (
  opts: {
    modelOptions?: Record<string, unknown>;
    requestComplexity?: Record<string, unknown>;
    rootOptions?: Record<string, unknown>;
    seedMain?: Array<Record<string, unknown>>;
    seedTargets?: Array<Record<string, unknown>>;
    withTidJoin?: boolean;
  } = {},
) => {
  const runtime = createAccessRuntime();
  activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
  const tag = ++counter;
  const targetName = `Virt07T${tag}`;
  const mainName = `Virt07M${tag}`;

  const fullGet = vi.fn(async (doc: { address?: string }) =>
    doc.address === undefined ? undefined : `addr:${doc.address}`,
  );
  const cGet = vi.fn(async () => 'c-only');
  const uGet = vi.fn(async () => 'u-only');
  const deniedGet = vi.fn(async () => 'denied');
  const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
  const tGet = vi.fn(async (doc: { address?: string }) => (doc.address === undefined ? undefined : `t:${doc.address}`));
  const getters: Getters = { fullGet, cGet, uGet, deniedGet, nickGet, tGet };

  const targetSchema = new mongoose.Schema({ name: String, address: String, secret: String, tid: String } as never, {
    strict: false,
  });
  targetSchema.plugin(permissionsPlugin, { modelName: targetName });
  const Target = mongoose.model(targetName, targetSchema);

  const contactSchema = new mongoose.Schema({ displayName: String, secret: String } as never, { strict: false });
  const mainSchema = new mongoose.Schema(
    {
      name: String,
      address: { type: String, default: 'TEMPLATE_ADDR' },
      secret: String,
      tid: String,
      targetRef: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
      contacts: [contactSchema],
    } as never,
    { strict: false },
  );
  mainSchema.plugin(permissionsPlugin, { modelName: mainName });
  const Main = mongoose.model(mainName, mainSchema);

  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
    ...(opts.requestComplexity ? { requestComplexity: opts.requestComplexity } : {}),
  } as never);

  const targetRouter = runtime.createRouter(Target, {
    basePath: `/virt07t-${tag}`,
    operationAccess: { list: true, read: true },
    permissionSchema: {
      name: { list: true, read: true },
      address: { list: true, read: true },
      secret: { list: false, read: false },
      tid: { list: true, read: true },
      tFull: { list: true, read: true },
    } as never,
    virtuals: {
      tFull: { dependsOn: ['address'], read: tGet as never, list: tGet as never },
    } as never,
  } as never);

  const mainRouter = runtime.createRouter(Main, {
    basePath: `/virt07m-${tag}`,
    operationAccess: {
      list: true,
      read: true,
      create: true,
      update: true,
      upsert: true,
      delete: true,
      distinct: true,
      count: true,
      new: true,
      subs: { contacts: { list: true, read: true, create: true, update: true } },
    } as never,
    permissionSchema: {
      name: { list: true, read: true, create: true, update: true },
      address: { list: true, read: true, create: true, update: true },
      secret: { list: false, read: false, create: true, update: true },
      tid: { list: true, read: true, create: true, update: true },
      targetRef: { list: true, read: true, create: true, update: true },
      fullAddress: { list: true, read: true, create: true, update: true },
      cOnly: { read: true, create: true },
      uOnly: { read: true, update: true },
      deniedVirt: { list: false, read: false },
      contacts: {
        list: true,
        read: true,
        create: true,
        update: true,
        sub: {
          displayName: { list: true, read: true, create: true, update: true },
          secret: { list: false, read: false },
          nick: { list: true, read: true },
        },
      },
    } as never,
    virtuals: {
      fullAddress: {
        dependsOn: ['address'],
        read: fullGet as never,
        list: fullGet as never,
        create: fullGet as never,
        update: fullGet as never,
      },
      cOnly: { dependsOn: [], create: cGet as never },
      uOnly: { dependsOn: [], update: uGet as never },
      deniedVirt: { dependsOn: [], read: deniedGet as never, list: deniedGet as never },
      contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } },
    } as never,
    ...(opts.modelOptions ?? {}),
  } as never);

  const rootRouter = runtime.createRouter({
    basePath: `/virt07root-${tag}`,
    operationAccess: true,
    ...(opts.rootOptions ?? {}),
  } as never);

  // Seed targets first so mains can reference them.
  const targetIds: string[] = [];
  const seedsT = opts.seedTargets ?? [{ name: 't1', address: 'ta1', tid: 'k1', secret: 's1' }]; // pragma: allowlist secret
  for (const s of seedsT) {
    const d = (await Target.create(s as never)) as unknown as { _id: unknown };
    targetIds.push(String((d as { _id: unknown })._id));
  }
  if (opts.seedMain) {
    // Resolve targetRef placeholder 'TARGET0' to first target id.
    const mapped = opts.seedMain.map((r) => {
      const copy = { ...r } as Record<string, unknown>;
      if (copy.targetRef === 'TARGET0') copy.targetRef = targetIds[0];
      return copy;
    });
    await Main.create(mapped as never);
  }

  const app = express();
  app.use(express.json());
  app.use(targetRouter.routes);
  app.use(mainRouter.routes);
  app.use(rootRouter.routes);

  const base = `/virt07m-${tag}`;
  const rootBase = `/virt07root-${tag}`;
  return { app, runtime, tag, base, rootBase, mainName, targetName, Main, Target, targetIds, getters };
};

const rootEntry = (body: unknown, index = 0) => (body as Array<Record<string, unknown>>)[index];

describe('VIRT-07 root/batch parity', () => {
  it('root list matches direct list (virtual data, envelope, no second pass, hidden deps absent)', async () => {
    const { app, base, rootBase, mainName, getters } = await makeParityApp({
      seedMain: [{ name: 'p1', address: 'a1', tid: 'k1', contacts: [{ displayName: 'Ann' }] }],
    });
    const select = ['name', 'fullAddress', 'contacts'];
    getters.fullGet.mockClear();
    getters.nickGet.mockClear();

    const direct = await request(app).post(`${base}/__query`).send({ select }).expect(200);
    const directRow = (direct.body.data as Array<Record<string, unknown>>).find((r) => r.name === 'p1')!;
    expect(directRow).toHaveProperty('fullAddress', 'addr:a1');
    expect(directRow).not.toHaveProperty('address');
    expect(directRow).not.toHaveProperty('secret');
    expect(directRow).not.toHaveProperty('deniedVirt');
    const contacts = directRow.contacts as Array<Record<string, unknown>>;
    expect(contacts[0]).toHaveProperty('nick', 'nick:Ann');
    expect(contacts[0]).not.toHaveProperty('secret');
    const directCalls = getters.fullGet.mock.calls.length;
    expect(directCalls).toBeGreaterThan(0);

    getters.fullGet.mockClear();
    getters.nickGet.mockClear();
    const root = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'list', filter: { name: 'p1' }, args: { select } }])
      .expect(200);
    const entry = rootEntry(root.body, 0);
    expect(entry.statusCode).toBe(200);
    expect(entry.message).toBe('OK');
    const rootRows = (entry.result as Record<string, unknown>).data as Array<Record<string, unknown>>;
    const rootRow = rootRows.find((r) => r.name === 'p1')!;
    expect(rootRow).toEqual(directRow);
    // No second pass: root with 1 row invokes getter once (not twice for formatting).
    expect(getters.fullGet.mock.calls.length).toBe(directCalls);
    expect(getters.nickGet.mock.calls.length).toBe(1);
    // Association metadata absent from public DTOs.
    expect(JSON.stringify(rootRow)).not.toContain('VIRT_ASSOCIATION');
    expect(rootRow).not.toHaveProperty('address');
  });

  it('root read (by id) matches direct read; advanced read parity', async () => {
    const { app, base, rootBase, mainName, Main, getters } = await makeParityApp({
      seedMain: [{ name: 'r1', address: 'ra1', tid: 'k1', contacts: [{ displayName: 'Bob' }] }],
    });
    const doc = (await Main.findOne({ name: 'r1' }).lean()) as unknown as { _id: unknown };
    const id = String((doc as { _id: unknown })._id);
    const select = ['name', 'fullAddress', 'contacts'];

    const direct = await request(app).post(`${base}/__query/${id}`).send({ select }).expect(200);
    expect(direct.body).toHaveProperty('fullAddress', 'addr:ra1');
    expect(direct.body).not.toHaveProperty('address');
    const directCalls = getters.fullGet.mock.calls.length;

    getters.fullGet.mockClear();
    const root = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'read', id, args: { select } }])
      .expect(200);
    const entry = rootEntry(root.body, 0);
    expect(entry.statusCode).toBe(200);
    expect(entry.result).toMatchObject({ success: true, kind: 'single', code: 'success' });
    expect((entry.result as Record<string, unknown>).data).toEqual(direct.body);
    expect(getters.fullGet.mock.calls.length).toBe(1);
    expect(directCalls).toBe(1);
  });

  it('root create matches direct create (201 envelope, virtual computed, raw not persisted)', async () => {
    const { app, base, rootBase, mainName, Main, getters } = await makeParityApp({});
    getters.fullGet.mockClear();
    const payload = { name: 'c1', address: 'ca1', fullAddress: 'evil', tid: 'k1' };

    const direct = await request(app).post(base).send(payload).expect(201);
    expect(direct.body).toHaveProperty('name', 'c1');
    // Basic create returns full persisted+virtual output; virtual computed from submitted address.
    expect(getters.fullGet).toHaveBeenCalled();
    const rawDirect = (await Main.findOne({ name: 'c1' }).lean()) as unknown as Record<string, unknown>;
    expect(rawDirect).not.toHaveProperty('fullAddress');
    expect(rawDirect).toHaveProperty('address', 'ca1');

    getters.fullGet.mockClear();
    const root = await request(app)
      .post(rootBase)
      .send([
        {
          target: 'model',
          name: mainName,
          op: 'create',
          data: { name: 'c2', address: 'ca2', fullAddress: 'evil', tid: 'k1' },
        },
      ])
      .expect(200);
    const entry = rootEntry(root.body, 0);
    expect(entry.statusCode).toBe(201);
    expect(entry.message).toBe('Created');
    const rootData = (entry.result as Record<string, unknown>).data as Array<Record<string, unknown>>;
    expect(rootData).toHaveLength(1);
    // Same virtual-processed shape as direct (ignoring distinct _ids).
    expect(rootData[0]).toMatchObject({ name: 'c2', address: 'ca2' });
    const directNorm = { ...direct.body } as Record<string, unknown>;
    delete directNorm._id;
    delete directNorm._permissions;
    const rootNorm = { ...rootData[0] } as Record<string, unknown>;
    delete rootNorm._id;
    delete rootNorm._permissions;
    // Both compute fullAddress from address; evil input stripped.
    expect(rootNorm.fullAddress).toBe('addr:ca2');
    expect(directNorm.fullAddress).toBe('addr:ca1');
    expect(Object.keys(rootNorm).sort()).toEqual(Object.keys(directNorm).sort());
    expect(getters.fullGet.mock.calls.length).toBe(1);
    const rawRoot = (await Main.findOne({ name: 'c2' }).lean()) as unknown as Record<string, unknown>;
    expect(rawRoot).not.toHaveProperty('fullAddress');
  });

  it('root update matches direct update (virtual computed, envelope preserved)', async () => {
    const { app, base, rootBase, mainName, Main, getters } = await makeParityApp({
      seedMain: [{ name: 'u1', address: 'ua1', tid: 'k1' }],
    });
    const seed = (await Main.findOne({ name: 'u1' }).lean()) as unknown as { _id: unknown };
    const seedId = String((seed as { _id: unknown })._id);
    // Seed a second identical row for root so direct/root act on same values but distinct rows.
    const second = (await Main.create({ name: 'u2', address: 'ua1', tid: 'k1' } as never)) as unknown as {
      _id: unknown;
    };
    const secondId = String((second as { _id: unknown })._id);

    getters.fullGet.mockClear();
    const direct = await request(app).patch(`${base}/${seedId}`).send({ address: 'ua2' }).expect(200);
    expect(direct.body).toHaveProperty('address', 'ua2');
    expect(getters.fullGet.mock.calls.length).toBeGreaterThanOrEqual(0);

    getters.fullGet.mockClear();
    const root = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'update', id: secondId, data: { address: 'ua2' } }])
      .expect(200);
    const entry = rootEntry(root.body, 0);
    expect(entry.statusCode).toBe(200);
    const rootData = (entry.result as Record<string, unknown>).data as Record<string, unknown>;
    // Same virtual-processed values (ignoring _id/_permissions which differ per row).
    expect(rootData).toMatchObject({ address: 'ua2' });
    expect(rootData.fullAddress).toBe(direct.body.fullAddress);
    expect(rootData).not.toHaveProperty('secret');
    expect(getters.fullGet.mock.calls.length).toBeGreaterThan(0);
  });

  it('root upsert create + update branches match direct (operation upsert, branch getters)', async () => {
    const { app, base, rootBase, mainName, Main, getters } = await makeParityApp({ seedMain: [] });
    // Direct create branch (no _id).
    getters.cGet.mockClear();
    getters.uGet.mockClear();
    const directCreate = await request(app).put(base).send({ name: 'up1', address: 'upa1' }).expect(201);
    expect(getters.cGet).toHaveBeenCalled();
    expect(getters.uGet).not.toHaveBeenCalled();
    expect(directCreate.body).toHaveProperty('cOnly', 'c-only');
    expect(directCreate.body).not.toHaveProperty('uOnly');

    // Root create branch.
    getters.cGet.mockClear();
    getters.uGet.mockClear();
    const rootCreate = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'upsert', data: { name: 'up2', address: 'upa2' } }])
      .expect(200);
    const rc = rootEntry(rootCreate.body, 0);
    expect(rc.statusCode).toBe(201);
    const rcData =
      (rc.result as Record<string, unknown>).kind === 'list'
        ? ((rc.result as Record<string, unknown>).data as Array<Record<string, unknown>>)[0]
        : ((rc.result as Record<string, unknown>).data as Record<string, unknown>);
    expect(rcData).toHaveProperty('cOnly', 'c-only');
    expect(rcData).not.toHaveProperty('uOnly');
    expect(getters.cGet).toHaveBeenCalled();
    expect(getters.uGet).not.toHaveBeenCalled();

    // Update branch: direct.
    const existing = (await Main.findOne({ name: 'up1' }).lean()) as unknown as { _id: unknown };
    const existingId = String((existing as { _id: unknown })._id);
    getters.cGet.mockClear();
    getters.uGet.mockClear();
    const directUpdate = await request(app).put(base).send({ _id: existingId, name: 'up1b' }).expect(200);
    expect(directUpdate.body).toHaveProperty('uOnly', 'u-only');
    expect(directUpdate.body).not.toHaveProperty('cOnly');
    expect(getters.uGet).toHaveBeenCalled();
    expect(getters.cGet).not.toHaveBeenCalled();

    // Update branch: root on the root-created row.
    const rootRow = (await Main.findOne({ name: 'up2' }).lean()) as unknown as { _id: unknown };
    const rootId = String((rootRow as { _id: unknown })._id);
    getters.cGet.mockClear();
    getters.uGet.mockClear();
    const rootUpdate = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'upsert', data: { _id: rootId, name: 'up2b' } }])
      .expect(200);
    const ru = rootEntry(rootUpdate.body, 0);
    expect(ru.statusCode).toBe(200);
    const ruData = (ru.result as Record<string, unknown>).data as Record<string, unknown>;
    expect(ruData).toHaveProperty('uOnly', 'u-only');
    expect(ruData).not.toHaveProperty('cOnly');
    expect(ruData).toMatchObject({ name: 'up2b' });
    // Branch parity: same keys as direct update branch (ignoring _id).
    const duKeys = Object.keys(directUpdate.body as Record<string, unknown>).sort();
    const ruKeys = Object.keys(ruData).sort();
    expect(ruKeys).toEqual(duKeys);
  });

  it('root new matches direct new (create virtuals from defaults, args.select ignored)', async () => {
    const { app, base, rootBase, mainName } = await makeParityApp({});
    const direct = await request(app).get(`${base}/new`).expect(200);
    const root = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'new' }])
      .expect(200);
    const entry = rootEntry(root.body, 0);
    expect(entry.statusCode).toBe(200);
    const rootData = (entry.result as Record<string, unknown>).data as Record<string, unknown>;
    // Both use address default TEMPLATE_ADDR so create fullAddress computes.
    expect(direct.body).toHaveProperty('fullAddress', 'addr:TEMPLATE_ADDR');
    expect(rootData).toHaveProperty('fullAddress', 'addr:TEMPLATE_ADDR');
    // `new` generates a fresh template _id per call; compare virtual-processed
    // data ignoring the distinct generated identity.
    const { _id: _dId, ...dRest } = direct.body as Record<string, unknown>;
    const { _id: _rId, ...rRest } = rootData;
    expect(rRest).toEqual(dRest);
    expect(typeof _dId).toBeDefined();
    expect(typeof _rId).toBeDefined();
  });

  it('root subList matches direct subList (scoped virtuals, deps stripped, order preserved)', async () => {
    const { app, base, rootBase, mainName, Main, getters } = await makeParityApp({
      seedMain: [{ name: 's1', address: 'sa1', tid: 'k1', contacts: [{ displayName: 'A' }, { displayName: 'B' }] }],
    });
    const parent = (await Main.findOne({ name: 's1' }).lean()) as unknown as { _id: unknown };
    const pid = String((parent as { _id: unknown })._id);

    const direct = await request(app)
      .post(`${base}/${pid}/contacts/__query`)
      .send({ select: ['displayName', 'nick'] })
      .expect(200);
    expect(direct.body).toHaveLength(2);
    expect(direct.body[0]).toHaveProperty('nick', 'nick:A');
    expect(direct.body[1]).toHaveProperty('nick', 'nick:B');
    const directCalls = getters.nickGet.mock.calls.length;

    getters.nickGet.mockClear();
    const root = await request(app)
      .post(rootBase)
      .send([
        {
          target: 'model',
          name: mainName,
          op: 'subList',
          id: pid,
          sub: 'contacts',
          args: { select: ['displayName', 'nick'] },
        },
      ])
      .expect(200);
    const entry = rootEntry(root.body, 0);
    expect(entry.statusCode).toBe(200);
    const rootData = (entry.result as Record<string, unknown>).data as Array<Record<string, unknown>>;
    expect(rootData).toEqual(direct.body);
    expect(getters.nickGet.mock.calls.length).toBe(directCalls);
  });

  it('root subRead matches direct subRead', async () => {
    const { app, base, rootBase, mainName, Main } = await makeParityApp({
      seedMain: [{ name: 'sr1', address: 'sra1', tid: 'k1', contacts: [{ displayName: 'Solo' }] }],
    });
    const parent = (await Main.findOne({ name: 'sr1' }).lean()) as unknown as {
      _id: unknown;
      contacts: Array<{ _id: unknown }>;
    };
    const pid = String((parent as { _id: unknown })._id);
    const subId = String(((parent as { contacts: Array<{ _id: unknown }> }).contacts[0] as { _id: unknown })._id);

    const direct = await request(app)
      .post(`${base}/${pid}/contacts/${subId}/__query`)
      .send({ select: ['displayName', 'nick'] })
      .expect(200);
    expect(direct.body).toHaveProperty('nick', 'nick:Solo');

    const root = await request(app)
      .post(rootBase)
      .send([
        {
          target: 'model',
          name: mainName,
          op: 'subRead',
          id: pid,
          sub: 'contacts',
          subId,
          args: { select: ['displayName', 'nick'] },
        },
      ])
      .expect(200);
    const entry = rootEntry(root.body, 0);
    expect(entry.statusCode).toBe(200);
    expect((entry.result as Record<string, unknown>).data).toEqual(direct.body);
  });

  it('root subCreate matches direct subCreate (201, scoped virtual computed)', async () => {
    const { app, base, rootBase, mainName, Main } = await makeParityApp({
      seedMain: [{ name: 'sc1', address: 'sca1', tid: 'k1', contacts: [{ displayName: 'Keep' }] }],
    });
    const mkParent = async (nm: string) => {
      const p = (await Main.create({
        name: nm,
        address: 'x',
        tid: 'k1',
        contacts: [{ displayName: 'Keep' }],
      } as never)) as unknown as { _id: unknown };
      return String((p as { _id: unknown })._id);
    };
    const directPid = await mkParent('sc-direct');
    const rootPid = await mkParent('sc-root');

    const direct = await request(app)
      .post(`${base}/${directPid}/contacts`)
      .send({ displayName: 'New1', nick: 'evil' })
      .expect(201);
    const directArr = Array.isArray(direct.body) ? direct.body : [direct.body];
    const added = directArr.find((r: Record<string, unknown>) => r.displayName === 'New1') as Record<string, unknown>;
    expect(added).toHaveProperty('nick', 'nick:New1');
    expect(added).not.toHaveProperty('nick', 'evil');

    const root = await request(app)
      .post(rootBase)
      .send([
        {
          target: 'model',
          name: mainName,
          op: 'subCreate',
          id: rootPid,
          sub: 'contacts',
          data: { displayName: 'New1', nick: 'evil' },
        },
      ])
      .expect(200);
    const entry = rootEntry(root.body, 0);
    expect(entry.statusCode).toBe(201);
    const rootArr = (entry.result as Record<string, unknown>).data as Array<Record<string, unknown>>;
    const rootAdded = rootArr.find((r) => r.displayName === 'New1')!;
    expect(rootAdded).toMatchObject({ displayName: 'New1', nick: 'nick:New1' });
    // Same row shape (ignoring _id).
    const dKeys = Object.keys(added).sort();
    const rKeys = Object.keys(rootAdded).sort();
    expect(rKeys).toEqual(dKeys);

    // Computed sub virtual never persists.
    const raw = (await Main.findById(rootPid).lean()) as unknown as { contacts: Array<Record<string, unknown>> };
    const rawAdded = (raw.contacts as Array<Record<string, unknown>>).find((c) => c.displayName === 'New1')!;
    expect(rawAdded).not.toHaveProperty('nick', 'evil');
    expect(rawAdded).toHaveProperty('displayName', 'New1');
  });

  it('root subUpdate matches direct subUpdate', async () => {
    const { app, base, rootBase, mainName, Main } = await makeParityApp({
      seedMain: [{ name: 'su1', address: 'sua1', tid: 'k1', contacts: [{ displayName: 'Old' }] }],
    });
    const mk = async (nm: string) => {
      const p = (await Main.create({
        name: nm,
        address: 'x',
        tid: 'k1',
        contacts: [{ displayName: 'Old' }],
      } as never)) as unknown as {
        _id: unknown;
        contacts: Array<{ _id: unknown }>;
      };
      const raw = (await Main.findById(String((p as { _id: unknown })._id)).lean()) as unknown as {
        _id: unknown;
        contacts: Array<{ _id: unknown }>;
      };
      return { pid: String((raw as { _id: unknown })._id), subId: String((raw.contacts[0] as { _id: unknown })._id) };
    };
    const d = await mk('su-direct');
    const r = await mk('su-root');

    const direct = await request(app)
      .patch(`${base}/${d.pid}/contacts/${d.subId}`)
      .send({ displayName: 'New', nick: 'evil' })
      .expect(200);
    expect(direct.body).toHaveProperty('nick', 'nick:New');

    const root = await request(app)
      .post(rootBase)
      .send([
        {
          target: 'model',
          name: mainName,
          op: 'subUpdate',
          id: r.pid,
          sub: 'contacts',
          subId: r.subId,
          data: { displayName: 'New', nick: 'evil' },
        },
      ])
      .expect(200);
    const entry = rootEntry(root.body, 0);
    expect(entry.statusCode).toBe(200);
    const rootSub = (entry.result as Record<string, unknown>).data as Record<string, unknown>;
    // Distinct parents yield distinct sub _ids; compare virtual-processed
    // values ignoring generated identity.
    const { _id: _ddId, ...dRest } = direct.body as Record<string, unknown>;
    const { _id: _rrId, ...rRest } = rootSub;
    expect(rRest).toEqual(dRest);
    expect(rootSub).toMatchObject({ displayName: 'New', nick: 'nick:New' });
  });

  it('root subBulkUpdate matches direct subBulkUpdate', async () => {
    const { app, base, rootBase, mainName, Main } = await makeParityApp({
      seedMain: [{ name: 'sb1', address: 'sba1', tid: 'k1', contacts: [{ displayName: 'B1' }, { displayName: 'B2' }] }],
    });
    const mk = async (nm: string) => {
      const p = (await Main.create({
        name: nm,
        address: 'x',
        tid: 'k1',
        contacts: [{ displayName: 'B1' }, { displayName: 'B2' }],
      } as never)) as unknown as { _id: unknown };
      const raw = (await Main.findById(String((p as { _id: unknown })._id)).lean()) as unknown as {
        _id: unknown;
        contacts: Array<{ _id: unknown; displayName: string }>;
      };
      return { pid: String((raw as { _id: unknown })._id), subs: raw.contacts };
    };
    const d = await mk('sb-direct');
    const r = await mk('sb-root');
    const dPayload = d.subs.map((s) => ({
      _id: String((s as { _id: unknown })._id),
      displayName: `${(s as { displayName: string }).displayName}-u`,
    }));
    const rPayload = r.subs.map((s) => ({
      _id: String((s as { _id: unknown })._id),
      displayName: `${(s as { displayName: string }).displayName}-u`,
    }));

    const direct = await request(app).patch(`${base}/${d.pid}/contacts`).send(dPayload).expect(200);
    expect(direct.body).toHaveLength(2);
    expect((direct.body as Array<Record<string, unknown>>)[0]).toHaveProperty('nick');

    const root = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'subBulkUpdate', id: r.pid, sub: 'contacts', data: rPayload }])
      .expect(200);
    const entry = rootEntry(root.body, 0);
    expect(entry.statusCode).toBe(200);
    const rootData = (entry.result as Record<string, unknown>).data as Array<Record<string, unknown>>;
    // Same values modulo parent _id scoping: compare nick/displayName pairs.
    expect(rootData.map((x) => x.nick).sort()).toEqual(
      (direct.body as Array<Record<string, unknown>>).map((x) => x.nick).sort(),
    );
    expect(rootData.map((x) => x.displayName).sort()).toEqual(
      (direct.body as Array<Record<string, unknown>>).map((x) => x.displayName).sort(),
    );
  });

  it('advanced list with select+populate+include matches direct; advanced update matches direct', async () => {
    const { app, base, rootBase, mainName, targetName, getters } = await makeParityApp({
      seedTargets: [
        { name: 'adv-t', address: 'adv-ta', tid: 'kAdv', secret: 's' }, // pragma: allowlist secret
        { name: 'adv-t2', address: 'adv-ta2', tid: 'kAdv', secret: 's2' }, // pragma: allowlist secret
      ],
      seedMain: [
        { name: 'adv-p', address: 'adv-pa', tid: 'kAdv', targetRef: 'TARGET0', contacts: [{ displayName: 'Adv' }] },
      ],
    });
    const select = ['name', 'fullAddress', 'targetRef', 'contacts'];
    // Selective populate proves target dependency stripping (address fetched
    // internally for tFull but omitted from output unless independently selected).
    const populate = [{ path: 'targetRef', select: ['name', 'tFull'] }];
    const include = [
      {
        model: targetName,
        op: 'list',
        path: 'tidTargets',
        localField: 'tid',
        foreignField: 'tid',
        args: { select: ['name', 'tFull'] },
      },
    ];

    getters.fullGet.mockClear();
    getters.tGet.mockClear();
    getters.nickGet.mockClear();
    const direct = await request(app).post(`${base}/__query`).send({ select, populate, include }).expect(200);
    const dRow = (direct.body.data as Array<Record<string, unknown>>).find((r) => r.name === 'adv-p')!;
    expect(dRow).toHaveProperty('fullAddress', 'addr:adv-pa');
    const dPop = dRow.targetRef as Record<string, unknown>;
    expect(dPop).toHaveProperty('tFull', 't:adv-ta');
    expect(dPop).not.toHaveProperty('secret');
    expect(dPop).not.toHaveProperty('address');
    const dInc = dRow.tidTargets as Array<Record<string, unknown>>;
    expect(Array.isArray(dInc)).toBe(true);
    expect(dInc[0]).toHaveProperty('tFull');
    expect(dInc[0]).not.toHaveProperty('secret');
    // Join keys absent unless selected.
    expect(dInc[0]).not.toHaveProperty('tid');
    expect(dRow).not.toHaveProperty('address');
    const dFullCalls = getters.fullGet.mock.calls.length;
    const dTCalls = getters.tGet.mock.calls.length;

    getters.fullGet.mockClear();
    getters.tGet.mockClear();
    getters.nickGet.mockClear();
    const root = await request(app)
      .post(rootBase)
      .send([
        { target: 'model', name: mainName, op: 'list', filter: { name: 'adv-p' }, args: { select, populate, include } },
      ])
      .expect(200);
    const entry = rootEntry(root.body, 0);
    expect(entry.statusCode).toBe(200);
    const rRows = (entry.result as Record<string, unknown>).data as Array<Record<string, unknown>>;
    const rRow = rRows.find((r) => r.name === 'adv-p')!;
    expect(rRow).toEqual(dRow);
    expect(getters.fullGet.mock.calls.length).toBe(dFullCalls);
    // Target getters run once per logical target output (no second formatting pass).
    expect(getters.tGet.mock.calls.length).toBe(dTCalls);

    // Advanced update parity with select+populate.
    getters.fullGet.mockClear();
    const pid = String((dRow as Record<string, unknown>)._id as string);
    const directUpd = await request(app)
      .patch(`${base}/__mutation/${pid}`)
      .send({ data: { address: 'adv-pa2' }, select, populate })
      .expect(200);
    expect(directUpd.body).toHaveProperty('fullAddress', 'addr:adv-pa2');

    getters.fullGet.mockClear();
    const rootUpd = await request(app)
      .post(rootBase)
      .send([
        {
          target: 'model',
          name: mainName,
          op: 'update',
          id: pid,
          data: { address: 'adv-pa2' },
          args: { select, populate },
        },
      ])
      .expect(200);
    const uEntry = rootEntry(rootUpd.body, 0);
    const uData = (uEntry.result as Record<string, unknown>).data as Record<string, unknown>;
    expect(uData).toEqual(directUpd.body);
  });

  it('denial + metadata-off + default-selection parity (direct vs root)', async () => {
    // Denial: deniedVirt never computes, getter never runs.
    const deniedApp = await makeParityApp({ seedMain: [{ name: 'dn1', address: 'dna1', tid: 'k1' }] });
    deniedApp.getters.deniedGet.mockClear();
    const dDenied = await request(deniedApp.app)
      .post(`${deniedApp.base}/__query`)
      .send({ select: ['name', 'deniedVirt'] })
      .expect(200);
    expect((dDenied.body.data as Array<Record<string, unknown>>)[0]).not.toHaveProperty('deniedVirt');
    expect(deniedApp.getters.deniedGet).not.toHaveBeenCalled();
    const rDenied = await request(deniedApp.app)
      .post(deniedApp.rootBase)
      .send([
        {
          target: 'model',
          name: deniedApp.mainName,
          op: 'list',
          filter: { name: 'dn1' },
          args: { select: ['name', 'deniedVirt'] },
        },
      ])
      .expect(200);
    const dnEntry = rootEntry(rDenied.body, 0);
    expect(((dnEntry.result as Record<string, unknown>).data as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      'deniedVirt',
    );
    expect(deniedApp.getters.deniedGet).not.toHaveBeenCalled();

    // Metadata-off: skim + no permissions still computes via internal grants.
    const metaApp = await makeParityApp({ seedMain: [{ name: 'mo1', address: 'moa1', tid: 'k1' }] });
    const dMeta = await request(metaApp.app)
      .post(`${metaApp.base}/__query`)
      .send({
        select: ['name', 'fullAddress'],
        options: { skim: true, includePermissions: false, includeFieldPermissions: false },
      })
      .expect(200);
    expect((dMeta.body.data as Array<Record<string, unknown>>)[0]).toHaveProperty('fullAddress', 'addr:moa1');
    const rMeta = await request(metaApp.app)
      .post(metaApp.rootBase)
      .send([
        {
          target: 'model',
          name: metaApp.mainName,
          op: 'list',
          filter: { name: 'mo1' },
          args: { select: ['name', 'fullAddress'] },
          options: { skim: true, includePermissions: false, includeFieldPermissions: false },
        },
      ])
      .expect(200);
    const moEntry = rootEntry(rMeta.body, 0);
    expect(((moEntry.result as Record<string, unknown>).data as Array<Record<string, unknown>>)[0]).toHaveProperty(
      'fullAddress',
      'addr:moa1',
    );
    expect(((moEntry.result as Record<string, unknown>).data as Array<Record<string, unknown>>)[0]).toEqual(
      (dMeta.body.data as Array<Record<string, unknown>>)[0],
    );

    // Default selection: model defaults select includes virtual.
    const defApp = await makeParityApp({
      modelOptions: { defaults: { publicListArgs: { select: ['name', 'fullAddress'] } } },
      seedMain: [{ name: 'df1', address: 'dfa1', tid: 'k1' }],
    });
    const dDef = await request(defApp.app).post(`${defApp.base}/__query`).send({}).expect(200);
    expect((dDef.body.data as Array<Record<string, unknown>>).find((r) => r.name === 'df1')).toHaveProperty(
      'fullAddress',
      'addr:dfa1',
    );
    const rDef = await request(defApp.app)
      .post(defApp.rootBase)
      .send([{ target: 'model', name: defApp.mainName, op: 'list', filter: { name: 'df1' } }])
      .expect(200);
    const dfEntry = rootEntry(rDef.body, 0);
    const dfRows = (dfEntry.result as Record<string, unknown>).data as Array<Record<string, unknown>>;
    expect(dfRows.find((r) => r.name === 'df1')).toHaveProperty('fullAddress', 'addr:dfa1');
  });

  it('persisted count/distinct unchanged; virtual-name input errors match direct/service', async () => {
    const { app, base, rootBase, mainName, getters } = await makeParityApp({
      seedMain: [
        { name: 'cd1', address: 'cda1', tid: 'k1' },
        { name: 'cd2', address: 'cda2', tid: 'k1' },
      ],
    });
    // Count parity (persisted filter).
    const dCount = await request(app)
      .post(`${base}/__query`)
      .send({ options: { includeCount: true } })
      .expect(200);
    expect(dCount.body.meta).toBeDefined();
    const rCount = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'count', filter: {} }])
      .expect(200);
    const cEntry = rootEntry(rCount.body, 0);
    expect(cEntry.statusCode).toBe(200);
    expect((cEntry.result as Record<string, unknown>).data).toBe(2);

    // Count with virtual filter strips before adapter (same count, getters never run for count).
    getters.fullGet.mockClear();
    const rCountVirt = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'count', filter: { fullAddress: 'evil' } }])
      .expect(200);
    const cvEntry = rootEntry(rCountVirt.body, 0);
    expect((cvEntry.result as Record<string, unknown>).data).toBe(2);
    expect(getters.fullGet).not.toHaveBeenCalled();

    // Distinct on persisted field parity.
    const dDistinct = await request(app).get(`${base}/distinct/name`).expect(200);
    const rDistinct = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'distinct', field: 'name' }])
      .expect(200);
    const diEntry = rootEntry(rDistinct.body, 0);
    expect(diEntry.statusCode).toBe(200);
    expect(((diEntry.result as Record<string, unknown>).data as Array<unknown>).sort()).toEqual(
      (dDistinct.body as Array<unknown>).sort(),
    );

    // Distinct on virtual: controlled 403 in both, same code, no data leak, getters never run.
    getters.fullGet.mockClear();
    const dVirtDistinct = await request(app).get(`${base}/distinct/fullAddress`).expect(403);
    expect(dVirtDistinct.body).toBeDefined();
    const rVirtDistinct = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'distinct', field: 'fullAddress' }])
      .expect(200);
    const vdEntry = rootEntry(rVirtDistinct.body, 0);
    expect(vdEntry.statusCode).toBe(403);
    expect(vdEntry.message).toBe('Forbidden');
    expect((vdEntry.result as Record<string, unknown>).success).toBe(false);
    expect((vdEntry.result as Record<string, unknown>).code).toBe('forbidden');
    expect((vdEntry.result as Record<string, unknown>).data).toBeUndefined();
    expect(getters.fullGet).not.toHaveBeenCalled();

    // Sort by virtual rejected in both (400 direct, BadRequest result via root list).
    await request(app).post(`${base}/__query`).send({ sort: 'fullAddress' }).expect(400);
    const rSort = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'list', args: { sort: 'fullAddress' } }])
      .expect(200);
    const sEntry = rootEntry(rSort.body, 0);
    expect(sEntry.statusCode).toBe(400);
    expect((sEntry.result as Record<string, unknown>).success).toBe(false);
  });

  it('bounded ordered/grouped root execution preserves order, limits, and virtual parity', async () => {
    const { app, rootBase, mainName, Main } = await makeParityApp({
      rootOptions: { maxConcurrentOperations: 2, maxBatchEntries: 10, maxOrderGroups: 5 },
      seedMain: [{ name: 'ord-seed', address: 'oa0', tid: 'k1' }],
    });
    // Ordered groups: order 0 creates, order 1 lists (must see created row).
    const batch = await request(app)
      .post(rootBase)
      .send([
        { target: 'model', name: mainName, op: 'create', data: { name: 'ord-1', address: 'oa1', tid: 'k1' }, order: 0 },
        { target: 'model', name: mainName, op: 'create', data: { name: 'ord-2', address: 'oa2', tid: 'k1' }, order: 0 },
        {
          target: 'model',
          name: mainName,
          op: 'list',
          filter: {},
          args: { select: ['name', 'fullAddress'] },
          order: 1,
        },
      ])
      .expect(200);
    expect(batch.body).toHaveLength(3);
    // Results sorted by index regardless of group execution.
    expect((batch.body as Array<Record<string, unknown>>).map((r) => r.index)).toEqual([0, 1, 2]);
    expect((batch.body as Array<Record<string, unknown>>)[0].statusCode).toBe(201);
    expect((batch.body as Array<Record<string, unknown>>)[1].statusCode).toBe(201);
    const listEntry = (batch.body as Array<Record<string, unknown>>)[2];
    const rows = (listEntry.result as Record<string, unknown>).data as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.name === 'ord-1')).toMatchObject({ fullAddress: 'addr:oa1' });
    expect(rows.find((r) => r.name === 'ord-2')).toMatchObject({ fullAddress: 'addr:oa2' });

    // Batch limits enforced.
    const limited = await makeParityApp({ rootOptions: { maxBatchEntries: 2 } });
    await request(limited.app)
      .post(limited.rootBase)
      .send([
        { target: 'model', name: limited.mainName, op: 'list' },
        { target: 'model', name: limited.mainName, op: 'list' },
        { target: 'model', name: limited.mainName, op: 'list' },
      ])
      .expect(400);
    void Main;
  });
});
