import { mongo } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Permission from '../src/permission';
import type { AccessRouterRequest } from '../src/interfaces';
import type { AuthorizationBinding } from '../src/acl/service-authorization';
import { resolveServiceAuthorization, ServiceAuthorizationError } from '../src/acl/service-authorization';
import {
  assertDocumentAuthorizationStage,
  createDocumentAuthorizationStage,
  memoizeDocumentFieldDecision,
  readDocumentAuthorization,
  readDocumentAuthorizationAccess,
  resolveDocumentAuthorization,
} from '../src/acl/document-authorization';
import * as snapshots from '../src/acl/authorization-snapshot';

function callInput() {
  const binding = {
    request: { actor: 'original' } as unknown as AccessRouterRequest,
    runtime: {},
    model: {},
    modelName: 'Owned',
    scopePath: [],
  };
  return {
    binding,
    access: { operation: 'read', outputAccess: 'read', virtualAccess: 'read', docPermissionsAccess: 'read' },
    configuration: { catalog: { paths: ['value'] } },
    requestPermissions: new Permission({ reader: true }),
  };
}

async function owner(snapshot: Record<string, unknown> = { value: 'original' }) {
  const input = callInput();
  const call = resolveServiceAuthorization(input);
  const stage = createDocumentAuthorizationStage(call, input.binding, snapshot);
  const handle = await resolveDocumentAuthorization(stage, () => ({ owner: true }));
  return { binding: input.binding, call, stage, handle, snapshot };
}

afterEach(() => vi.restoreAllMocks());

