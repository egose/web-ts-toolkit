import JsonRouter from '@web-ts-toolkit/express-json-router';
import type { ModelRouterOptions, ModelRequest } from '../interfaces';
import type { PublicService } from '../services';
import type { RequestSchemaLike } from '../validation/types';
import type { OpenApiRouteDescriptor } from '../openapi';

export type ModelRouterRouteContext<TModel> = {
  modelName: string;
  router: JsonRouter;
  options: ModelRouterOptions<TModel>;
  getRequestSchema(key: string): RequestSchemaLike | undefined;
  getPublicService(req: ModelRequest): PublicService<TModel>;
  assertAllowed(req: ModelRequest, access: string): Promise<void>;
  registerOpenApiRoute(route: OpenApiRouteDescriptor): void;
};
