import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { GuardHook, ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
let serial = 0;
afterEach(() => {
  vi.restoreAllMocks();
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^DpvGuard/);
});

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

async function fixture(hydration: 'lean' | 'hydrated', enabled: boolean, strict = true) {
  const api = createAccessRuntime();
  runtimes.push(api);
  api.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ['canRead'],
    requireReadOperationAccessForPopulateDependencies: strict,
    requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 1 },
  } as never);
  const n = ++serial;
  const Target = mongoose.model(
    `DpvGuardTarget${n}`,
    new mongoose.Schema({ name: String, balance: Number, tenant: String }),
  );
  const Source = mongoose.model(
    `DpvGuardSource${n}`,
    new mongoose.Schema({ account: { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName } }),
  );
  const targetRouter = api.createRouter(Target, {
    operationAccess: { read: true },
    permissionSchema: { name: true, balance: false, tenant: false },
  });
  const getter = vi.fn((_doc, _permissions, _context, populated) => populated.account?.balance ?? null);
  api.createRouter(Source, {
    operationAccess: { read: true, list: true },
    permissionSchema: { account: true, eligible: true },
    hydration: { find: hydration, findOne: hydration },
    virtuals: enabled
      ? { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance -_id' }] } }
      : {},
  } as never);
  const target = await Target.create({ name: 'public name', balance: 7, tenant: 'a' });
  const source = await Source.create({ account: target._id });
  const finds = vi.spyOn(Target.collection, 'find');
  const app = express();
  app.use(express.json());
  app.use(api());
  let callback: (req: ModelRequest) => Promise<unknown>;
  let value: unknown;
  let failure: unknown;
  app.post('/probe', async (req, res) => {
    try {
      value = await callback(req as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    Source,
    Target,
    targetRouter,
    target,
    getter,
    finds,
    read(req: ModelRequest, access = 'read', authorization?: unknown, service = req.macl.getService(Source.modelName)) {
      return service.findOne(
        { _id: source._id },
        {
          select: ['account', ...(enabled ? ['eligible'] : []), '-_id'],
          populate: [{ path: 'account', access, select: 'name -_id' }],
        },
        { ...quiet, authorization } as never,
      );
    },
    holdSource() {
      const entered = latch();
      const held = latch();
      api.setModelOption(Source.modelName, 'baseFilter.read', async () => {
        entered.resolve();
        await held.promise;
        return {};
      });
      return { entered: entered.promise, release: held.resolve };
    },
    async execute<T>(run: (req: ModelRequest) => Promise<T>): Promise<T> {
      callback = run;
      failure = undefined;
      await request(app).post('/probe').send({}).expect(200);
      if (failure) throw failure;
      return value as T;
    },
  };
}

interface GuardCase {
  name: string;
  stored: unknown;
  defaults: unknown;
  allowed: boolean;
  access?: string;
  privateAllowed?: boolean;
}
const guardCases: GuardCase[] = [
  { name: 'exact runtime read', stored: undefined, defaults: { read: true }, allowed: true },
  {
    name: 'exact runtime false before default',
    stored: undefined,
    defaults: { read: false, default: true },
    allowed: false,
  },
  {
    name: 'runtime default is not an exact default',
    stored: undefined,
    defaults: { default: true },
    allowed: false,
  },
  { name: 'runtime bare rule is not an exact default', stored: undefined, defaults: true, allowed: false },
  { name: 'absent runtime rule', stored: undefined, defaults: undefined, allowed: false },
  { name: 'stored exact false', stored: { read: false, default: true }, defaults: { read: true }, allowed: false },
  { name: 'stored exact true', stored: { read: true, default: false }, defaults: { read: false }, allowed: true },
  {
    name: 'stored undefined uses stored default',
    stored: { read: undefined, default: true },
    defaults: { read: false },
    allowed: true,
  },
  { name: 'stored default false', stored: { default: false }, defaults: { read: true }, allowed: false },
  { name: 'stored bare false', stored: false, defaults: { read: true }, allowed: false },
  { name: 'stored bare true', stored: true, defaults: { read: false }, allowed: true },
  { name: 'empty stored parent blocks runtime fallback', stored: {}, defaults: { read: true }, allowed: false },
  {
    name: 'defined stored sibling blocks runtime fallback',
    stored: { list: true },
    defaults: { read: true },
    allowed: false,
  },
  { name: 'stored permission rule', stored: 'canRead', defaults: { read: false }, allowed: true },
  { name: 'exact runtime permission array', stored: undefined, defaults: { read: ['canRead'] }, allowed: true },
  {
    name: 'custom exact before default',
    stored: { audit: true, read: false, default: false },
    defaults: { audit: false, read: true },
    access: 'audit',
    allowed: true,
    privateAllowed: false,
  },
  {
    name: 'custom stored default',
    stored: { read: false, default: true },
    defaults: { audit: false },
    access: 'audit',
    allowed: true,
    privateAllowed: false,
  },
  {
    name: 'custom exact runtime fallback',
    stored: undefined,
    defaults: { audit: true, read: false },
    access: 'audit',
    allowed: true,
    privateAllowed: false,
  },
  {
    name: 'custom does not inherit runtime read',
    stored: undefined,
    defaults: { read: true },
    access: 'audit',
    allowed: false,
    privateAllowed: true,
  },
];

describe.each(['lean', 'hydrated'] as const)('DPV-08 captured operation guards (%s)', (hydration) => {
  describe.each([
    { enabled: false, strict: true },
    { enabled: true, strict: true },
    { enabled: true, strict: false },
  ])('private dependency=$enabled, strict=$strict', ({ enabled, strict }) => {
    it.each(guardCases)('$name preserves ordinary Core admission and private read independence', async (entry) => {
      const f = await fixture(hydration, enabled, strict);
      f.api.setDefaultModelOption('operationAccess', entry.defaults as never);
      f.targetRouter.setOption('operationAccess', entry.stored as never);
      const access = entry.access ?? 'read';
      const result = await f.execute(async (req) => {
        expect(await req.macl.isAllowed(f.Target.modelName, access)).toBe(entry.allowed);
        return f.read(req, access);
      });
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      // PPR-02 tightens only ACTIVE dependency references. No-feature ID fallback stays intact.
      if (enabled && !(entry.privateAllowed ?? entry.allowed)) expect(result.data).not.toHaveProperty('account');
      else expect(result.data.account).toEqual(entry.allowed ? { name: 'public name' } : f.target._id);
      const computed = enabled && (!strict || (entry.privateAllowed ?? entry.allowed));
      if (computed) expect(result.data).toHaveProperty('eligible', 7);
      else expect(result.data).not.toHaveProperty('eligible');
      expect(f.getter).toHaveBeenCalledTimes(computed ? 1 : 0);
      expect(f.finds.mock.calls.length).toBe(
        entry.allowed && computed && access !== 'read' ? 2 : entry.allowed || computed ? 1 : 0,
      );
      expect(result.data).not.toHaveProperty('account.balance');
    });

    it.each(['exact', 'default', 'bare', 'runtime-exact'] as const)(
      'retains a %s function guard with the captured actor/permissions and no route variants',
      async (placement) => {
        const f = await fixture(hydration, enabled, strict);
        const variant = vi.fn(() => false);
        const guard = vi.fn<GuardHook>(async function (permissions) {
          await Promise.resolve();
          return permissions.has('canRead');
        });
        f.api.setDefaultModelOption('operationAccess', {
          read: placement === 'runtime-exact' ? guard : false,
          basicRead: variant,
          advancedRead: variant,
        });
        f.targetRouter.setOption(
          'operationAccess',
          (placement === 'exact'
            ? { read: guard, default: false, basicRead: variant, advancedRead: variant }
            : placement === 'default'
              ? { default: guard, basicRead: variant, advancedRead: variant }
              : placement === 'bare'
                ? guard
                : undefined) as never,
        );
        let actor: ModelRequest;
        const result = await f.execute((req) => {
          actor = req;
          return f.read(req);
        });
        expect(result).toMatchObject({ success: true, data: { account: { name: 'public name' } } });
        if (!result.success) throw new Error(result.code);
        expect(result.data.account).toEqual({ name: 'public name' });
        expect(guard).toHaveBeenCalledTimes(enabled ? 2 : 1);
        for (const [index, [permissions]] of guard.mock.calls.entries()) {
          expect(guard.mock.contexts[index]).toBe(actor!);
          expect(permissions.has('canRead')).toBe(true);
        }
        expect(variant).not.toHaveBeenCalled();
        if (enabled) expect(result.data).toHaveProperty('eligible', 7);
        expect(f.finds).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ['runtime-default', true],
      ['runtime-default', false],
      ['target-option', true],
      ['target-option', false],
    ] as const)('%s replacement from %s only affects later calls on the same service', async (replacement, initial) => {
      const f = await fixture(hydration, enabled, strict);
      f.api.setDefaultModelOption('operationAccess.read', initial);
      f.targetRouter.setOption(
        'operationAccess',
        (replacement === 'runtime-default' ? undefined : { read: initial }) as never,
      );
      const pause = f.holdSource();
      const results = await f.execute(async (req) => {
        const service = req.macl.getService(f.Source.modelName);
        const pending = f.read(req, 'read', undefined, service);
        await pause.entered;
        try {
          if (replacement === 'runtime-default') f.api.setDefaultModelOption('operationAccess.read', !initial);
          else f.targetRouter.setOption('operationAccess', { read: !initial });
          expect(await req.macl.isAllowed(f.Target.modelName, 'read')).toBe(!initial);
        } finally {
          pause.release();
        }
        return [await pending, await f.read(req, 'read', undefined, service)];
      });
      for (const [index, result] of results.entries()) {
        const allowed = index === 0 ? initial : !initial;
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        if (enabled && !allowed) expect(result.data).not.toHaveProperty('account');
        else expect(result.data.account).toEqual(allowed ? { name: 'public name' } : f.target._id);
        if (enabled && (allowed || !strict)) expect(result.data).toHaveProperty('eligible', 7);
        else expect(result.data).not.toHaveProperty('eligible');
      }
      expect(f.getter).toHaveBeenCalledTimes(enabled ? (strict ? 1 : 2) : 0);
      expect(f.finds).toHaveBeenCalledTimes(enabled && !strict ? 2 : 1);
    });
  });

  it.each(['request', 'scope', 'unrestricted'] as const)(
    'PPR-02 base read visibility overrides related operation grants with %s rows',
    async (mode) => {
      const f = await fixture(hydration, true);
      f.api.setDefaultModelOption('operationAccess.read', true);
      f.targetRouter.setOption('operationAccess', { read: false });
      const base = vi.fn(() => false);
      f.api.setModelOption(f.Target.modelName, 'baseFilter.read', base);
      const result = await f.execute((req) =>
        f.read(req, 'read', {
          related: {
            account: {
              model: f.Target.modelName,
              operation: { mode: 'grant' },
              rows: mode === 'scope' ? { mode, filter: { tenant: 'a' } } : { mode },
            },
          },
        }),
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(result.data).not.toHaveProperty('account');
      expect(result.data).not.toHaveProperty('eligible');
      expect(f.getter).not.toHaveBeenCalled();
      expect(base).toHaveBeenCalledTimes(mode === 'request' ? 1 : 0);
      expect(f.finds).toHaveBeenCalledTimes(mode === 'request' ? 0 : 1);
    },
  );

  it('source row/field grants cannot admit a denied ordinary or private target operation', async () => {
    const f = await fixture(hydration, true);
    f.api.setDefaultModelOption('operationAccess.read', true);
    f.targetRouter.setOption('operationAccess', false);
    const result = await f.execute((req) =>
      f.read(req, 'read', {
        rows: { mode: 'unrestricted' },
        outputFields: { mode: 'unrestricted' },
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    expect(result.data).not.toHaveProperty('account');
    expect(result.data).not.toHaveProperty('eligible');
    expect(f.getter).not.toHaveBeenCalled();
    expect(f.finds).not.toHaveBeenCalled();
  });

  it.each(['terminal-denial', 'different-tenant'] as const)(
    'related row replacement never supplies private request rows (%s)',
    async (scope) => {
      const f = await fixture(hydration, true);
      f.api.setDefaultModelOption('operationAccess.read', true);
      f.targetRouter.setOption('operationAccess', undefined as never);
      const base = vi.fn(() => (scope === 'terminal-denial' ? false : { tenant: 'b' }));
      f.api.setModelOption(f.Target.modelName, 'baseFilter.read', base);
      const result = await f.execute((req) =>
        f.read(req, 'read', {
          related: {
            account: {
              model: f.Target.modelName,
              operation: { mode: 'grant' },
              rows: { mode: 'unrestricted' },
            },
          },
        }),
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(result.data.account).toEqual({ name: 'public name' });
      if (scope === 'terminal-denial') expect(result.data).not.toHaveProperty('eligible');
      else expect(result.data).toHaveProperty('eligible', null);
      expect(f.getter).toHaveBeenCalledTimes(scope === 'terminal-denial' ? 0 : 1);
      expect(base).toHaveBeenCalledTimes(1);
      expect(f.finds).toHaveBeenCalledTimes(scope === 'terminal-denial' ? 1 : 2);
    },
  );
});
