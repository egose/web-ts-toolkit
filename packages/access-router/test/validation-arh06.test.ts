import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import Ajv from 'ajv';
import { type as arkType } from 'arktype';

import acl, { fromAjv, fromArkType, fromZod, setGlobalOptions } from '../dist/index.mjs';

const SENTINEL = 'ARH06-OPERATIONAL-SENTINEL-4b7e';

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });
};

afterEach(() => {
  resetGlobalOptions();
});

describe('validation ARH-06 async contracts', () => {
  it('passes real ArkType array successes through unchanged (empty/scalar/record/nullable)', async () => {
    const StringArray = arkType('string[]');
    const NullableStrings = arkType('(string|null)[]');
    const RecordArray = arkType({ name: 'string' });
    void RecordArray;

    const stringValidator = fromArkType(StringArray as never);
    expect(await stringValidator([])).toEqual({ success: true, data: [] });
    expect(await stringValidator(['a'])).toEqual({ success: true, data: ['a'] });
    expect(await stringValidator(['a', 'b'])).toEqual({ success: true, data: ['a', 'b'] });

    const nullableValidator = fromArkType(NullableStrings as never);
    expect(await nullableValidator([null])).toEqual({ success: true, data: [null] });
    expect(await nullableValidator([null, 'a'])).toEqual({ success: true, data: [null, 'a'] });

    const Records = arkType({ items: 'string[]' });
    const recordsValidator = fromArkType(Records as never);
    expect(await recordsValidator({ items: [] })).toEqual({ success: true, data: { items: [] } });
    expect(await recordsValidator({ items: ['x'] })).toEqual({ success: true, data: { items: ['x'] } });

    const MessagePath = arkType({ message: 'string', path: 'string[]' });
    const messagePathValidator = fromArkType(MessagePath as never);
    expect(await messagePathValidator({ message: 'hi', path: ['x'] })).toEqual({
      success: true,
      data: { message: 'hi', path: ['x'] },
    });
  });

  it('returns useful real ArkType errors for invalid arrays', async () => {
    const StringArray = arkType('string[]');
    const validator = fromArkType(StringArray as never);

    const result = await validator(['a', 123]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((issue) => issue.path?.includes(1))).toBe(true);
      expect(result.issues.every((issue) => typeof issue.message === 'string' && issue.message.length > 0)).toBe(true);
    }
  });

  it('propagates ArkType operational exceptions unchanged', async () => {
    const sentinel = new Error(`arktype upstream ${SENTINEL}`);
    const throwing = Object.assign(
      async () => {
        throw sentinel;
      },
      { arkKind: undefined },
    ) as never;
    const validator = fromArkType(throwing);

    await expect(validator({})).rejects.toBe(sentinel);
  });

  it('keeps same-turn AJV validations input-local (invalid/valid and invalid/invalid)', async () => {
    const ajv = new Ajv({ allErrors: true });
    const compiled = ajv.compile({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    });
    const validator = fromAjv(compiled as never);

    const pInvalid = validator({ name: 123 });
    const pValid = validator({ name: 'ok' });
    const [rInvalid, rValid] = await Promise.all([pInvalid, pValid]);

    expect(rValid).toEqual({ success: true, data: { name: 'ok' } });
    expect(rInvalid.success).toBe(false);
    if (!rInvalid.success) {
      expect(rInvalid.issues.length).toBeGreaterThan(0);
      expect(rInvalid.issues[0]?.path).toEqual(['name']);
    }

    const pA = validator({ name: 123 });
    const pB = validator({});
    const [rA, rB] = await Promise.all([pA, pB]);

    expect(rA.success).toBe(false);
    expect(rB.success).toBe(false);
    if (!rA.success && !rB.success) {
      expect(rA.issues[0]?.path).toEqual(['name']);
      expect(rB.issues.length).toBeGreaterThan(0);
    }
  });

  it('supports async AJV rejection-carried errors and propagates unexpected rejections', async () => {
    const ajv = new Ajv({ allErrors: true });
    ajv.addKeyword({
      keyword: 'isEvenArh06',
      async: true,
      type: 'number',
      validate: async (_schema: unknown, data: unknown) => {
        if (typeof data !== 'number') return false;
        if (data % 2 !== 0) {
          throw new Ajv.ValidationError([
            {
              instancePath: '',
              schemaPath: '#/isEvenArh06',
              keyword: 'isEvenArh06',
              params: {},
              message: 'must be even',
            },
          ]);
        }
        return true;
      },
    });
    const compiled = ajv.compile({
      $async: true,
      type: 'object',
      properties: { n: { type: 'number', isEvenArh06: true } },
    });
    const validator = fromAjv(compiled as never);

    expect(await validator({ n: 4 })).toEqual({ success: true, data: { n: 4 } });

    const invalid = await validator({ n: 3 });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.issues.length).toBeGreaterThan(0);
      expect(invalid.issues[0]?.message).toBe('must be even');
    }

    const operational = new Error(`ajv upstream ${SENTINEL}`);
    const rejecting = Object.assign(() => Promise.reject(operational), { errors: null }) as never;
    await expect(fromAjv(rejecting)({})).rejects.toBe(operational);
  });

  it('supports explicit fromZod async refinements, failures, and transformed outputs', async () => {
    const asyncSchema = z.object({
      name: z.string().refine(async (value) => value.length > 2, { message: 'too short' }),
    });
    const validator = fromZod(asyncSchema);

    expect(await validator({ name: 'abcd' })).toEqual({ success: true, data: { name: 'abcd' } });

    const invalid = await validator({ name: 'a' });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.issues).toEqual([{ message: 'too short', path: ['name'] }]);
    }

    const transformed = z.object({
      name: z.string().transform(async (value) => value.toUpperCase()),
    });
    expect(await fromZod(transformed)({ name: 'ab' })).toEqual({ success: true, data: { name: 'AB' } });

    const syncSchema = z.object({ name: z.string().transform((value) => value.trim()) });
    expect(await fromZod(syncSchema)({ name: '  hi  ' })).toEqual({ success: true, data: { name: 'hi' } });
  });

  it('supports automatic Zod async schemas through the data-router boundary', async () => {
    resetGlobalOptions();
    const app = express();
    const router = acl.createDataRouter('arh06-zod-async', {
      basePath: '/arh06-zod-async',
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: [{ id: 'apple', name: 'Apple' }],
      permissionSchema: { id: true, name: true },
      requestSchemas: {
        advancedRead: z.object({
          select: z.array(z.string()).refine(async (value) => value.length > 0, { message: 'empty select' }),
        }),
      },
    });

    app.use(express.json());
    app.use(router.routes);

    await request(app)
      .post('/arh06-zod-async/__query/apple')
      .send({ select: [] })
      .expect(400)
      .expect(({ body }) => {
        expect(body.errors).toEqual([{ detail: 'empty select', pointer: '#/select' }]);
      });

    await request(app)
      .post('/arh06-zod-async/__query/apple')
      .send({ select: ['name'] })
      .expect(200);
  });

  it('propagates unexpected Zod operational exceptions unchanged', async () => {
    const operational = new Error(`zod upstream ${SENTINEL}`);
    const schema = z.object({ name: z.string() });
    (schema as unknown as { safeParseAsync: unknown }).safeParseAsync = async () => {
      throw operational;
    };

    await expect(fromZod(schema)({ name: 'ok' })).rejects.toBe(operational);
  });
});
