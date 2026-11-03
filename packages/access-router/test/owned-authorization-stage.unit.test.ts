import mongoose from 'mongoose';
import JsonRouter from '@web-ts-toolkit/express-json-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { PublicService } from '../src/services/public-service';
import { RootRouter } from '../src/routers/root-router';
import { guard } from '../src/middleware';
import { PERMISSIONS } from '../src/symbols';
import type {
  AuthorizationMode,
  ModelOutputContext,
  ModelRequest,
  ModelRouterOptions,
  RootQueryEntry,
} from '../src/interfaces';
import { EMPTY_DOCUMENT_GRANTS } from '../src/acl/document-grants';
import { copyAuthorizationValue } from '../src/acl/authorization-snapshot';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { captureRelatedTargets, createRelatedExecution } from '../src/acl/related-execution';
import {
  createServiceExecution,
  getServiceExecutors,
  readServiceExecution,
  withExecutionOutputBudget,
} from '../src/acl/service-execution';
import {
  getAuthorizationPermissions,
  readServiceAuthorizationMode,
  resolveServiceAuthorization,
  ServiceAuthorizationError,
} from '../src/acl/service-authorization';
import {
  assertDocumentStage,
  closeDocumentStage,
  createDocumentStage,
  documentStageSource,
  memoizeStageFieldDecision,
  readDocumentStage,
  resolveDocumentStage,
  type DocumentStage,
} from '../src/acl/document-stage';
import {
  assertOutputPublication,
  closeOutputPublication,
  createPublicationRowBudget,
  failOutputPublication,
  outputPublicationFor,
} from '../src/acl/output-publication';
import {
  assertTrustedOutputBudget,
  createReceivingOutputBudget,
  createTrustedOutputBudget,
  materializeTrustedOutputValue,
  setTrustedOutputPath,
  visitTrustedOutput,
} from '../src/acl/trusted-output-materialization';
import { finalizeModelOutput } from '../src/output/finalize-model-output';
import { executePreparedFindOne, prepareModelQuery } from '../src/acl/prepared-query';
import { mapWithConcurrencyLimit } from '../src/helpers/concurrency';
import { deferred } from './hook-admission-fixture';

const modes = ['isolated', 'trusted'] as const;
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const retired = [
  'unsafeSkipListDocumentSnapshotChecks',
  'unsafeSkipReadDocumentSnapshotChecks',
  'unsafeSkipListOutputSnapshotChecks',
  'unsafeSkipReadOutputSnapshotChecks',
  'unsafeSkipListNestedDocumentSnapshotChecks',
  'unsafeSkipReadNestedDocumentSnapshotChecks',
  'unsafeSkipListInitialOutputSnapshotCopy',
  'unsafeSkipReadInitialOutputSnapshotCopy',
  'unsafeUseListAuthorizationFastPath',
  'unsafeUseReadAuthorizationFastPath',
];
const access = (operation = 'read', effective = operation) => ({
  operation,
  rowAccess: effective,
  virtualAccess: effective,
  outputAccess: effective,
  docPermissionsAccess: effective,
});
let sequence = 0;

function fixture(mode: AuthorizationMode = 'isolated', options: ModelRouterOptions = {}) {
  const n = ++sequence;
  const Target = mongoose.model(
    `Oar03Target${n}`,
    new mongoose.Schema({ _id: String, value: String, hidden: String, join: String, when: Date }),
  );
  const Source = mongoose.model(
    `Oar03Source${n}`,
    new mongoose.Schema(
      {
        _id: String,
        ownerId: String,
        value: String,
        hidden: String,
        join: String,
        when: Date,
        payload: mongoose.Schema.Types.Mixed,
        children: [new mongoose.Schema({ _id: String, value: String, hidden: String }, { _id: false })],
        ref: { type: String, ref: Target.modelName },
      },
      { versionKey: false },
    ),
  );
  const runtime = new AccessRuntime(),
    warn = vi.fn();
  runtime.setGlobalOptions({ logger: { warn }, requestComplexity: { maxHookConcurrency: 2 } });
  for (const model of [Source, Target]) runtime.registerModelInstance(model.modelName, model);
  const hooks = {
    source: vi.fn((doc: unknown) => ({ owner: (doc as { ownerId?: string }).ownerId === 'actor' })),
    target: vi.fn(() => ({ owner: false })),
  };
  const decisions = vi.fn(function (
    this: ModelRequest,
    permissions: Permission,
    facts: Readonly<Record<string, boolean>>,
  ) {
    expect(this).toBe(request);
    expect(permissions.has('reader')).toBe(true);
    expect(permissions.has('admin')).toBe(false);
    return facts.owner === true;
  });
  runtime.setModelOptions(Target.modelName, {
    operationAccess: true,
    baseFilter: true,
    modelPermissionPrefix: 'doc:',
    permissionSchema: { value: 'doc:owner', hidden: false, join: false, when: true },
    docPermissions: { read: hooks.target, list: hooks.target },
    stripPermissionsField: true,
  });
  runtime.setModelOptions(Source.modelName, {
    readAuthorizationMode: mode,
    listAuthorizationMode: mode,
    operationAccess: true,
    baseFilter: true,
    stripPermissionsField: true,
    modelPermissionPrefix: 'doc:',
    permissionSchema: {
      value: decisions,
      ownerId: false,
      hidden: false,
      ref: true,
      join: true,
      when: true,
      children: { read: true, list: true, sub: { value: 'doc:owner', hidden: false } },
    },
    docPermissions: {
      read: { dependsOn: ['ownerId'], get: hooks.source },
      list: { dependsOn: ['ownerId'], get: hooks.source },
      create: { dependsOn: ['ownerId'], get: hooks.source },
      update: { dependsOn: ['ownerId'], get: hooks.source },
    },
    ...options,
  });
  const rows = [
    {
      _id: 'same',
      ownerId: 'actor',
      value: 'yes',
      hidden: 'never',
      join: 'key',
      children: [{ value: 'child', hidden: 'never' }],
    },
    {
      _id: 'same',
      ownerId: 'other',
      value: 'no',
      hidden: 'never',
      join: 'key',
      children: [{ value: 'child-no', hidden: 'never' }],
    },
  ];
  const targetRows = [{ _id: 'target', value: 'target-value', hidden: 'never', join: 'key' }];
  const adapters = new Map([
    [
      Source.modelName,
      {
        mongooseModel: Source,
        find: vi.fn(async () => rows),
        findOne: vi.fn(async () => rows[0]),
        countDocuments: vi.fn(async () => rows.length),
        new: vi.fn(async () => new Source(rows[0])),
        create: vi.fn(async (items: object[]) => items.map((item) => new Source(item))),
      },
    ],
    [
      Target.modelName,
      {
        mongooseModel: Target,
        find: vi.fn(async () => targetRows),
        findOne: vi.fn(async () => targetRows[0]),
        countDocuments: vi.fn(async () => targetRows.length),
        new: vi.fn(),
        create: vi.fn(),
      },
    ],
  ]);
  const request = {
    _permissions: { reader: true },
    [PERMISSIONS]: new Permission({ reader: true }),
    query: {},
    params: {},
    get: () => undefined,
  } as unknown as ModelRequest;
  const services = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    const make = (name: string, direct: boolean) =>
      direct
        ? new (class extends Service {
            protected createModelAdapter(modelName: string) {
              return adapters.get(modelName)!;
            }
          })(request, name)
        : new (class extends PublicService {
            protected createModelAdapter(modelName: string) {
              return adapters.get(modelName)!;
            }
          })(request, name);
    return {
      direct: make(Source.modelName, true) as Service,
      public: make(Source.modelName, false) as PublicService,
      target: make(Target.modelName, false) as PublicService,
    };
  });
  vi.spyOn(request.macl, 'getPublicService').mockImplementation((name) =>
    name === Target.modelName ? services.target : services.public,
  );
  vi.spyOn(request.macl, 'getService').mockImplementation((name) =>
    name === Target.modelName ? services.target : services.direct,
  );
  const binding = getServiceExecutors(services.direct).binding();
  const configuration = captureModelAuthorizationConfiguration(runtime, Source.modelName);
  const call = resolveServiceAuthorization({
    binding,
    configuration,
    access: access(),
    requestPermissions: request[PERMISSIONS]!,
    readResponse: true,
  });
  warn.mockClear();
  return {
    ...services,
    runtime,
    request,
    Source,
    Target,
    adapters,
    adapter: adapters.get(Source.modelName)!,
    hooks,
    decisions,
    rows,
    targetRows,
    binding,
    configuration,
    call,
    warn,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Oar03/);
});

