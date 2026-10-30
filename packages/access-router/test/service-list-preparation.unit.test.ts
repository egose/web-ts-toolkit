import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { Service } from '../src/services/service';
import { PublicService } from '../src/services/public-service';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest, ModelHookContext, ServiceOutputContext } from '../src/interfaces';
import * as serviceAuthorization from '../src/acl/service-authorization';
import * as fieldAuthorization from '../src/acl/field-authorization';
import * as fieldCatalog from '../src/acl/field-catalog';
import { readDocumentAuthorization } from '../src/acl/document-authorization';

let serial = 0;
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const entries = ['direct', 'public'] as const;

function fixture() {
  const n = ++serial;
  const target = mongoose.model(`Arcpu07Target${n}`, new mongoose.Schema({ name: String }));
  const model = mongoose.model(
    `Arcpu07Source${n}`,
    new mongoose.Schema({
      name: String,
      public: String,
      hidden: String,
      owner: Boolean,
      payload: mongoose.Schema.Types.Mixed,
      ref: { type: mongoose.Schema.Types.ObjectId, ref: target.modelName },
    }),
  );
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 1 } });
  runtime.registerModelInstance(target.modelName, target);
  runtime.setModelOptions(target.modelName, { permissionSchema: { name: true }, operationAccess: { read: true } });
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    permissionSchema: { name: true, public: 'reader', hidden: false, ref: true },
    stripPermissionsField: true,
  });
  const req = {
    _permissions: { reader: true },
    [PERMISSIONS]: new Permission({ reader: true }),
  } as unknown as ModelRequest;
  const adapter = {
    mongooseModel: model,
    find: vi.fn().mockResolvedValue([]),
    countDocuments: vi.fn().mockResolvedValue(0),
  };
  const { service, publicService } = runWithRuntime(runtime, () => {
    req.macl = new Core(req);
    return {
      service: new (class extends Service {
        protected createModelAdapter() {
          return adapter;
        }
      })(req, model.modelName),
      publicService: new (class extends PublicService {
        protected createModelAdapter() {
          return adapter;
        }
      })(req, model.modelName),
    };
  });
  return { runtime, model, target, req, adapter, service, publicService };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Arcpu07/);
});

