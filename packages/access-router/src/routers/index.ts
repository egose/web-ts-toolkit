import express, { type Router } from 'express';
import { DataRouter } from './data-router';
import { ModelRouter } from './model-router';
import { RootRouter } from './root-router';
export * from './model-router';
export * from './root-router';
export * from './data-router';
import JsonRouter from '@web-ts-toolkit/express-json-router';
import { logger } from '../logger';
export { createOpenApiRouter } from '../openapi';

type AccessRouterInstance = ModelRouter<any> | DataRouter<any> | RootRouter;

export type CombinedRouteInput = Router | AccessRouterInstance;

const hasRoutes = (input: CombinedRouteInput): input is AccessRouterInstance => {
  return typeof input === 'object' && input !== null && 'routes' in input;
};

const resolveRoutes = (input: CombinedRouteInput): Router => {
  return hasRoutes(input) ? input.routes : input;
};

export function combineRoutes(...inputs: CombinedRouteInput[]): Router {
  const router = express.Router();

  inputs.forEach((input) => {
    router.use(resolveRoutes(input));
  });

  return router;
}

export const accessRouterResponseHandler = JsonRouter.createHandler({
  errorFormat: JsonRouter.ErrorFormats.rfc9457,
  rfc9457ContentType: 'application/problem+json',
});

accessRouterResponseHandler.errorMessageProvider = function (error) {
  const errorLike = error as { message?: string; _message?: string };

  logger.error(error);
  return errorLike.message || errorLike._message || String(error);
};
