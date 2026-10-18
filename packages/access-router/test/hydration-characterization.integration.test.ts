import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

// HYD-01 value/projection/isolation probes, migrated to HYD-02 server configuration.
type Row = Record<string, any>;
const quiet = { includePermissions: false, includeFieldPermissions: false };
const mode = (lean: boolean) => (lean ? ('lean' as const) : ('hydrated' as const));
const selection = ['name', 'value', 'missingDefault', 'initOnly', 'conversion', 'attributes', 'hasSecret'];
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
let sequence = 0;

function observedSchema(ref?: string) {
  const schema = new mongoose.Schema(
    {
      name: String,
      value: { type: String, get: (value: string) => (value === undefined ? value : `getter:${value}`) },
      missingDefault: { type: String, default: 'fetch-default' },
      secret: { type: String, select: false },
      initOnly: String,
      conversion: String,
      attributes: { type: Map, of: String },
      ...(ref ? { ref: { type: mongoose.Schema.Types.ObjectId, ref } } : {}),
      children: [{ name: String }],
    },
    {
      toObject: {
        getters: true,
        virtuals: true,
        transform: (_doc, output) => {
          output.conversion = 'toObject-transform';
          return output;
        },
      },
    },
  );
  schema.virtual('nativeVirtual').get(() => 'mongoose-only');
  const initialized: unknown[] = [];
  schema.post('init', function (doc) {
    initialized.push(doc);
    doc.set('initOnly', 'post-init');
  });
  const queries: Array<{ op: string; lean: boolean; projection: unknown }> = [];
  const fetched: Row[] = [];
  for (const op of ['find', 'findOne'] as const) {
    schema.pre(op, function () {
      queries.push({ op, lean: this.mongooseOptions().lean === true, projection: this.projection() });
    });
    schema.post(op, function (value) {
      fetched.push(...(Array.isArray(value) ? value : value ? [value] : []));
    });
  }
  return { schema, initialized, queries, fetched };
}

