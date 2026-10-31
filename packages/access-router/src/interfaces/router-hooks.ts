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
import type { Projection } from './query-types';

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
/**
 * Request-user grants from untrimmed projected input. Declare private persisted inputs
 * with alwaysSelectFields. Integrated output resolves once per document/access stage,
 * independently of skim or metadata serialization; use the result's document handle
 * for later picks after input/metadata trim. Backend grants do not forge user metadata.
 * With an active unsafe READ/LIST authorization fast path, ordinary lean projected
 * input and the returned grant map are borrowed; field decisions/reads/owning embedded
 * children share grants and context leaves. Mutation across callbacks/awaits can turn
 * denial into allowance. Shallow-unproven inputs/grants may copy once without rerunning
 * the hook. Off/dormant calls retain their existing copying behavior.
 */
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
 * Declaration-scoped private inputs use the getter's fourth argument, never
 * this context or its document-authorization metadata.
 * Active unsafe query fast paths retain separate getter document views, but diagnostic
 * context/grant/native leaves may alias across callbacks; this context is not an
 * immutable authority snapshot or a place to set server options.
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
 * loose fallback. This first argument retains the ordinary persisted/local
 * dependency and finalized-public-related view. `dependsOnPopulate` does not
 * retype persisted ref IDs or add its automatically retained refs here.
 */
export type ModelVirtualDoc<TModel = unknown> =
  IsUnknownVirtual<TModel> extends true
    ? Readonly<Partial<Record<string, unknown>>>
    : [Extract<keyof TModel, string>] extends [never]
      ? Readonly<Partial<Record<string, unknown>>>
      : Readonly<Partial<TModel>>;

/**
 * Server-owned, one-hop persisted input declaration. `path` is a scope-local
 * ObjectId ref (scalar or 1D array) to a model already configured in this runtime.
 * Embedded virtuals use their `.sub` scope's field, never a dotted source path.
 * `select` uses Populate's string/array/1-or-minus-1 grammar; omitted/empty means
 * all eligible static persisted fields. Target virtuals, metadata, dynamic paths
 * and traversal through target refs are rejected. `_id` is included unless excluded.
 * Static string refs must bind the actual same-connection ObjectId model; register
 * its model instance AND options first. Validation is eager/atomic, including setters.
 * Model-valued/cross-connection refs supported by ordinary population are outside
 * this private declaration's static-string, same-connection limit.
 * This bypasses source/target input-field permissions, not the virtual's own output
 * authorization. The target model's requireOperationAccessForPopulateDependencies defaults
 * to true, requiring the captured caller's target base operationAccess.read for private
 * loading. Only literal false bypasses that gate; private-only loading then adds no
 * operation check solely for the fetch. Target overrideFilter.read/baseFilter.read and
 * retained source IDs always use request authority/tenant scope, independently of ordinary
 * populate match/access and authorization.related. Private target virtuals never run.
 * Private work does not change ordinary reference shape. Selected/permitted source refs
 * keep exact original IDs, including array order/duplicates/missing IDs/nulls, unless an
 * admitted ordinary population owns the slot (then its original public mask/miss applies).
 * Strict private denial, row/query/getter failure and deferred virtual denial cannot hide
 * permitted IDs. Only source unselection/field denial omits them; there is no extra target
 * base-read visibility gate. The target model's requireOperationAccessForPopulateQueries
 * independently controls ordinary target operation admission. Each target resolves its
 * override → captured runtime model default → true; undefined restores inheritance.
 * Source flags do not propagate: Document's private User ref uses User's dependency flag.
 * Both flags and source/target policy are captured before awaits; registration and an effective object permissionSchema
 * remain mandatory. Private inputs never implicitly enter hooks, handles or metadata.
 */
export interface ModelVirtualPopulateDependency<TModel = unknown> {
  /** Top-level ref relative to this virtual's scope; no dotted source paths. Retained automatically. */
  path: AccessRouterFieldKey<TModel>;
  /** Persisted target mask: string, string[], or 1/-1 object (not 0). Empty/omitted selects all eligible fields. */
  select?: Projection;
}

type VirtualPopulateMap<TModel, TPopulated> = {
  [K in keyof TPopulated]: K extends AccessRouterFieldKey<TModel> ? unknown : never;
};

