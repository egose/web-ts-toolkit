import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../src/index';
import type { ModelRequest, ModelRouterOptions } from '../src/interfaces';
import * as authorization from '../src/acl/service-authorization';
import { readDocumentAuthorization } from '../src/acl/document-authorization';
import { getServiceExecutors } from '../src/acl/service-execution';
import {
  unsafeAuthorizationFastPathOptions as fastFlags,
  unsafeSnapshotOptions,
} from '../src/acl/unsafe-snapshot-options';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const originalOn = Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, true]));
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
let serial = 0;

async function fixture(options: ModelRouterOptions = {}) {
  const api = createAccessRuntime();
  api.setGlobalOptions({ globalPermissions: () => ['reader'], logger: { warn: vi.fn() } });
  const n = ++serial;
  const Target = mongoose.model(
    `FastOptionsHttpTarget${n}`,
    new mongoose.Schema(
      { name: String, secret: String, hidden: String, group: String, tenant: String, owner: Boolean },
      { versionKey: false },
    ),
  );
  const Root = mongoose.model(
    `FastOptionsHttpRoot${n}`,
    new mongoose.Schema(
      {
        value: String,
        hidden: String,
        group: String,
        tenant: String,
        owner: Boolean,
        children: [new mongoose.Schema({ label: String, hidden: String }, { _id: false })],
        ref: { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName },
        unsafeUseListAuthorizationFastPath: Boolean,
        unsafeUseReadAuthorizationFastPath: Boolean,
      },
      { versionKey: false },
    ),
  );
  const rootHook = vi.fn((doc: Record<string, unknown>) => ({ owner: doc.owner === true }));
  const targetHook = vi.fn((doc: Record<string, unknown>) => ({ owner: doc.owner === true }));
  api.createRouter(Target, {
    operationAccess: { list: true, read: true, count: true },
    permissionSchema: { name: 'reader', secret: 'doc:owner', hidden: false },
    baseFilter: { list: () => ({ tenant: 'allowed' }), read: () => ({ tenant: 'allowed' }) },
    docPermissions: { read: targetHook, list: targetHook },
    alwaysSelectFields: ['owner'],
    modelPermissionPrefix: 'doc:',
    stripPermissionsField: true,
    ...Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, false])),
    ...Object.fromEntries(fastFlags.map((key) => [key, options[key] !== true])),
  });
  const router = api.createRouter(Root, {
    basePath: '/fast-options',
    operationAccess: { list: true, read: true, create: true, update: true, upsert: true, delete: true },
    permissionSchema: {
      value: true,
      hidden: false,
      ref: true,
      children: { read: true, list: true, sub: { label: 'doc:owner', hidden: false } },
      unsafeUseListAuthorizationFastPath: true,
      unsafeUseReadAuthorizationFastPath: true,
    },
    virtuals: { children: { sub: {} } },
    baseFilter: { read: () => ({ tenant: 'read' }), list: () => ({ tenant: 'list' }) },
    alwaysSelectFields: ['owner'],
    docPermissions: { read: rootHook, list: rootHook },
    modelPermissionPrefix: 'doc:',
    stripPermissionsField: true,
    ...originalOn,
    ...options,
  });
  const targetRows = await Target.insertMany([
    { name: 'owned', secret: 'allowed', hidden: 'never', owner: true, group: 'g', tenant: 'allowed' },
    { name: 'unowned', secret: 'never', hidden: 'never', owner: false, group: 'g', tenant: 'allowed' },
    { name: 'outside', secret: 'never', hidden: 'never', owner: true, group: 'g', tenant: 'outside' },
  ]);
  const rows = await Root.insertMany(
    ['read', 'list'].map((tenant) => ({
      value: tenant,
      hidden: 'never',
      tenant,
      group: 'g',
      owner: true,
      children: [{ label: 'child', hidden: 'never' }],
      ref: targetRows[0]._id,
      unsafeUseListAuthorizationFastPath: true,
      unsafeUseReadAuthorizationFastPath: true,
    })),
  );
  const args = {
    select: ['value', 'hidden', 'children.label', 'children.hidden', 'ref', '-_id'],
    populate: [{ path: 'ref', access: 'read' as const, select: ['name', 'secret', 'hidden', '-_id'] }],
    include: [
      {
        model: Target.modelName,
        path: 'items',
        op: 'list' as const,
        localField: 'group',
        foreignField: 'group',
        args: { select: ['name', 'secret', 'hidden', '-_id'] },
      },
    ],
  };
  const expected = (value: string) => ({
    value,
    children: [{ label: 'child' }],
    ref: { name: 'owned', secret: 'allowed' },
    items: [{ name: 'owned', secret: 'allowed' }, { name: 'unowned' }],
  });
  const rootRouter = api.createRouter({ basePath: '/root', operationAccess: true });
  const app = express().use(express.json()).use(router.routes).use(rootRouter.routes);
  let run!: (req: ModelRequest) => Promise<void>, failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await run(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    Root,
    Target,
    router,
    rootRouter,
    app,
    rows,
    args,
    expected,
    rootHook,
    targetHook,
    async execute(callback: (req: ModelRequest) => Promise<void>) {
      run = callback;
      failure = undefined;
      await request(app).post('/fast-options/probe').send({}).expect(200);
      if (failure) throw failure;
    },
  };
}

