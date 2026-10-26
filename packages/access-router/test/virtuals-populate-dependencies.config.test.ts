import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import {
  captureModelAuthorizationConfiguration,
  getCapturedAuthorizationOption,
} from '../src/acl/model-output-planning';
import { resolveVirtualPopulateDependencies } from '../src/acl/virtual-populate-dependencies';
import { getScopeVirtualsObject, resolveSnapshotDescriptor } from '../src/acl/virtual-projection';
import {
  readServiceAuthorization,
  resolveServiceAuthorization,
  ServiceAuthorizationError,
} from '../src/acl/service-authorization';
import { createSetCore } from '../src/core';
import type { ModelRequest } from '../src/interfaces';
import Permission from '../src/permission';

let serial = 0;
afterEach(() => mongoose.deleteModel(/^DpvConfig/));

function models() {
  const api = createAccessRuntime();
  const suffix = ++serial;
  const target = mongoose.model(
    `DpvConfigTarget${suffix}`,
    new mongoose.Schema(
      {
        balance: Number,
        creditLimit: Number,
        name: { type: String, alias: 'label' },
        profile: { city: String, secret: String, dynamic: mongoose.Schema.Types.Mixed },
        entries: [new mongoose.Schema({ amount: Number, label: String }, { _id: false })],
        tags: [String],
        peer: { type: mongoose.Schema.Types.ObjectId, ref: 'OtherTarget' },
        metadata: { permissions: { read: Boolean }, note: String },
        mixed: mongoose.Schema.Types.Mixed,
        map: { type: Map, of: String },
        revision: Number,
        execution: String,
      },
      { versionKey: 'revision' },
    ),
  );
  target.schema.virtual('display').get(() => 'computed');
  const ref = { type: mongoose.Schema.Types.ObjectId, ref: target.modelName };
  const child = new mongoose.Schema({ account: ref, total: Number });
  const source = mongoose.model(
    `DpvConfigSource${suffix}`,
    new mongoose.Schema({
      total: Number,
      account: ref,
      accounts: [ref],
      child,
      children: [child],
      nested: { inner: { account: ref } },
      dependsOnPopulate: String,
    }),
  );
  api.createRouter(target, {
    operationAccess: { read: true },
    documentPermissionField: 'metadata.permissions',
    requireExplicitSelect: true,
    defaults: { findArgs: { select: ['name'] } },
    virtuals: { badge: () => 'package virtual' } as never,
  });
  return { api, source, target };
}

const descriptor = (select?: unknown, path = 'account') => ({
  get: () => true,
  dependsOnPopulate: [{ path, ...(select === undefined ? {} : { select }) }],
});
const allFields = [
  '_id',
  'balance',
  'creditLimit',
  'entries.amount',
  'entries.label',
  'metadata.note',
  'name',
  'peer',
  'profile.city',
  'profile.secret',
  'tags',
].sort();

function capture(f: ReturnType<typeof models>) {
  return captureModelAuthorizationConfiguration(f.api.runtime, f.source.modelName);
}

function privateInputs(f: ReturnType<typeof models>, name = 'canOrder', access = 'read', scope: string[] = []) {
  return resolveVirtualPopulateDependencies(capture(f), scope, name, access);
}

