import express from 'express';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { BadRequestError } from '@web-ts-toolkit/http-errors';

import JsonRouter from '../dist/index.mjs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports: {
    '.': {
      types: { import: string; require: string; default: string };
      import: string;
      require: string;
      default: string;
    };
  };
};
const packageRoot = path.resolve(__dirname, '..');

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

const requestWithMethod = (app: express.Express, method: string, path: string) => {
  const agent = request(app) as unknown as Record<string, (path: string) => request.Test>;

  return agent[method](path);
};

describe('express-json-router', () => {
  it('declares conditional declaration and runtime entrypoints in package metadata', () => {
    expect(pkg.exports['.']).toEqual({
      types: {
        import: './dist/index.d.mts',
        require: './dist/index.d.ts',
        default: './dist/index.d.ts',
      },
      import: './dist/index.mjs',
      require: './dist/index.js',
      default: './dist/index.js',
    });
  });

  it('pins Express ownership as a direct runtime dependency with public declarations installed', () => {
    expect(pkg.dependencies?.express).toBe('^5.2.1');
    expect(pkg.dependencies?.['@types/express']).toBe('^5.0.6');
    expect(pkg.peerDependencies?.express).toBeUndefined();
    expect(pkg.devDependencies?.['@types/express']).toBeUndefined();
  });

  it('resolves package-name ESM and CJS runtime consumers to the intended entrypoints', () => {
    const esm = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        [
          "const entry = import.meta.resolve('@web-ts-toolkit/express-json-router');",
          "const mod = await import('@web-ts-toolkit/express-json-router');",
          "if (!entry.endsWith('/dist/index.mjs')) throw new Error(entry);",
          "if (typeof mod.default !== 'function') throw new Error('missing ESM default export');",
        ].join('\n'),
      ],
      { cwd: packageRoot, encoding: 'utf8' },
    );
    const cjs = execFileSync(
      process.execPath,
      [
        '-e',
        [
          "const entry = require.resolve('@web-ts-toolkit/express-json-router');",
          "const mod = require('@web-ts-toolkit/express-json-router');",
          "if (!entry.endsWith('/dist/index.js')) throw new Error(entry);",
          "if (typeof mod.default !== 'function') throw new Error('missing CJS default export');",
        ].join('\n'),
      ],
      { cwd: packageRoot, encoding: 'utf8' },
    );

    expect(esm).toBe('');
    expect(cjs).toBe('');
  });

  it('keeps the supported route method contract in parity with Express 5', () => {
    const expressRouter = express.Router() as unknown as Record<string, unknown>;
    const expressMethods = ['all', ...http.METHODS.map((method) => method.toLowerCase())].filter(
      (method) => typeof expressRouter[method] === 'function',
    );

    expect([...JsonRouter.supportedMethods].sort()).toEqual([...expressMethods].sort());
    expect(Object.isFrozen(JsonRouter.supportedMethods)).toBe(true);
    expect(() => {
      (JsonRouter.supportedMethods as unknown as string[]).push('mutated');
    }).toThrow(TypeError);
  });

  it('defines every supported route registrar as non-enumerable, non-writable, and chainable', () => {
    const router = new JsonRouter();

    for (const method of JsonRouter.supportedMethods) {
      const descriptor = Object.getOwnPropertyDescriptor(router, method);

      expect(descriptor).toMatchObject({
        enumerable: false,
        writable: false,
        configurable: false,
      });
      expect(descriptor?.value).toBeTypeOf('function');
      expect(router[method](`/${method}`, () => method)).toBe(router);
    }

    expect(router.getEndpoints()).toEqual(
      JsonRouter.supportedMethods.map((method) => ({
        method: method.toUpperCase(),
        path: `/${method}`,
      })),
    );
  });

  it('defines every supported route() builder as non-enumerable, non-writable, and chainable', () => {
    const router = new JsonRouter();
    const builder = router.route('/shared');

    for (const method of JsonRouter.supportedMethods) {
      const descriptor = Object.getOwnPropertyDescriptor(builder, method);

      expect(descriptor).toMatchObject({
        enumerable: false,
        writable: false,
        configurable: false,
      });
      expect(descriptor?.value).toBeTypeOf('function');
      expect(builder[method](() => method)).toBe(builder);
    }

    expect(router.getEndpoints()).toEqual(
      JsonRouter.supportedMethods.map((method) => ({
        method: method.toUpperCase(),
        path: '/shared',
      })),
    );
  });

  it('wraps newly supported Express methods with JSON response handling', async () => {
    const app = express();
    const router = new JsonRouter();

    router.propfind('/propfind', () => ({ method: 'propfind' }));
    router.proppatch('/proppatch', () => ({ method: 'proppatch' }));
    router.query('/query', () => ({ method: 'query' }));

    app.use(router.original);

    await requestWithMethod(app, 'propfind', '/propfind')
      .expect('Content-Type', /json/)
      .expect(200, { method: 'propfind' });
    await requestWithMethod(app, 'proppatch', '/proppatch')
      .expect('Content-Type', /json/)
      .expect(200, { method: 'proppatch' });
    await requestWithMethod(app, 'query', '/query').expect('Content-Type', /json/).expect(200, { method: 'query' });

    expect(router.getEndpoints()).toEqual([
      { method: 'PROPFIND', path: '/propfind' },
      { method: 'PROPPATCH', path: '/proppatch' },
      { method: 'QUERY', path: '/query' },
    ]);
  });

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

  it('rejects non-string base paths and route paths with a stable package error', () => {
    expect(() => new JsonRouter(/^\/api/ as never)).toThrow('JsonRouter basePath must be a string path');

    const router = new JsonRouter('/api');

    expect(() => router.get(/^\/status/ as never, () => ({ ok: true }))).toThrow(
      'JsonRouter route path must be a string path',
    );
    expect(() => router.get(['/status', '/health'] as never, () => ({ ok: true }))).toThrow(
      'JsonRouter route path must be a string path',
    );
    expect(() => router.route(/^\/status/ as never)).toThrow('JsonRouter route path must be a string path');
    expect(() => router.route(['/status', '/health'] as never)).toThrow('JsonRouter route path must be a string path');
    expect(router.getEndpoints()).toEqual([]);
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

  it('supports flat, mixed, and nested route handler arrays in Express order', async () => {
    const app = express();
    const calls: string[] = [];
    const router = new JsonRouter('/api', [
      (req, res, next) => {
        calls.push('router:a');
        next();
      },
      [
        (req, res, next) => {
          calls.push('router:b');
          next();
        },
      ],
    ]);

    router.get(
      '/ordered',
      [],
      [
        (req, res, next) => {
          calls.push('route:a');
          next();
        },
        [
          (req, res, next) => {
            calls.push('route:b');
            next();
          },
        ],
      ],
      (req, res, next) => {
        calls.push('route:c');
        next();
      },
      [() => ({ calls: calls.slice() })],
    );

    app.use(router.original);

    await expectJson(app, 'get', '/api/ordered', 200, {
      calls: ['router:a', 'router:b', 'route:a', 'route:b', 'route:c'],
    });
    expect(calls).toEqual(['router:a', 'router:b', 'route:a', 'route:b', 'route:c']);
    expect(router.getEndpoints()).toEqual([{ method: 'GET', path: '/api/ordered' }]);
  });

  it('supports handler arrays from route() builders', async () => {
    const app = express();
    const calls: string[] = [];
    const router = new JsonRouter();

    router.route('/builder').get(
      [
        (req, res, next) => {
          calls.push('a');
          next();
        },
      ],
      [[() => ({ calls: calls.slice() })]],
    );

    app.use(router.original);

    await expectJson(app, 'get', '/builder', 200, { calls: ['a'] });
  });

  it('rejects empty or invalid route handler collections before recording an endpoint', () => {
    const router = new JsonRouter();

    expect(() => router.get('/empty-array', [])).toThrow('at least one middleware handler is required');
    expect(() => router.get('/nested-empty-array', [[]])).toThrow('at least one middleware handler is required');
    expect(() => router.get('/mixed-empty-array', [], () => ({ ok: true }))).not.toThrow();
    expect(() => router.get('/invalid', [() => ({ ok: true }), 'not-a-handler'] as never)).toThrow(
      'middleware handler must be a function',
    );
    expect(router.getEndpoints()).toEqual([{ method: 'GET', path: '/mixed-empty-array' }]);
  });

  it('requires route-local error middleware to be mounted with use()', () => {
    const router = new JsonRouter();
    const errorMiddleware: express.ErrorRequestHandler = (err, req, res, next) => {
      next(err);
    };

    expect(() => router.get('/route-error', errorMiddleware as never)).toThrow(
      'route-local error middleware must be mounted with use()',
    );
    expect(() => router.use(errorMiddleware)).not.toThrow();
    expect(router.getEndpoints()).toEqual([]);
  });

  it('applies static handler defaults to newly created routers', async () => {
    const app = express();
    let preJsonValue: unknown;

    JsonRouter.preJson = (value) => {
      preJsonValue = value;
    };

    JsonRouter.errorMessageProvider = () => 'custom-error-message';

    const router = new JsonRouter();

    router.get('/value', () => 'apple');
    router.get('/error', () => {
      throw new Error('original-message');
    });

    app.use(router.original);

    await expectJson(app, 'get', '/value', 200, 'apple');
    expect(preJsonValue).toBe('apple');

    const errorResponse = await request(app).get('/error').expect(500);

    expect(errorResponse.body).toEqual({ message: 'custom-error-message' });
  });

  it('keeps existing routers isolated from later static default changes', async () => {
    const app = express();
    const firstRouter = new JsonRouter();

    JsonRouter.errorMessageProvider = () => 'custom-error-message';

    const secondRouter = new JsonRouter();

    firstRouter.get('/first-error', () => {
      throw new Error('first-router-message');
    });
    secondRouter.get('/second-error', () => {
      throw new Error('second-router-message');
    });

    app.use(firstRouter.original);
    app.use(secondRouter.original);

    await request(app).get('/first-error').expect(500, { message: 'first-router-message' });
    await request(app).get('/second-error').expect(500, { message: 'custom-error-message' });
  });

  it('applies post-json and error hooks to newly created routers', async () => {
    const app = express();
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

    const router = new JsonRouter();

    router.get('/value', () => ({ ok: true }));
    router.get('/error', () => {
      throw new Error('hook-error');
    });

    app.use(router.original);

    await expectJson(app, 'get', '/value', 200, { ok: true });
    await request(app).get('/error').expect(500, { message: 'hook-error' });

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

  it('snapshots constructor middleware input and isolates later source-array mutation from route registration', async () => {
    const app = express();
    const originalMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      (req as RequestWithState).middlewareValue = 'original';
      next();
    };
    const replacementMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      (req as RequestWithState).middlewareValue = 'replacement';
      next();
    };
    const source: express.RequestHandler[] = [originalMiddleware];

    const router = new JsonRouter('/api', source);

    router.get('/before', (req) => ({ middleware: (req as RequestWithState).middlewareValue }));

    source.length = 0;
    source.push(replacementMiddleware);
    (router.middlewares as unknown[]).length = 0;
    (router.middlewares as unknown[]).push(replacementMiddleware);

    router.get('/after', (req) => ({ middleware: (req as RequestWithState).middlewareValue }));

    app.use(router.original);

    await expectJson(app, 'get', '/api/before', 200, { middleware: 'original' });
    await expectJson(app, 'get', '/api/after', 200, { middleware: 'original' });
  });

  it('rejects mutation of the public middlewares collection from affecting route registration', async () => {
    const app = express();
    const first: express.RequestHandler = (req, res, next) => {
      (req as RequestWithState).middlewareValue = 'first';
      next();
    };
    const second: express.RequestHandler = (req, res, next) => {
      (req as RequestWithState).middlewareValue = `${(req as RequestWithState).middlewareValue}-second`;
      next();
    };
    const router = new JsonRouter('/api', [first, second]);

    const exposed = router.middlewares;
    exposed.pop();
    exposed.splice(0, 1, (req, res, next) => {
      (req as RequestWithState).middlewareValue = 'replaced';
      next();
    });

    router.get('/status', (req) => ({ middleware: (req as RequestWithState).middlewareValue }));

    app.use(router.original);

    await expectJson(app, 'get', '/api/status', 200, { middleware: 'first-second' });
  });

  it('preserves router-level middleware order across routes registered before and after attempted mutation', async () => {
    const calls: string[] = [];

    const make =
      (label: string): express.RequestHandler =>
      (req, res, next) => {
        calls.push(label);
        next();
      };

    const router = new JsonRouter('/api', [make('a'), make('b'), make('c')]);

    router.get('/first', () => ({ ok: true }));

    const source = [make('a'), make('b'), make('c')] as unknown[];
    source.length = 0;
    source.unshift(make('z'));

    router.get('/second', () => ({ ok: true }));

    const app = express();
    app.use(router.original);

    await request(app).get('/api/first').expect(200);
    await request(app).get('/api/second').expect(200);

    expect(calls).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
  });

  it('supports custom response-handler instances for structured error formats', async () => {
    const app = express();
    const responseHandler = JsonRouter.createHandler({
      errorFormat: JsonRouter.ErrorFormats.rfc9457,
      errorDomain: 'api.example.com',
    });
    const router = new JsonRouter('', undefined, responseHandler);

    router.get('/validation', () => {
      throw new BadRequestError('invalid email', {
        type: 'https://api.example.com/problems/invalid-email',
        title: 'Invalid email address',
        instance: '/problems/invalid-email/123',
        errors: [
          {
            detail: 'must be a valid email address',
            pointer: '#/email',
          },
        ],
      });
    });

    app.use(router.original);

    const response = await request(app)
      .get('/validation')
      .expect('Content-Type', /application\/problem\+json/)
      .expect(400);

    expect(response.body).toEqual({
      type: 'https://api.example.com/problems/invalid-email',
      title: 'Invalid email address',
      status: 400,
      detail: 'invalid email',
      instance: '/problems/invalid-email/123',
      errors: [
        {
          detail: 'must be a valid email address',
          pointer: '#/email',
        },
      ],
    });
  });

  it('does not expose mutable internal endpoint storage for external mutation', () => {
    const router = new JsonRouter();

    router.get('/users', () => []);
    router.post('/users', () => []);

    const snapshot = router.getEndpoints();
    snapshot.push({ method: 'DELETE', path: '/admin' });
    snapshot[0].path = '/mutated';
    snapshot[1].method = 'PATCH';

    expect(router.getEndpoints()).toEqual([
      { method: 'GET', path: '/users' },
      { method: 'POST', path: '/users' },
    ]);
  });

  it('keeps route() builders available and ordered after direct attempts to mutate registry state', () => {
    const router = new JsonRouter();

    router.get('/first', () => ({ ok: true }));

    const snapshot = router.getEndpoints();
    snapshot.length = 0;

    const builder = router.route('/shared');

    expect(typeof builder.get).toBe('function');
    expect(typeof builder.post).toBe('function');
    expect(typeof builder.delete).toBe('function');

    builder.get(() => 'shared-get').post(() => 'shared-post');

    expect(router.getEndpoints()).toEqual([
      { method: 'GET', path: '/first' },
      { method: 'GET', path: '/shared' },
      { method: 'POST', path: '/shared' },
    ]);
  });
});
