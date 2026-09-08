import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import express from 'express';
import request from 'supertest';
import { createExpressApp, createServerlessHandler } from '../src/index';
import { createServerlessAdapterApp } from '../src/cli-utils';
import { waitForListening } from './support/events';

describe('adapter e2e — real createServerlessHandler through local adapter', () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    for (const s of servers.splice(0)) {
      if (s.listening) {
        await new Promise<void>((resolve) => {
          s.close(() => resolve());
          setTimeout(() => {
            try {
              s.closeAllConnections?.();
            } catch (_e) {
              void _e;
            }
            resolve();
          }, 1000).unref?.();
        });
      } else {
        try {
          s.close();
        } catch (_e) {
          void _e;
        }
      }
    }
  });

  it('routes through adapter using a real serverless handler (JSON body)', async () => {
    const app = createExpressApp();
    app.post('/echo', (req, res) => res.json({ body: req.body, path: req.path }));
    const handler = createServerlessHandler(app);

    const adapterApp = createServerlessAdapterApp(handler);
    const res = await request(adapterApp).post('/echo').send({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ body: { hello: 'world' }, path: '/echo' });
  });

  it('routes via real HTTP server (adapter app listening) — deterministic readiness', async () => {
    const app = createExpressApp();
    app.get('/ping', (_req, res) => res.json({ pong: true }));
    app.get('/hello', (_req, res) => res.json({ hello: 'adapter' }));
    const handler = createServerlessHandler(app);
    const adapterApp = createServerlessAdapterApp(handler);

    // Start adapter as a real server, waiting deterministically for listening
    const { createServer } = await import('node:http');
    const server = createServer(adapterApp);
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    const addr = server.address() as { port: number };
    const url = `http://127.0.0.1:${addr.port}`;

    // Use real http.get / supertest against the listening server
    const res1 = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      http
        .get(`${url}/ping`, (res) => {
          let data = '';
          res.on('data', (c) => (data += c.toString()));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
        })
        .on('error', reject);
    });
    expect(res1.status).toBe(200);
    expect(JSON.parse(res1.body)).toEqual({ pong: true });

    const res2 = await request(url).get('/hello');
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({ hello: 'adapter' });
  });

  it('routes query strings through an AWS REST v1-shaped event without putting query in path', async () => {
    const app = createExpressApp();
    app.get('/x', (req, res) => res.json({ path: req.path, query: req.query, headers: req.headers['x-test'] }));
    const handler = createServerlessHandler(app);
    const adapterApp = createServerlessAdapterApp(handler);

    const res = await request(adapterApp).get('/x?a=1&a=2&empty=').set('x-test', 'yes');
    expect(res.status).toBe(200);
    expect(res.body.path).toBe('/x');
    expect(res.body.query).toEqual({ a: ['1', '2'], empty: '' });
    expect(res.body.headers).toBe('yes');
  });

  // ERT-B02: prototype-named query keys (old code threw
  // `multi[key].push is not a function` -> 500) must reach the handler.
  it('delivers literal and encoded prototype-named query keys to the handler without 500', async () => {
    const seen: unknown[] = [];
    const captureHandler = vi.fn().mockImplementation((event: unknown) => {
      seen.push(event);
      return Promise.resolve({ statusCode: 200, body: 'ok' });
    });
    const adapterApp = createServerlessAdapterApp(captureHandler);

    const res = await request(adapterApp).get(
      '/x?constructor=one&constructor=two&toString=a&%74oString=b&__proto__=p1&%5F%5Fproto%5F%5F=p2&plain=ok',
    );
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
    expect(captureHandler).toHaveBeenCalledOnce();
    const event = seen[0] as {
      queryStringParameters: Record<string, string>;
      multiValueQueryStringParameters: Record<string, string[]>;
    };
    // NOTE: JSON.parse keeps `__proto__` as an own key (a literal would set
    // the prototype instead).
    const expectedMulti = JSON.parse(
      '{"constructor":["one","two"],"toString":["a","b"],"__proto__":["p1","p2"],"plain":["ok"]}',
    ) as Record<string, string[]>;
    const expectedSingle = JSON.parse('{"constructor":"two","toString":"b","__proto__":"p2","plain":"ok"}') as Record<
      string,
      string
    >;
    expect(event.multiValueQueryStringParameters).toEqual(expectedMulti);
    expect(event.queryStringParameters).toEqual(expectedSingle);
    expect(Object.prototype.hasOwnProperty.call(event.queryStringParameters, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(event.multiValueQueryStringParameters, 'constructor')).toBe(true);
    expect(({} as Record<string, unknown>).constructor).toBe(Object);
  });

  it('round-trips encoded query edge cases according to the AWS REST v1 local contract', async () => {
    const app = createExpressApp();
    app.get('/edge', (req, res) => res.json(req.query));
    const handler = createServerlessHandler(app);
    const adapterApp = createServerlessAdapterApp(handler);

    const res = await request(adapterApp).get(
      '/edge?plus=a+b&space=a%20b&encodedDelimiter=a%26b%3Dc&unicode=%E2%9C%93&already=%2526',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      plus: 'a+b',
      space: 'a b',
      encodedDelimiter: 'a&b=c',
      unicode: '✓',
      already: '%26',
    });
  });

  // ERT-B03: raw request targets must survive event translation and
  // wrapped routing verbatim. Raw `http.request({ path })` is used
  // deliberately: URL-based clients normalize `//` and dot segments
  // before sending, which would hide the server-side rewrite. The old
  // WHATWG `URL` split turned `//admin/users` into `/users` and
  // `/a/../private` into `/private`.
  it('preserves raw request targets end to end over real HTTP', async () => {
    const seen: unknown[] = [];
    const captureHandler = vi.fn().mockImplementation((event: unknown) => {
      seen.push(event);
      return Promise.resolve({ statusCode: 200, body: 'ok' });
    });
    const adapterApp = createServerlessAdapterApp(captureHandler);
    const server = http.createServer(adapterApp);
    servers.push(server);
    server.listen(0, '127.0.0.1');
    const { port } = await waitForListening(server);

    const rawGet = (path: string): Promise<{ status: number; body: string }> =>
      new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, method: 'GET', path }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk.toString()));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
        });
        req.on('error', reject);
        req.end();
      });

    const rawPaths = ['//admin/users', '/a/../private', '/a/./b', '/%2E%2E/private', '/a%2Fb'];
    for (const path of rawPaths) {
      const res = await rawGet(path);
      expect(res.status).toBe(200);
    }
    expect(seen).toHaveLength(rawPaths.length);
    for (const [index, path] of rawPaths.entries()) {
      expect((seen[index] as { path: string }).path).toBe(path);
    }

    const queryRes = await rawGet('/x?a=1&a=2&encodedDelimiter=a%26b%3Dc&plus=a+b');
    expect(queryRes.status).toBe(200);
    const queryEvent = seen[seen.length - 1] as {
      path: string;
      queryStringParameters: Record<string, string>;
      multiValueQueryStringParameters: Record<string, string[]>;
    };
    expect(queryEvent.path).toBe('/x');
    expect(queryEvent.multiValueQueryStringParameters).toEqual({
      a: ['1', '2'],
      encodedDelimiter: ['a&b=c'],
      plus: ['a+b'],
    });
    expect(queryEvent.queryStringParameters).toEqual({ a: '2', encodedDelimiter: 'a&b=c', plus: 'a+b' });
  });

  it('routes raw paths literally instead of the previously normalized route', async () => {
    const app = createExpressApp();
    app.get('/users', (_req, res) => res.json({ route: 'users' }));
    app.get('/private', (_req, res) => res.json({ route: 'private' }));
    const handler = createServerlessHandler(app);
    const adapterApp = createServerlessAdapterApp(handler);
    const server = http.createServer(adapterApp);
    servers.push(server);
    server.listen(0, '127.0.0.1');
    const { port } = await waitForListening(server);

    const rawGet = (path: string): Promise<{ status: number; body: string }> =>
      new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, method: 'GET', path }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk.toString()));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
        });
        req.on('error', reject);
        req.end();
      });

    // Sanity: ordinary paths still route.
    for (const [path, route] of [
      ['/users', 'users'],
      ['/private', 'private'],
    ] as const) {
      const res = await rawGet(path);
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ route });
    }
    // Raw targets must not be rewritten onto those routes.
    for (const path of ['//admin/users', '/a/../private', '/a/./b']) {
      const res = await rawGet(path);
      expect(res.status).toBe(404);
    }
  });

  // ERT-B04: repeated request headers must stay distinct in
  // multiValueHeaders. `req.headers` has already joined duplicates
  // (`"one, with comma, two"`), so the adapter derives the maps from the
  // verbatim `rawHeaders` wire list instead of splitting on commas. A raw
  // socket is used so the two wire lines really differ in case.
  it('preserves repeated differently-cased headers with commas from rawHeaders over real HTTP', async () => {
    const seen: unknown[] = [];
    const captureHandler = vi.fn().mockImplementation((event: unknown) => {
      seen.push(event);
      return Promise.resolve({ statusCode: 200, body: 'ok' });
    });
    const adapterApp = createServerlessAdapterApp(captureHandler);
    const server = http.createServer(adapterApp);
    servers.push(server);
    server.listen(0, '127.0.0.1');
    const { port } = await waitForListening(server);

    const rawResponse = await new Promise<string>((resolve, reject) => {
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.write(
          'GET /x HTTP/1.1\r\n' +
            'Host: 127.0.0.1\r\n' +
            'X-Repeat: one, with comma\r\n' +
            'x-repeat: two\r\n' +
            'X-Plain: solo\r\n' +
            'Connection: close\r\n' +
            '\r\n',
        );
      });
      let data = '';
      sock.on('data', (chunk) => (data += chunk.toString()));
      sock.on('end', () => resolve(data));
      sock.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for raw HTTP response')), 5000).unref?.();
    });
    expect(rawResponse).toContain('200');
    expect(seen).toHaveLength(1);
    const event = seen[0] as {
      headers: Record<string, string>;
      multiValueHeaders: Record<string, string[]>;
    };
    // Values preserved verbatim in wire order — no comma splitting.
    expect(event.multiValueHeaders['x-repeat']).toEqual(['one, with comma', 'two']);
    // Documented single-map policy: repeated values joined with ", ".
    expect(event.headers['x-repeat']).toBe('one, with comma, two');
    expect(event.multiValueHeaders['x-plain']).toEqual(['solo']);
    expect(event.headers['x-plain']).toBe('solo');
  });

  it('delivers multiple Set-Cookie values from multiValueHeaders to the local client', async () => {
    const app = createExpressApp();
    app.get('/cookies', (_req, res) => {
      res.setHeader('Set-Cookie', ['a=1; Path=/', 'b=2; Path=/']);
      res.send('ok');
    });
    const handler = createServerlessHandler(app);
    const adapterApp = createServerlessAdapterApp(handler);

    const res = await request(adapterApp).get('/cookies');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('round-trips ordinary text request bodies and binary responses', async () => {
    const app = createExpressApp();
    app.post('/text', express.text({ type: '*/*' }), (req, res) => res.type('text/plain').send(req.body));
    app.get('/binary', (_req, res) => res.type('application/octet-stream').send(Buffer.from([0, 255, 1, 2])));
    const handler = createServerlessHandler(app, { serverlessOptions: { binary: ['application/octet-stream'] } });
    const adapterApp = createServerlessAdapterApp(handler);

    const text = await request(adapterApp).post('/text').type('text/plain').send('hello + world');
    expect(text.status).toBe(200);
    expect(text.text).toBe('hello + world');

    const binary = await request(adapterApp)
      .get('/binary')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(binary.status).toBe(200);
    expect(binary.body).toEqual(Buffer.from([0, 255, 1, 2]));
  });

  it('returns 500 for invalid handler results before sending partial response data', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const invalidResults = [
      { statusCode: 99, headers: { 'x-before': 'no' }, body: 'no' },
      { statusCode: 200, headers: { 'x-before': ['no'] }, body: 'no' },
      { statusCode: 200, isBase64Encoded: true, body: 'not base64!' },
      // ERT-B05: invalid multi-value name with an empty array must still fail
      // closed. Old code only validated names inside the value loop, so this
      // passed validation and leaked the staged `x-before` header at setHeader.
      { headers: { 'x-before': 'leak' }, multiValueHeaders: { 'bad header': [] }, body: 'leak' },
      null,
    ];

    for (const invalidResult of invalidResults) {
      const adapterApp = createServerlessAdapterApp(vi.fn().mockResolvedValue(invalidResult));
      const res = await request(adapterApp).get('/invalid');
      expect(res.status).toBe(500);
      expect(res.text).toBe('Internal server error');
      expect(res.headers['x-before']).toBeUndefined();
    }

    errorSpy.mockRestore();
  });

  // ERT-B05: real-HTTP regression — a sentinel header staged before an invalid
  // empty-array name must not leak onto the fallback 500 (no earlier headers,
  // body, or framing).
  it('returns a clean 500 over real HTTP when an empty header array has an invalid name', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const adapterApp = createServerlessAdapterApp(
      vi.fn().mockResolvedValue({
        statusCode: 200,
        headers: { 'x-sentinel': 'leak', 'content-type': 'text/plain' },
        multiValueHeaders: { 'bad header': [] },
        body: 'leak-body',
      }),
    );
    const server = http.createServer(adapterApp);
    servers.push(server);
    server.listen(0, '127.0.0.1');
    const { port } = await waitForListening(server);

    const raw = await new Promise<string>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/x' }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk.toString()));
        res.on('end', () => {
          const headerBlock = res.rawHeaders.join('\n');
          resolve(`${res.statusCode}\n${headerBlock}\n\n${data}`);
        });
      });
      req.on('error', reject);
      req.end();
    });
    expect(raw.split('\n')[0]).toBe('500');
    expect(raw).not.toMatch(/x-sentinel/i);
    expect(raw).not.toContain('leak-body');
    expect(raw).toContain('Internal server error');
    errorSpy.mockRestore();
  });

  // ERT-B05: valid empty arrays are omitted (documented policy) while cookies
  // and single/multi precedence still work.
  it('omits valid empty header arrays while preserving cookies and precedence', async () => {
    const adapterApp = createServerlessAdapterApp(
      vi.fn().mockResolvedValue({
        statusCode: 200,
        headers: { 'x-keep': 'yes', 'x-shadowed': 'single' },
        multiValueHeaders: {
          'x-empty': [],
          'set-cookie': ['a=1; Path=/', 'b=2; Path=/'],
          'x-shadowed': ['multi'],
        },
        body: 'ok',
      }),
    );

    const res = await request(adapterApp).get('/empty');
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
    expect(res.headers['x-keep']).toBe('yes');
    expect(res.headers['x-empty']).toBeUndefined();
    expect(res.headers['x-shadowed']).toBe('multi');
    expect(res.headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('handles 500 from handler without hanging (error path)', async () => {
    const app = createExpressApp();
    app.get('/boom', () => {
      throw new Error('boom');
    });
    const handler = createServerlessHandler(app);
    const adapterApp = createServerlessAdapterApp(handler);

    const res = await request(adapterApp).get('/boom');
    // ERT-B05: tightened — a throwing handler must deterministically surface
    // as 500 rather than permitting 200.
    expect(res.status).toBe(500);
  });

  it('keeps Express parser limits, hook conversion thresholds, and adapter rejection limits distinct', async () => {
    const parserLimitedApp = createExpressApp({
      json: { limit: 4 },
      errorHandler: (err, _req, res, _next) => {
        const status =
          typeof (err as { status?: unknown }).status === 'number' ? (err as { status: number }).status : 500;
        res.status(status).json({ source: 'express', status });
      },
    });
    parserLimitedApp.post('/json', (req, res) => res.json({ body: req.body }));
    const parserLimitedHandler = createServerlessHandler(parserLimitedApp, { maxBodyBytes: 1024 });
    const parserLimitedAdapter = createServerlessAdapterApp(parserLimitedHandler, { maxBodyBytes: 1024 });

    const parserLimit = await request(parserLimitedAdapter).post('/json').type('json').send({ hello: 'world' });
    expect(parserLimit.status).toBe(413);
    expect(parserLimit.body).toEqual({ source: 'express', status: 413 });

    const conversionLimitedApp = createExpressApp();
    conversionLimitedApp.post('/text', (req, res) => res.json({ isBuffer: Buffer.isBuffer(req.body) }));
    const conversionLimitedHandler = createServerlessHandler(conversionLimitedApp, { maxBodyBytes: 4 });
    const conversionLimitedAdapter = createServerlessAdapterApp(conversionLimitedHandler, { maxBodyBytes: 1024 });

    const conversionLimit = await request(conversionLimitedAdapter).post('/text').type('text').send('12345');
    expect(conversionLimit.status).toBe(200);
    expect(conversionLimit.body).toEqual({ isBuffer: true });

    const rejectedByAdapter = await request(createServerlessAdapterApp(conversionLimitedHandler, { maxBodyBytes: 4 }))
      .post('/text')
      .type('text')
      .send('12345');
    expect(rejectedByAdapter.status).toBe(413);
    expect(rejectedByAdapter.text).toBe('Payload Too Large');
  });

  it('uses waitForListening helper for deterministic adapter server startup — no sleep', async () => {
    const app = createExpressApp();
    app.get('/ready', (_req, res) => res.json({ ready: true }));
    const handler = createServerlessHandler(app);
    const adapterApp = createServerlessAdapterApp(handler);

    const server = http.createServer(adapterApp);
    servers.push(server);
    server.listen(0, '127.0.0.1');
    const { port } = await waitForListening(server);
    const res = await request(`http://127.0.0.1:${port}`).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ready: true });
  });
});
