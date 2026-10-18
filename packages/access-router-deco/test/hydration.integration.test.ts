import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { permissionsPlugin } from '@web-ts-toolkit/access-router';
import type { HydrationMode, ModelHydrationOptions } from '@web-ts-toolkit/access-router';
import type { ModelHookContext, ModelRequest } from '@web-ts-toolkit/access-router/advanced';
import {
  AfterDelete,
  AfterPersist,
  BeforeDelete,
  Context,
  Decorate,
  DecorateAll,
  DefaultModelOption,
  DocPermissions,
  Document,
  EgoseFactoryStatic,
  ModelOption,
  Module,
  Permissions,
  Prepare,
  Request,
  Router,
  RouterOptions,
  Transform,
  Validate,
} from '../src';
import { useMongoTestDatabase } from '../../access-router/test/setup';
import { applyMethodDecorator, applyParameterDecorator } from './helpers';

useMongoTestDatabase();

type Row = Record<string, any>;
const quiet = { includePermissions: false, includeFieldPermissions: false };
const business = { lean: 'business-lean', hydration: 'business-hydration' };
const selection = ['name', 'missingDefault', 'lean', 'hydration'];
const scopes = ['router', 'provider', 'model-property', 'provider-property', 'default', 'default-property'] as const;
type Scope = (typeof scopes)[number];
const modes = ['lean', 'hydrated'] as const;
const opposite = (mode: HydrationMode): HydrationMode => (mode === 'lean' ? 'hydrated' : 'lean');
const allModes = (mode: HydrationMode): ModelHydrationOptions => ({
  publicList: mode,
  publicRead: mode,
  find: mode,
  findOne: mode,
  findById: mode,
});
let sequence = 0;
const factories: EgoseFactoryStatic[] = [];

function observe() {
  const schema = new mongoose.Schema({
    name: String,
    lean: String,
    hydration: String,
    missingDefault: { type: String, default: 'fetch-default' },
    secret: { type: String, select: false },
  });
  const queries: Array<{ op: string; lean: boolean }> = [];
  const documents: boolean[] = [];
  for (const op of ['find', 'findOne'] as const) {
    schema.pre(op, function () {
      queries.push({ op, lean: this.mongooseOptions().lean === true });
    });
    schema.post(op, function (value) {
      for (const doc of Array.isArray(value) ? value : value ? [value] : [])
        documents.push(doc instanceof mongoose.Document);
    });
  }
  return {
    schema,
    queries,
    documents,
    reset() {
      queries.length = 0;
      documents.length = 0;
    },
  };
}

function expectMode(probe: ReturnType<typeof observe>, mode: HydrationMode, operations: string[]) {
  expect(probe.queries).toEqual(operations.map((op) => ({ op, lean: mode === 'lean' })));
  expect(probe.documents).toEqual(operations.map(() => mode === 'hydrated'));
}

function data(result: any): any {
  expect(result, JSON.stringify(result)).toMatchObject({ success: true });
  return result.data;
}

