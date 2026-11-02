import type { AccessRouterPermissions } from '../permission';
import type { AccessRouterRequest } from './request';

/** Request-only operation guard: one permissions argument and original-request `this`, never document facts. */
export type GuardHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  permissions: AccessRouterPermissions,
) => boolean | Promise<boolean>;

export type Validation = boolean | string | string[] | GuardHook;

/**
 * Immutable literal-boolean facts normalized once per owning document stage.
 * Return a plain own enumerable string-keyed record (at most 19,999 keys), not rich,
 * nested/native, accessor, proxy, symbol or protected-key values. Invalid fulfilled
 * maps fail the whole operation with BadRequest (400); missing hooks yield empty facts,
 * and throwing/rejected hooks also emit a fixed-category warning. The application map is copied, not frozen.
 * Facts are not backend grants, reusable output authority or a database freshness promise.
 */
export type DocumentGrants = Readonly<Record<string, boolean>>;

/**
 * Two-argument permissionSchema predicate with original-request `this`.
 * Document output uses immutable stage facts; DataService, new/create-input and raw
 * helpers use frozen empty facts. Existing-document input uses separate normalized
 * pre-write facts (including negative predicates); post-write output resolves afresh.
 * A throw denies the field. Captured actor queries cannot mutate backing permissions.
 * Empty facts do not prove `!grants.suspended` about a current document.
 */
export type FieldPermissionHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  permissions: AccessRouterPermissions,
  grants: DocumentGrants,
) => boolean | Promise<boolean>;

/** Existing field grammar, separate from one-argument operation guards. */
export type FieldValidation = boolean | string | string[] | FieldPermissionHook;

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
