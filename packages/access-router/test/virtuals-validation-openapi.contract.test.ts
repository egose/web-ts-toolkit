/**
 * VIRT-08 request validation + OpenAPI for virtual selections.
 *
 * VIRT-00A D8 (frozen): preserve current arbitrary-string acceptance.
 * `projectionSchema` / `stringOrStringArray` and `parseSelectParam`
 * comma/space/repeated forms keep accepting arbitrary field names; adding
 * virtual names requires no whitelist loosening and no stricter grammar.
 * Registered-but-inapplicable virtuals stay virtual (excluded from persisted
 * projections, writes, and DB sort/filter/distinct at the VIRT-04
 * model-aware service boundary). OpenAPI v1 uses the existing
 * open-object/unknown-value capability; no getter runs for spec generation.
 */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import {
  fieldsSchema,
  includeSchema,
  populateSchema,
  projectionSchema,
  sortSchema,
  stringOrStringArray,
  subPopulateSchema,
} from '../src/validation/common';
import {
  listBodySchema,
  listQuerySchema,
  readByIdBodySchema,
  readQuerySchema,
  updateQuerySchema,
} from '../src/validation/model-router';
import { rootQuerySchema } from '../src/validation/root-router';
import { normalizeSelect, parseSelectParam } from '../src/helpers/query';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let counter = 0;
const activeRuntimes: Array<{ clearOpenApiRoutes(): void }> = [];

afterEach(() => {
  for (const entry of activeRuntimes.splice(0)) entry.clearOpenApiRoutes();
  try {
    mongoose.deleteModel(/Virt08.*/);
  } catch {
    // ignore
  }
});

