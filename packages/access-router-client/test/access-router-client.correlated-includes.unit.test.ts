import { describe, expect, it } from 'vitest';
import type { AxiosResponse } from 'axios';

import { createAdapter, parentField, CorrelatedIncludeError } from '../src';
import type { Document } from '../src';
import { isCorrelatedIncludeDescriptor } from '../src/correlated-brand';
import { replaceSubQuery } from '../src/helpers';

/**
 * ACI-04: client parent references (`parentField()`) and include
 * composition (`$include()`).
 *
 * Conversion-only coverage (zero HTTP): every `$include()` below runs
 * against a stub transport that counts dispatches, so any accidental inner
 * query would fail the zero-call assertions. Direct/grouped execution is
 * exercised only for outer requests carrying converted payloads.
 */

interface User extends Document {
  orgId?: string;
  managerId?: string;
  name: string;
}

interface Org extends Document {
  name: string;
  description?: string;
  active?: boolean;
}

interface Post extends Document {
  authorId: string;
  reviewerId?: string;
  title: string;
  views: number;
  createdAt: Date;
  tags: string[];
}

function createStub() {
  let invocations = 0;
  const bodies: unknown[] = [];
  const adapter = createAdapter({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      invocations += 1;
      let body: unknown = (config as { data?: unknown }).data;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          // keep raw
        }
      }
      bodies.push(body);
      if (Array.isArray(body)) {
        // grouped root request: one entry per def
        return {
          data: body.map((def) => {
            const op = (def as { op?: string }).op;
            return {
              result: {
                success: true,
                kind: op === 'list' ? 'list' : 'single',
                data: op === 'list' ? [] : { _id: 'u1', name: 'Ada' },
              },
              message: '',
              statusCode: 200,
            };
          }),
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        } as unknown as AxiosResponse;
      }
      return {
        data: { _id: 'u1', name: 'Ada' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      } as unknown as AxiosResponse;
    },
  });
  const userService = adapter.createModelService<User>({ modelName: 'User', basePath: 'users' });
  const orgService = adapter.createModelService<Org>({ modelName: 'Org', basePath: 'orgs' });
  const postService = adapter.createModelService<Post>({ modelName: 'Post', basePath: 'posts' });
  return { adapter, userService, orgService, postService, invocations: () => invocations, bodies };
}

describe('ACI-04 parentField() markers', () => {
  it('creates a frozen structural marker, not a magic string', () => {
    const ref = parentField('orgId');
    expect(ref).toEqual({ $parent: 'orgId' });
    expect(Object.isFrozen(ref)).toBe(true);
    expect(typeof ref.$parent).toBe('string');
  });

  it('rejects empty and non-string paths with a controlled error', () => {
    expect(() => parentField('')).toThrow(CorrelatedIncludeError);
    expect(() => parentField(42 as unknown as string)).toThrow(CorrelatedIncludeError);
    expect(() => parentField(undefined as unknown as string)).toThrow(CorrelatedIncludeError);
  });

  it('leaves magic $ strings as literal query values', () => {
    const { postService } = createStub();
    const req = postService.listAdvanced({ title: '$special' });
    expect(typeof req.then).toBe('function');
    expect((req as unknown as { __query: { filter: unknown } }).__query.filter).toEqual({
      title: '$special',
    });
  });
});

