import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';

let mongo: MongoMemoryServer;
let serial = 0;
const connections: mongoose.Connection[] = [];
const quiet = { includePermissions: false, includeFieldPermissions: false };
const select = ['name', 'secret', 'children', 'ref'];
const actors = [
  { label: 'denied A / admin B', a: [], b: ['admin'], granted: false },
  { label: 'admin A / null B', a: ['admin'], b: null, granted: true },
  { label: 'admin A / undefined B', a: ['admin'], b: undefined, granted: true },
] as const;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
}, 120_000);
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(connections.splice(0).map((connection) => connection.destroy()));
});
afterAll(async () => mongo?.stop());

async function fixture(actor: (typeof actors)[number] = actors[0]) {
  const suffix = ++serial;
  const name = `ArlRetained${suffix}`;
  const targetName = `${name}Target`;
  const targetIds = { a: new mongoose.Types.ObjectId(), b: new mongoose.Types.ObjectId() };
  const hooks: Array<{ owner: string; admin: boolean; name: unknown; request: unknown }> = [];
  const owners = await Promise.all(
    ['a', 'b'].map(async (owner, index) => {
      const connection = await mongoose.createConnection(mongo.getUri(), { dbName: `${name}-${owner}` }).asPromise();
      connections.push(connection);
      const runtime = createAccessRuntime();
      const queries: Array<{ model: string; lean: boolean }> = [];
      const track = (schema: mongoose.Schema, model: string) => {
        for (const op of ['find', 'findOne'] as const)
          schema.pre(op, function () {
            queries.push({ model, lean: this.mongooseOptions().lean === true });
          });
        return schema;
      };
      runtime.setGlobalOptions({ globalPermissions: () => (index ? actor.b : actor.a) });
      const target = connection.model(
        targetName,
        track(new mongoose.Schema({ name: String, secret: String, key: String, tenant: String }), targetName),
      );
      const model = connection.model(
        name,
        track(
          new mongoose.Schema({
            _id: { type: String, default: 'created' },
            name: String,
            secret: String,
            tenant: String,
            slug: String,
            alias: String,
            ref: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
            children: [{ _id: String, name: String, secret: String }],
          }),
          name,
        ),
      );
      await model.create(
        ['a', 'b'].map((tenant) => ({
          _id: tenant,
          name: `${owner}-${tenant}`,
          secret: `${owner}-${tenant}-secret`,
          tenant,
          slug: tenant === 'a' ? 'lookup' : 'other',
          alias: tenant === 'b' ? 'lookup' : 'other',
          ref: targetIds[tenant],
          children: [{ _id: 'child', name: `${owner}-${tenant}-child`, secret: `${owner}-${tenant}-child-secret` }],
        })),
      );
      await target.create(
        ['a', 'b'].map((tenant) => ({
          _id: targetIds[tenant],
          name: `${owner}-${tenant}-target`,
          secret: `${owner}-${tenant}-target-secret`,
          key: tenant,
          tenant,
        })),
      );
      runtime.createRouter(target, {
        operationAccess: true,
        permissionSchema: { name: true, secret: 'admin', key: true },
        baseFilter: () => ({ tenant: owner }),
        stripPermissionsField: true,
      });
      runtime.createRouter(model, {
        hydration: { find: 'lean', findOne: 'lean', findById: 'lean', publicRead: 'lean', publicList: 'lean' },
        operationAccess: true,
        permissionSchema: {
          name: true,
          secret: 'admin',
          ref: true,
          children: { read: true, list: true, update: true, sub: { name: true, secret: 'admin' } },
        },
        alwaysSelectFields: ['secret'],
        stripPermissionsField: true,
        resolveIdFilter: (id) => (id === 'deny' ? false : { [index ? 'alias' : 'slug']: id }),
        docPermissions: function (doc, permissions) {
          hooks.push({ owner, admin: permissions.has('admin'), name: doc.name, request: this });
          return {};
        },
      });
      return { runtime, model, target, queries };
    }),
  );
  const [a, b] = owners;
  type Core = ModelRequest['macl'];
  let original!: Core;
  let req!: ModelRequest;
  let service!: ReturnType<Core['getService']>;
  let publicService!: ReturnType<Core['getPublicService']>;
  const app = express();
  app.use(a.runtime());
  app.use((request, _response, next) => {
    req = request as ModelRequest;
    original = req.macl;
    service = original.getService(name);
    publicService = original.getPublicService(name);
    next();
  });
  app.use(b.runtime());
  async function run(
    check: (state: {
      req: ModelRequest;
      original: Core;
      service: typeof service;
      publicService: typeof publicService;
      replacement: typeof service;
    }) => Promise<void>,
  ) {
    let failure: unknown;
    app.get('/probe', async (_req, res) => {
      try {
        await check({ req, original, service, publicService, replacement: req.macl.getService(name) });
      } catch (error) {
        failure = error;
      }
      res.sendStatus(204);
    });
    await request(app).get('/probe').expect(204);
    if (failure) throw failure;
  }
  return { a, b, name, targetName, hooks, run };
}

