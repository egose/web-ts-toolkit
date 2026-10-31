import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { Core } from '../src/core';
import { runWithRuntime } from '../src/runtime-context';
import { PublicService } from '../src/services/public-service';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest, ModelRouterOptions } from '../src/interfaces';
import {
  readAuthorizationFastPath,
  requiresDocumentSnapshotChecks,
  requiresOutputSnapshotChecks,
  resolveServiceAuthorization,
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
  normalizeOutputAuthorizationOptions,
  readDocumentAuthorization,
  resolveDocumentAuthorization,
} from '../src/acl/document-authorization';
import {
  authorizationFastPathPrerequisites,
  unsafeAuthorizationFastPathOptions as fastFlags,
  unsafeInitialOutputCopyOptions,
  unsafeServerOptions,
  unsafeSnapshotCheckOptions,
  unsafeSnapshotOptions,
} from '../src/acl/unsafe-snapshot-options';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import { createServiceExecution, deriveServiceExecution, readServiceExecution } from '../src/acl/service-execution';
import { authorizeEmbeddedOutputPlan } from '../src/acl/output-field-filter';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { assertPublicAdmission, assertPublicDefaults, PublicAdmissionError } from '../src/validation/public-admission';
import * as snapshots from '../src/acl/authorization-snapshot';

const catalog = { paths: ['value', 'child', 'child.value', 'ref'], referencePaths: ['ref'] };
const permissions = new Permission({ reader: true });
const access = (operation: string, effective = operation) => ({
  operation,
  rowAccess: effective,
  outputAccess: effective,
  virtualAccess: effective,
  docPermissionsAccess: effective,
});
const on = Object.fromEntries(unsafeServerOptions.map((key) => [key, true]));
const off = Object.fromEntries(unsafeServerOptions.map((key) => [key, false]));
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
let serial = 0;

