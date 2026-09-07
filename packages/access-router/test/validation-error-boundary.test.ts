import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import acl, { fromVine, fromYup, setGlobalOptions } from '../dist/index.mjs';

const SENTINEL = 'ARH05-OPERATIONAL-SENTINEL-9f3c';

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });
};

afterEach(() => {
  resetGlobalOptions();
});

const yupValidationFailure = {
  name: 'ValidationError',
  message: '2 errors occurred',
  errors: ['select must be an array', 'filter must be an object'],
  value: { select: 'name', filter: 'nope' },
  path: undefined,
  inner: [
    {
      name: 'ValidationError',
      message: 'select must be an array',
      errors: ['select must be an array'],
      value: 'name',
      path: 'select',
      type: 'typeError',
      inner: [],
    },
    {
      name: 'ValidationError',
      message: 'filter must be an object',
      errors: ['filter must be an object'],
      value: 'nope',
      path: 'filter',
      type: 'typeError',
      inner: [],
    },
  ],
};

const vineValidationFailure = {
  name: 'ValidationError',
  code: 'E_VALIDATION_ERROR',
  status: 422,
  message: 'Validation failure',
  messages: [{ field: 'select', message: 'Expected array', rule: 'array' }],
};

describe('validation error boundary (ARH-05)', () => {
  it('normalizes genuine yup validation failures with controlled paths/messages', async () => {
    const validator = fromYup({
      async validate() {
        throw yupValidationFailure;
      },
    });

    const result = await validator({ select: 'name' });
    expect(result).toEqual({
      success: false,
      issues: [
        { message: 'select must be an array', path: ['select'] },
        { message: 'filter must be an object', path: ['filter'] },
      ],
    });
  });

  it('rethrows yup operational exceptions unchanged, preserving identity', async () => {
    const operational = new Error(`upstream failure ${SENTINEL}`);
    const typeFailure = new TypeError(`bad cast ${SENTINEL}`);
    const plainMessageObject = { message: `TENANT_DB_PASSWORD=${SENTINEL}` };

    for (const thrown of [operational, typeFailure, plainMessageObject]) {
      const validator = fromYup({
        async validate() {
          throw thrown;
        },
      });

      await expect(validator({ select: ['name'] })).rejects.toBe(thrown);
    }
  });

  it('normalizes genuine vine validation failures with controlled paths/messages', async () => {
    const validator = fromVine({
      async validate() {
        throw vineValidationFailure;
      },
    });

    const result = await validator({ select: 'name' });
    expect(result).toEqual({
      success: false,
      issues: [{ message: 'Expected array', path: ['select'] }],
    });
  });

  it('rethrows vine operational exceptions unchanged, preserving identity', async () => {
    const operational = new Error(`upstream failure ${SENTINEL}`);
    const typeFailure = new TypeError(`bad cast ${SENTINEL}`);
    const bareMessagesObject = { messages: `not-an-array ${SENTINEL}` };

    for (const thrown of [operational, typeFailure, bareMessagesObject]) {
      const validator = fromVine({
        async validate() {
          throw thrown;
        },
      });

      await expect(validator({ select: ['name'] })).rejects.toBe(thrown);
    }
  });

  it('keeps operational sentinels out of validation output at the HTTP boundary', async () => {
    resetGlobalOptions();
    const app = express();

    const sharedOptions = {
      idField: 'id',
      operationAccess: {
        list: true,
        read: true,
      },
      data: [{ id: 'apple', name: 'Apple', public: true }],
      permissionSchema: {
        id: true,
        name: true,
        public: true,
      },
    };

    const yupRouter = acl.createDataRouter('arh05-yup-fruit', {
      ...sharedOptions,
      basePath: '/arh05-yup-fruit',
      requestSchemas: {
        advancedRead: fromYup({
          async validate(value) {
            const data = value as { select?: unknown };
            if (data.select === 'boom') {
              throw new Error(`yup upstream failure ${SENTINEL}`);
            }
            if (data.select !== undefined && !Array.isArray(data.select)) {
              throw {
                ...yupValidationFailure,
                message: 'select must be an array',
                errors: ['select must be an array'],
                inner: [yupValidationFailure.inner[0]],
              };
            }
            return data;
          },
        }),
      },
    });

    const vineRouter = acl.createDataRouter('arh05-vine-fruit', {
      ...sharedOptions,
      basePath: '/arh05-vine-fruit',
      requestSchemas: {
        advancedRead: fromVine({
          async validate(value) {
            const data = value as { select?: unknown };
            if (data.select === 'boom') {
              throw new TypeError(`vine upstream failure ${SENTINEL}`);
            }
            if (data.select !== undefined && !Array.isArray(data.select)) {
              throw vineValidationFailure;
            }
            return data;
          },
        }),
      },
    });

    app.use(express.json());
    app.use(yupRouter.routes);
    app.use(vineRouter.routes);

    for (const basePath of ['/arh05-yup-fruit', '/arh05-vine-fruit']) {
      await request(app)
        .post(`${basePath}/__query/apple`)
        .send({ select: 'name' })
        .expect(400)
        .expect('Content-Type', /application\/problem\+json/)
        .expect(({ body }) => {
          expect(JSON.stringify(body)).not.toContain(SENTINEL);
        });

      await request(app)
        .post(`${basePath}/__query/apple`)
        .send({ select: 'boom' })
        .expect(500)
        .expect('Content-Type', /application\/problem\+json/)
        .expect(({ body }) => {
          // Fail-closed server error under the configured policy
          // (routers/index.ts errorMessageProvider): RFC9457 500 shape,
          // not a 400 validation issue. Sentinel absence is asserted only
          // for 400 validation output, which must carry controlled messages.
          expect(body.status).toBe(500);
          expect(body.title).toBe('Internal Server Error');
          expect(body.errors).toBeUndefined();
        });

      await request(app)
        .post(`${basePath}/__query/apple`)
        .send({ select: ['name'] })
        .expect(200)
        .expect('Content-Type', /json/);
    }
  });
});
