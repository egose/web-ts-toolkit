import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';
import { quiet } from './service-authorization-fixture';

useMongoTestDatabase();
let sequence = 0;
const runtimes: Array<{ clearOpenApiRoutes(): void }> = [];
afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^Sva07/);
});

async function fixture(virtuals: boolean, containerAllowed = true, extra: Record<string, unknown> = {}) {
  const api = createAccessRuntime();
  runtimes.push(api.runtime);
  const tag = ++sequence;
  const targetName = `Sva07Target${tag}`;
  const parentName = `Sva07Parent${tag}`;
  const targetHook = vi.fn((doc: { ownerId?: string }) => ({ owner: doc.ownerId === 'target-owner' }));
  const parentHook = vi.fn((doc: { ownerId?: string }) => ({ owner: doc.ownerId === 'parent-owner' }));
  const decision = vi.fn((_permissions, grants) => grants.owner === true);
  const getter = vi.fn((doc: { email?: string }) => `mail:${doc.email}`);
  const targetGetter = vi.fn((doc: { email?: string }) => `target:${doc.email}`);
  const contact = new mongoose.Schema(
    {
      email: String,
      name: String,
      ssn: String,
      nested: { leaf: String, sibling: String },
      friend: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
      friends: [{ type: mongoose.Schema.Types.ObjectId, ref: targetName }],
    },
    { strict: false },
  );
  const makeSchema = () =>
    new mongoose.Schema({ ownerId: String, visible: Boolean, contacts: [contact], profile: contact });
  const targetSchema = makeSchema();
  targetSchema.plugin(permissionsPlugin, { modelName: targetName });
  const Target = mongoose.model(targetName, targetSchema);
  const parentSchema = makeSchema();
  parentSchema.add({
    target: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
    other: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
  });
  parentSchema.plugin(permissionsPlugin, { modelName: parentName });
  const Parent = mongoose.model(parentName, parentSchema);
  const fields = {
    email: { read: false, list: false, create: false, update: false },
    ssn: false,
    name: { read: decision, list: decision, create: true, update: true },
    label: { read: true, list: true, create: false, update: false },
    friend: true,
    friends: true,
    nested: { read: true, list: true, update: false, sub: { leaf: true, sibling: { read: false, update: false } } },
    'nested.leaf': { update: true },
  };
  const schema = {
    contacts: { read: containerAllowed, list: containerAllowed, sub: fields },
    profile: { read: containerAllowed, sub: fields },
    target: true,
    other: true,
  };
  const base = {
    operationAccess: {
      read: true,
      list: true,
      update: true,
      create: true,
      delete: true,
      subs: { contacts: { read: true, list: true, create: true, update: true, delete: true } },
    },
    permissionSchema: schema,
    stripPermissionsField: true,
    alwaysSelectFields: { read: ['ownerId'], list: ['ownerId'] },
    baseFilter: { read: () => ({ visible: true }), list: () => ({ visible: true }) },
  };
  api.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
    requestComplexity: { maxHookConcurrency: 1, maxConcurrentWork: 1 },
  } as never);
  api.createRouter(Target, {
    ...base,
    basePath: `/sva07-target-${tag}`,
    docPermissions: { read: targetHook, list: targetHook },
    permissionSchema: { ...schema, contacts: { ...schema.contacts, read: true, list: true } },
    virtuals: virtuals ? { contacts: { sub: { label: { get: targetGetter, dependsOn: ['email'] } } } } : {},
  } as never);
  const router = api.createRouter(Parent, {
    ...base,
    basePath: `/sva07-${tag}`,
    docPermissions: { read: parentHook, list: parentHook },
    virtuals: virtuals ? { contacts: { sub: { label: { get: getter, dependsOn: ['email'] } } } } : {},
    ...extra,
  } as never);
  const target = await Target.create({
    ownerId: 'target-owner',
    visible: true,
    contacts: [{ email: 'target@x', name: 'target-name', ssn: 'target-private' }],
  });
  const deniedTarget = await Target.create({
    ownerId: 'someone-else',
    visible: true,
    contacts: [{ email: 'denied@x', name: 'denied-name', ssn: 'denied-private' }],
  });
  const hiddenTarget = await Target.create({
    ownerId: 'target-owner',
    visible: false,
    contacts: [{ email: 'hidden@x', name: 'hidden-name' }],
  });
  const parent = await Parent.create({
    ownerId: 'parent-owner',
    visible: true,
    target: target._id,
    other: deniedTarget._id,
    contacts: [
      {
        email: 'a@x',
        name: 'A',
        ssn: 'private-a',
        friend: target._id,
        friends: [target._id, hiddenTarget._id],
        nested: { leaf: 'old', sibling: 'keep' },
      },
      { email: null, name: 'B', ssn: 'private-b', friend: hiddenTarget._id },
    ],
    profile: null,
  });
  const hidden = await Parent.create({ ownerId: 'parent-owner', visible: false, contacts: [{ email: 'hidden@x' }] });
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  let callback: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await callback(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    Parent,
    Target,
    parentName,
    targetName,
    parent,
    hidden,
    target,
    deniedTarget,
    hiddenTarget,
    parentHook,
    targetHook,
    decision,
    getter,
    targetGetter,
    async execute(run: (req: ModelRequest) => Promise<void>) {
      callback = run;
      failure = undefined;
      await request(app).post(`/sva07-${tag}/probe`).send({}).expect(200);
      if (failure) throw failure;
    },
  };
}