async function fixture(mode: HydrationMode, scope: Scope = 'router', plugin = false) {
  const name = `HydDecoIntegration${++sequence}`;
  const probe = observe();
  if (plugin) probe.schema.plugin(permissionsPlugin, { modelName: name });
  const Item = mongoose.model(name, probe.schema);
  // A raw seed distinguishes fetch-time hydration from create-time defaults.
  const inserted = await Item.collection.insertOne({ name: 'row', ...business, secret: 'private' });
  await Item.collection.insertOne({ name: 'decoy', lean: 'decoy', hydration: 'decoy', secret: 'private' });
  const id = String(inserted.insertedId);
  const events: Array<{
    family: string;
    doc: any;
    ctx: ModelHookContext;
    req: ModelRequest;
    perms: any;
    self: object;
  }> = [];
  const live = new Set(['transform', 'afterPersist', 'beforeDelete', 'afterDelete']);

  class ItemRouter {
    hydration = { ...allModes(mode), publicRead: opposite(mode) };
    readMode = mode;

    record(family: string, doc: any, perms: any, ctx: ModelHookContext, req: ModelRequest) {
      expect(this).toBeInstanceOf(ItemRouter);
      expect(ctx).toMatchObject({ modelName: name, mongooseModel: Item });
      expect(typeof ctx.operation).toBe('string');
      expect(typeof perms.has).toBe('function');
      expect(req.macl).toBeDefined();
      expect(ctx).not.toHaveProperty('hydration');
      expect(ctx.resolvedQuery).not.toHaveProperty('hydration');
      expect(ctx.resolvedQuery).not.toHaveProperty('lean');
      if (live.has(family)) {
        expect(doc).toBeInstanceOf(mongoose.Document);
        expect(ctx.currentDocument).toBe(doc);
        expect(typeof doc.save).toBe('function');
      } else {
        for (const row of Array.isArray(doc) ? doc : [doc]) expect(row).not.toBeInstanceOf(mongoose.Document);
      }
      events.push({ family, doc, perms, ctx, req, self: this });
    }

    grants(doc: Row, perms: any, ctx: ModelHookContext, req: ModelRequest) {
      this.record('permissions', doc, perms, ctx, req);
      return { visible: doc.secret === 'private', privateGrant: true };
    }
    decorate(doc: Row, perms: any, ctx: ModelHookContext, req: ModelRequest) {
      this.record('decorate', doc, perms, ctx, req);
      expect(doc).not.toHaveProperty('secret');
      return doc;
    }
    decorateAll(doc: Row[], perms: any, ctx: ModelHookContext, req: ModelRequest) {
      this.record('decorateAll', doc, perms, ctx, req);
      return doc;
    }
    validate(doc: Row, perms: any, ctx: ModelHookContext, req: ModelRequest) {
      this.record('validate', doc, perms, ctx, req);
      return true;
    }
    prepare(doc: Row, perms: any, ctx: ModelHookContext, req: ModelRequest) {
      this.record('prepare', doc, perms, ctx, req);
      return doc;
    }
    transform(doc: any, perms: any, ctx: ModelHookContext, req: ModelRequest) {
      this.record('transform', doc, perms, ctx, req);
      doc.set('name', `${doc.get('name')}:transformed`);
      return doc;
    }
    persisted(doc: any, perms: any, ctx: ModelHookContext, req: ModelRequest) {
      this.record('afterPersist', doc, perms, ctx, req);
      return doc;
    }
    beforeDelete(doc: any, perms: any, ctx: ModelHookContext, req: ModelRequest) {
      this.record('beforeDelete', doc, perms, ctx, req);
    }
    afterDelete(doc: any, perms: any, ctx: ModelHookContext, req: ModelRequest) {
      this.record('afterDelete', doc, perms, ctx, req);
    }
  }
  for (const [key, decorator] of [
    ['grants', DocPermissions('read')],
    ['decorate', Decorate('read')],
    ['decorateAll', DecorateAll('list')],
    ['validate', Validate('default')],
    ['prepare', Prepare('default')],
    ['transform', Transform('update')],
    ['persisted', AfterPersist('default')],
    ['beforeDelete', BeforeDelete()],
    ['afterDelete', AfterDelete()],
  ] as const) {
    applyMethodDecorator(decorator, ItemRouter.prototype, key);
    for (const [index, param] of [Document(), Permissions(), Context(), Request()].entries()) {
      applyParameterDecorator(param, ItemRouter.prototype, key, index);
    }
  }
  const options = {
    basePath: '/rows',
    operationAccess: true,
    permissionSchema: { name: true, missingDefault: true, lean: true, hydration: true, secret: false },
    alwaysSelectFields: ['secret'],
    exposedDocPermissionKeys: ['visible'],
    defaults: { publicListOptions: quiet, publicReadOptions: { ...quiet, tryList: false } },
  };
  Router(Item, { ...options, ...(scope === 'router' ? { hydration: allModes(mode) } : {}) })(ItemRouter);
  class Provider {
    hydration = { ...allModes(mode), publicRead: opposite(mode) };
    readMode = mode;
  }
  if (scope === 'provider' || scope === 'provider-property') {
    RouterOptions(Item, scope === 'provider' ? { hydration: allModes(mode) } : {})(Provider);
  } else if (scope === 'default' || scope === 'default-property') {
    RouterOptions(scope === 'default' ? { hydration: allModes(mode) } : {})(Provider);
  }
  if (scope.endsWith('property')) {
    const Type = scope === 'model-property' ? ItemRouter : Provider;
    const property = scope === 'default-property' ? DefaultModelOption : ModelOption;
    property('hydration')(Type.prototype, 'hydration');
    property('hydration.publicRead')(Type.prototype, 'readMode');
  }
  class RootRouter {}
  Router({ basePath: '/root', operationAccess: true })(RootRouter);
  class AppModule {}
  Module({
    routers: [ItemRouter, RootRouter],
    routerOptions: scope === 'router' || scope === 'model-property' ? [] : [Provider],
    options: { basePath: '/api', handleErrors: true },
  })(AppModule);
  const factory = EgoseFactoryStatic.create();
  factories.push(factory);
  const app = express().use(express.json());
  // Host-owned service probe explicitly installs its runtime outside the module mount.
  app.use('/service-probe', factory.runtime());
  let callback!: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  app.get('/service-probe', async (req, res) => {
    try {
      await callback(req as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.sendStatus(204);
  });
  factory.bootstrap(AppModule, app);
  async function check(run: typeof callback) {
    callback = run;
    failure = undefined;
    await request(app).get('/service-probe').expect(204);
    if (failure) throw failure;
  }
  return { app, factory, Item, name, id, probe, events, check };
}

afterEach(() => {
  for (const factory of factories.splice(0)) factory.runtime.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^HydDecoIntegration/);
});

describe.each(modes)('HYD-05 bootstrapped %s configuration', (mode) => {
  it.each(scopes)('selects real route and service query modes through %s; stale controls are inert', async (scope) => {
    const f = await fixture(mode, scope);
    expect(f.factory.runtime.getModelOptions(f.name).hydration).toEqual(allModes(mode));
    for (const stale of [
      {},
      { lean: true, hydration: opposite(mode) },
      { lean: false, hydration: { publicList: opposite(mode), publicRead: opposite(mode) } },
    ]) {
      f.probe.reset();
      const list = await request(f.app)
        .post('/api/rows/__query')
        .send({ filter: business, select: selection, options: stale })
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      const read = await request(f.app)
        .get(`/api/rows/${f.id}`)
        .query({ select: selection.join(','), ...stale })
        .expect(200);
      const filterRead = await request(f.app)
        .post('/api/rows/__query/__filter')
        .send({ filter: business, select: selection, options: stale })
        .expect(200);
      for (const row of [list.body.data[0], read.body, filterRead.body]) {
        expect(row).toMatchObject({ name: 'row', ...business });
        expect(row.missingDefault).toBe(mode === 'hydrated' ? 'fetch-default' : undefined);
        expect(row).not.toHaveProperty('secret');
      }
      const root = await request(f.app)
        .post('/api/root')
        .send([
          { target: 'model', name: f.name, op: 'list', filter: business, args: { select: selection }, options: stale },
          { target: 'model', name: f.name, op: 'read', id: f.id, args: { select: selection }, options: stale },
        ])
        .expect(200);
      expect(root.body).toHaveLength(2);
      expect(data(root.body[0].result)).toHaveLength(1);
      expect(data(root.body[1].result)).toMatchObject(business);
      await f.check(async (req) => {
        const service = req.macl.getService(f.name);
        const options = { ...quiet, ...stale };
        expect(data(await service.find(business, { select: selection }, options))).toHaveLength(1);
        expect(data(await service.findOne(business, { select: selection }, options))).toMatchObject(business);
        expect(data(await service.findById(f.id, { select: selection }, options))).toMatchObject(business);
      });
      expectMode(f.probe, mode, ['find', 'findOne', 'findOne', 'find', 'findOne', 'find', 'findOne', 'findOne']);
    }
  });

  it.each([false, true])('injects plain output views and finalized aliases (plugin=%s)', async (plugin) => {
    const f = await fixture(mode, 'model-property', plugin);
    f.factory.runtime.setModelOption(f.name, 'documentPermissionField', 'meta.grants');
    await f.check(async (req) => {
      const row = data(
        await req.macl
          .getPublicService(f.name)
          ._read(f.id, { select: selection }, { ...quiet, includePermissions: true }),
      );
      expect(row).not.toBeInstanceOf(mongoose.Document);
      expect(row.meta.grants).toEqual({ visible: true });
      expect(row.permissions).toBe(row.meta.grants);
      expect(Object.getOwnPropertyDescriptor(row, 'permissions')).toEqual({
        value: row.meta.grants,
        writable: true,
        configurable: true,
        enumerable: false,
      });
      expect(JSON.stringify(row)).not.toContain('"permissions"');
      expect(row.missingDefault).toBe(mode === 'hydrated' ? 'fetch-default' : undefined);
      data(await req.macl.getPublicService(f.name)._list(business, { select: selection }, quiet));
      expectMode(f.probe, mode, ['findOne', 'find']);
      expect(f.events.map(({ family }) => family)).toEqual(['permissions', 'decorate', 'decorateAll']);
      const grants = f.events[0];
      expect(grants.doc).toMatchObject({ secret: 'private' });
      expect(grants.req).toBe(req);
      expect(f.events.every((event) => event.self === grants.self && event.req === req)).toBe(true);
      // Output context is a pruned view, not the private permissions-stage object.
      expect(f.events[1].ctx).toMatchObject({
        modelName: f.name,
        mongooseModel: f.Item,
        operation: 'read',
        originalDocumentSnapshot: grants.ctx.originalDocumentSnapshot,
        docPermissions: { visible: true },
      });
      expect(f.events[1].ctx.docPermissions).not.toHaveProperty('privateGrant');
      // Each stage captures permissions; the adapter preserves that stage's signature.
      expect(f.events[1].perms).toStrictEqual(grants.perms);
      f.factory.runtime.setModelOption(f.name, 'stripPermissionsField', true);
      const stripped = data(
        await req.macl.getService(f.name).findOne(business, {}, { ...quiet, includePermissions: true }),
      );
      expect(stripped).not.toHaveProperty('meta.grants');
      expect(stripped).not.toHaveProperty('permissions');
    });
  });

  it('keeps lifecycle documents live while payload/output injection remains plain', async () => {
    const f = await fixture(mode, 'provider-property');
    await f.check(async (req) => {
      const service = req.macl.getService(f.name);
      const updated = data(await service.updateById(f.id, { name: 'updated' }, {}, quiet));
      expect(updated).not.toBeInstanceOf(mongoose.Document);
      expect(updated.name).toBe('updated:transformed');
      expect(await f.Item.collection.findOne({ _id: new mongoose.Types.ObjectId(f.id) })).toMatchObject({
        name: 'updated:transformed',
      });
      const created = data(await service.create({ name: 'created' }, {}, quiet));
      expect(created[0]).not.toBeInstanceOf(mongoose.Document);
      data(await service.delete(f.id));
      expect(await f.Item.collection.findOne({ _id: new mongoose.Types.ObjectId(f.id) })).toBeNull();
      expectMode(f.probe, 'hydrated', ['findOne', 'findOne']);
      expect(f.events.map(({ family, ctx }) => `${family}:${ctx.operation}`)).toEqual([
        'validate:update',
        'prepare:update',
        'transform:update',
        'afterPersist:update',
        'validate:create',
        'prepare:create',
        'afterPersist:create',
        'beforeDelete:delete',
        'afterDelete:delete',
      ]);
      const lifecycle = f.events.filter(({ family }) =>
        ['transform', 'afterPersist', 'beforeDelete', 'afterDelete'].includes(family),
      );
      expect(lifecycle).toHaveLength(5);
      expect(lifecycle.every((event) => event.req === req && event.self === lifecycle[0].self)).toBe(true);
    });
  });
});

it('keeps same-name decorated hydration isolated across factories and fresh retained-service calls', async () => {
  const lean = await fixture('lean', 'default-property');
  class HydratedRouter {}
  Router(lean.Item, {
    basePath: '/rows',
    operationAccess: true,
    permissionSchema: { name: true },
    hydration: allModes('hydrated'),
    defaults: { publicReadOptions: { ...quiet, tryList: false } },
  })(HydratedRouter);
  class HydratedModule {}
  Module({ routers: [HydratedRouter], options: { basePath: '/other' } })(HydratedModule);
  const otherFactory = EgoseFactoryStatic.create();
  factories.push(otherFactory);
  const other = express().use(express.json());
  otherFactory.bootstrap(HydratedModule, other);
  await lean.check(async (req) => {
    const service = req.macl.getService(lean.name);
    data(await service.findOne({}, {}, quiet));
    expectMode(lean.probe, 'lean', ['findOne']);
    lean.probe.reset();
    await request(other).get(`/other/rows/${lean.id}`).query(quiet).expect(200);
    expectMode(lean.probe, 'hydrated', ['findOne']);
    lean.probe.reset();
    // The other runtime cannot change the retained service's owning configuration.
    otherFactory.runtime.setModelOption(lean.name, 'hydration.findOne', 'lean');
    data(await service.findOne({}, {}, quiet));
    expectMode(lean.probe, 'lean', ['findOne']);
    lean.probe.reset();
    lean.factory.runtime.setModelOption(lean.name, 'hydration.findOne', 'hydrated');
    data(await service.findOne({}, {}, quiet));
    expectMode(lean.probe, 'hydrated', ['findOne']);
    expect(otherFactory.runtime.getModelOptions(lean.name).hydration?.findOne).toBe('lean');
    expect(lean.factory.runtime.getDefaultModelOptions().hydration?.findOne).toBe('lean');
  });
});
