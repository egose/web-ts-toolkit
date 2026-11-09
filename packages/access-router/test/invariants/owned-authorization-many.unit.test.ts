import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../../src/core';
import Permission from '../../src/permission';
import { AccessRuntime } from '../../src/runtime';
import { runWithRuntime } from '../../src/runtime-context';
import type { ModelRequest, ModelRouterOptions, OutputFieldOptions } from '../../src/interfaces';
import { Service } from '../../src/services/service';
import { PERMISSIONS } from '../../src/symbols';
import { EMPTY_DOCUMENT_GRANTS } from '../../src/acl/document-grants';
import { serverAuthorizationControls } from '../../src/acl/authorization-modes';
import * as planning from '../../src/acl/model-output-planning';
import * as catalog from '../../src/acl/field-catalog';
import * as stage from '../../src/acl/document-stage';
import * as publication from '../../src/acl/output-publication';
import * as authorization from '../../src/acl/service-authorization';
import * as materializer from '../../src/acl/trusted-output-materialization';
import { getRequestWorkState } from '../../src/helpers/request-work';
import { ServiceAuthorizationError } from '../../src/acl/authorization-snapshot';

let sequence = 0;
const badRequest = { result: { code: 'bad_request' } };

function fixture(options: ModelRouterOptions = {}, fields = 0, concurrency = { bulk: 10, hook: 10 }) {
  const schema = new mongoose.Schema({
    _id: String,
    name: String,
    secret: String,
    negative: String,
    own: String,
    payload: mongoose.Schema.Types.Mixed,
    contacts: [new mongoose.Schema({ label: String, secret: String }, { _id: false })],
    ...Object.fromEntries(Array.from({ length: fields }, (_, i) => [`f${i}`, String])),
  });
  const model = mongoose.model(`Oar09Many${++sequence}`, schema);
  const runtime = new AccessRuntime();
  runtime.setGlobalOption('requestComplexity', {
    maxBulkConcurrency: concurrency.bulk,
    maxHookConcurrency: concurrency.hook,
  });
  runtime.registerModelInstance(model.modelName, model);
  const hook = vi.fn(() => ({ own: true, suspended: true }));
  const virtual = vi.fn(() => 'computed');
  runtime.setModelOptions(model.modelName, {
    readAuthorizationMode: 'trusted',
    listAuthorizationMode: 'trusted',
    operationAccess: false,
    baseFilter: false,
    stripPermissionsField: true,
    modelPermissionPrefix: 'doc:',
    permissionSchema: {
      name: 'reader',
      secret: false,
      own: 'doc:own',
      payload: true,
      negative: (_permissions, facts) => !facts.suspended,
      contacts: { read: true, list: true, sub: { label: true, secret: false } },
      computed: true,
    },
    docPermissions: { read: hook, list: hook },
    virtuals: { computed: { get: virtual, dependsOn: [] } },
    ...options,
  });
  const request = {
    [PERMISSIONS]: new Permission({ reader: true }),
    user: { reader: true },
    query: {},
    params: {},
    get: () => undefined,
  } as unknown as ModelRequest;
  const { core, service, publicService } = runWithRuntime(runtime, () => {
    const core = (request.macl = new Core(request));
    return {
      core,
      service: core.getService(model.modelName),
      publicService: core.getPublicService(model.modelName),
    };
  });
  const db = vi.spyOn(model, 'find').mockImplementation(() => {
    throw new Error('unexpected DB');
  });
  const dbOne = vi.spyOn(model, 'findOne').mockImplementation(() => {
    throw new Error('unexpected DB');
  });
  return { model, schema, runtime, request, core, service, publicService, hook, virtual, db, dbOne };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function control(key: string, form: string): object {
  if (form === 'inherited') return Object.create({ [key]: undefined });
  if (form === 'hidden') return Object.defineProperty({}, key, { value: false });
  if (form === 'accessor')
    return Object.defineProperty({}, key, {
      get: () => {
        throw new Error('getter');
      },
    });
  return { [key]: form === 'false' ? false : undefined };
}

function observeStageRecords() {
  const records: Array<Record<string, unknown>> = [];
  const realSet = WeakMap.prototype.set;
  vi.spyOn(WeakMap.prototype, 'set').mockImplementation(function (key, value) {
    if (value && typeof value === 'object' && 'decisions' in value) records.push(value);
    return Reflect.apply(realSet, this, [key, value]);
  });
  return records;
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Oar09Many/);
});

