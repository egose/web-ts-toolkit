/**
 * OAV-00: retained base-operation policy before route variants are added.
 * Resolution checks run inside the owning runtime's request middleware with
 * unconnected models; no database is needed. Variant inheritance/splitting
 * regressions belong to OAV-02–OAV-04, not assertions requiring absent aliases.
 */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAccessRuntime,
  type AccessRouterRequest,
  type GuardHook,
  type ModelRouterOptions,
  type Validation,
} from '../dist/index.mjs';

type OperationRules = ModelRouterOptions['operationAccess'];
const activeFixtures: Array<{
  connection: mongoose.Connection;
  runtime: ReturnType<typeof createAccessRuntime>;
}> = [];
let modelCounter = 0;

afterEach(async () => {
  for (const { connection, runtime } of activeFixtures.splice(0)) {
    runtime.runtime.clearOpenApiRoutes();
    await connection.destroy();
  }
});

const createPermissionApp = (
  options: ModelRouterOptions = {},
  accesses: readonly string[] = ['list', 'read'],
  defaultAccess?: OperationRules,
) => {
  const runtime = createAccessRuntime();
  const connection = mongoose.createConnection();
  activeFixtures.push({ connection, runtime });
  const modelName = `Oav00Permission${++modelCounter}`;
  const Model = connection.model(
    modelName,
    new mongoose.Schema({
      name: { type: String, default: 'template' },
      items: [new mongoose.Schema({ name: String })],
    }),
  );

  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions(req) {
      return String(req.headers['x-perms'] ?? '')
        .split(',')
        .filter(Boolean);
    },
  });
  if (defaultAccess !== undefined) runtime.setDefaultModelOptions({ operationAccess: defaultAccess });
  runtime.registerModelInstance(modelName, Model);
  runtime.setModelOptions(modelName, options);

  const app = express();
  app.use(express.json());
  app.use(runtime());
  app.get('/check', async (req, res) => {
    const core = (req as AccessRouterRequest).macl;
    if (!core) throw new Error('Owning runtime middleware did not initialize Core');
    const allowed: Record<string, boolean> = {};
    for (const access of accesses) allowed[access] = await core.isAllowed(modelName, access);
    res.json(allowed);
  });

  return { app, runtime, modelName, Model };
};

