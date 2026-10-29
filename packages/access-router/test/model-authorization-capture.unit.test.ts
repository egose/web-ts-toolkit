import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { PublicService } from '../src/services/public-service';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest, ModelRouterOptions } from '../src/interfaces';
import * as executions from '../src/acl/service-execution';
import { readServiceAuthorization } from '../src/acl/service-authorization';
import {
  captureModelAuthorizationConfiguration,
  getCapturedAuthorizationOption,
} from '../src/acl/model-output-planning';
import { resolveVirtualPopulateDependencies } from '../src/acl/virtual-populate-dependencies';
import { capturePopulatePolicyDefaults } from '../src/acl/populate-policy';

let serial = 0;
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
function fixture() {
  const n = ++serial;
  const target = mongoose.model(`ArcpuCaptureTarget${n}`, new mongoose.Schema({ balance: Number, name: String }));
  const model = mongoose.model(
    `ArcpuCaptureSource${n}`,
    new mongoose.Schema({
      status: String,
      name: String,
      account: { type: mongoose.Schema.Types.ObjectId, ref: target.modelName },
      child: new mongoose.Schema({ note: String }),
    }),
  );
  const runtime = new AccessRuntime();
  runtime.registerModelInstance(target.modelName, target);
  runtime.setModelOptions(target.modelName, { permissionSchema: { balance: true }, operationAccess: { read: true } });
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, { permissionSchema: { status: true }, stripPermissionsField: true });
  const req = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const adapter = {
    mongooseModel: model,
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    countDocuments: vi.fn().mockResolvedValue(0),
  };
  let effectiveOptions: ModelRouterOptions | undefined;
  const service = runWithRuntime(runtime, () => {
    req.macl = new Core(req);
    return new (class extends PublicService {
      protected createModelAdapter() {
        return adapter;
      }
      protected getModelRouterOptions(name: string) {
        return effectiveOptions ?? super.getModelRouterOptions(name);
      }
    })(req, model.modelName);
  });
  return {
    runtime,
    model,
    target,
    req,
    service,
    adapter,
    capture: () => captureModelAuthorizationConfiguration(runtime, model.modelName),
    useOptions: (options?: ModelRouterOptions) => (effectiveOptions = options),
  };
}

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^ArcpuCapture/);
});

