import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { guard, defineRequestSchema } from '../../dist/index.mjs';
import { modelFixture, dataFixture, quiet, allTrusted } from '../support/public/arts04-fixture';
import { useMongoTestDatabase } from '../setup';

useMongoTestDatabase();
const selected = { select: ['value', 'hidden', '-_id'] };
const bad = { success: false, code: 'bad_request' };
const noFacts = Object.freeze({});

describe('ARTS-04 actual entry admission', () => {
  it('ENTRY-model basic/advanced/root use distinct grants before validation', async () => {
    const events: string[] = [];
    let initializedRequest: unknown;
    const validate = defineRequestSchema((input) => {
      events.push('validate');
      return { success: true, data: input };
    });
    const f = await modelFixture({
      operationAccess: { read: { default: true, basic: false, advanced: true, root: false } },
      requestSchemas: { advancedRead: validate },
    });
    f.api.setGlobalOptions({
      globalPermissions(req) {
        initializedRequest = req;
        return { reader: true };
      },
    });
    await request(f.app).get(`${f.basePath}/${f.rows[0]._id}`).expect(401);
    const advanced = await request(f.app).post(`${f.basePath}/__query/${f.rows[0]._id}`).send(selected).expect(200);
    expect(advanced.body).toEqual({ value: 'stored-0' });
    const root = await request(f.app)
      .post(f.rootPath)
      .send([{ target: 'model', name: f.Source.modelName, op: 'read', id: String(f.rows[0]._id), args: selected }])
      .expect(200);
    expect(root.body[0]).toMatchObject({ statusCode: 401, result: { code: 'unauthorized' } });
    expect(events).toEqual(['validate']);
    f.router.operationAccess('read.advanced', function (permissions) {
      expect(this).toBe(initializedRequest);
      expect(this.macl.getPermissions().keys).toEqual(permissions.keys);
      events.push('guard');
      return false;
    });
    events.length = 0;
    await request(f.app).post(`${f.basePath}/__query/${f.rows[0]._id}`).send({ select: 7 }).expect(401);
    expect(events).toEqual(['guard']);
  });

  it('ENTRY-data basic/advanced/default policy changes real data verdicts', async () => {
    const f = dataFixture([{ id: 'one', name: 'visible' }], {
      operationAccess: { read: { default: false, basic: true, advanced: false, root: true } },
    });
    expect((await request(f.app).get(`${f.basePath}/one`).expect(200)).body).toMatchObject({ name: 'visible' });
    await request(f.app).post(`${f.basePath}/__query/one`).send({}).expect(401);
    const root = await request(f.app)
      .post(f.rootPath)
      .send([{ target: 'data', name: f.name, op: 'read', id: 'one' }])
      .expect(200);
    expect(root.body[0]).toMatchObject({ statusCode: 200, result: { data: { name: 'visible' } } });
    f.router.operationAccess('read.advanced', undefined);
    await request(f.app).post(`${f.basePath}/__query/one`).send({}).expect(401);
  });

  it('ENTRY-child field rules precede general transport rules but preserve parent row policy', async () => {
    const f = await modelFixture({
      operationAccess: {
        read: true,
        list: { basic: false, advanced: false },
        subs: { children: { list: { default: false, basic: true, advanced: false } } },
      },
    });
    const url = `${f.basePath}/${f.rows[0]._id}/children`;
    const response = await request(f.app).get(url).expect(200);
    expect(response.body[0]).toMatchObject({ label: 'child' });
    expect(response.body[0]).not.toHaveProperty('hidden');
    await request(f.app).post(`${url}/__query`).send({}).expect(401);
    // Like the retained child-route panel, a parent outside the row scope is a 404.
    f.router.setOption('baseFilter.read', () => ({ tenant: 'absent' }));
    await request(f.app).get(url).expect(404);
  });

  it('ENTRY-live setters restore defaults exactly and HEAD follows basic admission', async () => {
    const f = await modelFixture();
    f.api.setDefaultModelOptions({ operationAccess: { list: { default: true, basic: false } } });
    f.router.setOption('operationAccess', undefined);
    await request(f.app).head(f.basePath).expect(401);
    f.router.operationAccess('list.basic', true);
    const old = f.api.getModelOptions(f.Source.modelName);
    await request(f.app).head(f.basePath).expect(200);
    f.router.operationAccess('list.basic', undefined);
    await request(f.app).head(f.basePath).expect(401);
    expect(old.operationAccess).toMatchObject({ list: { basic: true } });
    expect(Object.isFrozen(old)).toBe(true);
  });

  it('ENTRY-custom initialized request retains original receiver and real service output', async () => {
    const f = await modelFixture({ operationAccess: false });
    await f.execute(async (req) => {
      const permissions = req.macl.getPermissions();
      const field = vi.fn(function (p, grants) {
        return p.has('reader') && Object.keys(grants).length === 0;
      });
      f.router.setOption('permissionSchema.value', field);
      expect(
        await req.macl.getService(f.Source.modelName).findById(String(f.rows[0]._id), selected, quiet),
      ).toMatchObject({ success: true, data: { value: 'stored-0' } });
      expect(field).toHaveBeenCalled();
      for (const [index, call] of field.mock.calls.entries()) {
        expect(field.mock.contexts[index]).toBe(req);
        expect(call[0].keys).toEqual(permissions.keys);
        expect(call[1]).toEqual(noFacts);
        expect(Object.isFrozen(call[1])).toBe(true);
      }
      // Acquired services do not imply the generated HTTP initiating-operation gate.
      expect(await req.macl.isAllowed(f.Source.modelName, 'read')).toBe(false);
      expect(
        await req.macl.getPublicService(f.Source.modelName)._read(String(f.rows[0]._id), selected, quiet),
      ).toMatchObject({ success: true, data: { value: 'stored-0' } });
    });
    await request(f.app).get(`${f.basePath}/${f.rows[0]._id}`).expect(401);
  });

  it('ENTRY-excluded all-trusted settings do not lend helper/NEW/child/count/distinct inputs', async () => {
    const hook = (doc: any) => {
      doc.value = 'hook';
      if (doc.label) doc.label = 'hook-child';
      return {};
    };
    const f = await modelFixture({ ...allTrusted, docPermissions: { get: hook } });
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.Source.modelName);
      expect(await svc.pickAllowedFields({ value: 'raw', hidden: 'never' }, 'read')).toEqual({ value: 'raw' });
      const fresh = await svc.new(selected, quiet);
      expect(fresh).toMatchObject({ success: true, data: { value: 'template' } });
      const sub = await svc.listSub(String(f.rows[0]._id), 'children');
      expect(sub).toMatchObject({ success: true, data: [{ label: 'child' }] });
      expect(await svc.count({})).toMatchObject({ success: true, data: 2 });
      expect(await svc.distinct('value', {})).toMatchObject({ success: true, data: ['stored-0', 'stored-1'] });
    });
  });
});

