import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime, defineRequestSchema, ModelRouter, type DataRouter } from '../../dist/index.mjs';
import { createOperationAccessReaders, selectOperationAccessGuard } from '../../src/operation-access';

const removed = ['List', 'Read', 'Create', 'Update', 'Upsert', 'Count', 'Distinct'].flatMap((operation) => [
  `basic${operation}`,
  `advanced${operation}`,
]);
const initial = {
  listHardLimit: 8,
  operationAccess: {
    default: false,
    read: { default: true, basic: false, root: false },
    subs: { items: { read: true } },
  },
};
const active: mongoose.Connection[] = [];
let counter = 0;
afterEach(async () => {
  for (const connection of active.splice(0)) await connection.destroy();
});

function fixture(target: 'model' | 'defaults' | 'data') {
  const api = createAccessRuntime();
  api.setGlobalOptions({ logger: {} });
  const name = `NestedAdmission${++counter}`;
  let router: ModelRouter | DataRouter;
  if (target === 'data') router = api.createDataRouter(name, { ...initial, data: [] });
  else {
    const connection = mongoose.createConnection();
    active.push(connection);
    const model = connection.model(name, new mongoose.Schema({ basicRead: String, items: [{ advancedRead: String }] }));
    if (target === 'defaults') api.setDefaultModelOptions(initial);
    router = api.createRouter(model, target === 'defaults' ? {} : initial);
  }
  // These calls intentionally model untyped JavaScript and trusted string escape hatches.
  const bulk = (options: object) =>
    target === 'model'
      ? api.setModelOptions(name, options)
      : target === 'defaults'
        ? api.setDefaultModelOptions(options)
        : api.runtime.setDataOptions(name, options);
  const set = (key: string, value: unknown) =>
    target === 'model'
      ? api.setModelOption(name, key as never, value as never)
      : target === 'defaults'
        ? api.setDefaultModelOption(key as never, value as never)
        : api.runtime.setDataOption(name, key as never, value as never);
  const options = () =>
    target === 'model'
      ? api.getModelOptions(name)
      : target === 'defaults'
        ? api.getDefaultModelOptions()
        : api.runtime.getDataOptions(name);
  const modelOptions = () => (target === 'data' ? undefined : api.getModelOptions(name));
  const policy = () =>
    selectOperationAccessGuard({
      baseAccess: 'read',
      context: 'basic',
      ...createOperationAccessReaders(options(), target === 'data' ? undefined : api.getDefaultModelOptions()),
    });
  return { api, name, router, bulk, set, options, policy, modelOptions };
}

