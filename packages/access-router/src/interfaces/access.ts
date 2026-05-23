import type { AccessRouterPermissions } from '../permission';
import type { AccessRouterRequest } from './request';

export type GuardHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  permissions: AccessRouterPermissions,
) => boolean | Promise<boolean>;

export type Validation = boolean | string | string[] | GuardHook;

export type SelectAccess = 'list' | 'create' | 'read' | 'update' | string;
export type RouteGuardAccess =
  | 'new'
  | 'list'
  | 'read'
  | 'update'
  | 'upsert'
  | 'delete'
  | 'create'
  | 'distinct'
  | 'count'
  | 'subs'
  | string;
export type DocPermissionsAccess = 'list' | 'create' | 'read' | 'update' | string;
export type BaseFilterAccess = 'list' | 'read' | 'update' | 'delete' | string;
export type DecorateAccess = 'list' | 'create' | 'read' | 'update' | string;
export type DecorateAllAccess = 'list' | string;
export type ValidateAccess = 'create' | 'update' | string;
export type PrepareAccess = 'create' | 'update' | string;
export type TransformAccess = 'update' | string;
export type AfterPersistAccess = 'create' | 'update' | string;