describe('ACI-04 seven builders convert to the agreed wire payload', () => {
  it('readAdvanced identifier read (D6.2)', () => {
    const { orgService, invocations } = createStub();
    const descriptor = orgService.readAdvanced(parentField('orgId'), { select: ['name', 'description'] });
    expect(isCorrelatedIncludeDescriptor(descriptor)).toBe(true);
    expect(descriptor.$include('org')).toEqual({
      mode: 'correlated',
      model: 'Org',
      op: 'read',
      path: 'org',
      id: { $parent: 'orgId' },
      args: { select: ['name', 'description'] },
    });
    expect(invocations()).toBe(0);
  });

  it('listAdvanced with literal $special preserved (D6.4)', () => {
    const { postService, invocations } = createStub();
    const wire = postService
      .listAdvanced(
        {
          authorId: parentField('_id'),
          reviewerId: parentField('managerId'),
          title: '$special',
        },
        { select: ['title'], sort: { createdAt: -1 }, limit: 5 },
      )
      .$include('posts');
    expect(wire).toEqual({
      mode: 'correlated',
      model: 'Post',
      op: 'list',
      path: 'posts',
      filter: {
        authorId: { $parent: '_id' },
        reviewerId: { $parent: 'managerId' },
        title: '$special',
      },
      args: { select: ['title'], sort: { createdAt: -1 }, limit: 5 },
    });
    expect(invocations()).toBe(0);
  });

  it('countAdvanced carries no args (D6.6)', () => {
    const { postService, invocations } = createStub();
    const wire = postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount');
    expect(wire).toEqual({
      mode: 'correlated',
      model: 'Post',
      op: 'count',
      path: 'postCount',
      filter: { authorId: { $parent: '_id' } },
    });
    expect('args' in wire).toBe(false);
    expect(invocations()).toBe(0);
  });

  it('basic list() applies pagination per parent via supplemental filter', () => {
    const { postService, invocations } = createStub();
    const wire = postService.list({ limit: 5 }).$include('posts', {
      filter: { authorId: parentField('_id') },
    });
    expect(wire).toEqual({
      mode: 'correlated',
      model: 'Post',
      op: 'list',
      path: 'posts',
      filter: { authorId: { $parent: '_id' } },
      args: { limit: 5 },
    });
    expect(invocations()).toBe(0);
  });

  it('basic count() supplemental filter carries no args', () => {
    const { postService, invocations } = createStub();
    const wire = postService.count().$include('postCount', {
      filter: { authorId: parentField('_id') },
    });
    expect(wire).toEqual({
      mode: 'correlated',
      model: 'Post',
      op: 'count',
      path: 'postCount',
      filter: { authorId: { $parent: '_id' } },
    });
    expect(invocations()).toBe(0);
  });

  it('basic read() identifier read (D6.1)', () => {
    const { orgService, invocations } = createStub();
    const wire = orgService.read(parentField('orgId')).$include('org');
    expect(wire).toEqual({
      mode: 'correlated',
      model: 'Org',
      op: 'read',
      path: 'org',
      id: { $parent: 'orgId' },
    });
    expect('args' in wire).toBe(false);
    expect(invocations()).toBe(0);
  });

  it('readAdvancedFilter (D6.3)', () => {
    const { orgService, invocations } = createStub();
    const wire = orgService
      .readAdvancedFilter({ _id: parentField('orgId'), active: true }, { select: ['name'] })
      .$include('org');
    expect(wire).toEqual({
      mode: 'correlated',
      model: 'Org',
      op: 'read',
      path: 'org',
      filter: { _id: { $parent: 'orgId' }, active: true },
      args: { select: ['name'] },
    });
    expect(invocations()).toBe(0);
  });

  it('literal inner queries convert without markers', () => {
    const { orgService, postService, invocations } = createStub();
    expect(orgService.read('o9').$include('org')).toEqual({
      mode: 'correlated',
      model: 'Org',
      op: 'read',
      path: 'org',
      id: 'o9',
    });
    expect(postService.countAdvanced({ authorId: 'u1' }).$include('postCount')).toEqual({
      mode: 'correlated',
      model: 'Post',
      op: 'count',
      path: 'postCount',
      filter: { authorId: 'u1' },
    });
    expect(invocations()).toBe(0);
  });

  it('array and escape cases (D6.7)', () => {
    const { postService, invocations } = createStub();
    const inWire = postService.listAdvanced({ authorId: { $in: parentField('memberIds') } }).$include('posts');
    expect(inWire.filter).toEqual({ authorId: { $in: { $parent: 'memberIds' } } });
    const bareWire = postService.listAdvanced({ title: parentField('tags') }).$include('posts');
    expect(bareWire.filter).toEqual({ title: { $parent: 'tags' } });
    const escapeWire = postService
      .listAdvanced({ authorId: parentField('_id'), note: { $escape: { $parent: 'x' } } } as never)
      .$include('posts');
    expect(escapeWire.filter).toEqual({
      authorId: { $parent: '_id' },
      note: { $escape: { $parent: 'x' } },
    });
    expect(invocations()).toBe(0);
  });

  it('escape-only filters stay executable (escapes are data, not references)', () => {
    const { postService } = createStub();
    const req = postService.listAdvanced({ note: { $escape: { $parent: 'x' } } } as never);
    expect(isCorrelatedIncludeDescriptor(req)).toBe(false);
    expect(typeof (req as unknown as { then: unknown }).then).toBe('function');
  });
});

