import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccessRuntime, type Filter, type ModelRouterOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let counter = 0;
type Entry = 'direct' | 'root';
type Operation = 'create' | 'single' | 'bulk';
type Policy = () => Filter;
interface Policies {
  parentRead?: Policy;
  subRead?: Policy;
  subList?: Policy;
  subUpdate?: Policy;
  parentGuard?: boolean;
  readGuard?: boolean;
  listGuard?: boolean;
  writeGuard?: boolean;
  overrideRead?: boolean;
  overrideUpdate?: Policy;
  maxBulkItems?: number;
  idField?: string;
}

async function fixture(policies: Policies = {}) {
  const name = `AbbSubVisibility${++counter}`;
  const Model = mongoose.model(
    name,
    new mongoose.Schema({
      key: String,
      tenant: String,
      items: [
        new mongoose.Schema({
          label: String,
          value: Number,
          listed: Boolean,
          readable: Boolean,
          secret: String,
          listOnly: String,
        }),
      ],
    }),
  );
  const calls = {
    parentRead: vi.fn(policies.parentRead ?? (() => ({ tenant: 'allowed' }))),
    subRead: vi.fn(policies.subRead ?? (() => ({ readable: true }))),
    subList: vi.fn(policies.subList ?? (() => ({ listed: true }))),
  };
  const runtime = createAccessRuntime();
  runtime.setGlobalOptions({ requestComplexity: { maxBulkItems: policies.maxBulkItems ?? 100 } });
  const router = runtime.createRouter(Model, {
    basePath: '/posts',
    idField: policies.idField,
    operationAccess: {
      read: policies.parentGuard ?? true,
      update: true,
      subs: {
        items: {
          list: policies.listGuard ?? true,
          read: policies.readGuard ?? true,
          create: policies.writeGuard ?? true,
          update: policies.writeGuard ?? true,
        },
      },
    },
    permissionSchema: {
      items: {
        sub: {
          label: { read: true, list: true, create: true, update: true },
          value: { read: true, list: false, create: true, update: true },
          listed: { create: true, update: true },
          readable: { create: true, update: true },
          secret: { read: false, list: false, create: false, update: false },
          listOnly: { list: true, read: false },
        },
      },
    },
    baseFilter: {
      read: calls.parentRead,
      subs: {
        items: {
          read: policies.overrideRead ? () => ({}) : calls.subRead,
          list: calls.subList,
          update: policies.subUpdate ?? (() => ({})),
        },
      },
    },
    overrideFilter: {
      subs: {
        items: {
          ...(policies.overrideRead ? { read: calls.subRead } : {}),
          ...(policies.overrideUpdate ? { update: policies.overrideUpdate } : {}),
        },
      },
    },
  } as ModelRouterOptions);
  const root = runtime.createRouter({ basePath: '/root', operationAccess: true });
  // Exercise the public service's addFirst option and result counts, which the
  // generated direct route intentionally does not expose as request options.
  router.router.post('/internal/create', async (req, res) => {
    res.json(
      await req.macl.getPublicService(name).createSub(req.body.id, 'items', req.body.data, {
        addFirst: req.body.addFirst,
      }),
    );
  });
  const doc = await Model.create({
    key: 'business-key',
    tenant: 'allowed',
    items: [
      { label: 'visible', listed: true, readable: true },
      { label: 'list-hidden', listed: false, readable: true },
      { label: 'read-hidden', listed: true, readable: false },
      { label: 'both-hidden', listed: false, readable: false },
      { label: 'last-visible', listed: true, readable: true },
    ].map((row) => ({ ...row, value: 1, secret: 'protected', listOnly: 'list-only' })), // pragma: allowlist secret
  });
  const id = policies.idField ? doc.key! : String(doc._id);
  const subIds = doc.items.map((row) => String(row._id));
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(root.routes);

  async function invoke(entry: Entry, op: Operation, data: unknown, index = 0, status = op === 'create' ? 201 : 200) {
    if (entry === 'root') {
      const response = await request(app)
        .post('/root')
        .send([
          {
            target: 'model',
            name,
            op: { create: 'subCreate', single: 'subUpdate', bulk: 'subBulkUpdate' }[op],
            id,
            sub: 'items',
            ...(op === 'single' ? { subId: subIds[index] } : {}),
            data,
          },
        ])
        .expect(200);
      expect(response.body[0].statusCode).toBe(status);
      return response.body[0].result;
    }
    const path = `/posts/${id}/items${op === 'single' ? `/${subIds[index]}` : ''}`;
    const response = await (op === 'create' ? request(app).post(path) : request(app).patch(path))
      .send(data)
      .expect(status);
    return { data: response.body };
  }
  const reload = async () => (await Model.collection.findOne({ _id: doc._id }))!;
  return { app, Model, doc, id, subIds, invoke, reload, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/AbbSubVisibility.*/);
});

