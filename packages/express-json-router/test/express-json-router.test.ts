import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import JsonRouter from '../dist/index.mjs';

type RequestWithState = express.Request & {
  middlewareValue?: string;
  userId?: string;
  useValue?: string;
};

const defaultErrorMessageProvider = (error: unknown) => {
  const errorLike = error as { message?: string; _message?: string };

  return errorLike.message || errorLike._message || String(error);
};

const resetJsonRouter = () => {
  JsonRouter.errorMessageProvider = defaultErrorMessageProvider;
  JsonRouter.preJson = null;
  JsonRouter.postJson = null;
  JsonRouter.preError = null;
  JsonRouter.postError = null;
};

afterEach(() => {
  resetJsonRouter();
});

const expectJson = async (
  app: express.Express,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  status: number,
  value: unknown,
) => {
  const response = await request(app)[method](path).expect(status).expect('Content-Type', /json/);

  expect(response.body).toEqual(value);
};

describe('express-json-router', () => {
  it('wraps route handlers and collects registered endpoints', async () => {
    const app = express();
    const router = new JsonRouter();

    router.all('/all-route', () => 'all-route');
    router.get('/get-route', () => 'get-route');
    router.post('/post-route', () => 'post-route');
    router.put('/put-route', () => 'put-route');
    router.delete('/delete-route', () => 'delete-route');
    router
      .route('/route-route')
      .all((req, res, next) => next())
      .get(() => 'route-get-route')
      .post(() => 'route-post-route')
      .put(() => 'route-put-route')
      .delete(() => 'route-delete-route');

    app.use(router.original);

    await expectJson(app, 'get', '/all-route', 200, 'all-route');
    await expectJson(app, 'get', '/get-route', 200, 'get-route');
    await expectJson(app, 'post', '/post-route', 200, 'post-route');
    await expectJson(app, 'put', '/put-route', 200, 'put-route');
    await expectJson(app, 'delete', '/delete-route', 200, 'delete-route');
    await expectJson(app, 'get', '/route-route', 200, 'route-get-route');
    await expectJson(app, 'post', '/route-route', 200, 'route-post-route');
    await expectJson(app, 'put', '/route-route', 200, 'route-put-route');
    await expectJson(app, 'delete', '/route-route', 200, 'route-delete-route');

    expect(router.getEndpoints()).toEqual([
      { method: 'ALL', path: '/all-route' },
      { method: 'GET', path: '/get-route' },
      { method: 'POST', path: '/post-route' },
      { method: 'PUT', path: '/put-route' },
      { method: 'DELETE', path: '/delete-route' },
      { method: 'ALL', path: '/route-route' },
      { method: 'GET', path: '/route-route' },
      { method: 'POST', path: '/route-route' },
      { method: 'PUT', path: '/route-route' },
      { method: 'DELETE', path: '/route-route' },
    ]);
  });

  it('supports a base path and router-level middlewares', async () => {
    const app = express();
    const router = new JsonRouter('/api', (req, res, next) => {
      (req as RequestWithState).middlewareValue = 'middleware';
      next();
    });

    router.get('/status', (req) => ({
      middleware: (req as RequestWithState).middlewareValue,
      value: 'ok',
    }));

    app.use(router.original);

    await expectJson(app, 'get', '/api/status', 200, {
      middleware: 'middleware',
      value: 'ok',
    });
  });

  it('supports multiple router-level middlewares passed as an array', async () => {
    const app = express();
    const router = new JsonRouter('/api', [
      (req, res, next) => {
        (req as RequestWithState).middlewareValue = 'first';
        next();
      },
      (req, res, next) => {
        (req as RequestWithState).middlewareValue = `${(req as RequestWithState).middlewareValue}-second`;
        next();
      },
    ]);

    router.get('/status', (req) => ({ middleware: (req as RequestWithState).middlewareValue }));

    app.use(router.original);

    await expectJson(app, 'get', '/api/status', 200, {
      middleware: 'first-second',
    });
  });

  it('normalizes base paths and route paths when registering routes', async () => {
    const app = express();
    const router = new JsonRouter('api/');

    router.get('status', () => ({ ok: true }));

    app.use(router.original);

    await expectJson(app, 'get', '/api/status', 200, { ok: true });
    expect(router.getEndpoints()).toEqual([{ method: 'GET', path: '/api/status' }]);
  });

  it('supports chaining handlers with next()', async () => {
    const app = express();
    const router = new JsonRouter();

    router.get(
      '/next',
      (req, res, next) => {
        next();
        return 'ignored';
      },
      () => 'next-test',
    );

    app.use(router.original);

    await expectJson(app, 'get', '/next', 200, 'next-test');
  });

  it('proxies static error configuration to the shared response handler', async () => {
    const app = express();
    const router = new JsonRouter();
    let preJsonValue: unknown;

    JsonRouter.preJson = (value) => {
      preJsonValue = value;
    };

    JsonRouter.errorMessageProvider = () => 'custom-error-message';

    router.get('/value', () => 'apple');
    router.get('/error', () => {
      throw new Error('original-message');
    });

    app.use(router.original);

    await expectJson(app, 'get', '/value', 200, 'apple');
    expect(preJsonValue).toBe('apple');

    const errorResponse = await request(app).get('/error').expect(422);

    expect(errorResponse.body).toEqual({ message: 'custom-error-message' });
  });

  it('proxies post-json and error hooks to the shared response handler', async () => {
    const app = express();
    const router = new JsonRouter();
    const observed: string[] = [];

    JsonRouter.postJson = (value) => {
      observed.push(`post-json:${JSON.stringify(value)}`);
    };
    JsonRouter.preError = (error) => {
      observed.push(`pre-error:${(error as Error).message}`);
    };
    JsonRouter.postError = (error) => {
      observed.push(`post-error:${(error as Error).message}`);
    };

    expect(JsonRouter.postJson).toBeTypeOf('function');
    expect(JsonRouter.preError).toBeTypeOf('function');
    expect(JsonRouter.postError).toBeTypeOf('function');

    router.get('/value', () => ({ ok: true }));
    router.get('/error', () => {
      throw new Error('hook-error');
    });

    app.use(router.original);

    await expectJson(app, 'get', '/value', 200, { ok: true });
    await request(app).get('/error').expect(422, { message: 'hook-error' });

    expect(observed).toEqual(['post-json:{"ok":true}', 'pre-error:hook-error', 'post-error:hook-error']);
  });

  it('delegates use() and param() to the underlying express router', async () => {
    const app = express();
    const router = new JsonRouter();

    router.use((req, res, next) => {
      (req as RequestWithState).useValue = 'from-use';
      next();
    });

    router.param('userId', (req, res, next, userId) => {
      (req as RequestWithState).userId = userId;
      next();
    });

    router.get('/users/:userId', (req) => ({
      userId: (req as RequestWithState).userId,
      useValue: (req as RequestWithState).useValue,
    }));

    app.use(router.original);

    await expectJson(app, 'get', '/users/42', 200, {
      userId: '42',
      useValue: 'from-use',
    });
  });

  it('returns endpoint snapshots instead of exposing internal mutable state', () => {
    const router = new JsonRouter();

    router.get('/users', () => []);

    const endpoints = router.getEndpoints();
    endpoints.push({ method: 'POST', path: '/admin' });
    endpoints[0].path = '/mutated';

    expect(router.getEndpoints()).toEqual([{ method: 'GET', path: '/users' }]);
  });

  it('requires at least one route handler', () => {
    const router = new JsonRouter();

    expect(() => router.get('/missing-handler')).toThrow('at least one middleware handler is required');
  });

  it('exposes http error and response helpers', async () => {
    const app = express();
    const router = new JsonRouter();

    router.get('/created', () => JsonRouter.HttpResponse.created({ ok: true }));
    router.get('/unauthorized', () => {
      throw new JsonRouter.clientErrors.UnauthorizedError();
    });
    router.get('/success-created', () => new JsonRouter.success.Created({ ok: true }));

    app.use(router.original);

    await expectJson(app, 'get', '/created', 201, { ok: true });
    await expectJson(app, 'get', '/success-created', 201, { ok: true });

    const response = await request(app).get('/unauthorized').expect(401);

    expect(response.body).toEqual({ message: 'The user is not authorized' });
  });
});