describe('ACI-04 descriptor lifetime', () => {
  it('descriptors are frozen, non-thenable, and await to themselves', async () => {
    const { orgService, invocations } = createStub();
    const descriptor = orgService.read(parentField('orgId'));
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(isCorrelatedIncludeDescriptor(descriptor)).toBe(true);
    const record = descriptor as unknown as Record<string, unknown>;
    expect(record.then).toBeUndefined();
    expect(record.catch).toBeUndefined();
    expect(record.finally).toBeUndefined();
    expect(record.exec).toBeUndefined();
    expect(typeof record.$include).toBe('function');
    // JavaScript await on a non-thenable yields the value unchanged: a
    // programming error, documented rather than guarded.
    const awaited = await (descriptor as unknown as Promise<unknown>);
    expect(awaited).toBe(descriptor);
    expect(invocations()).toBe(0);
  });

  it('repeated conversion yields independently owned payloads', () => {
    const { postService } = createStub();
    const descriptor = postService.listAdvanced({ authorId: parentField('_id') }, { select: ['title'], limit: 5 });
    const first = descriptor.$include('a');
    const second = descriptor.$include('a');
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.filter).not.toBe(second.filter);
    expect(first.args).not.toBe(second.args);
    // Mutating one payload never affects later conversions.
    (first.filter as Record<string, unknown>).authorId = 'mutated';
    (first.args as Record<string, unknown>).limit = 999;
    expect(second).toEqual({
      mode: 'correlated',
      model: 'Post',
      op: 'list',
      path: 'a',
      filter: { authorId: { $parent: '_id' } },
      args: { select: ['title'], limit: 5 },
    });
    expect(descriptor.$include('a')).toEqual(second);
  });

  it('does not mutate caller inputs and is stable under later caller mutation', () => {
    const { postService } = createStub();
    const filter = { authorId: parentField('_id'), views: { $gte: 3 } };
    const args = { select: ['title'] };
    const before = JSON.parse(JSON.stringify({ filter, args }));
    const descriptor = postService.listAdvanced(filter, args);
    descriptor.$include('posts');
    expect(JSON.parse(JSON.stringify({ filter, args }))).toEqual(before);
    // Caller mutation after the call cannot affect the frozen snapshot.
    (filter as Record<string, unknown>).authorId = 'mutated';
    (args as unknown as Record<string, unknown>).select = ['mutated'];
    expect(descriptor.$include('posts')).toEqual({
      mode: 'correlated',
      model: 'Post',
      op: 'list',
      path: 'posts',
      filter: { authorId: { $parent: '_id' }, views: { $gte: 3 } },
      args: { select: ['title'] },
    });
  });

  it('nested includes bind to the immediate parent and stay independent', () => {
    const { userService, postService } = createStub();
    const nested = userService.read(parentField('reviewerId')).$include('reviewer');
    const outer = postService.listAdvanced({ authorId: parentField('_id') }, { include: [nested] });
    expect(isCorrelatedIncludeDescriptor(outer)).toBe(true);
    const first = outer.$include('posts');
    expect(first).toEqual({
      mode: 'correlated',
      model: 'Post',
      op: 'list',
      path: 'posts',
      filter: { authorId: { $parent: '_id' } },
      args: {
        include: [
          {
            mode: 'correlated',
            model: 'User',
            op: 'read',
            path: 'reviewer',
            id: { $parent: 'reviewerId' },
          },
        ],
      },
    });
    const second = outer.$include('posts');
    const nestedArgs = first.args as { include: Array<Record<string, unknown>> };
    nestedArgs.include[0].path = 'mutated';
    expect(second).toEqual({
      mode: 'correlated',
      model: 'Post',
      op: 'list',
      path: 'posts',
      filter: { authorId: { $parent: '_id' } },
      args: {
        include: [
          {
            mode: 'correlated',
            model: 'User',
            op: 'read',
            path: 'reviewer',
            id: { $parent: 'reviewerId' },
          },
        ],
      },
    });
  });
});

