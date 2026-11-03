import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelOutputContext } from '../src/interfaces';
import * as calls from '../src/acl/service-authorization';
import * as fieldAuthorization from '../src/acl/field-authorization';
import { ownedStageFixture, quietOutput } from './owned-stage-test-fixture';

const entries = ['direct', 'public'] as const;
afterEach(() => vi.restoreAllMocks());

describe('actual owned LIST preparation, row facts and publication ordering', () => {
  it.each(entries)(
    '%s amortizes primitive selected-path preparation without changing row/field output',
    async (entry) => {
      const work: number[] = [];
      for (const count of [1, 100]) {
        const f = ownedStageFixture({ modelOptions: { permissionSchema: { name: true, value: true, hidden: false } } });
        const rows = Array.from({ length: count }, (_, index) => ({
          name: `row:${index}`,
          value: 'yes',
          hidden: 'no',
        }));
        f.adapter.find.mockResolvedValue(rows);
        const split = vi.spyOn(String.prototype, 'split');
        let result;
        try {
          const args = { select: ['name', 'value', 'hidden', '-_id'], limit: count };
          result =
            entry === 'direct'
              ? await f.direct.find({}, args, quietOutput)
              : await f.public._list({}, args, quietOutput);
          work.push(
            split.mock.calls.filter(
              ([separator], index) =>
                separator === '.' && ['name', 'value'].includes(split.mock.contexts[index] as string),
            ).length,
          );
        } finally {
          split.mockRestore();
        }
        expect(result).toMatchObject({ success: true, data: rows.map(({ name, value }) => ({ name, value })) });
        expect(f.adapter.find).toHaveBeenCalledTimes(1);
      }
      expect(work[1] - work[0]).toBeLessThanOrEqual(32);
    },
  );

  it.each(entries)(
    '%s captures unrelated native configuration at entry, not once for every LIST row',
    async (entry) => {
      const f = ownedStageFixture();
      const dates = Array.from({ length: 32 }, (_, index) => new Date(100000 + index));
      f.runtime.setModelOptions(f.model.modelName, {
        defaults: { unrelated: dates },
        baseFilter: { list: {}, read: { unrelated: dates } },
      } as never);
      const reads = vi.spyOn(calls, 'readServiceOutputFieldAuthorization');
      const original = Date.prototype.getTime;
      let copies = 0;
      vi.spyOn(Date.prototype, 'getTime').mockImplementation(function (this: Date) {
        const time = original.call(this);
        if (time >= 100000 && time < 100032) copies++;
        return time;
      });
      const work: { copies: number; ruleReads: number }[] = [];
      for (const count of [1, 6]) {
        f.adapter.find.mockResolvedValue(
          Array.from({ length: count }, (_, index) => ({ name: `row:${index}`, value: 'yes', hidden: 'no' })),
        );
        copies = 0;
        reads.mockClear();
        const args = { select: ['name', 'value', 'hidden', '-_id'], limit: count };
        const result =
          entry === 'direct' ? await f.direct.find({}, args, quietOutput) : await f.public._list({}, args, quietOutput);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        expect(result.data).toHaveLength(count);
        work.push({ copies, ruleReads: reads.mock.calls.length });
      }
      expect(work[1]).toEqual(work[0]);
      expect(work[0].copies).toBeGreaterThan(0);
      expect(work[0].ruleReads).toBe(1);
    },
  );

  it.each(
    entries.flatMap((entry) =>
      [
        ['quiet', {}, quietOutput],
        ['grants', {}, { ...quietOutput, includePermissions: true }],
        ['field maps', {}, { ...quietOutput, includeFieldPermissions: true }],
        ['disabled maps', { disableFieldPermissions: true }, { ...quietOutput, includeFieldPermissions: true }],
        ['stripped', { stripPermissionsField: true }, { ...quietOutput, includePermissions: true }],
        ['exposed subset', { exposedDocPermissionKeys: ['public'] }, { ...quietOutput, includePermissions: true }],
      ].map(([posture, modelOptions, options]) => ({ entry, posture, modelOptions, options })),
    ),
  )(
    '$entry preserves same-ID facts, native views, diagnostics and metadata with $posture',
    async ({ entry, modelOptions, options }) => {
      const native = { when: new Date(1), bytes: Buffer.from([1]), id: new mongoose.mongo.BSON.ObjectId() };
      const rows = [true, false].map((owner, index) => ({
        _id: 'same',
        name: `row:${index}`,
        value: 'visible',
        hidden: 'denied',
        owner,
        payload: native,
      }));
      const events: string[] = [];
      const hooks: ModelOutputContext[] = [],
        contexts: ModelOutputContext[] = [];
      const hook = vi.fn(async function (this: unknown, doc, permissions, context) {
        expect(this).toBe(f.request);
        expect(permissions.has('reader')).toBe(true);
        expect(doc.payload).toEqual(native);
        expect(context).not.toHaveProperty('originalDocumentSnapshot');
        expect(context.docPermissions).toEqual({});
        hooks.push(context);
        events.push(`hook:${doc.name}`);
        doc.payload.when.setTime(99);
        doc.payload.bytes[0] = 9;
        doc.payload.id.id = Buffer.alloc(12);
        await Promise.resolve();
        return { owner: doc.owner === true, public: true };
      });
      const decorate = vi.fn((doc, _permissions, context: ModelOutputContext) => {
        const index = contexts.length;
        contexts.push(context);
        events.push(`decorate:row:${index}`);
        expect(doc.payload).toEqual(native);
        expect(doc).not.toHaveProperty('owner');
        expect(context).toMatchObject({
          modelName: f.model.modelName,
          receivingModelName: f.model.modelName,
          operation: 'list',
          scopePath: [],
          virtualAccess: 'list',
          outputAccess: 'list',
          docPermissionsAccess: 'list',
          docPermissions: { owner: index === 0, public: true },
        });
        expect(context).not.toHaveProperty('currentDocument');
        expect(context).not.toHaveProperty('mongooseModel');
        expect(context).not.toHaveProperty('documentAuthorization');
        expect(context).not.toHaveProperty('getDocumentAuthorization');
        expect(Object.isFrozen(context)).toBe(true);
        expect(Reflect.set(context.docPermissions, 'owner', false)).toBe(false);
        return doc;
      });
      const decorateAll = vi.fn((docs, _permissions, context) => {
        expect(context.docPermissions).toEqual({});
        events.push('decorateAll');
        return docs;
      });
      const f = ownedStageFixture({
        modelOptions: {
          permissionSchema: { name: 'doc:owner', value: true, hidden: false, payload: true },
          alwaysSelectFields: ['owner'],
          documentPermissionField: 'meta.permissions',
          stripPermissionsField: false,
          hydration: { find: 'lean', publicList: 'hydrated' },
          docPermissions: { list: hook },
          decorate: { list: decorate },
          decorateAll: { list: decorateAll },
          ...(modelOptions as object),
        },
      });
      f.adapter.find.mockImplementation(async ({ select, lean }) =>
        select === '_id' ? [{ _id: 'same' }] : lean ? rows : rows.map((row) => new f.model(row)),
      );
      const args = { select: ['name', 'value', 'hidden', 'payload', '-_id'] };
      const result =
        entry === 'direct'
          ? await f.direct.find(
              {},
              args,
              { ...(options as object), authorization: { outputFields: { mode: 'grant', paths: ['hidden'] } } },
              (doc, context) => decorate(doc, undefined, context),
            )
          : await f.public._list({}, args, options as never);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(f.adapter.find.mock.calls[0][0].lean).toBe(entry === 'direct');
      expect(result.data[0]).toHaveProperty('name', 'row:0');
      expect(result.data[1]).not.toHaveProperty('name');
      expect(hook).toHaveBeenCalledTimes(2);
      expect(decorate).toHaveBeenCalledTimes(2);
      expect(events).toEqual([
        'hook:row:0',
        'hook:row:1',
        'decorate:row:0',
        'decorate:row:1',
        ...(entry === 'public' ? ['decorateAll'] : []),
      ]);
      expect(hooks[0]).not.toBe(hooks[1]);
      expect(contexts[0].docPermissions).not.toBe(contexts[1].docPermissions);
      expect(result.contexts).toEqual(contexts);
      for (const [index, row] of result.data.entries() as any) {
        expect(row).not.toHaveProperty('_id');
        if (entry === 'direct') expect(row.hidden).toBe('denied');
        else expect(row).not.toHaveProperty('hidden');
        if ((modelOptions as any).stripPermissionsField) {
          expect(row).not.toHaveProperty('meta');
          expect(row).not.toHaveProperty('permissions');
        } else {
          const metadata = row.meta.permissions;
          expect(row.permissions).toBe(metadata);
          expect(Object.getOwnPropertyDescriptor(row, 'permissions')!.enumerable).toBe(false);
          if ((options as any).includeFieldPermissions && !(modelOptions as any).disableFieldPermissions) {
            expect(metadata._view).toEqual({ value: true, payload: true, ...(index === 0 ? { name: true } : {}) });
            expect(metadata._edit).toEqual(metadata._view);
            expect(metadata._view).not.toHaveProperty('hidden');
          } else if (!(options as any).includePermissions)
            expect(metadata).toEqual({ _view: { $: '_' }, _edit: { $: '_' } });
          if ((modelOptions as any).exposedDocPermissionKeys) expect(metadata).toEqual({ public: true });
          else if ((options as any).includePermissions) expect(metadata.owner).toBe(index === 0);
        }
      }
      expect(native.when.getTime()).toBe(1);
      expect(native.bytes[0]).toBe(1);
    },
  );

  it.each(entries)(
    '%s retains in-flight policy/hook capture and observes replacement only on the next call',
    async (entry) => {
      const f = ownedStageFixture();
      const newer = vi.fn(() => ({ owner: false }));
      const hook = vi.fn(async () => {
        f.runtime.setModelOptions(f.model.modelName, {
          permissionSchema: { name: false },
          docPermissions: { list: newer },
        });
        await Promise.resolve();
        return { owner: true };
      });
      f.runtime.setModelOptions(f.model.modelName, {
        permissionSchema: { name: 'doc:owner' },
        docPermissions: { list: hook },
      });
      f.adapter.find.mockResolvedValue([{ name: 'a' }, { name: 'b' }]);
      const invoke = () =>
        entry === 'direct' ? f.direct.find({}, {}, quietOutput) : f.public._list({}, {}, quietOutput);
      expect(await invoke()).toMatchObject({ success: true, data: [{ name: 'a' }, { name: 'b' }] });
      expect(hook).toHaveBeenCalledTimes(2);
      expect(newer).not.toHaveBeenCalled();
      expect(await invoke()).toMatchObject({ success: true, data: [{}, {}] });
      expect(newer).toHaveBeenCalledTimes(2);
    },
  );

  it.each(entries)('%s never reads function-attached per-row document hook selectors', async (entry) => {
    const lookup = vi.fn(() => () => ({ owner: true }));
    const bare = vi.fn(() => ({ owner: false }));
    Object.defineProperty(bare, 'list', { get: lookup });
    const f = ownedStageFixture({
      modelOptions: { permissionSchema: { name: 'owner' }, docPermissions: bare as never },
    });
    f.adapter.find.mockResolvedValue([{ name: 'a' }, { name: 'b' }]);
    const result =
      entry === 'direct' ? await f.direct.find({}, {}, quietOutput) : await f.public._list({}, {}, quietOutput);
    expect(result).toMatchObject({ success: true, data: [{}, {}] });
    expect(lookup).not.toHaveBeenCalled();
    expect(bare).toHaveBeenCalledTimes(2);
  });
});