describe('ARCPU-04 configuration capture ownership lifetime', () => {
  it.each(['direct', 'public'] as const)(
    '%s calls retain their capture across awaits, while later calls refresh defaults/model/globals/targets',
    async (entry) => {
      const f = fixture();
      const entered = latch();
      const held = latch();
      let calls = 0;
      f.runtime.setDefaultModelOptions({ permissionSchema: { status: true }, operationAccess: { read: true } });
      f.runtime.setModelOptions(f.model.modelName, {
        permissionSchema: undefined,
        operationAccess: undefined,
        hydration: { findOne: 'lean', publicRead: 'hydrated' },
        overrideFilter: {
          read: async () => {
            if (++calls === 1) {
              entered.resolve();
              await held.promise;
            }
            return false;
          },
        },
        virtuals: { eligible: { get: () => true, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } },
      } as never);
      const when = new Date(10);
      f.runtime.setModelOptions(f.target.modelName, {
        baseFilter: { read: { when } },
        defaults: { findOneArgs: { select: ['balance'] } },
      } as never);
      const issued = vi.spyOn(executions, 'createServiceExecution');
      const args = {
        populate: ['account'],
        include: [{ path: 'joined', model: f.target.modelName, op: 'read', localField: '_id', foreignField: '_id' }],
      };
      const invoke = () =>
        entry === 'direct'
          ? f.service.findOne({}, args as never, quiet)
          : f.service._readFilter({}, args as never, quiet);
      const read = (index: number) => {
        const state = executions.readServiceExecution(f.service, issued.mock.results[index].value);
        return { state, ...readServiceAuthorization(state.authorization, state.binding) };
      };
      const pending = invoke();
      await entered.promise;
      const initial = read(0);
      try {
        expect(initial.configuration.permissionSchema).toEqual({ status: true });
        expect(getCapturedAuthorizationOption(initial.configuration, 'operationAccess.read')).toBe(true);
        expect(initial.configuration.hydration).toEqual({ findOne: 'lean', publicRead: 'hydrated' });
        expect(initial.relatedTargets).toHaveLength(2);
        f.runtime.setDefaultModelOption('permissionSchema.status' as never, false as never);
        f.runtime.setDefaultModelOptions({ operationAccess: { read: false } });
        f.runtime.setDefaultModelOption('requireOperationAccessForPopulateQueries', false);
        f.runtime.setDefaultModelOptions({ requireOperationAccessForPopulateDependencies: false });
        f.runtime.setModelOptions(f.model.modelName, { alwaysSelectFields: ['name'] });
        f.runtime.setModelOption(f.model.modelName, 'hydration.findOne', 'hydrated');
        f.runtime.setModelOption(f.model.modelName, 'hydration.publicRead', 'lean');
        f.runtime.setModelOption(f.target.modelName, 'permissionSchema.balance' as never, false as never);
        f.runtime.setModelOptions(f.target.modelName, {
          operationAccess: { read: false },
          defaults: { findOneArgs: { select: ['name'] } },
        });
        when.setTime(99); // Mutates a retained native leaf without calling a setter.
      } finally {
        held.resolve();
      }
      expect(await pending).toMatchObject({ success: false, code: 'forbidden' });
      const retained = read(0);
      expect(retained.configuration.permissionSchema).toEqual({ status: true });
      expect(getCapturedAuthorizationOption(retained.configuration, 'operationAccess.read')).toBe(true);
      expect(retained.configuration.alwaysSelectFields).toEqual([]);
      expect(retained.configuration.requireOperationAccessForPopulateQueries).toBe(true);
      expect(retained.configuration.requireOperationAccessForPopulateDependencies).toBe(true);
      for (const target of retained.relatedTargets) {
        expect(target.configuration.requireOperationAccessForPopulateQueries).toBe(true);
        expect(target.configuration.requireOperationAccessForPopulateDependencies).toBe(true);
        expect(target.configuration.permissionSchema).toEqual({ balance: true });
        expect(target.configuration.defaults).toEqual({ findOneArgs: { select: ['balance'] } });
        expect((target.configuration.baseFilter as { read: { when: Date } }).read.when.getTime()).toBe(10);
      }
      expect(retained.relatedTargets[1].queryIntent?.args.select).toEqual(['balance']);
      expect(retained.relatedTargets[1].operationGuard).toBe(true);
      const [oldDependency] = resolveVirtualPopulateDependencies(retained.configuration, [], 'eligible', 'read');
      expect(oldDependency.target.configuration.permissionSchema).toEqual({ balance: true });
      expect(getCapturedAuthorizationOption(oldDependency.target.configuration, 'operationAccess.read')).toBe(true);
      expect(oldDependency.target.configuration.requireOperationAccessForPopulateDependencies).toBe(true);
      // Even a hydration derivation performed after mutation reads only this call's captured configuration.
      const hydration = executions.withExecutionHydration(f.service, issued.mock.results[0].value, 'publicRead');
      expect(executions.readServiceExecution(f.service, hydration).hydration).toBe('hydrated');

      expect(await invoke()).toMatchObject({ success: false, code: 'forbidden' });
      const next = read(1);
      expect(next.configuration.permissionSchema).toEqual({ status: false });
      expect(getCapturedAuthorizationOption(next.configuration, 'operationAccess.read')).toBe(false);
      expect(next.configuration.alwaysSelectFields).toEqual(['name']);
      expect(next.configuration.hydration).toEqual({ findOne: 'hydrated', publicRead: 'lean' });
      expect(next.configuration.requireOperationAccessForPopulateQueries).toBe(false);
      expect(next.configuration.requireOperationAccessForPopulateDependencies).toBe(false);
      for (const target of next.relatedTargets) {
        expect(target.configuration.requireOperationAccessForPopulateQueries).toBe(false);
        expect(target.configuration.requireOperationAccessForPopulateDependencies).toBe(false);
        expect(target.configuration.permissionSchema).toEqual({ balance: false });
        expect(target.configuration.defaults).toEqual({ findOneArgs: { select: ['name'] } });
        expect((target.configuration.baseFilter as { read: { when: Date } }).read.when.getTime()).toBe(99);
      }
      expect(next.relatedTargets[1].queryIntent?.args.select).toEqual(['name']);
      expect(next.relatedTargets[1].operationGuard).toBe(false);
      const [newDependency] = resolveVirtualPopulateDependencies(next.configuration, [], 'eligible', 'read');
      expect(newDependency.target.configuration.permissionSchema).toEqual({ balance: false });
      expect(getCapturedAuthorizationOption(newDependency.target.configuration, 'operationAccess.read')).toBe(false);
      expect(newDependency.target.configuration.requireOperationAccessForPopulateDependencies).toBe(false);
      expect(f.adapter.findOne).not.toHaveBeenCalled();
    },
  );

  it.each(['direct', 'public'] as const)(
    '%s calls honor explicit effective option bags instead of a model-only view',
    async (entry) => {
      const f = fixture();
      f.runtime.setModelOptions(f.model.modelName, {
        permissionSchema: { status: false, name: true },
        defaults: { findOneArgs: { select: ['name', '-_id'] } },
        hydration: { findOne: 'hydrated', publicRead: 'lean' },
      });
      f.adapter.findOne.mockResolvedValue({ status: 'visible', name: 'named' });
      const options = {
        ...f.runtime.getModelOptions(f.model.modelName),
        permissionSchema: { status: true, name: false },
        defaults: { findOneArgs: { select: ['status', '-_id'] } },
        hydration: { findOne: 'lean', publicRead: 'hydrated' },
      } as ModelRouterOptions;
      f.useOptions(options);
      const invoke = () =>
        entry === 'direct' ? f.service.findOne({}, undefined, quiet) : f.service._readFilter({}, undefined, quiet);
      expect(await invoke()).toMatchObject({ success: true, data: { status: 'visible' } });
      expect(f.adapter.findOne.mock.calls[0][0].lean).toBe(entry === 'direct');
      // Replacing the effective bag, without changing the model identity, must affect the next call.
      f.useOptions({
        ...options,
        permissionSchema: { status: false, name: true },
        defaults: { findOneArgs: { select: ['name', '-_id'] } },
        hydration: { findOne: 'hydrated', publicRead: 'lean' },
      });
      const next = await invoke();
      expect(next).toMatchObject({ success: true, data: { name: 'named' } });
      if (next.success) expect(next.data).not.toHaveProperty('status');
      expect(f.adapter.findOne.mock.calls[1][0].lean).toBe(entry === 'public');
      // The explicit capture API honors supplied options and the originating model-default
      // token even after live defaults change; a source-resolved/global bag is not that token.
      f.runtime.setDefaultModelOptions({
        requireOperationAccessForPopulateQueries: false,
        requireOperationAccessForPopulateDependencies: false,
      });
      const defaults = capturePopulatePolicyDefaults(f.runtime);
      f.runtime.setDefaultModelOptions({
        requireOperationAccessForPopulateQueries: true,
        requireOperationAccessForPopulateDependencies: true,
      });
      const explicit = captureModelAuthorizationConfiguration(f.runtime, f.model.modelName, options, defaults);
      expect(explicit.permissionSchema).toEqual({ status: true, name: false });
      expect(explicit.hydration).toEqual(options.hydration);
      expect(explicit.requireOperationAccessForPopulateQueries).toBe(false);
      expect(explicit.requireOperationAccessForPopulateDependencies).toBe(false);
      expect(f.capture().permissionSchema).toEqual({ status: false, name: true });
      expect(f.capture().requireOperationAccessForPopulateQueries).toBe(true);
    },
  );

  it('observes native mutations through retained/fetched options despite stable frozen subtree identities', () => {
    const f = fixture();
    const native = {
      when: new Date(10),
      bytes: Buffer.from([1]),
      id: new mongoose.mongo.BSON.ObjectId(),
      map: new Map([['when', new Date(20)]]),
    };
    f.runtime.setModelOption(f.model.modelName, 'baseFilter.read', native as never);
    const stored = f.runtime.getModelOptions(f.model.modelName);
    const fetched = (stored.baseFilter as { read: typeof native }).read;
    const first = f.capture();
    const originalId = native.id.toHexString();
    expect(Object.isFrozen(fetched)).toBe(true);
    expect(fetched.when).toBe(native.when);
    expect(fetched.map).toBe(native.map);
    native.when.setTime(99);
    fetched.bytes[0] = 9;
    fetched.id.id = Buffer.alloc(12);
    fetched.map.get('when')!.setTime(99);
    expect(f.runtime.getModelOptions(f.model.modelName).baseFilter).toBe(stored.baseFilter);
    const next = (f.capture().baseFilter as { read: typeof native }).read;
    expect(next.when.getTime()).toBe(99);
    expect(next.bytes[0]).toBe(9);
    expect(next.id.toHexString()).not.toBe(originalId);
    expect(next.map.get('when')!.getTime()).toBe(99);
    const retained = (first.baseFilter as { read: typeof native }).read;
    expect(retained.when.getTime()).toBe(10);
    expect(retained.bytes[0]).toBe(1);
    expect(retained.id.toHexString()).toBe(originalId);
    expect(retained.map.get('when')!.getTime()).toBe(20);
  });

  it('recaptures live schema/catalog changes even after restoring the same option/model snapshot', () => {
    const f = fixture();
    const bootstrap = f.runtime.createBootstrapSnapshot();
    const first = f.capture();
    const stored = f.runtime.getModelOptions(f.model.modelName);
    f.model.schema.remove('name');
    f.model.schema.add({ late: String });
    f.model.schema.path('child').schema.add({ extra: String });
    f.model.schema.virtual('lateVirtual').get(() => true);
    f.model.schema.set('versionKey', 'revision');
    delete f.model.schema.path('account').options.ref;
    f.runtime.setModelOption(f.model.modelName, 'permissionSchema.status' as never, false as never);
    f.runtime.setDefaultModelOption('operationAccess.read', true);
    f.runtime.setDefaultModelOption('requireOperationAccessForPopulateQueries', false);
    f.runtime.setModelOption(f.target.modelName, 'permissionSchema.balance' as never, false as never);
    const late = mongoose.model(`ArcpuCaptureLate${++serial}`, new mongoose.Schema({ added: String }));
    f.runtime.registerModelInstance(late.modelName, late);
    f.runtime.setModelOptions(late.modelName, { permissionSchema: { added: true } });
    const changed = f.capture();
    f.runtime.restoreBootstrapSnapshot(bootstrap);
    const next = f.capture();
    expect(next.permissionSchema).toEqual({ status: true });
    expect(changed.permissionSchema).toEqual({ status: false });
    expect(next.requireOperationAccessForPopulateQueries).toBe(true);
    expect(changed.requireOperationAccessForPopulateQueries).toBe(false);
    expect(f.runtime.getDefaultModelOption('operationAccess')).toBe(false);
    expect(f.runtime.getModelOptions(f.target.modelName).permissionSchema).toEqual({ balance: true });
    expect(f.runtime.hasModelInstance(late.modelName)).toBe(false);
    expect(f.runtime.hasModel(late.modelName)).toBe(false);
    expect(f.runtime.getModelInstance(f.model.modelName)).toBe(f.model);
    expect(f.runtime.getModelOptions(f.model.modelName).permissionSchema).toBe(stored.permissionSchema);
    // Bootstrap snapshots hold model/schema identities, not schema copies or revision counters.
    expect(next.catalog.paths).toContain('late');
    expect(next.catalog.paths).toContain('child.extra');
    expect(next.catalog.paths).not.toContain('name');
    expect(next.catalog.schemaVirtualPaths).toContain('lateVirtual');
    expect(next.catalog.protectedPaths).toContain('revision');
    expect(next.catalog.referencePaths).not.toContain('account');
    expect(first.catalog.paths).toContain('name');
    expect(first.catalog.paths).not.toContain('late');
    expect(first.catalog.schemaVirtualPaths).not.toContain('lateVirtual');
    expect(first.catalog.referencePaths).toContain('account');
  });
});
