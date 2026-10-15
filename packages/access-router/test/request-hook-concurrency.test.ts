import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import sift from 'sift';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { deferred, HookProbe, turn } from './hook-admission-fixture';

// Exercise real routers, Mongoose queries and authorization/finalization; only
// collection I/O is replaced, as in request-persistence-concurrency.test.ts.
let serial = 0;
const owners: ReturnType<typeof createAccessRuntime>[] = [];
function fixture(limit = 2, bulkLimit = 3) {
  const api = createAccessRuntime();
  owners.push(api);
  api.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
    requestComplexity: { maxHookConcurrency: limit, maxBulkConcurrency: bulkLimit, maxDepth: 20 },
  });
  const tag = ++serial;
  const app = express();
  app.use(express.json());
  const persistence = new HookProbe();
  const addModel = (label: string, rows: Record<string, unknown>[], options: Record<string, unknown> = {}) => {
    const name = `ArlHook${tag}${label}`;
    const model = mongoose.model(
      name,
      new mongoose.Schema({
        _id: String,
        key: String,
        parent: String,
        secret: String,
        contacts: [new mongoose.Schema({ _id: String, key: String })],
      }),
    );
    const filterRows = (filter: object) => rows.filter(sift(filter));
    vi.spyOn(model.collection, 'find').mockImplementation(((filter: object) => ({
      toArray: () => persistence.run(`${label}:find`, () => structuredClone(filterRows(filter))),
    })) as never);
    vi.spyOn(model.collection, 'findOne').mockImplementation(((filter: object) =>
      persistence.run(`${label}:findOne`, () => structuredClone(filterRows(filter)[0] ?? null))) as never);
    vi.spyOn(model.collection, 'countDocuments').mockImplementation(((filter: object) =>
      persistence.run(`${label}:count`, () => filterRows(filter).length)) as never);
    vi.spyOn(model.collection, 'updateOne').mockImplementation((() =>
      persistence.run(`${label}:update`, () => ({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }))) as never);
    const router = api.createRouter(model, {
      basePath: `/${label}`,
      idField: 'key',
      operationAccess: { list: true, read: true, update: true, subs: { contacts: { list: true, read: true } } },
      modelPermissionPrefix: 'doc:',
      permissionSchema: {
        key: true,
        parent: false,
        secret: false,
        computed: true,
        contacts: { read: true, list: true, sub: { key: true, computed: true } },
      },
      ...options,
    } as never);
    app.use(router.routes);
    return { name, model, router };
  };
  const root = () =>
    app.use(api.createRouter({ basePath: '/root', operationAccess: true, maxConcurrentOperations: 10 }).routes);
  return { api, app, addModel, root, persistence };
}

const rows = (prefix: string, size = 4) =>
  Array.from({ length: size }, (_, i) => ({
    _id: `${prefix}${i}`,
    key: `${prefix}${i}`,
    secret: 'private',
  }));

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^ArlHook/);
  for (const api of owners.splice(0)) api.runtime.clearOpenApiRoutes();
});

