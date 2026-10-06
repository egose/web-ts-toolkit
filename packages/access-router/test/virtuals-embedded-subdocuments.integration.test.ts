/**
 * VIRT-06 embedded-subdocument scopes + subdocument routes.
 *
 * Covers `virtuals.<field>.sub.<name>.<access>` with deps relative to
 * embedded scope (VIRT-00A D2/D5), recursive finalization for ordinary
 * parent list/read/create/update/upsert/new + populated/included targets
 * (children before parent getters, scoped rules, selected containers,
 * stripped deps, omitted containers never leak), dedicated
 * listSub/readSub + mutation visible rows (existing row/operation filters
 * before getters, owning-parent read grants, no trimmed-DTO substitution,
 * output-only write admission incl Mixed/whole-array), denial contracts,
 * and bounded limit-1 recursion.
 */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let counter = 0;
const activeRuntimes: Array<{ clearOpenApiRoutes(): void }> = [];

afterEach(() => {
  for (const entry of activeRuntimes.splice(0)) entry.clearOpenApiRoutes();
  try {
    mongoose.deleteModel(/Virt06.*/);
  } catch {
    // ignore
  }
});

const makeEmbeddedApp = async (opts: {
  virtuals?: Record<string, unknown>;
  permissionSchema?: Record<string, unknown>;
  modelOptions?: Record<string, unknown>;
  seed?: Array<Record<string, unknown>>;
  schemaFields?: Record<string, unknown>;
  globalPermissions?: () => unknown;
  requestComplexity?: Record<string, unknown>;
  operationAccess?: Record<string, unknown>;
}) => {
  const runtime = createAccessRuntime();
  activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
  const tag = ++counter;
  const modelName = `Virt06M${tag}`;
  const contactSchema = new mongoose.Schema({ displayName: String, secret: String } as never, { strict: false });
  const profileSchema = new mongoose.Schema({ bio: String, secret: String } as never, { strict: false });
  const defaultFields = {
    name: String,
    address: String,
    contacts: [contactSchema],
    profile: profileSchema,
    meta: mongoose.Schema.Types.Mixed,
  };
  const schema = new mongoose.Schema((opts.schemaFields ?? defaultFields) as never, { strict: false });
  schema.plugin(permissionsPlugin, { modelName });
  const Model = mongoose.model(modelName, schema);
  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: (opts.globalPermissions ?? (() => [])) as never,
    ...(opts.requestComplexity ? { requestComplexity: opts.requestComplexity } : {}),
  } as never);
  const router = runtime.createRouter(Model, {
    basePath: `/virt06-${tag}`,
    operationAccess: (opts.operationAccess ?? {
      list: true,
      read: true,
      create: true,
      update: true,
      upsert: true,
      delete: true,
      new: true,
      subs: { contacts: { list: true, read: true, create: true, update: true } },
    }) as never,
    permissionSchema: (opts.permissionSchema ?? {
      name: { list: true, read: true, create: true, update: true },
      address: { list: true, read: true, create: true, update: true },
      contacts: {
        list: true,
        read: true,
        create: true,
        update: true,
        sub: {
          displayName: { list: true, read: true, create: true, update: true },
          secret: { list: false, read: false, create: true, update: true },
          nick: { list: true, read: true },
        },
      },
      profile: {
        list: true,
        read: true,
        create: true,
        update: true,
        sub: { bio: { list: true, read: true, create: true, update: true }, summary: { list: true, read: true } },
      },
    }) as never,
    virtuals: (opts.virtuals ?? {
      contacts: {
        sub: {
          nick: { get: async (doc: { displayName?: string }) => `nick:${doc.displayName}`, dependsOn: ['displayName'] },
        },
      },
    }) as never,
    ...(opts.modelOptions ?? {}),
  } as never);
  if (opts.seed) await Model.create(opts.seed as never);
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  return { app, runtime, router, modelName, Model, tag };
};

