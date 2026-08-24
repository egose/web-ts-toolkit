import { defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';
import { API_BASE_URL, DB_NAME, MONGODB_URI } from './src/config';
import { configureApiErrorBoundary, logServerError } from './src/errors';
import { categorySchema, todoSchema } from './src/models';
import { categoryRouterOptions, enforceBasicRouteContract, todoRouterOptions } from './src/routers';

export default defineRuntimeConfig({
  db: {
    url: MONGODB_URI,
    options: { dbName: DB_NAME },
  },
  models: [
    {
      name: 'Todo',
      schema: todoSchema,
      router: todoRouterOptions,
    },
    {
      name: 'Category',
      schema: categorySchema,
      router: categoryRouterOptions,
    },
  ],
  rootRouter: false,
  init({ modelRouters }) {
    configureApiErrorBoundary(modelRouters);
  },
  express: {
    middleware: [enforceBasicRouteContract],
    finalize(app) {
      app.get(API_BASE_URL, (_req, res) => {
        res.json({ name: '{{APP_NAME}}', ok: true });
      });
    },
    errorHandler(error, _req, res, _next) {
      logServerError(error, 'express');
      res.status(500).json({ success: false, message: 'Unexpected server error.' });
    },
  },
});
