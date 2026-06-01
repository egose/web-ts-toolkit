import { normalizeUrlPath } from '@web-ts-toolkit/utils';
import type { AccessRuntime } from '../runtime';
import type { OpenApiRouteDescriptor } from './types';

export function registerOpenApiRoute(
  runtime: AccessRuntime,
  basePath: string,
  defaultTag: string,
  route: OpenApiRouteDescriptor,
) {
  runtime.registerOpenApiRoute({
    ...route,
    path: normalizeUrlPath(basePath + route.path),
    tags: route.tags ?? [defaultTag],
  });
}
