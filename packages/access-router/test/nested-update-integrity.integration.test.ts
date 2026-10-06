import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createAccessRuntime, type ModelHookContext, type ModelRouterOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let counter = 0;
type Entry = 'updateOne' | 'updateById' | 'upsert' | 'singleSub' | 'bulkSub' | 'rootSub';
const entries: Entry[] = ['updateOne', 'updateById', 'upsert', 'singleSub', 'bulkSub', 'rootSub'];
const original = { public: 'old', secret: 'protected', settings: { first: 'old', second: 'remove' } }; // pragma: allowlist secret

async function fixture(whole = false, hooks: Partial<ModelRouterOptions> = {}) {
  const name = `AbbNestedUpdate${++counter}`;
  const profile = { public: String, secret: String, settings: { first: String, second: String } };
  const fields = {
    nested: profile,
    single: new mongoose.Schema(profile, { _id: false }),
    tags: [String],
    indexed: [new mongoose.Schema({ public: String, secret: String }, { _id: false })],
    scalar: String,
    audit: String,
  };
  const Model = mongoose.model(name, new mongoose.Schema({ ...fields, items: [new mongoose.Schema(fields)] }));
  const policy = {
    nested: { read: true, update: whole },
    single: { read: true, update: whole },
    'nested.public': { update: true },
    'single.public': { update: true },
    'nested.settings': { update: true },
    'single.settings': { update: true },
    tags: { read: true, update: true },
    indexed: { read: true, update: whole },
    'indexed.0.public': { update: true },
    scalar: { read: true, update: true },
    audit: { read: true },
  };
  const runtime = createAccessRuntime();
  const router = runtime.createRouter(Model, {
    basePath: '/nested',
    operationAccess: {
      read: true,
      update: true,
      upsert: true,
      subs: { items: { read: true, update: true } },
    },
    permissionSchema: { ...policy, items: { sub: policy } },
    ...hooks,
  });
  const root = runtime.createRouter({ basePath: '/root', operationAccess: true });
  router.router.post('/internal/:op', async (req, res) => {
    const service = req.macl.getPublicService(name);
    const { id, data } = req.body;
    const options = { skim: true, includePermissions: false };
    const result =
      req.params.op === 'updateOne'
        ? await service.updateOne({ _id: id }, data, {}, options)
        : req.params.op === 'upsert'
          ? await service.upsert({ _id: id }, data, {}, options)
          : await service.updateById(id, data, {}, options);
    res.json(result);
  });
  const seed = {
    nested: original,
    single: original,
    tags: ['old', 'remove'],
    scalar: 'old',
    indexed: [
      { public: 'old', secret: 'first-secret' }, // pragma: allowlist secret
      { public: 'second', secret: 'second-secret' }, // pragma: allowlist secret
    ],
  };
  const doc = await Model.create({ ...seed, items: [seed, seed] });
  const id = String(doc._id);
  const subIds = doc.items.map((item) => String(item._id));
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(root.routes);

  async function invoke(entry: Entry, data: Record<string, unknown>) {
    if (entry === 'singleSub') return request(app).patch(`/nested/${id}/items/${subIds[0]}`).send(data).expect(200);
    if (entry === 'bulkSub') {
      return request(app)
        .patch(`/nested/${id}/items`)
        .send(subIds.map((_id) => ({ ...data, _id })))
        .expect(200);
    }
    if (entry === 'rootSub') {
      const response = await request(app)
        .post('/root')
        .send([
          {
            target: 'model',
            name,
            op: 'subUpdate',
            id,
            sub: 'items',
            subId: subIds[0],
            data,
          },
        ])
        .expect(200);
      expect(response.body[0].result.success).toBe(true);
      return response;
    }
    const response = await request(app).post(`/nested/internal/${entry}`).send({ id, data }).expect(200);
    expect(response.body.success).toBe(true);
    return response;
  }
  async function reload(entry: Entry) {
    // Raw Mongo reload makes missing persisted siblings visible even if Mongoose adds defaults.
    const stored = await Model.collection.findOne({ _id: doc._id });
    expect(stored).not.toBeNull();
    return entry.endsWith('Sub') ? stored!.items[0] : stored!;
  }
  return { app, Model, doc, id, invoke, reload };
}

afterEach(() => mongoose.deleteModel(/AbbNestedUpdate.*/));