describe('ARTS-04 exported guard with initialized requests', () => {
  it('GUARD-model params/query IDs and missing-ID admission precede model work', async () => {
    const f = await modelFixture({ docPermissions: { read: () => ({ owner: true }) } });
    const find = vi.spyOn(f.Source, 'findOne');
    f.router.router.post(
      '/guard-param/:rowId',
      guard({ modelName: f.Source.modelName, id: { type: 'param', key: 'rowId' }, condition: 'owner' }),
      (_req, res) => res.json({ allowed: true }),
    );
    f.router.router.post(
      '/guard-query',
      guard({ modelName: f.Source.modelName, id: { type: 'query', key: 'rowId' }, condition: 'owner' }),
      (_req, res) => res.json({ allowed: true }),
    );
    await request(f.app).post(`${f.basePath}/guard-query`).expect(400);
    expect(find).not.toHaveBeenCalled();
    await request(f.app).post(`${f.basePath}/guard-param/${f.rows[0]._id}`).expect(200, { allowed: true });
    await request(f.app)
      .post(`${f.basePath}/guard-query`)
      .query({ rowId: String(f.rows[0]._id) })
      .expect(200, { allowed: true });
  });

  it('GUARD-permissions scalar/array/function conditions retain original request this', async () => {
    const f = await modelFixture();
    let initializedRequest: unknown;
    f.router.router.post(
      '/guard-permissions',
      (req, _res, next) => {
        initializedRequest = req;
        next();
      },
      guard('reader'),
      guard(['missing', 'reader']),
      guard(function (p) {
        expect(this).toBe(initializedRequest);
        expect(this.method).toBe('POST');
        expect(this.macl.getPermissions().keys).toEqual(p.keys);
        return p.has('reader');
      }),
      (_req, res) => res.json({ allowed: true }),
    );
    await request(f.app).post(`${f.basePath}/guard-permissions`).expect(200, { allowed: true });
  });
});

