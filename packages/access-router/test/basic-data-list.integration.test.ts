import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createAccessRuntime, type DataRouterOptions } from '../dist/index.mjs';

const visibleRows = [
  { id: 'delta', name: 'delta', publicRank: 2, secondaryRank: 1 },
  { id: 'bravo', name: 'bravo', publicRank: 1, secondaryRank: 1 },
  { id: 'echo', name: 'echo', publicRank: 3, secondaryRank: 1 },
  { id: 'alpha', name: 'alpha', publicRank: 1, secondaryRank: 2 },
  { id: 'charlie', name: 'charlie', publicRank: 2, secondaryRank: 2 },
];
type Row = (typeof visibleRows)[number] & { tenant: string; secretRank: number };

function fixture(options: DataRouterOptions<Row> = {}) {
  const runtime = createAccessRuntime();
  runtime.setGlobalOptions({ globalPermissions: () => [] });
  const listFilter = vi.fn(() => ({ tenant: 'visible' }));
  const decorate = vi.fn((doc) => doc);
  const router = runtime.createDataRouter<Row>('BasicDataList', {
    basePath: '/records',
    idField: 'id',
    operationAccess: { list: true, read: true },
    data: [
      { id: 'low', name: 'aardvark', publicRank: 0, secondaryRank: 0, tenant: 'hidden', secretRank: 0 },
      ...visibleRows.map((row, index) => ({ ...row, tenant: 'visible', secretRank: index + 1 })),
      { id: 'high', name: 'zulu', publicRank: 99, secondaryRank: 99, tenant: 'hidden', secretRank: 99 },
    ],
    permissionSchema: {
      id: true,
      name: true,
      publicRank: true,
      secondaryRank: true,
      secretRank: { list: false, read: true },
      tenant: false,
    },
    baseFilter: { list: listFilter },
    decorate: { list: decorate },
    ...options,
  });
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  return { app, listFilter, decorate };
}

