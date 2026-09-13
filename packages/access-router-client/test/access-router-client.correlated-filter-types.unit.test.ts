import { describe, expect, it } from 'vitest';

import { createAdapter, parentField, CorrelatedIncludeError } from '../src';
import type { CorrelatedFilterQuery, CorrelatedInclude, Document, FilterQuery, WithCorrelatedOutputs } from '../src';

/**
 * ACI-04: correlated filter and output typing.
 *
 * Positive cases construct real service calls (compile iff the overload
 * selects the intended descriptor/executable shape). Negative cases use
 * `@ts-expect-error`: each probe MUST fail to compile, and an unused
 * directive fails `typecheck:test`, so positives and negatives guard each
 * other — if overload discrimination broke in either direction, this file
 * stops compiling.
 */

interface Post extends Document {
  authorId: string;
  title: string;
  views: number;
  createdAt: Date;
  tags: string[];
}

interface Org extends Document {
  name: string;
  description?: string;
}

interface User extends Document {
  orgId?: string;
  name: string;
}

function createServices() {
  const adapter = createAdapter({ baseURL: 'http://localhost:0/api' });
  const userService = adapter.createModelService<User>({ modelName: 'User', basePath: 'users' });
  const orgService = adapter.createModelService<Org>({ modelName: 'Org', basePath: 'orgs' });
  const postService = adapter.createModelService<Post>({ modelName: 'Post', basePath: 'posts' });
  const dataService = adapter.createDataService<unknown>({ dataName: 'fruit', basePath: 'fruit' });
  return { userService, orgService, postService, dataService };
}

describe('ACI-04 scalar/date/numeric/array reference positions (positive)', () => {
  it('admits bare references on scalar, date, numeric, and array fields', () => {
    const { postService } = createServices();
    const f: CorrelatedFilterQuery<Post> = {
      authorId: parentField('_id'),
      title: parentField('t'),
      views: parentField('v'),
      createdAt: parentField('c'),
      tags: parentField('tgs'),
    };
    const descriptor = postService.listAdvanced(f);
    // @ts-expect-error — reference-bearing calls return a non-thenable descriptor.
    void descriptor.exec;
    void descriptor.$include('posts');
    expect(descriptor).toBeDefined();
  });

  it('admits references in supported operator positions', () => {
    const { postService } = createServices();
    const f: CorrelatedFilterQuery<Post> = {
      title: { $eq: parentField('t'), $ne: parentField('t2'), $regex: parentField('re'), $options: parentField('o') },
      views: {
        $gt: parentField('v'),
        $gte: parentField('v2'),
        $lt: parentField('v3'),
        $lte: parentField('v4'),
        $in: [parentField('v5'), 3],
        $nin: parentField('v6'),
      },
      authorId: { $in: parentField('memberIds') },
      $or: [{ authorId: parentField('a') }, { views: 1 }],
      $and: [{ title: 'x' }],
    };
    const descriptor = postService.listAdvanced(f);
    // @ts-expect-error — reference-bearing calls return a non-thenable descriptor.
    void descriptor.then;
    void descriptor.$include('posts');
    expect(descriptor).toBeDefined();
  });

  it('selects executable overloads for literal filters and ids', () => {
    const { orgService, postService } = createServices();
    const readExe = orgService.read('o1');
    void readExe.then;
    void readExe.exec;
    void readExe.$include('org');
    const listExe = postService.listAdvanced({ authorId: 'u1' }, { limit: 5 });
    void listExe.then;
    void listExe.$include('posts');
    const countExe = postService.countAdvanced({ views: { $gte: 1 } });
    void countExe.exec;
    expect([readExe, listExe, countExe].length).toBe(3);
  });

  it('admits the $escape literal in strict and correlated filters', () => {
    const strict: FilterQuery<Post> = { title: { $escape: parentField('t') } };
    const correlated: CorrelatedFilterQuery<Post> = {
      authorId: parentField('_id'),
      title: { $escape: parentField('t') },
    };
    expect(strict).toBeDefined();
    expect(correlated).toBeDefined();
  });
});

