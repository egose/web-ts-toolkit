import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';
import { quiet } from './service-authorization-fixture';

useMongoTestDatabase();
afterEach(() => vi.restoreAllMocks());
let sequence = 0;
const grant = (...paths: string[]) => ({ inputFields: { mode: 'grant' as const, paths } });
const unrestricted = { inputFields: { mode: 'unrestricted' as const } };
const bad = { success: false, code: 'bad_request' };
const methods = ['create', 'updateOne', 'updateById', 'upsert-update', 'upsert-create'] as const;
type Method = (typeof methods)[number];

async function fixture(options: Record<string, unknown> = {}) {
  const api = createAccessRuntime();
  const name = `SvafInput${++sequence}`;
  const child = new mongoose.Schema(
    { email: String, secret: String, tags: [{ value: String, secret: String }] },
    { strict: false },
  );
  const profile = new mongoose.Schema(
    { email: String, secret: { type: String, select: false } },
    { _id: false, strict: false },
  );
  const schema = new mongoose.Schema(
    {
      status: { type: String, default: 'draft' },
      internalNote: {
        type: String,
        select: false,
        default: 'default-note',
        validate: (value: string) => value !== 'invalid',
      },
      denied: { type: String, default: 'default-denied' },
      ownerId: { type: String, select: false, default: 'alice' },
      hookOnly: String,
      unlisted: String,
      audit: String,
      profile,
      nested: { email: String, secret: String },
      contacts: { type: [child], select: false, default: undefined },
      tags: { type: [String], default: undefined },
      bag: mongoose.Schema.Types.Mixed,
      labels: { type: Map, of: new mongoose.Schema({ email: String, secret: String }, { _id: false }) },
      authorization: mongoose.Schema.Types.Mixed,
      overrides: mongoose.Schema.Types.Mixed,
      security: { grants: mongoose.Schema.Types.Mixed, value: String },
      when: Date,
      bytes: Buffer,
      ref: { type: mongoose.Schema.Types.ObjectId, ref: name },
    },
    { strict: false, versionKey: 'revision' },
  );
  const nativeSetter = vi.fn();
  schema.virtual('nativeAlias').set(nativeSetter);
  const saves = vi.fn();
  schema.pre('save', function () {
    saves(this.isNew, this.get('internalNote'));
  });
  schema.plugin(permissionsPlugin, { modelName: name });
  const Model = mongoose.model(name, schema);
  api.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });
  const router = api.createRouter(Model, {
    basePath: '/input',
    operationAccess: true,
    permissionSchema: { status: true, internalNote: false, denied: false },
    virtuals: {
      receipt: { dependsOn: [], create: () => 'computed', update: () => 'computed' },
      profile: { sub: { badge: { dependsOn: [], read: () => 'badge' } } },
      contacts: {
        sub: {
          badge: { dependsOn: [], read: () => 'badge' },
          tags: { sub: { badge: { dependsOn: [], read: () => 'tag' } } },
        },
      },
    },
    ...options,
  } as never);
  const doc = await Model.create({
    status: 'ready',
    internalNote: 'stored-note',
    denied: 'stored-denied',
    ownerId: 'alice',
    hookOnly: 'old-hook',
    unlisted: 'old-unlisted',
    profile: { email: 'old', secret: 'profile-secret' }, // pragma: allowlist secret
    nested: { email: 'old', secret: 'nested-secret' }, // pragma: allowlist secret
    contacts: [
      { email: 'first', secret: 'first-secret', tags: [{ value: 'old-tag', secret: 'tag-secret' }] }, // pragma: allowlist secret
      { email: 'second', secret: 'second-secret', tags: [] }, // pragma: allowlist secret
    ],
    tags: ['one', 'two'],
    bag: {
      branch: { email: 'old', secret: 'mixed-secret' }, // pragma: allowlist secret
      list: [{ email: 'old', secret: 'mixed-array-secret' }, null, 'scalar'], // pragma: allowlist secret
    },
    labels: { work: { email: 'old', secret: 'map-secret' }, home: { email: 'home', secret: 'home-secret' } }, // pragma: allowlist secret
  });
  await Model.collection.updateOne({ _id: doc._id }, { $set: { ref: doc._id } });
  saves.mockClear();
  let callback: (req: ModelRequest) => Promise<void>, failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await callback(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const app = express().use(express.json()).use(router.routes);
  return {
    api,
    name,
    Model,
    doc,
    router,
    nativeSetter,
    saves,
    stored: (id = doc._id) => Model.collection.findOne({ _id: id }),
    async execute(run: (req: ModelRequest) => Promise<void>) {
      callback = run;
      failure = undefined;
      await request(app).post('/input/probe').send({}).expect(200);
      if (failure) throw failure;
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Service = ReturnType<ModelRequest['macl']['getService']>;
async function mutate(
  f: Fixture,
  service: Service,
  method: Method,
  data: Record<string, unknown>,
  authorization?: unknown,
  extra = {},
) {
  const args = { select: ['status', 'internalNote', 'hookOnly', 'receipt'] };
  const options = { ...quiet, ...extra, authorization } as never;
  return method === 'create'
    ? service.create(data, args, options)
    : method === 'updateOne'
      ? service.updateOne({ _id: f.doc._id }, data, args, options)
      : method === 'updateById'
        ? service.updateById(String(f.doc._id), data, args, options)
        : service.upsert(method === 'upsert-update' ? { _id: f.doc._id } : { status: 'missing' }, data, args, options);
}
function row(result: Awaited<ReturnType<typeof mutate>>): Record<string, any> {
  expect(result, JSON.stringify(result)).toMatchObject({ success: true });
  if (!result.success) throw new Error(result.code);
  return (Array.isArray(result.data) ? result.data[0] : result.data) as Record<string, any>;
}

describe('F01 independent persisted input authority', () => {
  it.each(['updateOne', 'updateById', 'upsert-update'] as const)(
    'F04 %s leaves untouched persisted virtual siblings outside descendant writes',
    async (method) => {
      const f = await fixture();
      await f.Model.collection.updateOne(
        { _id: f.doc._id },
        {
          $set: {
            receipt: 'historical-root',
            'contacts.1.badge': 'historical-child',
          },
        },
      );
      const before = await f.stored();
      await f.execute(async (req) => {
        const output = row(
          await mutate(
            f,
            req.macl.getService(f.name),
            method,
            {
              contacts: [{ email: 'patched' }],
            },
            grant('contacts.email'),
          ),
        );
        const stored = await f.stored();
        expect(stored).toHaveProperty('receipt', 'historical-root');
        expect(stored!.contacts[1]).toEqual(before!.contacts[1]);
        expect(stored!.contacts[0]).toEqual({ ...before!.contacts[0], email: 'patched' });
        expect(output).not.toHaveProperty('receipt');
      });
    },
  );

  it.each(methods)('F04 %s bounds composite input before input hooks and persistence', async (method) => {
    const validate = vi.fn(() => true),
      prepare = vi.fn((data) => data),
      permissions = vi.fn(() => ({}));
    const f = await fixture({ validate, prepare, docPermissions: permissions });
    f.api.setGlobalOptions({ requestComplexity: { maxNodes: 64, maxDepth: 8 } });
    const before = await f.stored();
    class Cyclic {
      self = this;
    }
    class Composite {
      constructor(readonly child: unknown) {}
    }
    const cycle = new Map<string, unknown>();
    cycle.set('self', cycle);
    const plainCycle: Record<string, unknown> = {};
    plainCycle.self = plainCycle;
    let deep: unknown = 'leaf',
      deepClass: unknown = 'leaf';
    for (let index = 0; index < 12; index++) {
      deep = { child: deep };
      deepClass = new Composite(deepClass);
    }
    const invalid = [
      new Cyclic(),
      cycle,
      plainCycle,
      deep,
      deepClass,
      Array(70).fill('value'),
      new Array(70),
      new Map(Array.from({ length: 70 }, (_, index) => [`key${index}`, index])),
    ];
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name);
      for (const bag of invalid) {
        expect(await mutate(f, service, method, { bag }, grant('bag'))).toMatchObject(bad);
      }
      const publicService = req.macl.getPublicService(f.name);
      expect(await publicService._create({ bag: new Cyclic() })).toMatchObject(bad);
      expect(await publicService._update(String(f.doc._id), { bag: new Cyclic() })).toMatchObject(bad);
      expect(await publicService._upsert({ _id: String(f.doc._id), bag: new Cyclic() })).toMatchObject(bad);
      for (const hook of [validate, prepare, permissions, f.saves]) expect(hook).not.toHaveBeenCalled();
      expect(await f.stored()).toEqual(before);
      expect(await f.Model.countDocuments()).toBe(1);
      const output = row(
        await mutate(f, service, method, { bag: new Composite(new Map([['value', 'bounded']])) }, grant('bag')),
      );
      expect((await f.stored(output._id))!.bag).toEqual({ child: { value: 'bounded' } });
      expect(validate).toHaveBeenCalledOnce();
      expect(prepare).toHaveBeenCalledOnce();
      expect(f.saves).toHaveBeenCalledOnce();
    });
  });

  it.each(['create', 'updateOne'] as const)(
    'F04 %s bounds trusted prepared-container sanitization before save',
    async (method) => {
      class Cyclic {
        self = this;
      }
      let prepared: unknown = new Cyclic();
      const f = await fixture({ prepare: (data) => ({ ...data, bag: prepared }) });
      const before = await f.stored();
      await f.execute(async (req) => {
        expect(await mutate(f, req.macl.getService(f.name), method, { status: 'prepared' }, grant())).toMatchObject(
          bad,
        );
        prepared = 'leaf';
        for (let index = 0; index < 110; index++) prepared = { child: prepared };
        expect(await mutate(f, req.macl.getService(f.name), method, { status: 'prepared' }, grant())).toMatchObject(
          bad,
        );
        expect(f.saves).not.toHaveBeenCalled();
        expect(await f.stored()).toEqual(before);
        expect(await f.Model.countDocuments()).toBe(1);
      });
    },
  );

  it.each(['request', 'grant', 'unrestricted'] as const)(
    'F03 retains recursive virtual-name input exclusion in %s mode',
    async (mode) => {
      class MixedInput {
        receipt = 'virtual';
        branch = { receipt: 'virtual', email: 'kept', badge: 'ordinary-root-value' };
        contacts = [{ badge: 'virtual', email: 'child', receipt: 'ordinary-child-value' }];
      }
      const validate = vi.fn((data) => {
        expect(data.bag).toEqual({
          branch: { email: 'kept', badge: 'ordinary-root-value' },
          contacts: [{ email: 'child', receipt: 'ordinary-child-value' }],
        });
        return true;
      });
      const f = await fixture({
        permissionSchema: { status: true, bag: mode === 'request' },
        validate: { create: validate, update: validate },
      });
      await f.execute(async (req) => {
        const policy = mode === 'request' ? undefined : mode === 'grant' ? grant('bag') : unrestricted;
        for (const method of methods) {
          const bag = new MixedInput();
          const output = row(await mutate(f, req.macl.getService(f.name), method, { status: 'aliases', bag }, policy));
          expect((await f.stored(output._id))!.bag).toEqual({
            branch: { email: 'kept', badge: 'ordinary-root-value' },
            contacts: [{ email: 'child', receipt: 'ordinary-child-value' }],
          });
          expect(output).not.toHaveProperty('bag');
          expect(bag.receipt).toBe('virtual');
        }
        expect(validate).toHaveBeenCalledTimes(methods.length);
      });
    },
  );

  it.each(['bag.receipt', 'bag.branch.receipt', 'bag.contacts.badge'])(
    'F03 rejects explicit virtual-name alias grant %s before effects',
    async (path) => {
      const validate = vi.fn(() => true),
        prepare = vi.fn((data) => data);
      const f = await fixture({ validate, prepare });
      await f.execute(async (req) => {
        for (const method of methods) {
          expect(
            await mutate(f, req.macl.getService(f.name), method, { bag: { receipt: 'attack' } }, grant(path)),
          ).toMatchObject(bad);
        }
        expect(validate).not.toHaveBeenCalled();
        expect(prepare).not.toHaveBeenCalled();
        expect(f.saves).not.toHaveBeenCalled();
        expect(await f.Model.countDocuments()).toBe(1);
      });
    },
  );

  it.each(['create', 'updateOne'] as const)(
    'F03 %s scrubs prepared Mixed aliases while preserving trusted business additions',
    async (method) => {
      class Prepared {
        receipt = 'virtual';
        keep = 'business';
      }
      const f = await fixture({
        prepare: (data) => ({
          ...data,
          bag: new Map<string, unknown>([
            ['receipt', 'virtual'],
            ['branch', new Prepared()],
          ]),
        }),
      });
      await f.execute(async (req) => {
        const output = row(await mutate(f, req.macl.getService(f.name), method, { status: 'prepared' }, grant()));
        expect((await f.stored(output._id))!.bag).toEqual({ branch: { keep: 'business' } });
      });
    },
  );

  it('F03 alias exclusion does not delete an untouched persisted sibling during a descendant patch', async () => {
    const f = await fixture();
    await f.Model.collection.updateOne({ _id: f.doc._id }, { $set: { 'bag.branch.receipt': 'historical-sibling' } });
    await f.execute(async (req) => {
      row(
        await mutate(
          f,
          req.macl.getService(f.name),
          'updateOne',
          { bag: { branch: { email: 'next' } } },
          grant('bag.branch.email'),
        ),
      );
      expect((await f.stored())!.bag.branch).toEqual({
        email: 'next',
        secret: 'mixed-secret', // pragma: allowlist secret
        receipt: 'historical-sibling',
      });
    });
  });

  it.each(methods)('%s admits additive writes without response elevation or later-call authority', async (method) => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name),
        actor = req.macl.getPermissions();
      const output = row(
        await mutate(
          f,
          service,
          method,
          {
            status: 'next',
            internalNote: 'backend-note',
            denied: 'attack',
            unlisted: 'backend-unlisted',
          },
          grant('internalNote', 'unlisted'),
        ),
      );
      expect(output).toHaveProperty('status', 'next');
      expect(output).not.toHaveProperty('internalNote');
      const stored = await f.stored(output._id);
      expect(stored).toMatchObject({ status: 'next', internalNote: 'backend-note', unlisted: 'backend-unlisted' });
      expect(stored!.denied).toBe(
        method === 'create' || method === 'upsert-create' ? 'default-denied' : 'stored-denied',
      );
      row(await service.updateOne({ _id: output._id }, { internalNote: 'later-attack' }, {}, quiet));
      expect(await f.stored(output._id)).toHaveProperty('internalNote', 'backend-note');
      expect(req.macl.getPermissions()).toBe(actor);
      expect(actor.has('admin')).toBe(false);
    });
  });

  it.each(methods)('%s unrestricted input remains independent of explicit output selection/grants', async (method) => {
    const f = await fixture();
    await f.execute(async (req) => {
      const result = await mutate(
        f,
        req.macl.getService(f.name),
        method,
        {
          status: 'next',
          internalNote: 'backend-note',
          denied: 'backend-denied',
          unknown: 'attack',
          receipt: 'attack',
        },
        { ...unrestricted, outputFields: { mode: 'grant', paths: ['internalNote'] } },
      );
      const output = row(result);
      expect(output).toHaveProperty('internalNote', 'backend-note');
      expect(output).not.toHaveProperty('denied');
      expect(await f.stored(output._id)).toMatchObject({ internalNote: 'backend-note', denied: 'backend-denied' });
      expect(await f.stored(output._id)).not.toHaveProperty('unknown');
      expect(await f.stored(output._id)).not.toHaveProperty('receipt');
    });
  });

  it.each([undefined, {}, { inputFields: { mode: 'request' } }, grant()])(
    'omitted/request/empty input preserves request writes (%j)',
    async (authorization) => {
      const f = await fixture();
      await f.execute(async (req) => {
        const output = row(
          await mutate(
            f,
            req.macl.getService(f.name),
            'updateOne',
            {
              status: 'ordinary',
              internalNote: 'attack',
              denied: 'attack',
            },
            authorization,
          ),
        );
        expect(output).toHaveProperty('status', 'ordinary');
        expect(await f.stored()).toMatchObject({
          status: 'ordinary',
          internalNote: 'stored-note',
          denied: 'stored-denied',
        });
      });
    },
  );

  it.each(['updateOne', 'updateById', 'upsert-update'] as const)(
    '%s descendant grants preserve hidden siblings and recursive array identities/cardinality',
    async (method) => {
      const f = await fixture();
      const before = await f.stored();
      await f.execute(async (req) => {
        const service = req.macl.getService(f.name);
        const policy = grant(
          'profile.email',
          'nested.email',
          'contacts.email',
          'contacts.tags.value',
          'bag.branch.email',
          'bag.list.email',
          'labels.work.email',
        );
        row(
          await mutate(
            f,
            service,
            method,
            {
              profile: { email: 'next', secret: 'attack' }, // pragma: allowlist secret
              nested: { email: 'next' },
              contacts: [
                {
                  _id: before!.contacts[1]._id,
                  email: 'next',
                  secret: 'attack', // pragma: allowlist secret
                  tags: [{ value: 'tag-next', secret: 'attack' }, { value: 'extra' }], // pragma: allowlist secret
                },
              ],
              bag: {
                branch: { email: 'next' },
                list: [
                  { email: 'next', secret: 'attack' }, // pragma: allowlist secret
                  { email: 'no-null-replacement' },
                  { email: 'no-scalar-replacement' },
                  { email: 'extra' },
                ],
              },
              labels: { work: { email: 'next', secret: 'attack' }, home: { email: 'attack' } }, // pragma: allowlist secret
            },
            policy,
          ),
        );
        expect(await f.stored()).toMatchObject({
          profile: { email: 'next', secret: 'profile-secret' }, // pragma: allowlist secret
          nested: { email: 'next', secret: 'nested-secret' }, // pragma: allowlist secret
          contacts: [
            {
              _id: before!.contacts[0]._id,
              email: 'next',
              secret: 'first-secret', // pragma: allowlist secret
              tags: [{ ...before!.contacts[0].tags[0], value: 'tag-next' }],
            },
            before!.contacts[1],
          ],
          bag: {
            branch: { email: 'next', secret: 'mixed-secret' }, // pragma: allowlist secret
            list: [{ email: 'next', secret: 'mixed-array-secret' }, null, 'scalar'], // pragma: allowlist secret
          },
          labels: { work: { email: 'next', secret: 'map-secret' }, home: before!.labels.home }, // pragma: allowlist secret
        });
        for (const contacts of [[], null, 'scalar', {}, [null, 'scalar'], [{}, {}, { email: 'extra' }]]) {
          row(await mutate(f, service, method, { contacts }, policy));
          const stored = await f.stored();
          expect(stored!.contacts).toHaveLength(2);
          expect(stored!.contacts.map((c: any) => String(c._id))).toEqual(
            before!.contacts.map((c: any) => String(c._id)),
          );
          expect(stored!.contacts.map((c: any) => c.email)).toEqual(['next', 'second']);
        }
        const sparse = new Array(2);
        sparse[1] = { email: 'sparse-second' };
        row(await mutate(f, service, method, { contacts: sparse }, policy));
        expect((await f.stored())!.contacts.map((c: any) => c.email)).toEqual(['next', 'sparse-second']);
        await f.Model.collection.updateOne({ _id: f.doc._id }, { $unset: { contacts: '' } });
        row(await mutate(f, service, method, { contacts: [{ email: 'no-create' }] }, policy));
        expect(await f.stored()).not.toHaveProperty('contacts');
      });
    },
  );

  it('a nested array container grants replacement there, while preserving its outer array and denied parent siblings', async () => {
    const f = await fixture();
    const before = await f.stored();
    await f.execute(async (req) => {
      row(
        await mutate(
          f,
          req.macl.getService(f.name),
          'updateOne',
          {
            contacts: [
              { email: 'attack', tags: [{ value: 'replacement', secret: 'authorized-tag', badge: 'virtual' }] }, // pragma: allowlist secret
            ],
          },
          grant('contacts.tags'),
        ),
      );
      const stored = await f.stored();
      expect(stored!.contacts).toHaveLength(2);
      expect(stored!.contacts[0]).toMatchObject({
        _id: before!.contacts[0]._id,
        email: 'first',
        secret: 'first-secret', // pragma: allowlist secret
      });
      expect(stored!.contacts[1]).toEqual(before!.contacts[1]);
      expect(stored!.contacts[0].tags).toEqual([
        expect.objectContaining({ value: 'replacement', secret: 'authorized-tag' }), // pragma: allowlist secret
      ]);
      expect(stored!.contacts[0].tags[0]).not.toHaveProperty('badge');
    });
  });

  it('descendants never replace scalar/invalid ancestors; object initialization and explicit null/undefined leaves use setters', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name),
        policy = grant('profile.email', 'bag.branch.email');
      for (const value of [undefined, null, {}, [], 'scalar']) {
        row(await mutate(f, service, 'updateOne', { profile: value, 'profile.email': 'dotted' }, policy));
        expect(await f.stored()).toHaveProperty('profile.email', 'old');
        expect(await f.stored()).toHaveProperty('profile.secret', 'profile-secret');
      }
      await f.Model.collection.updateOne(
        { _id: f.doc._id },
        { $set: { profile: null, 'bag.branch': 'opaque-scalar' } },
      );
      row(
        await mutate(
          f,
          service,
          'updateOne',
          { profile: { email: 'created' }, bag: { branch: { email: 'attack' } } },
          policy,
        ),
      );
      expect(await f.stored()).toHaveProperty('profile.email', 'created');
      expect(await f.stored()).toHaveProperty('bag.branch', 'opaque-scalar');
      row(await mutate(f, service, 'updateOne', { profile: { email: null } }, policy));
      expect(await f.stored()).toHaveProperty('profile.email', null);
      row(await mutate(f, service, 'updateOne', { profile: { email: undefined } }, policy));
      expect((await f.stored())!.profile ?? {}).not.toHaveProperty('email');
    });
  });

  it.each(['create', 'upsert-create'] as const)(
    '%s requires array-container authority to create array structure',
    async (method) => {
      const f = await fixture();
      await f.execute(async (req) => {
        const service = req.macl.getService(f.name);
        // pragma: allowlist nextline secret
        for (const contacts of [[{ email: 'blocked', secret: 'attack' }], { email: 'no-Mongoose-auto-wrap' }]) {
          const output = row(
            await mutate(
              f,
              service,
              method,
              { status: 'child-only', contacts, profile: { email: 'allowed', secret: 'attack' } }, // pragma: allowlist secret
              grant('contacts.email', 'profile.email'),
            ),
          );
          expect(await f.stored(output._id)).not.toHaveProperty('contacts');
          expect(await f.stored(output._id)).toHaveProperty('profile.email', 'allowed');
          expect(await f.stored(output._id)).not.toHaveProperty('profile.secret');
        }
        const output = row(
          await mutate(f, service, method, { contacts: [{ email: 'allowed', secret: 'allowed' }] }, grant('contacts')), // pragma: allowlist secret
        );
        expect((await f.stored(output._id))!.contacts).toEqual([
          expect.objectContaining({ email: 'allowed', secret: 'allowed' }), // pragma: allowlist secret
        ]);
      });
    },
  );

  it.each([grant('contacts', 'profile', 'tags', 'bag', 'authorization', 'overrides'), unrestricted])(
    'whole-container writes replace only eligible persisted content and strip virtuals/metadata (%j)',
    async (policy) => {
      const prepare = vi.fn((data) => ({
        ...data,
        audit: 'trusted',
        receipt: 'prepare-virtual',
        profile: { ...data.profile, badge: 'prepare-virtual' },
      }));
      const f = await fixture({
        prepare: { update: prepare },
        transform: {
          update: (doc) => {
            doc.set('profile.badge', 'transform-virtual');
            doc.set('receipt', 'transform-virtual');
            return doc;
          },
        },
      });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.name);
        const payload = {
          contacts: [
            {
              _id: f.doc.contacts![0]._id,
              email: 'replacement',
              unknown: 'attack',
              badge: 'attack',
              tags: [{ value: 'nested', badge: 'attack' }],
            },
          ],
          profile: { email: 'replacement', badge: 'attack', unknown: 'attack' },
          tags: [],
          bag: {
            business: { authorization: 'invoice', overrides: 'ordinary' },
            badge: 'ordinary-mixed-value',
            _permissions: { admin: true },
            executionContext: { admin: true },
          },
          authorization: { invoice: true },
          overrides: { filter: 'business' },
          _permissions: { admin: true },
          revision: 999,
          _id: new mongoose.Types.ObjectId(),
          nativeAlias: 'attack',
          receipt: 'attack',
        };
        row(await mutate(f, service, 'updateOne', payload, policy));
        const stored = await f.stored();
        expect(stored!.contacts).toHaveLength(1);
        expect(stored!.contacts[0]).toMatchObject({
          email: 'replacement',
          tags: [expect.objectContaining({ value: 'nested' })],
        });
        expect(stored!.contacts[0]).not.toHaveProperty('secret');
        expect(String(stored!.contacts[0]._id)).not.toBe(String(f.doc.contacts![0]._id));
        expect(stored!.profile).toEqual({ email: 'replacement' });
        expect(stored!.bag).toEqual({
          business: { authorization: 'invoice', overrides: 'ordinary' },
          badge: 'ordinary-mixed-value',
        });
        expect(stored!.tags).toEqual([]);
        expect(stored).toMatchObject({
          audit: 'trusted',
          authorization: { invoice: true },
          overrides: { filter: 'business' },
        });
        for (const key of ['badge', 'unknown']) expect(stored!.contacts[0]).not.toHaveProperty(key);
        expect(stored!.contacts[0].tags[0]).not.toHaveProperty('badge');
        for (const key of ['receipt', 'nativeAlias', '_permissions']) expect(stored).not.toHaveProperty(key);
        expect(stored!.revision).not.toBe(999);
        expect(f.nativeSetter).not.toHaveBeenCalled();
        expect(payload.profile.badge).toBe('attack'); // admission owns its copies
      });
    },
  );

  it('explicit containers authorize empty/null replacement and request containers stay additive', async () => {
    const f = await fixture({ permissionSchema: { status: true, contacts: { create: true, update: true } } });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name);
      row(
        await mutate(
          f,
          service,
          'updateOne',
          { contacts: [], profile: null, tags: null },
          grant('profile', 'tags', 'internalNote'),
        ),
      );
      expect(await f.stored()).toMatchObject({ contacts: [], profile: null, tags: null });
      const output = row(
        await mutate(
          f,
          service,
          'create',
          { contacts: [{ email: 'request-allowed', badge: 'attack' }] },
          grant('internalNote'),
        ),
      );
      expect((await f.stored(output._id))!.contacts).toHaveLength(1);
      expect((await f.stored(output._id))!.contacts[0]).not.toHaveProperty('badge');
    });
  });

  it('a granted container retains independently request-authorized descendants of permissive schemas', async () => {
    const f = await fixture({ permissionSchema: { 'profile.loose.code': { update: true } } });
    await f.execute(async (req) => {
      class LooseInput {
        code = 'request';
        denied = 'attack';
      }
      for (const loose of [{ code: 'request', denied: 'attack' }, new LooseInput()]) {
        row(
          await mutate(
            f,
            req.macl.getService(f.name),
            'updateOne',
            {
              profile: { email: 'granted', loose, unknown: 'attack' },
            },
            grant('profile'),
          ),
        );
        expect((await f.stored())!.profile).toEqual({ email: 'granted', loose: { code: 'request' } });
      }
    });
  });

  it('JS composite containers cannot persist virtual/unknown/control fields; native persisted leaves retain their types', async () => {
    class ProfileInput {
      email = 'class-input';
      badge = 'virtual';
      unknown = 'not-declared';
      _permissions = { forged: true };
    }
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name);
      const when = new Date('2026-01-01T00:00:00Z'),
        bytes = Buffer.from([1, 2, 3]);
      const data = { profile: new ProfileInput(), when, bytes };
      for (const method of ['create', 'updateOne'] as const) {
        const output = row(await mutate(f, service, method, data, unrestricted));
        const stored = await f.stored(output._id);
        expect(stored!.profile).toEqual({ email: 'class-input' });
        expect(stored!.when).toEqual(when);
        expect(stored!.bytes.buffer).toEqual(bytes);
      }
      const shaped = { ...data, profile: f.doc.get('profile') };
      const output = row(await mutate(f, service, 'create', shaped, unrestricted));
      expect((await f.stored(output._id))!.profile).toEqual({ email: 'old', secret: 'profile-secret' }); // pragma: allowlist secret
      expect(data.profile.badge).toBe('virtual');
    });
  });

  it('pre-write document grants are private, captured, and distinct from post-write/output metadata', async () => {
    const observations: Array<[string, string, boolean]> = [];
    const hook = vi.fn((doc, _permissions, context) => {
      observations.push([doc.internalNote, context.operation, doc instanceof mongoose.Document]);
      return { owner: doc.internalNote === 'stored-note' };
    });
    const validate = vi.fn((data, _permissions, context) => {
      expect(data).toEqual({ internalNote: 'changed', hookOnly: 'request-by-pre-grant' });
      expect(context.docPermissions).toEqual({ owner: true });
      expect(context.currentDocument.get('_permissions')).toBeUndefined();
      return true;
    });
    const transform = vi.fn((doc) => {
      doc.set('audit', 'trusted-transform');
      return doc;
    });
    const afterPersist = vi.fn((doc) => {
      expect(doc.isNew).toBe(false);
      return doc;
    });
    const f = await fixture({
      permissionSchema: { status: true, hookOnly: { read: 'owner', update: 'owner' }, internalNote: false },
      docPermissions: { update: hook },
      validate: { update: validate },
      transform: { update: transform },
      afterPersist: { update: afterPersist },
    });
    await f.execute(async (req) => {
      const result = await mutate(
        f,
        req.macl.getService(f.name),
        'updateById',
        {
          internalNote: 'changed',
          hookOnly: 'request-by-pre-grant',
          _permissions: { owner: true },
        },
        grant('internalNote'),
        { includePermissions: true, includeFieldPermissions: true },
      );
      const output = row(result);
      expect(output).not.toHaveProperty('internalNote');
      expect(output).not.toHaveProperty('hookOnly');
      expect(output._permissions.owner).toBe(false);
      expect(output._permissions._edit.internalNote).not.toBe(true);
      expect(output._permissions._view.internalNote).not.toBe(true);
      expect(await f.stored()).toMatchObject({
        internalNote: 'changed',
        hookOnly: 'request-by-pre-grant',
        audit: 'trusted-transform',
      });
      expect(await f.stored()).not.toHaveProperty('_permissions');
      expect(observations).toEqual([
        ['stored-note', 'update', true],
        ['changed', 'update', false],
      ]);
      expect(validate).toHaveBeenCalledOnce();
      expect(transform).toHaveBeenCalledOnce();
      expect(afterPersist).toHaveBeenCalledOnce();
      expect(f.saves).toHaveBeenCalledExactlyOnceWith(false, 'changed');
    });
  });

  it('pre-write grants see schema-hidden embedded input without exposing it in output', async () => {
    const observations: unknown[] = [];
    const f = await fixture({
      permissionSchema: { status: true, hookOnly: { update: 'owner' } },
      docPermissions: {
        update: (doc) => {
          observations.push(doc.profile?.secret);
          return { owner: doc.profile?.secret === 'profile-secret' }; // pragma: allowlist secret
        },
      },
    });
    await f.execute(async (req) => {
      const output = row(
        await mutate(
          f,
          req.macl.getService(f.name),
          'updateOne',
          {
            profile: { email: 'granted' },
            hookOnly: 'from-hidden-input',
          },
          grant('profile.email'),
        ),
      );
      expect(observations[0]).toBe('profile-secret');
      expect(await f.stored()).toMatchObject({
        profile: { email: 'granted', secret: 'profile-secret' }, // pragma: allowlist secret
        hookOnly: 'from-hidden-input',
      });
      expect(output).not.toHaveProperty('profile');
      expect(output).not.toHaveProperty('hookOnly');
    });
  });

  it.each(['create', 'updateOne'] as const)(
    '%s scrubs prepared JS containers while preserving trusted business additions',
    async (method) => {
      class PreparedProfile {
        constructor(readonly email: unknown) {}
        secret = 'trusted-prepare'; // pragma: allowlist secret
        badge = 'virtual';
        _permissions = { forged: true };
        executionContext = { forged: true };
      }
      const prepare = vi.fn((data) => {
        expect(data.profile).toEqual({ email: 'admitted' });
        return {
          ...data,
          audit: 'trusted',
          profile: new PreparedProfile(data.profile.email),
          receipt: 'virtual',
          _permissions: { forged: true },
        };
      });
      const f = await fixture({ prepare: { create: prepare, update: prepare } });
      await f.execute(async (req) => {
        const output = row(
          await mutate(
            f,
            req.macl.getService(f.name),
            method,
            {
              profile: { email: 'admitted', unknown: 'attack', _permissions: { forged: true } },
            },
            grant('profile.email'),
          ),
        );
        const stored = await f.stored(output._id);
        expect(stored!.profile).toEqual({ email: 'admitted', secret: 'trusted-prepare' }); // pragma: allowlist secret
        expect(stored).toHaveProperty('audit', 'trusted');
        expect(stored).not.toHaveProperty('receipt');
        expect(stored).not.toHaveProperty('_permissions');
        expect(prepare).toHaveBeenCalledOnce();
      });
    },
  );

  it('prepared Map virtual/control keys are omitted rather than serialized as null', async () => {
    const f = await fixture({
      prepare: {
        create: (data) => ({
          ...data,
          profile: new Map<string, unknown>([
            ['email', 'trusted-map'],
            ['badge', 'virtual'],
            ['_permissions', { forged: true }],
          ]),
        }),
      },
    });
    await f.execute(async (req) => {
      const output = row(await mutate(f, req.macl.getService(f.name), 'create', {}, grant()));
      expect((await f.stored(output._id))!.profile).toEqual({ email: 'trusted-map' });
    });
  });

  it('create ignores forged document grants, runs hooks/save, and resolves document permissions only after persistence', async () => {
    const hook = vi.fn(() => ({ owner: false }));
    const validate = vi.fn((data) => {
      expect(data).not.toHaveProperty('hookOnly');
      return true;
    });
    const prepare = vi.fn((data) => ({ ...data, audit: 'prepared', receipt: 'virtual' }));
    const afterPersist = vi.fn((doc) => doc);
    const f = await fixture({
      permissionSchema: { status: true, hookOnly: { create: 'owner' } },
      docPermissions: { create: hook },
      validate: { create: validate },
      prepare: { create: prepare },
      afterPersist: { create: afterPersist },
    });
    await f.execute(async (req) => {
      const output = row(
        await mutate(
          f,
          req.macl.getService(f.name),
          'create',
          {
            status: 'created',
            internalNote: 'backend-note',
            hookOnly: 'forged',
            _permissions: { owner: true },
          },
          grant('internalNote'),
        ),
      );
      expect(await f.stored(output._id)).toMatchObject({ internalNote: 'backend-note', audit: 'prepared' });
      for (const key of ['hookOnly', 'receipt', '_permissions'])
        expect(await f.stored(output._id)).not.toHaveProperty(key);
      expect(hook).toHaveBeenCalledOnce();
      expect(validate).toHaveBeenCalledOnce();
      expect(prepare).toHaveBeenCalledOnce();
      expect(afterPersist).toHaveBeenCalledOnce();
      expect(f.saves).toHaveBeenCalledExactlyOnceWith(true, 'backend-note');
    });
  });

  it.each(methods)('%s input authority never bypasses application or Mongoose validation', async (method) => {
    const validate = vi.fn(() => false),
      prepare = vi.fn((data) => data),
      afterPersist = vi.fn((doc) => doc);
    const f = await fixture({
      validate: { create: validate, update: validate },
      prepare: { create: prepare, update: prepare },
      afterPersist: { create: afterPersist, update: afterPersist },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name);
      expect(await mutate(f, service, method, { internalNote: 'backend' }, unrestricted)).toMatchObject(bad);
      expect(prepare).not.toHaveBeenCalled();
      expect(afterPersist).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      validate.mockReturnValue(true);
      await expect(mutate(f, service, method, { internalNote: 'invalid' }, unrestricted)).rejects.toMatchObject({
        name: 'ValidationError',
      });
      expect(f.saves).not.toHaveBeenCalled();
      expect(afterPersist).not.toHaveBeenCalled();
      expect(await f.Model.countDocuments()).toBe(1);
      expect(await f.stored()).toHaveProperty('internalNote', 'stored-note');
    });
  });

  it('captures input paths/request rules before awaiting hooks, and preserves terminal row constraints', async () => {
    let entered!: () => void, resume!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const f = await fixture({
      overrideFilter: {
        update: async (filter) => {
          entered();
          await paused;
          return filter;
        },
      },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name),
        policy = grant('internalNote');
      const pending = mutate(
        f,
        service,
        'updateOne',
        { status: 'captured', internalNote: 'granted', denied: 'attack' },
        policy,
      );
      await waiting;
      policy.inputFields.paths.push('denied');
      f.router.set('permissionSchema.denied', true);
      resume();
      row(await pending);
      expect(await f.stored()).toMatchObject({ status: 'captured', internalNote: 'granted', denied: 'stored-denied' });
      f.saves.mockClear();
      for (const filter of [false, { _id: f.doc._id }]) {
        expect(
          await service.upsert(
            filter as never,
            { internalNote: 'blocked' },
            {},
            {
              authorization: { ...unrestricted, rows: { mode: 'scope', filter: false } },
            },
          ),
        ).toMatchObject({ success: false, code: 'forbidden' });
      }
      expect(f.saves).not.toHaveBeenCalled();
    });
  });

  it('rejects malformed/unsafe/virtual/target input paths before identifiers, hooks, parsers or persistence', async () => {
    const validate = vi.fn(() => true),
      transform = vi.fn((filter) => filter),
      identifier = vi.fn((id) => ({ _id: id }));
    const f = await fixture({
      validate: { create: validate, update: validate },
      overrideFilter: { update: transform },
      resolveIdFilter: identifier,
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name),
        find = vi.spyOn(f.Model, 'findOne'),
        create = vi.spyOn(f.Model, 'create');
      const policies: unknown[] = [
        { inputFields: null },
        { inputFields: true },
        { inputFields: { mode: 'grant' } },
        { inputFields: { mode: 'scope' } },
        { inputFields: { mode: 'grant', paths: 'internalNote' } },
        { inputFields: { mode: 'request', paths: [] } },
        { inputFields: { mode: 'unrestricted', paths: [] } },
        { inputFields: { mode: 'grant', paths: [undefined] } },
        { inputFields: { mode: 'grant', paths: new Array(1) } },
        ...[
          'missing',
          'phantom',
          'receipt',
          'profile.badge',
          'contacts.badge',
          'nativeAlias',
          '_id',
          'contacts._id',
          'revision',
          '_permissions',
          'bag._permissions.owner',
          'bag.executionContext',
          'ref.email',
          'contacts.0.email',
          'contacts[0].email',
          'contacts.sub.email',
          '+status',
          'contacts.*',
          'bag.__proto__.admin',
          'bag.$set',
          'bag.constructor',
        ].map((path) => grant(path)),
      ];
      const accessor = {
        inputFields: Object.defineProperty({}, 'mode', { enumerable: true, get: vi.fn(() => 'unrestricted') }),
      };
      policies.push(accessor);
      for (const authorization of policies)
        for (const method of methods) {
          expect(
            await mutate(
              f,
              service,
              method,
              { internalNote: { $$sq: { model: f.name, op: 'list', filter: {} } } },
              authorization,
            ),
          ).toMatchObject(bad);
        }
      expect(Object.getOwnPropertyDescriptor(accessor.inputFields, 'mode')!.get).not.toHaveBeenCalled();
      for (const effect of [validate, transform, identifier, find, create, f.saves])
        expect(effect).not.toHaveBeenCalled();
      expect(await f.stored()).toHaveProperty('internalNote', 'stored-note');
    });
  });

  it('read/new/output/dedicated methods and related read/count targets reject input authority before effects', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name),
        find = vi.spyOn(f.Model, 'findOne'),
        list = vi.spyOn(f.Model, 'find');
      for (const inputFields of [
        { mode: 'request' },
        { mode: 'grant', paths: ['internalNote'] },
        { mode: 'unrestricted' },
      ]) {
        const options = { authorization: { inputFields } } as any;
        expect(await service.findOne({}, {}, options)).toMatchObject(bad);
        expect(await service.find({}, {}, options)).toMatchObject(bad);
        expect(await service.findById(String(f.doc._id), {}, options)).toMatchObject(bad);
        expect(await service.new({}, options)).toMatchObject(bad);
        expect(await service.exists({}, options)).toMatchObject(bad);
        expect(await service.distinct('status', options)).toMatchObject(bad);
        expect(await service.count({}, options)).toMatchObject(bad);
        expect(await (service.delete as any)(String(f.doc._id), options)).toMatchObject(bad);
        expect(await (service.countTrusted as any)({}, options)).toMatchObject(bad);
        for (const helper of ['pickAllowedFields', 'trimOutputFields'] as const)
          await expect(service[helper]({}, 'read', options)).rejects.toThrow();
        await expect(service.genAllowedFields({}, 'update', { ...options, purpose: 'output' })).rejects.toThrow();
        await expect(service.genSelect('update', undefined, options)).rejects.toThrow();
        await expect(service.genQuerySelect('create', undefined, options)).rejects.toThrow();
        expect(await service.createSub(String(f.doc._id), 'contacts', { email: 'attack' }, options)).toMatchObject(bad);
        for (const op of ['read', 'count']) {
          expect(
            await service.findOne(
              {},
              { include: { model: f.name, op, path: 'items', localField: '_id', foreignField: '_id' } } as never,
              { authorization: { related: { items: { model: f.name, inputFields } } } } as never,
            ),
          ).toMatchObject(bad);
        }
      }
      expect(find).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
    });
  });

  it('input grants neither replace request row scope nor bypass query-transform denial', async () => {
    const validate = vi.fn(() => true);
    const f = await fixture({ baseFilter: { update: () => false }, validate: { update: validate } });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name);
      expect(await mutate(f, service, 'updateOne', { internalNote: 'blocked' }, unrestricted)).toMatchObject({
        success: false,
        code: 'forbidden',
      });
      expect(validate).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      const elevatedRows = { ...unrestricted, rows: { mode: 'unrestricted' } };
      row(await mutate(f, service, 'updateOne', { internalNote: 'allowed' }, elevatedRows));
      expect(await f.stored()).toHaveProperty('internalNote', 'allowed');
      f.router.set('overrideFilter.update', () => false);
      f.saves.mockClear();
      validate.mockClear();
      expect(await mutate(f, service, 'upsert-update', { internalNote: 'blocked' }, elevatedRows)).toMatchObject({
        success: false,
        code: 'forbidden',
      });
      expect(validate).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
    });
  });

  it('configured dotted permission metadata and its ancestors cannot be written or deleted by elevation', async () => {
    const f = await fixture({ documentPermissionField: 'security.grants' });
    await f.Model.collection.updateOne(
      { _id: f.doc._id },
      { $set: { security: { grants: { private: true }, value: 'old' } } },
    );
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name);
      for (const path of ['security', 'security.grants', 'security.grants.private']) {
        expect(await mutate(f, service, 'updateOne', { security: null }, grant(path))).toMatchObject(bad);
      }
      for (const security of [null, {}, { value: 'new', grants: { forged: true } }]) {
        row(await mutate(f, service, 'updateOne', { security }, unrestricted));
        expect(await f.stored()).toHaveProperty('security.grants', { private: true });
      }
      expect(await f.stored()).toHaveProperty('security.value', 'new');
    });
  });

  it('input grants do not authorize populate/subquery targets; explicit related grants stay separate', async () => {
    const f = await fixture({
      operationAccess: { read: false, list: false, update: true, create: true },
      permissionSchema: { status: true, ref: true },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.name),
        authorization = grant('internalNote');
      const args = { select: ['ref'], populate: [{ path: 'ref', select: ['internalNote'] }] };
      const targetFind = vi.spyOn(f.Model, 'find');
      const skipped = row(
        await service.updateOne({ _id: f.doc._id }, { internalNote: 'source-only' }, args, { ...quiet, authorization }),
      );
      expect(String(skipped.ref)).toBe(String(f.doc._id)); // denied populate retains the ref, never target output
      expect(targetFind).not.toHaveBeenCalled();
      expect(await f.stored()).toHaveProperty('internalNote', 'source-only');
      f.saves.mockClear();
      expect(
        await service.create(
          { internalNote: { $$sq: { model: f.name, op: 'list', filter: {} } } },
          {},
          { ...quiet, authorization },
        ),
      ).toMatchObject({ success: false, code: 'unauthorized' });
      expect(f.saves).not.toHaveBeenCalled();
      const result = await service.updateOne({ _id: f.doc._id }, { internalNote: 'backend-note' }, args, {
        ...quiet,
        authorization: {
          ...authorization,
          related: {
            ref: {
              model: f.name,
              operation: { mode: 'grant' },
              outputFields: { mode: 'grant', paths: ['internalNote'] },
            },
          },
        },
      });
      expect(row(result)).toHaveProperty('ref.internalNote', 'backend-note');
      expect(await f.stored()).toHaveProperty('internalNote', 'backend-note');
      expect(await service.findOne({ _id: f.doc._id }, { select: ['internalNote'] }, quiet)).toMatchObject({
        success: true,
      });
      expect(row(await service.findOne({ _id: f.doc._id }, { select: ['internalNote'] }, quiet))).not.toHaveProperty(
        'internalNote',
      );
    });
  });
});
