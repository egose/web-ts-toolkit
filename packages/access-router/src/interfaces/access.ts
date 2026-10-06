import type { AccessRouterPermissions } from '../permission';
import type { AccessRouterRequest } from './request';

export type GuardHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  permissions: AccessRouterPermissions,
) => boolean | Promise<boolean>;

export type Validation = boolean | string | string[] | GuardHook;

export type SelectAccess = 'list' | 'create' | 'read' | 'update' | string;

/** Base operations with both basic and advanced generated model routes. */
export type PairedRouteAccess = 'list' | 'read' | 'create' | 'update' | 'upsert' | 'count' | 'distinct';

/** Existing base route guards, including unpaired operations and subdocument access. */
export type RouteBaseAccess = PairedRouteAccess | 'new' | 'delete' | 'subs';

/** Server-owned transport variant for a paired generated route. */
export type RouteVariant = 'basic' | 'advanced';

/** The fourteen route-only keys, or the two keys for a specified paired base operation. */
export type RouteVariantAccess<TAccess extends PairedRouteAccess = PairedRouteAccess> =
  `${RouteVariant}${Capitalize<TAccess>}`;

/** Known route guards with the existing trusted custom access-string compatibility. */
export type RouteGuardAccess = RouteBaseAccess | RouteVariantAccess | (string & {});

export type DocPermissionsAccess = 'list' | 'create' | 'read' | 'update' | string;
export type BaseFilterAccess = 'list' | 'read' | 'update' | 'delete' | string;
export type DecorateAccess = 'list' | 'create' | 'read' | 'update' | string;
export type DecorateAllAccess = 'list' | string;
export type ValidateAccess = 'create' | 'update' | string;
export type PrepareAccess = 'create' | 'update' | string;
export type TransformAccess = 'update' | string;
export type AfterPersistAccess = 'create' | 'update' | string;
