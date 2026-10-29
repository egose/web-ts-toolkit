import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import { createSetCore } from '../src/core';
import type { ModelRequest } from '../src/interfaces';
import * as planning from '../src/acl/model-output-planning';
import { resolveVirtualPopulateDependencies } from '../src/acl/virtual-populate-dependencies';
import { captureRelatedTargets, createRelatedExecution } from '../src/acl/related-execution';
import { createServiceExecution, deriveServiceExecution, readServiceExecution } from '../src/acl/service-execution';
import { readServiceAuthorization } from '../src/acl/service-authorization';
import { prepareSubdocumentOutput } from '../src/acl/subdocument-output';

const flag = 'requireOperationAccessForPopulateDependencies';
const queryFlag = 'requireOperationAccessForPopulateQueries';
const access = { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' };
let serial = 0;
afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^PprConfig/);
});

function fixture() {
  const api = createAccessRuntime();
  const n = ++serial;
  const target = mongoose.model(`PprConfigTarget${n}`, new mongoose.Schema({ balance: Number }));
  const ref = { type: mongoose.Schema.Types.ObjectId, ref: target.modelName };
  const source = mongoose.model(
    `PprConfigSource${n}`,
    new mongoose.Schema({ account: ref, child: { account: ref }, children: [{ account: ref }], [flag]: Boolean }),
  );
  api.createRouter(target, { operationAccess: { read: true }, permissionSchema: { balance: false } });
  const descriptor = { get: () => true, dependsOnPopulate: [{ path: 'account', select: 'balance' }] };
  api.createRouter(source, {
    permissionSchema: { eligible: true, children: { sub: { eligible: true } }, [flag]: true },
    virtuals: {
      eligible: descriptor,
      child: { sub: { eligible: descriptor } },
      children: { sub: { eligible: descriptor } },
    },
  } as never);
  const capture = () => planning.captureModelAuthorizationConfiguration(api.runtime, source.modelName);
  return { api, source, target, capture };
}

function assertMode(configuration: ReturnType<typeof planning.captureModelAuthorizationConfiguration>, mode: boolean) {
  expect(configuration[flag]).toBe(mode);
  for (const scope of [[], ['child', 'sub'], ['children', 'sub']]) {
    const [dependency] = resolveVirtualPopulateDependencies(configuration, scope, 'eligible', 'read');
    expect(dependency.target.configuration[flag]).toBe(mode);
    expect(Object.isFrozen(dependency.target.configuration)).toBe(true);
    expect(dependency.target.configuration).not.toHaveProperty('virtuals');
    expect(dependency.target.configuration).not.toHaveProperty('virtualPopulateSnapshot');
  }
}

async function serviceFor(f: ReturnType<typeof fixture>) {
  const req = {} as ModelRequest;
  await createSetCore(f.api.runtime)(req, {} as never, () => {});
  return { req, service: req.macl.getService(f.source.modelName) };
}

