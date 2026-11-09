import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessRuntime } from '../../src/runtime';
import {
  captureModelAuthorizationConfiguration,
  captureOutputHelperConfiguration,
  getCapturedAuthorizationOption,
} from '../../src/acl/model-output-planning';
import { authorizationModeKeys, retiredAuthorizationOptions } from '../../src/acl/authorization-modes';
import {
  readServiceAuthorizationMode,
  resolveServiceAuthorization,
  ServiceAuthorizationError,
} from '../../src/acl/service-authorization';
import {
  closeDocumentStage,
  prepareQueryDocumentStage,
  readDocumentStage,
  resolveDocumentStage,
} from '../../src/acl/document-stage';
import Permission from '../../src/permission';
import type { DefaultModelRouterOptions } from '../../src/interfaces';

const booleanOptions = [
  'requireExplicitSelect',
  'stripDisallowedSort',
  'stripPermissionsField',
  'disableFieldPermissions',
] as const;
let sequence = 0;

function fixture() {
  const runtime = new AccessRuntime(),
    warn = vi.fn();
  runtime.setGlobalOptions({ logger: { warn } });
  const model = mongoose.model(`InheritedOptions${++sequence}`, new mongoose.Schema({ name: String, rank: Number }));
  runtime.registerModelInstance(model.modelName, model);
  const name = model.modelName;
  return { runtime, model, name, warn };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^InheritedOptions/);
});