type VirtualPopulatePartial<T> = T extends
  | Date
  | RegExp
  | ArrayBuffer
  | ArrayBufferView
  | { readonly _bsontype: string }
  ? T
  : T extends readonly (infer U)[]
    ? readonly VirtualPopulatePartial<U>[]
    : T extends object
      ? { readonly [K in keyof T]?: VirtualPopulatePartial<T[K]> }
      : T;

type VirtualPopulateKnownValue<TSource, TTarget> = TSource extends readonly unknown[]
  ? readonly (VirtualPopulatePartial<TTarget> | null)[]
  : VirtualPopulatePartial<TTarget>;

type VirtualPopulateValue<TSource, TTarget> = unknown extends TSource
  ? VirtualPopulatePartial<TTarget> | readonly (VirtualPopulatePartial<TTarget> | null)[] | null
  : VirtualPopulateKnownValue<NonNullable<TSource>, TTarget> | null;

/**
 * Declaration-scoped fourth getter input. Explicitly map source keys to target
 * persisted shapes; IDs cannot infer a target model. Each key and target field
 * may be missing, scalar misses are null, and arrays preserve null slots. Source
 * cardinality determines the view (unknown sources permit scalar or array).
 * Containers are deeply readonly/partial; native scalar types are preserved.
 * Each getter/row/array slot receives isolated copies, including native mutable
 * leaves. Native methods are not made immutable by this type. Hydrated and lean
 * materialization can differ; this is not a JSON-value conversion promise.
 * This annotation does not select fields or confer authority. No implicit transport
 * to DTOs, hooks, handles or metadata; an authorized getter's deliberate return is output.
 */
export type ModelVirtualPopulateInputs<
  TModel = unknown,
  TPopulated extends VirtualPopulateMap<TModel, TPopulated> = Record<never, never>,
> = {
  readonly [K in keyof TPopulated]?: VirtualPopulateValue<K extends keyof TModel ? TModel[K] : unknown, TPopulated[K]>;
};

/**
 * Virtual getter signature (VIRT-00A D3/D4, frozen).
 * Its first argument is an isolated plain-object snapshot of ordinary persisted/
 * local-dependency inputs + finalized public related/embedded outputs for its scope.
 * Sibling virtual values are not visible. Input mutations have no implicit effect
 * on response data or lifecycle snapshots. Only the returned field value is committed;
 * `undefined` omits the field; throws omit fail-closed. `this` is the
 * model request. The optional fourth argument contains only this getter's
 * declared private populated inputs; default it to `{}` or guard undefined.
 * It is separate from `doc`, whose persisted/public-related typing is unchanged.
 * The runtime supplies it (empty without a declaration); the empty default generic
 * guesses no target shape. Optionality preserves legacy three-argument direct calls
 * and callbacks. Absent source refs or unavailable private inputs skip invocation;
 * present null/empty refs and missing target rows yield null/[]/null array slots.
 * Private values are not implicitly transported to output or authorization metadata;
 * an authorized getter can deliberately return a computed value using them.
 * Even in an active unsafe authorization fast path, the stable base, separate
 * per-getter document views, return staging and private argument-four isolation remain.
 * Context/grant leaves can still be borrowed and mutate later decisions; document-view
 * isolation does not restore source/grant/context or descendant-integrity guarantees.
 */
export type ModelVirtualGetter<
  TModel = unknown,
  TValue = unknown,
  TPopulated extends VirtualPopulateMap<TModel, TPopulated> = Record<never, never>,
> = (
  this: ModelRequest,
  doc: ModelVirtualDoc<TModel>,
  permissions: AccessRouterPermissions,
  context: ModelVirtualContext,
  populated?: ModelVirtualPopulateInputs<TModel, TPopulated>,
) => MaybePromise<TValue | undefined>;