function captureObserver() {
  const spy = vi.spyOn(authorization, 'resolveServiceAuthorization');
  const derived = vi.spyOn(authorization, 'deriveTrustedQueryAuthorization');
  return () => {
    const seen = new Set();
    return [spy, derived]
      .flatMap((observer) =>
        observer.mock.results.flatMap((result, index) => {
          if (result.type !== 'return') return [];
          if (!result.value) return [];
          const input = observer.mock.calls[index][0];
          return [
            {
              order: observer.mock.invocationCallOrder[index],
              call: result.value,
              input,
              captured: authorization.readAuthorizationFastPath(result.value, input.binding),
            },
          ];
        }),
      )
      .sort((a, b) => a.order - b.order)
      .filter(({ call }) => {
        if (seen.has(call)) return false;
        seen.add(call);
        return true;
      });
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^FastOptionsHttp/);
});

describe('real direct/public/root captured query selection', () => {
  it.each([0, 1, 2, 3])(
    'selects independent new pair=%s through reads/lists/retry and real authenticated targets/embedded scopes',
    async (pair) => {
      const options = Object.fromEntries(fastFlags.map((key, index) => [key, !!(pair & (1 << index))]));
      const f = await fixture(options),
        captures = captureObserver();
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Root.modelName),
          pub = req.macl.getPublicService(f.Root.modelName);
        for (const entry of [
          'find',
          'findOne',
          'findById',
          'publicList',
          'publicRead',
          'publicReadFilter',
          'retry',
        ] as const) {
          const before = captures().length;
          const result =
            entry === 'find'
              ? await service.find({}, f.args, quiet)
              : entry === 'findOne'
                ? await service.findOne({}, f.args, quiet)
                : entry === 'findById'
                  ? await service.findById(String(f.rows[0]._id), f.args, quiet)
                  : entry === 'publicList'
                    ? await pub._list({}, f.args, quiet)
                    : entry === 'publicReadFilter'
                      ? await pub._readFilter({}, f.args, quiet)
                      : await pub._read(String(f.rows[entry === 'retry' ? 1 : 0]._id), f.args, quiet);
          expect(result.success).toBe(true);
          if (!result.success) throw new Error(result.code);
          const list = entry === 'find' || entry === 'publicList';
          const output = (list ? (result.data as unknown[])[0] : result.data) as Record<string, unknown>;
          expect(output).toEqual(f.expected(list || entry === 'retry' ? 'list' : 'read'));
          const origin = list ? 'list' : 'read';
          const key = origin === 'list' ? fastFlags[0] : fastFlags[1];
          const selected = captures().slice(before);
          expect(selected.length).toBeGreaterThan(3);
          for (const { captured } of selected)
            expect(captured).toEqual({ origin, mode: options[key] ? 'active' : 'off', prerequisites: 15 });
          expect(selected.some(({ input }) => input.binding.modelName === f.Target.modelName)).toBe(true);
          expect(selected.some(({ input }) => input.binding.scopePath?.includes('children'))).toBe(true);
          expect(f.api.getModelOption(f.Target.modelName, key)).toBe(!options[key]);
          if (entry === 'retry') {
            expect(
              selected.some(({ input }) => input.access.operation === 'read' && input.access.outputAccess === 'list'),
            ).toBe(true);
          }
        }
      });
      for (const [url, body] of [
        ['/fast-options/__query', { filter: {}, ...f.args, options: quiet }],
        ['/fast-options/__query/__filter', { filter: {}, ...f.args, options: quiet }],
        [
          '/root',
          [
            {
              target: 'model',
              name: f.Root.modelName,
              op: 'read',
              id: String(f.rows[1]._id),
              args: f.args,
              options: quiet,
            },
            { target: 'model', name: f.Root.modelName, op: 'list', args: f.args, options: quiet },
          ],
        ],
      ] as const) {
        const before = captures().length;
        const response = await request(f.app).post(url).send(body).expect(200);
        expect(JSON.stringify(response.body)).not.toContain('never');
        for (const { captured } of captures().slice(before)) {
          expect(captured).toBeDefined();
          if (captured)
            expect(captured.mode).toBe(
              options[captured.origin === 'list' ? fastFlags[0] : fastFlags[1]] ? 'active' : 'off',
            );
        }
      }
      expect(f.rootHook).toHaveBeenCalled();
      expect(f.targetHook).toHaveBeenCalled();
      f.router.setOption('operationAccess.read', false);
      await request(f.app).get(`/fast-options/${f.rows[0]._id}`).expect(401);
    },
  );

  it.each(['list', 'read'] as const)(
    'captures %s before a real awaited hook and retains mode in later children/retries/handles, not independent hook calls',
    async (origin) => {
      for (const initial of ['off', 'dormant', 'active'] as const) {
        const key = origin === 'list' ? fastFlags[0] : fastFlags[1];
        const docKey =
          origin === 'list' ? 'unsafeSkipListDocumentSnapshotChecks' : 'unsafeSkipReadDocumentSnapshotChecks';
        const f = await fixture({ [key]: initial !== 'off', [docKey]: initial !== 'dormant' });
        const captures = captureObserver();
        await f.execute(async (req) => {
          const service = req.macl.getService(f.Root.modelName),
            pub = req.macl.getPublicService(f.Root.modelName);
          let entered!: () => void,
            release!: () => void,
            first = true;
          const started = new Promise<void>((done) => {
            entered = done;
          });
          const wait = new Promise<void>((done) => {
            release = done;
          });
          let independent: unknown;
          f.router.setOption('overrideFilter', {
            [origin]: async (filter: unknown) => {
              if (first) {
                first = false;
                entered();
                await wait;
                independent = await (origin === 'list' ? service.find({}, {}, quiet) : service.findOne({}, {}, quiet));
              }
              return filter;
            },
          } as never);
          const before = captures().length;
          const pending =
            origin === 'list' ? service.find({}, f.args, quiet) : pub._read(String(f.rows[1]._id), f.args, quiet);
          await started;
          const root = captures()[before];
          expect(root.captured?.mode).toBe(initial);
          try {
            f.router.setOptions({ [key]: initial !== 'active', [docKey]: true });
          } finally {
            release();
          }
          const result = await pending;
          expect(result.success).toBe(true);
          expect(independent).toMatchObject({ success: true });
          if (!result.success) throw new Error(result.code);
          const originating = captures()
            .slice(before)
            .filter(({ call }) => authorization.getAuthorizationProvenance(call) === root.call);
          expect(originating.length).toBeGreaterThan(3);
          for (const { captured } of originating) expect(captured).toBe(root.captured);
          const independentRoots = captures()
            .slice(before + 1)
            .filter(({ input }) => !input.parent);
          expect(independentRoots).toHaveLength(1);
          expect(independentRoots[0].captured?.mode).toBe(initial === 'active' ? 'off' : 'active');
          const output = origin === 'list' ? (result.data as unknown[])[0] : result.data;
          const context = 'contexts' in result ? result.contexts[0] : result.context;
          const binding = getServiceExecutors(service).binding();
          const handleCall = readDocumentAuthorization(context.documentAuthorization, binding).authorization;
          expect(authorization.readAuthorizationFastPath(handleCall, binding)).toBe(root.captured);
          await service.pickAllowedFields(output, 'list', { documentAuthorization: context.documentAuthorization });
          expect(authorization.readAuthorizationFastPath(handleCall, binding)).toBe(root.captured);
          const helperStart = captures().length;
          await service.pickAllowedFields({ value: 'raw' }, 'read');
          expect(
            captures()
              .slice(helperStart)
              .every(({ captured }) => captured === undefined),
          ).toBe(true);
        });
      }
    },
  );

  it('does not activate for actual writes, write-derived reads, new output or dedicated subdocuments', async () => {
    const f = await fixture(Object.fromEntries(fastFlags.map((key) => [key, true]))),
      captures = captureObserver();
    f.router.setOption('baseFilter', {});
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Root.modelName);
      expect(await service.create({ value: 'created' }, {}, quiet)).toMatchObject({ success: true });
      expect(await service.updateById(String(f.rows[0]._id), { value: 'updated' }, {}, quiet)).toMatchObject({
        success: true,
      });
      expect(await service.upsert({ value: 'missing' }, { value: 'upserted' }, {}, quiet)).toMatchObject({
        success: true,
      });
      expect(await service.new({}, quiet)).toMatchObject({ success: true });
      expect(await service.listSub(String(f.rows[0]._id), 'children')).toMatchObject({ success: true });
      expect(
        await service.readSub(String(f.rows[0]._id), 'children', String(new mongoose.Types.ObjectId())),
      ).toMatchObject({ success: false });
      expect(await service.delete(String(f.rows[1]._id))).toMatchObject({ success: true });
    });
    expect(captures().length).toBeGreaterThan(8);
    expect(captures().every(({ captured }) => captured === undefined)).toBe(true);
  });

  it.each(['find', 'findOne', 'findById', '_list', '_read', '_readFilter'] as const)(
    '%s reentry on the same receiver inside a document hook has its own post-rollback capture',
    async (entry) => {
      const origin = entry === 'find' || entry === '_list' ? 'list' : 'read';
      const key = origin === 'list' ? fastFlags[0] : fastFlags[1];
      const f = await fixture({ [key]: true }),
        captures = captureObserver();
      await f.execute(async (req) => {
        // One receiver exposes all six inherited/public query entries.
        const service = req.macl.getPublicService(f.Root.modelName);
        const args = { select: ['value', '-_id'] };
        const invoke = () =>
          entry === 'findById' || entry === '_read'
            ? service[entry](String(f.rows[0]._id), args, quiet)
            : service[entry]({}, args, quiet);
        let independent: unknown,
          reentered = false;
        const hook = vi.fn(async function (
          this: ModelRequest,
          doc: Record<string, unknown>,
          permissions: { has(key: string): boolean },
        ) {
          expect(this).toBe(req);
          expect(permissions.has('reader')).toBe(true);
          if (!reentered) {
            reentered = true;
            f.router.setOption(key, false);
            await Promise.resolve();
            independent = await invoke();
          }
          return { owner: doc.owner === true };
        });
        f.router.setOption('docPermissions', { read: hook, list: hook } as never);
        expect(await invoke()).toMatchObject({ success: true });
        expect(independent).toMatchObject({ success: true });
        expect(hook).toHaveBeenCalledTimes(2);
        const roots = captures().filter(({ input }) => !input.parent);
        expect(roots).toHaveLength(2);
        expect(roots[0].captured).toEqual({ origin, mode: 'active', prerequisites: 15 });
        expect(roots[1].captured).toEqual({ origin, mode: 'off', prerequisites: 15 });
        expect(authorization.getAuthorizationProvenance(roots[0].call)).toBe(roots[0].call);
        expect(authorization.getAuthorizationProvenance(roots[1].call)).toBe(roots[1].call);
        expect(roots[0].call).not.toBe(roots[1].call);
        for (const flag of unsafeSnapshotOptions) expect(f.api.getModelOption(f.Root.modelName, flag)).toBe(true);
      });
    },
  );

  it('an independent READ inside a write hook captures query settings, never write provenance', async () => {
    const f = await fixture(Object.fromEntries(fastFlags.map((key) => [key, true]))),
      captures = captureObserver();
    f.router.setOption('baseFilter', {});
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Root.modelName);
      let independent: unknown;
      f.router.setOption('prepare.create', async function (this: ModelRequest, data: unknown) {
        expect(this).toBe(req);
        independent = await service.findOne({}, { select: ['value', '-_id'] }, quiet);
        return data;
      });
      expect(await service.create({ value: 'written' }, { select: ['value'] }, quiet)).toMatchObject({ success: true });
      expect(independent).toMatchObject({ success: true });
      const roots = captures().filter(({ input }) => !input.parent);
      const write = roots.find(({ input }) => input.access.operation === 'create');
      const read = roots.find(({ input }) => input.access.operation === 'read');
      expect(write).toBeDefined();
      expect(write?.captured).toBeUndefined();
      expect(read?.captured).toEqual({ origin: 'read', mode: 'active', prerequisites: 15 });
      expect(authorization.getAuthorizationProvenance(read!.call)).toBe(read!.call);
      expect(authorization.getAuthorizationProvenance(read!.call)).not.toBe(write!.call);
      for (const record of captures())
        if (authorization.getAuthorizationProvenance(record.call) === write!.call)
          expect(record.captured).toBeUndefined();
    });
  });

  it.each(fastFlags)(
    'rejects wire/root %s controls before sibling dispatch, but not stored business fields',
    async (key) => {
      const f = await fixture();
      for (const nested of [
        { options: { [key]: false } },
        { args: { [key]: true } },
        { args: { include: [{ model: f.Target.modelName, options: { [key]: true } }] } },
        { args: { populate: [{ path: 'ref', options: { [key]: true } }] } },
        { filter: { value: { $$sq: { model: f.Target.modelName, options: { [key]: false } } } } },
      ]) {
        await request(f.app)
          .post('/fast-options/__query')
          .send({ filter: {}, ...nested })
          .expect(400);
        await request(f.app)
          .post('/fast-options/__query/__filter')
          .send({ filter: {}, ...nested })
          .expect(400);
        await request(f.app)
          .post('/root')
          .send([
            { target: 'model', name: f.Root.modelName, op: 'list' },
            { target: 'model', name: f.Root.modelName, op: 'list', ...nested },
          ])
          .expect(400);
      }
      await request(f.app)
        .get(`/fast-options/${f.rows[0]._id}`)
        .query({ [key]: 'true' })
        .expect(400);
      await f.execute(async (req) => {
        const root = f.rootRouter as unknown as {
          processOp(req: ModelRequest, entry: unknown, index: number): Promise<{ result: unknown }>;
        };
        const getter = vi.fn(() => true);
        for (const controls of [
          { [key]: undefined },
          Object.create({ [key]: undefined }),
          Object.defineProperty({}, key, { value: undefined }),
          Object.defineProperty({}, key, { get: getter }),
        ]) {
          const entry = { target: 'model', name: f.Root.modelName, op: 'list' };
          for (const input of [
            { ...entry, args: controls },
            { ...entry, options: controls },
            Object.assign(Object.create({ options: controls }), entry),
            Object.defineProperty({ ...entry }, 'args', { value: controls }),
          ])
            expect((await root.processOp(req, input, 0)).result).toMatchObject({
              success: false,
              code: 'bad_request',
            });
        }
        expect(getter).not.toHaveBeenCalled();
      });
      expect(f.rootHook).not.toHaveBeenCalled();
      expect(f.targetHook).not.toHaveBeenCalled();
      const captures = captureObserver();
      const response = await request(f.app)
        .post('/fast-options/__query')
        .send({ filter: { [key]: true }, select: [key, '-_id'], options: quiet })
        .expect(200);
      expect(response.body.data).toEqual([{ [key]: true }]);
      expect(captures().every(({ captured }) => captured?.mode === 'off')).toBe(true);
    },
  );
});
