import { describe, expect, it } from 'vitest';
import { includeSchema } from '../src/validation/common.ts';
import {
  countBodySchema,
  listBodySchema,
  readByIdBodySchema,
  readFilterBodySchema,
} from '../src/validation/model-router.ts';
import { rootQuerySchema } from '../src/validation/root-router.ts';

const parentRef = (path: string) => ({ $parent: path });

const readById = (overrides: Record<string, unknown> = {}) => ({
  mode: 'correlated',
  model: 'Org',
  op: 'read',
  path: 'org',
  id: parentRef('orgId'),
  ...overrides,
});

const filterInclude = (op: string, path: string, filter: unknown, extra: Record<string, unknown> = {}) => ({
  mode: 'correlated',
  model: 'Post',
  op,
  path,
  filter,
  ...extra,
});

const legacyInclude = (overrides: Record<string, unknown> = {}) => ({
  model: 'Post',
  op: 'list',
  path: 'posts',
  localField: 'orgId',
  foreignField: 'ownerId',
  ...overrides,
});

/** Both direct (model-router) and root validators must agree on every payload. */
const expectAgreement = (include: unknown, valid: boolean) => {
  const direct = [
    listBodySchema.safeParse({ include }),
    readFilterBodySchema.safeParse({ filter: {}, include }),
    readByIdBodySchema.safeParse({ include }),
  ];
  const root = [
    rootQuerySchema.safeParse([{ target: 'model', name: 'User', op: 'list', args: { include } }]),
    rootQuerySchema.safeParse([{ target: 'model', name: 'User', op: 'read', id: 'u1', args: { include } }]),
    rootQuerySchema.safeParse([{ target: 'model', name: 'User', op: 'read', filter: {}, args: { include } }]),
  ];
  for (const result of [...direct, ...root]) {
    expect(result.success).toBe(valid);
  }
};

