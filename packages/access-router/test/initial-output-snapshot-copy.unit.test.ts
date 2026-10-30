import mongoose, { mongo } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import type { ModelRequest, ModelRouterOptions, ServiceOutputContext } from '../src/interfaces';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import {
  resolveServiceAuthorization,
  requiresDocumentSnapshotChecks,
  requiresOutputSnapshotChecks,
  skipsInitialOutputSnapshotCopy,
  ServiceAuthorizationError,
  type AuthorizationBinding,
  type ResolveServiceAuthorizationInput,
} from '../src/acl/service-authorization';
import {
  assertDocumentAuthorization,
  associateDocumentAuthorization,
  createDocumentAuthorizationStage,
  createServiceOutputContext,
  getAssociatedDocumentAuthorization,
  memoizeDocumentFieldDecision,
  readDocumentAuthorization,
  resolveDocumentAuthorization,
  transferDocumentAuthorization,
  transferDocumentAuthorizationGraph,
} from '../src/acl/document-authorization';
import { unsafeInitialOutputCopyOptions, unsafeSnapshotOptions } from '../src/acl/unsafe-snapshot-options';
import { assertPublicAdmission, assertPublicDefaults } from '../src/validation/public-admission';
import * as snapshots from '../src/acl/authorization-snapshot';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { finalizeModelOutputs } from '../src/output/finalize-model-output';

const access = (operation: string, effective = operation) => ({
  operation,
  rowAccess: effective,
  outputAccess: effective,
  virtualAccess: effective,
  docPermissionsAccess: effective,
});
const permissions = new Permission({ reader: true });
const catalog = { paths: ['value', 'child', 'child.value'] };
let serial = 0;

function call(
  options: ModelRouterOptions = {},
  operation = 'list',
  extra: Partial<ResolveServiceAuthorizationInput> = {},
) {
  const binding: AuthorizationBinding = {
    request: {} as ModelRequest,
    runtime: {},
    model: {},
    modelName: 'InitialCopy',
  };
  const input: ResolveServiceAuthorizationInput = {
    binding,
    configuration: { catalog, ...options },
    access: access(operation),
    requestPermissions: permissions,
    listResponse: operation === 'list',
    readResponse: operation === 'read',
    ...extra,
  };
  return { binding: input.binding, authorization: resolveServiceAuthorization(input), input };
}

async function owner(state: ReturnType<typeof call>) {
  const source = { value: 'source', date: new Date(1), bytes: Buffer.from([1]) };
  const stage = createDocumentAuthorizationStage(state.authorization, state.binding, source);
  const handle = await resolveDocumentAuthorization(stage, () => ({ reader: true }));
  const use = (output: object) => ({
    binding: state.binding,
    output,
    outputAccess: state.input.access.outputAccess,
    authorization: state.authorization,
    stage,
  });
  return { ...state, source, stage, handle, use };
}

const enabled = (mode: 'List' | 'Read', copy = true, checks = true): ModelRouterOptions => ({
  [`unsafeSkip${mode}OutputSnapshotChecks`]: checks,
  [`unsafeSkip${mode}InitialOutputSnapshotCopy`]: copy,
});

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^InitialCopyOptions/);
});

