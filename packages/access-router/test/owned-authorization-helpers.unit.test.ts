import mongoose from 'mongoose';
import JsonRouter from '@web-ts-toolkit/express-json-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { PublicService } from '../src/services/public-service';
import { guard } from '../src/middleware';
import { PERMISSIONS } from '../src/symbols';
import type { AuthorizationMode, ModelOutputContext, ModelRequest, ModelRouterOptions } from '../src/interfaces';
import { EMPTY_DOCUMENT_GRANTS } from '../src/acl/document-grants';
import { serverAuthorizationControls } from '../src/acl/authorization-modes';

const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const helpers = ['pickAllowedFields', 'trimOutputFields', 'genAllowedFields'] as const;
const planners = ['genSelect', 'genQuerySelect', 'genPopulate'] as const;
let sequence = 0;

function fixture(mode: AuthorizationMode = 'isolated', options: ModelRouterOptions = {}) {
  const model = mongoose.model(
    `Oar05Helper${++sequence}`,
    new mongoose.Schema({
      _id: String,
      name: String,
      secret: String,
      ownerId: String,
      owned: String,
      negative: String,
      global: String,
      and: String,
      or: String,
      async: String,
      contacts: [new mongoose.Schema({ email: String, private: String }, { _id: false })],
    }),
  );
  const runtime = new AccessRuntime();
  runtime.registerModelInstance(model.modelName, model);
  const hook = vi.fn((doc: unknown) => ({ owner: (doc as { ownerId?: string }).ownerId === 'actor', suspended: true }));
  const negative = vi.fn((_p, grants) => !grants.suspended);
  const global = vi.fn(function (this: ModelRequest, permissions, grants) {
    expect(this).toBe(request);
    expect(Object.isFrozen(grants)).toBe(true);
    return permissions.has('reader');
  });
  const asyncRule = vi.fn(async (_p, grants) => grants.owner === true);
  const virtual = vi.fn(() => 'computed');
  runtime.setModelOptions(model.modelName, {
    readAuthorizationMode: mode,
    listAuthorizationMode: mode,
    operationAccess: true,
    baseFilter: true,
    stripPermissionsField: true,
    modelPermissionPrefix: 'doc:',
    alwaysSelectFields: ['ownerId'],
    permissionSchema: {
      name: true,
      secret: false,
      ownerId: false,
      owned: 'doc:owner',
      negative,
      global,
      and: 'reader admin',
      or: ['admin', 'reader'],
      async: asyncRule,
      contacts: { read: true, list: true, sub: { email: 'reader', private: false } },
      label: true,
    },
    docPermissions: { read: hook, list: hook },
    virtuals: { label: { get: virtual, dependsOn: [] } },
    ...options,
  });
  const rows = [
    {
      _id: 'same',
      name: 'N',
      secret: 'hidden',
      ownerId: 'actor',
      owned: 'owner',
      negative: 'empty-is-not-unsuspended',
      global: 'G',
      and: 'no',
      or: 'yes',
      async: 'A',
      contacts: [{ email: 'e', private: 'hidden-child' }],
    },
  ];
  const adapter = {
    mongooseModel: model,
    find: vi.fn(async () => rows),
    findOne: vi.fn(async () => rows[0]),
    countDocuments: vi.fn(async () => rows.length),
    new: vi.fn(),
    create: vi.fn(),
  };
  const request = {
    [PERMISSIONS]: new Permission({ reader: true, admin: false }),
    query: {},
    params: {},
    get: () => undefined,
  } as unknown as ModelRequest;
  const { core, service, publicService } = runWithRuntime(runtime, () => {
    const core = (request.macl = new Core(request));
    const service = new (class extends Service {
      protected createModelAdapter() {
        return adapter;
      }
    })(request, model.modelName);
    const publicService = new (class extends PublicService {
      protected createModelAdapter() {
        return adapter;
      }
    })(request, model.modelName);
    return { core, service, publicService };
  });
  vi.spyOn(core, 'getPublicService').mockReturnValue(publicService);
  const diagnostic: ModelOutputContext = Object.freeze({
    modelName: model.modelName,
    receivingModelName: model.modelName,
    operation: 'read',
    scopePath: Object.freeze([]),
    virtualAccess: 'read',
    outputAccess: 'read',
    docPermissionsAccess: 'read',
    docPermissions: EMPTY_DOCUMENT_GRANTS,
  });
  return {
    model,
    runtime,
    request,
    core,
    service,
    publicService,
    adapter,
    rows,
    hook,
    negative,
    global,
    asyncRule,
    virtual,
    diagnostic,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Oar05Helper/);
});

function badControl(key: string, form: string): object {
  if (form === 'inherited') return Object.create({ [key]: undefined });
  if (form === 'hidden') return Object.defineProperty({}, key, { value: false });
  if (form === 'accessor')
    return Object.defineProperty({}, key, {
      get() {
        throw new Error('control getter ran');
      },
    });
  return { [key]: undefined };
}

