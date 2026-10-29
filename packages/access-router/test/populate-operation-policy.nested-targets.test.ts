import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
type Row = Record<string, any>;
const Q = 'requireOperationAccessForPopulateQueries';
const D = 'requireOperationAccessForPopulateDependencies';
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const pairs = [
  [false, false],
  [false, true],
  [true, false],
  [true, true],
] as const;
const plain = (value: unknown): any => JSON.parse(JSON.stringify(value));
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
let sequence = 0;
afterEach(() => {
  vi.restoreAllMocks();
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^MpoNested/);
});

async function fixture(hydration: 'lean' | 'hydrated', queries = false, dependencies = false) {
  const api = createAccessRuntime();
  runtimes.push(api);
  const n = ++sequence;
  const userName = `MpoNestedUser${n}`;
  const documentName = `MpoNestedDocument${n}`;
  const projectName = `MpoNestedProject${n}`;
  const reads: Array<{ row: unknown; before: unknown; hydrated: boolean }> = [];
  const schema = (name: string, fields: Row) => {
    const value = new mongoose.Schema({ ...fields, date: Date });
    value.plugin(permissionsPlugin, { modelName: name });
    if (name !== projectName) {
      for (const op of ['find', 'findOne'] as const) {
        value.post(op, (result) => {
          for (const row of Array.isArray(result) ? result : result ? [result] : [])
            reads.push({ row, before: plain(row), hydrated: row instanceof mongoose.Document });
        });
      }
    }
    return value;
  };
  const userRef = { type: mongoose.Schema.Types.ObjectId, ref: userName };
  const documentRef = { type: mongoose.Schema.Types.ObjectId, ref: documentName };
  const User = mongoose.model(
    userName,
    schema(userName, { name: String, tenant: String, credit: { type: Number, select: false }, next: userRef }),
  );
  const Document = mongoose.model(
    documentName,
    schema(documentName, {
      name: String,
      key: String,
      owner: String,
      tenant: String,
      secret: { type: Number, select: false },
      user: userRef,
      self: documentRef,
    }),
  );
  const fields = {
    name: String,
    visible: { type: Boolean, default: true },
    document: documentRef,
    documents: [documentRef],
    user: userRef,
  };
  const note = new mongoose.Schema(fields);
  const child = new mongoose.Schema({ ...fields, notes: [note] });
  const Project = mongoose.model(
    projectName,
    schema(projectName, {
      ...fields,
      key: String,
      stringDocument: { type: String, ref: documentName },
      children: [child],
      profile: child,
      nested: { inner: fields },
    }),
  );
  const terminal = vi.fn(() => 'must-not-run');
  const userGrants = vi.fn(() => ({ owns: true }));
  const documentGrants = vi.fn((doc: Row) => ({ owns: doc.owner === 'document' }));
  const parentGrants = vi.fn(() => ({ owns: true }));
  const docSecret = vi.fn(
    (_doc, _permissions, context, inputs) => `${context.virtualAccess}:${inputs.document?.secret ?? 'null'}`,
  );
  const userCredit = vi.fn(
    (_doc, _permissions, context, inputs) => `${context.virtualAccess}:${inputs.user?.credit ?? 'null'}`,
  );
  const amount = vi.fn(
    (_doc, _permissions, context, inputs) => `${context.virtualAccess}:${inputs.user?.credit ?? 'null'}`,
  );
  const selfAmount = vi.fn(
    (_doc, _permissions, context, inputs) => `${context.virtualAccess}:${inputs.self?.secret ?? 'null'}`,
  );
  const declarations = {
    docSecret: { get: docSecret, dependsOnPopulate: [{ path: 'document', select: 'secret date -_id' }] },
    userCredit: { get: userCredit, dependsOnPopulate: [{ path: 'user', select: 'credit -_id' }] },
  };
  const fieldRules = {
    name: true,
    visible: false,
    document: true,
    documents: true,
    user: true,
    docSecret: 'm::owns',
    userCredit: 'm::owns',
  };
  const scope = { list: true, read: true, create: true, update: true, sub: fieldRules };
  const childScope = { ...scope, sub: { ...fieldRules, notes: scope } };
  api.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
    requestComplexity: { maxDepth: 20, maxBulkConcurrency: 1, maxHookConcurrency: 1 },
  });
  // Each explicit Document value opposes defaults; User inherits the opposite pair.
  api.setDefaultModelOptions({ [Q]: !queries, [D]: !dependencies });
  api.createRouter(User, {
    operationAccess: false,
    permissionSchema: { name: true, tenant: false, credit: false, date: false, next: false, terminal: true },
    docPermissions: userGrants,
    baseFilter: { read: () => ({ tenant: 'allowed' }), list: () => ({ tenant: 'allowed' }) },
    virtuals: { terminal: { get: terminal, dependsOnPopulate: [{ path: 'next', select: 'credit -_id' }] } },
  } as never);
  api.createRouter(Document, {
    [Q]: queries,
    [D]: dependencies,
    operationAccess: false,
    permissionSchema: {
      name: true,
      key: false,
      owner: false,
      tenant: false,
      secret: false,
      date: false,
      user: true,
      self: true,
      amount: 'm::owns',
      selfAmount: 'm::owns',
    },
    docPermissions: documentGrants,
    modelPermissionPrefix: 'm::',
    alwaysSelectFields: ['owner'],
    stripPermissionsField: true,
    baseFilter: { read: () => ({ tenant: 'allowed' }), list: () => ({ tenant: 'allowed' }) },
    virtuals: {
      amount: { get: amount, dependsOnPopulate: [{ path: 'user', select: 'credit -_id' }] },
      selfAmount: { get: selfAmount, dependsOnPopulate: [{ path: 'self', select: 'secret -_id' }] },
    },
  } as never);
  const router = api.createRouter(Project, {
    [Q]: !queries,
    [D]: !dependencies,
    basePath: '/projects',
    operationAccess: true,
    permissionSchema: {
      ...fieldRules,
      key: true,
      stringDocument: true,
      children: childScope,
      profile: childScope,
      nested: { read: true, list: true, sub: { inner: scope } },
    },
    modelPermissionPrefix: 'm::',
    docPermissions: parentGrants,
    stripPermissionsField: true,
    virtuals: {
      ...declarations,
      children: { sub: { ...declarations, notes: { sub: declarations } } },
      profile: { sub: declarations },
      nested: { sub: { inner: { sub: declarations } } },
    },
    hydration: Object.fromEntries(
      ['find', 'findOne', 'findById', 'publicRead', 'publicList'].map((key) => [key, hydration]),
    ),
    defaults: { publicReadOptions: { ...quiet, tryList: false }, publicListOptions: quiet },
  } as never);
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  const date = new Date('2026-01-02T03:04:05.000Z');
  const user = await User.create({ name: 'user', tenant: 'allowed', credit: 17, date });
  const outsideUser = await User.create({ name: 'outside-user', tenant: 'outside', credit: 91 });
  await User.updateOne({ _id: user._id }, { next: user._id });
  const document = await Document.create({
    name: 'document',
    key: 'join',
    owner: 'document',
    tenant: 'allowed',
    secret: 11,
    user: user._id,
    date,
  });
  const deniedDocument = await Document.create({
    name: 'other-grants',
    key: 'join',
    owner: 'other',
    tenant: 'allowed',
    secret: 29,
    user: user._id,
  });
  const outside = await Document.create({
    name: 'outside',
    owner: 'document',
    tenant: 'outside',
    secret: 99,
    user: outsideUser._id,
  });
  await Document.updateOne({ _id: document._id }, { self: document._id });
  const missing = new mongoose.Types.ObjectId();
  const ids = [document._id, missing, document._id, outside._id];
  const data = { name: 'project', key: 'join', document: document._id, documents: ids, user: user._id };
  const project = await Project.create({
    ...data,
    stringDocument: String(document._id),
    children: [
      { ...data, name: 'first', notes: [{ ...data, name: 'note' }] },
      { ...data, name: 'second', visible: false },
    ],
    profile: { ...data, name: 'profile' },
    nested: { inner: data },
  });
  Project.schema.path('document').default(document._id);
  Project.schema.path('user').default(user._id);
  const app = express().use(express.json()).use(api()).use(router.routes).use(root.routes);
  let callback!: (req: ModelRequest) => Promise<unknown>;
  let value: unknown;
  let failure: unknown;
  app.post('/probe', async (req, res) => {
    try {
      value = await callback(req as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    app,
    Project,
    Document,
    User,
    project,
    document,
    deniedDocument,
    outside,
    user,
    outsideUser,
    ids,
    missing,
    docSecret,
    userCredit,
    amount,
    selfAmount,
    terminal,
    documentGrants,
    parentGrants,
    userGrants,
    declarations,
    reads,
    assertNativeCopies() {
      for (const { row, before } of reads) expect(plain(row)).toEqual(before);
      for (const call of docSecret.mock.calls) {
        expect(call[0]).not.toHaveProperty('secret');
        expect(call[2]).not.toHaveProperty('populated');
        if (call[3].document) {
          expect(Object.keys(call[3].document).sort()).toEqual(['date', 'secret']);
          expect(call[3].document.date).toBeInstanceOf(Date);
        }
      }
      for (const call of [...amount.mock.calls, ...userCredit.mock.calls]) {
        expect(call[3]).toEqual({ user: { credit: 17 } });
        expect(call[2]).not.toHaveProperty('populated');
      }
      expect(terminal).not.toHaveBeenCalled();
    },
    async execute<T>(run: (req: ModelRequest) => Promise<T>): Promise<T> {
      callback = run;
      failure = undefined;
      await request(app).post('/probe').send({}).expect(200);
      if (failure) throw failure;
      return value as T;
    },
  };
}

function data(result: any): any {
  expect(result, JSON.stringify(result)).toMatchObject({ success: true });
  return result.data;
}
function expectPrivate(row: Row, dependencies: boolean, access = 'read') {
  if (dependencies) expect(row).not.toHaveProperty('docSecret');
  else expect(row).toHaveProperty('docSecret', `${access}:11`);
  if (dependencies) expect(row).toHaveProperty('userCredit', `${access}:17`);
  else expect(row).not.toHaveProperty('userCredit');
  expect(row).not.toHaveProperty('secret');
  expect(row).not.toHaveProperty('credit');
}

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe.each(['lean', 'hydrated'] as const)('MPO-02 mixed actual nested targets (%s)', (hydration) => {
  describe.each(pairs)('Document Q=%s D=%s; User inherits inverse', (queries, dependencies) => {
    it.each(['document', 'stringDocument', 'documents'] as const)(
      '%s public target uses User private policy and its own grants/cache',
      async (path) => {
        const f = await fixture(hydration, queries, dependencies);
        if (path === 'documents')
          await f.Project.updateOne(
            { _id: f.project._id },
            { documents: [f.document._id, f.deniedDocument._id, f.document._id] },
          );
        const result = data(
          await f.execute((req) =>
            req.macl.getService(f.Project.modelName).findOne(
              { _id: f.project._id },
              {
                select: [path, 'user', 'docSecret', 'userCredit'],
                populate: [
                  { path, select: ['name', 'user', 'amount', '-_id'] },
                  { path: 'user', select: 'name -_id' },
                ],
              },
              quiet,
            ),
          ),
        );
        expectPrivate(result, dependencies);
        if (queries)
          expect(plain(result[path])).toEqual(
            path === 'documents'
              ? [f.document, f.deniedDocument, f.document].map((doc) => String(doc._id))
              : String(f.document._id),
          );
        else {
          const rows = path === 'documents' ? result[path] : [result[path]];
          expect(rows[0]).toMatchObject({ name: 'document', user: f.user._id });
          if (dependencies) expect(rows[0]).toHaveProperty('amount', 'read:17');
          else expect(rows[0]).not.toHaveProperty('amount');
          expect(rows[0]).not.toHaveProperty('_id');
          if (path === 'documents') {
            expect(rows[1]).not.toHaveProperty('amount');
            expect(rows[2]).toEqual(rows[0]);
            expect(rows[2]).not.toBe(rows[0]);
            expect(f.amount).toHaveBeenCalledTimes(dependencies ? 1 : 0);
            rows[0].name = 'local-copy';
            expect(rows[2].name).toBe('document');
          }
          for (const [doc, , context] of f.documentGrants.mock.calls) {
            expect(doc).not.toHaveProperty('credit');
            expect(doc).not.toHaveProperty('secret');
            expect(context).toMatchObject({ modelName: f.Document.modelName, mongooseModel: f.Document });
          }
        }
        if (queries) expect(result.user).toEqual({ name: 'user' });
        else expect(result.user).toEqual(f.user._id);
        f.assertNativeCopies();
      },
    );

    it('batches embedded object/array/nested occurrences without turning source grants into target admission', async () => {
      const f = await fixture(hydration, queries, dependencies);
      const documentReads = vi.spyOn(f.Document.collection, 'find');
      const userReads = vi.spyOn(f.User.collection, 'find');
      const paths = ['children', 'profile', 'nested.inner'];
      const result = data(
        await f.execute((req) =>
          req.macl.getService(f.Project.modelName).findOne(
            { _id: f.project._id },
            {
              select: paths
                .flatMap((path) => ['document', 'user', 'docSecret', 'userCredit'].map((key) => `${path}.${key}`))
                .concat(['children.notes.docSecret', 'children.notes.userCredit']),
            },
            {
              ...quiet,
              authorization: { outputFields: { mode: 'grant', paths: ['children', 'profile', 'nested'] } },
            },
          ),
        ),
      );
      for (const row of [...result.children, result.children[0].notes[0], result.profile, result.nested.inner])
        expectPrivate(row, dependencies);
      expect(result.children[0].document).toEqual(f.document._id);
      expect(documentReads).toHaveBeenCalledTimes(dependencies ? 0 : 1);
      expect(userReads).toHaveBeenCalledTimes(dependencies ? 1 : 0);
      expect(f.userGrants).not.toHaveBeenCalled();
      expect(f.documentGrants).not.toHaveBeenCalled();
      f.assertNativeCopies();
    });

    it.each(['list', 'read', 'create', 'update', 'bulkUpdate'] as const)(
      'dedicated %s keeps parent/child grants, refs and target defaults separate',
      async (method) => {
        const f = await fixture(hydration, queries, dependencies);
        // The parent's resolved flags deliberately oppose Document's explicit override.
        f.api.setModelOptions(f.Project.modelName, { [Q]: !queries, [D]: !dependencies });
        const result = data(
          await f.execute((req) => {
            const service = req.macl.getService(f.Project.modelName);
            const id = String(f.project._id),
              childId = String(f.project.children[0]._id);
            const outputFields = {
              mode: 'grant' as const,
              paths: ['name', 'document', 'user', 'docSecret', 'userCredit', 'notes'],
            };
            if (method === 'list')
              return service.listSub(id, 'children', {
                filter: { visible: true },
                authorization: { parent: { operation: { mode: 'grant' } }, child: { outputFields } },
              });
            if (method === 'read')
              return service.readSub(id, 'children', childId, {
                select: ['name', 'document', 'user', 'docSecret', 'userCredit'],
                populate: [
                  { path: 'document', select: ['name', 'amount', '-_id'] },
                  { path: 'user', select: 'name -_id' },
                ],
                authorization: { parent: { operation: { mode: 'grant' } }, child: { outputFields } },
              });
            const authorization = {
              parent: { operation: { mode: 'grant' as const } },
              child: { inputFields: { mode: 'grant' as const, paths: ['name', 'document', 'user'] } },
              visibility: { child: { outputFields } },
            };
            if (method === 'create')
              return service.createSub(
                id,
                'children',
                { name: 'saved', document: f.document._id, user: f.user._id },
                { authorization },
              );
            if (method === 'update')
              return service.updateSub(id, 'children', childId, { name: 'saved' }, { authorization });
            return service.bulkUpdateSub(id, 'children', [{ _id: childId, name: 'saved' }], { authorization });
          }),
        );
        const rows = Array.isArray(result) ? result : [result];
        const row = method === 'create' ? rows.find((row: Row) => row.name === 'saved') : rows[0];
        expectPrivate(
          row,
          dependencies,
          method === 'list' ? 'list' : method === 'create' ? 'create' : method === 'read' ? 'read' : 'update',
        );
        if (method === 'read' && !queries) {
          expect(row.document).toMatchObject({ name: 'document' });
          if (dependencies) expect(row.document).toHaveProperty('amount', 'read:17');
          else expect(row.document).not.toHaveProperty('amount');
        } else expect(row.document).toEqual(f.document._id);
        if (method === 'read' && queries) expect(row.user).toEqual({ name: 'user' });
        else expect(row.user).toEqual(f.user._id);
        if (method !== 'list' && method !== 'read') {
          const stored = await f.Project.findById(f.project._id).lean();
          const saved = stored!.children.find((row) => row.name === 'saved')!;
          expect(saved.document).toEqual(f.document._id);
          expect(saved).not.toHaveProperty('docSecret');
        }
        expect(f.parentGrants).toHaveBeenCalledTimes(method === 'update' || method === 'bulkUpdate' ? 2 : 1);
        f.assertNativeCopies();
      },
    );

    it.each(['create', 'update', 'upsert-create', 'upsert-update', 'new'] as const)(
      '%s response derives the same policy and never persists computed/private output',
      async (method) => {
        const f = await fixture(hydration, queries, dependencies);
        const args = {
          select: ['name', 'document', 'user', 'docSecret', 'userCredit'],
          populate: [{ path: 'document', select: ['name', 'amount', '-_id'] }],
        };
        const output = data(
          await f.execute((req) => {
            const service = req.macl.getService(f.Project.modelName);
            const input = { name: 'saved', document: f.document._id, user: f.user._id };
            if (method === 'create') return service.create(input, args, quiet);
            if (method === 'update') return service.updateById(String(f.project._id), input, args, quiet);
            if (method === 'upsert-create') return service.upsert({ name: 'absent' }, input, args, quiet);
            if (method === 'upsert-update') return service.upsert({ _id: f.project._id }, input, args, quiet);
            return service.new({}, quiet);
          }),
        );
        const row = Array.isArray(output) ? output[0] : output;
        expectPrivate(row, dependencies, method === 'update' || method === 'upsert-update' ? 'update' : 'create');
        if (queries || method === 'new') expect(row.document).toEqual(f.document._id);
        else {
          expect(row.document).toMatchObject({ name: 'document' });
          if (dependencies) expect(row.document).toHaveProperty('amount', 'read:17');
          else expect(row.document).not.toHaveProperty('amount');
        }
        for (const stored of await f.Project.find().lean()) {
          expect(stored).not.toHaveProperty('docSecret');
          expect(stored.document).toBeInstanceOf(mongoose.Types.ObjectId);
        }
        expect(await f.Project.countDocuments()).toBe(method === 'create' || method === 'upsert-create' ? 2 : 1);
        f.assertNativeCopies();
      },
    );
  });

  it.each(['legacy', 'correlated'] as const)(
    '%s include read/list retains target dependency policy and attachment provenance',
    async (mode) => {
      const f = await fixture(hydration, false, false);
      f.api.setModelOptions(f.Document.modelName, { operationAccess: { read: true, list: true, count: true } });
      f.api.setDefaultModelOption(D, false);
      f.api.setModelOption(f.Project.modelName, D, true);
      const include = (op: 'read' | 'list' | 'count', path: string) => ({
        model: f.Document.modelName,
        op,
        path,
        ...(mode === 'correlated'
          ? { mode, filter: { key: { $parent: 'key' } } }
          : { localField: 'key', foreignField: 'key' }),
        ...(op === 'count' ? {} : { args: { select: ['name', 'amount', '-_id'] } }),
      });
      const result = data(
        await f.execute((req) =>
          req.macl.getService(f.Project.modelName).findOne(
            { _id: f.project._id },
            {
              select: ['name', '-document'],
              include: [include('read', 'document'), include('list', 'joined'), include('count', 'matches')],
            } as never,
            quiet,
          ),
        ),
      );
      expect(result).toMatchObject({
        joined: [{ name: 'document', amount: 'list:17' }, { name: 'other-grants' }],
        matches: 2,
      });
      // Authorized include output keeps its own attachment provenance even on an excluded source-ref path.
      expect(result.document).toMatchObject({ name: 'document', amount: 'read:17' });
      expect(result.joined[1]).not.toHaveProperty('amount');
      expect(result.document).not.toHaveProperty('user');
      expect(f.docSecret).not.toHaveBeenCalled();
      expect(f.userGrants).not.toHaveBeenCalled();
      f.assertNativeCopies();
    },
  );

  describe.each(['legacy', 'correlated'] as const)('%s recursive public includes', (mode) => {
    it.each([false, true])(
      'private User D=%s stays target-owned through Project → Document → Project',
      async (strict) => {
        const f = await fixture(hydration);
        f.api.setDefaultModelOption(D, !strict);
        f.api.setModelOptions(f.Project.modelName, { [D]: !strict });
        f.api.setModelOptions(f.Document.modelName, { [D]: !strict, operationAccess: { read: true, list: true } });
        f.api.setModelOptions(f.User.modelName, { [D]: strict });
        const userFind = vi.spyOn(f.User.collection, 'find');
        const join =
          mode === 'legacy'
            ? { localField: 'key', foreignField: 'key' }
            : { mode, filter: { key: { $parent: 'key' } } };
        const output = data(
          await f.execute((req) =>
            req.macl.getService(f.Project.modelName).findOne(
              { _id: f.project._id },
              {
                select: ['name'],
                include: [
                  {
                    model: f.Document.modelName,
                    op: 'list',
                    path: 'documents',
                    ...join,
                    args: {
                      select: ['name', 'amount'],
                      include: [
                        {
                          model: f.Project.modelName,
                          op: 'read',
                          path: 'back',
                          ...join,
                          args: { select: ['name', 'userCredit'] },
                        },
                      ],
                    },
                  },
                ],
              } as never,
              quiet,
            ),
          ),
        );
        expect(output.documents).toHaveLength(2);
        for (const [index, row] of output.documents.entries()) {
          expect(row).not.toHaveProperty('key');
          expect(row).not.toHaveProperty('user');
          expect(row.back).toMatchObject({ name: 'project' });
          if (strict) {
            expect(row).not.toHaveProperty('amount');
            expect(row.back).not.toHaveProperty('userCredit');
          } else {
            if (index === 0) expect(row).toHaveProperty('amount', 'list:17');
            else expect(row).not.toHaveProperty('amount');
            expect(row.back).toHaveProperty('userCredit', 'read:17');
          }
        }
        if (strict) expect(userFind).not.toHaveBeenCalled();
        else expect(userFind).toHaveBeenCalled();
        expect(f.userGrants).not.toHaveBeenCalled();
        f.assertNativeCopies();
      },
    );
  });

  it('self refs use the self target D override, while ordinary target virtuals use User D', async () => {
    const f = await fixture(hydration, false, true);
    f.api.setDefaultModelOption(D, false);
    const run = () =>
      f.execute((req) =>
        req.macl
          .getService(f.Project.modelName)
          .findOne(
            { _id: f.project._id },
            { select: ['document'], populate: [{ path: 'document', select: ['self', 'selfAmount', 'amount'] }] },
            quiet,
          ),
      );
    const first = data(await run());
    expect(first.document).toMatchObject({ self: f.document._id, amount: 'read:17' });
    expect(first.document).not.toHaveProperty('selfAmount');
    f.api.setModelOption(f.Document.modelName, D, false);
    f.api.setModelOption(f.User.modelName, D, true);
    const next = data(await run());
    expect(next.document).toMatchObject({ self: f.document._id, selfAmount: 'read:11' });
    expect(next.document).not.toHaveProperty('amount');
    f.assertNativeCopies();
  });

  it('keeps denied IDs, admitted misses/match/rows, omitted fields and direct/root guards independent', async () => {
    const f = await fixture(hydration);
    const args = {
      select: ['document', 'documents', 'user', 'docSecret'],
      populate: [
        { path: 'document', select: 'name -_id', match: { name: 'miss' } },
        { path: 'documents', select: 'name -_id' },
        { path: 'user', select: 'name -_id' },
      ],
    };
    const row = data(
      await f.execute((req) => req.macl.getService(f.Project.modelName).findOne({ _id: f.project._id }, args, quiet)),
    );
    expect(row).toMatchObject({
      document: null,
      documents: [{ name: 'document' }, { name: 'document' }],
      user: f.user._id,
      docSecret: 'read:11',
    });
    f.api.setModelOption(f.Project.modelName, 'permissionSchema.document', false);
    const denied = data(
      await f.execute((req) => req.macl.getService(f.Project.modelName).findOne({ _id: f.project._id }, args, quiet)),
    );
    expect(denied).not.toHaveProperty('document');
    expect(denied).toHaveProperty('docSecret', 'read:11');
    for (const flag of [Q, D])
      expect(() => f.api.setGlobalOptions({ [flag]: false } as never)).toThrow(
        /target.*setModelOptions.*setDefaultModelOptions/,
      );
    for (const op of ['read', 'list']) {
      const response = await request(f.app)
        .post('/root')
        .send([{ target: 'model', name: f.Document.modelName, op, id: String(f.document._id) }])
        .expect(200);
      expect(response.body[0].statusCode).toBe(401);
    }
    f.assertNativeCopies();
  });

  it('covered canonical unions/cache copies stay target-bound and scalar/helper/count paths do no private I/O', async () => {
    const f = await fixture(hydration);
    await f.Project.create(
      Array.from({ length: 7 }, () => ({
        document: f.document._id,
        documents: [f.document._id, f.document._id],
        user: f.user._id,
      })),
    );
    const documentFind = vi.spyOn(f.Document.collection, 'find');
    const userFind = vi.spyOn(f.User.collection, 'find');
    f.docSecret.mockImplementation((_doc, _permissions, context, inputs) => {
      expect(inputs.document.date.toISOString()).toBe('2026-01-02T03:04:05.000Z');
      inputs.document.date.setUTCFullYear(1900);
      return `${context.virtualAccess}:${inputs.document.secret}`;
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Project.modelName);
      const rows = data(
        await service.find(
          {},
          { select: ['documents', 'docSecret'], populate: [{ path: 'documents', select: 'name -_id' }] },
          quiet,
        ),
      );
      expect(rows).toHaveLength(8);
      for (const row of rows)
        expect(row).toMatchObject({ documents: [{ name: 'document' }, { name: 'document' }], docSecret: 'list:11' });
      expect(documentFind).toHaveBeenCalledTimes(1);
      expect(f.reads.length).toBeGreaterThan(0);
      expect(userFind).not.toHaveBeenCalled();
      documentFind.mockClear();
      expect(data(await service.count({}))).toBe(8);
      expect(data(await service.exists({ _id: f.project._id }))).toBe(true);
      await service.genSelect('read', ['docSecret']);
      await service.genQuerySelect('read', ['docSecret']);
      await service.pickAllowedFields({ docSecret: 'existing' }, 'read');
      await service.trimOutputFields({ docSecret: 'existing' }, 'read');
      f.api.setModelOption(f.Document.modelName, 'operationAccess', { count: true });
      data(
        await service.findOne(
          { _id: f.project._id },
          {
            select: ['name'],
            include: [
              { model: f.Document.modelName, op: 'count', path: 'matches', localField: 'key', foreignField: 'key' },
            ],
          },
          quiet,
        ),
      );
      expect(documentFind).not.toHaveBeenCalled();
      expect(userFind).not.toHaveBeenCalled();
    });
    f.assertNativeCopies();
  });

  describe.each([false, true])('initial target pair=%s is captured before suspension', (initial) => {
    it.each([
      'source-row',
      'source-field',
      'child',
      'fallback-id',
      'fallback-filter',
      'legacy',
      'correlated',
      'upsert',
    ] as const)(
      '%s keeps defaults/target overrides in flight, then refreshes on the SAME service/request',
      async (seam) => {
        const f = await fixture(hydration, initial, initial);
        const entered = latch(),
          held = latch();
        let calls = 0;
        const pause = async () => {
          if (++calls === 1) {
            entered.resolve();
            await held.promise;
          }
          return {};
        };
        const fallback = seam === 'fallback-id' || seam === 'fallback-filter';
        if (seam === 'source-field')
          f.api.setModelOption(f.Project.modelName, 'permissionSchema.document', async () => {
            await pause();
            return true;
          });
        else if (seam === 'upsert') f.api.setModelOption(f.Project.modelName, 'baseFilter.update', pause);
        else
          f.api.setModelOption(f.Project.modelName, 'baseFilter.read', async () => {
            await pause();
            return fallback ? { name: 'miss' } : {};
          });
        const args = {
          select: ['document', 'docSecret', 'userCredit'],
          populate: [{ path: 'document', select: ['name', 'amount', '-_id'] }],
        };
        await f.execute(async (req) => {
          const service = seam.startsWith('fallback')
            ? req.macl.getPublicService(f.Project.modelName)
            : req.macl.getService(f.Project.modelName);
          const run = () => {
            if (seam === 'child')
              return service.readSub(String(f.project._id), 'children', String(f.project.children[0]._id), args);
            if (seam === 'fallback-id')
              return req.macl
                .getPublicService(f.Project.modelName)
                ._read(String(f.project._id), args, { ...quiet, tryList: true });
            if (seam === 'fallback-filter')
              return req.macl
                .getPublicService(f.Project.modelName)
                ._readFilter({ _id: f.project._id }, args, { ...quiet, tryList: true });
            if (seam === 'legacy' || seam === 'correlated')
              return service.findOne(
                { _id: f.project._id },
                {
                  select: ['name'],
                  include: [
                    {
                      model: f.Project.modelName,
                      op: 'list',
                      path: 'joined',
                      args: seam === 'correlated' ? { select: args.select } : args,
                      ...(seam === 'legacy'
                        ? { localField: '_id', foreignField: '_id' }
                        : { mode: 'correlated', filter: { _id: { $parent: '_id' } } }),
                    },
                  ],
                } as never,
                quiet,
              );
            if (seam === 'upsert')
              return service.upsert(
                { name: 'absent' },
                { name: 'saved', document: f.document._id, user: f.user._id },
                args,
                quiet,
              );
            return service.findOne({ _id: f.project._id }, args, quiet);
          };
          const pending = run();
          await Promise.race([
            entered.promise,
            pending.then((result) => {
              throw new Error(`suspension was not reached: ${JSON.stringify(result)}`);
            }),
          ]);
          f.api.setDefaultModelOptions({ [Q]: initial, [D]: initial });
          f.api.setModelOptions(f.Document.modelName, { [Q]: !initial, [D]: !initial });
          held.resolve();
          const first = data(await pending),
            next = data(await run());
          const output = (value: Row) =>
            seam === 'legacy' || seam === 'correlated' ? value.joined[0] : Array.isArray(value) ? value[0] : value;
          for (const [row, strict] of [
            [output(first), initial],
            [output(next), !initial],
          ] as const) {
            expectPrivate(
              row,
              strict,
              fallback || seam === 'legacy' || seam === 'correlated' ? 'list' : seam === 'upsert' ? 'create' : 'read',
            );
            if (strict || seam === 'correlated') expect(row.document).toEqual(f.document._id);
            else expect(row.document).toMatchObject({ name: 'document' });
          }
          f.assertNativeCopies();
        });
      },
    );
  });

  it('child output grants cannot grant parent admission or a strict private target', async () => {
    const f = await fixture(hydration, false, true);
    f.api.setModelOptions(f.Project.modelName, {
      operationAccess: { read: false, subs: { children: { read: true } } },
    });
    f.parentGrants.mockReturnValue({ owns: false });
    const find = vi.spyOn(f.Document.collection, 'find');
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Project.modelName);
      const child = {
        outputFields: { mode: 'grant' as const, paths: ['document', 'user', 'docSecret', 'userCredit'] },
      };
      const run = (parent = {}) =>
        service.readSub(String(f.project._id), 'children', String(f.project.children[0]._id), {
          authorization: { parent, child },
        });
      expect(await run()).toMatchObject({ success: false, code: 'forbidden' });
      expect(find).not.toHaveBeenCalled();
      const row = data(await run({ operation: { mode: 'grant' } }));
      expectPrivate(row, true);
      expect(row.document).toEqual(f.document._id);
      expect(find).not.toHaveBeenCalled();
    });
  });
});