describe('nested update persistence integrity (ABB-02)', () => {
  it.each(entries)('%s preserves protected siblings in both Mongoose schema forms', async (entry) => {
    const f = await fixture();
    await f.invoke(entry, {
      nested: { public: 'next', secret: 'attack' }, // pragma: allowlist secret
      single: { public: 'next', secret: 'attack' }, // pragma: allowlist secret
    });
    const stored = await f.reload(entry);
    expect(stored.nested).toEqual({ ...original, public: 'next' });
    expect(stored.single).toEqual({ ...original, public: 'next' });
    if (entry === 'bulkSub') {
      const parent = await f.Model.collection.findOne({ _id: f.doc._id });
      expect(parent!.items[1].nested).toEqual({ ...original, public: 'next' });
      expect(parent!.items[1].single).toEqual({ ...original, public: 'next' });
    }
  });

  it.each(entries)('%s preserves intentional whole-authorized replacement', async (entry) => {
    const f = await fixture(true);
    await f.invoke(entry, {
      nested: { public: 'replacement' },
      single: { public: 'replacement' },
      indexed: [{ public: 'replacement' }],
    });
    const stored = await f.reload(entry);
    expect(stored.nested).toEqual({ public: 'replacement' });
    expect(stored.single).toEqual({ public: 'replacement' });
    expect(stored.indexed).toEqual([{ public: 'replacement' }]);
  });

  it.each(entries)(
    '%s treats omission/empty/invalid containers as no leaf update and ignores dotted inputs',
    async (entry) => {
      const f = await fixture();
      for (const value of [undefined, null, {}, [], 'scalar']) {
        await f.invoke(entry, {
          nested: value,
          single: value,
          'nested.secret': 'attack', // pragma: allowlist secret
          'single.secret': 'attack', // pragma: allowlist secret
          'nested.public': 'dotted',
          'nested[secret]': 'attack', // pragma: allowlist secret
          'single[public]': 'dotted',
        });
        const stored = await f.reload(entry);
        expect(stored.nested).toEqual(original);
        expect(stored.single).toEqual(original);
      }
      await f.invoke(entry, { nested: { public: 'real', 'secret.value': 'attack' }, 'nested.public': 'dotted' }); // pragma: allowlist secret
      expect((await f.reload(entry)).nested).toEqual({ ...original, public: 'real' });
    },
  );

  it.each(entries)('%s applies atomic leaves, nulls, array replacement and indexed array patches', async (entry) => {
    const f = await fixture();
    await f.invoke(entry, {
      nested: { public: null, settings: { first: 'only' } },
      single: { public: null, settings: { first: 'only' } },
      scalar: null,
      tags: ['new'],
      indexed: [
        { public: 'next', secret: 'attack' }, // pragma: allowlist secret
        { public: 'attack', secret: 'attack' }, // pragma: allowlist secret
      ],
    });
    const stored = await f.reload(entry);
    expect(stored.nested).toEqual({ public: null, secret: 'protected', settings: { first: 'only' } }); // pragma: allowlist secret
    expect(stored.single).toEqual({ public: null, secret: 'protected', settings: { first: 'only' } }); // pragma: allowlist secret
    expect(stored.scalar).toBeNull();
    expect(stored.tags).toEqual(['new']);
    expect(stored.indexed).toEqual([
      { public: 'next', secret: 'first-secret' }, // pragma: allowlist secret
      { public: 'second', secret: 'second-secret' }, // pragma: allowlist secret
    ]);
    await f.invoke(entry, { tags: [], nested: { settings: {} }, single: { settings: null } });
    const emptied = await f.reload(entry);
    expect(emptied.tags).toEqual([]);
    expect(emptied.nested.settings ?? {}).toEqual({});
    expect(emptied.single.settings).toBeNull();
    expect(emptied.nested.secret).toBe('protected');
    expect(emptied.single.secret).toBe('protected');
  });

  it.each(entries)('%s initializes absent/null containers through Mongoose path setters', async (entry) => {
    const f = await fixture();
    const prefix = entry.endsWith('Sub') ? 'items.0.' : '';
    for (const absent of [true, false]) {
      await f.Model.collection.updateOne(
        { _id: f.doc._id },
        absent
          ? { $unset: { [`${prefix}nested`]: '', [`${prefix}single`]: '' } }
          : { $set: { [`${prefix}nested`]: null, [`${prefix}single`]: null } },
      );
      await f.invoke(entry, { nested: { public: 'initialized' }, single: { public: 'initialized' } });
      const stored = await f.reload(entry);
      expect(stored.nested).toEqual({ public: 'initialized' });
      expect(stored.single).toEqual({ public: 'initialized' });
    }
  });

  it.each(['updateOne', 'updateById', 'upsert'] as const)(
    '%s preserves validation and trusted prepare/transform context',
    async (entry) => {
      const stages: string[] = [];
      let finalContext: ModelHookContext | undefined;
      const f = await fixture(false, {
        validate: {
          update(data, _permissions, context) {
            stages.push('validate');
            expect(data).toEqual({ nested: { public: 'client' }, single: { public: 'client' } });
            expect(context.allowedFields).toContain('nested.public');
            expect(context.originalData).toMatchObject({ nested: { secret: 'attack' } }); // pragma: allowlist secret
            expect(context.originalDocumentSnapshot).toMatchObject({ nested: original, single: original });
            expect(context.currentDocument!.get('nested.secret')).toBe('protected');
            expect(context.operation).toBe(entry === 'upsert' ? 'upsert' : 'update');
            expect(context.resolvedQuery!.filter).toBeTruthy();
            return true;
          },
        },
        prepare: {
          update: [
            function (data, _permissions, context) {
              stages.push('prepare-in-place');
              expect(context.allowedData).toBe(data);
              const value = data as { nested: { public: string }; single: { public: string } };
              value.nested.public = value.nested.public.toUpperCase();
              value.single.public = value.single.public.toUpperCase();
              return data;
            },
            function (data) {
              stages.push('prepare-return');
              const value = data as { nested: object; single: object };
              return {
                nested: { ...value.nested, secret: 'trusted-prepare' }, // pragma: allowlist secret
                single: { ...value.single, secret: 'trusted-prepare' }, // pragma: allowlist secret
                audit: 'server-only',
              };
            },
          ],
        },
        transform: {
          update(doc, _permissions, context) {
            stages.push('transform');
            expect(context.currentDocument).toBe(doc);
            expect(context.preparedData).toMatchObject({ audit: 'server-only' });
            expect(context.modifiedPaths).toEqual(expect.arrayContaining(['nested.public', 'single.public', 'audit']));
            expect(doc.toObject()).toMatchObject({
              nested: { ...original, public: 'CLIENT', secret: 'trusted-prepare' }, // pragma: allowlist secret
              single: { ...original, public: 'CLIENT', secret: 'trusted-prepare' }, // pragma: allowlist secret
            });
            // Explicit whole replacement in trusted transform is still supported.
            doc.set('nested', { public: 'transform-only' });
            doc.set('single', { public: 'transform-only' });
            return doc;
          },
        },
        afterPersist: {
          update(doc, _permissions, context) {
            stages.push('afterPersist');
            expect(doc.isNew).toBe(false);
            finalContext = context;
            return doc;
          },
        },
      });
      await f.invoke(entry, {
        nested: { public: 'client', secret: 'attack' }, // pragma: allowlist secret
        single: { public: 'client', secret: 'attack' }, // pragma: allowlist secret
        audit: 'attack',
      });
      expect(stages).toEqual(['validate', 'prepare-in-place', 'prepare-return', 'transform', 'afterPersist']);
      const stored = await f.reload(entry);
      expect(stored.nested).toEqual({ public: 'transform-only' });
      expect(stored.single).toEqual({ public: 'transform-only' });
      expect(stored.audit).toBe('server-only');
      expect(finalContext!.operation).toBe(entry === 'upsert' ? 'upsert' : 'update');
      expect(finalContext!.originalDocumentSnapshot).toMatchObject({ nested: original, single: original });
      expect(finalContext!.finalDocumentSnapshot).toMatchObject({
        nested: { public: 'transform-only' },
        single: { public: 'transform-only' },
        audit: 'server-only',
      });
      expect(finalContext!.modifiedPaths).toEqual(expect.arrayContaining(['nested', 'single', 'audit']));
      expect(finalContext!.changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ op: 'remove', path: ['nested', 'secret'] }),
          expect.objectContaining({ op: 'remove', path: ['single', 'secret'] }),
        ]),
      );
    },
  );

  it.each(['echo', 'extra', 'empty', 'null', 'dotted', 'undefined', 'no-output'] as const)(
    'applies trusted %s prepare output deliberately',
    async (mode) => {
      const f = await fixture(false, {
        prepare: {
          update(data) {
            if (mode === 'echo') return data;
            if (mode === 'extra') return { nested: { secret: 'trusted-extra' }, single: { secret: 'trusted-extra' } }; // pragma: allowlist secret
            if (mode === 'empty') return { nested: {}, single: {} };
            if (mode === 'null') return { nested: null, single: null };
            if (mode === 'undefined') return { nested: undefined, single: undefined };
            if (mode === 'no-output') return null;
            return { 'nested.secret': 'trusted-dotted', 'single.secret': 'trusted-dotted' }; // pragma: allowlist secret
          },
        },
      });
      await f.invoke('updateOne', { nested: { public: 'next' }, single: { public: 'next' } });
      const stored = await f.reload('updateOne');
      const expected =
        mode === 'echo'
          ? { ...original, public: 'next' }
          : mode === 'empty' || mode === 'no-output'
            ? original
            : mode === 'null'
              ? null
              : mode === 'undefined'
                ? undefined
                : mode === 'extra'
                  ? { ...original, secret: 'trusted-extra' } // pragma: allowlist secret
                  : { ...original, secret: 'trusted-dotted' }; // pragma: allowlist secret
      expect(stored.nested).toEqual(expected);
      expect(stored.single).toEqual(expected);
    },
  );

  it('allows trusted prepare-only writes with no client field grants', async () => {
    const f = await fixture(false, {
      permissionSchema: {},
      prepare: {
        update(data) {
          expect(data).toEqual({});
          return { audit: 'trusted-only' };
        },
      },
    });
    await f.invoke('updateOne', { audit: 'attack', nested: null });
    const stored = await f.reload('updateOne');
    expect(stored.audit).toBe('trusted-only');
    expect(stored.nested).toEqual(original);
  });

  it('does not prepare, transform or persist after failed write validation', async () => {
    let hookCalls = 0;
    const f = await fixture(false, {
      validate: { update: () => false },
      prepare: {
        update(data) {
          hookCalls++;
          return data;
        },
      },
      transform: {
        update(doc) {
          hookCalls++;
          return doc;
        },
      },
    });
    const response = await request(f.app)
      .post('/nested/internal/updateOne')
      .send({
        id: f.id,
        data: { nested: { public: 'rejected' }, single: { public: 'rejected' } },
      })
      .expect(200);
    expect(response.body).toMatchObject({ success: false, code: 'bad_request' });
    expect(hookCalls).toBe(0);
    const stored = await f.reload('updateOne');
    expect(stored.nested).toEqual(original);
    expect(stored.single).toEqual(original);
  });

  it('keeps bracket/index policy aliases aligned with field selection', async () => {
    const f = await fixture(false, {
      permissionSchema: {
        'nested[public]': { update: true },
        'single[public]': { update: true },
        'indexed[0].public': { update: true },
      },
    });
    await f.invoke('updateOne', {
      nested: { public: 'next' },
      single: { public: 'next' },
      indexed: [{ public: 'next' }],
    });
    const stored = await f.reload('updateOne');
    expect(stored.nested).toEqual({ ...original, public: 'next' });
    expect(stored.single).toEqual({ ...original, public: 'next' });
    expect(stored.indexed).toEqual([
      { public: 'next', secret: 'first-secret' }, // pragma: allowlist secret
      { public: 'second', secret: 'second-secret' }, // pragma: allowlist secret
    ]);
  });

  it.each(['updateOne', 'singleSub', 'bulkSub'] as const)(
    '%s accepts whole-authorized null and empty replacement',
    async (entry) => {
      const f = await fixture(true);
      await f.invoke(entry, { nested: null, single: null, tags: null });
      const cleared = await f.reload(entry);
      expect(cleared.nested).toBeNull();
      expect(cleared.single).toBeNull();
      expect(cleared.tags).toBeNull();
      await f.invoke(entry, { nested: {}, single: {} });
      const empty = await f.reload(entry);
      // Mongoose minimize may omit empty objects; neither may resurrect old values.
      expect(empty.nested ?? {}).toEqual({});
      expect(empty.single ?? {}).toEqual({});
    },
  );
});
