import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { PERMISSIONS } from '../src/symbols';
import type { ModelHookContext, ModelRequest, ModelRouterOptions } from '../src/interfaces';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import { createServiceExecution, deriveServiceExecution, readServiceExecution } from '../src/acl/service-execution';
import { createRelatedExecution } from '../src/acl/related-execution';
import {
  resolveServiceAuthorization,
  ServiceAuthorizationError,
  type AuthorizationBinding,
  type ResolvedServiceAuthorization,
} from '../src/acl/service-authorization';
import {
  assertDocumentAuthorization,
  assertDocumentAuthorizationStage,
  associateDocumentAuthorization,
  createDocumentAuthorizationStage,
  createServiceOutputContext,
  getAssociatedDocumentAuthorization,
  readDocumentAuthorization,
  readDocumentAuthorizationAccess,
  resolveDocumentAuthorization,
  transferDocumentAuthorizationGraph,
} from '../src/acl/document-authorization';
import { authorizeEmbeddedOutputPlan } from '../src/acl/output-field-filter';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { unsafeSnapshotOptions } from '../src/acl/unsafe-snapshot-options';
import { assertPublicAdmission, PublicAdmissionError } from '../src/validation/public-admission';
import * as snapshots from '../src/acl/authorization-snapshot';

const newFlags = unsafeSnapshotOptions.slice(2);
const access = (operation: string, effective = operation) => ({
  operation,
  rowAccess: effective,
  outputAccess: effective,
  virtualAccess: effective,
  docPermissionsAccess: effective,
});
type State = { authorization: ResolvedServiceAuthorization; binding: AuthorizationBinding };
let serial = 0;

function fixture(options: ModelRouterOptions = {}, childOptions: ModelRouterOptions = {}) {
  const runtime = new AccessRuntime(),
    warn = vi.fn();
  runtime.setGlobalOptions({ logger: { warn } });
  const models = ['Root', 'Child'].map((kind) =>
    mongoose.model(
      `QuerySnapshots${kind}${++serial}`,
      new mongoose.Schema({ value: String, profile: { value: String } }),
    ),
  );
  for (const [index, model] of models.entries()) {
    runtime.registerModelInstance(model.modelName, model);
    runtime.setModelOptions(model.modelName, {
      permissionSchema: { value: true, profile: { sub: { value: true } } },
      ...(index ? childOptions : options),
    });
  }
  const request = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const [service, childService] = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    return models.map((model) => new Service(request, model.modelName));
  });
  const capture = (operation = 'read') => {
    const childConfig = captureModelAuthorizationConfiguration(runtime, models[1].modelName);
    const target = { path: 'second', modelName: models[1].modelName, configuration: childConfig };
    const execution = createServiceExecution(service, access(operation), undefined, 'service', [
      { ...target, path: 'related', relatedTargets: [target] },
    ]);
    return { execution, ...readServiceExecution(service, execution) };
  };
  const related = (parent: State, operation = 'read', path = 'related') => {
    const execution = createRelatedExecution(
      childService,
      access(operation),
      parent.authorization,
      parent.binding,
      path,
    );
    return { execution, ...readServiceExecution(childService, execution) };
  };
  return { runtime, warn, models, request, service, childService, capture, related };
}

function embedded(parent: State, segment = 'profile'): State {
  const plan = planAuthorizedModelProjection({ authorization: parent.authorization, binding: parent.binding });
  const scopePath = [...(parent.binding.scopePath ?? []), segment];
  const child = authorizeEmbeddedOutputPlan(plan, { ...plan, scopePath, responseScopePath: scopePath });
  return { authorization: child.authorization!, binding: child.authorizationBinding! };
}

async function owner(state: State) {
  const source = { value: 'source', date: new Date(1), bytes: Buffer.from([1]) };
  const stage = createDocumentAuthorizationStage(state.authorization, state.binding, source);
  const handle = await resolveDocumentAuthorization(stage, () => ({ bytes: Buffer.from([1]) }));
  return { ...state, stage, handle, source };
}

async function checkModes(state: State, sourceSkipped: boolean, outputSkipped: boolean) {
  const o = await owner(state);
  const matches = vi.spyOn(snapshots, 'matchesAuthorizationSnapshot');
  readDocumentAuthorizationAccess(o.handle, o.binding);
  expect(matches).toHaveBeenCalledTimes(sourceSkipped ? 0 : 2);
  matches.mockRestore();
  const output = { value: 'published', date: new Date(1), bytes: Buffer.from([1]), child: { value: 1 } };
  associateDocumentAuthorization(o.handle, o.binding, output);
  const use = {
    binding: o.binding,
    output,
    outputAccess: readDocumentAuthorizationAccess(o.handle, o.binding).outputAccess,
  };
  output.value = 'changed';
  output.date.setTime(2);
  output.bytes[0] = 2;
  if (outputSkipped) {
    expect(() => assertDocumentAuthorization(o.handle, use)).not.toThrow();
    expect(getAssociatedDocumentAuthorization(output, o.authorization)).toBe(o.handle);
    output.child = { value: 1 };
  }
  expect(() => assertDocumentAuthorization(o.handle, use)).toThrow(ServiceAuthorizationError);
  o.source.value = 'changed';
  if (sourceSkipped) expect(() => readDocumentAuthorizationAccess(o.handle, o.binding)).not.toThrow();
  else expect(() => readDocumentAuthorizationAccess(o.handle, o.binding)).toThrow(ServiceAuthorizationError);
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^QuerySnapshots/);
});

