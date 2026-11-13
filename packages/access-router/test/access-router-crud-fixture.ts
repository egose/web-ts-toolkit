/** Real CRUD workers, real Mongoose documents, deterministic persistence; NOT database latency. */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Core } from '../src/core';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { PublicService } from '../src/services/public-service';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import type { AuthorizationMode, ModelRequest, ModelRouterOptions } from '../src/interfaces';

export const fixtureId = 'access-router-crud-v1';
export const modeKeys = [
  'readAuthorizationMode',
  'listAuthorizationMode',
  'createAuthorizationMode',
  'updateAuthorizationMode',
] as const;
export const tuples = Array.from(
  { length: 16 },
  (_, bits) => modeKeys.map((_, index) => (bits & (1 << (3 - index)) ? 'trusted' : 'isolated')) as AuthorizationMode[],
);
export const operations = [
  'read-hit',
  'read-miss',
  'read-fallback',
  'list-empty',
  'list-single',
  'list-many',
  'create-single',
  'create-bulk',
  'update-id',
  'update-filter',
  'upsert-create',
  'upsert-update',
] as const;
export type CrudOperation = (typeof operations)[number];
/** Optional input-focused shapes. The original v1 catalog/IDs remain historical and unchanged. */
export const inputShapes = [
  'input-nested',
  'input-native',
  'input-async',
  'input-functions',
  'input-markers',
  'input-subqueries',
] as const;
export type CrudCase = {
  id: string;
  modes: AuthorizationMode[];
  entry: 'direct' | 'public';
  operation: CrudOperation;
  shape: 'hooks' | 'bare' | 'rich' | 'metadata' | 'logging' | (typeof inputShapes)[number];
  rows: number;
  width: number;
};

export function caseId(c: Omit<CrudCase, 'id'>) {
  return `${c.modes.map((m) => m[0]).join('')}/${c.entry}/${c.operation}/${c.shape}/${c.rows}x${c.width}`;
}

/** Compact all-tuple matrix; richer controls only repeat the two active modes, not irrelevant settings. */
export function crudCatalog(): CrudCase[] {
  const result: CrudCase[] = [];
  const add = (c: Omit<CrudCase, 'id'>) => result.push({ ...c, id: caseId(c) });
  for (const modes of tuples)
    for (const entry of ['direct', 'public'] as const)
      for (const operation of operations) {
        if (entry === 'public' && operation === 'update-filter') continue; // No public filter-update API.
        add({ modes, entry, operation, shape: 'hooks', rows: 4, width: 4 });
      }
  for (const modes of [tuples[0], tuples[15]])
    for (const entry of ['direct', 'public'] as const)
      for (const shape of ['bare', 'rich', 'metadata', 'logging'] as const)
        for (const operation of ['read-hit', 'list-many', 'create-bulk', 'update-id'] as const)
          add({ modes, entry, operation, shape, rows: shape === 'bare' ? 1 : 16, width: shape === 'bare' ? 1 : 16 });
  return result;
}

/** Bounded diagnostics/correctness extension, not a new default timing Cartesian product. */
export function inputCatalog(): CrudCase[] {
  const result: CrudCase[] = [];
  const add = (c: Omit<CrudCase, 'id'>) => result.push({ ...c, id: caseId(c) });
  for (const modes of [tuples[0], tuples[15]])
    for (const entry of ['direct', 'public'] as const)
      for (const shape of inputShapes) {
        for (const operation of operations.filter((op) => /^(create|update|upsert)-/.test(op))) {
          if (entry === 'public' && operation === 'update-filter') continue;
          add({ modes, entry, operation, shape, rows: operation === 'create-bulk' ? 8 : 1, width: 16 });
        }
        for (const operation of ['create-single', 'update-id'] as const)
          add({ modes, entry, operation, shape, rows: 1, width: 1 });
      }
  return result;
}