describe('initial output-copy capture and prerequisite', () => {
  it.each(Array.from({ length: 256 }, (_, mask) => mask))('keeps all eight modes distinct (mask=%s)', (mask) => {
    const options = Object.fromEntries(unsafeSnapshotOptions.map((key, index) => [key, !!(mask & (1 << index))]));
    for (const operation of ['list', 'read']) {
      const mode = operation === 'read' ? 'Read' : 'List';
      const inverse = Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, !options[key]]));
      const parent = call(options, operation, {
        relatedTargets: [{ path: 'ref', modelName: 'Other', configuration: { catalog, ...inverse } }],
      });
      const skipped = options[`unsafeSkip${mode}OutputSnapshotChecks`];
      const copy = skipped && options[`unsafeSkip${mode}InitialOutputSnapshotCopy`];
      expect(skipsInitialOutputSnapshotCopy(parent.authorization)).toBe(copy);
      expect(requiresOutputSnapshotChecks(parent.authorization, parent.binding)).toBe(!skipped);
      expect(requiresDocumentSnapshotChecks(parent.authorization, parent.binding)).toBe(
        !options[`unsafeSkip${mode}DocumentSnapshotChecks`],
      );
      // Targets have opposite settings; authenticated derivation uses the origin.
      const child = call(Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, !options[key]])), operation, {
        binding: { ...parent.binding, scopePath: ['child'] },
        parent: parent.authorization,
        snapshotDerivation: { kind: 'embedded', parentBinding: parent.binding },
      });
      expect(skipsInitialOutputSnapshotCopy(child.authorization)).toBe(copy);
      expect(requiresDocumentSnapshotChecks(child.authorization, child.binding)).toBe(
        !options[`unsafeSkip${mode}NestedDocumentSnapshotChecks`],
      );
      const related = call(inverse, 'read', {
        binding: { ...parent.binding, model: {}, modelName: 'Other' },
        parent: parent.authorization,
        readResponse: false,
        listResponse: false,
        snapshotDerivation: { kind: 'related', parentBinding: parent.binding, path: 'ref' },
      });
      expect(skipsInitialOutputSnapshotCopy(related.authorization)).toBe(copy);
      if (operation === 'read') {
        const retry = call(options, 'read', {
          binding: parent.binding,
          parent: parent.authorization,
          access: access('read', 'list'),
        });
        expect(skipsInitialOutputSnapshotCopy(retry.authorization)).toBe(copy);
      }
    }
  });

  it('does not relax fresh helpers, arbitrary parent derivations, writes or dedicated subdocuments', () => {
    const options = Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, true]));
    const root = call(options);
    for (const operation of ['create', 'update', 'upsert', 'delete', 'listSub', 'readSub']) {
      expect(skipsInitialOutputSnapshotCopy(call(options, operation).authorization)).toBe(false);
      expect(
        skipsInitialOutputSnapshotCopy(call(options, operation, { access: access(operation, 'read') }).authorization),
      ).toBe(false);
    }
    for (const extra of [
      { listResponse: false, readResponse: false, applicability: 'output' as const },
      { parent: root.authorization, binding: root.binding },
      { binding: { ...root.binding, scopePath: ['child'] } },
    ])
      expect(skipsInitialOutputSnapshotCopy(call(options, 'list', extra).authorization)).toBe(false);
  });
});

