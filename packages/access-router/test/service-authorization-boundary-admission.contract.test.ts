import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime, permissionsPlugin } from '../src';
import { Core } from '../src/core';
import { PublicService } from '../src/services/public-service';
import { genSubPopulate } from '../src/helpers/document';
import { resolveRequestComplexity } from '../src/request-complexity';
import { Codes } from '../src/enums';
import { PublicAdmissionError, requestOnlyServiceOptions } from '../src/validation/public-admission';
import { createSub, listSub, readSub } from '../src/services/model-subdocument-service';
import { parseBodyWithSchema, parseNestedBodyWithSchema } from '../src/validation/parsers';
import * as schemas from '../src/validation/model-router';
import { rootQuerySchema } from '../src/validation/root-router';
import { populateSchema, subPopulateSchema } from '../src/validation/common';
import Permission from '../src/permission';
import { registerServiceExecutors } from '../src/acl/service-execution';

const controls = [
  'authorization',
  'overrides',
  'documentAuthorization',
  'documentAuthorizationStage',
  'execution',
  'executionContext',
  'serviceExecutionContext',
  'resolvedAuthorization',
  'preparedQuery',
  'preparedFilter',
  'preparedModelQuery',
  'resolvedIdentifier',
  'skipParsing',
  'skipAuthorization',
  'alreadyAuthorized',
  'operation',
];
const denied = { success: false, kind: 'error', code: Codes.BadRequest };
const single = { success: true, kind: 'single', code: Codes.Success, data: {} };
const list = { success: true, kind: 'list', code: Codes.Success, data: [], count: 0 };
const business = {
  authorization: { mode: 'business' },
  overrides: { filter: 'business' },
  options: { execution: 'data' },
};
const legacy = { model: 'Target', op: 'list', path: 'children', localField: 'key', foreignField: 'key' };
const correlated = {
  mode: 'correlated',
  model: 'Target',
  op: 'list',
  path: 'children',
  filter: { key: { $parent: 'key' } },
};

// Actual wrapper/Base methods, instrumented immediately receiving service seams.
// No new authority is evaluated here; SVA-08 owns integrated grant controls.
function fixture() {
  const service = Object.assign(Object.create(PublicService.prototype), {
    defaults: {},
    options: {},
    modelName: 'Source',
    model: { mongooseModel: {} },
    baseFieldsExt: ['_id'],
    req: { macl: { isAllowed: vi.fn().mockResolvedValue(true) } },
    find: vi.fn().mockResolvedValue(list),
    findOne: vi.fn().mockResolvedValue(single),
    findById: vi.fn().mockResolvedValue(single),
    create: vi.fn().mockResolvedValue(list),
    updateById: vi.fn().mockResolvedValue(single),
    new: vi.fn().mockResolvedValue(single),
    exists: vi.fn().mockResolvedValue({ ...single, data: true }),
    distinct: vi.fn().mockResolvedValue(list),
    count: vi.fn().mockResolvedValue({ ...single, data: 0 }),
    genIDFilter: vi.fn().mockResolvedValue({ _id: 'id' }),
    getIdentifier: () => '_id',
    decorate: vi.fn((doc) => doc),
    decorateAll: vi.fn((docs) => docs),
    runTasks: vi.fn((doc) => doc),
    getRequestComplexity: () => resolveRequestComplexity(),
  });
  const target = {
    find: vi.fn().mockResolvedValue({ ...list, data: [{ key: 1, authorization: 'ordinary' }], count: 1 }),
    findOne: vi.fn().mockResolvedValue({ ...single, data: business }),
    countByFieldValues: vi.fn().mockResolvedValue({ ...single, data: new Map() }),
    genFilter: vi.fn((_access, filter) => filter),
    _list: vi.fn().mockResolvedValue(list),
    _read: vi.fn().mockResolvedValue(single),
    _readFilter: vi.fn().mockResolvedValue(single),
  };
  const runtime = {};
  registerServiceExecutors(service, {
    binding: () => ({ request: service.req, runtime, model: service.model.mongooseModel, modelName: 'Source' }),
    configuration: () => ({ catalog: { paths: [] } }),
    permissions: () => new Permission({}),
    parse: async (filter) => filter,
    validate: () => {},
    strip: (_execution, filter) => filter,
    identifier: (id) => service.genIDFilter(id),
    authorize: async (_execution, filter) => ({ transformed: filter, scope: {}, filter }),
    findOne: (_execution, filter, args, options) => service.findById(filter, args, options),
    create: (_execution, data, args, options) => service.create(data, args, options),
    updateOne: (_execution, filter, data, args, options) => service.updateById(filter, data, args, options),
    exists: () => service.exists(),
    find: vi.fn(),
    count: vi.fn(),
    groupedCount: vi.fn(),
  });
  service.getAuthorizedTargetService = vi.fn().mockResolvedValue(target);
  return { service, target };
}

