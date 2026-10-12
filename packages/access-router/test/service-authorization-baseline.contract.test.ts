/**
 * SVA-00 historical characterization at 0629a53, before explicit authorization.
 * Live assertions now follow the SVA-05/09 replacement contracts. Original
 * service overrides, skim and transport observations remain in D00 and each
 * task's evidence in docs/tasks/20261007-143507-access-router-explicit-service-authorization.md.
 */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let sequence = 0;
const runtimes: Array<ReturnType<typeof createAccessRuntime>> = [];
const quiet = { skim: true, lean: true, includePermissions: false, includeFieldPermissions: false };

afterEach(() => {
  vi.restoreAllMocks();
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^Sva00/);
});

const fixture = async (options: Record<string, unknown> = {}) => {
  const api = createAccessRuntime();
  runtimes.push(api);
  const tag = ++sequence;
  const modelName = `Sva00Order${tag}`;
  const targetName = `Sva00Customer${tag}`;
  const targetSchema = new mongoose.Schema({ name: String, internalNote: String, orderKey: String });
  const targetProjections: unknown[] = [];
  targetSchema.pre('find', function () {
    targetProjections.push(this.projection());
  });
  targetSchema.pre('findOne', function () {
    targetProjections.push(this.projection());
  });
  targetSchema.plugin(permissionsPlugin, { modelName: targetName });
  const Customer = mongoose.model(targetName, targetSchema);
  const schema = new mongoose.Schema({
    status: { type: String, default: 'draft' },
    internalNote: String,
    ownerId: String,
    tenant: String,
    slug: String,
    schemaHidden: { type: String, select: false, default: 'stored-hidden' },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
  });
  const projections: unknown[] = [];
  schema.pre('find', function () {
    projections.push(this.projection());
  });
  schema.pre('findOne', function () {
    projections.push(this.projection());
  });
  schema.plugin(permissionsPlugin, { modelName });
  const Order = mongoose.model(modelName, schema);
  api.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });
  const targetTransform = vi.fn((filter: unknown) => filter);
  const targetRouter = api.createRouter(Customer, {
    basePath: `/sva00-customers-${tag}`,
    operationAccess: { read: true, list: true, count: true },
    permissionSchema: { name: true, internalNote: false, orderKey: true },
    overrideFilter: { read: targetTransform, list: targetTransform },
  } as never);
  const router = api.createRouter(Order, {
    basePath: `/sva00-orders-${tag}`,
    operationAccess: { read: true, list: true, create: true, update: true, new: true },
    permissionSchema: { status: true, internalNote: false, customer: true, slug: true, tenant: true },
    ...options,
  } as never);
  const customer = await Customer.create({ name: 'customer', internalNote: 'target-private', orderKey: 'order' });
  const order = await Order.create({
    status: 'ready',
    internalNote: 'backend-note',
    ownerId: 'alice',
    tenant: 'a',
    slug: 'order',
    customer: customer._id,
  });

  // Execute backend calls inside the runtime-bound request, retain the actual
  // internal result in the test, and send only an acknowledgement over HTTP.
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  let run: (req: ModelRequest) => Promise<void>;
  router.router.post('/baseline-probe', async (req, res) => {
    await run(req as unknown as ModelRequest);
    res.json({ ok: true });
  });
  const execute = async (callback: (req: ModelRequest) => Promise<void>) => {
    run = callback;
    await request(app).post(`/sva00-orders-${tag}/baseline-probe`).send({}).expect(200, { ok: true });
  };
  return {
    execute,
    api,
    router,
    targetRouter,
    modelName,
    targetName,
    Order,
    order,
    customer,
    projections,
    targetProjections,
    targetTransform,
  };
};

