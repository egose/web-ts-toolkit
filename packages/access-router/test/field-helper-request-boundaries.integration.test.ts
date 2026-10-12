import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../dist/advanced';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let sequence = 0;
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^Svaf03Request/);
});

async function fixture() {
  const api = createAccessRuntime();
  runtimes.push(api);
  const name = `Svaf03RequestParent${++sequence}`;
  const targetName = `Svaf03RequestTarget${sequence}`;
  const Target = mongoose.model(
    targetName,
    new mongoose.Schema({ name: String, secret: String, ownerId: String, owned: String, public: Boolean }),
  );
  const Parent = mongoose.model(
    name,
    new mongoose.Schema({
      name: String,
      secret: String,
      ownerId: String,
      owned: String,
      dynamic: String,
      friend: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
      contacts: [{ name: String, friend: { type: mongoose.Schema.Types.ObjectId, ref: targetName } }],
    }),
  );
  api.setGlobalOptions({ globalPermissions: () => ({ reader: true, admin: false }) });
  const hook = vi.fn((doc: { ownerId?: string }) => ({ owner: doc.ownerId === 'actor' }));
  const fieldRule = vi.fn(
    (permissions, grants: Record<string, unknown> = {}) => permissions.has('reader') && !grants.owner,
  );
  const targetHook = vi.fn(() => ({ owner: true }));
  const targetTransform = vi.fn((filter: unknown) => filter);
  const targetRouter = api.createRouter(Target, {
    basePath: '/targets',
    operationAccess: { read: true },
    modelPermissionPrefix: 'doc:',
    permissionSchema: { name: true, secret: false, ownerId: false, owned: 'doc:owner', public: false },
    alwaysSelectFields: { read: ['ownerId'] },
    docPermissions: { read: targetHook },
    overrideFilter: { read: targetTransform },
    baseFilter: { read: () => ({ public: true }) },
  });
  const router = api.createRouter(Parent, {
    basePath: '/parents',
    operationAccess: true,
    modelPermissionPrefix: 'doc:',
    permissionSchema: {
      name: true,
      secret: false,
      ownerId: false,
      owned: 'doc:owner',
      dynamic: fieldRule,
      friend: false,
      contacts: { sub: { name: true, friend: true } },
    },
    alwaysSelectFields: { read: ['ownerId', 'friend'] },
    docPermissions: { read: hook },
  });
  const visible = await Target.create({
    name: 'visible',
    secret: 'hidden', // pragma: allowlist secret
    ownerId: 'actor',
    owned: 'owner-only',
    public: true,
  });
  const hidden = await Target.create({ name: 'hidden-row', secret: 'hidden', ownerId: 'actor', public: false }); // pragma: allowlist secret
  const parent = await Parent.create({
    name: 'parent',
    secret: 'hidden', // pragma: allowlist secret
    owned: 'owner-only',
    ownerId: 'actor',
    dynamic: 'request-query',
    friend: visible._id,
    contacts: [
      { name: 'a', friend: visible._id },
      { name: 'b', friend: hidden._id },
    ],
  });
  let callback: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  router.router.post('/_probe', async (req: ModelRequest, res: express.Response) => {
    try {
      await callback(req);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const app = express();
  app.use(router.routes);
  const execute = async (run: typeof callback) => {
    callback = run;
    failure = undefined;
    await request(app).post('/parents/_probe').expect(200, { ok: true });
    if (failure) throw failure;
  };
  return {
    api,
    name,
    Target,
    Parent,
    parent,
    visible,
    hidden,
    router,
    targetRouter,
    hook,
    fieldRule,
    targetHook,
    targetTransform,
    execute,
  };
}

describe('SVA-F03 private query-field and populate request boundaries', () => {
  it('distinct uses request-schema rules with empty grants, not null-document output fields', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      expect(await service.genAllowedFields(null, 'read')).toEqual([]);
      const outputHelper = vi.spyOn(req.macl, 'genAllowedFields');
      expect(await service.distinct('name')).toMatchObject({ success: true, data: ['parent'] });
      expect(await service.distinct('dynamic')).toMatchObject({ success: true, data: ['request-query'] });
      expect(await service.distinct('owned')).toMatchObject({ success: false, code: 'forbidden' });
      expect(f.hook).not.toHaveBeenCalled();
      expect(outputHelper).not.toHaveBeenCalled();
      for (const [permissions, grants] of f.fieldRule.mock.calls) {
        expect(permissions).toBe(req.macl.getPermissions());
        expect(grants).toEqual({});
      }
      for (const context of f.fieldRule.mock.contexts) expect(context).toBe(req);
    });
  });

  it('output elevation does not broaden later distinct/sort admission or the actor', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      const authorization = { outputFields: { mode: 'grant', paths: ['secret'] } } as const;
      const read = await service.findOne(
        { _id: f.parent._id },
        { select: ['name', 'secret'] },
        {
          authorization,
          skim: true,
          includePermissions: false,
          includeFieldPermissions: false,
        },
      );
      expect(read).toMatchObject({ success: true, data: { name: 'parent', secret: 'hidden' } }); // pragma: allowlist secret
      f.hook.mockClear();
      expect(await service.distinct('secret')).toMatchObject({ success: false, code: 'forbidden' });
      expect(await service.find({}, { sort: 'secret' }, { authorization })).toMatchObject({
        success: false,
        code: 'bad_request',
      });
      expect(f.hook).not.toHaveBeenCalled();
      expect(req.macl.getPermissions().has('admin')).toBe(false);
    });
  });

  it('distinct preserves call-time request configuration on a reused service', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      expect(await service.distinct('secret')).toMatchObject({ success: false, code: 'forbidden' });
      f.router.set('permissionSchema.secret', true);
      expect(await service.distinct('secret')).toMatchObject({ success: true, data: ['hidden'] });
      f.router.set('permissionSchema.secret', false);
      expect(await service.distinct('secret')).toMatchObject({ success: false, code: 'forbidden' });
      expect(f.hook).not.toHaveBeenCalled();
      expect(req.macl.getPermissions().has('admin')).toBe(false);
    });
  });

  it('private source fetch never grants request-only population', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      expect(await service.genSelect('read', ['name'])).toContain('friend');
      expect(await service.genPopulate('read', [{ path: 'friend', select: ['name'] }])).toEqual([]);
      expect(await req.macl.genPopulate(f.name, 'read', 'friend')).toEqual([]);
      expect(f.targetTransform).not.toHaveBeenCalled();
      expect(f.targetHook).not.toHaveBeenCalled();
    });
  });

  it('named scoped populate preserves target request fields, private fetch inputs and row scope in retained getParentDoc', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = f.router.getService(req);
      const outputPlanner = vi.spyOn(req.macl, 'genSelect');
      const descriptors = await service.genPopulate(
        'read',
        [{ path: 'contacts.friend', select: ['name', 'secret', 'owned'] }],
        { scopePath: ['contacts'] },
      );
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]).toMatchObject({ path: 'contacts.friend', match: { public: true } });
      expect(descriptors[0].select).toEqual(expect.arrayContaining(['name', 'ownerId', '_id']));
      expect(descriptors[0].select).not.toContain('secret');
      expect(descriptors[0].select).not.toContain('owned');
      const raw = await service.getParentDoc(String(f.parent._id), 'contacts', {
        populate: [{ path: 'friend', select: ['name', 'secret', 'owned'] }],
      });
      expect(raw.contacts[0].friend.name).toBe('visible');
      expect(raw.contacts[0].friend.secret).toBeUndefined();
      expect(raw.contacts[0].friend.owned).toBeUndefined();
      expect(raw.contacts[1].friend).toBeNull();
      expect(f.targetTransform).toHaveBeenCalledTimes(2);
      expect(outputPlanner).not.toHaveBeenCalled();
      expect(f.targetHook).not.toHaveBeenCalled();
      expect(
        (await f.Parent.collection.findOne({ _id: f.parent._id }))?.contacts.map((row) => String(row.friend)),
      ).toEqual([String(f.visible._id), String(f.hidden._id)]);
    });
  });

  it('request target operation denial and terminal row denial still omit the descriptor', async () => {
    const f = await fixture();
    f.targetRouter.operationAccess('read', false);
    await f.execute(async (req) => {
      expect(
        await f.router.getService(req).genPopulate('read', 'contacts.friend', { scopePath: ['contacts'] }),
      ).toEqual([]);
      expect(f.targetTransform).not.toHaveBeenCalled();
    });
    f.targetRouter.operationAccess('read', true);
    f.targetRouter.setOption('baseFilter.read', () => false);
    await f.execute(async (req) => {
      expect(
        await f.router.getService(req).genPopulate('read', 'contacts.friend', { scopePath: ['contacts'] }),
      ).toEqual([]);
    });
    expect(f.targetHook).not.toHaveBeenCalled();
  });

  it('scope-only populate rejects model authority and malformed scopes before field/target hooks', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      for (const options of [
        { authorization: { outputFields: { mode: 'unrestricted' } } },
        { documentAuthorization: {} },
        { scopePath: ['contacts', 'sub'] },
        { scopePath: ['contacts.friend'] },
        { scopePath: ['__proto__'] },
      ]) {
        await expect(
          f.router.getService(req).genPopulate('read', 'contacts.friend', options as never),
        ).rejects.toMatchObject({ result: { code: 'bad_request' } });
      }
      expect(f.fieldRule).not.toHaveBeenCalled();
      expect(f.targetTransform).not.toHaveBeenCalled();
      expect(f.targetHook).not.toHaveBeenCalled();
    });
  });
});
