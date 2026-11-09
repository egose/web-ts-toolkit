import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Permission from '../../src/permission';
import { AccessRuntime } from '../../src/runtime';
import { Core } from '../../src/core';
import { runWithRuntime } from '../../src/runtime-context';
import { PublicService } from '../../src/services/public-service';
import { PERMISSIONS } from '../../src/symbols';
import type { AuthorizationMode, ModelRequest, ModelRouterOptions } from '../../src/interfaces';
import {
  readServiceAuthorizationMode,
  resolveServiceAuthorization,
  ServiceAuthorizationError,
  type AuthorizationBinding,
  type ResolveServiceAuthorizationInput,
} from '../../src/acl/service-authorization';
import {
  closeDocumentStage,
  prepareQueryDocumentStage,
  readDocumentStage,
  resolveDocumentStage,
} from '../../src/acl/document-stage';
import { normalizeOutputAuthorizationOptions } from '../../src/acl/output-helper-options';
import {
  authorizationModeKeys,
  retiredAuthorizationOptions,
  serverAuthorizationControls,
} from '../../src/acl/authorization-modes';
import { captureModelAuthorizationConfiguration } from '../../src/acl/model-output-planning';
import { createServiceExecution, deriveServiceExecution, readServiceExecution } from '../../src/acl/service-execution';
import { authorizeEmbeddedOutputPlan } from '../../src/acl/output-field-filter';
import { planAuthorizedModelProjection } from '../../src/acl/output-projection';
import {
  assertPublicAdmission,
  assertPublicDefaults,
  PublicAdmissionError,
} from '../../src/validation/public-admission';
import { deferred } from '../support/public/hook-admission-fixture';

const catalog = { paths: ['value', 'child', 'child.value', 'ref'], referencePaths: ['ref'] };
const permissions = new Permission({ reader: true });
const modes: AuthorizationMode[] = ['isolated', 'trusted'];
const access = (operation: string, effective = operation) => ({
  operation,
  rowAccess: effective,
  outputAccess: effective,
  virtualAccess: effective,
  docPermissionsAccess: effective,
});
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
let serial = 0;

function call(
  options: Record<string, unknown> = {},
  operation = 'list',
  extra: Partial<ResolveServiceAuthorizationInput> = {},
) {
  const input: ResolveServiceAuthorizationInput = {
    binding: { request: {} as ModelRequest, runtime: {}, model: {}, modelName: 'ModeOptions' },
    configuration: { catalog, ...options },
    access: access(operation),
    requestPermissions: permissions,
    listResponse: operation === 'list',
    readResponse: operation === 'read',
    ...extra,
  };
  return { input, binding: input.binding, authorization: resolveServiceAuthorization(input) };
}
type State = Pick<ReturnType<typeof call>, 'authorization' | 'binding'>;
const mode = (state: State) => readServiceAuthorizationMode(state.authorization, state.binding);

function fixture(options: ModelRouterOptions = {}) {
  const runtime = new AccessRuntime();
  const warn = vi.fn();
  runtime.setGlobalOptions({ logger: { warn } });
  const model = mongoose.model(
    `ModeOptions${++serial}`,
    new mongoose.Schema({ value: String, child: { value: String } }),
  );
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    permissionSchema: { value: true, child: { list: true, read: true, sub: { value: true } } },
    ...options,
  });
  const request = { [PERMISSIONS]: permissions } as unknown as ModelRequest;
  const adapter = {
    mongooseModel: model,
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
  };
  const service = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    return new (class extends PublicService {
      protected createModelAdapter() {
        return adapter;
      }
    })(request, model.modelName);
  });
  const capture = (operation = 'list') => {
    const execution = createServiceExecution(service, access(operation));
    return { execution, ...readServiceExecution(service, execution) };
  };
  return { runtime, warn, model, service, adapter, capture };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^ModeOptions/);
});

