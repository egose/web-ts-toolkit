import { buildOpenApiSpec } from './build-spec';
import { OpenApiCollisionError } from './errors';
import type { OpenApiDocumentOptions, OpenApiRegistryOptions, OpenApiRouteDescriptor } from './types';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const stableKey = (value: unknown): string => {
  if (value === null || typeof value === 'undefined') return 'null';
  if (typeof value === 'function') return '[Function]';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableKey).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableKey(obj[k])}`)
    .join(',')}}`;
};

const descriptorsEqual = (a: OpenApiRouteDescriptor, b: OpenApiRouteDescriptor): boolean => {
  // Sensitivity to user-provided functions / schema sources is handled by
  // stableKey which serializes functions as a placeholder. We cannot deep-
  // compare schema sources safely across rebuilds, so we restrict equality
  // to the wire-affecting identity: method, path, operationId, acl.
  return (
    a.method === b.method &&
    a.path === b.path &&
    (a.operationId ?? '') === (b.operationId ?? '') &&
    (a.acl ?? '') === (b.acl ?? '') &&
    stableKey(a.query) === stableKey(b.query) &&
    stableKey(a.body) === stableKey(b.body) &&
    stableKey(a.pathParams) === stableKey(b.pathParams) &&
    stableKey(a.responses) === stableKey(b.responses) &&
    stableKey(a.tags) === stableKey(b.tags) &&
    (a.summary ?? '') === (b.summary ?? '') &&
    (a.description ?? '') === (b.description ?? '') &&
    Boolean(a.deprecated) === Boolean(b.deprecated)
  );
};

export class OpenApiRegistry {
  private readonly routes: OpenApiRouteDescriptor[] = [];
  private options: Required<OpenApiRegistryOptions>;

  constructor(options: OpenApiRegistryOptions = {}) {
    this.options = {
      rejectConflicts: options.rejectConflicts ?? true,
      rejectDuplicateOperationIds: options.rejectDuplicateOperationIds ?? true,
    };
  }

  register(route: OpenApiRouteDescriptor) {
    const existingIndex = this.routes.findIndex((item) => item.method === route.method && item.path === route.path);

    if (existingIndex === -1) {
      this.assertOperationIdAvailable(route);
      this.routes.push(route);
      return;
    }

    const existing = this.routes[existingIndex];

    if (route.allowReplace) {
      this.assertOperationIdAvailable(route, existing);
      this.routes[existingIndex] = route;
      return;
    }

    if (descriptorsEqual(existing, route) && (route.idempotent || (isPlainObject(existing) && existing.idempotent))) {
      // Idempotent re-registration of an equivalent descriptor: no-op.
      return;
    }

    if (this.options.rejectConflicts) {
      throw new OpenApiCollisionError(
        `OpenAPI route collision: ${route.method.toUpperCase()} ${route.path} is already registered` +
          (existing.operationId ? ` as operationId="${existing.operationId}"` : '') +
          (route.operationId ? `; new registration uses operationId="${route.operationId}"` : '') +
          '. Set allowReplace:true on the new descriptor to override, or fix the duplicate registration.',
        {
          collisionKind: 'path',
          method: route.method,
          path: route.path,
          existing,
          incoming: route,
        },
      );
    }

    this.routes[existingIndex] = route;
  }

  private assertOperationIdAvailable(route: OpenApiRouteDescriptor, replacing?: OpenApiRouteDescriptor) {
    if (!this.options.rejectDuplicateOperationIds) return;
    if (!route.operationId) return;
    const clash = this.routes.find(
      (item) => item.operationId && item.operationId === route.operationId && item !== replacing,
    );
    if (clash) {
      // Descriptors flagged idempotent on both sides represent reserved
      // operations (e.g. the root batch `root.query`) that may be mounted at
      // multiple paths on the same runtime. Allow them to share the
      // operationId as an explicit opt-in so registering the same router
      // blueprint at several base paths is not blocked.
      if (route.idempotent && (clash as OpenApiRouteDescriptor).idempotent) return;
      throw new OpenApiCollisionError(
        `OpenAPI operationId collision: "${route.operationId}" is already bound to ` +
          `${clash.method.toUpperCase()} ${clash.path}. Each operationId must be unique across the spec.`,
        {
          collisionKind: 'operationId',
          operationId: route.operationId,
          existing: clash,
          incoming: route,
        },
      );
    }
  }

  getRoutes() {
    return [...this.routes];
  }

  clear() {
    this.routes.length = 0;
  }

  setStrictMode(enabled: boolean) {
    this.options.rejectConflicts = enabled;
    this.options.rejectDuplicateOperationIds = enabled;
  }

  getSpec(info: OpenApiDocumentOptions) {
    return buildOpenApiSpec(this.routes, info);
  }
}
