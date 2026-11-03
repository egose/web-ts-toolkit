import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { PERMISSIONS } from '../src/symbols';
import { createServiceExecution, readServiceExecution, withExecutionOutputBudget } from '../src/acl/service-execution';
import { executePreparedFind, prepareModelQuery } from '../src/acl/prepared-query';
import { createPublicationRowBudget } from '../src/acl/output-publication';
import { ServiceAuthorizationError } from '../src/acl/authorization-snapshot';
import type { AuthorizationMode, ModelRequest, ModelRouterOptions } from '../src/interfaces';
import * as materialization from '../src/acl/trusted-output-materialization';
import { mapWithConcurrencyLimit } from '../src/helpers/concurrency';
import {
  prepareIncludeOutput,
  attachIncludeOutput,
  getIncludeAttachments,
  restoreIncludeOutput,
} from '../src/output/include-output';

const modes = ['isolated', 'trusted'] as const;
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
let serial = 0;
function fixture(mode: AuthorizationMode, options: ModelRouterOptions = {}) {
  const Target = mongoose.model(
    `Oar04Target${++serial}`,
    new mongoose.Schema({ _id: String, value: mongoose.Schema.Types.Mixed, join: [String], hidden: String }),
  );
  const Source = mongoose.model(
    `Oar04Source${serial}`,
    new mongoose.Schema({
      _id: String,
      value: mongoose.Schema.Types.Mixed,
      join: [String],
      ref: { type: String, ref: Target.modelName },
      refs: [{ type: String, ref: Target.modelName }],
      children: [{ value: mongoose.Schema.Types.Mixed, hidden: String }],
    }),
  );
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({ logger: { warn: vi.fn() }, requestComplexity: { maxHookConcurrency: 1 } });
  for (const model of [Source, Target]) runtime.registerModelInstance(model.modelName, model);
  const hook = vi.fn(() => ({ visible: true }));
  const targetHook = vi.fn(() => ({ visible: true }));
  const targetGetter = vi.fn((doc: any) => ({ value: doc.value }));
  runtime.setModelOptions(Target.modelName, {
    readAuthorizationMode: mode,
    listAuthorizationMode: mode,
    operationAccess: true,
    baseFilter: true,
    stripPermissionsField: true,
    hydration: { find: 'lean', findOne: 'lean' },
    permissionSchema: { value: true, hidden: false, join: false, computed: true },
    docPermissions: { read: targetHook, list: targetHook },
    virtuals: { computed: { dependsOn: ['value'], get: targetGetter } },
  });
  runtime.setModelOptions(Source.modelName, {
    readAuthorizationMode: mode,
    listAuthorizationMode: mode,
    operationAccess: true,
    baseFilter: true,
    stripPermissionsField: true,
    hydration: { find: 'lean', findOne: 'lean' },
    permissionSchema: {
      value: true,
      join: true,
      ref: true,
      refs: true,
      children: { read: true, list: true, sub: { value: true, hidden: false } },
    },
    docPermissions: { read: hook, list: hook },
    ...options,
  });
  const rows: any[] = [
    { _id: 'a', join: ['key'], value: 'source' },
    { _id: 'b', join: ['key'], value: 'source' },
  ];
  const targets: any[] = [{ _id: 'target', join: ['key'], value: { safe: true }, hidden: 'never' }];
  const adapters = new Map(
    [Source, Target].map((model) => [
      model.modelName,
      {
        mongooseModel: model,
        find: vi.fn(async () => (model === Source ? rows : targets)),
        findOne: vi.fn(async () => (model === Source ? rows : targets)[0]),
      },
    ]),
  );
  const request = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const service = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    const make = (name: string) =>
      new (class extends Service {
        protected createModelAdapter() {
          return adapters.get(name)! as never;
        }
      })(request, name);
    request.macl.getPublicService = ((name: string) => make(name)) as never;
    return make(Source.modelName);
  });
  const include = {
    model: Target.modelName,
    op: 'list' as const,
    path: 'related',
    localField: 'join',
    foreignField: 'join',
    args: { select: ['value', 'computed', '-_id'] },
  };
  return { runtime, Source, Target, service, rows, targets, adapters, hook, targetHook, targetGetter, include };
}
afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Oar04/);
});