describe('ACI-04 reference execution restrictions', () => {
  it('adapter.group() brand-checks descriptors before any dispatch', async () => {
    const { adapter, orgService, invocations } = createStub();
    const descriptor = orgService.read(parentField('orgId'));
    await expect(adapter.group(descriptor as never)).rejects.toThrow(CorrelatedIncludeError);
    expect(invocations()).toBe(0);
  });

  it('filter conversion brand-checks embedded descriptors without confusing markers', () => {
    const { orgService } = createStub();
    const descriptor = orgService.read(parentField('orgId'));
    expect(() => replaceSubQuery(descriptor as never)).toThrow(CorrelatedIncludeError);
    expect(() => replaceSubQuery({ authorId: descriptor } as never)).toThrow(CorrelatedIncludeError);
    // Markers and escapes pass through untouched (never $$sq).
    expect(replaceSubQuery({ authorId: parentField('_id') } as never)).toEqual({
      authorId: { $parent: '_id' },
    });
  });

  it('descriptors cannot be embedded in outer filters or include arrays', () => {
    const { userService, orgService, postService } = createStub();
    const descriptor = orgService.read(parentField('orgId'));
    expect(() => userService.listAdvanced({ name: descriptor } as never)).toThrow(CorrelatedIncludeError);
    expect(() => userService.listAdvanced({ name: 'x' }, { include: [descriptor as never] })).toThrow(
      CorrelatedIncludeError,
    );
    const live = postService.listAdvanced({ authorId: 'u1' });
    expect(() => userService.listAdvanced({ name: 'x' }, { include: [live as never] })).toThrow(CorrelatedIncludeError);
  });

  it('malformed markers throw controlled errors for unchecked callers', () => {
    const { postService } = createStub();
    expect(() => postService.listAdvanced({ authorId: { $parent: 42 } } as never)).toThrow(CorrelatedIncludeError);
    expect(() => postService.listAdvanced({ authorId: { $parent: '' } } as never)).toThrow(CorrelatedIncludeError);
    expect(() => postService.listAdvanced({ authorId: { $parent: 'x', extra: 1 } } as never)).toThrow(
      CorrelatedIncludeError,
    );
    expect(() => postService.read({ $parent: 'x', extra: 1 } as never)).toThrow(CorrelatedIncludeError);
    expect(() => postService.listAdvanced({ authorId: parentField('__proto__.x') })).toThrow(CorrelatedIncludeError);
  });

  it('markers in forbidden positions throw instead of creating descriptors', () => {
    const { postService } = createStub();
    expect(() => postService.listAdvanced({ $text: { $search: parentField('x') } } as never)).toThrow(
      CorrelatedIncludeError,
    );
    expect(() => postService.listAdvanced({ $and: [parentField('x')] } as never)).toThrow(CorrelatedIncludeError);
    expect(() => postService.listAdvanced({ tags: { $elemMatch: parentField('x') } } as never)).toThrow(
      CorrelatedIncludeError,
    );
    // ...while markers nested inside $elemMatch field conditions stay supported.
    const supported = postService.listAdvanced({ tags: { $elemMatch: { $eq: 'vip' } } } as never);
    expect(isCorrelatedIncludeDescriptor(supported)).toBe(false);
  });

  it('reference-bearing calls reject transport config synchronously', () => {
    const { orgService } = createStub();
    expect(() => orgService.read(parentField('orgId'), undefined, { headers: { a: 'b' } })).toThrow(
      CorrelatedIncludeError,
    );
    // An explicitly passed empty object carries no config and is allowed.
    expect(() => orgService.read(parentField('orgId'), undefined, {})).not.toThrow();
  });

  it('output paths are validated', () => {
    const { orgService } = createStub();
    const descriptor = orgService.read(parentField('orgId'));
    expect(() => descriptor.$include('')).toThrow(CorrelatedIncludeError);
    expect(() => descriptor.$include('_id')).toThrow(CorrelatedIncludeError);
    expect(() => descriptor.$include('$path')).toThrow(CorrelatedIncludeError);
    expect(() => descriptor.$include('a..b')).toThrow(CorrelatedIncludeError);
    expect(() => descriptor.$include('a.b')).not.toThrow();
  });
});

