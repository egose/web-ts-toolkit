import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, vi } from 'vitest';
import { createAccessRuntime } from '../../../dist/index.mjs';
import type { DataRequest, DataRouterOptions, ModelRequest, ModelRouterOptions } from '../../../dist/advanced.mjs';

export const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
export const modeKeys = [
  'readAuthorizationMode',
  'listAuthorizationMode',
  'createAuthorizationMode',
  'updateAuthorizationMode',
] as const;
export const allIsolated = Object.fromEntries(modeKeys.map((key) => [key, 'isolated']));
export const allTrusted = Object.fromEntries(modeKeys.map((key) => [key, 'trusted']));
let sequence = 0;
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
});

/** Only an acknowledgement crosses HTTP; assertions retain native service values and original failures. */
function probe<R>(router: express.Router, app: express.Express, basePath: string) {
  let run: (req: R) => Promise<unknown>,
    value: unknown,
    failure: unknown,
    failed = false;
  router.post('/arts04-probe', async (req, res) => {
    try {
      value = await run(req as R);
    } catch (error) {
      failed = true;
      failure = error;
    }
    res.json({ ok: true });
  });
  return async <T>(callback: (req: R) => Promise<T>): Promise<T> => {
    run = callback;
    failed = false;
    await request(app).post(`${basePath}/arts04-probe`).send({}).expect(200, { ok: true });
    if (failed) throw failure;
    return value as T;
  };
}

export async function modelFixture(options: ModelRouterOptions = {}, targetOptions: ModelRouterOptions = {}) {
  const api = createAccessRuntime(),
    n = ++sequence;
  runtimes.push(api);
  api.setGlobalOptions({ globalPermissions: () => ({ reader: true }), logger: { warn() {} } });
  const Target = mongoose.model(
    `Arts04Target${n}`,
    new mongoose.Schema(
      {
        name: String,
        secret: String,
        owner: Boolean,
        group: String,
        when: Date,
        payload: mongoose.Schema.Types.Mixed,
      },
      { versionKey: false },
    ),
  );
  const Source = mongoose.model(
    `Arts04Source${n}`,
    new mongoose.Schema(
      {
        value: { type: String, default: 'template' },
        name: String,
        hidden: String,
        conditional: String,
        owner: Boolean,
        tenant: String,
        group: String,
        when: Date,
        payload: mongoose.Schema.Types.Mixed,
        ref: { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName },
        children: [new mongoose.Schema({ label: String, hidden: String })],
        profile: { public: String, secret: String },
        meta: { permissions: mongoose.Schema.Types.Mixed },
        readAuthorizationMode: String,
      },
      { versionKey: false },
    ),
  );
  const targetRouter = api.createRouter(Target, {
    operationAccess: { read: true, list: true, count: true },
    permissionSchema: { name: true, secret: 'doc:owner', when: true, payload: true },
    modelPermissionPrefix: 'doc:',
    stripPermissionsField: true,
    ...targetOptions,
  });
  const basePath = `/arts04-${n}`,
    rootPath = `/arts04-root-${n}`;
  const router = api.createRouter(Source, {
    basePath,
    operationAccess: true,
    permissionSchema: {
      value: true,
      hidden: false,
      conditional: 'doc:owner',
      owner: true,
      tenant: true,
      group: true,
      when: true,
      payload: true,
      ref: true,
      readAuthorizationMode: true,
      children: { default: true, sub: { label: true, hidden: false } },
      profile: { default: true, sub: { public: true, secret: false } },
    },
    hydration: { find: 'lean', findOne: 'lean', findById: 'lean', publicRead: 'lean' },
    stripPermissionsField: true,
    modelPermissionPrefix: 'doc:',
    ...options,
  });
  const targets = await Target.insertMany([
    {
      name: 'target-a',
      secret: 'granted',
      owner: true,
      group: 'g',
      when: new Date(3),
      payload: { bytes: Buffer.from('target') },
    },
    {
      name: 'target-b',
      secret: 'target-denied',
      owner: false,
      group: 'g',
      when: new Date(3),
      payload: { bytes: Buffer.from('target') },
    },
  ]);
  const rows = await Source.insertMany(
    [true, false].map((owner, index) => ({
      value: `stored-${index}`,
      hidden: 'source-denied',
      conditional: `conditional-${index}`,
      owner,
      tenant: index ? 'list' : 'read',
      group: 'g',
      ref: targets[0]._id,
      children: [{ label: 'child', hidden: 'child-denied' }],
      profile: { public: 'public', secret: 'profile-denied' },
    })),
  );
  const root = api.createRouter({ basePath: rootPath, operationAccess: true });
  const app = express().use(express.json()).use(router.routes).use(root.routes);
  return {
    api,
    Source,
    Target,
    router,
    targetRouter,
    root,
    app,
    rows,
    targets,
    basePath,
    rootPath,
    execute: probe<ModelRequest>(router.router, app, basePath),
  };
}

export function dataFixture<T extends { id: string }>(data: T[], options: DataRouterOptions<T> = {}) {
  const api = createAccessRuntime(),
    name = `Arts04Data${++sequence}`;
  runtimes.push(api);
  api.setGlobalOptions({ globalPermissions: () => ({ reader: true, constructor: true, has: true }) });
  const basePath = `/arts04-data-${sequence}`,
    rootPath = `/arts04-data-root-${sequence}`;
  const router = api.createDataRouter(name, {
    basePath,
    idField: 'id',
    idParam: 'id',
    data,
    operationAccess: { read: true, list: true },
    permissionSchema: { id: true, payload: true, name: true } as never,
    ...options,
  });
  const root = api.createRouter({ basePath: rootPath, operationAccess: true });
  const app = express().use(express.json()).use(router.routes).use(root.routes);
  return {
    api,
    name,
    router,
    root,
    app,
    basePath,
    rootPath,
    execute: probe<DataRequest>(router.router, app, basePath),
  };
}

export function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
