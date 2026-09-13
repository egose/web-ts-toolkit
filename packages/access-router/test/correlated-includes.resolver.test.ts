import { describe, expect, it } from 'vitest';
import type { ModelRequest } from '../src/interfaces/index.ts';
import { Base } from '../src/services/base.ts';
import {
  collectCorrelatedReferencePaths,
  CorrelatedReferenceError,
  isCorrelatedInclude,
  resolveCorrelatedFilterTemplate,
  resolveCorrelatedIdTemplate,
  validateExpandedCorrelatedOperands,
} from '../src/correlated-includes.ts';

const parentRef = (path: string) => ({ $parent: path });

class ProcessBase extends Base {
  process(include: unknown) {
    return this.processInclude(include as never);
  }

  includeDocsFor(docs: unknown, include: unknown) {
    return this.includeDocs(docs, include as never);
  }
}

const base = new ProcessBase({ macl: {} } as ModelRequest, 'User');

const processDetail = (include: unknown): string => {
  try {
    base.process(include);
  } catch (error) {
    const result = (error as { result?: { code?: unknown; errors?: Array<{ detail?: string }> } }).result;
    return `${String(result?.code)}: ${(result?.errors ?? []).map((entry) => entry.detail).join('; ')}`;
  }
  return 'no-error';
};

