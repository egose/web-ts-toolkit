import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime, guard } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let serial = 0;
const apis: ReturnType<typeof createAccessRuntime>[] = [];
const quiet = { includePermissions: false, includeFieldPermissions: false, tryList: false };
afterEach(() => {
  vi.restoreAllMocks();
  apis.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^OwnedGuardConsumer/);
});

async function fixture(hydration: 'lean' | 'hydrated', targetMode: 'isolated' | 'trusted') {
  const api = createAccessRuntime();
  apis.push(api);
  api.setGlobalOptions({ globalPermissions: () => ({ reader: true }) });
  const n = ++serial;
  const Target = mongoose.model(
    `OwnedGuardConsumerTarget${n}`,
    new mongoose.Schema(
      {
        name: String,
        tenant: String,
        balance: { type: Number, select: false },
      },
      { versionKey: false },
    ),
  );
  const Source = mongoose.model(
    `OwnedGuardConsumerSource${n}`,
    new mongoose.Schema(
      {
        name: String,
        ownerFlag: Boolean,
        account: { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName },
      },
      { versionKey: false },
    ),
  );
  const targetOperation = vi.fn(function (permissions) {
    expect(permissions.has('reader')).toBe(true);
    return true;
  });
  const targetRow = vi.fn(() => ({ tenant: 'a' }));
  const targetHook = vi.fn(() => ({ owner: true }));
  const targetField = vi.fn(() => true);
  api.createRouter(Target, {
    operationAccess: { read: targetOperation, list: true },
    baseFilter: { read: targetRow },
    readAuthorizationMode: targetMode,
    listAuthorizationMode: targetMode,
    permissionSchema: { name: targetField, balance: false },
    docPermissions: { read: targetHook },
    stripPermissionsField: true,
  });
  const hookInputs: unknown[] = [];
  const hook = vi.fn(function (doc, permissions, context) {
    expect(permissions.has('reader')).toBe(true);
    expect(context.docPermissions).toEqual({});
    expect(Object.isFrozen(context)).toBe(true);
    hookInputs.push(JSON.parse(JSON.stringify({ doc, context })));
    expect(doc).not.toHaveProperty('account.balance');
    return { owner: doc.ownerFlag === true };
  });
  const getter = vi.fn((_doc, _permissions, _context, privateInputs) => privateInputs.account?.balance ?? null);
  const decorate = vi.fn((doc) => doc);
  const router = api.createRouter(Source, {
    basePath: '/guard-consumer',
    operationAccess: { read: true, list: true },
    readAuthorizationMode: targetMode === 'isolated' ? 'trusted' : 'isolated',
    permissionSchema: { name: true, account: true, total: true, ownerFlag: false },
    docPermissions: { read: { dependsOn: ['ownerFlag'], get: hook } },
    stripPermissionsField: true,
    hydration: { publicRead: hydration },
    requireOperationAccessForPopulateDependencies: true,
    virtuals: { total: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance -_id' }] } },
    decorate: { read: decorate },
    defaults: {
      publicReadArgs: {
        select: ['name', 'account', 'total', '-_id'],
        populate: [{ path: 'account', select: 'name -_id' }],
      },
      publicReadOptions: quiet,
    },
  });
  const target = await Target.create({ name: 'account', tenant: 'a', balance: 7 });
  const row = await Source.create({ name: 'source', ownerFlag: true, account: target._id });
  const queries = vi.spyOn(Source.collection, 'findOne');
  const targets = vi.spyOn(Target.collection, 'find');
  const app = express().use(express.json());
  router.router.post(
    '/condition',
    guard({ modelName: Source.modelName, id: String(row._id), condition: 'reader owner' }),
    (_req, res) => res.json({ allowed: true }),
  );
  router.router.post('/dto', async (req, res) =>
    res.json(await (req as ModelRequest).macl.getPublicService(Source.modelName)._read(String(row._id))),
  );
  app.use(router.routes);
  return {
    api,
    Source,
    Target,
    row,
    app,
    queries,
    targets,
    hook,
    hookInputs,
    getter,
    decorate,
    targetOperation,
    targetRow,
    targetHook,
    targetField,
  };
}

describe.each(['lean', 'hydrated'] as const)('condition read actual query/hook prefix (%s)', (hydration) => {
  it.each(['isolated', 'trusted'] as const)(
    'preserves target-own %s ordinary/private fetches and the root hook mask without target DTOs',
    async (mode) => {
      const f = await fixture(hydration, mode);
      await request(f.app).post('/guard-consumer/condition').send({}).expect(200, { allowed: true });
      expect(f.queries).toHaveBeenCalledTimes(1);
      expect(f.targets).toHaveBeenCalledTimes(1);
      expect(f.targetOperation).toHaveBeenCalled();
      expect(f.targetRow).toHaveBeenCalled();
      expect(f.targetHook).not.toHaveBeenCalled();
      expect(f.targetField).not.toHaveBeenCalled();
      expect(f.getter).not.toHaveBeenCalled();
      expect(f.decorate).not.toHaveBeenCalled();
      const query = f.queries.mock.calls[0],
        target = f.targets.mock.calls[0];
      const result = await request(f.app).post('/guard-consumer/dto').send({}).expect(200);
      expect(result.body).toMatchObject({
        success: true,
        data: { name: 'source', account: { name: 'account' }, total: 7 },
      });
      expect(f.queries.mock.calls[1]).toEqual(query);
      expect(f.targets.mock.calls[1]).toEqual(target);
      expect(f.hookInputs[1]).toEqual(f.hookInputs[0]);
      expect(f.hook).toHaveBeenCalledTimes(2);
      expect(f.getter).toHaveBeenCalledTimes(1);
      expect(f.targetHook).toHaveBeenCalledTimes(1);
      expect(f.targetField).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['operation', 'base', 'override'] as const)(
    'retains %s target admission for required private hook-input queries',
    async (denial) => {
      const f = await fixture(hydration, 'isolated');
      if (denial === 'operation') f.targetOperation.mockReturnValue(false);
      else
        f.api.setModelOption(
          f.Target.modelName,
          `${denial === 'base' ? 'baseFilter' : 'overrideFilter'}.read`,
          () => false,
        );
      await request(f.app).post('/guard-consumer/condition').send({}).expect(200, { allowed: true });
      expect(f.targets).not.toHaveBeenCalled();
      expect(f.hookInputs[0]).not.toHaveProperty('doc.account.balance');
      expect(f.hook).toHaveBeenCalledTimes(1);
      expect(f.targetHook).not.toHaveBeenCalled();
      expect(f.getter).not.toHaveBeenCalled();
    },
  );

  it('does not imply generated HTTP READ-route operation admission', async () => {
    const f = await fixture(hydration, 'isolated');
    f.api.setModelOption(f.Source.modelName, 'operationAccess.read', false);
    await request(f.app).post('/guard-consumer/condition').send({}).expect(200, { allowed: true });
    const before = f.queries.mock.calls.length;
    await request(f.app).get(`/guard-consumer/${f.row._id}`).expect(401);
    expect(f.queries).toHaveBeenCalledTimes(before);
  });

  it('skips output-only default include queries but retains descriptor preflight and ordinary DTO behavior', async () => {
    const f = await fixture(hydration, 'isolated');
    f.api.setModelOption(f.Source.modelName, 'defaults.publicReadArgs', {
      select: ['name'],
      include: [
        {
          model: f.Target.modelName,
          op: 'list',
          path: 'related',
          localField: 'name',
          foreignField: 'name',
          args: { select: ['name', '-_id'] },
        },
      ],
    });
    await request(f.app).post('/guard-consumer/condition').send({}).expect(200, { allowed: true });
    expect(f.targets).not.toHaveBeenCalled();
    await request(f.app).post('/guard-consumer/dto').send({}).expect(200);
    expect(f.targets).toHaveBeenCalledTimes(1);
    // Incomplete legacy descriptors are deliberately ignored by normal reads.
    // Use a real preflight violation, not a stronger guard-only descriptor grammar.
    f.api.setModelOption(f.Source.modelName, 'defaults.publicReadArgs', {
      include: [
        { model: f.Target.modelName, op: 'list', path: '_permissions', localField: 'name', foreignField: 'name' },
      ],
    });
    const previousReads = f.queries.mock.calls.length;
    await request(f.app).post('/guard-consumer/condition').send({}).expect(400);
    const normal = await request(f.app).post('/guard-consumer/dto').send({}).expect(200);
    expect(normal.body).toMatchObject({ success: false, code: 'bad_request' });
    expect(f.queries).toHaveBeenCalledTimes(previousReads);
  });
});
