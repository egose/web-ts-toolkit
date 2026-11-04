import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';
import type {
  AuthorizationMode,
  DocumentGrants,
  ModelOutputContext,
  ModelRequest,
} from '@web-ts-toolkit/access-router';
import {
  EgoseFactoryStatic,
  Module,
  Router,
  RouterOptions,
  ModelOption,
  DefaultModelOption,
  GlobalOption,
  Option,
  DocPermissions,
  Document,
  Context,
  Request,
  Decorate,
  RouteGuard,
  Permissions,
} from '../src';
import type { Type } from '../src';

const retired = [
  'unsafeSkipListDocumentSnapshotChecks',
  'unsafeSkipReadDocumentSnapshotChecks',
  'unsafeSkipListOutputSnapshotChecks',
  'unsafeSkipReadOutputSnapshotChecks',
  'unsafeSkipListNestedDocumentSnapshotChecks',
  'unsafeSkipReadNestedDocumentSnapshotChecks',
  'unsafeSkipListInitialOutputSnapshotCopy',
  'unsafeSkipReadInitialOutputSnapshotCopy',
  'unsafeUseListAuthorizationFastPath',
  'unsafeUseReadAuthorizationFastPath',
] as const;
const modeKeys = [
  'readAuthorizationMode',
  'listAuthorizationMode',
  'createAuthorizationMode',
  'updateAuthorizationMode',
] as const;
afterEach(() => vi.restoreAllMocks());

function fixture(
  Provider: Type,
  role: 'default' | 'model' | 'global' = 'model',
  options: Record<string, unknown> = {},
  providerOptions: Record<string, unknown> = {},
) {
  const model = new mongoose.Mongoose().model('DecoModes', new mongoose.Schema({ value: String }));
  const api = createAccessRuntime();
  const warn = vi.fn();
  api.setGlobalOptions({ logger: { warn } });
  class AppModule {}
  if (role === 'global') Module({ routers: [], options })(Provider);
  else {
    if (role === 'default') RouterOptions(providerOptions)(Provider);
    else RouterOptions(model, providerOptions)(Provider);
    Module({ routers: [], routerOptions: [Provider], options })(AppModule);
  }
  const factory = EgoseFactoryStatic.create(api);
  const app = express();
  const changed = vi.spyOn(api, 'setGlobalOptions');
  const before = api.runtime.createBootstrapSnapshot();
  return {
    api,
    warn,
    app,
    changed,
    before,
    model,
    run: () => factory.bootstrap(role === 'global' ? Provider : AppModule, app),
  };
}