describe('correlated reference resolution (ACI-02)', () => {
  it('resolves bare, operator, and multiple references while preserving literals', () => {
    const result = resolveCorrelatedFilterTemplate(
      {
        authorId: parentRef('_id'),
        reviewerId: parentRef('managerId'),
        title: '$special',
        age: { $gte: parentRef('minAge') },
      },
      { _id: 'u1', managerId: 'm1', minAge: 18 },
    );
    expect(result).toEqual({
      status: 'resolved',
      filter: { authorId: 'u1', reviewerId: 'm1', title: '$special', age: { $gte: 18 } },
    });
  });

  it('resolves inside $and/$or clauses and explicit $in positions', () => {
    const result = resolveCorrelatedFilterTemplate(
      {
        $and: [{ authorId: parentRef('_id') }, { active: true }],
        $or: [{ reviewerId: parentRef('managerId') }, { title: 'fallback' }],
        authorId2: { $in: parentRef('memberIds') },
        mixed: { $in: [parentRef('a'), 'literal', 7] },
      },
      { _id: 'u1', managerId: 'm1', memberIds: ['x', 'y'], a: 'z' },
    );
    expect(result).toEqual({
      status: 'resolved',
      filter: {
        $and: [{ authorId: 'u1' }, { active: true }],
        $or: [{ reviewerId: 'm1' }, { title: 'fallback' }],
        authorId2: { $in: ['x', 'y'] },
        mixed: { $in: ['z', 'literal', 7] },
      },
    });
  });

  it('resolves dotted paths and passes arrays through without flattening', () => {
    const resolved = resolveCorrelatedFilterTemplate(
      { org: parentRef('a.b.c'), tag: parentRef('tags'), wrapped: { $in: [parentRef('tags')] } },
      { a: { b: { c: 'deep' } }, tags: ['t1', 't2'] },
    );
    expect(resolved).toEqual({
      status: 'resolved',
      filter: { org: 'deep', tag: ['t1', 't2'], wrapped: { $in: [['t1', 't2']] } },
    });
  });

  it('applies the literal-object escape precisely', () => {
    const resolved = resolveCorrelatedFilterTemplate(
      { note: { $escape: parentRef('x') }, authorId: parentRef('_id') },
      { _id: 'u1', x: 'ignored' },
    );
    expect(resolved).toEqual({
      status: 'resolved',
      filter: { note: { $parent: 'x' }, authorId: 'u1' },
    });
    // The escaped literal is fresh output, not the template object.
    expect((resolved as { filter: { note: unknown } }).filter.note).not.toBe(parentRef('x'));
  });

  it('treats missing and null references as unresolvable and short-circuits', () => {
    expect(resolveCorrelatedFilterTemplate({ authorId: parentRef('missing') }, { _id: 'u1' })).toEqual({
      status: 'unresolvable',
    });
    expect(resolveCorrelatedFilterTemplate({ authorId: parentRef('orgId') }, { orgId: null })).toEqual({
      status: 'unresolvable',
    });
    // A missing first marker short-circuits before later markers resolve.
    expect(resolveCorrelatedFilterTemplate({ a: parentRef('missing'), b: parentRef('_id') }, { _id: 'u1' })).toEqual({
      status: 'unresolvable',
    });
    expect(resolveCorrelatedIdTemplate(parentRef('missing'), { _id: 'u1' })).toEqual({ status: 'unresolvable' });
    expect(resolveCorrelatedIdTemplate(parentRef('orgId'), { orgId: null })).toEqual({ status: 'unresolvable' });
  });

  it('coerces identifier resolutions per ACI-01 D4.5', () => {
    expect(resolveCorrelatedIdTemplate('literal-id', {})).toEqual({ status: 'resolved', id: 'literal-id' });
    expect(resolveCorrelatedIdTemplate(parentRef('orgId'), { orgId: 'o9' })).toEqual({
      status: 'resolved',
      id: 'o9',
    });
    expect(resolveCorrelatedIdTemplate(parentRef('n'), { n: 42 })).toEqual({ status: 'resolved', id: '42' });
    expect(resolveCorrelatedIdTemplate(parentRef('flag'), { flag: false })).toEqual({
      status: 'resolved',
      id: 'false',
    });
    expect(resolveCorrelatedIdTemplate(parentRef('obj'), { obj: { id: 'x' } })).toEqual({ status: 'unresolvable' });
    expect(resolveCorrelatedIdTemplate(parentRef('arr'), { arr: ['x'] })).toEqual({ status: 'unresolvable' });
    expect(() => resolveCorrelatedIdTemplate(42, {})).toThrow(CorrelatedReferenceError);
  });

  it('wraps operator-shaped parent values so they cannot become query operators', () => {
    const resolved = resolveCorrelatedFilterTemplate(
      { status: parentRef('evil'), other: parentRef('alsoEvil') },
      { evil: { $ne: 'x' }, alsoEvil: { $parent: '_id', extra: 1 } },
    );
    expect(resolved).toEqual({
      status: 'resolved',
      filter: { status: { $eq: { $ne: 'x' } }, other: { $eq: { $parent: '_id', extra: 1 } } },
    });
  });

  it('never recursively interprets substituted marker shapes', () => {
    const resolved = resolveCorrelatedFilterTemplate({ ref: parentRef('a') }, { a: { $parent: 'b' }, b: 'real-value' });
    expect(resolved).toEqual({
      status: 'resolved',
      filter: { ref: { $eq: { $parent: 'b' } } },
    });
  });

  it('keeps ordinary dollar strings unchanged end to end', () => {
    const resolved = resolveCorrelatedFilterTemplate(
      { title: '$special', nested: { $regex: '$anchored' } },
      { _id: 'u1' },
    );
    expect(resolved).toEqual({
      status: 'resolved',
      filter: { title: '$special', nested: { $regex: '$anchored' } },
    });
    const fromParent = resolveCorrelatedFilterTemplate({ title: parentRef('t') }, { t: '$parent' });
    expect(fromParent).toEqual({ status: 'resolved', filter: { title: '$parent' } });
  });

  it('uses own-property semantics and rejects dangerous segments', () => {
    const parent = Object.create({ inherited: 'nope' });
    parent.own = 'yes';
    expect(resolveCorrelatedFilterTemplate({ a: parentRef('inherited') }, parent)).toEqual({
      status: 'unresolvable',
    });
    expect(resolveCorrelatedFilterTemplate({ a: parentRef('own') }, parent)).toEqual({
      status: 'resolved',
      filter: { a: 'yes' },
    });
    expect(() => resolveCorrelatedFilterTemplate({ a: parentRef('__proto__') }, {})).toThrow(CorrelatedReferenceError);
    expect(() => resolveCorrelatedIdTemplate(parentRef('a.constructor'), { a: {} })).toThrow(CorrelatedReferenceError);
  });

  it('enforces resolver traversal boundaries', () => {
    // Markers inside $$sq payloads are rejected, never silently passed through.
    expect(() =>
      resolveCorrelatedFilterTemplate(
        { a: { $$sq: { model: 'Post', filter: { x: parentRef('_id') } } } },
        { _id: 'u1' },
      ),
    ).toThrow(CorrelatedReferenceError);
    // Marker-free $$sq payloads clone through untouched.
    const clean = resolveCorrelatedFilterTemplate({ a: { $$sq: { model: 'Post', filter: { x: 1 } } } }, { _id: 'u1' });
    expect(clean).toEqual({
      status: 'resolved',
      filter: { a: { $$sq: { model: 'Post', filter: { x: 1 } } } },
    });
    // Markers as direct $and clauses or $elemMatch values are rejected.
    expect(() => resolveCorrelatedFilterTemplate({ $and: [parentRef('_id')] }, { _id: 'u1' })).toThrow(
      CorrelatedReferenceError,
    );
    expect(() => resolveCorrelatedFilterTemplate({ tags: { $elemMatch: parentRef('t') } }, { t: 'x' })).toThrow(
      CorrelatedReferenceError,
    );
    expect(() => resolveCorrelatedFilterTemplate({ $parent: 'x' } as never, {})).toThrow(CorrelatedReferenceError);
  });

  it('preserves nested include scope in reference collection', () => {
    const include = {
      mode: 'correlated',
      model: 'Post',
      op: 'list',
      path: 'posts',
      filter: { authorId: parentRef('_id') },
      args: {
        include: [{ mode: 'correlated', model: 'User', op: 'read', path: 'reviewer', id: parentRef('reviewerId') }],
      },
    } as never;
    expect(isCorrelatedInclude(include)).toBe(true);
    // The nested reviewerId belongs to the next level, not the outer parent.
    expect(collectCorrelatedReferencePaths(include)).toEqual(['_id']);
  });

  it('revalidates expanded operands against complexity limits', () => {
    const expanded = { authorId: { $in: ['a', 'b', 'c'] } };
    expect(validateExpandedCorrelatedOperands(expanded, { maxInValues: 2 })).toHaveLength(1);
    expect(validateExpandedCorrelatedOperands(expanded, { maxInValues: 5 })).toEqual([]);
    expect(validateExpandedCorrelatedOperands({ a: { b: { c: 1 } } }, { maxDepth: 1 })).toHaveLength(1);
  });
});

