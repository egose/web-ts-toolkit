/**
 * ACI-04: correlated-include type fixtures (compile-enforced).
 *
 * This file is compiled — never executed — by `typecheck:test`
 * (`tsconfig.test-typecheck.json`, strict). Every `@ts-expect-error` below
 * MUST genuinely fail to compile; an unused directive fails the check, so
 * positive and negative cases guard each other: if overload discrimination
 * broke in either direction (reference-bearing filters mistyped as
 * executable, or literals mistyped as descriptors), this fixture stops
 * compiling.
 *
 * Runtime behavior lives in
 * `test/access-router-client.correlated-includes.unit.test.ts` and
 * `test/access-router-client.correlated-filter-types.unit.test.ts`.
 */
import { parentField } from '../src';
import type {
  CorrelatedFilterQuery,
  CorrelatedInclude,
  Document,
  FilterQuery,
  ModelService,
  WithCorrelatedOutputs,
} from '../src';

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

declare const userService: ModelService<User>;
declare const orgService: ModelService<Org>;
declare const postService: ModelService<Post>;

// ---------------------------------------------------------------------------
// Reference positions: scalar / date / numeric / array (positive).
// ---------------------------------------------------------------------------

const scalarDateNumericArray: CorrelatedFilterQuery<Post> = {
  authorId: parentField('_id'),
  title: parentField('t'),
  views: parentField('v'),
  createdAt: parentField('c'),
  tags: parentField('tgs'),
};
void scalarDateNumericArray;