describe('ARTS-04 public control lanes', () => {
  it('CONTROL-backend options/helper/default/related/subdocument reject fabricated authority', async () => {
    const f = await modelFixture(),
      queries = vi.spyOn(f.Source, 'findOne');
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.Source.modelName);
      expect(
        await svc.findOne({}, selected, { ...quiet, authorization: { executionContext: {} } } as never),
      ).toMatchObject(bad);
      await expect(
        svc.pickAllowedFields({ value: 'raw' }, 'read', { authorization: { rows: { mode: 'unrestricted' } } } as never),
      ).rejects.toMatchObject({ result: { code: 'bad_request' } });
      expect(
        await svc.findOne(
          {},
          { ...selected, populate: [{ path: 'ref', readAuthorizationMode: 'trusted' }] } as never,
          quiet,
        ),
      ).toMatchObject(bad);
      expect(
        await svc.listSub(String(f.rows[0]._id), 'children', {
          authorization: { child: { inputFields: { mode: 'request' } } },
        } as never),
      ).toMatchObject(bad);
      expect(queries).not.toHaveBeenCalled();
      const before = f.api.getModelOptions(f.Source.modelName);
      expect(() => f.router.setOption('defaults', { findOneOptions: { preparedQuery: {} } } as never)).toThrowError(
        expect.objectContaining({
          statusCode: 400,
          result: expect.objectContaining(bad),
        }),
      );
      expect(f.api.getModelOptions(f.Source.modelName)).toEqual(before);
    });
  });

  it('CONTROL-http malformed envelope rejects before consumer hooks or writes', async () => {
    const prepare = vi.fn((data) => data),
      f = await modelFixture({ prepare: { create: prepare } });
    const create = vi.spyOn(f.Source, 'create');
    await request(f.app)
      .post(`${f.basePath}/__mutation`)
      .send({
        data: { value: 'never' },
        options: { authorization: { outputFields: { mode: 'grant', paths: ['hidden'] } } },
      })
      .expect(400);
    expect(prepare).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('CONTROL-root whole sibling preflight rejects contaminated envelopes without writes', async () => {
    const prepare = vi.fn((data) => data),
      f = await modelFixture({ prepare: { create: prepare } });
    await request(f.app)
      .post(f.rootPath)
      .send([
        { target: 'model', name: f.Source.modelName, op: 'create', data: { value: 'sibling-never' } },
        {
          target: 'model',
          name: f.Source.modelName,
          op: 'read',
          id: String(f.rows[0]._id),
          options: { preparedFilter: {} },
        },
      ])
      .expect(400);
    expect(prepare).not.toHaveBeenCalled();
    expect(await f.Source.countDocuments({ value: 'sibling-never' })).toBe(0);
  });

  it('CONTROL-business same-spelled data is inert; terminal false differs from malformed controls', async () => {
    const f = await modelFixture({ baseFilter: { read: () => false } }),
      queries = vi.spyOn(f.Source, 'findOne');
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.Source.modelName);
      expect(await svc.findOne({}, selected, quiet)).toMatchObject({ success: false, code: 'forbidden' });
      expect(await svc.findOne({}, selected, { ...quiet, readAuthorizationMode: undefined } as never)).toMatchObject(
        bad,
      );
      expect(queries).not.toHaveBeenCalled();
      const result = await svc.create(
        { value: 'business', readAuthorizationMode: 'invoice' },
        { select: ['value', 'readAuthorizationMode', '-_id'] },
        quiet,
      );
      expect(result).toMatchObject({ success: true, data: [{ value: 'business', readAuthorizationMode: 'invoice' }] });
    });
    expect(await f.Source.findOne({ value: 'business' }).lean()).toMatchObject({ readAuthorizationMode: 'invoice' });
  });
});