describe.each(['model', 'defaults', 'data'] as const)('NOA-01 %s removed-key admission', (target) => {
  it.each(removed)('rejects %s in every whole/dotted/subdocument admission without publication', (key) => {
    const f = fixture(target);
    const before = f.options();
    const beforeModel = f.modelOptions();
    const attempts = [
      () => f.bulk({ listHardLimit: 999, operationAccess: { read: true, [key]: false } }),
      () => f.bulk({ listHardLimit: 999, [`operationAccess.${key}`]: undefined }),
      () => f.set('operationAccess', { read: true, [key]: undefined }),
      () => f.set(`operationAccess.${key}`, undefined),
      () => f.set(`operationAccess.${key}.extra`, true),
      () => f.bulk({ listHardLimit: 999, operationAccess: { subs: { items: { read: true, [key]: true } } } }),
      () => f.set('operationAccess', { [`subs.items.${key}`]: true }),
      () => f.set('operationAccess.subs', { items: { [key]: undefined } }),
      () => f.set('operationAccess.subs.items', { [key]: false }),
      () => f.set(`operationAccess.subs.items.${key}`, undefined),
      () => f.bulk({ listHardLimit: 999, 'operationAccess.subs': { items: { [key]: true } } }),
    ];
    if (target !== 'defaults')
      attempts.push(
        () => f.router.set({ listHardLimit: 999, operationAccess: { [key]: true } }),
        () => f.router.setOptions({ listHardLimit: 999, operationAccess: { subs: { items: { [key]: true } } } }),
        () => f.router.setOption(`operationAccess.${key}` as never, undefined),
        () => f.router.operationAccess({ [key]: true }),
        () => f.router.operationAccess(key, true),
        () => f.router.operationAccess(key, undefined),
        () => f.router.operationAccess(`subs.items.${key}`, undefined),
        () => f.router.operationAccess('subs.items', { [key]: false }),
      );
    const context = key.startsWith('basic') ? 'basic' : 'advanced';
    const operation = key.slice(context.length);
    for (const attempt of attempts) {
      expect(attempt).toThrow(TypeError);
      expect(attempt).toThrow(`${operation[0].toLowerCase()}${operation.slice(1)}.${context}`);
      expect(f.options()).toEqual(before);
      expect(f.modelOptions()).toEqual(beforeModel);
      expect(f.policy()).toBe(false);
    }
  });

  it('rejects inherited and non-enumerable retired operation properties by presence', () => {
    const f = fixture(target);
    const before = f.options();
    const inherited = Object.create({ advancedRead: undefined });
    Object.defineProperty(inherited, 'read', { value: true, enumerable: true });
    const hidden = Object.defineProperty({ read: true }, 'basicRead', { value: false });
    expect(() => f.bulk({ listHardLimit: 999, operationAccess: inherited })).toThrow(/read.advanced/);
    expect(() => f.bulk({ listHardLimit: 999, operationAccess: { subs: { items: hidden } } })).toThrow(/read.basic/);
    expect(f.options()).toEqual(before);
  });

  it('accepts dotted whole rules, leaves and dynamic fields without deep merging', () => {
    const f = fixture(target);
    const snapshot = f.options();
    f.set('operationAccess.read', { default: false, basic: true, advanced: true, root: false });
    expect(f.policy()).toBe(true);
    f.set('operationAccess.read.basic', false);
    expect(f.policy()).toBe(false);
    f.set('operationAccess.read', { root: true });
    expect(f.options().operationAccess).toMatchObject({ read: { root: true } });
    expect(f.policy()).toBe(false);
    f.set('operationAccess.subs.items.read', { default: true, root: false });
    f.set('operationAccess.subs.items.read.basic', false);
    const guard = selectOperationAccessGuard({
      baseAccess: 'subs.items.read',
      context: 'basic',
      subdocuments: true,
      ...createOperationAccessReaders(f.options(), target === 'data' ? undefined : f.api.getDefaultModelOptions()),
    });
    expect(guard).toBe(false);
    expect(snapshot.operationAccess).toEqual(initial.operationAccess);
  });
});

describe('NOA-01 unaffected configuration and atomic construction', () => {
  it.each(['model', 'data'] as const)('preserves %s fluent undefined leaves and whole clears', (target) => {
    const f = fixture(target);
    f.router.operationAccess('read.basic', true);
    expect(f.policy()).toBe(true);
    f.router.operationAccess('read.basic', undefined);
    expect(f.policy()).toBe(true); // Own operation default, not the string "read.basic".
    expect(f.options().operationAccess).toMatchObject({ read: { default: true, basic: undefined } });
    f.router.operationAccess(undefined);
    expect(f.options().operationAccess).toBeUndefined();
    expect(f.policy()).toBeUndefined();
  });

  it.each(['model', 'data'] as const)(
    'keeps same-spelled %s business fields, strings and request-schema keys',
    (target) => {
      const f = fixture(target);
      const schema = defineRequestSchema((input) => ({ success: true, data: input }));
      f.router.setOptions({
        operationAccess: { read: 'advancedRead', subs: { basicRead: { read: { default: 'basicRead', root: false } } } },
        permissionSchema: { basicRead: { read: true }, advancedRead: 'basicRead' },
        requestSchemas: { advancedRead: schema },
      });
      f.router.operationAccess('download', 'advancedRead');
      f.router.operationAccess('subs.basicRead.read.basic', true);
      expect(f.options()).toMatchObject({
        operationAccess: {
          read: 'advancedRead',
          download: 'advancedRead',
          subs: { basicRead: { read: { default: 'basicRead', basic: true, root: false } } },
        },
        requestSchemas: { advancedRead: schema },
      });
    },
  );

  it('rejects invalid new model/data configuration before publishing registries or options', () => {
    const api = createAccessRuntime();
    const connection = mongoose.createConnection();
    active.push(connection);
    const model = connection.model(`InvalidNested${++counter}`, new mongoose.Schema({ name: String }));
    expect(() => api.createRouter(model, { operationAccess: { basicRead: true } } as never)).toThrow(/read.basic/);
    expect(api.runtime.hasModelInstance(model.modelName)).toBe(false);
    expect(api.runtime.getModelNames()).toEqual([]);
    expect(() =>
      api.createDataRouter('invalid', { data: [], operationAccess: { advancedRead: true } } as never),
    ).toThrow(/read.advanced/);
    expect(api.runtime.getDataNames()).toEqual([]);
  });

  it('rejects removed keys in a restore before changing any captured option owner', () => {
    const f = fixture('model');
    const before = f.api.runtime.createBootstrapSnapshot();
    const snapshot = {
      ...before,
      globalOptions: { ...before.globalOptions, requestPermissionField: 'changed' },
      dataOptions: { invalid: { operationAccess: { basicRead: undefined } } },
    };
    expect(() => f.api.runtime.restoreBootstrapSnapshot(snapshot as never)).toThrow(/read.basic/);
    expect(f.api.runtime.createBootstrapSnapshot()).toEqual(before);
  });
});