const wrapperCalls = {
  list: (s, a, o) => s._list({}, a, o),
  read: (s, a, o) => s._read('id', a, o),
  readFilter: (s, a, o) => s._readFilter({}, a, o),
  create: (s, a, o) => s._create(business, a, o),
  update: (s, a, o) => s._update('id', business, a, o),
  upsertCreate: (s, a, o) => s._upsert(business, a, o),
  upsertUpdate: (s, a, o) => s._upsert({ _id: 'id', ...business }, a, o),
  new: (s, a, o) => s._new(a, o),
} satisfies Record<string, (s: any, a: any, o: any) => Promise<unknown>>;

function expectNoDispatch(service: ReturnType<typeof fixture>['service']) {
  for (const name of [
    'find',
    'findOne',
    'findById',
    'create',
    'updateById',
    'new',
    'exists',
    'distinct',
    'count',
    'genIDFilter',
    'getAuthorizedTargetService',
  ]) {
    expect(service[name], name).not.toHaveBeenCalled();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Sva01A/);
});

describe('SVA-01A public wrapper admission', () => {
  it.each(Object.entries(wrapperCalls))('%s rejects JS control slots before internal dispatch', async (_name, call) => {
    for (const key of controls) {
      for (const slot of ['args', 'options']) {
        const { service } = fixture();
        // Even present-undefined controls reject; accepting only nonempty policy
        // objects would silently admit legacy/forged transport variants.
        const poison = { [key]: undefined };
        expect(await call(service, slot === 'args' ? poison : {}, slot === 'options' ? poison : {})).toMatchObject(
          denied,
        );
        expectNoDispatch(service);
      }
    }
  });

  it('rejects inherited/non-enumerable JS controls and standalone wrapper options', async () => {
    const { service } = fixture();
    for (const options of [
      Object.create({ authorization: {} }),
      Object.defineProperty({}, 'preparedQuery', { value: {} }),
      Object.assign([], { execution: {} }),
      Object.assign(() => {}, { overrides: {} }),
    ]) {
      expect(await service._new({}, options)).toMatchObject(denied);
    }
    expect(await service._distinct('authorization', { filter: business, overrides: {} })).toMatchObject(denied);
    expect(await service._count(business, { execution: {} })).toMatchObject(denied);
    expectNoDispatch(service);
  });

  it.each(Object.entries(wrapperCalls))(
    '%s dispatches a fresh request-only policy on successful admission',
    async (name, call) => {
      const { service } = fixture();
      const options = { skim: true, lean: true, includePermissions: false, returningAll: false, unknownOption: true };
      expect(await call(service, { select: ['authorization'] }, options)).toMatchObject({ success: true });
      const [method, index] = (
        {
          list: ['find', 2],
          read: ['findById', 2],
          readFilter: ['findOne', 2],
          create: ['create', 2],
          update: ['updateById', 3],
          upsertCreate: ['create', 2],
          upsertUpdate: ['updateById', 3],
          new: ['new', 1],
        } as const
      )[name as keyof typeof wrapperCalls];
      const forwarded = service[method].mock.calls[0][index];
      expect(forwarded.authorization).toEqual({ outputFields: { mode: 'request' } });
      expect(forwarded.skim).toBe(true);
      expect(forwarded).not.toHaveProperty('unknownOption');
    },
  );

  it('request-only forwarding cannot copy private/unknown keys or symbols even from mistyped input', () => {
    expect(
      requestOnlyServiceOptions({
        skim: true,
        authorization: { rows: { mode: 'unrestricted' } },
        preparedQuery: {},
        unknownOption: true,
        [Symbol('execution')]: {},
      } as never),
    ).toEqual({ skim: true, authorization: { outputFields: { mode: 'request' } } });
  });

  it.each(controls)('preflights nested %s before source/target dispatch', async (key) => {
    const poison = { [key]: {} };
    const argsCases = [
      { include: { ...legacy, ...poison } },
      { include: { ...legacy, options: poison } },
      { include: { ...legacy, args: poison } },
      { include: { ...legacy, args: { include: { ...legacy, op: 'read', options: poison } } } },
      { include: { ...correlated, args: { include: { ...legacy, options: poison } } } },
      { include: { ...correlated, options: poison } },
      { populate: [{ path: 'customer', ...poison }] },
      { populate: [{ path: 'customer', options: poison }] },
      { populate: [{ path: 'customer', populate: [{ path: 'child', options: poison }] }] },
      { include: { ...legacy, args: { populate: [{ path: 'customer', ...poison }] } } },
    ];
    for (const args of argsCases) {
      const { service } = fixture();
      expect(await service._list({}, args)).toMatchObject(denied);
      expectNoDispatch(service);
    }
    for (const slot of ['args', 'options', 'sqOptions']) {
      const { service } = fixture();
      const filter = { x: { $$sq: { model: 'Target', op: 'read', id: 'id', [slot]: poison } } };
      expect(await service._readFilter(filter)).toMatchObject(denied);
      expect(await service._create(filter)).toMatchObject(denied);
      expectNoDispatch(service);
    }
  });

  it('preserves business data, selections/tasks and presentation options; request policy is package-owned', async () => {
    const { service } = fixture();
    const args = {
      select: ['authorization', 'overrides'],
      sort: { authorization: 1 },
      skip: 1,
      limit: 3,
      page: 2,
      pageSize: 5,
      populate: [{ path: 'authorization', select: ['overrides'] }],
      include: { ...legacy, filter: business },
      tasks: { type: 'COPY', args: business },
      unknownArg: true,
    };
    const options = {
      skim: false,
      lean: false,
      includePermissions: true,
      includeFieldPermissions: true,
      includeCount: true,
      populateAccess: 'list',
      unknownOption: true,
      [Symbol('execution')]: {},
    };
    await service._list(business, args, options);
    const [filter, forwarded, passed] = service.find.mock.calls[0];
    expect(filter).toBe(business);
    expect(forwarded).toEqual({
      select: args.select,
      populate: args.populate,
      include: args.include,
      sort: args.sort,
      skip: 1,
      limit: 3,
      page: 2,
      pageSize: 5,
    });
    expect(passed).toEqual({
      skim: false,
      lean: false,
      includePermissions: true,
      includeFieldPermissions: true,
      includeCount: true,
      populateAccess: 'list',
      authorization: { outputFields: { mode: 'request' } },
    });
    expect(Object.getOwnPropertySymbols(passed)).toEqual([]);
    expect(Object.isFrozen(passed.authorization)).toBe(true);
    await service._create(business, { select: ['authorization'] });
    expect(service.create.mock.calls[0][0]).toBe(business);
    expect(service.create.mock.calls[0][1]).toEqual({ populate: undefined, select: ['authorization'] });
    await service._new({ select: ['overrides'], unknownArg: true }, { skim: true, unknownOption: true });
    expect(service.new.mock.calls[0]).toEqual([
      { select: ['overrides'] },
      { skim: true, authorization: passed.authorization },
    ]);
  });

  it('rejects mutated defaults before dispatch and preserves supported defaults on reused instances', async () => {
    const { service } = fixture();
    for (const key of controls) {
      for (const name of ['publicReadOptions', 'findOneOptions', 'createArgs', 'publicListArgs']) {
        service.defaults = { [name]: { [key]: {} } };
        expect(await service._readFilter({})).toMatchObject(denied);
      }
    }
    expectNoDispatch(service);
    service.defaults = { publicReadArgs: { select: ['authorization'] }, publicReadOptions: { lean: true, skim: true } };
    await service._readFilter(business);
    await service._readFilter(business, { select: ['overrides'] }, { lean: false });
    expect(service.findOne.mock.calls.map(([, a, o]) => [a.select, o.lean, o.authorization])).toEqual([
      [['authorization'], true, { outputFields: { mode: 'request' } }],
      [['overrides'], false, { outputFields: { mode: 'request' } }],
    ]);
  });
});

