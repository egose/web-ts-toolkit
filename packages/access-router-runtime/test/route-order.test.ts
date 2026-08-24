import express from 'express';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRouterRuntime, type AccessRouterRuntimeInstance } from '../src/index';

describe('access-router-runtime route ordering', () => {
  const runtimes: AccessRouterRuntimeInstance[] = [];

  const trackRuntime = (runtime: AccessRouterRuntimeInstance) => {
    runtimes.push(runtime);
    return runtime;
  };

  afterEach(async () => {
    for (const runtime of runtimes.splice(0).reverse()) {
      await runtime.shutdown().catch(() => undefined);
    }
    vi.restoreAllMocks();
  });

  it('runs pre middleware, parsers, middleware, routers, post middleware, and finalize in order', async () => {
    const events: string[] = [];
    const route = express.Router();

    route.post('/phase', (req, _res, next) => {
      events.push(`router:${String(req.body.marker)}`);
      next();
    });

    const runtime = trackRuntime(
      createAccessRouterRuntime({
        extraRoutes: [route],
        express: {
          preMiddleware: [
            ((req, _res, next) => {
              events.push(`pre:${req.body === undefined ? 'unparsed' : 'parsed'}`);
              next();
            }) satisfies RequestHandler,
          ],
          middleware: [
            ((req, _res, next) => {
              events.push(`middleware:${String(req.body.marker)}`);
              next();
            }) satisfies RequestHandler,
          ],
          postMiddleware: [
            ((_req, _res, next) => {
              events.push('post');
              next();
            }) satisfies RequestHandler,
          ],
          finalize(app) {
            app.post('/phase', (_req, res) => {
              events.push('finalize');
              res.json({ events });
            });
          },
          errorHandler: ((error, _req, res, next) => {
            void next;
            events.push('error');
            res.status(500).json({ message: error instanceof Error ? error.message : String(error), events });
          }) satisfies ErrorRequestHandler,
        },
      }),
    );

    await request(runtime.app)
      .post('/phase')
      .send({ marker: 'parsed-body' })
      .expect(200, {
        events: ['pre:unparsed', 'middleware:parsed-body', 'router:parsed-body', 'post', 'finalize'],
      });
  });

  it('lets post-router 404 middleware handle only unmatched requests', async () => {
    const runtime = trackRuntime(
      createAccessRouterRuntime({
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
        express: {
          postMiddleware: [
            ((_req, res) => {
              res.status(404).json({ source: 'post-404' });
            }) satisfies RequestHandler,
          ],
        },
      }),
    );

    const generatedResponse = await request(runtime.app).get('/api/status').expect(200);
    expect(generatedResponse.body).not.toEqual({ source: 'post-404' });
    await request(runtime.app).get('/api/missing').expect(404, { source: 'post-404' });
  });

  it('mounts generated routes before extra routes and OpenAPI after them', async () => {
    const extra = express.Router();
    extra.get('/api/model-data-order', (_req, res) => {
      res.json({ source: 'extra' });
    });
    extra.get('/api/data-extra-order', (_req, res) => {
      res.json({ source: 'extra' });
    });
    extra.post('/api/root-order', (_req, res) => {
      res.json({ source: 'extra' });
    });
    extra.get('/api/openapi-order', (_req, res) => {
      res.json({ source: 'extra' });
    });

    const runtime = trackRuntime(
      createAccessRouterRuntime({
        rootRouter: {
          basePath: '/api/root-order',
          operationAccess: true,
        },
        models: [
          {
            name: 'AccessRouterRuntimeOrderPost',
            schema: new mongoose.Schema({ title: String }),
            router: {
              basePath: '/api/model-data-order',
              operationAccess: false,
            },
            customRoutes: [
              {
                method: 'get',
                path: '/custom/model',
                handler: async () => ({ source: 'model' }),
              },
            ],
          },
        ],
        data: [
          {
            name: 'order',
            router: {
              basePath: '/api/model-data-order/custom/model',
              idField: 'id',
              operationAccess: { list: true, read: true },
              data: [{ id: 'data', source: 'data' }],
              permissionSchema: { id: true, source: true },
            },
          },
          {
            name: 'dataExtraOrder',
            router: {
              basePath: '/api/data-extra-order',
              idField: 'id',
              operationAccess: { list: true, read: true },
              data: [{ id: 'data', source: 'data' }],
              permissionSchema: { id: true, source: true },
            },
          },
        ],
        extraRoutes: [extra],
        openApi: {
          title: 'Ordered API',
          version: '1.0.0',
          jsonPath: '/api/openapi-order',
          docsPath: false,
        },
      }),
    );

    await request(runtime.app).get('/api/model-data-order/custom/model').expect(200, { source: 'model' });
    const dataResponse = await request(runtime.app).get('/api/data-extra-order').expect(200);
    expect(dataResponse.body).not.toEqual({ source: 'extra' });
    await request(runtime.app).post('/api/root-order').send([]).expect(200, []);
    await request(runtime.app).get('/api/openapi-order').expect(200, { source: 'extra' });
  });

  it('sends generated and custom route errors to the configured final error handler', async () => {
    const extra = express.Router();
    const handledMessages: string[] = [];
    extra.get('/api/custom-error', () => {
      throw new Error('custom boom');
    });

    const runtime = trackRuntime(
      createAccessRouterRuntime({
        extraRoutes: [extra],
        openApi: {
          title: 'Error API',
          version: '1.0.0',
          jsonPath: '/api/openapi-error',
          docsPath: false,
        },
        express: {
          errorHandler: ((error, _req, res, next) => {
            void next;
            const message = error instanceof Error ? error.message : String(error);
            handledMessages.push(message);
            res.status(599).json({ message });
          }) satisfies ErrorRequestHandler,
        },
      }),
    );

    vi.spyOn(runtime.runtime.runtime, 'getOpenApiSpec').mockImplementation(() => {
      throw new Error('openapi boom');
    });

    await request(runtime.app).get('/api/custom-error').expect(599, { message: 'custom boom' });
    await request(runtime.app).get('/api/openapi-error').expect(599, { message: 'openapi boom' });
    expect(handledMessages).toEqual(['custom boom', 'openapi boom']);
  });

  it('keeps root and OpenAPI disabled plus empty-runtime behavior intact', async () => {
    const runtime = trackRuntime(
      createAccessRouterRuntime({
        rootRouter: false,
        openApi: false,
        express: {
          finalize(app) {
            app.get('/health', (_req, res) => {
              res.json({ ok: true });
            });
          },
        },
      }),
    );

    await request(runtime.app).get('/health').expect(200, { ok: true });
    await request(runtime.app).get('/openapi.json').expect(404);
    await request(runtime.app).post('/').send([]).expect(404);
  });
});