describe('OAR-03 private stage identity, synchronous memo and terminal lifetime', () => {
  it.each(
    modes.flatMap((mode) =>
      ['request', 'runtime', 'model', 'modelName', 'scope', 'access'].map((key) => ({ mode, key })),
    ),
  )('$mode rejects wrong $key before memo work', async ({ mode, key }) => {
    const f = fixture(mode),
      stage = createDocumentStage(f.call, f.binding, f.rows[0]);
    await resolveDocumentStage(stage, () => ({ owner: true }));
    const binding =
      key === 'scope'
        ? { ...f.binding, scopePath: ['children'] }
        : key === 'access'
          ? f.binding
          : { ...f.binding, [key]: key === 'modelName' ? 'wrong' : {} };
    const call =
      key === 'access'
        ? resolveServiceAuthorization({
            binding: f.binding,
            configuration: f.configuration,
            access: access('list'),
            requestPermissions: f.request[PERMISSIONS]!,
          })
        : f.call;
    const evaluate = vi.fn(() => true);
    expect(() => assertDocumentStage(stage, call, binding)).toThrow(ServiceAuthorizationError);
    if (key !== 'access')
      expect(() => memoizeStageFieldDecision(stage, binding, 'value', evaluate)).toThrow(ServiceAuthorizationError);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each(modes)('%s owns one resolution promise and direct synchronous memo hits', async (mode) => {
    const f = fixture(mode),
      stage = createDocumentStage(f.call, f.binding, f.rows[0]),
      hook = vi.fn(() => ({ owner: true }));
    const first = resolveDocumentStage(stage, hook);
    expect(resolveDocumentStage(stage, hook)).toBe(first);
    await first;
    const evaluate = vi.fn(() => true);
    expect(memoizeStageFieldDecision(stage, f.binding, 'value', evaluate)).toBe(true);
    expect(memoizeStageFieldDecision(stage, f.binding, 'value', evaluate)).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
    const paused = deferred(),
      asyncRule = vi.fn(async () => {
        await paused.promise;
        return false;
      });
    const pending = memoizeStageFieldDecision(stage, f.binding, 'async', asyncRule);
    expect(memoizeStageFieldDecision(stage, f.binding, 'async', asyncRule)).toBe(pending);
    paused.resolve();
    expect(await pending).toBe(false);
    expect(memoizeStageFieldDecision(stage, f.binding, 'async', asyncRule)).toBe(false);
    expect(hook).toHaveBeenCalledTimes(1);
    await closeOutputPublication(outputPublicationFor(f.call));
  });

  it.each(modes)('%s has distinct same-ID row facts and no memo sharing', async (mode) => {
    const f = fixture(mode),
      stages = f.rows.map((row) => createDocumentStage(f.call, f.binding, row));
    await Promise.all(stages.map((stage, index) => resolveDocumentStage(stage, () => ({ owner: index === 0 }))));
    expect(readDocumentStage(stages[0], f.binding).grants).not.toBe(readDocumentStage(stages[1], f.binding).grants);
    expect(memoizeStageFieldDecision(stages[0], f.binding, 'same', (_p, facts) => facts.owner)).toBe(true);
    expect(memoizeStageFieldDecision(stages[1], f.binding, 'same', (_p, facts) => facts.owner)).toBe(false);
    await closeOutputPublication(outputPublicationFor(f.call));
  });

  it.each(['forged', 'closed'] as const)(
    'rejects %s without inspecting binding getters or invoking work',
    async (kind) => {
      const f = fixture(),
        stage =
          kind === 'forged'
            ? (Object.freeze(Object.create(null)) as DocumentStage)
            : createDocumentStage(f.call, f.binding, f.rows[0]);
      if (kind === 'closed') {
        await resolveDocumentStage(stage, () => ({ owner: true }));
        closeDocumentStage(stage);
      }
      const observe = vi.fn();
      const binding = Object.defineProperty({ ...f.binding }, 'model', { get: observe });
      expect(() => readDocumentStage(stage, binding)).toThrow(ServiceAuthorizationError);
      expect(() => resolveDocumentStage(stage, observe)).toThrow(ServiceAuthorizationError);
      expect(() => memoizeStageFieldDecision(stage, binding, 'value', observe)).toThrow(ServiceAuthorizationError);
      expect(observe).not.toHaveBeenCalled();
    },
  );

  it.each(['scope', 'access', 'model', 'request'] as const)(
    'owning facts cannot bind to a wrong child %s',
    async (changed) => {
      const f = fixture(),
        parent = createDocumentStage(f.call, f.binding, f.rows[0]);
      await resolveDocumentStage(parent, () => ({ owner: true }));
      const binding =
        changed === 'scope'
          ? f.binding
          : changed === 'model'
            ? { ...f.binding, model: f.Target, modelName: f.Target.modelName, scopePath: ['children'] }
            : changed === 'request'
              ? { ...f.binding, request: {} as ModelRequest, scopePath: ['children'] }
              : { ...f.binding, scopePath: ['children'] };
      if (changed === 'request') {
        expect(() =>
          resolveServiceAuthorization({
            binding,
            parent: f.call,
            configuration: f.configuration,
            requestPermissions: f.request[PERMISSIONS]!,
            access: access(),
          }),
        ).toThrow(ServiceAuthorizationError);
      } else {
        const call = resolveServiceAuthorization({
          binding,
          parent: f.call,
          configuration: f.configuration,
          requestPermissions: f.request[PERMISSIONS]!,
          access: access(changed === 'access' ? 'list' : 'read'),
        });
        expect(() => createDocumentStage(call, binding, {}, { stage: parent, binding: f.binding })).toThrow(
          ServiceAuthorizationError,
        );
      }
    },
  );

  it.each(['facts', 'field'] as const)('closes before a late %s resume, drains it, and cannot revive', async (kind) => {
    const f = fixture(),
      stage = createDocumentStage(f.call, f.binding, f.rows[0]),
      owner = outputPublicationFor(f.call),
      release = deferred();
    let settled = false;
    if (kind === 'field') await resolveDocumentStage(stage, () => ({ owner: true }));
    const work =
      kind === 'facts'
        ? resolveDocumentStage(stage, async () => {
            await release.promise;
            settled = true;
            return { owner: true };
          })
        : memoizeStageFieldDecision(stage, f.binding, 'late', async () => {
            await release.promise;
            settled = true;
            return true;
          });
    const rejected = Promise.resolve(work).catch((error) => error);
    const failure = new ServiceAuthorizationError('fixture failure');
    let returned = false;
    const closing = closeOutputPublication(owner, failure).catch((error) => {
      returned = true;
      return error;
    });
    expect(() => readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
    await Promise.resolve();
    expect(returned).toBe(false);
    expect(settled).toBe(false);
    release.resolve();
    expect(await rejected).toBeInstanceOf(ServiceAuthorizationError);
    expect(await closing).toBe(failure);
    expect(settled).toBe(true);
    expect(() => assertDocumentStage(stage, f.call, f.binding)).toThrow(ServiceAuthorizationError);
  });

  it('row maps stop admission and drain surviving library workers before rejection', async () => {
    const failed = deferred(),
      slow = deferred(),
      seen: number[] = [];
    let returned = false,
      slowSettled = false;
    const work = mapWithConcurrencyLimit([0, 1, 2, 3], 2, async (index) => {
      seen.push(index);
      if (index === 0) {
        await failed.promise;
        throw new Error('failure');
      }
      await slow.promise;
      slowSettled = true;
      return index;
    }).catch((error) => {
      returned = true;
      return error;
    });
    failed.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(returned).toBe(false);
    expect(seen).toEqual([0, 1]);
    slow.resolve();
    expect(await work).toBeInstanceOf(Error);
    expect(slowSettled).toBe(true);
    expect(seen).toEqual([0, 1]);
  });
});

describe('OAR-03 actual direct/public/root operations and fresh raw helpers', () => {
  it.each(
    modes.flatMap((mode) =>
      ['direct', 'public'].flatMap((entry) => ['read', 'list'].map((operation) => ({ mode, entry, operation }))),
    ),
  )(
    '$mode $entry $operation resolves per row, filters embedded data, and publishes diagnostics only',
    async ({ mode, entry, operation }) => {
      const f = fixture(mode),
        args = { select: ['value', 'children.value', '-_id'] };
      const result =
        operation === 'read'
          ? entry === 'direct'
            ? await f.direct.findOne({}, args, quiet)
            : await f.public._readFilter({}, args, quiet)
          : entry === 'direct'
            ? await f.direct.find({}, args, quiet)
            : await f.public._list({}, args, quiet);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      const rows = result.kind === 'single' ? [result.data] : result.data;
      expect(rows[0]).toEqual({ value: 'yes', children: [{ value: 'child' }] });
      if (operation === 'list') expect(rows[1]).toEqual({ children: [{}] });
      const contexts = result.kind === 'single' ? [result.context!] : result.contexts!;
      for (const context of contexts) {
        expect(Object.keys(context).sort()).toEqual(
          [
            'docPermissions',
            'docPermissionsAccess',
            'modelName',
            'operation',
            'outputAccess',
            'receivingModelName',
            'resolvedQuery',
            'scopePath',
            'virtualAccess',
          ].sort(),
        );
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.isFrozen(context.docPermissions)).toBe(true);
        expect(Object.isFrozen(context.resolvedQuery!.select)).toBe(true);
        expect(context.resolvedQuery).not.toHaveProperty('filter');
        expect(context).not.toHaveProperty('documentAuthorization');
        expect(context).not.toHaveProperty('getDocumentAuthorization');
      }
      expect(f.hooks.source).toHaveBeenCalledTimes(operation === 'list' ? 2 : 1);
      for (const call of f.hooks.source.mock.calls) expect(call[2]?.docPermissions).toBe(EMPTY_DOCUMENT_GRANTS);
      expect(f.rows[0].hidden).toBe('never');
    },
  );

  it.each(modes)(
    '%s source mode has actual source-only borrowing behavior, with immutable facts and actor',
    async (mode) => {
      const f = fixture(mode);
      let hookContext: ModelOutputContext | undefined;
      f.hooks.source.mockImplementation(function (doc: unknown, _permissions: unknown, context: ModelOutputContext) {
        (doc as { value: string }).value = 'hook-change';
        hookContext = context;
        f.request[PERMISSIONS] = new Permission({ admin: true });
        return { owner: true };
      });
      const result = await f.direct.findOne({}, { select: ['value', '-_id'] }, quiet);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toEqual({ value: mode === 'trusted' ? 'hook-change' : 'yes' });
      expect(f.rows[0].value).toBe(mode === 'trusted' ? 'hook-change' : 'yes');
      expect(Object.isFrozen(hookContext)).toBe(true);
      expect(hookContext).not.toHaveProperty('mongooseModel');
      expect(result.context.docPermissions).toEqual({ owner: true });
    },
  );

  it.each(modes)(
    'READ retry retains %s READ mode despite an opposite LIST setting and an in-flight setter',
    async (mode) => {
      const f = fixture(mode);
      f.runtime.setModelOption(
        f.Source.modelName,
        'listAuthorizationMode',
        mode === 'isolated' ? 'trusted' : 'isolated',
      );
      f.adapter.findOne.mockImplementationOnce(async () => {
        f.runtime.setModelOption(
          f.Source.modelName,
          'readAuthorizationMode',
          mode === 'isolated' ? 'trusted' : 'isolated',
        );
        return null as never;
      });
      f.hooks.source.mockImplementation((doc: unknown) => {
        (doc as { value: string }).value = 'retry-change';
        return { owner: true };
      });
      const result = await f.public._read('same', { select: ['value', '-_id'] }, { ...quiet, tryList: true });
      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected retry');
      expect(result.data).toEqual({ value: mode === 'trusted' ? 'retry-change' : 'yes' });
      expect(result.context!.operation).toBe('read');
      expect(result.context!.outputAccess).toBe('list');
      expect(f.adapter.findOne).toHaveBeenCalledTimes(2);
      expect(f.hooks.source).toHaveBeenCalledTimes(1);
    },
  );

  it('independent calls and DTO/spread/same-ID helpers use fresh facts, with zero hidden helper reads/hooks', async () => {
    const f = fixture(),
      grants = { owner: true };
    f.hooks.source.mockImplementation(() => grants);
    const first = await f.direct.findOne({}, { select: ['value'] }, quiet);
    if (!first.success) throw new Error('expected success');
    grants.owner = false;
    expect(first.context.docPermissions.owner).toBe(true);
    const helperReads = f.adapter.findOne.mock.calls.length,
      helperHooks = f.hooks.source.mock.calls.length;
    expect(
      await f.request.macl.pickAllowedFields(
        f.Source.modelName,
        { ...first.data, _permissions: { owner: true } },
        'read',
      ),
    ).toEqual({ _id: 'same' });
    expect(
      await f.direct.trimOutputFields({ _id: 'same', value: 'current' }, 'read', {
        authorization: { outputFields: { mode: 'grant', paths: ['value'] } },
      }),
    ).toEqual({ _id: 'same', value: 'current' });
    expect(await f.direct.genAllowedFields(first.data, 'read', { purpose: 'output' })).toEqual(['_id']);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(helperReads);
    expect(f.hooks.source).toHaveBeenCalledTimes(helperHooks);
    await expect(
      f.direct.pickAllowedFields(first.data, 'read', { documentAuthorization: {} } as never),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    const second = await f.direct.findOne({}, { select: ['value'] }, quiet);
    expect(second.success && second.data).toEqual({ _id: 'same' });
    expect(f.hooks.source).toHaveBeenCalledTimes(2);
  });

  it('one invalid LIST row is whole-operation 400 and surviving hooks drain before the result returns', async () => {
    const f = fixture(),
      release = deferred(),
      entered = deferred();
    let settled = false;
    f.hooks.source.mockImplementation(async (doc: unknown) => {
      if ((doc as { ownerId: string }).ownerId === 'actor') {
        await entered.promise;
        return { owner: 'invalid' } as never;
      }
      entered.resolve();
      await release.promise;
      settled = true;
      return { owner: false };
    });
    let returned = false;
    const pending = f.direct.find({}, { select: ['value'] }, quiet).then((result) => {
      returned = true;
      return result;
    });
    await entered.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(returned).toBe(false);
    release.resolve();
    const result = await pending;
    expect(result).toMatchObject({ success: false, kind: 'error', code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(settled).toBe(true);
    expect(f.hooks.source).toHaveBeenCalledTimes(2);
  });

  it('invalid total count publishes no LIST and application decorators never run early', async () => {
    const f = fixture(),
      decorate = vi.fn((doc) => doc);
    f.adapter.countDocuments.mockRejectedValue(new ServiceAuthorizationError('invalid count'));
    const result = await f.direct.find({}, { select: ['value'] }, { ...quiet, includeCount: true }, decorate);
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(decorate).not.toHaveBeenCalled();
  });

  it.each([-1, Number.NaN, 1.5])('invalid fulfilled total count %s is whole-operation 400', async (count) => {
    const f = fixture(),
      decorate = vi.fn((doc) => doc);
    f.adapter.countDocuments.mockResolvedValue(count);
    const result = await f.direct.find({}, { select: ['value'] }, { ...quiet, includeCount: true }, decorate);
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(decorate).not.toHaveBeenCalled();
  });

  it('root entries use independent publications: one invalid entry does not poison its sibling', async () => {
    const f = fixture(),
      root = new RootRouter({ operationAccess: true }, f.runtime);
    f.hooks.source
      .mockImplementationOnce(() => ({ rich: new Date() }) as never)
      .mockImplementationOnce(() => ({ owner: true }));
    const dispatch = root as unknown as {
      processOp(
        req: ModelRequest,
        item: RootQueryEntry,
        index: number,
      ): Promise<{ result: { success: boolean; code: string; data?: unknown } }>;
    };
    const item: RootQueryEntry = {
      target: 'model',
      name: f.Source.modelName,
      op: 'read',
      filter: {},
      args: { select: ['value', '-_id'] },
      options: quiet,
    };
    const bad = await dispatch.processOp(f.request, item, 0),
      good = await dispatch.processOp(f.request, item, 1);
    expect(bad.result).toMatchObject({ success: false, code: 'bad_request' });
    expect(good.result).toMatchObject({ success: true, data: { value: 'yes' } });
    expect(good.result).not.toHaveProperty('context');
    expect(f.adapter.findOne).toHaveBeenCalledTimes(2);
  });
});

describe('OAR-03 live alternate output consumers without read-shaped trust', () => {
  it.each(modes)('new templates remain isolated with configured %s READ/LIST modes', async (mode) => {
    const f = fixture(mode);
    f.hooks.source.mockImplementation((doc: unknown) => {
      (doc as { value: string }).value = 'template-hook-change';
      return { owner: true };
    });
    const result = await f.direct.new({ select: ['-value'] }); // intentionally still ignored by the template API
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected template');
    expect(result.data).toHaveProperty('value', 'yes');
    expect(result.context).toMatchObject({
      operation: 'new',
      virtualAccess: 'create',
      outputAccess: 'create',
      docPermissionsAccess: 'create',
    });
    expect(f.hooks.source).toHaveBeenCalledTimes(1);
    expect(f.adapter.new).toHaveBeenCalledTimes(1);
    expect(f.adapter.findOne).not.toHaveBeenCalled();
  });

  it.each(modes)('create keeps input authority separate and output isolated with %s query modes', async (mode) => {
    const f = fixture(mode);
    f.hooks.source.mockImplementation((doc: unknown) => {
      (doc as { value: string }).value = 'output-hook-change';
      return { owner: true };
    });
    const result = await f.direct.create(
      { value: 'submitted', ownerId: 'actor' },
      { select: ['value', '-_id'] },
      {
        ...quiet,
        authorization: { inputFields: { mode: 'grant', paths: ['value', 'ownerId'] } },
      },
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected create');
    expect(result.data).toEqual([{ value: 'submitted' }]);
    expect(result.contexts[0]).toMatchObject({
      operation: 'create',
      virtualAccess: 'create',
      outputAccess: 'read',
      docPermissionsAccess: 'create',
      docPermissions: { owner: true },
    });
    expect(result.contexts[0]).not.toHaveProperty('originalData');
    expect(f.adapter.create).toHaveBeenCalledTimes(1);
    expect(f.hooks.source).toHaveBeenCalledTimes(1);
  });

  it.each(modes)(
    'update retains negative pre-write facts and mutable lifecycle context with %s query modes',
    async (mode) => {
      const f = fixture(mode),
        doc = new f.Source(f.rows[0]),
        before = { owner: true, suspended: true },
        after = { owner: true, suspended: false };
      const save = vi.spyOn(doc, 'save').mockImplementation(async () => {
        before.suspended = false;
        return doc;
      });
      f.adapter.findOne.mockResolvedValue(doc as never);
      f.runtime.setModelOptions(f.Source.modelName, {
        permissionSchema: { value: { read: (_p, facts) => facts.owner, update: (_p, facts) => !facts.suspended } },
        docPermissions: {
          update: (value, _p, context) => {
            expect(context).not.toHaveProperty('currentDocument');
            expect(context.docPermissions).toBe(EMPTY_DOCUMENT_GRANTS);
            expect(context.operation).toBe('update');
            if (value instanceof mongoose.Document) return before;
            (value as { value: string }).value = 'post-hook-change';
            return after;
          },
        },
        prepare: {
          update: (data, _p, context) => {
            expect(Object.isFrozen(context)).toBe(false);
            expect(context.currentDocument).toBe(doc);
            context.operation = 'mutable-lifecycle-label';
            return data;
          },
        },
      });
      const result = await f.direct.updateOne({}, { value: 'must-not-write' }, { select: ['value', '-_id'] }, quiet);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected update');
      expect(doc.value).toBe('yes');
      expect(result.data).toEqual({ value: 'yes' });
      expect(result.input).toEqual({});
      expect(result.context).toMatchObject({
        operation: 'update',
        outputAccess: 'read',
        docPermissionsAccess: 'update',
        docPermissions: after,
      });
      expect(result.context.docPermissions).not.toBe(before);
      expect(save).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['list', 'read'] as const)(
    'dedicated %s owns parent read facts and always uses isolated child output',
    async (operation) => {
      const f = fixture('trusted'),
        doc = new f.Source({ ...f.rows[0], children: [{ _id: 'child', value: 'stored-child', hidden: 'never' }] });
      f.adapter.findOne.mockResolvedValue(doc as never);
      f.hooks.source.mockImplementation((value: unknown) => {
        (value as { children: { value: string }[] }).children[0].value = 'hook-change';
        return { owner: true };
      });
      const result =
        operation === 'list'
          ? await f.direct.listSub('same', 'children', { select: ['value'] })
          : await f.direct.readSub('same', 'children', 'child', { select: ['value'] });
      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected child output');
      const rows = result.kind === 'list' ? result.data : [result.data];
      expect(rows).toEqual([{ _id: 'child', value: 'stored-child' }]);
      expect(f.hooks.source).toHaveBeenCalledTimes(1);
      expect(doc.children[0].value).toBe('stored-child');
      expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
    },
  );

  it('dedicated post-save invalid facts report 400 without rollback, empty-output disguise or duplicate save', async () => {
    const f = fixture('trusted'),
      doc = new f.Source({ ...f.rows[0], children: [{ _id: 'child', value: 'original' }] });
    const save = vi.spyOn(doc, 'save').mockResolvedValue(doc);
    f.adapter.findOne.mockResolvedValue(doc as never);
    f.runtime.setModelOptions(f.Source.modelName, {
      permissionSchema: {
        children: { read: true, update: true, sub: { value: { read: true, update: (_p, facts) => facts.owner } } },
      },
      docPermissions: { update: () => ({ owner: true }), read: () => ({ invalid: [] }) as never },
    });
    const result = await f.direct.updateSub('same', 'children', 'child', { value: 'persisted' });
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(doc.children[0].value).toBe('persisted');
    expect(save).toHaveBeenCalledTimes(1);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(2);
  });
});

describe('OAR-03 private document guard and target-local source modes', () => {
  it.each(['strip', 'expose-none', 'ordinary'] as const)(
    'document guard survives %s metadata and presentation cannot forge a denial',
    async (posture) => {
      const decorate = vi.fn((doc) => ({ ...doc, _permissions: { owner: true } }));
      const f = fixture('isolated', {
        stripPermissionsField: posture === 'strip',
        exposedDocPermissionKeys: posture === 'expose-none' ? [] : undefined,
        decorate: { read: decorate },
      });
      const middleware = guard({ modelName: f.Source.modelName, id: 'same', condition: 'reader owner' });
      const next = vi.fn();
      await middleware(f.request, {} as never, next);
      expect(next).toHaveBeenCalledWith();
      expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
      f.hooks.source.mockImplementation(() => ({ owner: false }));
      next.mockClear();
      await middleware(f.request, {} as never, next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(JsonRouter.clientErrors.UnauthorizedError);
      expect(f.adapter.findOne).toHaveBeenCalledTimes(2);
      expect(decorate).not.toHaveBeenCalled();
      const normal = await f.public._read('same', undefined, quiet);
      expect(normal.success).toBe(true);
      expect(decorate).toHaveBeenCalledTimes(1);
    },
  );

  it('document guard reports invalid fulfilled facts as 400, not ordinary Unauthorized', async () => {
    const f = fixture();
    f.hooks.source.mockImplementation(() => ({ invalid: [] }) as never);
    const next = vi.fn();
    await guard({ modelName: f.Source.modelName, id: 'same', condition: 'owner' })(f.request, {} as never, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(JsonRouter.clientErrors.BadRequestError);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
    expect(f.hooks.source).toHaveBeenCalledTimes(1);
  });

  it.each(modes)('related targets select their own %s mode, not the parent mode', async (targetMode) => {
    const f = fixture(targetMode === 'isolated' ? 'trusted' : 'isolated');
    f.runtime.setModelOptions(f.Target.modelName, {
      readAuthorizationMode: targetMode,
      permissionSchema: { value: true, hidden: false },
      docPermissions: {
        read: (doc) => {
          (doc as { value: string }).value = 'target-change';
          return { owner: false };
        },
      },
    });
    f.rows[0].ref = f.targetRows[0] as never;
    const result = await f.direct.findOne(
      {},
      { select: ['ref', '-_id'], populate: [{ path: 'ref', select: ['value', 'hidden', '-_id'] }] },
      quiet,
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected related output');
    expect(result.data).toEqual({ ref: { value: targetMode === 'trusted' ? 'target-change' : 'target-value' } });
    const execution = createServiceExecution(
      f.direct,
      access(),
      undefined,
      'service',
      captureRelatedTargets(f.runtime, f.Source.modelName, { populate: 'ref' }),
    );
    const state = readServiceExecution(f.direct, execution);
    const child = readServiceExecution(
      f.target,
      createRelatedExecution(f.target, access(), state.authorization, state.binding, 'ref'),
    );
    expect(readServiceAuthorizationMode(child.authorization, child.binding)).toBe(targetMode);
    expect(getAuthorizationPermissions(child.authorization, child.binding)).toBe(
      getAuthorizationPermissions(state.authorization, state.binding),
    );
  });

  it.each(modes)(
    '%s LIST includes build a shared target once, hide transport FKs and finish before parent getters',
    async (mode) => {
      const f = fixture(mode),
        events: string[] = [];
      f.runtime.setModelOptions(f.Target.modelName, {
        listAuthorizationMode: mode,
        permissionSchema: { value: false, hidden: false, join: false, computed: true },
        docPermissions: {
          list: (doc) => {
            expect(doc).not.toHaveProperty('join');
            return { owner: false };
          },
        },
        virtuals: {
          computed: {
            dependsOn: ['value'],
            get(doc) {
              expect(doc).not.toHaveProperty('join');
              events.push('target');
              return 'target-computed';
            },
          },
        },
      });
      f.runtime.setModelOptions(f.Source.modelName, {
        permissionSchema: { computed: true, join: false },
        virtuals: {
          computed: {
            dependsOn: ['join'],
            get(doc) {
              const children = (doc as { related?: { value?: string; hidden?: string; computed?: string }[] }).related;
              expect(children).toEqual([{ value: 'target-value', computed: 'target-computed' }]);
              events.push('parent');
              return children![0].computed;
            },
          },
        },
      });
      const result = await f.direct.find(
        {},
        {
          select: ['computed', '-_id'],
          include: [
            {
              model: f.Target.modelName,
              op: 'list',
              path: 'related',
              localField: 'join',
              foreignField: 'join',
              args: { select: ['value', 'hidden', 'computed', '-_id'] },
            },
          ],
        },
        {
          ...quiet,
          authorization: {
            related: { related: { model: f.Target.modelName, outputFields: { mode: 'grant', paths: ['value'] } } },
          },
        },
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected includes');
      expect(result.data).toEqual([
        { computed: 'target-computed', related: [{ value: 'target-value', computed: 'target-computed' }] },
        { computed: 'target-computed', related: [{ value: 'target-value', computed: 'target-computed' }] },
      ]);
      expect(events).toEqual(['target', 'parent', 'parent']);
      expect((result.data[0] as { related: unknown[] }).related[0]).not.toBe(
        (result.data[1] as { related: unknown[] }).related[0],
      );
      expect(f.adapters.get(f.Target.modelName)!.find).toHaveBeenCalledTimes(1);
      expect(f.hooks.source).toHaveBeenCalledTimes(2);
    },
  );

  it('a depleted receiving root rejects selected target native work before its wire callback', async () => {
    const f = fixture('trusted');
    f.Target.schema.add({ payload: mongoose.Schema.Types.Mixed });
    f.runtime.setModelOptions(f.Target.modelName, {
      readAuthorizationMode: 'trusted',
      permissionSchema: { payload: true },
    });
    const value = new mongoose.mongo.BSON.Code('safe', { ordinary: 1 }),
      wire = vi.fn(() => value);
    value.toBSON = wire;
    (f.targetRows[0] as Record<string, unknown>).payload = value;
    f.rows[0].ref = f.targetRows[0] as never;
    const parent = createServiceExecution(
      f.direct,
      access(),
      undefined,
      'service',
      captureRelatedTargets(f.runtime, f.Source.modelName, { populate: 'ref' }),
    );
    const state = readServiceExecution(f.direct, parent),
      budget = createPublicationRowBudget(state.publication);
    visitTrustedOutput(budget, 0, 19999);
    const execution = withExecutionOutputBudget(f.direct, parent, () => budget);
    const query = await prepareModelQuery(f.direct, execution, { kind: 'client-read', filter: {} });
    await expect(
      executePreparedFindOne(
        f.direct,
        execution,
        query,
        {
          select: ['ref', '-_id'],
          populate: [{ path: 'ref', select: ['payload', '-_id'] }],
        },
        quiet,
      ),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(wire).not.toHaveBeenCalled();
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
  });

  it.each(['request', 'runtime', 'model', 'modelName'] as const)(
    'authenticates actual receiving %s at dispatch/related derivation',
    (key) => {
      const f = fixture('trusted'),
        execution = createServiceExecution(f.direct, access());
      const receiver = f.direct as unknown as Record<string, unknown>;
      if (key === 'request') receiver.req = {};
      else if (key === 'runtime') receiver.requestRuntime = {};
      else if (key === 'model') receiver.model = { mongooseModel: {} };
      else receiver.modelName = 'wrong';
      expect(() => readServiceExecution(f.direct, execution)).toThrow(ServiceAuthorizationError);
      expect(f.adapter.findOne).not.toHaveBeenCalled();
    },
  );
});

describe('OAR-03 basic source-mode migration and selected-resource poison', () => {
  it.each(['Code', 'DBRef'] as const)(
    'retained %s policy/input normalization bounds containers before BSON serialization',
    (kind) => {
      const fields = {
        oid: new mongoose.mongo.BSON.ObjectId(),
        ...Object.fromEntries(Array.from({ length: 20000 }, (_, index) => [`field${index}`, index])),
      };
      const value =
        kind === 'Code'
          ? new mongoose.mongo.BSON.Code('safe', fields)
          : new mongoose.mongo.BSON.DBRef('collection', new mongoose.mongo.BSON.ObjectId(), undefined, fields);
      const serialize = vi.spyOn(mongoose.mongo.BSON.ObjectId.prototype, 'serializeInto');
      expect(() => copyAuthorizationValue({ native: value })).toThrow(ServiceAuthorizationError);
      expect(serialize).not.toHaveBeenCalled();
    },
  );

  it.each(['constructor', '__proto__', '_doc'] as const)(
    'retained native snapshot rejects protected %s instead of dropping a row constraint',
    (key) => {
      const value = new mongoose.mongo.BSON.Code(
        'safe',
        Object.fromEntries([
          [key, true],
          ['ordinary', 1],
        ]),
      );
      expect(() => copyAuthorizationValue(value)).toThrow(ServiceAuthorizationError);
    },
  );

  it('retained input/config snapshots support bounded native/Map/Set values without subclass iterators', () => {
    const iterator = vi.fn(() => {
      throw new Error('subclass iterator');
    });
    const map = new Map([['key', new Date(1)]]),
      set = new Set([1, 2]);
    map[Symbol.iterator] = iterator;
    set[Symbol.iterator] = iterator;
    const copy = copyAuthorizationValue(
      { map, set, code: new mongoose.mongo.BSON.Code('safe', { ordinary: 1 }) },
      true,
    );
    expect(copy.map.get('key')).toEqual(new Date(1));
    expect(copy.map.get('key')).not.toBe(map.get('key'));
    expect(copy.set).toEqual(new Set([1, 2]));
    expect((copy.code.scope!.ordinary as mongoose.mongo.BSON.Int32).valueOf()).toBe(1);
    expect(iterator).not.toHaveBeenCalled();
  });

  it('captures the source mode before a raw configuration native callback can change its slot', () => {
    const f = fixture(),
      native = new mongoose.mongo.BSON.Code('safe');
    const configuration = {
      catalog: f.configuration.catalog,
      native,
      readAuthorizationMode: 'isolated' as AuthorizationMode,
    };
    native.toBSON = () => {
      configuration.readAuthorizationMode = 'trusted';
      return 'normalized';
    };
    const call = resolveServiceAuthorization({
      binding: f.binding,
      configuration,
      requestPermissions: f.request[PERMISSIONS]!,
      access: access(),
      readResponse: true,
    });
    expect(configuration.readAuthorizationMode).toBe('trusted');
    expect(readServiceAuthorizationMode(call, f.binding)).toBe('isolated');
  });

  it('package-controlled poison error results cannot be mutated into successful publication', () => {
    const error = new ServiceAuthorizationError('controlled');
    expect(() => {
      (error.result as { code: string }).code = 'success';
    }).toThrow(TypeError);
    expect(() => Object.defineProperty(error, 'result', { value: { success: true } })).toThrow(TypeError);
    expect(error.result).toMatchObject({ success: false, code: 'bad_request' });
  });
  it.each(retired.flatMap((key) => [false, undefined].map((value) => ({ key, value }))))(
    'rejects retired $key=$value atomically by presence',
    ({ key, value }) => {
      const f = fixture();
      expect(() =>
        f.runtime.setModelOptions(f.Source.modelName, { [key]: value, stripPermissionsField: false } as never),
      ).toThrow(/removed/);
      expect(f.runtime.getModelOption(f.Source.modelName, 'stripPermissionsField')).toBe(true);
      expect(f.warn).not.toHaveBeenCalled();
    },
  );

  it.each(['inherited', 'non-enumerable'] as const)(
    'rejects %s legacy controls without reading their value',
    (kind) => {
      const f = fixture(),
        observe = vi.fn();
      const inherited = Object.defineProperty({}, retired[0], { get: observe });
      const options =
        kind === 'inherited' ? Object.create(inherited) : Object.defineProperty({}, retired[0], { get: observe });
      expect(() => f.runtime.setDefaultModelOptions(options)).toThrow(/removed/);
      expect(observe).not.toHaveBeenCalled();
    },
  );

  it.each([null, true, 'TRUSTED', {}, []])('rejects invalid mode %s before bulk publication', (value) => {
    const f = fixture();
    expect(() =>
      f.runtime.setModelOptions(f.Source.modelName, {
        readAuthorizationMode: value,
        stripPermissionsField: false,
      } as never),
    ).toThrow(TypeError);
    expect(f.runtime.getModelOption(f.Source.modelName, 'readAuthorizationMode')).toBe('isolated');
    expect(f.runtime.getModelOption(f.Source.modelName, 'stripPermissionsField')).toBe(true);
  });

  it('supports default inheritance/undefined restoration and committed transitions despite logger failure', () => {
    const f = fixture();
    f.runtime.setModelOption(f.Source.modelName, 'readAuthorizationMode', undefined);
    f.runtime.setDefaultModelOption('readAuthorizationMode', 'trusted');
    expect(f.runtime.getModelOption(f.Source.modelName, 'readAuthorizationMode')).toBe('trusted');
    expect(f.runtime.getModelOptions(f.Source.modelName).readAuthorizationMode).toBe('trusted');
    f.warn.mockClear();
    f.warn.mockImplementation(() => {
      throw new Error('logger');
    });
    f.runtime.setModelOption(f.Source.modelName, 'readAuthorizationMode', 'isolated');
    f.runtime.setModelOption(f.Source.modelName, 'readAuthorizationMode', 'trusted');
    f.runtime.setModelOption(f.Source.modelName, 'readAuthorizationMode', 'trusted');
    expect(f.warn).toHaveBeenCalledTimes(1);
    expect(f.runtime.getModelOption(f.Source.modelName, 'readAuthorizationMode')).toBe('trusted');
    f.runtime.setDefaultModelOption('readAuthorizationMode', undefined);
    f.runtime.setModelOption(f.Source.modelName, 'readAuthorizationMode', undefined);
    expect(f.runtime.getModelOption(f.Source.modelName, 'readAuthorizationMode')).toBe('isolated');
    expect(() =>
      f.runtime.setModelOption(f.Source.modelName, 'readAuthorizationMode.extra' as never, 'trusted'),
    ).toThrow(TypeError);
    expect(() => f.runtime.setGlobalOptions({ readAuthorizationMode: 'trusted' } as never)).toThrow(TypeError);
    expect(() => f.runtime.setDataOptions('data', { listAuthorizationMode: 'trusted' } as never)).toThrow(TypeError);
    expect(() => new RootRouter({ readAuthorizationMode: 'trusted' } as never, f.runtime)).toThrow(TypeError);
  });

  it.each(['proxy', 'accessor', 'cycle'] as const)('selected %s failures remain poisoned even if caught', (kind) => {
    const budget = createTrustedOutputBudget();
    const value =
      kind === 'proxy'
        ? new Proxy({}, {})
        : kind === 'accessor'
          ? Object.defineProperty({}, 'selected', { enumerable: true, get: vi.fn() })
          : {};
    if (kind === 'cycle') (value as { cycle?: unknown }).cycle = value;
    expect(() => materializeTrustedOutputValue(value, 'payload', budget, { keep: () => true })).toThrow(
      ServiceAuthorizationError,
    );
    expect(() => materializeTrustedOutputValue('small', 'payload', budget, { keep: () => true })).toThrow(
      ServiceAuthorizationError,
    );
    expect(() => assertTrustedOutputBudget(budget)).toThrow(ServiceAuthorizationError);
  });

  it('shared related budgets debit all recipients before policy/native work, never replenish a depleted row', () => {
    const first = createTrustedOutputBudget(),
      second = createTrustedOutputBudget();
    visitTrustedOutput(first, 0, 19998);
    const shared = createReceivingOutputBudget([
      { budget: first, depth: 1 },
      { budget: second, depth: 2, multiplicity: 2 },
    ]);
    const observe = vi.fn(() => true);
    expect(() => materializeTrustedOutputValue({ a: 1, b: 2 }, 'related', shared, { keep: observe })).toThrow(
      ServiceAuthorizationError,
    );
    expect(observe).toHaveBeenCalledTimes(1);
    expect(() => assertTrustedOutputBudget(first)).toThrow(ServiceAuthorizationError);
  });

  it('getter BODY errors omit, but invalid selected returns poison publication', async () => {
    const f = fixture('trusted', {
      permissionSchema: { computed: true },
      virtuals: {
        computed: () => {
          throw new Error('app');
        },
      },
    });
    expect(await f.direct.findOne({}, { select: ['computed', '-_id'] }, quiet)).toMatchObject({
      success: true,
      data: {},
    });
    f.runtime.setModelOption(f.Source.modelName, 'virtuals', { computed: () => new Proxy({}, {}) });
    expect(await f.direct.findOne({}, { select: ['computed', '-_id'] }, quiet)).toMatchObject({
      success: false,
      code: 'bad_request',
    });
  });

  it('a native callback cannot catch selected overflow and publish a small wire replacement', async () => {
    const f = fixture('trusted'),
      owner = outputPublicationFor(f.call),
      budget = createPublicationRowBudget(owner);
    visitTrustedOutput(budget, 0, 19998);
    const value = new mongoose.mongo.BSON.Code('safe', { value: 1 });
    value.toBSON = () => {
      try {
        materializeTrustedOutputValue({ too: { deep: true } }, 'inner', budget, { keep: () => true });
      } catch {
        /* app catches */
      }
      return 'small';
    };
    expect(() => materializeTrustedOutputValue(value, 'payload', budget, { keep: () => true })).toThrow(
      ServiceAuthorizationError,
    );
    expect(() => assertOutputPublication(owner)).toThrow(ServiceAuthorizationError);
    await expect(closeOutputPublication(owner)).rejects.toBeInstanceOf(ServiceAuthorizationError);
  });

  it('safe dotted selected construction poison is sticky after a caught unsafe path', () => {
    const budget = createTrustedOutputBudget();
    expect(() => setTrustedOutputPath({}, '__proto__.unsafe', 1, budget)).toThrow(ServiceAuthorizationError);
    expect(() => visitTrustedOutput(budget, 0)).toThrow(ServiceAuthorizationError);
  });

  it('a closed publication budget rejects late materialization before observing a native value', async () => {
    const f = fixture(),
      owner = outputPublicationFor(f.call),
      budget = createPublicationRowBudget(owner),
      wire = vi.fn();
    await closeOutputPublication(owner);
    const value = new mongoose.mongo.BSON.Code('safe', {});
    value.toBSON = wire;
    expect(() => materializeTrustedOutputValue(value, 'late', budget, { keep: () => true })).toThrow(
      ServiceAuthorizationError,
    );
    expect(wire).not.toHaveBeenCalled();
  });

  it('a privately retained stage is already closed before actual application decorators', async () => {
    const f = fixture(),
      stage = createDocumentStage(f.call, f.binding, f.rows[0]);
    const plan = planAuthorizedModelProjection({
      authorization: f.call,
      binding: f.binding,
      requestedSelect: ['value', '-_id'],
    });
    let context!: ModelOutputContext;
    const output = await finalizeModelOutput({
      receivingModelName: f.Source.modelName,
      input: documentStageSource(stage, f.binding),
      request: f.request,
      ...access(),
      snapshot: f.configuration,
      plan,
      documentStage: stage,
      onFinalized: (_output, diagnostic) => {
        context = diagnostic;
        expect(() => readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
      },
    });
    const decorate = vi.fn((doc) => ({ ...doc, presentation: true }));
    f.runtime.setModelOption(f.Source.modelName, 'decorate', { read: decorate });
    expect(await f.direct.decorate(output, 'read', context)).toEqual({ value: 'yes', presentation: true });
    expect(decorate).toHaveBeenCalledTimes(1);
    expect(() => readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
  });
});
