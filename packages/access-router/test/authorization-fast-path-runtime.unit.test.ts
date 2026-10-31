import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { Service } from '../src/services/service';
import { PublicService } from '../src/services/public-service';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest, ServiceOutputContext } from '../src/interfaces';
import * as documents from '../src/acl/document-authorization';
import * as calls from '../src/acl/service-authorization';
import * as snapshots from '../src/acl/authorization-snapshot';
import * as helpers from '../src/helpers/document';
import { unsafeSnapshotOptions } from '../src/acl/unsafe-snapshot-options';
import { evaluateAuthorizedOutputField } from '../src/acl/output-field-filter';
import { deferred, HookProbe } from './hook-admission-fixture';

const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const originalOn = Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, true]));
const active = { ...originalOn, unsafeUseListAuthorizationFastPath: true, unsafeUseReadAuthorizationFastPath: true };
const fieldNames = Array.from({ length: 24 }, (_, index) => `field${index}`);
let serial = 0;

function fixture(options: Record<string, unknown> = {}, flags: Record<string, unknown> = active) {
  const model = mongoose.model(
    `FastRuntime${++serial}`,
    new mongoose.Schema(
      {
        name: String,
        hidden: mongoose.Schema.Types.Mixed,
        owner: Boolean,
        rootStageMarker: Date,
        value: mongoose.Schema.Types.Mixed,
        meta: {
          safe: String,
          permissions: mongoose.Schema.Types.Mixed,
          child: { safe: String, permissions: mongoose.Schema.Types.Mixed },
        },
        ...Object.fromEntries(fieldNames.map((name) => [name, String])),
        children: [new mongoose.Schema({ label: String, hidden: String, childStageMarker: Date }, { _id: false })],
      },
      { versionKey: false },
    ),
  );
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({ logger: { warn: vi.fn() }, requestComplexity: { maxHookConcurrency: 1 } });
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    ...flags,
    operationAccess: { list: true, read: true },
    permissionSchema: { name: true, value: true, hidden: false },
    stripPermissionsField: true,
    hydration: { find: 'lean', findOne: 'lean', publicList: 'lean', publicRead: 'lean' },
    ...options,
  } as never);
  const request = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const adapter = {
    mongooseModel: model,
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
  };
  const [service, pub] = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    return [
      new (class extends Service {
        protected createModelAdapter() {
          return adapter;
        }
      })(request, model.modelName),
      new (class extends PublicService {
        protected createModelAdapter() {
          return adapter;
        }
      })(request, model.modelName),
    ];
  });
  const binding = { request, runtime, model, modelName: model.modelName, scopePath: [] as string[] };
  return { model, runtime, request, adapter, service, pub, binding };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^FastRuntime/);
});

function instrument() {
  const work = {
    stageCopies: 0,
    grantCopies: 0,
    contextCopies: 0,
    sourceNormalizations: 0,
    graphTransfers: 0,
    identityWalks: 0,
    identityAdmissions: 0,
    resolutions: 0,
    configurationCopies: 0,
    contexts: 0,
    scopeDerivations: 0,
  };
  const has = (value: unknown, key: string) => !!value && typeof value === 'object' && Object.hasOwn(value, key);
  const copy = snapshots.copyAuthorizationValue;
  vi.spyOn(snapshots, 'copyAuthorizationValue').mockImplementation((value, mode) => {
    if (mode === 'document' && (has(value, 'rootStageMarker') || has(value, 'childStageMarker'))) work.stageCopies++;
    else if (has(value, 'grantMark')) work.grantCopies++;
    else if (mode === true) work.configurationCopies++;
    return copy(value, mode);
  });
  const deep = helpers.deepIsolateValue;
  vi.spyOn(helpers, 'deepIsolateValue').mockImplementation((value, seen, flatten) => {
    if (has(value, 'originalDocumentSnapshot')) work.contextCopies++;
    return deep(value, seen, flatten);
  });
  const intercept = (module: object, symbol: string, key: keyof typeof work) => {
    const original = (module as Record<string, Function>)[symbol];
    vi.spyOn(module as never, symbol as never).mockImplementation((...args: unknown[]) => {
      work[key]++;
      return original(...args);
    });
  };
  intercept(helpers, 'isolateDocForOutput', 'sourceNormalizations');
  intercept(documents, 'transferDocumentAuthorizationGraph', 'graphTransfers');
  intercept(documents, 'createServiceOutputContext', 'contexts');
  intercept(snapshots, 'outputIdentities', 'identityWalks');
  intercept(snapshots, 'tryOutputIdentitiesWithoutSnapshot', 'identityAdmissions');
  intercept(calls, 'resolveServiceAuthorization', 'resolutions');
  intercept(calls, 'deriveTrustedQueryAuthorization', 'scopeDerivations');
  return work;
}

