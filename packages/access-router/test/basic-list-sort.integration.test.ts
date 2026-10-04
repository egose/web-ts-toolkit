import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createAccessRuntime, permissionsPlugin, type ModelRouterOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type Row = { name: string; publicRank: number; secondaryRank: number; secretRank: number };
let counter = 0;

async function fixture(options: ModelRouterOptions<Row> = {}) {
  const runtime = createAccessRuntime();
  runtime.setGlobalOptions({ globalPermissions: () => [] });
  const modelName = `BasicListSort${++counter}`;
  const sorts: unknown[] = [];
  const schema = new mongoose.Schema<Row>({
    name: String,
    publicRank: Number,
    secondaryRank: Number,
    secretRank: Number,
  });
  schema.pre('find', function () {
    sorts.push(this.getOptions().sort);
  });
  schema.plugin(permissionsPlugin, { modelName });
  const User = mongoose.model(modelName, schema);
  const router = runtime.createRouter(User, {
    basePath: '/users',
    operationAccess: { list: true, read: true },
    permissionSchema: {
      name: { list: true, read: true },
      publicRank: { list: true, read: true },
      secondaryRank: { list: true, read: true },
      secretRank: { list: false, read: false },
    },
    ...options,
  });
  await User.create([
    { name: 'alpha', publicRank: 2, secondaryRank: 2, secretRank: 1 },
    { name: 'bravo', publicRank: 1, secondaryRank: 1, secretRank: 3 },
    { name: 'charlie', publicRank: 1, secondaryRank: 3, secretRank: 2 },
  ]);
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  return { app, sorts };
}

describe('basic GET model list sorting', () => {
  it.each([
    ['name', ['alpha', 'bravo', 'charlie']],
    ['-name', ['charlie', 'bravo', 'alpha']],
    ['publicRank -secondaryRank', ['charlie', 'bravo', 'alpha']],
    ['-publicRank secondaryRank', ['alpha', 'bravo', 'charlie']],
  ])('sorts GET and advanced list identically with %s', async (sort, names) => {
    const { app } = await fixture();
    const get = await request(app).get('/users').query({ sort }).expect(200);
    const post = await request(app).post('/users/__query').send({ sort }).expect(200);
    expect(get.body.data.map((row: Row) => row.name)).toEqual(names);
    expect(post.body.data.map((row: Row) => row.name)).toEqual(names);
  });

  it('sorts before pagination without selecting the ordering fields or changing total counts', async () => {
    const { app, sorts } = await fixture();
    const response = await request(app)
      .get('/users')
      .query({
        select: 'name',
        sort: 'publicRank -secondaryRank',
        skip: 1,
        limit: 1,
        include_count: 'true',
      })
      .expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('bravo');
    expect(response.body.data[0]).not.toHaveProperty('publicRank');
    expect(response.body.data[0]).not.toHaveProperty('secondaryRank');
    expect(response.body.meta.totalCount).toBe(3);
    expect(sorts).toEqual([{ publicRank: 1, secondaryRank: -1 }]);
  });

  it('rejects a disallowed field before Mongoose query execution', async () => {
    const { app, sorts } = await fixture();
    const response = await request(app).get('/users').query({ sort: '-secretRank' }).expect(400);
    expect(response.body.errors[0]).toMatchObject({
      detail: 'Sort field is not allowed: secretRank',
      pointer: '#/sort',
    });
    expect(sorts).toEqual([]);
  });

  it('honors sortableFields without exposing an otherwise hidden field', async () => {
    const { app, sorts } = await fixture({ sortableFields: ['secretRank'] });
    const response = await request(app).get('/users').query({ sort: '-secretRank' }).expect(200);
    expect(response.body.data.map((row: Row) => row.name)).toEqual(['bravo', 'charlie', 'alpha']);
    for (const row of response.body.data) expect(row).not.toHaveProperty('secretRank');
    expect(sorts).toEqual([{ secretRank: -1 }]);
  });

  it('omits disallowed sort keys under stripDisallowedSort while retaining permitted order', async () => {
    const { app, sorts } = await fixture({ stripDisallowedSort: true });
    const mixed = await request(app).get('/users').query({ sort: '-secretRank publicRank -name' }).expect(200);
    expect(mixed.body.data.map((row: Row) => row.name)).toEqual(['charlie', 'bravo', 'alpha']);
    const denied = await request(app).get('/users').query({ sort: '-secretRank' }).expect(200);
    expect(denied.body.data).toHaveLength(3);
    expect(sorts).toEqual([{ publicRank: 1, name: -1 }, undefined]);
  });

  it.each(['$where', 'name,-publicRank', '-'])('rejects malformed sort %s even under strip mode', async (sort) => {
    const { app, sorts } = await fixture({ stripDisallowedSort: true });
    const response = await request(app).get('/users').query({ sort }).expect(400);
    expect(response.body.errors[0]).toMatchObject({ pointer: '#/sort' });
    expect(response.body.errors[0].detail).toContain('Invalid sort field');
    expect(sorts).toEqual([]);
  });

  it('rejects repeated sort params instead of silently dropping their priority', async () => {
    const { app, sorts } = await fixture();
    const response = await request(app).get('/users?sort=name&sort=-publicRank').expect(400);
    expect(response.body.errors).toContainEqual(expect.objectContaining({ parameter: 'sort' }));
    expect(sorts).toEqual([]);
  });

  it('keeps backend defaults when sort is absent and suppresses them for explicit empty sort', async () => {
    const { app, sorts } = await fixture({ defaults: { publicListArgs: { sort: '-name' } } });
    const inherited = await request(app).get('/users').expect(200);
    expect(inherited.body.data.map((row: Row) => row.name)).toEqual(['charlie', 'bravo', 'alpha']);
    await request(app).get('/users?sort=').expect(200);
    expect(sorts).toEqual([{ name: -1 }, undefined]);
  });
});
