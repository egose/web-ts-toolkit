/** ARPC-06 characterization, not a timing probe. Uses real Mongoose persistence. */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccessRuntime } from '../../src/index';
import type {
  AuthorizationMode,
  BaseFilterAccess,
  Filter,
  ModelOutputContext,
  ModelRequest,
  PublicCreateOptions,
} from '../../src/interfaces';
import { useMongoTestDatabase } from '../setup';

useMongoTestDatabase();

type MetadataAccess = 'read' | 'update';
type Row = { _id: string; value: string; owner: boolean };
type Event = {
  kind: 'save' | 'afterPersist' | 'change' | 'output' | 'readField' | 'base' | 'override' | 'query' | 'decorate';
  row?: string;
  access?: MetadataAccess;
  ids?: string[];
  fieldChecks?: number;
  projection?: Record<string, unknown>;
  lean?: boolean;
  valuePredicate?: unknown;
};

let serial = 0;

function incomingIds(filter: unknown): string[] {
  const id = (filter as { _id?: { $in?: unknown[] } } | null)?._id;
  return id && Array.isArray(id.$in) ? id.$in.map(String) : [];
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function fixture(
  mode: AuthorizationMode,
  options: {
    concurrency?: number;
    disableFieldPermissions?: boolean;
    stripPermissionsField?: boolean;
    omitFilters?: boolean;
  } = {},
) {
  const events: Event[] = [];
  const receivers: unknown[] = [];
  const actorChecks: boolean[] = [];
  const saved: mongoose.HydratedDocument<Row>[] = [];
  const outputContexts: ModelOutputContext[] = [];
  const state = { row: '', fieldChecks: 0, outputCount: 0 };
  const hooks: {
    repeatFirstDocument?: boolean;
    facts?: (doc: Row, ordinal: number) => boolean;
    output?: (doc: Row) => void | Promise<void>;
    base?: (access: MetadataAccess) => Filter | Promise<Filter>;
    override?: (access: MetadataAccess, filter: Filter) => Filter | Promise<Filter>;
  } = {};
  const api = createAccessRuntime();
  const modelName = `Arpc06Metadata${++serial}`;
  let idSerial = 0;
  const schema = new mongoose.Schema<Row>(
    {
      _id: { type: String, default: () => `id-${++idSerial}` },
      value: String,
      owner: Boolean,
    },
    { versionKey: false },
  );
  schema.post('save', function (doc) {
    saved.push(doc);
    events.push({ kind: 'save', row: doc.value });
  });
  schema.pre('find', function () {
    events.push({
      kind: 'query',
      ids: incomingIds(this.getFilter()),
      projection: { ...this.projection() },
      lean: this.mongooseOptions().lean === true,
      valuePredicate: this.getFilter().value,
    });
  });
  const Model = mongoose.model<Row>(modelName, schema);
  api.setGlobalOptions({
    globalPermissions: () => ['actor'],
    requestComplexity: { maxBulkConcurrency: options.concurrency ?? 1, maxHookConcurrency: 2 },
    logger: { warn: vi.fn() },
  });

  const base = (access: MetadataAccess) =>
    function (this: ModelRequest, permissions: { has(key: string): boolean }) {
      receivers.push(this);
      actorChecks.push(permissions.has('actor'));
      events.push({ kind: 'base', access, row: state.row, fieldChecks: state.fieldChecks });
      return hooks.base ? hooks.base(access) : {};
    };
  const override = (access: MetadataAccess) =>
    function (this: ModelRequest, filter: Filter, permissions: { has(key: string): boolean }) {
      receivers.push(this);
      actorChecks.push(permissions.has('actor'));
      events.push({
        kind: 'override',
        access,
        ids: incomingIds(filter),
        row: state.row,
        fieldChecks: state.fieldChecks,
      });
      return hooks.override ? hooks.override(access, filter) : filter;
    };
  const router = api.createRouter(Model, {
    basePath: '/arpc06',
    createAuthorizationMode: mode,
    disableFieldPermissions: options.disableFieldPermissions ?? false,
    stripPermissionsField: options.stripPermissionsField ?? false,
    operationAccess: true,
    permissionSchema: {
      value: {
        create: true,
        read: function () {
          receivers.push(this);
          state.fieldChecks += 1;
          events.push({ kind: 'readField', row: state.row });
          return true;
        },
        update: 'doc:owner',
      },
      owner: { create: true, read: false, update: false },
    },
    modelPermissionPrefix: 'doc:',
    ...(options.omitFilters
      ? {}
      : {
          baseFilter: { read: base('read'), update: base('update') },
          overrideFilter: { read: override('read'), update: override('update') },
        }),
    afterPersist: {
      create: function (doc) {
        receivers.push(this);
        events.push({ kind: 'afterPersist', row: doc.value });
        return hooks.repeatFirstDocument ? saved[0] : doc;
      },
    },
    onChange: {
      value: function () {
        events.push({ kind: 'change' });
      },
    },
    docPermissions: {
      create: {
        dependsOn: ['owner', 'value'],
        get: async function (input, _permissions, context) {
          receivers.push(this);
          const doc = input as Row;
          state.row = doc.value;
          state.outputCount += 1;
          events.push({ kind: 'output', row: doc.value });
          outputContexts.push(context);
          await hooks.output?.(doc);
          return { owner: hooks.facts ? hooks.facts(doc, state.outputCount) : doc.owner };
        },
      },
    },
    decorate: {
      create: function (doc) {
        receivers.push(this);
        events.push({ kind: 'decorate', row: doc.value });
        return doc;
      },
    },
  });

  const app = express().use(express.json()).use(router.routes);
  let run!: (req: ModelRequest) => Promise<unknown>;
  let value: unknown;
  let failure: unknown;
  let currentRequest: ModelRequest;
  let filterCalls: Array<[BaseFilterAccess?, Filter<Row>?]> = [];
  router.router.post('/probe', async (req, res) => {
    currentRequest = req as unknown as ModelRequest;
    try {
      value = await run(currentRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });

  return {
    api,
    Model,
    modelName,
    events,
    receivers,
    actorChecks,
    saved,
    outputContexts,
    state,
    hooks,
    get currentRequest() {
      return currentRequest;
    },
    get filterCalls() {
      return filterCalls;
    },
    async create(items: Array<Omit<Row, '_id'>>, outputOptions: PublicCreateOptions = {}) {
      value = undefined;
      failure = undefined;
      run = (req) => {
        const service = req.macl.getPublicService<Row>(modelName);
        // Calls through the real receiver. These are genFilter entries, NOT base-filter callback counts.
        filterCalls = vi.spyOn(service, 'genFilter').mock.calls;
        return service._create(
          items,
          { select: ['value'] },
          { includePermissions: true, includeFieldPermissions: true, ...outputOptions },
        );
      };
      await request(app).post('/arpc06/probe').send({}).expect(200);
      if (failure) throw failure;
      return value as {
        success: boolean;
        data: Array<{ _id: string; value: string; _permissions?: Record<string, unknown> }>;
      };
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Arpc06Metadata/);
});

const items = [
  { value: 'first', owner: true },
  { value: 'second', owner: false },
  { value: 'third', owner: true },
];
const placeholder = { $: '_' };

describe.each(['isolated', 'trusted'] as const)('bulk CREATE metadata trace (%s)', (mode) => {
  it.each([1, 3])('%i row(s): singleton metadata queries and fulfilled base-scope reuse', async (count) => {
    const f = fixture(mode);
    const result = await f.create(items.slice(0, count));
    expect(result.success).toBe(true);
    const ids = f.saved.map((doc) => String(doc._id));
    const expectedCalls = ids.flatMap((id) => [
      ['read', { _id: { $in: [id] } }],
      ['update', { _id: { $in: [id] } }],
    ]);
    expect(f.filterCalls).toEqual(expectedCalls);
    expect(f.events.filter((event) => event.kind === 'override').map(({ access, ids }) => [access, ids])).toEqual(
      ids.flatMap((id) => [
        ['read', [id]],
        ['update', [id]],
      ]),
    );
    // genFilter and overrideFilter run per row/access; the fulfilled base scope is request/access-owned.
    expect(
      f.events
        .filter((event) => event.kind === 'base')
        .map(({ access, row, fieldChecks }) => [access, row, fieldChecks]),
    ).toEqual([
      ['read', 'first', 1],
      ['update', 'first', 1],
    ]);
    expect(
      f.events
        .filter((event) => event.kind === 'query')
        .map(({ ids, projection, lean }) => ({ ids, projection, lean })),
    ).toEqual(
      ids.flatMap((id) => Array.from({ length: 2 }, () => ({ ids: [id], projection: { _id: 1 }, lean: true }))),
    );
    expect(f.events.filter((event) => event.kind === 'change')).toEqual([]); // CREATE has no onChange phase.
    const positions = (kind: Event['kind']) => f.events.flatMap((event, index) => (event.kind === kind ? [index] : []));
    expect(Math.max(...positions('save'))).toBeLessThan(Math.min(...positions('afterPersist')));
    expect(Math.max(...positions('afterPersist'))).toBeLessThan(Math.min(...positions('output')));
    expect(Math.max(...positions('query'))).toBeLessThan(Math.min(...positions('decorate')));
    for (const [index, item] of items.slice(0, count).entries()) {
      const output = f.events.findIndex((event) => event.kind === 'output' && event.row === item.value);
      const readField = f.events.findIndex((event) => event.kind === 'readField' && event.row === item.value);
      const overrides = f.events.filter((event) => event.kind === 'override' && event.row === item.value);
      expect(readField).toBeGreaterThan(output);
      expect(overrides.map((event) => event.fieldChecks)).toEqual([index + 1, index + 1]);
      expect(f.events.findIndex((event) => event === overrides[0])).toBeGreaterThan(readField);
      expect(result.data[index]._permissions).toEqual({
        owner: item.owner,
        _view: { value: true },
        _edit: item.owner ? { value: true } : placeholder,
      });
    }
    expect(f.receivers.every((receiver) => receiver === f.currentRequest)).toBe(true);
    expect(f.actorChecks.every(Boolean)).toBe(true);
    expect(await f.Model.countDocuments()).toBe(count);
    f.saved[0].value = 'live mutation after publication';
    expect(result.data[0].value).toBe('first');
  });

  it.each([
    { name: 'disabled maps', model: { disableFieldPermissions: true }, output: {}, metadata: 'facts' },
    { name: 'stripped metadata', model: { stripPermissionsField: true }, output: {}, metadata: 'none' },
    { name: 'facts only', model: {}, output: { includeFieldPermissions: false }, metadata: 'facts' },
    {
      name: 'unrequested metadata',
      model: {},
      output: { includePermissions: false, includeFieldPermissions: false },
      metadata: 'placeholder',
    },
  ])('$name skips only metadata query work', async ({ model, output, metadata }) => {
    const f = fixture(mode, model);
    const result = await f.create(items.slice(0, 2), output);
    expect(result.success).toBe(true);
    expect(f.filterCalls).toEqual([]);
    expect(f.events.filter((event) => ['base', 'override', 'query'].includes(event.kind))).toEqual([]);
    expect(f.events.filter((event) => event.kind === 'output').map((event) => event.row)).toEqual(['first', 'second']);
    expect(f.saved).toHaveLength(2);
    expect(result.data[0]._permissions).toEqual(
      metadata === 'none'
        ? undefined
        : metadata === 'facts'
          ? { owner: true }
          : { _view: placeholder, _edit: placeholder },
    );
  });

  it('per-row transforms see hook/field side effects and skip denied queries', async () => {
    const f = fixture(mode);
    f.hooks.override = (access, filter) =>
      access === 'update' && f.state.row === 'second' ? false : { ...(filter as object), value: f.state.row };
    const result = await f.create(items.slice(0, 2).map((item) => ({ ...item, owner: true })));
    expect(result.success).toBe(true);
    expect(f.filterCalls).toHaveLength(4);
    expect(
      f.events
        .filter((event) => event.kind === 'override')
        .map(({ access, row, fieldChecks }) => [access, row, fieldChecks]),
    ).toEqual([
      ['read', 'first', 1],
      ['update', 'first', 1],
      ['read', 'second', 2],
      ['update', 'second', 2],
    ]);
    expect(f.events.filter((event) => event.kind === 'query').map((event) => event.valuePredicate)).toEqual([
      'first',
      'first',
      'second',
    ]);
    expect(result.data.map((row) => row._permissions)).toEqual([
      { owner: true, _view: { value: true }, _edit: { value: true } },
      { owner: true, _view: { value: true }, _edit: placeholder },
    ]);
  });

  it('observes a live base-filter replacement after the first row, rather than a create-start snapshot', async () => {
    const f = fixture(mode);
    const replacement = vi.fn(() => false as const);
    f.hooks.output = (doc) => {
      if (doc.value === 'second') f.api.setModelOption(f.modelName, 'baseFilter.update', replacement);
    };
    const result = await f.create(items.slice(0, 2).map((item) => ({ ...item, owner: true })));
    expect(result.success).toBe(true);
    expect(f.events.filter((event) => event.kind === 'base').map((event) => event.access)).toEqual(['read', 'update']);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(replacement.mock.contexts[0]).toBe(f.currentRequest);
    expect(f.filterCalls).toHaveLength(4);
    expect(f.events.filter((event) => event.kind === 'query')).toHaveLength(3);
    expect(result.data[0]._permissions?._edit).toEqual({ value: true });
    expect(result.data[1]._permissions?._edit).toEqual(placeholder);
  });

  it('keeps repeated output IDs as separate query/hook occurrences and separate grant maps', async () => {
    const f = fixture(mode);
    f.hooks.repeatFirstDocument = true;
    f.hooks.facts = (_doc, ordinal) => ordinal === 1;
    const result = await f.create(items.slice(0, 2));
    expect(result.success).toBe(true);
    expect(f.saved).toHaveLength(2);
    expect(new Set(f.saved.map((doc) => doc._id)).size).toBe(2);
    expect(result.data.map((row) => row._id)).toEqual([f.saved[0]._id, f.saved[0]._id]);
    expect(f.filterCalls.map(([, filter]) => incomingIds(filter))).toEqual(
      Array.from({ length: 4 }, () => [f.saved[0]._id]),
    );
    expect(f.events.filter((event) => event.kind === 'query')).toHaveLength(4);
    expect(f.outputContexts).toHaveLength(2);
    expect(f.outputContexts[0]).not.toBe(f.outputContexts[1]);
    expect(result.data.map((row) => row._permissions?._edit)).toEqual([{ value: true }, placeholder]);
    expect(result.data[0]._permissions).not.toBe(result.data[1]._permissions);
    expect(await f.Model.countDocuments()).toBe(2);
  });

  it('caches fulfilled base scopes, not in-flight promises, at concurrency 2', async () => {
    const f = fixture(mode, { concurrency: 2 });
    const gate = deferred();
    const starts = { read: 0, update: 0 };
    f.hooks.base = async (access) => {
      starts[access] += 1;
      await gate.promise;
      return {};
    };
    const pending = f.create([...items, { value: 'fourth', owner: true }]);
    let result: Awaited<typeof pending>;
    try {
      await vi.waitFor(() => expect(starts).toEqual({ read: 2, update: 2 }));
    } finally {
      gate.release();
      result = await pending;
    }
    expect(result.success).toBe(true);
    expect(starts).toEqual({ read: 2, update: 2 });
    expect(f.filterCalls).toHaveLength(8);
    expect(f.events.filter((event) => event.kind === 'override')).toHaveLength(8);
    expect(f.events.filter((event) => event.kind === 'query')).toHaveLength(8);
  });

  it('still observes per-row database changes when no base/override callbacks are configured', async () => {
    const f = fixture(mode, { omitFilters: true });
    f.hooks.output = async (doc) => {
      if (doc.value === 'second') await f.Model.deleteOne({ _id: doc._id });
    };
    const result = await f.create(items.slice(0, 2).map((item) => ({ ...item, owner: true })));
    expect(result.success).toBe(true);
    expect(f.events.filter((event) => ['base', 'override'].includes(event.kind))).toEqual([]);
    expect(f.filterCalls).toHaveLength(4);
    expect(f.events.filter((event) => event.kind === 'query')).toHaveLength(4);
    expect(result.data.map((row) => row._permissions)).toEqual([
      { owner: true, _view: { value: true }, _edit: { value: true } },
      { owner: true, _view: placeholder, _edit: placeholder },
    ]);
    expect(await f.Model.countDocuments()).toBe(1);
  });

  it('drains admitted peer metadata work on failure without publishing or rolling back', async () => {
    const f = fixture(mode);
    const failure = new Error('metadata read failed');
    const peer = deferred();
    let peerStarted = false;
    let peerFinished = false;
    f.hooks.override = async (access, filter) => {
      if (f.state.row === 'second') {
        if (access === 'read') throw failure;
        peerStarted = true;
        await peer.promise;
        peerFinished = true;
      }
      return filter;
    };
    let settled = false;
    const pending = f.create(items).then(
      () => {
        settled = true;
        return undefined;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    let outcome: unknown;
    try {
      await vi.waitFor(() => expect(peerStarted).toBe(true));
      expect(settled).toBe(false);
    } finally {
      peer.release();
      outcome = await pending;
    }
    expect(outcome).toBe(failure);
    expect(peerFinished).toBe(true);
    expect(f.saved).toHaveLength(3);
    expect(await f.Model.countDocuments()).toBe(3);
    expect(f.events.filter((event) => event.kind === 'output').map((event) => event.row)).toEqual(['first', 'second']);
    expect(f.events.filter((event) => event.kind === 'decorate')).toEqual([]);
    expect(f.filterCalls).toHaveLength(4);
    expect(f.events.filter((event) => event.kind === 'query')).toHaveLength(3);
  });
});