describe('ARL-07 request/runtime-owned hook admission', () => {
  it.each(['virtual', 'docPermissions', 'decorate', 'decorateAll'] as const)(
    'shares %s work across three root lists, preserving root/row order',
    async (kind) => {
      const f = fixture();
      const probe = new HookProbe();
      const hold = deferred();
      const slow = deferred();
      const fast = deferred();
      probe.barrier = hold.promise;
      const entered = deferred();
      probe.onStart = () => {
        if (probe.calls.length >= 2) entered.resolve();
      };
      const options =
        kind === 'virtual'
          ? {
              virtuals: {
                computed: {
                  dependsOn: ['key'],
                  get: (doc: { key: string }) =>
                    probe.run(doc.key, async () => {
                      if (doc.key === 'r2-0') await slow.promise;
                      if (doc.key === 'r0-3') fast.resolve();
                      return `v:${doc.key}`;
                    }),
                },
              },
            }
          : kind === 'docPermissions'
            ? {
                permissionSchema: { key: 'doc:visible', secret: false },
                docPermissions: () => probe.run('grants', () => ({ visible: true })),
              }
            : kind === 'decorate'
              ? {
                  decorate: (doc: { key: string }) => probe.run(doc.key, () => ({ ...doc, decorated: true })),
                }
              : {
                  decorateAll: (docs: unknown[]) => probe.run('all', () => docs),
                };
      const models = [2, 0, 1].map((n) => f.addModel(`Root${n}`, rows(`r${n}-`), options));
      f.root();
      const pending = request(f.app)
        .post('/root')
        .send(models.map(({ name }) => ({ target: 'model', name, op: 'list' })))
        .then((res) => res);
      try {
        await entered.promise;
        await turn();
      } finally {
        hold.resolve();
      }
      if (kind === 'virtual') {
        try {
          await fast.promise;
          expect(probe.completed).not.toContain('r2-0');
        } finally {
          slow.resolve();
        }
      }
      const res = await pending;
      expect(res.status).toBe(200);
      expect(res.body.map((entry: { index: number }) => entry.index)).toEqual([0, 1, 2]);
      for (const [i, entry] of res.body.entries()) {
        expect(entry.statusCode).toBe(200);
        expect(entry.result.data.map((doc: { key: string }) => doc.key)).toEqual(
          rows(`r${[2, 0, 1][i]}-`).map((doc) => doc.key),
        );
        for (const doc of entry.result.data) {
          expect(doc).not.toHaveProperty('secret');
          if (kind === 'virtual') expect(doc.computed).toBe(`v:${doc.key}`);
          if (kind === 'decorate') expect(doc.decorated).toBe(true);
        }
      }
      expect(probe.calls).toHaveLength(kind === 'decorateAll' ? 3 : 12);
      expect(probe.active).toBe(0);
      expect(probe.peak).toBe(2);
    },
  );

  it.each(['correlated', 'legacy'] as const)(
    'shares target grants/getters across independent %s includes',
    async (mode) => {
      const f = fixture();
      const probe = new HookProbe();
      const parents = rows('p', 3);
      const childRows = parents.flatMap((parent) =>
        rows(`${parent.key}-c`, 3).map((row) => ({ ...row, parent: parent.key })),
      );
      const target = f.addModel('Child', childRows, {
        alwaysSelectFields: ['parent'],
        permissionSchema: { key: 'doc:visible', parent: false, secret: false, computed: 'doc:visible' },
        docPermissions: (doc: { key: string }) => probe.run(`grant:${doc.key}`, () => ({ visible: true })),
        virtuals: {
          computed: { dependsOn: ['key'], get: (doc: { key: string }) => probe.run(`get:${doc.key}`, () => doc.key) },
        },
      });
      const source = f.addModel('Parent', parents);
      const include = {
        model: target.name,
        op: 'list',
        path: 'children',
        args: { select: ['key', 'computed'] },
        ...(mode === 'correlated'
          ? { mode, filter: { parent: { $parent: 'key' } } }
          : { localField: 'key', foreignField: 'parent' }),
      };
      f.root();
      const res =
        mode === 'correlated'
          ? await request(f.app)
              .post('/Parent/__query')
              .send({ select: ['key'], include })
          : await request(f.app)
              .post('/root')
              .send(
                parents.map((parent) => ({
                  target: 'model',
                  name: source.name,
                  op: 'read',
                  id: parent.key,
                  args: { include },
                })),
              );
      expect(res.status).toBe(200);
      const output = mode === 'correlated' ? res.body.data : res.body.map((entry: any) => entry.result.data);
      expect(output.map((doc: { key: string }) => doc.key)).toEqual(['p0', 'p1', 'p2']);
      for (const doc of output) {
        expect(doc.children.map((child: { key: string }) => child.key)).toEqual(
          rows(`${doc.key}-c`, 3).map((row) => row.key),
        );
        for (const child of doc.children) {
          expect(child.computed).toBe(child.key);
          expect(child).not.toHaveProperty('parent');
          expect(child).not.toHaveProperty('secret');
        }
      }
      expect(probe.calls).toHaveLength(18);
      expect(probe.active).toBe(0);
      expect(probe.peak).toBe(2);
      expect(f.persistence.peak).toBeLessThanOrEqual(3);
    },
  );

  it('shares model virtuals, data field stages and data decorators in a mixed root batch', async () => {
    const f = fixture();
    const probe = new HookProbe();
    const model = f.addModel('Mixed', rows('m'), {
      virtuals: {
        computed: { dependsOn: ['key'], get: (doc: { key: string }) => probe.run(`model:${doc.key}`, () => doc.key) },
      },
    });
    for (const name of ['data-a', 'data-b'])
      f.api.createDataRouter(name, {
        idField: 'key',
        data: rows(name),
        operationAccess: { list: true, read: true },
        permissionSchema: { key: () => probe.run('data-field', () => true), secret: false },
        decorate: (doc) => probe.run('data-decorate', () => ({ ...doc, decorated: true })),
        decorateAll: (docs) => probe.run('data-all', () => docs),
      });
    f.root();
    const res = await request(f.app)
      .post('/root')
      .send([
        { target: 'data', name: 'data-a', op: 'list' },
        { target: 'model', name: model.name, op: 'list' },
        { target: 'data', name: 'data-b', op: 'list' },
      ]);
    expect(res.status).toBe(200);
    expect(res.body.map((entry: any) => entry.statusCode)).toEqual([200, 200, 200]);
    for (const [i, entry] of res.body.entries()) {
      expect(entry.result.data).toHaveLength(4);
      expect(entry.result.data.map((doc: any) => doc.key)).toEqual(
        rows(['data-a', 'm', 'data-b'][i]).map((doc) => doc.key),
      );
      for (const doc of entry.result.data) expect(doc).not.toHaveProperty('secret');
    }
    expect(probe.calls.filter((label) => label === 'data-field')).toHaveLength(12);
    expect(probe.calls.filter((label) => label === 'data-decorate')).toHaveLength(8);
    expect(probe.calls.filter((label) => label === 'data-all')).toHaveLength(2);
    expect(probe.peak).toBe(2);
  });

  it.each(['virtual', 'docPermissions', 'decorate'] as const)(
    'limit-one nested service/fan-out from %s completes with bounded leaves',
    async (kind) => {
      const f = fixture(1, 1);
      const leafProbe = new HookProbe();
      let frames = 0;
      let framePeak = 0;
      const frame = async <T>(body: () => Promise<T>) => {
        framePeak = Math.max(framePeak, ++frames);
        try {
          return await body();
        } finally {
          frames--;
        }
      };
      const leaf = f.addModel('Leaf', rows('leaf', 3), {
        virtuals: {
          computed: {
            dependsOn: ['key'],
            get: (doc: { key: string }) => frame(() => leafProbe.run(doc.key, () => doc.key)),
          },
        },
      });
      const middle = f.addModel('Middle', rows('mid', 3), {
        virtuals: {
          computed: {
            dependsOn: ['key'],
            get: function (this: ModelRequest) {
              return frame(async () => {
                const result = await Promise.all(
                  [2, 0, 1].map((i) => this.macl.getService(leaf.name).findOne({ key: `leaf${i}` })),
                );
                return result.map((entry) => (entry.success ? entry.data : null));
              });
            },
          },
        },
      });
      const nested = function (this: ModelRequest) {
        return frame(async () => {
          const result = await Promise.all(
            [2, 0, 1].map((i) => this.macl.getService(middle.name).findOne({ key: `mid${i}` })),
          );
          for (const entry of result) {
            expect(entry.success).toBe(true);
            if (entry.success) {
              const picked = await this.macl
                .getService(middle.name)
                .pickAllowedFields(entry.data, 'read', { documentAuthorization: entry.context.documentAuthorization });
              expect(picked).toHaveProperty('key');
              expect(picked).not.toHaveProperty('secret');
            }
          }
          return result.map((entry) => (entry.success ? entry.data : null));
        });
      };
      const parent = f.addModel(
        'Nested',
        rows('parent', 2),
        kind === 'virtual'
          ? {
              virtuals: { computed: { get: nested } },
            }
          : kind === 'docPermissions'
            ? {
                docPermissions: async function (this: ModelRequest) {
                  await nested.call(this);
                  return { visible: true };
                },
              }
            : {
                decorate: async function (this: ModelRequest, doc: object) {
                  return { ...doc, computed: await nested.call(this) };
                },
              },
      );
      f.root();
      const res = await request(f.app)
        .post('/root')
        .send([1, 0].map((i) => ({ target: 'model', name: parent.name, op: 'read', id: `parent${i}` })));
      expect(res.status).toBe(200);
      expect(res.body.map((entry: any) => entry.statusCode)).toEqual([200, 200]);
      expect(res.body.map((entry: any) => entry.result.data.key)).toEqual(['parent1', 'parent0']);
      if (kind !== 'docPermissions')
        for (const entry of res.body) {
          expect(entry.result.data.computed.map((doc: any) => doc.key)).toEqual(['mid2', 'mid0', 'mid1']);
          for (const mid of entry.result.data.computed)
            expect(mid.computed.map((doc: any) => doc.key)).toEqual(['leaf2', 'leaf0', 'leaf1']);
        }
      expect(leafProbe.calls).toHaveLength(18);
      expect(leafProbe.peak).toBe(1);
      expect(framePeak).toBe(3); // Waiting ancestors are frames, not independent permits.
      expect(frames).toBe(0);
      expect(f.persistence.peak).toBe(1);
      expect(f.persistence.calls.filter((label) => label.endsWith(':findOne'))).toHaveLength(26);
      expect(f.persistence.calls.filter((label) => label.endsWith(':find'))).toHaveLength(52);
      // 2 parents + 6 middles + 18 leaves, each with two field-metadata row checks.
      expect(f.persistence.calls).toHaveLength(78);
    },
  );

  it.each(['virtual', 'docPermissions', 'decorate'] as const)(
    'releases %s rejection for queued root entries and subsequent output',
    async (kind) => {
      const f = fixture(1);
      const probe = new HookProbe();
      const run = (doc: { key: string }) =>
        probe.run(doc.key, () => {
          if (doc.key === 'e0') throw new Error('injected hook failure');
          return doc;
        });
      const model = f.addModel(
        'Errors',
        rows('e', 3),
        kind === 'virtual'
          ? {
              virtuals: { computed: { dependsOn: ['key'], get: async (doc: { key: string }) => (await run(doc)).key } },
            }
          : kind === 'docPermissions'
            ? {
                permissionSchema: { key: true, secret: 'doc:visible' },
                docPermissions: async (doc: { key: string }) => {
                  await run(doc);
                  return { visible: true };
                },
              }
            : { decorate: run },
      );
      if (kind === 'decorate') {
        model.router.router.post('/internal/recover', async (req, res) => {
          const service = req.macl.getPublicService(model.name);
          const first = await Promise.allSettled([service._read('e0'), service._read('e1')]);
          const recovered = await service._read('e2');
          res.json({ statuses: first.map((entry) => entry.status), recovered });
        });
        const res = await request(f.app).post('/Errors/internal/recover').send({});
        expect(res.status).toBe(200);
        expect(res.body.statuses).toEqual(['rejected', 'fulfilled']);
        expect(res.body.recovered.data.key).toBe('e2');
        expect(probe.calls).toEqual(['e0', 'e1', 'e2']);
        expect(probe.active).toBe(0);
        expect(probe.peak).toBe(1);
        return;
      }
      f.root();
      const res = await request(f.app)
        .post('/root')
        .send(
          [0, 1, 2].map((i) => ({
            target: 'model',
            name: model.name,
            op: 'read',
            id: `e${i}`,
            order: i === 2 ? 1 : 0,
          })),
        );
      expect(res.status).toBe(200);
      expect(res.body[0].statusCode).toBe(200);
      expect(res.body.slice(1).map((entry: any) => entry.statusCode)).toEqual([200, 200]);
      if (kind === 'virtual') expect(res.body[0].result.data).not.toHaveProperty('computed');
      if (kind === 'docPermissions') expect(res.body[0].result.data).not.toHaveProperty('secret');
      expect(probe.calls).toEqual(['e0', 'e1', 'e2']);
      expect(probe.active).toBe(0);
      expect(probe.peak).toBe(1);
    },
  );

  it('shares owning-parent grants and scoped virtuals across independent root subdocument lists', async () => {
    const f = fixture();
    const probe = new HookProbe();
    const parents = rows('parent', 3).map((parent) => ({ ...parent, contacts: rows(`${parent.key}-sub`, 2) }));
    const model = f.addModel('Subs', parents, {
      alwaysSelectFields: ['key'],
      permissionSchema: {
        key: true,
        contacts: { read: true, list: true, sub: { key: 'doc:visible', computed: 'doc:visible' } },
      },
      docPermissions: { read: (doc: { key: string }) => probe.run(`grant:${doc.key}`, () => ({ visible: true })) },
      virtuals: {
        contacts: {
          sub: {
            computed: { dependsOn: ['key'], get: (doc: { key: string }) => probe.run(`sub:${doc.key}`, () => doc.key) },
          },
        },
      },
    });
    f.root();
    const res = await request(f.app)
      .post('/root')
      .send(
        parents.map((parent) => ({
          target: 'model',
          name: model.name,
          op: 'subList',
          sub: 'contacts',
          id: parent.key,
        })),
      );
    expect(res.status).toBe(200);
    expect(res.body.map((entry: any) => entry.statusCode)).toEqual([200, 200, 200]);
    for (const [index, entry] of res.body.entries()) {
      expect(entry.result.data.map((doc: any) => doc.key)).toEqual(parents[index].contacts.map((doc) => doc.key));
      for (const doc of entry.result.data) expect(doc.computed).toBe(doc.key);
    }
    expect(probe.calls.filter((label) => label.startsWith('grant:'))).toHaveLength(3);
    expect(probe.calls.filter((label) => label.startsWith('sub:'))).toHaveLength(6);
    expect(probe.peak).toBe(2);
  });

  it('shares pre-write document grants across independent root updates', async () => {
    const f = fixture(1, 1);
    const probe = new HookProbe();
    const model = f.addModel('Updates', rows('u', 3), {
      permissionSchema: { key: true, secret: false },
      docPermissions: { update: (doc: { key: string }) => probe.run(doc.key, () => ({ visible: true })) },
    });
    f.root();
    const res = await request(f.app)
      .post('/root')
      .send(
        [0, 1, 2].map((i) => ({
          target: 'model',
          name: model.name,
          op: 'update',
          id: `u${i}`,
          data: { key: `updated${i}` },
        })),
      );
    expect(res.status).toBe(200);
    expect(res.body.map((entry: any) => entry.statusCode)).toEqual([200, 200, 200]);
    expect(res.body.map((entry: any) => entry.result.data.key)).toEqual(['updated0', 'updated1', 'updated2']);
    expect(probe.calls).toHaveLength(6); // Separate original pre-write and post-write stages.
    expect(probe.peak).toBe(1);
    expect(f.persistence.calls.filter((label) => label === 'Updates:update')).toHaveLength(3);
    expect(f.persistence.peak).toBe(1);
  });

  it.each(['field', 'decorate', 'decorateAll'] as const)(
    'supports bounded limit-one nested service fan-out from a data %s stage',
    async (stage) => {
      const f = fixture(1, 1);
      const probe = new HookProbe();
      const model = f.addModel('DataLeaf', rows('leaf', 3), {
        virtuals: { computed: { get: (doc: { key: string }) => probe.run(doc.key, () => doc.key) } },
      });
      const nested = async function (this: ModelRequest) {
        const result = await Promise.all(
          [2, 0, 1].map((i) =>
            this.macl.getService(model.name).findOne({ key: `leaf${i}` }, {}, { includeFieldPermissions: false }),
          ),
        );
        expect(result.map((entry) => entry.success && entry.data.key)).toEqual(['leaf2', 'leaf0', 'leaf1']);
        return true;
      };
      f.api.createDataRouter('nested-data', {
        data: rows('d', 2),
        operationAccess: { list: true },
        permissionSchema: { key: stage === 'field' ? nested : true, secret: false },
        ...(stage === 'decorate'
          ? {
              decorate: async function (this: ModelRequest, doc: object) {
                await nested.call(this);
                return doc;
              },
            }
          : {}),
        ...(stage === 'decorateAll'
          ? {
              decorateAll: async function (this: ModelRequest, docs: object[]) {
                await nested.call(this);
                return docs;
              },
            }
          : {}),
      } as never);
      f.root();
      const res = await request(f.app)
        .post('/root')
        .send([{ target: 'data', name: 'nested-data', op: 'list' }]);
      expect(res.status).toBe(200);
      expect(res.body[0].statusCode).toBe(200);
      expect(res.body[0].result.data).toEqual([{ key: 'd0' }, { key: 'd1' }]);
      expect(probe.calls).toHaveLength(stage === 'field' ? 12 : stage === 'decorate' ? 6 : 3);
      expect(probe.peak).toBe(1);
      expect(f.persistence.peak).toBe(1);
    },
  );

  it('omits a depth-overflow getter through its normal failure policy and recovers the same pool', async () => {
    const f = fixture(1, 1);
    let getters = 0;
    let name: string;
    const model = f.addModel('Depth', rows('depth', 66), {
      virtuals: {
        computed: {
          get: async function (this: ModelRequest, doc: { key: string }) {
            getters++;
            const index = Number(doc.key.slice(5));
            if (index === 65) return 1;
            const child = await this.macl
              .getService(name)
              .findOne({ key: `depth${index + 1}` }, {}, { includeFieldPermissions: false });
            return child.success ? 1 + Number(child.data.computed ?? 0) : 1;
          },
        },
      },
    });
    name = model.name;
    f.root();
    const res = await request(f.app)
      .post('/root')
      .send([0, 65].map((i) => ({ target: 'model', name, op: 'read', id: `depth${i}`, order: i === 0 ? 0 : 1 })));
    expect(res.status).toBe(200);
    expect(res.body.map((entry: any) => entry.statusCode)).toEqual([200, 200]);
    expect(res.body.map((entry: any) => entry.result.data.computed)).toEqual([64, 1]);
    expect(getters).toBe(65);
    expect(f.persistence.peak).toBe(1);
  });

  it.each([false, true])(
    'keeps simultaneous requests independent (separate runtimes: %s)',
    async (separateRuntimes) => {
      const probe = new HookProbe();
      const barrier = deferred();
      const both = deferred();
      probe.barrier = barrier.promise;
      probe.onStart = () => {
        if (probe.active === 2) both.resolve();
      };
      const a = fixture(1);
      const b = separateRuntimes ? fixture(1) : a;
      a.addModel('IsolatedA', rows('a', 1), { virtuals: { computed: { get: () => probe.run('a', () => 'a') } } });
      b.addModel('IsolatedB', rows('b', 1), { virtuals: { computed: { get: () => probe.run('b', () => 'b') } } });
      const calls = [
        request(a.app)
          .get('/IsolatedA/a0')
          .then((res) => res),
        request(b.app)
          .get('/IsolatedB/b0')
          .then((res) => res),
      ];
      try {
        await both.promise;
        expect(probe.active).toBe(2);
      } finally {
        barrier.resolve();
      }
      expect((await Promise.all(calls)).map((res) => res.status)).toEqual([200, 200]);
      expect(probe.peak).toBe(2);
    },
  );
});
