import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Query, QueryOptionError, Schema } from '../src/index';
import { applyProjection, normalizeProjection } from '../src/query-compiler';
import { FakePersistenceAdapter } from './support/fake-adapter';

function makeModel(adapter: FakePersistenceAdapter, schema: Schema<any>) {
  return {
    modelName: 'ProjectionBoundaryHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

describe('BMRX-02 projection boundary', () => {
  it('rejects dangerous and empty projection segments before any read', () => {
    const dangerous = [
      '-tags.__proto__.map',
      'a.__proto__.b',
      '__proto__',
      'a.prototype.b',
      'a.constructor.b',
      'constructor',
      'a..b',
      '.a',
      'a.',
      '-',
      'members..name',
    ];
    for (const projection of dangerous) {
      expect(() => normalizeProjection(projection), projection).toThrow(QueryOptionError);
    }
    const objectDangerous = [
      { '__proto__.x': 1 },
      { 'a.constructor': 0 },
      { 'a..b': 1 },
      { '': 1 },
    ] as unknown as Record<string, 0 | 1>[];
    for (const projection of objectDangerous) {
      expect(() => normalizeProjection(projection)).toThrow(QueryOptionError);
    }
    // Inherited-only paths are rejected or safely resolve to missing.
    expect(() => normalizeProjection('-tags.__proto__.map')).toThrow(QueryOptionError);
    expect(() => normalizeProjection('tags.constructor')).toThrow(QueryOptionError);
  });

  it('leaves built-in prototypes untouched when dangerous projections are attempted', () => {
    const mapDescriptorBefore = Object.getOwnPropertyDescriptor(Array.prototype, 'map');
    const dateDescriptorBefore = Object.getOwnPropertyDescriptor(Date.prototype, 'getTime');
    expect(() => normalizeProjection('-tags.__proto__.map')).toThrow(QueryOptionError);
    expect(() => normalizeProjection({ 'createdAt.__proto__.x': 0 } as never)).toThrow(QueryOptionError);
    expect(() =>
      applyProjection(
        { _id: 'x', tags: ['a'], createdAt: new Date('2024-01-01T00:00:00.000Z') } as never,
        normalizeProjection('-secret')!,
      ),
    ).not.toThrow();
    expect(Object.getOwnPropertyDescriptor(Array.prototype, 'map')).toEqual(mapDescriptorBefore);
    expect(Object.getOwnPropertyDescriptor(Date.prototype, 'getTime')).toEqual(dateDescriptorBefore);
    expect(typeof [].map).toBe('function');
  });

  it('rejects dangerous projections in an isolated subprocess without mutating built-ins', () => {
    const script = `
import assert from 'node:assert';
import { compileQuery } from './packages/mongoose-rxdb/dist/index.mjs';
const mapBefore = Object.getOwnPropertyDescriptor(Array.prototype, 'map');
const dateBefore = Object.getOwnPropertyDescriptor(Date.prototype, 'getTime');
const candidates = ['-tags.__proto__.map', 'a.constructor.b', '-createdAt.constructor'];
for (const projection of candidates) {
  let threw = false;
  try { compileQuery({}, { projection }); } catch (error) { threw = error && error.name === 'QueryOptionError'; }
  assert.equal(threw, true, 'expected QueryOptionError for ' + projection);
}
let threwObject = false;
try { compileQuery({}, { projection: { 'x.__proto__': 1 } }); } catch (error) { threwObject = error && error.name === 'QueryOptionError'; }
assert.equal(threwObject, true, 'expected QueryOptionError for object dangerous path');
assert.deepEqual(Object.getOwnPropertyDescriptor(Array.prototype, 'map'), mapBefore);
assert.deepEqual(Object.getOwnPropertyDescriptor(Date.prototype, 'getTime'), dateBefore);
assert.equal(typeof [].map, 'function');
console.log('subprocess-projection-safe');
`;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: fileURLToPath(new URL('../../..', import.meta.url)),
      timeout: 15000,
    }).toString();
    expect(output).toContain('subprocess-projection-safe');
    expect(typeof [].map).toBe('function');
  });

  it('redacts nested secrets array-aware for exclusion and inclusion', async () => {
    const schema = new Schema<any>({ name: String, members: Array, tags: Array });
    const seed = [
      {
        _id: 'g1',
        name: 'g1',
        members: [
          { name: 'a', secret: 's1' }, // pragma: allowlist secret
          { name: 'b', secret: 's2' }, // pragma: allowlist secret
        ],
        tags: ['x', 'y'],
      },
    ];
    const adapter = new FakePersistenceAdapter(seed);
    const model = makeModel(adapter, schema);

    const excluded = await new Query<any[], any>(model, schema, adapter).select('-members.secret').lean().exec();
    expect(excluded[0].members).toEqual([{ name: 'a' }, { name: 'b' }]);

    const included = await new Query<any[], any>(model, schema, adapter).select('members.name').lean().exec();
    expect(included[0].members).toEqual([{ name: 'a' }, { name: 'b' }]);

    // Inclusion must not leak excluded sibling fields.
    expect(JSON.stringify(included[0])).not.toContain('s1');
    expect(JSON.stringify(included[0])).not.toContain('s2');

    // Hydrated and serialized results redact the same way.
    const hydrated = await new Query<any[], any>(model, schema, adapter).select('-members.secret').exec();
    expect(hydrated[0].toObject().members).toEqual([{ name: 'a' }, { name: 'b' }]);
    expect(JSON.stringify(hydrated[0].toJSON())).not.toContain('s1');
  });

  it('supports numeric array-index paths with documented missing-field outcomes', () => {
    const record = {
      _id: 'n1',
      members: [
        { name: 'a', secret: 's1' }, // pragma: allowlist secret
        { name: 'b', secret: 's2' }, // pragma: allowlist secret
      ],
    } as unknown as Record<string, unknown>;

    // Missing top-level include field is omitted (only _id retained by default).
    const missingInclude = applyProjection(record as never, normalizeProjection('missing')!);
    expect(missingInclude).toEqual({ _id: 'n1' });

    // Missing exclude field is a no-op (full clone retained).
    const missingExclude = applyProjection(record as never, normalizeProjection('-missing')!);
    expect(missingExclude).toEqual(record);

    // Numeric include selects only that index.
    const numericInclude = applyProjection(record as never, normalizeProjection('members.0.name')!);
    expect(numericInclude.members).toHaveLength(2);
    expect(numericInclude.members[0]).toEqual({ name: 'a' });
    expect(numericInclude.members[1]).toBeUndefined();

    // Out-of-bounds numeric include is omitted.
    const oobInclude = applyProjection(record as never, normalizeProjection('members.9.name')!);
    expect(oobInclude).toEqual({ _id: 'n1' });

    // Numeric exclude redacts only that index.
    const numericExclude = applyProjection(record as never, normalizeProjection('-members.0.secret')!);
    expect(numericExclude.members).toEqual([{ name: 'a' }, { name: 'b', secret: 's2' }]); // pragma: allowlist secret

    // Out-of-bounds numeric exclude is a no-op.
    const oobExclude = applyProjection(record as never, normalizeProjection('-members.9.secret')!);
    expect(oobExclude).toEqual(record);
  });

  it('treats omitted, {}, empty, and whitespace-only projections the same for find/findOne', async () => {
    const schema = new Schema<any>({ name: String, age: Number });
    const seed = [{ _id: 'u1', name: 'Ada', age: 36 }];
    const variants: Array<{ label: string; projection?: unknown }> = [
      { label: 'omitted' },
      { label: 'empty-object', projection: {} },
      { label: 'empty-string', projection: '' },
      { label: 'whitespace', projection: '   ' },
    ];
    for (const variant of variants) {
      const adapter = new FakePersistenceAdapter(seed);
      const model = makeModel(adapter, schema);
      const findQuery = new Query<any[], any>(model, schema, adapter).lean();
      if (variant.projection !== undefined) findQuery.select(variant.projection as string);
      const findResult = await findQuery.exec();
      const oneAdapter = new FakePersistenceAdapter(seed);
      const oneModel = makeModel(oneAdapter, schema);
      const findOneQuery = new Query<any, any>(oneModel, schema, oneAdapter).setOp('findOne').lean();
      if (variant.projection !== undefined) findOneQuery.select(variant.projection as string);
      const findOneResult = await findOneQuery.exec();
      expect(findResult, variant.label).toEqual([{ _id: 'u1', name: 'Ada', age: 36 }]);
      expect(findOneResult, variant.label).toEqual({ _id: 'u1', name: 'Ada', age: 36 });
    }

    // Explicit _id-only behavior is retained (not treated as no projection).
    expect(normalizeProjection({ _id: 1 })?.fields).toEqual({ _id: 1 });
    expect(applyProjection({ _id: 'u1', name: 'Ada' } as never, normalizeProjection({ _id: 1 })!)).toEqual({
      _id: 'u1',
    });
  });
});