const labels = (rows: Array<{ label: string }>) => rows.map((row) => row.label);
const newRow = { label: 'new-visible', value: 2, listed: true, readable: true, secret: 'attack' }; // pragma: allowlist secret

describe('subdocument mutation response visibility (ABB-03)', () => {
  for (const entry of ['direct', 'root'] as const) {
    describe(entry, () => {
      it.each([false, true])('create hides restricted existing rows (nonempty=%s)', async (nonempty) => {
        const f = await fixture();
        const data = nonempty ? [newRow, { ...newRow, label: 'new-hidden', readable: false }] : [];
        const result = await f.invoke(entry, 'create', data);
        const stored = await f.reload();
        expect(stored.items).toHaveLength(nonempty ? 7 : 5);
        expect(stored.items[0].secret).toBe('protected');
        if (nonempty) {
          expect(stored.items[5]).toMatchObject({ label: 'new-visible', value: 2 });
          expect(stored.items[5]).not.toHaveProperty('secret');
          expect(stored.items[6].label).toBe('new-hidden');
        }
        expect(labels(result.data)).toEqual(['visible', 'last-visible', ...(nonempty ? ['new-visible'] : [])]);
        expect(result.data[0]).toEqual({ _id: f.subIds[0], label: 'visible', value: 1 });
        if (entry === 'root') expect(result).toMatchObject({ success: true, code: 'created', count: nonempty ? 3 : 2 });
        expect(f.calls.parentRead).toHaveBeenCalledTimes(1);
        expect(f.calls.subRead).toHaveBeenCalledTimes(1);
        expect(f.calls.subList).toHaveBeenCalledTimes(1);
      });

      const denials: Array<[string, Policies]> = [
        ['parent row', { parentRead: () => ({ tenant: 'other' }) }],
        ['parent false', { parentRead: () => false }],
        ['parent guard', { parentGuard: false }],
        ['read false', { subRead: () => false }],
        ['read override false', { subRead: () => false, overrideRead: true }],
        ['read guard', { readGuard: false }],
        ['read no matches', { subRead: () => ({ label: 'absent' }) }],
      ];
      for (const [label, policies] of denials) {
        it.each(['create', 'single', 'bulk'] as const)(
          `%s persists successfully with hidden output: ${label}`,
          async (op) => {
            const f = await fixture(policies);
            const data =
              op === 'create'
                ? newRow
                : op === 'single'
                  ? { value: 9, secret: 'attack' } // pragma: allowlist secret
                  : [
                      { _id: f.subIds[0], value: 9, secret: 'attack' }, // pragma: allowlist secret
                      { _id: f.subIds[2], value: 9 },
                    ];
            const result = await f.invoke(entry, op, data);
            const stored = await f.reload();
            if (op === 'create') {
              expect(stored.items).toHaveLength(6);
              expect(stored.items[5]).toMatchObject({ label: 'new-visible', value: 2 });
            } else {
              expect(stored.items[0]).toMatchObject({ value: 9, secret: 'protected' }); // pragma: allowlist secret
              if (op === 'bulk') expect(stored.items[2].value).toBe(9);
            }
            expect(result.data).toEqual(op === 'single' ? null : []);
            if (entry === 'root') {
              expect(result.success).toBe(true);
              if (op !== 'single') expect(result.count).toBe(0);
            }
            if (op === 'create') {
              const empty = await f.invoke(entry, 'create', []);
              expect(empty.data).toEqual([]);
              if (entry === 'root') expect(empty.count).toBe(0);
              expect((await f.reload()).items).toHaveLength(6);
            }
          },
        );
      }

      it.each([
        ['guard', { listGuard: false }],
        ['false filter', { subList: () => false }],
        ['no matching rows', { subList: () => ({ label: 'absent' }) }],
      ] as Array<[string, Policies]>)(
        'list %s hides create output but permits targeted update output',
        async (_label, policies) => {
          const f = await fixture(policies);
          const created = await f.invoke(entry, 'create', newRow);
          expect((await f.reload()).items).toHaveLength(6);
          expect(created.data).toEqual([]);
          if (entry === 'root') expect(created.count).toBe(0);
          const empty = await f.invoke(entry, 'create', []);
          expect(empty.data).toEqual([]);
          expect((await f.reload()).items).toHaveLength(6);
          const single = await f.invoke(entry, 'single', { value: 7 }, 1);
          expect(single.data).toEqual({ _id: f.subIds[1], label: 'list-hidden', value: 7 });
          const bulk = await f.invoke(entry, 'bulk', [
            { _id: f.subIds[1], value: 8 },
            { _id: f.subIds[2], value: 8 },
          ]);
          expect(bulk.data).toEqual([{ _id: f.subIds[1], label: 'list-hidden', value: 8 }]);
          const stored = await f.reload();
          expect(stored.items[1].value).toBe(8);
          expect(stored.items[2].value).toBe(8);
        },
      );

      it('single update uses post-save row visibility and preserves allowed read-field projection', async () => {
        const f = await fixture();
        const hidden = await f.invoke(entry, 'single', { readable: false, value: 5 });
        expect((await f.reload()).items[0]).toMatchObject({ readable: false, value: 5 });
        expect(hidden.data).toBeNull();
        const visible = await f.invoke(entry, 'single', { readable: true, value: 6 });
        expect(visible.data).toEqual({ _id: f.subIds[0], label: 'visible', value: 6 });
      });

      it('unrestricted row policies preserve the full response with read-field projection', async () => {
        const f = await fixture({ subRead: () => ({}), subList: () => ({}) });
        const result = await f.invoke(entry, 'create', newRow);
        expect(labels(result.data)).toEqual([
          'visible',
          'list-hidden',
          'read-hidden',
          'both-hidden',
          'last-visible',
          'new-visible',
        ]);
        for (const row of result.data) expect(Object.keys(row).sort()).toEqual(['_id', 'label', 'value']);
        if (entry === 'root') expect(result.count).toBe(6);
        expect((await f.reload()).items).toHaveLength(6);
      });

      it('bulk updates persist hidden targets, preserve array order, and return only visible updated rows', async () => {
        const f = await fixture();
        const result = await f.invoke(entry, 'bulk', [
          { _id: f.subIds[2], value: 9 },
          { _id: f.subIds[1], value: 8 },
          { _id: f.subIds[0], value: 7 },
        ]);
        expect(result.data).toEqual([
          { _id: f.subIds[0], label: 'visible', value: 7 },
          { _id: f.subIds[1], label: 'list-hidden', value: 8 },
        ]);
        if (entry === 'root') expect(result.count).toBe(2);
        expect((await f.reload()).items.map((row: { value: number }) => row.value)).toEqual([7, 8, 9, 1, 1]);
        expect(f.calls.subRead).toHaveBeenCalledTimes(1);
        expect(f.calls.subList).not.toHaveBeenCalled();
      });

      it('bulk output excludes rows denied by update policy even when readable', async () => {
        const f = await fixture({ subUpdate: () => ({ label: 'visible' }) });
        const result = await f.invoke(entry, 'bulk', [
          { _id: f.subIds[0], value: 7 },
          { _id: f.subIds[1], value: 8 },
        ]);
        expect(result.data).toEqual([{ _id: f.subIds[0], label: 'visible', value: 7 }]);
        expect((await f.reload()).items[1].value).toBe(1);
      });

      it('parent visibility is evaluated against persisted fields changed by the write', async () => {
        const f = await fixture({ parentRead: () => ({ 'items.value': { $ne: 9 } }) });
        const result = await f.invoke(entry, 'single', { value: 9 });
        expect((await f.reload()).items[0].value).toBe(9);
        expect(result.data).toBeNull();
      });

      it('bulk trusted filter replacement returns only actual payload targets', async () => {
        const f = await fixture({ overrideUpdate: () => ({}) });
        const result = await f.invoke(entry, 'bulk', [{ _id: f.subIds[0], value: 7 }]);
        expect((await f.reload()).items.map((row: { value: number }) => row.value)).toEqual([7, 1, 1, 1, 1]);
        expect(result.data).toEqual([{ _id: f.subIds[0], label: 'visible', value: 7 }]);
        if (entry === 'root') expect(result.count).toBe(1);
        const empty = await f.invoke(entry, 'bulk', []);
        expect(empty.data).toEqual([]);
        if (entry === 'root') expect(empty.count).toBe(0);
      });

      it('does not convert denied writes into successful empty responses', async () => {
        const f = await fixture({ subUpdate: () => false });
        await f.invoke(entry, 'single', { value: 9 }, 0, 403);
        await f.invoke(entry, 'bulk', [{ _id: f.subIds[0], value: 9 }], 0, 403);
        expect((await f.reload()).items[0].value).toBe(1);
      });

      it('keeps write operation guards and bulk item limits', async () => {
        const denied = await fixture({ writeGuard: false });
        await denied.invoke(entry, 'create', newRow, 0, 401);
        expect((await denied.reload()).items).toHaveLength(5);
        const bounded = await fixture({ maxBulkItems: 1 });
        await bounded.invoke(entry, 'create', [newRow, newRow], 0, 400);
        await bounded.invoke(
          entry,
          'bulk',
          [
            { _id: bounded.subIds[0], value: 9 },
            { _id: bounded.subIds[1], value: 9 },
          ],
          0,
          400,
        );
        expect((await bounded.reload()).items.map((row: { value: number }) => row.value)).toEqual([1, 1, 1, 1, 1]);
      });
    });
  }

  it.each([false, true])(
    'service create keeps addFirst=%s, filtered order/count, and custom parent identifiers',
    async (addFirst) => {
      const f = await fixture({ idField: 'key' });
      const result = await request(f.app)
        .post('/posts/internal/create')
        .send({
          id: f.id,
          addFirst,
          data: [newRow, { ...newRow, label: 'new-hidden', listed: false }, { ...newRow, label: 'new-last' }],
        })
        .expect(200);
      const newLabels = ['new-visible', 'new-last'];
      expect(labels(result.body.data)).toEqual(
        addFirst ? [...newLabels, 'visible', 'last-visible'] : ['visible', 'last-visible', ...newLabels],
      );
      expect(result.body).toMatchObject({ success: true, kind: 'list', code: 'created', count: 4 });
      const stored = await f.reload();
      expect(labels(stored.items)).toEqual(
        addFirst
          ? [
              'new-visible',
              'new-hidden',
              'new-last',
              'visible',
              'list-hidden',
              'read-hidden',
              'both-hidden',
              'last-visible',
            ]
          : [
              'visible',
              'list-hidden',
              'read-hidden',
              'both-hidden',
              'last-visible',
              'new-visible',
              'new-hidden',
              'new-last',
            ],
      );
      for (const call of Object.values(f.calls)) expect(call).toHaveBeenCalledTimes(1);
    },
  );

  it('bounds response policies and parent persistence checks independently of array size', async () => {
    const f = await fixture();
    const findOne = vi.spyOn(f.Model.collection, 'findOne');
    const result = await f.invoke(
      'root',
      'create',
      Array.from({ length: 50 }, (_, index) => ({ ...newRow, label: `new-${index}` })),
    );
    expect(result.count).toBe(52);
    expect(findOne).toHaveBeenCalledTimes(2); // write lookup + post-save parent read check
    for (const call of Object.values(f.calls)) expect(call).toHaveBeenCalledTimes(1);
    expect((await f.reload()).items).toHaveLength(55);
  });
});
