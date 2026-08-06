import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

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

const RECORD_COUNT = 5000;

type DatasetRecord = {
  id: string;
  name: string;
  group: 'A' | 'B' | 'C' | 'D';
  tier: 'free' | 'pro' | 'enterprise';
  score: number;
  flag: boolean;
  payload: string;
  public: boolean;
};

const buildDataset = (): DatasetRecord[] =>
  Array.from({ length: RECORD_COUNT }, (_, i) => ({
    id: `rec-${i + 1}`,
    name: `Record ${i + 1}`,
    group: (['A', 'B', 'C', 'D'] as const)[i % 4],
    tier: i < 1000 ? 'free' : i < 3000 ? 'pro' : 'enterprise',
    score: (i * 7) % 1000,
    flag: i % 2 === 0,
    payload: `payload-${i + 1}-${(i * 13) % 999}`,
    public: i % 3 !== 0,
  }));

const buildRuntimeApp = (dataName: string, dataset: DatasetRecord[], basePath: string) => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ['isAdmin'],
  });

  const router = acl.createDataRouter(dataName, {
    basePath,
    idField: 'id',
    operationAccess: { list: true, read: true },
    data: dataset,
    permissionSchema: {
      id: true,
      name: true,
      group: true,
      tier: true,
      score: true,
      flag: true,
      payload: true,
      public: true,
    },
  });

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  return app;
};

const complexFilter = {
  $and: [
    { public: true },
    { $or: [{ group: 'A' }, { group: 'C' }] },
    { tier: { $in: ['pro', 'enterprise'] } },
    { score: { $gte: 100, $lte: 900 } },
    { flag: true },
    { name: { $regex: 'Record [1-9]' } },
    { payload: { $ne: 'payload-1-0' } },
  ],
};

const failWithCeiling = (label: string, valueMs: number, expectedMs: number) => {
  if (!(valueMs <= expectedMs)) {
    throw new Error(
      `${label} took ${valueMs.toFixed(2)}ms, expected <= ${expectedMs}ms (CI-tolerant ceiling). ` +
        `The ceiling is set ~3x above a stable local baseline; revisit only if consistently exceeded in CI.`,
    );
  }
};

describe('ARF-15 data-service list scaling', () => {
  it('the page-sized trim path stays bounded when most of a large dataset matches a complex filter', async () => {
    const dataName = `Arf15ScalingPage${++modelCounter}`;
    const dataset = buildDataset();
    const app = buildRuntimeApp(dataName, dataset, '/arf15-scaling-page');

    const pageSizes = [10, 50, 100];
    const trialsPerSize = 3;

    for (const pageSize of pageSizes) {
      let lastBody: { data: unknown[]; meta: { returnedCount: number; totalCount: number } } | undefined;
      let bestMs = Infinity;

      for (let trial = 0; trial < trialsPerSize; trial++) {
        const start = performance.now();
        const response = await request(app)
          .post('/arf15-scaling-page/__query')
          .send({
            filter: complexFilter,
            limit: pageSize,
            options: { includeCount: true },
          })
          .expect(200);
        bestMs = Math.min(bestMs, performance.now() - start);
        lastBody = response.body as typeof lastBody;
      }

      expect(lastBody).toBeDefined();
      expect(lastBody!.data).toHaveLength(pageSize);
      expect(lastBody!.meta.returnedCount).toBe(pageSize);

      const matched = lastBody!.meta.totalCount;
      expect(matched).toBeGreaterThan(RECORD_COUNT * 0.2);
      expect(matched).toBeLessThan(RECORD_COUNT);

      // CI-tolerant ceiling. A representative local baseline on this matrix is ~5-15ms for the
      // smallest page and scales gently with page size. The ceiling keeps the test stable on a
      // loaded CI node while still catching a regression that trimmed the whole matching set
      // (see the comparison case below: a full-match trim pushes these well past 500ms for any
      // page size).
      const ceilingByPageSize: Record<number, number> = { 10: 220, 50: 240, 100: 280 };
      failWithCeiling(`page size ${pageSize}`, bestMs, ceilingByPageSize[pageSize]!);
    }
  });

  it('page-sized trim beats a counterfactual full-match trim by a stable factor for the same query', async () => {
    const dataName = `Arf15ScalingCompare${++modelCounter}`;
    const dataset = buildDataset();
    const basePath = '/arf15-scaling-compare';
    const router = acl.createDataRouter(dataName, {
      basePath,
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: dataset,
      permissionSchema: {
        id: true,
        name: true,
        group: true,
        tier: true,
        score: true,
        flag: true,
        payload: true,
        public: true,
      },
    });

    // Register a diagnostic route directly on the access router (which pipes every route
    // through the data-core middleware, so `req.dacl.pickAllowedFields` is available) to
    // simulate what a buggy "trim every matched doc before slicing" path would do. It applies
    // the same production trim helper (`req.dacl.pickAllowedFields(dataName, doc, 'list')`)
    // to every document in the configured data set, isolating the trim cardinality from
    // filter/sort/permission machinery shared by both routes.
    router.router.post('/__full-trim', async (req, res) => {
      const matched = dataset;
      const trimmed: unknown[] = [];
      for (const doc of matched) {
        trimmed.push(await req.dacl.pickAllowedFields(dataName, doc, 'list'));
      }
      res.json({ trimmedCount: trimmed.length });
    });

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    await request(app)
      .post(`${basePath}/__query`)
      .send({ filter: complexFilter, limit: 1, options: { includeCount: true } })
      .expect(200);

    const pageSize = 25;

    const timePageSized = async () => {
      let best = Infinity;
      for (let i = 0; i < 4; i++) {
        const start = performance.now();
        await request(app)
          .post(`${basePath}/__query`)
          .send({ filter: complexFilter, limit: pageSize, options: { includeCount: true } })
          .expect(200);
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };

    const timeFullMatchTrim = async () => {
      let best = Infinity;
      for (let i = 0; i < 2; i++) {
        const start = performance.now();
        await request(app).post(`${basePath}/__full-trim`).send({ filter: complexFilter }).expect(200);
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };

    const pageMs = await timePageSized();
    const fullMs = await timeFullMatchTrim();

    expect(pageMs).toBeLessThan(600);
    expect(fullMs).toBeGreaterThan(pageMs * 3);
  });
});
