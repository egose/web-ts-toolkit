import type { AccessRouterPermissions } from '../permission';
import type {
  Change,
  DataHookContext,
  DataRequest,
  Filter,
  ModelDocument,
  ModelHookContext,
  ModelRequest,
} from './base';
import type { AccessRouterRequest } from './request';

export type MaybePromise<T> = T | Promise<T>;

export type AccessRouterFieldKey<T> = [Extract<keyof T, string>] extends [never] ? string : Extract<keyof T, string>;

export type IdentifierHook<TValue, TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  id: string,
) => MaybePromise<Filter<TValue>>;

export type GlobalPermissionValue = Record<string, boolean> | string[] | string | null | undefined;

type BaseFilterHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  permissions: AccessRouterPermissions,
) => MaybePromise<Filter | true | null | undefined>;

type OverrideFilterHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  filter: Filter,
  permissions: AccessRouterPermissions,
) => MaybePromise<Filter>;

type Hook<TValue, TContext, TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  value: TValue,
  permissions: AccessRouterPermissions,
  context: TContext,
) => MaybePromise<TValue>;

type HookChain<TValue, TContext, TRequest extends AccessRouterRequest = AccessRouterRequest> =
  | Hook<TValue, TContext, TRequest>
  | Array<Hook<TValue, TContext, TRequest>>;

export type ValidateRule = boolean | unknown[];

type ValidateHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  allowedData: unknown,
  permissions: AccessRouterPermissions,
  context: ModelHookContext,
) => MaybePromise<ValidateRule>;

type DocPermissionsHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  doc: unknown,
  permissions: AccessRouterPermissions,
  context: ModelHookContext,
) => MaybePromise<Record<string, unknown>>;

type ChangeHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  previousValue: unknown,
  nextValue: unknown,
  changes: Change[],
  context: ModelHookContext,
) => MaybePromise<void>;

type DeleteHook<TValue = unknown, TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  value: TValue,
  permissions: AccessRouterPermissions,
  context: ModelHookContext,
) => MaybePromise<void>;

type DocumentHook<TValue, TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  value: ModelDocument<TValue>,
  permissions: AccessRouterPermissions,
  context: ModelHookContext,
) => MaybePromise<ModelDocument<TValue>>;

type DocumentHookChain<TValue, TRequest extends AccessRouterRequest = AccessRouterRequest> =
  | DocumentHook<TValue, TRequest>
  | Array<DocumentHook<TValue, TRequest>>;

export type ModelBaseFilterHook = BaseFilterHook<ModelRequest>;
export type DataBaseFilterHook = BaseFilterHook<DataRequest>;
export type ModelOverrideFilterHook = OverrideFilterHook<ModelRequest>;
export type DataOverrideFilterHook = OverrideFilterHook<DataRequest>;
export type ModelIdentifierHook<TValue = unknown> = IdentifierHook<TValue, ModelRequest>;
export type DataIdentifierHook<TValue = unknown> = IdentifierHook<TValue, DataRequest>;
export type ModelValidateHook = ValidateHook<ModelRequest>;
export type ModelDocPermissionsHook = DocPermissionsHook<ModelRequest>;
export type ModelChangeHook = ChangeHook<ModelRequest>;
export type ModelDocumentHook<TValue = unknown> = DocumentHookChain<TValue, ModelRequest>;
export type ModelDeleteHook<TValue = unknown> = DeleteHook<ModelDocument<TValue>, ModelRequest>;
export type ModelHook<TValue = unknown> = HookChain<TValue, ModelHookContext, ModelRequest>;
export type ModelListHook<TValue = unknown> = HookChain<TValue[], ModelHookContext, ModelRequest>;
export type DataHook<TValue = unknown> = HookChain<TValue, DataHookContext, DataRequest>;
export type DataListHook<TValue = unknown> = HookChain<TValue[], DataHookContext, DataRequest>;

/**
 * Supported per-access virtual getter keys (VIRT-00A D1/D5).
 * `default` is a fallback access; `delete`/`distinct`/`count` are NOT
 * virtual accesses and must be rejected at configuration time.
 */
export type ModelVirtualAccess = 'list' | 'create' | 'read' | 'update';
export type ModelVirtualRecordAccess = 'default' | ModelVirtualAccess;

