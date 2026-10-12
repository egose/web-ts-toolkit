import express from 'express';
import mongoose from 'mongoose';
import { createRequire } from 'node:module';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as esm from '../dist/index.mjs';
import type { DataRequest, ModelRequest, Projection } from '../dist/advanced';

const cjs = createRequire(import.meta.url)('../dist/index.js') as typeof esm;
const entrypoints = [
  ['ESM', esm],
  ['CJS', cjs],
] as const;
let sequence = 0;
const runtimes: esm.AccessRuntimeApi[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^Svaf03Helper/);
});

function probe(router: { router: { post: Function }; routes: express.Router }) {
  let callback: (req: ModelRequest & DataRequest) => Promise<void>;
  let failure: unknown;
  router.router.post('/_helper_probe', async (req: ModelRequest & DataRequest, res: express.Response) => {
    try {
      await callback(req);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const app = express();
  app.use(router.routes);
  return async (run: typeof callback) => {
    callback = run;
    failure = undefined;
    await request(app).post('/helpers/_helper_probe').expect(200, { ok: true });
    if (failure) throw failure;
  };
}

function modelFixture(entry = esm, options: Record<string, unknown> = {}) {
  const api = entry.createAccessRuntime();
  runtimes.push(api);
  const name = `Svaf03Helper${++sequence}`;
  const model = mongoose.model(
    name,
    new mongoose.Schema({
      name: String,
      internalNote: String,
      ownerId: String,
      owned: String,
      fn: String,
      adminOnly: String,
      absent: String,
      profile: { name: String, private: String },
      contacts: [new mongoose.Schema({ email: String, private: String }, { _id: false })],
    }),
  );
  api.setGlobalOptions({ globalPermissions: () => ({ reader: true, admin: false }) });
  const hook = vi.fn((doc: { ownerId?: string }) => ({ owner: doc.ownerId === 'actor' }));
  const rule = vi.fn((_permissions, grants) => grants?.owner === true);
  const getter = vi.fn(() => 'computed');
  const router = api.createRouter(model, {
    basePath: '/helpers',
    operationAccess: true,
    modelPermissionPrefix: 'doc:',
    permissionSchema: {
      _id: false,
      name: true,
      internalNote: false,
      ownerId: false,
      owned: 'doc:owner',
      fn: rule,
      adminOnly: 'admin',
      absent: true,
      profile: { read: true, sub: { name: true, private: false } },
      contacts: { read: true, sub: { email: true, private: false } },
      label: true,
    },
    docPermissions: { read: hook },
    alwaysSelectFields: { read: ['ownerId'] },
    virtuals: { label: { get: getter, dependsOn: ['ownerId'] } },
    ...options,
  } as never);
  return { api, name, model, hook, rule, getter, router, execute: probe(router) };
}

function dataFixture(entry = esm) {
  const api = entry.createAccessRuntime();
  runtimes.push(api);
  const name = `Svaf03HelperData${++sequence}`;
  api.setGlobalOptions({ globalPermissions: () => ({ reader: true, admin: false }) });
  const rule = vi.fn(function (permissions) {
    return permissions.has('reader');
  });
  const rows = [
    {
      _id: 'private-id',
      _permissions: { reader: true },
      name: 'A',
      internalNote: 'denied',
      fn: 'yes',
      contacts: [{ email: 'a@example.test', private: 'container-value' }],
    },
  ];
  const router = api.createDataRouter(name, {
    basePath: '/helpers',
    operationAccess: true,
    data: rows,
    permissionSchema: {
      _id: false,
      _permissions: false,
      name: true,
      internalNote: false,
      fn: rule,
      absent: true,
      contacts: { read: true, list: true, sub: { email: true, private: false } },
    },
  } as never);
  // A same-name Mongoose model with conflicting rules must be irrelevant to data helpers.
  const model = mongoose.model(name, new mongoose.Schema({ name: String }));
  api.registerModelInstance(name, model);
  const modelHook = vi.fn(() => {
    throw new Error('data invoked model document hook');
  });
  api.setModelOptions(name, { permissionSchema: { name: false }, docPermissions: { read: modelHook } });
  return { api, name, rows, rule, modelHook, router, execute: probe(router) };
}

const modelMethods = [
  'genSelect',
  'genQuerySelect',
  'genAllowedFields',
  'pickAllowedFields',
  'trimOutputFields',
  'genPopulate',
] as const;
const dataMethods = [
  'genSelect',
  'genQuerySelect',
  'genAllowedFields',
  'pickAllowedFields',
  'trimOutputFields',
] as const;
const argsFor = (method: string): unknown[] =>
  method === 'genPopulate'
    ? ['read', []]
    : ['genSelect', 'genQuerySelect'].includes(method)
      ? ['read', ['name']]
      : [{ name: 'A' }, 'read'];
const retired: unknown[][] = [
  [true],
  [false],
  [[]],
  [['contacts', 'sub']],
  [null],
  [undefined, []],
  [undefined, undefined],
  [undefined, { scopePath: ['contacts'] }],
  [{}, []],
  [{}, undefined],
  [{ baseFields: ['internalNote'] }],
  [{ skipChecks: false }],
  [{ subPaths: [] }],
];

describe.each(entrypoints)('SVA-F03 %s finite helper boundaries', (_format, entry) => {
  describe.each(['core', 'service', 'publicService'] as const)('%s model helpers', (receiver) => {
    it.each(modelMethods)('%s rejects retired JS forms before hooks or catalog work', async (method) => {
      const f = modelFixture(entry);
      await f.execute(async (req) => {
        const target =
          receiver === 'core'
            ? req.macl
            : receiver === 'service'
              ? f.router.getService(req)
              : f.router.getPublicService(req);
        const prefix = receiver === 'core' ? [f.name] : [];
        const catalog = vi.spyOn(f.api.runtime, 'getModelInstance');
        for (const suffix of retired) {
          await expect(
            Reflect.apply(target[method], target, [...prefix, ...argsFor(method), ...suffix]),
          ).rejects.toMatchObject({
            result: { code: 'bad_request', errors: [{ detail: expect.stringContaining('have been removed') }] },
          });
        }
        expect(catalog).not.toHaveBeenCalled();
        expect(f.rule).not.toHaveBeenCalled();
        expect(f.hook).not.toHaveBeenCalled();
        expect(f.getter).not.toHaveBeenCalled();
      });
    });
  });

  it.each(dataMethods)('DataService.%s rejects removed forms without model authority', async (method) => {
    const f = dataFixture(entry);
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      for (const suffix of retired) {
        await expect(Reflect.apply(service[method], service, [...argsFor(method), ...suffix])).rejects.toMatchObject({
          result: { code: 'bad_request', errors: [{ detail: expect.stringContaining('DataFieldOptions') }] },
        });
      }
      expect(f.rule).not.toHaveBeenCalled();
      expect(f.modelHook).not.toHaveBeenCalled();
    });
  });

  it.each(['genSelect', 'genAllowedFields', 'pickAllowedFields'] as const)(
    'DataCore.%s rejects removed forms',
    async (method) => {
      const f = dataFixture(entry);
      await f.execute(async (req) => {
        for (const suffix of retired) {
          await expect(
            Reflect.apply(req.dacl[method], req.dacl, [f.name, ...argsFor(method), ...suffix]),
          ).rejects.toMatchObject({
            result: {
              code: 'bad_request',
              errors: [{ detail: expect.stringContaining('legacy elevation is unsupported') }],
            },
          });
        }
        expect(f.rule).not.toHaveBeenCalled();
        expect(f.modelHook).not.toHaveBeenCalled();
      });
    },
  );
});

describe('SVA-F03 canonical model defaults and private request metadata', () => {
  it('omitted/undefined planning options equal named request planning and never run field/getter hooks', async () => {
    const f = modelFixture();
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      for (const method of ['genSelect', 'genQuerySelect'] as const) {
        for (const select of [
          undefined,
          null,
          [],
          ['-name'],
          ['name', 'internalNote', 'owned', 'fn', 'adminOnly', 'label'],
        ] as Projection[]) {
          const explicit = await service[method]('read', select, {});
          expect(await service[method]('read', select)).toEqual(explicit);
          expect(await service[method]('read', select, undefined)).toEqual(explicit);
          expect(await req.macl[method](f.name, 'read', select)).toEqual(explicit);
          expect(explicit).toContain('_id');
          expect(explicit).toContain('ownerId');
          expect(explicit).not.toContain('internalNote');
          expect(explicit).not.toContain('adminOnly');
          expect(explicit).not.toContain('label');
        }
      }
      expect(await service.genSelect('read', ['owned', 'fn'])).toEqual(['owned', 'fn', 'ownerId', '_id']);
      expect(f.rule).not.toHaveBeenCalled();
      expect(f.hook).not.toHaveBeenCalled();
      expect(f.getter).not.toHaveBeenCalled();
    });
  });

  it('defaults respect requireExplicitSelect, scope translation and additive selected grants', async () => {
    const f = modelFixture(esm, { requireExplicitSelect: true });
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      expect(await service.genSelect('read')).toEqual(['ownerId', '_id']);
      expect(
        await service.genQuerySelect('read', undefined, { authorization: { outputFields: { mode: 'unrestricted' } } }),
      ).toEqual(['ownerId', '_id']);
      // Explicit empty/null is an all-candidates selection, unlike omission. It
      // still needs request authority or the independently supplied output grant.
      expect(await service.genQuerySelect('read', [])).not.toContain('internalNote');
      expect(
        await service.genQuerySelect('read', [], { authorization: { outputFields: { mode: 'unrestricted' } } }),
      ).toContain('internalNote');
      expect(await service.genQuerySelect('read', null)).toContain('name');
      const options = {
        scopePath: ['contacts'],
        authorization: { outputFields: { mode: 'grant', paths: ['contacts.private'] } },
      } as const;
      // This embedded schema explicitly has _id:false, so no identity is fabricated.
      expect(await service.genQuerySelect('read', ['email', 'private'], options)).toEqual(['email', 'private']);
      expect(await service.genQuerySelect('read', ['email'], options)).toEqual(['email']);
    });
  });

  it('default filtering isolates hydrated input, uses fresh private grants and keeps only existing paths', async () => {
    const f = modelFixture();
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      const raw = new f.model({
        name: 'A',
        ownerId: 'actor',
        owned: 'owned',
        fn: 'decision',
        internalNote: 'denied',
        profile: { name: 'P', private: 'denied' },
        contacts: [{ email: 'E', private: 'denied' }],
      });
      const original = raw.toObject();
      const expected = {
        _id: raw._id,
        name: 'A',
        owned: 'owned',
        fn: 'decision',
        profile: { name: 'P' },
        contacts: [{ email: 'E' }],
      };
      for (const method of ['pickAllowedFields', 'trimOutputFields'] as const) {
        expect(await service[method](raw, 'read')).toEqual(expected);
        expect(await service[method](raw, 'read', undefined)).toEqual(expected);
        expect(await service[method](raw, 'read', {})).toEqual(expected);
        expect(await req.macl[method](f.name, raw, 'read')).toEqual(expected);
        expect(raw.toObject()).toEqual(original);
      }
      const fields = await service.genAllowedFields(raw, 'read');
      expect(fields).toEqual(expect.arrayContaining(['_id', 'name', 'owned', 'fn', 'profile.name', 'contacts.email']));
      expect(fields).not.toContain('absent');
      expect(fields).not.toContain('internalNote');
      expect(await req.macl.genAllowedFields(f.name, null, 'read')).toEqual([]);
      expect(await service.genAllowedFields({}, 'read', undefined)).toEqual([]);
      const forged = await service.pickAllowedFields({ owned: 'no', _permissions: { owner: true } }, 'read');
      expect(forged).not.toHaveProperty('owned');
      expect(f.hook).toHaveBeenCalled();
      expect(f.getter).not.toHaveBeenCalled();
      for (const context of f.rule.mock.contexts) expect(context).toBe(req);
    });
  });

  it('omitted options preserve absent documents and reject unsupported raw values or missing explicit purpose', async () => {
    const f = modelFixture();
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      expect(await service.pickAllowedFields(null, 'read')).toBeNull();
      expect(await service.trimOutputFields(undefined, 'read')).toBeUndefined();
      expect(await service.genAllowedFields(undefined, 'read')).toEqual([]);
      for (const doc of ['scalar', [], new Date(0)]) {
        await expect(service.pickAllowedFields(doc, 'read')).rejects.toMatchObject({ result: { code: 'bad_request' } });
      }
      await expect(service.genAllowedFields({}, 'read', {} as never)).rejects.toMatchObject({
        result: { code: 'bad_request', errors: [{ detail: expect.stringContaining('purpose: output') }] },
      });
      expect(f.hook).not.toHaveBeenCalled();
    });
  });

  it('request _view/_edit retain schema fields and serialized request grants without invoking output helpers/hooks', async () => {
    const f = modelFixture();
    await f.execute(async (req) => {
      const outputHelper = vi.spyOn(req.macl, 'genAllowedFields');
      const doc = { _id: 'one', _permissions: { owner: true } };
      await req.macl.addFieldPermissions(f.name, doc, 'read', {
        operation: 'read',
        fieldPermissionAccess: { updateIds: new Set(['one']) },
      } as never);
      expect(doc._permissions).toMatchObject({
        owner: true,
        _view: { name: true, owned: true, fn: true, absent: true },
        _edit: { name: true, owned: true, fn: true, absent: true },
      });
      expect(doc._permissions).not.toHaveProperty('_view.internalNote');
      expect(doc._permissions).not.toHaveProperty('_edit.adminOnly');
      expect(outputHelper).not.toHaveBeenCalled();
      expect(f.hook).not.toHaveBeenCalled();
      expect(req.macl.getPermissions().has('admin')).toBe(false);
    });
  });
});

