import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import type { Filter, ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let sequence = 0;
const runtimes: Array<ReturnType<typeof createAccessRuntime>> = [];
const quiet = { includePermissions: false, includeFieldPermissions: false };
const decoy = { name: 'decoy', state: 'untouched', reconciliation: { settled: true } };
const empty = { name: 'empty', state: 'untouched', reconciliation: {} };
const equality = [
  ['bare', (value: unknown) => value],
  ['$eq', (value: unknown) => ({ $eq: value })],
  ['$in', (value: unknown) => ({ $in: [value] })],
] as const;

afterEach(() => {
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^Arl02Invoice/);
  vi.restoreAllMocks();
});

async function fixture({
  virtuals = true,
  seed = [decoy],
  options = {},
}: {
  virtuals?: boolean;
  seed?: Record<string, unknown>[];
  options?: Record<string, unknown>;
} = {}) {
  const api = createAccessRuntime();
  runtimes.push(api);
  const modelName = `Arl02Invoice${++sequence}`;
  const note = new mongoose.Schema({ label: String }, { _id: false, minimize: false });
  const embedded = new mongoose.Schema(
    {
      label: String,
      reconciliation: mongoose.Schema.Types.Mixed,
      payload: mongoose.Schema.Types.Mixed,
      notes: { type: [note], default: undefined },
    },
    { _id: false, strict: false, minimize: false },
  );
  const schema = new mongoose.Schema(
    {
      name: String,
      state: String,
      tenant: String,
      join: String,
      reconciliation: mongoose.Schema.Types.Mixed,
      payload: { type: [mongoose.Schema.Types.Mixed], default: undefined },
      profile: embedded,
      contacts: { type: [embedded], default: undefined },
      when: Date,
      owner: mongoose.Schema.Types.ObjectId,
      bytes: Buffer,
    },
    { strict: false, minimize: false },
  );
  const calls: Array<{ op: string; filter: unknown }> = [];
  const saves: string[] = [];
  for (const op of ['find', 'findOne', 'countDocuments'] as const) {
    schema.pre(op, function () {
      calls.push({ op, filter: this.getFilter() });
    });
  }
  schema.pre('save', function () {
    saves.push(this.isNew ? 'create' : 'update');
  });
  schema.plugin(permissionsPlugin, { modelName });
  const Model = mongoose.model(modelName, schema);
  const getter = vi.fn(() => 'computed');
  const descriptor = { get: getter, dependsOn: [] };
  const embeddedVirtuals = { sub: { nick: descriptor, notes: { sub: { excerpt: descriptor } } } };
  api.setGlobalOptions({ globalPermissions: () => [], requestComplexity: { maxDepth: 16 } });
  const basePath = `/arl02-${sequence}`;
  const router = api.createRouter(Model, {
    hydration: { find: 'lean', findOne: 'lean', findById: 'lean', publicRead: 'lean' },
    basePath,
    operationAccess: { list: true, read: true, create: true, update: true, upsert: true, count: true },
    permissionSchema: {
      name: true,
      state: true,
      tenant: true,
      join: true,
      reconciliation: true,
      payload: true,
      profile: true,
      contacts: {
        list: true,
        read: true,
        sub: { label: true, reconciliation: true, payload: true, notes: true, nick: false },
      },
      when: true,
      owner: true,
      bytes: true,
      display: false,
    },
    ...(virtuals ? { virtuals: { display: descriptor, profile: embeddedVirtuals, contacts: embeddedVirtuals } } : {}),
    ...options,
  } as never);
  const rows = await Model.create(seed);
  saves.length = 0;
  const app = express();
  app.use(express.json(), router.routes);
  let run: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await run(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    app,
    basePath,
    Model,
    modelName,
    rows,
    calls,
    saves,
    getter,
    async execute(callback: (req: ModelRequest) => Promise<void>) {
      failure = undefined;
      run = callback;
      await request(app).post(`${basePath}/probe`).send({}).expect(200);
      if (failure) throw failure;
    },
  };
}

