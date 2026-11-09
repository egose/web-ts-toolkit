import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../../src/core';
import { Service } from '../../src/services/service';
import { AccessRuntime } from '../../src/runtime';
import { runWithRuntime } from '../../src/runtime-context';
import Permission from '../../src/permission';
import { PERMISSIONS } from '../../src/symbols';
import type { AuthorizationMode, DocumentGrants, ModelRequest, ModelRouterOptions } from '../../src/interfaces';
import * as materialization from '../../src/acl/trusted-output-materialization';

const modes: AuthorizationMode[] = ['isolated', 'trusted'];
const fields = Array.from({ length: 24 }, (_, index) => `field${index}`);
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
let serial = 0;

function fixture(mode: AuthorizationMode, options: ModelRouterOptions = {}) {
  const model = mongoose.model(
    `OwnedProfiles${++serial}`,
    new mongoose.Schema(
      {
        value: String,
        hidden: mongoose.Schema.Types.Mixed,
        owner: Boolean,
        ...Object.fromEntries(fields.map((field) => [field, String])),
        children: [new mongoose.Schema({ label: String, hidden: String }, { _id: false })],
      },
      { versionKey: false },
    ),
  );
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({ logger: { warn: vi.fn() } });
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    readAuthorizationMode: mode,
    listAuthorizationMode: mode,
    permissionSchema: { value: true, hidden: false },
    hydration: { find: 'lean', findOne: 'lean' },
    stripPermissionsField: true,
    ...options,
  });
  const req = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const adapter = {
    mongooseModel: model,
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
  };
  const service = runWithRuntime(runtime, () => {
    req.macl = new Core(req);
    return new (class extends Service {
      protected createModelAdapter() {
        return adapter;
      }
    })(req, model.modelName);
  });
  return { runtime, model, req, adapter, service };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^OwnedProfiles/);
});

