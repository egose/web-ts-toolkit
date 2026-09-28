import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import sift from 'sift';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';

// Instrument the collection cursor/command boundary, not service/map callbacks.
// An event-loop barrier holds each persistence completion until all currently
// runnable promise continuations have submitted their work. No elapsed-time gate.
class PersistenceProbe {
  active = 0;
  peak = 0;
  calls: string[] = [];
  barrier?: Promise<void>;
  onStart?: (active: number) => void;
  failNext?: string;
  async run<T>(label: string, value: T): Promise<T> {
    this.calls.push(label);
    this.peak = Math.max(this.peak, ++this.active);
    this.onStart?.(this.active);
    try {
      if (this.barrier) await this.barrier;
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (this.failNext === label) {
        this.failNext = undefined;
        throw new Error('injected persistence rejection');
      }
      return structuredClone(value);
    } finally {
      this.active--;
    }
  }
}

let serial = 0;
function fixture(limit: number, probe = new PersistenceProbe()) {
  const api = createAccessRuntime();
  api.setGlobalOptions({ requestComplexity: { maxBulkConcurrency: limit, maxCorrelatedQueries: 200 } });
  const tag = ++serial;
  const sourceRows = [0, 1, 2].map((i) => ({ _id: `p${i}`, key: `p${i}` }));
  const childRows = sourceRows.flatMap((p) =>
    [0, 1, 2].map((i) => ({
      _id: `${p.key}-c${i}`,
      key: `${p.key}-c${i}`,
      parent: p.key,
    })),
  );
  const app = express();
  app.use(express.json());
  const names: string[] = [];
  for (const [level, rows] of [sourceRows, childRows, childRows].entries()) {
    const name = `AbbConcurrency${tag}Level${level}`;
    names.push(name);
    const model = mongoose.model(
      name,
      new mongoose.Schema({
        _id: { type: String, default: () => String(new mongoose.Types.ObjectId()) },
        key: String,
        parent: String,
      }),
    );
    vi.spyOn(model.collection, 'find').mockImplementation(((filter: object) => ({
      toArray: () => probe.run(`${level}:find`, rows.filter(sift(filter))),
    })) as never);
    vi.spyOn(model.collection, 'findOne').mockImplementation(((filter: object) =>
      probe.run(`${level}:findOne`, rows.find(sift(filter)) ?? null)) as never);
    vi.spyOn(model.collection, 'countDocuments').mockImplementation(((filter: object) =>
      probe.run(`${level}:countDocuments`, rows.filter(sift(filter)).length)) as never);
    vi.spyOn(model.collection, 'insertOne').mockImplementation(((doc: { _id: string }) =>
      probe.run(`${level}:insertOne`, { acknowledged: true, insertedId: doc._id })) as never);
    vi.spyOn(model.collection, 'updateOne').mockImplementation((() =>
      probe.run(`${level}:updateOne`, { acknowledged: true, matchedCount: 1, modifiedCount: 1 })) as never);
    vi.spyOn(model.collection, 'deleteOne').mockImplementation((() =>
      probe.run(`${level}:deleteOne`, { acknowledged: true, deletedCount: 1 })) as never);
    const router = api.createRouter(model, {
      basePath: `/level${level}`,
      idField: 'key',
      operationAccess: { read: true, list: true, count: true, create: true, update: true, delete: true },
      permissionSchema: { key: true, parent: true },
    });
    if (level === 0)
      router.router.post('/internal/recover', async (req, res) => {
        const svc = req.macl.getPublicService(name);
        const failed = await svc.find({}, { include: req.body.include }).then(
          () => null,
          (error: Error) => error.message,
        );
        const recovery = await svc.countTrusted({ key: 'p0' });
        res.json({ failed, recovery });
      });
    app.use(router.routes);
  }
  app.use(api.createRouter({ basePath: '/root', operationAccess: true, maxConcurrentOperations: 10 }).routes);
  const include = (op: 'read' | 'list' | 'count', byId = false) => ({
    mode: 'correlated',
    model: names[1],
    op: 'list',
    path: 'children',
    filter: { parent: { $parent: 'key' } },
    args: {
      include: {
        mode: 'correlated',
        model: names[2],
        op,
        path: 'leaf',
        ...(byId ? { id: { $parent: 'key' } } : { filter: { key: { $parent: 'key' } } }),
      },
    },
  });
  return { app, api, names, probe, include };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/AbbConcurrency.*/);
});