export function validateCase(c: CrudCase) {
  assert.equal(c.id, caseId(c), 'fixture label mismatch');
  assert.equal(c.modes.length, 4, 'four modes required in READ/LIST/CREATE/UPDATE order');
  for (const mode of c.modes) assert.ok(mode === 'isolated' || mode === 'trusted', 'invalid mode');
  assert.ok(operations.includes(c.operation), 'unknown CRUD operation');
  assert.ok(['direct', 'public'].includes(c.entry), 'unknown worker entry');
  assert.ok(c.entry !== 'public' || c.operation !== 'update-filter', 'no public filter-update API');
  assert.ok(['hooks', 'bare', 'rich', 'metadata', 'logging', ...inputShapes].includes(c.shape), 'unknown workload');
  assert.ok(Number.isSafeInteger(c.rows) && c.rows > 0 && c.rows <= 32, 'row bound');
  assert.ok(Number.isSafeInteger(c.width) && c.width > 0 && c.width <= 24, 'width bound');
}

let serial = 0;
export function createCrudFixture(c: CrudCase, diagnostic = false) {
  validateCase(c);
  const counts: Record<string, number> = {};
  const trace: string[] = [];
  // Disabled in timing workers. No spies, traces or counters in the timed path.
  const work = (key: string) => {
    if (diagnostic) {
      counts[key] = (counts[key] ?? 0) + 1;
      trace.push(key);
    }
  };
  const rich = c.shape === 'rich';
  const inputShape = (inputShapes as readonly string[]).includes(c.shape);
  const nested = rich || inputShape;
  const native = rich || (inputShape && c.shape !== 'input-nested');
  const functionRules = c.shape === 'input-functions';
  const metadata = c.shape === 'metadata';
  const hooks = c.shape !== 'bare' && c.shape !== 'input-nested';
  const fields = Array.from({ length: c.width }, (_, i) => `f${i}`);
  const schema = new mongoose.Schema(
    {
      _id: String,
      value: String,
      owner: Boolean,
      hidden: String,
      when: Date,
      payload: mongoose.Schema.Types.Mixed,
      children: [new mongoose.Schema({ label: String, hidden: String }, { _id: false })],
      nested: { safe: String },
      ...Object.fromEntries(fields.map((key) => [key, String])),
    },
    { versionKey: false },
  );
  const model = mongoose.model(`ArpcCrud${++serial}`, schema);
  const runtime = new AccessRuntime();
  const logger = {
    isLevelEnabled: () => false,
    debug: () => {
      work('logger.debug');
    },
    warn: () => {
      work('logger.warn');
    },
  };
  runtime.setGlobalOptions({ logger, requestComplexity: { maxHookConcurrency: 2, maxBulkConcurrency: 2 } });
  runtime.registerModelInstance(model.modelName, model);
  const permissionSchema: any = {
    value: true,
    owner: true,
    hidden: false,
    when: true,
    payload: true,
    ...Object.fromEntries(fields.map((key) => [key, true])),
    children: {
      read: true,
      list: true,
      create: true,
      update: true,
      sub: { label: inputShape ? true : 'doc:owner', hidden: false },
    },
    nested: { read: true, list: true, create: true, update: true, sub: { safe: true } },
  };
  if (functionRules)
    for (const field of ['value', ...fields])
      permissionSchema[field] = Object.fromEntries(
        ['read', 'list', 'create', 'update'].map((access) => [
          access,
          function (permissions: Permission) {
            work(`rule.${access}.${field}`);
            return permissions.has('reader');
          },
        ]),
      );
  const hook = function (doc: any, _p: unknown, context: any) {
    work(`hook.${context.docPermissionsAccess}.${doc instanceof mongoose.Document ? 'input' : 'output'}`);
    if (!(doc instanceof mongoose.Document)) doc.value = `hook:${doc.value}`;
    return { owner: doc.owner === true };
  };
  const options: ModelRouterOptions = {
    operationAccess: true,
    baseFilter: {
      read: () => {
        work('filter.read');
        return c.operation === 'read-fallback' ? { _id: 'not-visible' } : true;
      },
      list: () => {
        work('filter.list');
        return true;
      },
      update: () => {
        work('filter.update');
        return true;
      },
      create: () => {
        work('filter.create');
        return true;
      },
    },
    ...Object.fromEntries(modeKeys.map((key, i) => [key, c.modes[i]])),
    permissionSchema,
    modelPermissionPrefix: 'doc:',
    stripPermissionsField: !metadata,
    disableFieldPermissions: !metadata,
    hydration: {
      find: rich ? 'hydrated' : 'lean',
      findOne: rich ? 'hydrated' : 'lean',
      publicList: rich ? 'hydrated' : 'lean',
      publicRead: rich ? 'hydrated' : 'lean',
    },
    ...(hooks
      ? {
          docPermissions:
            rich || c.shape === 'input-async'
              ? async (...args: Parameters<typeof hook>) => {
                  await Promise.resolve();
                  return hook(...args);
                }
              : hook,
        }
      : {}),
    ...(rich
      ? {
          virtuals: {
            children: { sub: {} },
            label: {
              dependsOn: ['value'],
              get: (doc: any) => {
                work('virtual.label');
                return `virtual:${doc.value}`;
              },
            },
          },
        }
      : {}),
  };
  if (rich) permissionSchema.label = true;
  runtime.setModelOptions(model.modelName, options);
  let docs: any[] = [];
  let saved: any[] = [];
  const make = (data: object) => {
    const doc = new model(data);
    // Deterministic adapter boundary, not mocked service orchestration or real DB I/O.
    doc.save = async () => {
      work('adapter.save');
      saved.push(doc.toObject());
      return doc;
    };
    return doc;
  };
  const matches = (doc: any, filter: any): boolean => {
    if (filter === false) return false;
    if (filter === true || filter == null) return true;
    return Object.entries(filter).every(([key, value]: [string, any]) => {
      if (key === '$and') return value.every((part: any) => matches(doc, part));
      if (key === '$or') return value.some((part: any) => matches(doc, part));
      assert.ok(!key.startsWith('$'), `unsupported deterministic filter ${key}`);
      if (value && typeof value === 'object' && '$in' in value) return value.$in.includes(doc.get(key));
      assert.ok(value === null || typeof value !== 'object', 'unsupported deterministic predicate');
      return doc.get(key) === value;
    });
  };
  const adapter = {
    mongooseModel: model,
    findOne: async ({ filter, lean }: any) => {
      work('adapter.findOne');
      const doc = docs.find((doc) => matches(doc, filter));
      return doc ? (lean ? doc.toObject() : doc) : null;
    },
    find: async ({ filter, lean, select, limit, skip = 0 }: any) => {
      work(select === '_id' ? 'adapter.visibility' : 'adapter.find');
      const selected = docs.filter((doc) => matches(doc, filter)).slice(skip, limit ? skip + limit : undefined);
      if (select === '_id') return selected.map((doc) => ({ _id: doc._id }));
      return selected.map((doc) => (lean ? doc.toObject() : doc));
    },
    create: async (items: object[]) => {
      work('adapter.create');
      return items.map((item) => {
        const doc = make({ _id: `created-${docs.length}`, ...item });
        docs.push(doc);
        saved.push(doc.toObject());
        return doc;
      });
    },
    exists: async (filter: any) => {
      work('adapter.exists');
      return docs.find((doc) => matches(doc, filter)) ?? null;
    },
    countDocuments: async (filter: any) => {
      work('adapter.count');
      return docs.filter((doc) => matches(doc, filter)).length;
    },
  };
  class DirectWorker extends Service {
    protected createModelAdapter() {
      return adapter;
    }
  }
  class PublicWorker extends PublicService {
    protected createModelAdapter() {
      return adapter;
    }
  }
  // Only the optional $$sq fixture uses this adapter Core. Target admission,
  // target Service/PublicService authorization and output still execute normally.
  class AdapterCore extends Core {
    getPublicService<TModel = unknown, TVirtuals extends object = Record<never, never>>(name: string) {
      assert.equal(name, model.modelName, 'unexpected deterministic subquery target');
      return new PublicWorker(this.req, name) as PublicService<TModel, TVirtuals>;
    }
  }
  function receivers() {
    const request = {
      [PERMISSIONS]: new Permission({ reader: true }),
      _permissions: { reader: true },
      query: {},
      params: {},
      get: () => undefined,
    } as unknown as ModelRequest;
    return runWithRuntime(runtime, () => {
      request.macl = c.shape === 'input-subqueries' ? new AdapterCore(request) : new Core(request);
      return {
        direct: new DirectWorker(request, model.modelName),
        public: new PublicWorker(request, model.modelName),
      };
    });
  }
  let services: ReturnType<typeof receivers>;
  const resolvedModes = () =>
    modeKeys.map((key) => {
      const exact = runtime.getModelOption(model.modelName, key);
      assert.equal(exact, runtime.getModelOptions(model.modelName)[key], 'exact/bulk mode mismatch');
      return exact;
    });
  const assertModes = () => assert.deepEqual(resolvedModes(), c.modes, 'resolved mode mismatch');
  const row = (index: number) => ({
    _id: `row-${index}`,
    value: `value-${index}`,
    owner: index % 2 === 0,
    hidden: 'DENIED',
    ...(nested
      ? {
          ...(native ? { when: new Date(7) } : {}),
          payload: native
            ? {
                bytes: Buffer.from('native'),
                stamp: new Date(9),
                ...(inputShape
                  ? {
                      code: new mongoose.mongo.BSON.Code('return n', { n: new mongoose.mongo.BSON.Int32(7) }),
                      map: new Map([['a', { stamp: new Date(11), text: 'mapped' }]]),
                    }
                  : {}),
              }
            : { branch: { a: { b: 'plain' } }, items: [{ label: 'one' }, { label: 'two' }] },
          children: [{ label: 'child', hidden: 'DENIED' }],
          nested: { safe: 'safe' },
        }
      : {}),
    ...Object.fromEntries(fields.map((key) => [key, `${key}:${'x'.repeat(rich ? 32 : 4)}`])),
  });
  const input = () => {
    const { _id, ...data } = row(0);
    const result: Record<string, any> = { ...data, value: 'submitted', hidden: 'attempted-write' };
    if (c.shape === 'input-markers') {
      result.when = { $$date: 7 };
      result.payload.stamp = { $$date: 9 };
      result.payload.map = { a: { stamp: { $$date: 11 }, text: 'mapped' } };
    }
    if (c.shape === 'input-subqueries')
      result.payload.lookup = {
        $$sq: {
          model: model.modelName,
          op: 'read',
          id: 'row-0',
          args: { select: ['f0', '-_id'] },
          options: { includePermissions: false, includeFieldPermissions: false, tryList: false },
          sqOptions: { path: 'f0' },
        },
      };
    return result;
  };
  const args = {
    select: [
      'value',
      ...(functionRules ? [] : fields),
      'hidden',
      ...(nested && !functionRules ? [...(native ? ['when'] : []), 'payload', 'children', 'nested'] : []),
      ...(rich ? ['label'] : []),
      '-_id',
    ],
  };
  const output = { includePermissions: metadata, includeFieldPermissions: metadata, includeCount: false };
  const filter = c.shape === 'logging' ? { $and: Array.from({ length: 24 }, () => ({ owner: true })) } : {};
  let initial: any[] = [];
  function reset() {
    const n = c.operation === 'list-empty' ? 0 : c.operation === 'list-single' ? 1 : c.rows;
    docs = Array.from({ length: n }, (_, i) => make(row(i)));
    initial = docs.map((doc) => doc.toObject());
    saved = [];
    // New request per sample: request-owned filter caches/admission budgets must not leak across repetitions.
    services = receivers();
    for (const key of Object.keys(counts)) delete counts[key];
    trace.length = 0;
    assertModes();
  }
  async function invoke(): Promise<any> {
    const direct = c.entry === 'direct';
    switch (c.operation) {
      case 'read-hit':
        return direct
          ? services.direct.findById('row-0', args, output)
          : services.public._read('row-0', args, { ...output, tryList: false });
      case 'read-miss':
        return direct
          ? services.direct.findById('missing', args, output)
          : services.public._read('missing', args, { ...output, tryList: false });
      // Direct read's access option supplies the effective fallback; retry ownership is the public wrapper's job.
      case 'read-fallback':
        return direct
          ? services.direct.findById('row-0', args, { ...output, access: 'list' })
          : services.public._read('row-0', args, { ...output, tryList: true });
      case 'list-empty':
      case 'list-single':
      case 'list-many':
        return direct
          ? services.direct.find(filter, { ...args, limit: 32 }, output)
          : services.public._list(filter, { ...args, limit: 32 }, output);
      case 'create-single':
        return direct ? services.direct.create(input(), args, output) : services.public._create(input(), args, output);
      case 'create-bulk': {
        const items = Array.from({ length: c.rows }, input);
        return direct ? services.direct.create(items, args, output) : services.public._create(items, args, output);
      }
      case 'update-id':
        return direct
          ? services.direct.updateById('row-0', input(), args, output)
          : services.public._update('row-0', input(), args, output);
      case 'update-filter':
        return services.direct.updateOne({ _id: 'row-0' }, input(), args, output);
      case 'upsert-create':
        return direct
          ? services.direct.upsert({ _id: 'missing' }, input(), args, output)
          : services.public._upsert(input(), args, output);
      case 'upsert-update':
        return direct
          ? services.direct.upsert({ _id: 'row-0' }, input(), args, output)
          : services.public._upsert({ _id: 'row-0', ...input() }, args, output);
    }
  }
  function check(result: any) {
    assertModes();
    if (c.operation === 'read-miss') {
      assert.equal(result.success, false);
      assert.equal(result.code, 'not_found');
      assert.equal(saved.length, 0);
      assert.deepEqual(
        docs.map((doc) => doc.toObject()),
        initial,
      );
      return { success: false, code: result.code };
    }
    assert.equal(result.success, true, `CRUD failure ${JSON.stringify(result)}`);
    const creating = c.operation.startsWith('create') || c.operation === 'upsert-create';
    const updating = c.operation.startsWith('update') || c.operation === 'upsert-update';
    const listing = c.operation.startsWith('list');
    const origin = creating ? 2 : updating ? 3 : listing ? 1 : 0; // Fallback retains READ mode, even with LIST access.
    const mutated = hooks && c.modes[origin] === 'trusted';
    const rows = Array.isArray(result.data) ? result.data : [result.data];
    const expectedRows = creating
      ? c.operation === 'create-bulk'
        ? c.rows
        : 1
      : listing
        ? c.operation === 'list-empty'
          ? 0
          : c.operation === 'list-single'
            ? 1
            : c.shape === 'logging'
              ? Math.ceil(c.rows / 2)
              : c.rows
        : 1;
    assert.equal(rows.length, expectedRows, 'output row count mismatch');
    rows.forEach((out: any, i: number) => {
      const index = listing && c.shape === 'logging' ? i * 2 : i;
      assert.equal(
        out.value,
        `${mutated ? 'hook:' : ''}${creating || updating ? 'submitted' : `value-${index}`}`,
        'mode/output mismatch',
      );
      assert.equal(Object.hasOwn(out, 'hidden'), false, 'denied field leaked');
      assert.equal(Object.hasOwn(out, '_id'), false, 'negative selection ignored');
      for (const field of fields)
        assert.equal(out[field], functionRules ? undefined : row(0)[field], 'selected field mismatch');
      if (nested && !functionRules) {
        if (native) {
          assert.equal(out.when.getTime(), 7);
          assert.equal(out.payload.bytes.toString(), 'native');
          assert.equal(out.payload.stamp.getTime(), 9);
          if (inputShape) {
            assert.equal(out.payload.code.scope.n.valueOf(), 7);
            assert.equal(out.payload.map.a.stamp.getTime(), 11);
            assert.equal(out.payload.map.a.text, 'mapped');
          }
          if (c.shape === 'input-subqueries' && (creating || updating)) assert.equal(out.payload.lookup, row(0).f0);
        } else assert.deepEqual(out.payload, row(0).payload);
        assert.deepEqual(
          out.children,
          inputShape || creating || updating || index % 2 === 0 ? [{ label: 'child' }] : [{}],
        );
        assert.deepEqual(out.nested, { safe: 'safe' });
        if (rich) assert.equal(out.label, `virtual:${out.value}`);
      }
      if (metadata) {
        assert.ok(out.permissions && out.permissions._view && out.permissions._edit, 'field maps missing');
        assert.equal(out.permissions.owner, creating || updating || index % 2 === 0);
        assert.equal(out.permissions._view.hidden, undefined, 'denied field map leaked');
        assert.equal(out.permissions._edit.hidden, undefined, 'denied edit map leaked');
      } else assert.equal(Object.hasOwn(out, 'permissions'), false, 'stripped metadata leaked');
    });
    const writes = creating ? expectedRows : updating ? 1 : 0;
    assert.equal(saved.length, writes, 'write branch/persistence count mismatch');
    assert.equal(docs.length, initial.length + (creating ? writes : 0), 'unstable persisted row count');
    if (writes) {
      for (const stored of saved) {
        assert.equal(stored.value, 'submitted');
        assert.equal(stored.hidden, updating ? 'DENIED' : undefined, 'denied input changed persistence');
        for (const field of fields) assert.equal(stored[field], row(0)[field], 'persisted allowed field mismatch');
        if (nested) {
          if (native) {
            assert.equal(stored.when.getTime(), 7);
            assert.equal(stored.payload.stamp.getTime(), 9);
            assert.equal(stored.payload.bytes.toString(), 'native');
            if (inputShape) {
              assert.equal(stored.payload.code.scope.n.valueOf(), 7);
              assert.equal(stored.payload.map.a.stamp.getTime(), 11);
            }
            if (c.shape === 'input-subqueries') assert.equal(stored.payload.lookup, row(0).f0);
          } else assert.deepEqual(stored.payload, row(0).payload);
          assert.equal(stored.children[0].label, 'child');
          assert.deepEqual(stored.nested, { safe: 'safe' });
        }
      }
      assert.deepEqual(
        docs.slice(creating ? 0 : 1, initial.length).map((doc) => doc.toObject()),
        creating ? initial : initial.slice(1),
        'write changed unrelated stored rows',
      );
    } else
      assert.deepEqual(
        docs.map((doc) => doc.toObject()),
        initial,
        'read mutated live persistence',
      );
    // Include the complete persisted state, not merely an output checksum/count.
    const state = JSON.stringify(docs.map((doc) => doc.toObject()));
    // Post-write live mutation must not alias already-published output in either mode.
    if (writes) {
      const live = creating ? docs.at(-1) : docs[0];
      live.value = 'after-publication';
      if (native) {
        live.when.setTime(100);
        live.payload.bytes.fill(0);
      }
      assert.notEqual(rows.at(-1).value, 'after-publication');
      if (native && !functionRules) {
        assert.equal(rows.at(-1).when.getTime(), 7);
        assert.equal(rows.at(-1).payload.bytes.toString(), 'native');
      }
    }
    return { success: true, data: result.data, writes, count: docs.length, state };
  }
  reset();
  return {
    c,
    model,
    runtime,
    get services() {
      return services;
    },
    adapter,
    counts,
    trace,
    input,
    args,
    get saved() {
      return saved;
    },
    reset,
    invoke,
    check,
    resolvedModes,
    dispose: () => {
      mongoose.deleteModel(model.modelName);
    },
  };
}