describe('OAR-09F one explicit output-only collection', () => {
  it.each([1, 10, 100])('%i rows capture once but retain every row/function evaluation', async (count) => {
    const memos: unknown[] = [],
      ownedSources: unknown[] = [];
    const realSet = WeakMap.prototype.set;
    vi.spyOn(WeakMap.prototype, 'set').mockImplementation(function (key, value) {
      if (value && typeof value === 'object' && 'decisions' in value) {
        memos.push(value.decisions);
        ownedSources.push(value.source);
      }
      return Reflect.apply(realSet, this, [key, value]);
    });
    const rule = vi.fn(function (this: ModelRequest, permissions, facts) {
      expect(this).toBe(f.request);
      expect(permissions.has('reader')).toBe(true);
      expect(facts).toBe(EMPTY_DOCUMENT_GRANTS);
      expect(Object.isFrozen(facts)).toBe(true);
      return true;
    });
    const f = fixture(
      { permissionSchema: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`f${i}`, rule])) },
      24,
    );
    const capture = vi.spyOn(planning, 'captureOutputHelperConfiguration');
    const catalogs = vi.spyOn(catalog, 'captureAuthorizationFieldCatalog');
    const stages = vi.spyOn(stage, 'createDocumentStage');
    const sources = vi.spyOn(materializer, 'materializeTrustedOutputValue');
    const rows = Array.from({ length: count }, () =>
      Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`f${i}`, `${i}`])),
    );
    expect(await f.service.pickAllowedFieldsMany(rows, 'list')).toEqual(rows);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(catalogs).toHaveBeenCalledTimes(1);
    expect(stages).toHaveBeenCalledTimes(count);
    expect(new Set(stages.mock.results.map((entry) => entry.value)).size).toBe(count);
    expect(new Set(memos).size).toBe(count);
    expect(new Set(ownedSources).size).toBe(count);
    expect(ownedSources.every((source, index) => source !== rows[index])).toBe(true);
    expect(sources.mock.calls.filter((entry) => entry[1] === '')).toHaveLength(count);
    expect(rule).toHaveBeenCalledTimes(count * 24);
    capture.mockClear();
    catalogs.mockClear();
    stages.mockClear();
    rule.mockClear();
    for (const row of rows) await f.service.pickAllowedFields(row, 'list');
    expect(capture).toHaveBeenCalledTimes(count);
    expect(catalogs).toHaveBeenCalledTimes(count);
    expect(stages).toHaveBeenCalledTimes(count);
    expect(rule).toHaveBeenCalledTimes(count * 24);
    expect(f.db).not.toHaveBeenCalled();
    expect(f.dbOne).not.toHaveBeenCalled();
    expect(f.hook).not.toHaveBeenCalled();
    expect(f.virtual).not.toHaveBeenCalled();
  });

  it('owns every later original before the FIRST synchronous predicate', async () => {
    const rows = [
      { name: 'first', payload: Buffer.from('a') },
      { name: 'second', payload: Buffer.from('b') },
    ];
    const rule = vi.fn(() => {
      rows[1].name = 'mutated';
      rows[1].payload.fill(120);
      return true;
    });
    const f = fixture({ permissionSchema: { name: rule, payload: true } });
    const result = await f.service.pickAllowedFieldsMany(rows, 'list');
    expect(result).toEqual([
      { name: 'first', payload: Buffer.from('a') },
      { name: 'second', payload: Buffer.from('b') },
    ]);
    expect(rule).toHaveBeenCalledTimes(2);
  });

  it('duplicates share no native leaves, source, stage or decisions', async () => {
    const seen: object[] = [];
    const stages = vi.spyOn(stage, 'createDocumentStage');
    const rule = vi.fn(() => true);
    const f = fixture({ permissionSchema: { name: rule, payload: true } });
    const row = { _id: 'same', name: 'N', payload: { bytes: Buffer.from('a'), date: new Date(9), regex: /a/g } };
    const reader = vi.spyOn(stage, 'documentStageSource');
    const output = await f.service.pickAllowedFieldsMany([row, row], 'list');
    for (const result of reader.mock.results) if (result.type === 'return') seen.push(result.value);
    expect(new Set(seen).size).toBe(2);
    expect(stages).toHaveBeenCalledTimes(2);
    expect(rule).toHaveBeenCalledTimes(2);
    const [a, b] = output;
    expect(a?.payload?.bytes).not.toBe(b?.payload?.bytes);
    expect(a?.payload?.date).not.toBe(b?.payload?.date);
    expect(a?.payload?.regex).not.toBe(b?.payload?.regex);
    expect(a?.payload?.bytes).not.toBe(row.payload.bytes);
    expect(a?.payload?.bytes?.toString()).toBe('a');
  });

  it('synchronous actor/schema/options mutation affects only the next independent call', async () => {
    const options: OutputFieldOptions = { authorization: { outputFields: { mode: 'request' } } };
    let changed = false;
    const rule = vi.fn(() => {
      if (!changed) {
        changed = true;
        f.request[PERMISSIONS] = new Permission({ reader: false });
        f.schema.remove('name');
        f.runtime.setModelOption(f.model.modelName, 'permissionSchema', { name: false, payload: false });
        options.authorization = { outputFields: { mode: 'unrestricted' } };
      }
      return true;
    });
    const f = fixture({ permissionSchema: { name: rule, payload: 'reader' } });
    const rows = [
      { name: 'a', payload: 'p' },
      { name: 'b', payload: 'q' },
    ];
    expect(await f.service.pickAllowedFieldsMany(rows, 'list', options)).toEqual(rows);
    expect(await f.service.pickAllowedFieldsMany(rows, 'list', options)).toEqual([{ payload: 'p' }, { payload: 'q' }]);
    expect(rule).toHaveBeenCalledTimes(2);
  });

  it('await boundaries keep captured globals/policy/catalog, but not live closures or request.user', async () => {
    const entered = deferred<void>(),
      release = deferred<void>();
    let live = true;
    const rule = vi.fn(async function (this: ModelRequest, permissions) {
      entered.resolve();
      await release.promise;
      expect(this).toBe(f.request);
      return permissions.has('reader') && live;
    });
    const f = fixture({ permissionSchema: { name: rule, payload: 'reader' } });
    const work = f.service.pickAllowedFieldsMany(
      [
        { name: 'a', payload: 1 },
        { name: 'b', payload: 2 },
      ],
      'list',
    );
    await entered.promise;
    f.request[PERMISSIONS] = new Permission({ reader: false });
    f.runtime.setModelOption(f.model.modelName, 'permissionSchema', { name: false, payload: false });
    f.schema.remove('payload');
    live = false;
    release.resolve();
    expect(await work).toEqual([{ payload: 1 }, { payload: 2 }]);
    expect(await f.service.pickAllowedFieldsMany([{ name: 'next', payload: 1 }], 'list')).toEqual([{}]);
    const g = fixture();
    g.request.user = { reader: false };
    expect(await g.service.pickAllowedFieldsMany([{ name: 'initialized' }], 'read')).toEqual([{ name: 'initialized' }]);
  });

  it('captures actor primitives before native CONFIGURATION exposure', async () => {
    const rule = vi.fn((permissions) => permissions.has('reader'));
    const f = fixture({ permissionSchema: { name: rule } });
    const effect = vi.fn(() => {
      f.request[PERMISSIONS] = new Permission({ reader: false });
      return 9;
    });
    const native = new Date(9);
    native.getTime = effect;
    Reflect.apply(f.runtime.setModelOption, f.runtime, [f.model.modelName, 'exposedDocPermissionKeys', native]);
    expect(await f.service.pickAllowedFieldsMany([{ name: 'a' }, { name: 'b' }], 'list')).toEqual([
      { name: 'a' },
      { name: 'b' },
    ]);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(await f.service.pickAllowedFieldsMany([{ name: 'next' }], 'list')).toEqual([{}]);
  });

  it('admits non-owned initialized actor copies before constructing their router buffers', async () => {
    const f = fixture(),
      has = vi.fn(() => true);
    const keys = Array.from({ length: 100000 }, (_, index) => `key${index}`);
    class ForeignPermission extends Permission {
      override get keys() {
        return keys;
      }
      override has() {
        return has();
      }
    }
    f.request[PERMISSIONS] = new ForeignPermission({});
    const capture = vi.spyOn(planning, 'captureOutputHelperConfiguration');
    await expect(f.service.pickAllowedFieldsMany([], 'read')).rejects.toMatchObject(badRequest);
    expect(has).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('charges large custom-access memo strings BEFORE their router construction or predicates', async () => {
    const rule = vi.fn(() => true),
      f = fixture({ permissionSchema: { name: rule } });
    await expect(f.service.pickAllowedFieldsMany([{ name: 'N' }], 'x'.repeat(16 * 1024 * 1024))).rejects.toMatchObject(
      badRequest,
    );
    expect(rule).not.toHaveBeenCalled();
  });

  it('does not await or cancel detached arbitrary closure effects', async () => {
    const release = deferred<void>();
    let detachedFinished = false;
    const detached = release.promise.then(() => {
      detachedFinished = true;
    });
    const f = fixture({ permissionSchema: { name: () => true } });
    expect(await f.service.pickAllowedFieldsMany([{ name: 'N' }], 'list')).toEqual([{ name: 'N' }]);
    expect(detachedFinished).toBe(false);
    release.resolve();
    await detached;
    expect(detachedFinished).toBe(true);
  });

  it.each(['core', 'service', 'publicService'] as const)(
    '%s retains EMPTY/scoped policy without row/hooks/DB/virtual authority',
    async (receiver) => {
      const f = fixture({ stripPermissionsField: false });
      const rows = [
        {
          name: 'N',
          secret: 'S',
          own: 'not-own',
          negative: 'negative',
          computed: 'stored',
          _permissions: { own: true },
        },
      ];
      const output =
        receiver === 'core'
          ? await f.core.pickAllowedFieldsMany(f.model.modelName, rows, 'list')
          : await f[receiver].pickAllowedFieldsMany(rows, 'list');
      expect(output).toEqual([{ name: 'N', negative: 'negative', computed: 'stored', _permissions: { own: true } }]);
      expect(
        await f.service.pickAllowedFieldsMany([{ label: 'L', secret: 'S' }], 'list', {
          scopePath: ['contacts'],
          authorization: { outputFields: { mode: 'grant', paths: ['contacts.label'] } },
        }),
      ).toEqual([{ label: 'L' }]);
      expect(
        await f.service.pickAllowedFieldsMany([{ name: 'N' }], 'list', {
          authorization: { outputFields: { mode: 'grant', paths: ['secret'] } },
        }),
      ).toEqual([{ name: 'N' }]); // Never restores absent granted fields.
      expect(f.hook).not.toHaveBeenCalled();
      expect(f.virtual).not.toHaveBeenCalled();
      expect(f.db).not.toHaveBeenCalled();
      expect(f.dbOne).not.toHaveBeenCalled();
    },
  );

  it('owns genuine embedded subtrees and retains nested-array value semantics', async () => {
    const f = fixture();
    expect(
      await f.service.pickAllowedFieldsMany(
        [{ contacts: [[{ label: 'L', secret: 'S' }], null], payload: [[1, null]] }],
        'list',
      ),
    ).toEqual([{ contacts: [[{ label: 'L' }], null], payload: [[1, null]] }]);
  });

  it('retains ordinary Map-to-record and canonical native value normalization', async () => {
    const f = fixture();
    const rows = [{ payload: new Map([['a', { date: new Date(9), regex: /x/g, bytes: Buffer.from('x') }]]) }];
    expect(await f.service.pickAllowedFieldsMany(rows, 'list')).toEqual([
      { payload: { a: { date: new Date(9), regex: /x/g, bytes: Buffer.from('x') } } },
    ]);
  });
});

