import { defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';
import { API_BASE_URL, DB_NAME, MONGODB_URI } from './src/config';
import { configureApiErrorBoundary, logServerError, resolveExpressError } from './src/errors';
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
  async init({ config, models, modelRouters }) {
    configureApiErrorBoundary(modelRouters);
    // Non-destructive index readiness policy: `Model.init()` builds missing
    // indexes via `createIndex` without dropping or rebuilding existing ones.
    // Never use `syncIndexes()` here — it drops unlisted indexes. Awaiting
    // here keeps the runtime out of `ready` until the required unique index
    // (Category name) is enforced; index failure rejects init and prevents
    // readiness instead of serving requests without uniqueness. When no
    // database URL is configured (db-less parity paths), there is nothing to
    // ensure, so init proceeds without touching the models — `Model.init()`
    // would otherwise buffer indefinitely on a disconnected connection.
    if (!config.db?.url) return;
    await Promise.all(Object.values(models).map((model) => model.init()));
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
      const resolved = resolveExpressError(error);
      res.status(resolved.statusCode).json({ success: false, message: resolved.message });
    },
  },
});