const operatorPositions: CorrelatedFilterQuery<Post> = {
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
void operatorPositions;

// Reference-bearing calls select the descriptor overloads.
const listDescriptor = postService.listAdvanced({ authorId: parentField('_id') });
// @ts-expect-error — reference-bearing calls return a non-thenable descriptor, not an executable request.
void listDescriptor.exec;
void listDescriptor.$include('posts');

const readDescriptor = orgService.read(parentField('orgId'));
// @ts-expect-error — descriptors are non-thenable.
void readDescriptor.then;
// @ts-expect-error — descriptors carry no executor.
void readDescriptor.catch;
void readDescriptor.$include('org');

const countDescriptor = postService.countAdvanced({ views: { $gte: parentField('v') } });
// @ts-expect-error — reference-bearing calls return a non-thenable descriptor.
void countDescriptor.exec;
void countDescriptor.$include('postCount');

// Literal calls keep the executable overloads.
const readExecutable = orgService.read('o1');
void readExecutable.then;
void readExecutable.exec;
void readExecutable.$include('org');

const listExecutable = postService.listAdvanced({ authorId: 'u1' }, { limit: 5 });
void listExecutable.then;
void listExecutable.$include('posts');

// Escapes are data, not references: admitted in strict and correlated filters.
const escapeStrict: FilterQuery<Post> = { title: { $escape: parentField('t') } };
void escapeStrict;
const escapeCorrelated: CorrelatedFilterQuery<Post> = {
  authorId: parentField('_id'),
  title: { $escape: parentField('t') },
};
void escapeCorrelated;

// ---------------------------------------------------------------------------
// Strict filters stay strict (negative).
// ---------------------------------------------------------------------------

// @ts-expect-error — ParentRef is not a valid strict string condition.
const strict1: FilterQuery<Post> = { authorId: parentField('_id') };
void strict1;
// @ts-expect-error — ParentRef cannot satisfy strict operator bags.
const strict2: FilterQuery<Post> = { views: { $gt: parentField('v') } };
void strict2;
// @ts-expect-error — ParentRef elements are not valid strict $in members.
const strict3: FilterQuery<Post> = { authorId: { $in: [parentField('a')] } };
void strict3;
// @ts-expect-error — ParentRef is not a valid strict date condition.
const strict4: FilterQuery<Post> = { createdAt: parentField('c') };
void strict4;
// @ts-expect-error — ParentRef is not a valid strict array-field condition.
const strict5: FilterQuery<Post> = { tags: parentField('tgs') };
void strict5;
// @ts-expect-error — ParentRef is not a valid strict $regex value.
const strict6: FilterQuery<Post> = { title: { $regex: parentField('re') } };
void strict6;

// ---------------------------------------------------------------------------
// Correlated filters reject unsupported positions (negative).
// ---------------------------------------------------------------------------

// @ts-expect-error — bare arrays do not admit reference elements (only $in/$nin do).
const correlated1: CorrelatedFilterQuery<Post> = { tags: ['a', parentField('t')] };
void correlated1;
// @ts-expect-error — $exists takes no value reference.
const correlated2: CorrelatedFilterQuery<Post> = { views: { $exists: parentField('v') } };
void correlated2;
// @ts-expect-error — $regex stays unavailable on numeric fields.
const correlated3: CorrelatedFilterQuery<Post> = { views: { $regex: parentField('v') } };
void correlated3;
// @ts-expect-error — bare markers cannot be $and clauses.
const correlated4: CorrelatedFilterQuery<Post> = { $and: [parentField('a')] };
void correlated4;
// @ts-expect-error — $mod takes no reference.
const correlated5: CorrelatedFilterQuery<Post> = { views: { $mod: parentField('v') } };
void correlated5;

// ---------------------------------------------------------------------------
// Output-typing contract (ACI-01 D10).
// ---------------------------------------------------------------------------

const orgInc = orgService.read(parentField('orgId')).$include<'org', Org>('org');
const orgPath: 'org' = orgInc.path;
void orgPath;
const orgOp: 'read' = orgInc.op;
void orgOp;

type MergedOrg = WithCorrelatedOutputs<{ base: string }, [typeof orgInc]>;
declare const mergedOrg: MergedOrg;
// Reads admit null (no guaranteed match); base fields are preserved.
const mergedOrgValue: Org | null = mergedOrg.org;
const mergedBaseValue: string = mergedOrg.base;
void mergedOrgValue;
void mergedBaseValue;

const unknownInc = orgService.read(parentField('orgId')).$include('u');
void unknownInc;
type MergedUnknown = WithCorrelatedOutputs<{ base: string }, [typeof unknownInc]>;
declare const mergedUnknown: MergedUnknown;
void mergedUnknown;
// @ts-expect-error — the default result generic is unknown: assigning to Org fails.
const defaultGenericIsUnknown: Org = mergedUnknown.u;
void defaultGenericIsUnknown;

const postsInc = postService.listAdvanced({ authorId: parentField('_id') }).$include<'posts', Post>('posts');
type MergedList = WithCorrelatedOutputs<Record<never, never>, [typeof postsInc]>;
declare const mergedList: MergedList;
const listOutputIsArray: Post[] = mergedList.posts;
void listOutputIsArray;

const countInc = postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount');
type MergedCount = WithCorrelatedOutputs<Record<never, never>, [typeof countInc]>;
declare const mergedCount: MergedCount;
const countOutputIsNumber: number = mergedCount.postCount;
void countOutputIsNumber;

type LegacyMerged = WithCorrelatedOutputs<
  { a: number },
  { model: string; op: 'list'; path: string; localField: string; foreignField: string }
>;
declare const legacyMerged: LegacyMerged;
const legacyBase: number = legacyMerged.a;
void legacyBase;
// @ts-expect-error — legacy entries contribute no output paths.
void legacyMerged.posts;

declare const wideInc: CorrelatedInclude<string, Org, 'read'>;
void wideInc;
type WideMerged = WithCorrelatedOutputs<{ a: number }, [typeof wideInc]>;
declare const wideMerged: WideMerged;
void wideMerged;
const wideBase: number = wideMerged.a;
void wideBase;
// @ts-expect-error — wide (non-literal) paths contribute nothing.
void (wideMerged as { a: number }).whatever;

// Outer response types gain the output paths.
const outerReadReq = userService.readAdvanced('u1', { include: [orgInc] });
void outerReadReq;
type OuterReadData = Extract<Awaited<typeof outerReadReq>, { success: true }>['data'];
declare const outerReadData: OuterReadData;
const outerOrg: Org | null = outerReadData.org;
void outerOrg;

const outerListReq = userService.listAdvanced({}, { include: [postsInc, countInc] });
void outerListReq;
type OuterListElement = Extract<Awaited<typeof outerListReq>, { success: true }>['data'][number];
declare const outerListElement: OuterListElement;
const outerPosts: Post[] = outerListElement.posts;
const outerCount: number = outerListElement.postCount;
void outerPosts;
void outerCount;

const outerFilterReq = userService.readAdvancedFilter({ name: 'x' }, { include: [orgInc] });
void outerFilterReq;
type OuterFilterData = Extract<Awaited<typeof outerFilterReq>, { success: true }>['data'];
declare const outerFilterData: OuterFilterData;
const outerFilterOrg: Org | null = outerFilterData.org;
void outerFilterOrg;

// ---------------------------------------------------------------------------
// $include() availability boundaries (negative).
// ---------------------------------------------------------------------------

const createdUnsupported = userService.create({ name: 'x' });
// @ts-expect-error — mutations do not advertise $include().
void createdUnsupported.$include;

const updatedUnsupported = userService.update('u1', { name: 'y' });
// @ts-expect-error — mutations do not advertise $include().
void updatedUnsupported.$include;

const deletedUnsupported = userService.delete('u1');
// @ts-expect-error — mutations do not advertise $include().
void deletedUnsupported.$include;

const distinctUnsupported = userService.distinct('name');
// @ts-expect-error — distinct does not advertise $include().
void distinctUnsupported.$include;

// Basic $include requires the supplemental filter; advanced takes none.
const basicListReq = postService.list({ limit: 5 });
// @ts-expect-error — basic $include requires the supplemental { filter }.
void basicListReq.$include('posts');

const advancedListReq = postService.listAdvanced({ authorId: 'u1' });
// @ts-expect-error — advanced $include takes no filter option.
void advancedListReq.$include('posts', { filter: {} });
