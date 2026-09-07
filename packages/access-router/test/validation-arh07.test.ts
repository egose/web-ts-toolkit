import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import acl, { fromAjv, fromZod, setGlobalOptions } from '../dist/index.mjs';

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });
};

afterEach(() => {
  resetGlobalOptions();
});

function makeAjvValidator(
  errors: Array<{ message?: string; instancePath?: string; params?: { missingProperty?: string } }>,
) {
  const validate = Object.assign(
    () => {
      validate.errors = errors;
      return false;
    },
    { errors: null as typeof errors | null },
  );
  return fromAjv(validate as never);
}

function resolveFragmentPointer(root: unknown, pointer: string): unknown {
  if (pointer === '#') return root;
  expect(pointer.startsWith('#/')).toBe(true);
  const segments = pointer
    .slice(2)
    .split('/')
    .map((segment) => decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = root;
  for (const segment of segments) {
    const container = current as Record<string, unknown>;
    current = container[segment];
  }
  return current;
}

describe('validation ARH-07 lossless pointers', () => {
  it('decodes AJV escapes losslessly and preserves empty/numeric keys', async () => {
    const slash = await makeAjvValidator([{ instancePath: '/a~1b', params: {}, message: 'bad' }])({});
    expect(slash.success).toBe(false);
    if (!slash.success) expect(slash.issues[0]?.path).toEqual(['a/b']);

    const tilde = await makeAjvValidator([{ instancePath: '/a~0b', params: {}, message: 'bad' }])({});
    if (!tilde.success) expect(tilde.issues[0]?.path).toEqual(['a~b']);

    // "~01" must decode to "~1" (~1 first, then ~0), not "/".
    const tildeOne = await makeAjvValidator([{ instancePath: '/~01', params: {}, message: 'bad' }])({});
    if (!tildeOne.success) expect(tildeOne.issues[0]?.path).toEqual(['~1']);

    const emptyProp = await makeAjvValidator([{ instancePath: '/', params: {}, message: 'bad' }])({});
    if (!emptyProp.success) expect(emptyProp.issues[0]?.path).toEqual(['']);

    const root = await makeAjvValidator([{ instancePath: '', params: {}, message: 'bad' }])({});
    if (!root.success) expect(root.issues[0]?.path).toEqual([]);

    const leadingZero = await makeAjvValidator([{ instancePath: '/01', params: {}, message: 'bad' }])({});
    if (!leadingZero.success) {
      expect(leadingZero.issues[0]?.path).toEqual(['01']);
      expect(typeof leadingZero.issues[0]?.path?.[0]).toBe('string');
    }

    const zero = await makeAjvValidator([{ instancePath: '/0', params: {}, message: 'bad' }])({});
    if (!zero.success) expect(zero.issues[0]?.path).toEqual(['0']);
  });

  it('distinguishes root from empty-string property and handles empty missingProperty', async () => {
    const missingEmpty = await makeAjvValidator([
      { instancePath: '', params: { missingProperty: '' }, message: 'required' },
    ])({});
    if (!missingEmpty.success) expect(missingEmpty.issues[0]?.path).toEqual(['']);

    const nestedMissingEmpty = await makeAjvValidator([
      { instancePath: '/obj', params: { missingProperty: '' }, message: 'required' },
    ])({});
    if (!nestedMissingEmpty.success) expect(nestedMissingEmpty.issues[0]?.path).toEqual(['obj', '']);

    const missing = await makeAjvValidator([
      { instancePath: '/obj', params: { missingProperty: 'name' }, message: 'required' },
    ])({});
    if (!missing.success) expect(missing.issues[0]?.path).toEqual(['obj', 'name']);
  });

  it('emits fragment-form escaped pointers that round-trip, keeping ordinary output stable', async () => {
    resetGlobalOptions();
    const app = express();

    const cases: Array<{ issues: Array<{ message: string; path?: Array<string | number> }>; pointer: string }> = [
      { issues: [{ message: 'bad', path: ['filter', 'public'] }], pointer: '#/filter/public' },
      { issues: [{ message: 'bad', path: ['select'] }], pointer: '#/select' },
      { issues: [{ message: 'bad', path: [0] }], pointer: '#/0' },
      { issues: [{ message: 'bad', path: [] }], pointer: '#' },
      { issues: [{ message: 'bad', path: undefined }], pointer: '#' },
      { issues: [{ message: 'bad', path: ['a/b'] }], pointer: '#/a~1b' },
      { issues: [{ message: 'bad', path: ['a~b'] }], pointer: '#/a~0b' },
      { issues: [{ message: 'bad', path: ['~1'] }], pointer: '#/~01' },
      { issues: [{ message: 'bad', path: [''] }], pointer: '#/' },
      { issues: [{ message: 'bad', path: ['01'] }], pointer: '#/01' },
      { issues: [{ message: 'bad', path: ['a b'] }], pointer: '#/a%20b' },
      { issues: [{ message: 'bad', path: ['café'] }], pointer: '#/caf%C3%A9' },
      { issues: [{ message: 'bad', path: ['data', 'a/b'] }], pointer: '#/data/a~1b' },
      { issues: [{ message: 'bad', path: ['obj', ''] }], pointer: '#/obj/' },
      { issues: [{ message: 'bad', path: ['items', 1] }], pointer: '#/items/1' },
    ];

    cases.forEach(({ issues }, index) => {
      const router = acl.createDataRouter(`arh07-pointer-${index}`, {
        basePath: `/arh07-pointer-${index}`,
        idField: 'id',
        operationAccess: { list: true, read: true },
        data: [{ id: 'row', filter: { public: true } }],
        permissionSchema: { id: true },
        requestSchemas: {
          advancedRead: async () => ({ success: false as const, issues }),
        },
      });
      app.use(router.routes);
    });

    for (let index = 0; index < cases.length; index += 1) {
      const expected = cases[index];
      await request(app)
        .post(`/arh07-pointer-${index}/__query/row`)
        .send({})
        .expect(400)
        .expect(({ body }) => {
          expect(body.errors).toEqual([{ detail: 'bad', pointer: expected.pointer }]);
        });
    }

    // Spot-check round-trip resolution back to the intended field.
    expect(resolveFragmentPointer({ 'a/b': 1 }, '#/a~1b')).toBe(1);
    expect(resolveFragmentPointer({ 'a~b': 2 }, '#/a~0b')).toBe(2);
    expect(resolveFragmentPointer({ '': 3 }, '#/')).toBe(3);
    expect(resolveFragmentPointer({ '01': 4 }, '#/01')).toBe(4);
    expect(resolveFragmentPointer({ 'a b': 5 }, '#/a%20b')).toBe(5);
    expect(resolveFragmentPointer({ café: 6 }, '#/caf%C3%A9')).toBe(6);
    expect(resolveFragmentPointer({ data: { 'a/b': 7 } }, '#/data/a~1b')).toBe(7);
    expect(resolveFragmentPointer(['x', 'y'], '#/1')).toBe('y');
  });

  it('aligns AJV, Zod, and Standard Schema locations through the HTTP boundary', async () => {
    resetGlobalOptions();
    const app = express();
    const shared = {
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: [{ id: 'row' }],
      permissionSchema: { id: true },
    };

    const ajvRouter = acl.createDataRouter('arh07-ajv', {
      ...shared,
      basePath: '/arh07-ajv',
      requestSchemas: {
        advancedRead: makeAjvValidator([{ message: 'bad', instancePath: '/a~1b', params: {} }]),
      },
    });
    const zodRouter = acl.createDataRouter('arh07-zod', {
      ...shared,
      basePath: '/arh07-zod',
      requestSchemas: {
        advancedRead: fromZod(z.object({ 'a/b': z.string() })),
      },
    });
    const standardRouter = acl.createDataRouter('arh07-standard', {
      ...shared,
      basePath: '/arh07-standard',
      requestSchemas: {
        advancedRead: {
          '~standard': {
            version: 1,
            vendor: 'arh07',
            validate: (value: unknown) => ({
              issues: [
                {
                  message: 'bad',
                  path: [{ key: 'a/b' }],
                },
              ],
              value,
            }),
          },
        } as never,
      },
    });
    const zodRootRouter = acl.createDataRouter('arh07-zod-root', {
      ...shared,
      basePath: '/arh07-zod-root',
      requestSchemas: {
        advancedRead: fromZod(z.object({ select: z.array(z.string()) }).refine(() => false, { message: 'root fail' })),
      },
    });

    app.use(express.json());
    app.use(ajvRouter.routes);
    app.use(zodRouter.routes);
    app.use(standardRouter.routes);
    app.use(zodRootRouter.routes);

    for (const basePath of ['/arh07-ajv', '/arh07-zod', '/arh07-standard']) {
      await request(app)
        .post(`${basePath}/__query/row`)
        .send({ 'a/b': 123 })
        .expect(400)
        .expect(({ body }) => {
          expect(body.errors).toEqual([{ detail: expect.any(String), pointer: '#/a~1b' }]);
        });
    }

    await request(app)
      .post('/arh07-zod-root/__query/row')
      .send({ select: ['id'] })
      .expect(400)
      .expect(({ body }) => {
        expect(body.errors).toEqual([{ detail: 'root fail', pointer: '#' }]);
      });
  });
});