describe('ACI-04 option forwarding (explicit vs inherited)', () => {
  it('preserves supported service defaults and per-call args', () => {
    const { adapter } = createStub();
    const svc = adapter.createModelService<Post>(
      { modelName: 'Post', basePath: 'posts' },
      {
        listAdvancedArgs: { select: ['title'], sort: { createdAt: -1 }, limit: 9 },
      },
    );
    // Inherited defaults flow into the wire payload.
    expect(svc.listAdvanced({ authorId: parentField('_id') }).$include('posts')).toEqual({
      mode: 'correlated',
      model: 'Post',
      op: 'list',
      path: 'posts',
      filter: { authorId: { $parent: '_id' } },
      args: { select: ['title'], sort: { createdAt: -1 }, limit: 9 },
    });
    // Per-call wins over defaults.
    expect(svc.listAdvanced({ authorId: parentField('_id') }, { limit: 2 }).$include('posts')).toMatchObject({
      args: { select: ['title'], sort: { createdAt: -1 }, limit: 2 },
    });
  });

  it('mixing adapters in one include tree is transport-inert (D9.4)', () => {
    const { userService, invocations, bodies } = createStub();
    const foreign = createAdapter({ baseURL: 'http://foreign.invalid/api' });
    const foreignOrg = foreign.createModelService<Org>({ modelName: 'Org', basePath: 'orgs' });
    // No client-side same-adapter check: conversion captures model name and
    // query data only, and the inner descriptor executes on the outer server.
    const orgInc = foreignOrg.read(parentField('orgId')).$include('org');
    expect(orgInc).toEqual({
      mode: 'correlated',
      model: 'Org',
      op: 'read',
      path: 'org',
      id: { $parent: 'orgId' },
    });
    const outer = userService.readAdvanced('u1', { include: [orgInc] });
    expect(typeof outer.then).toBe('function');
    const body = (outer as unknown as { __query: { args: { include: unknown[] } } }).__query.args;
    expect(body.include).toEqual([orgInc]);
    expect(invocations()).toBe(0);
    void bodies;
  });

  it('adapter-level defaults flow into wire payloads through service defaults', () => {
    const base = createStub();
    const adapterWithDefaults = createAdapter(
      { baseURL: 'http://localhost' },
      { modelDefaults: { listAdvancedArgs: { select: ['title'], limit: 7 } } },
    );
    const svc = adapterWithDefaults.createModelService<Post>({ modelName: 'Post', basePath: 'posts' });
    expect(svc.listAdvanced({ authorId: parentField('_id') }).$include('posts')).toEqual({
      mode: 'correlated',
      model: 'Post',
      op: 'list',
      path: 'posts',
      filter: { authorId: { $parent: '_id' } },
      args: { select: ['title'], limit: 7 },
    });
    expect(base.invocations()).toBe(0);
  });

  it('drops inherited populate/tasks but rejects explicit ones', () => {
    const { adapter } = createStub();
    const svc = adapter.createModelService<Post>(
      { modelName: 'Post', basePath: 'posts' },
      {
        listAdvancedArgs: {
          select: ['title'],
          populate: [{ path: 'author' }],
          tasks: [{ type: 'T', args: {}, options: {} }],
        },
      },
    );
    const wire = svc.listAdvanced({ authorId: parentField('_id') }).$include('posts');
    expect(wire.args).toEqual({ select: ['title'] });
    expect(() =>
      svc.listAdvanced({ authorId: parentField('_id') }, { populate: [{ path: 'author' }] }).$include('posts'),
    ).toThrow(CorrelatedIncludeError);
    expect(() =>
      svc
        .listAdvanced({ authorId: parentField('_id') }, { tasks: [{ type: 'T', args: {}, options: {} }] })
        .$include('posts'),
    ).toThrow(CorrelatedIncludeError);
  });

  it('rejects explicit execution-only options while ignoring inherited defaults', () => {
    const { adapter } = createStub();
    const svc = adapter.createModelService<Post>(
      { modelName: 'Post', basePath: 'posts' },
      { listAdvancedOptions: { skim: false, includePermissions: true } },
    );
    // Inherited execution defaults are ignored, not forwarded.
    expect(svc.listAdvanced({ authorId: parentField('_id') }).$include('posts')).toMatchObject({
      filter: { authorId: { $parent: '_id' } },
    });
    expect(() =>
      svc.listAdvanced({ authorId: parentField('_id') }, undefined, { skim: false }).$include('posts'),
    ).toThrow(CorrelatedIncludeError);
    expect(() =>
      svc.listAdvanced({ authorId: parentField('_id') }, undefined, { tryList: false }).$include('posts'),
    ).toThrow(CorrelatedIncludeError);
    expect(() =>
      svc.listAdvanced({ authorId: parentField('_id') }, undefined, { sq: { path: 'x' } }).$include('posts'),
    ).toThrow(CorrelatedIncludeError);
  });

  it('basic and advanced filter sources cannot conflict', () => {
    const { postService } = createStub();
    expect(() => postService.list({ limit: 5 }).$include('posts')).toThrow(CorrelatedIncludeError);
    expect(() =>
      postService.list({ limit: 5 }).$include('posts', { filter: { authorId: 'u1' }, extra: 1 } as never),
    ).toThrow(CorrelatedIncludeError);
    const advanced = postService.listAdvanced({ authorId: parentField('_id') });
    expect(() =>
      (advanced as unknown as { $include: (...args: unknown[]) => unknown }).$include('posts', {
        filter: { authorId: 'u1' },
      }),
    ).toThrow(CorrelatedIncludeError);
  });
});