/**
 * Leaf virtual descriptor: `{ get, dependsOn?, dependsOnPopulate? }`.
 * `dependsOn` lists top-level persisted field names relative to the
 * definition's scope (e.g. `['displayName']` inside `contacts.sub`, never
 * `['contacts.sub.displayName']`). Dotted paths and virtual-to-virtual
 * dependencies are rejected at configuration time.
 *
 * The getter runs after hydrated `toObject()` where applicable and after internal
 * document-permissions computation, with global permissions available and
 * before `decorate`/`decorateAll`/tasks. Only the returned field value is
 * committed via document-aware helpers: `undefined` (or a throw) omits the
 * field fail-closed and computed values never persist. Getters see an
 * isolated plain-object view for both lean and hydrated results; mutating the
 * input has no implicit effect on response data or lifecycle snapshots.
 * Off/dormant results retain whole lean-source normalization; active trusted queries
 * omit that authorization pass, not the separate getter views/private-input isolation.
 *
 * Annotate a descriptor separately with `TPopulated` to type its private fourth
 * getter argument, then assign it to ordinary `ModelVirtuals`. The optional
 * generic never changes the persisted model, write types or public output.
 * Use `populated = {}` or guard undefined to retain three-argument direct calls.
 * See the shipped README's "Private populated dependencies" for registration,
 * source-field omission/population/ID shapes, independent captured operation policies,
 * mandatory row gates and absence/error rules. Private computation does not grant output
 * or remove otherwise permitted parent IDs.
 *
 * @example
 * ```ts
 * import type { ModelVirtualDescriptor } from '@web-ts-toolkit/access-router';
 * import type { Types } from 'mongoose';
 * interface Order { total: number; account: Types.ObjectId | null; }
 * interface Account { balance: number; creditLimit: number; }
 * const descriptor: ModelVirtualDescriptor<Order, boolean, { account: Account }> = {
 *   dependsOn: ['total'],
 *   dependsOnPopulate: [{ path: 'account', select: ['balance', 'creditLimit'] }],
 *   get(doc, _permissions, _context, populated = {}) {
 *     const account = populated.account;
 *     if (doc.total === undefined || account?.balance === undefined || account.creditLimit === undefined)
 *       return undefined;
 *     return doc.total <= account.balance + account.creditLimit;
 *   },
 * };
 * ```
 */
export interface ModelVirtualDescriptor<
  TModel = unknown,
  TValue = unknown,
  TPopulated extends VirtualPopulateMap<TModel, TPopulated> = Record<never, never>,
> {
  /** Only this return becomes virtual output; private inputs are not implicitly transported. */
  get: ModelVirtualGetter<TModel, TValue, TPopulated>;
  /** Local top-level persisted input names relative to the definition's scope. */
  dependsOn?: Array<AccessRouterFieldKey<TModel>>;
  /** Server-only private fourth-argument inputs; source refs retained automatically. `[]` clears a shared list. */
  dependsOnPopulate?: ModelVirtualPopulateDependency<TModel>[];
}

/**
 * Per-access virtual record (VIRT-01): `default` + `list`/`create`/`read`/
 * `update` (NOT `delete`/`distinct`/`count`). Each present access holds a
 * leaf descriptor or bare getter shorthand. An optional shared `dependsOn`
 * supports the documented `{ dependsOn, read: getter }` shape; a leaf's own
 * `dependsOn` wins over the shared list during resolution. `dependsOnPopulate`
 * inherits independently by the same rule: undefined inherits, a defined leaf
 * list replaces the shared list wholesale (including `[]`).
 */
export type ModelVirtualAccessRecord<
  TModel = unknown,
  TValue = unknown,
  TPopulated extends VirtualPopulateMap<TModel, TPopulated> = Record<never, never>,
> = {
  default?: ModelVirtualDescriptor<TModel, TValue, TPopulated> | ModelVirtualGetter<TModel, TValue, TPopulated>;
  list?: ModelVirtualDescriptor<TModel, TValue, TPopulated> | ModelVirtualGetter<TModel, TValue, TPopulated>;
  create?: ModelVirtualDescriptor<TModel, TValue, TPopulated> | ModelVirtualGetter<TModel, TValue, TPopulated>;
  read?: ModelVirtualDescriptor<TModel, TValue, TPopulated> | ModelVirtualGetter<TModel, TValue, TPopulated>;
  update?: ModelVirtualDescriptor<TModel, TValue, TPopulated> | ModelVirtualGetter<TModel, TValue, TPopulated>;
  dependsOn?: Array<AccessRouterFieldKey<TModel>>;
  /** Shared private input list; each resolved getter gets only its own mask. A leaf's defined list replaces it. */
  dependsOnPopulate?: ModelVirtualPopulateDependency<TModel>[];
};

/** Single virtual entry: bare getter, leaf descriptor, or per-access record. */
export type ModelVirtualLeaf<
  TModel = unknown,
  TValue = unknown,
  TPopulated extends VirtualPopulateMap<TModel, TPopulated> = Record<never, never>,
> =
  | ModelVirtualGetter<TModel, TValue, TPopulated>
  | ModelVirtualDescriptor<TModel, TValue, TPopulated>
  | ModelVirtualAccessRecord<TModel, TValue, TPopulated>;

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
