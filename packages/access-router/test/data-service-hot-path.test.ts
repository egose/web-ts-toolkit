import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import acl, { setGlobalOptions } from '../dist/index.mjs';

let modelCounter = 0;

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });
};

afterEach(() => {
  resetGlobalOptions();
});

describe('AR-18 optimize data list hot paths', () => {
  it('decorate hook is only invoked on the returned page, not the entire matching dataset', async () => {
    const dataName = `AclDataHotPathFruit${++modelCounter}`;
    const decorateAllSpy = vi.fn((docs: unknown[]) => docs);

    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
    });

    const dataset = Array.from({ length: 50 }, (_, i) => ({
      id: `fruit-${i + 1}`,
      name: `Fruit ${i + 1}`,
      public: i % 2 === 0,
    }));

    const router = acl.createDataRouter(dataName, {
      basePath: '/hot-path-fruit',
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: dataset,
      permissionSchema: { id: true, name: true, public: true },
      decorateAll: decorateAllSpy,
    });

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    const response = await request(app)
      .post('/hot-path-fruit/__query')
      .send({ skip: 0, limit: 1, options: { includeCount: true, includeExtraHeaders: false } })
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect((response.body.data[0] as Record<string, unknown>).id).toBe('fruit-1');
    expect(response.body.meta.returnedCount).toBe(1);
    expect(response.body.meta.totalCount).toBe(dataset.length);

    // decorateAll sees only the single returned row, not the entire dataset.
    expect(decorateAllSpy).toHaveBeenCalledTimes(1);
    const received_docs = decorateAllSpy.mock.calls[0]?.[0];
    expect(Array.isArray(received_docs)).toBe(true);
    expect(received_docs).toHaveLength(1);
  });

  it('sort semantics are preserved when trimming runs only on the returned page', async () => {
    const dataName = `AclDataHotPathSort${++modelCounter}`;

    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
    });

    const dataset = Array.from({ length: 12 }, (_, i) => ({
      id: `f-${i + 1}`,
      name: `P-${String.fromCharCode(97 + i)}`, // P-a .. P-l
      rank: 12 - i, // descending rank
      public: true,
    }));

    const router = acl.createDataRouter(dataName, {
      basePath: '/hot-path-sort',
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: dataset,
      permissionSchema: { id: true, name: true, rank: true, public: true },
    });

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    const ascResponse = await request(app).post('/hot-path-sort/__query').send({ sort: 'rank', limit: 3 }).expect(200);

    expect((ascResponse.body.data as Array<{ rank: number }>).map((d) => d.rank)).toEqual([1, 2, 3]);

    const descResponse = await request(app)
      .post('/hot-path-sort/__query')
      .send({ sort: '-rank', limit: 3 })
      .expect(200);

    expect((descResponse.body.data as Array<{ rank: number }>).map((d) => d.rank)).toEqual([12, 11, 10]);
  });

  it('count fields keep reflecting the full matching dataset, not the trimmed page', async () => {
    const dataName = `AclDataHotPathCount${++modelCounter}`;

    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
    });

    const dataset = Array.from({ length: 40 }, (_, i) => ({
      id: `g-${i + 1}`,
      group: i < 30 ? 'A' : 'B',
      public: true,
    }));

    const router = acl.createDataRouter(dataName, {
      basePath: '/hot-path-count',
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: dataset,
      permissionSchema: { id: true, group: true, public: true },
    });

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    const response = await request(app)
      .post('/hot-path-count/__query')
      .send({
        filter: { group: 'A' },
        limit: 5,
        options: { includeCount: true },
      })
      .expect(200);

    expect(response.body.data).toHaveLength(5);
    expect(response.body.meta.totalCount).toBe(30);
    expect(response.body.meta.returnedCount).toBe(5);
  });

  it('rejects sorting by a denied/malformed field before ordering (ARF-06)', async () => {
    const dataName = `AclDataSortAuth${++modelCounter}`;

    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
    });

    const dataset = Array.from({ length: 12 }, (_, i) => ({
      id: `s-${i + 1}`,
      name: `N-${i}`,
      secret: `hidden-${i}`, // pragma: allowlist secret
      secretRank: 12 - i,
      public: true,
    }));

    const router = acl.createDataRouter(dataName, {
      basePath: '/sort-auth',
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: dataset,
      permissionSchema: {
        id: true,
        name: true,
        public: true,
        // secret and secretRank are not in the permission schema — denied.
      },
    });

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    // Sorting by a denied field must be rejected before ordering.
    const deniedField = await request(app)
      .post('/sort-auth/__query')
      .send({ sort: 'secret', limit: 3 })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(deniedField.body.status).toBe(400);
    expect(deniedField.body.errors[0].detail).toContain('Sort field is not allowed: secret');

    const deniedDescField = await request(app)
      .post('/sort-auth/__query')
      .send({ sort: '-secretRank', limit: 3 })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(deniedDescField.body.errors[0].detail).toContain('Sort field is not allowed: secretRank');

    // Malformed field paths are rejected.
    const malformed = await request(app)
      .post('/sort-auth/__query')
      .send({ sort: '$where', limit: 3 })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(malformed.body.errors[0].detail).toContain('Invalid sort field');

    // Permitted ascending and descending sort remains deterministic.
    const ascOk = await request(app).post('/sort-auth/__query').send({ sort: 'name', limit: 3 }).expect(200);
    expect((ascOk.body.data as Array<{ name: string }>).map((d) => d.name)).toEqual(['N-0', 'N-1', 'N-10']);

    const descOk = await request(app).post('/sort-auth/__query').send({ sort: '-name', limit: 3 }).expect(200);
    expect((descOk.body.data as Array<{ name: string }>).map((d) => d.name)).toEqual(['N-9', 'N-8', 'N-7']);
  });
});