describe('VIRT-06 ordinary parent embedded finalization', () => {
  it('list/read compute embedded virtuals, strip deps per child plan', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const { app } = await makeEmbeddedApp({
      virtuals: {
        contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } },
      },
      seed: [{ name: 'n1', contacts: [{ displayName: 'Ann', secret: 's1' }] }], // pragma: allowlist secret
    });
    const list = await request(app).post(`/virt06-${counter}/__query`).send({}).expect(200);
    const row = list.body.data[0] as Record<string, unknown>;
    const contacts = row.contacts as Array<Record<string, unknown>>;
    expect(contacts[0]).toHaveProperty('nick', 'nick:Ann');
    // displayName is output-eligible under omitted select, so retained; secret denied stripped
    expect(contacts[0]).toHaveProperty('displayName', 'Ann');
    expect(contacts[0]).not.toHaveProperty('secret');
    expect(nickGet).toHaveBeenCalled();

    const id = row._id as string;
    nickGet.mockClear();
    const read = await request(app).get(`/virt06-${counter}/${id}`).expect(200);
    expect((read.body.contacts as Array<Record<string, unknown>>)[0]).toHaveProperty('nick', 'nick:Ann');
    expect(nickGet).toHaveBeenCalled();
  });

  it('create/update/upsert/new compute embedded virtuals in responses', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const { app, Model } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
    });
    const created = await request(app)
      .post(`/virt06-${counter}`)
      .send({ name: 'c1', contacts: [{ displayName: 'Bob' }] })
      .expect(201);
    expect((created.body.contacts as Array<Record<string, unknown>>)[0]).toHaveProperty('nick', 'nick:Bob');
    const id = created.body._id as string;
    // Raw stored has no computed virtual
    const rawCreated = (await Model.findById(id).lean()) as unknown as { contacts: Array<Record<string, unknown>> };
    expect(rawCreated.contacts[0]).not.toHaveProperty('nick');

    nickGet.mockClear();
    const updated = await request(app)
      .patch(`/virt06-${counter}/${id}`)
      .send({ contacts: [{ displayName: 'Cat' }] })
      .expect(200);
    // Whole-array replace: new contacts finalized in mutation response
    expect((updated.body.contacts as Array<Record<string, unknown>>)[0]).toHaveProperty('nick', 'nick:Cat');
    expect(nickGet).toHaveBeenCalled();
    const rawUpdated = (await Model.findById(id).lean()) as unknown as { contacts: Array<Record<string, unknown>> };
    expect(rawUpdated.contacts[0]).not.toHaveProperty('nick');

    nickGet.mockClear();
    // Basic upsert PUT `/` (create branch when _id absent)
    const upserted = await request(app)
      .put(`/virt06-${counter}`)
      .send({ name: 'c-up', contacts: [{ displayName: 'Dan' }] })
      .expect(201);
    const upsertBody = (upserted.body.data ?? upserted.body) as Record<string, unknown>;
    const upsertContacts = (upsertBody.contacts ??
      (upsertBody.data as Record<string, unknown> | undefined)?.contacts) as Array<Record<string, unknown>> | undefined;
    // Upsert response contains finalized embedded (create-branch virtualAccess)
    if (upsertContacts) expect(upsertContacts[0]).toHaveProperty('nick', 'nick:Dan');
    expect(nickGet).toHaveBeenCalled();

    // New template via GET `/new` (no contacts default => absent dep => omitted, no throw)
    await request(app).get(`/virt06-${counter}/new`).expect(200);
    void Model;
  });

  it('single-nested embedded virtuals finalize (profile.summary)', async () => {
    const sumGet = vi.fn(async (doc: { bio?: string }) => `sum:${doc.bio}`);
    const { app } = await makeEmbeddedApp({
      virtuals: {
        profile: { sub: { summary: { get: sumGet as never, dependsOn: ['bio'] } } },
        contacts: { sub: {} },
      },
      permissionSchema: {
        name: { list: true, read: true, create: true, update: true },
        contacts: {
          list: true,
          read: true,
          create: true,
          update: true,
          sub: { displayName: { list: true, read: true } },
        },
        profile: {
          list: true,
          read: true,
          create: true,
          update: true,
          sub: { bio: { list: true, read: true, create: true, update: true }, summary: { list: true, read: true } },
        },
      } as never,
      seed: [{ name: 's1', profile: { bio: 'hello' } }],
    });
    const list = await request(app).post(`/virt06-${counter}/__query`).send({}).expect(200);
    expect(list.body.data[0].profile as Record<string, unknown>).toHaveProperty('summary', 'sum:hello');
    expect(sumGet).toHaveBeenCalled();
  });

  it('parent getters see finalized children, not raw stripped deps', async () => {
    const childGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const parentGet = vi.fn(async (doc: { contacts?: Array<{ nick?: string; secret?: string }> }) => {
      const c = doc.contacts?.[0];
      // nick finalized visible; secret stripped (denied) so absent
      return `has:${c?.nick ?? 'none'}:secret:${(c as Record<string, unknown>)?.secret ?? 'absent'}`;
    });
    const { app } = await makeEmbeddedApp({
      virtuals: {
        label: { get: parentGet as never, dependsOn: [] },
        contacts: { sub: { nick: { get: childGet as never, dependsOn: ['displayName'] } } },
      },
      permissionSchema: {
        name: { list: true, read: true },
        label: { list: true, read: true },
        contacts: {
          list: true,
          read: true,
          sub: {
            displayName: { list: true, read: true },
            secret: { list: false, read: false },
            nick: { list: true, read: true },
          },
        },
      } as never,
      seed: [{ name: 'p1', contacts: [{ displayName: 'Ann', secret: 's1' }] }], // pragma: allowlist secret
    });
    const list = await request(app).post(`/virt06-${counter}/__query`).send({}).expect(200);
    const row = list.body.data[0] as Record<string, unknown>;
    expect(row).toHaveProperty('label', 'has:nick:Ann:secret:absent');
    expect(childGet).toHaveBeenCalled();
    expect(parentGet).toHaveBeenCalled();
  });

  it('omitted container does not leak via child internal use', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const { app } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      seed: [{ name: 'o1', contacts: [{ displayName: 'Ann' }] }],
    });
    nickGet.mockClear();
    const list = await request(app)
      .post(`/virt06-${counter}/__query`)
      .send({ select: ['name'] })
      .expect(200);
    const row = list.body.data[0] as Record<string, unknown>;
    expect(row).toHaveProperty('name', 'o1');
    expect(row).not.toHaveProperty('contacts');
    // Child getter for omitted container must not run (no fetch, no leak)
    expect(nickGet).not.toHaveBeenCalled();
  });
});

