import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { DataCore } from '../src/core-data';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { DataService } from '../src/services/data-service';
import { createAccessRuntime } from '../src/index';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import type {
  AuthorizationMode,
  DataRequest,
  DocumentGrants,
  ModelRequest,
  ModelRouterOptions,
} from '../src/interfaces';
import type { AccessRouterPermissions } from '../src/permission';
import {
  authorizationModeKeys,
  normalizeAuthorizationMode,
  retiredAuthorizationOptions,
  serverAuthorizationControls,
} from '../src/acl/authorization-modes';
import {
  assertNoServerModelControls,
  assertPublicAdmission,
  assertPublicDefaults,
  PublicAdmissionError,
} from '../src/validation/public-admission';
import { ServiceAuthorizationError } from '../src/acl/service-authorization';
import { deferred } from './hook-admission-fixture';

const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const modes: AuthorizationMode[] = ['isolated', 'trusted'];
let serial = 0;

function fixture(options: ModelRouterOptions = {}, getter: 'bulk' | 'key' = 'bulk') {
  const runtime = new AccessRuntime();
  const model = mongoose.model(
    `OwnedModes${++serial}`,
    new mongoose.Schema(
      { value: String, secret: String, owner: Boolean, children: [{ value: String }] },
      { versionKey: false },
    ),
  );
  const warn = vi.fn();
  runtime.setGlobalOptions({ logger: { warn } });
  runtime.registerModelInstance(model.modelName, model);
  const hook = vi.fn<
    (doc: Record<string, unknown>, permissions: AccessRouterPermissions) => DocumentGrants | Promise<DocumentGrants>
  >((doc) => ({ owner: doc.owner === true }));
  runtime.setModelOptions(model.modelName, {
    permissionSchema: { value: true, secret: 'doc:owner' },
    modelPermissionPrefix: 'doc:',
    alwaysSelectFields: ['owner'],
    hydration: { find: 'lean', findOne: 'lean' },
    stripPermissionsField: true,
    docPermissions: { read: hook, list: hook },
    ...options,
  });
  const request = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const adapter = {
    mongooseModel: model,
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    updateOne: vi.fn(),
  };
  const service = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    return new (class extends Service {
      protected createModelAdapter() {
        return adapter;
      }
      protected getModelRouterOptions(name: string): ModelRouterOptions {
        if (getter === 'bulk') return runtime.getModelOptions(name);
        // Exercise the actual exact-key API, not a profile label or a stubbed capture.
        return Object.fromEntries(
          [
            ...authorizationModeKeys,
            'permissionSchema',
            'modelPermissionPrefix',
            'alwaysSelectFields',
            'docPermissions',
            'hydration',
            'stripPermissionsField',
            'overrideFilter',
            'baseFilter',
            'defaults',
          ].map((key) => [key, runtime.getModelOption(name, key)]),
        );
      }
    })(request, model.modelName);
  });
  return { runtime, model, warn, hook, request, adapter, service };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^OwnedModes/);
});

