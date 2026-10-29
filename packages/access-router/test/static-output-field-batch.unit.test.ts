import mongoose, { mongo } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Permission from '../src/permission';
import { Core } from '../src/core';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest } from '../src/interfaces';
import type { ResolveServiceAuthorizationInput } from '../src/acl/service-authorization';
import { resolveServiceAuthorization, ServiceAuthorizationError } from '../src/acl/service-authorization';
import {
  associateDocumentAuthorization,
  createDocumentAuthorizationStage,
  memoizeDocumentFieldDecision,
  resolveDocumentAuthorization,
  tryStaticOutputFieldDecisions,
  tryStaticRequestFieldPaths,
} from '../src/acl/document-authorization';
import * as documentAuthorization from '../src/acl/document-authorization';
import * as serviceAuthorization from '../src/acl/service-authorization';
import {
  evaluateAuthorizedOutputField,
  requestOutputFieldPaths,
  resolveOutputDocumentAuthorization,
} from '../src/acl/output-field-filter';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { finalizeModelOutput } from '../src/output/finalize-model-output';

const access = { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' };
let serial = 0;

async function fixture(
  schema: Record<string, unknown> = { first: true, second: true, denied: false },
  snapshot: Record<string, unknown> = { _id: 'same', first: 'one', second: 'two', denied: 'never' },
  extra: Partial<ResolveServiceAuthorizationInput> = {},
) {
  const binding = {
    request: { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest,
    runtime: new AccessRuntime(),
    model: {},
    modelName: 'StaticBatch',
  };
  const input = {
    binding,
    access,
    configuration: {
      catalog: { paths: [...Object.keys(schema), '_id'] },
      permissionSchema: schema,
      stripPermissionsField: true,
    },
    requestPermissions: new Permission({ reader: true }),
    ...extra,
  };
  const authorization = resolveServiceAuthorization(input);
  const plan = planAuthorizedModelProjection({ authorization, binding, requestedSelect: ['-_id'] });
  const stage = createDocumentAuthorizationStage(authorization, binding, snapshot);
  const handle = await resolveDocumentAuthorization(stage, () => ({ private: new Date(1) }));
  const batch = (fields: readonly string[] = plan.outputPersistedFields) =>
    tryStaticOutputFieldDecisions(handle, binding, plan, fields);
  const finalize = () =>
    finalizeModelOutput({
      receivingModelName: binding.modelName,
      request: binding.request,
      plan,
      snapshot: input.configuration,
      input: snapshot,
      documentAuthorizationStage: stage,
      ...access,
    });
  return { input, authorization, binding, plan, stage, handle, snapshot, batch, finalize };
}

function waiting() {
  let release!: (value: boolean) => void;
  let enter!: () => void;
  const started = new Promise<void>((resolve) => (enter = resolve));
  const pending = new Promise<boolean>((resolve) => (release = resolve));
  return {
    release,
    started,
    evaluate: vi.fn(() => {
      enter();
      return pending;
    }),
  };
}

async function helperFixture(native: unknown = new Date(1), outputNative = false) {
  const model = mongoose.model(`StaticBatchHelper${++serial}`, new mongoose.Schema({ first: String, second: String }));
  const runtime = new AccessRuntime();
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    permissionSchema: { first: true, second: true },
    stripPermissionsField: true,
  });
  const request = { [PERMISSIONS]: new Permission({}) } as unknown as ModelRequest;
  request.macl = runWithRuntime(runtime, () => new Core(request));
  const binding = { request, runtime, model, modelName: model.modelName };
  const snapshot = { first: 'one', second: 'two', native };
  const authorization = resolveServiceAuthorization({
    binding,
    access,
    configuration: {
      catalog: { paths: ['first', 'second'] },
      permissionSchema: { first: true, second: true },
      stripPermissionsField: true,
    },
    requestPermissions: new Permission({}),
  });
  const handle = await resolveDocumentAuthorization(
    createDocumentAuthorizationStage(authorization, binding, snapshot),
    () => ({}),
  );
  const output = { first: 'one', second: 'two', ...(outputNative ? { marker: new Date(2) } : {}) };
  associateDocumentAuthorization(handle, binding, output);
  const pick = () => request.macl.pickAllowedFields(model.modelName, output, 'read', { documentAuthorization: handle });
  return { snapshot, output, pick };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^StaticBatchHelper/);
});

