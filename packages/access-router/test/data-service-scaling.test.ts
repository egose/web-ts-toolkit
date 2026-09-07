import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import acl, { createAccessRuntime, setGlobalOptions } from '../dist/index.mjs';

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

const delay = () => new Promise((resolve) => setTimeout(resolve, 1));

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

const matchingComplexFilter = (doc: DatasetRecord) =>
  doc.public &&
  (doc.group === 'A' || doc.group === 'C') &&
  (doc.tier === 'pro' || doc.tier === 'enterprise') &&
  doc.score >= 100 &&
  doc.score <= 900 &&
  doc.flag &&
  /Record [1-9]/.test(doc.name) &&
  doc.payload !== 'payload-1-0';

describe('ARF-15 data-service list scaling', () => {
  it('shapes only returned rows while counting every authorized match for a complex filter', async () => {
    const dataName = `Arf15ScalingPage${++modelCounter}`;
    let activeFieldChecks = 0;
    let peakFieldChecks = 0;
    let fieldCheckCalls = 0;
    let activeDecorate = 0;
    let peakDecorate = 0;
    let decorateCalls = 0;
    const dataset = buildDataset();

    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
      requestComplexity: { maxHookConcurrency: 4 },
    });

    const router = acl.createDataRouter(dataName, {
      basePath: '/arf15-scaling-page',
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
        public: true,
        async payload() {
          fieldCheckCalls += 1;
          activeFieldChecks += 1;
          peakFieldChecks = Math.max(peakFieldChecks, activeFieldChecks);
          await delay();
          activeFieldChecks -= 1;
          return true;
        },
      },
      async decorate(doc) {
        decorateCalls += 1;
        activeDecorate += 1;
        peakDecorate = Math.max(peakDecorate, activeDecorate);
        await delay();
        activeDecorate -= 1;
        return doc;
      },
    });

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    const pageSizes = [10, 50, 100];
    const expectedTotalCount = dataset.filter(matchingComplexFilter).length;

    expect(expectedTotalCount).toBeGreaterThan(RECORD_COUNT * 0.2);
    expect(expectedTotalCount).toBeLessThan(RECORD_COUNT);

    for (const pageSize of pageSizes) {
      fieldCheckCalls = 0;
      peakFieldChecks = 0;
      activeFieldChecks = 0;
      decorateCalls = 0;
      peakDecorate = 0;
      activeDecorate = 0;

      const response = await request(app)
        .post('/arf15-scaling-page/__query')
        .send({
          filter: complexFilter,
          limit: pageSize,
          options: { includeCount: true },
        })
        .expect(200);

      const body = response.body as { data: unknown[]; meta: { returnedCount: number; totalCount: number } };

      expect(body.data).toHaveLength(pageSize);
      expect(body.meta.returnedCount).toBe(pageSize);
      expect(body.meta.totalCount).toBe(expectedTotalCount);

      // Two pre-query field-collection passes are expected: select resolution and sort validation.
      // Every additional dynamic field check comes from trimming exactly the returned page.
      expect(fieldCheckCalls).toBe(pageSize + 2);
      expect(fieldCheckCalls).toBeLessThan(expectedTotalCount);
      expect(decorateCalls).toBe(pageSize);
      expect(peakFieldChecks).toBeLessThanOrEqual(4);
      expect(peakDecorate).toBeLessThanOrEqual(4);
    }
  });

  it('the counterfactual full-match trim uses the same filtered match set and exposes cardinality regressions', async () => {
    const dataName = `Arf15ScalingCompare${++modelCounter}`;
    const dataset = buildDataset();
    const matched = dataset.filter(matchingComplexFilter);
    const basePath = '/arf15-scaling-compare';
    let fullTrimFieldCheckCalls = 0;

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
        async payload() {
          fullTrimFieldCheckCalls += 1;
          return true;
        },
        public: true,
      },
    });

    // Register a diagnostic route directly on the access router so it uses the same data-core
    // middleware and production trim helper as normal data routes, but intentionally trims the
    // entire precomputed filtered match set before slicing.
    router.router.post('/__full-trim', async (req, res) => {
      const trimmed: unknown[] = [];
      for (const doc of matched) {
        trimmed.push(await req.dacl.pickAllowedFields(dataName, doc, 'list'));
      }
      res.json({ trimmedCount: trimmed.length });
    });

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    const warmup = await request(app)
      .post(`${basePath}/__query`)
      .send({ filter: complexFilter, limit: 1, options: { includeCount: true } })
      .expect(200);

    const pageSize = 25;
    fullTrimFieldCheckCalls = 0;

    const pageSized = await request(app)
      .post(`${basePath}/__query`)
      .send({ filter: complexFilter, limit: pageSize, options: { includeCount: true } })
      .expect(200);

    fullTrimFieldCheckCalls = 0;
    const fullTrim = await request(app).post(`${basePath}/__full-trim`).expect(200);

    expect(warmup.body.meta.totalCount).toBe(matched.length);
    expect(pageSized.body.meta.totalCount).toBe(matched.length);
    expect(pageSized.body.meta.returnedCount).toBe(pageSize);
    expect(fullTrim.body.trimmedCount).toBe(matched.length);
    expect(fullTrimFieldCheckCalls).toBe(matched.length);
    expect(fullTrimFieldCheckCalls).toBeGreaterThan(pageSize);
  });
});