describe('mode property and complete bootstrap preflight', () => {
  it.each(modeKeys)('does not invoke a decorated %s property getter or publish earlier globals/warnings', (key) => {
    const get = vi.fn(() => 'trusted');
    class Provider {}
    Object.defineProperty(Provider.prototype, 'mode', { get, enumerable: true });
    ModelOption(key)(Provider.prototype, 'mode');
    const f = fixture(Provider, 'model', { requestPermissionField: 'changed' });
    expect(f.run).toThrow(TypeError);
    expect(get).not.toHaveBeenCalled();
    expect(f.changed).not.toHaveBeenCalled();
    expect(f.warn).not.toHaveBeenCalled();
    expect(f.api.runtime.createBootstrapSnapshot()).toEqual(f.before);
  });

  it.each(modeKeys)('validates every %s value before valid defaults/models or module globals', (key) => {
    const trap = vi.fn(() => {
      throw new Error('proxy trap');
    });
    for (const value of [
      null,
      false,
      true,
      'TRUSTED',
      {},
      [],
      new String('trusted'),
      new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap, has: trap }),
    ]) {
      class Provider {
        good = 'trusted';
        bad = value;
      }
      DefaultModelOption('listAuthorizationMode')(Provider.prototype, 'good');
      DefaultModelOption(key)(Provider.prototype, 'bad');
      const f = fixture(Provider, 'default', { requestPermissionField: 'changed' });
      expect(f.run).toThrow(TypeError);
      expect(f.changed).not.toHaveBeenCalled();
      expect(f.warn).not.toHaveBeenCalled();
      expect(f.api.runtime.createBootstrapSnapshot()).toEqual(f.before);
    }
    expect(trap).not.toHaveBeenCalled();
  });

  it.each(modeKeys)('preflights malformed raw %s model/default slots before any setter or getter', (key) => {
    const get = vi.fn(() => 'trusted');
    const other = modeKeys.find((candidate) => candidate !== key)!;
    for (const providerOptions of [
      { [other]: 'trusted', [key]: false },
      Object.create({ [key]: 'trusted' }),
      Object.defineProperty({}, key, { value: 'trusted' }),
      Object.defineProperty({}, key, { get, enumerable: true }),
      { [other]: 'trusted', [`${key}.value`]: undefined },
    ]) {
      for (const role of ['model', 'default'] as const) {
        class Provider {}
        const f = fixture(Provider, role, { requestPermissionField: 'changed' }, providerOptions);
        expect(f.run).toThrow(TypeError);
        expect(f.changed).not.toHaveBeenCalled();
        expect(f.warn).not.toHaveBeenCalled();
        expect(f.api.runtime.createBootstrapSnapshot()).toEqual(f.before);
      }
    }
    expect(get).not.toHaveBeenCalled();
  });

  it.each(modeKeys)('%s composes raw default/model/router options without pinning inheritance', (key) => {
    const api = createAccessRuntime();
    const model = new mongoose.Mongoose().model('DecoRawModes', new mongoose.Schema({ value: String }));
    class Defaults {}
    RouterOptions({ [key]: 'trusted' })(Defaults);
    class Provider {}
    RouterOptions(model, { [key]: 'isolated' })(Provider);
    class ItemRouter {}
    Router(model, { [key]: undefined })(ItemRouter);
    class App {}
    Module({ routerOptions: [Provider, Defaults], routers: [ItemRouter], options: { logger: { warn: vi.fn() } } })(App);
    EgoseFactoryStatic.create(api).bootstrap(App, express());
    expect(api.getModelOption(model.modelName, key)).toBe('trusted');
    api.setDefaultModelOption(key, undefined);
    expect(api.getModelOption(model.modelName, key)).toBe('isolated');
    for (const other of modeKeys)
      if (other !== key) expect(api.getModelOption(model.modelName, other)).toBe('isolated');
  });

  it.each([...retired, ...modeKeys])(
    'rejects global, dotted and inherited/non-enumerable %s metadata before bootstrap',
    (key) => {
      class Provider {
        value = undefined;
      }
      GlobalOption(key as never)(Provider.prototype, 'value');
      const global = fixture(Provider, 'global');
      expect(global.run).toThrow(TypeError);
      expect(global.changed).not.toHaveBeenCalled();
      class Dotted {
        value = undefined;
      }
      ModelOption(`${key}.value` as never)(Dotted.prototype, 'value');
      const dotted = fixture(Dotted);
      expect(dotted.run).toThrow(TypeError);
      expect(dotted.changed).not.toHaveBeenCalled();
      for (const options of [Object.create({ [key]: undefined }), Object.defineProperty({}, key, { value: false })]) {
        class App {}
        const f = fixture(App, 'global', options);
        expect(f.run).toThrow(TypeError);
        expect(f.changed).not.toHaveBeenCalled();
        expect(f.api.runtime.createBootstrapSnapshot()).toEqual(f.before);
      }
    },
  );

  it.each(modeKeys)(
    'preserves typed %s property passthrough, inheritance and explicit undefined restoration',
    (key) => {
      class Defaults {
        mode = 'trusted' as const;
      }
      DefaultModelOption(key)(Defaults.prototype, 'mode');
      class Provider {
        mode = undefined;
      }
      ModelOption(key)(Provider.prototype, 'mode');
      class ModelRouter {}
      const api = createAccessRuntime();
      const model = new mongoose.Mongoose().model('DecoModePositive', new mongoose.Schema({ value: String }));
      RouterOptions({})(Defaults);
      RouterOptions(model)(Provider);
      Router(model)(ModelRouter);
      class App {}
      Module({ routerOptions: [Provider, Defaults], routers: [ModelRouter], options: { logger: { warn: vi.fn() } } })(
        App,
      );
      EgoseFactoryStatic.create(api).bootstrap(App, express());
      expect(api.getModelOption(model.modelName, key)).toBe('trusted');
      api.setDefaultModelOption(key, undefined);
      expect(api.getModelOptions(model.modelName)[key]).toBe('isolated');
      for (const other of modeKeys)
        if (other !== key) expect(api.getModelOptions(model.modelName)[other]).toBe('isolated');
    },
  );

  it.each(retired)('rejects legacy @Option %s even for false or undefined without a mode warning', (key) => {
    for (const value of [false, undefined]) {
      class Provider {
        first = 'trusted';
        old = value;
      }
      DefaultModelOption('readAuthorizationMode')(Provider.prototype, 'first');
      Option(key)(Provider.prototype, 'old');
      const f = fixture(Provider, 'default');
      expect(f.run).toThrow(/removed/);
      expect(f.warn).not.toHaveBeenCalled();
      expect(f.changed).not.toHaveBeenCalled();
      expect(f.api.runtime.createBootstrapSnapshot()).toEqual(f.before);
    }
  });

  it.each([...retired, ...modeKeys])(
    'rejects raw class/default/root %s controls before module global changes',
    (key) => {
      for (const options of [
        { defaults: { publicReadOptions: Object.create({ [key]: undefined }) } },
        { defaults: { publicCreateOptions: { [key]: undefined } } },
        { [`defaults.findOptions.${key}`]: false },
        { options: { [key]: false } },
        { populate: [{ options: { [key]: false } }] },
        { include: [{ args: { [key]: false } }] },
        { authorization: { related: { ref: { operation: { [key]: false } } } } },
        { filter: { nested: { $$sq: { sqOptions: { [key]: false } } } } },
      ]) {
        class Provider {}
        const api = createAccessRuntime();
        RouterOptions(options as never)(Provider);
        class App {}
        Module({ routers: [], routerOptions: [Provider], options: { requestPermissionField: 'changed' } })(App);
        const changed = vi.spyOn(api, 'setGlobalOptions');
        const before = api.runtime.createBootstrapSnapshot();
        expect(() => EgoseFactoryStatic.create(api).bootstrap(App, express())).toThrow(TypeError);
        expect(changed).not.toHaveBeenCalled();
        expect(api.runtime.createBootstrapSnapshot()).toEqual(before);
      }
      class Root {}
      Router(Object.defineProperty({}, key, { value: undefined }) as never)(Root);
      class App {}
      Module({ routers: [Root], options: { requestPermissionField: 'changed' } })(App);
      const api = createAccessRuntime();
      const changed = vi.spyOn(api, 'setGlobalOptions');
      expect(() => EgoseFactoryStatic.create(api).bootstrap(App, express())).toThrow(TypeError);
      expect(changed).not.toHaveBeenCalled();
    },
  );

  it('rejects proxy shape during decorator classification before any model/control trap', () => {
    const trap = vi.fn(() => {
      throw new Error('trap');
    });
    const proxy = new Proxy({}, { getPrototypeOf: trap, has: trap, ownKeys: trap, get: trap });
    for (const input of [proxy, Object.create(proxy)]) {
      expect(() => Router(input as never)).toThrow(TypeError);
      expect(() => RouterOptions(input as never)).toThrow(TypeError);
    }
    expect(trap).not.toHaveBeenCalled();
  });

  it.each([...retired, ...modeKeys])('%s stays inert in decorator business schemas and permission strings', (key) => {
    class Provider {
      schema = { value: key, [key]: key };
    }
    ModelOption('permissionSchema')(Provider.prototype, 'schema');
    const f = fixture(Provider, 'model', {}, { baseFilter: { read: () => ({ [key]: 'business' }) } });
    expect(f.run).not.toThrow();
    expect(f.api.getModelOptions(f.model.modelName).permissionSchema).toEqual({ value: key, [key]: key });
    for (const modeKey of modeKeys) expect(f.api.getModelOption(f.model.modelName, modeKey)).toBe('isolated');
    expect(f.warn).not.toHaveBeenCalled();
  });
});

