// @vitest-environment node
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalApiBaseUrl = process.env.API_BASE_URL;

afterEach(() => {
  if (originalApiBaseUrl === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = originalApiBaseUrl;
  vi.resetModules();
});

function serverlessRequest(method: string, path: string, body?: unknown) {
  return {
    httpMethod: method,
    path,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

describe.sequential('API base path integration', () => {
  it('mounts the same configured prefix for local and serverless requests', async () => {
    process.env.API_BASE_URL = '/.netlify/functions/main/';
    vi.resetModules();
    const [{ createAccessRouterRuntime }, { default: config }] = await Promise.all([
      import('@web-ts-toolkit/access-router-runtime'),
      import('../api/access-router.config'),
    ]);
    const runtime = createAccessRouterRuntime({ ...config, db: undefined });
    const local = runtime.startLocalServer({
      host: '127.0.0.1',
      port: 0,
      signals: false,
      logger: { log: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });
    if (!local.server.listening) {
      await new Promise<void>((resolve) => local.server.once('listening', resolve));
    }

    try {
      await request(local.server).get('/.netlify/functions/main').expect(200);
      await request(local.server).get('/api').expect(404);

      const response = (await runtime.createServerlessHandler()(
        serverlessRequest('GET', '/.netlify/functions/main'),
        {},
      )) as {
        statusCode: number;
        body: string;
      };
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ ok: true });
    } finally {
      await local.shutdown();
    }
  });

  it.each([
    'https://example.test/api',
    '//example.test/api',
    '/api?query=1',
    '/api#fragment',
    '/api\\x',
    '/api/../x',
    '/api/:version',
    '/api/*',
    '/api(x)',
    '/api%41',
    '/api/%3Aversion',
  ])('rejects an invalid backend prefix before runtime startup: %s', async (value) => {
    process.env.API_BASE_URL = value;
    vi.resetModules();
    await expect(import('../api/access-router.config')).rejects.toThrow('API_BASE_URL');
  });

  // CARMSF-12: an accepted literal prefix must mount CRUD while the
  // pre-router list/ID/advanced-mutation guards stay active, on both the
  // local and serverless entrypoints. All assertions below resolve before
  // any Mongoose persistence, so no database connection is required.
  it('honors an accepted custom prefix for mounted CRUD and guards on both entrypoints', async () => {
    process.env.API_BASE_URL = '/custom/api';
    vi.resetModules();
    const [{ createAccessRouterRuntime }, { default: config }] = await Promise.all([
      import('@web-ts-toolkit/access-router-runtime'),
      import('../api/access-router.config'),
    ]);
    const runtime = createAccessRouterRuntime({ ...config, db: undefined });
    const local = runtime.startLocalServer({
      host: '127.0.0.1',
      port: 0,
      signals: false,
      logger: { log: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });
    if (!local.server.listening) {
      await new Promise<void>((resolve) => local.server.once('listening', resolve));
    }

    try {
      // Mounted CRUD honors the custom prefix: request validation runs under it.
      await request(local.server).post('/custom/api/todos').send({ title: '   ' }).expect(400);
      // The default prefix is not mounted when a custom prefix is configured.
      await request(local.server).post('/api/todos').send({ title: '   ' }).expect(404);
      // Advanced mutations stay blocked under the custom prefix.
      await request(local.server)
        .post('/custom/api/todos/__mutation')
        .send({ data: { title: 'Bypass' } })
        .expect(404);
      await request(local.server)
        .patch('/custom/api/todos/__mutation/507f1f77bcf86cd799439011')
        .send({ data: { title: 'Bypass' } })
        .expect(404);
      // List and ID guards stay active under the custom prefix.
      await request(local.server)
        .post('/custom/api/todos/__query')
        .send({ filter: { title: 'unindexed' } })
        .expect(400);
      await request(local.server).get('/custom/api/todos/not-an-object-id').expect(400);

      const handler = runtime.createServerlessHandler();
      const invoke = async (method: string, path: string, body?: unknown) =>
        (await handler(serverlessRequest(method, path, body), {})) as {
          statusCode: number;
          body: string;
        };
      expect((await invoke('POST', '/custom/api/todos', { title: '   ' })).statusCode).toBe(400);
      expect((await invoke('POST', '/api/todos', { title: '   ' })).statusCode).toBe(404);
      expect((await invoke('POST', '/custom/api/todos/__mutation', { data: { title: 'Bypass' } })).statusCode).toBe(
        404,
      );
      expect((await invoke('POST', '/custom/api/todos/__query', { filter: { title: 'unindexed' } })).statusCode).toBe(
        400,
      );
      expect((await invoke('GET', '/custom/api/todos/not-an-object-id')).statusCode).toBe(400);
    } finally {
      await local.shutdown();
    }
  });
});