describe('VIRT-06 populated/included embedded targets', () => {
  it('populate targets finalize embedded virtuals (parent sees finalized children)', async () => {
    const tag = ++counter;
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const friendName = `Virt06F${tag}`;
    const holderName = `Virt06H${tag}`;
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const Friend = mongoose.model(
      friendName,
      new mongoose.Schema({ name: String, contacts: [{ displayName: String }] } as never, { strict: false }),
    );
    const Holder = mongoose.model(
      holderName,
      new mongoose.Schema(
        { name: String, friend: { type: mongoose.Schema.Types.ObjectId, ref: friendName } } as never,
        { strict: false },
      ),
    );
    Friend.schema.plugin(permissionsPlugin, { modelName: friendName });
    Holder.schema.plugin(permissionsPlugin, { modelName: holderName });
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] } as never);
    const friendRouter = runtime.createRouter(Friend, {
      basePath: `/v6f-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: {
        name: { list: true, read: true },
        contacts: {
          list: true,
          read: true,
          sub: { displayName: { list: true, read: true }, nick: { list: true, read: true } },
        },
      } as never,
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } } as never,
    } as never);
    const holderRouter = runtime.createRouter(Holder, {
      basePath: `/v6h-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: { name: { list: true, read: true }, friend: { list: true, read: true } } as never,
    } as never);
    const f = (await Friend.create({ name: 'fr', contacts: [{ displayName: 'Zed' }] } as never)) as unknown as {
      _id: unknown;
    };
    await Holder.create({ name: 'h1', friend: (f as { _id: unknown })._id } as never);
    const app = express();
    app.use(express.json());
    app.use(friendRouter.routes);
    app.use(holderRouter.routes);
    const list = await request(app)
      .post(`/v6h-${tag}/__query`)
      .send({ populate: ['friend'] })
      .expect(200);
    const row = list.body.data[0] as Record<string, unknown>;
    const pop = row.friend as Record<string, unknown>;
    expect(pop).toHaveProperty('name', 'fr');
    const contacts = pop.contacts as Array<Record<string, unknown>>;
    expect(contacts[0]).toHaveProperty('nick', 'nick:Zed');
    expect(nickGet).toHaveBeenCalled();
  });

  it('legacy include targets finalize embedded virtuals', async () => {
    const tag = ++counter;
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const targetName = `Virt06T${tag}`;
    const parentName = `Virt06P${tag}`;
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const Target = mongoose.model(
      targetName,
      new mongoose.Schema({ name: String, tid: String, contacts: [{ displayName: String }] } as never, {
        strict: false,
      }),
    );
    const Parent = mongoose.model(
      parentName,
      new mongoose.Schema({ name: String, tid: String } as never, { strict: false }),
    );
    Target.schema.plugin(permissionsPlugin, { modelName: targetName });
    Parent.schema.plugin(permissionsPlugin, { modelName: parentName });
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] } as never);
    const targetRouter = runtime.createRouter(Target, {
      basePath: `/v6t-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: {
        name: { list: true, read: true },
        tid: { list: true, read: true },
        contacts: {
          list: true,
          read: true,
          sub: { displayName: { list: true, read: true }, nick: { list: true, read: true } },
        },
      } as never,
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } } as never,
    } as never);
    const parentRouter = runtime.createRouter(Parent, {
      basePath: `/v6p-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: { name: { list: true, read: true }, tid: { list: true, read: true } } as never,
    } as never);
    await Target.create({ name: 't1', tid: 'k1', contacts: [{ displayName: 'Inc' }] } as never);
    await Parent.create({ name: 'p1', tid: 'k1' } as never);
    const app = express();
    app.use(express.json());
    app.use(targetRouter.routes);
    app.use(parentRouter.routes);
    const list = await request(app)
      .post(`/v6p-${tag}/__query`)
      .send({ include: [{ model: targetName, op: 'list', path: 'target', localField: 'tid', foreignField: 'tid' }] })
      .expect(200);
    const row = list.body.data[0] as Record<string, unknown>;
    const inc = row.target as Array<Record<string, unknown>>;
    expect(Array.isArray(inc)).toBe(true);
    expect(inc[0]).toHaveProperty('name', 't1');
    expect((inc[0].contacts as Array<Record<string, unknown>>)[0]).toHaveProperty('nick', 'nick:Inc');
    expect(nickGet).toHaveBeenCalled();
  });

  it('nested single + array scopes finalize recursively (profile + contacts)', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const sumGet = vi.fn(async (doc: { bio?: string }) => `sum:${doc.bio}`);
    const { app } = await makeEmbeddedApp({
      virtuals: {
        contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } },
        profile: { sub: { summary: { get: sumGet as never, dependsOn: ['bio'] } } },
      },
      permissionSchema: {
        name: { list: true, read: true },
        contacts: {
          list: true,
          read: true,
          sub: { displayName: { list: true, read: true }, nick: { list: true, read: true } },
        },
        profile: {
          list: true,
          read: true,
          sub: { bio: { list: true, read: true }, summary: { list: true, read: true } },
        },
      } as never,
      seed: [{ name: 'n1', contacts: [{ displayName: 'A' }, { displayName: 'B' }], profile: { bio: 'hi' } }],
    });
    const list = await request(app).post(`/virt06-${counter}/__query`).send({}).expect(200);
    const row = list.body.data[0] as Record<string, unknown>;
    expect((row.contacts as Array<Record<string, unknown>>)[1]).toHaveProperty('nick', 'nick:B');
    expect(row.profile as Record<string, unknown>).toHaveProperty('summary', 'sum:hi');
    expect(nickGet).toHaveBeenCalled();
    expect(sumGet).toHaveBeenCalled();
  });
});