describe('SVA-01A actual nested dispatch seams', () => {
  it('admits a correlated child in its own legacy include scope and rejects its controls before dispatch', async () => {
    const { service, target } = fixture();
    // Instrument model-catalog collision checks separately from marker/control
    // admission; SVA-08 also executes this tree against registered Mongo models.
    service.assertIncludeOutputPaths = vi.fn();
    const child = { ...correlated, model: 'Source', path: 'nested', args: { select: ['authorization', 'overrides'] } };
    const parent = { ...legacy, model: 'Source', args: { select: ['authorization'], include: child } };
    expect(service.processInclude(parent).includes).toEqual([parent]);
    expect(service.assertIncludeOutputPaths).toHaveBeenCalledExactlyOnceWith([parent]);
    expect(() => service.processInclude({ ...parent, filter: { key: { $parent: 'key' } } })).toThrow(Codes.BadRequest);
    for (const key of controls) {
      const poisoned = { ...parent, args: { ...parent.args, include: { ...child, options: { [key]: {} } } } };
      expect(() => service.processInclude(poisoned)).toThrow(PublicAdmissionError);
      expect(await service._list({}, { include: poisoned })).toMatchObject(denied);
      await expect(service.includeDocs([{ key: 1 }], poisoned)).rejects.toMatchObject({ result: denied });
    }
    expectNoDispatch(service);
    for (const mock of Object.values(target)) expect(mock).not.toHaveBeenCalled();
  });

  it.each(controls)('blocks %s in legacy/correlated trees and $$sq before any sibling target dispatch', async (key) => {
    const { service, target } = fixture();
    for (const op of ['read', 'list', 'count']) {
      const entries = [
        { ...legacy, op },
        { ...legacy, op, options: { [key]: {} } },
      ];
      await expect(service.includeDocs([{ key: 1 }], entries)).rejects.toMatchObject({ result: denied });
      expect(() => service.processInclude(entries)).toThrow(PublicAdmissionError);
      await expect(
        service.includeCorrelatedDocs([{ key: 1 }], [{ ...correlated, op, options: { [key]: {} } }]),
      ).rejects.toMatchObject({ result: denied });
    }
    for (const op of ['read', 'list']) {
      await expect(
        service.parseClientData({
          first: { $$sq: { model: 'Target', op, filter: {} } },
          second: { $$sq: { model: 'Target', op, filter: {}, options: { [key]: {} } } },
        }),
      ).rejects.toMatchObject({ result: denied });
    }
    expect(service.getAuthorizedTargetService).not.toHaveBeenCalled();
    for (const mock of Object.values(target)) expect(mock).not.toHaveBeenCalled();
  });

  it.each(['read', 'list'] as const)(
    'forwards only supported legacy %s args/options through private prepared execution',
    async (op) => {
      const { service, target } = fixture();
      const model = {};
      const runtime = {};
      // SVA-04 authenticates the package executor registration, rather than
      // accepting a structural target/options token. Instrument that exact seam.
      registerServiceExecutors(target as never, {
        binding: () => ({ request: service.req, runtime, model, modelName: 'Target' }),
        configuration: () => ({ catalog: { paths: [] } }),
        permissions: () => new Permission({}),
        parse: (filter) => service.parseClientData(filter),
        validate: () => {},
        strip: (_execution, filter) => filter,
        identifier: vi.fn(),
        authorize: async (_execution, filter) => {
          const transformed = await target.genFilter(op, filter);
          return { transformed, scope: {}, filter: transformed };
        },
        find: (_execution, _query, filter, args, options) => target.find(filter, args, options) as never,
        findOne: (_execution, filter, args, options) => target.findOne(filter, args, options) as never,
        updateOne: vi.fn(),
        create: vi.fn(),
        exists: vi.fn(),
        count: vi.fn(),
        groupedCount: vi.fn(),
      });
      const nested = { ...correlated, path: 'nested', args: { select: ['overrides'] } };
      await service.includeDocs([{ key: 1 }], {
        ...legacy,
        op,
        filter: business,
        args: {
          select: ['authorization'],
          sort: { overrides: 1 },
          include: nested,
          limit: 2,
          unknownArg: true,
          [Symbol('arg')]: {},
        },
        options: {
          skim: true,
          populateAccess: 'list',
          lean: false,
          includePermissions: true,
          includeCount: true,
          unknownOption: true,
          [Symbol('option')]: {},
        },
      });
      const mock = op === 'list' ? target.find : target.findOne;
      expect(mock).toHaveBeenCalledOnce();
      const [filter, args, options] = mock.mock.calls[0] as unknown as [unknown, any, any];
      expect(filter).toMatchObject(business);
      expect(args.select).toEqual(['authorization']);
      expect(args.sort).toEqual({ overrides: 1 });
      expect(args.include).toEqual(nested);
      expect(args).not.toHaveProperty('unknownArg');
      expect(Object.getOwnPropertySymbols(args)).toEqual([]);
      expect(options).toMatchObject({
        skim: true,
        populateAccess: 'list',
        lean: true,
        includePermissions: false,
        includeFieldPermissions: false,
        authorization: { outputFields: { mode: 'request' } },
      });
      expect(options).not.toHaveProperty('unknownOption');
      expect(options).not.toHaveProperty('preparedQuery');
      expect(args).not.toHaveProperty('overrides');
      expect(target.genFilter).toHaveBeenCalledOnce();
      if (op === 'list') {
        expect(args.limit).toBe(2);
        expect(Object.getOwnPropertySymbols(options)).toHaveLength(1); // package association only
      } else {
        expect(args).not.toHaveProperty('limit');
        expect(args).not.toHaveProperty('overrides');
        expect(options.access).toBe('read');
        expect(Object.getOwnPropertySymbols(options)).toEqual([]);
      }
    },
  );

  it.each(['list', 'read', 'readById'])('allowlists $$sq %s and forces read fallback off', async (op) => {
    const { service, target } = fixture();
    await service.parseClientData({
      value: {
        $$sq: {
          model: 'Target',
          op: op === 'list' ? 'list' : 'read',
          ...(op === 'readById' ? { id: 'id' } : { filter: business }),
          args: {
            select: ['authorization'],
            sort: { overrides: 1 },
            tasks: { type: 'COPY', args: business },
            unknownArg: true,
          },
          options: { skim: true, lean: true, tryList: true, includeCount: true, unknownOption: true },
        },
      },
    });
    const mock = op === 'list' ? target._list : op === 'readById' ? target._read : target._readFilter;
    const [input, args, options] = mock.mock.calls[0] as unknown as [unknown, any, any];
    expect(input).toEqual(op === 'readById' ? 'id' : business);
    expect(args).toEqual({
      select: ['authorization'],
      sort: { overrides: 1 },
      tasks: { type: 'COPY', args: business },
    });
    expect(options).toEqual(
      op === 'list' ? { skim: true, lean: true, includeCount: true } : { skim: true, lean: true, tryList: false },
    );
  });

  it('guards populate and sub-populate before Core target admission or parent persistence', async () => {
    const core = Object.assign(Object.create(Core.prototype), {
      genSelect: vi.fn(),
      req: { macl: { isAllowed: vi.fn() } },
    });
    const { service } = fixture();
    service.captureVirtualSnapshot = vi.fn();
    for (const key of controls) {
      const populate = [{ path: 'customer', populate: { path: 'child', options: { [key]: {} } } }];
      await expect(core.genPopulate('Source', 'read', populate)).rejects.toMatchObject({ result: denied });
      expect(() => genSubPopulate('contacts', populate as never)).toThrow(PublicAdmissionError);
      expect(await readSub(service, 'id', 'contacts', 'subId', { populate } as never)).toMatchObject(denied);
      expect(await listSub(service, 'id', 'contacts', { [key]: {} } as never)).toMatchObject(denied);
      const persist = vi.fn();
      expect(
        await createSub(service, persist, vi.fn(), 'id', 'contacts', business, { [key]: {} } as never),
      ).toMatchObject(denied);
      expect(persist).not.toHaveBeenCalled();
    }
    expect(core.genSelect).not.toHaveBeenCalled();
    expect(core.req.macl.isAllowed).not.toHaveBeenCalled();
    expect(service.captureVirtualSnapshot).not.toHaveBeenCalled();
    expect(
      genSubPopulate('contacts', [{ path: 'authorization', select: ['overrides'], unknown: true } as never]),
    ).toEqual([{ path: 'contacts.authorization', select: ['overrides'] }]);
  });
});