describe.each([false, true])('ARL-02 empty-object predicates (virtuals=%s)', (virtuals) => {
  describe.each(equality)('%s equality', (_spelling, operand) => {
    it('read, list totals, count and both exists modes distinguish a miss from match-all', async () => {
      const f = await fixture({ virtuals });
      const filter = { reconciliation: operand({}) };
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        expect.soft(await service.findOne(filter, { select: ['name'] }, quiet)).toMatchObject({ code: 'not_found' });
        expect
          .soft(await service.find(filter, { select: ['name'] }, { ...quiet, includeCount: true }))
          .toMatchObject({ success: true, data: [], count: 0, totalCount: 0 });
        expect.soft(await service.count(filter)).toMatchObject({ success: true, data: 0 });
        expect.soft(await service.countTrusted(filter)).toMatchObject({ success: true, data: 0 });
        expect.soft(await service.exists(filter)).toMatchObject({ success: true, data: false });
        expect.soft(await service.exists(filter, { includeId: true })).toMatchObject({ success: true, data: null });
      });
      expect(filter).toEqual({ reconciliation: operand({}) });
      expect(f.saves).toEqual([]);
      expect(f.getter).not.toHaveBeenCalled();
    });

    it('a no-match update cannot save an unrelated invoice', async () => {
      const f = await fixture({ virtuals });
      await f.execute(async (req) => {
        const result = await req.macl
          .getService(f.modelName)
          .updateOne({ reconciliation: operand({}) }, { state: 'WRONG' }, { select: ['name', 'state'] }, quiet);
        expect.soft(result).toMatchObject({ success: false, code: 'not_found' });
      });
      expect.soft(f.saves).toEqual([]);
      expect(await f.Model.collection.findOne({ name: 'decoy' })).toMatchObject(decoy);
      expect(await f.Model.collection.countDocuments({})).toBe(1);
    });

    it('an allowed upsert miss creates, then a hit updates only the empty-object invoice', async () => {
      const f = await fixture({ virtuals });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        const filter = { reconciliation: operand({}) };
        expect
          .soft(await service.upsert(filter, { ...empty, state: 'created' }, { select: ['name', 'state'] }, quiet))
          .toMatchObject({ success: true, code: 'created', data: [{ name: 'empty', state: 'created' }] });
        expect
          .soft(await service.upsert(filter, { state: 'updated' }, { select: ['name', 'state'] }, quiet))
          .toMatchObject({ success: true, code: 'success', data: { name: 'empty', state: 'updated' } });
      });
      expect.soft(f.saves).toEqual(['create', 'update']);
      expect.soft(await f.Model.collection.findOne({ name: 'decoy' })).toMatchObject(decoy);
      expect.soft(await f.Model.collection.findOne({ name: 'empty' })).toMatchObject({ ...empty, state: 'updated' });
      expect(await f.Model.collection.countDocuments({})).toBe(2);
    });

    it('matches the positive minimize:false fixture, excluding nonempty and missing values', async () => {
      const f = await fixture({ virtuals, seed: [decoy, empty, { name: 'missing' }] });
      expect(await f.Model.collection.findOne({ name: 'empty' })).toHaveProperty('reconciliation', {});
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        const filter = { reconciliation: operand({}) };
        expect
          .soft(await service.findOne(filter, { select: ['name'] }, quiet))
          .toMatchObject({ success: true, data: { name: 'empty' } });
        expect
          .soft(await service.find(filter, { select: ['name'] }, { ...quiet, includeCount: true }))
          .toMatchObject({ success: true, data: [{ name: 'empty' }], count: 1, totalCount: 1 });
        expect.soft(await service.count(filter)).toMatchObject({ success: true, data: 1 });
        expect.soft(await service.countTrusted(filter)).toMatchObject({ success: true, data: 1 });
        expect.soft(await service.exists(filter)).toMatchObject({ success: true, data: true });
        expect
          .soft(await service.exists(filter, { includeId: true }))
          .toMatchObject({ success: true, data: { _id: f.rows[1]._id } });
      });
    });
  });
});