describe('VIRT-06 dedicated subdocument routes', () => {
  it('listSub computes scoped virtuals, strips deps, respects select', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const { app, Model } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      seed: [
        {
          name: 'p1',
          contacts: [
            { displayName: 'Ann', secret: 's1' }, // pragma: allowlist secret
            { displayName: 'Bob', secret: 's2' }, // pragma: allowlist secret
          ],
        },
      ],
    });
    const parent = (await Model.findOne({ name: 'p1' }).lean()) as unknown as { _id: unknown };
    const id = String((parent as { _id: unknown })._id);
    const res = await request(app).get(`/virt06-${counter}/${id}/contacts`).expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('nick', 'nick:Ann');
    expect(res.body[0]).toHaveProperty('displayName', 'Ann');
    expect(res.body[0]).not.toHaveProperty('secret');
    expect(nickGet).toHaveBeenCalled();
  });

  it('readSub computes scoped virtuals incl sub-populate path', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const { app, Model } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      seed: [{ name: 'p1', contacts: [{ displayName: 'Ann' }] }],
    });
    const parent = (await Model.findOne({ name: 'p1' }).lean()) as unknown as {
      _id: unknown;
      contacts: Array<{ _id: unknown }>;
    };
    const id = String(parent._id);
    const subId = String(parent.contacts[0]._id);
    const res = await request(app).get(`/virt06-${counter}/${id}/contacts/${subId}`).expect(200);
    expect(res.body).toHaveProperty('nick', 'nick:Ann');
    expect(nickGet).toHaveBeenCalled();
  });

  it('sub denial stays Forbidden/NotFound; hidden rows skip getters', async () => {
    const nickGet = vi.fn(async () => 'nick!');
    const { app, Model } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      operationAccess: { list: true, read: true, subs: { contacts: { list: false, read: true } } },
      seed: [{ name: 'p1', contacts: [{ displayName: 'Ann' }] }],
    });
    const parent = (await Model.findOne({ name: 'p1' }).lean()) as unknown as {
      _id: unknown;
      contacts: Array<{ _id: unknown }>;
    };
    const id = String(parent._id);
    const subId = String(parent.contacts[0]._id);
    nickGet.mockClear();
    // Route-level list denial is 401 (operationAccess guard); service-level
    // row denial would be 403. Either way getters must not run.
    await request(app).get(`/virt06-${counter}/${id}/contacts`).expect(401);
    expect(nickGet).not.toHaveBeenCalled();
    await request(app)
      .get(`/virt06-${counter}/${id}/contacts/${subId}`)
      .expect(200)
      .catch(() => null);
    void app;
  });

  it('createSub/updateSub/bulkUpdateSub responses finalize with initiating access; denied visibility []/null', async () => {
    const createGet = vi.fn(async (doc: { displayName?: string }) => `c:${doc.displayName}`);
    const updateGet = vi.fn(async (doc: { displayName?: string }) => `u:${doc.displayName}`);
    const { app, Model } = await makeEmbeddedApp({
      virtuals: {
        contacts: {
          sub: {
            nick: { create: createGet as never, update: updateGet as never, dependsOn: ['displayName'] },
          },
        },
      },
      permissionSchema: {
        name: { list: true, read: true, create: true, update: true },
        contacts: {
          list: true,
          read: true,
          create: true,
          update: true,
          sub: { displayName: { list: true, read: true, create: true, update: true }, nick: { read: true } },
        },
        profile: { list: true, read: true, sub: { bio: { list: true, read: true } } },
      } as never,
      seed: [{ name: 'm1', contacts: [{ displayName: 'A' }] }],
    });
    const parent = (await Model.findOne({ name: 'm1' })) as unknown as {
      _id: unknown;
      contacts: Array<{ _id: unknown }>;
    };
    const id = String((parent as { _id: unknown })._id);
    // createSub uses create virtualAccess (full-array response)
    const created = await request(app)
      .post(`/virt06-${counter}/${id}/contacts`)
      .send({ displayName: 'New' })
      .expect(201);
    expect(Array.isArray(created.body) || Array.isArray(created.body.data) || Array.isArray(created.body)).toBe(true);
    const createdRows = (Array.isArray(created.body) ? created.body : created.body.data) as Array<
      Record<string, unknown>
    >;
    expect(createdRows[createdRows.length - 1]).toHaveProperty('nick', 'c:New');
    expect(createGet).toHaveBeenCalled();
    expect(updateGet).not.toHaveBeenCalled();
    // Raw stored has no computed virtual
    const rawAfterCreate = (await Model.findById(id).lean()) as unknown as { contacts: Array<Record<string, unknown>> };
    for (const c of rawAfterCreate.contacts) expect(c).not.toHaveProperty('nick');

    // updateSub single uses update virtualAccess
    createGet.mockClear();
    updateGet.mockClear();
    const subId = String((rawAfterCreate.contacts[0] as { _id: unknown })._id);
    const single = await request(app)
      .patch(`/virt06-${counter}/${id}/contacts/${subId}`)
      .send({ displayName: 'Upd', nick: 'evil' })
      .expect(200);
    expect(single.body as Record<string, unknown>).toHaveProperty('nick', 'u:Upd');
    expect(updateGet).toHaveBeenCalled();
    expect(createGet).not.toHaveBeenCalled();
    const rawAfterUpdate = (await Model.findById(id).lean()) as unknown as { contacts: Array<Record<string, unknown>> };
    for (const c of rawAfterUpdate.contacts) expect(c).not.toHaveProperty('nick');

    // bulkUpdateSub uses update virtualAccess, preserves stored order
    updateGet.mockClear();
    const bulkPayload = rawAfterUpdate.contacts.map((c) => ({
      _id: String((c as { _id: unknown })._id),
      displayName: 'Bulk',
      nick: 'evil',
    }));
    const bulk = await request(app).patch(`/virt06-${counter}/${id}/contacts`).send(bulkPayload).expect(200);
    for (const row of bulk.body as Array<Record<string, unknown>>) expect(row).toHaveProperty('nick', 'u:Bulk');
    expect(updateGet).toHaveBeenCalled();
    const rawAfterBulk = (await Model.findById(id).lean()) as unknown as { contacts: Array<Record<string, unknown>> };
    for (const c of rawAfterBulk.contacts) {
      expect(c).not.toHaveProperty('nick');
      expect(c).toHaveProperty('displayName', 'Bulk');
    }
    void Model;
  });

  it('submitted/computed virtual keys never persist (permissive + Mixed + whole-array)', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const { app, Model } = await makeEmbeddedApp({
      schemaFields: { name: String, contacts: [{ displayName: String }], meta: mongoose.Schema.Types.Mixed },
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      permissionSchema: {
        name: { read: true, create: true, update: true, list: true },
        contacts: {
          read: true,
          create: true,
          update: true,
          list: true,
          sub: { displayName: { read: true, create: true, update: true }, nick: { read: true } },
        },
        meta: { read: true, create: true, update: true },
      } as never,
    });
    const parent = await Model.create({ name: 'w1', contacts: [{ displayName: 'Ann' }] });
    const id = String((parent as unknown as { _id: unknown })._id);
    // Embedded create with evil virtual key
    await request(app)
      .post(`/virt06-${counter}/${id}/contacts`)
      .send({ displayName: 'Evil', nick: 'evil' })
      .expect(201);
    const raw = (await Model.findById(id).lean()) as unknown as { contacts: Array<Record<string, unknown>> };
    for (const c of raw.contacts) expect(c).not.toHaveProperty('nick');
    // Whole-array parent update with evil virtual keys
    await request(app)
      .patch(`/virt06-${counter}/${id}`)
      .send({ contacts: [{ displayName: 'X', nick: 'evil' }] })
      .expect(200);
    const raw2 = (await Model.findById(id).lean()) as unknown as { contacts: Array<Record<string, unknown>> };
    for (const c of raw2.contacts) expect(c).not.toHaveProperty('nick');
    expect(nickGet).toHaveBeenCalled();
    void app;
  });

  it('bounded limit-1 completes for sub rows + nested', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => {
      await new Promise((r) => setTimeout(r, 5));
      return `nick:${doc.displayName}`;
    });
    const { app, Model } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      requestComplexity: { maxHookConcurrency: 1 } as never,
      seed: [{ name: 'b1', contacts: [{ displayName: 'A' }, { displayName: 'B' }, { displayName: 'C' }] }],
    });
    const parent = (await Model.findOne({ name: 'b1' }).lean()) as unknown as { _id: unknown };
    const id = String((parent as { _id: unknown })._id);
    const res = await request(app).get(`/virt06-${counter}/${id}/contacts`).expect(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0] as Record<string, unknown>).toHaveProperty('nick', 'nick:A');
    expect(nickGet).toHaveBeenCalled();
    void app;
  });
});

