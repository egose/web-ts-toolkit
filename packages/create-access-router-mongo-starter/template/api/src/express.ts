import type { Request, Response } from 'express';
import { combineRoutes, createAccessRuntime } from '@web-ts-toolkit/access-router';
import { createExpressApp } from '@web-ts-toolkit/express-runtime';
import { AppError } from './errors';
import './models';
import { createRouters } from './routers';

export function createExpress() {
  const runtime = createAccessRuntime();
  const { todoRouter, categoryRouter, rootRouter } = createRouters(runtime);
  const apiRouter = combineRoutes(todoRouter, categoryRouter, rootRouter);

  return createExpressApp({
    finalize: (app) => {
      app.get('/api', (_req: Request, res: Response) => {
        res.json({ name: '{{APP_NAME}}', ok: true });
      });
      app.use(apiRouter);
    },
    errorHandler: (error: unknown, _req: Request, res: Response, _next: unknown) => {
      console.error(error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Unexpected server error.' });
    },
  });
}
