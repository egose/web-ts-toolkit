import { defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';
import { API_BASE_URL, DB_NAME } from './src/config';
import { AppError } from './src/errors';
import { categorySchema, todoSchema } from './src/models';
import { categoryRouterOptions, rootRouterOptions, todoRouterOptions } from './src/routers';

export default defineRuntimeConfig({
  db: {
    url: process.env.MONGODB_URI,
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
  rootRouter: rootRouterOptions,
  express: {
    finalize(app) {
      app.get(API_BASE_URL, (_req, res) => {
        res.json({ name: '{{APP_NAME}}', ok: true });
      });
    },
    errorHandler(error, _req, res, _next) {
      console.error(error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Unexpected server error.' });
    },
  },
});
