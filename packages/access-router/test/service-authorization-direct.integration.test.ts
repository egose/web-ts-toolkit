import { describe, expect, it, vi } from 'vitest';
import { useMongoTestDatabase } from './setup';
import { authorizationFixture, noteGrant, quiet } from './service-authorization-fixture';

useMongoTestDatabase();

describe('SVA-05 direct authorized execution', () => {
  it.each(['false', 'missing'] as const)(
    'fetches and returns a selected %s-rule grant, not unselected values',
    async (rule) => {
      const f = await authorizationFixture({
        permissionSchema: { status: true, ...(rule === 'false' ? { internalNote: false } : {}) },
      });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        const result = await service.findOne(
          { _id: f.rows[0]._id },
          { select: ['status', 'internalNote'] },
          { ...quiet, authorization: noteGrant },
        );
        expect(result).toMatchObject({ success: true, data: { status: 'ready', internalNote: 'note-a' } });
        if (!result.success) throw new Error(result.code);
        expect(f.projections.at(-1)).toEqual({ status: 1, internalNote: 1, _id: 1 });
        expect(result.query.select).toEqual(expect.arrayContaining(['status', 'internalNote', '_id']));
        expect(
          await service.pickAllowedFields(result.data, 'read', {
            authorization: noteGrant,
          }),
        ).toMatchObject({ status: 'ready', internalNote: 'note-a' });
        expect(Object.keys(result.context)).not.toContain('documentAuthorization');
        expect(Object.getOwnPropertySymbols(result.data)).toEqual([]);
        const unselected = await service.findOne({}, { select: ['status'] }, { ...quiet, authorization: noteGrant });
        expect(unselected).toMatchObject({ success: true, data: { status: 'ready' } });
        expect(f.projections.at(-1)).not.toHaveProperty('internalNote');
        if (unselected.success) expect(unselected.data).not.toHaveProperty('internalNote');
        const denied = await service.findOne({}, { select: ['status', 'internalNote'] }, quiet);
        if (!denied.success) throw new Error(denied.code);
        expect(denied.data).not.toHaveProperty('internalNote');
        expect(await service.pickAllowedFields(denied.data, 'read', { authorization: noteGrant })).not.toHaveProperty(
          'internalNote',
        );
        await expect(
          service.pickAllowedFields(denied.data, 'read', {
            documentAuthorization: {},
          } as never),
        ).rejects.toThrow();
      });
    },
  );

  it('does not fetch denied status, fabricate missing notes, or grant rows or sorting', async () => {
    const f = await authorizationFixture({ permissionSchema: { status: false, internalNote: false } });
    await f.Model.updateOne({ _id: f.rows[0]._id }, { $unset: { internalNote: 1 } });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const result = await service.findById(
        String(f.rows[0]._id),
        { select: ['status', 'internalNote', '-_id'] },
        { ...quiet, authorization: noteGrant },
      );
      expect(result).toMatchObject({ success: true });
      expect(f.projections.at(-1)).toEqual({ internalNote: 1, _id: 1 });
      if (!result.success) throw new Error(result.code);
      expect(result.data).not.toHaveProperty('status');
      expect(result.data).not.toHaveProperty('internalNote');
      expect(result.data).not.toHaveProperty('_id');
      const before = f.projections.length;
      expect(
        await service.findOne(
          {},
          {},
          { ...quiet, authorization: { ...noteGrant, rows: { mode: 'scope', filter: false } } },
        ),
      ).toMatchObject({ success: false, code: 'forbidden' });
      expect(
        await service.find({}, { sort: { internalNote: 1 } }, { ...quiet, authorization: noteGrant }),
      ).toMatchObject({ success: false, code: 'bad_request' });
      expect(f.projections).toHaveLength(before);
    });
  });

  it.each([
    ['skim', {}, quiet],
    ['non-skim', {}, { ...quiet, skim: false }],
    ['metadata enabled', {}, { ...quiet, includePermissions: true, includeFieldPermissions: true }],
    [
      'maps disabled',
      { disableFieldPermissions: true },
      { ...quiet, includePermissions: true, includeFieldPermissions: true },
    ],
    ['stripped', { stripPermissionsField: true }, { ...quiet, includePermissions: true }],
    ['exposed subset', { exposedDocPermissionKeys: ['public'] }, { ...quiet, includePermissions: true }],
    ['dotted stripped', { documentPermissionField: 'meta.permissions', stripPermissionsField: true }, quiet],
  ] as const)(
    'retains ordinary stage facts independently of metadata and fresh helpers with %s',
    async (_name, posture, options) => {
      const hook = vi.fn((doc: { ownerId?: string }) => ({ owner: doc.ownerId === 'alice', public: true }));
      const decision = vi.fn((_permissions, grants) => grants.owner === true);
      const f = await authorizationFixture({
        permissionSchema: { status: { read: decision, list: decision }, internalNote: false },
        docPermissions: {
          read: { dependsOn: ['ownerId'], get: hook },
          list: { dependsOn: ['ownerId'], get: hook },
        },
        ...posture,
      });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        const result = await service.findOne(
          { _id: f.rows[0]._id },
          { select: ['status', 'internalNote'] },
          { ...options, authorization: noteGrant },
        );
        expect(result).toMatchObject({ success: true, data: { status: 'ready', internalNote: 'note-a' } });
        if (!result.success) throw new Error(result.code);
        expect(f.projections[0]).toMatchObject({ ownerId: 1, status: 1, internalNote: 1 });
        expect(result.data).not.toHaveProperty('ownerId');
        expect(hook).toHaveBeenCalledTimes(1);
        expect(decision).toHaveBeenCalledTimes(1);
        expect(() => {
          (result.context as any).docPermissions = { owner: false };
        }).toThrow(TypeError);
        expect(result.context.docPermissions.owner).toBe(true);
        expect(result.context).not.toHaveProperty('documentAuthorization');
        expect(result.context).not.toHaveProperty('getDocumentAuthorization');
        const picked = await service.pickAllowedFields(result.data, 'read', { authorization: noteGrant });
        expect(await service.trimOutputFields(picked, 'read', { authorization: noteGrant })).toMatchObject({
          internalNote: 'note-a',
        });
        expect(picked).not.toHaveProperty('status');
        expect(await service.pickAllowedFields(result.data, 'read', {})).not.toHaveProperty('status');
        expect(hook).toHaveBeenCalledTimes(1);
        expect(decision).toHaveBeenCalledTimes(3);
        expect(
          decision.mock.calls.slice(1).every(([, facts]) => Object.isFrozen(facts) && Object.keys(facts).length === 0),
        ).toBe(true);
        await expect(
          service.pickAllowedFields({ ...result.data }, 'read', { documentAuthorization: {} } as never),
        ).rejects.toThrow();
        await expect(
          service.pickAllowedFields(result.data, 'list', { documentAuthorization: undefined } as never),
        ).rejects.toThrow();
        if ('_permissions' in result.data && options.includeFieldPermissions)
          expect(result.data._permissions).not.toHaveProperty('_view.internalNote');
      });
    },
  );

  it('isolates list rows, calls, requests and public wrappers; count shares the prepared scope', async () => {
    const hook = vi.fn((doc: { ownerId?: string }) => ({ owner: doc.ownerId === 'alice' }));
    const transform = vi.fn((filter) => filter);
    const f = await authorizationFixture({
      permissionSchema: { status: { read: 'owner', list: 'owner' }, internalNote: false },
      docPermissions: {
        list: { dependsOn: ['ownerId'], get: hook },
        read: { dependsOn: ['ownerId'], get: hook },
      },
      overrideFilter: { list: transform },
    });
    let previous: any;
    await f.execute(async (req) => {
      const service = req.macl.getPublicService(f.modelName);
      const list = await service.find(
        {},
        { select: ['status', 'internalNote'] },
        { ...quiet, includeCount: true, authorization: noteGrant },
      );
      if (!list.success) throw new Error(list.code);
      expect(list.totalCount).toBe(2);
      expect(transform).toHaveBeenCalledTimes(1);
      expect(hook).toHaveBeenCalledTimes(2);
      expect(list.data[0]).toHaveProperty('status', 'ready');
      expect(list.data[1]).not.toHaveProperty('status');
      expect(list.contexts[0].docPermissions).not.toBe(list.contexts[1].docPermissions);
      expect(list.contexts.map((context) => context.docPermissions.owner)).toEqual([true, false]);
      await expect(
        service.pickAllowedFields(list.data[1], 'list', {
          documentAuthorization: list.contexts[0].docPermissions,
        } as never),
      ).rejects.toThrow();
      const scoped = await service.find(
        {},
        { limit: 1 },
        { ...quiet, includeCount: true, authorization: { rows: { mode: 'scope', filter: { tenant: 'a' } } } },
      );
      expect(scoped).toMatchObject({ success: true, count: 1, totalCount: 1 });
      const publicResult = await service._list({}, { select: ['internalNote'] }, quiet);
      if (!publicResult.success) throw new Error(publicResult.code);
      expect(publicResult.data.every((row) => !('internalNote' in row))).toBe(true);
      previous = list;
    });
    await f.execute(async (req) => {
      await expect(
        req.macl.getService(f.modelName).pickAllowedFields(previous.data[0], 'list', {
          documentAuthorization: previous.contexts[0].docPermissions,
        } as never),
      ).rejects.toThrow();
    });
  });

  it('captures policy before asynchronous hooks and leaves request permissions untouched', async () => {
    let mutate = () => {};
    const f = await authorizationFixture({
      overrideFilter: {
        read: async (filter) => {
          mutate();
          await Promise.resolve();
          return filter;
        },
      },
    });
    await f.execute(async (req) => {
      const policy = { outputFields: { mode: 'grant' as const, paths: ['internalNote'] } };
      const actor = req.macl.getPermissions();
      mutate = () => {
        policy.outputFields.paths.length = 0;
      };
      const result = await req.macl
        .getService(f.modelName)
        .findOne({}, { select: ['internalNote'] }, { ...quiet, authorization: policy });
      expect(result).toMatchObject({ success: true, data: { internalNote: 'note-a' } });
      expect(req.macl.getPermissions()).toBe(actor);
    });
  });

  it('returns filtered embedded DTOs without handles through metadata cleanup', async () => {
    const f = await authorizationFixture({ stripPermissionsField: true });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const result = await service.findOne(
        {},
        { select: ['contacts.email'] },
        { ...quiet, authorization: { outputFields: { mode: 'grant', paths: ['contacts.email'] } } },
      );
      if (!result.success) throw new Error(result.code);
      const child = result.data.contacts[0];
      expect(child).toHaveProperty('email', 'a@x');
      expect(child).not.toHaveProperty('ssn');
      expect(result.context).not.toHaveProperty('getDocumentAuthorization');
      expect(
        await service.pickAllowedFields(child, 'read', {
          scopePath: ['contacts'],
          authorization: { outputFields: { mode: 'grant', paths: ['contacts.email'] } },
        }),
      ).toHaveProperty('email', 'a@x');
    });
  });

  it.each(['legacy', 'correlated'] as const)(
    'preserves %s target-local facts through include pairing without transporting handles',
    async (mode) => {
      const hook = vi.fn((doc: { ownerId?: string }) => ({ owner: doc.ownerId === 'alice' }));
      const f = await authorizationFixture({
        permissionSchema: { status: 'owner', slug: true },
        docPermissions: {
          list: { dependsOn: ['ownerId'], get: hook },
          read: { dependsOn: ['ownerId'], get: hook },
        },
        stripPermissionsField: true,
      });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        const include =
          mode === 'legacy'
            ? {
                model: f.modelName,
                op: 'list' as const,
                path: 'children',
                localField: 'slug',
                foreignField: 'slug',
                args: { select: ['status'] },
              }
            : {
                mode: 'correlated' as const,
                model: f.modelName,
                op: 'list' as const,
                path: 'children',
                filter: { slug: { $parent: 'slug' } },
                args: { select: ['status'] },
              };
        const result = await service.findOne({ _id: f.rows[0]._id }, { select: ['status'], include }, quiet);
        if (!result.success) throw new Error(result.code);
        const child = result.data.children[0];
        expect(result.context).not.toHaveProperty('getDocumentAuthorization');
        expect(child).not.toHaveProperty('ownerId');
        expect(child).not.toHaveProperty('slug');
        expect(child).toHaveProperty('status', 'ready');
        expect(await service.pickAllowedFields(child, 'list')).not.toHaveProperty('status');
        expect(hook).toHaveBeenCalledTimes(2);
      });
    },
  );
});
