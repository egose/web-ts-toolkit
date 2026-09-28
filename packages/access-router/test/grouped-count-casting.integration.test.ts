import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import acl, { setGlobalOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let counter = 0;
type Direction = 'ObjectId-to-String' | 'String-to-ObjectId';
type Entry = 'direct-list' | 'direct-read' | 'root-list' | 'root-read';
const noCalls = { find: 0, findOne: 0, countDocuments: 0, aggregate: 0 };

async function fixture(direction: Direction, arrays = false, parentCount = 24, policy = 'tenant') {
  const sourceName = `AbbCountSource${++counter}`;
  const targetName = `AbbCountTarget${counter}`;
  const tenant = new mongoose.Types.ObjectId();
  const region = new mongoose.Types.ObjectId();
  const otherTenant = new mongoose.Types.ObjectId();
  const keys = ['abcdef'.repeat(4), 'fedcba'.repeat(4), 'a'.repeat(24)];
  const sourceKeys =
    direction === 'ObjectId-to-String'
      ? keys.map((key) => new mongoose.Types.ObjectId(key))
      : keys.map((key) => key.toUpperCase());
  const foreignType = direction === 'ObjectId-to-String' ? String : mongoose.Schema.Types.ObjectId;
  const targetSchema = new mongoose.Schema({
    join: arrays ? [foreignType] : foreignType,
    tenant: mongoose.Schema.Types.ObjectId,
    region: mongoose.Schema.Types.ObjectId,
    visible: Boolean,
  });
  const calls = { ...noCalls };
  for (const op of ['find', 'findOne', 'countDocuments', 'aggregate'] as const) {
    targetSchema.pre(op, function () {
      calls[op] += 1;
    });
  }
  const Target = mongoose.model(targetName, targetSchema);
  // Mixed preserves parent ObjectIds and lets malformed stored operands reach the boundary.
  const Source = mongoose.model(sourceName, new mongoose.Schema({ name: String, join: mongoose.Schema.Types.Mixed }));
  setGlobalOptions({ requestComplexity: { maxBulkConcurrency: 1 }, globalPermissions: () => [] });
  const sourceRouter = acl.createRouter(sourceName, {
    basePath: '/grouped-count',
    listHardLimit: 100,
    operationAccess: { list: true, read: true },
    permissionSchema: { name: true, join: true },
  });
  acl.createRouter(targetName, {
    listHardLimit: 2,
    operationAccess: { count: policy !== 'guard-denied', read: false, list: false },
    permissionSchema: { join: true },
    baseFilter: {
      count: () =>
        policy === 'row-denied'
          ? false
          : {
              $and: [{ tenant: policy === 'malformed-tenant' ? 'invalid-tenant' : String(tenant) }, { visible: true }],
            },
      list: () => ({ tenant: otherTenant }),
      read: () => ({ tenant: otherTenant }),
    },
  });
  const rootRouter = acl.createRouter({ basePath: '/root', operationAccess: true });
  sourceRouter.router.post('/internal/count', async (req, res) => {
    const service = req.macl.getPublicService(targetName);
    const result = await service.countByFieldValues('join', req.body.values, req.body.filter ?? {}, 'count');
    res.json(
      result.success ? { ...result, data: Array.from(result.data, ([key, ids]) => [key, Array.from(ids)]) } : result,
    );
  });
  const app = express();
  app.use(express.json());
  app.use(sourceRouter.routes);
  app.use(rootRouter.routes);

  const sources = await Source.create(
    Array.from({ length: parentCount }, (_, i) => ({
      name: `parent-${i.toString().padStart(2, '0')}`,
      join: arrays
        ? i % 3 === 0
          ? [sourceKeys[0], sourceKeys[0], sourceKeys[1]]
          : [sourceKeys[i % 3]]
        : sourceKeys[i % 3],
    })),
  );
  const targets = Array.from({ length: 9 }, () => ({
    join: arrays ? [keys[0], keys[0], keys[1]] : keys[0],
    tenant,
    region,
    visible: true,
  }));
  targets.push({ join: arrays ? [keys[1]] : keys[1], tenant, region, visible: true });
  targets.push({ join: arrays ? [keys[0]] : keys[0], tenant: otherTenant, region, visible: true });
  targets.push({ join: arrays ? [keys[0]] : keys[0], tenant, region, visible: false });
  targets.push({ join: arrays ? [keys[0]] : keys[0], tenant, region: new mongoose.Types.ObjectId(), visible: true });
  await Target.create(targets);

  const include = {
    model: targetName,
    op: 'count',
    path: 'total',
    localField: 'join',
    foreignField: 'join',
    filter: { region: String(region) },
    args: { limit: 1, skip: 100, overrides: { filter: {} } },
  };
  async function invoke(entry: Entry, filter?: object) {
    const isList = entry.endsWith('list');
    const sourceFilter = filter ?? (isList ? {} : { _id: String(sources[0]._id) });
    if (entry.startsWith('root')) {
      return request(app)
        .post('/root')
        .send([
          {
            target: 'model',
            name: sourceName,
            op: isList ? 'list' : 'read',
            filter: sourceFilter,
            args: { include, sort: { name: 1 } },
          },
        ]);
    }
    return request(app)
      .post(isList ? '/grouped-count/__query' : '/grouped-count/__query/__filter')
      .send({ filter: sourceFilter, include, sort: { name: 1 } });
  }
  async function expected(join: unknown) {
    // Ordinary owning-model query casting, with the same explicit count policy.
    return Target.countDocuments({
      $and: [{ tenant: String(tenant) }, { visible: true }],
      region: String(region),
      join: { $in: Array.isArray(join) ? join : [join] },
    });
  }
  return { app, Source, Target, sources, sourceKeys, calls, invoke, expected, include, region };
}

function rows(entry: Entry, response: request.Response) {
  expect(response.status).toBe(200);
  const result = entry.startsWith('root') ? response.body[0].result : response.body;
  if (entry.startsWith('root')) expect(result.success).toBe(true);
  return entry.endsWith('list') ? result.data : [entry.startsWith('root') ? result.data : result];
}

afterEach(() => {
  setGlobalOptions({ requestComplexity: {}, globalPermissions: () => [] });
  mongoose.deleteModel(/^AbbCount/);
});

describe('grouped include count schema casting (ABB-05)', () => {
  for (const direction of ['ObjectId-to-String', 'String-to-ObjectId'] as const) {
    for (const arrays of [false, true]) {
      it.each(['direct-list', 'direct-read', 'root-list', 'root-read'] as const)(
        `${direction}, ${arrays ? 'duplicate arrays' : 'scalar'}: %s equals authorized countDocuments`,
        async (entry) => {
          const f = await fixture(direction, arrays);
          const actual = rows(entry, await f.invoke(entry));
          expect(actual).toHaveLength(entry.endsWith('list') ? 24 : 1);
          expect(f.calls).toEqual({ ...noCalls, aggregate: 1 });
          for (let i = 0; i < actual.length; i++) {
            const expected = await f.expected(f.sources[i].join);
            expect(actual[i].total, actual[i].name).toBe(expected);
          }
          expect(actual[0].total).toBe(arrays ? 10 : 9); // > target listHardLimit and include limit
          if (entry.endsWith('list')) expect(actual[2].total).toBe(0);
        },
      );
    }
  }

  it.each([1, 40])('uses one aggregate and no target count/list queries for %i parents', async (size) => {
    const f = await fixture('String-to-ObjectId', true, size);
    const actual = rows('direct-list', await f.invoke('direct-list'));
    expect(actual).toHaveLength(size);
    expect(f.calls).toEqual({ ...noCalls, aggregate: 1 });
    expect(actual[0].total).toBe(await f.expected(f.sources[0].join));
    expect(actual[0].total).toBe(10);
  });

  it('maps both uppercase and lowercase aliases back to parent keys and deduplicates their union', async () => {
    const f = await fixture('String-to-ObjectId', true);
    const key = String(f.sourceKeys[0]);
    await f.Source.updateOne({ _id: f.sources[0]._id }, { join: [key, key.toLowerCase(), key] });
    const actual = rows('direct-read', await f.invoke('direct-read'))[0];
    expect(f.calls).toEqual({ ...noCalls, aggregate: 1 });
    expect(actual.total).toBe(await f.expected([key, key.toLowerCase(), key]));
    expect(actual.total).toBe(9);
  });

  it('uses String query setters and maps the normalized result back to the original parent', async () => {
    const f = await fixture('ObjectId-to-String', false, 1);
    f.Target.schema.path('join').set((value: string) => value.toLowerCase());
    const key = String(f.sourceKeys[0]).toUpperCase();
    await f.Source.updateOne({}, { join: key });
    const actual = rows('direct-read', await f.invoke('direct-read'))[0];
    expect(f.calls).toEqual({ ...noCalls, aggregate: 1 });
    expect(actual.total).toBe(await f.expected(key));
    expect(actual.total).toBe(9);
  });

  it('returns zero for an empty parent key array without falling back to list queries', async () => {
    const f = await fixture('String-to-ObjectId', true, 1);
    await f.Source.updateOne({}, { join: [] });
    const actual = rows('direct-read', await f.invoke('direct-read'))[0];
    expect(f.calls).toEqual({ ...noCalls, aggregate: 1 });
    expect(actual.total).toBe(await f.expected([]));
    expect(actual.total).toBe(0);
  });

  it.each(['direct-list', 'root-list'] as const)(
    'denied count operation performs no target work: %s',
    async (entry) => {
      const f = await fixture('String-to-ObjectId', false, 1, 'guard-denied');
      const response = await f.invoke(entry);
      if (entry === 'direct-list') expect(response.status).toBe(401);
      else expect(response.body[0]).toMatchObject({ statusCode: 401, result: { success: false } });
      expect(f.calls).toEqual(noCalls);
    },
  );

  it('terminal false count policy skips casting malformed keys and performs no target work', async () => {
    const f = await fixture('String-to-ObjectId', false, 1, 'row-denied');
    await f.Source.updateOne({}, { join: 'invalid-object-id' });
    const actual = rows('direct-list', await f.invoke('direct-list'));
    expect(actual[0].total).toBeUndefined();
    const response = await request(f.app)
      .post('/grouped-count/internal/count')
      .send({ values: ['invalid'] })
      .expect(200);
    expect(response.body).toMatchObject({ success: false, code: 'forbidden' });
    expect(f.calls).toEqual(noCalls);
  });

  for (const malformed of ['parent', 'tenant', 'filter', 'operator-object'] as const) {
    it.each(['direct-list', 'direct-read', 'root-list', 'root-read'] as const)(
      `returns controlled BadRequest before persistence for malformed ${malformed}: %s`,
      async (entry) => {
        const f = await fixture('String-to-ObjectId', false, 1, malformed === 'tenant' ? 'malformed-tenant' : 'tenant');
        if (malformed === 'parent' || malformed === 'operator-object') {
          await f.Source.updateOne({}, { join: malformed === 'parent' ? 'invalid-object-id' : { $gt: '' } });
        }
        if (malformed === 'filter') f.include.filter.region = 'invalid-region';
        const response = await f.invoke(entry);
        if (entry.startsWith('direct')) {
          expect(response.status).toBe(400);
          expect(response.headers['content-type']).toContain('application/problem+json');
        } else
          expect(response.body[0]).toMatchObject({ statusCode: 400, result: { success: false, code: 'bad_request' } });
        expect(f.calls).toEqual(noCalls);
      },
    );
  }

  it('returns controlled cast failure from the grouped service method itself', async () => {
    const f = await fixture('String-to-ObjectId');
    const response = await request(f.app)
      .post('/grouped-count/internal/count')
      .send({ values: [f.sourceKeys[0], 'invalid-object-id'], filter: { region: String(f.region) } })
      .expect(200);
    expect(response.body).toMatchObject({ success: false, code: 'bad_request' });
    expect(f.calls).toEqual(noCalls);
  });
});
