import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { defineRequestSchema } from '../../dist/index.mjs';
import {
  parseBody,
  parseBodyWithSchema,
  parseNestedBodyWithSchema,
  parseQuery,
  parsePathParam,
  listBodySchema,
  listQuerySchema,
  readByIdBodySchema,
  createBodySchema,
  rootQuerySchema,
} from '../../dist/advanced.mjs';
import { copyPaths, movePaths, sliceArrays, countPaths, maskPaths } from '../../dist/processors.mjs';
import { modelFixture, dataFixture } from '../support/public/arts04-fixture';
import { useMongoTestDatabase } from '../setup';

useMongoTestDatabase();

describe('ARTS-04 standalone public processors (literal retained task recipes)', () => {
  it('PROCESSORS-copyPaths mutable/deep/immutable/fanout/noop/unsafe paths', () => {
    const input = { a: { x: 1 } };
    const copied = copyPaths(input, [{ src: 'a', dest: 'c' }]) as typeof input & { c: { x: number } };
    expect(copied).toBe(input);
    expect(copied.c).toEqual({ x: 1 });
    copied.c.x = 99;
    expect(copied.a.x).toBe(1);
    expect(copyPaths({ items: [{ v: 1 }, { v: 2 }] }, [{ src: 'items.v', dest: 'w' }])).toEqual({
      items: [
        { v: 1, w: 1 },
        { v: 2, w: 2 },
      ],
    });
    expect(copyPaths({ a: 1 }, [{ src: 'missing', dest: 'x' }])).toEqual({ a: 1 });
    expect(copyPaths(input, [{ src: 'a', dest: 'a' }])).toBe(input);
    const immutable = copyPaths(input, [{ src: 'a', dest: 'c' }], { mutable: false }) as typeof copied;
    expect(immutable).not.toBe(input);
    immutable.a.x = 2;
    expect(input.a.x).toBe(1);
    expect(() => copyPaths({}, [{ src: '__proto__', dest: 'x' }])).toThrow(/refusing path/);
    expect(() => copyPaths(input, [{ src: 'a', dest: 'x.__proto__' }])).toThrow(/refusing path/);
  });

  it('PROCESSORS-movePaths mutable/nested destination/immutable/noop/unsafe paths', () => {
    const input = { a: { x: 1 }, b: 2 };
    expect(movePaths(input, [{ src: 'a', dest: 'c' }])).toBe(input);
    expect(input).toEqual({ b: 2, c: { x: 1 } });
    expect(movePaths({ a: { x: 1 } }, [{ src: 'a', dest: 'a.b' }])).toEqual({ a: { x: 1, b: { x: 1 } } });
    expect(
      movePaths({ a: 1 }, [
        { src: 'missing', dest: 'x' },
        { src: 'a', dest: 'a' },
      ]),
    ).toEqual({ a: 1 });
    const source = { a: { x: 1 } },
      detached = movePaths(source, [{ src: 'a', dest: 'c' }], { mutable: false }) as { c: { x: number } };
    detached.c.x = 99;
    expect(source).toEqual({ a: { x: 1 } });
    expect(() => movePaths({}, [{ src: 'a', dest: '__proto__' }])).toThrow(/refusing path/);
  });

  it('PROCESSORS-sliceArrays default/destination/tail/caps/immutable/noop/bounds', () => {
    const input = { list: [1, 2, 3, 4] };
    expect(sliceArrays(input, [{ src: 'list', skip: 1, limit: 2 }])).toBe(input);
    expect(input.list).toEqual([2, 3]);
    expect(sliceArrays({ list: [1, 2, 3, 4] }, [{ src: 'list', dest: 'page', skip: 2, limit: 2 }])).toEqual({
      list: [1, 2, 3, 4],
      page: [3, 4],
    });
    expect(sliceArrays({ list: [1, 2, 3] }, [{ src: 'list', skip: 1 }])).toEqual({ list: [2, 3] });
    expect(sliceArrays({ list: [1, 2, 3, 4] }, [{ src: 'list', limit: 4 }], { maxSlice: 2 })).toEqual({ list: [1, 2] });
    expect(
      (sliceArrays({ list: Array(2000).fill(1) }, [{ src: 'list', limit: 2000 }]) as { list: number[] }).list,
    ).toHaveLength(1000);
    expect(sliceArrays({ a: 1 }, [{ src: 'missing' }, { src: 'a' }])).toEqual({ a: 1 });
    const original = { list: [{ n: 1 }] },
      detached = sliceArrays(original, [{ src: 'list' }], { mutable: false }) as typeof original;
    detached.list[0].n = 9;
    expect(original.list[0].n).toBe(1);
    expect(() => sliceArrays({}, [{ src: '__proto__' }])).toThrow(/refusing path/);
    expect(() => sliceArrays(input, [{ src: 'list', skip: -1 }])).toThrow(/'skip' must be/);
    expect(() => sliceArrays(input, [{ src: 'list', limit: 1.5 }])).toThrow(/'limit' must be/);
    expect(() => sliceArrays(input, [{ src: 'list' }], { maxSlice: -1 })).toThrow(/'maxSlice' must be/);
  });

  it('PROCESSORS-countPaths mutable/array/object/scalar/null/immutable/noop/unsafe paths', () => {
    const input = { arr: [1, 2, 3], obj: { a: 1, b: 2 }, s: 'x', n: null };
    expect(
      countPaths(input, [
        { src: 'arr', dest: 'ac' },
        { src: 'obj', dest: 'oc' },
        { src: 's', dest: 'sc' },
        { src: 'n', dest: 'nc' },
      ]),
    ).toBe(input);
    expect(input).toMatchObject({ ac: 3, oc: 2, sc: 1, nc: 0 });
    expect(countPaths({ a: 1 }, [{ src: 'missing', dest: 'count' }])).toEqual({ a: 1 });
    const source = { a: { x: 1 } },
      detached = countPaths(source, [{ src: 'a', dest: 'count' }], { mutable: false }) as typeof source & {
        count: number;
      };
    expect(detached.count).toBe(1);
    detached.a.x = 2;
    expect(source.a.x).toBe(1);
    expect(() => countPaths(input, [{ src: 'arr', dest: '__proto__' }])).toThrow(/refusing path/);
  });

  it('PROCESSORS-maskPaths mutable/default/custom/fanout/immutable/noop/unsafe paths', () => {
    const input = { secret: 's3cret', other: 1 };
    expect(maskPaths(input, [{ src: 'secret' }])).toBe(input);
    expect(input).toEqual({ secret: '***', other: 1 });
    expect(maskPaths({ secret: 's3cret' }, [{ src: 'secret', replacement: null }])).toEqual({ secret: null });
    expect(maskPaths({ users: [{ ssn: '1' }, { ssn: '2' }] }, [{ src: 'users.ssn', replacement: 'x' }])).toEqual({
      users: [{ ssn: 'x' }, { ssn: 'x' }],
    });
    expect(maskPaths({ a: 1 }, [{ src: 'missing' }])).toEqual({ a: 1 });
    const source = { a: { x: 1 }, secret: 's3cret' },
      detached = maskPaths(source, [{ src: 'secret' }], { mutable: false }) as typeof source;
    detached.a.x = 2;
    expect(source).toEqual({ a: { x: 1 }, secret: 's3cret' });
    expect(() => maskPaths(input, [{ src: '__proto__' }])).toThrow(/refusing path/);
  });
});

