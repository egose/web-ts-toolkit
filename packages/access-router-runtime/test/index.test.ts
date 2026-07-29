import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRouterRuntime, defineRuntimeConfig, type AccessRouterRuntimeConfig } from '../src/index';

describe('access-router-runtime', () => {
  afterEach(async () => {
    mongoose.deleteModel(/AccessRouterRuntime.*/);
    vi.restoreAllMocks();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('builds an express app from model, data, root, and openapi config', async () => {
    const runtime = createAccessRouterRuntime(
      defineRuntimeConfig({
        globalOptions: {
          globalPermissions() {
            return [];
          },
        },
        rootRouter: {
          basePath: '/api/root',
          operationAccess: true,
        },
        models: [
          {
            name: 'AccessRouterRuntimePost',
            schema: new mongoose.Schema({ title: String }),
            router: {
              basePath: '/api/posts',
              operationAccess: { new: true },
              permissionSchema: { title: true },
            },
          },
        ],
        data: [
          {
            name: 'status',
            router: {
              basePath: '/api/status',
              idField: 'id',
              operationAccess: { list: true, read: true },
              data: [{ id: 'ok', label: 'OK' }],
              permissionSchema: { id: true, label: true },
            },
          },
        ],
        openApi: {
          title: 'Runtime API',
          version: '1.0.0',
          jsonPath: '/api/openapi.json',
          docsPath: false,
        },
      }),
    );

    expect(runtime.models.AccessRouterRuntimePost).toBeDefined();

    await request(runtime.app).get('/api/status').expect(200);

    const openApiResponse = await request(runtime.app)
      .get('/api/openapi.json')
      .expect(200)
      .expect('Content-Type', /json/);
    expect(openApiResponse.body.paths['/api/posts/new']).toBeDefined();
    expect(openApiResponse.body.paths['/api/root']).toBeDefined();
  });

  it('uses db config in init and shutdown lifecycle hooks', async () => {
    const connectSpy = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    const disconnectSpy = vi.spyOn(mongoose, 'disconnect').mockResolvedValue(mongoose);
    const initHook = vi.fn();
    const shutdownHook = vi.fn();

    const runtime = createAccessRouterRuntime({
      db: {
        url: 'mongodb://127.0.0.1:27017/access-router-runtime-test',
      },
      init: initHook,
      shutdown: shutdownHook,
    });

    await runtime.init();
    await runtime.init();
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(initHook).toHaveBeenCalledTimes(1);

    await runtime.shutdown();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(shutdownHook).toHaveBeenCalledTimes(1);
  });

  it('mounts model custom routes that return JSON values', async () => {
    const runtime = createAccessRouterRuntime({
      models: [
        {
          name: 'AccessRouterRuntimeUser',
          schema: new mongoose.Schema({ name: String }),
          router: {
            basePath: '/api/users',
            operationAccess: false,
          },
          customRoutes: [
            {
              method: 'get',
              path: '/:id/custom',
              handler: async (req) => ({ id: req.params.id, ok: true }),
            },
          ],
        },
      ],
    });

    await request(runtime.app).get('/api/users/123/custom').expect(200, { id: '123', ok: true });
  });

  it('mounts model custom routes that use the response object directly', async () => {
    const runtime = createAccessRouterRuntime({
      models: [
        {
          name: 'AccessRouterRuntimeMember',
          schema: new mongoose.Schema({ name: String }),
          router: {
            basePath: '/api/members',
            operationAccess: false,
          },
          customRoutes: [
            {
              method: 'post',
              path: '/status',
              handler: (_req, res) => {
                res.status(201).json({ created: true });
              },
            },
          ],
        },
      ],
    });

    await request(runtime.app).post('/api/members/status').expect(201, { created: true });
  });

  it('creates a serverless handler that preserves caller init hooks', async () => {
    const runtimeInit = vi.fn();
    const userInit = vi.fn();

    const config: AccessRouterRuntimeConfig = {
      init: runtimeInit,
      express: {
        finalize(app) {
          app.get('/ok', (_req, res) => {
            res.json({ ok: true });
          });
        },
      },
    };

    const runtime = createAccessRouterRuntime(config);
    const handler = runtime.createServerlessHandler({ init: userInit });

    await handler(
      {
        httpMethod: 'GET',
        path: '/ok',
        headers: {},
      },
      {},
    );

    expect(runtimeInit).toHaveBeenCalledTimes(1);
    expect(userInit).toHaveBeenCalledTimes(1);
  });
});
