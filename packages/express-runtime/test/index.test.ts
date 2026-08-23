import http from 'node:http';
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import {
  createExpressApp,
  createServerlessHandler,
  startLocalServer,
  normalizePort,
  defaultRequestHook,
  type Logger,
} from '../src/index.ts';
import { waitForListening, waitForEvent } from './support/events';
import { createDeferred } from './support/deferred';
import {
  captureListenerSnapshot,
  restoreListenerSnapshot,
  getListenerCounts,
  type ListenerSnapshot,
} from './support/process-listeners';
import { createRequestBarrier } from './support/server';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function waitForImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function requestText(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent: false }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// createExpressApp
// ---------------------------------------------------------------------------

describe('createExpressApp', () => {
  it('returns an Express app with body parsers', async () => {
    const app = createExpressApp();
    app.post('/echo', (req, res) => res.json({ body: req.body }));

    const res = await request(app).post('/echo').send({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ body: { hello: 'world' } });
  });

  it('disables x-powered-by and sets safe defaults', () => {
    const app = createExpressApp();
    expect(app.disabled('x-powered-by')).toBe(true);
    expect(app.get('etag')).toBe(false);
    // trust proxy defaults to false (security).
    expect(app.get('trust proxy')).toBe(false);
  });

  it('allows opting into trust proxy', () => {
    const app = createExpressApp({ trustProxy: 1 });
    expect(app.get('trust proxy')).toBe(1);
  });

  it('allows disabling body parsers', async () => {
    const app = createExpressApp({ json: false, urlencoded: false });
    app.post('/echo', (req, res) => res.json({ ok: true }));

    const res = await request(app).post('/echo').type('json').send({ hello: 'world' });
    expect(res.status).toBe(200);
  });

  it('parses urlencoded bodies with default options (1mb limit)', async () => {
    const app = createExpressApp();
    app.post('/form', (req, res) => res.json({ body: (req.body as Record<string, string>).field }));

    const res = await request(app).post('/form').type('form').send('field=hello');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ body: 'hello' });
  });

  it('applies middleware in correct lifecycle order', async () => {
    const trace: string[] = [];
    const app = createExpressApp({
      preMiddleware: [
        (req, _res, next) => {
          trace.push('pre');
          next();
        },
      ],
      middleware: [
        (req, _res, next) => {
          trace.push('mid');
          next();
        },
      ],
      postMiddleware: [
        (req, _res, next) => {
          trace.push('post');
          next();
        },
      ],
      router: {
        path: () => '/api',
        handler: (req, _res, next) => {
          trace.push('router');
          next();
        },
      },
      finalize: (a) => {
        a.get('/api/x', (req, _res, next) => {
          trace.push('finalize');
          next();
        });
      },
    });
    app.get('/api/x', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/api/x');
    expect(res.status).toBe(200);
    expect(trace).toEqual(['pre', 'mid', 'router', 'post', 'finalize']);
  });

  it('registers error handler after routes added in finalize', async () => {
    const errorHandler: express.ErrorRequestHandler = (err, _req, res, _next) => {
      res.status(500).json({ error: err.message });
    };
    const app = createExpressApp({
      finalize: (a) => {
        a.get('/boom', () => {
          throw new Error('boom');
        });
      },
      errorHandler,
    });

    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'boom' });
  });

  it('routes default unhandled error logging through options.logger', async () => {
    const logger: Logger = { log: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const app = createExpressApp({
      logger,
      finalize: (configuredApp) => {
        configuredApp.get('/boom', () => {
          throw new Error('logger boom');
        });
      },
    });

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled Express error:',
      expect.objectContaining({ message: 'logger boom' }),
    );
  });

  it('mounts single router via the router option', async () => {
    const router = express.Router();
    router.get('/ping', (_req, res) => res.json({ pong: true }));
    const app = createExpressApp({ router: { path: '/api', handler: router } });

    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pong: true });
  });

  it('mounts multiple routers in order', async () => {
    const r1 = express.Router();
    r1.get('/a', (_req, res) => res.json({ ok: 'a' }));
    const r2 = express.Router();
    r2.get('/b', (_req, res) => res.json({ ok: 'b' }));
    const app = createExpressApp({
      routers: [
        { path: '/v1', handler: r1 },
        { path: '/v2', handler: r2 },
      ],
    });

    expect((await request(app).get('/v1/a')).body).toEqual({ ok: 'a' });
    expect((await request(app).get('/v2/b')).body).toEqual({ ok: 'b' });
  });

  it('supports dynamic paths via functions', async () => {
    const router = express.Router();
    router.get('/ping', (_req, res) => res.json({ pong: true }));
    const app = createExpressApp({ routers: [{ path: () => '/api/v1', handler: router }] });

    const res = await request(app).get('/api/v1/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pong: true });
  });
});