describe('bounded clone-free admission and identities', () => {
  it('matches identity order without cloning, freezing inputs or losing non-enumerable data/aliases', () => {
    const leaf = { value: 1 };
    const wire = vi.fn(() => 'normalized');
    const date = new Date(1),
      buffer = Buffer.from([1]),
      bson = Object.assign(new mongo.BSON.ObjectId(), { toBSON: wire }),
      expression = /x/g;
    const value = {
      child: [leaf, leaf],
      date,
      buffer,
      bson,
      expression,
      nullRecord: Object.assign(Object.create(null), { leaf }),
    };
    Object.defineProperty(value, 'hidden', { value: { leaf }, enumerable: false });
    const before = Object.getOwnPropertyDescriptors(value);
    expect(snapshots.tryOutputIdentitiesWithoutSnapshot(value)).toEqual(snapshots.outputIdentities(value));
    expect(Object.getOwnPropertyDescriptors(value)).toEqual(before);
    expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(leaf)).toBe(false);
    expect(snapshots.tryOutputIdentitiesWithoutSnapshot(value)).toBeDefined();
    expect(wire).not.toHaveBeenCalled();
  });

  it('retains node/depth/array limits and counts repeated primitive/aliased visits', () => {
    const nested = (count: number) => {
      let value: object = {};
      while (count--) value = { value };
      return value;
    };
    const valid = [Array(20000), Array(19999).fill(1), nested(100), Array(9999).fill({ value: 1 })];
    const invalid = [Array(20001), Array(20000).fill(1), nested(101), Array(10000).fill({ value: 1 })];
    for (const value of valid) {
      expect(() => snapshots.copyAuthorizationValue(value, 'document')).not.toThrow();
      expect(snapshots.tryOutputIdentitiesWithoutSnapshot(value)).toEqual(snapshots.outputIdentities(value));
    }
    for (const value of invalid) {
      expect(() => snapshots.copyAuthorizationValue(value, 'document')).toThrow(ServiceAuthorizationError);
      expect(() => snapshots.tryOutputIdentitiesWithoutSnapshot(value)).toThrow(ServiceAuthorizationError);
    }
  });

  it('rejects cycles, accessors, functions, symbols, unsafe keys and invalid array properties', () => {
    const cycle: any = {};
    cycle.self = cycle;
    const indirect: any = { child: {} };
    indirect.child.parent = indirect;
    const invalid = [
      cycle,
      indirect,
      { value: () => true },
      { value: Symbol('x') },
      Object.defineProperty({}, 'value', { get: () => true }),
      Object.defineProperty({}, '__proto__', { value: {} }),
      Object.defineProperty({}, Symbol('key'), { value: 1 }),
      Object.assign([], { '01': 1 }),
      Object.assign([], { extra: 1 }),
    ];
    for (const value of invalid) {
      expect(() => snapshots.copyAuthorizationValue(value, 'document')).toThrow(ServiceAuthorizationError);
      expect(() => snapshots.tryOutputIdentitiesWithoutSnapshot(value)).toThrow(ServiceAuthorizationError);
    }
  });

  it('falls back for proxies, iterated native containers, subclasses and unsupported kinds', () => {
    const get = vi.fn();
    const proxy = new Proxy(
      { value: 1 },
      {
        get(target, key) {
          get(key);
          return Reflect.get(target, key);
        },
      },
    );
    class CustomDate extends Date {}
    for (const value of [
      proxy,
      { proxy },
      { map: new Map([['x', 1]]) },
      { set: new Set([1]) },
      { date: new CustomDate() },
      { bytes: new Uint8Array(1) },
      { promise: Promise.resolve(1) },
      { map: Object.setPrototypeOf(new Map([['value', 1]]), mongo.BSON.BSONValue.prototype) },
      { set: Object.setPrototypeOf(new Set([1]), mongo.BSON.BSONValue.prototype) },
    ]) {
      expect(snapshots.tryOutputIdentitiesWithoutSnapshot(value)).toBeUndefined();
    }
    expect(get).not.toHaveBeenCalled();
    const prototype = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('prototype trap');
        },
      },
    );
    expect(snapshots.tryOutputIdentitiesWithoutSnapshot(Object.create(prototype))).toBeUndefined();
  });

  it('agrees with the copier and identity oracle on seeded ordinary graphs', () => {
    let state = 0x1c0f1;
    const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
    const make = (depth: number): any => {
      const kind = next() % (depth ? 8 : 4);
      if (kind === 0) return null;
      if (kind === 1) return next();
      if (kind === 2) return `雪${next()}`;
      if (kind === 3) return undefined;
      if (kind === 4) return new Date(next());
      if (kind === 5) return new mongo.BSON.ObjectId();
      if (kind === 6) return Array.from({ length: next() % 5 }, () => make(depth - 1));
      return Object.fromEntries(Array.from({ length: next() % 5 }, (_, index) => [`key${index}`, make(depth - 1)]));
    };
    for (let index = 0; index < 500; index++) {
      const value = { generated: make(5) };
      expect(() => snapshots.copyAuthorizationValue(value, 'document')).not.toThrow();
      expect(snapshots.tryOutputIdentitiesWithoutSnapshot(value)).toEqual(snapshots.outputIdentities(value));
    }
  });
});