describe('ABB-04 request-wide persistence admission', () => {
  it.each(['read', 'list', 'count'] as const)('bounds nested list/%s persistence (limit 3)', async (op) => {
    const f = fixture(3);
    const res = await request(f.app)
      .post('/level0/__query')
      .send({ include: f.include(op) })
      .expect(200);
    expect(res.body.data.map((p: any) => p.key)).toEqual(['p0', 'p1', 'p2']);
    for (const parent of res.body.data) {
      expect(parent.children.map((c: any) => c.key)).toEqual([0, 1, 2].map((i) => `${parent.key}-c${i}`));
      for (const child of parent.children) {
        expect(child.leaf).toEqual(
          op === 'count'
            ? 1
            : op === 'list'
              ? [expect.objectContaining({ key: child.key })]
              : expect.objectContaining({ key: child.key }),
        );
      }
    }
    expect(f.probe.calls.filter((s) => s.startsWith('2:'))).toHaveLength(9);
    expect(f.probe.active).toBe(0);
    expect(f.probe.peak).toBe(3);
  });

  it.each([1, 3])('shares permits across root entries and nested id reads, limit %i', async (limit) => {
    const f = fixture(limit);
    const body = [2, 0, 1].map((i) => ({
      target: 'model',
      name: f.names[0],
      op: 'read',
      id: `p${i}`,
      args: { include: f.include('read', true) },
    }));
    const res = await request(f.app).post('/root').send(body).expect(200);
    expect(res.body.map((entry: any) => entry.result.data.key)).toEqual(['p2', 'p0', 'p1']);
    for (const entry of res.body) expect(entry.result.data.children).toHaveLength(3);
    expect(f.probe.active).toBe(0);
    expect(f.probe.peak).toBe(limit);
  });

  it.each([1, 3])('releases read permits before a third nested count level (limit %i)', async (limit) => {
    const f = fixture(limit);
    const tree = f.include('read');
    const include = {
      ...tree,
      args: {
        include: {
          ...tree.args.include,
          args: {
            include: {
              mode: 'correlated',
              model: f.names[2],
              op: 'count',
              path: 'total',
              filter: { key: { $parent: 'key' } },
            },
          },
        },
      },
    };
    const res = await request(f.app).post('/level0/__query').send({ include }).expect(200);
    for (const parent of res.body.data) {
      for (const child of parent.children) expect(child.leaf.total).toBe(1);
    }
    expect(f.probe.calls.filter((label) => label === '2:countDocuments')).toHaveLength(9);
    expect(f.probe.active).toBe(0);
    expect(f.probe.peak).toBe(limit);
  });

  it('releases a rejected nested persistence call for queued work and recovery on the same request', async () => {
    const f = fixture(1);
    f.probe.failNext = '2:findOne';
    const res = await request(f.app)
      .post('/level0/internal/recover')
      .send({ include: f.include('read') })
      .expect(200);
    expect(res.body.failed).toBe('injected persistence rejection');
    expect(res.body.recovery).toMatchObject({ success: true, data: 1 });
    expect(f.probe.peak).toBe(1);
  });

  it.each(['create', 'update', 'delete'] as const)(
    'shares persistence admission with root %s operations',
    async (op) => {
      const f = fixture(1);
      const entries = [0, 1, 2].map((i) => ({
        target: 'model',
        name: f.names[0],
        op,
        ...(op === 'create'
          ? { data: [{ key: `new${i}a` }, { key: `new${i}b` }] }
          : { id: `p${i}`, ...(op === 'update' ? { data: { key: `next${i}` } } : {}) }),
      }));
      const res = await request(f.app)
        .post('/root')
        .send([...entries, { target: 'model', name: f.names[0], op: 'list', args: { include: f.include('count') } }])
        .expect(200);
      expect(res.body.map((entry: any) => entry.statusCode)).toEqual([
        op === 'create' ? 201 : 200,
        op === 'create' ? 201 : 200,
        op === 'create' ? 201 : 200,
        200,
      ]);
      if (op === 'create')
        expect(res.body.slice(0, 3).map((entry: any) => entry.result.data.map((d: any) => d.key))).toEqual([
          ['new0a', 'new0b'],
          ['new1a', 'new1b'],
          ['new2a', 'new2b'],
        ]);
      if (op === 'update')
        expect(res.body.slice(0, 3).map((entry: any) => entry.result.data.key)).toEqual(['next0', 'next1', 'next2']);
      const command = { create: 'insertOne', update: 'updateOne', delete: 'deleteOne' }[op];
      expect(f.probe.calls.filter((label) => label === `0:${command}`)).toHaveLength(op === 'create' ? 6 : 3);
      expect(f.probe.peak).toBe(1);
      expect(f.probe.active).toBe(0);
    },
  );

  it.each([false, true])(
    'keeps simultaneous HTTP requests independent (different runtimes: %s)',
    async (differentRuntimes) => {
      const probe = new PersistenceProbe();
      let release!: () => void;
      probe.barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const bothStarted = new Promise<void>((resolve) => {
        probe.onStart = (active) => {
          if (active === 2) resolve();
        };
      });
      const a = fixture(1, probe);
      const b = differentRuntimes ? fixture(1, probe) : a;
      const requests = Promise.all(
        [a, b].map((f) =>
          request(f.app)
            .post('/level0/__query')
            .send({ include: f.include('count') })
            .expect(200),
        ),
      );
      await bothStarted;
      expect(probe.active).toBe(2);
      release();
      const results = await requests;
      expect(results.map((res) => res.body.data.length)).toEqual([3, 3]);
      expect(probe.calls.filter((label) => label === '2:countDocuments')).toHaveLength(18);
      expect(probe.peak).toBe(2);
      expect(probe.active).toBe(0);
    },
  );

  it('retains the total correlated query ceiling across root entries and nested levels', async () => {
    const f = fixture(1);
    f.api.setGlobalOptions({ requestComplexity: { maxBulkConcurrency: 1, maxCorrelatedQueries: 5 } });
    const res = await request(f.app)
      .post('/root')
      .send(
        [0, 1, 2].map((i) => ({
          target: 'model',
          name: f.names[0],
          op: 'read',
          id: `p${i}`,
          args: { include: f.include('count') },
        })),
      )
      .expect(200);
    expect(res.body.every((entry: any) => entry.statusCode === 400)).toBe(true);
    expect(res.body.every((entry: any) => entry.result.errors[0].detail.includes('query budget'))).toBe(true);
    expect(f.probe.calls.filter((label) => !label.startsWith('0:'))).toHaveLength(5);
    expect(f.probe.peak).toBe(1);
  });

  it('retains depth rejection before target persistence', async () => {
    const f = fixture(1);
    f.api.setGlobalOptions({ requestComplexity: { maxBulkConcurrency: 1, maxCorrelatedDepth: 1 } });
    await request(f.app)
      .post('/level0/__query')
      .send({ include: f.include('read') })
      .expect(400);
    expect(f.probe.calls.filter((label) => !label.startsWith('0:'))).toHaveLength(0);
  });
});