let sequence = 0;
function httpFixture(requestSchemas = {}) {
  const api = createAccessRuntime();
  const modelName = `Sva01A${++sequence}`;
  const schema = new mongoose.Schema({
    authorization: mongoose.Schema.Types.Mixed,
    overrides: mongoose.Schema.Types.Mixed,
  });
  schema.plugin(permissionsPlugin, { modelName });
  const model = mongoose.model(modelName, schema);
  const router = api.createRouter(model, {
    basePath: '/models',
    operationAccess: true,
    permissionSchema: { authorization: true, overrides: true },
    requestSchemas,
  });
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  const app = express().use(express.json()).use(router.routes).use(root.routes);
  return { api, app, modelName, root };
}

describe('SVA-01A schemas, transformed envelopes, root dispatch and defaults', () => {
  it('rejects schema controls but preserves business data/projection names', () => {
    for (const key of controls) {
      for (const schema of [
        schemas.listBodySchema,
        schemas.readFilterBodySchema,
        schemas.readByIdBodySchema,
        schemas.advancedCreateBodySchema,
        schemas.advancedUpdateBodySchema,
        schemas.advancedUpsertBodySchema,
        schemas.countBodySchema,
        schemas.distinctBodySchema,
        schemas.subListBodySchema,
        schemas.subReadBodySchema,
      ]) {
        expect(schema.safeParse({ data: business, options: { [key]: {} } }).success).toBe(false);
        expect(schema.safeParse({ data: business, [key]: {} }).success).toBe(false);
      }
      for (const schema of [populateSchema, subPopulateSchema]) {
        expect(schema.safeParse([{ path: 'authorization', options: { [key]: {} } }]).success).toBe(false);
      }
      expect(
        rootQuerySchema.safeParse([{ target: 'model', name: 'M', op: 'list', options: { [key]: {} } }]).success,
      ).toBe(false);
    }
    expect(
      schemas.advancedCreateBodySchema.safeParse({ data: business, select: { authorization: 1, overrides: 1 } })
        .success,
    ).toBe(true);
    expect(schemas.createBodySchema.safeParse(business).success).toBe(true);
    expect(schemas.listBodySchema.safeParse({ filter: business, select: ['authorization', 'overrides'] }).success).toBe(
      true,
    );
  });

  it('checks transformed envelopes and nested-data validators with the original boundary kind', async () => {
    for (const transformed of [
      { options: { authorization: {} } },
      { overrides: {} },
      { include: { ...legacy, options: { execution: {} } } },
      { populate: [{ path: 'customer', options: { preparedQuery: {} } }] },
    ]) {
      await expect(
        parseBodyWithSchema(schemas.listBodySchema, {}, () => ({ success: true, data: transformed })),
      ).rejects.toMatchObject({ result: denied });
    }
    const transform = () => ({ success: true as const, data: business });
    expect(await parseBodyWithSchema(schemas.createBodySchema, {}, transform)).toEqual(business);
    expect(await parseNestedBodyWithSchema(schemas.advancedCreateBodySchema, { data: {} }, 'data', transform)).toEqual({
      data: business,
    });
    await expect(
      parseNestedBodyWithSchema(schemas.advancedCreateBodySchema, { data: {} }, 'data', () => ({
        success: true,
        data: { x: { $$sq: { model: 'Target', op: 'list', options: { authorization: {} } } } },
      })),
    ).rejects.toMatchObject({ result: denied });
  });

  it('enforces transformed advanced HTTP envelopes before public dispatch', async () => {
    const seam = vi.spyOn(PublicService.prototype, '_list').mockResolvedValue(list as never);
    const createSeam = vi.spyOn(PublicService.prototype, '_create').mockResolvedValue(list as never);
    const { app } = httpFixture({
      advancedList: () => ({ success: true, data: { options: { authorization: {} } } }),
      advancedCreate: () => ({ success: true, data: { data: business, execution: {} } }),
    });
    await request(app).post('/models/__query').send({}).expect(400);
    await request(app).post('/models/__mutation').send({ data: business }).expect(400);
    expect(seam).not.toHaveBeenCalled();
    expect(createSeam).not.toHaveBeenCalled();
  });

  it('preflights the entire root batch and independently guards root dispatch seams', async () => {
    const seam = vi.spyOn(PublicService.prototype, '_list').mockResolvedValue(list as never);
    const { app, modelName, root } = httpFixture();
    for (const key of controls) {
      await request(app)
        .post('/root')
        .send([
          { target: 'model', name: modelName, op: 'list' },
          { target: 'model', name: modelName, op: 'list', options: { [key]: {} } },
        ])
        .expect(400);
    }
    expect(seam).not.toHaveBeenCalled();
    const getPublicService = vi.fn();
    const direct = root as unknown as { processOp(req: unknown, item: unknown, index: number): Promise<any> };
    expect(
      (
        await direct.processOp(
          { macl: { getPublicService } },
          { target: 'model', name: modelName, op: 'new', args: { documentAuthorization: {} } },
          0,
        )
      ).result,
    ).toMatchObject({ success: false, code: Codes.BadRequest });
    expect(getPublicService).not.toHaveBeenCalled();
    await request(app)
      .post('/root')
      .send([
        {
          target: 'model',
          name: modelName,
          op: 'list',
          filter: business,
          args: { select: ['authorization'], limit: 2, unknownArg: true },
          options: { lean: true, unknownOption: true },
        },
      ])
      .expect(200);
    expect(seam.mock.calls[0]).toEqual([business, { select: ['authorization'], limit: 2 }, { lean: true }]);
  });

  it('rejects nested/dotted authority defaults atomically and keeps configured overrideFilter', async () => {
    const { api, modelName } = httpFixture();
    api.setModelOption(modelName, 'defaults.publicListOptions', { lean: true });
    for (const key of controls) {
      expect(() => api.setModelOptions(modelName, { defaults: { findOptions: { [key]: {} } } } as never)).toThrow(
        PublicAdmissionError,
      );
      expect(() => api.setModelOption(modelName, 'defaults.findOptions', { [key]: {} } as never)).toThrow(
        PublicAdmissionError,
      );
      expect(() => api.setModelOption(modelName, `defaults.createOptions.${key}` as never, {} as never)).toThrow(
        PublicAdmissionError,
      );
    }
    expect(api.getModelOption(modelName, 'defaults.publicListOptions')).toEqual({ lean: true });
    const hook = vi.fn((filter) => filter);
    api.setModelOption(modelName, 'overrideFilter.read', hook);
    expect(api.getModelOption(modelName, 'overrideFilter.read')).toBe(hook);
  });

  it('type-checks public/wire/nested/default declarations without new authority capabilities', () => {
    execFileSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve('typescript/bin/tsc'),
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        'test/service-authorization-boundary.types.fixture.ts',
      ],
      { cwd: path.resolve(import.meta.dirname, '..'), stdio: 'pipe' },
    );
  });
});