describe('default-model options stay inherited unless explicitly overridden', () => {
  it('disables field permission maps by default and preserves explicit false overrides', () => {
    const f = fixture();
    const expectFieldPermissionsDisabled = (expected: boolean) => {
      expect(f.runtime.getModelOption(f.name, 'disableFieldPermissions')).toBe(expected);
      expect(f.runtime.getExactModelOption(f.name, 'disableFieldPermissions')).toBe(expected);
      expect(f.runtime.getModelOptions(f.name).disableFieldPermissions).toBe(expected);
      expect(captureModelAuthorizationConfiguration(f.runtime, f.name).disableFieldPermissions).toBe(expected);
      expect(captureOutputHelperConfiguration(f.runtime, f.name).disableFieldPermissions).toBe(expected);
    };
    expect(f.runtime.getDefaultModelOptions().disableFieldPermissions).toBe(true);
    expect(f.runtime.getDefaultModelOption('disableFieldPermissions')).toBe(true);
    expectFieldPermissionsDisabled(true);
    f.runtime.setModelOptions(f.name, { disableFieldPermissions: false });
    expectFieldPermissionsDisabled(false);
    f.runtime.setModelOption(f.name, 'disableFieldPermissions', undefined);
    expectFieldPermissionsDisabled(true);
    f.runtime.setDefaultModelOption('disableFieldPermissions', false);
    expectFieldPermissionsDisabled(false);
    f.runtime.setDefaultModelOption('disableFieldPermissions', undefined);
    expect(captureModelAuthorizationConfiguration(f.runtime, f.name).disableFieldPermissions).toBe(true);
    expect(captureOutputHelperConfiguration(f.runtime, f.name).disableFieldPermissions).toBe(true);
  });

  it.each(booleanOptions)('%s applies before configuration and after a model was already configured', (key) => {
    const f = fixture();
    f.runtime.setModelOptions(f.name, { permissionSchema: { name: true } });
    const initial = f.runtime.getModelOptions(f.name);
    f.runtime.setDefaultModelOptions({ [key]: true });
    expect(f.runtime.getDefaultModelOption(key)).toBe(true);
    expect(f.runtime.getModelOption(f.name, key)).toBe(true);
    expect(f.runtime.getExactModelOption(f.name, key)).toBe(true);
    expect(f.runtime.getModelOptions(f.name)[key]).toBe(true);
    if (key !== 'stripDisallowedSort')
      expect(captureModelAuthorizationConfiguration(f.runtime, f.name)[key]).toBe(true);
    expect(initial[key] ?? false).toBe(key === 'disableFieldPermissions');
    // A later unrelated model update/router construction must not pin inherited values.
    f.runtime.setModelOptions(f.name, { sortableFields: ['rank'] });
    f.runtime.setDefaultModelOption(key, false);
    expect(f.runtime.getModelOptions(f.name)[key]).toBe(false);
    f.runtime.setDefaultModelOption(key, true);
    expect(f.runtime.getModelOptions(f.name)[key]).toBe(true);
    f.runtime.setModelOptions(f.name, { [key]: false });
    f.runtime.setDefaultModelOptions({ [key]: false });
    f.runtime.setDefaultModelOptions({ [key]: true });
    expect(f.runtime.getModelOptions(f.name)[key]).toBe(false);
    f.runtime.setModelOption(f.name, key, undefined);
    expect(f.runtime.getModelOptions(f.name)[key]).toBe(true);
  });

  it.each(booleanOptions)('%s supports default-before-model setup and explicit false before defaults', (key) => {
    const f = fixture();
    f.runtime.setDefaultModelOptions({ [key]: true });
    expect(f.warn).not.toHaveBeenCalled();
    f.runtime.setModelOptions(f.name, { [key]: false });
    expect(f.runtime.getModelOptions(f.name)[key]).toBe(false);
    expect(f.warn).not.toHaveBeenCalled();
    const other = fixture();
    other.runtime.setDefaultModelOption(key, true);
    // Read-created managers and direct per-model setters must also inherit defaults.
    expect(other.runtime.getModelOptions(other.name)[key]).toBe(true);
    other.runtime.setModelOption(other.name, 'permissionSchema', { name: true });
    other.runtime.setDefaultModelOption(key, false);
    expect(other.runtime.getModelOptions(other.name)[key]).toBe(false);
  });

  it.each(retiredAuthorizationOptions)(
    '%s is rejected by presence without partial default/model changes or warnings',
    (key) => {
      const f = fixture();
      f.runtime.setModelOptions(f.name, {});
      const before = f.runtime.createBootstrapSnapshot();
      for (const value of [undefined, false, true, 'true', 1, {}]) {
        expect(() =>
          f.runtime.setDefaultModelOptions({ readAuthorizationMode: 'trusted', [key]: value } as never),
        ).toThrow(/removed/);
        expect(() => f.runtime.setDefaultModelOption(key as never, value as never)).toThrow(/removed/);
        expect(f.runtime.createBootstrapSnapshot()).toEqual(before);
      }
      expect(f.warn).not.toHaveBeenCalled();
    },
  );

  it.each(authorizationModeKeys)(
    '%s inherits across all getter forms and restores model/default undefined independently',
    (key) => {
      const f = fixture();
      f.runtime.setModelOptions(f.name, {});
      const initial = f.runtime.getModelOptions(f.name);
      f.runtime.setDefaultModelOptions({ [key]: 'trusted' });
      expect(f.runtime.getModelOptions(f.name)[key]).toBe('trusted');
      expect(f.runtime.getModelOption(f.name, key)).toBe('trusted');
      expect(f.runtime.getExactModelOption(f.name, key)).toBe('trusted');
      expect(captureModelAuthorizationConfiguration(f.runtime, f.name)[key]).toBe('trusted');
      expect(initial[key]).toBe('isolated');
      f.runtime.setModelOptions(f.name, { [key]: 'isolated' });
      f.runtime.setDefaultModelOption(key, 'isolated');
      f.runtime.setDefaultModelOption(key, 'trusted');
      expect(f.runtime.getModelOptions(f.name)[key]).toBe('isolated');
      f.runtime.setModelOption(f.name, key, undefined);
      expect(f.runtime.getModelOptions(f.name)[key]).toBe('trusted');
      f.runtime.setDefaultModelOptions({ [key]: undefined });
      expect(f.runtime.getModelOptions(f.name)[key]).toBe('isolated');
      expect(f.runtime.getModelOptions(f.name)[authorizationModeKeys.find((other) => other !== key)!]).toBe('isolated');
    },
  );

  it('inherits non-boolean defaults and replaces object/array overrides shallowly', () => {
    const f = fixture();
    f.runtime.setModelOptions(f.name, { permissionSchema: { name: true } });
    const initial: DefaultModelRouterOptions = {
      listHardLimit: 7,
      documentPermissionField: 'acl',
      idParam: 'uid',
      idField: 'name',
      resolveIdFilter: (id) => ({ name: id }),
      parentPath: '/api',
      queryRouteSegment: '__fetch',
      mutationRouteSegment: '__write',
      operationAccess: { read: true },
      modelPermissionPrefix: 'doc:',
      hydration: { publicRead: 'lean' },
      sortableFields: ['rank'],
    };
    f.runtime.setDefaultModelOptions(initial);
    expect(f.runtime.getModelOptions(f.name)).toMatchObject(initial);
    const retained = f.runtime.getModelOptions(f.name);
    f.runtime.setModelOptions(f.name, { listHardLimit: 0, operationAccess: {}, sortableFields: [], hydration: {} });
    f.runtime.setDefaultModelOptions({
      listHardLimit: 12,
      operationAccess: { list: true },
      sortableFields: ['name'],
      hydration: { find: 'lean' },
      modelPermissionPrefix: 'owner:',
    });
    expect(f.runtime.getModelOptions(f.name)).toMatchObject({
      listHardLimit: 0,
      operationAccess: {},
      sortableFields: [],
      hydration: {},
      modelPermissionPrefix: 'owner:',
    });
    expect(retained).toMatchObject(initial);
    f.runtime.setModelOption(f.name, 'listHardLimit', undefined);
    f.runtime.setModelOption(f.name, 'hydration', undefined);
    expect(f.runtime.getModelOptions(f.name)).toMatchObject({ listHardLimit: 12, hydration: { find: 'lean' } });
    f.runtime.setModelOption(f.name, 'hydration.publicRead', 'hydrated');
    f.runtime.setDefaultModelOption('hydration.findById', 'lean');
    expect(f.runtime.getModelOptions(f.name).hydration).toEqual({ find: 'lean', publicRead: 'hydrated' });
  });

  it('recomputes effective permission metadata when inherited schema or prefix changes', () => {
    const f = fixture();
    f.runtime.setModelOptions(f.name, {});
    f.runtime.setDefaultModelOptions({
      permissionSchema: { name: { read: 'doc:owner' } },
      modelPermissionPrefix: 'doc:',
    });
    expect(f.runtime.getModelOption(f.name, '_modelPermissionKeys.read')).toEqual(['name']);
    f.runtime.setDefaultModelOption('modelPermissionPrefix', 'other:');
    expect(f.runtime.getModelOption(f.name, '_modelPermissionKeys.read')).toEqual([]);
    expect(f.runtime.getModelOption(f.name, '_globalPermissionKeys.read')).toEqual(['name']);
    f.runtime.setModelOption(f.name, 'permissionSchema', {});
    f.runtime.setDefaultModelOption('permissionSchema', { rank: true });
    expect(f.runtime.getModelOption(f.name, '_permissionSchemaKeys')).toEqual([]);
    f.runtime.setModelOption(f.name, 'permissionSchema', undefined);
    expect(f.runtime.getModelOption(f.name, '_permissionSchemaKeys')).toEqual(['rank']);
  });

  it('preserves exact-key-only authorization fallback when operationAccess is explicitly cleared', () => {
    const f = fixture();
    f.runtime.setModelOptions(f.name, {});
    f.runtime.setDefaultModelOption('operationAccess', true);
    expect(f.runtime.getModelOption(f.name, 'operationAccess.read')).toBe(true);
    f.runtime.setModelOption(f.name, 'operationAccess', undefined);
    expect(f.runtime.getModelOption(f.name, 'operationAccess.read')).toBeUndefined();
    f.runtime.setDefaultModelOption('operationAccess', { read: true, default: true });
    expect(f.runtime.getModelOption(f.name, 'operationAccess.read')).toBe(true);
    expect(f.runtime.getModelOption(f.name, 'operationAccess.list')).toBeUndefined();
    const configuration = captureModelAuthorizationConfiguration(f.runtime, f.name);
    expect(getCapturedAuthorizationOption(configuration, 'operationAccess.read')).toBe(true);
    expect(getCapturedAuthorizationOption(configuration, 'operationAccess.list')).toBeUndefined();
  });

  it('restores inheritance provenance in bootstrap snapshots, not just resolved values', () => {
    const f = fixture();
    const override = mongoose.model(`InheritedOptions${++sequence}`, f.model.schema);
    f.runtime.registerModelInstance(override.modelName, override);
    f.runtime.setModelOptions(f.name, {});
    f.runtime.setModelOptions(override.modelName, { stripPermissionsField: false });
    f.runtime.setDefaultModelOption('stripPermissionsField', true);
    const snapshot = f.runtime.createBootstrapSnapshot();
    f.runtime.setModelOption(f.name, 'stripPermissionsField', false);
    f.runtime.setModelOption(override.modelName, 'stripPermissionsField', undefined);
    f.runtime.restoreBootstrapSnapshot(snapshot);
    expect(f.runtime.getModelOptions(f.name).stripPermissionsField).toBe(true);
    expect(f.runtime.getModelOptions(override.modelName).stripPermissionsField).toBe(false);
    f.runtime.setDefaultModelOption('stripPermissionsField', false);
    f.runtime.setDefaultModelOption('stripPermissionsField', true);
    expect(f.runtime.getModelOptions(f.name).stripPermissionsField).toBe(true);
    expect(f.runtime.getModelOptions(override.modelName).stripPermissionsField).toBe(false);
  });

  it('validates inherited changes atomically before publishing defaults, models or warnings', () => {
    const f = fixture();
    f.runtime.setModelOptions(f.name, { virtuals: { computed: { get: () => true } } });
    const snapshot = f.runtime.createBootstrapSnapshot();
    expect(() =>
      f.runtime.setDefaultModelOptions({
        documentPermissionField: 'computed',
        readAuthorizationMode: 'trusted',
      }),
    ).toThrow(/overlaps/);
    expect(f.runtime.getDefaultModelOptions()).toEqual(snapshot.defaultModelOptions);
    expect(f.runtime.getModelOptions(f.name)).toEqual(snapshot.modelOptions[f.name]);
    expect(f.warn).not.toHaveBeenCalled();
  });

  it('validates private-populate targets against the entire proposed default/model graph', () => {
    const f = fixture();
    f.runtime.setDefaultModelOptions({ permissionSchema: { name: true } });
    f.runtime.setModelOptions(f.name, {});
    const source = mongoose.model(
      `InheritedOptions${++sequence}`,
      new mongoose.Schema({
        ref: { type: mongoose.Schema.Types.ObjectId, ref: f.name },
      }),
    );
    f.runtime.registerModelInstance(source.modelName, source);
    f.runtime.setModelOptions(source.modelName, {
      permissionSchema: {},
      virtuals: {
        computed: { get: () => true, dependsOnPopulate: [{ path: 'ref', select: 'name' }] },
      },
    });
    const before = f.runtime.createBootstrapSnapshot();
    expect(() =>
      f.runtime.setDefaultModelOptions({ permissionSchema: undefined, readAuthorizationMode: 'trusted' }),
    ).toThrow(ServiceAuthorizationError);
    expect(f.runtime.getDefaultModelOptions()).toEqual(before.defaultModelOptions);
    expect(f.runtime.getModelOptions(f.name)).toEqual(before.modelOptions[f.name]);
    expect(f.runtime.getModelOptions(source.modelName)).toEqual(before.modelOptions[source.modelName]);
    expect(f.warn).not.toHaveBeenCalled();
    expect(() => f.runtime.setDefaultModelOption('documentPermissionField', 'name')).toThrow(
      /eligible static persisted target path/,
    );
    expect(f.runtime.getDefaultModelOptions()).toEqual(before.defaultModelOptions);
  });

  it('publishes all effective models before invoking inherited trusted transition loggers', () => {
    const f = fixture();
    const other = mongoose.model(`InheritedOptions${++sequence}`, f.model.schema);
    f.runtime.registerModelInstance(other.modelName, other);
    f.runtime.setModelOptions(f.name, {});
    f.runtime.setModelOptions(other.modelName, {});
    const observed: boolean[] = [];
    f.warn.mockImplementation(() => {
      observed.push(
        f.runtime.getModelOptions(f.name).readAuthorizationMode === 'trusted' &&
          f.runtime.getModelOptions(other.modelName).readAuthorizationMode === 'trusted',
      );
    });
    f.runtime.setDefaultModelOption('readAuthorizationMode', 'trusted');
    expect(observed).toEqual([true, true, true]);
  });

  it.each(['read', 'list'].flatMap((operation) => [false, true].map((initial) => ({ operation, initial }))))(
    'captures inherited $operation source modes before awaits without retaining output authority (trusted=$initial)',
    async ({ operation, initial }) => {
      const f = fixture();
      f.runtime.setModelOptions(f.name, {});
      const configure = (enabled: boolean) =>
        f.runtime.setDefaultModelOptions({
          readAuthorizationMode: enabled ? 'trusted' : 'isolated',
          listAuthorizationMode: enabled ? 'trusted' : 'isolated',
        });
      configure(initial);
      const binding = { request: {} as never, runtime: f.runtime, model: f.model, modelName: f.name };
      const capture = () =>
        resolveServiceAuthorization({
          binding,
          access: {
            operation,
            rowAccess: operation,
            virtualAccess: operation,
            outputAccess: operation,
            docPermissionsAccess: operation,
          },
          configuration: captureModelAuthorizationConfiguration(f.runtime, f.name),
          requestPermissions: new Permission({}),
          listResponse: operation === 'list',
          readResponse: operation === 'read',
        });
      const call = capture();
      const source = { value: 'before' };
      const prepared = prepareQueryDocumentStage(call, binding, source);
      let entered!: () => void, release!: () => void;
      const started = new Promise<void>((done) => {
          entered = done;
        }),
        held = new Promise<void>((done) => {
          release = done;
        });
      const pending = resolveDocumentStage(prepared.stage, async (view) => {
        entered();
        await held;
        return { changed: view.value === 'changed' };
      });
      await started;
      configure(!initial);
      source.value = 'changed';
      release();
      expect(await pending).toEqual({ changed: initial });
      expect(readDocumentStage(prepared.stage, binding).grants).toEqual({ changed: initial });
      expect(readServiceAuthorizationMode(call, binding)).toBe(initial ? 'trusted' : 'isolated');
      const next = capture();
      expect(readServiceAuthorizationMode(next, binding)).toBe(initial ? 'isolated' : 'trusted');
      closeDocumentStage(prepared.stage);
      expect(() => readDocumentStage(prepared.stage, binding)).toThrow(ServiceAuthorizationError);
    },
  );

  it('keeps inheritance runtime-local even for the same Mongoose model', () => {
    const f = fixture(),
      other = new AccessRuntime();
    other.registerModelInstance(f.name, f.model);
    f.runtime.setModelOptions(f.name, {});
    other.setModelOptions(f.name, {});
    f.runtime.setDefaultModelOptions({ stripPermissionsField: true, listHardLimit: 5 });
    expect(other.getModelOptions(f.name).stripPermissionsField).not.toBe(true);
    expect(other.getModelOptions(f.name).listHardLimit).not.toBe(5);
  });

  it('clears dotted virtual overrides without deleting unrelated root siblings', () => {
    const f = fixture(),
      getter = () => true;
    f.runtime.setModelOptions(f.name, { virtuals: { computed: getter } });
    f.runtime.setModelOption(f.name, 'virtuals.missing.computed' as never, undefined);
    expect(f.runtime.getModelOptions(f.name).virtuals).toEqual({ computed: getter });
    f.runtime.setModelOption(f.name, 'virtuals.computed' as never, undefined);
    expect(f.runtime.getModelOptions(f.name).virtuals).toEqual({});
  });
});