async function fixture({
  plugin = false,
  businessPermissions = false,
}: { plugin?: boolean; businessPermissions?: boolean } = {}) {
  const api = createAccessRuntime();
  runtimes.push(api);
  const tag = ++sequence;
  const name = `HydCharacterSource${tag}`;
  const targetName = `HydCharacterTarget${tag}`;
  const source = observedSchema(targetName);
  const target = observedSchema();
  if (plugin) source.schema.plugin(permissionsPlugin, { modelName: name });
  if (businessPermissions) source.schema.add({ permissions: String });
  const Source = mongoose.model(name, source.schema);
  const Target = mongoose.model(targetName, target.schema);
  const docPermissions = vi.fn((doc: Row) => ({ allowed: doc.secret === 'private', hiddenGrant: true }));
  const decorate = vi.fn((doc: Row) => doc);
  const virtual = vi.fn((doc: Row) => doc.secret === 'private');
  const options = {
    operationAccess: true,
    permissionSchema: {
      name: true,
      value: true,
      missingDefault: true,
      initOnly: true,
      conversion: true,
      attributes: true,
      hasSecret: true,
      secret: false,
      ref: true,
      permissions: true,
      children: { list: true, read: true, create: true, update: true, delete: true, sub: { name: true } },
    },
    alwaysSelectFields: ['secret'],
    docPermissions,
    decorate,
    virtuals: { hasSecret: { dependsOn: ['secret'], get: virtual } },
  };
  api.createRouter(Source, options);
  api.createRouter(Target, { ...options, docPermissions: () => ({}) });
  const id = new mongoose.Types.ObjectId();
  const targetId = new mongoose.Types.ObjectId();
  const childId = new mongoose.Types.ObjectId();
  const stored = { name: 'row', value: 'stored', secret: 'private', attributes: { key: 'stored' } };
  // Bypass create-time defaults, setters and save hooks: missingDefault is
  // genuinely absent in MongoDB, so its appearance can only come from hydration.
  await Target.collection.insertOne({ ...stored, _id: targetId });
  await Source.collection.insertOne({
    ...stored,
    _id: id,
    ref: targetId,
    children: [{ _id: childId, name: 'child' }],
    ...(businessPermissions ? { permissions: 'business' } : {}),
  });
  const app = express();
  app.use(api());
  let run!: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  app.get('/probe', async (req, res) => {
    try {
      await run(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.sendStatus(204);
  });
  async function check(callback: typeof run) {
    run = callback;
    failure = undefined;
    await request(app).get('/probe').expect(204);
    if (failure) throw failure;
  }
  return {
    api,
    name,
    targetName,
    Source,
    id: String(id),
    childId: String(childId),
    source,
    target,
    docPermissions,
    decorate,
    virtual,
    check,
  };
}

function data(result: any): any {
  expect(result, JSON.stringify(result)).toMatchObject({ success: true });
  return result.data;
}

afterEach(() => {
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^HydCharacter/);
});

describe('server-owned hydration compatibility characterization', () => {
  it.each([true, false])(
    'observes defaults, getters, transforms and private projected hooks (lean=%s)',
    async (lean) => {
      const f = await fixture();
      f.api.runtime.setModelOption(f.name, 'hydration.publicRead', mode(lean));
      await f.check(async (req) => {
        const row = data(await req.macl.getPublicService(f.name)._read(f.id, { select: selection }, quiet));
        expect(f.source.queries).toMatchObject([{ op: 'findOne', lean }]);
        expect(f.source.queries[0].projection).toHaveProperty('secret', 1);
        expect(f.source.initialized).toHaveLength(lean ? 0 : 1);
        expect(f.source.fetched[0] instanceof mongoose.Document).toBe(!lean);
        expect(row instanceof mongoose.Document).toBe(false);
        expect(row).toMatchObject({
          name: 'row',
          value: lean ? 'stored' : 'getter:stored',
          attributes: { key: 'stored' },
          hasSecret: true,
        });
        for (const value of [row, f.docPermissions.mock.calls[0][0], f.virtual.mock.calls[0][0]]) {
          expect(value instanceof mongoose.Document).toBe(false);
          expect(value.missingDefault).toBe(lean ? undefined : 'fetch-default');
          expect(value.initOnly).toBe(lean ? undefined : 'post-init');
          expect(value.conversion).toBe(lean ? undefined : 'toObject-transform');
          expect(value.value).toBe(lean ? 'stored' : 'getter:stored');
          expect(value).not.toHaveProperty('nativeVirtual');
        }
        expect(f.docPermissions.mock.calls[0][0].secret).toBe('private');
        expect(f.virtual.mock.calls[0][0].secret).toBe('private');
        expect(f.decorate).toHaveBeenCalledOnce();
        expect(f.decorate.mock.calls[0][0] instanceof mongoose.Document).toBe(false);
        expect(f.decorate.mock.calls[0][0]).not.toHaveProperty('secret');
        expect(row).not.toHaveProperty('secret');
        row.attributes.key = 'output-only';
        const fetched = f.source.fetched[0];
        expect(
          fetched instanceof mongoose.Document ? fetched.get('attributes').get('key') : fetched.attributes.key,
        ).toBe('stored');
        expect(
          fetched instanceof mongoose.Document ? fetched.get('_permissions') : fetched._permissions,
        ).toBeUndefined();
        const persisted = await f.Source.collection.findOne({ _id: new mongoose.Types.ObjectId(f.id) });
        expect(persisted).toMatchObject({ value: 'stored', secret: 'private', attributes: { key: 'stored' } });
        for (const field of ['missingDefault', 'initOnly', 'conversion']) expect(persisted).not.toHaveProperty(field);
      });
    },
  );

  it('uses independent model buckets; stale JS controls and presentation defaults cannot override them', async () => {
    const f = await fixture();
    await f.check(async (req) => {
      const service = req.macl.getService(f.name);
      const publicService = req.macl.getPublicService(f.name);
      const calls = [
        (options: any) => service.find({}, {}, options),
        (options: any) => service.findOne({}, {}, options),
        (options: any) => service.findById(f.id, {}, options),
        (options: any) => publicService._list({}, {}, options),
        (options: any) => publicService._read(f.id, {}, options),
        (options: any) => publicService._readFilter({}, {}, options),
      ];
      // Intentional JS bypass fixtures: getters must not even be consulted.
      const obsolete = [true, false, undefined].map((lean) => ({ ...quiet, lean, hydration: 'lean' }));
      obsolete.push(Object.assign(Object.create({ lean: true, hydration: 'lean' }), quiet));
      obsolete.push(
        Object.defineProperties(
          { ...quiet },
          {
            lean: {
              get() {
                throw new Error('stale lean was read');
              },
            },
            hydration: {
              get() {
                throw new Error('stale hydration was read');
              },
            },
          },
        ),
      );
      const modes = async (options: any = quiet) => {
        f.source.queries.length = 0;
        for (const call of calls) data(await call(options));
        return f.source.queries.map((query) => query.lean);
      };
      expect(await modes()).toEqual([false, false, false, true, false, false]);
      f.api.runtime.setModelOption(f.name, 'hydration', {
        find: 'lean',
        findOne: 'lean',
        findById: 'hydrated',
      });
      // Public built-ins are already resolved when forwarding to find/findOne.
      expect(await modes()).toEqual([true, true, false, true, false, false]);
      f.api.runtime.setModelOption(f.name, 'hydration.publicList', 'hydrated');
      f.api.runtime.setModelOption(f.name, 'hydration.publicRead', 'lean');
      expect(await modes()).toEqual([true, true, false, false, true, true]);
      for (const options of obsolete) expect(await modes(options)).toEqual([true, true, false, false, true, true]);
      service.defaults = { findOneOptions: { ...quiet } };
      expect(await modes()).toEqual([true, true, false, false, true, true]);
      f.api.runtime.setModelOption(f.name, 'hydration', { findById: 'lean' });
      for (const options of obsolete) expect(await modes(options)).toEqual([false, false, true, true, false, false]);
    });
  });

  it.each([true, false])('read-to-list fallback retains the initiating read mode (lean=%s)', async (lean) => {
    const f = await fixture();
    f.api.runtime.setModelOptions(f.name, {
      baseFilter: { read: () => ({ name: 'absent' }), list: () => ({}) },
      hydration: { publicRead: mode(lean), publicList: mode(!lean) },
    });
    await f.check(async (req) => {
      const service = req.macl.getPublicService(f.name);
      for (const call of [() => service._read(f.id, {}, quiet), () => service._readFilter({}, {}, quiet)]) {
        f.source.queries.length = 0;
        expect(data(await call()).name).toBe('row');
        expect(f.source.queries.map(({ op, lean }) => ({ op, lean }))).toEqual([
          { op: 'findOne', lean },
          { op: 'findOne', lean },
        ]);
      }
    });
  });

  it('rejects assigned and later-mutated legacy defaults before a query', async () => {
    const f = await fixture();
    await f.check(async (req) => {
      for (const service of [req.macl.getService(f.name), req.macl.getPublicService(f.name)]) {
        const previous = { findOneOptions: { ...quiet } };
        service.defaults = previous;
        for (const key of ['lean', 'hydration']) {
          expect(() => {
            service.defaults = { findOneOptions: { [key]: undefined } } as never;
          }).toThrow(new RegExp(`defaults.findOneOptions.${key}.*hydration.findOne`));
          expect(service.defaults).toBe(previous);
          Object.defineProperty(previous.findOneOptions, key, { value: true, configurable: true });
          await expect(service.findOne({})).rejects.toThrow(TypeError);
          delete (previous.findOneOptions as Row)[key];
        }
      }
      expect(f.source.queries).toEqual([]);
    });
  });

  it.each([true, false])('populate inherits the parent query rather than target defaults (lean=%s)', async (lean) => {
    const f = await fixture();
    f.api.runtime.setModelOption(f.name, 'hydration.findOne', mode(lean));
    f.api.runtime.setModelOption(f.targetName, 'hydration', {
      find: mode(!lean),
      publicRead: mode(!lean),
    });
    await f.check(async (req) => {
      const row = data(
        await req.macl
          .getService(f.name)
          .findOne({}, { select: ['ref'], populate: [{ path: 'ref', select: selection }] }, quiet),
      );
      expect(f.source.queries[0].lean).toBe(lean);
      expect(f.target.queries).toMatchObject([{ op: 'find', lean }]);
      expect(f.target.fetched[0] instanceof mongoose.Document).toBe(!lean);
      expect(f.target.initialized).toHaveLength(lean ? 0 : 1);
      expect(row.ref instanceof mongoose.Document).toBe(false);
      expect(row.ref.value).toBe(lean ? 'stored' : 'getter:stored');
      expect(row.ref.missingDefault).toBe(lean ? undefined : 'fetch-default');
      expect(row.ref.initOnly).toBe(lean ? undefined : 'post-init');
      expect(row.ref).not.toHaveProperty('secret');
      expect(row.ref).not.toHaveProperty('nativeVirtual');
    });
  });

  it.each(['read', 'list'] as const)('legacy and correlated %s includes force lean target reads', async (op) => {
    const f = await fixture();
    f.api.runtime.setModelOption(f.targetName, 'hydration', {
      find: 'hydrated',
      findOne: 'hydrated',
      publicRead: 'hydrated',
      publicList: 'hydrated',
    });
    await f.check(async (req) => {
      for (const correlated of [false, true]) {
        f.target.queries.length = 0;
        const row = data(
          await req.macl.getService(f.name).findOne(
            {},
            {
              include: {
                model: f.targetName,
                op,
                path: 'joined',
                ...(correlated
                  ? { mode: 'correlated', filter: { name: { $parent: 'name' } } }
                  : { localField: 'name', foreignField: 'name' }),
                args: { select: selection },
              },
            } as never,
            quiet,
          ),
        );
        const child = op === 'read' ? row.joined : row.joined[0];
        expect(child).toMatchObject({ name: 'row', value: 'stored' });
        expect(child).not.toHaveProperty('missingDefault');
        expect(f.target.queries).toMatchObject([{ op: op === 'read' ? 'findOne' : 'find', lean: true }]);
      }
      expect(f.target.initialized).toEqual([]);
    });
  });

  it('subqueries use the target public list/read buckets', async () => {
    const f = await fixture();
    await f.check(async (req) => {
      for (const op of ['read', 'list'] as const) {
        f.target.queries.length = 0;
        const sq = {
          $$sq: {
            model: f.targetName,
            op,
            filter: {},
            args: { select: ['name'] },
            options: quiet,
            sqOptions: { path: 'name' },
          },
        };
        const row = data(
          await req.macl.getService(f.name).findOne({ name: op === 'list' ? { $in: sq } : sq } as never, {}, quiet),
        );
        expect(row.name).toBe('row');
        expect(f.target.queries).toMatchObject([{ op: op === 'list' ? 'find' : 'findOne', lean: op === 'list' }]);
      }
    });
  });

  it.each(['read', 'list'] as const)(
    'subquery %s captures target server mode before hooks and ignores stale options',
    async (op) => {
      const f = await fixture();
      const key = op === 'list' ? 'publicList' : 'publicRead';
      f.api.runtime.setModelOption(f.targetName, `hydration.${key}`, 'hydrated');
      f.api.runtime.setModelOption(f.targetName, 'baseFilter', () => {
        f.api.runtime.setModelOption(f.targetName, `hydration.${key}`, 'lean');
        return {};
      });
      await f.check(async (req) => {
        const sq = {
          $$sq: {
            model: f.targetName,
            op,
            filter: {},
            args: { select: ['name'] },
            options: { ...quiet, lean: true, hydration: 'lean' },
            sqOptions: { path: 'name' },
          },
        };
        const call = () =>
          req.macl.getService(f.name).findOne({ name: op === 'list' ? { $in: sq } : sq } as never, {}, quiet);
        data(await call());
        data(await call());
        expect(f.target.queries.map(({ lean }) => lean)).toEqual([false, true]);
      });
    },
  );

  it.each(['_read', '_readFilter'] as const)(
    '%s fallback keeps hydration across configuration changes',
    async (entry) => {
      const f = await fixture();
      f.api.runtime.setModelOptions(f.name, {
        hydration: { publicRead: 'hydrated', publicList: 'lean' },
        baseFilter: {
          read: () => {
            f.api.runtime.setModelOption(f.name, 'hydration.publicRead', 'lean');
            return { name: 'absent' };
          },
          list: () => ({}),
        },
      });
      await f.check(async (req) => {
        const service = req.macl.getPublicService(f.name);
        data(await (entry === '_read' ? service._read(f.id, {}, quiet) : service._readFilter({}, {}, quiet)));
        expect(f.source.queries.map(({ lean }) => lean)).toEqual([false, false]);
      });
    },
  );

  it('raw parent helpers are always hydrated, with no JS spread backdoor', async () => {
    const f = await fixture();
    f.api.runtime.setModelOption(f.name, 'hydration', { findOne: 'lean', findById: 'lean', publicRead: 'lean' });
    await f.check(async (req) => {
      const service = req.macl.getService(f.name);
      const parent = await service.getParentDoc(f.id, 'children');
      expect(parent instanceof mongoose.Document).toBe(true);
      expect(parent.children[0] instanceof mongoose.Document).toBe(true);
      expect(typeof parent.save).toBe('function');
      expect(parent.missingDefault).toBe('fetch-default');
      expect(parent._permissions).toBeUndefined();
      // Intentional old JavaScript option fixtures.
      const stale = await service.getParentDoc(f.id, 'children', {}, { lean: true, hydration: 'lean' } as never);
      expect(stale instanceof mongoose.Document).toBe(true);
      expect(stale.missingDefault).toBe('fetch-default');
      const args = Object.defineProperty({ filter: { _id: f.id }, select: '', populate: [] }, 'lean', {
        enumerable: true,
        get() {
          throw new Error('spread backdoor');
        },
      });
      expect((await service.findRawParentDoc(args)) instanceof mongoose.Document).toBe(true);
      expect(f.source.queries.every(({ lean }) => !lean)).toBe(true);
      expect(f.docPermissions).not.toHaveBeenCalled();
    });
  });

  it('dedicated subdocument reads hydrate; post-save visibility alone refetches lean', async () => {
    const f = await fixture();
    f.api.runtime.setModelOption(f.name, 'hydration', { find: 'lean', findOne: 'lean', publicRead: 'lean' });
    await f.check(async (req) => {
      const service = req.macl.getService(f.name);
      expect(data(await service.listSub(f.id, 'children'))[0].name).toBe('child');
      expect(data(await service.readSub(f.id, 'children', f.childId)).name).toBe('child');
      expect(data(await service.updateSub(f.id, 'children', f.childId, { name: 'changed' })).name).toBe('changed');
      expect(f.source.queries.map(({ lean }) => lean)).toEqual([false, false, false, true]);
    });
  });

  it('update, create and delete lifecycle hooks retain live documents', async () => {
    const f = await fixture();
    const lifecycle = vi.fn((doc: any) => {
      expect(doc instanceof mongoose.Document).toBe(true);
      return doc;
    });
    f.api.runtime.setModelOptions(f.name, {
      hydration: { find: 'lean', findOne: 'lean', findById: 'lean', publicRead: 'lean' },
      transform: lifecycle,
      afterPersist: lifecycle,
      beforeDelete: lifecycle,
      afterDelete: lifecycle,
    });
    await f.check(async (req) => {
      const service = req.macl.getService(f.name);
      const updated = data(await service.updateById(f.id, { name: 'updated' }, {}, quiet));
      expect(updated instanceof mongoose.Document).toBe(false);
      expect(updated.name).toBe('updated');
      const created = data(await service.create({ name: 'created' }, {}, quiet));
      expect(created[0] instanceof mongoose.Document).toBe(false);
      data(await service.delete(f.id));
      expect(f.source.queries.map(({ lean }) => lean)).toEqual([false, false]);
      expect(lifecycle).toHaveBeenCalledTimes(5);
    });
  });

  it.each([
    { plugin: true, lean: false, field: '_permissions', strip: false, alias: true },
    { plugin: true, lean: true, field: '_permissions', strip: false, alias: true },
    { plugin: false, lean: false, field: '_permissions', strip: false, alias: true },
    { plugin: false, lean: true, field: 'meta.grants', strip: false, alias: true },
    { plugin: true, lean: false, field: 'meta.grants', strip: false, alias: true },
    { plugin: true, lean: false, field: '_permissions', strip: true, alias: false },
  ])(
    'aliases only serialized metadata independent of mode/plugin: %j',
    async ({ plugin, lean, field, strip, alias }) => {
      const f = await fixture({ plugin });
      f.api.runtime.setModelOptions(f.name, {
        documentPermissionField: field,
        stripPermissionsField: strip,
        exposedDocPermissionKeys: ['allowed'],
        hydration: { findOne: mode(lean) },
      });
      await f.check(async (req) => {
        const row = data(await req.macl.getService(f.name).findOne({}, {}, { ...quiet, includePermissions: true }));
        const metadata = field === 'meta.grants' ? row.meta?.grants : row._permissions;
        expect(metadata).toEqual(strip ? undefined : { allowed: true });
        if (alias) {
          expect(row.permissions).toBe(metadata);
          expect(Object.getOwnPropertyDescriptor(row, 'permissions')).toEqual({
            value: metadata,
            enumerable: false,
            writable: true,
            configurable: true,
          });
        } else expect(row).not.toHaveProperty('permissions');
        expect(Object.keys(row)).not.toContain('permissions');
        expect(JSON.parse(JSON.stringify(row))).not.toHaveProperty('permissions');
        expect(JSON.stringify(row)).not.toContain('hiddenGrant');
      });
    },
  );

  it('preserves a legitimate permissions business field rather than overwriting it with an alias', async () => {
    const f = await fixture({ businessPermissions: true });
    await f.check(async (req) => {
      const row = data(await req.macl.getService(f.name).findOne({}, { select: ['permissions'] }, quiet));
      expect(row.permissions).toBe('business');
      expect(Object.keys(row)).toContain('permissions');
    });
  });

  it.each([true, false])(
    'preserves aliases across public picks/tasks and include copies without inventing related metadata (lean=%s)',
    async (lean) => {
      const f = await fixture();
      f.api.runtime.setModelOptions(f.name, {
        documentPermissionField: 'meta.grants',
        hydration: { publicList: mode(lean), publicRead: mode(lean), findOne: mode(lean) },
        exposedDocPermissionKeys: ['allowed'],
      });
      f.api.runtime.setModelOptions(f.targetName, { documentPermissionField: 'meta.grants' });
      const alias = (row: Row) => {
        expect(row.permissions).toBe(row.meta.grants);
        expect(Object.getOwnPropertyDescriptor(row, 'permissions')).toMatchObject({
          enumerable: false,
          writable: true,
          configurable: true,
        });
        expect({ ...row }).not.toHaveProperty('permissions');
        expect(JSON.stringify(row)).not.toContain('hiddenGrant');
      };
      await f.check(async (req) => {
        const service = req.macl.getPublicService(f.name);
        for (const correlated of [false, true]) {
          const rows = data(
            await service._list(
              {},
              {
                select: ['name', 'ref'],
                populate: [{ path: 'ref', select: ['name'] }],
                include: {
                  model: f.targetName,
                  op: 'list',
                  path: 'joined',
                  args: { select: ['name'] },
                  ...(correlated
                    ? { mode: 'correlated', filter: { name: { $parent: 'name' } } }
                    : { localField: 'name', foreignField: 'name' }),
                },
                tasks: [
                  {
                    type: 'COPY',
                    args: [
                      { src: 'name', dest: 'copied' },
                      { src: 'joined', dest: 'copy' },
                    ],
                    options: { mutable: false },
                  },
                  { type: 'MOVE', args: [{ src: 'copy', dest: 'moved' }], options: { mutable: false } },
                ],
              } as never,
              { ...quiet, includePermissions: true },
            ),
          );
          alias(rows[0]);
          alias(rows[0].joined[0]);
          alias(rows[0].moved[0]);
          expect(rows[0].moved[0]).not.toBe(rows[0].joined[0]);
          expect(rows[0].moved[0].permissions).not.toBe(rows[0].joined[0].permissions);
          expect(rows[0].joined[0].meta.grants).toEqual({ _view: { $: '_' }, _edit: { $: '_' } });
          expect(rows[0].ref).not.toHaveProperty('permissions');
          expect(rows[0].ref).not.toHaveProperty('meta');
          expect(rows[0].copied).toBe('row');
        }
        alias(data(await service._create({ name: 'created' }, { select: ['name'] }, quiet))[0]);
        alias(data(await service._update(f.id, { name: 'updated' }, { select: ['name'] }, quiet)));
        alias(data(await service._new({}, quiet)));
        const child = data(await service.readSub(f.id, 'children', f.childId));
        expect(child).not.toHaveProperty('permissions');
        expect(child).not.toHaveProperty('meta');
      });
    },
  );

  it('preserves package virtual and include collisions; canonical permissions paths remain enumerable', async () => {
    const f = await fixture();
    f.api.runtime.setModelOption(f.name, 'virtuals.permissions', () => 'virtual');
    await f.check(async (req) => {
      const service = req.macl.getService(f.name);
      const virtual = data(await service.findOne({}, { select: ['permissions'] }, quiet));
      expect(virtual.permissions).toBe('virtual');
      expect(Object.keys(virtual)).toContain('permissions');
      f.api.runtime.setModelOption(f.name, 'virtuals.permissions', undefined);
      const included = data(
        await service.findOne(
          {},
          {
            include: {
              model: f.targetName,
              op: 'read',
              path: 'permissions',
              localField: 'name',
              foreignField: 'name',
              args: { select: ['name'] },
            },
          },
          quiet,
        ),
      );
      expect(included.permissions.name).toBe('row');
      expect(Object.keys(included)).toContain('permissions');
      for (const field of ['permissions', 'permissions.grants']) {
        f.api.runtime.setModelOption(f.name, 'documentPermissionField', field);
        const row = data(await service.findOne({}, {}, { ...quiet, includePermissions: true }));
        expect(Object.getOwnPropertyDescriptor(row, 'permissions')?.enumerable).toBe(true);
        expect(field === 'permissions' ? row.permissions : row.permissions.grants).toMatchObject({ allowed: true });
      }
    });
  });
});