const emailGrant = { outputFields: { mode: 'grant' as const, paths: ['contacts.email'] } };

describe.each([false, true])('SVA-07 embedded authorization (virtuals=%s)', (virtuals) => {
  it.each([false, true])(
    'retains leaf grants, minimal arrays and copied handles (container=%s)',
    async (containerAllowed) => {
      const f = await fixture(virtuals, containerAllowed);
      await f.execute(async (req) => {
        const service = req.macl.getService(f.parentName);
        const result = await service.findOne(
          { _id: f.parent._id },
          { select: ['contacts', 'profile'] },
          { ...quiet, authorization: emailGrant },
        );
        expect(result.success).toBe(true);
        if (!result.success) return;
        const contacts = result.data.contacts;
        expect(contacts).toHaveLength(2);
        expect(contacts[0].email).toBe('a@x');
        expect(contacts[1].email).toBeNull();
        expect(contacts[0]).not.toHaveProperty('ssn');
        if (containerAllowed) {
          expect(contacts[0].name).toBe('A');
        } else expect(contacts[0]).not.toHaveProperty('name');
        expect(result.data).not.toHaveProperty('ownerId');
        const before = f.decision.mock.calls.length;
        const picked = await service.pickAllowedFields(result.data, 'read', {
          documentAuthorization: result.context.documentAuthorization,
        });
        const childHandle = result.context.getDocumentAuthorization(contacts[0]);
        expect(childHandle).toBeDefined();
        const child = await service.trimOutputFields(picked.contacts[0], 'read', {
          documentAuthorization: childHandle!,
        });
        expect(child.email).toBe('a@x');
        expect(child).not.toHaveProperty('ssn');
        expect(f.decision).toHaveBeenCalledTimes(before);
        expect(f.parentHook).toHaveBeenCalledTimes(1);
        expect(f.getter).toHaveBeenCalledTimes(virtuals && containerAllowed ? 2 : 0);
        expect((await f.Parent.findById(f.parent._id).lean())!.contacts[0].ssn).toBe('private-a');
      });
    },
  );

  it('explicit leaf selection omits ordinary siblings; grants cannot admit a parent row', async () => {
    const f = await fixture(virtuals);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.parentName);
      const result = await service.findOne(
        { _id: f.parent._id },
        { select: ['contacts.email'] },
        { ...quiet, authorization: emailGrant },
      );
      expect(result.success).toBe(true);
      if (result.success)
        for (const row of result.data.contacts) expect(Object.keys(row).sort()).toEqual(['_id', 'email']);
      const hidden = await service.findOne(
        { _id: f.hidden._id },
        { select: ['contacts'] },
        { ...quiet, authorization: emailGrant },
      );
      expect(hidden).toMatchObject({ success: false, code: 'not_found' });
      expect(f.parentHook).toHaveBeenCalledTimes(1);
      expect(f.getter).not.toHaveBeenCalled();
    });
  });

  it('related embedded grants use each target owner and survive parent/helper copies', async () => {
    const f = await fixture(virtuals);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.parentName);
      const result = await service.findOne(
        { _id: f.parent._id },
        {
          select: ['target', 'other'],
          populate: [
            { path: 'target', select: ['contacts'] },
            { path: 'other', select: ['contacts'] },
          ],
        },
        { ...quiet, authorization: { related: { target: { model: f.targetName, ...emailGrant } } } },
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.target.contacts[0]).toMatchObject({ email: 'target@x', name: 'target-name' });
      expect(result.data.target.contacts[0]).not.toHaveProperty('ssn');
      expect(result.data.other.contacts[0]).not.toHaveProperty('email');
      expect(result.data.other.contacts[0]).not.toHaveProperty('name');
      const copy = await service.pickAllowedFields(result.data, 'read', {
        documentAuthorization: result.context.documentAuthorization,
      });
      const handle = result.context.getDocumentAuthorization(result.data.target.contacts[0]);
      expect(handle).toBeDefined();
      const child = await req.macl
        .getService(f.targetName)
        .pickAllowedFields(copy.target.contacts[0], 'read', { documentAuthorization: handle! });
      expect(child.email).toBe('target@x');
      expect(f.targetHook).toHaveBeenCalledTimes(2);
      expect(f.parentHook).toHaveBeenCalledTimes(1);
      expect(f.targetGetter).toHaveBeenCalledTimes(virtuals ? 2 : 0);
    });
  });

  it('parent subtree authority does not grant dotted referenced target fields or rows', async () => {
    const f = await fixture(virtuals);
    await f.execute(async (req) => {
      const result = await req.macl.getService(f.parentName).findOne(
        { _id: f.parent._id },
        {
          select: ['contacts'],
          populate: [{ path: 'contacts.friend', select: ['contacts'] }],
        },
        { ...quiet, authorization: { outputFields: { mode: 'grant', paths: ['contacts'] } } },
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.contacts[0].email).toBe('a@x');
      expect(result.data.contacts[0].friend.contacts[0]).not.toHaveProperty('email');
      expect(result.data.contacts[1].friend).toBeNull();
      expect(f.targetHook).toHaveBeenCalledTimes(1);
      expect(f.targetGetter).toHaveBeenCalledTimes(virtuals ? 1 : 0);
    });
  });

  it('a granted dotted target embedded leaf keeps minimal output and independent target row policy', async () => {
    const f = await fixture(virtuals);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.parentName);
      const args = { select: ['contacts.friend'], populate: [{ path: 'contacts.friend', select: ['contacts.email'] }] };
      const authorization = { related: { 'contacts.friend': { model: f.targetName, ...emailGrant } } };
      const result = await service.findOne({ _id: f.parent._id }, args, { ...quiet, authorization });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const target = result.data.contacts[0].friend;
      expect(Object.keys(target.contacts[0]).sort()).toEqual(['_id', 'email']);
      expect(target.contacts[0].email).toBe('target@x');
      expect(result.context.getDocumentAuthorization(target.contacts[0])).toBeDefined();
      expect(result.data.contacts[1].friend).toBeNull();
      expect(f.targetHook).toHaveBeenCalledTimes(1);
      expect(f.targetGetter).not.toHaveBeenCalled();
    });
  });

  it('legacy related list copies retain embedded owner decisions and getters once per target', async () => {
    const f = await fixture(virtuals);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.parentName);
      const result = await service.findOne(
        { _id: f.parent._id },
        {
          select: ['contacts.email'],
          include: {
            model: f.targetName,
            op: 'list',
            path: 'items',
            localField: 'target',
            foreignField: '_id',
            args: { select: ['contacts'] },
          },
        } as never,
        { ...quiet, authorization: { ...emailGrant, related: { items: { model: f.targetName, ...emailGrant } } } },
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.items).toHaveLength(1);
      const child = result.data.items[0].contacts[0];
      expect(child).toMatchObject({ email: 'target@x', name: 'target-name' });
      expect(child).not.toHaveProperty('ssn');
      const handle = result.context.getDocumentAuthorization(child);
      expect(handle).toBeDefined();
      expect(
        await req.macl.getService(f.targetName).pickAllowedFields(child, 'list', { documentAuthorization: handle! }),
      ).toMatchObject({ email: 'target@x', name: 'target-name' });
      expect(f.targetHook).toHaveBeenCalledTimes(1);
      expect(f.targetGetter).toHaveBeenCalledTimes(virtuals ? 1 : 0);
    });
  });

  it('parent and child row/operation denial remains terminal for dedicated methods', async () => {
    const f = await fixture(virtuals, true, {
      baseFilter: {
        read: () => ({ visible: true }),
        update: () => ({ visible: true }),
        subs: { contacts: { read: () => false, list: () => false, update: () => false, delete: () => false } },
      },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.parentName);
      const id = String(f.parent._id),
        subId = String(f.parent.contacts[0]._id);
      expect(await service.listSub(id, 'contacts')).toMatchObject({ success: false, code: 'forbidden' });
      expect(await service.readSub(id, 'contacts', subId)).toMatchObject({ success: false, code: 'forbidden' });
      expect(await service.updateSub(id, 'contacts', subId, { name: 'denied' })).toMatchObject({
        success: false,
        code: 'forbidden',
      });
      expect(await service.bulkUpdateSub(id, 'contacts', [{ _id: subId, name: 'denied' }])).toMatchObject({
        success: false,
        code: 'forbidden',
      });
      expect(await service.deleteSub(id, 'contacts', subId)).toMatchObject({ success: false, code: 'forbidden' });
      expect(await service.createSub(String(f.hidden._id), 'contacts', { name: 'denied' })).toMatchObject({
        success: false,
        code: 'not_found',
      });
      expect((await f.Parent.findById(id).lean())!.contacts[0].name).toBe('A');
      expect(f.parentHook).not.toHaveBeenCalled();
      expect(f.getter).not.toHaveBeenCalled();
    });
  });

  it('dedicated list/read resolve raw parent grants once even when the container output rule denies', async () => {
    const f = await fixture(virtuals, false);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.parentName);
      const list = await service.listSub(String(f.parent._id), 'contacts');
      expect(list.success).toBe(true);
      if (list.success) {
        expect(list.data).toHaveLength(2);
        expect(list.data[0]).toMatchObject({ name: 'A' });
        expect(list.data[0]).not.toHaveProperty('email');
        expect(list.data[0]).not.toHaveProperty('ssn');
      }
      expect(f.parentHook).toHaveBeenCalledTimes(1);
      expect(f.parentHook.mock.calls[0][0].ownerId).toBe('parent-owner');
      const read = await service.readSub(String(f.parent._id), 'contacts', String(f.parent.contacts[0]._id));
      expect(read.success).toBe(true);
      if (read.success) expect(read.data).toHaveProperty('name', 'A');
      expect(f.parentHook).toHaveBeenCalledTimes(2);
      expect(f.getter).toHaveBeenCalledTimes(virtuals ? 3 : 0);
    });
  });

  it('dedicated subpopulate retains target plans, array/null shapes and getter-once behavior', async () => {
    const f = await fixture(virtuals, false);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.parentName);
      const read = await service.readSub(String(f.parent._id), 'contacts', String(f.parent.contacts[0]._id), {
        populate: [
          { path: 'friend', select: ['contacts'] },
          { path: 'friends', select: ['contacts'] },
        ],
      });
      expect(read.success).toBe(true);
      if (!read.success) return;
      expect(read.data.friend.contacts[0]).toMatchObject({ name: 'target-name' });
      expect(read.data.friend.contacts[0]).not.toHaveProperty('email');
      expect(read.data.friends).toHaveLength(1);
      expect(f.targetHook).toHaveBeenCalledTimes(2); // Distinct descriptor plans, one visible target apiece.
      expect(f.parentHook).toHaveBeenCalledTimes(1);
      expect(f.targetGetter).toHaveBeenCalledTimes(virtuals ? 2 : 0);
      expect(f.getter).toHaveBeenCalledTimes(virtuals ? 1 : 0);
      const miss = await service.readSub(String(f.parent._id), 'contacts', String(f.parent.contacts[1]._id), {
        populate: ['friend'],
      });
      expect(miss.success).toBe(true);
      if (miss.success) expect(miss.data.friend).toBeNull();
      expect(f.targetHook).toHaveBeenCalledTimes(2);
    });
  });

  it('dedicated writes keep request admission, nested leaves and output-only virtual exclusion', async () => {
    const f = await fixture(virtuals);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.parentName);
      const id = String(f.parent._id),
        subId = String(f.parent.contacts[0]._id);
      // A preceding integrated grant must not change this method's write authority.
      await service.findOne({ _id: id }, { select: ['contacts'] }, { ...quiet, authorization: emailGrant });
      const updated = await service.updateSub(id, 'contacts', subId, {
        name: 'changed',
        email: 'attack@x',
        label: 'injected',
        nested: { leaf: 'new', sibling: 'replace' },
      });
      expect(updated.success).toBe(true);
      if (updated.success) {
        expect(updated.data.name).toBe('changed');
        expect(updated.data).not.toHaveProperty('email');
      }
      const raw = (await f.Parent.findById(id).lean())!;
      expect(raw.contacts[0]).toMatchObject({ email: 'a@x', nested: { leaf: 'new', sibling: 'keep' } });
      expect(raw.contacts[0]).not.toHaveProperty('label');
      const bulk = await service.bulkUpdateSub(id, 'contacts', [{ _id: subId, name: 'bulk', email: 'attack@x' }]);
      expect(bulk.success).toBe(true);
      const created = await service.createSub(id, 'contacts', { name: 'new', email: 'attack@x', label: 'injected' });
      expect(created.success).toBe(true);
      const stored = (await f.Parent.findById(id).lean())!;
      expect(stored.contacts[2].name).toBe('new');
      expect(stored.contacts[2]).not.toHaveProperty('email');
      expect(stored.contacts[2]).not.toHaveProperty('label');
      const deleted = await service.deleteSub(id, 'contacts', String(stored.contacts[2]._id));
      expect(deleted.success).toBe(true);
      expect((await f.Parent.findById(id).lean())!.contacts).toHaveLength(2);
    });
  });

  it('hidden post-write parent returns successful null/[] without hooks/getters', async () => {
    const f = await fixture(virtuals);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.parentName);
      const id = String(f.hidden._id),
        subId = String(f.hidden.contacts[0]._id);
      expect(await service.updateSub(id, 'contacts', subId, { name: 'saved' })).toMatchObject({
        success: true,
        data: null,
      });
      expect(await service.bulkUpdateSub(id, 'contacts', [{ _id: subId, name: 'bulk' }])).toMatchObject({
        success: true,
        data: [],
      });
      expect(await service.createSub(id, 'contacts', { name: 'added' })).toMatchObject({ success: true, data: [] });
      expect((await f.Parent.findById(id).lean())!.contacts[0].name).toBe('bulk');
      expect(f.parentHook).not.toHaveBeenCalled();
      expect(f.getter).not.toHaveBeenCalled();
    });
  });

  it('rejects control-slot policies in dedicated options and subpopulate descriptors', async () => {
    const f = await fixture(virtuals);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.parentName);
      const id = String(f.parent._id),
        subId = String(f.parent.contacts[0]._id);
      for (const authorization of [emailGrant, { inputFields: { mode: 'unrestricted' } }, { subdocuments: {} }]) {
        expect(await service.listSub(id, 'contacts', { authorization } as never)).toMatchObject({
          success: false,
          code: 'bad_request',
        });
        expect(
          await service.readSub(id, 'contacts', subId, { populate: [{ path: 'friend', authorization }] } as never),
        ).toMatchObject({ success: false, code: 'bad_request' });
        expect(await service.createSub(id, 'contacts', { name: 'bad' }, { authorization } as never)).toMatchObject({
          success: false,
          code: 'bad_request',
        });
      }
      expect(f.parentHook).not.toHaveBeenCalled();
      expect((await f.Parent.findById(id).lean())!.contacts).toHaveLength(2);
    });
  });
});
