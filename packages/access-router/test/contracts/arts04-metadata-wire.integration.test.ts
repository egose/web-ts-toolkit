import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { modelFixture, quiet } from '../support/public/arts04-fixture';
import { useMongoTestDatabase } from '../setup';

useMongoTestDatabase();
const args = { select: ['value', 'conditional', 'hidden', '_id'], sort: '_id' };
const metadata = { ...quiet, includePermissions: true, includeFieldPermissions: true };

describe('ARTS-04 public metadata values and alignment', () => {
  it.each(['isolated', 'trusted'] as const)(
    'METADATA-%s single/list/write aliases and postures do not grant authority',
    async (mode) => {
      const hook = (doc: any) => ({ owner: doc.owner === true, hiddenGrant: true });
      const f = await modelFixture({
        readAuthorizationMode: mode,
        listAuthorizationMode: mode,
        createAuthorizationMode: mode,
        stripPermissionsField: false,
        disableFieldPermissions: false,
        documentPermissionField: 'meta.permissions',
        exposedDocPermissionKeys: ['owner'],
        docPermissions: {
          read: { dependsOn: ['owner'], get: hook },
          list: { dependsOn: ['owner'], get: hook },
          create: hook,
        },
      });
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.Source.modelName);
        const list = await svc.find({}, args, {
          ...metadata,
          authorization: { outputFields: { mode: 'grant', paths: ['conditional'] } },
        });
        expect(list.success).toBe(true);
        if (!list.success) throw new Error(list.code);
        expect(list.data).toHaveLength(2);
        expect(list.contexts).toHaveLength(2);
        for (const [index, raw] of list.data.entries()) {
          const row = raw as any,
            context = list.contexts[index];
          expect(String(row._id)).toBe(String(f.rows[index]._id));
          expect(row.value).toBe(`stored-${index}`);
          expect(row.conditional).toBe(`conditional-${index}`);
          expect(row).not.toHaveProperty('hidden');
          expect(row).not.toHaveProperty('_permissions');
          expect(row.meta.permissions.owner).toBe(index === 0);
          expect(row.meta.permissions).not.toHaveProperty('hiddenGrant');
          expect(row.meta.permissions._view.value).toBe(true);
          expect(row.meta.permissions._edit.value).toBe(true);
          expect(row.meta.permissions._view).not.toHaveProperty('hidden');
          if (index) expect(row.meta.permissions._view).not.toHaveProperty('conditional');
          expect(context.docPermissions).toEqual({ owner: index === 0, hiddenGrant: true });
          expect(Object.isFrozen(context)).toBe(true);
          expect(Object.isFrozen(context.docPermissions)).toBe(true);
        }
        (list.data[0] as any).meta.permissions._view.value = false;
        expect((list.data[1] as any).meta.permissions._view.value).toBe(true);
        const read = await svc.findById(String(f.rows[0]._id), args, metadata);
        expect(read).toMatchObject({
          success: true,
          data: { meta: { permissions: { owner: true, _view: { value: true }, _edit: { value: true } } } },
        });
        const write = await svc.create({ value: 'created-metadata', owner: true }, args, metadata);
        expect(write).toMatchObject({
          success: true,
          data: [{ value: 'created-metadata', meta: { permissions: { owner: true } } }],
        });
        f.router.setOption('disableFieldPermissions', true);
        expect(await svc.findById(String(f.rows[0]._id), args, metadata)).toMatchObject({
          success: true,
          data: { meta: { permissions: { owner: true } } },
        });
        const disabled = await svc.findById(String(f.rows[0]._id), args, metadata);
        if (!disabled.success) throw new Error(disabled.code);
        expect((disabled.data as any).meta.permissions).not.toHaveProperty('_view');
        f.router.setOption('stripPermissionsField', true);
        const stripped = await svc.findById(String(f.rows[0]._id), args, metadata);
        expect(stripped.success).toBe(true);
        if (!stripped.success) throw new Error(stripped.code);
        expect(stripped.data).not.toHaveProperty('meta.permissions');
      });
    },
  );
});

const forbidden = new Set([
  'context',
  'contexts',
  'documentAuthorization',
  'documentAuthorizationStage',
  'resolvedAuthorization',
  'execution',
  'executionContext',
  'serviceExecutionContext',
  'preparedQuery',
  'preparedFilter',
  'preparedModelQuery',
  'resolvedIdentifier',
  'capabilities',
  'provenance',
  'raw',
  'sourceMode',
  'writeOrigin',
  'writeOutputBranch',
  'documentStage',
  'currentDocument',
  'preparedData',
  'finalDocumentSnapshot',
]);
function expectWireOnly(value: unknown) {
  if (!value || typeof value !== 'object') return;
  expect(Object.getOwnPropertySymbols(value)).toEqual([]);
  for (const [key, child] of Object.entries(value)) {
    expect(forbidden.has(key), key).toBe(false);
    expectWireOnly(child);
  }
}

describe('ARTS-04 genuine wire envelopes', () => {
  it('DTO-model actual single/list/error shapes retain metadata but omit diagnostic authority', async () => {
    const f = await modelFixture({
      stripPermissionsField: false,
      disableFieldPermissions: false,
      docPermissions: { read: () => ({ owner: true }), list: () => ({ owner: true }) },
    });
    const single = await request(f.app)
      .get(`${f.basePath}/${f.rows[0]._id}`)
      .query({ select: 'value hidden -_id', include_permissions: 'true' })
      .expect(200);
    expect(single.body).toMatchObject({ value: 'stored-0', _permissions: { owner: true, _view: { value: true } } });
    expect(single.body).not.toHaveProperty('hidden');
    const list = await request(f.app)
      .post(`${f.basePath}/__query`)
      .send({ ...args, options: metadata })
      .expect(200);
    expect(list.body).toMatchObject({ data: [{ value: 'stored-0' }, { value: 'stored-1' }] });
    const invalid = await request(f.app)
      .post(`${f.basePath}/__query`)
      .send({ options: { preparedQuery: {} } })
      .expect(400);
    expect(invalid.body).toMatchObject({ status: 400, title: 'Bad Request' });
    for (const response of [single, list, invalid]) expectWireOnly(response.body);
  });

  it('DTO-root actual mixed success/error and forbidden-control errors never serialize private context', async () => {
    const f = await modelFixture({ stripPermissionsField: false, disableFieldPermissions: false });
    const batch = await request(f.app)
      .post(f.rootPath)
      .send([
        { target: 'model', name: f.Source.modelName, op: 'read', id: String(f.rows[0]._id), args, options: metadata },
        { target: 'model', name: f.Source.modelName, op: 'list', args, options: metadata },
        {
          target: 'model',
          name: f.Source.modelName,
          op: 'read',
          id: '000000000000000000000001',
          options: { tryList: false },
        },
      ])
      .expect(200);
    expect(batch.body[0]).toMatchObject({
      target: 'model',
      op: 'read',
      statusCode: 200,
      result: { success: true, kind: 'single', data: { value: 'stored-0', _permissions: { _view: { value: true } } } },
    });
    expect(batch.body[1]).toMatchObject({
      statusCode: 200,
      result: { success: true, kind: 'list', data: [{ value: 'stored-0' }, { value: 'stored-1' }] },
    });
    expect(batch.body[2]).toMatchObject({ statusCode: 404, result: { success: false, code: 'not_found' } });
    expectWireOnly(batch.body);
    const invalid = await request(f.app)
      .post(f.rootPath)
      .send([{ target: 'model', name: f.Source.modelName, op: 'list', options: { documentAuthorization: {} } }])
      .expect(400);
    expectWireOnly(invalid.body);
  });
});