describe('closed static decision batch ownership and memo authority', () => {
  it('uses no actor method or native grant copy, and populates the original request keys', async () => {
    const f = await fixture();
    const has = vi.spyOn(Permission.prototype, 'has').mockImplementation(() => {
      throw new Error('application method');
    });
    const copy = vi.spyOn(Date.prototype, 'getTime');
    expect([...f.batch()!]).toEqual([
      ['first', true],
      ['second', true],
    ]);
    expect(has).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
    const evaluate = vi.fn(() => false);
    expect(await memoizeDocumentFieldDecision(f.handle, f.binding, 'request:read:first', evaluate)).toBe(true);
    expect(evaluate).not.toHaveBeenCalled();
    expect(tryStaticRequestFieldPaths(f.handle, f.binding, 'read')).toEqual(['first', 'second']);
  });

  it.each(['forged', 'reordered', 'duplicated', 'enlarged', 'proxy', 'accessor'] as const)(
    'cannot enlarge the privately owned primitive field set: %s',
    async (kind) => {
      const f = await fixture();
      const getter = vi.fn(() => 'first');
      const fields =
        kind === 'reordered'
          ? ['second', 'first']
          : kind === 'duplicated'
            ? ['first', 'first']
            : kind === 'enlarged'
              ? ['first', 'denied']
              : kind === 'proxy'
                ? new Proxy(['first'], { get: getter })
                : kind === 'accessor'
                  ? Object.defineProperty(['first'], '0', { get: getter })
                  : ['first'];
      const plan = kind === 'forged' ? { ...f.plan } : f.plan;
      expect(tryStaticOutputFieldDecisions(f.handle, f.binding, plan, fields)).toBeUndefined();
      expect(getter).not.toHaveBeenCalled();
      const evaluate = vi.fn(() => false);
      expect(await memoizeDocumentFieldDecision(f.handle, f.binding, 'request:read:first', evaluate)).toBe(false);
      expect(evaluate).toHaveBeenCalledTimes(1);
    },
  );

  it('does not treat plan states or appended paths as authority', async () => {
    const f = await fixture();
    f.plan.fieldStates = { first: 'denied', denied: 'granted', absent: 'granted' };
    expect(f.batch()!.get('first')).toBe(true);
    f.plan.outputPersistedFields.push('denied', 'absent');
    expect(f.batch()).toBeUndefined();
    expect(await f.finalize()).toEqual({ first: 'one', second: 'two' });
  });

  it('does not accept another call, a forged handle or a changed exact binding', async () => {
    const f = await fixture();
    const other = await fixture();
    expect(() => tryStaticOutputFieldDecisions({} as never, f.binding, f.plan, ['first'])).toThrow(
      ServiceAuthorizationError,
    );
    expect(() => tryStaticOutputFieldDecisions(f.handle, other.binding, f.plan, ['first'])).toThrow(
      ServiceAuthorizationError,
    );
    expect(tryStaticOutputFieldDecisions(f.handle, f.binding, other.plan, ['first'])).toBeUndefined();
    f.plan.authorization = resolveServiceAuthorization(f.input);
    expect(f.batch()).toBeUndefined();
  });

  it.each(['output:first', 'request:read:first'])(
    'retains a settled conflicting %s decision and equal-ID row isolation',
    async (key) => {
      const f = await fixture();
      const sameId = await resolveDocumentAuthorization(
        createDocumentAuthorizationStage(f.authorization, f.binding, { ...f.snapshot }),
        () => ({}),
      );
      await memoizeDocumentFieldDecision(f.handle, f.binding, key, () => false);
      expect(f.batch()!.get('first')).toBe(false);
      expect(tryStaticOutputFieldDecisions(sameId, f.binding, f.plan, ['first'])!.get('first')).toBe(true);
      expect(await f.finalize()).toEqual({ second: 'two' });
    },
  );

  it.each(['output:first', 'request:read:first'])(
    'falls back without populating later fields for a pending %s decision',
    async (key) => {
      const f = await fixture();
      const wait = waiting();
      const pending = memoizeDocumentFieldDecision(f.handle, f.binding, key, wait.evaluate);
      await wait.started;
      expect(f.batch()).toBeUndefined();
      const later = vi.fn(() => false);
      expect(await memoizeDocumentFieldDecision(f.handle, f.binding, 'request:read:second', later)).toBe(false);
      expect(later).toHaveBeenCalledTimes(1);
      const output = f.finalize();
      wait.release(false);
      expect(await pending).toBe(false);
      expect(await output).toEqual({});
      expect(wait.evaluate).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['output:first', 'request:read:first'])(
    'retains a rejected %s promise instead of recomputing it',
    async (key) => {
      const f = await fixture();
      const error = new Error('retained failure');
      const evaluate = vi.fn(() => {
        throw error;
      });
      await expect(memoizeDocumentFieldDecision(f.handle, f.binding, key, evaluate)).rejects.toBe(error);
      expect(f.batch()).toBeUndefined();
      await expect(f.finalize()).rejects.toBe(error);
      await expect(memoizeDocumentFieldDecision(f.handle, f.binding, key, () => true)).rejects.toBe(error);
      expect(evaluate).toHaveBeenCalledTimes(1);
    },
  );

  it('does not mark an evaluator return fulfilled before its retained promise settles', async () => {
    const f = await fixture();
    let observed: ReturnType<typeof f.batch>;
    const pending = memoizeDocumentFieldDecision(f.handle, f.binding, 'output:first', () => {
      queueMicrotask(() =>
        queueMicrotask(() => {
          observed = f.batch();
        }),
      );
      return false;
    });
    expect(await pending).toBe(false);
    expect(observed).toBeUndefined();
    expect(f.batch()!.get('first')).toBe(false);
  });

  it('does not prepopulate later static decisions beyond an earlier dynamic callback', async () => {
    let f!: Awaited<ReturnType<typeof fixture>>;
    const callback = vi.fn(async () => {
      const first = vi.fn(() => false);
      expect(await memoizeDocumentFieldDecision(f.handle, f.binding, 'request:read:first', first)).toBe(true);
      expect(first).not.toHaveBeenCalled();
      const later = vi.fn(() => false);
      expect(await memoizeDocumentFieldDecision(f.handle, f.binding, 'request:read:third', later)).toBe(false);
      expect(later).toHaveBeenCalledTimes(1);
      return true;
    });
    f = await fixture({ first: true, second: callback, third: true }, { first: 'one', second: 'two', third: 'three' });
    expect(f.batch()).toBeUndefined();
    expect(await f.finalize()).toEqual({ first: 'one', second: 'two' });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it.each(['native-schema', 'native-prefix', 'coercible-prefix'] as const)(
    'does not add a speculative configuration copy before %s fallback',
    async (kind) => {
      const schema = { first: true, second: kind === 'native-schema' ? new mongo.BSON.Long(1, 2) : true };
      const f = await fixture(schema, undefined, {
        configuration: {
          catalog: { paths: ['first', 'second'] },
          permissionSchema: schema,
          modelPermissionPrefix:
            kind === 'native-prefix'
              ? new mongo.BSON.Long(1, 2)
              : kind === 'coercible-prefix'
                ? { toString: () => 'doc:' }
                : '',
        },
      });
      const read = vi.spyOn(serviceAuthorization, 'readServiceOutputFieldAuthorization');
      expect(f.batch()).toBeUndefined();
      expect(tryStaticRequestFieldPaths(f.handle, f.binding, 'read')).toBeUndefined();
      expect(read).not.toHaveBeenCalled();
      expect(await evaluateAuthorizedOutputField(f.handle, f.binding, 'first')).toBe(true);
      expect(read).toHaveBeenCalledTimes(1);
    },
  );

  it('retains exact/dotted request-key reuse when static request metadata runs first', async () => {
    const schema = {
      'branch.value': true,
      branch: { read: true, sub: { value: { read: false, sub: { deep: true } } } },
    };
    const f = await fixture(
      schema,
      {},
      {
        configuration: {
          catalog: { paths: ['branch', 'branch.value', 'branch.value.deep'] },
          permissionSchema: schema,
        },
      },
    );
    expect(await requestOutputFieldPaths(f.handle, f.binding, 'read')).toEqual(['branch.value', 'branch']);
    expect(await evaluateAuthorizedOutputField(f.handle, f.binding, 'branch.value.deep')).toBe(true);
    const other = await resolveDocumentAuthorization(
      createDocumentAuthorizationStage(f.authorization, f.binding, {}),
      () => ({}),
    );
    expect(await evaluateAuthorizedOutputField(other, f.binding, 'branch.value.deep')).toBe(false);
    expect(await requestOutputFieldPaths(other, f.binding, 'read')).toEqual(['branch']);
  });

  it('keeps backend grants out of request metadata and preserves known-trimmed denial', async () => {
    const schema = { first: false, second: true };
    const f = await fixture(schema, {}, { authorization: { outputFields: { mode: 'grant', paths: ['first'] } } });
    expect([...f.batch()!]).toEqual([
      ['first', true],
      ['second', true],
    ]);
    const requestRule = vi.fn(() => false);
    expect(await memoizeDocumentFieldDecision(f.handle, f.binding, 'request:read:first', requestRule)).toBe(false);
    expect(requestRule).toHaveBeenCalledTimes(1);
    expect(await requestOutputFieldPaths(f.handle, f.binding, 'read')).toEqual(['second']);
    const known = await resolveOutputDocumentAuthorization({
      authorization: f.authorization,
      binding: f.binding,
      snapshot: {},
      context: { modelName: 'StaticBatch' },
      knownOutput: true,
    });
    expect(tryStaticOutputFieldDecisions(known, f.binding, f.plan, ['first', 'second'])!.get('first')).toBe(true);
    const denied = await fixture();
    const trimmed = await resolveOutputDocumentAuthorization({
      authorization: denied.authorization,
      binding: denied.binding,
      snapshot: {},
      context: { modelName: 'StaticBatch' },
      knownOutput: true,
    });
    await memoizeDocumentFieldDecision(trimmed, denied.binding, 'request:read:first', () => false);
    expect(tryStaticOutputFieldDecisions(trimmed, denied.binding, denied.plan, ['first'])!.get('first')).toBe(false);
  });
});

describe('static pass observable-boundary validation and reentry', () => {
  it.each(['ordinary', 'date', 'buffer', 'bson'].flatMap((kind) => [false, true].map((cold) => ({ kind, cold }))))(
    'rejects $kind mutation before a static batch (cold: $cold)',
    async ({ kind, cold }) => {
      const snapshot = {
        first: 'one',
        second: 'two',
        native:
          kind === 'date'
            ? new Date(1)
            : kind === 'buffer'
              ? Buffer.from([1])
              : kind === 'bson'
                ? new mongo.BSON.ObjectId()
                : { value: 1 },
      };
      const f = await fixture(undefined, snapshot);
      if (!cold) expect(f.batch()!.get('first')).toBe(true);
      if (snapshot.native instanceof Date) snapshot.native.setTime(2);
      else if (Buffer.isBuffer(snapshot.native)) snapshot.native[0] = 2;
      else if (snapshot.native instanceof mongo.BSON.ObjectId) snapshot.native.id = Buffer.alloc(12);
      else snapshot.native.value = 2;
      expect(() => f.batch()).toThrow(ServiceAuthorizationError);
      await expect(f.finalize()).rejects.toBeInstanceOf(ServiceAuthorizationError);
    },
  );

  it.each([1, 3])(
    'rejects input mutation by native validation observation %s (before/after the pure body)',
    async (observation) => {
      const snapshot = { first: 'one', second: 'two', native: new mongo.BSON.ObjectId() };
      let mutate = () => {};
      Object.assign(snapshot.native, {
        toBSON: () => {
          mutate();
          return 'stable wire value';
        },
      });
      const f = await fixture(undefined, snapshot);
      let calls = 0;
      mutate = () => {
        if (++calls === observation) snapshot.first = 'changed after being visited';
      };
      expect(() => f.batch()).toThrow(ServiceAuthorizationError);
      expect(calls).toBe(observation + 1);
    },
  );

  it('does not overwrite a memo created by post-validation native reentry', async () => {
    const snapshot = { first: 'one', second: 'two', native: new mongo.BSON.ObjectId() };
    let reenter = () => {};
    Object.assign(snapshot.native, {
      toBSON: () => {
        reenter();
        return 'stable wire value';
      },
    });
    const f = await fixture(undefined, snapshot);
    let calls = 0;
    const wait = waiting();
    let pending!: Promise<boolean>;
    reenter = () => {
      if (++calls === 3) pending = memoizeDocumentFieldDecision(f.handle, f.binding, 'output:first', wait.evaluate);
    };
    expect(f.batch()).toBeUndefined();
    await wait.started;
    wait.release(false);
    expect(await pending).toBe(false);
    expect(f.batch()!.get('first')).toBe(false);
  });

  it('rejects plan enlargement by a wire method outside the pure body', async () => {
    const snapshot = { first: 'one', second: 'two', native: new Date(1) };
    const f = await fixture(undefined, snapshot);
    const getTime = Date.prototype.getTime;
    vi.spyOn(Date.prototype, 'getTime').mockImplementation(function (this: Date) {
      f.plan.outputPersistedFields.push('denied');
      return getTime.call(this);
    });
    expect(() => f.batch()).toThrow(ServiceAuthorizationError);
  });

  it('does not read a binding getter installed by native admission validation inside a decision batch', async () => {
    const snapshot = { first: 'one', second: 'two', native: new mongo.BSON.ObjectId() };
    let install = () => {};
    Object.assign(snapshot.native, {
      toBSON: () => {
        install();
        return 'stable wire value';
      },
    });
    const f = await fixture(undefined, snapshot);
    const request = f.binding.request;
    const getter = vi.fn(() => {
      snapshot.first = 'changed by a binding getter';
      return request;
    });
    install = () => Object.defineProperty(f.binding, 'request', { configurable: true, get: getter });
    expect(f.batch()).toBeUndefined();
    expect(getter).not.toHaveBeenCalled();
    expect(() => evaluateAuthorizedOutputField(f.handle, f.binding, 'first')).toThrow(ServiceAuthorizationError);
    expect(getter).toHaveBeenCalled();
  });

  it.each(['source', 'binding', 'plan'] as const)(
    'checks queued %s mutation on the finalizer batch resume',
    async (kind) => {
      const snapshot = { first: 'one', second: 'two', native: new Date(1) };
      const f = await fixture(undefined, snapshot);
      const batch = documentAuthorization.tryStaticOutputFieldDecisions;
      vi.spyOn(documentAuthorization, 'tryStaticOutputFieldDecisions').mockImplementation((...args) => {
        const decisions = batch(...args);
        if (decisions) {
          queueMicrotask(() => {
            if (kind === 'source') snapshot.first = 'queued change';
            else if (kind === 'binding') f.plan.authorizationBinding = { ...f.binding, model: {} };
            else f.plan.outputPersistedFields.push('denied');
          });
        }
        return decisions;
      });
      await expect(f.finalize()).rejects.toBeInstanceOf(ServiceAuthorizationError);
    },
  );

  it('never confers validity on a stale different stage reentered by a native wire hook', async () => {
    const stale = await fixture();
    stale.snapshot.first = 'stale';
    const snapshot = { first: 'one', second: 'two', native: new mongo.BSON.ObjectId() };
    let reenter = () => {};
    Object.assign(snapshot.native, {
      toBSON: () => {
        reenter();
        return 'stable wire value';
      },
    });
    const f = await fixture(undefined, snapshot);
    const entered = vi.fn(() => {
      expect(() => stale.batch()).toThrow(ServiceAuthorizationError);
      expect(() => evaluateAuthorizedOutputField(stale.handle, stale.binding, 'first')).toThrow(
        ServiceAuthorizationError,
      );
    });
    reenter = entered;
    expect(f.batch()!.get('first')).toBe(true);
    expect(entered).toHaveBeenCalledTimes(4);
  });

  it('keeps a queued native-wire mutation observable before consuming batch decisions', async () => {
    const snapshot = { first: 'one', second: 'two', native: new mongo.BSON.ObjectId() };
    let queue = () => {};
    Object.assign(snapshot.native, {
      toBSON: () => {
        queue();
        return 'stable wire value';
      },
    });
    const f = await fixture(undefined, snapshot);
    const batch = documentAuthorization.tryStaticOutputFieldDecisions;
    vi.spyOn(documentAuthorization, 'tryStaticOutputFieldDecisions').mockImplementation((...args) => {
      queue = () =>
        queueMicrotask(() => {
          snapshot.first = 'queued wire change';
        });
      return batch(...args);
    });
    await expect(f.finalize()).rejects.toBeInstanceOf(ServiceAuthorizationError);
  });

  it('does not let native-wire reentry pass a stale different handle through the public helper', async () => {
    const stale = await helperFixture();
    stale.snapshot.first = 'stale';
    const native = new mongo.BSON.ObjectId();
    let reenter = () => {};
    Object.assign(native, {
      toBSON: () => {
        reenter();
        return 'stable wire value';
      },
    });
    const f = await helperFixture(native);
    const nested: Promise<void>[] = [];
    reenter = () => {
      nested.push(
        stale.pick().then(
          () => {
            throw new Error('stale helper unexpectedly succeeded');
          },
          (error) => {
            expect(error).toBeInstanceOf(ServiceAuthorizationError);
          },
        ),
      );
    };
    expect(await f.pick()).toEqual({ first: 'one', second: 'two' });
    expect(nested.length).toBeGreaterThanOrEqual(4);
    await Promise.all(nested);
  });

  it('revalidates an associated output mutated by its native snapshot check before using static decisions', async () => {
    const f = await helperFixture(undefined, true);
    const getTime = Date.prototype.getTime;
    vi.spyOn(Date.prototype, 'getTime').mockImplementation(function (this: Date) {
      if (this === f.output.marker) f.output.first = 'changed after being copied';
      return getTime.call(this);
    });
    await expect(f.pick()).rejects.toBeInstanceOf(ServiceAuthorizationError);
  });

  it('keeps owning-parent checks and ancestor callbacks on the conservative child path', async () => {
    const ancestor = vi.fn(() => true);
    const schema = { branch: { read: ancestor, sub: { first: false, second: true } } };
    const configuration = {
      catalog: { paths: ['branch', 'branch.first', 'branch.second'], containerPaths: ['branch'] },
      permissionSchema: schema,
    };
    const f = await fixture(schema, { first: 'one', native: new Date(1) }, { configuration });
    const binding = { ...f.binding, scopePath: ['branch'] };
    const authorization = resolveServiceAuthorization({ ...f.input, binding, parent: f.authorization });
    const child = await resolveOutputDocumentAuthorization({
      authorization,
      binding,
      snapshot: { first: 'never', second: 'yes' },
      context: { modelName: 'StaticBatch' },
      owningDocument: f.handle,
      owningBinding: f.binding,
    });
    const plan = planAuthorizedModelProjection({ authorization, binding });
    expect(tryStaticOutputFieldDecisions(child, binding, plan, ['second'])).toBeUndefined();
    expect(await evaluateAuthorizedOutputField(child, binding, 'first')).toBe(false);
    expect(ancestor).toHaveBeenCalledTimes(1);
    expect(await evaluateAuthorizedOutputField(child, binding, 'second')).toBe(true);
    expect(ancestor).toHaveBeenCalledTimes(1);
    (f.snapshot.native as Date).setTime(2);
    expect(() => evaluateAuthorizedOutputField(child, binding, 'second')).toThrow(ServiceAuthorizationError);
  });

  it.each(['output', 'native', 'source'].flatMap((kind) => [false, true].map((cold) => ({ kind, cold }))))(
    'retains immediate pending handle-helper $kind mutation rejection (cold: $cold)',
    async ({ kind, cold }) => {
      const native = new Date(1);
      const f = await helperFixture(native);
      if (!cold) await f.pick();
      const pending = f.pick();
      if (kind === 'output') f.output.first = 'changed';
      else if (kind === 'native') native.setTime(2);
      else f.snapshot.first = 'changed';
      await expect(pending).rejects.toBeInstanceOf(ServiceAuthorizationError);
    },
  );
});
