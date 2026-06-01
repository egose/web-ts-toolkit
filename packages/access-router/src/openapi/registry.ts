import { buildOpenApiSpec } from './build-spec';
import type { OpenApiDocumentOptions, OpenApiRouteDescriptor } from './types';

export class OpenApiRegistry {
  private readonly routes: OpenApiRouteDescriptor[] = [];

  register(route: OpenApiRouteDescriptor) {
    const existingIndex = this.routes.findIndex((item) => item.method === route.method && item.path === route.path);

    if (existingIndex === -1) {
      this.routes.push(route);
      return;
    }

    this.routes[existingIndex] = route;
  }

  getRoutes() {
    return [...this.routes];
  }

  getSpec(info: OpenApiDocumentOptions) {
    return buildOpenApiSpec(this.routes, info);
  }
}
