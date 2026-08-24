// @vitest-environment node
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalApiBaseUrl = process.env.API_BASE_URL;

afterEach(() => {
  if (originalApiBaseUrl === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = originalApiBaseUrl;
  vi.resetModules();
});

function serverlessEvent(path: string) {
  return { httpMethod: 'GET', path, headers: {} };
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

      const response = (await runtime.createServerlessHandler()(serverlessEvent('/.netlify/functions/main'), {})) as {
        statusCode: number;
        body: string;
      };
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ ok: true });
    } finally {
      await local.shutdown();
    }
  });

  it.each(['https://example.test/api', '//example.test/api', '/api?query=1', '/api#fragment', '/api\\x', '/api/../x'])(
    'rejects an invalid backend prefix before runtime startup: %s',
    async (value) => {
      process.env.API_BASE_URL = value;
      vi.resetModules();
      await expect(import('../api/access-router.config')).rejects.toThrow('API_BASE_URL');
    },
  );
});