describe('genuine trusted query work, not publication fusion', () => {
  it.each([false, true])(
    'omits stage/grant/context/source/graph passes for six dynamic rows, embedded=%s',
    async (embedded) => {
      const hook = vi.fn((doc) => ({ grantMark: true, owner: doc.owner, mutable: new Date(1) }));
      const rule = vi.fn(function (this: ModelRequest, _permissions, grants) {
        expect(this).toBe(f.request);
        return grants.owner;
      });
      const f = fixture({
        permissionSchema: {
          ...Object.fromEntries(fieldNames.map((name) => [name, rule])),
          name: true,
          hidden: false,
          ...(embedded ? { children: { list: true, read: true, sub: { label: 'doc:owner', hidden: false } } } : {}),
        },
        ...(embedded ? { virtuals: { children: { sub: {} } } } : {}),
        alwaysSelectFields: ['owner', 'rootStageMarker', 'children.childStageMarker'],
        modelPermissionPrefix: 'doc:',
        docPermissions: { list: hook },
      });
      const rows = Array.from({ length: 6 }, (_, index) => ({
        _id: 'same-id',
        name: `row:${index}`,
        hidden: 'never',
        owner: true,
        rootStageMarker: new Date(1),
        ...Object.fromEntries(fieldNames.map((field) => [field, `${index}:${field}`])),
        ...(embedded
          ? {
              children: [0, 1].map((child) => ({
                label: `child:${child}`,
                hidden: 'never',
                childStageMarker: new Date(2),
              })),
            }
          : {}),
      }));
      f.adapter.find.mockResolvedValue(rows);
      const work = instrument();
      const result = await f.pub._list(
        {},
        { select: ['name', ...fieldNames, 'hidden', ...(embedded ? ['children'] : []), '-_id'], limit: 6 },
        quiet,
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      const contexts = (result as unknown as { contexts: ServiceOutputContext[] }).contexts;
      expect(new Set(contexts.map((ctx) => ctx.documentAuthorization)).size).toBe(6);
      for (const [index, row] of (result.data as Record<string, unknown>[]).entries()) {
        expect(row.name).toBe(`row:${index}`);
        expect(row).not.toHaveProperty('hidden');
        expect(row).not.toHaveProperty('rootStageMarker');
        if (embedded) expect(row.children).toEqual([{ label: 'child:0' }, { label: 'child:1' }]);
        expect(documents.readDocumentAuthorization(contexts[index].documentAuthorization, f.binding).grants).toBe(
          hook.mock.results[index].value,
        );
        expect(hook.mock.calls[index][0]).toBe(rows[index]);
      }
      expect(hook).toHaveBeenCalledTimes(6);
      expect(rule).toHaveBeenCalledTimes(144);
      expect(f.adapter.find).toHaveBeenCalledTimes(1);
      expect(work).toMatchObject({
        stageCopies: 0,
        grantCopies: 0,
        contextCopies: 0,
        sourceNormalizations: 0,
        graphTransfers: 0,
        identityWalks: 0,
        identityAdmissions: 0,
        resolutions: 1,
        contexts: 6,
        scopeDerivations: embedded ? 1 : 0,
      });
      console.log(
        `FP03_WORK ${JSON.stringify({ embedded, rows: 6, fields: 24, ...work, hooks: hook.mock.calls.length, rules: rule.mock.calls.length })}`,
      );
    },
  );

  it.each(['list', 'read'] as const)(
    'only the matching active %s flag removes copies; opposite/off/dormant retain them',
    async (origin) => {
      for (const mode of ['off', 'dormant', 'active'] as const) {
        const key = origin === 'list' ? 'unsafeUseListAuthorizationFastPath' : 'unsafeUseReadAuthorizationFastPath';
        const missing =
          origin === 'list'
            ? 'unsafeSkipListNestedDocumentSnapshotChecks'
            : 'unsafeSkipReadNestedDocumentSnapshotChecks';
        const f = fixture(
          { alwaysSelectFields: ['rootStageMarker'], docPermissions: { [origin]: () => ({ grantMark: true }) } },
          { ...active, [key]: mode !== 'off', [missing]: mode !== 'dormant' },
        );
        const input = { name: 'value', rootStageMarker: new Date(1) };
        f.adapter.find.mockResolvedValue([input]);
        f.adapter.findOne.mockResolvedValue(input);
        const work = instrument();
        const result =
          origin === 'list'
            ? await f.service.find({}, { select: ['name', '-_id'] }, quiet)
            : await f.service.findOne({}, { select: ['name', '-_id'] }, quiet);
        expect(result).toMatchObject({ success: true });
        if (mode === 'active')
          expect(work).toMatchObject({
            stageCopies: 0,
            grantCopies: 0,
            contextCopies: 0,
            sourceNormalizations: 0,
            graphTransfers: 0,
            identityWalks: 0,
          });
        else {
          expect(work.stageCopies).toBeGreaterThan(0);
          expect(work.grantCopies).toBeGreaterThan(0);
          expect(work.sourceNormalizations).toBeGreaterThan(0);
          expect(work.graphTransfers).toBeGreaterThan(0);
        }
        vi.restoreAllMocks();
      }
    },
  );
});

describe('explicit intentional risks, with current all-eight ON comparisons', () => {
  it.each(['off', 'dormant', 'active'] as const)(
    'retains ordered async field rules and only shares mutable grants in %s mode',
    async (mode) => {
      const grants = { when: new Date(0) },
        order: string[] = [];
      const first = vi.fn(async (_permissions, supplied) => {
        order.push('first:start');
        await Promise.resolve();
        supplied.when.setTime(1);
        order.push('first:end');
        return true;
      });
      const second = vi.fn((_permissions, supplied) => {
        order.push('second');
        return supplied.when.getTime() === 1;
      });
      const f = fixture(
        { permissionSchema: { field0: first, field1: second }, docPermissions: { list: () => grants } },
        {
          ...active,
          unsafeUseListAuthorizationFastPath: mode !== 'off',
          unsafeSkipListNestedDocumentSnapshotChecks: mode !== 'dormant',
        },
      );
      f.adapter.find.mockResolvedValue([{ field0: 'first', field1: 'second' }]);
      const result = await f.service.find({}, { select: ['field0', 'field1', '-_id'] }, quiet);
      expect(result).toMatchObject({
        success: true,
        data: [mode === 'active' ? { field0: 'first', field1: 'second' } : { field0: 'first' }],
      });
      expect(order).toEqual(['first:start', 'first:end', 'second']);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(grants.when.getTime()).toBe(mode === 'active' ? 1 : 0);
    },
  );

  it.each([false, true])(
    'borrowed source/grant mutations change a later denial to allowance; active=%s',
    async (enabled) => {
      const grants = { mutable: new Date(0) },
        seen: unknown[] = [];
      const mutate = vi.fn((_p, supplied) => {
        supplied.mutable.setTime(1);
        return true;
      });
      const later = vi.fn((_p, supplied) => supplied.mutable.getTime() === 1);
      const hook = vi.fn((doc) => {
        seen.push(doc);
        doc.rootStageMarker.setTime(2);
        return grants;
      });
      const f = fixture(
        {
          permissionSchema: { field0: mutate, field1: later },
          alwaysSelectFields: ['rootStageMarker'],
          docPermissions: { list: hook },
        },
        enabled ? active : originalOn,
      );
      const source = { field0: 'first', field1: 'later', rootStageMarker: new Date(1) };
      f.adapter.find.mockResolvedValue([source]);
      const result = await f.service.find({}, { select: ['field0', 'field1', '-_id'] }, quiet);
      expect(result).toMatchObject({
        success: true,
        data: [enabled ? { field0: 'first', field1: 'later' } : { field0: 'first' }],
      });
      expect(mutate).toHaveBeenCalledTimes(1);
      expect(later).toHaveBeenCalledTimes(1);
      expect(hook).toHaveBeenCalledTimes(1);
      expect(grants.mutable.getTime()).toBe(enabled ? 1 : 0);
      expect(source.rootStageMarker.getTime()).toBe(enabled ? 2 : 1);
      expect(seen[0] === source).toBe(enabled);
    },
  );

  it.each(['Date', 'BSON'] as const)(
    'omitted fetch-only %s observations can change denial to allowance without skipping the hook',
    async (native) => {
      for (const enabled of [false, true]) {
        let observations = 0,
          hookObservations = -1;
        const leaf =
          native === 'Date'
            ? Object.assign(new Date(123), {
                getTime() {
                  observations++;
                  return 123;
                },
              })
            : Object.assign(new mongoose.mongo.BSON.ObjectId(), {
                toBSON() {
                  observations++;
                  return 'observed';
                },
              });
        const hook = vi.fn(() => {
          hookObservations = observations;
          return { owner: observations === 0 };
        });
        const f = fixture(
          {
            permissionSchema: { name: 'doc:owner' },
            modelPermissionPrefix: 'doc:',
            docPermissions: { list: hook },
            alwaysSelectFields: ['hidden'],
          },
          enabled ? active : originalOn,
        );
        f.adapter.find.mockResolvedValue([{ name: 'sensitive', hidden: leaf }]);
        const result = await f.service.find({}, { select: ['name', '-_id'] }, quiet);
        expect(result).toMatchObject({ success: true, data: [enabled ? { name: 'sensitive' } : {}] });
        expect(hook).toHaveBeenCalledTimes(1);
        if (enabled) expect(hookObservations).toBe(0);
        else expect(hookObservations).toBeGreaterThan(0);
      }
    },
  );

  it.each([false, true])(
    'trusted root authority survives descendant replacement, but never wrong roots; active=%s',
    async (enabled) => {
      const f = fixture(
        {
          permissionSchema: { name: true, children: { list: true, read: true, sub: { label: true, hidden: false } } },
          virtuals: { children: { sub: {} } },
        },
        enabled ? active : originalOn,
      );
      f.adapter.find.mockResolvedValue(
        [0, 1].map((index) => ({
          _id: 'same',
          name: `row:${index}`,
          children: [{ label: 'original', hidden: 'never' }],
        })),
      );
      const result = await f.service.find({}, { select: ['name', 'children', '-_id'] }, quiet);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      const [row, other] = result.data as any[],
        context = result.contexts[0];
      const original = row.children[0],
        handle = context.documentAuthorization;
      expect(context.getDocumentAuthorization(original)).toBeDefined();
      expect(context.getDocumentAuthorization(other.children[0])).toBeUndefined();
      await expect(f.service.pickAllowedFields(other, 'list', { documentAuthorization: handle })).rejects.toThrow();
      await expect(
        f.service.pickAllowedFields({ ...row }, 'list', { documentAuthorization: handle }),
      ).rejects.toThrow();
      row.children[0] = { label: 'replacement', hidden: 'never' };
      expect(context.getDocumentAuthorization(row.children[0])).toBeUndefined();
      if (enabled) {
        expect(context.getDocumentAuthorization(original)).toBeDefined();
        expect(await f.service.pickAllowedFields(row, 'list', { documentAuthorization: handle })).toEqual({
          name: 'row:0',
          children: [{ label: 'replacement' }],
        });
      } else {
        expect(context.getDocumentAuthorization(original)).toBeUndefined();
        await expect(f.service.pickAllowedFields(row, 'list', { documentAuthorization: handle })).rejects.toThrow();
      }
    },
  );
});

describe('cheap authority and independent decision owners', () => {
  it('keeps concurrent same-ID rows/calls independent and actual hook work bounded', async () => {
    const probe = new HookProbe(),
      hold = deferred(),
      entered = deferred();
    probe.barrier = hold.promise;
    probe.onStart = () => {
      if (probe.calls.length === 2) entered.resolve();
    };
    const rule = vi.fn(async function (this: ModelRequest, _p, grants) {
      await Promise.resolve();
      expect(this).toBe(f.request);
      return grants.owner;
    });
    const hook = vi.fn((doc) => probe.run(doc.name, () => ({ owner: doc.owner })));
    const f = fixture({
      permissionSchema: { name: rule },
      alwaysSelectFields: ['owner'],
      docPermissions: { list: hook },
    });
    f.runtime.setGlobalOption('requestComplexity.maxHookConcurrency', 2);
    // Updating configuration does not replace this request's already-captured limit-one gate.
    const rows = [
      { _id: 'same', name: 'allowed', owner: true },
      { _id: 'same', name: 'denied', owner: false },
    ];
    f.adapter.find.mockResolvedValue(rows);
    const a = f.service.find({}, { select: ['name', '-_id'] }, quiet),
      b = f.pub._list({}, { select: ['name', '-_id'] }, quiet);
    // This fixture's gate was captured at limit one during receiver construction.
    hold.resolve();
    await Promise.all([a, b]);
    const results = await Promise.all([a, b]);
    for (const result of results) expect(result).toMatchObject({ success: true, data: [{ name: 'allowed' }, {}] });
    expect(hook).toHaveBeenCalledTimes(4);
    expect(rule).toHaveBeenCalledTimes(4);
    expect(probe.peak).toBe(1);
    expect(probe.active).toBe(0);
    const handles = results.flatMap((result) =>
      result.success ? result.contexts.map((ctx) => ctx.documentAuthorization) : [],
    );
    expect(new Set(handles).size).toBe(4);
    expect(
      calls.getAuthorizationProvenance(documents.readDocumentAuthorization(handles[0], f.binding).authorization),
    ).not.toBe(
      calls.getAuthorizationProvenance(documents.readDocumentAuthorization(handles[2], f.binding).authorization),
    );
  });

  it('rechecks cheap caller bindings at actual async resume and shares its failed memo, without graph passes', async () => {
    const f = fixture(),
      executionApi = await import('../src/acl/service-execution');
    const execution = executionApi.createServiceExecution(f.service, {
      operation: 'list',
      rowAccess: 'list',
      virtualAccess: 'list',
      outputAccess: 'list',
      docPermissionsAccess: 'list',
    });
    const call = executionApi.readServiceExecution(f.service, execution).authorization;
    const handle = await documents.resolveDocumentAuthorization(
      documents.createDocumentAuthorizationStage(call, f.binding, {}),
      () => ({}),
    );
    const binding = { ...f.binding },
      wait = deferred(),
      started = deferred();
    const compare = vi.spyOn(snapshots, 'matchesAuthorizationSnapshot'),
      graph = vi.spyOn(snapshots, 'outputIdentities');
    const decision = documents.memoizeDocumentFieldDecision(handle, binding, 'resume', async () => {
      started.resolve();
      await wait.promise;
      return true;
    });
    await started.promise;
    binding.model = {} as typeof binding.model;
    wait.resolve();
    await expect(decision).rejects.toBeInstanceOf(snapshots.ServiceAuthorizationError);
    expect(documents.memoizeDocumentFieldDecision(handle, f.binding, 'resume', () => true)).toBe(decision);
    expect(compare).not.toHaveBeenCalled();
    expect(graph).not.toHaveBeenCalled();
  });
  it('rejects all ten wrong tuple/root/stage/forgery cases with zero graph or snapshot observations', async () => {
    const f = fixture();
    f.adapter.find.mockResolvedValue([
      { _id: 'same', name: 'one' },
      { _id: 'same', name: 'two' },
    ]);
    const result = await f.service.find({}, { select: ['name', '-_id'] }, quiet);
    if (!result.success) throw new Error(result.code);
    const handle = result.contexts[0].documentAuthorization,
      state = documents.readDocumentAuthorizationAccess(handle, f.binding);
    const other = documents.readDocumentAuthorizationAccess(result.contexts[1].documentAuthorization, f.binding);
    const use = {
      binding: f.binding,
      output: result.data[0] as object,
      outputAccess: 'list',
      authorization: state.authorization,
      stage: state.stage,
    };
    const identities = vi.spyOn(snapshots, 'outputIdentities'),
      matches = vi.spyOn(snapshots, 'matchesAuthorizationSnapshot');
    for (const changed of [
      { ...use, binding: { ...f.binding, request: {} } },
      { ...use, binding: { ...f.binding, runtime: {} } },
      { ...use, binding: { ...f.binding, model: {} } },
      { ...use, binding: { ...f.binding, modelName: 'Other' } },
      { ...use, binding: { ...f.binding, scopePath: ['children'] } },
      { ...use, outputAccess: 'read' },
      { ...use, stage: other.stage },
      { ...use, output: result.data[1] },
      { ...use, output: { ...(result.data[0] as object) } },
    ])
      expect(() => documents.assertDocumentAuthorization(handle, changed as never)).toThrow(
        snapshots.ServiceAuthorizationError,
      );
    expect(() => documents.assertDocumentAuthorization(Object.freeze(Object.create(null)), use)).toThrow(
      snapshots.ServiceAuthorizationError,
    );
    expect(identities).not.toHaveBeenCalled();
    expect(matches).not.toHaveBeenCalled();
    expect(Reflect.ownKeys(handle)).toEqual([]);
    expect(Object.isFrozen(handle)).toBe(true);
  });

  it('keeps stale allow/deny memo and resolves a different row child with THIS parent grants, not its handle', async () => {
    const grants = [{ owner: true }, { owner: false }];
    let next = 0;
    const rule = vi.fn((_p, grant) => grant.owner);
    const f = fixture({
      permissionSchema: { name: rule, children: { list: true, read: true, sub: { label: rule } } },
      virtuals: { children: { sub: {} } },
      docPermissions: { list: () => grants[next++] },
    });
    f.adapter.find.mockResolvedValue(
      [0, 1].map((index) => ({ _id: 'same', name: `${index}`, children: [{ label: `${index}` }] })),
    );
    const result = await f.service.find({}, { select: ['name', 'children', '-_id'] }, quiet);
    if (!result.success) throw new Error(result.code);
    const [first, second] = result.data as any[],
      [a, b] = result.contexts;
    const issued = first.children[0],
      moved = second.children[0];
    expect(a.getDocumentAuthorization(moved)).toBeUndefined();
    expect(b.getDocumentAuthorization(moved)).toBeDefined();
    moved.label = 'moved';
    first.children[0] = moved;
    const picked = await f.service.pickAllowedFields(first, 'list', { documentAuthorization: a.documentAuthorization });
    expect(picked).toEqual({ name: '0', children: [{ label: 'moved' }] });
    expect(a.getDocumentAuthorization(issued)).toBeDefined();
    expect(a.getDocumentAuthorization(moved)).toBeUndefined();
    grants[0].owner = false;
    first.name = 'current';
    second.name = 'added';
    expect(
      await f.service.pickAllowedFields(first, 'list', { documentAuthorization: a.documentAuthorization }),
    ).toEqual({ name: 'current', children: [{}] });
    expect(
      await f.service.pickAllowedFields(second, 'list', { documentAuthorization: b.documentAuthorization }),
    ).toEqual({ children: [{}] });
    const before = next;
    expect(await f.service.pickAllowedFields(first, 'list')).toEqual({ children: [{}] });
    expect(next).toBe(before); // Fresh raw helper is strict/known-trimmed and never reruns a document hook.
  });

  it('shares actual pending decisions/failures per stage, never between same-ID stages or requests', async () => {
    const f = fixture({ permissionSchema: { name: (_p, g) => g.owner } });
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execution = (await import('../src/acl/service-execution')).createServiceExecution(f.service, {
      operation: 'list',
      rowAccess: 'list',
      virtualAccess: 'list',
      outputAccess: 'list',
      docPermissionsAccess: 'list',
    });
    const call = (await import('../src/acl/service-execution')).readServiceExecution(
      f.service,
      execution,
    ).authorization;
    const first = await documents.resolveDocumentAuthorization(
      documents.createDocumentAuthorizationStage(call, f.binding, { _id: 'same' }),
      () => ({ owner: true }),
    );
    const second = await documents.resolveDocumentAuthorization(
      documents.createDocumentAuthorizationStage(call, f.binding, { _id: 'same' }),
      () => ({ owner: false }),
    );
    const evaluate = vi.fn(async () => {
      entered();
      await wait;
      return true;
    });
    const a = documents.memoizeDocumentFieldDecision(first, f.binding, 'pending', evaluate),
      b = documents.memoizeDocumentFieldDecision(first, f.binding, 'pending', evaluate);
    await started;
    expect(a).toBe(b);
    release();
    expect(await a).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(documents.memoizeDocumentFieldDecision(first, f.binding, 'pending', () => false)).toBe(true);
    expect(await evaluateAuthorizedOutputField(first, f.binding, 'name')).toBe(true);
    expect(await evaluateAuthorizedOutputField(second, f.binding, 'name')).toBe(false);
    const fail = vi.fn(async () => {
      throw new Error('failed');
    });
    const failure = documents.memoizeDocumentFieldDecision(first, f.binding, 'failure', fail);
    await expect(failure).rejects.toThrow('failed');
    expect(documents.memoizeDocumentFieldDecision(first, f.binding, 'failure', fail)).toBe(failure);
    expect(fail).toHaveBeenCalledTimes(1);
    await expect(f.service.pickAllowedFields({}, 'list', { documentAuthorization: first })).rejects.toThrow();
  });
});

describe('actual state, safe selected values and metadata', () => {
  it('keeps issued embedded roots on metadata dotted spines without graph transfers or a stronger association', async () => {
    const hook = vi.fn(() => ({ owner: true }));
    const f = fixture({
      documentPermissionField: 'meta.permissions',
      stripPermissionsField: false,
      docPermissions: { list: hook },
      permissionSchema: { name: true, meta: { list: true, read: true, sub: { safe: true } } },
    });
    f.adapter.find.mockResolvedValue([{ name: 'name', meta: { safe: 'safe', permissions: { fake: true } } }]);
    const graph = vi.spyOn(documents, 'transferDocumentAuthorizationGraph');
    const result = await f.service.find(
      {},
      { select: ['name', 'meta.safe', '-_id'] },
      { ...quiet, includePermissions: true },
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    const row = result.data[0] as any,
      context = result.contexts[0];
    expect(row.meta).toEqual({ safe: 'safe', permissions: { owner: true } });
    const handle = context.getDocumentAuthorization(row.meta)!;
    expect(handle).toBeDefined();
    expect(await f.service.pickAllowedFields(row.meta, 'list', { documentAuthorization: handle })).toEqual({
      safe: 'safe',
    });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(graph).not.toHaveBeenCalled();
  });

  it('defines selected helper and virtual return slots safely after native code installs inherited setters', async () => {
    const setter = vi.fn(),
      previousValue = Object.getOwnPropertyDescriptor(Object.prototype, 'value');
    const previousVirtual = Object.getOwnPropertyDescriptor(Object.prototype, 'computed');
    const native = Object.assign(new Date(1), {
      getTime() {
        const descriptor = Object.assign(Object.create(null), { configurable: true, set: setter });
        Object.defineProperty(Object.prototype, 'value', descriptor);
        Object.defineProperty(Object.prototype, 'computed', descriptor);
        return 1;
      },
    });
    const f = fixture({
      permissionSchema: { name: true, value: true, computed: true },
      virtuals: { computed: { dependsOn: ['name'], get: () => native } },
    });
    f.adapter.find.mockResolvedValue([{ name: 'name' }]);
    let output: any, picked: any;
    try {
      const result = await f.service.find({}, { select: ['name', 'computed', '-_id'] }, quiet);
      if (!result.success) throw new Error(result.code);
      output = result.data[0];
      Object.defineProperty(result.data[0], 'value', {
        value: native,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      picked = await f.service.pickAllowedFields(result.data[0], 'list', {
        documentAuthorization: result.contexts[0].documentAuthorization,
      });
    } finally {
      if (previousValue) Object.defineProperty(Object.prototype, 'value', previousValue);
      else Reflect.deleteProperty(Object.prototype, 'value');
      if (previousVirtual) Object.defineProperty(Object.prototype, 'computed', previousVirtual);
      else Reflect.deleteProperty(Object.prototype, 'computed');
    }
    expect(output.computed).toEqual(new Date(1));
    expect(picked.value).toEqual(new Date(1));
    expect(setter).not.toHaveBeenCalled();
  });

  it('preserves nested issued spine membership and the original leaf memo during helper filtering', async () => {
    const rule = vi.fn(() => true);
    const f = fixture({
      documentPermissionField: 'meta.child.permissions',
      stripPermissionsField: false,
      permissionSchema: {
        meta: { list: true, read: true, sub: { child: { list: true, read: true, sub: { safe: rule } } } },
      },
      docPermissions: { list: () => ({ owner: true }) },
    });
    f.adapter.find.mockResolvedValue([{ meta: { child: { safe: 'safe', permissions: { fake: true } } } }]);
    const result = await f.service.find(
      {},
      { select: ['meta.child.safe', '-_id'] },
      { ...quiet, includePermissions: true },
    );
    if (!result.success) throw new Error(result.code);
    const row = result.data[0] as any,
      context = result.contexts[0];
    expect(row.meta.child).toEqual({ safe: 'safe', permissions: { owner: true } });
    const parent = context.getDocumentAuthorization(row.meta)!;
    expect(parent).toBeDefined();
    expect(context.getDocumentAuthorization(row.meta.child)).toBeDefined();
    expect(await f.service.pickAllowedFields(row.meta, 'list', { documentAuthorization: parent })).toEqual({
      child: { safe: 'safe' },
    });
    expect(rule).toHaveBeenCalledTimes(1);
  });

  it.each(['proxy', 'symbol', 'non-enumerable', 'unsafe'] as const)(
    'takes compatible %s root fallback BEFORE its single hook',
    async (kind) => {
      const hook = vi.fn(() => ({})),
        f = fixture({ docPermissions: { list: hook } });
      let source: Record<string | symbol, unknown> = { name: 'copied' };
      if (kind === 'proxy') source = new Proxy(source, {});
      if (kind === 'symbol') source[Symbol('hidden')] = true;
      if (kind === 'non-enumerable') Object.defineProperty(source, 'hidden', { value: true });
      if (kind === 'unsafe')
        Object.defineProperty(source, '__proto__', { value: { polluted: true }, enumerable: true });
      f.adapter.find.mockResolvedValue([source]);
      const result = await f.service.find({}, { select: ['name', '-_id'] }, quiet);
      if (kind === 'unsafe') {
        expect(result).toMatchObject({ success: false, code: 'bad_request' });
        expect(hook).not.toHaveBeenCalled();
      } else {
        expect(result).toMatchObject({ success: true, data: [{ name: 'copied' }] });
        if (!result.success) throw new Error(result.code);
        expect(
          documents.readDocumentAuthorization(result.contexts[0].documentAuthorization, f.binding).sourceState,
        ).toBe('copied');
        expect(hook).toHaveBeenCalledTimes(1);
        expect(hook.mock.calls[0][0]).not.toBe(source);
      }
      expect({}).not.toHaveProperty('polluted');
    },
  );

  it('copies an exotic ordinary grant fallback once without rerunning the hook or per-field grant copies', async () => {
    const f = fixture(),
      executionApi = await import('../src/acl/service-execution');
    const execution = executionApi.createServiceExecution(f.service, {
      operation: 'list',
      rowAccess: 'list',
      virtualAccess: 'list',
      outputAccess: 'list',
      docPermissionsAccess: 'list',
    });
    const call = executionApi.readServiceExecution(f.service, execution).authorization;
    const grants = new Proxy({ grantMark: true, owner: true, when: new Date(1) }, {}),
      hook = vi.fn(() => grants);
    const copy = vi.spyOn(snapshots, 'copyAuthorizationValue');
    const handle = await documents.resolveDocumentAuthorization(
      documents.createDocumentAuthorizationStage(call, f.binding, { name: 'name' }),
      hook,
    );
    const first = documents.readDocumentAuthorization(handle, f.binding),
      second = documents.readDocumentAuthorization(handle, f.binding);
    expect(first.grantState).toBe('copied');
    expect(first.sourceState).toBe('trusted');
    expect(first.grants).not.toBe(grants);
    expect(first.grants).toBe(second.grants);
    expect(first.grants.when).not.toBe(grants.when);
    for (let index = 0; index < 5; index++)
      expect(
        await documents.memoizeDocumentFieldDecision(
          handle,
          f.binding,
          `field:${index}`,
          (_p, supplied) => supplied.owner === true,
        ),
      ).toBe(true);
    expect(copy.mock.calls.filter(([value]) => value === grants)).toHaveLength(1);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('budgets and safely filters a supported BSON wire fallback that expands into a selected container', async () => {
    const wire = vi.fn(() => ({ safe: 'value', constructor: 'never', __v: 'never' }));
    const value = Object.assign(new mongoose.mongo.BSON.ObjectId(), { toBSON: wire });
    const f = fixture();
    f.adapter.find.mockResolvedValue([{ value }]);
    expect(await f.service.find({}, { select: ['value', '-_id'] }, quiet)).toMatchObject({
      success: true,
      data: [{ value: { safe: 'value' } }],
    });
    expect(wire).toHaveBeenCalledTimes(1);
    const giant = Object.assign(new mongoose.mongo.BSON.ObjectId(), { toBSON: () => Array(20001).fill('value') });
    f.adapter.find.mockResolvedValue([{ value: giant }]);
    const result = await f.service.find({}, { select: ['value', '-_id'] }, quiet);
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
  });

  it('controls new embedded-array traversal and retained-helper replacement budgets/cycles', async () => {
    const f = fixture({
      permissionSchema: { name: true, children: { list: true, read: true, sub: { label: true } } },
      virtuals: { children: { sub: {} } },
    });
    f.adapter.find.mockResolvedValue([{ name: 'name', children: [{ label: 'label' }] }]);
    const result = await f.service.find({}, { select: ['name', 'children', '-_id'] }, quiet);
    if (!result.success) throw new Error(result.code);
    const row = result.data[0] as any,
      handle = result.contexts[0].documentAuthorization;
    const cyclic: any[] = [];
    cyclic.push(cyclic);
    row.children = cyclic;
    await expect(f.service.pickAllowedFields(row, 'list', { documentAuthorization: handle })).rejects.toBeInstanceOf(
      snapshots.ServiceAuthorizationError,
    );
    row.children = Array(20001).fill(null);
    await expect(f.service.pickAllowedFields(row, 'list', { documentAuthorization: handle })).rejects.toBeInstanceOf(
      snapshots.ServiceAuthorizationError,
    );
    f.adapter.find.mockResolvedValue([{ children: cyclic }]);
    expect(await f.service.find({}, { select: ['children', '-_id'] }, quiet)).toMatchObject({
      success: false,
      code: 'bad_request',
    });
  });
  it('mixes trusted/copy-fallback rows before hooks and retains strict graph handling on the copied row', async () => {
    const hook = vi.fn(() => ({ grantMark: true, mutable: new Date(0) }));
    const f = fixture({
      docPermissions: { list: hook },
      alwaysSelectFields: ['rootStageMarker'],
      permissionSchema: { name: true, value: true },
    });
    const ordinary = { name: 'ordinary', value: { one: 1 }, rootStageMarker: new Date(1) };
    const accessor = Object.defineProperty({ value: { one: 1 }, rootStageMarker: new Date(1) }, 'name', {
      get: () => 'copied',
      enumerable: true,
    });
    f.adapter.find.mockResolvedValue([ordinary, accessor]);
    const result = await f.service.find({}, { select: ['name', 'value', '-_id'] }, quiet);
    if (!result.success) throw new Error(result.code);
    const [trusted, copied] = result.contexts.map((ctx) =>
      documents.readDocumentAuthorization(ctx.documentAuthorization, f.binding),
    );
    expect(trusted.sourceState).toBe('trusted');
    expect(copied.sourceState).toBe('copied');
    expect(hook).toHaveBeenCalledTimes(2);
    expect(hook.mock.calls[0][0]).toBe(ordinary);
    expect(hook.mock.calls[1][0]).not.toBe(accessor);
    (result.data[0] as any).value = { one: 2 };
    (result.data[1] as any).value = { one: 2 };
    await expect(
      f.service.pickAllowedFields(result.data[0], 'list', {
        documentAuthorization: result.contexts[0].documentAuthorization,
      }),
    ).resolves.toMatchObject({ name: 'ordinary' });
    await expect(
      f.service.pickAllowedFields(result.data[1], 'list', {
        documentAuthorization: result.contexts[1].documentAuthorization,
      }),
    ).rejects.toThrow();
  });

  it('converts a hydrated root exactly once with virtuals:false/flattenMaps:true and still runs its hook', async () => {
    const hook = vi.fn(() => ({})),
      f = fixture({ docPermissions: { list: hook }, hydration: { find: 'hydrated' } });
    const raw = f.model.hydrate({ name: 'hydrated', value: { nested: true } }),
      toObject = vi.spyOn(raw, 'toObject');
    f.adapter.find.mockResolvedValue([raw]);
    const result = await f.service.find({}, { select: ['name', '-_id'] }, quiet);
    expect(result).toMatchObject({ success: true, data: [{ name: 'hydrated' }] });
    expect(toObject).toHaveBeenCalledTimes(1);
    expect(toObject).toHaveBeenCalledWith({ virtuals: false, flattenMaps: true });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][0]).not.toBe(raw);
  });

  it.each([true, false, 'dotted'] as const)(
    'builds metadata once with separate map/borrowed leaves; metadata=%s',
    async (metadata) => {
      const leaf = { shared: new Date(1) },
        grants = { owner: true, private: true, leaf };
      const f = fixture({
        stripPermissionsField: metadata === false,
        documentPermissionField: metadata === 'dotted' ? 'meta.permissions' : '_permissions',
        exposedDocPermissionKeys: ['owner', 'leaf'],
        docPermissions: { list: () => grants },
        permissionSchema: { name: 'doc:owner' },
        modelPermissionPrefix: 'doc:',
      });
      f.adapter.find.mockResolvedValue([{ name: 'name' }]);
      const work = instrument();
      const result = await f.service.find({}, { select: ['name', '-_id'] }, { ...quiet, includePermissions: true });
      if (!result.success) throw new Error(result.code);
      const row = result.data[0] as any;
      if (metadata === false) {
        expect(row).toEqual({ name: 'name' });
        expect(row.permissions).toBeUndefined();
      } else {
        const map = metadata === 'dotted' ? row.meta.permissions : row._permissions;
        expect(map).toEqual({ owner: true, leaf });
        expect(map).not.toBe(grants);
        expect(map.leaf).toBe(leaf);
        expect(row.permissions).toBe(map);
        map.owner = false;
        expect(
          await f.service.pickAllowedFields(row, 'list', {
            documentAuthorization: result.contexts[0].documentAuthorization,
          }),
        ).toHaveProperty('name', 'name');
        expect(grants.owner).toBe(true);
      }
      expect(work).toMatchObject({
        graphTransfers: 0,
        identityWalks: 0,
        identityAdmissions: 0,
        contexts: 1,
        grantCopies: 0,
        contextCopies: 0,
      });
    },
  );

  it('copies a selected native once but never observes unselected huge/cyclic/exotic source leaves', async () => {
    let observations = 0;
    const date = Object.assign(new Date(1), {
      getTime() {
        observations++;
        return 1;
      },
    });
    const hidden: any = { cycle: null, proxy: new Proxy({}, {}), giant: Array(25000) };
    hidden.cycle = hidden;
    const f = fixture({ alwaysSelectFields: ['hidden'] });
    f.adapter.find.mockResolvedValue([{ name: 'name', value: date, hidden }]);
    const result = await f.service.find({}, { select: ['name', 'value', '-_id'] }, quiet);
    expect(result).toMatchObject({ success: true, data: [{ name: 'name', value: new Date(1) }] });
    expect(observations).toBe(1);
  });

  it.each([
    ['proxy', () => new Proxy({}, {})],
    ['custom', () => new (class Value {})()],
    ['function', () => () => true],
    ['symbol', () => Symbol('value')],
    [
      'cycle',
      () => {
        const value: any = {};
        value.self = value;
        return value;
      },
    ],
    ['slots', () => Array(20001)],
    [
      'depth',
      () => {
        let value: any = {};
        for (let index = 0; index < 101; index++) value = { nested: value };
        return value;
      },
    ],
  ] as const)(
    'rejects selected %s with a controlled error, no hook rerun or partial publication',
    async (_name, value) => {
      const hook = vi.fn(() => ({})),
        f = fixture({ docPermissions: { list: hook } });
      f.adapter.find.mockResolvedValue([{ name: 'name', value: value() }]);
      const result = await f.service.find({}, { select: ['name', 'value', '-_id'] }, quiet);
      expect(result).toMatchObject({
        success: false,
        code: 'bad_request',
        kind: 'error',
        errors: [{ detail: expect.stringContaining('Service authorization:') }],
      });
      expect(result).not.toHaveProperty('data');
      expect(hook).toHaveBeenCalledTimes(1);
    },
  );

  it('flattens selected Maps, drops protected keys, and supports a native subclass fallback once', async () => {
    let observations = 0;
    class Native extends Date {
      getTime() {
        observations++;
        return super.getTime();
      }
    }
    const value = new Map([
      ['safe', { ok: true, constructor: 'never', __v: 'never' }],
      ['native', new Native(2)],
      ['__proto__', { polluted: true }],
    ]);
    const f = fixture();
    f.adapter.find.mockResolvedValue([{ value }]);
    const result = await f.service.find({}, { select: ['value', '-_id'] }, quiet);
    expect(result).toMatchObject({ success: true, data: [{ value: { safe: { ok: true }, native: new Date(2) } }] });
    expect(observations).toBe(1);
    expect({}).not.toHaveProperty('polluted');
  });

  it('reconstructs a named Map branch once without visiting unrelated Map values', async () => {
    const bad = new Proxy(
      {},
      {
        get() {
          throw new Error('unselected');
        },
      },
    );
    const value = new Map([
      ['safe', { ok: 'selected', hidden: 'never' }],
      ['other', bad],
    ]);
    const f = fixture({ permissionSchema: { 'value.safe.ok': true, 'value.safe.hidden': false } });
    f.adapter.find.mockResolvedValue([{ value }]);
    const result = await f.service.find({}, { select: ['value.safe.ok', '-_id'] }, quiet);
    expect(result).toMatchObject({ success: true, data: [{ value: { safe: { ok: 'selected' } } }] });
    if (!result.success) throw new Error(result.code);
    const row = result.data[0] as any;
    row.value = new Map([
      ['safe', { ok: 'replacement', hidden: 'never' }],
      ['other', bad],
    ]);
    expect(
      await f.service.pickAllowedFields(row, 'list', {
        documentAuthorization: result.contexts[0].documentAuthorization,
      }),
    ).toEqual({ value: { safe: { ok: 'replacement' } } });
  });

  it('retains stable per-getter document views and staged returns without grant/context deep copies', async () => {
    const grants = { owner: true, leaf: { value: 1 } },
      seen: string[] = [];
    const first = vi.fn((doc, _p, context) => {
      seen.push(doc.name);
      doc.name = 'mutated';
      expect(context.docPermissions).toBe(grants);
      return 'first';
    });
    const second = vi.fn((doc, _p, context) => {
      seen.push(doc.name);
      expect(doc).not.toHaveProperty('first');
      expect(context.docPermissions.leaf).toBe(grants.leaf);
      return doc.name;
    });
    const invalid = vi.fn(() => () => true);
    const f = fixture({
      permissionSchema: { name: true, first: true, second: true, invalid: true, missing: true },
      virtuals: {
        first: { dependsOn: ['name'], get: first },
        second: { dependsOn: ['name'], get: second },
        invalid: { dependsOn: ['name'], get: invalid },
        missing: {
          dependsOn: ['name'],
          get: () => {
            throw new Error('getter');
          },
        },
      },
      docPermissions: { list: () => grants },
    });
    const source = { name: 'stable', first: 'stale', second: 'stale', invalid: 'stale' };
    f.adapter.find.mockResolvedValue([source]);
    const work = instrument();
    const result = await f.service.find(
      {},
      { select: ['name', 'first', 'second', 'invalid', 'missing', '-_id'] },
      quiet,
    );
    expect(result).toMatchObject({ success: true, data: [{ name: 'stable', first: 'first', second: 'stable' }] });
    expect(seen).toEqual(['stable', 'stable']);
    expect(source.name).toBe('stable');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(work.contextCopies).toBe(0);
    expect(work.graphTransfers).toBe(0);
  });
});