describe('OAR-05 fresh helper policy and control boundaries', () => {
  it.each(['isolated', 'trusted'] as const)(
    '%s evaluates the actual grammar with empty facts, not imaginary document facts',
    async (mode) => {
      const f = fixture(mode);
      const expected = {
        _id: 'same',
        name: 'N',
        negative: 'empty-is-not-unsuspended',
        global: 'G',
        or: 'yes',
        contacts: [{ email: 'e' }],
      };
      for (const method of helpers) {
        const output =
          method === 'genAllowedFields'
            ? await f.service[method](f.rows[0], 'read', { purpose: 'output' })
            : await f.service[method](f.rows[0], 'read');
        expect(output).toEqual(
          method === 'genAllowedFields'
            ? expect.arrayContaining(['name', 'negative', 'global', 'or', 'contacts.email'])
            : expected,
        );
        if (method === 'genAllowedFields')
          expect(output).not.toEqual(expect.arrayContaining(['owned', 'async', 'secret']));
      }
      expect(f.hook).not.toHaveBeenCalled();
      expect(f.virtual).not.toHaveBeenCalled();
      expect(f.adapter.findOne).not.toHaveBeenCalled();
      expect(f.adapter.find).not.toHaveBeenCalled();
      for (const rule of [f.negative, f.global, f.asyncRule])
        for (const call of rule.mock.calls) {
          expect(call).toHaveLength(2);
          expect(call[1]).toBe(EMPTY_DOCUMENT_GRANTS);
        }
      // !undefined is true. This raw helper result is deliberately NOT proof that
      // the document is unsuspended; only a normal fresh operation gets its facts.
      const normal = await f.service.findById('same', { select: ['owned', 'negative', 'async', '-_id'] }, quiet);
      expect(normal).toMatchObject({ success: true, data: { owned: 'owner', async: 'A' } });
      if (!normal.success) throw new Error('expected normal read');
      expect(normal.data).not.toHaveProperty('negative');
      expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
      expect(f.hook).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['core', 'service', 'publicService'] as const)(
    '%s rejects every retired/new/handle control before policy, catalog or data work',
    async (receiver) => {
      const f = fixture();
      const target = receiver === 'core' ? f.core : f[receiver];
      const prefix = receiver === 'core' ? [f.model.modelName] : [];
      const catalog = vi.spyOn(f.runtime, 'getModelInstance');
      const data = Object.defineProperty({}, 'name', {
        get() {
          throw new Error('data getter ran');
        },
      });
      for (const method of [...helpers, ...planners]) {
        const args =
          method === 'genPopulate'
            ? ['read', []]
            : planners.includes(method as (typeof planners)[number])
              ? ['read', ['name']]
              : [data, 'read'];
        for (const key of [...serverAuthorizationControls, 'documentAuthorization', 'documentAuthorizationStage'])
          for (const form of ['own', 'hidden', 'inherited', 'accessor']) {
            await expect(
              Reflect.apply(target[method], target, [...prefix, ...args, badControl(key, form)]),
            ).rejects.toMatchObject({ result: { code: 'bad_request' } });
          }
      }
      expect(catalog).not.toHaveBeenCalled();
      expect(f.hook).not.toHaveBeenCalled();
      expect(f.global).not.toHaveBeenCalled();
      expect(f.negative).not.toHaveBeenCalled();
      expect(f.virtual).not.toHaveBeenCalled();
      expect(f.adapter.findOne).not.toHaveBeenCalled();
    },
  );

  it.each(helpers)(
    '%s rejects control slots inside output policy before callbacks or document work',
    async (method) => {
      const f = fixture();
      for (const key of [...serverAuthorizationControls, 'documentAuthorization', 'documentAuthorizationStage'])
        for (const form of ['own', 'hidden', 'inherited', 'accessor'])
          for (const policy of [badControl(key, form), { outputFields: badControl(key, form) }]) {
            const options = { authorization: policy, ...(method === 'genAllowedFields' ? { purpose: 'output' } : {}) };
            await expect(
              Reflect.apply(f.service[method], f.service, [f.rows[0], 'read', options]),
            ).rejects.toMatchObject({ result: { code: 'bad_request' } });
          }
      expect(f.global).not.toHaveBeenCalled();
      expect(f.hook).not.toHaveBeenCalled();
      expect(f.adapter.findOne).not.toHaveBeenCalled();
    },
  );

  it.each(helpers)(
    '%s admits scoped explicit output grants, never rows/input/related/metadata authority',
    async (method) => {
      const f = fixture();
      const options = {
        scopePath: ['contacts'],
        authorization: { outputFields: { mode: 'grant', paths: ['contacts.private'] } },
        ...(method === 'genAllowedFields' ? { purpose: 'output' } : {}),
      };
      const child = f.rows[0].contacts[0];
      const result = await Reflect.apply(f.service[method], f.service, [child, 'read', options]);
      expect(result).toEqual(method === 'genAllowedFields' ? ['email', 'private'] : child);
      for (const authorization of [
        { rows: { mode: 'unrestricted' } },
        { inputFields: { mode: 'grant', paths: ['contacts.private'] } },
        { related: {} },
        { outputFields: { mode: 'grant', paths: ['_permissions.owner'] } },
        { outputFields: { mode: 'grant', paths: ['missing'] } },
      ])
        await expect(
          Reflect.apply(f.service[method], f.service, [child, 'read', { ...options, authorization }]),
        ).rejects.toMatchObject({ result: { code: 'bad_request' } });
      expect(f.hook).not.toHaveBeenCalled();
      expect(f.adapter.findOne).not.toHaveBeenCalled();
      expect(f.core.getPermissions().has('admin')).toBe(false);
    },
  );

  it.each(helpers)('%s captures scope once before application field callbacks can mutate options', async (method) => {
    const f = fixture();
    const scope = ['contacts'];
    f.runtime.setModelOptions(f.model.modelName, {
      permissionSchema: {
        contacts: {
          read: true,
          sub: {
            email: async () => {
              scope.push('changed');
              return true;
            },
            private: false,
          },
        },
      },
    });
    const options = { scopePath: scope, ...(method === 'genAllowedFields' ? { purpose: 'output' } : {}) };
    const output = await Reflect.apply(f.service[method], f.service, [f.rows[0].contacts[0], 'read', options]);
    expect(output).toEqual(method === 'genAllowedFields' ? ['email'] : { email: 'e' });
    expect(scope).toEqual(['contacts', 'changed']);
  });

  it('rejects malformed helper options before touching a proxy or source accessors', async () => {
    const f = fixture(),
      trap = vi.fn(() => {
        throw new Error('proxy observed');
      });
    const options = new Proxy({}, { getPrototypeOf: trap, has: trap, ownKeys: trap });
    await expect(f.service.pickAllowedFields(f.rows[0], 'read', options)).rejects.toMatchObject({
      result: { code: 'bad_request' },
    });
    expect(trap).not.toHaveBeenCalled();
  });
});

describe('OAR-05 DTOs, diagnostics and utility metadata are never authority', () => {
  it.each(['same', 'spread', 'json', 'child-replaced', 'metadata'] as const)(
    '%s DTO has no reusable authority on any receiving request/runtime/model/access',
    async (form) => {
      const f = fixture(),
        other = fixture();
      const first = await f.service.findById('same', { select: ['owned', 'contacts', '-_id'] }, quiet);
      expect(first.success).toBe(true);
      if (!first.success) throw new Error('expected read');
      const dto =
        form === 'same' ? first.data : form === 'json' ? JSON.parse(JSON.stringify(first.data)) : { ...first.data };
      if (form === 'child-replaced') dto.contacts = [{ email: 'new', private: 'forged' }];
      if (form === 'metadata') dto._permissions = { owner: true, _view: { owned: true } };
      for (const [core, name] of [
        [f.core, f.model.modelName],
        [other.core, other.model.modelName],
      ] as const)
        for (const access of ['read', 'list'] as const) {
          const fresh = await core.pickAllowedFields(name, dto, access);
          expect(fresh).not.toHaveProperty('owned');
          expect(fresh.contacts).toEqual([{ email: form === 'child-replaced' ? 'new' : 'e' }]);
          await expect(
            Reflect.apply(core.pickAllowedFields, core, [name, dto, access, { documentAuthorization: first.context }]),
          ).rejects.toMatchObject({ result: { code: 'bad_request' } });
        }
      const keys = [
        'modelName',
        'operation',
        'receivingModelName',
        'scopePath',
        'virtualAccess',
        'outputAccess',
        'docPermissionsAccess',
        'docPermissions',
        'resolvedQuery',
      ];
      expect(Object.keys(first.context).every((key) => keys.includes(key))).toBe(true);
      expect(Object.getOwnPropertySymbols(first.context)).toEqual([]);
      expect(Object.getOwnPropertySymbols(first.data)).toEqual([]);
      for (const value of Object.values(first.context)) expect(typeof value).not.toBe('function');
      expect(Object.isFrozen(first.context)).toBe(true);
      expect(Object.isFrozen(first.context.docPermissions)).toBe(true);
      expect(Object.isFrozen(first.context.scopePath)).toBe(true);
      expect(JSON.stringify(first.context)).not.toMatch(
        /documentAuthorization|currentDocument|Snapshot|mongooseModel|originalData|allowedData|preparedData|modifiedPaths|changes/,
      );
      expect(f.hook).toHaveBeenCalledTimes(1);
      expect(other.hook).not.toHaveBeenCalled();
      expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
      expect(other.adapter.findOne).not.toHaveBeenCalled();
    },
  );

  it('counts presentation +0, raw helpers +0, and a fresh current-document read +1 query/+1 hook', async () => {
    const f = fixture();
    const select = ['name', 'owned', '-_id'];
    const first = await f.service.findById('same', { select }, quiet);
    if (!first.success) throw new Error('expected initial read');
    expect({ name: first.data.name }).toEqual({ name: 'N' });
    for (const method of helpers)
      await Reflect.apply(f.service[method], f.service, [
        first.data,
        'read',
        method === 'genAllowedFields' ? { purpose: 'output' } : {},
      ]);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
    expect(f.hook).toHaveBeenCalledTimes(1);
    f.rows[0].ownerId = 'other';
    const current = await f.service.findById('same', { select }, quiet);
    if (!current.success) throw new Error('expected current read');
    expect(current.data).toEqual({ name: 'N' });
    expect(first.data).toEqual({ name: 'N', owned: 'owner' });
    expect(f.adapter.findOne).toHaveBeenCalledTimes(2);
    expect(f.hook).toHaveBeenCalledTimes(2);
    // Instrumented adapters, not a claim of actual Mongo I/O in this unit case.
  });

  it('keeps explicit boolean metadata generation/read utilities as DATA, never helper facts', async () => {
    const f = fixture('isolated', { stripPermissionsField: false });
    const doc = { _id: 'same', ownerId: 'actor', owned: 'O', _permissions: {} };
    const facts = await f.service.genDocPermissions(doc, 'read', f.diagnostic);
    expect(facts).toEqual({ owner: true, suspended: true });
    expect(Object.isFrozen(facts)).toBe(true);
    await f.service.addDocPermissions(doc, 'read', f.diagnostic);
    expect(f.service.getDocPermissions(doc)).toEqual({ owner: true, suspended: true });
    expect(f.service.getDocPermissions(doc)).not.toBe(facts);
    expect(await f.service.pickAllowedFields(doc, 'read')).not.toHaveProperty('owned');
    const exists = vi.spyOn(f.core, 'getService').mockReturnValue(f.service);
    const query = vi.spyOn(f.service, 'exists').mockResolvedValue({ success: true, kind: 'single', data: true });
    await f.service.addFieldPermissions(doc, 'read', { operation: 'read' });
    expect(f.service.getDocPermissions(doc)).toMatchObject({
      owner: true,
      _view: { owned: true },
      _edit: { owned: true },
    });
    expect(await f.service.pickAllowedFields(doc, 'read')).not.toHaveProperty('owned');
    expect(f.hook).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
    expect(exists).toHaveBeenCalled();
    f.service.addEmptyPermissions(doc);
    expect(f.service.getDocPermissions(doc)).toEqual({ _view: { $: '_' }, _edit: { $: '_' } });
  });

  it('rejects malformed metadata before policy callbacks or utility existence queries', async () => {
    const f = fixture(),
      getService = vi.spyOn(f.core, 'getService');
    const doc = { _id: 'same', _permissions: { owner: { forged: true } } };
    await expect(f.service.addFieldPermissions(doc, 'read', { operation: 'read' })).rejects.toMatchObject({
      result: { code: 'bad_request' },
    });
    expect(getService).not.toHaveBeenCalled();
    expect(f.adapter.findOne).not.toHaveBeenCalled();
    expect(f.global).not.toHaveBeenCalled();
    expect(f.hook).not.toHaveBeenCalled();
  });

  it.each(['strip', 'expose-none', 'forged', 'removed'] as const)(
    'private document guard uses fresh facts, not %s presentation',
    async (posture) => {
      const f = fixture('trusted', {
        stripPermissionsField: posture === 'strip',
        exposedDocPermissionKeys: posture === 'expose-none' ? [] : undefined,
        decorate: {
          read: (doc, _p, context) => {
            expect(Object.isFrozen(context)).toBe(true);
            return posture === 'removed'
              ? {}
              : { ...doc, _permissions: { owner: true }, docPermissions: { owner: true } };
          },
        },
      });
      const next = vi.fn(),
        middleware = guard({ modelName: f.model.modelName, id: 'same', condition: ['admin', 'reader owner'] });
      await middleware(f.request, {} as never, next);
      expect(next).toHaveBeenLastCalledWith();
      f.rows[0].ownerId = 'other';
      next.mockClear();
      await middleware(f.request, {} as never, next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(JsonRouter.clientErrors.UnauthorizedError);
      expect(f.adapter.findOne).toHaveBeenCalledTimes(2);
      expect(f.hook).toHaveBeenCalledTimes(2);
    },
  );
});