function call(
  options: Record<string, unknown> = {},
  operation = 'list',
  extra: Partial<ResolveServiceAuthorizationInput> = {},
) {
  const input: ResolveServiceAuthorizationInput = {
    binding: { request: {} as ModelRequest, runtime: {}, model: {}, modelName: 'FastOptions' },
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
const mode = (state: State) => readAuthorizationFastPath(state.authorization, state.binding);

function fixture(options: ModelRouterOptions = {}) {
  const runtime = new AccessRuntime(),
    warn = vi.fn();
  runtime.setGlobalOptions({ logger: { warn } });
  const model = mongoose.model(
    `FastOptions${++serial}`,
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
  mongoose.deleteModel(/^FastOptions/);
});

describe('private captured fast-path selection (runtime transition from configuration-only FP-02)', () => {
  it('keeps the original six/two/eight groups and adds a separate two/ten group', () => {
    expect(unsafeSnapshotCheckOptions).toHaveLength(6);
    expect(unsafeInitialOutputCopyOptions).toHaveLength(2);
    expect(unsafeSnapshotOptions).toEqual([...unsafeSnapshotCheckOptions, ...unsafeInitialOutputCopyOptions]);
    expect(fastFlags).toEqual(['unsafeUseListAuthorizationFastPath', 'unsafeUseReadAuthorizationFastPath']);
    expect(unsafeServerOptions).toEqual([...unsafeSnapshotOptions, ...fastFlags]);
  });

  it.each(Array.from({ length: 256 }, (_, mask) => mask))(
    'selects all 4 new pairs x both origins independently of original eight mask=%s',
    (mask) => {
      const original = Object.fromEntries(unsafeSnapshotOptions.map((key, index) => [key, !!(mask & (1 << index))]));
      for (let pair = 0; pair < 4; pair++)
        for (const origin of ['list', 'read'] as const) {
          const options = {
            ...original,
            ...Object.fromEntries(fastFlags.map((key, index) => [key, !!(pair & (1 << index))])),
          };
          const inverse = Object.fromEntries(unsafeServerOptions.map((key) => [key, !options[key]]));
          const root = call(options, origin, {
            relatedTargets: [{ path: 'ref', modelName: 'Other', configuration: { catalog, ...inverse } }],
          });
          const prereqs = authorizationFastPathPrerequisites(origin);
          const bits = prereqs.reduce((bits, key, index) => bits | (options[key] ? 1 << index : 0), 0);
          const requested = options[origin === 'list' ? fastFlags[0] : fastFlags[1]];
          const expected = {
            origin,
            mode: !requested ? 'off' : bits === 15 ? 'active' : 'dormant',
            prerequisites: bits,
          };
          expect(mode(root)).toEqual(expected);
          expect(Object.isFrozen(mode(root))).toBe(true);
          expect(requiresDocumentSnapshotChecks(root.authorization, root.binding)).toBe(!options[prereqs[0]]);
          expect(requiresOutputSnapshotChecks(root.authorization, root.binding)).toBe(!options[prereqs[1]]);
          expect(skipsInitialOutputSnapshotCopy(root.authorization)).toBe(options[prereqs[1]] && options[prereqs[3]]);
          const child = call(inverse, origin, {
            binding: { ...root.binding, scopePath: ['child'] },
            parent: root.authorization,
            snapshotDerivation: { kind: 'embedded', parentBinding: root.binding },
          });
          expect(mode(child)).toBe(mode(root));
          expect(requiresDocumentSnapshotChecks(child.authorization, child.binding)).toBe(!options[prereqs[2]]);
          for (const operation of ['list', 'read']) {
            const related = call(inverse, operation, {
              binding: { ...root.binding, model: {}, modelName: 'Other' },
              parent: root.authorization,
              readResponse: false,
              listResponse: false,
              snapshotDerivation: { kind: 'related', parentBinding: root.binding, path: 'ref' },
            });
            expect(mode(related)).toBe(mode(root));
          }
          if (origin === 'read') {
            const retry = call(inverse, 'read', {
              binding: root.binding,
              access: access('read', 'list'),
              parent: root.authorization,
              snapshotDerivation: { kind: 'retry', parentBinding: root.binding },
            });
            expect(mode(retry)).toBe(mode(root));
          }
        }
    },
  );

  it.each(['list', 'read'] as const)(
    'requires literal true for every %s prerequisite/request, even before native cloning',
    (origin) => {
      const key = origin === 'list' ? fastFlags[0] : fastFlags[1];
      const keys = [key, ...authorizationFastPathPrerequisites(origin)];
      for (const flag of keys)
        for (const value of [undefined, false, null, 0, 1, 'true', {}]) {
          const state = call({ ...on, [flag]: value }, origin);
          expect(mode(state)?.mode).toBe(flag === key ? 'off' : 'dormant');
        }
      for (const flag of keys) {
        const wire = vi.fn(() => true);
        const native = Object.assign(new mongoose.mongo.BSON.ObjectId(), { toBSON: wire });
        const state = call({ ...on, [flag]: native }, origin);
        expect(wire).toHaveBeenCalled();
        expect(mode(state)?.mode).toBe(flag === key ? 'off' : 'dormant');
      }
      const getter = vi.fn(() => true);
      expect(() =>
        call({}, origin, { configuration: Object.defineProperty({ catalog }, key, { get: getter, enumerable: true }) }),
      ).toThrow(ServiceAuthorizationError);
      expect(getter).not.toHaveBeenCalled();
      expect(mode(call({}, origin))).toEqual({ origin, mode: 'off', prerequisites: 0 });
    },
  );

  it('requires authenticated edges, exact optional target identity, binding and query access', () => {
    const targetModel = fixture().model,
      root = call(on, 'read', {
        relatedTargets: [
          { path: 'ref', modelName: 'Other', model: targetModel as never, configuration: { catalog } },
          { path: 'total', modelName: 'Other', kind: 'count', configuration: { catalog } },
        ],
      });
    for (const extra of [
      { parent: root.authorization, binding: root.binding }, // even readResponse alone is not retry admission
      { binding: { ...root.binding, scopePath: ['child'] } },
      { applicability: 'output' as const },
      { applicability: 'mutation' as const },
      { applicability: 'create' as const },
      { access: { ...access('read'), virtualAccess: 'update' } },
      { listResponse: false, readResponse: false },
    ])
      expect(mode(call(on, 'read', extra))).toBeUndefined();
    const related = (model: object, path = 'ref') =>
      call(on, 'read', {
        binding: { ...root.binding, model, modelName: 'Other' },
        parent: root.authorization,
        readResponse: false,
        snapshotDerivation: { kind: 'related', parentBinding: root.binding, path },
      });
    expect(mode(related(targetModel))?.mode).toBe('active');
    expect(mode(related({}))).toBeUndefined();
    expect(mode(related(targetModel, 'total'))).toBeUndefined();
    expect(mode(related(targetModel, 'missing'))).toBeUndefined();
    for (const key of ['request', 'runtime', 'model', 'modelName', 'scopePath']) {
      const binding = { ...root.binding, [key]: key === 'modelName' ? 'Other' : key === 'scopePath' ? ['child'] : {} };
      for (let repeat = 0; repeat < 2; repeat++) {
        expect(() => readAuthorizationFastPath(root.authorization, binding as AuthorizationBinding)).toThrow(
          ServiceAuthorizationError,
        );
        expect(() => readAuthorizationFastPath({ ...root.authorization }, root.binding)).toThrow(
          ServiceAuthorizationError,
        );
      }
      expect(() =>
        call(on, 'read', {
          parent: root.authorization,
          binding: root.binding,
          snapshotDerivation: { kind: 'retry', parentBinding: binding as AuthorizationBinding },
        }),
      ).toThrow(ServiceAuthorizationError);
    }
    const foreign = fixture();
    expect(() => readServiceExecution(foreign.service, fixture(on).capture().execution)).toThrow(
      ServiceAuthorizationError,
    );
  });

  it.each(['off', 'dormant', 'active'] as const)(
    'authenticates every %s mode read, including repeated reads',
    (state) => {
      const root = call(
        {
          ...on,
          unsafeUseReadAuthorizationFastPath: state !== 'off',
          unsafeSkipReadDocumentSnapshotChecks: state !== 'dormant',
        },
        'read',
      );
      expect(mode(root)?.mode).toBe(state);
      for (const key of ['request', 'runtime', 'model', 'modelName', 'scopePath']) {
        const wrong = {
          ...root.binding,
          [key]: key === 'modelName' ? 'Other' : key === 'scopePath' ? ['child'] : {},
        } as AuthorizationBinding;
        for (let repeat = 0; repeat < 2; repeat++) {
          expect(() => readAuthorizationFastPath(root.authorization, wrong)).toThrow(ServiceAuthorizationError);
          expect(() => readAuthorizationFastPath({ ...root.authorization }, root.binding)).toThrow(
            ServiceAuthorizationError,
          );
        }
      }
    },
  );

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
  ])('%s and write-derived reads/descendants never gain a query origin', (operation) => {
    const root = call(on, operation, { access: access(operation, 'read') });
    expect(mode(root)).toBeUndefined();
    expect(
      mode(
        call(on, 'read', {
          parent: root.authorization,
          binding: root.binding,
          snapshotDerivation: { kind: 'retry', parentBinding: root.binding },
        }),
      ),
    ).toBeUndefined();
    expect(
      mode(
        call(on, 'read', {
          parent: root.authorization,
          binding: { ...root.binding, scopePath: ['child'] },
          snapshotDerivation: { kind: 'embedded', parentBinding: root.binding },
        }),
      ),
    ).toBeUndefined();
  });

  it.each(
    (['list', 'read'] as const).flatMap((origin) =>
      (['off', 'dormant', 'active'] as const).map((mode) => ({ origin, mode })),
    ),
  )(
    'retains $origin/$mode selection on issued handles; only trusted active records omit copies/graph checks',
    async ({ origin, mode: selectedMode }) => {
      const key = origin === 'list' ? fastFlags[0] : fastFlags[1];
      const f = fixture({
          ...on,
          [key]: selectedMode !== 'off',
          [authorizationFastPathPrerequisites(origin)[0]]: selectedMode !== 'dormant',
        }),
        state = f.capture(origin);
      const source = { value: 'source', date: new Date(1) },
        grants = { date: new Date(2) };
      const stage = createDocumentAuthorizationStage(state.authorization, state.binding, source);
      const copies = vi.spyOn(snapshots, 'copyAuthorizationValue');
      const handle = await resolveDocumentAuthorization(stage, (input) => {
        (input.date as Date).setTime(99);
        return grants;
      });
      expect(source.date.getTime()).toBe(selectedMode === 'active' ? 99 : 1);
      grants.date.setTime(99);
      const owned = readDocumentAuthorization(handle, state.binding);
      expect(owned.grants.date).toEqual(new Date(selectedMode === 'active' ? 99 : 2));
      if (selectedMode === 'active') expect(copies).not.toHaveBeenCalled();
      else expect(copies).toHaveBeenCalled();
      const output = { value: 'output', child: { value: 'child' } };
      associateDocumentAuthorization(handle, state.binding, output);
      const use = { binding: state.binding, output, outputAccess: origin };
      const context = createServiceOutputContext({}, handle, use);
      f.runtime.setModelOptions(f.model.modelName, off);
      expect(mode({ authorization: owned.authorization, binding: state.binding })?.mode).toBe(selectedMode);
      expect(mode(f.capture(origin))?.mode).toBe('off');
      const picked = await f.service.pickAllowedFields(output, origin, { documentAuthorization: handle });
      expect(picked).toHaveProperty('value', 'output');
      expect(
        mode({ authorization: readDocumentAuthorization(handle, state.binding).authorization, binding: state.binding })
          ?.mode,
      ).toBe(selectedMode);
      expect(context.getDocumentAuthorization(output)).toBe(handle);
      output.child = { value: 'child' };
      if (selectedMode === 'active') expect(() => assertDocumentAuthorization(handle, use)).not.toThrow();
      else {
        expect(() => assertDocumentAuthorization(handle, use)).toThrow(ServiceAuthorizationError);
        for (const invalid of [{ value: () => true }, { value: Array(20001) }])
          expect(() => createDocumentAuthorizationStage(state.authorization, state.binding, invalid)).toThrow(
            ServiceAuthorizationError,
          );
      }
      const raw = normalizeOutputAuthorizationOptions(
        {
          binding: state.binding,
          access: access(origin),
          requestPermissions: permissions,
          configuration: captureModelAuthorizationConfiguration(f.runtime, f.model.modelName),
        },
        { authorization: { outputFields: { mode: 'request' } } },
      );
      expect(raw.kind).toBe('policy');
      if (raw.kind === 'policy')
        expect(mode({ authorization: raw.authorization, binding: state.binding })).toBeUndefined();
    },
  );

  it.each(['list', 'read'] as const)(
    'captures %s before awaits; descendants/retry keep capture while independent calls refresh',
    async (origin) => {
      for (const initial of [on, off]) {
        const f = fixture(initial),
          state = f.capture(origin);
        let entered!: () => void, release!: () => void;
        const started = new Promise<void>((done) => {
          entered = done;
        });
        const waiting = new Promise<void>((done) => {
          release = done;
        });
        const pending = resolveDocumentAuthorization(
          createDocumentAuthorizationStage(state.authorization, state.binding, { value: 'row' }),
          async () => {
            entered();
            await waiting;
            expect(mode(f.capture(origin))?.mode).toBe(initial === on ? 'off' : 'active');
            return {};
          },
        );
        await started;
        try {
          f.runtime.setModelOptions(f.model.modelName, initial === on ? off : on);
        } finally {
          release();
        }
        await pending;
        const parentPlan = planAuthorizedModelProjection({
          authorization: state.authorization,
          binding: state.binding,
        });
        const child = authorizeEmbeddedOutputPlan(parentPlan, parentPlan.childPlans.child);
        expect(readAuthorizationFastPath(child.authorization!, child.authorizationBinding!)).toBe(mode(state));
        if (origin === 'read') {
          const retry = readServiceExecution(
            f.service,
            deriveServiceExecution(f.service, state.execution, access('read', 'list')),
          );
          expect(mode(retry)).toBe(mode(state));
        }
      }
    },
  );
});