describe('OAR-09F descriptor admission before source/native/predicate work', () => {
  it('bad later source fails before ANY predicate, including a synchronous first-row one', async () => {
    const records = observeStageRecords();
    const rule = vi.fn(() => true),
      getter = vi.fn(() => 'hidden');
    const f = fixture({ permissionSchema: { name: rule, secret: false } });
    const bad = Object.defineProperty({}, 'secret', { get: getter, enumerable: true });
    await expect(f.service.pickAllowedFieldsMany([{ name: 'first' }, bad], 'list')).rejects.toMatchObject(badRequest);
    expect(rule).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ state: 'closed', source: undefined, decisions: new Map() });
  });

  it('empty/nullish/frozen/1,000 positions validate fully, without row stages for nullish positions', async () => {
    const f = fixture();
    const stages = vi.spyOn(stage, 'createDocumentStage');
    const capture = vi.spyOn(planning, 'captureOutputHelperConfiguration');
    expect(await f.service.pickAllowedFieldsMany([], 'list')).toEqual([]);
    expect(
      await f.service.pickAllowedFieldsMany(Object.freeze([null, undefined, { name: 'N' }]), 'list', undefined),
    ).toEqual([null, undefined, { name: 'N' }]);
    expect(
      await f.service.pickAllowedFieldsMany(
        Array.from({ length: 1000 }, () => null),
        'list',
      ),
    ).toHaveLength(1000);
    expect(stages).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(3);
    await expect(f.service.pickAllowedFieldsMany([], 'list', { scopePath: ['absent'] })).rejects.toMatchObject(
      badRequest,
    );
    await expect(f.core.pickAllowedFieldsMany('absent', [], 'list')).rejects.toMatchObject(badRequest);
    await expect(Reflect.apply(f.service.pickAllowedFieldsMany, f.service, [[], null])).rejects.toMatchObject(
      badRequest,
    );
  });

  it.each(['proxy', 'subclass', 'hole', 'accessor', 'hidden', 'symbol', 'extra', 'iterable', 'stream', 'oversize'])(
    'rejects %s outer input without iterator/getter/proxy observations',
    async (kind) => {
      const f = fixture();
      const effect = vi.fn(() => {
        throw new Error('observed');
      });
      let rows: unknown = [{ name: 'N' }];
      if (kind === 'proxy')
        rows = new Proxy([], {
          get: effect,
          getPrototypeOf: effect,
          ownKeys: effect,
          getOwnPropertyDescriptor: effect,
        });
      if (kind === 'subclass') rows = new (class extends Array {})();
      if (kind === 'hole') rows = new Array(1);
      if (kind === 'accessor') rows = Object.defineProperty([{}], 0, { get: effect });
      if (kind === 'hidden') rows = Object.defineProperty([{}], 0, { value: {}, enumerable: false });
      if (kind === 'symbol') rows = Object.assign([], { [Symbol.iterator]: effect });
      if (kind === 'extra') rows = Object.assign([], { extra: 1 });
      if (kind === 'iterable') rows = { [Symbol.iterator]: effect };
      if (kind === 'stream') rows = { pipe: effect, [Symbol.asyncIterator]: effect };
      if (kind === 'oversize') rows = Object.defineProperty(new Array(1001), 0, { get: effect });
      await expect(Reflect.apply(f.service.pickAllowedFieldsMany, f.service, [rows, 'list'])).rejects.toMatchObject(
        badRequest,
      );
      expect(effect).not.toHaveBeenCalled();
    },
  );

  it.each(['proxy', 'cycle', 'array', 'scalar', 'symbol', 'accessor'])(
    'rejects %s row roots before predicates',
    async (kind) => {
      const effect = vi.fn(() => {
        throw new Error('observed');
      });
      const rule = vi.fn(() => true),
        f = fixture({ permissionSchema: { name: rule } });
      let row: unknown = {};
      if (kind === 'proxy') row = new Proxy({}, { get: effect, getPrototypeOf: effect, ownKeys: effect });
      if (kind === 'cycle') {
        const cyclic: { name?: unknown } = {};
        cyclic.name = cyclic;
        row = cyclic;
      }
      if (kind === 'array') row = [];
      if (kind === 'scalar') row = 1;
      if (kind === 'symbol') row = { [Symbol('x')]: 1 };
      if (kind === 'accessor') row = Object.defineProperty({}, 'name', { get: effect, enumerable: true });
      await expect(f.service.pickAllowedFieldsMany([{ name: 'first' }, row], 'read')).rejects.toMatchObject(badRequest);
      expect(rule).not.toHaveBeenCalled();
      expect(effect).not.toHaveBeenCalled();
    },
  );

  it.each(['core', 'service', 'publicService'] as const)(
    '%s rejects the complete control-presence matrix before native data work',
    async (receiver) => {
      const f = fixture();
      const normalize = vi.fn(() => ({ name: 'N' }));
      const document = new f.model({ name: 'N' });
      document.toObject = normalize;
      const target = f[receiver],
        prefix = receiver === 'core' ? [f.model.modelName] : [];
      for (const key of [
        ...serverAuthorizationControls,
        'purpose',
        'select',
        'query',
        'populate',
        'rows',
        'inputFields',
        'related',
        'documentAuthorization',
        'documentAuthorizationStage',
        'execution',
        'preparedQuery',
        'handle',
        'token',
      ])
        for (const form of ['undefined', 'false', 'inherited', 'hidden', 'accessor'])
          await expect(
            Reflect.apply(target.pickAllowedFieldsMany, target, [...prefix, [document], 'read', control(key, form)]),
          ).rejects.toMatchObject(badRequest);
      for (const key of ['rows', 'inputFields', 'related', 'purpose'])
        await expect(
          Reflect.apply(target.pickAllowedFieldsMany, target, [
            ...prefix,
            [document],
            'read',
            { authorization: control(key, 'undefined') },
          ]),
        ).rejects.toMatchObject(badRequest);
      await expect(
        Reflect.apply(target.pickAllowedFieldsMany, target, [...prefix, [], 'read', {}, undefined]),
      ).rejects.toMatchObject(badRequest);
      expect(normalize).not.toHaveBeenCalled();
      expect(f.hook).not.toHaveBeenCalled();
    },
  );

  it('rejects proxy options, nested policy getters, sparse scopes and forged/cross-request receivers', async () => {
    const f = fixture(),
      g = fixture(),
      effect = vi.fn(() => {
        throw new Error('observed');
      });
    const badOptions = [
      new Proxy({}, { getPrototypeOf: effect, ownKeys: effect, get: effect }),
      { authorization: Object.defineProperty({}, 'outputFields', { get: effect, enumerable: true }) },
      { scopePath: new Array(1) },
      {
        authorization: {
          outputFields: { mode: 'grant', paths: Object.assign(['name'], { [Symbol.iterator]: effect }) },
        },
      },
    ];
    for (const options of badOptions)
      await expect(
        Reflect.apply(f.service.pickAllowedFieldsMany, f.service, [[], 'read', options]),
      ).rejects.toMatchObject(badRequest);
    const method = Service.prototype.pickAllowedFieldsMany;
    await expect(Reflect.apply(method, { ...f.service }, [[], 'list'])).rejects.toMatchObject(badRequest);
    await expect(
      Reflect.apply(Core.prototype.pickAllowedFieldsMany, { ...f.core }, [f.model.modelName, [], 'list']),
    ).rejects.toMatchObject(badRequest);
    f.request.macl = g.core;
    await expect(f.service.pickAllowedFieldsMany([], 'read')).rejects.toMatchObject(badRequest);
    expect(effect).not.toHaveBeenCalled();
  });

  it.each(['request', 'core', 'runtime', 'modelName', 'model'] as const)(
    'rejects tampered %s service ownership before native source effects',
    async (slot) => {
      const f = fixture(),
        g = fixture();
      const effect = vi.fn(() => ({ name: 'N' }));
      const doc = new f.model({ name: 'N' });
      doc.toObject = effect;
      const key = { request: 'req', core: 'requestCore', runtime: 'requestRuntime', modelName: 'modelName', model: '' }[
        slot
      ];
      if (slot === 'model') vi.spyOn(f.runtime, 'getModelInstance').mockReturnValue(g.model);
      else
        Object.defineProperty(f.service, key, {
          value: slot === 'modelName' ? g.model.modelName : g.request,
          configurable: true,
          writable: true,
        });
      await expect(f.service.pickAllowedFieldsMany([doc], 'read')).rejects.toMatchObject(badRequest);
      expect(effect).not.toHaveBeenCalled();
    },
  );

  it('maps an invalid native configuration preparation to controlled 400, even for an empty array', async () => {
    const f = fixture();
    const native = new Date(9);
    native.getTime = () => {
      throw new Error('native body');
    };
    Reflect.apply(f.runtime.setModelOption, f.runtime, [f.model.modelName, 'exposedDocPermissionKeys', native]);
    await expect(f.service.pickAllowedFieldsMany([], 'read')).rejects.toMatchObject(badRequest);
  });

  it('does not observe an inherited ledger getter while rejecting polluted control prototypes', async () => {
    const f = fixture(),
      getter = vi.fn(() => {
        throw new Error('inherited ledger getter');
      });
    Object.defineProperty(Object.prototype, 'ledger', { get: getter, configurable: true });
    try {
      await expect(f.service.pickAllowedFieldsMany([], 'read')).rejects.toMatchObject(badRequest);
      expect(getter).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(Object.prototype, 'ledger');
    }
  });
});