describe('NOA-01 F1 safe admission before operation-access inspection', () => {
  it.each(['facade', 'static'] as const)('rejects %s model options proxies before traps or registration', (entry) => {
    const f = fixture('model');
    const connection = mongoose.createConnection();
    active.push(connection);
    const candidate = connection.model(`NestedAdmissionCandidate${++counter}`, new mongoose.Schema({ name: String }));
    const before = f.api.runtime.createBootstrapSnapshot();
    const trap = vi.fn(() => {
      throw new Error('F1 options trap sentinel');
    });
    const options = new Proxy(
      { operationAccess: { read: true } },
      { ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap, get: trap, has: trap },
    );
    let thrown: unknown;
    try {
      if (entry === 'facade') f.api.createRouter(candidate, options);
      else ModelRouter.fromModel(candidate, options, f.api.runtime);
    } catch (error) {
      thrown = error;
    }
    expect(f.api.runtime.createBootstrapSnapshot()).toEqual(before);
    expect(f.api.hasModelInstance(candidate.modelName)).toBe(false);
    expect(f.api.runtime.hasModel(candidate.modelName)).toBe(false);
    expect(f.policy()).toBe(false);
    expect(trap).not.toHaveBeenCalled();
    expect(thrown).toBeInstanceOf(TypeError);
    expect(thrown).toHaveProperty('message', 'Proxy control/configuration prototype is unsupported');
  });

  it.each(['model', 'data', 'defaults'] as const)(
    'rejects %s non-string keys without coercion or publication',
    (target) => {
      const f = fixture(target);
      const before = f.api.runtime.createBootstrapSnapshot();
      const coerce = vi.fn(() => {
        throw new Error('F1 key coercion sentinel');
      });
      const key = { [Symbol.toPrimitive]: coerce, toString: coerce, valueOf: coerce };
      for (const name of target === 'defaults' ? [f.name] : [f.name, `${f.name}Unconfigured`]) {
        let thrown: unknown;
        try {
          if (target === 'model') f.api.runtime.setModelOption(name, key as never, false);
          else if (target === 'data') f.api.runtime.setDataOption(name, key as never, false);
          else f.api.runtime.setDefaultModelOption(key as never, false);
        } catch (error) {
          thrown = error;
        }
        expect(f.api.runtime.createBootstrapSnapshot()).toEqual(before);
        expect(f.policy()).toBe(false);
        expect(coerce).not.toHaveBeenCalled();
        expect(thrown).toBeInstanceOf(TypeError);
        expect(thrown).toHaveProperty('message', 'Configuration option key must be a string');
      }
    },
  );
});