describe('initial association, fallback and retained authority', () => {
  it.each(['List', 'Read'] as const)(
    'omits only an active %s initial snapshot, including package transfers',
    async (mode) => {
      for (const checks of [false, true])
        for (const copy of [false, true]) {
          const f = await owner(call(enabled(mode, copy, checks), mode.toLowerCase()));
          const output = {
            value: 'public',
            child: { value: 1 },
            date: new Date(1),
            bytes: Buffer.from([1]),
            id: new mongo.BSON.ObjectId(),
          };
          const copies = vi.spyOn(snapshots, 'copyAuthorizationValue');
          associateDocumentAuthorization(f.handle, f.binding, output);
          expect(copies.mock.calls.filter(([value]) => value === output)).toHaveLength(copy && checks ? 0 : 1);
          expect(() => assertDocumentAuthorization(f.handle, f.use(output))).not.toThrow();
          const next = { ...output, child: { value: 1 } };
          transferDocumentAuthorization(f.handle, f.use(output), next);
          expect(copies.mock.calls.filter(([value]) => value === next)).toHaveLength(copy && checks ? 0 : 1);
          expect(getAssociatedDocumentAuthorization(next, f.authorization)).toBe(f.handle);
          const context = createServiceOutputContext({}, f.handle, f.use(output));
          expect(context.documentAuthorization).toBe(f.handle);
          expect(() => associateDocumentAuthorization(f.handle, f.binding, output)).not.toThrow();
          output.child = { value: 1 };
          expect(() => assertDocumentAuthorization(f.handle, f.use(output))).toThrow(ServiceAuthorizationError);
          expect(() => associateDocumentAuthorization(f.handle, f.binding, output)).toThrow(ServiceAuthorizationError);
          expect(context.getDocumentAuthorization(output)).toBeUndefined();
          copies.mockRestore();
        }
    },
  );

  it('keeps strict fallback native observations and unsupported failures in the active mode', async () => {
    const f = await owner(call(enabled('List')));
    const wire = vi.fn(() => 'normalized');
    const output = { id: Object.assign(new mongo.BSON.ObjectId(), { toBSON: wire }), map: new Map([['x', 1]]) };
    const copies = vi.spyOn(snapshots, 'copyAuthorizationValue');
    associateDocumentAuthorization(f.handle, f.binding, output);
    expect(copies.mock.calls.filter(([value]) => value === output)).toHaveLength(1);
    expect(wire).toHaveBeenCalled();
    expect(() => associateDocumentAuthorization(f.handle, f.binding, { bad: new WeakMap() })).toThrow(
      ServiceAuthorizationError,
    );
  });

  it('keeps the original copy fallback for accessor/proxy ownership bindings', async () => {
    const f = await owner(call(enabled('List')));
    const request = vi.fn(() => f.binding.request);
    const accessor = {
      ...f.binding,
      get request() {
        return request();
      },
    };
    for (const binding of [accessor, new Proxy(f.binding, {})]) {
      const output = { value: 'public' };
      const copies = vi.spyOn(snapshots, 'copyAuthorizationValue');
      associateDocumentAuthorization(f.handle, binding, output);
      expect(copies.mock.calls.filter(([value]) => value === output)).toHaveLength(1);
      expect(() => assertDocumentAuthorization(f.handle, { ...f.use(output), binding })).not.toThrow();
      copies.mockRestore();
    }
    expect(request).toHaveBeenCalled();
  });

  it("explicitly drops this pass's BSON hook/validation observations only when both flags are active", async () => {
    for (const checks of [false, true])
      for (const copy of [false, true]) {
        const f = await owner(call(enabled('List', copy, checks)));
        const hook = vi.fn(() => {
          throw new Error('wire failure');
        });
        const output = { id: Object.assign(new mongo.BSON.ObjectId(), { toBSON: hook }) };
        if (copy && checks) {
          expect(() => associateDocumentAuthorization(f.handle, f.binding, output)).not.toThrow();
          expect(hook).not.toHaveBeenCalled();
          expect(() => assertDocumentAuthorization(f.handle, f.use(output))).not.toThrow();
        } else {
          expect(() => associateDocumentAuthorization(f.handle, f.binding, output)).toThrow(ServiceAuthorizationError);
          expect(hook).toHaveBeenCalled();
        }
      }
  });

  it('does not alias document-hook inputs, grants or native leaves; source checks remain independent', async () => {
    const state = call(enabled('List'));
    const source = { date: new Date(1), bytes: Buffer.from([1]), value: 'source' };
    const stage = createDocumentAuthorizationStage(state.authorization, state.binding, source);
    const grants = { date: new Date(2), bytes: Buffer.from([2]) };
    const hook = vi.fn(function (this: ModelRequest, input: typeof source) {
      expect(this).toBe(state.binding.request);
      input.date.setTime(9);
      input.bytes[0] = 9;
      return grants;
    });
    const handle = await resolveDocumentAuthorization(stage, hook);
    grants.date.setTime(10);
    grants.bytes[0] = 10;
    const read = readDocumentAuthorization(handle, state.binding);
    expect(read.grants).toEqual({ date: new Date(2), bytes: Buffer.from([2]) });
    expect(source).toEqual({ date: new Date(1), bytes: Buffer.from([1]), value: 'source' });
    const decision = vi.fn((_permissions, owned: typeof grants) => {
      owned.date.setTime(99);
      return true;
    });
    expect(await memoizeDocumentFieldDecision(handle, state.binding, 'value', decision)).toBe(true);
    expect(await memoizeDocumentFieldDecision(handle, state.binding, 'value', decision)).toBe(true);
    expect(decision).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(readDocumentAuthorization(handle, state.binding).grants.date).toEqual(new Date(2));
    source.value = 'changed';
    expect(() => readDocumentAuthorization(handle, state.binding)).toThrow(ServiceAuthorizationError);
  });

  it('documents a possible denial-to-allowance change from omitted normalization observations', async () => {
    for (const copy of [false, true]) {
      const f = await owner(call(enabled('List', copy)));
      let normalized = false;
      const wire = vi.fn(() => {
        normalized = true;
        return 'normalized';
      });
      const output = { id: Object.assign(new mongo.BSON.ObjectId(), { toBSON: wire }) };
      associateDocumentAuthorization(f.handle, f.binding, output);
      const decision = vi.fn(() => !normalized);
      expect(await memoizeDocumentFieldDecision(f.handle, f.binding, 'later-field', decision)).toBe(copy);
      expect(decision).toHaveBeenCalledTimes(1);
      expect(wire).toHaveBeenCalledTimes(copy ? 0 : 1);
    }
  });

  it('retains exact bindings, call/stage ownership and graph identities in active mode', async () => {
    const f = await owner(call(enabled('List'))),
      other = await owner(call(enabled('List')));
    const output = { value: 'public', child: { value: 1 }, date: new Date(1) };
    associateDocumentAuthorization(f.handle, f.binding, output);
    output.value = 'stale';
    output.date.setTime(2);
    expect(() => assertDocumentAuthorization(f.handle, f.use(output))).not.toThrow();
    for (const key of ['request', 'runtime', 'model', 'modelName', 'scopePath']) {
      const binding = { ...f.binding, [key]: key === 'modelName' ? 'different' : key === 'scopePath' ? ['child'] : {} };
      expect(() => assertDocumentAuthorization(f.handle, { ...f.use(output), binding })).toThrow(
        ServiceAuthorizationError,
      );
    }
    expect(() => assertDocumentAuthorization({} as never, f.use(output))).toThrow(ServiceAuthorizationError);
    expect(() => assertDocumentAuthorization(f.handle, { ...f.use(output), stage: other.stage })).toThrow(
      ServiceAuthorizationError,
    );
    expect(() =>
      assertDocumentAuthorization(f.handle, { ...f.use(output), authorization: other.authorization }),
    ).toThrow(ServiceAuthorizationError);
    expect(() => associateDocumentAuthorization(other.handle, other.binding, output)).toThrow(
      ServiceAuthorizationError,
    );
    expect(() => assertDocumentAuthorization(f.handle, f.use({ ...output }))).toThrow(ServiceAuthorizationError);
    const graphCopy = { ...output, child: { ...output.child } };
    transferDocumentAuthorizationGraph(output, graphCopy);
    expect(getAssociatedDocumentAuthorization(graphCopy, f.authorization)).toBe(f.handle);
    output.date = new Date(2);
    expect(() => assertDocumentAuthorization(f.handle, f.use(output))).toThrow(ServiceAuthorizationError);
  });

  it('keeps concurrent same-ID finalizer rows, getter inputs and decision grants detached in active mode', async () => {
    const hook = vi.fn(async (doc: { value: number; date: Date; bytes: Buffer }) => {
      const row = doc.value;
      doc.date.setTime(99);
      doc.bytes[0] = 99;
      await Promise.resolve();
      return { row };
    });
    const decision = vi.fn((_permissions, grants: { row: number }) => grants.row === 1);
    const getter = vi.fn((doc: { date: Date; bytes: Buffer }) => {
      const original = `${doc.date.getTime()}:${doc.bytes[0]}`;
      doc.date.setTime(100);
      doc.bytes[0] = 100;
      return original;
    });
    const f = call(enabled('List'), 'list', {
      binding: { request: {} as ModelRequest, runtime: new AccessRuntime(), model: {}, modelName: 'InitialCopy' },
      configuration: {
        catalog: { paths: ['_id', 'value', 'date', 'bytes', 'view'], virtualPaths: ['view'] },
        ...enabled('List'),
        permissionSchema: { value: decision, date: false, bytes: false, view: true },
        docPermissions: { list: hook },
        virtuals: { view: { get: getter, dependsOn: ['date', 'bytes'] } },
        alwaysSelectFields: ['value', 'date', 'bytes'],
        stripPermissionsField: true,
      },
    });
    const plan = planAuthorizedModelProjection({ authorization: f.authorization, binding: f.binding });
    const inputs = [1, 2].map((value) => ({ _id: 'same', value, date: new Date(value), bytes: Buffer.from([value]) }));
    const contexts: Array<{ output: object; context: ServiceOutputContext }> = [];
    const outputs = await finalizeModelOutputs({
      receivingModelName: f.binding.modelName,
      request: f.binding.request,
      snapshot: f.input.configuration,
      plan,
      ...access('list'),
      inputs,
      concurrencyLimit: 2,
      onFinalized: (output, context) => contexts.push({ output, context }),
    });
    expect(outputs).toEqual([
      { _id: 'same', value: 1, view: '1:1' },
      { _id: 'same', view: '2:2' },
    ]);
    expect(inputs).toEqual(
      [1, 2].map((value) => ({ _id: 'same', value, date: new Date(value), bytes: Buffer.from([value]) })),
    );
    expect(hook).toHaveBeenCalledTimes(2);
    expect(decision).toHaveBeenCalledTimes(2);
    expect(getter).toHaveBeenCalledTimes(2);
    expect(new Set(contexts.map(({ context }) => context.documentAuthorization)).size).toBe(2);
    for (const { output, context } of contexts) {
      expect(context.getDocumentAuthorization(output)).toBe(context.documentAuthorization);
      const other = contexts.find((entry) => entry.output !== output)!;
      expect(() =>
        assertDocumentAuthorization(context.documentAuthorization, {
          binding: f.binding,
          output: other.output,
          outputAccess: 'list',
          authorization: f.authorization,
        }),
      ).toThrow(ServiceAuthorizationError);
    }
  });

  it('does not give independent reentry or a replacement runtime the originating copy mode', async () => {
    const f = await owner(call(enabled('List')));
    const independent = call(enabled('List'), 'list', {
      listResponse: false,
      readResponse: false,
      applicability: 'output',
    });
    expect(skipsInitialOutputSnapshotCopy(independent.authorization)).toBe(false);
    expect(() =>
      call(enabled('List'), 'list', {
        binding: { ...f.binding, runtime: {} },
        parent: f.authorization,
        snapshotDerivation: { kind: 'embedded', parentBinding: f.binding },
      }),
    ).toThrow(ServiceAuthorizationError);
    const output = { value: 'published' };
    associateDocumentAuthorization(f.handle, f.binding, output);
    expect(() =>
      assertDocumentAuthorization(f.handle, { ...f.use(output), binding: { ...f.binding, runtime: {} } }),
    ).toThrow(ServiceAuthorizationError);
  });
});