describe('ARTS-04 public parsers and real grammar boundaries', () => {
  it('VALIDATION-parsers advanced body/query/path/nested transformations and failures', async () => {
    expect(parsePathParam(['first', 'second'], 'id')).toBe('first');
    expect(() => parsePathParam(undefined, 'id')).toThrow();
    expect(parseQuery(listQuerySchema, { select: 'value,full', limit: '2' })).toEqual({
      select: 'value,full',
      limit: '2',
    });
    expect(() => parseQuery(listQuerySchema, { select: 7 })).toThrow();
    expect(parseBody(listBodySchema, { select: { full: 1 } })).toEqual({ select: { full: 1 } });
    expect(() => parseBody(listBodySchema, { select: 7 })).toThrow();
    expect(
      await parseBodyWithSchema(
        listBodySchema,
        { select: 'value' },
        defineRequestSchema(() => ({ success: true, data: { select: ['full'] } })),
      ),
    ).toEqual({ select: ['full'] });
    expect(
      await parseNestedBodyWithSchema(
        createBodySchema,
        { data: { value: 'before' } },
        'data',
        defineRequestSchema(() => ({ success: true, data: { value: 'after' } })),
      ),
    ).toEqual({ data: { value: 'after' } });
  });

  it('VALIDATION-correlated safe parent/literal markers and malformed/op-exclusive shapes agree', () => {
    const valid = {
      mode: 'correlated',
      model: 'Target',
      op: 'list',
      path: 'attached',
      filter: { group: { $parent: 'group' }, note: { $escape: { $parent: 'literal' } } },
    };
    for (const include of [
      valid,
      { mode: 'correlated', model: 'Target', op: 'read', path: 'attached', id: { $parent: 'ref' } },
    ]) {
      expect(parseBody(listBodySchema, { include: [include] }).include).toEqual([include]);
      expect(
        rootQuerySchema.safeParse([
          { target: 'model', name: 'Source', op: 'read', id: 'one', args: { include: [include] } },
        ]).success,
      ).toBe(true);
    }
    for (const include of [
      { ...valid, localField: 'group', foreignField: 'group' },
      { ...valid, filter: { group: { $parent: '__proto__' } } },
      { ...valid, op: 'count', args: { select: ['name'] } },
    ]) {
      expect(readByIdBodySchema.safeParse({ include: [include] }).success).toBe(false);
      expect(
        rootQuerySchema.safeParse([{ target: 'model', name: 'Source', op: 'list', args: { include: [include] } }])
          .success,
      ).toBe(false);
    }
  });

  it('VALIDATION-selection string/array/object/exclusion and arbitrary safe virtual names stay public', () => {
    for (const select of [
      'value,full',
      ['value', 'full'],
      { value: 1, full: 1 },
      { full: -1 },
      ['value', '-full'],
      ['unregistered.safe'],
    ]) {
      expect(listBodySchema.safeParse({ select }).success).toBe(true);
      expect(readByIdBodySchema.safeParse({ select }).success).toBe(true);
      expect(
        rootQuerySchema.safeParse([{ target: 'model', name: 'Source', op: 'list', args: { select } }]).success,
      ).toBe(true);
    }
    expect(listBodySchema.safeParse({ select: { full: 2 } }).success).toBe(false);
  });

  it('VALIDATION-model/root HTTP virtual selection parity and exclusion', async () => {
    const getter = vi.fn((doc: any) => `v:${doc.value}`);
    const f = await modelFixture({
      permissionSchema: { value: true, full: true },
      virtuals: { full: { dependsOn: ['value'], get: getter } },
    });
    const basic = await request(f.app)
      .get(`${f.basePath}/${f.rows[0]._id}`)
      .query({ select: 'value,full -_id' })
      .expect(200);
    expect(basic.body).toEqual({ value: 'stored-0', full: 'v:stored-0' });
    const select = { value: 1, full: 1, _id: -1 };
    const direct = await request(f.app).post(`${f.basePath}/__query/${f.rows[0]._id}`).send({ select }).expect(200);
    const root = await request(f.app)
      .post(f.rootPath)
      .send([{ target: 'model', name: f.Source.modelName, op: 'read', id: String(f.rows[0]._id), args: { select } }])
      .expect(200);
    expect(root.body[0].result.data).toEqual(direct.body);
    expect(direct.body).toEqual(basic.body);
    getter.mockClear();
    const excluded = await request(f.app)
      .post(`${f.basePath}/__query`)
      .send({ select: ['value', '-full', '-_id'] })
      .expect(200);
    expect(excluded.body.data).toEqual([{ value: 'stored-0' }, { value: 'stored-1' }]);
    expect(getter).not.toHaveBeenCalled();
  });

  it('VALIDATION-data/root and dedicated child/root HTTP honor selected virtual grammar', async () => {
    const d = dataFixture([{ id: 'one', name: 'data', payload: { value: 1 } }]);
    const directData = await request(d.app)
      .post(`${d.basePath}/__query/one`)
      .send({ select: ['name'] })
      .expect(200);
    const rootData = await request(d.app)
      .post(d.rootPath)
      .send([{ target: 'data', name: d.name, op: 'read', id: 'one', args: { select: ['name'] } }])
      .expect(200);
    expect(directData.body).toEqual({ name: 'data' });
    expect(rootData.body[0].result.data).toEqual(directData.body);
    const f = await modelFixture({
      permissionSchema: { children: { default: true, sub: { label: true, hidden: false, nick: true } } },
      virtuals: { children: { sub: { nick: { dependsOn: ['label'], get: (doc: any) => `nick:${doc.label}` } } } },
    });
    const direct = await request(f.app)
      .post(`${f.basePath}/${f.rows[0]._id}/children/__query`)
      .send({ select: ['nick', '-_id'] })
      .expect(200);
    const root = await request(f.app)
      .post(f.rootPath)
      .send([
        {
          target: 'model',
          name: f.Source.modelName,
          op: 'subList',
          id: String(f.rows[0]._id),
          sub: 'children',
          args: { select: ['nick', '-_id'] },
        },
      ])
      .expect(200);
    expect(direct.body).toEqual([{ nick: 'nick:child' }]);
    expect(root.body[0].result.data).toEqual(direct.body);
  });

  it('VALIDATION-openapi remains open-object with virtual selects and never invokes getters', async () => {
    const getter = vi.fn(() => 'computed-sentinel');
    const f = await modelFixture({ permissionSchema: { full: true }, virtuals: { full: { get: getter } } });
    const spec = f.api.runtime.getOpenApiSpec({ title: 'ARTS-04', version: '1.0.0' }) as any;
    expect(spec.paths[f.basePath].get.parameters).toContainEqual(expect.objectContaining({ name: 'select' }));
    expect(
      spec.paths[`${f.basePath}/{id}`].get.responses['200'].content['application/json'].schema.additionalProperties,
    ).toBe(true);
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(spec)).not.toContain('computed-sentinel');
  });
});