describe('ARL-02 query positions and literal data', () => {
  it.each([
    ['virtual-spelled object keys', { display: 'literal', nested: { display: {} } }],
    ['empty array', []],
    ['array of empty objects', [{}]],
    ['mixed array', [{}, [], { display: 'literal' }]],
    ['operator-spelled data keys', { nested: { $and: [{}] }, display: 'literal' }],
  ])('preserves %s under bare/$eq/$in equality', async (_label, value) => {
    // Typed array paths keep Mongoose's implicit-$in casting of Mixed values
    // separate from the virtual parser's literal-array contract.
    const field = Array.isArray(value) ? 'payload' : 'reconciliation';
    const f = await fixture({ seed: [decoy, { name: 'literal', [field]: value }] });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      for (const [spelling, operand] of equality) {
        const filter = { [field]: operand(value) };
        expect(await f.Model.collection.countDocuments(filter)).toBe(1);
        expect
          .soft(await service.find(filter, { select: ['name'] }, { ...quiet, includeCount: true }), spelling)
          .toMatchObject({ success: true, data: [{ name: 'literal' }], count: 1, totalCount: 1 });
        expect.soft(await service.count(filter), spelling).toMatchObject({ success: true, data: 1 });
        expect.soft(await service.exists(filter), spelling).toMatchObject({ success: true, data: true });
      }
    });
  });

  it('keeps empty registered containers and explicit whole-container literal operands', async () => {
    const f = await fixture({
      seed: [
        { name: 'decoy', profile: { label: 'decoy' } },
        { name: 'empty', profile: {} },
        { name: 'literal', profile: { nick: 'stored-data' } },
      ],
    });
    expect(await f.Model.collection.findOne({ name: 'empty' })).toHaveProperty('profile', {});
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      for (const [name, filter] of [
        ['empty', { profile: {} }],
        ['literal', { profile: { $eq: { nick: 'stored-data' } } }],
        ['literal', { profile: { $in: [{ nick: 'stored-data' }] } }],
      ] as const) {
        expect
          .soft(await service.find(filter, { select: ['name'] }, { ...quiet, includeCount: true }))
          .toMatchObject({ success: true, data: [{ name }], totalCount: 1 });
      }
    });
  });

  it('preserves dotted persisted data, Date, ObjectId, Buffer and RegExp operands', async () => {
    const when = new Date('2026-10-12T12:00:00.000Z');
    const owner = new mongoose.Types.ObjectId();
    const bytes = Buffer.from('arl02-literal');
    const f = await fixture({
      seed: [decoy, { name: 'native', reconciliation: { display: {} }, when, owner, bytes }],
    });
    const filter = { name: /^native$/, 'reconciliation.display': {}, when, owner, bytes };
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      expect(await service.findOne(filter, { select: ['name'] }, quiet)).toMatchObject({ data: { name: 'native' } });
      expect(await service.count(filter)).toMatchObject({ data: 1 });
      expect(await service.exists(filter)).toMatchObject({ data: true });
      // The dotted predicate alone must still restrict the result set.
      expect(await service.count({ 'reconciliation.display': {} })).toMatchObject({ data: 1 });
    });
    expect(filter.when).toBe(when);
    expect(filter.owner).toBe(owner);
    expect(filter.bytes).toBe(bytes);
    expect(filter.name).toEqual(/^native$/);
  });

  it.each([
    ['root', { display: { $in: [{}] }, name: 'kept' }],
    ['logical', { $or: [{ display: 'ignored' }, { name: 'kept' }] }],
    ['dotted', { 'profile.nick.deep': { $eq: {} }, name: 'kept' }],
    ['nested shorthand', { profile: { nick: 'ignored', label: 'kept' } }],
    ['embedded $elemMatch', { contacts: { $elemMatch: { nick: 'ignored', label: 'kept' } } }],
    ['embedded logical', { contacts: { $elemMatch: { $or: [{ nick: 'ignored' }, { label: 'kept' }] } } }],
    ['embedded $not', { contacts: { $not: { $elemMatch: { nick: 'ignored', label: 'decoy' } } } }],
    ['embedded $all', { contacts: { $all: [{ $elemMatch: { nick: 'ignored', label: 'kept' } }] } }],
    ['nested dotted container', { 'contacts.notes': { $elemMatch: { excerpt: 'ignored', label: 'kept' } } }],
  ])('strips real %s virtual clauses and keeps persisted siblings', async (_label, filter) => {
    const f = await fixture({
      seed: ['decoy', 'kept'].map((name) => ({
        name,
        profile: { label: name },
        contacts: [{ label: name, notes: [{ label: name }] }],
      })),
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      expect
        .soft(await service.find(filter, { select: ['name'] }, { ...quiet, includeCount: true }))
        .toMatchObject({ success: true, data: [{ name: 'kept' }], count: 1, totalCount: 1 });
      expect.soft(await service.count(filter)).toMatchObject({ success: true, data: 1 });
      expect.soft(await service.exists(filter)).toMatchObject({ success: true, data: true });
    });
    expect(f.getter).not.toHaveBeenCalled();
  });

  it.each([
    ['$and', ['kept']],
    ['$or', ['decoy', 'kept']],
    ['$nor', []],
  ])('retains an originally empty %s branch when removing a virtual sibling', async (operator, names) => {
    const f = await fixture({ seed: [{ name: 'decoy' }, { name: 'kept' }] });
    await f.execute(async (req) => {
      const result = await req.macl
        .getService(f.modelName)
        .find(
          { [operator as string]: [{}, { display: 'ignored' }, { name: 'kept' }] },
          { select: ['name'], sort: 'name' },
          { ...quiet, includeCount: true },
        );
      expect(result).toMatchObject({
        success: true,
        data: (names as string[]).map((name) => ({ name })),
        totalCount: names.length,
      });
    });
  });

  it('removes wholly virtual clauses while retaining genuine $elemMatch:{} and $in:[] predicates', async () => {
    const f = await fixture({
      seed: [{ name: 'absent' }, { name: 'empty', contacts: [] }, { name: 'one', contacts: [{}] }],
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      for (const filter of [
        { display: 'ignored' },
        { profile: { nick: 'ignored' } },
        { contacts: { $elemMatch: { nick: 'ignored' } } },
      ]) {
        expect.soft(await service.count(filter)).toMatchObject({ success: true, data: 3 });
      }
      expect.soft(await service.count({ contacts: { $elemMatch: {} } })).toMatchObject({ data: 1 });
      expect.soft(await service.count({ name: { $in: [] } })).toMatchObject({ data: 0 });
      expect.soft(await service.count({ name: { $nin: [] } })).toMatchObject({ data: 3 });
    });
  });

  it('keeps $nin/$not and literal $all operands instead of changing their matching sets', async () => {
    const literal = { display: 'literal' };
    const f = await fixture({ seed: [decoy, { name: 'literal', reconciliation: literal, payload: [literal, {}] }] });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      for (const filter of [
        { reconciliation: { $nin: [literal, {}] } },
        { reconciliation: { $not: { $eq: literal } } },
        { payload: { $all: [literal, {}] } },
      ]) {
        const expected = await f.Model.collection.find(filter).project({ name: 1 }).toArray();
        const result = await service.find(filter, { select: ['name'] }, quiet);
        expect.soft(result).toMatchObject({ success: true, data: expected });
      }
    });
  });

  it('shares the literal/query boundary with dedicated subdocument filtering', async () => {
    const f = await fixture({
      seed: [
        {
          name: 'parent',
          contacts: [
            { label: 'decoy', reconciliation: { settled: true } },
            { label: 'empty', reconciliation: {} },
            { label: 'literal', reconciliation: { nick: 'data' } },
          ],
        },
      ],
    });
    for (const [filter, labels] of [
      [{ reconciliation: {} }, ['empty']],
      [{ reconciliation: { $in: [{}] } }, ['empty']],
      [{ reconciliation: { $eq: { nick: 'data' } } }, ['literal']],
      [{ nick: 'ignored' }, ['decoy', 'empty', 'literal']],
    ] as const) {
      const res = await request(f.app)
        .post(`${f.basePath}/${f.rows[0]._id}/contacts/__query`)
        .send({ filter, select: ['label'] })
        .expect(200);
      expect.soft(res.body.map((row: { label: string }) => row.label)).toEqual(labels);
    }
  });

  it('leaves expression operands and $literal data intact', async () => {
    const literal = { display: 'data', empty: {} };
    const f = await fixture({ seed: [decoy, { name: 'literal', reconciliation: literal }] });
    await f.execute(async (req) => {
      const filter = { $expr: { $eq: ['$reconciliation', { $literal: literal }] } };
      const service = req.macl.getService(f.modelName);
      expect(await service.count(filter)).toMatchObject({ success: false, code: 'bad_request' });
      expect(await service.countTrusted(filter)).toMatchObject({ success: true, data: 1 });
    });
  });
});