describe('captured source modes replace flags, prerequisites and dormant profiles', () => {
  it('has exactly four independent mode keys and ten rejection-only retired names', () => {
    expect(authorizationModeKeys).toEqual([
      'readAuthorizationMode',
      'listAuthorizationMode',
      'createAuthorizationMode',
      'updateAuthorizationMode',
    ]);
    expect(retiredAuthorizationOptions).toHaveLength(10);
    expect(new Set(serverAuthorizationControls).size).toBe(14);
  });

  it.each(modes.flatMap((read) => modes.map((list) => ({ read, list }))))(
    'captures read=$read/list=$list with embedded inheritance, own target modes and READ-origin retry',
    ({ read, list }) => {
      for (const origin of ['read', 'list'] as const) {
        const targetOptions = { readAuthorizationMode: list, listAuthorizationMode: read };
        const targetModel = fixture().model;
        const root = call({ readAuthorizationMode: read, listAuthorizationMode: list }, origin, {
          relatedTargets: [
            {
              path: 'ref',
              modelName: 'Other',
              model: targetModel as never,
              configuration: { catalog, ...targetOptions },
            },
          ],
        });
        expect(mode(root)).toBe(origin === 'read' ? read : list);
        const child = call(targetOptions, origin, {
          binding: { ...root.binding, scopePath: ['child'] },
          parent: root.authorization,
          snapshotDerivation: { kind: 'embedded', parentBinding: root.binding },
        });
        expect(mode(child)).toBe(mode(root));
        for (const effective of ['read', 'list'] as const) {
          const related = call({}, effective, {
            binding: { ...root.binding, model: targetModel, modelName: 'Other' },
            parent: root.authorization,
            snapshotDerivation: { kind: 'related', parentBinding: root.binding, path: 'ref' },
          });
          expect(mode(related)).toBe(targetOptions[`${effective}AuthorizationMode`]);
        }
        if (origin === 'read') {
          const retry = call({}, 'read', {
            binding: root.binding,
            access: access('read', 'list'),
            parent: root.authorization,
            snapshotDerivation: { kind: 'retry', parentBinding: root.binding },
          });
          expect(mode(retry)).toBe(read);
        }
      }
    },
  );

  it.each(modes)(
    'authenticates every %s mode read, repeated reads, receiving service and derived edge',
    (sourceMode) => {
      const root = call({ readAuthorizationMode: sourceMode }, 'read');
      for (const key of ['request', 'runtime', 'model', 'modelName', 'scopePath']) {
        const wrong = {
          ...root.binding,
          [key]: key === 'modelName' ? 'Other' : key === 'scopePath' ? ['child'] : {},
        } as AuthorizationBinding;
        for (let repeat = 0; repeat < 2; repeat++) {
          expect(() => readServiceAuthorizationMode(root.authorization, wrong)).toThrow(ServiceAuthorizationError);
          expect(() => readServiceAuthorizationMode({ ...root.authorization }, root.binding)).toThrow(
            ServiceAuthorizationError,
          );
        }
        expect(() =>
          call({}, 'read', {
            binding: root.binding,
            parent: root.authorization,
            snapshotDerivation: { kind: 'retry', parentBinding: wrong },
          }),
        ).toThrow(ServiceAuthorizationError);
      }
      const f = fixture();
      expect(() => readServiceExecution(fixture().service, f.capture().execution)).toThrow(ServiceAuthorizationError);
    },
  );

  it('requires actual target model identity, path, scope and unchanged embedded access', () => {
    const target = {};
    const root = call({ readAuthorizationMode: 'trusted' }, 'read', {
      relatedTargets: [{ path: 'ref', modelName: 'Other', model: target as never, configuration: { catalog } }],
    });
    for (const change of [{ model: {} }, { modelName: 'Wrong' }, { scopePath: ['child'] }])
      expect(() =>
        call({}, 'read', {
          binding: { ...root.binding, model: target, modelName: 'Other', ...change },
          parent: root.authorization,
          snapshotDerivation: { kind: 'related', parentBinding: root.binding, path: 'ref' },
        }),
      ).toThrow(ServiceAuthorizationError);
    expect(() =>
      call({}, 'read', {
        binding: { ...root.binding, model: target, modelName: 'Other' },
        parent: root.authorization,
        snapshotDerivation: { kind: 'related', parentBinding: root.binding, path: 'missing' },
      }),
    ).toThrow(ServiceAuthorizationError);
    for (const changed of [access('update', 'read'), { ...access('read'), virtualAccess: 'update' }])
      expect(() =>
        call({}, 'read', {
          binding: { ...root.binding, scopePath: ['child'] },
          access: changed,
          parent: root.authorization,
          snapshotDerivation: { kind: 'embedded', parentBinding: root.binding },
        }),
      ).toThrow(ServiceAuthorizationError);
  });

  it.each([
    'new',
    'create',
    'update',
    'upsert',
    'delete',
    'subRead',
    'subList',
    'readSub',
    'listSub',
    'count',
    'distinct',
  ])('%s and write-derived reads do not gain trust through read-shaped output', async (operation) => {
    const root = call(
      {
        readAuthorizationMode: 'trusted',
        listAuthorizationMode: 'trusted',
        createAuthorizationMode: 'trusted',
        updateAuthorizationMode: 'trusted',
      },
      operation,
      { access: access(operation, 'read') },
    );
    expect(mode(root)).toBe('isolated');
    const source = { value: 'source', date: new Date(1) };
    const prepared = prepareQueryDocumentStage(root.authorization, root.binding, source);
    await resolveDocumentStage(prepared.stage, (doc) => {
      doc.value = 'hook-write';
      (doc.date as Date).setTime(99);
      return { owner: true };
    });
    expect(prepared.borrowed).toBe(false);
    expect(prepared.source).toMatchObject({ value: 'source', date: new Date(1) });
    expect(source).toEqual({ value: 'source', date: new Date(1) });
    closeDocumentStage(prepared.stage);
    expect(
      mode(
        call({ readAuthorizationMode: 'trusted' }, 'read', {
          parent: root.authorization,
          binding: root.binding,
          snapshotDerivation: { kind: 'retry', parentBinding: root.binding },
        }),
      ),
    ).toBe('isolated');
  });

  it.each(modes)(
    '%s changes only source borrowing; boolean facts, closure and raw helpers stay owned',
    async (sourceMode) => {
      const f = fixture({ readAuthorizationMode: sourceMode });
      const state = f.capture('read');
      const source = { value: 'source', date: new Date(1) };
      const rawFacts = { owner: true };
      const prepared = prepareQueryDocumentStage(state.authorization, state.binding, source);
      await resolveDocumentStage(prepared.stage, (doc) => {
        (doc.date as Date).setTime(99);
        return rawFacts;
      });
      expect(source.date.getTime()).toBe(sourceMode === 'trusted' ? 99 : 1);
      rawFacts.owner = false;
      const facts = readDocumentStage(prepared.stage, state.binding).grants;
      expect(facts).toEqual({ owner: true });
      expect(facts).not.toBe(rawFacts);
      expect(Object.isFrozen(facts)).toBe(true);
      f.runtime.setModelOption(
        f.model.modelName,
        'readAuthorizationMode',
        sourceMode === 'trusted' ? 'isolated' : 'trusted',
      );
      expect(mode(state)).toBe(sourceMode);
      expect(mode(f.capture('read'))).not.toBe(sourceMode);
      const raw = normalizeOutputAuthorizationOptions(
        {
          binding: state.binding,
          access: access('read'),
          requestPermissions: permissions,
          configuration: captureModelAuthorizationConfiguration(f.runtime, f.model.modelName),
        },
        {},
      );
      expect(mode({ ...state, authorization: raw.authorization })).toBe('isolated');
      closeDocumentStage(prepared.stage);
      expect(() => readDocumentStage(prepared.stage, state.binding)).toThrow(ServiceAuthorizationError);
      await expect(
        f.service.pickAllowedFields({ value: 'output' }, 'read', { documentAuthorization: prepared.stage } as never),
      ).rejects.toMatchObject({
        result: { code: 'bad_request', errors: [{ detail: expect.stringContaining('removed') }] },
      });
    },
  );

  it.each(['read', 'list'] as const)(
    'retains captured %s in late embedded/retry stages, not fresh calls',
    async (origin) => {
      for (const initial of modes) {
        const f = fixture({ [`${origin}AuthorizationMode`]: initial });
        const state = f.capture(origin);
        const entered = deferred();
        const release = deferred();
        const stage = prepareQueryDocumentStage(state.authorization, state.binding, { value: 'row' }).stage;
        const pending = resolveDocumentStage(stage, async () => {
          entered.resolve();
          await release.promise;
          return {};
        });
        await entered.promise;
        try {
          f.runtime.setModelOption(
            f.model.modelName,
            `${origin}AuthorizationMode`,
            initial === 'trusted' ? 'isolated' : 'trusted',
          );
        } finally {
          release.resolve();
        }
        await pending;
        const plan = planAuthorizedModelProjection({ authorization: state.authorization, binding: state.binding });
        const child = authorizeEmbeddedOutputPlan(plan, plan.childPlans.child);
        expect(readServiceAuthorizationMode(child.authorization!, child.authorizationBinding!)).toBe(initial);
        if (origin === 'read')
          expect(
            mode(
              readServiceExecution(
                f.service,
                deriveServiceExecution(f.service, state.execution, access('read', 'list')),
              ),
            ),
          ).toBe(initial);
        expect(mode(f.capture(origin))).not.toBe(initial);
        closeDocumentStage(stage);
      }
    },
  );
});

