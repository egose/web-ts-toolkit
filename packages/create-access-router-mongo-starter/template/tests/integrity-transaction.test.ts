// @vitest-environment node
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { IntegrityConflictError, commitIntegrityWrite } from '../api/src/integrity';
import { categorySchema, todoSchema } from '../api/src/models';

function fakeSession(events: string[] = [], marker = `tx-${Date.now()}-${Math.floor(Math.random() * 1e6)}`) {
  return {
    marker,
    startTransaction: () => undefined,
    commitTransaction: async () => {
      events.push('commit');
    },
    abortTransaction: async () => {
      events.push('abort');
    },
    endSession: async () => {
      events.push('end');
    },
  };
}

function mockIntegrityDb(model: any, session: unknown) {
  vi.spyOn(model, 'db', 'get').mockReturnValue({ startSession: async () => session, base: mongoose } as never);
}

function createdId(response: { body: unknown }, label: string): string {
  const body = response.body as {
    data?: unknown;
    _id?: unknown;
    id?: unknown;
  };
  const data = body?.data as { _id?: unknown; id?: unknown } | string | undefined;
  const candidate =
    (typeof data === 'object' && data !== null ? (data._id ?? data.id) : undefined) ??
    (typeof data === 'string' ? data : undefined) ??
    body?._id ??
    body?.id;
  expect(candidate, `${label} response shape: ${JSON.stringify(body)?.slice(0, 500)}`).toBeDefined();
  return String(candidate);
}

