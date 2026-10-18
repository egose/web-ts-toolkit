import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessRuntime } from '../src/runtime';
import { Core } from '../src/core';
import { runWithRuntime } from '../src/runtime-context';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest, RowAuthorization } from '../src/interfaces';
import { createServiceExecution } from '../src/acl/service-execution';
import {
  prepareModelQuery,
  executePreparedGroupedCount,
  executePreparedCount,
  executePreparedExists,
} from '../src/acl/prepared-query';
import { prepareCountValues } from '../src/services/grouped-count';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let sequence = 0;
const quiet = { skim: true, includePermissions: false, includeFieldPermissions: false };
const modes = ['request', 'scope', 'unrestricted'] as const;
const rows = (mode: (typeof modes)[number]): RowAuthorization =>
  mode === 'scope' ? { mode, filter: { tenant: 'backend' } } : { mode };
async function fixture(options: Record<string, unknown> = {}, targetOptions: Record<string, unknown> = {}) {
  const name = `Sva04Row${++sequence}`;
  const targetName = `${name}Target`;
  const runtime = new AccessRuntime();
  const calls: Array<{ op: string; filter: unknown }> = [];
  const schema = new mongoose.Schema({
    status: String,
    tenant: String,
    join: String,
    transformPass: Number,
    marker: mongoose.Schema.Types.Mixed,
    title: String,
  });
  for (const op of ['find', 'findOne', 'countDocuments'] as const)
    schema.pre(op, function () {
      calls.push({ op, filter: this.getFilter() });
    });
  const model = mongoose.model(name, schema);
  const target = mongoose.model(targetName, schema.clone());
  runtime.registerModelInstance(name, model);
  runtime.registerModelInstance(targetName, target);
  const defaults = {
    hydration: { find: 'lean', findOne: 'lean', findById: 'lean', publicRead: 'lean' },
    permissionSchema: { status: true, tenant: true, join: true, transformPass: true, title: true, marker: true },
    operationAccess: { list: true, read: true, count: true },
    stripPermissionsField: true,
  };
  runtime.setModelOptions(name, { ...defaults, ...options } as never);
  runtime.setModelOptions(targetName, { ...defaults, ...targetOptions } as never);
  runtime.setGlobalOptions({ requestComplexity: { maxBulkConcurrency: 1 }, globalPermissions: () => [] });
  const request = { actor: 'original', [PERMISSIONS]: new Permission({ allowed: false }) } as unknown as ModelRequest;
  const run = <T>(fn: () => T) => runWithRuntime(runtime, fn);
  const service = run(() => {
    request.macl = new Core(request);
    return request.macl.getService(name);
  });
  await model.create([
    { status: 'review', tenant: 'request', join: 'parent', transformPass: 1, title: 'request' },
    { status: 'review', tenant: 'backend', join: 'parent', transformPass: 1, title: 'backend' },
    { status: 'review', tenant: 'other', join: 'other', transformPass: 1, title: 'other' },
  ]);
  return { runtime, request, service, model, target, targetName, calls, run };
}
afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Sva04Row/);
});