// ---------------------------------------------------------------------------
// createServerlessHandler
// ---------------------------------------------------------------------------

function makeServerlessEvent(method: string, path: string, body?: unknown, contentType?: string) {
  const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
  return {
    httpMethod: method,
    path,
    body: bodyStr ? Buffer.from(bodyStr) : undefined,
    headers: contentType ? { 'content-type': contentType } : {},
  };
}

describe('createServerlessHandler', () => {
  it('wraps Express and parses JSON buffer bodies by default', async () => {
    const app = createExpressApp();
    app.post('/echo', (req, res) => res.json({ body: req.body }));
    const handler = createServerlessHandler(app);

    const result = await handler(makeServerlessEvent('POST', '/echo', { hi: 1 }, 'application/json'), {});
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed).toEqual({ body: { hi: 1 } });
    expect((result as { statusCode: number }).statusCode).toBe(200);
  });

  it('parses bodies with charset variations (application/json; charset=utf-8)', async () => {
    const app = createExpressApp();
    app.post('/echo', (req, res) => res.json({ body: req.body }));
    const handler = createServerlessHandler(app);

    const result = await handler(
      makeServerlessEvent('POST', '/echo', { hi: 1 }, 'application/json; charset=utf-8'),
      {},
    );
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed).toEqual({ body: { hi: 1 } });
  });

  it('memoizes a successful init across invocations', async () => {
    const app = createExpressApp();
    app.get('/ok', (_req, res) => res.json({ ok: true }));
    const init = vi.fn().mockResolvedValue(undefined);
    const handler = createServerlessHandler(app, { init });

    await handler(makeServerlessEvent('GET', '/ok'), {});
    await handler(makeServerlessEvent('GET', '/ok'), {});

    expect(init).toHaveBeenCalledTimes(1);
  });

  it('awaits init before handling requests', async () => {
    let initialized = false;
    const app = createExpressApp();
    app.get('/ok', (_req, res) => res.json({ initialized }));
    const handler = createServerlessHandler(app, {
      init: async () => {
        initialized = true;
      },
    });

    const result = await handler(makeServerlessEvent('GET', '/ok'), {});
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed).toEqual({ initialized: true });
  });

  it('memoizes init rejection and lets reset() retry', async () => {
    let attempt = 0;
    const init = vi.fn().mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('first fail');
      }
    });
    const app = createExpressApp();
    app.get('/ok', (_req, res) => res.json({ ok: true }));
    const handler = createServerlessHandler(app, { init });

    await expect(handler(makeServerlessEvent('GET', '/ok'), {})).rejects.toThrow('first fail');
    expect(init).toHaveBeenCalledTimes(1);

    handler.reset();

    await handler(makeServerlessEvent('GET', '/ok'), {});
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('memoizes synchronous init throws across concurrent invocations', async () => {
    const failure = new Error('sync fail');
    const init = vi.fn(() => {
      throw failure;
    });
    const app = createExpressApp();
    app.get('/ok', (_req, res) => res.json({ ok: true }));
    const handler = createServerlessHandler(app, { init });

    const first = handler(makeServerlessEvent('GET', '/ok'), {});
    const second = handler(makeServerlessEvent('GET', '/ok'), {});
    const results = await Promise.allSettled([first, second]);

    expect(init).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { status: 'rejected', reason: failure },
      { status: 'rejected', reason: failure },
    ]);

    await expect(handler(makeServerlessEvent('GET', '/ok'), {})).rejects.toBe(failure);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('ignores reset() during pending init and allows one retry after settlement', async () => {
    const pending = createDeferred<void>();
    const init = vi
      .fn()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(undefined);
    const app = createExpressApp();
    app.get('/ok', (_req, res) => res.json({ ok: true }));
    const handler = createServerlessHandler(app, { init });

    const first = handler(makeServerlessEvent('GET', '/ok'), {});
    await waitForImmediate();
    handler.reset();
    const second = handler(makeServerlessEvent('GET', '/ok'), {});
    await waitForImmediate();

    expect(init).toHaveBeenCalledTimes(1);
    pending.resolve();
    await Promise.all([first, second]);
    expect(init).toHaveBeenCalledTimes(1);

    handler.reset();
    await handler(makeServerlessEvent('GET', '/ok'), {});
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('lets serverless-http 4 stream JSON into Express without an eager request hook conversion', async () => {
    const app = createExpressApp();
    app.post('/echo', (req, res) => res.type('text').send(String((req.body as { hi: number }).hi)));
    const requestHook = vi.fn();
    const handler = createServerlessHandler(app, { request: requestHook });

    const result = await handler(makeServerlessEvent('POST', '/echo', { hi: 1 }, 'application/json'), {});

    expect(requestHook).toHaveBeenCalledOnce();
    expect((result as { statusCode: number; body: string }).statusCode).toBe(200);
    expect((result as { body: string }).body).toBe('1');
  });

  it('does not parse normal JSON requests twice', async () => {
    const app = createExpressApp();
    app.post('/echo', (req, res) => res.type('text').send(String((req.body as { hi: number }).hi)));
    const handler = createServerlessHandler(app);
    const parseSpy = vi.spyOn(JSON, 'parse');
    try {
      const result = await handler(makeServerlessEvent('POST', '/echo', { hi: 1 }, 'application/json'), {});
      expect((result as { statusCode: number }).statusCode).toBe(200);
      expect((result as { body: string }).body).toBe('1');
      expect(parseSpy).toHaveBeenCalledTimes(1);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('does not log malformed client JSON as an internal serverless request-hook error', async () => {
    const app = createExpressApp({
      errorHandler: (err, _req, res, _next) => {
        const status =
          typeof (err as { status?: unknown }).status === 'number' ? (err as { status: number }).status : 500;
        res.status(status).json({ status });
      },
    });
    app.post('/echo', (req, res) => res.json({ body: req.body }));
    const logger: Logger = { log: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const handler = createServerlessHandler(app, { logger });

    const result = await handler(
      {
        httpMethod: 'POST',
        path: '/echo',
        body: Buffer.from('not json'),
        headers: { 'content-type': 'application/json' },
      },
      {},
    );

    expect((result as { statusCode: number }).statusCode).toBe(400);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('allows overriding the request hook', async () => {
    const app = createExpressApp();
    app.post('/echo', (req, res) => res.json({ body: req.body }));
    const requestHook = vi.fn();
    const handler = createServerlessHandler(app, { request: requestHook });

    await handler(makeServerlessEvent('POST', '/echo', { hi: 1 }, 'application/json'), {});
    expect(requestHook).toHaveBeenCalledOnce();
  });

  it('passes provider event and context to request and response hooks', async () => {
    const app = createExpressApp();
    app.get('/ok', (_req, res) => res.json({ ok: true }));
    const requestHook = vi.fn();
    const responseHook = vi.fn();
    const handler = createServerlessHandler(app, { request: requestHook, response: responseHook });
    const event = makeServerlessEvent('GET', '/ok');
    const context = { requestId: 'ctx-1' };

    await handler(event, context);

    expect(requestHook).toHaveBeenCalledWith(expect.any(Object), event, context);
    expect(responseHook).toHaveBeenCalledWith(expect.any(Object), event, context);
  });

  it('supports a custom logger for debug output', async () => {
    const logs: string[] = [];
    const logger: Logger = {
      log: (...args) => logs.push(args.join(' ')),
      error: (...args) => logs.push('ERR ' + args.join(' ')),
      debug: (...args) => logs.push('DBG ' + args.join(' ')),
    };
    const app = createExpressApp();
    app.get('/ok', (_req, res) => res.json({ ok: true }));
    const handler = createServerlessHandler(app, { logger });

    await handler(makeServerlessEvent('GET', '/ok'), {});
    expect(logs.some((l) => l.includes('Serverless cold start'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// defaultRequestHook (unit tests for the #305 workaround)
// ---------------------------------------------------------------------------

describe('defaultRequestHook', () => {
  it('parses JSON buffer bodies', () => {
    const req = { body: Buffer.from(JSON.stringify({ hi: 1 })), headers: { 'content-type': 'application/json' } };
    defaultRequestHook(req);
    expect(req.body).toEqual({ hi: 1 });
  });

  it('supports charset variation', () => {
    const req = {
      body: Buffer.from(JSON.stringify({ hi: 1 })),
      headers: { 'content-type': 'application/json; charset=utf-8' },
    };
    defaultRequestHook(req);
    expect(req.body).toEqual({ hi: 1 });
  });

  it('matches JSON media types exactly and case-insensitively', () => {
    const parameterized = {
      body: Buffer.from(JSON.stringify({ hi: 1 })),
      headers: { 'Content-Type': 'Application/JSON; Charset=UTF-8' },
    };
    defaultRequestHook(parameterized);
    expect(parameterized.body).toEqual({ hi: 1 });

    const jsonp = { body: Buffer.from(JSON.stringify({ hi: 1 })), headers: { 'content-type': 'application/jsonp' } };
    defaultRequestHook(jsonp);
    expect(jsonp.body).toBe('{"hi":1}');

    const evil = { body: Buffer.from(JSON.stringify({ hi: 1 })), headers: { 'content-type': 'application/json-evil' } };
    defaultRequestHook(evil);
    expect(evil.body).toBe('{"hi":1}');
  });

  it('parses structured application/*+json media types', () => {
    const req = {
      body: Buffer.from(JSON.stringify({ hi: 1 })),
      headers: { 'content-type': 'application/vnd.api+json; profile="x"' },
    };
    defaultRequestHook(req);
    expect(req.body).toEqual({ hi: 1 });
  });

  it('leaves non-JSON buffer bodies as strings', () => {
    const req = { body: Buffer.from('plain text'), headers: { 'content-type': 'text/plain' } };
    defaultRequestHook(req);
    expect(req.body).toBe('plain text');
  });

  it('skips bodies larger than maxBodyBytes', () => {
    const req = { body: Buffer.from('a'.repeat(64)), headers: { 'content-type': 'application/json' } };
    defaultRequestHook(req, 32);
    expect(Buffer.isBuffer(req.body)).toBe(true);
  });

  it('ignores non-buffer bodies', () => {
    const req = { body: 'already parsed', headers: {} };
    defaultRequestHook(req);
    expect(req.body).toBe('already parsed');
  });

  it('swallows JSON.parse errors without logging and leaves the body unchanged', () => {
    const req = { body: Buffer.from('not json'), headers: { 'content-type': 'application/json' } };
    const logger: Logger = { log: vi.fn(), error: vi.fn(), debug: vi.fn() };
    defaultRequestHook(req, 1024 * 1024, logger);
    // The assignment threw before completing, so req.body remains the Buffer.
    expect(Buffer.isBuffer(req.body)).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// normalizePort
// ---------------------------------------------------------------------------

describe('normalizePort', () => {
  beforeEach(() => {
    delete process.env.PORT;
  });

  it('returns 8080 when nothing is provided', () => {
    expect(normalizePort(undefined)).toBe(8080);
  });

  it('reads from process.env.PORT', () => {
    process.env.PORT = '3000';
    try {
      expect(normalizePort(undefined)).toBe(3000);
    } finally {
      delete process.env.PORT;
    }
  });

  it('returns named-pipe strings as-is', () => {
    expect(normalizePort('\\\\.\\pipe\\test')).toBe('\\\\.\\pipe\\test');
  });

  it('accepts numeric port boundaries', () => {
    expect(normalizePort(0)).toBe(0);
    expect(normalizePort(65535)).toBe(65535);
    expect(normalizePort('0')).toBe(0);
    expect(normalizePort('65535')).toBe(65535);
  });

  it('throws on negative ports', () => {
    expect(() => normalizePort(-1)).toThrow('Invalid port');
  });

  it('throws on fractional, non-finite, and ambiguous numeric ports', () => {
    expect(() => normalizePort(1.5)).toThrow('Invalid port');
    expect(() => normalizePort(NaN)).toThrow('Invalid port');
    expect(() => normalizePort(Infinity)).toThrow('Invalid port');
    expect(() => normalizePort('1.5')).toThrow('Invalid port');
    expect(() => normalizePort('1e3')).toThrow('Invalid port');
    expect(() => normalizePort('+3000')).toThrow('Invalid port');
    expect(() => normalizePort('03000')).toThrow('Invalid port');
  });

  it('throws on whitespace-only or whitespace-padded port strings', () => {
    expect(() => normalizePort('   ')).toThrow('Invalid port');
    expect(() => normalizePort(' 3000')).toThrow('Invalid port');
    expect(() => normalizePort('3000 ')).toThrow('Invalid port');
  });

  it('throws on out-of-range ports', () => {
    expect(() => normalizePort(70000)).toThrow('Invalid port');
    expect(() => normalizePort('65536')).toThrow('Invalid port');
  });

  it('returns non-numeric strings as named-pipe paths', () => {
    // Nonnumeric strings are returned as-is so callers can use named-pipe paths.
    expect(normalizePort('123abc')).toBe('123abc');
  });
});

// ---------------------------------------------------------------------------
// startLocalServer — deterministic lifecycle harness (ERT-01)
// ---------------------------------------------------------------------------

describe('startLocalServer', () => {
  const servers: http.Server[] = [];
  let sentinelSIGINT: () => void;
  let sentinelSIGTERM: () => void;
  let baselineCounts: Record<string, number>;
  let baselineSnapshot: ListenerSnapshot;

  beforeAll(() => {
    sentinelSIGINT = () => {};
    sentinelSIGTERM = () => {};
    // Tag for debugging
    Object.defineProperty(sentinelSIGINT, 'name', { value: 'sentinelSIGINT' });
    Object.defineProperty(sentinelSIGTERM, 'name', { value: 'sentinelSIGTERM' });
    process.on('SIGINT', sentinelSIGINT);
    process.on('SIGTERM', sentinelSIGTERM);
  });

  afterAll(() => {
    process.removeListener('SIGINT', sentinelSIGINT);
    process.removeListener('SIGTERM', sentinelSIGTERM);
  });

  beforeEach(() => {
    baselineSnapshot = captureListenerSnapshot(['SIGINT', 'SIGTERM']);
    baselineCounts = getListenerCounts(['SIGINT', 'SIGTERM']);
  });

  afterEach(async () => {
    // Deterministically close servers without fixed sleeps; await shutdown.
    for (const server of servers.splice(0)) {
      if (server.listening) {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          // Ensure we don't hang if close stalls; force after 2s
          setTimeout(() => {
            try {
              server.closeAllConnections?.();
            } catch (_e) {
              void _e;
            }
            resolve();
          }, 2000).unref?.();
        });
      } else {
        try {
          server.close();
        } catch (_e) {
          void _e;
        }
      }
    }
    // Restore only listeners added by tests/runtime; sentinel must survive.
    restoreListenerSnapshot(baselineSnapshot, ['SIGINT', 'SIGTERM']);
    // Verify sentinel survived and counts returned to baseline
    expect(process.listeners('SIGINT')).toContain(sentinelSIGINT);
    expect(process.listeners('SIGTERM')).toContain(sentinelSIGTERM);
    expect(getListenerCounts(['SIGINT', 'SIGTERM'])).toEqual(baselineCounts);
  });

  it('starts an HTTP server that responds via the bound port', async () => {
    const app = createExpressApp();
    app.get('/ping', (_req, res) => res.json({ pong: true }));

    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false });
    servers.push(local.server);

    const { port } = await waitForListening(local.server);
    const res = await request(`http://127.0.0.1:${port}`).get('/ping');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pong: true });
  });

  it('resolves ready when the server is listening', async () => {
    const app = createExpressApp();
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false });
    servers.push(local.server);

    await expect(local.ready).resolves.toBeUndefined();
    expect(local.server.listening).toBe(true);
  });

  it('rejects ready on init failure without an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const errorDeferred = createDeferred<unknown>();
      const initError = new Error('init failed before listen');
      const app = createExpressApp();
      const local = startLocalServer(app, {
        port: 0,
        host: '127.0.0.1',
        signals: false,
        init: async () => {
          throw initError;
        },
        onError: (err) => errorDeferred.resolve(err),
      });
      servers.push(local.server);

      expect(await errorDeferred.promise).toBe(initError);
      await waitForImmediate();
      await expect(local.ready).rejects.toThrow('init failed before listen');
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });

  it('rejects ready on listen failure without an unhandled rejection', async () => {
    const occupied = http.createServer();
    servers.push(occupied);
    await new Promise<void>((resolve, reject) => {
      occupied.once('error', reject);
      occupied.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = occupied.address();
    if (typeof addr !== 'object' || addr === null) {
      throw new Error('Expected TCP address for occupied server');
    }

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const errorDeferred = createDeferred<NodeJS.ErrnoException>();
      const app = createExpressApp();
      const local = startLocalServer(app, {
        port: addr.port,
        host: '127.0.0.1',
        signals: false,
        onError: (err) => errorDeferred.resolve(err),
      });
      servers.push(local.server);

      const err = await errorDeferred.promise;
      await waitForImmediate();
      await expect(local.ready).rejects.toMatchObject({ code: 'EADDRINUSE' });
      expect(err.code).toBe('EADDRINUSE');
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });

  it('calls init before listening', async () => {
    const app = createExpressApp();
    app.get('/ok', (_req, res) => res.json({ ok: true }));
    const init = vi.fn().mockResolvedValue(undefined);

    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false, init });
    servers.push(local.server);

    await waitForListening(local.server);
    expect(init).toHaveBeenCalledOnce();
  });

  it('invokes onListening when listening', async () => {
    const onListening = vi.fn();
    const app = createExpressApp();
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false, onListening });
    servers.push(local.server);

    await waitForListening(local.server);
    expect(onListening).toHaveBeenCalledOnce();
  });

  it('invokes custom onError when the server emits a listen error', () => {
    const onError = vi.fn();
    const app = createExpressApp();
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false, onError });
    servers.push(local.server);

    const err: NodeJS.ErrnoException = Object.assign(new Error('boom'), {
      code: 'EADDRINUSE',
      syscall: 'listen',
    });
    local.server.emit('error', err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('invokes onShutdown when shutdown() is called', async () => {
    const app = createExpressApp();
    app.get('/ok', (_req, res) => res.json({ ok: true }));
    const onShutdown = vi.fn().mockResolvedValue(undefined);

    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false, onShutdown });
    servers.push(local.server);

    await waitForListening(local.server);
    await local.shutdown();

    expect(onShutdown).toHaveBeenCalledOnce();
  });

  it('drains in-flight requests during graceful shutdown', async () => {
    const app = createExpressApp();
    const barrier = createRequestBarrier();
    const releaseDeferred = createDeferred<void>();

    app.get('/slow', (_req, res) => {
      barrier.onRequestEntered();
      releaseDeferred.promise.then(() => res.json({ drained: true }));
    });

    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false });
    servers.push(local.server);

    const { port } = await waitForListening(local.server);
    const url = `http://127.0.0.1:${port}`;

    // Fire a real HTTP request with http.get so it's in-flight before shutdown.
    const slowRequest = new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.get(`${url}/slow`, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      });
      req.on('error', reject);
    });

    // Wait deterministically for handler entry instead of fixed sleep.
    await barrier.waitForEntry();

    const shutdownPromise = local.shutdown();
    releaseDeferred.resolve();
    const slowRes = await slowRequest;
    await shutdownPromise;

    expect(slowRes.status).toBe(200);
    expect(JSON.parse(slowRes.body)).toEqual({ drained: true });
  });

  it('shutdown during blocked init prevents listening after init is released', async () => {
    const initRelease = createDeferred<void>();
    const initReturned = createDeferred<void>();
    const onShutdown = vi.fn();
    const onListening = vi.fn();
    const app = createExpressApp();
    const local = startLocalServer(app, {
      port: 0,
      host: '127.0.0.1',
      signals: false,
      init: async () => {
        await initRelease.promise;
        initReturned.resolve();
      },
      onShutdown,
      onListening,
    });
    servers.push(local.server);

    const readyRejection = local.ready.catch((err) => err as Error);
    await local.shutdown();
    initRelease.resolve();
    await initReturned.promise;
    await waitForImmediate();

    expect(await readyRejection).toMatchObject({ message: 'Server shutdown before listening' });
    expect(local.server.listening).toBe(false);
    expect(onListening).not.toHaveBeenCalled();
    expect(onShutdown).toHaveBeenCalledOnce();
  });

  it('refuses new connections after shutdown starts while draining before onShutdown', async () => {
    let dependencyOpen = true;
    const barrier = createRequestBarrier();
    const releaseDeferred = createDeferred<void>();
    const shutdownEntered = createDeferred<void>();
    const app = createExpressApp();
    const onShutdown = vi.fn(() => {
      shutdownEntered.resolve();
      dependencyOpen = false;
    });

    app.get('/slow', (_req, res) => {
      barrier.onRequestEntered();
      releaseDeferred.promise.then(() => {
        res.json({ dependencyOpen });
      });
    });
    app.get('/after', (_req, res) => res.json({ ok: true }));

    const local = startLocalServer(app, {
      port: 0,
      host: '127.0.0.1',
      signals: false,
      onShutdown,
      shutdownTimeout: 1000,
    });
    servers.push(local.server);

    const { port } = await waitForListening(local.server);
    const slowRequest = requestText(`http://127.0.0.1:${port}/slow`);
    await barrier.waitForEntry();

    const shutdownPromise = local.shutdown();
    const refused = requestText(`http://127.0.0.1:${port}/after`).then(
      () => 'accepted',
      (err: NodeJS.ErrnoException) => err.code ?? 'error',
    );
    expect(await refused).not.toBe('accepted');
    expect(onShutdown).not.toHaveBeenCalled();

    releaseDeferred.resolve();
    const slowRes = await slowRequest;
    await shutdownPromise;
    await shutdownEntered.promise;

    expect(slowRes.status).toBe(200);
    expect(JSON.parse(slowRes.body)).toEqual({ dependencyOpen: true });
    expect(onShutdown).toHaveBeenCalledOnce();
    expect(dependencyOpen).toBe(false);
  });

  it('runs concurrent shutdown calls and signals once and restores owned signal listeners', async () => {
    const logs: string[] = [];
    const logger: Logger = {
      log: (...args) => logs.push(args.join(' ')),
      error: (...args) => logs.push('ERR ' + args.join(' ')),
    };
    const shutdownEntered = createDeferred<void>();
    const releaseShutdown = createDeferred<void>();
    const onShutdown = vi.fn(async () => {
      shutdownEntered.resolve();
      await releaseShutdown.promise;
    });
    const app = createExpressApp();
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', onShutdown, logger });
    servers.push(local.server);
    await local.ready;

    process.emit('SIGINT', 'SIGINT');
    const shutdownA = local.shutdown();
    const shutdownB = local.shutdown();
    process.emit('SIGTERM', 'SIGTERM');
    await shutdownEntered.promise;

    expect(onShutdown).toHaveBeenCalledOnce();
    expect(logs.filter((line) => line.includes('Shutting down'))).toHaveLength(1);
    expect(process.listenerCount('SIGINT')).toBe(baselineCounts.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(baselineCounts.SIGTERM);

    releaseShutdown.resolve();
    await Promise.all([shutdownA, shutdownB]);
    expect(onShutdown).toHaveBeenCalledOnce();
    expect(getListenerCounts(['SIGINT', 'SIGTERM'])).toEqual(baselineCounts);
  });

  it('logs the actual bound port for port 0', async () => {
    const logs: string[] = [];
    const logger: Logger = {
      log: (...args) => logs.push(args.join(' ')),
      error: (...args) => logs.push('ERR ' + args.join(' ')),
    };
    const app = createExpressApp();
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false, logger });
    servers.push(local.server);

    await local.ready;
    const addr = local.server.address();
    if (typeof addr !== 'object' || addr === null) {
      throw new Error('Expected TCP address');
    }

    expect(logs.some((line) => line.includes(`http://127.0.0.1:${addr.port}/`))).toBe(true);
    expect(logs.some((line) => line.includes('http://127.0.0.1:0/'))).toBe(false);
  });

  it('shutdown resolves without cleanup when the server was externally closed', async () => {
    const onShutdown = vi.fn();
    const app = createExpressApp();
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false, onShutdown });
    servers.push(local.server);
    await local.ready;
    await new Promise<void>((resolve) => local.server.close(() => resolve()));

    await expect(local.shutdown()).resolves.toBeUndefined();
    expect(onShutdown).not.toHaveBeenCalled();
  });

  it('does not register signal listeners when signals: false', () => {
    const before = process.listenerCount('SIGINT');
    const app = createExpressApp();
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false });
    servers.push(local.server);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  it('registers signal listeners by default and restores baseline without removeAllListeners', () => {
    const beforeSIGINT = process.listenerCount('SIGINT');
    const beforeSIGTERM = process.listenerCount('SIGTERM');
    const app = createExpressApp();
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1' });
    servers.push(local.server);
    expect(process.listenerCount('SIGINT')).toBeGreaterThan(beforeSIGINT);
    expect(process.listenerCount('SIGTERM')).toBeGreaterThan(beforeSIGTERM);
    // No removeAllListeners: afterEach will restore via snapshot. Verify sentinel still present now.
    expect(process.listeners('SIGINT')).toContain(sentinelSIGINT);
    expect(process.listeners('SIGTERM')).toContain(sentinelSIGTERM);
  });

  it('calls process.exit when exitAfterShutdown is true', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    try {
      const app = createExpressApp();
      const local = startLocalServer(app, {
        port: 0,
        host: '127.0.0.1',
        signals: false,
        exitAfterShutdown: true,
      });
      servers.push(local.server);
      await waitForListening(local.server);
      await expect(local.shutdown()).rejects.toThrow('process.exit called');
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('routes log output through the provided logger', async () => {
    const logs: string[] = [];
    const logger: Logger = {
      log: (...args) => logs.push(args.join(' ')),
      error: (...args) => logs.push('ERR ' + args.join(' ')),
    };
    const app = createExpressApp();
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false, logger });
    servers.push(local.server);

    await waitForListening(local.server);
    await local.shutdown();

    expect(logs.some((l) => l.includes('Server running at'))).toBe(true);
    expect(logs.some((l) => l.includes('Shutting down'))).toBe(true);
  });

  it('surfaces an init rejection via the server error handler without sleep', async () => {
    const errorDeferred = createDeferred<unknown>();
    const onError = vi.fn((err: unknown) => errorDeferred.resolve(err));
    const app = createExpressApp();
    const init = async (): Promise<void> => {
      throw new Error('init failed');
    };
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false, init, onError });
    servers.push(local.server);

    // Wait deterministically for error via deferred, not fixed sleep.
    const err = await Promise.race([
      errorDeferred.promise,
      waitForEvent(local.server, 'error', { timeoutMs: 2000 }).then((args) => args[0]),
    ]);
    expect(onError).toHaveBeenCalled();
    expect((err as Error).message).toBe('init failed');
  });
});