describe('processInclude correlated boundaries (ACI-02)', () => {
  const correlatedRead = {
    mode: 'correlated',
    model: 'Org',
    op: 'read',
    path: 'org',
    id: parentRef('orgId'),
  };

  it('partitions correlated entries instead of dropping them', () => {
    const legacy = { model: 'Post', op: 'list', path: 'posts', localField: 'orgId', foreignField: 'ownerId' };
    const result = base.process([correlatedRead, legacy]);
    expect(result.correlatedIncludes).toHaveLength(1);
    expect(result.includes).toHaveLength(1);
    expect(result.correlatedReferenceFields).toEqual(['orgId']);
    expect(result.includeLocalFields).toEqual(['orgId']);
    expect(result.includePaths).toEqual(['posts']);
  });

  it('fails closed on malformed correlated input instead of dropping it', () => {
    expect(processDetail({ ...correlatedRead, localField: 'orgId' })).toContain('localField');
    expect(processDetail({ ...correlatedRead, id: undefined, filter: undefined })).toContain('exactly one');
    expect(processDetail({ mode: 'correlated', op: 'read', path: 'org', id: 'x' })).toContain('model');
    expect(processDetail({ model: 'Post', op: 'list', path: 'p', filter: { a: parentRef('b') } })).toContain('$parent');
  });

  it('rejects duplicate correlated output paths', () => {
    expect(processDetail([correlatedRead, { ...correlatedRead }])).toContain('Duplicate');
  });

  it('preserves the legacy silent-drop for entries without correlated signals', () => {
    const result = base.process({ model: 'Post', op: 'list', path: 'posts' });
    expect(result.includes).toEqual([]);
    expect(result.correlatedIncludes).toEqual([]);
  });

  it('rejects correlated entries in the legacy executor', async () => {
    const error = await base.includeDocsFor([{ _id: 'u1' }], correlatedRead).then(
      () => null,
      (cause: unknown) => cause as { result?: { code?: unknown; errors?: Array<{ detail?: string }> } },
    );
    expect(error?.result?.code).toBe('bad_request');
    expect(error?.result?.errors?.[0]?.detail).toContain('not supported by the legacy include executor');
  });
});