describe('DPV-01 populated dependency configuration', () => {
  it('accepts a registered scalar dependency at construction without a local dependsOn', () => {
    const { api, source } = models();
    const get = () => true;
    api.createRouter(source, {
      virtuals: { canOrder: { get, dependsOnPopulate: [{ path: 'account', select: ['balance'] }] } } as never,
    });
    expect(api.runtime.resolveVirtualDescriptor(source.modelName, 'canOrder', 'read')).toEqual({
      get,
      dependsOn: [],
      dependsOnPopulate: [{ path: 'account', select: ['balance'] }],
    });
  });

  it.each([
    [undefined, allFields],
    ['', allFields],
    [[], allFields],
    [{}, allFields],
    ['balance, creditLimit -_id', ['balance', 'creditLimit']],
    [
      ['balance, creditLimit', '-creditLimit'],
      ['_id', 'balance'],
    ],
    [{ balance: 1, _id: -1 }, ['balance']],
    ['-profile -creditLimit', allFields.filter((path) => !path.startsWith('profile.') && path !== 'creditLimit')],
    ['profile -profile.secret', ['_id', 'profile.city']],
    ['entries -entries.label', ['_id', 'entries.amount']],
    ['peer', ['_id', 'peer']],
    ['_id -_id', []],
  ])('normalizes persisted selections %j independently of public target defaults', (select, expected) => {
    const f = models();
    f.api.createRouter(f.source, { virtuals: { canOrder: descriptor(select) } as never });
    const [input] = privateInputs(f);
    expect(input.selection).toEqual(expected);
    expect(input.fetchSelection).toEqual([...new Set(['_id', ...expected])].sort());
    expect(input.includeId).toBe(expected.includes('_id'));
    expect(input.target.model).toBe(f.target);
    expect(input.target.schema).toBe(f.target.schema);
    expect(input.target.runtime).toBe(f.api.runtime);
    expect(input.target.configuration).not.toHaveProperty('virtuals');
  });

  it.each(
    [
      null,
      'account',
      {},
      [null],
      ['account'],
      [1],
      new Array(1),
      [{ path: 'account' }, { path: 'account', select: 'name' }],
      [{ path: 'account', model: 'Other' }],
      [{ path: 'account', match: {} }],
      [{ path: 'account', access: 'list' }],
      [{ path: 'account', populate: [] }],
      [{ select: 'name' }],
      [{ path: 'unknown' }],
      [{ path: 'child.account' }],
      [{ path: '__proto__' }],
      [{ path: '_doc' }],
      [{ path: 'account', select: null }],
    ].map((value) => [value]),
  )('rejects malformed declarations atomically: %j', (dependsOnPopulate) => {
    const f = models();
    f.api.createRouter(f.source, { virtuals: { canOrder: descriptor('balance') } as never });
    const before = f.api.getModelOptions(f.source.modelName);
    expect(() =>
      f.api.setModelOptions(f.source.modelName, {
        operationAccess: true,
        virtuals: { canOrder: { get: () => false, dependsOnPopulate } } as never,
      }),
    ).toThrow(/dependsOnPopulate/);
    expect(f.api.getModelOptions(f.source.modelName)).toEqual(before);
    expect(() =>
      f.api.setModelOption(
        f.source.modelName,
        'virtuals.canOrder.dependsOnPopulate' as never,
        dependsOnPopulate as never,
      ),
    ).toThrow(/dependsOnPopulate/);
    expect(f.api.getModelOptions(f.source.modelName)).toEqual(before);
  });

  it.each(
    [
      ['balance', 1],
      [true],
      [['balance']],
      new Array(1),
      { balance: 0 },
      { balance: true },
      '+balance',
      'unknown',
      '-unknown',
      'badge',
      '-display',
      'label',
      'revision',
      '_doc',
      'constructor',
      'profile.__proto__',
      'execution',
      'metadata.permissions',
      'metadata.permissions.read',
      'mixed',
      'mixed.value',
      'map',
      'map.key',
      'peer.name',
      'entries.0.amount',
      { '+balance': 1 },
    ].map((value) => [value]),
  )('rejects unsupported target selections including exclusions: %j', (select) => {
    const f = models();
    expect(() => f.api.createRouter(f.source, { virtuals: { canOrder: descriptor(select) } as never })).toThrow(
      /dependsOnPopulate/,
    );
    expect(f.api.runtime.hasModel(f.source.modelName)).toBe(false);
  });

  it('resolves independently inherited/overridden lists identically in live and snapshot resolvers', () => {
    const f = models();
    const get = () => true;
    f.api.createRouter(f.source, {
      virtuals: {
        canOrder: {
          dependsOn: ['total'],
          dependsOnPopulate: [{ path: 'account', select: 'balance' }],
          default: get,
          read: { get, dependsOn: [], dependsOnPopulate: undefined },
          list: { get, dependsOnPopulate: [] },
          update: { get, dependsOnPopulate: [{ path: 'accounts', select: 'creditLimit' }] },
        },
      } as never,
    });
    const config = capture(f);
    const registry = getScopeVirtualsObject(config.virtuals as Record<string, unknown>, []);
    for (const access of ['read', 'list', 'create', 'update', 'custom']) {
      expect(f.api.runtime.resolveVirtualDescriptor(f.source.modelName, 'canOrder', access)).toEqual(
        resolveSnapshotDescriptor(registry, 'canOrder', access),
      );
    }
    expect(f.api.runtime.resolveVirtualDescriptor(f.source.modelName, 'canOrder', 'read')?.dependsOn).toEqual([]);
    expect(privateInputs(f, 'canOrder', 'read')[0].selection).toEqual(['_id', 'balance']);
    expect(privateInputs(f, 'canOrder', 'list')).toEqual([]);
    expect(privateInputs(f, 'canOrder', 'custom')[0].selection).toEqual(['_id', 'balance']);
    expect(privateInputs(f, 'canOrder', 'update')[0]).toMatchObject({
      path: 'accounts',
      cardinality: 'array',
      selection: ['_id', 'creditLimit'],
    });
    for (const invalid of [
      { dependsOnPopulate: null, read: { get, dependsOnPopulate: [] } },
      { dependsOnPopulate: [{ path: 'unknown' }], read: { get, dependsOnPopulate: [] } },
      { dependsOnPopulate: [], read: { get, dependsOnPopulate: null } },
      { read: get, update: descriptor('unknown') },
    ])
      expect(() => f.api.setModelOption(f.source.modelName, 'virtuals.canOrder' as never, invalid as never)).toThrow(
        /dependsOnPopulate/,
      );
  });

  it('supports single, nested and document-array scopes with scope-local source keys', () => {
    const f = models();
    f.api.createRouter(f.source, {
      virtuals: {
        child: { sub: { canOrder: descriptor('balance') } },
        children: { sub: { canOrder: descriptor('balance') } },
        nested: { sub: { inner: { sub: { canOrder: descriptor('balance') } } } },
      } as never,
    });
    for (const [scope, sourcePath] of [
      [['child', 'sub'], 'child.account'],
      [['children', 'sub'], 'children.account'],
      [['nested', 'sub', 'inner', 'sub'], 'nested.inner.account'],
    ] as const)
      expect(privateInputs(f, 'canOrder', 'read', [...scope])[0]).toMatchObject({ path: 'account', sourcePath });
    expect(() =>
      f.api.setModelOption(
        f.source.modelName,
        'virtuals.child.sub.canOrder.dependsOnPopulate' as never,
        [{ path: 'child.account' }] as never,
      ),
    ).toThrow(/scope-local/);
  });

  it('does not inherit a default leaf declaration into an exact bare getter without shared inputs', () => {
    const f = models();
    f.api.createRouter(f.source, {
      virtuals: {
        canOrder: { default: descriptor('balance'), read: () => true },
        readOnly: { read: descriptor('balance') },
      } as never,
    });
    expect(privateInputs(f, 'canOrder', 'read')).toEqual([]);
    expect(privateInputs(f, 'canOrder', 'list')[0].selection).toEqual(['_id', 'balance']);
    expect(privateInputs(f, 'readOnly', 'list')).toEqual([]);
  });

  it('supports valid router and indexed dotted setter replacements without mutating earlier descriptors', () => {
    const f = models();
    const router = f.api.createRouter(f.source, { virtuals: { canOrder: descriptor('balance') } as never });
    const before = capture(f);
    const resolved = f.api.runtime.resolveVirtualDescriptor(f.source.modelName, 'canOrder', 'read')!;
    resolved.dependsOnPopulate![0].select = 'unknown';
    expect(privateInputs(f)[0].selection).toEqual(['_id', 'balance']);
    router.set('virtuals.canOrder.dependsOnPopulate.0.select' as never, ['name', '-_id'] as never);
    expect(privateInputs(f)[0].selection).toEqual(['name']);
    router.setOptions({ virtuals: { canOrder: descriptor('creditLimit', 'accounts') } } as never);
    expect(privateInputs(f)[0]).toMatchObject({
      path: 'accounts',
      cardinality: 'array',
      selection: ['_id', 'creditLimit'],
    });
    expect(resolveVirtualPopulateDependencies(before, [], 'canOrder', 'read')[0].selection).toEqual(['_id', 'balance']);
    const valid = f.api.getModelOptions(f.source.modelName);
    expect(() => router.set('virtuals.canOrder.dependsOnPopulate.0.select' as never, ['unknown'] as never)).toThrow(
      /dependsOnPopulate/,
    );
    expect(f.api.getModelOptions(f.source.modelName)).toEqual(valid);
  });

  it.each([true, { default: true }, { default: true, read: false }, { list: true }])(
    'captures the existing exact/default/bare read resolver: %j',
    (operationAccess) => {
      const f = models();
      f.api.setModelOptions(f.target.modelName, {
        operationAccess,
        baseFilter: { default: () => ({ tenant: 'default' }) },
        overrideFilter: { read: (filter) => filter },
      });
      f.api.createRouter(f.source, { virtuals: { canOrder: descriptor('balance') } as never });
      const { configuration } = privateInputs(f)[0].target;
      for (const key of ['operationAccess.read', 'baseFilter.read', 'overrideFilter.read']) {
        expect(getCapturedAuthorizationOption(configuration, key)).toEqual(
          f.api.getModelOption(f.target.modelName, key),
        );
      }
    },
  );

  it('requires the runtime target instance to match the actual source-connection ref binding', () => {
    const f = models();
    const alias = `DpvConfigAlias${++serial}`;
    f.api.registerModelInstance(alias, f.target);
    f.api.setModelOptions(alias, {});
    f.source.schema.path('account').options.ref = alias;
    expect(() => f.api.createRouter(f.source, { virtuals: { canOrder: descriptor('balance') } as never })).toThrow(
      /bound to the source ref/,
    );
  });

  it('excludes package virtual collisions and recursive/dynamic target contents without copying a container wholesale', () => {
    const f = models();
    const recursive = new mongoose.Schema({ value: Number });
    recursive.add({ next: recursive });
    f.target.schema.add({ recursive, badge: String });
    expect(() => f.api.createRouter(f.source, { virtuals: { canOrder: descriptor('badge') } as never })).toThrow(
      /eligible static persisted/,
    );
    f.api.createRouter(f.source, { virtuals: { canOrder: descriptor('recursive') } as never });
    expect(privateInputs(f)[0].selection).toEqual(['_id', 'recursive._id', 'recursive.value']);
    expect(() =>
      f.api.setModelOption(f.source.modelName, 'virtuals.canOrder' as never, descriptor('recursive.next') as never),
    ).toThrow(/eligible static persisted/);
  });

  it('shares terminal target identity within a capture and detaches native policy values on every resolution', () => {
    const f = models();
    const at = new Date('2026-10-25T00:00:00Z');
    f.api.setModelOption(f.target.modelName, 'baseFilter.read', { at } as never);
    f.api.createRouter(f.source, {
      virtuals: { canOrder: descriptor('balance'), also: descriptor('name', 'accounts') } as never,
    });
    const configuration = capture(f);
    const [first] = resolveVirtualPopulateDependencies(configuration, [], 'canOrder', 'read');
    const [second] = resolveVirtualPopulateDependencies(configuration, [], 'also', 'read');
    expect(first.target.identity).toBe(second.target.identity);
    const scope = getCapturedAuthorizationOption(first.target.configuration, 'baseFilter.read') as { at: Date };
    scope.at.setUTCFullYear(2000);
    at.setUTCFullYear(2001);
    const [again] = resolveVirtualPopulateDependencies(configuration, [], 'canOrder', 'read');
    expect(
      (
        getCapturedAuthorizationOption(again.target.configuration, 'baseFilter.read') as { at: Date }
      ).at.getUTCFullYear(),
    ).toBe(2026);
    expect(privateInputs(f)[0].target.identity).not.toBe(first.target.identity);
  });

  it('requires target options in this runtime even with the unregistered public-populate opt-out', () => {
    const f = models();
    const other = createAccessRuntime();
    other.setGlobalOption('requireRegisteredPopulateModels', false);
    other.registerModelInstance(f.target.modelName, f.target);
    expect(() => other.createRouter(f.source, { virtuals: { canOrder: descriptor() } as never })).toThrow(
      /configured first/,
    );
    expect(other.runtime.hasModel(f.source.modelName)).toBe(false);
    other.setModelOptions(f.target.modelName, {});
    expect(() => other.createRouter(f.source, { virtuals: { canOrder: descriptor() } as never })).not.toThrow();
  });

  it('rejects traversing a schema-bearing ref container as an embedded source scope', () => {
    const f = models();
    const child = new mongoose.Schema({
      account: { type: mongoose.Schema.Types.ObjectId, ref: f.target.modelName },
    });
    f.source.schema.add({ referred: { type: child, ref: f.target.modelName } });
    expect(() =>
      f.api.createRouter(f.source, {
        virtuals: { referred: { sub: { canOrder: descriptor('balance') } } } as never,
      }),
    ).toThrow(/static embedded/);
  });

  it.each(['stringId', 'refPath', 'functionRef', 'modelRef', 'mixed', 'map', 'nestedArray', 'virtualRef'])(
    'rejects unsupported source shape %s',
    (shape) => {
      const f = models();
      const ref = { type: mongoose.Schema.Types.ObjectId, ref: f.target.modelName };
      const shapes = {
        stringId: { type: String, ref: f.target.modelName },
        refPath: { ...ref, refPath: 'modelName' },
        functionRef: { ...ref, ref: () => f.target.modelName },
        modelRef: { ...ref, ref: f.target },
        mixed: { type: mongoose.Schema.Types.Mixed, ref: f.target.modelName },
        map: { type: Map, of: ref },
        nestedArray: [[ref]],
      };
      const schema = new mongoose.Schema(shape === 'virtualRef' ? {} : { account: shapes[shape] });
      if (shape === 'virtualRef')
        schema.virtual('account', { ref: f.target.modelName, localField: '_id', foreignField: '_id' });
      const source = mongoose.model(`DpvConfigBad${++serial}`, schema);
      expect(() => f.api.createRouter(source, { virtuals: { canOrder: descriptor() } as never })).toThrow(
        /ObjectId scalar or 1D array/,
      );
    },
  );

  it('rejects non-ObjectId/discriminator/cross-connection targets and discriminator-varying sources', () => {
    const f = models();
    const connection = mongoose.createConnection();
    const remote = connection.model(`DpvConfigRemote${++serial}`, new mongoose.Schema({ name: String }));
    const stringId = mongoose.model(`DpvConfigStringId${++serial}`, new mongoose.Schema({ _id: String }));
    const base = mongoose.model(`DpvConfigBase${++serial}`, new mongoose.Schema({ name: String }));
    const variant = base.discriminator(`DpvConfigVariant${++serial}`, new mongoose.Schema({ extra: String }));
    for (const target of [remote, stringId, base, variant]) {
      f.api.createRouter(target, {});
      const source = mongoose.model(
        `DpvConfigRef${++serial}`,
        new mongoose.Schema({ account: { type: mongoose.Schema.Types.ObjectId, ref: target.modelName } }),
      );
      expect(() => f.api.createRouter(source, { virtuals: { canOrder: descriptor() } as never })).toThrow(
        /same-connection non-discriminator ObjectId/,
      );
    }
    f.source.discriminator(`DpvConfigSourceVariant${++serial}`, new mongoose.Schema({ extra: String }));
    expect(() => f.api.createRouter(f.source, { virtuals: { canOrder: descriptor() } as never })).toThrow(
      /non-discriminator source/,
    );
    const embedded = new mongoose.Schema({
      account: { type: mongoose.Schema.Types.ObjectId, ref: f.target.modelName },
    });
    const schema = new mongoose.Schema({ children: [embedded] });
    schema
      .path<mongoose.Schema.Types.DocumentArray>('children')
      .discriminator('Different', new mongoose.Schema({ extra: String }));
    const source = mongoose.model(`DpvConfigEmbeddedVariant${++serial}`, schema);
    expect(() =>
      f.api.createRouter(source, { virtuals: { children: { sub: { canOrder: descriptor() } } } as never }),
    ).toThrow(/non-discriminator source/);
    void connection.destroy();
  });

  it('uses proposed self-ref options and captures cyclic ref declarations terminally', () => {
    const f = models();
    f.source.schema.add({ parent: { type: mongoose.Schema.Types.ObjectId, ref: f.source.modelName } });
    f.api.createRouter(f.source, {
      documentPermissionField: 'total',
      virtuals: { canOrder: descriptor('account', 'parent') } as never,
    });
    expect(privateInputs(f)[0].target.model).toBe(f.source);
    expect(() =>
      f.api.setModelOptions(f.source.modelName, { virtuals: { canOrder: descriptor('total', 'parent') } as never }),
    ).toThrow(/eligible static persisted/);
    f.target.schema.add({ order: { type: mongoose.Schema.Types.ObjectId, ref: f.source.modelName } });
    f.api.setModelOptions(f.target.modelName, { virtuals: { cycle: descriptor('account', 'order') } as never });
    f.api.setModelOptions(f.source.modelName, { virtuals: { canOrder: descriptor('balance') } as never });
    // A later target declaration can be invalid without making the terminal source edge recursive.
    f.source.schema.remove('account');
    expect(() => captureModelAuthorizationConfiguration(f.api.runtime, f.target.modelName)).toThrow(
      /eligible static persisted/,
    );
    f.source.schema.add({ account: { type: mongoose.Schema.Types.ObjectId, ref: f.target.modelName } });
    f.target.schema.path('order').options.ref = 'MissingModel';
    expect(() => capture(f)).not.toThrow();
    expect(privateInputs(f)[0].target.configuration).not.toHaveProperty('virtualPopulateSnapshot');
  });

  it('owns descriptors, target policies and selections through authorization copies and later replacements', () => {
    const f = models();
    const get = () => true;
    const select = { balance: 1, _id: -1 };
    const dependencies = [{ path: 'account', select }];
    const base = vi.fn(() => ({ tenant: 'old' }));
    f.api.setModelOption(f.target.modelName, 'baseFilter.read', base);
    f.api.createRouter(f.source, { virtuals: { canOrder: { get, dependsOnPopulate: dependencies } } as never });
    const configuration = capture(f);
    const binding = { request: {} as never, runtime: f.api.runtime, model: f.source, modelName: f.source.modelName };
    const call = resolveServiceAuthorization({
      binding,
      configuration,
      requestPermissions: new Permission({}),
      access: { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' },
    });
    select.balance = -1;
    dependencies.push({ path: 'accounts', select: { balance: 1, _id: -1 } });
    f.api.setModelOption(f.target.modelName, 'baseFilter.read', () => ({ tenant: 'new' }));
    f.api.setModelOption(f.source.modelName, 'virtuals.canOrder' as never, descriptor('name') as never);
    const saved = readServiceAuthorization(call, binding);
    const [old] = resolveVirtualPopulateDependencies(saved.configuration, [], 'canOrder', 'read');
    expect(old.selection).toEqual(['balance']);
    expect(getCapturedAuthorizationOption(old.target.configuration, 'baseFilter.read')).toBe(base);
    expect(
      resolveSnapshotDescriptor(saved.configuration.virtuals as Record<string, unknown>, 'canOrder', 'read')?.get,
    ).toBe(get);
    expect(privateInputs(f)[0].selection).toEqual(['_id', 'name']);
    expect(saved.relatedTargets).toEqual([]);
    expect(saved.authorization.related).toEqual({});
    expect(base).not.toHaveBeenCalled();
    const lookup = vi.spyOn(f.api.runtime, 'getModelInstance').mockImplementation(() => {
      throw new Error('live lookup');
    });
    expect(resolveVirtualPopulateDependencies(saved.configuration, [], 'canOrder', 'read')[0].target.identity).toBe(
      old.target.identity,
    );
    lookup.mockRestore();
  });

  it('revalidates changed target metadata/schema binding on the next capture', () => {
    const f = models();
    f.api.createRouter(f.source, { virtuals: { canOrder: descriptor('balance') } as never });
    const before = capture(f);
    f.api.setModelOption(f.target.modelName, 'documentPermissionField', 'balance');
    expect(() => capture(f)).toThrow(/eligible static persisted/);
    expect(resolveVirtualPopulateDependencies(before, [], 'canOrder', 'read')[0].selection).toEqual(['_id', 'balance']);
    f.api.setModelOption(f.target.modelName, 'documentPermissionField', 'metadata.permissions');
    f.target.schema.remove('balance');
    expect(() => capture(f)).toThrow(/eligible static persisted/);
  });

  it('fails operation capture before source hooks or persistence when a target binding becomes invalid', async () => {
    const f = models();
    const hook = vi.fn((value) => value);
    const insert = vi.spyOn(f.source.collection, 'insertOne');
    const find = vi.spyOn(f.source.collection, 'findOne');
    f.api.createRouter(f.source, {
      virtuals: { canOrder: descriptor('balance') } as never,
      overrideFilter: { read: hook },
      prepare: { create: hook },
    });
    const req = {} as ModelRequest;
    await createSetCore(f.api.runtime)(req, {} as never, () => {});
    const service = req.macl.getService(f.source.modelName);
    f.api.setModelOption(f.target.modelName, 'documentPermissionField', 'balance');
    await expect(service.findOne({})).rejects.toThrow(/dependsOnPopulate/);
    await expect(service.create({ total: 1 })).rejects.toThrow(/dependsOnPopulate/);
    expect(hook).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it('keeps same-spelled persisted business fields ordinary and does not mint related authority', () => {
    const f = models();
    f.api.createRouter(f.source, {
      permissionSchema: { dependsOnPopulate: true },
      virtuals: { canOrder: descriptor('balance') } as never,
    });
    const configuration = capture(f);
    expect(configuration.catalog.persistedPaths).toContain('dependsOnPopulate');
    const binding = { request: {} as never, runtime: f.api.runtime, model: f.source, modelName: f.source.modelName };
    expect(() =>
      resolveServiceAuthorization({
        binding,
        configuration,
        requestPermissions: new Permission({}),
        access: { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' },
        authorization: { related: { account: { model: f.target.modelName, operation: { mode: 'grant' } } } },
      }),
    ).toThrow(ServiceAuthorizationError);
  });
});