/**
 * Scope-aware virtual getter context (VIRT-00A D2, frozen).
 * Extends {@link ModelHookContext} with the receiving model, definition/
 * permission `scopePath` (e.g. `[]` at root, `['contacts','sub']` for
 * `contacts.sub.displayName`), and the three effective accesses. The
 * initiating operation stays in `context.operation` and is never
 * overwritten with fallback/effective visibility.
 *
 * Embedded outputs reuse the owning parent's internally computed grants with
 * the scope's `permissionSchema.<field>.sub` rules; dedicated subdocument
 * routes resolve grants from the raw parent lookup. Related (populate/
 * include) targets finalize with the target model's own definitions,
 * permissions, selection, and effective access before parent getters run.
 */
export interface ModelVirtualContext extends ModelHookContext {
  receivingModelName: string;
  scopePath: string[];
  virtualAccess: ModelVirtualAccess;
  outputAccess: ModelVirtualAccess;
  docPermissionsAccess: ModelVirtualAccess;
}

type IsUnknownVirtual<T> = unknown extends T ? ([keyof T] extends [never] ? true : false) : false;

/**
 * Typed isolated persisted view for a virtual getter scope (VIRT-00A D3/D4).
 * Known models use a partial read-only persisted view (never
 * `Record<string, unknown>`); unknown/untyped models keep an explicit
 * loose fallback.
 */
export type ModelVirtualDoc<TModel = unknown> =
  IsUnknownVirtual<TModel> extends true
    ? Readonly<Partial<Record<string, unknown>>>
    : [Extract<keyof TModel, string>] extends [never]
      ? Readonly<Partial<Record<string, unknown>>>
      : Readonly<Partial<TModel>>;

/**
 * Virtual getter signature (VIRT-00A D3/D4, frozen).
 * Receives an isolated plain-object snapshot of persisted dependencies +
 * already-finalized related/embedded outputs for its scope. Sibling virtual
 * values are not visible. Mutating the input cannot change response data or
 * lifecycle snapshots. Only the returned field value is committed;
 * `undefined` omits the field; throws omit fail-closed. `this` is the
 * model request.
 */
export type ModelVirtualGetter<TModel = unknown, TValue = unknown> = (
  this: ModelRequest,
  doc: ModelVirtualDoc<TModel>,
  permissions: AccessRouterPermissions,
  context: ModelVirtualContext,
) => MaybePromise<TValue | undefined>;

/**
 * Leaf virtual descriptor (VIRT-01): `{ get, dependsOn }`.
 * `dependsOn` lists top-level persisted field names relative to the
 * definition's scope (e.g. `['displayName']` inside `contacts.sub`, never
 * `['contacts.sub.displayName']`). Dotted paths and virtual-to-virtual
 * dependencies are rejected at configuration time.
 *
 * The getter runs after `toObject()`/lean normalization and after internal
 * document-permissions computation, with global permissions available and
 * before `decorate`/`decorateAll`/tasks. Only the returned field value is
 * committed via document-aware helpers: `undefined` (or a throw) omits the
 * field fail-closed and computed values never persist. Getters see an
 * isolated plain-object view for both lean and hydrated results; mutating the
 * input cannot change response data or lifecycle snapshots.
 *
 * @example
 * ```ts
 * import type { ModelVirtualDescriptor } from '@web-ts-toolkit/access-router';
 * interface User { name: string; address: string; }
 * const descriptor: ModelVirtualDescriptor<User, string> = {
 *   dependsOn: ['address'],
 *   get: async (doc) => (doc.address === undefined ? undefined : `addr:${doc.address}`),
 * };
 * ```
 */
export interface ModelVirtualDescriptor<TModel = unknown, TValue = unknown> {
  get: ModelVirtualGetter<TModel, TValue>;
  dependsOn?: Array<AccessRouterFieldKey<TModel>>;
}

/**
 * Per-access virtual record (VIRT-01): `default` + `list`/`create`/`read`/
 * `update` (NOT `delete`/`distinct`/`count`). Each present access holds a
 * leaf descriptor or bare getter shorthand. An optional shared `dependsOn`
 * supports the documented `{ dependsOn, read: getter }` shape; a leaf's own
 * `dependsOn` wins over the shared list during resolution.
 */
