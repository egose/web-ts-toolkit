import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessRuntime } from '../src/runtime';
import {
  captureModelAuthorizationConfiguration,
  getCapturedAuthorizationOption,
} from '../src/acl/model-output-planning';
import { unsafeSnapshotOptions } from '../src/acl/unsafe-snapshot-options';
import { resolveServiceAuthorization, ServiceAuthorizationError } from '../src/acl/service-authorization';
import {
  assertDocumentAuthorization,
  associateDocumentAuthorization,
  createDocumentAuthorizationStage,
  readDocumentAuthorizationAccess,
  resolveDocumentAuthorization,
} from '../src/acl/document-authorization';
import Permission from '../src/permission';
import type { DefaultModelRouterOptions } from '../src/interfaces';

const booleanOptions = [
  'requireExplicitSelect',
  'stripDisallowedSort',
  'stripPermissionsField',
  'disableFieldPermissions',
  ...unsafeSnapshotOptions,
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
    expect(initial[key]).not.toBe(true);
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
    if (unsafeSnapshotOptions.some((flag) => flag === key)) {
      expect(f.warn).toHaveBeenCalledTimes(3);
      expect(f.warn.mock.calls[0][0]).toContain(`Restore ${key}=false`);
    }
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

  it.each(unsafeSnapshotOptions)('%s normalizes default setters without enabling truthy values', (key) => {
    const f = fixture();
    f.runtime.setModelOptions(f.name, {});
    for (const value of ['true', 1, {}, new Boolean(true), null, undefined, false]) {
      f.runtime.setDefaultModelOptions({ [key]: value } as never);
      expect(f.runtime.getDefaultModelOption(key)).toBe(false);
      expect(f.runtime.getModelOption(f.name, key)).toBe(false);
      f.runtime.setDefaultModelOption(key, value as never);
      expect(f.runtime.getModelOptions(f.name)[key]).toBe(false);
    }
    expect(f.warn).not.toHaveBeenCalled();
    f.runtime.setDefaultModelOption(key, true);
    f.runtime.setDefaultModelOption(key, true);
    f.runtime.setModelOptions(f.name, {});
    expect(f.warn).toHaveBeenCalledTimes(1);
  });

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
        unsafeSkipReadDocumentSnapshotChecks: true,
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
      f.runtime.setDefaultModelOptions({ permissionSchema: undefined, unsafeSkipReadOutputSnapshotChecks: true }),
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

  it('publishes all effective models before invoking inherited unsafe warning loggers', () => {
    const f = fixture();
    const other = mongoose.model(`InheritedOptions${++sequence}`, f.model.schema);
    f.runtime.registerModelInstance(other.modelName, other);
    f.runtime.setModelOptions(f.name, {});
    f.runtime.setModelOptions(other.modelName, {});
    const observed: boolean[] = [];
    f.warn.mockImplementation(() => {
      observed.push(
        f.runtime.getModelOptions(f.name).unsafeSkipReadOutputSnapshotChecks === true &&
          f.runtime.getModelOptions(other.modelName).unsafeSkipReadOutputSnapshotChecks === true,
      );
    });
    f.runtime.setDefaultModelOption('unsafeSkipReadOutputSnapshotChecks', true);
    expect(observed).toEqual([true, true]);
  });

  it.each(['read', 'list'].flatMap((operation) => [false, true].map((initial) => ({ operation, initial }))))(
    'captures inherited $operation modes before awaits and retains old handles (initial=$initial)',
    async ({ operation, initial }) => {
      const f = fixture();
      f.runtime.setModelOptions(f.name, {});
      const configure = (enabled: boolean) =>
        f.runtime.setDefaultModelOptions(Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, enabled])));
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
      const retained = await resolveDocumentAuthorization(
        createDocumentAuthorizationStage(call, binding, { value: 'stable' }),
        () => ({}),
      );
      const output = { value: 'published' };
      associateDocumentAuthorization(retained, binding, output);
      const source = { value: 'before' };
      let entered!: () => void, release!: () => void;
      const started = new Promise<void>((done) => {
          entered = done;
        }),
        held = new Promise<void>((done) => {
          release = done;
        });
      const pending = resolveDocumentAuthorization(
        createDocumentAuthorizationStage(call, binding, source),
        async () => {
          entered();
          await held;
          return {};
        },
      );
      await started;
      configure(!initial);
      source.value = 'changed';
      release();
      if (initial) await expect(pending).resolves.toBeDefined();
      else await expect(pending).rejects.toBeInstanceOf(ServiceAuthorizationError);
      output.value = 'changed';
      const check = () => assertDocumentAuthorization(retained, { binding, output, outputAccess: operation });
      if (initial) expect(check).not.toThrow();
      else expect(check).toThrow(ServiceAuthorizationError);
      const next = capture(),
        nextSource = { value: 'before' };
      const nextHandle = await resolveDocumentAuthorization(
        createDocumentAuthorizationStage(next, binding, nextSource),
        () => ({}),
      );
      nextSource.value = 'changed';
      const checkNext = () => readDocumentAuthorizationAccess(nextHandle, binding);
      if (initial) expect(checkNext).toThrow(ServiceAuthorizationError);
      else expect(checkNext).not.toThrow();
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