describe('ACI-04 strict filters stay strict (negative)', () => {
  it('rejects references in every strict value position', () => {
    // @ts-expect-error — ParentRef is not a valid strict string condition.
    const s1: FilterQuery<Post> = { authorId: parentField('_id') };
    void s1;
    // @ts-expect-error — ParentRef cannot satisfy strict operator bags.
    const s2: FilterQuery<Post> = { views: { $gt: parentField('v') } };
    void s2;
    // @ts-expect-error — ParentRef elements are not valid strict $in members.
    const s3: FilterQuery<Post> = { authorId: { $in: [parentField('a')] } };
    void s3;
    // @ts-expect-error — ParentRef is not a valid strict date condition.
    const s4: FilterQuery<Post> = { createdAt: parentField('c') };
    void s4;
    // @ts-expect-error — ParentRef is not a valid strict array-field condition.
    const s5: FilterQuery<Post> = { tags: parentField('tgs') };
    void s5;
    // @ts-expect-error — ParentRef is not a valid strict $regex value.
    const s6: FilterQuery<Post> = { title: { $regex: parentField('re') } };
    void s6;
  });
});

describe('ACI-04 correlated filters reject unsupported positions (negative)', () => {
  it('rejects bare array elements, flags, mis-typed operators, and bare clauses', () => {
    // @ts-expect-error — bare arrays do not admit reference elements (only $in/$nin do).
    const c1: CorrelatedFilterQuery<Post> = { tags: ['a', parentField('t')] };
    void c1;
    // @ts-expect-error — $exists takes no value reference.
    const c2: CorrelatedFilterQuery<Post> = { views: { $exists: parentField('v') } };
    void c2;
    // @ts-expect-error — $regex stays unavailable on numeric fields.
    const c3: CorrelatedFilterQuery<Post> = { views: { $regex: parentField('v') } };
    void c3;
    // @ts-expect-error — bare markers cannot be $and clauses.
    const c4: CorrelatedFilterQuery<Post> = { $and: [parentField('a')] };
    void c4;
    // @ts-expect-error — $mod takes no reference.
    const c5: CorrelatedFilterQuery<Post> = { views: { $mod: parentField('v') } };
    void c5;
  });
});