describe('actual class-instance/context/request mode integration', () => {
  let mongo: MongoMemoryServer;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: 'oar06-deco-mode' });
  }, 120000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
    mongoose.deleteModel(/^DecoModesHttp/);
  }, 120000);

  it.each(['isolated', 'trusted'] as const)(
    '%s decorated write hooks keep hydrated input and detached output with four independent settings',
    async (mode) => {
      const api = createAccessRuntime();
      const model = mongoose.model(`DecoModesHttpWrite${mode}`, new mongoose.Schema({ value: String }));
      const output: { operation: string; access: string; host: boolean; request: unknown; hydrated: boolean }[] = [];
      const input: mongoose.Document[] = [];
      class Defaults {}
      RouterOptions({
        readAuthorizationMode: mode === 'trusted' ? 'isolated' : 'trusted',
        listAuthorizationMode: mode === 'trusted' ? 'isolated' : 'trusted',
        createAuthorizationMode: mode,
        updateAuthorizationMode: mode,
      })(Defaults);
      class Writes {
        createMode: AuthorizationMode | undefined = undefined; // live default inheritance
        updateMode: AuthorizationMode = mode;

        create(doc: Record<string, unknown>, req: ModelRequest, context: ModelOutputContext): DocumentGrants {
          return this.present(doc, req, context);
        }

        update(doc: Record<string, unknown>, req: ModelRequest, context: ModelOutputContext): DocumentGrants {
          if (doc instanceof mongoose.Document) {
            input.push(doc); // deliberately unchanged existing pre-write contract
            return {};
          }
          return this.present(doc, req, context);
        }

        private present(doc: Record<string, unknown>, req: ModelRequest, context: ModelOutputContext): DocumentGrants {
          expect(Object.isFrozen(context)).toBe(true);
          expect(context).not.toHaveProperty('currentDocument');
          output.push({
            operation: context.operation,
            access: context.docPermissionsAccess,
            host: this instanceof Writes,
            request: req.headers['x-original'],
            hydrated: doc instanceof mongoose.Document,
          });
          doc.value = 'output-hook';
          return {};
        }
      }
      ModelOption('createAuthorizationMode')(Writes.prototype, 'createMode');
      ModelOption('updateAuthorizationMode')(Writes.prototype, 'updateMode');
      for (const operation of ['create', 'update'] as const) {
        Document()(Writes.prototype, operation, 0);
        Request()(Writes.prototype, operation, 1);
        Context()(Writes.prototype, operation, 2);
        DocPermissions(operation)(
          Writes.prototype,
          operation,
          Object.getOwnPropertyDescriptor(Writes.prototype, operation)!,
        );
      }
      Router(model, {
        basePath: '/deco-write',
        operationAccess: { create: true, update: true, upsert: true },
        permissionSchema: { value: true },
        stripPermissionsField: true,
      })(Writes);
      class App {}
      Module({ routers: [Writes], routerOptions: [Defaults], options: { logger: { warn() {} } } })(App);
      const app = express().use(express.json());
      EgoseFactoryStatic.create(api).bootstrap(App, app);
      const created = await request(app)
        .post('/deco-write')
        .set('x-original', 'write-request')
        .send({ value: 'created' })
        .expect(201);
      expect(created.body.value).toBe(mode === 'trusted' ? 'output-hook' : 'created');
      const stored = await model.findOne({ value: 'created' }).lean();
      expect(stored).not.toBeNull();
      const updated = await request(app)
        .patch(`/deco-write/__mutation/${stored!._id}`)
        .set('x-original', 'write-request')
        .send({ data: { value: 'updated' }, select: ['value', '-_id'] })
        .expect(200);
      expect(updated.body).toEqual({ value: mode === 'trusted' ? 'output-hook' : 'updated' });
      expect((await model.findById(stored!._id).lean())!.value).toBe('updated');
      expect(input).toHaveLength(1);
      expect(input[0]).toBeInstanceOf(mongoose.Document);
      expect(output).toEqual([
        { operation: 'create', access: 'create', host: true, request: 'write-request', hydrated: false },
        { operation: 'update', access: 'update', host: true, request: 'write-request', hydrated: false },
      ]);
      for (const key of ['createAuthorizationMode', 'updateAuthorizationMode'] as const)
        expect(api.getModelOption(model.modelName, key)).toBe(mode);
      await request(app)
        .post('/deco-write/__mutation')
        .send({ data: { value: 'forbidden-selector' }, options: { createAuthorizationMode: mode } })
        .expect(400);
      await request(app)
        .patch(`/deco-write/__mutation/${stored!._id}`)
        .send({ data: { value: 'forbidden-selector' }, options: { updateAuthorizationMode: mode } })
        .expect(400);
      expect(output).toHaveLength(2);
      expect(input).toHaveLength(1);
      expect((await model.findById(stored!._id).lean())!.value).toBe('updated');
    },
  );

  it.each(['isolated', 'trusted'] as const)(
    '%s is actual source behavior with class this and original request injection',
    async (mode) => {
      const api = createAccessRuntime();
      const model = mongoose.model(
        `DecoModesHttp${mode}`,
        new mongoose.Schema(
          {
            value: String,
            hidden: String,
            owner: Boolean,
            ...Object.fromEntries(modeKeys.map((key) => [key, String])),
          },
          { versionKey: false },
        ),
      );
      const row = await model.create({
        value: 'original',
        hidden: 'never',
        owner: true,
        ...Object.fromEntries(modeKeys.map((key) => [key, 'business'])),
      });
      const observations: { host: boolean; request: unknown; context: ModelOutputContext; phase: string }[] = [];
      const guards = vi.fn();
      class ItemRouter {
        readAuthorizationMode: AuthorizationMode = mode;
        listAuthorizationMode: AuthorizationMode = mode;
        createAuthorizationMode: AuthorizationMode = mode;
        updateAuthorizationMode: AuthorizationMode = mode;
        private resolve(doc: Record<string, unknown>, context: ModelOutputContext, req: ModelRequest): DocumentGrants {
          observations.push({
            host: this instanceof ItemRouter,
            request: req.headers['x-original'],
            context,
            phase: 'document',
          });
          doc.value = 'doc-write';
          return { owner: doc.owner === true };
        }
        read(doc: Record<string, unknown>, context: ModelOutputContext, req: ModelRequest): DocumentGrants {
          return this.resolve(doc, context, req);
        }
        list(doc: Record<string, unknown>, context: ModelOutputContext, req: ModelRequest): DocumentGrants {
          return this.resolve(doc, context, req);
        }
        decorate(doc: Record<string, unknown>, context: ModelOutputContext, req: ModelRequest) {
          observations.push({
            host: this instanceof ItemRouter,
            request: req.headers['x-original'],
            context,
            phase: 'decorate',
          });
          return { ...doc, presented: true };
        }
        guard(_permissions: unknown, req: ModelRequest) {
          guards(this instanceof ItemRouter, req.headers['x-original']);
          return true;
        }
      }
      for (const key of modeKeys) ModelOption(key)(ItemRouter.prototype, key);
      for (const [method, operation] of [
        ['read', 'read'],
        ['list', 'list'],
      ] as const) {
        Document()(ItemRouter.prototype, method, 0);
        Context()(ItemRouter.prototype, method, 1);
        Request()(ItemRouter.prototype, method, 2);
        DocPermissions(operation)(
          ItemRouter.prototype,
          method,
          Object.getOwnPropertyDescriptor(ItemRouter.prototype, method)!,
        );
      }
      Document()(ItemRouter.prototype, 'decorate', 0);
      Context()(ItemRouter.prototype, 'decorate', 1);
      Request()(ItemRouter.prototype, 'decorate', 2);
      Decorate('read')(
        ItemRouter.prototype,
        'decorate',
        Object.getOwnPropertyDescriptor(ItemRouter.prototype, 'decorate')!,
      );
      Permissions()(ItemRouter.prototype, 'guard', 0);
      Request()(ItemRouter.prototype, 'guard', 1);
      RouteGuard('read')(
        ItemRouter.prototype,
        'guard',
        Object.getOwnPropertyDescriptor(ItemRouter.prototype, 'guard')!,
      );
      Router(model, {
        basePath: '/deco-modes',
        operationAccess: { list: true },
        permissionSchema: { value: true, hidden: false, ...Object.fromEntries(modeKeys.map((key) => [key, true])) },
        stripPermissionsField: true,
      })(ItemRouter);
      class Root {}
      Router({ basePath: '/root', operationAccess: true })(Root);
      class App {}
      Module({
        routers: [ItemRouter, Root],
        options: { globalPermissions: () => ['reader'], logger: { warn: vi.fn() } },
      })(App);
      const app = express().use(express.json());
      EgoseFactoryStatic.create(api).bootstrap(App, app);
      for (const access of ['read', 'list'] as const) {
        const get = api.getModelOption(model.modelName, `docPermissions.${access}`);
        if (typeof get !== 'function') throw new Error('missing decorated document hook');
        api.setModelOption(model.modelName, `docPermissions.${access}`, { dependsOn: ['owner'], get });
      }
      const query = {
        select: ['value', ...modeKeys, '-_id'].join(' '),
        include_permissions: 'false',
        include_field_permissions: 'false',
      };
      const read = await request(app)
        .get(`/deco-modes/${row._id}`)
        .set('x-original', 'request')
        .query(query)
        .expect(200);
      expect(read.body).toEqual({
        value: mode === 'trusted' ? 'doc-write' : 'original',
        ...Object.fromEntries(modeKeys.map((key) => [key, 'business'])),
        presented: true,
      });
      const list = await request(app)
        .get('/deco-modes')
        .set('x-original', 'request')
        .query({ ...query, include_count: 'false' })
        .expect(200);
      expect(list.body.data).toEqual([
        {
          value: mode === 'trusted' ? 'doc-write' : 'original',
          ...Object.fromEntries(modeKeys.map((key) => [key, 'business'])),
        },
      ]);
      expect(
        observations.every((entry) => entry.host && entry.request === 'request' && Object.isFrozen(entry.context)),
      ).toBe(true);
      for (const entry of observations) {
        expect(entry.context).not.toHaveProperty('currentDocument');
        expect(entry.context).not.toHaveProperty('originalDocumentSnapshot');
        expect(entry.context).not.toHaveProperty('documentAuthorization');
        expect(entry.context.docPermissions).toEqual(entry.phase === 'document' ? {} : { owner: true });
      }
      expect(guards.mock.calls[0]).toEqual([true, 'request']);
      const before = observations.length;
      const guardCount = guards.mock.calls.length;
      await request(app)
        .post('/deco-modes/__query')
        .send({ filter: {}, options: { listAuthorizationMode: false } })
        .expect(400);
      await request(app)
        .post('/root')
        .send([
          { target: 'model', name: model.modelName, op: 'list' },
          {
            target: 'model',
            name: model.modelName,
            op: 'read',
            id: String(row._id),
            options: { unsafeUseReadAuthorizationFastPath: false },
          },
        ])
        .expect(400);
      expect(observations).toHaveLength(before);
      expect(guards).toHaveBeenCalledTimes(guardCount);
      api.setModelOption(model.modelName, 'readAuthorizationMode', 'isolated');
      const restored = await request(app)
        .get(`/deco-modes/${row._id}`)
        .set('x-original', 'request')
        .query(query)
        .expect(200);
      expect(restored.body.value).toBe('original');
      expect((await model.findById(row._id).lean())!.value).toBe('original');
    },
  );
});
