import http from 'node:http';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import {
  createExpressApp,
  createServerlessHandler,
  startLocalServer,
  normalizePort,
  defaultRequestHook,
  type Logger,
} from '../src/index';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function waitForListening(server: http.Server): Promise<{ port: number }> {
  return new Promise((resolve) => {
    server.on('listening', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ port });
    });
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

  it('allows overriding the request hook', async () => {
    const app = createExpressApp();
    app.post('/echo', (req, res) => res.json({ body: req.body }));
    const requestHook = vi.fn();
    const handler = createServerlessHandler(app, { request: requestHook });

    await handler(makeServerlessEvent('POST', '/echo', { hi: 1 }, 'application/json'), {});
    expect(requestHook).toHaveBeenCalledOnce();
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

  it('swallows JSON.parse errors and leaves the body unchanged', () => {
    const req = { body: Buffer.from('not json'), headers: { 'content-type': 'application/json' } };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    defaultRequestHook(req);
    // The assignment threw before completing, so req.body remains the Buffer.
    expect(Buffer.isBuffer(req.body)).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
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

  it('throws on negative ports', () => {
    expect(() => normalizePort(-1)).toThrow('Invalid port');
  });

  it('throws on out-of-range ports', () => {
    expect(() => normalizePort(70000)).toThrow('Invalid port');
  });

  it('returns non-numeric strings as named-pipe paths', () => {
    // Per the ego-workspace convention, anything that doesn't parse as a
    // number is returned as-is so callers can use named-pipe paths.
    expect(normalizePort('123abc')).toBe('123abc');
  });
});

// ---------------------------------------------------------------------------
// startLocalServer
// ---------------------------------------------------------------------------

describe('startLocalServer', () => {
  const servers: http.Server[] = [];

  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.close();
    }
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
    let releaseRequest!: () => void;
    const releasePromise = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    app.get('/slow', (_req, res) => {
      releasePromise.then(() => res.json({ drained: true }));
    });

    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false });
    servers.push(local.server);

    const { port } = await waitForListening(local.server);
    const url = `http://127.0.0.1:${port}`;

    // Fire a real HTTP request (supertest defers until awaited, so use http.get
    // directly so the request is in flight before shutdown is called).
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

    // Allow the request to connect and the handler to hang on releasePromise.
    await new Promise((r) => setTimeout(r, 100));

    const shutdownPromise = local.shutdown();
    releaseRequest();
    const slowRes = await slowRequest;
    await shutdownPromise;

    expect(slowRes.status).toBe(200);
    expect(JSON.parse(slowRes.body)).toEqual({ drained: true });
  });

  it('does not register signal listeners when signals: false', () => {
    const before = process.listenerCount('SIGINT');
    const app = createExpressApp();
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false });
    servers.push(local.server);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  it('registers signal listeners by default', () => {
    const before = process.listenerCount('SIGINT');
    const app = createExpressApp();
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1' });
    servers.push(local.server);
    expect(process.listenerCount('SIGINT')).toBeGreaterThan(before);
    // Restore baseline so subsequent tests are unaffected.
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
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

  it('surfaces an init rejection via the server error handler', async () => {
    const onError = vi.fn();
    const app = createExpressApp();
    const init = async (): Promise<void> => {
      throw new Error('init failed');
    };
    const local = startLocalServer(app, { port: 0, host: '127.0.0.1', signals: false, init, onError });
    servers.push(local.server);

    // Wait briefly for the async start to surface the rejection on the server.
    await new Promise((r) => setTimeout(r, 50));
    expect(onError).toHaveBeenCalled();
  });
});