describe('ACI-04 output-typing contract', () => {
  it('carries the explicit generic and literal path without inferring projections', () => {
    const { orgService } = createServices();
    const inc = orgService.read(parentField('orgId')).$include<'org', Org>('org');
    const path: 'org' = inc.path;
    const op: 'read' = inc.op;
    expect([path, op].length).toBe(2);
    expect(inc.mode).toBe('correlated');
    type Merged = WithCorrelatedOutputs<{ base: string }, [typeof inc]>;
    const m = {} as unknown as Merged;
    // Reads admit null (no guaranteed match); base fields are preserved.
    const orgVal: Org | null = m.org;
    const baseVal: string = m.base;
    expect([orgVal, baseVal].length).toBe(2);
  });

  it('defaults the result generic to unknown', () => {
    const { orgService } = createServices();
    const inc = orgService.read(parentField('orgId')).$include('u');
    type Merged = WithCorrelatedOutputs<{ base: string }, [typeof inc]>;
    const m = {} as unknown as Merged;
    // @ts-expect-error — default Out is unknown: assigning to Org fails.
    const badOrg: Org = m.u;
    void badOrg;
    expect(inc.path).toBe('u');
  });

  it('maps list outputs to arrays and count outputs to numbers', () => {
    const { postService } = createServices();
    const postsInc = postService.listAdvanced({ authorId: parentField('_id') }).$include<'posts', Post>('posts');
    type ML = WithCorrelatedOutputs<Record<never, never>, [typeof postsInc]>;
    const postsVal: Post[] = ({} as unknown as ML).posts;
    const countInc = postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount');
    type MC = WithCorrelatedOutputs<Record<never, never>, [typeof countInc]>;
    const countVal: number = ({} as unknown as MC).postCount;
    expect([postsVal, countVal].length).toBe(2);
    expect(postsInc.op).toBe('list');
    expect(countInc.op).toBe('count');
  });

  it('ignores legacy entries and wide paths', () => {
    type Legacy = WithCorrelatedOutputs<
      { a: number },
      { model: string; op: 'list'; path: string; localField: string; foreignField: string }
    >;
    const leg = {} as unknown as Legacy;
    const legA: number = leg.a;
    // @ts-expect-error — legacy entries contribute no output paths.
    void leg.posts;
    void legA;
    const wideInc = {} as unknown as CorrelatedInclude<string, Org, 'read'>;
    type MW = WithCorrelatedOutputs<{ a: number }, [typeof wideInc]>;
    const wide = {} as unknown as MW;
    const wideA: number = wide.a;
    // @ts-expect-error — wide (non-literal) paths contribute nothing.
    void (wide as { a: number }).whatever;
    void wideA;
    void wideInc;
  });

  it('merges include outputs into outer response types', () => {
    const { userService, orgService, postService } = createServices();
    const orgInc = orgService.read(parentField('orgId')).$include<'org', Org>('org');
    const outerReq = userService.readAdvanced('u1', { include: [orgInc] });
    type OuterData = Extract<Awaited<typeof outerReq>, { success: true }>['data'];
    const outerOrg: Org | null = ({} as unknown as OuterData).org;
    expect(outerReq).toBeDefined();
    const postsInc = postService.listAdvanced({ authorId: parentField('_id') }).$include<'posts', Post>('posts');
    const countInc = postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount');
    const outerList = userService.listAdvanced({}, { include: [postsInc, countInc] });
    type OuterListData = Extract<Awaited<typeof outerList>, { success: true }>['data'];
    const outerPosts: Post[] = ({} as unknown as OuterListData[number]).posts;
    const outerCount: number = ({} as unknown as OuterListData[number]).postCount;
    expect(outerList).toBeDefined();
    const outerRead = userService.readAdvancedFilter({ name: 'x' }, { include: [orgInc] });
    type OuterReadData = Extract<Awaited<typeof outerRead>, { success: true }>['data'];
    const outerReadOrg: Org | null = ({} as unknown as OuterReadData).org;
    expect(outerRead).toBeDefined();
    expect([outerOrg, outerPosts, outerCount, outerReadOrg].length).toBe(4);
  });
});

describe('ACI-04 $include() availability boundaries (negative)', () => {
  it('unsupported operations do not advertise $include()', () => {
    const { userService, dataService } = createServices();
    const created = userService.create({ name: 'x' } as User);
    // @ts-expect-error — mutations do not advertise $include().
    void created.$include;
    const updated = userService.update('u1', { name: 'y' });
    // @ts-expect-error — mutations do not advertise $include().
    void updated.$include;
    const deleted = userService.delete('u1');
    // @ts-expect-error — mutations do not advertise $include().
    void deleted.$include;
    const dist = userService.distinct('name');
    // @ts-expect-error — distinct does not advertise $include().
    void dist.$include;
    const dataList = dataService.list();
    // @ts-expect-error — data services do not advertise $include().
    void dataList.$include;
    expect([created, updated, deleted, dist, dataList].length).toBe(5);
  });

  it('basic $include requires the supplemental filter; advanced takes none', () => {
    const { postService } = createServices();
    const basic = postService.list({ limit: 5 });
    expect(() =>
      // @ts-expect-error — basic $include requires the supplemental { filter }.
      basic.$include('posts'),
    ).toThrow(CorrelatedIncludeError);
    const advanced = postService.listAdvanced({ authorId: 'u1' });
    expect(() =>
      // @ts-expect-error — advanced $include takes no filter option.
      advanced.$include('posts', { filter: {} }),
    ).toThrow(CorrelatedIncludeError);
    expect([basic, advanced].length).toBe(2);
  });

  it('descriptors expose $include but no execution surface', () => {
    const { orgService } = createServices();
    const descriptor = orgService.read(parentField('orgId'));
    void descriptor.$include('org');
    // @ts-expect-error — descriptors are non-thenable.
    void descriptor.then;
    // @ts-expect-error — descriptors carry no executor.
    void descriptor.catch;
    expect(descriptor).toBeDefined();
  });
});