describe('ARL-02 authorization constraints survive virtual cleanup', () => {
  it('retains literal row policy in prepared queries and standalone count/exists', async () => {
    const base = () => ({ tenant: 'allowed', reconciliation: {} });
    const f = await fixture({
      seed: [{ ...decoy, tenant: 'allowed' }],
      options: { baseFilter: { read: base, list: base, update: base } },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const filter = { display: 'ignored' };
      expect(await service.findOne(filter, {}, quiet)).toMatchObject({ code: 'not_found' });
      expect(await service.count(filter)).toMatchObject({ data: 0 });
      expect(await service.exists(filter)).toMatchObject({ data: false });
      expect(await service.updateOne(filter, { state: 'WRONG' }, {}, quiet)).toMatchObject({ code: 'not_found' });
      expect(
        await service.findOne(
          filter,
          {},
          {
            ...quiet,
            authorization: { rows: { mode: 'scope', filter: { reconciliation: {} } } },
          },
        ),
      ).toMatchObject({ code: 'not_found' });
    });
    expect(f.saves).toEqual([]);
    expect(await f.Model.collection.findOne({ name: 'decoy' })).toMatchObject(decoy);
  });

  it('keeps identifiers and required joins alongside empty-object predicates', async () => {
    const f = await fixture({
      seed: [
        { ...decoy, join: 'parent' },
        { ...empty, join: 'parent' },
        { name: 'other-join', reconciliation: {}, join: 'other' },
      ],
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const scoped = { ...quiet, authorization: { rows: { mode: 'scope' as const, filter: { reconciliation: {} } } } };
      expect(await service.findById(String(f.rows[0]._id), {}, scoped)).toMatchObject({ code: 'not_found' });
      expect(await service.updateById(String(f.rows[0]._id), { state: 'WRONG' }, {}, scoped)).toMatchObject({
        code: 'not_found',
      });
      const result = await service.findById(
        String(f.rows[0]._id),
        {
          select: ['name'],
          include: (['list', 'read', 'count'] as const).map((op) => ({
            model: f.modelName,
            op,
            path: op,
            localField: 'join',
            foreignField: 'join',
            filter: { reconciliation: {} },
            args: { select: ['name'] },
          })),
        },
        quiet,
      );
      expect(result).toMatchObject({
        success: true,
        data: { name: 'decoy', list: [{ name: 'empty' }], read: { name: 'empty' }, count: 1 },
      });
    });
    expect(f.saves).toEqual([]);
    expect(await f.Model.collection.findOne({ name: 'decoy' })).toMatchObject(decoy);
  });

  it.each(['input', 'base'] as const)('%s false remains terminal before all reads and mutations', async (denial) => {
    const deny = () => false;
    const f = await fixture({
      options: denial === 'base' ? { baseFilter: { read: deny, list: deny, update: deny } } : {},
    });
    const filter: Filter = denial === 'input' ? false : { display: 'ignored', reconciliation: {} };
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      for (const result of [
        await service.findOne(filter, {}, quiet),
        await service.find(filter, {}, { ...quiet, includeCount: true }),
        await service.count(filter),
        await service.exists(filter),
        await service.updateOne(filter, { state: 'WRONG' }, {}, quiet),
        await service.upsert(filter, { name: 'WRONG' }, {}, quiet),
      ])
        expect(result).toMatchObject({ success: false, code: 'forbidden', query: { filter: false } });
    });
    expect(f.calls).toEqual([]);
    expect(f.saves).toEqual([]);
    expect(f.getter).not.toHaveBeenCalled();
    expect(await f.Model.collection.countDocuments({})).toBe(1);
  });
});