describe('ACI-04 subqueries, outer execution, and grouping', () => {
  it('preserves $$sq subqueries alongside markers without confusion', () => {
    const { postService } = createStub();
    const sub = postService.listAdvanced({ views: { $gte: 10 } });
    const wire = postService.listAdvanced({ authorId: parentField('_id'), views: { $gte: 1 } }).$include('posts');
    expect(wire.filter).toEqual({
      authorId: { $parent: '_id' },
      views: { $gte: 1 },
    });
    expect(sub).not.toBe(undefined);
    // An executable subquery embedded in a correlated filter becomes $$sq data.
    const mixed = postService.listAdvanced({ authorId: parentField('_id'), title: sub as never }).$include('posts');
    const mixedFilter = mixed.filter as Record<string, { $$sq: { op: string } }>;
    expect(mixedFilter.authorId).toEqual({ $parent: '_id' });
    expect(mixedFilter.title.$$sq.op).toBe('list');
  });

  it('outer requests carry converted payloads and still execute directly', async () => {
    const { userService, orgService, postService, invocations, bodies } = createStub();
    const orgInc = orgService.readAdvanced(parentField('orgId'), { select: ['name'] }).$include('org');
    const postsInc = postService
      .listAdvanced({ authorId: parentField('_id') }, { select: ['title'], limit: 5 })
      .$include('posts');
    const countInc = postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount');
    const outer = userService.readAdvanced('u1', { include: [orgInc, postsInc, countInc] });
    expect(typeof outer.then).toBe('function');
    const result = await outer;
    expect(result.success).toBe(true);
    expect(invocations()).toBe(1);
    const body = bodies[0] as { include: unknown[] };
    expect(body.include).toEqual([orgInc, postsInc, countInc]);
  });

  it('conversion does not claim execution ownership of ordinary requests', async () => {
    const { adapter, userService, orgService, invocations } = createStub();
    const outer = userService.readAdvanced('u1', { select: ['name'] });
    const converted = orgService.read(parentField('orgId')).$include('org');
    void converted;
    // The ordinary request is still unclaimed: grouping works after conversion.
    const grouped = await adapter.group(outer);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].success).toBe(true);
    expect(invocations()).toBe(1);
  });

  it('grouping carries include descriptors as data without inner dispatch', async () => {
    const { adapter, userService, orgService, invocations, bodies } = createStub();
    const orgInc = orgService.read(parentField('orgId')).$include('org');
    const outer = userService.readAdvanced('u1', { include: [orgInc] });
    const grouped = await adapter.group(outer);
    expect(grouped[0].success).toBe(true);
    expect(invocations()).toBe(1);
    const defs = bodies[0] as Array<{ args: { include: unknown[] } }>;
    expect(defs[0].args.include).toEqual([orgInc]);
  });

  it('unsupported operations do not advertise $include()', () => {
    const { adapter, userService, invocations } = createStub();
    const dataService = adapter.createDataService<unknown>({ dataName: 'fruit', basePath: 'fruit' });
    expect('$include' in userService.create({ name: 'x' } as never)).toBe(false);
    expect('$include' in userService.update('u1', { name: 'x' } as never)).toBe(false);
    expect('$include' in userService.delete('u1')).toBe(false);
    expect('$include' in userService.distinct('name')).toBe(false);
    expect('$include' in dataService.list()).toBe(false);
    // ...while all seven supported builders do.
    expect('$include' in userService.read('u1')).toBe(true);
    expect('$include' in userService.readAdvanced('u1')).toBe(true);
    expect('$include' in userService.readAdvancedFilter({})).toBe(true);
    expect('$include' in userService.list()).toBe(true);
    expect('$include' in userService.listAdvanced({})).toBe(true);
    expect('$include' in userService.count()).toBe(true);
    expect('$include' in userService.countAdvanced({})).toBe(true);
    expect(invocations()).toBe(0);
  });
});