describe('exact server mode admission and atomic configuration', () => {
  it.each([undefined, ...modes])('accepts only the literal mode or restoration: %s', (value) => {
    expect(normalizeAuthorizationMode(value)).toBe(value);
  });

  it.each([null, false, true, 0, 1, '', 'true', 'ISOLATED', [], {}, new String('trusted')])(
    'does not coerce %j into a mode',
    (value) => {
      const valueOf = vi.fn(() => 'trusted');
      expect(() => normalizeAuthorizationMode(value)).toThrow(TypeError);
      expect(() => normalizeAuthorizationMode({ valueOf, toString: valueOf })).toThrow(TypeError);
      expect(valueOf).not.toHaveBeenCalled();
    },
  );

  it.each(authorizationModeKeys)('%s restores runtime inheritance and then built-in isolation independently', (key) => {
    const f = fixture();
    const name = f.model.modelName;
    const other = authorizationModeKeys.find((candidate) => candidate !== key)!;
    expect(f.runtime.getDefaultModelOption(key)).toBe('isolated');
    expect(f.runtime.getModelOption(name, key)).toBe('isolated');
    f.runtime.setDefaultModelOptions({ [key]: 'trusted' });
    expect(f.runtime.getModelOptions(name)[key]).toBe('trusted');
    f.runtime.setModelOption(name, key, 'isolated');
    f.runtime.setDefaultModelOption(key, 'trusted');
    expect(f.runtime.getModelOption(name, key)).toBe('isolated');
    f.runtime.setModelOptions(name, { [key]: undefined });
    expect(f.runtime.getModelOption(name, key)).toBe('trusted');
    f.runtime.setDefaultModelOption(key, undefined);
    expect(f.runtime.getModelOptions(name)[key]).toBe('isolated');
    expect(f.runtime.getModelOptions(name)[other]).toBe('isolated');
  });

  it.each(serverAuthorizationControls)('rejects dotted bulk %s before publishing either a model or defaults', (key) => {
    const f = fixture();
    const before = f.runtime.createBootstrapSnapshot();
    for (const update of [
      () =>
        f.runtime.setModelOptions(f.model.modelName, {
          readAuthorizationMode: 'trusted',
          [`${key}.x`]: false,
        } as never),
      () => f.runtime.setDefaultModelOptions({ listAuthorizationMode: 'trusted', [`${key}.x`]: undefined } as never),
    ]) {
      expect(update).toThrow(TypeError);
      expect(f.runtime.createBootstrapSnapshot()).toEqual(before);
      expect(f.warn).not.toHaveBeenCalled();
    }
  });

  it.each(authorizationModeKeys)('rejects malformed %s slots and whole bulk changes without invoking them', (key) => {
    const f = fixture();
    const before = f.runtime.createBootstrapSnapshot();
    const getter = vi.fn(() => 'trusted');
    const trap = vi.fn(() => {
      throw new Error('proxy trap');
    });
    for (const options of [
      { readAuthorizationMode: 'trusted', [key]: false },
      Object.create({ [key]: 'trusted' }),
      Object.defineProperty({}, key, { value: 'trusted' }),
      Object.defineProperty({}, key, { get: getter, enumerable: true }),
      new Proxy({}, { getPrototypeOf: trap, ownKeys: trap, get: trap, has: trap }),
      Object.create(new Proxy({}, { getPrototypeOf: trap, ownKeys: trap, get: trap, has: trap })),
    ]) {
      expect(() => f.runtime.setModelOptions(f.model.modelName, options)).toThrow(TypeError);
      expect(() => f.runtime.setDefaultModelOptions(options)).toThrow(TypeError);
      expect(f.runtime.createBootstrapSnapshot()).toEqual(before);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(trap).not.toHaveBeenCalled();
    expect(f.warn).not.toHaveBeenCalled();
  });

  it('validates all proposed inherited models before default publication or warnings', () => {
    const f = fixture();
    const other = mongoose.model(`OwnedModes${++serial}`, new mongoose.Schema({ other: String }));
    f.runtime.registerModelInstance(other.modelName, other);
    f.runtime.setModelOptions(other.modelName, {});
    const before = f.runtime.createBootstrapSnapshot();
    expect(() =>
      f.runtime.setDefaultModelOptions({
        readAuthorizationMode: 'trusted',
        virtuals: { computed: { dependsOn: ['value'], get: () => 'computed' } },
      }),
    ).toThrow(/persisted/);
    expect(f.runtime.createBootstrapSnapshot()).toEqual(before);
    expect(f.warn).not.toHaveBeenCalled();
  });

  it.each(retiredAuthorizationOptions)('rejects every legacy %s slot by presence, not truthiness', (key) => {
    const f = fixture();
    for (const options of [
      { [key]: false },
      { [key]: undefined },
      Object.create({ [key]: undefined }),
      Object.defineProperty({}, key, { value: false }),
    ]) {
      expect(() => f.runtime.setModelOptions(f.model.modelName, options)).toThrow(/removed.*migrate/);
      expect(() => f.runtime.setDefaultModelOptions(options)).toThrow(/removed.*migrate/);
      expect(() => f.runtime.setGlobalOptions(options)).toThrow(/removed.*migrate/);
      expect(() => f.runtime.setDataOptions('data', options)).toThrow(/removed.*migrate/);
    }
    expect(f.runtime.getModelOptions(f.model.modelName).readAuthorizationMode).toBe('isolated');
    expect(f.runtime.getDataNames()).toEqual([]);
    expect(f.warn).not.toHaveBeenCalled();
  });

  it.each(serverAuthorizationControls)(
    'rejects nested/dotted %s global/data/default control updates atomically',
    (key) => {
      const f = fixture();
      const before = f.runtime.createBootstrapSnapshot();
      for (const update of [
        () =>
          f.runtime.setGlobalOptions({
            requestPermissionField: 'changed',
            [`defaults.findOptions.${key}`]: undefined,
          } as never),
        () => f.runtime.setGlobalOption(`options.${key}` as never, false as never),
        () => f.runtime.setDataOptions('data', { [`defaults.findOptions.${key}`]: false } as never),
        () => f.runtime.setDataOption('data', `defaults.findOptions.${key}` as never, undefined),
        () =>
          f.runtime.setDefaultModelOptions({
            readAuthorizationMode: 'trusted',
            [`defaults.publicListOptions.${key}`]: false,
          } as never),
      ]) {
        expect(update).toThrow(TypeError);
        expect(f.runtime.createBootstrapSnapshot()).toEqual(before);
      }
      expect(f.warn).not.toHaveBeenCalled();
    },
  );

  it('preflights actual model constructor options without mistaking class/model business slots for controls', () => {
    const api = createAccessRuntime();
    const model = mongoose.model(
      `OwnedModes${++serial}`,
      new mongoose.Schema({ value: String, readAuthorizationMode: String }),
    );
    Object.defineProperty(model, 'unsafeUseReadAuthorizationFastPath', { value: false });
    Object.defineProperty(model, 'readAuthorizationMode', { value: 'business-model-property' });
    const before = api.runtime.createBootstrapSnapshot();
    for (const options of [
      { readAuthorizationMode: false },
      { defaults: { findOptions: Object.create({ unsafeUseReadAuthorizationFastPath: undefined }) } },
    ]) {
      expect(() => api.createRouter(model, options as never)).toThrow();
      expect(api.runtime.createBootstrapSnapshot()).toEqual(before);
    }
    expect(() =>
      api.createRouter(model, { permissionSchema: { value: true, readAuthorizationMode: true } }),
    ).not.toThrow();
    expect(api.getModelOption(model.modelName, 'readAuthorizationMode')).toBe('isolated');
  });

  it('rejects constructor/facade proxies and bad configuration bag shapes without traps or coercion', () => {
    const api = createAccessRuntime();
    const trap = vi.fn(() => {
      throw new Error('trap');
    });
    const proxy = new Proxy({}, { getPrototypeOf: trap, ownKeys: trap, get: trap, has: trap });
    for (const options of [null, false, 'trusted', [], proxy, Object.create(proxy)]) {
      expect(() => api.set(options as never)).toThrow(TypeError);
      expect(() => api.createRouter(options as never)).toThrow(TypeError);
      expect(() => new AccessRuntime(options as never)).toThrow(TypeError);
    }
    const model = new Proxy(() => {}, { getPrototypeOf: trap, ownKeys: trap, get: trap, has: trap });
    expect(() => api.createRouter(model as never, {})).toThrow(TypeError);
    expect(trap).not.toHaveBeenCalled();
  });

  it.each(serverAuthorizationControls)(
    'snapshot restoration rejects nested %s controls before global/bootstrap changes',
    (key) => {
      const f = fixture();
      const before = f.runtime.createBootstrapSnapshot();
      const snapshot = {
        ...before,
        globalOptions: { ...before.globalOptions, requestPermissionField: 'changed' },
        defaultModelOptions: { ...before.defaultModelOptions, defaults: { findOptions: { [key]: false } } },
      };
      expect(() => f.runtime.restoreBootstrapSnapshot(snapshot)).toThrow(TypeError);
      expect(f.runtime.createBootstrapSnapshot()).toEqual(before);
      expect(f.warn).not.toHaveBeenCalled();
    },
  );
});

describe('control bags are not business schemas or trusted callback closures', () => {
  it.each(serverAuthorizationControls)(
    'raw parent query rejects %s control slots while business predicates stay inert',
    async (key) => {
      const f = fixture();
      expect(() =>
        f.service.findRawParentDoc({ filter: {}, select: 'value', populate: [], [key]: undefined } as never),
      ).toThrow(ServiceAuthorizationError);
      expect(f.adapter.findOne).not.toHaveBeenCalled();
      await f.service.findRawParentDoc({ filter: { [key]: false }, select: 'value', populate: [] });
      expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
      expect(f.hook).not.toHaveBeenCalled();
    },
  );

  it('dedicated options reject proxies and nested controls before raw policy/native observations', async () => {
    const f = fixture();
    const trap = vi.fn(() => {
      throw new Error('proxy trap');
    });
    const options = new Proxy({}, { getPrototypeOf: trap, ownKeys: trap, has: trap, get: trap });
    await expect(f.service.listSub('id', 'children', options)).resolves.toMatchObject({
      success: false,
      code: 'bad_request',
    });
    expect(trap).not.toHaveBeenCalled();
    const native = vi.fn(() => 1);
    const date = Object.assign(new Date(1), { getTime: native });
    for (const key of serverAuthorizationControls) {
      const result = await f.service.listSub('id', 'children', {
        authorization: { parent: { rows: { mode: 'scope', filter: { at: date } } }, child: { [key]: false } },
      } as never);
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
    }
    expect(native).not.toHaveBeenCalled();
    expect(f.hook).not.toHaveBeenCalled();
    expect(f.adapter.findOne).not.toHaveBeenCalled();
  });

  it.each(serverAuthorizationControls)(
    'direct DataService rejects %s before request hooks/field evaluation',
    async (key) => {
      const runtime = new AccessRuntime();
      const baseFilter = vi.fn(() => ({}));
      const field = vi.fn((_permissions, grants) => {
        expect(Object.isFrozen(grants)).toBe(true);
        expect(Object.keys(grants)).toEqual([]);
        return true;
      });
      runtime.setDataOptions('ModesData', {
        data: [{ id: '1', value: 'value', [key]: false }],
        idField: 'id',
        permissionSchema: { value: field, [key]: true },
        baseFilter: { read: baseFilter, list: baseFilter },
      });
      const req = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as DataRequest;
      const service = runWithRuntime(runtime, () => {
        req.dacl = new DataCore(req);
        return new DataService(req, 'ModesData');
      });
      const getter = vi.fn(() => false);
      for (const controls of [
        { [key]: false },
        { [key]: undefined },
        Object.create({ [key]: undefined }),
        Object.defineProperty({}, key, { value: false }),
        Object.defineProperty({}, key, { get: getter }),
      ]) {
        for (const args of [controls, { options: controls }]) {
          expect(await service.find({}, args as never)).toMatchObject({ success: false, code: 'bad_request' });
          expect(await service.findOne({}, args as never)).toMatchObject({ success: false, code: 'bad_request' });
          expect(await service.findById('1', args as never)).toMatchObject({ success: false, code: 'bad_request' });
        }
        expect(await service.find({}, {}, controls as never)).toMatchObject({ success: false, code: 'bad_request' });
        expect(await service.findOne({}, {}, controls as never)).toMatchObject({ success: false, code: 'bad_request' });
        expect(await service.findById('1', {}, controls as never)).toMatchObject({
          success: false,
          code: 'bad_request',
        });
      }
      expect(baseFilter).not.toHaveBeenCalled();
      expect(field).not.toHaveBeenCalled();
      expect(getter).not.toHaveBeenCalled();
      expect(await service.findOne({ [key]: false } as never, { select: [key] })).toMatchObject({
        success: true,
        data: { [key]: false },
      });
      await expect(
        req.dacl.pickAllowedFields('ModesData', { value: 'raw' }, 'read', { [key]: false } as never),
      ).rejects.toThrow(ServiceAuthorizationError);
    },
  );

  it.each(serverAuthorizationControls)(
    'rejects dotted public/service %s controls before hooks or adapters',
    async (key) => {
      const f = fixture();
      for (const input of [
        { [`${key}.x`]: false },
        { options: { [`${key}.x`]: undefined } },
        { include: [{ options: { [`${key}.x`]: false } }] },
        { populate: [{ sqOptions: { [`${key}.x`]: false } }] },
        { filter: { nested: { $$sq: { options: { [`${key}.x`]: false } } } } },
      ]) {
        expect(() => assertPublicAdmission(input)).toThrow(PublicAdmissionError);
        expect(await f.service.find({}, input as never, quiet)).toMatchObject({ success: false, code: 'bad_request' });
      }
      expect(f.hook).not.toHaveBeenCalled();
      expect(f.adapter.find).not.toHaveBeenCalled();
    },
  );

  it('rejects proxy prototypes and array accessors without traps, reads or sibling work', () => {
    const trap = vi.fn(() => {
      throw new Error('untrusted trap');
    });
    const proxy = new Proxy({}, { getPrototypeOf: trap, ownKeys: trap, get: trap, has: trap });
    const getter = vi.fn(() => ({ readAuthorizationMode: 'trusted' }));
    const array = Object.defineProperty([], '0', { get: getter, enumerable: true });
    for (const input of [Object.create(proxy), { options: Object.create(proxy) }, { include: array }]) {
      expect(() => assertPublicAdmission(input)).toThrow(PublicAdmissionError);
    }
    expect(trap).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });

  it.each(serverAuthorizationControls)('rejects service defaults.%s on assignment before publication', (key) => {
    const f = fixture();
    f.service.defaults = { findArgs: { select: ['value'] } };
    const before = f.service.defaults;
    for (const controls of [
      { [key]: false },
      Object.create({ [key]: undefined }),
      Object.defineProperty({}, key, { value: undefined }),
    ]) {
      expect(() => {
        f.service.defaults = { findOptions: controls };
      }).toThrow();
      expect(f.service.defaults).toBe(before);
      expect(() => assertPublicDefaults({ findOptions: controls })).toThrow(PublicAdmissionError);
    }
    expect(f.adapter.find).not.toHaveBeenCalled();
  });

  it('never traverses arbitrary function-attached closure slots as policy bags', () => {
    const getter = vi.fn(() => {
      throw new Error('closure property');
    });
    const hook = Object.defineProperty(() => true, 'readAuthorizationMode', { get: getter });
    expect(() =>
      assertNoServerModelControls(
        { operation: hook },
        (detail) => {
          throw new Error(detail);
        },
        'policy',
      ),
    ).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });

  it.each(serverAuthorizationControls)('%s remains inert in data, predicates and business field rules', (key) => {
    const business = { [key]: 'trusted', options: { [key]: false } };
    expect(() =>
      assertPublicAdmission({ data: business, filter: business, match: business, select: [key] }),
    ).not.toThrow();
    const f = fixture({ permissionSchema: { [key]: true } });
    expect(f.runtime.getModelOptions(f.model.modelName).permissionSchema).toEqual({ [key]: true });
  });
});

describe('actual source-mode capture through both model getter APIs', () => {
  it.each(
    (['bulk', 'key'] as const).flatMap((getter) =>
      modes.flatMap((mode) => (['read', 'list'] as const).map((origin) => ({ getter, mode, origin }))),
    ),
  )(
    '$getter getter retains $mode $origin across a hook await, while a new call refreshes',
    async ({ getter, mode, origin }) => {
      const f = fixture({ readAuthorizationMode: mode, listAuthorizationMode: mode }, getter);
      const entered = deferred();
      const release = deferred();
      const source = { value: 'original', secret: 'secret', owner: true };
      let first = true;
      f.hook.mockImplementation(async (doc) => {
        if (first) {
          first = false;
          entered.resolve();
          await release.promise;
        }
        doc.value = 'hook-write';
        return { owner: true };
      });
      f.adapter.findOne.mockResolvedValue(source);
      f.adapter.find.mockResolvedValue([source]);
      const invoke = () =>
        origin === 'read'
          ? f.service.findOne({}, { select: ['value', 'secret', '-_id'] }, quiet)
          : f.service.find({}, { select: ['value', 'secret', '-_id'] }, quiet);
      const pending = invoke();
      await entered.promise;
      try {
        f.runtime.setModelOption(
          f.model.modelName,
          `${origin}AuthorizationMode`,
          mode === 'trusted' ? 'isolated' : 'trusted',
        );
      } finally {
        release.resolve();
      }
      const expected = { value: mode === 'trusted' ? 'hook-write' : 'original', secret: 'secret' };
      expect(await pending).toMatchObject({ success: true, data: origin === 'read' ? expected : [expected] });
      expect(source.value).toBe(mode === 'trusted' ? 'hook-write' : 'original');
      source.value = 'fresh';
      const refreshed = { value: mode === 'trusted' ? 'fresh' : 'hook-write', secret: 'secret' };
      expect(await invoke()).toMatchObject({ success: true, data: origin === 'read' ? refreshed : [refreshed] });
      expect(f.hook).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['bulk', 'key'] as const)(
    '%s getter captures modes and actor before native configuration callbacks',
    async (getter) => {
      const f = fixture({ readAuthorizationMode: 'isolated' }, getter);
      const native = Object.assign(new Date(1), {
        getTime() {
          f.runtime.setModelOption(f.model.modelName, 'readAuthorizationMode', 'trusted');
          f.request[PERMISSIONS] = new Permission({ reader: false });
          return 1;
        },
      });
      f.runtime.setModelOption(f.model.modelName, 'baseFilter', { unused: { native } } as never);
      const actors: boolean[] = [];
      f.hook.mockImplementation((doc, permissions) => {
        actors.push(permissions.has('reader'));
        doc.value = 'changed';
        return { owner: true };
      });
      f.adapter.findOne.mockResolvedValue({ value: 'original', owner: true });
      expect(await f.service.findOne({}, { select: ['value', '-_id'] }, quiet)).toMatchObject({
        success: true,
        data: { value: 'original' },
      });
      expect(actors).toEqual([true]);
      expect(f.runtime.getModelOption(f.model.modelName, 'readAuthorizationMode')).toBe('trusted');
    },
  );

  it.each(modes)('raw Core output helpers stay isolated with empty facts under model %s', async (mode) => {
    const f = fixture({ readAuthorizationMode: mode, listAuthorizationMode: mode });
    const rule = vi.fn((_permissions, grants) => {
      expect(Object.isFrozen(grants)).toBe(true);
      expect(Object.keys(grants)).toEqual([]);
      return false;
    });
    f.runtime.setModelOption(f.model.modelName, 'permissionSchema', { value: true, secret: rule });
    const raw = { value: 'raw', secret: 'never' };
    expect(await f.request.macl.pickAllowedFields(f.model.modelName, raw, 'read')).toEqual({ value: 'raw' });
    await expect(
      f.request.macl.pickAllowedFields(f.model.modelName, raw, 'read', { readAuthorizationMode: 'trusted' } as never),
    ).rejects.toThrow(ServiceAuthorizationError);
    expect(raw).toEqual({ value: 'raw', secret: 'never' });
    expect(rule).toHaveBeenCalledTimes(1);
    expect(f.hook).not.toHaveBeenCalled();
    expect(f.adapter.findOne).not.toHaveBeenCalled();
  });
});