describe('orthogonal root-source, output-value and nested-source modes', () => {
  it.each(
    Array.from({ length: 64 }, (_, mask) => ({
      mask,
      options: Object.fromEntries(unsafeSnapshotOptions.map((key, index) => [key, !!(mask & (1 << index))])),
    })),
  )('keeps all six flags independent (mask=$mask)', async ({ options }) => {
    const f = fixture(options, Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, true])));
    const read = f.capture('read'),
      list = f.capture('list');
    const retry = readServiceExecution(
      f.service,
      deriveServiceExecution(f.service, read.execution, access('read', 'list')),
    );
    for (const [state, mode] of [
      [read, 'Read'],
      [list, 'List'],
      [retry, 'Read'],
    ] as const) {
      const output = options[`unsafeSkip${mode}OutputSnapshotChecks`];
      const nested = options[`unsafeSkip${mode}NestedDocumentSnapshotChecks`];
      await checkModes(state, options[`unsafeSkip${mode}DocumentSnapshotChecks`], output);
      const child = embedded(state);
      await checkModes(child, nested, output);
      await checkModes(embedded(child, 'inner'), nested, output);
      for (const operation of ['read', 'list']) {
        const target = f.related(state, operation);
        await checkModes(target, nested, output);
        await checkModes(embedded(target), nested, output);
        await checkModes(f.related(target, 'read', 'second'), nested, output);
        if (operation === 'read') {
          await checkModes(
            readServiceExecution(
              f.childService,
              deriveServiceExecution(f.childService, target.execution, access('read', 'list')),
            ),
            nested,
            output,
          );
        }
      }
    }
  });

  it.each(['read', 'list'])('does not let child-model flags relax an unopted %s origin', async (operation) => {
    const f = fixture({}, Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, true])));
    await checkModes(f.related(f.capture(operation)), false, false);
  });

  it.each(['create', 'update', 'upsert', 'new', 'subRead', 'subList'])(
    'keeps %s, derived reads and descendants strict',
    async (operation) => {
      const f = fixture(Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, true])));
      const root = f.capture(operation);
      const derived = readServiceExecution(
        f.service,
        deriveServiceExecution(f.service, root.execution, access('read')),
      );
      for (const state of [root, derived, embedded(root), f.related(root)]) await checkModes(state, false, false);
    },
  );

  it('requires explicit traversal, canonical query access and authenticated parent/target/scope', async () => {
    const f = fixture(Object.fromEntries(newFlags.map((key) => [key, true]))),
      root = f.capture();
    const input = {
      binding: root.binding,
      access: access('read'),
      configuration: captureModelAuthorizationConfiguration(f.runtime, f.models[0].modelName),
      requestPermissions: new Permission({}),
      parent: root.authorization,
    };
    for (const change of [
      {},
      { snapshotDerivation: { kind: 'related' as const, parentBinding: root.binding, path: 'missing' } },
      { snapshotDerivation: { kind: 'related' as const, parentBinding: root.binding, path: 'related' } },
      { snapshotDerivation: { kind: 'embedded' as const, parentBinding: root.binding } },
      {
        access: access('update', 'read'),
        binding: { ...root.binding, scopePath: ['profile'] },
        snapshotDerivation: { kind: 'embedded' as const, parentBinding: root.binding },
      },
      {
        access: { ...access('read'), virtualAccess: 'update' },
        binding: { ...root.binding, scopePath: ['profile'] },
        snapshotDerivation: { kind: 'embedded' as const, parentBinding: root.binding },
      },
    ]) {
      const value = { ...input, ...change };
      await checkModes({ binding: value.binding, authorization: resolveServiceAuthorization(value) }, false, false);
    }
    expect(() =>
      resolveServiceAuthorization({
        ...input,
        snapshotDerivation: { kind: 'related', parentBinding: { ...root.binding, runtime: {} }, path: 'related' },
      }),
    ).toThrow(ServiceAuthorizationError);
    const foreign = fixture();
    expect(() =>
      createRelatedExecution(foreign.service, access('read'), root.authorization, root.binding, 'related'),
    ).toThrow(ServiceAuthorizationError);
    const helper = resolveServiceAuthorization({ ...input, parent: undefined, applicability: 'output' });
    await checkModes({ authorization: helper, binding: root.binding }, false, false);
  });

  it.each(['read', 'list'])(
    'retains exact output owners/graph/context/transfers with opted-out %s values',
    async (operation) => {
      const f = fixture(Object.fromEntries(newFlags.map((key) => [key, true]))),
        state = f.capture(operation);
      const child = await owner(embedded(state)),
        root = await owner(state);
      const childOutput = { value: 'child', date: new Date(1) };
      associateDocumentAuthorization(child.handle, child.binding, childOutput);
      const output = { value: 'root', profile: childOutput };
      associateDocumentAuthorization(root.handle, root.binding, output);
      const use = { binding: root.binding, output, outputAccess: operation };
      const context = createServiceOutputContext({} as ModelHookContext, root.handle, use);
      output.value = 'changed';
      childOutput.date.setTime(9);
      expect(context.getDocumentAuthorization(childOutput)).toBe(child.handle);
      const copy = { value: output.value, profile: { value: childOutput.value, date: new Date(9) } };
      transferDocumentAuthorizationGraph(output, copy);
      assertDocumentAuthorization(root.handle, { ...use, output: copy });
      expect(getAssociatedDocumentAuthorization(copy.profile, root.authorization)).toBe(child.handle);
      expect(() => assertDocumentAuthorization(root.handle, { ...use, output: { ...output } })).toThrow(
        ServiceAuthorizationError,
      );
      expect(() =>
        assertDocumentAuthorization(root.handle, { ...use, binding: { ...root.binding, request: {} } as never }),
      ).toThrow(ServiceAuthorizationError);
      expect(() => assertDocumentAuthorization({} as never, use)).toThrow(ServiceAuthorizationError);
      const other = await owner(state);
      expect(() => associateDocumentAuthorization(other.handle, other.binding, output)).toThrow(
        ServiceAuthorizationError,
      );
      expect(() =>
        assertDocumentAuthorizationStage(root.stage, root.authorization, root.binding, { ...root.source }),
      ).toThrow(ServiceAuthorizationError);
      output.profile = { value: 'child', date: new Date(9) };
      expect(context.getDocumentAuthorization(childOutput)).toBeUndefined();
      expect(() => associateDocumentAuthorization(root.handle, root.binding, output)).toThrow(
        ServiceAuthorizationError,
      );
      expect(() => transferDocumentAuthorizationGraph(output, copy)).toThrow(ServiceAuthorizationError);
    },
  );

  it('keeps initial structural validation and detached hook/grant copies under every opt-out', async () => {
    const f = fixture(Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, true]))),
      state = embedded(f.capture());
    const source = { value: 'source', date: new Date(1) };
    const stage = createDocumentAuthorizationStage(state.authorization, state.binding, source);
    const handle = await resolveDocumentAuthorization(stage, (doc) => {
      (doc.date as Date).setTime(9);
      return { date: new Date(2) };
    });
    expect(source.date.getTime()).toBe(1);
    const grants = readDocumentAuthorization(handle, state.binding).grants;
    (grants.date as Date).setTime(99);
    expect((readDocumentAuthorization(handle, state.binding).grants.date as Date).getTime()).toBe(2);
    for (const invalid of [
      { value: () => true },
      { value: Array(20001) },
      Object.defineProperty({}, 'value', { get: () => true }),
    ]) {
      expect(() => createDocumentAuthorizationStage(state.authorization, state.binding, invalid)).toThrow(
        ServiceAuthorizationError,
      );
      expect(() => associateDocumentAuthorization(handle, state.binding, invalid)).toThrow(ServiceAuthorizationError);
    }
  });
});

