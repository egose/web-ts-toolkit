import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../src/index';
import type { ModelRequest, ModelRouterOptions } from '../src/interfaces';
import * as authorization from '../src/acl/service-authorization';
import { authorizationModeKeys, serverAuthorizationControls } from '../src/acl/authorization-modes';
import { deferred } from './hook-admission-fixture';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
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
        ...Object.fromEntries(serverAuthorizationControls.map((key) => [key, Boolean])),
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
    docPermissions: {
      read: { dependsOn: ['owner'], get: targetHook },
      list: { dependsOn: ['owner'], get: targetHook },
    },
    modelPermissionPrefix: 'doc:',
    stripPermissionsField: true,
    ...Object.fromEntries(
      authorizationModeKeys.map((key) => [key, options[key] === 'trusted' ? 'isolated' : 'trusted']),
    ),
  });
  const router = api.createRouter(Root, {
    basePath: '/fast-options',
    operationAccess: { list: true, read: true, create: true, update: true, upsert: true, delete: true },
    permissionSchema: {
      value: true,
      hidden: false,
      ref: true,
      children: { read: true, list: true, sub: { label: 'doc:owner', hidden: false } },
      ...Object.fromEntries(serverAuthorizationControls.map((key) => [key, true])),
    },
    virtuals: { children: { sub: {} } },
    baseFilter: { read: () => ({ tenant: 'read' }), list: () => ({ tenant: 'list' }) },
    docPermissions: {
      read: { dependsOn: ['owner'], get: rootHook },
      list: { dependsOn: ['owner'], get: rootHook },
    },
    modelPermissionPrefix: 'doc:',
    stripPermissionsField: true,
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
      ...Object.fromEntries(serverAuthorizationControls.map((key) => [key, true])),
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
  const derived = vi.spyOn(authorization, 'deriveQueryAuthorization');
  const write = vi.spyOn(authorization, 'resolveWriteServiceAuthorization');
  return () => {
    const seen = new Set();
    return [spy, derived, write]
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
              captured: authorization.readServiceAuthorizationMode(result.value, input.binding),
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
    'selects independent mode pair=%s through reads/lists/retry and target-local/embedded scopes',
    async (pair) => {
      const options = Object.fromEntries(
        authorizationModeKeys.map((key, index) => [key, pair & (1 << index) ? 'trusted' : 'isolated']),
      ) as ModelRouterOptions;
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
          const key = origin === 'list' ? 'listAuthorizationMode' : 'readAuthorizationMode';
          const selected = captures().slice(before);
          expect(selected.length).toBeGreaterThan(3);
          for (const { captured, input } of selected) {
            const effective = input.access.outputAccess === 'list' ? 'listAuthorizationMode' : 'readAuthorizationMode';
            expect(captured).toBe(
              input.binding.modelName === f.Target.modelName
                ? f.api.getModelOption(f.Target.modelName, effective)
                : options[key],
            );
          }
          expect(selected.some(({ input }) => input.binding.modelName === f.Target.modelName)).toBe(true);
          expect(selected.some(({ input }) => input.binding.scopePath?.includes('children'))).toBe(true);
          expect(f.api.getModelOption(f.Target.modelName, key)).toBe(
            options[key] === 'trusted' ? 'isolated' : 'trusted',
          );
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
        for (const { captured, input } of captures().slice(before)) {
          const key = input.access.operation === 'list' ? 'listAuthorizationMode' : 'readAuthorizationMode';
          const effective = input.access.outputAccess === 'list' ? 'listAuthorizationMode' : 'readAuthorizationMode';
          expect(captured).toBe(
            input.binding.modelName === f.Target.modelName
              ? f.api.getModelOption(f.Target.modelName, effective)
              : options[key],
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
    'captures %s before a real awaited hook and retains source/target modes, not independent hook calls or DTO authority',
    async (origin) => {
      for (const initial of ['isolated', 'trusted'] as const) {
        const key = origin === 'list' ? 'listAuthorizationMode' : 'readAuthorizationMode';
        const f = await fixture({ [key]: initial });
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
          expect(root.captured).toBe(initial);
          try {
            f.router.setOptions({ [key]: initial === 'trusted' ? 'isolated' : 'trusted' });
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
          for (const { captured, input } of originating) {
            const effective = input.access.outputAccess === 'list' ? 'listAuthorizationMode' : 'readAuthorizationMode';
            expect(captured).toBe(
              input.binding.modelName === f.Target.modelName
                ? f.api.getModelOption(f.Target.modelName, effective)
                : initial,
            );
          }
          const independentRoots = captures()
            .slice(before + 1)
            .filter(({ input }) => !input.parent);
          expect(independentRoots).toHaveLength(1);
          expect(independentRoots[0].captured).toBe(initial === 'trusted' ? 'isolated' : 'trusted');
          const output = origin === 'list' ? (result.data as unknown[])[0] : result.data;
          const context = 'contexts' in result ? result.contexts[0] : result.context;
          expect(context).not.toHaveProperty('documentAuthorization');
          expect(context).not.toHaveProperty('getDocumentAuthorization');
          const hookCount = f.rootHook.mock.calls.length;
          await service.pickAllowedFields(output, 'list');
          expect(f.rootHook).toHaveBeenCalledTimes(hookCount);
          const helperStart = captures().length;
          await service.pickAllowedFields({ value: 'raw' }, 'read');
          expect(
            captures()
              .slice(helperStart)
              .every(({ captured }) => captured === 'isolated'),
          ).toBe(true);
        });
      }
    },
  );

  it.each(['isolated', 'trusted'] as const)(
    '%s write output borrowing is observable through basic/advanced HTTP and root without changing stored writes',
    async (mode) => {
      const f = await fixture({ createAuthorizationMode: mode, updateAuthorizationMode: mode });
      f.router.setOption('baseFilter', {});
      f.rootHook.mockImplementation((doc: Record<string, unknown>) => {
        if (!(doc instanceof mongoose.Document)) doc.value = 'output-hook';
        return { owner: true };
      });
      f.router.setOption('docPermissions', { create: f.rootHook, update: f.rootHook });
      for (const entry of [
        'basic-create',
        'advanced-create',
        'basic-update',
        'advanced-update',
        'root-create',
        'root-update',
      ] as const) {
        const value = `stored:${entry}`;
        const args = { select: ['value', '-_id'] };
        const creating = entry.endsWith('create');
        const response = entry.startsWith('root')
          ? await request(f.app)
              .post('/root')
              .send([
                {
                  target: 'model',
                  name: f.Root.modelName,
                  op: creating ? 'create' : 'update',
                  ...(creating ? {} : { id: String(f.rows[0]._id) }),
                  data: { value },
                  args,
                  options: quiet,
                },
              ])
              .expect(200)
          : entry.startsWith('advanced')
            ? creating
              ? await request(f.app)
                  .post('/fast-options/__mutation')
                  .send({ data: { value }, ...args, options: quiet })
                  .expect(201)
              : await request(f.app)
                  .patch(`/fast-options/__mutation/${f.rows[0]._id}`)
                  .send({ data: { value }, ...args, options: quiet })
                  .expect(200)
            : creating
              ? await request(f.app).post('/fast-options').send({ value }).expect(201)
              : await request(f.app).patch(`/fast-options/${f.rows[0]._id}`).send({ value }).expect(200);
        const data = entry.startsWith('root') ? response.body[0].result.data : response.body;
        const row = Array.isArray(data) ? data[0] : data;
        expect(row.value).toBe(mode === 'trusted' ? 'output-hook' : value);
        expect(await f.Root.findOne(creating ? { value } : { _id: f.rows[0]._id }).lean()).toMatchObject({ value });
      }
    },
  );

  it('READ/LIST settings alone do not activate root writes, new output or dedicated subdocuments', async () => {
    const f = await fixture({ readAuthorizationMode: 'trusted', listAuthorizationMode: 'trusted' }),
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
    expect(captures().every(({ captured }) => captured === 'isolated')).toBe(true);
  });

  it.each([
    'create',
    'updateOne',
    'updateById',
    'upsert-create',
    'upsert-update',
    'public-upsert-create',
    'public-upsert-update',
  ] as const)(
    '%s captures both write settings before an awaited hook; fresh calls recapture without trusting input',
    async (entry) => {
      const f = await fixture({
        readAuthorizationMode: 'trusted',
        listAuthorizationMode: 'trusted',
        createAuthorizationMode: 'trusted',
        updateAuthorizationMode: 'isolated',
      });
      f.router.setOption('baseFilter', {});
      const captures = captureObserver();
      const entered = deferred();
      const release = deferred();
      let first = true;
      const prepare = async (data: Record<string, unknown>) => {
        if (first) {
          first = false;
          entered.resolve();
          await release.promise;
        }
        return data;
      };
      f.router.setOption('prepare', { create: prepare, update: prepare });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Root.modelName);
        const pub = req.macl.getPublicService(f.Root.modelName);
        const id = String(f.rows[0]._id);
        const args = { select: ['value', '-_id'] };
        const invoke = (value: string) =>
          entry === 'create'
            ? service.create({ value }, args, quiet)
            : entry === 'updateOne'
              ? service.updateOne({ _id: id }, { value }, args, quiet)
              : entry === 'updateById'
                ? service.updateById(id, { value }, args, quiet)
                : entry.startsWith('public')
                  ? pub._upsert({ ...(entry.endsWith('update') ? { _id: id } : {}), value }, args, quiet)
                  : service.upsert(
                      entry.endsWith('update') ? { _id: id } : { value: 'missing' },
                      { value },
                      args,
                      quiet,
                    );
        const pending = invoke('first');
        await entered.promise;
        const root = captures().find(({ input }) => !input.parent)!;
        expect(root).toBeDefined();
        expect(root.captured).toBe('isolated');
        const captured = authorization.readServiceAuthorization(root.call, root.input.binding).configuration;
        expect(captured).toMatchObject({ createAuthorizationMode: 'trusted', updateAuthorizationMode: 'isolated' });
        try {
          f.router.setOptions({ createAuthorizationMode: 'isolated', updateAuthorizationMode: 'trusted' });
        } finally {
          release.resolve();
        }
        expect(await pending).toMatchObject({ success: true });
        expect(captured).toMatchObject({ createAuthorizationMode: 'trusted', updateAuthorizationMode: 'isolated' });
        expect(await invoke('second')).toMatchObject({ success: true });
        const roots = captures().filter(({ input }) => !input.parent);
        expect(roots).toHaveLength(2);
        expect(roots[1].captured).toBe('isolated');
        expect(
          authorization.readServiceAuthorization(roots[1].call, roots[1].input.binding).configuration,
        ).toMatchObject({
          createAuthorizationMode: 'isolated',
          updateAuthorizationMode: 'trusted',
        });
      });
    },
  );

  it.each(['find', 'findOne', 'findById', '_list', '_read', '_readFilter'] as const)(
    '%s reentry on the same receiver inside a document hook has its own post-rollback capture',
    async (entry) => {
      const origin = entry === 'find' || entry === '_list' ? 'list' : 'read';
      const key = origin === 'list' ? 'listAuthorizationMode' : 'readAuthorizationMode';
      const f = await fixture({ [key]: 'trusted' }),
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
            f.router.setOption(key, 'isolated');
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
        expect(roots[0].captured).toBe('trusted');
        expect(roots[1].captured).toBe('isolated');
        expect(authorization.getAuthorizationProvenance(roots[0].call)).toBe(roots[0].call);
        expect(authorization.getAuthorizationProvenance(roots[1].call)).toBe(roots[1].call);
        expect(roots[0].call).not.toBe(roots[1].call);
        expect(f.api.getModelOption(f.Root.modelName, key)).toBe('isolated');
      });
    },
  );

  it('an independent READ inside a write hook captures query settings, never write provenance', async () => {
    const f = await fixture({ readAuthorizationMode: 'trusted', listAuthorizationMode: 'trusted' }),
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
      expect(write?.captured).toBe('isolated');
      expect(read?.captured).toBe('trusted');
      expect(authorization.getAuthorizationProvenance(read!.call)).toBe(read!.call);
      expect(authorization.getAuthorizationProvenance(read!.call)).not.toBe(write!.call);
      for (const record of captures())
        if (authorization.getAuthorizationProvenance(record.call) === write!.call)
          expect(record.captured).toBe('isolated');
    });
  });

  it.each(['isolated', 'trusted'] as const)(
    '%s READ never retries BadRequest facts or Forbidden row admission as LIST',
    async (mode) => {
      const f = await fixture({
        readAuthorizationMode: mode,
        listAuthorizationMode: mode === 'trusted' ? 'isolated' : 'trusted',
      });
      await f.execute(async (req) => {
        const pub = req.macl.getPublicService(f.Root.modelName);
        const invalid = vi.fn(() => ({ owner: new Date() }));
        const list = vi.fn(() => ({ owner: true }));
        f.router.setOption('docPermissions', { read: invalid, list } as never);
        expect(await pub._read(String(f.rows[0]._id), { select: ['value', '-_id'] }, quiet)).toMatchObject({
          success: false,
          code: 'bad_request',
        });
        expect(invalid).toHaveBeenCalledTimes(1);
        expect(list).not.toHaveBeenCalled();
        const forbidden = vi.fn(() => false);
        const listRows = vi.fn(() => ({}));
        f.router.setOption('baseFilter', { read: forbidden, list: listRows });
        expect(await pub._read(String(f.rows[0]._id), { select: ['value', '-_id'] }, quiet)).toMatchObject({
          success: false,
          code: 'forbidden',
        });
        expect(forbidden).toHaveBeenCalledTimes(1);
        expect(listRows).not.toHaveBeenCalled();
        expect(invalid).toHaveBeenCalledTimes(1);
        expect(list).not.toHaveBeenCalled();
      });
    },
  );

  it.each(serverAuthorizationControls)(
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
      expect(captures().every(({ captured }) => captured === 'isolated')).toBe(true);
    },
  );
});
