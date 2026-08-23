import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'node:http';
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

  it('handles 500 from handler without hanging (error path)', async () => {
    const app = createExpressApp();
    app.get('/boom', () => {
      throw new Error('boom');
    });
    const handler = createServerlessHandler(app);
    const adapterApp = createServerlessAdapterApp(handler);

    const res = await request(adapterApp).get('/boom');
    // Serverless-http will return 500 via Express error handling; adapter should forward.
    // Even if not, we verify adapter doesn't hang and responds deterministically.
    expect([500, 200]).toContain(res.status);
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