export type ModelVirtualAccessRecord<TModel = unknown, TValue = unknown> = {
  default?: ModelVirtualDescriptor<TModel, TValue> | ModelVirtualGetter<TModel, TValue>;
  list?: ModelVirtualDescriptor<TModel, TValue> | ModelVirtualGetter<TModel, TValue>;
  create?: ModelVirtualDescriptor<TModel, TValue> | ModelVirtualGetter<TModel, TValue>;
  read?: ModelVirtualDescriptor<TModel, TValue> | ModelVirtualGetter<TModel, TValue>;
  update?: ModelVirtualDescriptor<TModel, TValue> | ModelVirtualGetter<TModel, TValue>;
  dependsOn?: Array<AccessRouterFieldKey<TModel>>;
};

/** Single virtual entry: bare getter, leaf descriptor, or per-access record. */
export type ModelVirtualLeaf<TModel = unknown, TValue = unknown> =
  | ModelVirtualGetter<TModel, TValue>
  | ModelVirtualDescriptor<TModel, TValue>
  | ModelVirtualAccessRecord<TModel, TValue>;

type UnwrapVirtualArray<T> = T extends readonly (infer U)[] ? U : T;

/**
 * Persisted sub-scope model for an embedded container field (VIRT-01).
 * Unwraps arrays/nullable wrappers to the element/object type; unknown
 * fields fall back to a loose record.
 */
export type VirtualSubModel<TModel, TField extends string> = TField extends keyof TModel
  ? UnwrapVirtualArray<NonNullable<TModel[TField]>>
  : Record<string, unknown>;

type LooseVirtualLeaf =
  | ModelVirtualGetter<Record<string, unknown>, unknown>
  | ModelVirtualDescriptor<Record<string, unknown>, unknown>
  | ModelVirtualAccessRecord<Record<string, unknown>, unknown>;

type LooseVirtualSubEntry =
  | LooseVirtualLeaf
  | { sub?: Record<string, LooseVirtualLeaf | { sub?: Record<string, LooseVirtualLeaf> }> };

/**
 * Virtual definitions for a model scope (VIRT-01).
 * Root leaves come from `TVirtuals` (strict: unknown persisted getter
 * fields are type errors). Embedded containers mirror
 * `permissionSchema.<field>.sub`: any persisted field may host a `sub`
 * record whose leaves use the container's persisted sub-model view.
 * Untyped models keep an explicit loose record fallback.
 *
 * Selected virtual outputs are optional (`Partial`): authorization, absent
 * dependencies, `undefined`, and fail-closed errors can omit them. Virtual
 * names are never added to persisted `Filter`, sort/distinct inputs, or
 * client write types.
 *
 * @example End-to-end typed virtual (persisted `User` has no `fullAddress`):
 * ```ts
 * import acl from '@web-ts-toolkit/access-router';
 * import type { SelectedPublicOutput } from '@web-ts-toolkit/access-router/advanced';
 * interface User { name: string; address: string; }
 * interface UserVirtuals { fullAddress: string; }
 * const router = acl.createRouter<User, UserVirtuals>('User', {
 *   permissionSchema: {
 *     name: { read: true },
 *     address: { read: 'canViewAddress' },
 *     fullAddress: { read: 'canViewAddress' },
 *   },
 *   virtuals: {
 *     fullAddress: {
 *       dependsOn: ['address'],
 *       read: async function (doc) {
 *         if (doc.address === undefined) return undefined;
 *         return `addr:${doc.address}`;
 *       },
 *     },
 *   },
 * });
 * type Out = SelectedPublicOutput<User, ['name', 'fullAddress'], UserVirtuals>;
 * const out: Out = { name: 'Ada', fullAddress: 'addr:x' };
 * const omitted: Out = { name: 'Ada' }; // virtual is optional when denied/missing
 * void [router, out, omitted];
 * ```
 */
export type ModelVirtuals<TModel = unknown, TVirtuals extends object = Record<never, never>> =
  IsUnknownVirtual<TModel> extends true
    ? Record<string, LooseVirtualSubEntry>
    : {
        [K in Extract<keyof TVirtuals, string>]?: ModelVirtualLeaf<TModel, TVirtuals[K]>;
      } & {
        [K in Extract<keyof TModel, string>]?: {
          sub?: Record<
            string,
            ModelVirtualLeaf<VirtualSubModel<TModel, K>, unknown> | { sub?: Record<string, LooseVirtualLeaf> }
          >;
        };
      };
