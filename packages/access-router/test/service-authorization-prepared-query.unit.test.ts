import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { Service } from '../src/services/service';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest } from '../src/interfaces';
import { createServiceExecution, deriveServiceExecution, readServiceExecution } from '../src/acl/service-execution';
import {
  prepareModelQuery,
  readPreparedModelQuery,
  resolveModelIdentifier,
  readModelIdentifier,
  executePreparedCount,
  executePreparedExists,
  executePreparedFindOne,
  executePreparedFind,
  executePreparedUpdateOne,
  executePreparedGroupedCount,
} from '../src/acl/prepared-query';

const access = (rowAccess = 'read') => ({
  operation: rowAccess,
  rowAccess,
  virtualAccess: rowAccess,
  outputAccess: rowAccess,
  docPermissionsAccess: rowAccess,
});
let sequence = 0;
function fixture(options: Record<string, unknown> = {}) {
  const name = `Sva04Unit${++sequence}`;
  const model = mongoose.model(
    name,
    new mongoose.Schema({
      status: String,
      tenant: String,
      join: String,
      stamp: Number,
      marker: mongoose.Schema.Types.Mixed,
    }),
  );
  const runtime = new AccessRuntime();
  runtime.registerModelInstance(name, model);
  runtime.setModelOptions(name, {
    permissionSchema: { status: true },
    stripPermissionsField: true,
    ...options,
  } as never);
  const req = { actor: 'original', [PERMISSIONS]: new Permission({ allowed: false }) } as unknown as ModelRequest;
  const adapter = {
    mongooseModel: model,
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    countDocuments: vi.fn().mockResolvedValue(7),
    exists: vi.fn().mockResolvedValue({ _id: 'found' }),
    aggregate: vi.fn().mockResolvedValue([]),
  };
  const run = <T>(fn: () => T) => runWithRuntime(runtime, fn);
  const service = run(() => {
    req.macl = new Core(req);
    return new (class extends Service {
      protected createModelAdapter() {
        return adapter;
      }
    })(req, name);
  });
  return { model, runtime, req, service, adapter, run, name };
}
afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Sva04Unit/);
});

