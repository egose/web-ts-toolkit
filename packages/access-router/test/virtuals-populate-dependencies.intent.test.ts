import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
let serial = 0;
afterEach(() => {
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^DpvIntent/);
});

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

async function fixture(hydration: 'lean' | 'hydrated') {
  const api = createAccessRuntime();
  runtimes.push(api);
  const n = ++serial;
  const Target = mongoose.model(
    `DpvIntentTarget${n}`,
    new mongoose.Schema({ name: String, balance: Number, stamp: Date, token: Buffer }),
  );
  const target = await Target.create({
    name: 'public name',
    balance: 7,
    stamp: new Date('2026-01-02'),
    token: Buffer.from('original'),
  });
  const ref = { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName, default: target._id };
  const Source = mongoose.model(
    `DpvIntentSource${n}`,
    new mongoose.Schema({ name: String, account: ref, spare: ref, children: [{ name: String, account: ref }] }),
  );
  api.createRouter(Target, {
    operationAccess: { read: true, list: false },
    permissionSchema: { name: true, balance: true, stamp: true, token: true },
  });
  const getter = vi.fn((_doc, _permissions, _context, populated) => populated.account?.balance);
  const virtual = { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance -_id' }] };
  api.createRouter(Source, {
    operationAccess: { read: true, list: true, create: true, update: true },
    permissionSchema: {
      name: true,
      account: true,
      spare: true,
      eligible: true,
      children: { $: true, sub: { name: true, account: true, eligible: true } },
    },
    virtuals: { eligible: virtual, children: { sub: { eligible: virtual } } },
    hydration: {
      find: hydration,
      findOne: hydration,
      findById: hydration,
      publicRead: hydration,
      publicList: hydration,
    },
  } as never);
  const source = await Source.create({ name: 'source', children: [{ name: 'first' }, { name: 'second' }] });
  const app = express();
  app.use(express.json());
  app.use(api());
  let callback: (req: ModelRequest) => Promise<unknown>;
  let value: unknown;
  let failure: unknown;
  app.post('/probe', async (req, res) => {
    try {
      value = await callback(req as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    Target,
    Source,
    source,
    target,
    getter,
    hold(key: string, model = Source.modelName) {
      const entered = latch();
      const held = latch();
      api.setModelOption(model, key, async () => {
        entered.resolve();
        await held.promise;
        return {};
      });
      return { entered: entered.promise, release: held.resolve };
    },
    async execute<T>(run: (req: ModelRequest) => Promise<T>): Promise<T> {
      callback = run;
      failure = undefined;
      await request(app).post('/probe').send({}).expect(200);
      if (failure) throw failure;
      return value as T;
    },
  };
}

describe.each(['lean', 'hydrated'] as const)('DPV-07 owned intent (%s)', (hydration) => {
  it.each(['findById', '_read', '_readFilter', '_list'] as const)(
    '%s retains nested selections through identifier/row suspension',
    async (method) => {
      const f = await fixture(hydration);
      const pause = f.hold(`baseFilter.${method === '_list' ? 'list' : 'read'}`);
      const result = await f.execute(async (req) => {
        const service = req.macl.getPublicService(f.Source.modelName);
        const args = { select: ['eligible', '-_id'] };
        const pending =
          method === '_readFilter' || method === '_list'
            ? service[method]({ _id: f.source._id }, args, quiet)
            : service[method](String(f.source._id), args, quiet);
        await pause.entered;
        args.select.push('account');
        pause.release();
        return pending;
      });
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      const row = result.kind === 'list' ? result.data[0] : result.data;
      expect(row).toMatchObject({ eligible: 7 });
      expect(row).not.toHaveProperty('account');
    },
  );

  it.each(['updateOne', 'updateById', 'upsert', '_upsert'] as const)(
    '%s owns mutation defaults and populate masks before lookup awaits',
    async (method) => {
      const f = await fixture(hydration);
      const pause = f.hold('baseFilter.update');
      const result = await f.execute(async (req) => {
        const service = req.macl.getPublicService(f.Source.modelName);
        const select = ['name', '-_id'];
        const args = { select: ['account', 'eligible'], populate: [{ path: 'account', select }] };
        const pending =
          method === '_upsert'
            ? service._upsert({ _id: String(f.source._id), name: 'changed' }, args, quiet)
            : method === 'updateById'
              ? service.updateById(String(f.source._id), { name: 'changed' }, args, quiet)
              : service[method]({ _id: f.source._id }, { name: 'changed' }, args, quiet);
        await pause.entered;
        select.push('balance');
        service.defaults = { updateOneArgs: { select: ['spare'] } };
        pause.release();
        return pending;
      });
      expect(result).toMatchObject({ success: true, data: { eligible: 7, account: { name: 'public name' } } });
      if (!result.success) throw new Error(result.code);
      expect(result.data.account).toEqual({ name: 'public name' });
      expect((await f.Source.findById(f.source._id))?.name).toBe('changed');
    },
  );

  it('owns public implicit returning keys through decorator and task awaits', async () => {
    const f = await fixture(hydration);
    const pause = f.hold('baseFilter.update');
    const result = await f.execute(async (req) => {
      const service = req.macl.getPublicService(f.Source.modelName);
      const data: Record<string, unknown> = { name: 'changed' };
      const tasks: Array<{ type: string; args: unknown }> = [];
      const pending = service._update(String(f.source._id), data, { tasks }, { ...quiet, returningAll: false });
      await pause.entered;
      data.account = f.target._id;
      tasks.push({ type: 'MOVE', args: [{ src: 'name', dest: 'moved' }] });
      pause.release();
      return pending;
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    expect(result.data).toMatchObject({ name: 'changed' });
    expect(result.data).not.toHaveProperty('account');
  });

  it.each(['create', '_create', 'upsert', '_upsert'] as const)(
    '%s owns create-branch populate intent through target row suspension',
    async (method) => {
      const f = await fixture(hydration);
      const pause = f.hold('baseFilter.read', f.Target.modelName);
      const result = await f.execute(async (req) => {
        const service = req.macl.getPublicService(f.Source.modelName);
        const select = ['name', '-_id'];
        const args = { select: ['account', 'eligible'], populate: [{ path: 'account', select }] };
        const pending =
          method === 'upsert'
            ? service.upsert({ name: 'missing' }, { name: 'created' }, args, quiet)
            : service[method]({ name: 'created' }, args, quiet);
        await pause.entered;
        select.push('balance');
        args.populate[0].path = 'spare';
        service.defaults = { createArgs: { select: ['spare'] } };
        pause.release();
        return pending;
      });
      expect(result.success).toBe(true);
      if (!result.success || result.kind !== 'list') throw new Error(result.code);
      expect(result.data[0]).toMatchObject({ eligible: 7, account: { name: 'public name' } });
      expect(result.data[0].account).toEqual({ name: 'public name' });
      expect(result.data[0]).not.toHaveProperty('spare');
      expect(await f.Source.countDocuments({ name: 'created' })).toBe(1);
    },
  );

  it('owns options and added/replaced ordinary descriptors through source suspension', async () => {
    const f = await fixture(hydration);
    const pause = f.hold('baseFilter.read');
    const result = await f.execute(async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      const populate = [{ path: 'account', select: ['name', '-_id'], match: { name: 'public name' } }];
      const options = { ...quiet, populateAccess: 'read' as 'read' | 'list' };
      const pending = service.findOne(
        { _id: f.source._id },
        {
          select: ['account', 'spare', 'eligible', '-_id'],
          populate,
        },
        options,
      );
      await pause.entered;
      options.populateAccess = 'list';
      populate[0] = { path: 'spare', select: ['balance'], match: { name: 'no match' } };
      populate.push({ path: 'account', select: ['balance'], match: { name: 'no match' } });
      pause.release();
      return pending;
    });
    expect(result).toMatchObject({ success: true, data: { eligible: 7 } });
    if (!result.success) throw new Error(result.code);
    expect(result.data.account).toEqual({ name: 'public name' });
    expect(String(result.data.spare)).toBe(String(f.target._id));
  });

  it('captures by-ID default population and target policy before identifier resolution awaits', async () => {
    const f = await fixture(hydration);
    // A separately controlled identifier hook proves capture precedes row preparation.
    const entered = latch();
    const held = latch();
    f.api.setModelOption(f.Source.modelName, 'resolveIdFilter', async () => {
      entered.resolve();
      await held.promise;
      return { _id: f.source._id };
    });
    const results = await f.execute(async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      const select = ['name', '-_id'];
      service.defaults = {
        findByIdArgs: { select: ['account', 'eligible', '-_id'], populate: [{ path: 'account', select }] },
        findOneArgs: { select: ['spare'] },
      };
      const pending = service.findById('custom', undefined, quiet);
      await entered.promise;
      select.push('balance');
      service.defaults = { findByIdArgs: { select: ['eligible', '-_id'] } };
      f.api.setModelOption(f.Target.modelName, 'permissionSchema.name', false);
      held.resolve();
      return [await pending, await service.findById('custom', undefined, quiet)];
    });
    expect(results[0]).toMatchObject({ success: true, data: { eligible: 7 } });
    expect(results[0].data.account).toEqual({ name: 'public name' });
    expect(results[0].data).not.toHaveProperty('spare');
    expect(results[1].data).not.toHaveProperty('account');
  });

  it('captures both upsert branch default buckets before lookup', async () => {
    const f = await fixture(hydration);
    const pause = f.hold('baseFilter.update');
    const result = await f.execute(async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      service.defaults = {
        updateOneArgs: { select: ['name'], populate: [{ path: 'spare', select: 'name -_id' }] },
        createArgs: { select: ['account', 'eligible'], populate: [{ path: 'account', select: 'name -_id' }] },
      };
      const pending = service.upsert({ name: 'not found' }, { name: 'created' }, undefined, quiet);
      await pause.entered;
      service.defaults = { createArgs: { select: ['spare'], populate: [{ path: 'spare', select: 'balance' }] } };
      f.api.setModelOption(f.Target.modelName, 'permissionSchema.name', false);
      pause.release();
      return pending;
    });
    expect(result).toMatchObject({ success: true, data: [{ eligible: 7, account: { name: 'public name' } }] });
    if (!result.success || result.kind !== 'list') throw new Error(result.code);
    expect(result.data[0].account).toEqual({ name: 'public name' });
    expect(result.data[0]).not.toHaveProperty('spare');
    expect(result.data[0]).not.toHaveProperty('name');
  });

  it('owns in-place assigned default bags and explicit empty population suppresses defaults', async () => {
    const f = await fixture(hydration);
    const pause = f.hold('baseFilter.read');
    const results = await f.execute(async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      const select = ['name', '-_id'];
      const defaults = {
        findOneArgs: { select: ['account', 'eligible', '-_id'], populate: [{ path: 'account', select }] },
        findOneOptions: { populateAccess: 'read' as 'read' | 'list' },
      };
      service.defaults = defaults;
      const pending = service.findOne({ _id: f.source._id }, undefined, quiet);
      await pause.entered;
      select.push('balance');
      defaults.findOneOptions.populateAccess = 'list';
      defaults.findOneArgs.select.push('spare');
      pause.release();
      const first = await pending;
      const second = await service.findOne({ _id: f.source._id }, { populate: [] }, quiet);
      return [first, second];
    });
    expect(results[0].success).toBe(true);
    expect(results[0].data.account).toEqual({ name: 'public name' });
    expect(results[0].data).not.toHaveProperty('spare');
    expect(String(results[1].data.account)).toBe(String(f.target._id));
    expect(results[1].data).toHaveProperty('spare');
  });

  it('captures source getters and ordinary/private target policies with template intent', async () => {
    const f = await fixture(hydration);
    const pause = f.hold('baseFilter.read', f.Target.modelName);
    const replacement = vi.fn(() => 99);
    const results = await f.execute(async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      const pending = service.new({ select: ['-_id', '-eligible'] }, quiet);
      await pause.entered;
      f.api.setModelOption(f.Source.modelName, 'virtuals.eligible', { get: replacement });
      f.api.setModelOption(f.Target.modelName, 'operationAccess.read', false);
      pause.release();
      return [await pending, await service.new({ select: [] }, quiet)];
    });
    expect(results[0]).toMatchObject({ success: true, data: { eligible: 7 } });
    expect(results[1]).toMatchObject({ success: true, data: { eligible: 99 } });
    expect(f.getter).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(await f.Source.countDocuments()).toBe(1);
  });

  it('owns native public match values and access before a target guard awaits', async () => {
    const f = await fixture(hydration);
    const entered = latch();
    const held = latch();
    f.api.setModelOption(f.Target.modelName, 'operationAccess.read', async () => {
      entered.resolve();
      await held.promise;
      return true;
    });
    const result = await f.execute(async (req) => {
      const stamp = new Date('2026-01-02');
      const token = Buffer.from('original');
      const descriptor = { path: 'account', select: ['name', '-_id'], match: { stamp, token }, access: 'read' };
      const populate = [descriptor];
      const pending = req.macl
        .getService(f.Source.modelName)
        .findOne({ _id: f.source._id }, { select: ['account', 'eligible', 'spare', '-_id'], populate }, quiet);
      await entered.promise;
      stamp.setUTCFullYear(2030);
      token.fill(0);
      descriptor.select.push('balance');
      descriptor.access = 'list';
      populate.push({ path: 'spare', select: ['balance'], match: { stamp, token }, access: 'read' });
      held.resolve();
      return pending;
    });
    expect(result).toMatchObject({ success: true, data: { eligible: 7, account: { name: 'public name' } } });
    if (!result.success) throw new Error(result.code);
    expect(result.data.account).toEqual({ name: 'public name' });
    expect(String(result.data.spare)).toBe(String(f.target._id));
  });

  it('owns runtime default bags and observes replacements on the next public call', async () => {
    const f = await fixture(hydration);
    const pause = f.hold('baseFilter.read');
    const original = { findOneArgs: { select: ['eligible', '-_id'] } };
    f.api.setModelOption(f.Source.modelName, 'defaults', original);
    const results = await f.execute(async (req) => {
      const service = req.macl.getPublicService(f.Source.modelName);
      const pending = service._readFilter({ _id: f.source._id }, undefined, quiet);
      await pause.entered;
      original.findOneArgs.select.push('account');
      f.api.setModelOption(f.Source.modelName, 'defaults', {
        findOneArgs: { select: ['account', 'eligible', '-_id'] },
      });
      pause.release();
      return [await pending, await service._readFilter({ _id: f.source._id }, undefined, quiet)];
    });
    expect(results[0]).toMatchObject({ success: true, data: { eligible: 7 } });
    expect(results[0].data).not.toHaveProperty('account');
    expect(results[1].data).toHaveProperty('account');
  });

  it.each(['read', 'list'] as const)('owns %s include target defaults before the source awaits', async (op) => {
    const f = await fixture(hydration);
    const pause = f.hold('baseFilter.read');
    f.api.setModelOption(f.Source.modelName, 'defaults', {
      findOneArgs: { select: ['eligible', '-_id'] },
      findArgs: { select: ['eligible', '-_id'] },
    });
    const result = await f.execute(async (req) => {
      const pending = req.macl.getService(f.Source.modelName).findOne(
        { _id: f.source._id },
        {
          select: ['name'],
          include: [{ model: f.Source.modelName, op, path: 'related', localField: '_id', foreignField: '_id' }],
        },
        quiet,
      );
      await pause.entered;
      f.api.setModelOption(f.Source.modelName, 'defaults', {
        findOneArgs: { select: ['account', 'eligible', '-_id'] },
        findArgs: { select: ['account', 'eligible', '-_id'] },
      });
      pause.release();
      return pending;
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    const row = op === 'read' ? result.data.related : result.data.related[0];
    expect(row).toHaveProperty('eligible', 7);
    expect(row).not.toHaveProperty('account');
  });

  it('captures include gates, preflight and getters before live option replacement', async () => {
    const f = await fixture(hydration);
    const pause = f.hold('baseFilter.read');
    const result = await f.execute(async (req) => {
      const pending = req.macl.getService(f.Source.modelName).findOne(
        { _id: f.source._id },
        {
          select: ['name'],
          include: [
            {
              model: f.Source.modelName,
              op: 'read',
              path: 'related',
              localField: '_id',
              foreignField: '_id',
              args: { select: ['eligible', '-_id'] },
            },
          ],
        },
        quiet,
      );
      await pause.entered;
      f.api.setModelOption(f.Source.modelName, 'operationAccess.read', false);
      f.api.setModelOption(f.Source.modelName, 'permissionSchema.related', true);
      f.api.setModelOption(f.Source.modelName, 'virtuals.related', { get: () => 'late collision' });
      f.api.setModelOption(f.Source.modelName, 'virtuals.eligible', { get: () => 99 });
      pause.release();
      return pending;
    });
    expect(result).toMatchObject({ success: true, data: { related: { eligible: 7 } } });
    expect(result.data.related).not.toHaveProperty('account');
  });

  it('does not mutate frozen caller projection/populate bags during fetch union', async () => {
    const f = await fixture(hydration);
    const select = Object.freeze(['account', 'eligible', '-_id']);
    const targetSelect = Object.freeze(['name', '-_id']);
    const descriptor = Object.freeze({ path: 'account', select: targetSelect });
    const args = Object.freeze({ select, populate: Object.freeze([descriptor]) });
    const result = await f.execute((req) =>
      req.macl
        .getService(f.Source.modelName)
        .findOne({ _id: f.source._id }, args as never, Object.freeze({ ...quiet })),
    );
    expect(result).toMatchObject({ success: true, data: { eligible: 7, account: { name: 'public name' } } });
    expect(select).toEqual(['account', 'eligible', '-_id']);
    expect(targetSelect).toEqual(['name', '-_id']);
    expect(args.populate).toEqual([descriptor]);
  });

  it('owns dedicated child populate selection before parent row policy awaits', async () => {
    const f = await fixture(hydration);
    const pause = f.hold('baseFilter.read');
    const result = await f.execute(async (req) => {
      const select = ['name', '-_id'];
      const options = { select: ['account', 'eligible'], populate: [{ path: 'account', select }] };
      const pending = req.macl
        .getService(f.Source.modelName)
        .readSub(String(f.source._id), 'children', String(f.source.children[0]._id), options);
      await pause.entered;
      select.push('balance');
      options.populate.push({ path: 'spare', select: ['balance'] });
      pause.release();
      return pending;
    });
    expect(result).toMatchObject({ success: true, data: { eligible: 7 } });
    if (!result.success) throw new Error(result.code);
    expect(result.data.account).toEqual({ name: 'public name' });
  });

  it('owns dedicated list filters and create ordering options before parent suspension', async () => {
    const f = await fixture(hydration);
    const pause = f.hold('baseFilter.read');
    const results = await f.execute(async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      const options = { filter: { name: 'first' }, select: ['name', 'eligible'] };
      const pending = service.listSub(String(f.source._id), 'children', options);
      await pause.entered;
      options.filter.name = 'second';
      options.select.push('account');
      pause.release();
      const first = await pending;
      const createPause = f.hold('baseFilter.update');
      const ordering = { addFirst: true };
      const created = service.createSub(String(f.source._id), 'children', { name: 'prepended' }, ordering);
      await createPause.entered;
      ordering.addFirst = false;
      createPause.release();
      return [first, await created];
    });
    expect(results[0]).toMatchObject({ success: true, count: 1, data: [{ name: 'first', eligible: 7 }] });
    expect(results[0].data[0]).not.toHaveProperty('account');
    expect(results[1].success).toBe(true);
    expect((await f.Source.findById(f.source._id))?.children[0].name).toBe('prepended');
  });
});