describe('server configuration, capture and copy-specific warnings', () => {
  function fixture() {
    const runtime = new AccessRuntime(),
      warn = vi.fn();
    runtime.setGlobalOptions({ logger: { warn } });
    const model = mongoose.model(`InitialCopyOptions${++serial}`, new mongoose.Schema({ value: String }));
    runtime.registerModelInstance(model.modelName, model);
    return { runtime, warn, name: model.modelName, model };
  }

  it.each(unsafeInitialOutputCopyOptions)(
    '%s inherits, normalizes, warns on dormant/active transitions and rolls back',
    (key) => {
      const f = fixture(),
        check = key.replace(
          'InitialOutputSnapshotCopy',
          'OutputSnapshotChecks',
        ) as 'unsafeSkipListOutputSnapshotChecks';
      f.runtime.setModelOptions(f.name, {});
      for (const value of ['true', 1, {}, new Boolean(true), null, undefined]) {
        f.runtime.setModelOption(f.name, key, value as never);
        expect(f.runtime.getModelOption(f.name, key)).toBe(false);
      }
      expect(f.warn).not.toHaveBeenCalled();
      f.runtime.setDefaultModelOption(key, true);
      expect(f.warn).toHaveBeenCalledTimes(1);
      expect(f.warn.mock.calls[0][0]).toContain('dormant');
      f.runtime.setDefaultModelOption(key, true);
      f.runtime.setModelOptions(f.name, {});
      expect(f.warn).toHaveBeenCalledTimes(1);
      f.runtime.setDefaultModelOption(check, true);
      expect(f.warn.mock.calls.at(-1)![0]).toContain('initial output snapshot copying disabled');
      expect(f.warn.mock.calls.filter(([message]) => message.includes('copying disabled'))).toHaveLength(1);
      f.runtime.setModelOption(f.name, key, false);
      expect(f.runtime.getModelOption(f.name, key)).toBe(false);
      f.runtime.setDefaultModelOption(key, true);
      expect(f.runtime.getModelOption(f.name, key)).toBe(false);
      f.runtime.setModelOption(f.name, key, undefined);
      expect(f.runtime.getModelOption(f.name, key)).toBe(true);
      expect(f.warn.mock.calls.filter(([message]) => message.includes('copying disabled'))).toHaveLength(2);
    },
  );

  it('publishes paired inherited modes atomically, avoids failed-publication warnings and tolerates logger failure', () => {
    const f = fixture();
    f.runtime.setDefaultModelOptions(enabled('Read'));
    expect(f.warn).not.toHaveBeenCalled();
    f.runtime.setModelOptions(f.name, {});
    expect(f.warn.mock.calls.at(-1)![0]).toContain('copying disabled');
    const before = f.warn.mock.calls.length;
    expect(() =>
      f.runtime.setModelOptions(f.name, {
        ...enabled('List'),
        virtuals: { invalid: { dependsOn: ['missing'] } },
      } as never),
    ).toThrow();
    expect(f.warn).toHaveBeenCalledTimes(before);
    f.warn.mockImplementation(() => {
      throw new Error('logger failed');
    });
    expect(() => f.runtime.setModelOptions(f.name, enabled('List'))).not.toThrow();
    expect(f.runtime.getModelOption(f.name, 'unsafeSkipListInitialOutputSnapshotCopy')).toBe(true);
  });

  it('warns only after both options and all inherited models have been published', () => {
    const f = fixture();
    const other = mongoose.model(`InitialCopyOptions${++serial}`, new mongoose.Schema({ value: String }));
    f.runtime.registerModelInstance(other.modelName, other);
    f.runtime.setModelOptions(f.name, {});
    f.runtime.setModelOptions(other.modelName, {});
    const observed: boolean[] = [];
    f.warn.mockImplementation(() => {
      observed.push(
        [f.name, other.modelName].every((name) => {
          const options = f.runtime.getModelOptions(name);
          return (
            options.unsafeSkipReadInitialOutputSnapshotCopy === true &&
            options.unsafeSkipReadOutputSnapshotChecks === true
          );
        }),
      );
    });
    f.runtime.setDefaultModelOptions(enabled('Read'));
    expect(observed).toEqual([true, true, true, true]);
    expect(f.warn.mock.calls.some(([message]) => message.includes('dormant'))).toBe(false);
    const before = f.warn.mock.calls.length;
    expect(() =>
      f.runtime.setDefaultModelOptions({
        ...enabled('List'),
        virtuals: { invalid: { dependsOn: ['missing'] } },
      } as never),
    ).toThrow();
    expect(f.warn).toHaveBeenCalledTimes(before);
    expect(f.runtime.getModelOption(f.name, 'unsafeSkipListInitialOutputSnapshotCopy')).toBe(false);
  });

  it.each([false, true])('retains call/handle mode across await and rollback (initial=%s)', async (initial) => {
    const f = fixture();
    f.runtime.setModelOptions(f.name, enabled('Read', initial));
    const binding = { request: {} as ModelRequest, runtime: f.runtime, model: f.model, modelName: f.name };
    const capture = () =>
      call({}, 'read', { binding, configuration: captureModelAuthorizationConfiguration(f.runtime, f.name) });
    const state = capture();
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>((done) => {
      release = done;
    });
    const started = new Promise<void>((done) => {
      entered = done;
    });
    const stage = createDocumentAuthorizationStage(state.authorization, binding, { value: 'source' });
    const pending = resolveDocumentAuthorization(stage, async () => {
      entered();
      await wait;
      return {};
    });
    await started;
    f.runtime.setModelOption(f.name, 'unsafeSkipReadInitialOutputSnapshotCopy', !initial);
    release();
    const handle = await pending;
    expect(skipsInitialOutputSnapshotCopy(state.authorization)).toBe(initial);
    expect(skipsInitialOutputSnapshotCopy(capture().authorization)).toBe(!initial);
    const output = { value: 'public' },
      copies = vi.spyOn(snapshots, 'copyAuthorizationValue');
    associateDocumentAuthorization(handle, binding, output);
    expect(copies.mock.calls.filter(([value]) => value === output)).toHaveLength(initial ? 0 : 1);
    const transfer = { value: 'public' };
    transferDocumentAuthorization(handle, { binding, output, outputAccess: 'read' }, transfer);
    expect(copies.mock.calls.filter(([value]) => value === transfer)).toHaveLength(initial ? 0 : 1);
  });

  it.each(unsafeInitialOutputCopyOptions)('rejects %s as a control by presence but not as business data', (key) => {
    for (const object of [
      { [key]: undefined },
      Object.create({ [key]: false }),
      Object.defineProperty({}, key, { value: false }),
    ]) {
      expect(() => assertPublicAdmission({ options: object })).toThrow();
      expect(() => assertPublicDefaults({ publicListOptions: object })).toThrow();
    }
    for (const envelope of [
      { args: { include: [{ model: 'Other', options: { [key]: true } }] } },
      { args: { populate: [{ path: 'ref', options: { [key]: true } }] } },
      { args: { filter: { value: { $$sq: { model: 'Other', options: { [key]: true } } } } } },
    ])
      expect(() => assertPublicAdmission(envelope)).toThrow();
    expect(() => assertPublicAdmission({ args: { filter: { [key]: true }, payload: { [key]: true } } })).not.toThrow();
    expect(() => resolveServiceAuthorization({ ...call().input, authorization: { [key]: true } })).toThrow(
      ServiceAuthorizationError,
    );
  });
});