describe('ARL-06 basic GET data list query parity', () => {
  it.each([
    { label: 'single field', select: 'name', fields: ['name'], expected: { name: 'delta' } },
    {
      label: 'comma-separated fields',
      select: 'name,publicRank,secretRank',
      fields: ['name', 'publicRank', 'secretRank'],
      expected: { name: 'delta', publicRank: 2 },
    },
    {
      label: 'whitespace-separated fields',
      select: '  name   publicRank secretRank  ',
      fields: ['name', 'publicRank', 'secretRank'],
      expected: { name: 'delta', publicRank: 2 },
    },
    {
      label: 'repeated parameters with mixed separators',
      select: [' name, publicRank ', 'secretRank'],
      fields: ['name', 'publicRank', 'secretRank'],
      expected: { name: 'delta', publicRank: 2 },
    },
  ])(
    'normalizes $label and omits other allowed fields like the advanced list',
    async ({ select, fields, expected }) => {
      const { app } = fixture();
      const post = await request(app).post('/records/__query').send({ select: fields, limit: 1 }).expect(200);
      expect(post.body.data).toEqual([expected]);
      const get = await request(app).get('/records').query({ select, limit: 1 }).expect(200);
      expect(get.body.data).toEqual([expected]);
      expect(get.body).toEqual(post.body);
    },
  );

  it.each([
    {
      sort: 'name',
      advancedSort: 'name',
      queryPage: { skip: 1, limit: 2 },
      bodyPage: { skip: 1, limit: 2 },
      skip: 1,
      names: ['bravo', 'charlie'],
    },
    {
      sort: '-name',
      advancedSort: '-name',
      queryPage: { skip: 1, limit: 2 },
      bodyPage: { skip: 1, limit: 2 },
      skip: 1,
      names: ['delta', 'charlie'],
    },
    {
      sort: ' publicRank   -secondaryRank ',
      advancedSort: { publicRank: 1, secondaryRank: -1 },
      queryPage: { page: 2, page_size: 2 },
      bodyPage: { page: 2, pageSize: 2 },
      skip: 2,
      names: ['charlie', 'delta'],
    },
    {
      sort: '-publicRank secondaryRank',
      advancedSort: [
        ['publicRank', -1],
        ['secondaryRank', 1],
      ],
      queryPage: { page: 2, page_size: 2 },
      bodyPage: { page: 2, pageSize: 2 },
      skip: 2,
      names: ['charlie', 'bravo'],
    },
  ])('sorts $sort before pagination and selection, retaining filtered totals', async (testCase) => {
    const { app, decorate } = fixture();
    const { sort, advancedSort, queryPage, bodyPage, skip, names } = testCase;
    const expected = names.map((name) => ({ name }));
    const post = await request(app)
      .post('/records/__query')
      .send({
        select: ['name'],
        sort: advancedSort,
        ...bodyPage,
        options: { includeCount: true, includeExtraHeaders: true },
      })
      .expect(200);
    expect(post.body.data).toEqual(expected);
    const get = await request(app)
      .get('/records')
      .query({ select: 'name', sort, ...queryPage, include_count: 'true', include_extra_headers: 'true' })
      .expect(200);
    expect(get.body.data.map((row: Row) => row.name)).toEqual(names);
    expect(get.body.data).toEqual(expected);
    expect(get.body).toEqual(post.body);
    for (const response of [get, post]) {
      expect(response.body.meta).toMatchObject({ returnedCount: 2, totalCount: 5, skip, limit: 2 });
      expect(response.headers['wtt-total-count']).toBe('5');
      expect(response.headers['wtt-returned-count']).toBe('2');
    }
    expect(decorate.mock.calls.map(([row]) => row)).toEqual([...expected, ...expected]);
  });

  it('retains the filtered total on an empty page', async () => {
    const { app, decorate } = fixture();
    const args = { select: 'name', sort: '-name', skip: 20, limit: 2 };
    const post = await request(app)
      .post('/records/__query')
      .send({ ...args, options: { includeCount: true } })
      .expect(200);
    const get = await request(app)
      .get('/records')
      .query({ ...args, include_count: 'true' })
      .expect(200);
    expect(get.body).toEqual(post.body);
    expect(get.body.data).toEqual([]);
    expect(get.body.meta).toMatchObject({ returnedCount: 0, totalCount: 5, skip: 20, limit: 2 });
    expect(decorate).not.toHaveBeenCalled();
  });

  it('keeps omitted options in configuration order with all list-allowed fields and no count metadata', async () => {
    const { app } = fixture();
    const get = await request(app).get('/records').expect(200);
    const post = await request(app).post('/records/__query').send({}).expect(200);
    expect(get.body).toEqual({
      data: visibleRows,
      meta: { returnedCount: 5, skip: 0, limit: 5, page: 1, pageSize: 5, hasPreviousPage: false },
    });
    expect(get.body).toEqual(post.body);
    expect(get.headers).not.toHaveProperty('wtt-total-count');
  });

  it.each(['', '-name', 'secretRank'])(
    'preserves data empty-intersection compatibility for select=%j',
    async (select) => {
      const { app } = fixture();
      const post = await request(app).post('/records/__query').send({ select }).expect(200);
      const get = await request(app).get('/records').query({ select }).expect(200);
      expect(get.body.data).toEqual(visibleRows);
      expect(get.body).toEqual(post.body);
    },
  );

  it.each([
    { sort: '-secretRank', field: 'secretRank' },
    { sort: 'name -secretRank', field: 'secretRank' },
    { sort: 'missingRank', field: 'missingRank' },
  ])('rejects list-denied sort $sort on both routes before decoration', async ({ sort, field }) => {
    const { app, decorate } = fixture();
    const args = { select: 'name', sort, limit: 1 };
    const post = await request(app).post('/records/__query').send(args).expect(400);
    expect(post.body.errors).toEqual([{ detail: `Sort field is not allowed: ${field}`, pointer: '#/sort' }]);
    const get = await request(app).get('/records').query(args).expect(400);
    expect(get.body.errors).toEqual(post.body.errors);
    expect(decorate).not.toHaveBeenCalled();
  });

  it.each(['$where', 'name,-publicRank', '-'])('rejects malformed sort %j like the advanced list', async (sort) => {
    const { app, decorate } = fixture();
    const post = await request(app).post('/records/__query').send({ sort }).expect(400);
    expect(post.body.errors).toEqual([{ detail: `Invalid sort field: ${sort}`, pointer: '#/sort' }]);
    const get = await request(app).get('/records').query({ sort }).expect(400);
    expect(get.body.errors).toEqual(post.body.errors);
    expect(decorate).not.toHaveBeenCalled();
  });

  it('rejects repeated sort parameters at query validation before list policy runs', async () => {
    const { app, listFilter, decorate } = fixture();
    const response = await request(app).get('/records?sort=name&sort=-publicRank').expect(400);
    expect(response.body.errors).toContainEqual(expect.objectContaining({ parameter: 'sort' }));
    expect(listFilter).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'omitted limit', query: {}, args: {} },
    { label: 'oversized limit', query: { limit: 50 }, args: { limit: 50 } },
    { label: 'oversized page_size', query: { page_size: 50 }, args: { pageSize: 50 } },
  ])('retains the configured finite cap with $label', async ({ query, args }) => {
    const { app } = fixture({ listHardLimit: 2 });
    const post = await request(app)
      .post('/records/__query')
      .send({ select: 'name', sort: 'name', ...args, options: { includeCount: true } })
      .expect(200);
    const get = await request(app)
      .get('/records')
      .query({ select: 'name', sort: 'name', ...query, include_count: 'true' })
      .expect(200);
    expect(post.body.data).toEqual([{ name: 'alpha' }, { name: 'bravo' }]);
    expect(get.body.data).toEqual(post.body.data);
    expect(get.body).toEqual(post.body);
    expect(get.body.meta).toMatchObject({ returnedCount: 2, totalCount: 5, limit: 2, hasNextPage: true });
  });

  it('retains the default 1000-row cap after sorting when no request limit is supplied', async () => {
    const { app } = fixture({
      data: Array.from({ length: 1001 }, (_, index) => ({
        id: `row-${index}`,
        name: `row-${index}`,
        publicRank: index,
        secondaryRank: 0,
        secretRank: index,
        tenant: 'visible',
      })),
    });
    const args = { select: 'publicRank', sort: '-publicRank' };
    const post = await request(app)
      .post('/records/__query')
      .send({ ...args, options: { includeCount: true } })
      .expect(200);
    const get = await request(app)
      .get('/records')
      .query({ ...args, include_count: 'true' })
      .expect(200);
    for (const response of [post, get]) {
      expect(response.body.data).toHaveLength(1000);
      expect(response.body.data[0]).toEqual({ publicRank: 1000 });
      expect(response.body.data.at(-1)).toEqual({ publicRank: 1 });
      expect(response.body.meta).toMatchObject({ returnedCount: 1000, totalCount: 1001, limit: 1000 });
    }
    expect(get.body).toEqual(post.body);
  });

  it.each(['basic', 'advanced'] as const)(
    'keeps the %s list gate independent and ahead of validation',
    async (denied) => {
      const { app, listFilter, decorate } = fixture({
        operationAccess: { list: true, [denied === 'basic' ? 'basicList' : 'advancedList']: false },
      });
      const invalid = { select: 'name', sort: '$where', limit: 0 };
      const deniedRequest =
        denied === 'basic'
          ? request(app).get('/records').query(invalid)
          : request(app).post('/records/__query').send(invalid);
      await deniedRequest.expect(401);
      expect(listFilter).not.toHaveBeenCalled();
      expect(decorate).not.toHaveBeenCalled();

      const args = { select: 'name', sort: '-name', limit: 1 };
      const allowedRequest =
        denied === 'basic'
          ? request(app).post('/records/__query').send(args)
          : request(app).get('/records').query(args);
      const response = await allowedRequest.expect(200);
      expect(response.body.data).toEqual([{ name: 'echo' }]);
      expect(listFilter).toHaveBeenCalledTimes(1);
      expect(decorate).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps terminal row denial ahead of sort authorization on both routes', async () => {
    const { app, decorate } = fixture({ baseFilter: { list: () => false } });
    const args = { select: 'name', sort: '$where' };
    await request(app).post('/records/__query').send(args).expect(403);
    await request(app).get('/records').query(args).expect(403);
    expect(decorate).not.toHaveBeenCalled();
  });
});