describe('normalized defaults and coherent effective warnings', () => {
  it.each(fastFlags)('%s inherits, restores undefined and normalizes both setter forms', (key) => {
    const f = fixture(),
      name = f.model.modelName;
    expect(f.runtime.getDefaultModelOption(key)).toBe(false);
    expect(f.runtime.getModelOption(name, key)).toBe(false);
    for (const value of ['true', 1, {}, new Boolean(true), null, undefined, false]) {
      f.runtime.setDefaultModelOptions({ [key]: value } as never);
      f.runtime.setModelOptions(name, { [key]: value } as never);
      expect(f.runtime.getDefaultModelOption(key)).toBe(false);
      expect(f.runtime.getModelOption(name, key)).toBe(false);
      f.runtime.setDefaultModelOption(key, value as never);
      f.runtime.setModelOption(name, key, value as never);
      expect(f.runtime.getModelOptions(name)[key]).toBe(false);
    }
    expect(f.warn).not.toHaveBeenCalled();
    f.runtime.setDefaultModelOptions({ [key]: true });
    f.runtime.setModelOption(name, key, undefined);
    expect(f.runtime.getModelOption(name, key)).toBe(true);
    f.runtime.setModelOption(name, key, false);
    f.runtime.setDefaultModelOption(key, true);
    expect(f.runtime.getModelOption(name, key)).toBe(false);
    f.runtime.setModelOptions(name, { [key]: undefined });
    expect(f.runtime.getModelOption(name, key)).toBe(true);
    f.runtime.setDefaultModelOption(key, undefined);
    expect(f.runtime.getModelOption(name, key)).toBe(false);
    for (const flag of unsafeSnapshotOptions) expect(f.runtime.getModelOption(name, flag)).toBe(false);
    const model = mongoose.model(`FastOptions${++serial}`, new mongoose.Schema({ value: String }));
    f.runtime.registerModelInstance(model.modelName, model);
    f.runtime.setDefaultModelOption(key, true);
    expect(f.runtime.getModelOptions(model.modelName)[key]).toBe(true);
    expect(f.warn.mock.calls.at(-1)![0]).toContain(key);
    expect(f.runtime.getModelOptions(model.modelName)[fastFlags.find((other) => other !== key)!]).toBe(false);
  });

  it.each(['list', 'read'] as const)(
    '%s warnings track coherent active/dormant missing-mask transitions, never per-call',
    (origin) => {
      const f = fixture(),
        name = f.model.modelName,
        key = origin === 'list' ? fastFlags[0] : fastFlags[1];
      const prereqs = authorizationFastPathPrerequisites(origin);
      const warnings = () =>
        f.warn.mock.calls.filter(([text]) => text.includes(key) || text.includes('authorization fast path active'));
      f.runtime.setModelOption(name, key, true);
      expect(warnings()).toHaveLength(1);
      expect(warnings()[0][0]).toContain('dormant');
      for (const prerequisite of prereqs) expect(warnings()[0][0]).toContain(prerequisite);
      f.runtime.setModelOption(name, key, true);
      f.capture(origin);
      f.capture(origin);
      expect(warnings()).toHaveLength(1);
      for (const [index, prerequisite] of prereqs.entries()) {
        f.runtime.setDefaultModelOption(prerequisite, true);
        expect(warnings()).toHaveLength(index + 2);
        const text = warnings().at(-1)![0];
        if (index < 3) {
          expect(text).toContain('dormant');
          expect(text).not.toContain(`${prerequisite},`);
        } else {
          expect(text).toContain(`${origin} authorization fast path active`);
          for (const risk of [
            'source/grant mutation',
            'stale decisions',
            'descendant replacement',
            'native normalization/validation',
            'denial becoming allowance',
            'source/grant/context leaves',
            'full unvisited source shape/bounds',
            'operation/row/field rules',
            'cheap exact root authority',
            'omit repeated snapshots',
            `Restore ${key}=false`,
          ])
            expect(text).toContain(risk);
        }
      }
      const before = warnings().length;
      f.runtime.setDefaultModelOptions(Object.fromEntries(prereqs.map((key) => [key, true])));
      f.runtime.setModelOptions(name, { [key]: true });
      f.capture(origin);
      expect(warnings()).toHaveLength(before);
      f.runtime.setModelOption(name, prereqs[0], false);
      expect(warnings().at(-1)![0]).toContain(`${prereqs[0]}=true`);
      f.runtime.setModelOption(name, prereqs[0], undefined);
      expect(warnings().at(-1)![0]).toContain('fast path active');
      f.runtime.setModelOption(name, key, false);
      expect(warnings()).toHaveLength(before + 2); // Off need not warn.
    },
  );

  it('publishes all models/defaults before warnings, rejects atomic invalid changes and tolerates throwing loggers', () => {
    const f = fixture(),
      other = fixture();
    f.runtime.registerModelInstance(other.model.modelName, other.model);
    f.runtime.setModelOptions(other.model.modelName, {});
    const seen: boolean[] = [];
    f.warn.mockImplementation(() =>
      seen.push(
        [f.model, other.model].every((model) =>
          unsafeServerOptions.every((key) => f.runtime.getModelOption(model.modelName, key) === true),
        ),
      ),
    );
    f.runtime.setDefaultModelOptions(on);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(Boolean)).toBe(true);
    expect(f.warn.mock.calls.some(([text]) => text.includes('dormant'))).toBe(false);
    const before = f.warn.mock.calls.length;
    const snapshot = f.runtime.getModelOptions(f.model.modelName);
    for (const update of [
      () =>
        f.runtime.setModelOptions(f.model.modelName, {
          ...off,
          virtuals: { invalid: { dependsOn: ['missing'] } },
        } as never),
      () => f.runtime.setDefaultModelOptions({ ...off, virtuals: { invalid: { dependsOn: ['missing'] } } } as never),
    ]) {
      expect(update).toThrow();
      expect(f.runtime.getModelOptions(f.model.modelName)).toEqual(snapshot);
      expect(f.warn).toHaveBeenCalledTimes(before);
    }
    f.runtime.setDefaultModelOptions(off);
    f.warn.mockImplementation(() => {
      throw new Error('logger unavailable');
    });
    expect(() => f.runtime.setDefaultModelOptions(on)).not.toThrow();
    const count = f.warn.mock.calls.length;
    expect(mode(f.capture())?.mode).toBe('active');
    f.runtime.setDefaultModelOptions(on);
    expect(f.warn).toHaveBeenCalledTimes(count);
    expect(f.runtime.getModelOption(f.model.modelName, fastFlags[1])).toBe(true);
  });

  it.each(['list', 'read'] as const)(
    'tracks every coherent %s missing-mask transition, not just popcount',
    (origin) => {
      const f = fixture(),
        name = f.model.modelName,
        key = origin === 'list' ? fastFlags[0] : fastFlags[1];
      const prerequisites = authorizationFastPathPrerequisites(origin);
      const options = (mask: number) =>
        Object.fromEntries(prerequisites.map((flag, index) => [flag, !!(mask & (1 << index))]));
      const warnings = () => f.warn.mock.calls.filter(([text]) => text.includes(key));
      f.runtime.setModelOption(name, key, true);
      for (let previous = 0; previous < 16; previous++)
        for (let next = 0; next < 16; next++) {
          f.runtime.setDefaultModelOptions(options(previous));
          f.warn.mockClear();
          f.runtime.setDefaultModelOptions(options(next));
          expect(mode(f.capture(origin))).toEqual({
            origin,
            mode: next === 15 ? 'active' : 'dormant',
            prerequisites: next,
          });
          expect(warnings()).toHaveLength(previous === next ? 0 : 1);
          if (next !== 15 && previous !== next)
            for (const [index, prerequisite] of prerequisites.entries())
              expect(warnings()[0][0].includes(`${prerequisite}=true`)).toBe(!(next & (1 << index)));
        }
      f.warn.mockClear();
      const opposite = authorizationFastPathPrerequisites(origin === 'list' ? 'read' : 'list');
      f.runtime.setDefaultModelOptions(Object.fromEntries(opposite.map((flag) => [flag, true])));
      f.runtime.setDefaultModelOptions(Object.fromEntries(opposite.map((flag) => [flag, false])));
      expect(warnings()).toHaveLength(0);
      f.runtime.setModelOption(name, key, false);
      f.warn.mockClear();
      for (let mask = 0; mask < 16; mask++) {
        f.runtime.setDefaultModelOptions(options(mask));
        expect(mode(f.capture(origin))?.mode).toBe('off');
      }
      expect(warnings()).toHaveLength(0);
    },
  );

  it.each(['list', 'read'] as const)(
    'normalizes every truthy %s prerequisite at model/default publication',
    (origin) => {
      const f = fixture();
      f.runtime.setDefaultModelOptions(on);
      for (const key of authorizationFastPathPrerequisites(origin))
        for (const value of ['true', 1, {}, new Boolean(true), null, false, new mongoose.mongo.BSON.ObjectId()]) {
          f.runtime.setDefaultModelOption(key, value as never);
          expect(f.runtime.getDefaultModelOption(key)).toBe(false);
          expect(mode(f.capture(origin))?.mode).toBe('dormant');
          f.runtime.setDefaultModelOption(key, true);
          expect(mode(f.capture(origin))?.mode).toBe('active');
          f.runtime.setModelOptions(f.model.modelName, { [key]: value } as never);
          expect(f.runtime.getModelOption(f.model.modelName, key)).toBe(false);
          expect(mode(f.capture(origin))?.mode).toBe('dormant');
          f.runtime.setModelOption(f.model.modelName, key, undefined);
          expect(mode(f.capture(origin))?.mode).toBe('active');
        }
    },
  );

  it('owns the published warning signature before any logger can reenter option setters', () => {
    const f = fixture();
    let reentered = false;
    f.warn.mockImplementation(() => {
      if (reentered) return;
      reentered = true;
      f.runtime.setModelOptions(f.model.modelName, Object.fromEntries(fastFlags.map((key) => [key, false])));
    });
    f.runtime.setDefaultModelOptions(on);
    const warnings = f.warn.mock.calls.filter(([text]) => text.includes('authorization fast path active'));
    expect(warnings).toHaveLength(2); // The coherent publication was active before the logger's later rollback.
    expect(f.warn.mock.calls.some(([text]) => text.includes('dormant'))).toBe(false);
    expect(mode(f.capture('list'))?.mode).toBe('off');
    expect(mode(f.capture('read'))?.mode).toBe('off');
    for (const key of unsafeSnapshotOptions) expect(f.runtime.getModelOption(f.model.modelName, key)).toBe(true);
  });
});

