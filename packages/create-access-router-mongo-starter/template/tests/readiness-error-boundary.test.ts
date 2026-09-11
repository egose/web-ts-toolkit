// @vitest-environment node
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRouterRuntime } from '@web-ts-toolkit/access-router-runtime';
import config from '../api/access-router.config';
import { configureApiErrorBoundary, resolveExpressError } from '../api/src/errors';

afterEach(() => {
  vi.restoreAllMocks();
});

async function createReplSet() {
  const memory = (await import('mongodb-memory-server')) as unknown as {
    MongoMemoryReplSet: { create(opts?: unknown): Promise<{ getUri(): string; stop(): Promise<void> }> };
  };
  return memory.MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
}

function skipMessage(error: unknown): string {
  return (
    `[CARMSF-11] replica-set lane skipped: mongodb-memory-server unavailable (${error instanceof Error ? error.message : String(error)}). ` +
    'Prerequisite: mongodb-memory-server@^11.2.0 plus a cached/downloadable mongod binary ' +
    '(see https://github.com/nodkz/mongodb-memory-server). Isolated command: ' +
    'pnpm exec vitest run tests/readiness-error-boundary.test.ts'
  );
}

describe('backend readiness and error statuses (CARMSF-11)', () => {
  it('resolves only allowlisted parser errors; unknown errors stay generic 500', () => {
    expect(resolveExpressError({ type: 'entity.parse.failed', status: 400, statusCode: 400 }).statusCode).toBe(400);
    expect(resolveExpressError({ type: 'entity.parse.failed', status: 400, statusCode: 400 }).message).toBe(
      'Invalid request.',
    );
    expect(resolveExpressError({ type: 'entity.too.large', status: 413, statusCode: 413 }).statusCode).toBe(413);
    expect(resolveExpressError({ type: 'entity.too.large', status: 413, statusCode: 413 }).message).toBe(
      'Request too large.',
    );
    // Arbitrary payloads are never trusted: mismatched or unknown types fall back to generic 500.
    expect(resolveExpressError({ type: 'entity.too.large', status: 400, statusCode: 400 }).statusCode).toBe(500);
    expect(resolveExpressError({ type: 'bogus', statusCode: 400 }).statusCode).toBe(500);
    expect(resolveExpressError({ statusCode: 400 }).statusCode).toBe(500);
    expect(resolveExpressError(Object.assign(new Error('boom'), { statusCode: 413 })).statusCode).toBe(500);
    expect(resolveExpressError(new Error('boom')).statusCode).toBe(500);
  });

  it('waits for model index readiness and fails init when index creation fails', async () => {
    let replSet: { getUri(): string; stop(): Promise<void> } | undefined;
    try {
      replSet = await createReplSet();
    } catch (error) {
      console.warn(skipMessage(error));
      return;
    }
    const uri = replSet.getUri();
    const connection = await mongoose.createConnection(uri).asPromise();
    try {
      const runtime = createAccessRouterRuntime({
        ...config,
        db: { url: uri, options: { dbName: `carmsf11_ready_${Date.now()}` } },
      });
      configureApiErrorBoundary(runtime.modelRouters);
      const category = (runtime.models as Record<string, { init: () => Promise<unknown> }>).Category;
      const realInit = category.init.bind(category);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const gated = vi.spyOn(category, 'init').mockImplementation(async () => {
        await gate;
        return realInit();
      });
      const pending = runtime.init();
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      // Index readiness gates runtime readiness: init stays pending while the model init is delayed.
      expect(settled).toBe(false);
      expect(gated).toHaveBeenCalled();
      release();
      await pending;
      await runtime.shutdown();

      const failing = createAccessRouterRuntime({
        ...config,
        db: { url: uri, options: { dbName: `carmsf11_fail_${Date.now()}` } },
      });
      configureApiErrorBoundary(failing.modelRouters);
      const failingCategory = (failing.models as Record<string, { init: () => Promise<unknown> }>).Category;
      // Persistent rejection: Mongoose's `openUri` also invokes `Model.init()`
      // during `database.connect()` before the template readiness check runs,
      // so a one-shot rejection would be consumed by connect instead of the
      // awaited readiness gate. Either path must surface the index failure.
      const failingInit = vi.spyOn(failingCategory, 'init').mockRejectedValue(new Error('index build failed'));
      await expect(failing.init()).rejects.toThrow('index build failed');
      expect(failingInit).toHaveBeenCalled();
    } finally {
      await connection.close();
      await replSet.stop();
    }
  }, 180_000);

  it('concurrent duplicate Category creation on a fresh database yields one record and a sanitized conflict', async () => {
    let replSet: { getUri(): string; stop(): Promise<void> } | undefined;
    try {
      replSet = await createReplSet();
    } catch (error) {
      console.warn(skipMessage(error));
      return;
    }
    const uri = replSet.getUri();
    const connection = await mongoose.createConnection(uri).asPromise();
    try {
      const runtime = createAccessRouterRuntime({
        ...config,
        db: { url: uri, options: { dbName: `carmsf11_${Date.now()}` } },
      });
      configureApiErrorBoundary(runtime.modelRouters);
      // Readiness waits for the non-destructive Category unique index.
      await runtime.init();
      const app = runtime.app;

      const name = `dup-${Date.now()}`;
      const [first, second] = await Promise.all([
        request(app).post('/api/categories').send({ name }),
        request(app).post('/api/categories').send({ name }),
      ]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);
      const conflict = first.status === 409 ? first : second;
      expect(conflict.body).toMatchObject({ status: 409, detail: 'Resource conflict.' });
      const serialized = JSON.stringify(conflict.body);
      expect(serialized).not.toContain('E11000');
      expect(serialized).not.toContain('duplicate key');
      const list = await request(app).post('/api/categories/__query').send({ filter: { name } }).expect(200);
      const items = ((list.body as { data?: unknown[] }).data ?? []) as unknown[];
      expect(items).toHaveLength(1);
      await runtime.shutdown();
    } finally {
      await connection.close();
      await replSet.stop();
    }
  }, 180_000);

  it('returns sanitized 400/413 for parser errors through local and serverless paths', async () => {
    const runtime = createAccessRouterRuntime({ ...config, db: undefined });
    configureApiErrorBoundary(runtime.modelRouters);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = runtime.app;

    const malformed = await request(app)
      .post('/api/todos')
      .set('Content-Type', 'application/json')
      .send('{"title":')
      .expect(400);
    expect(malformed.body).toEqual({ success: false, message: 'Invalid request.' });

    const oversizedTitle = 'x'.repeat(2 * 1024 * 1024);
    const oversized = await request(app).post('/api/todos').send({ title: oversizedTitle }).expect(413);
    expect(oversized.body).toEqual({ success: false, message: 'Request too large.' });

    // Raw payloads and parser internals never leak; each parser failure logs exactly once.
    expect(JSON.stringify(malformed.body)).not.toContain('{"title":');
    expect(JSON.stringify(oversized.body)).not.toContain(oversizedTitle.slice(0, 32));
    expect(log).toHaveBeenCalledTimes(2);
    for (const call of log.mock.calls) {
      expect(call[0]).toMatch(/^\{"event":"api_error","boundary":"express"/u);
      expect(call.join(' ')).not.toContain('x'.repeat(32));
    }

    const handler = runtime.createServerlessHandler();
    const malformedEvent = (await handler(
      {
        httpMethod: 'POST',
        path: '/api/todos',
        headers: { 'content-type': 'application/json' },
        body: '{"title":',
      },
      {},
    )) as { statusCode: number; body: string };
    expect(malformedEvent.statusCode).toBe(400);
    expect(JSON.parse(malformedEvent.body)).toEqual({ success: false, message: 'Invalid request.' });

    const oversizedEvent = (await handler(
      {
        httpMethod: 'POST',
        path: '/api/todos',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: oversizedTitle }),
      },
      {},
    )) as { statusCode: number; body: string };
    expect(oversizedEvent.statusCode).toBe(413);
    expect(JSON.parse(oversizedEvent.body)).toEqual({ success: false, message: 'Request too large.' });
  }, 60_000);

  it('keeps unknown express failures generic 500 with credential-safe single logging', async () => {
    const runtime = createAccessRouterRuntime({ ...config, db: undefined });
    configureApiErrorBoundary(runtime.modelRouters);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secretError = new Error('mongodb://user:password@private-host/private-db secret-value'); // pragma: allowlist secret
    const { default: errorHandlerConfig } = await import('../api/access-router.config');
    const handler = (errorHandlerConfig.express as { errorHandler: (...args: never[]) => void }).errorHandler;
    const statuses: number[] = [];
    const bodies: unknown[] = [];
    const res = {
      status: (code: number) => ({
        json: (body: unknown) => {
          statuses.push(code);
          bodies.push(body);
        },
      }),
    };
    handler(secretError as never, {} as never, res as never, (() => undefined) as never);
    expect(statuses).toEqual([500]);
    expect(bodies).toEqual([{ success: false, message: 'Unexpected server error.' }]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.join(' ')).not.toContain('password');
    expect(log.mock.calls[0]?.join(' ')).not.toContain('secret-value');
  });
});
