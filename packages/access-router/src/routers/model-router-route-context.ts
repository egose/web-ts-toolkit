import JsonRouter from '@web-ts-toolkit/express-json-router';
import type { z } from 'zod';
import type { ModelRouterOptions, ModelRequest } from '../interfaces';
import type { PublicService } from '../services';

export type ModelRouterRouteContext<TModel> = {
  modelName: string;
  router: JsonRouter;
  options: ModelRouterOptions<TModel>;
  getRequestSchema(key: string): z.ZodTypeAny | undefined;
  getPublicService(req: ModelRequest): PublicService<TModel>;
  assertAllowed(req: ModelRequest, access: string): Promise<void>;
};