describe('OAR-09F publication/scheduling/cleanup', () => {
  it('bounds shared hook branches and keeps stable indexed positions', async () => {
    let active = 0,
      maximum = 0;
    const entered = deferred<void>(),
      releases = [deferred<void>(), deferred<void>()];
    const rule = vi.fn(async () => {
      const index = rule.mock.calls.length - 1;
      maximum = Math.max(maximum, ++active);
      if (index === 1) entered.resolve();
      if (index < 2) await releases[index].promise;
      active--;
      return true;
    });
    const f = fixture({ permissionSchema: { name: rule } }, 0, { bulk: 3, hook: 2 });
    const work = f.service.pickAllowedFieldsMany([{ name: 'a' }, { name: 'b' }, null, { name: 'c' }], 'list');
    await entered.promise;
    releases[1].resolve();
    releases[0].resolve();
    expect(await work).toEqual([{ name: 'a' }, { name: 'b' }, null, { name: 'c' }]);
    expect(maximum).toBe(2);
  });

  it('retains field order, sync-until-async, body throw/reject omission and shared-gate reentry', async () => {
    const events: string[] = [];
    const f = fixture(
      {
        permissionSchema: {
          name: () => {
            events.push('name');
            return true;
          },
          secret: () => {
            events.push('throw');
            throw new Error('body');
          },
          negative: async () => {
            events.push('reject');
            throw new Error('body');
          },
          payload: () => {
            events.push('payload');
            return true;
          },
        },
      },
      0,
      { bulk: 1, hook: 1 },
    );
    const { hookGate, scheduler } = getRequestWorkState(f.request, f.runtime);
    const persistence = vi.spyOn(scheduler, 'work');
    const promise = hookGate.run(() =>
      f.service.pickAllowedFieldsMany([{ name: 'N', secret: 'S', negative: 'X', payload: 1 }], 'list'),
    );
    expect(events).toEqual(['name', 'throw', 'reject']);
    expect(await promise).toEqual([{ name: 'N', payload: 1 }]);
    expect(events).toEqual(['name', 'throw', 'reject', 'payload']);
    expect(persistence).not.toHaveBeenCalled();
  });

  it('shares root FIFO with other hook chains, not a private batch-only gate', async () => {
    const entered = deferred<void>(),
      release = deferred<void>(),
      events: string[] = [];
    const f = fixture(
      {
        permissionSchema: {
          name: () => {
            events.push('row');
            return true;
          },
        },
      },
      0,
      { bulk: 2, hook: 1 },
    );
    const { hookGate } = getRequestWorkState(f.request, f.runtime);
    const blocker = hookGate.run(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const batch = f.service.pickAllowedFieldsMany([{ name: 'a' }, { name: 'b' }], 'list');
    const other = hookGate.run(() => {
      events.push('other');
    });
    release.resolve();
    await Promise.all([blocker, batch, other]);
    expect(events).toEqual(['row', 'other', 'row']);
  });

  it('hook depth admission is controlled failure, not a false permission body', async () => {
    const rule = vi.fn(() => true),
      f = fixture({ permissionSchema: { name: rule } });
    const { hookGate } = getRequestWorkState(f.request, f.runtime);
    const descend = (depth: number): Promise<unknown> =>
      depth ? hookGate.run(() => descend(depth - 1)) : f.service.pickAllowedFieldsMany([{ name: 'N' }], 'list');
    await expect(descend(64)).rejects.toMatchObject(badRequest);
    expect(rule).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'])('%s actually closes and clears private sources/memos/preparation', async (exit) => {
    // Observe actual private records, not a shipped test/debug issuer.
    const records = new Map<object, Record<string, unknown>>();
    const realSet = WeakMap.prototype.set;
    vi.spyOn(WeakMap.prototype, 'set').mockImplementation(function (key, value) {
      if (
        value &&
        typeof value === 'object' &&
        ('decisions' in value || 'pending' in value || 'accesses' in value || ('paths' in value && 'results' in value))
      )
        records.set(key, value);
      return Reflect.apply(realSet, this, [key, value]);
    });
    const budgets = vi.spyOn(publication, 'createPublicationRowBudget');
    const f = fixture({
      permissionSchema: {
        name: () => {
          if (exit === 'failure') materializer.visitTrustedOutput(budgets.mock.results.at(-1)!.value, 101);
          return true;
        },
      },
    });
    const stages = vi.spyOn(stage, 'createDocumentStage');
    const calls = vi.spyOn(authorization, 'resolveServiceAuthorization');
    const row = { name: 'ok' };
    const work = f.service.pickAllowedFieldsMany([row], 'list');
    if (exit === 'success') await work;
    else await expect(work).rejects.toMatchObject(badRequest);
    expect(stages).toHaveBeenCalledTimes(1);
    const record = records.get(stages.mock.results[0].value)!;
    expect(record.state).toBe('closed');
    for (const key of ['source', 'grants', 'access', 'view', 'call', 'binding', 'publication', 'owning', 'result'])
      expect(record[key]).toBeUndefined();
    expect(record.decisions).toEqual(new Map());
    const owners = [...records.values()].filter((record) => 'pending' in record);
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({
      closed: true,
      pending: new Set(),
      stages: new Set(),
      resources: new Set(),
      ledger: undefined,
    });
    const indexes = [...records.values()].filter((record) => 'paths' in record && 'results' in record);
    expect(indexes).toHaveLength(1);
    expect(indexes[0]).toMatchObject({ paths: new Set(), results: new Map() });
    const policies = [...records.values()].filter((record) => 'accesses' in record);
    expect(policies).toHaveLength(1);
    expect(policies[0].accesses).toEqual(new Map());
    const call = calls.mock.results[0].value;
    expect(() =>
      authorization.readServiceAuthorization(call, {
        request: f.request,
        runtime: f.runtime,
        model: f.model,
        modelName: f.model.modelName,
      }),
    ).toThrow(ServiceAuthorizationError);
  });

  it('caught native poison stops new fields/rows, drains admitted work and cannot publish late', async () => {
    const records = observeStageRecords();
    const entered = deferred<void>(),
      release = deferred<void>();
    let budget: materializer.TrustedOutputBudget | undefined;
    const budgets = vi.spyOn(publication, 'createPublicationRowBudget');
    const rule = vi.fn(async () => {
      if (rule.mock.calls.length === 1) {
        entered.resolve();
        await release.promise;
        return true;
      }
      budget = budgets.mock.results.at(-1)!.value;
      try {
        materializer.visitTrustedOutput(budget!, 101);
      } catch {
        /* trusted callback catches the poison */
      }
      return true;
    });
    const later = vi.fn(() => true);
    const f = fixture({ permissionSchema: { name: rule, payload: later } }, 0, { bulk: 2, hook: 2 });
    let settled = false;
    const work = f.service.pickAllowedFieldsMany(
      [
        { name: 'a', payload: 1 },
        { name: 'b', payload: 2 },
        { name: 'c', payload: 3 },
      ],
      'list',
    );
    const outcome = work.then(
      () => {
        settled = true;
        return 'published';
      },
      (error) => {
        settled = true;
        return error;
      },
    );
    await entered.promise;
    await Promise.resolve();
    expect(settled).toBe(false);
    release.resolve();
    expect(await outcome).toMatchObject(badRequest);
    expect(rule).toHaveBeenCalledTimes(2);
    expect(later).not.toHaveBeenCalled();
    expect(() => materializer.visitTrustedOutput(budget!, 0)).toThrow(ServiceAuthorizationError);
    expect(records).toHaveLength(3); // later source was owned, but never evaluated
    for (const record of records)
      expect(record).toMatchObject({ state: 'closed', source: undefined, call: undefined, decisions: new Map() });
  });
});