describe('SVA-04 private prepared queries', () => {
  it('authenticates opaque tokens and rejects unrelated calls, receivers, runtimes, requests and access stages', async () => {
    const f = fixture();
    await f.run(async () => {
      const execution = createServiceExecution(f.service, access());
      const query = await prepareModelQuery(f.service, execution, { kind: 'client-read', filter: {} });
      expect(JSON.stringify(query)).toBe('{}');
      expect(Object.isFrozen(query)).toBe(true);
      expect(Object.keys(execution)).toEqual([]);
      for (const token of [{}, JSON.parse(JSON.stringify(query)), { preparedFilter: {}, skipParsing: true }]) {
        await expect(executePreparedCount(f.service, execution, token as never)).rejects.toMatchObject({
          result: { code: 'bad_request' },
        });
      }
      const another = createServiceExecution(f.service, access());
      const list = deriveServiceExecution(f.service, execution, access('list'));
      for (const context of [another, list, {}]) {
        await expect(executePreparedCount(f.service, context as never, query)).rejects.toMatchObject({
          result: { code: 'bad_request' },
        });
      }
      const other = fixture();
      await expect(executePreparedCount(other.service, execution, query)).rejects.toThrow();
      const sameModelOtherReceiver = new Service(f.req, f.name);
      await expect(executePreparedCount(sameModelOtherReceiver, execution, query)).rejects.toThrow();
      // Runtime/model identity changes invalidate even the original service binding.
      const originalModel = (f.service as any).model.mongooseModel;
      (f.service as any).model.mongooseModel = other.model;
      await expect(executePreparedCount(f.service, execution, query)).rejects.toThrow();
      (f.service as any).model.mongooseModel = originalModel;
      const originalReq = (f.service as any).req;
      (f.service as any).req = { ...f.req };
      await expect(executePreparedCount(f.service, execution, query)).rejects.toThrow();
      (f.service as any).req = originalReq;
      (f.service as any).requestRuntime = other.runtime;
      await expect(executePreparedCount(f.service, execution, query)).rejects.toThrow();
      (f.service as any).requestRuntime = f.runtime;
      expect(f.adapter.countDocuments).not.toHaveBeenCalled();
    });
  });

  it('reuses once-transformed scopes for find/count/exists and keeps mandatory joins after rewriting', async () => {
    let passes = 0;
    const transform = vi.fn(() => ({ stamp: ++passes }));
    const base = vi.fn(() => false);
    const f = fixture({ overrideFilter: { list: transform }, baseFilter: { list: base } });
    await f.run(async () => {
      const policy = { rows: { mode: 'scope', filter: { tenant: 'backend' } } };
      const execution = createServiceExecution(f.service, access('list'), policy);
      policy.rows.filter.tenant = 'mutated';
      const query = await prepareModelQuery(
        f.service,
        execution,
        { kind: 'expanded', filter: { status: 'ordinary' } },
        { join: 'parent' },
      );
      const expected = { stamp: 1, tenant: 'backend', join: 'parent' };
      expect(readPreparedModelQuery(f.service, execution, query).filter).toEqual(expected);
      const detached = readPreparedModelQuery(f.service, execution, query);
      (detached.filter as any).tenant = 'tampered';
      expect(readPreparedModelQuery(f.service, execution, query).filter).toEqual(expected);
      await executePreparedFind(
        f.service,
        execution,
        query,
        {},
        { skim: true, includePermissions: false, includeCount: true },
      );
      expect(await executePreparedCount(f.service, execution, query)).toMatchObject({ data: 7 });
      expect(await executePreparedExists(f.service, execution, query, true)).toMatchObject({ data: { _id: 'found' } });
      await executePreparedGroupedCount(f.service, execution, query, 'join', ['parent']);
      expect(f.adapter.find.mock.calls[0][0].filter).toEqual(expected);
      expect(f.adapter.countDocuments).toHaveBeenCalledTimes(2);
      expect(f.adapter.countDocuments).toHaveBeenLastCalledWith(expected);
      expect(f.adapter.exists).toHaveBeenCalledWith(expected);
      expect(f.adapter.aggregate.mock.calls[0][0][0].$match).toEqual({
        $and: [expected, { join: { $in: ['parent'] } }],
      });
      expect(transform).toHaveBeenCalledTimes(1);
      expect(base).not.toHaveBeenCalled();
      await expect(executePreparedUpdateOne(f.service, execution, query, {})).rejects.toThrow();
    });
  });

  it('allows identifier reuse only in explicitly derived read/list stages, resolving once', async () => {
    const idHook = vi.fn(() => ({ status: 'lookup' }));
    const transform = vi.fn((filter) => filter);
    const f = fixture({ resolveIdFilter: idHook, overrideFilter: { read: transform, list: transform } });
    await f.run(async () => {
      const execution = createServiceExecution(f.service, access());
      const identifier = await resolveModelIdentifier(f.service, execution, 'id');
      const list = deriveServiceExecution(f.service, execution, { ...access('list'), operation: 'read' });
      for (const ctx of [execution, list]) {
        const query = await prepareModelQuery(f.service, ctx, {
          kind: 'client-read',
          filter: readModelIdentifier(f.service, ctx, identifier),
        });
        await executePreparedFindOne(f.service, ctx, query);
      }
      expect(idHook).toHaveBeenCalledTimes(1);
      expect(transform).toHaveBeenCalledTimes(2);
      expect(() => readModelIdentifier(f.service, createServiceExecution(f.service, access()), identifier)).toThrow();
      expect(() => readModelIdentifier(f.service, execution, {} as never)).toThrow();
    });
  });

  it.each(['$$sq', '$$date'])('never reparses expanded %s business data or inert scope values', async (marker) => {
    const f = fixture();
    await f.run(async () => {
      const parse = vi.spyOn(f.service as any, 'parseClientData');
      const value = { [marker]: { model: 'Missing', op: 'list' } };
      const execution = createServiceExecution(f.service, access(), {
        rows: { mode: 'scope', filter: { marker: value } },
      });
      const query = await prepareModelQuery(f.service, execution, { kind: 'expanded', filter: { marker: value } });
      await executePreparedFindOne(f.service, execution, query);
      await executePreparedCount(f.service, execution, query);
      expect(parse).not.toHaveBeenCalled();
      expect(f.adapter.countDocuments).toHaveBeenCalledWith({ marker: value });
    });
  });

  it('validates expanded operand budgets before hooks and creates terminal tokens without dispatch', async () => {
    const transform = vi.fn((filter) => filter);
    const f = fixture({ overrideFilter: { read: transform } });
    await f.run(async () => {
      f.runtime.setGlobalOptions({ requestComplexity: { maxInValues: 2 } } as never);
      const execution = createServiceExecution(f.service, access());
      await expect(
        prepareModelQuery(f.service, execution, { kind: 'expanded', filter: { join: { $in: ['a', 'b', 'c'] } } }),
      ).rejects.toMatchObject({ result: { code: 'bad_request' } });
      const denied = await prepareModelQuery(f.service, execution, { kind: 'client-read', filter: false });
      expect(await executePreparedCount(f.service, execution, denied)).toMatchObject({ code: 'forbidden' });
      expect(await executePreparedExists(f.service, execution, denied)).toMatchObject({ code: 'forbidden' });
      expect(transform).not.toHaveBeenCalled();
      expect(f.adapter.countDocuments).not.toHaveBeenCalled();
      expect(f.adapter.exists).not.toHaveBeenCalled();
    });
  });

  it('captures actor, permissions and configuration before awaiting, without sharing policy caches', async () => {
    const transform = vi.fn(function (this: unknown, filter, permissions) {
      expect(this).toBe(f.req);
      expect(permissions.has('allowed')).toBe(false);
      return filter;
    });
    const base = vi.fn(() => ({ tenant: 'request' }));
    const f = fixture({ overrideFilter: { read: transform }, baseFilter: { read: base } });
    await f.run(async () => {
      const core = f.req.macl;
      for (const rows of [
        { mode: 'scope', filter: { tenant: 'one' } },
        { mode: 'unrestricted' },
        { mode: 'request' },
        { mode: 'scope', filter: {} },
        { mode: 'request' },
      ]) {
        const execution = createServiceExecution(f.service, access(), { rows });
        expect(Object.isFrozen(readServiceExecution(f.service, execution))).toBe(true);
        const query = await prepareModelQuery(f.service, execution, {
          kind: 'mutation-lookup',
          filter: { status: 'open' },
        });
        const expected = rows.mode === 'request' ? { tenant: 'request' } : rows.mode === 'scope' ? rows.filter : {};
        expect(readPreparedModelQuery(f.service, execution, query).filter).toEqual({ status: 'open', ...expected });
      }
      expect(base).toHaveBeenCalledTimes(1);
      expect(transform).toHaveBeenCalledTimes(5);
      expect(f.req.macl).toBe(core);
    });
  });

  it('owns query/scope snapshots across asynchronous parsing and captures the configured transform once', async () => {
    const transform = vi.fn((filter) => filter);
    const replacement = vi.fn(() => false);
    const f = fixture({ overrideFilter: { read: transform } });
    await f.run(async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const parser = vi.spyOn(f.service as any, 'parseClientData').mockImplementationOnce(async (filter) => {
        await gate;
        return filter;
      });
      const policy = { rows: { mode: 'scope', filter: { tenant: 'backend', when: new Date(1000) } } };
      const execution = createServiceExecution(f.service, access(), policy);
      const input = { status: 'open' };
      const pending = prepareModelQuery(f.service, execution, { kind: 'client-read', filter: input });
      input.status = 'changed';
      policy.rows.filter.tenant = 'changed';
      policy.rows.filter.when.setTime(2000);
      f.runtime.setModelOptions(f.name, { overrideFilter: { read: replacement } });
      release();
      const query = await pending;
      const snapshot = readPreparedModelQuery(f.service, execution, query);
      expect(snapshot.filter).toEqual({ status: 'open', tenant: 'backend', when: new Date(1000) });
      (snapshot.filter as any).when.setTime(5000);
      await executePreparedCount(f.service, execution, query);
      expect(f.adapter.countDocuments).toHaveBeenCalledWith({
        status: 'open',
        tenant: 'backend',
        when: new Date(1000),
      });
      expect(parser).toHaveBeenCalledTimes(1);
      expect(transform).toHaveBeenCalledTimes(1);
      expect(replacement).not.toHaveBeenCalled();
    });
  });
});