async function depleted(f: ReturnType<typeof fixture>, remaining: number, args: object, options = quiet) {
  const execution = createServiceExecution(
    f.service,
    { operation: 'list', rowAccess: 'list', virtualAccess: 'list', outputAccess: 'list', docPermissionsAccess: 'list' },
    undefined,
    'service',
    (f.service as any).captureRelated(args),
  );
  const state = readServiceExecution(f.service, execution);
  const budgets = f.rows.map(() => {
    const budget = createPublicationRowBudget(state.publication);
    materialization.visitTrustedOutput(budget, 0, 20000 - remaining);
    return budget;
  });
  const receiving = withExecutionOutputBudget(f.service, execution, (_row, index) => budgets[index]);
  const query = await prepareModelQuery(f.service, receiving, { kind: 'client-read', filter: {} });
  return executePreparedFind(f.service, receiving, query, args, options);
}

describe('private publication handoffs (not result authority)', () => {
  it('commits output row arrays with own data slots after a callback installs an inherited setter', async () => {
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, '127');
    const setter = vi.fn();
    let result: number[] | undefined;
    try {
      result = await mapWithConcurrencyLimit(
        Array.from({ length: 128 }, (_, index) => index),
        1,
        async (index) => {
          if (index === 127) Object.defineProperty(Array.prototype, '127', { configurable: true, set: setter });
          return index;
        },
      );
    } finally {
      if (previous) Object.defineProperty(Array.prototype, '127', previous);
      else Reflect.deleteProperty(Array.prototype, '127');
    }
    expect(setter).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyDescriptor(result!, '127')).toMatchObject({
      value: 127,
      enumerable: true,
      writable: true,
    });
  });

  it('uses the preregistered occurrence plan even when a target hook changes a borrowed parent reference array', async () => {
    const f = fixture('trusted');
    f.rows.splice(1);
    f.rows[0].refs = [f.targets[0]];
    const hook = vi.fn(() => {
      f.rows[0].refs.push(...Array(21000).fill(f.targets[0]));
      return { visible: true };
    });
    f.runtime.setModelOptions(f.Target.modelName, { docPermissions: { list: hook, read: hook } });
    const result = await f.service.find(
      {},
      { select: ['refs', '-_id'], populate: [{ path: 'refs', select: ['value', '-_id'] }] },
      quiet,
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    expect((result.data[0] as any).refs).toEqual([{ value: { safe: true } }]);
    expect(f.rows[0].refs).toHaveLength(21001); // trusted source borrowing is real, not output authority
    expect(hook).toHaveBeenCalledTimes(1);
  });
  it('finalizes nested reference arrays and isolates native IDs before private completed handoff', async () => {
    const f = fixture('trusted');
    f.rows.splice(1);
    const id = new mongoose.mongo.BSON.ObjectId();
    f.rows[0].refs = [id, [f.targets[0], f.targets[0]]];
    const result = await f.service.find(
      {},
      { select: ['refs', '-_id'], populate: [{ path: 'refs', select: ['value', '-_id'] }] },
      quiet,
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    const refs = (result.data[0] as any).refs;
    expect(refs[0]).toEqual(id);
    expect(refs[0]).not.toBe(id);
    expect(refs[1]).toEqual([{ value: { safe: true } }, { value: { safe: true } }]);
    expect(refs[1][0]).not.toBe(refs[1][1]);
    expect(f.targetHook).toHaveBeenCalledTimes(1);
    expect(f.targetGetter).not.toHaveBeenCalled();
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it('rejects selected accessor BSON tags without observing them or issuing completed handoffs', async () => {
    const f = fixture('trusted');
    const getter = vi.fn(() => 'ObjectId');
    f.rows.splice(1);
    f.rows[0].refs = [Object.defineProperty({}, '_bsontype', { enumerable: true, get: getter })];
    const result = await f.service.find(
      {},
      { select: ['refs', '-_id'], populate: [{ path: 'refs', select: ['value', '-_id'] }] },
      quiet,
    );
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(getter).not.toHaveBeenCalled();
    expect(f.targetHook).not.toHaveBeenCalled();
  });
  it('copies a related attachment only once, then transfers its private parent-owned value without DTO walks', () => {
    const budget = materialization.createTrustedOutputBudget();
    const doc = prepareIncludeOutput({ value: 'source' }, undefined, undefined, budget);
    const spy = vi.spyOn(materialization, 'materializeTrustedOutputValue');
    const native = { child: { when: new Date(5), bytes: Buffer.from('safe') } };
    attachIncludeOutput(doc, 'nested.related', native);
    const attachment = getIncludeAttachments(doc)[0];
    expect(attachment.value).not.toBe(native);
    const output = {};
    restoreIncludeOutput(doc, output, { budget, depth: 0 });
    expect((output as any).nested.related).toBe(attachment.value);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each(modes)(
    'isolates shared included children per parent, finishes targets before parent getters, %s',
    async (mode) => {
      const observed: unknown[] = [];
      const parent = vi.fn((doc: any) => {
        observed.push(doc.related[0].computed.value.safe);
        doc.related[0].value.safe = false;
        return 'parent';
      });
      const f = fixture(mode, {
        permissionSchema: { join: true, parent: true },
        virtuals: { parent: { dependsOn: ['join'], get: parent } },
      });
      const result = await f.service.find({}, { select: ['parent', '-_id'], include: [f.include] }, quiet);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(observed).toEqual([true, true]);
      expect(result.data.map((row: any) => row.related[0].value.safe)).toEqual([true, true]);
      expect((result.data[0] as any).related[0]).not.toBe((result.data[1] as any).related[0]);
      expect(f.targetGetter).toHaveBeenCalledTimes(1);
      expect(f.targetHook).toHaveBeenCalledTimes(1);
      expect(f.hook).toHaveBeenCalledTimes(2);
      expect(f.adapters.get(f.Target.modelName)!.find).toHaveBeenCalledTimes(1);
      expect(f.targetHook.mock.calls[0][0]).not.toHaveProperty('join');
    },
  );

  it.each(modes)(
    'discards unattached null/missing join rows before output hooks/native traversal, %s',
    async (mode) => {
      const f = fixture(mode);
      f.targets.push({ _id: 'unattached', value: new mongoose.mongo.BSON.Code('return 1', { huge: Array(21000) }) });
      const result = await f.service.find({}, { select: ['value', '-_id'], include: [f.include] }, quiet);
      expect(result.success).toBe(true);
      expect(f.targetHook).toHaveBeenCalledTimes(1);
      expect(f.targetGetter).toHaveBeenCalledTimes(1);
    },
  );

  it('registers every shared target occurrence before native serialization, including repeated array members', async () => {
    const f = fixture('trusted');
    const B = mongoose.mongo.BSON;
    f.targets[0].value = new B.Code('return 1', { id: new B.ObjectId(), expanded: Array(6000).fill(true) });
    f.rows.splice(1);
    f.rows[0].refs = [f.targets[0], f.targets[0]];
    const serializer = vi.spyOn(B.ObjectId.prototype, 'serializeInto');
    const result = await f.service.find(
      {},
      { select: ['refs', '-_id'], populate: [{ path: 'refs', select: ['value', '-_id'] }] },
      quiet,
    );
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(serializer).not.toHaveBeenCalled();
    expect(f.targetHook).toHaveBeenCalledTimes(1);
    expect(f.hook).not.toHaveBeenCalled();
  });

  it.each(['populate', 'include'] as const)(
    'uses the depleted receiving root before %s target policy/native work',
    async (kind) => {
      const f = fixture('trusted');
      const native = vi.fn(() => ({ selected: true }));
      f.targets[0].value = Object.assign(new mongoose.mongo.BSON.ObjectId(), { toBSON: native });
      f.rows[0].ref = f.targets[0];
      const field = vi.fn(() => true);
      f.runtime.setModelOptions(f.Target.modelName, { permissionSchema: { value: field } });
      const args =
        kind === 'populate'
          ? { select: ['ref', '-_id'], populate: [{ path: 'ref', select: ['value', '-_id'] }] }
          : { select: ['-_id'], include: [{ ...f.include, args: { select: ['value', '-_id'] } }] };
      await expect(depleted(f, 0, args)).rejects.toBeInstanceOf(ServiceAuthorizationError);
      expect(field).not.toHaveBeenCalled();
      expect(native).not.toHaveBeenCalled();
      expect(f.targetHook).not.toHaveBeenCalled();
    },
  );

  it.each(modes)('counts target/parent/native construction against the same remaining row, %s', async (mode) => {
    const f = fixture(mode);
    f.rows.splice(1);
    f.rows[0].value = new mongoose.mongo.BSON.Code('return 1', { selected: true });
    await expect(
      depleted(f, 12, { select: ['value', '-_id'], include: [{ ...f.include, args: { select: ['value', '-_id'] } }] }),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(f.targetHook).toHaveBeenCalledTimes(1);
    expect(f.adapters.get(f.Target.modelName)!.find).toHaveBeenCalledTimes(1);
  });

  it.each(modes)('keeps sibling getter views and isolated hook views detached, %s', async (mode) => {
    const seen: unknown[] = [];
    const first = vi.fn((doc: any) => {
      doc.value.when.setTime(99);
      doc.value.bytes.fill(0);
      doc.value.nested.safe = false;
      return { selected: true };
    });
    const second = vi.fn((doc: any) => {
      seen.push([doc.value.when.getTime(), doc.value.bytes.toString(), doc.value.nested.safe, doc.first]);
      return 'second';
    });
    const f = fixture(mode, {
      permissionSchema: { value: true, first: true, second: true },
      virtuals: { first: { dependsOn: ['value'], get: first }, second: { dependsOn: ['value'], get: second } },
    });
    f.rows.splice(1);
    f.rows[0].value = { when: new Date(1), bytes: Buffer.from('safe'), nested: { safe: true } };
    const result = await f.service.find({}, { select: ['value', 'first', 'second', '-_id'] }, quiet);
    expect(result.success).toBe(true);
    expect(seen).toEqual([[1, 'safe', true, undefined]]);
    expect(f.rows[0].value.when.getTime()).toBe(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it('does not walk hidden trusted source graphs without a callback exposure', async () => {
    const f = fixture('trusted');
    f.rows[0].unselected = new Proxy(
      { huge: Array(21000) },
      {
        ownKeys() {
          throw new Error('unvisited');
        },
      },
    );
    const result = await f.service.find({}, { select: ['value', '-_id'] }, quiet);
    expect(result.success).toBe(true);
    expect(f.hook).toHaveBeenCalledTimes(2);
  });

  it.each(modes)('publishes frozen ordinary/native/Map/array controls without source writes, %s', async (mode) => {
    const f = fixture(mode);
    const value = Object.freeze({
      date: Object.freeze(new Date(7)),
      buffer: Buffer.from('safe'),
      regexp: /safe/im,
      code: Object.freeze(new mongoose.mongo.BSON.Code('return 1', Object.freeze({ safe: true }))),
      map: new Map([['safe', Object.freeze([1, 2])]]),
    });
    f.rows.splice(1);
    f.rows[0].value = value;
    Object.freeze(f.rows[0]);
    const result = await f.service.find({}, { select: ['value', '-_id'] }, quiet);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    expect((result.data[0] as any).value).toEqual({ ...value, map: { safe: [1, 2] } });
    expect((result.data[0] as any).value.date).not.toBe(value.date);
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it.each(modes)(
    'poisons the whole result when a getter catches selected structural admission failure, %s',
    async (mode) => {
      let budget!: materialization.TrustedOutputBudget;
      const caught = vi.fn(() => {
        try {
          materialization.materializeTrustedOutputValue(new Proxy({}, {}), 'invalid', budget, { keep: () => true });
        } catch {
          /* application swallows */
        }
        return 'small';
      });
      const f = fixture(mode, {
        permissionSchema: { value: true, caught: true },
        virtuals: { caught: { dependsOn: ['value'], get: caught } },
      });
      f.rows.splice(1);
      const execution = createServiceExecution(f.service, {
        operation: 'list',
        rowAccess: 'list',
        virtualAccess: 'list',
        outputAccess: 'list',
        docPermissionsAccess: 'list',
      });
      budget = createPublicationRowBudget(readServiceExecution(f.service, execution).publication);
      const receiving = withExecutionOutputBudget(f.service, execution, () => budget);
      const query = await prepareModelQuery(f.service, receiving, { kind: 'client-read', filter: {} });
      await expect(
        executePreparedFind(f.service, receiving, query, { select: ['value', 'caught', '-_id'] }, quiet),
      ).rejects.toBeInstanceOf(ServiceAuthorizationError);
      expect(caught).toHaveBeenCalledTimes(1);
      expect(f.hook).toHaveBeenCalledTimes(1);
    },
  );

  it.each(modes)('charges native values and unexposed boolean metadata names to the same row, %s', async (mode) => {
    const facts = Object.fromEntries(Array.from({ length: 10000 }, (_, index) => [`hidden${index}`, true]));
    const hook = vi.fn(() => facts);
    const f = fixture(mode, {
      stripPermissionsField: false,
      documentPermissionField: 'meta.permissions',
      exposedDocPermissionKeys: ['visible'],
      permissionSchema: { value: true },
      docPermissions: { list: hook },
    });
    f.rows.splice(1);
    f.rows[0].value = new mongoose.mongo.BSON.Code('return 1', { expanded: Array(6000).fill(true) });
    const result = await f.service.find({}, { select: ['value', '-_id'] }, { ...quiet, includePermissions: true });
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it.each(modes)('keeps custom dotted metadata and aliases as ordinary output data, %s', async (mode) => {
    const f = fixture(mode, {
      stripPermissionsField: false,
      documentPermissionField: 'meta.permissions',
      exposedDocPermissionKeys: ['visible'],
    });
    const result = await f.service.find({}, { select: ['value', '-_id'] }, { ...quiet, includePermissions: true });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    for (const row of result.data as any[]) {
      expect(row.meta.permissions).toEqual({ visible: true });
      expect(row.permissions).toBe(row.meta.permissions);
      expect(Object.getOwnPropertySymbols(row)).toEqual([]);
    }
  });

  it.each(modes)('admits attempted field-metadata keys before even denied policy callbacks, %s', async (mode) => {
    const denied = vi.fn(() => false);
    const f = fixture(mode, { stripPermissionsField: false, permissionSchema: { value: true, guarded: denied } });
    f.Source.schema.add({ guarded: String });
    f.rows.splice(1);
    const options = { ...quiet, includeFieldPermissions: true };
    await expect(depleted(f, 4, { select: ['value', '-_id'] }, options)).rejects.toBeInstanceOf(
      ServiceAuthorizationError,
    );
    expect(denied).not.toHaveBeenCalled();
    // Existing read/update row gates are deliberate work, not hidden child reads.
    expect(f.adapters.get(f.Source.modelName)!.find).toHaveBeenCalledTimes(3);
    const control = await f.service.find({}, { select: ['value', '-_id'] }, options);
    expect(control.success).toBe(true);
    expect(denied).toHaveBeenCalledTimes(2);
    expect(f.adapters.get(f.Source.modelName)!.find).toHaveBeenCalledTimes(6);
  });

  it.each(modes)('does not replenish the depleted selected budget on embedded native entry, %s', async (mode) => {
    const f = fixture(mode);
    f.rows.splice(1);
    f.rows[0].value = Array(3000).fill(true);
    f.rows[0].children = [
      { value: new mongoose.mongo.BSON.Code('return 1', { expanded: Array(2000).fill(true) }), hidden: 'never' },
    ];
    const args = { select: ['value', 'children', '-_id'] };
    await expect(depleted(f, 10000, args)).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(f.hook).toHaveBeenCalledTimes(1); // embedded inherits facts, never resolves another hook
    const control = await f.service.find({}, args, quiet);
    expect(control.success).toBe(true);
    if (!control.success) throw new Error(control.code);
    expect((control.data[0] as any).children[0]).not.toHaveProperty('hidden');
    expect(f.hook).toHaveBeenCalledTimes(2);
  });

  it.each(modes)('retains root-relative depth 100/101 through embedded Code scopes, %s', async (mode) => {
    const f = fixture(mode);
    f.rows.splice(1);
    const nested = (count: number) => {
      let scope: Record<string, unknown> = { selected: true };
      for (let n = 0; n < count; n++) scope = { next: scope };
      return new mongoose.mongo.BSON.Code('return 1', scope);
    };
    f.rows[0].children = [{ value: nested(95) }];
    expect((await f.service.find({}, { select: ['children', '-_id'] }, quiet)).success).toBe(true);
    f.rows[0].children = [{ value: nested(96) }];
    const result = await f.service.find({}, { select: ['children', '-_id'] }, quiet);
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
  });

  it('owns the full isolated embedded projection once, not again for each child stage', async () => {
    const f = fixture('isolated');
    f.rows.splice(1);
    f.rows[0].children = [{ value: { when: new Date(1) } }, { value: { when: new Date(2) } }];
    const copy = vi.spyOn(materialization, 'materializeTrustedOutputValue');
    const result = await f.service.find({}, { select: ['children', '-_id'] }, quiet);
    expect(result.success).toBe(true);
    const childRootCopies = copy.mock.calls.filter(
      ([value]) => value && typeof value === 'object' && Object.hasOwn(value, 'value') && !Object.hasOwn(value, '_id'),
    );
    expect(childRootCopies).toHaveLength(0);
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it.each(modes)(
    'observes actual source/view/materialization work without a per-field whole-source copy, %s',
    async (mode) => {
      const field = vi.fn(() => true);
      const f = fixture(mode, {
        permissionSchema: Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`field${index}`, field])),
      });
      for (let n = f.rows.length; n < 6; n++) f.rows.push({ _id: String(n) });
      const sourceModel = f.Source;
      for (let index = 0; index < 24; index++)
        sourceModel.schema.add({ [`field${index}`]: mongoose.Schema.Types.Mixed });
      for (const row of f.rows) for (let index = 0; index < 24; index++) row[`field${index}`] = `value-${index}`;
      const copy = vi.spyOn(materialization, 'materializeTrustedOutputValue');
      const result = await f.service.find(
        {},
        { select: [...Array.from({ length: 24 }, (_, index) => `field${index}`), '-_id'] },
        quiet,
      );
      expect(result.success).toBe(true);
      const wholeSources = copy.mock.calls.filter(
        ([value]) => value && typeof value === 'object' && Object.hasOwn(value, 'field23'),
      );
      expect(wholeSources).toHaveLength(mode === 'isolated' ? 12 : 0); // one owned source + one disposable hook view per row
      expect(field).toHaveBeenCalledTimes(144);
      expect(f.hook).toHaveBeenCalledTimes(6);
      expect(f.adapters.get(f.Source.modelName)!.find).toHaveBeenCalledTimes(1);
      console.log(
        'OAR04_WORK',
        JSON.stringify({
          mode,
          rows: 6,
          fields: 24,
          wholeSourceMaterializations: wholeSources.length,
          selectedScalarMaterializations: copy.mock.calls.filter(([, path]) => /^field\d+$/.test(path)).length,
          callbacks: field.mock.calls.length,
          hooks: f.hook.mock.calls.length,
          adapterReads: f.adapters.get(f.Source.modelName)!.find.mock.calls.length,
        }),
      );
    },
  );
});

describe('exact selected resource owners and structural poison', () => {
  const B = mongoose.mongo.BSON;
  const materialize = (value: unknown, budget = materialization.createTrustedOutputBudget(), depth = 0) =>
    materialization.materializeTrustedOutputValue(value, 'value', budget, { keep: () => true }, depth);
  it.each([
    ['ordinary', {}],
    ['array', []],
    ['Map', new Map()],
    ['Code', new B.Code('return 1')],
  ] as const)('admits an empty %s at inclusive depth 100', (_label, value) => {
    expect(() => materialize(value, undefined, 100)).not.toThrow();
    expect(() => materialize(value, undefined, 101)).toThrow();
  });
  it('bounds sparse selected arrays at the actual element depth without reading inherited holes', () => {
    const holes = Array(1);
    const budget = materialization.createTrustedOutputBudget();
    expect(() => materialization.shallowTrustedOutputArray(holes, budget, 100)).toThrow();
    expect(() => materialization.assertTrustedOutputBudget(budget)).toThrow();
    expect(materialization.shallowTrustedOutputArray([], materialization.createTrustedOutputBudget(), 100)).toEqual([]);
  });
  it.each([
    ['ordinary', { selected: 1 }],
    ['Code', new B.Code('return 1', { selected: 1 })],
    ['DBRef', new B.DBRef('collection', new B.ObjectId(), 'db', { selected: 1 })],
    ['Map', new Map([['selected', 1]])],
    ['array', [1]],
  ])('debits every receiving multiplicity/offset before %s policy work', (_label, value) => {
    const rootA = materialization.createTrustedOutputBudget(),
      rootB = materialization.createTrustedOutputBudget();
    materialization.visitTrustedOutput(rootB, 0, 19999);
    const child = materialization.createReceivingOutputBudget([
      { budget: rootA, depth: 2 },
      { budget: rootB, depth: 5, multiplicity: 2 },
    ]);
    const keep = vi.fn(() => true);
    expect(() => materialization.materializeTrustedOutputValue(value, 'value', child, { keep })).toThrow();
    expect(keep).not.toHaveBeenCalled();
    expect(() => materialization.assertTrustedOutputBudget(rootA)).toThrow();
    expect(() => materialization.assertTrustedOutputBudget(rootB)).toThrow();
  });
  it.each([
    ['proxy', () => new Proxy({}, {})],
    ['symbol key', () => ({ [Symbol('selected')]: true })],
    ['accessor', () => Object.defineProperty({}, 'selected', { enumerable: true, get: vi.fn() })],
    ['Date result', () => Object.assign(new Date(1), { getTime: () => ({ valueOf: vi.fn() }) })],
    ['native scope', () => new B.Code('return 1', new B.ObjectId())],
  ])('keeps %s admission failure sticky even if application catches it', (_label, make) => {
    const budget = materialization.createTrustedOutputBudget();
    try {
      materialize(make(), budget);
    } catch {
      /* caught by application */
    }
    expect(() => materialize('small', budget)).toThrow();
  });
  it('rejects caught native inner failure before serialization of a subsequently small wire replacement', () => {
    const budget = materialization.createTrustedOutputBudget();
    const serialize = vi.spyOn(B.ObjectId.prototype, 'serializeInto');
    const wire = Object.assign(new B.ObjectId(), {
      toBSON() {
        try {
          materialize(new Proxy({}, {}), budget);
        } catch {
          /* swallowed */
        }
        return new B.ObjectId();
      },
    });
    expect(() => materialize(wire, budget)).toThrow();
    expect(serialize).not.toHaveBeenCalled();
  });
});