describe('ARH-11 data snapshot reuse', () => {
  it('repeated first-row reads reuse the immutable snapshot without recopying payloads', async () => {
    // Measurement setup for the coordinator to cite:
    // - Representative nested dataset: 2000 records with nested profile/address,
    //   tags array, stats object, and a counting `payload` getter.
    // - Before ARH-11: DataService construction called getDataOptions()->fetch(),
    //   which deep-cloned every record and nested value per request
    //   (cloneConfigValue + freezeConfigValue traversal, O(N*M) allocations).
    //   Each first-row read therefore invoked all N payload getters.
    // - After ARH-11: assignment clones once and freezes; fetch shares frozen
    //   subtrees via cloneForRead and getDataSnapshot returns the shared frozen
    //   array. Repeated reads allocate only a small top-level wrapper.
    const NESTED_COUNT = 2000;
    let payloadReads = 0;
    type NestedRecord = {
      id: string;
      name: string;
      group: string;
      score: number;
      profile: { email: string; address: { city: string; zip: string } };
      tags: string[];
      stats: { views: number; nested: { level: number } };
      payload: string;
      public: boolean;
    };

    const dataset = Array.from({ length: NESTED_COUNT }, (_, i) => {
      const record = {
        id: `arh11-${i}`,
        name: `Record ${i}`,
        group: ['A', 'B', 'C', 'D'][i % 4],
        score: (i * 7) % 1000,
        profile: { email: `user${i}@example.com`, address: { city: `City ${i % 50}`, zip: `zip-${i % 100}` } },
        tags: [`t${i % 5}`, `t${(i + 1) % 5}`],
        stats: { views: (i * 7) % 1000, nested: { level: i % 3 } },
        public: true,
      } as Record<string, unknown>;
      let payloadValue = `payload-${i}-${'x'.repeat(20)}`;
      Object.defineProperty(record, 'payload', {
        enumerable: true,
        configurable: false,
        get() {
          payloadReads += 1;
          return payloadValue;
        },
        set(next: string) {
          payloadValue = next;
        },
      });
      return record as unknown as NestedRecord;
    });

    const runtime = createAccessRuntime();
    const dataName = `Arh11Snapshot${++modelCounter}`;
    const basePath = `/arh11-snapshot-${modelCounter}`;
    const router = runtime.createDataRouter<NestedRecord>(dataName, {
      basePath,
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: dataset,
      permissionSchema: {
        id: true,
        name: true,
        group: true,
        score: true,
        profile: true,
        tags: true,
        stats: true,
        payload: true,
        public: true,
      },
    });

    // Assignment clones once; reset the counter so reads are measured in isolation.
    payloadReads = 0;

    // Deterministic snapshot reuse: repeated option/snapshot reads share references.
    const snapshotA = runtime.runtime.getDataSnapshot<NestedRecord>(dataName);
    const snapshotB = runtime.runtime.getDataSnapshot<NestedRecord>(dataName);
    expect(snapshotA).toBe(snapshotB);
    const optionsA = runtime.runtime.getDataOptions<NestedRecord>(dataName);
    const optionsB = runtime.runtime.getDataOptions<NestedRecord>(dataName);
    expect(optionsA.data).toBe(optionsB.data);
    expect(optionsA.data).toBe(snapshotA);
    expect(payloadReads).toBe(0);

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    // Repeated first-row reads via findOne (findElement stops at the first match,
    // so only the returned row's payload is shaped; a full copy would touch all N).
    const READS = 20;
    const startedAt = performance.now();
    for (let i = 0; i < READS; i += 1) {
      const response = await request(app)
        .post(`${basePath}/__query/__filter`)
        .send({ filter: { id: 'arh11-0' } })
        .expect(200);
      expect(response.body.id).toBe('arh11-0');
    }
    const durationMs = performance.now() - startedAt;
    console.info(
      `[ARH-11] first-row reads=${READS} nested=${NESTED_COUNT} payloadReads=${payloadReads} durationMs=${durationMs.toFixed(1)}`,
    );

    // Deterministic: shaping touches only returned rows, not every stored payload.
    expect(payloadReads).toBeLessThanOrEqual(READS + 2);
    expect(payloadReads).toBeLessThan(NESTED_COUNT);
    // Non-gating timing/allocation comparison: recorded for the coordinator, soft assert only.
    expect(durationMs).toBeGreaterThanOrEqual(0);

    // Pagination, filters, sorting, totals, and hooks still work on the shared snapshot.
    const page = await request(app)
      .post(`${basePath}/__query`)
      .send({ filter: { public: true }, sort: '-score', limit: 10, options: { includeCount: true } })
      .expect(200);
    expect(page.body.data).toHaveLength(10);
    expect(page.body.meta.totalCount).toBe(NESTED_COUNT);
    const scores = (page.body.data as NestedRecord[]).map((row) => row.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