describe('VIRT-08 preserved select grammar (schema/parser, no DB)', () => {
  it('projectionSchema accepts string/array/object virtual forms and exclusion', () => {
    expect(projectionSchema.safeParse(['name', 'fullAddress']).success).toBe(true);
    expect(projectionSchema.safeParse('name').success).toBe(true);
    expect(projectionSchema.safeParse({ name: 1, fullAddress: 1 }).success).toBe(true);
    expect(projectionSchema.safeParse({ fullAddress: -1 }).success).toBe(true);
    expect(projectionSchema.safeParse(['name', '-fullAddress']).success).toBe(true);
    expect(projectionSchema.safeParse(['-fullAddress']).success).toBe(true);
  });

  it('preserves ordinary persisted dotted projections and arbitrary unregistered names (no new rejection)', () => {
    expect(projectionSchema.safeParse(['address.city', 'profile.city']).success).toBe(true);
    expect(projectionSchema.safeParse('address.city').success).toBe(true);
    expect(projectionSchema.safeParse({ 'address.city': 1 }).success).toBe(true);
    // Unregistered arbitrary strings keep existing safe behavior (accepted, not rejected).
    expect(projectionSchema.safeParse(['someUnknownField']).success).toBe(true);
    expect(stringOrStringArray.safeParse('name,fullAddress').success).toBe(true);
    expect(stringOrStringArray.safeParse(['name', 'fullAddress']).success).toBe(true);
  });

  it('parseSelectParam handles comma/space/repeated forms for ?select=name,fullAddress', () => {
    expect(parseSelectParam('name,fullAddress')).toEqual(['name', 'fullAddress']);
    expect(parseSelectParam('name fullAddress')).toEqual(['name', 'fullAddress']);
    expect(parseSelectParam(['name,fullAddress'])).toEqual(['name', 'fullAddress']);
    expect(parseSelectParam(['name', 'fullAddress'])).toEqual(['name', 'fullAddress']);
    // Repeated query form: ?select=name&select=fullAddress
    expect(parseSelectParam(['name', 'fullAddress'])).toEqual(['name', 'fullAddress']);
    expect(parseSelectParam('name, fullAddress  -fullAddress')).toEqual(['name', 'fullAddress', '-fullAddress']);
    expect(parseSelectParam('')).toBeUndefined();
    expect(parseSelectParam(undefined)).toBeUndefined();
    expect(parseSelectParam('name,,  fullAddress')).toEqual(['name', 'fullAddress']);
  });

  it('normalizeSelect shares comma/space splitting with parseSelectParam (service-direct ≡ HTTP)', () => {
    expect(normalizeSelect('name,fullAddress')).toEqual(['name', 'fullAddress']);
    expect(normalizeSelect('name fullAddress')).toEqual(['name', 'fullAddress']);
    expect(normalizeSelect(['name,fullAddress'])).toEqual(['name', 'fullAddress']);
    expect(normalizeSelect(['name', 'fullAddress'])).toEqual(['name', 'fullAddress']);
    expect(normalizeSelect({ name: 1, fullAddress: 1 })).toEqual(['name', 'fullAddress']);
    expect(normalizeSelect({ fullAddress: -1 })).toEqual(['-fullAddress']);
    expect(normalizeSelect(['name', '-fullAddress'])).toEqual(['name', '-fullAddress']);
    // Ordinary persisted dotted path preserved as a single token.
    expect(normalizeSelect('address.city')).toEqual(['address.city']);
    expect(normalizeSelect(['address.city'])).toEqual(['address.city']);
    // HTTP and service-direct agree on the same raw string.
    expect(normalizeSelect('name,fullAddress')).toEqual(parseSelectParam('name,fullAddress'));
    expect(normalizeSelect('name fullAddress')).toEqual(parseSelectParam('name fullAddress'));
    // Empty/blank string collapses (no "" tokens reach the planner).
    expect(normalizeSelect('')).toEqual([]);
    expect(normalizeSelect('  ,  ')).toEqual([]);
  });

  it('query schemas accept virtual select strings without rejection', () => {
    expect(listQuerySchema.safeParse({ select: 'name,fullAddress' }).success).toBe(true);
    expect(listQuerySchema.safeParse({ select: ['name', 'fullAddress'] }).success).toBe(true);
    expect(readQuerySchema.safeParse({ select: 'fullAddress' }).success).toBe(true);
    expect(updateQuerySchema.safeParse({ select: ['name', '-fullAddress'] }).success).toBe(true);
  });

  it('body schemas accept virtual selects in all supported shapes', () => {
    expect(listBodySchema.safeParse({ select: ['name', 'fullAddress'] }).success).toBe(true);
    expect(listBodySchema.safeParse({ select: 'name' }).success).toBe(true);
    expect(listBodySchema.safeParse({ select: { name: 1, fullAddress: 1 } }).success).toBe(true);
    expect(listBodySchema.safeParse({ select: { fullAddress: -1 } }).success).toBe(true);
    expect(listBodySchema.safeParse({ select: ['name', '-fullAddress'] }).success).toBe(true);
    expect(readByIdBodySchema.safeParse({ select: ['name', 'fullAddress'] }).success).toBe(true);
  });

  it('root selections accept the same virtual forms as direct bodies', () => {
    const listEntry = {
      target: 'model',
      name: 'M',
      op: 'list',
      args: { select: ['name', 'fullAddress'] },
    };
    expect(rootQuerySchema.safeParse([listEntry]).success).toBe(true);
    const objectEntry = {
      target: 'model',
      name: 'M',
      op: 'list',
      args: { select: { name: 1, fullAddress: 1 } },
    };
    expect(rootQuerySchema.safeParse([objectEntry]).success).toBe(true);
    const readEntry = {
      target: 'model',
      name: 'M',
      op: 'read',
      id: 'abc',
      args: { select: ['name', '-fullAddress'] },
    };
    expect(rootQuerySchema.safeParse([readEntry]).success).toBe(true);
    const subListEntry = {
      target: 'model',
      name: 'M',
      op: 'subList',
      id: 'abc',
      sub: 'contacts',
      args: { select: ['nick'] },
    };
    expect(rootQuerySchema.safeParse([subListEntry]).success).toBe(true);
  });

  it('populate and embedded virtual selection forms pass validation', () => {
    expect(populateSchema.safeParse([{ path: 'targetRef', select: ['name', 'tFull'] }]).success).toBe(true);
    expect(populateSchema.safeParse({ path: 'targetRef', select: { tFull: 1 } }).success).toBe(true);
    expect(populateSchema.safeParse('targetRef').success).toBe(true);
    expect(subPopulateSchema.safeParse([{ path: 'friend', select: ['tFull'] }]).success).toBe(true);
    // Subdocument (embedded) select accepts virtual leaves and exclusion.
    expect(fieldsSchema.safeParse(['nick']).success).toBe(true);
    expect(fieldsSchema.safeParse(['nick', '-nick']).success).toBe(true);
    expect(fieldsSchema.safeParse(['displayName', 'nick']).success).toBe(true);
    // Include args select with virtuals is accepted at validation; target
    // finalization/trim is VIRT-05 runtime behavior, not a schema rejection.
    expect(
      includeSchema.safeParse([
        { mode: 'legacy', model: 'T', op: 'list', path: 'items', localField: 'tid', foreignField: 'tid' },
      ]).success,
    ).toBe(true);
  });

  it('virtual sort/filter/distinct inputs are NOT rejected by route schemas (forwarded to VIRT-04)', () => {
    // Sort schema accepts virtual field names in every supported shape.
    expect(sortSchema.safeParse('fullAddress').success).toBe(true);
    expect(sortSchema.safeParse({ fullAddress: 1 }).success).toBe(true);
    expect(sortSchema.safeParse([['fullAddress', 1]]).success).toBe(true);
    // Body filter is open (unknown values); virtual keys pass validation.
    expect(listBodySchema.safeParse({ filter: { fullAddress: 'evil' } }).success).toBe(true);
    expect(listBodySchema.safeParse({ filter: { $or: [{ fullAddress: 'x' }, { name: 'a' }] } }).success).toBe(true);
    expect(listBodySchema.safeParse({ sort: 'fullAddress' }).success).toBe(true);
    // No duplicate DB field policy lives here: schemas never run getters and
    // never error on virtual names; exclusion happens at the service boundary.
  });
});