describe('SVA-F03 data request evaluator compatibility', () => {
  it('keeps schema allowlists, function arguments, scope and whole-container picks without a Mongoose catalog', async () => {
    const f = dataFixture();
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      const catalog = vi.spyOn(f.api.runtime, 'getModelInstance').mockImplementation(() => {
        throw new Error('data consulted a model');
      });
      const expected = { name: 'A', fn: 'yes', contacts: f.rows[0].contacts };
      expect(await service.genAllowedFields(null, 'read')).toEqual(['name', 'fn', 'absent', 'contacts']);
      for (const method of ['pickAllowedFields', 'trimOutputFields'] as const) {
        expect(await service[method](f.rows[0], 'read')).toEqual(expected);
        expect(await service[method](f.rows[0], 'read', undefined)).toEqual(expected);
        expect(await service[method](f.rows[0].contacts[0], 'read', { scopePath: ['contacts'] })).toEqual({
          email: 'a@example.test',
        });
      }
      expect(await req.dacl.genAllowedFields(f.name, {}, 'read', { scopePath: ['contacts'] })).toEqual(['email']);
      expect(await req.dacl.genSelect(f.name, 'read', ['email', 'private'], { scopePath: ['contacts'] })).toEqual([
        'email',
      ]);
      for (const call of f.rule.mock.calls) {
        expect(call).toHaveLength(1);
        expect(call[0]).toBe(req.dacl.getPermissions());
      }
      for (const context of f.rule.mock.contexts) expect(context).toBe(req);
      expect(catalog).not.toHaveBeenCalled();
      expect(f.modelHook).not.toHaveBeenCalled();
      expect(f.rows[0]).toHaveProperty('_id', 'private-id');
    });
  });

  it('preserves data empty-intersection service behavior and admitted-only selections', async () => {
    const f = dataFixture();
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      for (const select of [undefined, null, [], ['-name'], ['internalNote'], ['missing']] as Projection[]) {
        expect(await service.genSelect('read', select)).toEqual([]);
        expect(await service.genQuerySelect('read', select, {})).toEqual([]);
        expect(await service.findOne({}, { select })).toMatchObject({
          success: true,
          data: { name: 'A', fn: 'yes' },
          query: { select: [] },
        });
        expect(await service.find({}, { select })).toMatchObject({ success: true, data: [{ name: 'A', fn: 'yes' }] });
      }
      expect(await service.findOne({}, { select: ['name', 'internalNote'] })).toMatchObject({
        success: true,
        data: { name: 'A' },
        query: { select: ['name'] },
      });
      const selected = await service.findOne({}, { select: ['name', 'internalNote'] });
      if (selected.success) expect(selected.data).toEqual({ name: 'A' });
      expect(await service.find({}, { sort: 'internalNote' })).toMatchObject({ success: false, code: 'bad_request' });
      expect(f.modelHook).not.toHaveBeenCalled();
    });
  });

  it('rejects data/populate capabilities and malformed named scopes without invoking rules', async () => {
    const f = dataFixture();
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      for (const options of [
        { authorization: { outputFields: { mode: 'unrestricted' } } },
        { authorization: undefined },
        { documentAuthorization: {} },
        { purpose: 'output' },
        { scopePath: 'contacts' },
        { scopePath: ['contacts', 'sub'] },
        { scopePath: ['contacts.email'] },
        { scopePath: ['0'] },
        { scopePath: ['__proto__'] },
        { scopePath: ['contacts[0]'] },
        Object.defineProperty({}, 'scopePath', {
          enumerable: true,
          get: () => {
            throw new Error('getter ran');
          },
        }),
      ]) {
        for (const method of dataMethods) {
          await expect(Reflect.apply(service[method], service, [...argsFor(method), options])).rejects.toMatchObject({
            result: { code: 'bad_request' },
          });
        }
      }
      expect(f.rule).not.toHaveBeenCalled();
      expect(f.modelHook).not.toHaveBeenCalled();
    });
  });
});