function data(result: any): any {
  expect(result.success, JSON.stringify(result)).toBe(true);
  return result.data;
}

describe('ARL-11 retained model/public service owner', () => {
  it.each(['find', 'findOne', 'findById', '_list', '_read', '_readFilter'] as const)(
    '%s captures owner hydration before suspension and observes fresh settings on the next call',
    async (entry) => {
      const f = await fixture();
      const key = entry === '_list' ? 'publicList' : entry.startsWith('_') ? 'publicRead' : entry;
      f.a.runtime.setModelOption(f.name, 'hydration', { [key]: 'hydrated' });
      f.b.runtime.setModelOption(f.name, 'hydration', { [key]: 'lean' });
      let entered!: () => void;
      let release!: () => void;
      const suspended = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      let first = true;
      f.a.runtime.setModelOption(f.name, 'baseFilter', async () => {
        if (first) {
          first = false;
          entered();
          await resume;
        }
        return {};
      });
      await f.run(async ({ service, publicService }) => {
        const call = () =>
          entry === 'findById'
            ? service.findById('lookup', {}, quiet)
            : entry === '_read'
              ? publicService._read('lookup', {}, quiet)
              : entry.startsWith('_')
                ? publicService[entry]({}, {}, quiet)
                : service[entry]({}, {}, quiet);
        const pending = call();
        await suspended;
        f.a.runtime.setModelOption(f.name, 'hydration', { [key]: 'lean' });
        release();
        data(await pending);
        expect(f.a.queries.filter((query) => query.model === f.name).map((query) => query.lean)).toEqual([false]);
        data(await call());
        expect(f.a.queries.filter((query) => query.model === f.name).map((query) => query.lean)).toEqual([false, true]);
        expect(f.b.queries).toEqual([]);
      });
    },
  );
  for (const actor of actors)
    describe(actor.label, () => {
      for (const entry of ['findOne', 'find', '_readFilter', '_list'] as const)
        it(`${entry} retains actor, hooks and authenticated output`, async () => {
          const f = await fixture(actor);
          await f.run(async ({ req, original, service, publicService, replacement }) => {
            const current = req.macl;
            const result = entry.startsWith('_')
              ? await publicService[entry]({ _id: 'a' }, { select }, quiet)
              : await service[entry]({ _id: 'a' }, { select }, quiet);
            const output = data(result);
            const row = Array.isArray(output) ? output[0] : output;
            expect(row.name).toBe('a-a');
            expect(row.secret).toBe(actor.granted ? 'a-a-secret' : undefined);
            expect(
              f.hooks
                .filter((hook) => hook.owner === 'a')
                .every((hook) => hook.admin === actor.granted && hook.request === req),
            ).toBe(true);
            expect(f.hooks.some((hook) => hook.owner === 'a')).toBe(true);
            const fresh = await service.pickAllowedFields(row, 'read');
            expect(fresh.secret).toBe(row.secret);
            if (entry === 'findOne') {
              const handle = (result as any).context.documentAuthorization;
              expect(await service.pickAllowedFields(row, 'read', { documentAuthorization: handle })).toEqual(row);
              await expect(
                replacement.pickAllowedFields(row, 'read', { documentAuthorization: handle }),
              ).rejects.toThrow();
              const child = row.children[0];
              const childHandle = (result as any).context.getDocumentAuthorization(child);
              expect(childHandle).toBeDefined();
              expect(await service.pickAllowedFields(child, 'read', { documentAuthorization: childHandle })).toEqual(
                child,
              );
              await expect(
                replacement.pickAllowedFields(child, 'read', { documentAuthorization: childHandle }),
              ).rejects.toThrow();
            }
            const other = data(await replacement.findOne({ _id: 'a' }, { select }, quiet));
            expect(other.name).toBe('b-a');
            expect(other.secret).toBe(actor.granted ? undefined : 'b-a-secret');
            expect(original.getPermissions().has('admin')).toBe(actor.granted);
            expect(req.macl).toBe(current);
            expect(req.macl.getPermissions().has('admin')).toBe(!actor.granted);
          });
        });

      it('distinct proves the original actor before any distinct persistence', async () => {
        const f = await fixture(actor);
        const dispatch = vi.spyOn(f.a.model, 'distinct');
        const collection = vi.spyOn(f.a.model.collection, 'distinct');
        await f.run(async ({ service, publicService, replacement }) => {
          for (const result of [await service.distinct('secret'), await publicService._distinct('secret')]) {
            if (actor.granted) expect(data(result).sort()).toEqual(['a-a-secret', 'a-b-secret']);
            else expect(result).toMatchObject({ success: false, code: 'forbidden' });
          }
          expect(dispatch).toHaveBeenCalledTimes(actor.granted ? 2 : 0);
          expect(collection).toHaveBeenCalledTimes(actor.granted ? 2 : 0);
          const other = await replacement.distinct('secret');
          if (actor.granted) expect(other).toMatchObject({ success: false, code: 'forbidden' });
          else expect(data(other).sort()).toEqual(['b-a-secret', 'b-b-secret']);
        });
      });

      it('mutation authority and save hooks stay with A', async () => {
        const f = await fixture(actor);
        for (const owner of [f.a, f.b])
          owner.runtime.setModelOption(f.name, 'baseFilter.update', (permissions) =>
            permissions.has('admin') ? {} : false,
          );
        const saves = vi.spyOn(f.a.model.prototype, 'save');
        const prepare: boolean[] = [];
        f.a.runtime.setModelOption(f.name, 'prepare.update', (value, permissions) => {
          prepare.push(permissions.has('admin'));
          return value;
        });
        f.b.runtime.setModelOption(f.name, 'prepare.update', () => {
          throw new Error('wrong owner prepare');
        });
        await f.run(async ({ service }) => {
          const result = await service.updateOne({ _id: 'a' }, { secret: 'changed' }, {}, quiet);
          if (actor.granted) {
            expect(data(result).secret).toBe('changed');
            expect(saves).toHaveBeenCalledTimes(1);
            expect(prepare).toEqual([true]);
          } else {
            expect(result).toMatchObject({ success: false });
            expect(saves).not.toHaveBeenCalled();
          }
          expect((await f.a.model.findById('a').lean())?.secret).toBe(actor.granted ? 'changed' : 'a-a-secret');
          expect((await f.b.model.findById('a').lean())?.secret).toBe('b-a-secret');
          expect(f.hooks.every((hook) => hook.owner === 'a' && hook.admin === actor.granted)).toBe(true);
        });
      });
    });

  for (const entry of ['findOne', 'find', 'count', 'exists', 'countByFieldValues'] as const)
    it(`${entry} keeps the originating row cache and connection`, async () => {
      const f = await fixture();
      const rowsA = vi.fn(() => ({ tenant: 'a' }));
      const rowsB = vi.fn(() => ({ tenant: 'b' }));
      f.a.runtime.setModelOption(f.name, 'baseFilter', rowsA);
      f.b.runtime.setModelOption(f.name, 'baseFilter', rowsB);
      await f.run(async ({ service, replacement }) => {
        // Warm B's read/list/count cache before A's first call.
        await replacement.findOne({}, {}, quiet);
        await replacement.find({}, {}, quiet);
        await replacement.count({}, 'count');
        const result =
          entry === 'findOne'
            ? await service.findOne({}, {}, quiet)
            : entry === 'find'
              ? await service.find({}, {}, quiet)
              : entry === 'countByFieldValues'
                ? await service.countByFieldValues('tenant', ['a', 'b'], {}, 'count')
                : entry === 'count'
                  ? await service.count({ tenant: 'a' }, 'count')
                  : await service.exists({ tenant: 'a' });
        const output = data(result);
        if (entry === 'findOne') expect(output.name).toBe('a-a');
        if (entry === 'find') expect(output.map((row) => row.name)).toEqual(['a-a']);
        if (entry === 'count') expect(output).toBe(1);
        if (entry === 'exists') expect(output).toBe(true);
        if (entry === 'countByFieldValues')
          expect([...output]).toEqual([
            ['a', 1],
            ['b', 0],
          ]);
        expect(rowsA).toHaveBeenCalled();
        expect(rowsB).toHaveBeenCalledTimes(3);
      });
    });

  it('ID helpers, mandatory IDs and newly acquired retained-core services remain A-owned', async () => {
    const f = await fixture();
    await f.run(async ({ service, publicService, original, req }) => {
      expect(await service.genIDFilter('lookup')).toEqual({ slug: 'lookup' });
      expect(data(await service.findById('lookup', {}, quiet)).name).toBe('a-a');
      expect(data(await publicService._read('lookup', {}, { ...quiet, tryList: false })).name).toBe('a-a');
      expect(await service.findById('deny', {}, quiet)).toMatchObject({ success: false, code: 'forbidden' });
      for (const owned of [
        original.getService(f.name),
        original.getPublicService(f.name),
        original.service(f.name),
        original.svc(f.name),
      ]) {
        expect(data(await owned.findOne({ _id: 'a' }, {}, quiet)).name).toBe('a-a');
      }
      expect(data(await req.macl.getService(f.name).findById('lookup', {}, quiet)).name).toBe('b-b');
      f.a.runtime.setModelOption(f.name, 'overrideFilter.read', () => ({ _id: 'b' }));
      expect(await service.getParentDoc('lookup', 'children')).toBeNull();
    });
  });

  for (const kind of ['read', 'list', 'count', 'correlated', 'populate'] as const)
    it(`${kind} targets use A's registry, row scope and private handles`, async () => {
      const f = await fixture();
      await f.run(async ({ service, original, req }) => {
        const include =
          kind === 'correlated'
            ? {
                model: f.targetName,
                mode: 'correlated',
                op: 'list',
                path: 'joined',
                filter: { _id: { $parent: 'ref' } },
              }
            : { model: f.targetName, op: kind, path: 'joined', localField: 'ref', foreignField: '_id' };
        const result = await service.findOne(
          { _id: 'a' },
          kind === 'populate' ? { populate: [{ path: 'ref' }] } : ({ include } as never),
          quiet,
        );
        const row = data(result);
        if (kind === 'count') expect(row.joined).toBe(1);
        else {
          const target = kind === 'populate' ? row.ref : Array.isArray(row.joined) ? row.joined[0] : row.joined;
          expect(target).toMatchObject({ name: 'a-a-target' });
          expect(String(target._id)).toBe(String(row.ref?._id ?? row.ref));
          expect(target).not.toHaveProperty('secret');
          const handle = (result as any).context.getDocumentAuthorization(target);
          expect(handle).toBeDefined();
          const access = kind === 'list' || kind === 'correlated' ? 'list' : 'read';
          expect(
            await original
              .getService(f.targetName)
              .pickAllowedFields(target, access, { documentAuthorization: handle }),
          ).toEqual(target);
          await expect(
            req.macl.getService(f.targetName).pickAllowedFields(target, access, { documentAuthorization: handle }),
          ).rejects.toThrow();
          await expect(service.pickAllowedFields(target, access, { documentAuthorization: handle })).rejects.toThrow();
        }
      });
    });

  for (const entry of ['listSub', 'readSub', 'updateSub'] as const)
    it(`${entry} keeps parent/child authority and IDs`, async () => {
      const f = await fixture();
      const saves = vi.spyOn(f.a.model.prototype, 'save');
      if (entry === 'updateSub')
        for (const owner of [f.a, f.b])
          owner.runtime.setModelOption(f.name, 'baseFilter.update', (permissions) =>
            permissions.has('admin') ? {} : false,
          );
      await f.run(async ({ service }) => {
        const result =
          entry === 'listSub'
            ? await service.listSub('lookup', 'children')
            : entry === 'readSub'
              ? await service.readSub('lookup', 'children', 'child')
              : await service.updateSub('lookup', 'children', 'child', { secret: 'leak' });
        if (entry === 'updateSub') {
          expect(result).toMatchObject({ success: false });
          expect(saves).not.toHaveBeenCalled();
        } else {
          const output = data(result);
          const child = Array.isArray(output) ? output[0] : output;
          expect(child.name).toBe('a-a-child');
          expect(child).not.toHaveProperty('secret');
        }
      });
    });

  it('fresh owner policy changes apply while a suspended call retains its immutable capture', async () => {
    const f = await fixture(actors[1]);
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.a.runtime.setModelOption(f.name, 'overrideFilter.read', async (filter) => {
      enter();
      await held;
      return filter;
    });
    await f.run(async ({ service }) => {
      const pending = service.findOne({ _id: 'a' }, { select }, quiet);
      await entered;
      f.a.runtime.setModelOption(f.name, 'permissionSchema.secret', false);
      f.a.runtime.setModelOption(f.name, 'overrideFilter.read', (filter) => filter);
      release();
      expect(data(await pending).secret).toBe('a-a-secret');
      expect(data(await service.findOne({ _id: 'a' }, { select }, quiet))).not.toHaveProperty('secret');
      expect(await service.distinct('secret')).toMatchObject({ success: false, code: 'forbidden' });
      f.a.runtime.setModelOption(f.name, 'resolveIdFilter', () => ({ _id: 'b' }));
      expect(data(await service.findById('changed', {}, quiet)).name).toBe('a-b');
      f.a.runtime.setModelOption(f.name, 'overrideFilter', () => false);
      expect(await service.count({})).toMatchObject({ success: false, code: 'forbidden' });
      expect(await service.exists({})).toMatchObject({ success: false, code: 'forbidden' });
    });
  });

  it('refreshes a replaced owner row policy without reusing an earlier cached grant', async () => {
    const f = await fixture();
    const first = vi.fn(() => ({ tenant: 'a' }));
    const replacement = vi.fn(() => false);
    f.a.runtime.setModelOption(f.name, 'baseFilter.read', first);
    await f.run(async ({ service }) => {
      expect(data(await service.findOne({}, {}, quiet)).name).toBe('a-a');
      expect(data(await service.findOne({}, {}, quiet)).name).toBe('a-a');
      expect(first).toHaveBeenCalledTimes(1);
      f.a.runtime.setModelOption(f.name, 'baseFilter.read', replacement);
      const reads = vi.spyOn(f.a.model.collection, 'findOne');
      expect(await service.findOne({}, {}, quiet)).toMatchObject({ success: false, code: 'forbidden' });
      expect(await service.exists({})).toMatchObject({ success: false, code: 'forbidden' });
      expect(await service.distinct('name')).toMatchObject({ success: false, code: 'forbidden' });
      expect(reads).not.toHaveBeenCalled();
      expect(replacement).toHaveBeenCalledTimes(1);
    });
  });

  for (const entry of ['count', 'exists', 'distinct', 'updateById', 'delete'] as const)
    it(`${entry} preserves terminal owner denial with zero persistence`, async () => {
      const f = await fixture();
      f.a.runtime.setModelOption(f.name, 'baseFilter', () => false);
      f.b.runtime.setModelOption(f.name, 'baseFilter', () => ({}));
      const queries = ['findOne', 'countDocuments', 'distinct', 'deleteOne'].map((method) =>
        vi.spyOn(f.a.model.collection as any, method),
      );
      const saves = vi.spyOn(f.a.model.prototype, 'save');
      await f.run(async ({ service }) => {
        const result =
          entry === 'count'
            ? await service.count({})
            : entry === 'exists'
              ? await service.exists({})
              : entry === 'distinct'
                ? await service.distinct('name')
                : entry === 'updateById'
                  ? await service.updateById('lookup', { name: 'changed' })
                  : await service.delete('lookup');
        expect(result).toMatchObject({ success: false, code: 'forbidden' });
        queries.forEach((query) => expect(query).not.toHaveBeenCalled());
        expect(saves).not.toHaveBeenCalled();
      });
    });

  it('allowed writes trim denied fields and preserve original input, request, lifecycle and connection', async () => {
    const f = await fixture();
    const seen: string[] = [];
    let sharedRequest: ModelRequest;
    for (const hook of ['validate', 'prepare', 'transform', 'afterPersist']) {
      f.a.runtime.setModelOption(f.name, `${hook}.update`, function (value, permissions, context) {
        expect(this).toBe(sharedRequest);
        expect(this.macl.getPermissions().has('admin')).toBe(true);
        expect(permissions.has('admin')).toBe(false);
        expect(context.originalData).toEqual({ name: 'updated', secret: 'attempted' });
        expect(context.originalDocumentSnapshot.secret).toBe('a-a-secret');
        seen.push(hook);
        return hook === 'validate' ? true : value;
      });
      f.b.runtime.setModelOption(f.name, `${hook}.update`, () => {
        throw new Error('B lifecycle');
      });
    }
    await f.run(async ({ req, service }) => {
      sharedRequest = req;
      const payload = { name: 'updated', secret: 'attempted' };
      const result = await service.updateOne({ _id: 'a' }, payload, {}, quiet);
      expect(data(result)).toMatchObject({ name: 'updated' });
      expect(data(result)).not.toHaveProperty('secret');
      expect(payload).toEqual({ name: 'updated', secret: 'attempted' });
      expect(seen).toEqual(['validate', 'prepare', 'transform', 'afterPersist']);
      expect(await f.a.model.findById('a').lean()).toMatchObject({ name: 'updated', secret: 'a-a-secret' });
      expect(await f.b.model.findById('a').lean()).toMatchObject({ name: 'b-a', secret: 'b-a-secret' });
    });
  });

  it('live owner defaults, field helpers and fallback guard retain A with B ambient', async () => {
    const f = await fixture();
    await f.run(async ({ service, publicService, original }) => {
      f.a.runtime.setModelOption(f.name, 'defaults.findOneArgs.select', ['name']);
      f.b.runtime.setModelOption(f.name, 'defaults.findOneArgs.select', ['secret']);
      const selected = data(await service.findOne({ _id: 'a' }, {}, quiet));
      expect(selected.name).toBe('a-a');
      expect(selected).not.toHaveProperty('ref');
      f.a.runtime.setModelOption(f.name, 'alwaysSelectFields', []);
      f.a.runtime.setModelOption(f.name, 'permissionSchema.secret', false);
      expect(await service.genSelect('read', ['name', 'secret'])).not.toContain('secret');
      expect(await original.genSelect(f.name, 'read', ['name', 'secret'])).not.toContain('secret');
      expect(await service.genPopulate('read', [{ path: 'ref' }])).toHaveLength(1);
      f.a.runtime.setModelOption(f.name, 'baseFilter.read', () => ({ _id: 'missing' }));
      f.a.runtime.setModelOption(f.name, 'operationAccess.list', false);
      expect(await publicService._read('lookup', {}, quiet)).toMatchObject({ success: false, code: 'unauthorized' });
      expect(await publicService._readFilter({}, {}, quiet)).toMatchObject({ success: false, code: 'unauthorized' });
      f.a.runtime.setModelOption(f.name, 'operationAccess.list', true);
      expect(data(await publicService._read('lookup', {}, quiet)).name).toBe('a-a');
    });
  });

  it('unknown/denied A targets cannot acquire B registry or operation authority', async () => {
    const f = await fixture();
    f.a.runtime.setModelOption(f.targetName, 'operationAccess', false);
    const targetRead = vi.spyOn(f.a.target.collection, 'findOne');
    const otherRead = vi.spyOn(f.b.target.collection, 'findOne');
    await f.run(async ({ service }) => {
      const include = { model: f.targetName, op: 'read', path: 'joined', localField: 'ref', foreignField: '_id' };
      expect(await service.findOne({}, { include } as never, quiet)).toMatchObject({
        success: false,
        code: 'unauthorized',
      });
      const extra = f.b.model.db.model(`${f.name}OnlyB`, new mongoose.Schema({ name: String }));
      f.b.runtime.createRouter(extra, { operationAccess: true, permissionSchema: { name: true } });
      expect(
        await service.findOne({}, { include: { ...include, model: extra.modelName } } as never, quiet),
      ).toMatchObject({ success: false, code: 'bad_request' });
      expect(targetRead).not.toHaveBeenCalled();
      expect(otherRead).not.toHaveBeenCalled();
    });
  });

  for (const entry of ['create', 'new', 'upsert', 'delete'] as const)
    it(`${entry} keeps granted A independent of nullish B`, async () => {
      const f = await fixture(actors[1]);
      f.a.runtime.setModelOption(f.name, 'prepare.create', (value) => ({ ...value, name: 'created-a' }));
      f.b.runtime.setModelOption(f.name, 'prepare.create', () => {
        throw new Error('B create hook');
      });
      const deletion = vi.fn(function (_doc, permissions) {
        expect(permissions.has('admin')).toBe(true);
      });
      f.a.runtime.setModelOption(f.name, 'beforeDelete', deletion);
      f.b.runtime.setModelOption(f.name, 'beforeDelete', () => {
        throw new Error('B delete hook');
      });
      await f.run(async ({ service }) => {
        if (entry === 'delete') {
          expect(data(await service.delete('lookup'))).toBe('a');
          expect(deletion).toHaveBeenCalledOnce();
          expect(await f.a.model.findById('a')).toBeNull();
          expect(await f.b.model.findById('a')).not.toBeNull();
        } else if (entry === 'new') {
          const template = data(await service.new({}, quiet));
          expect(template).toHaveProperty('_id', 'created');
          expect(await f.a.model.countDocuments()).toBe(2);
        } else {
          const payload = { name: 'new', secret: 'A-only' };
          const result =
            entry === 'create'
              ? await service.create(payload, {}, quiet)
              : await service.upsert({ name: 'missing' }, payload, {}, quiet);
          expect(data(result)[0]).toMatchObject({ name: 'created-a', secret: 'A-only' });
          expect(await f.a.model.findById('created').lean()).toMatchObject({ name: 'created-a', secret: 'A-only' });
          expect(await f.b.model.countDocuments()).toBe(2);
        }
      });
    });
});