describe('category delete binds the actual operation to the integrity transaction (CARMSF-10)', () => {
  it('routes the real Mongoose collection delete through the transaction session (no database)', async () => {
    const events: string[] = [];
    const session = fakeSession(events);
    const modelName = `NoDbCategory_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const Category = mongoose.model(modelName, categorySchema);
    try {
      const doc = new Category({ name: 'unreferenced' });
      mockIntegrityDb(Category, session);
      const lockSpy = vi.spyOn(Category, 'findOneAndUpdate').mockResolvedValue({ _id: 'category' } as never);
      const todoModel = { exists: () => ({ session: async () => null }) };
      (vi.spyOn(doc as any, '$model') as any).mockImplementation((name?: string) =>
        name === 'Todo' ? todoModel : Category,
      );
      const collectionCalls: Array<{ filter: unknown; options: unknown }> = [];
      vi.spyOn(Category.collection, 'deleteOne').mockImplementation((async (filter: unknown, options: unknown) => {
        collectionCalls.push({ filter, options });
        return { acknowledged: true, deletedCount: 1 };
      }) as never);

      await (doc as unknown as { deleteOne: () => Promise<unknown> }).deleteOne();
      await commitIntegrityWrite(doc);

      expect(lockSpy).toHaveBeenCalledOnce();
      // The category lock and reference check run inside the transaction
      // (identical session object, passed by reference through model calls).
      expect(((lockSpy.mock.calls[0]?.[2] ?? {}) as { session?: unknown }).session).toBe(session);
      expect(collectionCalls).toHaveLength(1);
      // Mongoose deep-clones query options before reaching the collection
      // (see Query.prototype._optionsForExec), so the collection sees a copy:
      // assert it carries the intended transaction's unique marker instead of
      // being absent (the pre-fix defect left it undefined).
      const collectionSession = (collectionCalls[0]?.options as { session?: unknown } | undefined)?.session;
      expect(collectionSession).toBeDefined();
      expect(collectionSession).toMatchObject({ marker: (session as { marker: string }).marker });
      expect(events).toEqual(['commit', 'end']);
    } finally {
      vi.restoreAllMocks();
      mongoose.deleteModel(modelName);
    }
  });

  it('aborts before any collection delete when a Todo reference exists (no database)', async () => {
    const events: string[] = [];
    const session = fakeSession(events);
    const modelName = `NoDbCategoryRef_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const Category = mongoose.model(modelName, categorySchema);
    try {
      const doc = new Category({ name: 'referenced' });
      mockIntegrityDb(Category, session);
      vi.spyOn(Category, 'findOneAndUpdate').mockResolvedValue({ _id: 'category' } as never);
      const todoModel = { exists: () => ({ session: async () => ({ _id: 'todo' }) }) };
      (vi.spyOn(doc as any, '$model') as any).mockImplementation((name?: string) =>
        name === 'Todo' ? todoModel : Category,
      );
      const collectionSpy = vi
        .spyOn(Category.collection, 'deleteOne')
        .mockImplementation((async () => ({ acknowledged: true, deletedCount: 0 })) as never);

      await expect((doc as unknown as { deleteOne: () => Promise<unknown> }).deleteOne()).rejects.toBeInstanceOf(
        IntegrityConflictError,
      );
      expect(collectionSpy).not.toHaveBeenCalled();
      expect(events).toEqual(['abort', 'end']);
    } finally {
      vi.restoreAllMocks();
      mongoose.deleteModel(modelName);
    }
  });

  it('preserves save-hook behavior for uncategorized Todo deletes (no database)', async () => {
    const modelName = `NoDbTodo_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const Todo = mongoose.model(modelName, todoSchema);
    try {
      const doc = new Todo({ title: 'plain' });
      const collectionCalls: unknown[] = [];
      vi.spyOn(Todo.collection, 'deleteOne').mockImplementation((async (...args: unknown[]) => {
        collectionCalls.push(args);
        return { acknowledged: true, deletedCount: 1 };
      }) as never);

      await (doc as unknown as { deleteOne: () => Promise<unknown> }).deleteOne();

      // No category reference means no integrity transaction is started; the
      // delete still executes exactly once through the real collection path.
      expect(collectionCalls).toHaveLength(1);
    } finally {
      vi.restoreAllMocks();
      mongoose.deleteModel(modelName);
    }
  });
});

describe('category delete integrity against a transaction-capable replica set (CARMSF-10)', () => {
  it('deletes unreferenced Categories, rejects referenced deletion, and survives concurrent ref creation/deletion via routes', async () => {
    let replSet: { getUri(): string; stop(): Promise<void> } | undefined;
    try {
      const memory = (await import('mongodb-memory-server')) as unknown as {
        MongoMemoryReplSet: { create(opts?: unknown): Promise<{ getUri(): string; stop(): Promise<void> }> };
      };
      replSet = await memory.MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: 'wiredTiger' },
      });
    } catch (error) {
      console.warn(
        `[CARMSF-10] replica-set lane skipped: mongodb-memory-server unavailable (${error instanceof Error ? error.message : String(error)}). ` +
          'Prerequisite: pnpm add -D mongodb-memory-server@^11.2.0 plus a cached/downloadable mongod binary ' +
          '(see https://github.com/nodkz/mongodb-memory-server). Isolated command: ' +
          'pnpm exec vitest run tests/integrity-transaction.test.ts',
      );
      return;
    }

    const uri = replSet.getUri();
    const connection = await mongoose.createConnection(uri).asPromise();
    try {
      const [{ createAccessRouterRuntime }, configModule] = await Promise.all([
        import('@web-ts-toolkit/access-router-runtime'),
        import('../api/access-router.config'),
      ]);
      const runtime = createAccessRouterRuntime({
        ...configModule.default,
        db: { url: uri, options: { dbName: `carmsf10_${Date.now()}` } },
      });
      const { configureApiErrorBoundary } = await import('../api/src/errors');
      configureApiErrorBoundary(runtime.modelRouters);
      await runtime.init();
      const app = runtime.app;

      // Unreferenced delete succeeds through the route.
      const created = await request(app).post('/api/categories').send({ name: 'solo' }).expect(201);
      const soloIdString = createdId(created, 'create solo category');
      await request(app).delete(`/api/categories/${soloIdString}`).expect(200);
      await request(app).get(`/api/categories/${soloIdString}`).expect(404);

      // Referenced delete is rejected and does not hide an outside-tx delete.
      const refCategory = await request(app).post('/api/categories').send({ name: 'referenced' }).expect(201);
      const refId = createdId(refCategory, 'create referenced category');
      await request(app).post('/api/todos').send({ title: 'linked', categoryId: refId }).expect(201);
      await request(app).delete(`/api/categories/${refId}`).expect(409);
      // The rejected delete must not have committed outside its transaction.
      await request(app).get(`/api/categories/${refId}`).expect(200);

      // Concurrent reference creation vs deletion never leaves a dangling
      // reference and never leaks the session (follow-up writes still work).
      const raceCategory = await request(app).post('/api/categories').send({ name: 'race' }).expect(201);
      const raceId = createdId(raceCategory, 'create race category');
      const [todoOutcome, deleteOutcome] = await Promise.allSettled([
        request(app).post('/api/todos').send({ title: 'racer', categoryId: raceId }),
        request(app).delete(`/api/categories/${raceId}`),
      ]);
      const todoStatus = todoOutcome.status === 'fulfilled' ? todoOutcome.value.status : Number.NaN;
      const deleteStatus = deleteOutcome.status === 'fulfilled' ? deleteOutcome.value.status : Number.NaN;
      expect([201, 400]).toContain(todoStatus);
      expect([200, 409]).toContain(deleteStatus);
      if (deleteStatus === 200) {
        // Winner: delete. A late Todo create must then fail closed.
        expect(todoStatus).toBe(400);
      } else {
        // Winner: todo create. The delete must have been rejected.
        expect(todoStatus).toBe(201);
        expect(deleteStatus).toBe(409);
      }
      // Sessions terminated: the database still accepts transactional work.
      const after = await request(app).post('/api/categories').send({ name: 'after-race' }).expect(201);
      expect(createdId(after, 'create post-race category')).toMatch(/^[0-9a-f]{24}$/i);
    } finally {
      await connection.close();
      await replSet.stop();
    }
  }, 180_000);
});
