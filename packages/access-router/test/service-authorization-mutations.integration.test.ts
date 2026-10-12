import { describe, expect, it, vi } from 'vitest';
import { useMongoTestDatabase } from './setup';
import { authorizationFixture, noteGrant, quiet } from './service-authorization-fixture';

useMongoTestDatabase();

describe('SVA-05 mutation authority and stages', () => {
  it('create grants output only, preserves validation/prepare/afterPersist and gives each row a handle', async () => {
    const validate = vi.fn(() => true);
    const prepare = vi.fn((data) => data);
    const afterPersist = vi.fn((doc) => doc);
    const hook = vi.fn(() => ({ owner: true }));
    const f = await authorizationFixture({
      validate: { create: validate },
      prepare: { create: prepare },
      afterPersist: { create: afterPersist },
      docPermissions: { create: hook },
      stripPermissionsField: true,
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const result = await service.create(
        [{ status: 'one', internalNote: 'attack' }, { status: 'two' }],
        { select: ['status', 'internalNote'] },
        { ...quiet, authorization: noteGrant },
      );
      expect(result).toMatchObject({
        success: true,
        kind: 'list',
        count: 2,
        data: [
          { status: 'one', internalNote: 'server-default' },
          { status: 'two', internalNote: 'server-default' },
        ],
      });
      if (!result.success) throw new Error(result.code);
      expect(validate).toHaveBeenCalledTimes(2);
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(afterPersist).toHaveBeenCalledTimes(2);
      expect(hook).toHaveBeenCalledTimes(2);
      for (let i = 0; i < 2; i++)
        expect(
          await service.pickAllowedFields(result.data[i], 'read', {
            documentAuthorization: result.contexts[i].documentAuthorization,
          }),
        ).toHaveProperty('internalNote', 'server-default');
      expect((await f.Model.findById(result.data[0]._id).select('+internalNote').lean())!.internalNote).toBe(
        'server-default',
      );
    });
  });

  it.each(['updateOne', 'updateById'] as const)(
    '%s separates request-write and fresh post-write grants',
    async (method) => {
      const stages: string[] = [];
      const hook = vi.fn((doc) => {
        stages.push(doc.status);
        return { owner: doc.status === 'ready' };
      });
      const validate = vi.fn(() => true);
      const transform = vi.fn((doc) => doc);
      const afterPersist = vi.fn((doc) => doc);
      const f = await authorizationFixture({
        permissionSchema: { status: { read: 'owner', update: true }, internalNote: false },
        docPermissions: { update: hook },
        validate: { update: validate },
        transform: { update: transform },
        afterPersist: { update: afterPersist },
        stripPermissionsField: true,
      });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        const target = method === 'updateOne' ? { _id: f.rows[0]._id } : String(f.rows[0]._id);
        const result = await service[method](
          target as never,
          { status: 'changed', internalNote: 'attack' },
          { select: ['status', 'internalNote'] },
          { ...quiet, authorization: noteGrant },
        );
        expect(result).toMatchObject({ success: true, data: { internalNote: 'note-a' } });
        if (!result.success) throw new Error(result.code);
        expect(result.data).not.toHaveProperty('status');
        expect(hook).toHaveBeenCalledTimes(2);
        expect(stages).toEqual(['ready', 'changed']);
        expect(validate).toHaveBeenCalledTimes(1);
        expect(transform).toHaveBeenCalledTimes(1);
        expect(afterPersist).toHaveBeenCalledTimes(1);
        expect(
          await service.pickAllowedFields(result.data, 'read', {
            documentAuthorization: result.context.documentAuthorization,
          }),
        ).toHaveProperty('internalNote', 'note-a');
        expect(hook).toHaveBeenCalledTimes(2);
        expect(await f.Model.findById(f.rows[0]._id).select('+internalNote').lean()).toMatchObject({
          status: 'changed',
          internalNote: 'note-a',
        });
      });
    },
  );

  it('upsert branches keep operation/access, one lookup transform, and do not stamp scope into inserts', async () => {
    const transform = vi.fn((filter) => filter);
    const observations: string[] = [];
    const getter = (_doc, _permissions, ctx) => {
      observations.push(`${ctx.operation}:${ctx.virtualAccess}:${ctx.outputAccess}:${ctx.docPermissionsAccess}`);
      return 'receipt';
    };
    const createHook = vi.fn(() => ({}));
    const updateHook = vi.fn(() => ({}));
    const f = await authorizationFixture({
      overrideFilter: { update: transform },
      docPermissions: { create: createHook, update: updateHook },
      virtuals: { receipt: { dependsOn: [], create: getter, update: getter } },
      permissionSchema: { status: true, slug: true, receipt: { read: true }, internalNote: false },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const args = { select: ['internalNote', 'receipt'] };
      const options = {
        ...quiet,
        authorization: { ...noteGrant, rows: { mode: 'scope' as const, filter: { tenant: 'a' } } },
      };
      const updated = await service.upsert(
        { slug: 'first' },
        { status: 'updated', internalNote: 'attack' },
        args,
        options,
      );
      const created = await service.upsert(
        { slug: 'missing' },
        { slug: 'inserted', internalNote: 'attack' },
        args,
        options,
      );
      expect(updated).toMatchObject({
        success: true,
        kind: 'single',
        data: { internalNote: 'note-a', receipt: 'receipt' },
      });
      expect(created).toMatchObject({
        success: true,
        kind: 'list',
        data: [{ internalNote: 'server-default', receipt: 'receipt' }],
      });
      expect(transform).toHaveBeenCalledTimes(2);
      expect(updateHook).toHaveBeenCalledTimes(2);
      expect(createHook).toHaveBeenCalledTimes(1);
      expect(observations).toEqual(['upsert:update:read:update', 'upsert:create:read:create']);
      expect(await f.Model.findOne({ slug: 'inserted' }).lean()).not.toHaveProperty('tenant');
    });
  });

  it('public upsert reuses identity/query once, remains request-only, and never creates an ID miss', async () => {
    const transform = vi.fn((filter) => filter);
    const f = await authorizationFixture({ overrideFilter: { update: transform } });
    await f.execute(async (req) => {
      const id = vi.spyOn(req.macl, 'genIDFilter');
      const service = req.macl.getPublicService(f.modelName);
      expect(await service.findOne({}, {}, { ...quiet, authorization: noteGrant })).toMatchObject({
        success: true,
        data: { internalNote: 'note-a' },
      });
      const updated = await service._upsert(
        { _id: String(f.rows[0]._id), status: 'public', internalNote: 'attack' },
        { select: ['status', 'internalNote'] },
        quiet,
      );
      expect(updated, JSON.stringify(updated)).toMatchObject({ success: true, data: { status: 'public' } });
      if (updated.success) expect(updated.data).not.toHaveProperty('internalNote');
      expect(id).toHaveBeenCalledTimes(1);
      expect(transform).toHaveBeenCalledTimes(1);
      expect(await service._upsert({ _id: '000000000000000000000001' }, {}, quiet)).toMatchObject({
        success: false,
        code: 'unauthorized',
      });
      expect(await f.Model.countDocuments()).toBe(2);
    });
  });

  it('read fallback resolves the identifier once and keeps initiating read with list output', async () => {
    const id = vi.fn((value) => ({ _id: value }));
    const read = vi.fn((filter) => filter);
    const list = vi.fn((filter) => filter);
    const hook = vi.fn(() => ({}));
    const f = await authorizationFixture({
      resolveIdFilter: id,
      baseFilter: { read: () => ({ tenant: 'missing' }) },
      overrideFilter: { read, list },
      docPermissions: { list: hook },
    });
    await f.execute(async (req) => {
      const result = await req.macl
        .getPublicService(f.modelName)
        ._read(String(f.rows[0]._id), {}, { ...quiet, tryList: true });
      expect(result).toMatchObject({
        success: true,
        data: { status: 'ready' },
        context: { operation: 'read', outputAccess: 'list' },
      });
      expect(id).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledTimes(1);
      expect(list).toHaveBeenCalledTimes(1);
      expect(hook).toHaveBeenCalledTimes(1);
    });
  });

  it('new ignores selection but grants selected-template eligibility and provides a create-access handle', async () => {
    const hook = vi.fn(() => ({}));
    const f = await authorizationFixture({
      docPermissions: { create: hook },
      requireExplicitSelect: true,
      stripPermissionsField: true,
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      for (const select of [[], ['-_id'], ['status']]) {
        const result = await service.new({ select }, { ...quiet, authorization: noteGrant });
        expect(result).toMatchObject({ success: true, data: { status: 'draft', internalNote: 'server-default' } });
        if (!result.success) throw new Error(result.code);
        expect(
          await service.pickAllowedFields(result.data, 'create', {
            documentAuthorization: result.context.documentAuthorization,
          }),
        ).toHaveProperty('internalNote', 'server-default');
      }
      expect(hook).toHaveBeenCalledTimes(3);
    });
  });

  it('output grants cannot bypass failed validation, unsupported authority or virtual write exclusion', async () => {
    const validate = vi.fn(() => false);
    const f = await authorizationFixture({ validate: { create: validate, update: validate } });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      expect(await service.create({ status: 'bad' }, {}, { authorization: noteGrant })).toMatchObject({
        success: false,
        code: 'bad_request',
      });
      expect(await service.updateOne({}, { status: 'bad' }, {}, { authorization: noteGrant })).toMatchObject({
        success: false,
        code: 'bad_request',
      });
      const calls = validate.mock.calls.length;
      for (const authorization of [{ inputFields: { mode: 'invalid' } }, { rows: { mode: 'request' } }]) {
        expect(await service.create({}, {}, { authorization } as never)).toMatchObject({
          success: false,
          code: 'bad_request',
        });
      }
      expect(validate).toHaveBeenCalledTimes(calls);
      expect(await f.Model.countDocuments()).toBe(2);
      expect(await f.Model.findById(f.rows[0]._id).lean()).toHaveProperty('status', 'ready');
    });
    f.router.set('validate.create', () => true);
    f.router.set('permissionSchema', { status: true, receipt: true });
    f.router.set('virtuals', { receipt: { dependsOn: [], create: () => 'computed' } });
    await f.execute(async (req) => {
      const result = await req.macl
        .getService(f.modelName)
        .create(
          { status: 'ok', receipt: 'attack' },
          {},
          { ...quiet, authorization: { outputFields: { mode: 'unrestricted' } } },
        );
      expect(result).toMatchObject({ success: true, data: [{ receipt: 'computed' }] });
      if (!result.success) throw new Error(result.code);
      expect(await f.Model.findById(result.data[0]._id).lean()).not.toHaveProperty('receipt');
    });
  });
});