describe('ordinary document owner reads retain both snapshot observations', () => {
  it.each(['access', 'grants'] as const)('%s reader checks an ordinary stage twice', async (kind) => {
    const hidden = Object.defineProperty(Object.create(null), 'value', { value: 'hidden' });
    const f = await owner({ value: ['original', { hidden }] });
    const matches = vi.spyOn(snapshots, 'matchesAuthorizationSnapshot');
    const view =
      kind === 'access'
        ? readDocumentAuthorizationAccess(f.handle, f.binding)
        : readDocumentAuthorization(f.handle, f.binding);
    expect(view.authorization).toBe(f.call);
    expect(view.stage).toBe(f.stage);
    expect(matches).toHaveBeenCalledTimes(2);
  });

  it.each([
    { name: 'Date.hasInstance', constructor: Date, key: Symbol.hasInstance },
    { name: 'RegExp.hasInstance', constructor: RegExp, key: Symbol.hasInstance },
    { name: 'Map.hasInstance', constructor: Map, key: Symbol.hasInstance },
    { name: 'Set.hasInstance', constructor: Set, key: Symbol.hasInstance },
    { name: 'Buffer.isBuffer', constructor: Buffer, key: 'isBuffer' },
  ])('rejects ordinary-source mutation during $name normalization', async ({ constructor, key }) => {
    const snapshot = { value: 'original', nested: { value: true } };
    const f = await owner(snapshot);
    const descriptor = Object.getOwnPropertyDescriptor(constructor, key);
    const matches = vi.spyOn(snapshots, 'matchesAuthorizationSnapshot');
    let failure: unknown;
    try {
      Object.defineProperty(constructor, key, {
        configurable: true,
        value(value: unknown) {
          if (value === snapshot.nested) snapshot.value = 'changed after it was copied';
          return false;
        },
      });
      try {
        readDocumentAuthorizationAccess(f.handle, f.binding);
      } catch (error) {
        failure = error;
      }
    } finally {
      if (descriptor) Object.defineProperty(constructor, key, descriptor);
      else Reflect.deleteProperty(constructor, key);
    }
    expect(snapshot.value).toBe('changed after it was copied');
    expect(matches).toHaveBeenCalledTimes(2);
    expect(failure).toBeInstanceOf(ServiceAuthorizationError);
  });

  it.each([false, true])('retains scheduled/resume validation and a settled %s decision', async (allowed) => {
    const f = await owner();
    const evaluate = vi.fn(function (
      this: AccessRouterRequest,
      permissions: Permission,
      grants: Readonly<Record<string, unknown>>,
    ) {
      expect(this).toBe(f.binding.request);
      expect(permissions.has('reader')).toBe(true);
      expect(grants).toEqual({ owner: true });
      return allowed;
    });
    const matches = vi.spyOn(snapshots, 'matchesAuthorizationSnapshot');
    expect(await memoizeDocumentFieldDecision(f.handle, f.binding, 'value', evaluate)).toBe(allowed);
    expect(matches).toHaveBeenCalledTimes(4); // two admissions, scheduled start, post-await
    matches.mockClear();
    expect(await memoizeDocumentFieldDecision(f.handle, f.binding, 'value', evaluate)).toBe(allowed);
    expect(matches).toHaveBeenCalledTimes(3); // two admissions and cached settlement
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('retains both observations after an equal proxy replacement', async () => {
    const snapshot = { value: 'original', nested: { value: true } };
    const f = await owner(snapshot);
    readDocumentAuthorizationAccess(f.handle, f.binding);
    let armed = true;
    const ownKeys = vi.fn((target: object) => {
      if (armed) {
        armed = false;
        snapshot.value = 'changed after it was copied';
      }
      return Reflect.ownKeys(target);
    });
    snapshot.nested = new Proxy(snapshot.nested, { ownKeys });
    const matches = vi.spyOn(snapshots, 'matchesAuthorizationSnapshot');
    expect(() => readDocumentAuthorizationAccess(f.handle, f.binding)).toThrow(ServiceAuthorizationError);
    expect(matches).toHaveBeenCalledTimes(2);
    expect(ownKeys).toHaveBeenCalledTimes(2); // exactly the two normalization observations
  });

  it('retains the check after binding getters in explicit stage admission', async () => {
    const f = await owner();
    const binding = {
      ...f.binding,
      get request() {
        f.snapshot.value = 'changed during binding validation';
        return f.binding.request;
      },
    };
    const matches = vi.spyOn(snapshots, 'matchesAuthorizationSnapshot');
    expect(() => assertDocumentAuthorizationStage(f.stage, f.call, binding, f.snapshot)).toThrow(
      ServiceAuthorizationError,
    );
    expect(matches).toHaveBeenCalledTimes(2);
  });

  it('keeps the access reader binding check after the full reader binding check', async () => {
    const f = await owner();
    let reads = 0;
    const binding = {
      ...f.binding,
      get request() {
        return ++reads === 1 ? f.binding.request : ({} as AccessRouterRequest);
      },
    };
    expect(() => readDocumentAuthorization(f.handle, binding)).toThrow(ServiceAuthorizationError);
    expect(reads).toBe(2);
  });

  it('checks binding after grant-native copying without sharing the stored grant', async () => {
    const input = callInput();
    const call = resolveServiceAuthorization(input);
    const stage = createDocumentAuthorizationStage(call, input.binding, { value: 'original' });
    const handle = await resolveDocumentAuthorization(stage, () => ({ when: new Date(1) }));
    const binding = { ...input.binding };
    const getTime = Date.prototype.getTime;
    vi.spyOn(Date.prototype, 'getTime').mockImplementation(function (this: Date) {
      binding.model = {};
      return getTime.call(this);
    });
    expect(() => readDocumentAuthorization(handle, binding)).toThrow(ServiceAuthorizationError);
    expect((readDocumentAuthorization(handle, input.binding).grants.when as Date).getTime()).toBe(1);
  });
});

describe('callback-capable snapshot validations retain their duplicate observations', () => {
  it('does not infer live-input purity from a native normalized to an ordinary snapshot', async () => {
    let armed = false;
    const snapshot = { value: 'original', native: new mongo.BSON.ObjectId() };
    const toBSON = vi.fn(() => {
      if (armed) snapshot.value = 'changed after it was copied';
      return 'normalized wire value';
    });
    Object.assign(snapshot.native, { toBSON });
    const f = await owner(snapshot);
    toBSON.mockClear();
    armed = true;
    expect(() => readDocumentAuthorizationAccess(f.handle, f.binding)).toThrow(ServiceAuthorizationError);
    expect(toBSON).toHaveBeenCalledTimes(2);
  });

  it.each(['access', 'grants', 'memo'] as const)(
    'rejects a wire hook mutation on %s admission, including an override installed before import',
    async (kind) => {
      const prototype = mongo.BSON.Long.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'getLowBits')!;
      let mutate = () => {};
      const wire = vi.fn(function (this: InstanceType<typeof mongo.BSON.Long>) {
        mutate();
        return descriptor.value.call(this);
      });
      try {
        Object.defineProperty(prototype, 'getLowBits', { ...descriptor, value: wire });
        vi.resetModules();
        const service = await import('../src/acl/service-authorization');
        const document = await import('../src/acl/document-authorization');
        const input = callInput();
        const call = service.resolveServiceAuthorization(input);
        const snapshot = { value: 'original', native: new mongo.BSON.Long(1, 2) };
        const stage = document.createDocumentAuthorizationStage(call, input.binding, snapshot);
        const handle = await document.resolveDocumentAuthorization(stage, () => ({}));
        if (kind === 'memo') await document.memoizeDocumentFieldDecision(handle, input.binding, 'value', () => true);
        wire.mockClear();
        mutate = () => {
          snapshot.value = 'changed after it was copied';
        };
        expect(() => {
          if (kind === 'access') document.readDocumentAuthorizationAccess(handle, input.binding);
          else if (kind === 'grants') document.readDocumentAuthorization(handle, input.binding);
          else document.memoizeDocumentFieldDecision(handle, input.binding, 'value', () => false);
        }).toThrow(service.ServiceAuthorizationError);
        expect(wire).toHaveBeenCalledTimes(2);
      } finally {
        Object.defineProperty(prototype, 'getLowBits', descriptor);
        vi.resetModules();
      }
    },
  );

  it('does not confer validity on a stale different stage reentered from a native callback', async () => {
    const stale = await owner();
    const f = await owner({ when: new Date(1) });
    stale.snapshot.value = 'changed';
    const getTime = Date.prototype.getTime;
    const reentry = vi.fn();
    vi.spyOn(Date.prototype, 'getTime').mockImplementation(function (this: Date) {
      expect(() => readDocumentAuthorizationAccess(stale.handle, stale.binding)).toThrow(ServiceAuthorizationError);
      reentry();
      return getTime.call(this);
    });
    expect(readDocumentAuthorizationAccess(f.handle, f.binding).authorization).toBe(f.call);
    expect(reentry).toHaveBeenCalledTimes(2);
  });
});

describe('ordinary memo owners are revalidated at every existing asynchronous boundary', () => {
  function mutation(f: Awaited<ReturnType<typeof owner>>, binding: AuthorizationBinding, kind: string) {
    return () => {
      if (kind === 'source') f.snapshot.value = 'changed';
      else (binding as { model: object }).model = {};
    };
  }

  it.each(['source', 'binding'])('checks queued %s mutation before a cold evaluator starts', async (kind) => {
    const f = await owner();
    const binding = { ...f.binding };
    const evaluate = vi.fn(() => true);
    queueMicrotask(mutation(f, binding, kind));
    const pending = memoizeDocumentFieldDecision(f.handle, binding, 'value', evaluate);
    await expect(pending).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each(['source', 'binding'])('checks queued %s mutation after a synchronous evaluator', async (kind) => {
    const f = await owner();
    const binding = { ...f.binding };
    const evaluate = vi.fn(() => {
      queueMicrotask(mutation(f, binding, kind));
      return true;
    });
    await expect(memoizeDocumentFieldDecision(f.handle, binding, 'value', evaluate)).rejects.toBeInstanceOf(
      ServiceAuthorizationError,
    );
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it.each(['source', 'binding'])('checks %s mutation on both pending consumers after an await', async (kind) => {
    const f = await owner();
    const binding = { ...f.binding };
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const evaluate = vi.fn(async () => {
      entered();
      await waiting;
      return true;
    });
    const pending = memoizeDocumentFieldDecision(f.handle, binding, 'value', evaluate);
    await started;
    const cached = memoizeDocumentFieldDecision(f.handle, binding, 'value', evaluate);
    queueMicrotask(mutation(f, binding, kind));
    release();
    await expect(pending).rejects.toBeInstanceOf(ServiceAuthorizationError);
    await expect(cached).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it.each(['source', 'binding'])('checks queued %s mutation on a settled memo hit', async (kind) => {
    const f = await owner();
    const binding = { ...f.binding };
    const evaluate = vi.fn(() => true);
    expect(await memoizeDocumentFieldDecision(f.handle, binding, 'value', evaluate)).toBe(true);
    queueMicrotask(mutation(f, binding, kind));
    const cached = memoizeDocumentFieldDecision(f.handle, binding, 'value', evaluate);
    await expect(cached).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it.each(['source', 'binding'])('authenticates %s before reusing a retained rejection', async (kind) => {
    const f = await owner();
    const binding = { ...f.binding };
    const error = new Error('retained failure');
    const evaluate = vi.fn(() => {
      throw error;
    });
    await expect(memoizeDocumentFieldDecision(f.handle, binding, 'value', evaluate)).rejects.toBe(error);
    await expect(memoizeDocumentFieldDecision(f.handle, binding, 'value', evaluate)).rejects.toBe(error);
    mutation(f, binding, kind)();
    expect(() => memoizeDocumentFieldDecision(f.handle, binding, 'value', evaluate)).toThrow(ServiceAuthorizationError);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
