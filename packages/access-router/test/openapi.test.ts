import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createAccessRuntime, createOpenApiRouter } from '../dist/index.mjs';

let modelCounter = 0;

const createApp = (options: Record<string, unknown> = {}, openApiRouter = true) => {
  const acl = createAccessRuntime();
  const modelName = `OpenApiUser${++modelCounter}`;

  mongoose.model(
    modelName,
    new mongoose.Schema({
      name: String,
      role: String,
    }),
  );

  const router = acl.createRouter(modelName, {
    basePath: '/users',
    operationAccess: false,
    permissionSchema: {
      name: true,
      role: true,
    },
    ...options,
  });

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  if (openApiRouter) {
    app.use(createOpenApiRouter(acl.runtime, { title: 'OpenAPI Test', version: '1.2.3' }));
  }

  return { acl, app, modelName };
};

afterEach(() => {
  mongoose.deleteModel(/OpenApiUser.*/);
});

describe('openapi router', () => {
  it('documents fixed routes with OpenAPI path parameters', async () => {
    const { app } = createApp();

    const response = await request(app).get('/openapi.json').expect(200).expect('Content-Type', /json/);

    expect(response.body.info).toEqual({ title: 'OpenAPI Test', version: '1.2.3' });
    expect(response.body.paths['/users/{id}'].get.parameters).toContainEqual({
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
  });

  it('reflects user request schema changes made after router construction', async () => {
    const { acl, app, modelName } = createApp();

    acl.setModelOption(
      modelName,
      'requestSchemas.update',
      z.object({
        nickname: z.string(),
      }),
    );

    const response = await request(app).get('/openapi.json').expect(200);
    const schema = response.body.paths['/users/{id}'].patch.requestBody.content['application/json'].schema;

    expect(schema.properties.nickname).toEqual({ type: 'string' });
  });

  it('combines advanced mutation wrapper schemas with nested user data schemas', async () => {
    const { app } = createApp({
      requestSchemas: {
        advancedUpdate: {
          data: z.object({
            role: z.enum(['admin', 'user']),
          }),
        },
      },
    });

    const response = await request(app).get('/openapi.json').expect(200);
    const schema = response.body.paths['/users/__mutation/{id}'].patch.requestBody.content['application/json'].schema;

    expect(schema.properties.data.properties.role).toEqual({ enum: ['admin', 'user'], type: 'string' });
    expect(schema.properties.options.type).toBe('object');
  });

  it('serves Swagger UI HTML', async () => {
    const { app } = createApp();

    const response = await request(app).get('/docs').expect(200).expect('Content-Type', /html/);

    expect(response.text).toContain('SwaggerUIBundle');
    expect(response.text).toContain('openapi.json');
  });

  it('supports the runtime API docs router helper', async () => {
    const { acl, app } = createApp({}, false);

    app.use(acl.createOpenApiRouter({ title: 'Runtime Docs', version: '1.0.0' }));

    const response = await request(app).get('/openapi.json').expect(200);

    expect(response.body.info).toEqual({ title: 'Runtime Docs', version: '1.0.0' });
  });

  it('uses a relative spec URL for nested custom docs paths', async () => {
    const { acl, app } = createApp({}, false);

    app.use(
      createOpenApiRouter(acl.runtime, {
        title: 'Nested Docs',
        version: '1.0.0',
        docsPath: '/swagger/ui',
        jsonPath: '/swagger/openapi.json',
      }),
    );

    const response = await request(app).get('/swagger/ui').expect(200).expect('Content-Type', /html/);

    expect(response.text).toContain('url: "openapi.json"');
  });
});