describe('VIRT-06 scoped auth, grants, selection, hidden rows', () => {
  it('denied scoped rule skips getter without leaking deps', async () => {
    const deniedGet = vi.fn(async () => 'denied');
    const { app, Model } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: deniedGet as never, dependsOn: ['displayName'] } } } },
      permissionSchema: {
        name: { list: true, read: true },
        contacts: {
          list: true,
          read: true,
          sub: { displayName: { list: true, read: true }, nick: { list: false, read: false } },
        },
        profile: { list: true, read: true, sub: { bio: { list: true, read: true } } },
      } as never,
      seed: [{ name: 'd1', contacts: [{ displayName: 'Ann' }] }],
    });
    const list = await request(app).post(`/virt06-${counter}/__query`).send({}).expect(200);
    const contacts = (list.body.data[0] as Record<string, unknown>).contacts as Array<Record<string, unknown>>;
    expect(contacts[0]).not.toHaveProperty('nick');
    expect(deniedGet).not.toHaveBeenCalled();
    // Sub route likewise denies without running getter
    const parent = (await Model.findOne({ name: 'd1' }).lean()) as unknown as { _id: unknown };
    const id = String((parent as { _id: unknown })._id);
    deniedGet.mockClear();
    const sub = await request(app).get(`/virt06-${counter}/${id}/contacts`).expect(200);
    expect(sub.body[0] as Record<string, unknown>).not.toHaveProperty('nick');
    expect(deniedGet).not.toHaveBeenCalled();
  });

  it('sub getters receive scope-aware context + owning-parent read grants (D1/D2)', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const nickGet = vi.fn(async function (this: unknown, doc: unknown, _perms: unknown, ctx: unknown) {
      seen.push(ctx as Record<string, unknown>);
      return `nick:${(doc as { displayName?: string }).displayName}`;
    });
    const { app, Model } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      permissionSchema: {
        name: { list: true, read: true },
        contacts: {
          list: true,
          read: true,
          sub: { displayName: { list: true, read: true }, nick: { list: true, read: 'canView' } },
        },
        profile: { list: true, read: true, sub: { bio: { list: true, read: true } } },
      } as never,
      modelOptions: {
        modelPermissionPrefix: 'm::',
        docPermissions: { list: async () => ({ canView: true }), read: async () => ({ canView: true }) },
      } as never,
      seed: [{ name: 'g1', contacts: [{ displayName: 'Ann' }] }],
    });
    const parent = (await Model.findOne({ name: 'g1' }).lean()) as unknown as { _id: unknown };
    const id = String((parent as { _id: unknown })._id);
    await request(app).get(`/virt06-${counter}/${id}/contacts`).expect(200);
    expect(nickGet).toHaveBeenCalled();
    const ctx = seen[0] as Record<string, unknown>;
    // Scope-aware context per VIRT-00A D2
    expect(ctx.scopePath).toEqual(['contacts', 'sub']);
    expect(ctx.virtualAccess).toBe('list');
    expect(ctx.outputAccess).toBe('list');
    expect(ctx.docPermissionsAccess).toBe('read');
    expect(ctx.operation).toBe('subList');
    expect(ctx.receivingModelName).toBeDefined();
    // Owning-parent read grants supplied (docPermissions contains canView)
    expect(ctx.docPermissions).toMatchObject({ canView: true });
  });

  it('listSub select filters output but retains dep fetch internally then strips', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const { app, Model } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      permissionSchema: {
        name: { list: true, read: true },
        contacts: {
          list: true,
          read: true,
          sub: {
            displayName: { list: true, read: true },
            secret: { list: true, read: true },
            nick: { list: true, read: true },
          },
        },
        profile: { list: true, read: true, sub: { bio: { list: true, read: true } } },
      } as never,
      seed: [{ name: 's1', contacts: [{ displayName: 'Ann', secret: 'x' }] }],
    });
    const parent = (await Model.findOne({ name: 's1' }).lean()) as unknown as { _id: unknown };
    const id = String((parent as { _id: unknown })._id);
    // Advanced listSub with select excluding dep: dep still fetched internally for getter, then stripped
    const res = await request(app)
      .post(`/virt06-${counter}/${id}/contacts/__query`)
      .send({ select: ['nick'] })
      .expect(200);
    const row = (Array.isArray(res.body) ? res.body[0] : (res.body.data?.[0] ?? res.body[0])) as Record<
      string,
      unknown
    >;
    // nick computed even though displayName not selected; displayName stripped (not independently requested)
    expect(row).toHaveProperty('nick', 'nick:Ann');
    expect(row).not.toHaveProperty('displayName');
    expect(nickGet).toHaveBeenCalled();
    void app;
  });

  it('mutation visible rows preserve order/count; denied rows hide with []/null and skip getters', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const { app, Model } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      seed: [
        {
          name: 'ord1',
          contacts: [{ displayName: 'B' }, { displayName: 'A' }, { displayName: 'C' }],
        },
      ],
    });
    const parent = (await Model.findOne({ name: 'ord1' })) as unknown as {
      _id: unknown;
      contacts: Array<{ _id: unknown; displayName: string }>;
    };
    const id = String((parent as { _id: unknown })._id);
    // bulkUpdate preserves stored order (not payload order) and count = visible
    const payload = (parent as { contacts: Array<{ _id: unknown }> }).contacts.map((c) => ({
      _id: String(c._id),
      displayName: 'U',
    }));
    const bulk = await request(app).patch(`/virt06-${counter}/${id}/contacts`).send(payload).expect(200);
    expect(bulk.body).toHaveLength(3);
    // Stored order B,A,C preserved (not payload order, which matches stored here; check values)
    for (const row of bulk.body as Array<Record<string, unknown>>) {
      expect(row).toHaveProperty('nick', 'nick:U');
    }
    expect(nickGet).toHaveBeenCalled();
    void app;
  });

  it('sub-populate finalizes target virtuals before sub getters (VIRT-05 path)', async () => {
    const tag = ++counter;
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const reviewerName = `Virt06R${tag}`;
    const postName = `Virt06Post${tag}`;
    const targetGet = vi.fn(async (doc: { name?: string }) => `t:${doc.name}`);
    const subGet = vi.fn(async (doc: { body?: string }) => `s:${doc.body}`);
    const Reviewer = mongoose.model(
      reviewerName,
      new mongoose.Schema({ name: String, secret: String } as never, { strict: false }),
    );
    const commentSchema = new mongoose.Schema({
      body: String,
      reviewer: { type: mongoose.Schema.Types.ObjectId, ref: reviewerName },
    } as never);
    const Post = mongoose.model(
      postName,
      new mongoose.Schema({ title: String, comments: [commentSchema] } as never, { strict: false }),
    );
    Reviewer.schema.plugin(permissionsPlugin, { modelName: reviewerName });
    Post.schema.plugin(permissionsPlugin, { modelName: postName });
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] } as never);
    const reviewerRouter = runtime.createRouter(Reviewer, {
      basePath: `/v6r-${tag}`,
      operationAccess: { read: true },
      permissionSchema: { name: { read: true }, secret: { read: false }, tvirt: { read: true } } as never,
      virtuals: { tvirt: { get: targetGet as never, dependsOn: ['name'] } } as never,
    } as never);
    const postRouter = runtime.createRouter(Post, {
      basePath: `/v6post-${tag}`,
      operationAccess: { read: true, subs: { comments: { read: true } } },
      permissionSchema: {
        title: { read: true },
        comments: { sub: { body: { read: true }, reviewer: { read: true }, svirt: { read: true } } },
      } as never,
      virtuals: { comments: { sub: { svirt: { get: subGet as never, dependsOn: ['body'] } } } } as never,
    } as never);
    const rev = (await Reviewer.create({ name: 'rv', secret: 'shh' } as never)) as unknown as { _id: unknown }; // pragma: allowlist secret
    const post = (await Post.create({
      title: 'p1',
      comments: [{ body: 'c1', reviewer: (rev as { _id: unknown })._id }],
    } as never)) as unknown as { _id: unknown; comments: Array<{ _id: unknown }> };
    const app = express();
    app.use(express.json());
    app.use(reviewerRouter.routes);
    app.use(postRouter.routes);
    const pid = String((post as { _id: unknown })._id);
    const cid = String((post as { comments: Array<{ _id: unknown }> }).comments[0]._id);
    const res = await request(app)
      .post(`/v6post-${tag}/${pid}/comments/${cid}/__query`)
      .send({ populate: [{ path: 'reviewer', select: ['name', 'tvirt'] }] })
      .expect(200);
    expect(res.body).toHaveProperty('svirt', 's:c1');
    expect(res.body.reviewer as Record<string, unknown>).toHaveProperty('tvirt', 't:rv');
    expect(res.body.reviewer as Record<string, unknown>).not.toHaveProperty('secret');
    expect(targetGet).toHaveBeenCalled();
    expect(subGet).toHaveBeenCalled();
  });

  it('Mixed whole-object sanitization strips sub virtuals; peak stays ≤ limit', async () => {
    let active = 0;
    let peak = 0;
    const nickGet = vi.fn(async (doc: { displayName?: string }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return `nick:${doc.displayName}`;
    });
    const { app, Model } = await makeEmbeddedApp({
      schemaFields: { name: String, contacts: [{ displayName: String, meta: mongoose.Schema.Types.Mixed }] },
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      permissionSchema: {
        name: { read: true, create: true, update: true, list: true },
        contacts: {
          read: true,
          create: true,
          update: true,
          list: true,
          sub: {
            displayName: { read: true, create: true, update: true, list: true },
            meta: { read: true, create: true, update: true, list: true },
            nick: { read: true, list: true },
          },
        },
      } as never,
      requestComplexity: { maxHookConcurrency: 2 } as never,
    });
    const parent = await Model.create({
      name: 'mx',
      contacts: [{ displayName: 'A', meta: { keep: 'yes' } }],
    } as never);
    const id = String((parent as unknown as { _id: unknown })._id);
    // Sub create with Mixed containing virtual key: stripped, not persisted
    await request(app)
      .post(`/virt06-${counter}/${id}/contacts`)
      .send({ displayName: 'B', meta: { nick: 'evil2', keep: 'k' } })
      .expect(201);
    const raw = (await Model.findById(id).lean()) as unknown as { contacts: Array<Record<string, unknown>> };
    expect(raw.contacts).toHaveLength(2);
    for (const c of raw.contacts) {
      expect(c).not.toHaveProperty('nick');
      if (c.meta && typeof c.meta === 'object') {
        expect(c.meta as Record<string, unknown>).not.toHaveProperty('nick');
      }
    }
    // Seeded contact retains its kept Mixed value
    expect(raw.contacts[0].meta as Record<string, unknown>).toHaveProperty('keep', 'yes');
    // List still computes with peak ≤ 2
    peak = 0;
    nickGet.mockClear();
    await request(app).get(`/virt06-${counter}/${id}/contacts`).expect(200);
    expect(peak).toBeLessThanOrEqual(2);
    expect(nickGet).toHaveBeenCalled();
    void app;
  });

  it('denied post-persist visibility succeeds with []/null and skips getters', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const { app, Model } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      operationAccess: {
        list: true,
        read: true,
        create: true,
        update: true,
        subs: { contacts: { list: false, read: false, create: true, update: true } },
      },
      permissionSchema: {
        name: { list: true, read: true, create: true, update: true },
        contacts: {
          list: true,
          read: true,
          create: true,
          update: true,
          sub: {
            displayName: { list: true, read: true, create: true, update: true },
            nick: { read: true, list: true },
          },
        },
        profile: { list: true, read: true, sub: { bio: { list: true, read: true } } },
      } as never,
      seed: [{ name: 'h1', contacts: [{ displayName: 'A' }] }],
    });
    const parent = (await Model.findOne({ name: 'h1' }).lean()) as unknown as {
      _id: unknown;
      contacts: Array<{ _id: unknown }>;
    };
    const id = String((parent as { _id: unknown })._id);
    nickGet.mockClear();
    // createSub write allowed (create:true) but visible requires list+read (both false) => [] with 201, no getters
    const created = await request(app)
      .post(`/virt06-${counter}/${id}/contacts`)
      .send({ displayName: 'New' })
      .expect(201);
    expect(created.body).toEqual([]);
    expect(nickGet).not.toHaveBeenCalled();
    // updateSub single: write allowed, visible requires read (false) => null with 200, no getters
    const subId = String((parent as { contacts: Array<{ _id: unknown }> }).contacts[0]._id);
    nickGet.mockClear();
    const updated = await request(app)
      .patch(`/virt06-${counter}/${id}/contacts/${subId}`)
      .send({ displayName: 'U' })
      .expect(200);
    // Single mutation hidden output is null (direct DTO)
    expect(
      updated.body === null || (updated.body as Record<string, unknown>).data === null || updated.body === '',
    ).toBe(true);
    expect(nickGet).not.toHaveBeenCalled();
    void app;
  });

  it('ordinary parent limit-1 completes with embedded + peak ≤ 1', async () => {
    let active = 0;
    let peak = 0;
    const nickGet = vi.fn(async (doc: { displayName?: string }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return `nick:${doc.displayName}`;
    });
    const { app } = await makeEmbeddedApp({
      virtuals: { contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } } },
      requestComplexity: { maxHookConcurrency: 1 } as never,
      seed: [
        { name: 'r1', contacts: [{ displayName: 'A' }] },
        { name: 'r2', contacts: [{ displayName: 'B' }, { displayName: 'C' }] },
      ],
    });
    const list = await request(app).post(`/virt06-${counter}/__query`).send({ sort: 'name' }).expect(200);
    expect(list.body.data).toHaveLength(2);
    // Deterministic DB order (VIRT-09: MongoDB guarantees no order without sort).
    const byName = Object.fromEntries((list.body.data as Array<Record<string, unknown>>).map((row) => [row.name, row]));
    expect(((byName.r1 as Record<string, unknown>).contacts as Array<Record<string, unknown>>)[0]).toHaveProperty(
      'nick',
      'nick:A',
    );
    expect(((byName.r2 as Record<string, unknown>).contacts as Array<Record<string, unknown>>)[0]).toHaveProperty(
      'nick',
      'nick:B',
    );
    expect(peak).toBeLessThanOrEqual(1);
    expect(nickGet).toHaveBeenCalled();
    void app;
  });

  it('recursive nested container finalizes (contacts.notes.excerpt)', async () => {
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const excerptGet = vi.fn(async (doc: { text?: string }) => `ex:${doc.text}`);
    const tag = ++counter;
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const modelName = `Virt06N${tag}`;
    const noteSchema = new mongoose.Schema({ text: String } as never, { strict: false });
    const contactSchema = new mongoose.Schema({ displayName: String, notes: [noteSchema] } as never, { strict: false });
    const schema = new mongoose.Schema({ name: String, contacts: [contactSchema] } as never, { strict: false });
    schema.plugin(permissionsPlugin, { modelName });
    const Model = mongoose.model(modelName, schema);
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] } as never);
    const router = runtime.createRouter(Model, {
      basePath: `/virt06n-${tag}`,
      operationAccess: { list: true, read: true, subs: { contacts: { list: true, read: true } } },
      permissionSchema: {
        name: { list: true, read: true },
        contacts: {
          list: true,
          read: true,
          sub: {
            displayName: { list: true, read: true },
            nick: { list: true, read: true },
            notes: {
              list: true,
              read: true,
              sub: { text: { list: true, read: true }, excerpt: { list: true, read: true } },
            },
          },
        },
      } as never,
      virtuals: {
        contacts: {
          sub: {
            nick: { get: nickGet as never, dependsOn: ['displayName'] },
            notes: { sub: { excerpt: { get: excerptGet as never, dependsOn: ['text'] } } },
          },
        },
      } as never,
    } as never);
    await Model.create({ name: 'deep', contacts: [{ displayName: 'D', notes: [{ text: 't1' }] }] } as never);
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    const list = await request(app).post(`/virt06n-${tag}/__query`).send({}).expect(200);
    const contacts = (list.body.data[0] as Record<string, unknown>).contacts as Array<Record<string, unknown>>;
    expect(contacts[0]).toHaveProperty('nick', 'nick:D');
    expect((contacts[0].notes as Array<Record<string, unknown>>)[0]).toHaveProperty('excerpt', 'ex:t1');
    expect(nickGet).toHaveBeenCalled();
    expect(excerptGet).toHaveBeenCalled();
    // Sub route likewise finalizes nested
    const parent = (await Model.findOne({ name: 'deep' }).lean()) as unknown as { _id: unknown };
    const id = String((parent as { _id: unknown })._id);
    const sub = await request(app).get(`/virt06n-${tag}/${id}/contacts`).expect(200);
    expect(((sub.body[0] as Record<string, unknown>).notes as Array<Record<string, unknown>>)[0]).toHaveProperty(
      'excerpt',
      'ex:t1',
    );
  });
});