describe('effective owner/access warnings and undefined restoration', () => {
  it.each(authorizationModeKeys)(
    '%s warns only on an effective transition into trusted, never on calls or repeated assignment',
    (key) => {
      const f = fixture();
      const name = f.model.modelName;
      f.runtime.setModelOption(name, key, 'trusted');
      expect(f.warn).toHaveBeenCalledTimes(1);
      expect(f.warn.mock.calls[0][1]).toEqual({
        modelName: name,
        access: key.slice(0, -'AuthorizationMode'.length),
        category: 'trustedAuthorizationSource',
      });
      f.runtime.setModelOptions(name, { [key]: 'trusted' });
      f.capture('read');
      f.capture('list');
      expect(f.warn).toHaveBeenCalledTimes(1);
      f.runtime.setModelOption(name, key, 'isolated');
      f.runtime.setModelOption(name, key, undefined);
      expect(f.warn).toHaveBeenCalledTimes(1);
      f.runtime.setDefaultModelOption(key, 'trusted');
      expect(f.warn.mock.calls.slice(1).map((entry) => entry[1].modelName)).toEqual(['default-model', name]);
      f.runtime.setDefaultModelOptions({ [key]: 'trusted' });
      expect(f.warn).toHaveBeenCalledTimes(3);
      f.runtime.setDefaultModelOption(key, undefined);
      expect(f.runtime.getModelOptions(name)[key]).toBe('isolated');
      expect(f.warn).toHaveBeenCalledTimes(3);
    },
  );

  it.each(authorizationModeKeys)(
    '%s publishes every inheriting owner before warnings and stays runtime-local',
    (key) => {
      const f = fixture();
      const explicit = mongoose.model(`ModeOptions${++serial}`, new mongoose.Schema({ value: String }));
      const inherited = mongoose.model(`ModeOptions${++serial}`, new mongoose.Schema({ value: String }));
      for (const model of [explicit, inherited]) f.runtime.registerModelInstance(model.modelName, model);
      f.runtime.setModelOptions(explicit.modelName, { [key]: 'isolated' });
      f.runtime.setModelOptions(inherited.modelName, {});
      const observations: boolean[] = [];
      f.warn.mockImplementation(() => {
        observations.push(
          f.runtime.getDefaultModelOption(key) === 'trusted' &&
            f.runtime.getModelOption(f.model.modelName, key) === 'trusted' &&
            f.runtime.getModelOption(inherited.modelName, key) === 'trusted' &&
            f.runtime.getModelOption(explicit.modelName, key) === 'isolated',
        );
      });
      f.runtime.setDefaultModelOptions({ [key]: 'trusted' });
      expect(observations).toEqual([true, true, true]);
      expect(f.warn.mock.calls.map((entry) => entry[1].modelName)).toEqual([
        'default-model',
        f.model.modelName,
        inherited.modelName,
      ]);
      const other = new AccessRuntime();
      other.registerModelInstance(f.model.modelName, f.model);
      expect(other.getDefaultModelOption(key)).toBe('isolated');
      expect(other.getModelOption(f.model.modelName, key)).toBe('isolated');
      const lazy = mongoose.model(`ModeOptions${++serial}`, new mongoose.Schema({ value: String }));
      f.runtime.registerModelInstance(lazy.modelName, lazy);
      f.runtime.getModelOptions(lazy.modelName);
      f.runtime.getModelOptions(lazy.modelName);
      expect(f.warn.mock.calls.at(-1)![1].modelName).toBe(lazy.modelName);
      expect(f.warn).toHaveBeenCalledTimes(4);
    },
  );

  it('owns the entire warning transition before a logger reenters and tolerates logger failure after commit', () => {
    const f = fixture();
    let reentered = false;
    f.warn.mockImplementation(() => {
      if (reentered) return;
      reentered = true;
      f.runtime.setModelOptions(f.model.modelName, {
        readAuthorizationMode: 'isolated',
        listAuthorizationMode: 'isolated',
        createAuthorizationMode: 'isolated',
        updateAuthorizationMode: 'isolated',
      });
    });
    f.runtime.setDefaultModelOptions({
      readAuthorizationMode: 'trusted',
      listAuthorizationMode: 'trusted',
      createAuthorizationMode: 'trusted',
      updateAuthorizationMode: 'trusted',
    });
    expect(f.warn.mock.calls.map((entry) => entry[1])).toEqual([
      { modelName: 'default-model', access: 'read', category: 'trustedAuthorizationSource' },
      { modelName: 'default-model', access: 'list', category: 'trustedAuthorizationSource' },
      { modelName: 'default-model', access: 'create', category: 'trustedAuthorizationSource' },
      { modelName: 'default-model', access: 'update', category: 'trustedAuthorizationSource' },
      { modelName: f.model.modelName, access: 'read', category: 'trustedAuthorizationSource' },
      { modelName: f.model.modelName, access: 'list', category: 'trustedAuthorizationSource' },
      { modelName: f.model.modelName, access: 'create', category: 'trustedAuthorizationSource' },
      { modelName: f.model.modelName, access: 'update', category: 'trustedAuthorizationSource' },
    ]);
    expect(mode(f.capture('read'))).toBe('isolated');
    f.warn.mockImplementation(() => {
      throw new Error('logger unavailable');
    });
    expect(() =>
      f.runtime.setModelOptions(f.model.modelName, {
        readAuthorizationMode: undefined,
        listAuthorizationMode: undefined,
        createAuthorizationMode: undefined,
        updateAuthorizationMode: undefined,
      }),
    ).not.toThrow();
    expect(mode(f.capture())).toBe('trusted');
    for (const key of authorizationModeKeys) expect(f.runtime.getModelOption(f.model.modelName, key)).toBe('trusted');
    const count = f.warn.mock.calls.length;
    f.runtime.setModelOptions(f.model.modelName, {
      readAuthorizationMode: undefined,
      listAuthorizationMode: undefined,
      createAuthorizationMode: undefined,
      updateAuthorizationMode: undefined,
    });
    expect(f.warn).toHaveBeenCalledTimes(count);
  });
});