describe('ARCPU-07 canonical list output preparation', () => {
  it.each(entries)('%s amortizes captured primitive catalog work in the actual service row loop', async (entry) => {
    const original = fieldCatalog.prepareCapturedOutputCatalog;
    const prepare = vi.spyOn(fieldCatalog, 'prepareCapturedOutputCatalog');
    const counts: number[][] = [];
    try {
      for (const enabled of [false, true]) {
        prepare.mockImplementation(enabled ? original : () => {});
        const work: number[] = [];
        for (const count of [1, 100]) {
          const f = fixture();
          f.runtime.setModelOptions(f.model.modelName, {
            permissionSchema: { name: true, public: true, hidden: false },
          });
          const rows = Array.from({ length: count }, (_, index) => ({
            name: `row:${index}`,
            public: 'yes',
            hidden: 'no',
          }));
          f.adapter.find.mockResolvedValue(rows);
          const split = vi.spyOn(String.prototype, 'split');
          let result;
          try {
            const args = { select: ['name', 'public', 'hidden', '-_id'], limit: count };
            result =
              entry === 'direct' ? await f.service.find({}, args, quiet) : await f.publicService._list({}, args, quiet);
            work.push(
              split.mock.calls.filter(
                ([separator], index) =>
                  separator === '.' && ['name', 'public'].includes(split.mock.contexts[index] as string),
              ).length,
            );
          } finally {
            split.mockRestore();
          }
          expect(result).toMatchObject({
            success: true,
            data: rows.map(({ name, public: visible }) => ({ name, public: visible })),
          });
        }
        counts.push(work);
      }
    } finally {
      prepare.mockRestore();
    }
    expect(counts[0][1] - counts[0][0]).toBeGreaterThan(100);
    expect(counts[1][1] - counts[1][0]).toBeLessThanOrEqual(32);
  });

  it.each(entries)('%s list does not copy unrelated configuration once per row with zero virtuals', async (entry) => {
    const f = fixture();
    const payload = (start: number) => Array.from({ length: 32 }, (_, index) => new Date(start + index));
    f.runtime.setModelOptions(f.model.modelName, {
      defaults: { unrelated: payload(100_000) },
      baseFilter: { list: {}, read: { unrelated: payload(200_000) } },
    } as never);
    f.runtime.setModelOptions(f.target.modelName, { defaults: { unrelated: payload(300_000) } } as never);
    const fullRead = vi.spyOn(serviceAuthorization, 'readServiceAuthorization');
    const rulesRead = vi.spyOn(serviceAuthorization, 'readServiceOutputFieldAuthorization');
    const prepareRule = vi.spyOn(fieldAuthorization, 'prepareRequestFieldRule');
    const getTime = Date.prototype.getTime;
    let copies = [0, 0, 0];
    vi.spyOn(Date.prototype, 'getTime').mockImplementation(function (this: Date) {
      const time = getTime.call(this);
      for (let index = 0; index < copies.length; index++)
        if (time >= (index + 1) * 100_000 && time < (index + 1) * 100_000 + 32) copies[index]++;
      return time;
    });
    const work = [];
    for (const count of [1, 6]) {
      const rows = Array.from({ length: count }, (_, index) => ({
        name: `row:${index}`,
        public: 'visible',
        hidden: 'denied',
      }));
      f.adapter.find.mockResolvedValue(rows);
      fullRead.mockClear();
      rulesRead.mockClear();
      prepareRule.mockClear();
      copies = [0, 0, 0];
      // Capture a related policy graph even though ref is not selected/fetched.
      // Its defaults must not be copied during any parent row's finalization.
      const args = { select: ['name', 'public', 'hidden', '-_id'], populate: ['ref'] };
      const result =
        entry === 'direct' ? await f.service.find({}, args, quiet) : await f.publicService._list({}, args, quiet);
      expect(result).toMatchObject({
        success: true,
        count,
        data: rows.map(({ name, public: visible }) => ({ name, public: visible })),
      });
      if (!result.success) throw new Error(result.code);
      expect(result.data).toEqual(rows.map(({ name, public: visible }) => ({ name, public: visible })));
      work.push({
        fullReads: fullRead.mock.calls.length,
        unrelatedDateCopies: [...copies],
        ruleReads: rulesRead.mock.calls.length,
        rulePreparations: prepareRule.mock.calls.length,
      });
    }
    expect(work[1]).toEqual(work[0]);
    // Before ARCPU-07: full reads 20 -> 35, Date copies [448,448,736] ->
    // [928,928,1216]. Request-entry/capture work is allowed, row multiplication is not.
    expect(work[0]).toEqual({
      fullReads: 17,
      unrelatedDateCopies: [352, 352, 640],
      ruleReads: 1,
      rulePreparations: 2,
    });
  });

  for (const entry of entries) {
    const title = `${entry} keeps same-ID row grants, native inputs, contexts and ordering with %s`;
    it.each([
      ['quiet', {}, quiet],
      ['grants', {}, { ...quiet, includePermissions: true }],
      ['field maps', {}, { ...quiet, includeFieldPermissions: true }],
      ['disabled maps', { disableFieldPermissions: true }, { ...quiet, includeFieldPermissions: true }],
      ['stripped', { stripPermissionsField: true }, { ...quiet, includePermissions: true }],
      ['exposed subset', { exposedDocPermissionKeys: ['public'] }, { ...quiet, includePermissions: true }],
    ] as const)(title, async (_name, posture, options) => {
      const f = fixture();
      const id = new mongoose.mongo.BSON.ObjectId();
      const native = { when: new Date(1), bytes: Buffer.from([1]), id: new mongoose.mongo.BSON.ObjectId() };
      const grantNative = { when: new Date(5), bytes: Buffer.from([5]) };
      const rows = [true, false].map((owner, index) => ({
        _id: id,
        name: `row:${index}`,
        public: 'visible',
        hidden: 'denied',
        owner,
        payload: native,
      }));
      const events: string[] = [];
      const hookContexts: ModelHookContext[] = [];
      const contexts: ServiceOutputContext[] = [];
      const hook = vi.fn(async (doc, _permissions, context) => {
        events.push(`hook:${doc.name}`);
        hookContexts.push(context);
        expect(doc.payload).toEqual(native);
        expect(context.originalDocumentSnapshot.payload.when.getTime()).toBe(1);
        doc.payload.when.setTime(99);
        doc.payload.bytes[0] = 9;
        doc.payload.id.id = Buffer.alloc(12);
        // This diagnostic edit is intentionally retained within this row, but
        // cannot contaminate the other row or its source document.
        context.originalDocumentSnapshot.payload.when.setTime(77);
        await Promise.resolve();
        return { owner: doc.owner, public: true, ...grantNative };
      });
      const decorate = vi.fn((doc, _permissions, context: ServiceOutputContext) => {
        const index = contexts.length;
        events.push(`decorate:row:${index}`);
        contexts.push(context);
        expect(doc.payload).toEqual(native);
        if (entry === 'direct') expect(doc.hidden).toBe('denied');
        else expect(doc).not.toHaveProperty('hidden');
        expect(doc).not.toHaveProperty('owner');
        expect(context).toMatchObject({
          modelName: f.model.modelName,
          receivingModelName: f.model.modelName,
          operation: 'list',
          scopePath: [],
          virtualAccess: 'list',
          outputAccess: 'list',
          docPermissionsAccess: 'list',
        });
        expect(context.mongooseModel).toBe(f.model);
        expect(context.originalDocumentSnapshot!.payload.when.getTime()).toBe(77);
        expect(context.originalDocumentSnapshot!.name).toBe(`row:${index}`);
        expect(Object.keys(context)).not.toContain('documentAuthorization');
        expect(context.getDocumentAuthorization(doc)).toBe(context.documentAuthorization);
        if (entry === 'direct') {
          expect((context.docPermissions!.when as Date).getTime()).toBe(5);
          (context.docPermissions!.when as Date).setTime(88);
        } else {
          // The public decorator's diagnostic grants still follow serialized
          // metadata posture; that view never replaces the internal authority.
          expect(context.docPermissions).toEqual(posture.stripPermissionsField ? {} : doc.meta.permissions);
        }
        return doc;
      });
      const decorateAll = vi.fn((docs) => {
        events.push('decorateAll');
        return docs;
      });
      f.runtime.setModelOptions(f.model.modelName, {
        permissionSchema: { name: 'doc:owner', public: true, hidden: false, payload: true },
        modelPermissionPrefix: 'doc:',
        alwaysSelectFields: ['owner'],
        documentPermissionField: 'meta.permissions',
        stripPermissionsField: false,
        hydration: { find: 'lean', publicList: 'hydrated' },
        docPermissions: { list: hook },
        decorate: { list: decorate },
        decorateAll: { list: decorateAll },
        ...posture,
      } as never);
      f.adapter.find.mockImplementation(async ({ select, lean }) =>
        select === '_id' ? [{ _id: id }] : lean ? rows : rows.map((row) => new f.model(row)),
      );
      const args = { select: ['name', 'public', 'hidden', 'payload', '-_id'] };
      const result =
        entry === 'direct'
          ? await f.service.find(
              {},
              args,
              { ...options, authorization: { outputFields: { mode: 'grant', paths: ['hidden'] } } },
              (doc, context) => decorate(doc, undefined, context),
            )
          : await f.publicService._list({}, args, options);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(f.adapter.find.mock.calls[0][0].lean).toBe(entry === 'direct');
      expect(result.data[0]).toHaveProperty('name', 'row:0');
      expect(result.data[1]).not.toHaveProperty('name');
      expect(hook).toHaveBeenCalledTimes(2);
      expect(decorate).toHaveBeenCalledTimes(2);
      expect(events).toEqual([
        'hook:row:0',
        'decorate:row:0',
        'hook:row:1',
        'decorate:row:1',
        ...(entry === 'public' ? ['decorateAll'] : []),
      ]);
      expect(contexts[0].documentAuthorization).not.toBe(contexts[1].documentAuthorization);
      expect(contexts[0].getDocumentAuthorization(result.data[1] as object)).toBeUndefined();
      await expect(
        f.service.pickAllowedFields(result.data[1], 'list', {
          documentAuthorization: contexts[0].documentAuthorization,
        }),
      ).rejects.toThrow();
      expect(hookContexts[0]).not.toBe(hookContexts[1]);
      expect(result.contexts).toEqual(contexts);
      for (const [index, row] of result.data.entries()) {
        expect(row).not.toHaveProperty('_id');
        if (entry === 'direct') expect(row).toHaveProperty('hidden', 'denied');
        else expect(row).not.toHaveProperty('hidden');
        const context = contexts[index];
        const grants = readDocumentAuthorization(context.documentAuthorization, {
          request: f.req,
          runtime: f.runtime,
          model: f.model,
          modelName: f.model.modelName,
        }).grants;
        expect(grants.owner).toBe(index === 0);
        expect((grants.when as Date).getTime()).toBe(5);
        if (posture.stripPermissionsField) {
          expect(row).not.toHaveProperty('meta');
          expect(row).not.toHaveProperty('permissions');
        } else {
          const metadata = (row as { meta: { permissions: Record<string, unknown> } }).meta.permissions;
          expect((row as { permissions: unknown }).permissions).toBe(metadata);
          expect(Object.getOwnPropertyDescriptor(row, 'permissions')!.enumerable).toBe(false);
          if (options.includeFieldPermissions && !posture.disableFieldPermissions) {
            expect(metadata._view).toEqual({ public: true, payload: true, ...(index === 0 ? { name: true } : {}) });
            expect(metadata._edit).toEqual(metadata._view);
          } else if (!options.includePermissions) {
            expect(metadata).toEqual({ _view: { $: '_' }, _edit: { $: '_' } });
          }
          if ('exposedDocPermissionKeys' in posture) expect(metadata).toEqual({ public: true });
          else if (options.includePermissions) expect(metadata.owner).toBe(index === 0);
        }
      }
      expect(native.when.getTime()).toBe(1);
      expect(native.bytes[0]).toBe(1);
      expect(grantNative.when.getTime()).toBe(5);
    });
  }

  it.each(entries)('%s keeps native metadata option method receivers detached per row', async (entry) => {
    const f = fixture();
    const receivers: object[] = [];
    const keys = {
      when: new Date(1),
      bytes: Buffer.from([1]),
      map: new Map([['when', new Date(2)]]),
      id: new mongoose.mongo.BSON.ObjectId(),
      includes(key: string) {
        expect(this.when.getTime()).toBe(1);
        expect(this.bytes[0]).toBe(1);
        expect(this.map.get('when')!.getTime()).toBe(2);
        expect(this.id.equals(keys.id)).toBe(true);
        receivers.push(this);
        this.when.setTime(99);
        this.bytes[0] = 9;
        this.map.clear();
        this.id.id = Buffer.alloc(12);
        return key === 'visible';
      },
    };
    f.runtime.setModelOptions(f.model.modelName, {
      stripPermissionsField: false,
      exposedDocPermissionKeys: keys,
      docPermissions: { list: () => ({ visible: true }) },
    } as never);
    f.adapter.find.mockResolvedValue([{ name: 'a' }, { name: 'b' }]);
    const result =
      entry === 'direct'
        ? await f.service.find({}, {}, { ...quiet, includePermissions: true })
        : await f.publicService._list({}, {}, { ...quiet, includePermissions: true });
    expect(result).toMatchObject({
      success: true,
      data: [{ _permissions: { visible: true } }, { _permissions: { visible: true } }],
    });
    expect(new Set(receivers).size).toBe(2);
    expect(keys.when.getTime()).toBe(1);
    expect(keys.bytes[0]).toBe(1);
    expect(keys.map.size).toBe(1);
  });

  it.each(entries)('%s retains in-flight policy and observes replacement on the next list call', async (entry) => {
    const f = fixture();
    const newerHook = vi.fn(() => ({ owner: false }));
    const hook = vi.fn(async () => {
      f.runtime.setModelOptions(f.model.modelName, {
        permissionSchema: { name: false },
        docPermissions: { list: newerHook },
      });
      await Promise.resolve();
      return { owner: true };
    });
    f.runtime.setModelOptions(f.model.modelName, {
      permissionSchema: { name: 'owner' },
      docPermissions: { list: hook },
    });
    f.adapter.find.mockResolvedValue([{ name: 'a' }, { name: 'b' }]);
    const invoke = () => (entry === 'direct' ? f.service.find({}, {}, quiet) : f.publicService._list({}, {}, quiet));
    expect(await invoke()).toMatchObject({ success: true, data: [{ name: 'a' }, { name: 'b' }] });
    expect(hook).toHaveBeenCalledTimes(2);
    expect(newerHook).not.toHaveBeenCalled();
    expect(await invoke()).toMatchObject({ success: true, data: [{}, {}] });
    expect(newerHook).toHaveBeenCalledTimes(2);
  });

  it('keeps native rule wire normalization resolution-local across real direct list rows', async () => {
    const f = fixture();
    const prototype = mongoose.mongo.BSON.Long.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'toBSON');
    let allowed = true;
    const hook = vi.fn((doc) => {
      allowed = doc.name === 'first';
      return {};
    });
    try {
      f.runtime.setModelOptions(f.model.modelName, {
        permissionSchema: { name: new mongoose.mongo.BSON.Long(1, 2) },
        // Capture native configuration first, then exercise its existing wire
        // interpretation before output planning and during each row decision.
        overrideFilter: {
          list: () => {
            Object.defineProperty(prototype, 'toBSON', { configurable: true, value: () => allowed });
            return {};
          },
        },
        docPermissions: { list: hook },
      } as never);
      f.adapter.find.mockResolvedValue([{ name: 'first' }, { name: 'second' }]);
      const result = await f.service.find({}, { select: ['name', '-_id'] }, quiet);
      expect(result).toMatchObject({ success: true, data: [{ name: 'first' }, {}] });
      expect(hook).toHaveBeenCalledTimes(2);
    } finally {
      if (descriptor) Object.defineProperty(prototype, 'toBSON', descriptor);
      else Reflect.deleteProperty(prototype, 'toBSON');
    }
  });

  it.each(entries)('%s keeps mutable function-backed document hook lookups per row', async (entry) => {
    const f = fixture();
    const allow = vi.fn(() => ({ owner: true }));
    const deny = vi.fn(() => ({ owner: false }));
    let next = allow;
    const hooks = () => ({});
    const lookup = vi.fn(() => next);
    Object.defineProperty(hooks, 'list', { get: lookup });
    const decorate = (doc) => {
      next = deny;
      return doc;
    };
    f.runtime.setModelOptions(f.model.modelName, {
      permissionSchema: { name: 'owner' },
      docPermissions: hooks,
      decorate: { list: decorate },
    } as never);
    f.adapter.find.mockResolvedValue([{ name: 'a' }, { name: 'b' }]);
    const result =
      entry === 'direct' ? await f.service.find({}, {}, quiet, decorate) : await f.publicService._list({}, {}, quiet);
    expect(result).toMatchObject({ success: true, data: [{ name: 'a' }, {}] });
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(allow).toHaveBeenCalledTimes(1);
    expect(deny).toHaveBeenCalledTimes(1);
  });
});