describe('OAV-00 retained operation-access resolution', () => {
  it.each([
    { label: 'base list does not grant read', rules: { list: true }, perms: '', list: true, read: false },
    { label: 'missing rules deny', rules: undefined, perms: '', list: false, read: false },
    { label: 'boolean shorthand allows', rules: true, perms: '', list: true, read: true },
    { label: 'boolean shorthand denies', rules: false, perms: '', list: false, read: false },
    {
      label: 'string shorthand requires both permissions',
      rules: 'canList canRead',
      perms: 'canList,canRead',
      list: true,
      read: true,
    },
    {
      label: 'string shorthand rejects a partial grant',
      rules: 'canList canRead',
      perms: 'canList',
      list: false,
      read: false,
    },
    {
      label: 'array shorthand ORs its entries',
      rules: ['canList', 'canRead'],
      perms: 'canRead',
      list: true,
      read: true,
    },
  ] satisfies Array<{ label: string; rules: OperationRules; perms: string; list: boolean; read: boolean }>)(
    '$label',
    async ({ rules, perms, list, read }) => {
      const { app } = createPermissionApp({ operationAccess: rules });
      const response = await request(app).get('/check').set('x-perms', perms).expect(200);
      expect(response.body).toEqual({ list, read });
    },
  );

  it.each([
    { label: 'explicit false', rule: false, allowed: false },
    { label: 'undefined', rule: undefined, allowed: true },
    { label: 'empty OR array', rule: [], allowed: false },
    { label: 'async false guard', rule: async () => false, allowed: false },
  ] satisfies Array<{ label: string; rule: Validation | undefined; allowed: boolean }>)(
    '$label is resolved before the parent default',
    async ({ rule, allowed }) => {
      const { app, runtime, modelName } = createPermissionApp({ operationAccess: {} });
      runtime.setModelOption(modelName, 'operationAccess.default', true);
      runtime.setModelOption(modelName, 'operationAccess.list', rule);
      const response = await request(app).get('/check').expect(200);
      expect(response.body).toEqual({ list: allowed, read: true });
    },
  );

  it.each([
    { label: 'read-only field object', fieldRule: { read: true }, read: true },
    { label: 'empty field object', fieldRule: {}, read: false },
    { label: 'field object with a nested default', fieldRule: { default: true, read: true }, read: true },
  ])('$label stays closed to an omitted list operation', async ({ fieldRule, read }) => {
    const { app } = createPermissionApp({ operationAccess: { list: true, read: true, subs: { items: fieldRule } } }, [
      'subs.items.list',
      'subs.items.read',
      'subs.other.list',
    ]);
    const response = await request(app).get('/check').expect(200);
    expect(response.body).toEqual({
      'subs.items.list': false,
      'subs.items.read': read,
      'subs.other.list': true,
    });
  });

  it.each([
    { label: 'field true overrides top-level false', top: false, field: true, perms: '', allowed: true },
    { label: 'field false overrides top-level true', top: true, field: false, perms: '', allowed: false },
    {
      label: 'field permission allows despite top-level false',
      top: false,
      field: 'canSub',
      perms: 'canSub',
      allowed: true,
    },
    {
      label: 'missing field permission denies despite top-level true',
      top: true,
      field: 'canSub',
      perms: '',
      allowed: false,
    },
  ])('$label', async ({ top, field, perms, allowed }) => {
    const { app } = createPermissionApp({ operationAccess: { list: top, read: top, subs: { items: field } } }, [
      'subs.items.list',
      'subs.items.read',
    ]);
    const response = await request(app).get('/check').set('x-perms', perms).expect(200);
    expect(response.body).toEqual({ 'subs.items.list': allowed, 'subs.items.read': allowed });
  });

  it('evaluates only the field scalar hook with request this and the owning permissions', async () => {
    const topGuard = vi.fn(() => true);
    const fieldGuard = vi.fn<GuardHook>(async function (permissions) {
      expect(this.method).toBe('GET');
      expect(this.macl?.getPermissions()).toBe(permissions);
      return permissions.has('canSub');
    });
    const { app } = createPermissionApp({ operationAccess: { list: topGuard, subs: { items: fieldGuard } } }, [
      'subs.items.list',
    ]);
    const allowed = await request(app).get('/check').set('x-perms', 'canSub').expect(200);
    const denied = await request(app).get('/check').expect(200);
    expect(allowed.body).toEqual({ 'subs.items.list': true });
    expect(denied.body).toEqual({ 'subs.items.list': false });
    expect(fieldGuard).toHaveBeenCalledTimes(2);
    expect(topGuard).not.toHaveBeenCalled();
  });

  it.each([
    { umbrella: false, list: true, read: false },
    { umbrella: true, list: false, read: true },
  ])('absent field rules fall back to base operations, ignoring subs: $umbrella', async ({ umbrella, list, read }) => {
    const { app } = createPermissionApp({ operationAccess: { list, read, subs: umbrella } }, [
      'subs.items.list',
      'subs.items.read',
    ]);
    const response = await request(app).get('/check').expect(200);
    expect(response.body).toEqual({ 'subs.items.list': list, 'subs.items.read': read });
  });

  it('does not evaluate the legacy subs umbrella hook for an absent field', async () => {
    const umbrella = vi.fn<GuardHook>(async () => false);
    const { app } = createPermissionApp({ operationAccess: { list: true, subs: umbrella } }, ['subs.items.list']);
    const response = await request(app).get('/check').expect(200);
    expect(response.body).toEqual({ 'subs.items.list': true });
    expect(umbrella).not.toHaveBeenCalled();
  });

  it('shallow model rule replacement does not recursively inherit runtime-default siblings', async () => {
    const { app, runtime, modelName } = createPermissionApp({ operationAccess: { read: true } }, ['list', 'read'], {
      list: true,
      read: false,
    });
    // Exact getter fallback and ordinary base resolution are intentionally different.
    expect(runtime.runtime.getExactModelOption(modelName, 'operationAccess.list')).toBe(true);
    expect(runtime.getModelOption(modelName, 'operationAccess.list')).toEqual({ read: true });
    const response = await request(app).get('/check').expect(200);
    expect(response.body).toEqual({ list: false, read: true });
  });

  it('model shorthand wins over the runtime-default exact base rule', async () => {
    const { app, runtime, modelName } = createPermissionApp({ operationAccess: true }, ['list', 'read'], {
      list: false,
      read: false,
    });
    expect(runtime.runtime.getExactModelOption(modelName, 'operationAccess.list')).toBe(false);
    const response = await request(app).get('/check').expect(200);
    expect(response.body).toEqual({ list: true, read: true });
  });

  it('model .default wins over the runtime-default exact base rule', async () => {
    const { app, runtime, modelName } = createPermissionApp({ operationAccess: {} }, ['list'], { list: true });
    runtime.setModelOption(modelName, 'operationAccess.default', false);
    expect(runtime.runtime.getExactModelOption(modelName, 'operationAccess.list')).toBe(true);
    const response = await request(app).get('/check').expect(200);
    expect(response.body).toEqual({ list: false });
  });

  it('copies defaults on assignment, then uses live exact defaults when the model parent is undefined', async () => {
    const { app, runtime, modelName } = createPermissionApp({}, ['list', 'read'], { list: true, read: false });
    const snapshot = runtime.getModelOptions(modelName);
    runtime.setDefaultModelOption('operationAccess.list', false);
    runtime.setDefaultModelOption('operationAccess.read', true);
    const copied = await request(app).get('/check').expect(200);
    expect(copied.body).toEqual({ list: true, read: false });

    runtime.setModelOption(modelName, 'operationAccess', undefined);
    const fallback = await request(app).get('/check').expect(200);
    expect(fallback.body).toEqual({ list: false, read: true });
    expect(snapshot.operationAccess).toEqual({ list: true, read: false });
  });

  it('does not leak model defaults into data-router authorization', async () => {
    const { app, runtime, modelName } = createPermissionApp({}, ['list'], true);
    const dataRouter = runtime.createDataRouter(`${modelName}Data`, {
      basePath: '/oav00-data',
      idField: 'id',
      data: [{ id: 'one', name: 'One' }],
      permissionSchema: { id: true, name: true },
    });
    app.use(dataRouter.routes);
    const model = await request(app).get('/check').expect(200);
    expect(model.body).toEqual({ list: true });
    await request(app).get('/oav00-data').expect(401);
    dataRouter.operationAccess('list', true);
    const data = await request(app).get('/oav00-data').expect(200);
    expect(data.body.data).toEqual([{ id: 'one', name: 'One' }]);
  });

  it('keeps denied routes/OpenAPI registered and observes live guard updates without rebuilding', async () => {
    const options: ModelRouterOptions = {
      basePath: '/oav00-model',
      operationAccess: { new: false, read: false },
      permissionSchema: { name: true },
    };
    const { app, runtime, Model } = createPermissionApp(options);
    const router = runtime.createRouter(Model, options);
    app.use(router.routes);
    const endpoints = router.router.getEndpoints();
    expect(endpoints).toContainEqual({ method: 'GET', path: '/oav00-model/:id' });
    expect(endpoints).toContainEqual({ method: 'POST', path: '/oav00-model/__query/:id' });
    const spec = runtime.runtime.getOpenApiSpec({ title: 'OAV-00 baseline', version: '1.0.0' });
    expect(spec.paths['/oav00-model/{id}'].get).toBeDefined();
    expect(spec.paths['/oav00-model/__query/{id}'].post).toBeDefined();

    const denied = await request(app).get('/oav00-model/new').expect(401);
    expect(denied.body).toMatchObject({ status: 401, title: 'Unauthorized' });
    await request(app).head('/oav00-model/new').expect(401);
    router.operationAccess('new', true);
    const allowed = await request(app).get('/oav00-model/new').expect(200);
    expect(allowed.body).toMatchObject({ name: 'template' });
    expect(router.options.operationAccess).toEqual({ new: false, read: false });
    expect(router.router.getEndpoints()).toEqual(endpoints);
  });
});