describe('server-only configuration and captured transitions', () => {
  it.each(newFlags)('%s defaults off, normalizes literal true only, and warns per transition', (key) => {
    const f = fixture();
    expect(f.runtime.getModelOption(f.models[0].modelName, key)).toBe(false);
    for (const value of ['true', 1, {}, new Boolean(true), undefined, false]) {
      f.runtime.setModelOption(f.models[0].modelName, key, value as never);
      expect(f.runtime.getModelOption(f.models[0].modelName, key)).toBe(false);
    }
    expect(f.warn).not.toHaveBeenCalled();
    f.runtime.setModelOption(f.models[0].modelName, key, true);
    f.runtime.setModelOption(f.models[0].modelName, key, true);
    expect(f.warn).toHaveBeenCalledTimes(1);
    expect(f.warn.mock.calls[0][0]).toContain(`Restore ${key}=false`);
    f.runtime.setModelOption(f.models[0].modelName, key, false);
    f.runtime.setModelOption(f.models[0].modelName, key, true);
    expect(f.warn).toHaveBeenCalledTimes(2);
    for (const other of unsafeSnapshotOptions.filter((flag) => flag !== key))
      expect(f.runtime.getModelOption(f.models[0].modelName, other)).toBe(false);
  });

  it.each(newFlags)(
    '%s supports starting defaults with explicit false overrides and preserves existing models',
    (key) => {
      const f = fixture();
      f.runtime.setDefaultModelOption(key, true);
      for (const explicit of [undefined, false]) {
        const model = mongoose.model(`QuerySnapshotsDefault${++serial}`, new mongoose.Schema({ value: String }));
        f.runtime.registerModelInstance(model.modelName, model);
        f.runtime.setModelOptions(model.modelName, explicit === undefined ? {} : { [key]: explicit });
        expect(f.runtime.getModelOption(model.modelName, key)).toBe(explicit ?? true);
      }
      expect(f.runtime.getModelOption(f.models[0].modelName, key)).toBe(false);
    },
  );

  it.each(['read', 'list'])(
    'captures %s mode before awaits, later descendants, handles and retries',
    async (operation) => {
      for (const initial of [false, true]) {
        const f = fixture(Object.fromEntries(newFlags.map((key) => [key, initial]))),
          state = f.capture(operation);
        const child = embedded(state),
          source = { value: 'source' };
        let release!: () => void, entered!: () => void;
        const waiting = new Promise<void>((done) => {
            release = done;
          }),
          started = new Promise<void>((done) => {
            entered = done;
          });
        const pending = resolveDocumentAuthorization(
          createDocumentAuthorizationStage(child.authorization, child.binding, source),
          async () => {
            entered();
            await waiting;
            return {};
          },
        );
        await started;
        f.runtime.setModelOptions(f.models[0].modelName, Object.fromEntries(newFlags.map((key) => [key, !initial])));
        source.value = 'changed';
        release();
        if (initial) await expect(pending).resolves.toBeDefined();
        else await expect(pending).rejects.toBeInstanceOf(ServiceAuthorizationError);
        await checkModes(f.related(state), initial, initial);
        await checkModes(embedded(state), initial, initial);
        await checkModes(state, false, initial);
        if (operation === 'read') {
          const retry = readServiceExecution(
            f.service,
            deriveServiceExecution(f.service, state.execution, access('read', 'list')),
          );
          await checkModes(retry, false, initial);
          await checkModes(f.related(retry), initial, initial);
        }
        await checkModes(f.related(f.capture(operation)), !initial, !initial);
      }
    },
  );

  it.each(newFlags)('rejects %s in all public/control/default slots but not business data', async (key) => {
    const f = fixture();
    for (const value of [undefined, false, true]) {
      for (const input of [
        { [key]: value },
        { options: { [key]: value } },
        { include: [{ model: 'x', options: { [key]: value } }] },
        { populate: [{ path: 'ref', [key]: value }] },
        { data: { nested: { $$sq: { options: { [key]: value } } } } },
      ]) {
        expect(() => assertPublicAdmission(input)).toThrow(PublicAdmissionError);
      }
      expect(() => assertPublicAdmission(Object.create({ [key]: value }))).toThrow(PublicAdmissionError);
      expect(() =>
        assertPublicAdmission(
          Object.defineProperty({}, key, {
            get: () => {
              throw new Error('must not read');
            },
          }),
        ),
      ).toThrow(PublicAdmissionError);
    }
    expect(() =>
      assertPublicAdmission({ data: { [key]: true }, filter: { [key]: true }, match: { [key]: true } }),
    ).not.toThrow();
    for (const bucket of [
      'findOptions',
      'findOneOptions',
      'findByIdOptions',
      'publicListOptions',
      'publicReadOptions',
    ]) {
      expect(() => f.runtime.setModelOption(f.models[0].modelName, 'defaults', { [bucket]: { [key]: true } })).toThrow(
        PublicAdmissionError,
      );
      f.service.defaults = { [bucket]: { [key]: true } };
      expect(await f.service.findOne({})).toMatchObject({ success: false, code: 'bad_request' });
      f.service.defaults = {};
    }
    for (const slot of ['args', 'options', 'authorization']) {
      for (const method of ['find', 'findOne'] as const) {
        const result = await f.service[method](
          {},
          slot === 'args' ? ({ [key]: true } as never) : {},
          slot === 'options'
            ? ({ [key]: true } as never)
            : slot === 'authorization'
              ? ({ authorization: { [key]: true } } as never)
              : {},
        );
        expect(result).toMatchObject({ success: false, code: 'bad_request' });
      }
    }
    f.runtime.setGlobalOptions({ [key]: true } as never);
    await checkModes(f.capture(key.includes('List') ? 'list' : 'read'), false, false);
  });
});