describe('ARTS-04 atomic public configuration', () => {
  it('ADMISSION-retired whole/dotted/inherited/nonenumerable operation keys never publish siblings', async () => {
    const f = await modelFixture({ operationAccess: { read: { basic: false } }, listHardLimit: 8 });
    const before = f.api.getModelOptions(f.Source.modelName);
    const inherited = Object.assign(Object.create({ advancedRead: undefined }), { read: true });
    const hidden = Object.defineProperty({ read: true }, 'basicRead', { value: false });
    for (const operationAccess of [{ basicRead: false }, inherited, hidden]) {
      expect(() => f.router.setOptions({ listHardLimit: 999, operationAccess } as never)).toThrow(TypeError);
      expect(f.api.getModelOptions(f.Source.modelName)).toEqual(before);
    }
    expect(() => f.router.setOption('operationAccess.advancedRead' as never, undefined)).toThrow(TypeError);
    expect(f.api.getModelOptions(f.Source.modelName)).toEqual(before);
    await request(f.app).get(`${f.basePath}/${f.rows[0]._id}`).expect(401);
  });

  it('ADMISSION-invalid mode/dependency/populate/virtual config is atomic', async () => {
    const f = await modelFixture(),
      before = f.api.getModelOptions(f.Source.modelName);
    for (const change of [
      { readAuthorizationMode: 'TRUSTED' },
      { docPermissions: { read: { get: () => ({}), dependsOn: ['__proto__'] } } },
    ]) {
      expect(() => f.router.setOptions({ listHardLimit: 999, ...change } as never)).toThrow(TypeError);
      expect(f.api.getModelOptions(f.Source.modelName)).toEqual(before);
    }
    expect(() => f.router.setOptions({ listHardLimit: 999, virtuals: { value: { get: () => 'collision' } } })).toThrow(
      /Virtual value: collides with a stored path/,
    );
    expect(f.api.getModelOptions(f.Source.modelName)).toEqual(before);
    // Populate flags deliberately coerce non-false values to strict. Invalid GLOBAL
    // placement, not a made-up boolean-enum restriction, is the supported rejection.
    const globals = f.api.getGlobalOptions();
    expect(() => f.api.setGlobalOptions({ requireOperationAccessForPopulateQueries: false } as never)).toThrow(
      TypeError,
    );
    expect(f.api.getGlobalOptions()).toEqual(globals);
    const registry = f.api.runtime.getModelInstance(f.Source.modelName);
    expect(() => f.api.createRouter(f.Source, { readAuthorizationMode: false } as never)).toThrow(TypeError);
    expect(f.api.runtime.getModelInstance(f.Source.modelName)).toBe(registry);
    expect(f.api.getModelOptions(f.Source.modelName)).toEqual(before);
  });

  it('ADMISSION-restoration preserves business fields and live operation defaults', async () => {
    const f = await modelFixture();
    f.router.setOptions({
      operationAccess: { read: { default: true, basic: false } },
      permissionSchema: { value: true, readAuthorizationMode: true },
    });
    await request(f.app).get(`${f.basePath}/${f.rows[0]._id}`).expect(401);
    f.router.operationAccess('read.basic', undefined);
    await request(f.app).get(`${f.basePath}/${f.rows[0]._id}`).expect(200);
    expect(f.api.getModelOptions(f.Source.modelName).operationAccess).toMatchObject({
      read: { basic: undefined, default: true },
    });
    await request(f.app)
      .patch(`${f.basePath}/${f.rows[0]._id}`)
      .send({ readAuthorizationMode: 'ordinary' })
      .expect(401);
    await f.execute(async (req) => {
      expect(
        await req.macl
          .getService(f.Source.modelName)
          .updateById(
            String(f.rows[0]._id),
            { readAuthorizationMode: 'ordinary' },
            { select: ['readAuthorizationMode', '-_id'] },
            quiet,
          ),
      ).toMatchObject({ success: true, data: { readAuthorizationMode: 'ordinary' } });
    });
  });
});

describe('ARTS-04 public document facts', () => {
  it('FACTS-normalized frozen booleans and returned metadata never become future authority', async () => {
    for (const mode of ['isolated', 'trusted'] as const) {
      const facts = { owner: true, suspended: false };
      const f = await modelFixture({
        readAuthorizationMode: mode,
        stripPermissionsField: false,
        docPermissions: {
          read(doc: any) {
            doc.value = 'output-hook';
            return facts;
          },
        },
      });
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.Source.modelName);
        const result = await svc.findById(
          String(f.rows[0]._id),
          { select: ['value', 'conditional', '-_id'] },
          { ...quiet, includePermissions: true },
        );
        expect(result).toMatchObject({
          success: true,
          data: { value: mode === 'trusted' ? 'output-hook' : 'stored-0', conditional: 'conditional-0' },
          context: { docPermissions: facts },
        });
        if (!result.success) throw new Error(result.code);
        expect(Object.isFrozen(result.context.docPermissions)).toBe(true);
        expect(result.context.docPermissions).not.toBe(facts);
        facts.owner = false;
        expect(result.context.docPermissions.owner).toBe(true);
        const row = result.data as any;
        row._permissions.owner = true;
        expect(await svc.pickAllowedFields(row, 'read')).not.toHaveProperty('conditional');
        expect(await svc.findById(String(f.rows[0]._id), { select: ['conditional', '-_id'] }, quiet)).toMatchObject({
          success: true,
          data: {},
        });
      });
    }
  });

  it('FACTS-rich fulfilled nonboolean map fails the whole public operation', async () => {
    const f = await modelFixture({
      docPermissions: { read: (() => ({ owner: true, rich: { secret: 'sentinel-rich' } })) as never },
    });
    await f.execute(async (req) => {
      const result = await req.macl.getService(f.Source.modelName).findById(String(f.rows[0]._id), selected, quiet);
      expect(result).toMatchObject(bad);
      expect(result).not.toHaveProperty('data');
      expect(JSON.stringify(result)).not.toContain('sentinel-rich');
    });
  });

  it('FACTS-thrown/rejected hooks yield empty frozen facts and structural logs without sentinel leaks', async () => {
    const f = await modelFixture(),
      warnings = vi.fn();
    f.api.setGlobalOptions({ logger: { warn: warnings } });
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.Source.modelName);
      for (const hook of [
        () => {
          throw new Error('sentinel-private');
        },
        () => Promise.reject(new Error('sentinel-private')),
      ]) {
        f.router.setOption('docPermissions.read', hook);
        const result = await svc.findById(String(f.rows[0]._id), { select: ['value', 'conditional', '-_id'] }, quiet);
        expect(result).toMatchObject({ success: true, data: { value: 'stored-0' }, context: { docPermissions: {} } });
        if (!result.success) throw new Error(result.code);
        expect(result.data).not.toHaveProperty('conditional');
        expect(Object.isFrozen(result.context.docPermissions)).toBe(true);
        expect(JSON.stringify(result)).not.toContain('sentinel-private');
      }
    });
    expect(warnings).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warnings.mock.calls)).not.toContain('sentinel-private');
  });
});