describe('SVA-04 row authorization', () => {
  it.each(modes)('%s transforms once, preserves the effective predicate and scopes totalCount', async (mode) => {
    let passes = 0;
    const transform = vi.fn(function (this: unknown, predicate, permissions) {
      expect(this).toBe(f.request);
      expect(predicate).toEqual({ status: 'open' });
      expect(permissions.has('allowed')).toBe(false);
      return { status: 'review', transformPass: ++passes };
    });
    const base = vi.fn(() => ({ tenant: 'request' }));
    const f = await fixture({ overrideFilter: { list: transform }, baseFilter: { list: base } });
    await f.run(async () => {
      const result = await f.service.find(
        { status: 'open' },
        { select: ['title'], limit: 1 },
        { ...quiet, includeCount: true, authorization: { rows: rows(mode) } },
      );
      expect(result).toMatchObject({ success: true, count: 1, totalCount: mode === 'unrestricted' ? 3 : 1 });
      if (mode !== 'unrestricted')
        expect((result as any).data[0].title).toBe(mode === 'request' ? 'request' : 'backend');
      expect(f.calls.map((c) => c.filter)).toEqual(
        Array(2).fill({
          status: 'review',
          transformPass: 1,
          ...(mode === 'unrestricted' ? {} : { tenant: mode === 'request' ? 'request' : 'backend' }),
        }),
      );
      expect(transform).toHaveBeenCalledTimes(1);
      expect(base).toHaveBeenCalledTimes(mode === 'request' ? 1 : 0);
    });
  });

  it.each(modes)(
    '%s keeps permission-dependent transform denial terminal after necessary template subqueries',
    async (mode) => {
      const transform = vi.fn(function (this: unknown, _filter, permissions) {
        expect(this).toBe(f.request);
        return permissions.has('allowed') ? {} : false;
      });
      const f = await fixture({ overrideFilter: { read: transform } });
      await f.target.create({ title: 'lookup' });
      await f.run(async () => {
        const populate = vi.spyOn(f.service, 'genPopulate');
        const result = await f.service.findOne(
          { title: { $$sq: { model: f.targetName, op: 'list', args: { select: ['title'] } } } },
          { include: { model: f.targetName, op: 'list', path: 'children', localField: 'join', foreignField: 'join' } },
          { ...quiet, authorization: { rows: rows(mode) } },
        );
        expect(result).toMatchObject({ code: 'forbidden', query: { filter: false } });
        expect(transform).toHaveBeenCalledTimes(1);
        // Parsing has already dispatched the target list. Neither the primary read nor later children run.
        expect(f.calls.filter((c) => c.op === 'find')).toHaveLength(1);
        expect(f.calls.filter((c) => c.op === 'findOne')).toHaveLength(0);
        expect(populate).not.toHaveBeenCalled();
      });
    },
  );

  it.each(modes)('%s retains user restrictions added by the transform', async (mode) => {
    const transform = vi.fn(() => ({ tenant: 'request' }));
    const f = await fixture({ overrideFilter: { list: transform } });
    await f.run(async () => {
      const result = await f.service.find(
        {},
        {},
        { ...quiet, includeCount: true, authorization: { rows: rows(mode) } },
      );
      expect(result).toMatchObject({ success: true, totalCount: mode === 'scope' ? 0 : 1 });
      expect(transform).toHaveBeenCalledTimes(1);
    });
  });

  it.each(['findOne', 'find', 'updateOne', 'upsert', 'findById', 'updateById'] as const)(
    '%s short-circuits false scope before ID, parsing, hooks or child dispatch',
    async (method) => {
      const hook = vi.fn(() => ({}));
      const id = vi.fn(() => ({}));
      const f = await fixture({ overrideFilter: { read: hook, list: hook, update: hook }, resolveIdFilter: id });
      await f.run(async () => {
        const parse = vi.spyOn(f.service as any, 'parseClientData');
        const options = { ...quiet, authorization: { rows: { mode: 'scope' as const, filter: false as const } } };
        const filter = { title: { $$sq: { model: f.targetName, op: 'list' } } };
        const result =
          method === 'findById'
            ? await f.service.findById('id', {}, options)
            : method === 'updateById'
              ? await f.service.updateById('id', filter, {}, options)
              : method === 'find' || method === 'findOne'
                ? await f.service[method](filter, {}, options)
                : await f.service[method](filter, { title: 'write' }, {}, options);
        expect(result).toMatchObject({ code: 'forbidden' });
        expect(id).not.toHaveBeenCalled();
        expect(hook).not.toHaveBeenCalled();
        expect(parse).not.toHaveBeenCalled();
        expect(f.calls).toEqual([]);
      });
    },
  );

  it.each(modes)('%s treats false predicate and false identifiers as terminal', async (mode) => {
    const transform = vi.fn(() => ({}));
    const id = vi.fn(() => false);
    const f = await fixture({
      overrideFilter: { read: transform, list: transform, update: transform },
      resolveIdFilter: id,
    });
    await f.run(async () => {
      const options = { ...quiet, authorization: { rows: rows(mode) } };
      for (const result of [
        await f.service.findOne(false, {}, options),
        await f.service.find(false, {}, options),
        await f.service.updateOne(false, {}, {}, options),
        await f.service.upsert(false, {}, {}, options),
        await f.service.findById('id', {}, options),
        await f.service.updateById('id', {}, {}, options),
      ])
        expect(result).toMatchObject({ code: 'forbidden' });
      expect(id).toHaveBeenCalledTimes(2);
      expect(transform).not.toHaveBeenCalled();
      expect(f.calls).toEqual([]);
    });
  });

  it('request base false is terminal; scope and unrestricted do not evaluate or seed that cache', async () => {
    const base = vi.fn(() => false);
    const transform = vi.fn((filter) => filter);
    const f = await fixture({ baseFilter: { read: base }, overrideFilter: { read: transform } });
    await f.run(async () => {
      for (const mode of ['scope', 'unrestricted', 'request', 'scope', 'request'] as const) {
        const result = await f.service.findOne({}, {}, { ...quiet, authorization: { rows: rows(mode) } });
        expect(result.success).toBe(mode !== 'request');
      }
      expect(base).toHaveBeenCalledTimes(1);
      expect(transform).toHaveBeenCalledTimes(5);
    });
  });

  it.each(modes)(
    '%s transform false blocks every direct lookup path before population and mutation-data parsing',
    async (mode) => {
      const hook = vi.fn(() => false);
      const id = vi.fn(() => ({ title: 'request' }));
      const f = await fixture({ overrideFilter: { read: hook, list: hook, update: hook }, resolveIdFilter: id });
      await f.run(async () => {
        const populate = vi.spyOn(f.service, 'genPopulate');
        const options = { ...quiet, authorization: { rows: rows(mode) } };
        const data = { title: { $$sq: { model: f.targetName, op: 'list' } } };
        for (const result of [
          await f.service.find({}, {}, options),
          await f.service.findOne({}, {}, options),
          await f.service.findById('id', {}, options),
          await f.service.updateOne({}, data, {}, options),
          await f.service.updateById('id', data, {}, options),
          await f.service.upsert({}, data, {}, options),
        ])
          expect(result).toMatchObject({ code: 'forbidden' });
        expect(hook).toHaveBeenCalledTimes(6);
        expect(id).toHaveBeenCalledTimes(2);
        expect(populate).not.toHaveBeenCalled();
        expect(f.calls).toEqual([]);
      });
    },
  );

  it('rejects malformed scopes before parsing and keeps output grants independent from sort/distinct admission', async () => {
    const hook = vi.fn((filter) => filter);
    const f = await fixture({ permissionSchema: { title: false }, overrideFilter: { read: hook } });
    await f.run(async () => {
      for (const filter of [undefined, null, true, 'all', []]) {
        expect(
          await f.service.findOne({ title: { $$sq: { model: f.targetName, op: 'list' } } }, {}, {
            ...quiet,
            authorization: { rows: { mode: 'scope', filter } },
          } as never),
        ).toMatchObject({ code: 'bad_request' });
      }
      expect(f.calls).toEqual([]);
      expect(hook).not.toHaveBeenCalled();
      expect(
        await f.service.find(
          {},
          { sort: { title: 1 } },
          {
            ...quiet,
            authorization: { rows: { mode: 'unrestricted' }, outputFields: { mode: 'grant', paths: ['title'] } },
          },
        ),
      ).toMatchObject({ code: 'bad_request' });
      expect(await f.service.distinct('title')).toMatchObject({ code: 'forbidden' });
      expect(f.calls).toEqual([]);
    });
  });

  it.each(modes)(
    '%s scopes internal count/exists/grouped count, retains mandatory joins and normal schema casting',
    async (mode) => {
      const transform = vi.fn(() => ({}));
      const f = await fixture({
        overrideFilter: { count: transform },
        baseFilter: { count: () => ({ tenant: 'request' }) },
      });
      await f.run(async () => {
        const execution = createServiceExecution(
          f.service,
          {
            operation: 'count',
            rowAccess: 'count',
            virtualAccess: 'count',
            outputAccess: 'count',
            docPermissionsAccess: 'count',
          },
          { rows: rows(mode) },
        );
        const query = await prepareModelQuery(
          f.service,
          execution,
          { kind: 'mutation-lookup', filter: { status: 'open' } },
          { join: 'parent' },
        );
        const count = mode === 'unrestricted' ? 2 : 1;
        expect(await executePreparedCount(f.service, execution, query)).toMatchObject({ data: count });
        expect(await executePreparedExists(f.service, execution, query)).toMatchObject({ data: true });
        const grouped = await executePreparedGroupedCount(
          f.service,
          execution,
          query,
          'join',
          prepareCountValues(['parent', 'other']),
        );
        expect(grouped.success).toBe(true);
        if (grouped.success) expect(grouped.data).toEqual([count, 0]);
        expect(transform).toHaveBeenCalledTimes(1);
      });
    },
  );

  it('upsert reuses a non-idempotent update predicate and derives a row-free create branch without stamping scope', async () => {
    let passes = 0;
    const transform = vi.fn(() => ({ transformPass: ++passes }));
    const observed: string[] = [];
    const f = await fixture({
      overrideFilter: { update: transform },
      afterPersist: {
        update: (doc, _permissions, ctx) => {
          observed.push(ctx.operation);
          return doc;
        },
        create: (doc, _permissions, ctx) => {
          observed.push(ctx.operation);
          return doc;
        },
      },
    });
    await f.run(async () => {
      const result = await f.service.upsert(
        { status: 'open' },
        { title: 'updated' },
        {},
        { ...quiet, authorization: { rows: rows('scope') } },
      );
      expect(result.success).toBe(true);
      expect(transform).toHaveBeenCalledTimes(1);
      expect((await f.model.findOne({ tenant: 'backend' }))!.title).toBe('updated');
      expect((await f.model.findOne({ tenant: 'request' }))!.title).toBe('request');
      const created = await f.service.upsert(
        {},
        { title: 'created' },
        {},
        { ...quiet, authorization: { rows: { mode: 'scope', filter: { tenant: 'absent' } } } },
      );
      expect(created).toMatchObject({ success: true, kind: 'list' });
      expect((await f.model.findOne({ title: 'created' }))!.tenant).toBeUndefined();
      expect(transform).toHaveBeenCalledTimes(2);
      expect(observed).toEqual(['upsert', 'upsert']);
    });
  });

  it('legacy and correlated targets retain joins after transforms; template parsing runs once before inert substitution', async () => {
    const transforms = { read: vi.fn(() => ({})), list: vi.fn(() => ({})), count: vi.fn(() => ({})) };
    const f = await fixture({}, { overrideFilter: transforms });
    const marker = { $$sq: { model: 'Unregistered', op: 'list' }, $$date: 'now' };
    await f.model.updateOne({ tenant: 'request' }, { marker });
    await f.target.create([
      { join: 'parent', marker, title: 'match' },
      { join: 'other', marker: 'other', title: 'unrelated' },
    ]);
    await f.run(async () => {
      const result = await f.service.findOne(
        { tenant: 'request' },
        {
          include: [
            {
              model: f.targetName,
              op: 'list',
              path: 'legacy',
              localField: 'join',
              foreignField: 'join',
              args: { select: ['title'] },
            },
            {
              model: f.targetName,
              op: 'read',
              path: 'legacyRead',
              localField: 'join',
              foreignField: 'join',
              args: { select: ['title'] },
            },
            {
              mode: 'correlated',
              model: f.targetName,
              op: 'list',
              path: 'correlated',
              filter: { marker: { $parent: 'marker' } },
              args: { select: ['title'] },
            },
            {
              mode: 'correlated',
              model: f.targetName,
              op: 'read',
              path: 'correlatedRead',
              filter: { marker: { $parent: 'marker' } },
              args: { select: ['title'] },
            },
            {
              mode: 'correlated',
              model: f.targetName,
              op: 'count',
              path: 'total',
              filter: { marker: { $parent: 'marker' } },
            },
          ],
        } as never,
        quiet,
      );
      expect(result).toMatchObject({
        success: true,
        data: {
          legacy: [{ title: 'match' }],
          legacyRead: { title: 'match' },
          correlated: [{ title: 'match' }],
          correlatedRead: { title: 'match' },
          total: 1,
        },
      });
      expect(transforms.list).toHaveBeenCalledTimes(2);
      expect(transforms.read).toHaveBeenCalledTimes(2);
      expect(transforms.count).toHaveBeenCalledTimes(1);
    });
  });

  it('parses executable correlated templates before substitution, while count templates keep their non-parsing behavior', async () => {
    const transforms = {
      list: vi.fn((filter) => filter),
      read: vi.fn((filter) => filter),
      count: vi.fn((filter) => filter),
    };
    const f = await fixture({}, { overrideFilter: transforms });
    await f.target.create({ join: 'parent', title: 'request' });
    await f.run(async () => {
      const subquery = {
        $$sq: { model: f.targetName, op: 'list', args: { select: ['join'] }, sqOptions: { path: 'join' } },
      };
      const result = await f.service.findOne(
        { tenant: 'request' },
        {
          include: [
            {
              mode: 'correlated',
              model: f.targetName,
              op: 'list',
              path: 'matches',
              filter: { join: { $in: subquery }, title: { $parent: 'title' } },
              args: { select: ['title'] },
            },
            {
              mode: 'correlated',
              model: f.targetName,
              op: 'count',
              path: 'literalCount',
              filter: { marker: { $eq: subquery }, title: { $parent: 'title' } },
            },
          ],
        } as never,
        quiet,
      );
      expect(result).toMatchObject({ success: true, data: { matches: [{ title: 'request' }], literalCount: 0 } });
      expect(transforms.list).toHaveBeenCalledTimes(2); // template $$sq and its expanded target query
      expect(transforms.count).toHaveBeenCalledTimes(1);
    });
  });
});
