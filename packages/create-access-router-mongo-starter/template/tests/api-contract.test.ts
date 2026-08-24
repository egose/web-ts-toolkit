// @vitest-environment node
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRouterRuntime } from '@web-ts-toolkit/access-router-runtime';
import mongoose from 'mongoose';
import config from '../api/access-router.config';
import {
  IntegrityConflictError,
  abortIntegrityWrite,
  beginCategoryIntegrityDelete,
  beginTodoIntegrityWrite,
  commitIntegrityWrite,
} from '../api/src/integrity';
import { categorySchema, todoSchema } from '../api/src/models';
import { categoryRouterOptions, todoRouterOptions } from '../api/src/routers';
import { requireMongoUri } from '../api/src/config';
import { configureApiErrorBoundary } from '../api/src/errors';
import {
  CATEGORY_NAME_MAX_LENGTH,
  TODO_TITLE_MAX_LENGTH,
  categoryCreateSchema,
  todoCreateSchema,
} from '../src/shared/entity-schemas';

const runtime = createAccessRouterRuntime(config);
configureApiErrorBoundary(runtime.modelRouters);
const todoModel = runtime.models.Todo;
const categoryModel = runtime.models.Category;

afterEach(() => {
  vi.restoreAllMocks();
});

function serverlessEvent(method: string, path: string, body?: unknown) {
  return {
    httpMethod: method,
    path,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

async function waitForListening(server: { listening: boolean; once(event: string, listener: () => void): unknown }) {
  if (server.listening) return;
  await new Promise<void>((resolve) => server.once('listening', resolve));
}

describe('backend route contract', () => {
  it.each([undefined, '', '   ', 'https://example.test/db', 'mongodb+srv://host:27017/db', 'mongodb://'])(
    'rejects missing, blank, or malformed Mongo configuration: %j',
    (value) => {
      expect(() => requireMongoUri(value)).toThrow(
        'MONGODB_URI must be a nonblank MongoDB connection string using mongodb:// or mongodb+srv://.',
      );
    },
  );

  it('accepts and trims standard and SRV MongoDB connection strings', () => {
    expect(requireMongoUri('  mongodb://127.0.0.1:27017/app  ')).toBe('mongodb://127.0.0.1:27017/app');
    expect(requireMongoUri('mongodb+srv://cluster.example.test/app')).toBe('mongodb+srv://cluster.example.test/app');
  });

  it('rejects the runtime config itself when Mongo configuration is blank', async () => {
    const original = process.env.MONGODB_URI;
    process.env.MONGODB_URI = '   ';
    vi.resetModules();
    try {
      await expect(import('../api/access-router.config')).rejects.toThrow(
        'MONGODB_URI must be a nonblank MongoDB connection string using mongodb:// or mongodb+srv://.',
      );
    } finally {
      process.env.MONGODB_URI = original;
      vi.resetModules();
    }
  });

  it('normalizes accepted entity strings through the shared schemas', () => {
    expect(todoCreateSchema.parse({ title: '  Ship it  ' })).toEqual({ title: 'Ship it', completed: false });
    expect(categoryCreateSchema.parse({ name: '  Urgent  ', color: '  #AABBCC  ' })).toEqual({
      name: 'Urgent',
      color: '#aabbcc',
    });
  });

  it('defines deterministic list-supporting indexes and exact normalized category-name uniqueness', () => {
    expect(categorySchema.indexes()).toContainEqual([{ name: 1 }, { unique: true }]);
    expect(todoSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ categoryId: 1, _id: -1 }, {}],
        [{ completed: 1, _id: -1 }, {}],
      ]),
    );
  });

  it('rejects a missing category before a Todo create reaches persistence', async () => {
    const categoryExists = vi.spyOn(categoryModel, 'exists').mockResolvedValueOnce(null);
    const todoCreate = vi.spyOn(todoModel, 'create');

    const response = await request(runtime.app)
      .post('/api/todos')
      .send({
        title: 'Cannot dangle',
        categoryId: '507f1f77bcf86cd799439011', // pragma: allowlist secret
      })
      .expect(400);

    expect(response.body).toMatchObject({ status: 400 });
    expect(categoryExists).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011' });
    expect(todoCreate).not.toHaveBeenCalled();
  });

  it('uses one category write lock and transaction for racing Todo writes and Category deletion', async () => {
    const events: string[] = [];
    const session = {
      startTransaction: () => events.push('transaction:start'),
      commitTransaction: async () => events.push('transaction:commit'),
      abortTransaction: async () => events.push('transaction:abort'),
      endSession: async () => events.push('session:end'),
    };
    const categoryModel = {
      db: { startSession: async () => session },
      findOneAndUpdate: async (_filter: unknown, _update: unknown, options: { session: unknown }) => {
        expect(options.session).toBe(session);
        events.push('category:lock');
        return { _id: 'category' };
      },
    };
    const todoModel = {
      exists: () => ({
        session: async (activeSession: unknown) => {
          expect(activeSession).toBe(session);
          events.push('todo:reference-check');
          return null;
        },
      }),
    };
    const document = {
      _id: 'category',
      categoryId: 'category',
      $model: (name?: string) => (name === 'Todo' ? todoModel : categoryModel),
      $session: (activeSession: unknown) => expect(activeSession).toBe(session),
    };

    await beginTodoIntegrityWrite(document as never);
    await commitIntegrityWrite(document);
    await beginCategoryIntegrityDelete(document as never);
    await commitIntegrityWrite(document);

    expect(events).toEqual([
      'transaction:start',
      'category:lock',
      'transaction:commit',
      'session:end',
      'transaction:start',
      'category:lock',
      'todo:reference-check',
      'transaction:commit',
      'session:end',
    ]);
  });

  it('aborts category deletion with conflict while a Todo reference exists', async () => {
    const abort = vi.fn(async () => undefined);
    const end = vi.fn(async () => undefined);
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: abort,
      endSession: end,
    };
    const categoryModel = {
      db: { startSession: async () => session },
      findOneAndUpdate: async () => ({ _id: 'category' }),
    };
    const todoModel = { exists: () => ({ session: async () => ({ _id: 'todo' }) }) };
    const document = {
      _id: 'category',
      $model: (name?: string) => (name === 'Todo' ? todoModel : categoryModel),
      $session: vi.fn(),
    };

    await expect(beginCategoryIntegrityDelete(document as never)).rejects.toBeInstanceOf(IntegrityConflictError);
    expect(abort).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    await abortIntegrityWrite(document);
    expect(abort).toHaveBeenCalledOnce();
  });

  it.each([
    ['/api/todos', { title: '   ' }],
    ['/api/todos', { title: 'x'.repeat(TODO_TITLE_MAX_LENGTH + 1) }],
    ['/api/todos', { title: 'Valid', categoryId: 'not-an-object-id' }],
    ['/api/categories', { name: '   ' }],
    ['/api/categories', { name: 'x'.repeat(CATEGORY_NAME_MAX_LENGTH + 1) }],
    ['/api/categories', { name: 'Valid', color: 'blue' }],
  ])('rejects invalid create input at %s before Mongoose', async (path, body) => {
    const todoCreate = vi.spyOn(todoModel, 'create');
    const categoryCreate = vi.spyOn(categoryModel, 'create');

    const response = await request(runtime.app).post(path).send(body).expect(400);

    expect(response.body).toMatchObject({ status: 400, detail: 'Invalid request.' });
    expect(todoCreate).not.toHaveBeenCalled();
    expect(categoryCreate).not.toHaveBeenCalled();
  });

  it('rejects malformed document IDs before Mongoose', async () => {
    const findOne = vi.spyOn(todoModel, 'findOne');

    await request(runtime.app).get('/api/todos/not-an-object-id').expect(400);
    await request(runtime.app).patch('/api/todos/not-an-object-id').send({ title: 'Valid' }).expect(400);
    await request(runtime.app).delete('/api/todos/not-an-object-id').expect(400);
    await request(runtime.app).post('/api/todos/__query/not-an-object-id').send({}).expect(400);

    expect(findOne).not.toHaveBeenCalled();
  });

  it('allows only indexed exact-match list filters and the deterministic default sort', async () => {
    const find = vi.spyOn(todoModel, 'find');

    await request(runtime.app)
      .post('/api/todos/__query')
      .send({ filter: { title: 'unindexed' } })
      .expect(400);
    await request(runtime.app)
      .post('/api/todos/__query')
      .send({ sort: { title: 1 } })
      .expect(400);

    expect(find).not.toHaveBeenCalled();
    expect(todoRouterOptions.defaults).toEqual({ publicListArgs: { sort: { _id: -1 } } });
    expect(categoryRouterOptions.defaults).toEqual({ publicListArgs: { sort: { name: 1, _id: 1 } } });
  });

  it.each([{ title: '   ' }, { title: 'x'.repeat(TODO_TITLE_MAX_LENGTH + 1) }, { categoryId: 'not-an-object-id' }])(
    'rejects invalid update input before Mongoose',
    async (body) => {
      const findOne = vi.spyOn(todoModel, 'findOne');

      await request(runtime.app).patch('/api/todos/507f1f77bcf86cd799439011').send(body).expect(400);

      expect(findOne).not.toHaveBeenCalled();
    },
  );

  it('does not expose root or advanced mutation writes', async () => {
    const todoCreate = vi.spyOn(todoModel, 'create');
    const findOne = vi.spyOn(todoModel, 'findOne');

    await request(runtime.app).post('/api/root').send([]).expect(404);
    await request(runtime.app)
      .post('/api/todos/__mutation')
      .send({ data: { title: 'Bypass' } })
      .expect(404);
    await request(runtime.app)
      .patch('/api/todos/__mutation/507f1f77bcf86cd799439011')
      .send({ data: { title: 'Bypass' } })
      .expect(404);
    await request(runtime.app)
      .put('/api/todos/__mutation')
      .send({ data: { title: 'Bypass' } })
      .expect(404);

    expect(todoCreate).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rejects oversized alternate-write batches before Mongoose', async () => {
    const todoCreate = vi.spyOn(todoModel, 'create');
    const oversizedBatch = Array.from({ length: 101 }, (_, index) => ({ title: `Todo ${index}` }));

    await request(runtime.app).post('/api/root').send(oversizedBatch).expect(404);
    await request(runtime.app).post('/api/todos/__mutation/').send({ data: oversizedBatch }).expect(404);

    expect(todoCreate).not.toHaveBeenCalled();
  });

  it('returns 404 for a valid but missing document ID', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      then: (resolve: (value: null) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(null).then(resolve, reject),
    };
    const findOne = vi.spyOn(todoModel, 'findOne').mockReturnValue(query as never);

    await request(runtime.app).get('/api/todos/507f1f77bcf86cd799439011').expect(404);

    // The default read contract retries with list access before returning not found.
    expect(findOne).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['Mongoose validation', () => new mongoose.Error.ValidationError(), 400, 'Invalid request.'],
    [
      'Mongoose cast',
      () => new mongoose.Error.CastError('ObjectId', 'private-value', 'categoryId'),
      400,
      'Invalid request.',
    ],
    [
      'duplicate key',
      () => Object.assign(new Error('E11000 duplicate key collection: private.todos'), { code: 11000 }),
      409,
      'Resource conflict.',
    ],
    [
      'racing transaction write conflict',
      () => Object.assign(new Error('private transaction details'), { code: 112 }),
      409,
      'Resource conflict.',
    ],
    [
      'unexpected',
      () => new Error('mongodb://user:password@private-host/private-db private.todos secret-value'), // pragma: allowlist secret
      500,
      'Unexpected server error.',
    ],
  ])('sanitizes %s failures at the access-router response boundary', async (_label, createError, status, detail) => {
    vi.spyOn(todoModel, 'create').mockRejectedValueOnce(createError());
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(runtime.app).post('/api/todos').send({ title: 'Valid' }).expect(status);
    const serialized = JSON.stringify(response.body);

    expect(response.body).toMatchObject({ status, detail });
    expect(serialized).not.toContain('private');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('secret-value');
    expect(serialized).not.toContain('categoryId');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatch(/^\{"event":"api_error","boundary":"access-router"/u);
    expect(log.mock.calls[0]?.join(' ')).not.toContain('private-value');
  });

  it('returns the same validation response through local and serverless entry paths', async () => {
    const parityRuntime = createAccessRouterRuntime({ ...config, db: undefined });
    const local = parityRuntime.startLocalServer({
      host: '127.0.0.1',
      port: 0,
      signals: false,
      logger: { log: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });
    await waitForListening(local.server);

    try {
      const localResponse = await request(local.server).post('/api/todos').send({ title: '   ' }).expect(400);
      const handler = parityRuntime.createServerlessHandler();
      const serverlessResponse = (await handler(serverlessEvent('POST', '/api/todos', { title: '   ' }), {})) as {
        statusCode: number;
        body: string;
      };

      expect(serverlessResponse.statusCode).toBe(localResponse.status);
      expect(JSON.parse(serverlessResponse.body)).toEqual(localResponse.body);
    } finally {
      await local.shutdown();
    }
  });

  it('recovers local and serverless entry paths after transient initialization failure', async () => {
    const createRetryRuntime = () => {
      let attempts = 0;
      const retryRuntime = createAccessRouterRuntime({
        ...config,
        db: undefined,
        init() {
          attempts += 1;
          if (attempts === 1) throw new Error('transient initialization failure');
        },
      });
      configureApiErrorBoundary(retryRuntime.modelRouters);
      return retryRuntime;
    };

    const localRuntime = createRetryRuntime();
    await expect(localRuntime.init()).rejects.toThrow('transient initialization failure');
    await localRuntime.init();

    const recoveredLocal = localRuntime.startLocalServer({
      host: '127.0.0.1',
      port: 0,
      signals: false,
      logger: { log: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });
    await waitForListening(recoveredLocal.server);
    await request(recoveredLocal.server).get('/api').expect(200);
    await recoveredLocal.shutdown();

    const serverlessRuntime = createRetryRuntime();
    await expect(serverlessRuntime.init()).rejects.toThrow('transient initialization failure');
    await serverlessRuntime.init();
    const handler = serverlessRuntime.createServerlessHandler();
    const response = (await handler(serverlessEvent('GET', '/api'), {})) as { statusCode: number };
    expect(response.statusCode).toBe(200);
  });
});