describe('PPR-01 runtime-owned private populate read mode', () => {
  it('defaults to strict and changes only the owning runtime through every setter form', () => {
    const f = fixture();
    const other = createAccessRuntime();
    expect(f.api.getGlobalOption(flag)).toBe(true);
    expect(f.api.getGlobalOptions()[flag]).toBe(true);
    assertMode(f.capture(), true);
    const setters = [
      (value: boolean | undefined) => f.api.setGlobalOptions({ [flag]: value }),
      (value: boolean | undefined) => f.api.setGlobalOption(flag, value),
      (value: boolean | undefined) => f.api.set({ [flag]: value }),
      (value: boolean | undefined) => f.api.set(flag, value),
      (value: boolean | undefined) => f.api.runtime.setGlobalOptions({ [flag]: value }),
      (value: boolean | undefined) => f.api.runtime.setGlobalOption(flag, value),
    ];
    for (const set of setters) {
      for (const value of [false, true, false, undefined]) {
        set(value);
        const expected = value !== false;
        expect(f.api.getGlobalOption(flag)).toBe(expected);
        expect(f.api.getGlobalOptions()[flag]).toBe(expected);
        assertMode(f.capture(), expected);
        expect(other.getGlobalOption(flag)).toBe(true);
      }
    }
  });

  it.each([null, 0, 1, '', 'false', [], {}, Object(false), () => false].map((value) => [value]))(
    'normalizes malformed dynamic values conservatively through both setter forms: %j',
    (value) => {
      const f = fixture();
      for (const set of [
        () => f.api.setGlobalOptions({ [flag]: value } as never),
        () => f.api.setGlobalOption(flag, value as never),
        () => f.api.set({ [flag]: value } as never),
        () => f.api.set(flag, value as never),
      ]) {
        f.api.setGlobalOption(flag, false);
        set();
        expect(f.api.getGlobalOptions()[flag]).toBe(true);
        assertMode(f.capture(), true);
      }
    },
  );

  it('owns global snapshots, preserves shallow unrelated updates, and restores bootstrap mode', () => {
    const f = fixture();
    const before = f.api.getGlobalOptions();
    f.api.setGlobalOption(flag, false);
    const snapshot = f.api.runtime.createBootstrapSnapshot();
    const captured = f.capture();
    f.api.setGlobalOptions({ logger: {} });
    expect(f.api.getGlobalOption(flag)).toBe(false);
    f.api.setGlobalOption(flag, true);
    f.api.runtime.restoreBootstrapSnapshot(snapshot);
    expect(f.api.getGlobalOption(flag)).toBe(false);
    expect(before[flag]).toBe(true);
    expect(Object.isFrozen(before)).toBe(true);
    assertMode(captured, false);
  });

  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    'retains both modes and terminal read policy in detached/derived/nested copies (%s/%s)',
    async (initial, queryInitial) => {
      const f = fixture();
      f.api.setGlobalOption(flag, initial);
      f.api.setGlobalOption(queryFlag, queryInitial);
      const assertCaptured = (configuration: ReturnType<typeof f.capture>) => {
        assertMode(configuration, initial);
        expect(configuration[queryFlag]).toBe(queryInitial);
        for (const scope of [[], ['child', 'sub'], ['children', 'sub']]) {
          const [dependency] = resolveVirtualPopulateDependencies(configuration, scope, 'eligible', 'read');
          expect(dependency.target.configuration[queryFlag]).toBe(queryInitial);
        }
      };
      const { service } = await serviceFor(f);
      const related = captureRelatedTargets(f.api.runtime, f.source.modelName, {
        include: [
          { model: f.source.modelName, op: 'read', path: 'joined', localField: '_id', foreignField: '_id', args: {} },
        ],
      });
      const configuration = f.capture();
      const execution = createServiceExecution(
        service,
        access,
        undefined,
        'service',
        related,
        undefined,
        configuration,
      );
      const state = readServiceExecution(service, execution);
      const child = prepareSubdocumentOutput(
        service,
        'children',
        'subRead',
        'read',
        'read',
        ['eligible'],
        [{ path: 'children.account' }],
      );
      f.api.setGlobalOption(flag, !initial);
      f.api.setGlobalOption(queryFlag, !queryInitial);
      f.api.setModelOption(f.target.modelName, 'operationAccess.read', false);
      await Promise.resolve();
      const copied = readServiceAuthorization(state.authorization, state.binding);
      assertCaptured(copied.configuration);
      const derived = readServiceExecution(
        service,
        deriveServiceExecution(service, execution, { ...access, operation: 'list' }),
      );
      assertCaptured(readServiceAuthorization(derived.authorization, derived.binding).configuration);
      const childView = readServiceAuthorization(child.state.authorization, child.state.binding);
      assertCaptured(childView.configuration);
      expect(childView.relatedTargets[0].configuration[flag]).toBe(initial);
      expect(childView.relatedTargets[0].configuration[queryFlag]).toBe(queryInitial);
      expect(
        planning.getCapturedAuthorizationOption(childView.relatedTargets[0].configuration, 'operationAccess.read'),
      ).toBe(true);
      const nested = createRelatedExecution(service, access, state.authorization, state.binding, 'joined');
      const nestedState = readServiceExecution(service, nested);
      const nestedConfig = readServiceAuthorization(nestedState.authorization, nestedState.binding).configuration;
      assertCaptured(nestedConfig);
      const [dependency] = resolveVirtualPopulateDependencies(nestedConfig, [], 'eligible', 'read');
      expect(planning.getCapturedAuthorizationOption(dependency.target.configuration, 'operationAccess.read')).toBe(
        true,
      );
      assertMode(f.capture(), !initial);
      expect(f.capture()[queryFlag]).toBe(!queryInitial);
    },
  );

  it('captures globals before related target option reads can replace them', async () => {
    const f = fixture();
    f.api.setGlobalOption(flag, false);
    const { service } = await serviceFor(f);
    f.api.setModelOption(f.source.modelName, 'overrideFilter.read', () => false);
    const original = f.api.runtime.getModelOptions.bind(f.api.runtime);
    vi.spyOn(f.api.runtime, 'getModelOptions').mockImplementation((name) => {
      if (name === f.target.modelName) f.api.setGlobalOption(flag, true);
      return original(name);
    });
    const snapshots: ReturnType<typeof f.capture>[] = [];
    const capture = planning.captureModelAuthorizationConfiguration;
    vi.spyOn(planning, 'captureModelAuthorizationConfiguration').mockImplementation((...args) => {
      const configuration = capture(...args);
      snapshots.push(configuration);
      return configuration;
    });
    await service.findOne({}, { populate: ['account'] });
    expect(f.api.getGlobalOption(flag)).toBe(true);
    expect(snapshots.length).toBe(2);
    snapshots.forEach((configuration) => expect(configuration[flag]).toBe(false));
    assertMode(snapshots[1], false);
    await service.findOne({}, { populate: ['account'] });
    snapshots.slice(2).forEach((configuration) => expect(configuration[flag]).toBe(true));
  });

  it.each([true, false])(
    'captures once before service awaits and related capture; later same-service calls see updates (%s)',
    async (initial) => {
      const f = fixture();
      f.api.setGlobalOption(flag, initial);
      const { service } = await serviceFor(f);
      let enter!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((done) => (enter = done));
      const held = new Promise<void>((done) => (release = done));
      let calls = 0;
      f.api.setModelOption(f.source.modelName, 'overrideFilter.read', async () => {
        if (++calls === 1) {
          enter();
          await held;
        }
        return false;
      });
      const snapshots: ReturnType<typeof f.capture>[] = [];
      const original = planning.captureModelAuthorizationConfiguration;
      vi.spyOn(planning, 'captureModelAuthorizationConfiguration').mockImplementation((...args) => {
        const configuration = original(...args);
        if (args[1] === f.source.modelName) snapshots.push(configuration);
        return configuration;
      });
      const globals = vi.spyOn(f.api.runtime, 'getGlobalOptions');
      const args = {
        select: ['eligible'],
        populate: ['account'],
        include: [
          {
            model: f.source.modelName,
            op: 'read',
            path: 'joined',
            localField: '_id',
            foreignField: '_id',
            args: { select: ['eligible'] },
          },
        ],
      };
      const pending = service.findOne({}, args as never);
      await entered;
      let setterReads: number;
      try {
        expect(globals).toHaveBeenCalledTimes(1);
        expect(snapshots.length).toBe(2);
        snapshots.forEach((configuration) => assertMode(configuration, initial));
        f.api.setGlobalOption(flag, !initial);
        const beforeSetter = globals.mock.calls.length;
        f.api.setModelOption(f.target.modelName, 'operationAccess.read', false);
        // Configuration validation owns a separate synchronous globals read;
        // the suspended call itself must still never recapture them.
        setterReads = globals.mock.calls.length - beforeSetter;
      } finally {
        release();
      }
      await expect(pending).resolves.toMatchObject({ success: false, code: 'forbidden' });
      expect(globals).toHaveBeenCalledTimes(1 + setterReads);
      snapshots.forEach((configuration) => assertMode(configuration, initial));
      await expect(service.findOne({}, args as never)).resolves.toMatchObject({ success: false, code: 'forbidden' });
      expect(globals).toHaveBeenCalledTimes(2 + setterReads);
      expect(snapshots.length).toBe(4);
      snapshots.slice(2).forEach((configuration) => {
        assertMode(configuration, !initial);
        const [dependency] = resolveVirtualPopulateDependencies(configuration, [], 'eligible', 'read');
        expect(planning.getCapturedAuthorizationOption(dependency.target.configuration, 'operationAccess.read')).toBe(
          false,
        );
      });
    },
  );

  it('ignores same-spelled model/caller controls while preserving business predicates and selection', async () => {
    const f = fixture();
    const transform = vi.fn((_filter: unknown) => false);
    f.api.setModelOptions(f.source.modelName, { [flag]: false, overrideFilter: { read: transform } } as never);
    const { service } = await serviceFor(f);
    const snapshots: ReturnType<typeof f.capture>[] = [];
    const original = planning.captureModelAuthorizationConfiguration;
    vi.spyOn(planning, 'captureModelAuthorizationConfiguration').mockImplementation((...args) => {
      const configuration = original(...args);
      snapshots.push(configuration);
      return configuration;
    });
    const filter = { [flag]: false };
    const result = await service.findOne(
      filter,
      { [flag]: false, select: [flag] } as never,
      { [flag]: false } as never,
    );
    expect(result).toMatchObject({ success: false, code: 'forbidden' });
    expect(transform.mock.calls[0][0]).toEqual(filter);
    expect(snapshots.length).toBe(1);
    assertMode(snapshots[0], true);
    expect(snapshots[0].catalog.persistedPaths).toContain(flag);
    expect(f.api.getGlobalOption(flag)).toBe(true);
  });

  it('keeps same-spelled persisted data ordinary and private registration validation strict in bypass mode', () => {
    const f = fixture();
    f.api.setGlobalOptions({ [flag]: false, requireOperationAccessForPopulateQueries: false });
    expect(f.capture().catalog.persistedPaths).toContain(flag);
    const other = createAccessRuntime();
    other.setGlobalOptions({ [flag]: false, requireOperationAccessForPopulateQueries: false });
    other.registerModelInstance(f.target.modelName, f.target);
    expect(() => other.createRouter(f.source, f.api.getModelOptions(f.source.modelName))).toThrow(/configured first/);
    f.target.schema.remove('balance');
    expect(() => f.capture()).toThrow(/eligible static persisted/);
  });
});