describe('correlated include protocol validation (ACI-02)', () => {
  it('accepts all four correlated wire shapes in direct and root validators', () => {
    expectAgreement(readById(), true);
    expectAgreement(
      filterInclude('read', 'org', { _id: parentRef('orgId'), active: true }, { args: { select: ['name'] } }),
      true,
    );
    expectAgreement(
      filterInclude(
        'list',
        'posts',
        { authorId: parentRef('_id'), reviewerId: parentRef('managerId'), title: '$special' },
        { args: { select: ['title'], sort: { createdAt: -1 }, limit: 5 } },
      ),
      true,
    );
    expectAgreement(filterInclude('count', 'postCount', { authorId: parentRef('_id') }), true);
  });

  it('keeps legacy includes compatible', () => {
    expectAgreement(legacyInclude(), true);
    expectAgreement(legacyInclude({ mode: 'legacy' }), true);
    expectAgreement([legacyInclude(), readById({ path: 'org2' })], true);
  });

  it('rejects correlated entries carrying legacy join fields', () => {
    expectAgreement(readById({ localField: 'orgId', foreignField: 'ownerId' }), false);
    expectAgreement(
      filterInclude('list', 'posts', { authorId: parentRef('_id') }, { localField: 'x', foreignField: 'y' } as never),
      false,
    );
  });

  it('rejects legacy-shaped entries carrying $parent markers', () => {
    expectAgreement(legacyInclude({ filter: { ownerId: parentRef('orgId') } }), false);
    expectAgreement(legacyInclude({ filter: { $and: [{ ownerId: parentRef('orgId') }] } }), false);
  });

  it('rejects malformed markers and malformed escapes', () => {
    expectAgreement(readById({ id: { $parent: '' } }), false);
    expectAgreement(readById({ id: { $parent: 42 } }), false);
    expectAgreement(readById({ id: { $parent: 'a', extra: true } }), false);
    expectAgreement(filterInclude('list', 'posts', { authorId: { $parent: '__proto__' } }), false);
    expectAgreement(filterInclude('list', 'posts', { authorId: { $parent: 'a.constructor' } }), false);
    expectAgreement(filterInclude('list', 'posts', { note: { $escape: { $parent: 7 } } }), false);
    expectAgreement(filterInclude('list', 'posts', { note: { $escape: 'x' } }), false);
    expectAgreement(filterInclude('list', 'posts', { note: { $parent: 'x', other: 1 } }), false);
  });

  it('accepts the literal-object escape and dotted paths', () => {
    expectAgreement(filterInclude('list', 'posts', { note: { $escape: { $parent: 'x' } } }), true);
    expectAgreement(filterInclude('list', 'posts', { authorId: parentRef('a.b.c') }), true);
  });

  it('rejects markers in forbidden positions', () => {
    // inside $$sq payloads
    expectAgreement(
      filterInclude('list', 'posts', { authorId: { $$sq: { model: 'Post', filter: { x: parentRef('_id') } } } }),
      false,
    );
    // inside $text/$where values
    expectAgreement(filterInclude('list', 'posts', { $text: { $search: parentRef('_id') } }), false);
    // in sort/select args
    expectAgreement(
      filterInclude('list', 'posts', { authorId: parentRef('_id') }, { args: { sort: parentRef('_id') } } as never),
      false,
    );
    expectAgreement(
      filterInclude('read', 'org', { _id: parentRef('orgId') }, { args: { select: [parentRef('x')] } } as never),
      false,
    );
    // as direct $and clauses and $elemMatch values
    expectAgreement(filterInclude('list', 'posts', { $and: [parentRef('_id')] }), false);
    expectAgreement(filterInclude('list', 'posts', { tags: { $elemMatch: parentRef('_id') } }), false);
    // $parent as an object key is never a marker
    expectAgreement(filterInclude('list', 'posts', { $parent: 'x' }), false);
  });

  it('accepts markers in supported logical and operator positions', () => {
    expectAgreement(
      filterInclude('list', 'posts', {
        $and: [{ authorId: parentRef('_id') }, { reviewerId: parentRef('managerId') }],
        $or: [{ title: 'a' }, { title: parentRef('preferredTitle') }],
      }),
      true,
    );
    expectAgreement(filterInclude('list', 'posts', { authorId: { $in: parentRef('memberIds') } }), true);
    expectAgreement(filterInclude('list', 'posts', { authorId: { $in: [parentRef('a'), 'literal'] } }), true);
    expectAgreement(
      filterInclude('list', 'posts', {
        age: { $gte: parentRef('minAge') },
        tags: { $elemMatch: { tag: parentRef('t') } },
      }),
      true,
    );
  });

  it('enforces id/filter exclusivity and op-specific args', () => {
    // read with both id and filter, or neither
    expectAgreement({ ...readById(), filter: { _id: parentRef('orgId') } }, false);
    expectAgreement({ mode: 'correlated', model: 'Org', op: 'read', path: 'org' }, false);
    // list/count require a filter and no id
    expectAgreement({ mode: 'correlated', model: 'Post', op: 'list', path: 'p', id: 'x' }, false);
    expectAgreement({ mode: 'correlated', model: 'Post', op: 'count', path: 'c', id: 'x' }, false);
    expectAgreement({ mode: 'correlated', model: 'Post', op: 'count', path: 'c' }, false);
    // count accepts no args; reads reject pagination args; lists reject populate/tasks
    expectAgreement(filterInclude('count', 'c', { a: parentRef('b') }, { args: { limit: 1 } }), false);
    expectAgreement(readById({ args: { limit: 1 } } as never), false);
    expectAgreement(filterInclude('list', 'posts', { a: parentRef('b') }, { args: { populate: 'x' } } as never), false);
    expectAgreement(filterInclude('list', 'posts', { a: parentRef('b') }, { args: { tasks: [] } } as never), false);
    // non-empty wire options are rejected
    expectAgreement(readById({ options: { lean: true } }), false);
    expectAgreement(readById({ options: {} }), true);
  });

  it('validates output paths and rejects duplicates', () => {
    expectAgreement(readById({ path: '_id' }), false);
    expectAgreement(readById({ path: '$org' }), false);
    expectAgreement(readById({ path: '' }), false);
    expectAgreement(readById({ path: 'not a path!' }), false);
    const duplicate = [readById({ path: 'org' }), readById({ path: 'org' })];
    expect(includeSchema.safeParse(duplicate).success).toBe(false);
    expect(
      rootQuerySchema.safeParse([{ target: 'model', name: 'User', op: 'list', args: { include: duplicate } }]).success,
    ).toBe(false);
  });

  it('rejects unknown models of malformed correlated input instead of treating them as legacy', () => {
    // missing model/op/path, bad op, empty id
    expectAgreement({ mode: 'correlated', op: 'read', path: 'org', id: 'x' }, false);
    expectAgreement({ mode: 'correlated', model: 'Org', op: 'fetch', path: 'org', id: 'x' }, false);
    expectAgreement({ mode: 'correlated', model: 'Org', op: 'read', id: 'x' }, false);
    expectAgreement(readById({ id: '' }), false);
    expectAgreement(readById({ id: 42 }), false);
  });

  it('rejects include on direct count parents', () => {
    expect(countBodySchema.safeParse({ filter: {}, include: [readById()] }).success).toBe(false);
    expect(countBodySchema.safeParse({ filter: {} }).success).toBe(true);
  });

  it('accepts nested correlated includes inside args', () => {
    const nested = filterInclude(
      'list',
      'posts',
      { authorId: parentRef('_id') },
      {
        args: {
          select: ['title'],
          include: [readById({ model: 'User', path: 'reviewer', id: parentRef('reviewerId') })],
        },
      },
    );
    expectAgreement(nested, true);
  });
});