describe('presence-based public/default/service/policy/helper lanes', () => {
  it.each(serverAuthorizationControls)(
    'rejects %s in every control lane without observing slot values',
    async (key) => {
      const f = fixture();
      const getter = vi.fn(() => {
        throw new Error('control getter');
      });
      for (const controls of [
        { [key]: false },
        { [key]: undefined },
        Object.create({ [key]: undefined }),
        Object.defineProperty({}, key, { value: false }),
        Object.defineProperty({}, key, { get: getter }),
      ]) {
        for (const input of [
          controls,
          { args: controls },
          { options: controls },
          { include: [{ options: controls }] },
          { populate: [{ args: { options: controls } }] },
          { filter: { nested: { $$sq: { options: controls } } } },
          { data: { $$sq: { args: { populate: [{ options: controls }] } } } },
        ]) {
          expect(() => assertPublicAdmission(input)).toThrow(PublicAdmissionError);
          for (const method of ['find', 'findOne'] as const) {
            expect(await f.service[method]({}, input as never, quiet)).toMatchObject({
              success: false,
              code: 'bad_request',
            });
            expect(await f.service[method]({}, {}, input as never)).toMatchObject({
              success: false,
              code: 'bad_request',
            });
          }
        }
        for (const options of [controls, { authorization: controls }]) {
          for (const invoke of [
            () => f.service.create({}, {}, options as never),
            () => f.service.updateOne({}, {}, {}, options as never),
            () => f.service.updateById('id', {}, {}, options as never),
            () => f.service.upsert({}, {}, {}, options as never),
            () => f.service.new({}, options as never),
            () => f.service._create({}, {}, options as never),
            () => f.service._update('id', {}, {}, options as never),
            () => f.service._upsert({}, {}, options as never),
          ]) {
            expect(await invoke()).toMatchObject({ success: false, code: 'bad_request' });
          }
        }
        for (const bucket of [
          'findArgs',
          'findOneOptions',
          'findByIdArgs',
          'publicReadOptions',
          'publicListOptions',
          'createOptions',
          'updateOneOptions',
          'upsertOptions',
          'existsOptions',
        ]) {
          for (const defaults of [
            { [bucket]: controls },
            Object.create({ [bucket]: controls }),
            Object.defineProperty({}, bucket, { value: controls }),
          ]) {
            expect(() => assertPublicDefaults(defaults)).toThrow(PublicAdmissionError);
            expect(() => f.runtime.setModelOption(f.model.modelName, 'defaults', defaults)).toThrow();
            expect(() => f.runtime.setDefaultModelOptions({ defaults } as never)).toThrow();
            expect(() => {
              f.service.defaults = defaults;
            }).toThrow(PublicAdmissionError);
          }
        }
        for (const authorization of [
          controls,
          { rows: controls },
          { outputFields: controls },
          { inputFields: controls },
          { related: { ref: { model: 'Other', operation: controls } } },
        ])
          expect(() => call({}, 'list', { authorization })).toThrow(ServiceAuthorizationError);
        for (const options of [controls, { authorization: controls }]) {
          await expect(f.service.pickAllowedFields({ value: 'v' }, 'read', options as never)).rejects.toThrow(
            ServiceAuthorizationError,
          );
          await expect(f.service.genSelect('read', undefined, options as never)).rejects.toThrow(
            ServiceAuthorizationError,
          );
          await expect(f.service.genPopulate('read', undefined, options as never)).rejects.toThrow(
            ServiceAuthorizationError,
          );
        }
      }
      expect(getter).not.toHaveBeenCalled();
      expect(f.adapter.find).not.toHaveBeenCalled();
      expect(f.adapter.findOne).not.toHaveBeenCalled();
      expect(f.warn).not.toHaveBeenCalled();
    },
  );

  it.each(serverAuthorizationControls)('%s on Object.prototype still rejects before copying erases it', (key) => {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
    Object.defineProperty(Object.prototype, key, { value: undefined, configurable: true });
    try {
      expect(() => assertPublicAdmission({ options: {} })).toThrow(PublicAdmissionError);
      expect(() => assertPublicDefaults({ findOptions: {} })).toThrow(PublicAdmissionError);
      expect(() => call({}, 'read', { authorization: {} })).toThrow(ServiceAuthorizationError);
    } finally {
      if (previous) Object.defineProperty(Object.prototype, key, previous);
      else Reflect.deleteProperty(Object.prototype, key);
    }
  });

  it('does not invoke default bucket accessors, and bounds cyclic/shared/deep/array admission', () => {
    const getter = vi.fn(() => ({ readAuthorizationMode: 'trusted' }));
    expect(() =>
      assertPublicDefaults(Object.defineProperty({}, 'findOptions', { get: getter, enumerable: true })),
    ).toThrow(PublicAdmissionError);
    expect(getter).not.toHaveBeenCalled();
    const cycle: Record<string, unknown> = {};
    cycle.options = cycle;
    expect(() => assertPublicAdmission(cycle)).not.toThrow();
    let deep: object = {};
    for (let index = 0; index < 102; index++) deep = { options: deep };
    expect(() => assertPublicAdmission(deep)).toThrow(PublicAdmissionError);
    expect(() => assertPublicAdmission({ include: Array(20001) })).toThrow(PublicAdmissionError);
  });

  it.each(serverAuthorizationControls)(
    '%s stays inert in business predicates, selection and scoped backend row filters',
    async (key) => {
      const f = fixture();
      const input = {
        filter: { [key]: true },
        match: { [key]: true },
        data: { [key]: true, options: { [key]: true } },
        select: [key],
      };
      expect(() => assertPublicAdmission(input)).not.toThrow();
      expect(() => assertPublicDefaults({ findArgs: input })).not.toThrow();
      expect(() =>
        call({}, 'list', { authorization: { rows: { mode: 'scope', filter: { [key]: true } } } }),
      ).not.toThrow();
      expect(
        await f.service.find(
          { [key]: true } as never,
          { select: [key] },
          { ...quiet, authorization: { rows: { mode: 'scope', filter: { [key]: true } } } },
        ),
      ).toMatchObject({ success: true });
      expect(
        await f.service.find(
          {},
          {},
          { ...quiet, authorization: { rows: { mode: 'unrestricted' }, outputFields: { mode: 'unrestricted' } } },
        ),
      ).toMatchObject({ success: true });
    },
  );
});