describe('ARTS-04 whole-value DISTINCT', () => {
  it('DISTINCT-restricted composite denies before application I/O in direct and root paths', async () => {
    const f = await modelFixture(),
      distinct = vi.spyOn(f.Source, 'distinct');
    await f.execute(async (req) => {
      expect(await req.macl.getService(f.Source.modelName).distinct('profile', {})).toMatchObject({
        success: false,
        code: 'forbidden',
      });
    });
    const response = await request(f.app)
      .post(f.rootPath)
      .send([{ target: 'model', name: f.Source.modelName, op: 'distinct', field: 'profile' }])
      .expect(200);
    expect(response.body[0]).toMatchObject({ statusCode: 403 });
    expect(distinct).not.toHaveBeenCalled();
  });

  it('DISTINCT-complete composite and explicit scalar child return literal values', async () => {
    const f = await modelFixture({
      permissionSchema: { profile: { read: true, sub: { public: true, secret: true } }, 'profile.public': true },
    });
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.Source.modelName);
      expect(await svc.distinct('profile', {})).toMatchObject({
        success: true,
        data: [{ public: 'public', secret: 'profile-denied' }],
      });
      expect(await svc.distinct('profile.public', {})).toMatchObject({ success: true, data: ['public'] });
    });
    const response = await request(f.app)
      .post(f.rootPath)
      .send([
        { target: 'model', name: f.Source.modelName, op: 'distinct', field: 'profile' },
        { target: 'model', name: f.Source.modelName, op: 'distinct', field: 'profile.public' },
      ])
      .expect(200);
    expect(response.body[0]).toMatchObject({
      result: { success: true, data: [{ public: 'public', secret: 'profile-denied' }] },
    });
    expect(response.body[1]).toMatchObject({ result: { success: true, data: ['public'] } });
  });

  it('DISTINCT-dynamic/metadata/Mixed uncertainty never invokes application distinct', async () => {
    const f = await modelFixture({
      permissionSchema: {
        value: () => true,
        payload: true,
        profile: { read: true, sub: { public: true, secret: true } },
      },
      documentPermissionField: 'profile.secret',
    });
    const distinct = vi.spyOn(f.Source, 'distinct');
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.Source.modelName);
      for (const field of ['value', 'payload', 'profile']) {
        const result = await svc.distinct(field, {});
        expect(result).toMatchObject({ success: false, code: 'forbidden' });
        expect(result).not.toHaveProperty('data');
        expect(JSON.stringify(result)).toContain(`Distinct field not allowed: ${field}`);
      }
    });
    const response = await request(f.app)
      .post(f.rootPath)
      .send(
        ['value', 'payload', 'profile'].map((field) => ({
          target: 'model',
          name: f.Source.modelName,
          op: 'distinct',
          field,
        })),
      )
      .expect(200);
    for (const item of response.body) expect(item).toMatchObject({ statusCode: 403, result: { code: 'forbidden' } });
    expect(distinct).not.toHaveBeenCalled();
  });
});