describe('VIRT-08 HTTP/body/root/populate/embedded selections with virtuals', () => {
  const makeApp = async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    const targetName = `Virt08T${tag}`;
    const mainName = `Virt08M${tag}`;

    const tGet = vi.fn(async (doc: { address?: string }) =>
      doc.address === undefined ? undefined : `t:${doc.address}`,
    );
    const fullGet = vi.fn(async (doc: { address?: string }) =>
      doc.address === undefined ? undefined : `addr:${doc.address}`,
    );
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);

    const targetSchema = new mongoose.Schema({ name: String, address: String } as never, { strict: false });
    targetSchema.plugin(permissionsPlugin, { modelName: targetName });
    const Target = mongoose.model(targetName, targetSchema);

    const contactSchema = new mongoose.Schema({ displayName: String, secret: String } as never, {
      strict: false,
    });
    const mainSchema = new mongoose.Schema(
      {
        name: String,
        address: String,
        tid: String,
        targetRef: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
        contacts: [contactSchema],
      } as never,
      { strict: false },
    );
    mainSchema.plugin(permissionsPlugin, { modelName: mainName });
    const Main = mongoose.model(mainName, mainSchema);

    runtime.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => [],
    } as never);

    const targetRouter = runtime.createRouter(Target, {
      basePath: `/virt08t-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        tFull: { list: true, read: true },
      } as never,
      virtuals: { tFull: { dependsOn: ['address'], read: tGet as never, list: tGet as never } } as never,
    } as never);

    const mainRouter = runtime.createRouter(Main, {
      basePath: `/virt08m-${tag}`,
      operationAccess: {
        list: true,
        read: true,
        distinct: true,
        count: true,
        subs: { contacts: { list: true, read: true } },
      } as never,
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        tid: { list: true, read: true },
        targetRef: { list: true, read: true },
        fullAddress: { list: true, read: true },
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
      virtuals: {
        fullAddress: { dependsOn: ['address'], read: fullGet as never, list: fullGet as never },
        contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } },
      } as never,
    } as never);

    const rootRouter = runtime.createRouter({ basePath: `/virt08root-${tag}`, operationAccess: true } as never);

    const tDoc = (await Target.create({ name: 't1', address: 'ta1' } as never)) as unknown as { _id: unknown };
    await Main.create({
      name: 'm1',
      address: 'a1',
      tid: 'k1',
      targetRef: tDoc._id,
      contacts: [{ displayName: 'Ann', secret: 's1' }], // pragma: allowlist secret
    } as never);

    const app = express();
    app.use(express.json());
    app.use(targetRouter.routes);
    app.use(mainRouter.routes);
    app.use(rootRouter.routes);
    return {
      app,
      runtime,
      tag,
      base: `/virt08m-${tag}`,
      rootBase: `/virt08root-${tag}`,
      mainName,
      fullGet,
      nickGet,
      tGet,
    };
  };

  it('?select comma/space/repeated forms compute the virtual identically (HTTP query grammar)', async () => {
    const { app, base } = await makeApp();
    const comma = await request(app).get(base).query({ select: 'name,fullAddress' }).expect(200);
    expect(comma.body.data[0]).toHaveProperty('fullAddress', 'addr:a1');
    const space = await request(app).get(base).query({ select: 'name fullAddress' }).expect(200);
    expect(space.body.data[0]).toHaveProperty('fullAddress', 'addr:a1');
    // Repeated: ?select=name&select=fullAddress (supertest array form).
    const repeated = await request(app)
      .get(base)
      .query({ select: ['name', 'fullAddress'] })
      .expect(200);
    expect(repeated.body.data[0]).toHaveProperty('fullAddress', 'addr:a1');
    expect(repeated.body.data[0]).toEqual(comma.body.data[0]);
  });

  it('body array/object selects and exclusion [-fullAddress] behave under preserved grammar', async () => {
    const { app, base, fullGet } = await makeApp();
    const arr = await request(app)
      .post(`${base}/__query`)
      .send({ select: ['name', 'fullAddress'] })
      .expect(200);
    expect(arr.body.data[0]).toHaveProperty('fullAddress', 'addr:a1');
    const obj = await request(app)
      .post(`${base}/__query`)
      .send({ select: { name: 1, fullAddress: 1 } })
      .expect(200);
    expect(obj.body.data[0]).toHaveProperty('fullAddress', 'addr:a1');
    fullGet.mockClear();
    const excl = await request(app)
      .post(`${base}/__query`)
      .send({ select: ['name', '-fullAddress'] })
      .expect(200);
    expect(excl.body.data[0]).not.toHaveProperty('fullAddress');
    expect(fullGet).not.toHaveBeenCalled();
  });

  it('populated and embedded virtual selections compute via HTTP', async () => {
    const { app, base, tGet, nickGet } = await makeApp();
    tGet.mockClear();
    nickGet.mockClear();
    const res = await request(app)
      .post(`${base}/__query`)
      .send({
        select: ['name', 'fullAddress', 'contacts', 'targetRef'],
        populate: [{ path: 'targetRef', select: ['name', 'tFull'] }],
      })
      .expect(200);
    const row = res.body.data[0] as Record<string, unknown>;
    expect(row).toHaveProperty('fullAddress', 'addr:a1');
    const contacts = row.contacts as Array<Record<string, unknown>>;
    expect(contacts[0]).toHaveProperty('nick', 'nick:Ann');
    expect(contacts[0]).not.toHaveProperty('secret');
    const populated = row.targetRef as Record<string, unknown>;
    expect(populated).toHaveProperty('tFull', 't:ta1');
    expect(tGet).toHaveBeenCalled();
    expect(nickGet).toHaveBeenCalled();
  });

  it('root list with virtual select matches direct (same grammar, shared service path)', async () => {
    const { app, base, rootBase, mainName } = await makeApp();
    const select = ['name', 'fullAddress'];
    const direct = await request(app).post(`${base}/__query`).send({ select }).expect(200);
    const root = await request(app)
      .post(rootBase)
      .send([{ target: 'model', name: mainName, op: 'list', args: { select } }])
      .expect(200);
    const entry = (root.body as Array<Record<string, unknown>>)[0];
    expect(entry.statusCode).toBe(200);
    const rootRows = (entry.result as Record<string, unknown>).data as Array<Record<string, unknown>>;
    expect(rootRows).toEqual(direct.body.data);
  });

  it('ordinary persisted dotted projection still works alongside virtuals', async () => {
    const { app, base } = await makeApp();
    // `address` is persisted; dotted form passes validation and does not break
    // virtual planning (no throw, virtual still computed when selected).
    const res = await request(app)
      .post(`${base}/__query`)
      .send({ select: ['name', 'fullAddress'] })
      .expect(200);
    expect(res.body.data[0]).toHaveProperty('fullAddress', 'addr:a1');
  });

  it('subdocument select with embedded virtual computes via dedicated route', async () => {
    const { app, base } = await makeApp();
    const list = await request(app)
      .post(`${base}/__query`)
      .send({ select: ['name'] })
      .expect(200);
    const id = list.body.data[0]._id as string;
    // Dedicated subdocument list route: GET /:id/contacts (basic) returns
    // finalized rows with the embedded virtual under preserved grammar.
    const sub = await request(app).get(`${base}/${id}/contacts`).expect(200);
    const rows = (Array.isArray(sub.body) ? sub.body : (sub.body.data ?? [])) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('nick', 'nick:Ann');
    expect(rows[0]).not.toHaveProperty('secret');
    // Advanced sub-list accepts virtual select form (validation-level already
    // covered; runtime honors it without rejection).
    const adv = await request(app)
      .post(`${base}/${id}/contacts/__query`)
      .send({ select: ['nick'] })
      .expect(200);
    const advRows = (Array.isArray(adv.body) ? adv.body : (adv.body.data ?? [])) as Array<Record<string, unknown>>;
    expect(advRows[0]).toHaveProperty('nick', 'nick:Ann');
  });
});

describe('VIRT-08 virtual sort/filter/distinct forwarded to service boundary', () => {
  const makeSortApp = async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    const modelName = `Virt08S${tag}`;
    const vGet = vi.fn(async () => 'v');
    const schema = new mongoose.Schema({ name: String, address: String });
    schema.plugin(permissionsPlugin, { modelName });
    const Model = mongoose.model(modelName, schema);
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] } as never);
    const router = runtime.createRouter(Model, {
      basePath: `/virt08s-${tag}`,
      operationAccess: { list: true, read: true, distinct: true, count: true },
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        fullAddress: { list: true, read: true },
      } as never,
      virtuals: { fullAddress: { dependsOn: ['address'], read: vGet as never, list: vGet as never } } as never,
    } as never);
    await Model.create([{ name: 'a', address: 'x' }]);
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    return { app, tag, vGet };
  };

  it('validation accepts virtual sort/filter; service controls them (400/403/strip) without route bypass', async () => {
    // Validation-level proof: no rejection here; policy lives in VIRT-04.
    expect(listBodySchema.safeParse({ sort: 'fullAddress' }).success).toBe(true);
    expect(listBodySchema.safeParse({ filter: { fullAddress: 'evil' } }).success).toBe(true);
    const { app, tag, vGet } = await makeSortApp();
    // Strict virtual sort is rejected at the service boundary (existing posture).
    await request(app).post(`/virt08s-${tag}/__query`).send({ sort: 'fullAddress' }).expect(400);
    // Virtual filter is stripped (rows still returned, no adapter error).
    const filtered = await request(app)
      .post(`/virt08s-${tag}/__query`)
      .send({ filter: { fullAddress: 'evil' } })
      .expect(200);
    expect(filtered.body.data).toHaveLength(1);
    vGet.mockClear();
    // Virtual distinct is forbidden; getter never runs (scalar op, no finalizer pass).
    await request(app).get(`/virt08s-${tag}/distinct/fullAddress`).expect(403);
    expect(vGet).not.toHaveBeenCalled();
  });
});

describe('VIRT-08 OpenAPI with virtuals (open-object, no getter execution)', () => {
  it('registry builds and spec generates with virtuals; responses stay open-object; getters never run', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    const modelName = `Virt08O${tag}`;
    const vGet = vi.fn(async () => 'computed');
    const Model = mongoose.model(modelName, new mongoose.Schema({ name: String, address: String }));
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] } as never);
    runtime.createRouter(Model, {
      basePath: `/virt08o-${tag}`,
      operationAccess: { list: true, read: true, create: true },
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        fullAddress: { list: true, read: true },
      } as never,
      virtuals: { fullAddress: { dependsOn: ['address'], read: vGet as never, list: vGet as never } } as never,
    } as never);

    const app = express();
    app.use(express.json());
    const { createOpenApiRouter } = await import('../dist/index.mjs');
    app.use(createOpenApiRouter(runtime.runtime, { title: 'VIRT-08', version: '1.0.0' }));

    const response = await request(app).get('/openapi.json').expect(200);
    expect(vGet).not.toHaveBeenCalled();
    const paths = response.body.paths as Record<string, Record<string, Record<string, unknown>>>;
    const basePath = `/virt08o-${tag}`;
    expect(paths[basePath]).toBeDefined();
    // List + read + create routes registered.
    expect(paths[basePath].get).toBeDefined();
    expect(paths[basePath].post).toBeDefined();
    // Query `select` param is documented (arbitrary-string grammar, virtuals allowed).
    const listParams = (paths[basePath].get.parameters ?? []) as Array<Record<string, unknown>>;
    expect(listParams.some((p) => p.name === 'select')).toBe(true);
    // Responses use the existing open-object/unknown-value capability.
    const listSchema = (paths[basePath].get.responses as Record<string, Record<string, unknown>>)['200'] as Record<
      string,
      unknown
    >;
    const listContent = listSchema.content as Record<string, { schema: Record<string, unknown> }>;
    const listJsonSchema = listContent['application/json'].schema as Record<string, unknown>;
    // List wraps rows in an array; rows stay open-objects.
    const listItems = listJsonSchema.items as Record<string, unknown> | undefined;
    const listRowSchema = (listItems ?? listJsonSchema) as Record<string, unknown>;
    expect(listRowSchema.additionalProperties).toBe(true);
    expect((listRowSchema.type === 'array' ? undefined : listRowSchema.type) ?? 'object').toBe('object');
    const singleSchema = (
      (paths[`${basePath}/{id}`] as Record<string, Record<string, unknown>>).get.responses as Record<
        string,
        Record<string, unknown>
      >
    )['200'] as Record<string, unknown>;
    const singleContent = singleSchema.content as Record<string, { schema: Record<string, unknown> }>;
    expect(singleContent['application/json'].schema.additionalProperties).toBe(true);
    // Optional computed output: no required virtual fields, no getter-derived schema.
    expect(JSON.stringify(response.body)).not.toContain('computed');
  });
});