describe('semantic runtime-profile migration: source borrowing, never borrowed authority', () => {
  it.each(modes.flatMap((mode) => [false, true].map((embedded) => ({ mode, embedded }))))(
    '$mode six same-ID rows/24 fields resolve once, own facts once and retain embedded denial/selection',
    async ({ mode, embedded }) => {
      const rawFacts: { owner: boolean; mark: boolean }[] = [];
      const seen = new Map<DocumentGrants, number>();
      const hook = vi.fn((doc: Record<string, unknown>) => {
        const facts = { owner: doc.owner === true, mark: true };
        rawFacts.push(facts);
        return facts;
      });
      const rule = vi.fn(function (this: ModelRequest, permissions, grants: DocumentGrants) {
        expect(this).toBe(f.req);
        expect(permissions.has('reader')).toBe(true);
        expect(Object.isFrozen(grants)).toBe(true);
        expect(Reflect.set(grants, 'owner', false)).toBe(false);
        seen.set(grants, (seen.get(grants) ?? 0) + 1);
        return grants.owner;
      });
      const f = fixture(mode, {
        permissionSchema: {
          ...Object.fromEntries(fields.map((field) => [field, rule])),
          hidden: false,
          ...(embedded ? { children: { list: true, read: true, sub: { label: 'doc:owner', hidden: false } } } : {}),
        },
        modelPermissionPrefix: 'doc:',
        docPermissions: { list: { dependsOn: ['owner'], get: hook } },
        ...(embedded ? { virtuals: { children: { sub: {} } } } : {}),
      });
      const rows = Array.from({ length: 6 }, (_, index) => ({
        _id: 'same',
        owner: true,
        hidden: 'never',
        ...Object.fromEntries(fields.map((field) => [field, `${index}:${field}`])),
        ...(embedded ? { children: [{ label: 'child', hidden: 'never' }] } : {}),
      }));
      f.adapter.find.mockResolvedValue(rows);
      const descriptor = Object.getOwnPropertyDescriptor;
      let rawDescriptorReads = 0;
      vi.spyOn(Object, 'getOwnPropertyDescriptor').mockImplementation((value, key) => {
        if (rawFacts.includes(value as { owner: boolean; mark: boolean })) rawDescriptorReads++;
        return descriptor(value, key);
      });
      const copy = vi.spyOn(materialization, 'materializeTrustedOutputValue');
      const result = await f.service.find(
        {},
        { select: [...fields, 'hidden', ...(embedded ? ['children'] : []), '-_id'] },
        quiet,
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      for (const facts of rawFacts) facts.owner = false;
      for (const [index, row] of result.data.entries()) {
        expect(row).toEqual({
          ...Object.fromEntries(fields.map((field) => [field, `${index}:${field}`])),
          ...(embedded ? { children: [{ label: 'child' }] } : {}),
        });
        expect(result.contexts[index]).not.toHaveProperty('documentAuthorization');
        expect(result.contexts[index].docPermissions).toEqual({ owner: true, mark: true });
        expect(seen.get(result.contexts[index].docPermissions)).toBe(24);
      }
      expect(new Set(result.contexts.map((context) => context.docPermissions)).size).toBe(6);
      expect(rawDescriptorReads).toBe(12);
      expect(hook).toHaveBeenCalledTimes(6);
      expect(rule).toHaveBeenCalledTimes(144);
      expect(f.adapter.find).toHaveBeenCalledTimes(1);
      const whole = copy.mock.calls.filter(
        ([value]) => value && typeof value === 'object' && Object.hasOwn(value, 'field23'),
      );
      expect(whole).toHaveLength(mode === 'isolated' ? 12 : 0);
      for (const [index, call] of hook.mock.calls.entries()) expect(call[0] === rows[index]).toBe(mode === 'trusted');
    },
  );

  it.each(modes)(
    '%s ordered async fields share immutable facts, not mutable native grants or stale DTO decisions',
    async (mode) => {
      const order: string[] = [];
      const raw = { owner: true };
      const first = vi.fn(async (_permissions, grants: DocumentGrants) => {
        order.push('first:start');
        await Promise.resolve();
        raw.owner = false;
        expect(Reflect.set(grants, 'owner', false)).toBe(false);
        order.push('first:end');
        return true;
      });
      const second = vi.fn((_permissions, grants: DocumentGrants) => {
        order.push('second');
        return grants.owner;
      });
      const f = fixture(mode, {
        permissionSchema: { field0: first, field1: second },
        docPermissions: { list: () => raw },
      });
      f.adapter.find.mockResolvedValue([{ field0: 'first', field1: 'second' }]);
      const result = await f.service.find({}, { select: ['field0', 'field1', '-_id'] }, quiet);
      expect(result).toMatchObject({ success: true, data: [{ field0: 'first', field1: 'second' }] });
      expect(order).toEqual(['first:start', 'first:end', 'second']);
      if (!result.success) throw new Error(result.code);
      order.length = 0;
      expect(await f.service.pickAllowedFields(result.data[0], 'list')).toEqual({ field0: 'first' });
      expect(order).toEqual(['first:start', 'first:end', 'second']);
      expect(first).toHaveBeenCalledTimes(2);
      expect(second).toHaveBeenCalledTimes(2);
    },
  );

  it.each(modes)('%s rejects rich/native fulfilled grants instead of a truthy/dormant/copy fallback', async (mode) => {
    const hook = vi.fn(() => ({ mutable: new Date(0) }));
    const rule = vi.fn(() => true);
    const f = fixture(mode, { permissionSchema: { value: rule }, docPermissions: { list: hook } as never });
    f.adapter.find.mockResolvedValue([{ value: 'never' }]);
    const result = await f.service.find({}, { select: ['value', '-_id'] }, quiet);
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(hook).toHaveBeenCalledTimes(1);
    expect(rule).not.toHaveBeenCalled();
  });

  it.each(['Date', 'BSON'] as const)(
    '%s fetch-only normalization is an intentional source-only mode difference, with literal facts in both',
    async (native) => {
      for (const mode of modes) {
        let observations = 0;
        const leaf =
          native === 'Date'
            ? Object.assign(new Date(1), {
                getTime() {
                  observations++;
                  return 1;
                },
              })
            : Object.assign(new mongoose.mongo.BSON.ObjectId(), {
                toBSON() {
                  observations++;
                  return 'observed';
                },
              });
        const hook = vi.fn(() => ({ owner: observations === 0 }));
        const f = fixture(mode, {
          permissionSchema: { value: 'doc:owner' },
          modelPermissionPrefix: 'doc:',
          docPermissions: { list: { dependsOn: ['hidden'], get: hook } },
        });
        f.adapter.find.mockResolvedValue([{ value: 'sensitive', hidden: leaf }]);
        expect(await f.service.find({}, { select: ['value', '-_id'] }, quiet)).toMatchObject({
          success: true,
          data: [mode === 'trusted' ? { value: 'sensitive' } : {}],
        });
        expect(hook).toHaveBeenCalledTimes(1);
        expect(observations === 0).toBe(mode === 'trusted');
      }
    },
  );
});