describe('presence-based bounded control admission and inert business values', () => {
  it.each(fastFlags)('preflights raw/dotted default setters before cloning can erase %s presence', (key) => {
    const f = fixture();
    const getter = vi.fn(() => undefined);
    const defaults = f.runtime.getDefaultModelOptions();
    const modelOptions = f.runtime.getModelOptions(f.model.modelName);
    for (const controls of [
      { [key]: undefined },
      Object.create({ [key]: undefined }),
      Object.defineProperty({}, key, { value: undefined }),
      Object.defineProperty({}, key, { get: getter, enumerable: true }),
    ])
      for (const path of ['defaults', 'defaults.findOptions', 'defaults.publicReadOptions']) {
        const value = path === 'defaults' ? { findOptions: controls } : controls;
        expect(() => f.runtime.setDefaultModelOption(path as never, value as never)).toThrow(PublicAdmissionError);
        expect(f.runtime.getDefaultModelOptions()).toEqual(defaults);
        expect(f.runtime.getModelOptions(f.model.modelName)).toEqual(modelOptions);
      }
    expect(getter).not.toHaveBeenCalled();
    expect(f.warn).not.toHaveBeenCalled();
  });

  it.each(fastFlags)('does not invoke a defaults-bucket accessor to discover %s controls', (key) => {
    const f = fixture();
    const getter = vi.fn(() => ({ [key]: undefined }));
    const defaults = Object.defineProperty({}, 'findOptions', { get: getter, enumerable: true });
    expect(() => assertPublicDefaults(defaults)).toThrow(PublicAdmissionError);
    expect(() => f.runtime.setModelOption(f.model.modelName, 'defaults', defaults)).toThrow(PublicAdmissionError);
    expect(() => f.runtime.setDefaultModelOption('defaults' as never, defaults as never)).toThrow(PublicAdmissionError);
    expect(getter).not.toHaveBeenCalled();
    expect(f.warn).not.toHaveBeenCalled();
  });

  it.each(fastFlags)(
    'rejects inherited Object.prototype %s presence before policy copying can erase it',
    async (key) => {
      const f = fixture();
      const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
      Object.defineProperty(Object.prototype, key, { value: undefined, configurable: true, writable: true });
      try {
        expect(() => assertPublicAdmission({ options: {} })).toThrow(PublicAdmissionError);
        expect(() => assertPublicDefaults({ findOptions: {} })).toThrow(PublicAdmissionError);
        expect(() => call({}, 'list', { authorization: {} })).toThrow(ServiceAuthorizationError);
        await expect(f.service.pickAllowedFields({ value: 'v' }, 'read', {})).rejects.toThrow(
          ServiceAuthorizationError,
        );
      } finally {
        if (previous) Object.defineProperty(Object.prototype, key, previous);
        else delete (Object.prototype as Record<string, unknown>)[key];
      }
    },
  );

  it.each(fastFlags)('rejects %s on every public/default/service/policy/helper control lane', async (key) => {
    const f = fixture();
    const get = vi.fn(() => {
      throw new Error('must not invoke flag getter');
    });
    for (const property of [
      { [key]: undefined },
      { [key]: false },
      Object.create({ [key]: undefined }),
      Object.defineProperty({}, key, { value: undefined }),
      Object.defineProperty({}, key, { get }),
    ]) {
      for (const envelope of [
        property,
        { args: property },
        { options: property },
        { include: [{ options: property }] },
        { populate: [{ args: { options: property } }] },
        { filter: { nested: { $$sq: { options: property } } } },
        { data: { $$sq: { args: { populate: [{ options: property }] } } } },
      ]) {
        expect(() => assertPublicAdmission(envelope)).toThrow(PublicAdmissionError);
        for (const method of ['find', 'findOne'] as const) {
          expect(await f.service[method]({}, envelope as never, quiet)).toMatchObject({
            success: false,
            code: 'bad_request',
          });
          expect(await f.service[method]({}, {}, envelope as never)).toMatchObject({
            success: false,
            code: 'bad_request',
          });
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
          { [bucket]: property },
          Object.create({ [bucket]: property }),
          Object.defineProperty({}, bucket, { value: property }),
        ]) {
          expect(() => assertPublicDefaults(defaults)).toThrow(PublicAdmissionError);
          expect(() => f.runtime.setModelOption(f.model.modelName, 'defaults', defaults)).toThrow(PublicAdmissionError);
          expect(() => f.runtime.setDefaultModelOptions({ defaults } as never)).toThrow(PublicAdmissionError);
          f.service.defaults = defaults;
          expect(await f.service.find({}, {}, quiet)).toMatchObject({ success: false, code: 'bad_request' });
          f.service.defaults = {};
        }
      }
      for (const authorization of [
        property,
        { rows: property },
        { outputFields: property },
        { inputFields: property },
        { related: { ref: { model: 'Other', operation: property } } },
      ])
        expect(() => call({}, 'list', { authorization })).toThrow(ServiceAuthorizationError);
      for (const options of [property, { authorization: property }]) {
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
    expect(get).not.toHaveBeenCalled();
    expect(f.adapter.find).not.toHaveBeenCalled();
    expect(f.adapter.findOne).not.toHaveBeenCalled();
  });

  it.each(fastFlags)(
    '%s is inert in business predicates, projection paths, data and backend scoped filters',
    async (key) => {
      const f = fixture();
      const input = {
        filter: { [key]: true },
        match: { [key]: true },
        data: { [key]: true, options: { [key]: true } },
        select: { [key]: 1 },
      };
      expect(() => assertPublicAdmission(input)).not.toThrow();
      expect(() => assertPublicDefaults({ findArgs: input } as never)).not.toThrow();
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
      // Unrelated backend per-call authorization must still be admitted.
      expect(
        await f.service.find(
          {},
          {},
          { ...quiet, authorization: { rows: { mode: 'unrestricted' }, outputFields: { mode: 'unrestricted' } } },
        ),
      ).toMatchObject({ success: true });
    },
  );

  it('bounds shared traversals and handles cycles without a new unbounded recursive walk', () => {
    const cycle: Record<string, unknown> = {};
    cycle.options = cycle;
    expect(() => assertPublicAdmission(cycle)).not.toThrow();
    let deep: object = {};
    for (let n = 0; n < 102; n++) deep = { options: deep };
    expect(() => assertPublicAdmission(deep)).toThrow(PublicAdmissionError);
    expect(() => assertPublicAdmission({ include: Array(20001) })).toThrow(PublicAdmissionError);
  });
});