describe('SVA-00 baseline scenarios under the completed replacement contract', () => {
  it.each(['false', 'missing'] as const)(
    'SVA-05 selected explicit grant fetches and returns a %s-rule field',
    async (rule) => {
      const f = await fixture({
        permissionSchema: { status: true, ...(rule === 'false' ? { internalNote: false } : {}) },
      });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        for (const select of [['status', 'internalNote'], ['status']]) {
          const result = await service.findOne(
            { _id: f.order._id },
            { select },
            { ...quiet, authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } },
          );
          expect(result.success).toBe(true);
          if (!result.success) throw new Error(result.code);
          expect(result.data).toMatchObject({ status: 'ready' });
          if (select.includes('internalNote')) {
            expect(f.projections.at(-1)).toMatchObject({ internalNote: 1 });
            expect(result.data).toHaveProperty('internalNote', 'backend-note');
          } else {
            expect(f.projections.at(-1)).not.toHaveProperty('internalNote');
            expect(result.data).not.toHaveProperty('internalNote');
          }
        }
      });
    },
  );

  it('direct service reads do not add an initiating operation gate', async () => {
    const f = await fixture({ operationAccess: { read: false } });
    await f.execute(async (req) => {
      expect(await req.macl.isAllowed(f.modelName, 'read')).toBe(false);
      expect(await req.macl.getService(f.modelName).findOne({}, {}, quiet)).toMatchObject({
        success: true,
        data: { status: 'ready' },
      });
    });
  });

  it('SVA-09 row scope replaces only the base filter; custom predicates use findOne and IDs resolve normally', async () => {
    const transform = vi.fn(() => ({ slug: 'order' }));
    const base = vi.fn(() => ({ tenant: 'b' }));
    const id = vi.fn(() => ({ slug: 'missing' }));
    const f = await fixture({ overrideFilter: { read: transform }, baseFilter: { read: base }, resolveIdFilter: id });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const ordinary = await service.findOne({ slug: 'rewritten' }, {}, quiet);
      expect(ordinary).toMatchObject({ success: false, code: 'not_found' });
      expect(transform).toHaveBeenCalledTimes(1);
      expect(base).toHaveBeenCalledTimes(1);
      transform.mockClear();
      base.mockClear();
      const replaced = await service.findOne(
        { slug: 'missing' },
        {},
        {
          ...quiet,
          authorization: { rows: { mode: 'scope', filter: { tenant: 'a' } } },
        },
      );
      expect(replaced).toMatchObject({ success: true, data: { status: 'ready' } });
      expect(transform).toHaveBeenCalledTimes(1);
      expect(base).not.toHaveBeenCalled();
      const byId = await service.findById('identifier', {}, quiet);
      expect(byId).toMatchObject({ success: false, code: 'not_found' });
      expect(id).toHaveBeenCalledExactlyOnceWith('identifier');
      expect(transform).toHaveBeenCalledTimes(2);
      // The request's base-filter result was cached, rather than bypassed.
      expect(byId.query).toEqual(ordinary.query);
    });
  });

  it('SVA-09 configured user-dependent transform denial is terminal in every row mode', async () => {
    const transform = vi.fn((_filter: unknown, permissions: { has(key: string): boolean }) =>
      permissions.has('staff') ? {} : false,
    );
    const base = vi.fn(() => ({}));
    const f = await fixture({ overrideFilter: { read: transform }, baseFilter: { read: base } });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      for (const rows of [{ mode: 'request' }, { mode: 'scope', filter: {} }, { mode: 'unrestricted' }] as const) {
        expect(await service.findOne({}, {}, { ...quiet, authorization: { rows } })).toMatchObject({
          success: false,
          code: 'forbidden',
        });
      }
      expect(f.projections).toHaveLength(0);
      expect(transform).toHaveBeenCalledTimes(3);
      expect(base).not.toHaveBeenCalled();
    });
  });

  it('read parsing precedes transform denial, while an explicit false scope prevents subqueries', async () => {
    const transform = vi.fn(() => false);
    const f = await fixture({ overrideFilter: { read: transform } });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const filter = {
        status: {
          $$sq: {
            model: f.targetName,
            op: 'list',
            args: { select: ['name'] },
            options: quiet,
            sqOptions: { path: 'name' },
          },
        },
      };
      expect(await service.findOne(filter, {}, quiet)).toMatchObject({ success: false, code: 'forbidden' });
      expect(f.targetProjections).toHaveLength(1);
      expect(f.projections).toHaveLength(0);
      expect(transform).toHaveBeenCalledTimes(1);
      expect(
        await service.findOne(filter, {}, { ...quiet, authorization: { rows: { mode: 'scope', filter: false } } }),
      ).toMatchObject({
        success: false,
        code: 'forbidden',
      });
      expect(f.targetProjections).toHaveLength(1);
      expect(transform).toHaveBeenCalledTimes(1);
    });
  });

  it('a declared select:false path can already be positively fetched when its request field rule allows it', async () => {
    const f = await fixture({ permissionSchema: { status: true, schemaHidden: true } });
    expect(await f.Order.findById(f.order._id).lean()).not.toHaveProperty('schemaHidden');
    await f.execute(async (req) => {
      const result = await req.macl.getService(f.modelName).findOne({}, { select: ['schemaHidden'] }, quiet);
      expect(result).toMatchObject({ success: true, data: { schemaHidden: 'stored-hidden' } });
      expect(f.projections.at(-1)).toMatchObject({ schemaHidden: 1 });
    });
  });

  it('SVA-09 ordinary populate needs independent target operation and output grants', async () => {
    const f = await fixture();
    f.targetRouter.set('operationAccess.read', false);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const descriptor = [{ path: 'customer', select: ['name', 'internalNote'] }];
      const normal = await service.findOne({}, { select: ['customer'], populate: descriptor }, quiet);
      expect(normal).toMatchObject({ success: true });
      expect(f.targetProjections).toHaveLength(0);
      const operationOnly = await service.findOne(
        {},
        { select: ['customer'], populate: descriptor },
        {
          ...quiet,
          authorization: { related: { customer: { model: f.targetName, operation: { mode: 'grant' } } } },
        },
      );
      expect(operationOnly).toMatchObject({ success: true, data: { customer: { name: 'customer' } } });
      if (!operationOnly.success) throw new Error(operationOnly.code);
      expect(operationOnly.data).not.toHaveProperty('customer.internalNote');
      expect(f.targetProjections.at(-1)).not.toHaveProperty('internalNote');
      const granted = await service.findOne(
        {},
        { select: ['customer'], populate: descriptor },
        {
          ...quiet,
          authorization: {
            related: {
              customer: {
                model: f.targetName,
                operation: { mode: 'grant' },
                outputFields: { mode: 'grant', paths: ['internalNote'] },
              },
            },
          },
        },
      );
      expect(granted).toMatchObject({
        success: true,
        data: { customer: { name: 'customer', internalNote: 'target-private' } },
      });
      expect(f.targetProjections.at(-1)).toMatchObject({ internalNote: 1 });
    });
  });

  it('SVA-09 create rejects overrides.populate before persistence and honors ordinary populate', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const descriptor = [{ path: 'customer', select: ['name'] }];
      const persist = vi.spyOn(f.Order, 'create');
      const rejected = await service.create(
        { status: 'created', customer: f.customer._id },
        { overrides: { populate: descriptor } } as never,
        quiet,
      );
      expect(rejected).toMatchObject({ success: false, code: 'bad_request' });
      expect(f.targetProjections).toHaveLength(0);
      expect(persist).not.toHaveBeenCalled();
      const normal = await service.create(
        { status: 'created', customer: f.customer._id },
        { populate: descriptor },
        quiet,
      );
      expect(normal).toMatchObject({ success: true, data: [{ customer: { name: 'customer' } }] });
      expect(f.targetProjections).toHaveLength(1);
    });
  });

  it('legacy skipChecks admits key-based fetches, not false rules; baseFields unconditionally authorize a later pick', async () => {
    const f = await fixture({ permissionSchema: { status: 'owner', internalNote: false } });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      expect(await service.genSelect('read', ['status', 'internalNote'], true)).toEqual(['status']);
      expect(await service.genQuerySelect('read', ['status', 'internalNote'], false)).toEqual([]);
      const raw = { status: 'ready', internalNote: 'backend-note', absentFromSchema: 'extra' };
      expect(await service.pickAllowedFields(raw, 'read')).toEqual({});
      const forced = await service.pickAllowedFields(raw, 'read', ['internalNote', 'absentFromSchema']);
      expect(forced).toEqual({ internalNote: 'backend-note', absentFromSchema: 'extra' });
      expect(await service.trimOutputFields(forced, 'read')).toEqual({});
    });
  });

  it.each([false, true])('SVA-05 retains owner grants through metadata trim (skim=%s)', async (skim) => {
    const hook = vi.fn((doc: { ownerId?: string }) => ({ owner: doc.ownerId === 'alice' }));
    const f = await fixture({
      permissionSchema: { status: 'owner', internalNote: false },
      docPermissions: { read: hook },
      alwaysSelectFields: { read: ['ownerId'] },
      stripPermissionsField: true,
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const result = await service.findOne({}, { select: ['status'] }, { ...quiet, skim });
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(f.projections.at(-1)).toMatchObject({ ownerId: 1, status: 1 });
      expect(result.data).not.toHaveProperty('ownerId');
      expect(result.data).not.toHaveProperty('_permissions');
      expect(result.data).toHaveProperty('status', 'ready');
      expect(hook).toHaveBeenCalledTimes(1);
      const picked = await service.pickAllowedFields(result.data, 'read', {
        documentAuthorization: result.context.documentAuthorization,
      });
      expect(picked).toHaveProperty('status', 'ready');
      expect(hook).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps query defaults/ordinary mutation select and rejects public override controls; new select remains ignored', async () => {
    const f = await fixture({
      defaults: {
        findOneArgs: { select: ['status'] },
      },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      expect(await service.findOne({}, {}, quiet)).toMatchObject({ success: true, data: { status: 'ready' } });
      // SVA-05 uses ordinary mutation select; SVA-01A rejects authority defaults.
      const created = await service.create(
        { status: 'created', slug: 'normally-readable' },
        { select: ['status'] },
        quiet,
      );
      expect(created).toMatchObject({ success: true, data: [{ status: 'created' }] });
      if (!created.success) throw new Error(created.code);
      expect(created.data[0]).not.toHaveProperty('slug');
      expect(await service.new({ select: ['internalNote'] }, quiet)).toMatchObject({
        success: true,
        data: { status: 'draft' },
      });
      const publicService = req.macl.getPublicService(f.modelName);
      // SVA-01A intentionally replaces the historical silent-ignore behavior.
      expect(await publicService._readFilter({}, { overrides: { filter: false } } as never, quiet)).toMatchObject({
        success: false,
        code: 'bad_request',
      });
    });
  });

  it('upsert reuses the update predicate once, ordinary select and private initiating operation in both branches', async () => {
    const transform = vi.fn((filter: unknown) => filter);
    const observations: string[] = [];
    const f = await fixture({
      overrideFilter: { update: transform },
      permissionSchema: { status: true, slug: true, receipt: { read: true } },
      virtuals: {
        receipt: {
          dependsOn: [],
          create: (_doc: unknown, _permissions: unknown, ctx: { operation: string }) => {
            observations.push(`create:${ctx.operation}`);
            return 'created';
          },
          update: (_doc: unknown, _permissions: unknown, ctx: { operation: string }) => {
            observations.push(`update:${ctx.operation}`);
            return 'updated';
          },
        },
      },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const args = { select: ['receipt'] };
      const updated = await service.upsert({ slug: 'order' }, { status: 'updated' }, args, quiet);
      expect(updated).toMatchObject({ success: true, kind: 'single', data: { receipt: 'updated' } });
      expect(transform).toHaveBeenCalledTimes(1);
      const created = await service.upsert({ slug: 'missing' }, { slug: 'new-order' }, args, quiet);
      expect(created).toMatchObject({ success: true, kind: 'list', data: [{ receipt: 'created' }] });
      expect(transform).toHaveBeenCalledTimes(2);
      expect(observations).toEqual(['update:upsert', 'create:upsert']);
      if (!updated.success || !created.success) throw new Error('upsert failed');
      expect(updated.data).not.toHaveProperty('status');
      expect(created.data[0]).not.toHaveProperty('slug');
    });
  });

  it.each(['legacy', 'correlated'] as const)(
    '%s include reuses its target predicate without a second transform',
    async (mode) => {
      const f = await fixture();
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        const include =
          mode === 'legacy'
            ? {
                model: f.targetName,
                op: 'list' as const,
                path: 'customers',
                localField: 'slug',
                foreignField: 'orderKey',
                args: { select: ['name'] },
              }
            : {
                mode: 'correlated' as const,
                model: f.targetName,
                op: 'list' as const,
                path: 'customers',
                filter: { orderKey: { $parent: 'slug' } },
                args: { select: ['name'] },
              };
        const result = await service.findOne({}, { select: ['status'], include }, quiet);
        expect(result).toMatchObject({ success: true, data: { customers: [{ name: 'customer' }] } });
        expect(f.targetTransform).toHaveBeenCalledTimes(1);
        if (!result.success) throw new Error(result.code);
        expect(result.data).not.toHaveProperty('customers.0.orderKey');
        expect(result.data).not.toHaveProperty('customers.0.internalNote');
      });
    },
  );
});
