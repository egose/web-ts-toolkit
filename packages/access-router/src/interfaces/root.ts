import express from 'express';
import type { RequestComplexityOptions } from '../request-complexity';
import {
  DataHookContext,
  DataRequest,
  Filter,
  ModelDocument,
  ModelHookContext,
  ModelRequest,
  Validation,
} from './base';
import type { AccessRouterRequest } from './request';
import { PublicCreateArgs, CreateArgs, PublicCreateOptions, CreateOptions } from './service-create';
import {
  PublicUpdateArgs,
  PublicUpdateOptions,
  UpdateOneArgs,
  UpdateOneOptions,
  UpsertOptions,
  UpdateByIdArgs,
  UpsertArgs,
  UpdateByIdOptions,
} from './service-update';
import { PublicListArgs, PublicListOptions } from './service-list';
import { PublicReadArgs, PublicReadOptions } from './service-read';
import { FindArgs, FindOptions, FindOneArgs, FindOneOptions, FindByIdArgs, FindByIdOptions } from './service-find';
import { ExistsOptions } from './service-exists';
import { DistinctArgs } from './service';
import type {
  AccessRouterFieldKey,
  DataBaseFilterHook,
  DataHook,
  DataIdentifierHook,
  DataListHook,
  DataOverrideFilterHook,
  GlobalPermissionValue,
  MaybePromise,
  ModelBaseFilterHook,
  ModelChangeHook,
  ModelDeleteHook,
  ModelDocPermissionsHook,
  ModelDocumentHook,
  ModelHook,
  ModelIdentifierHook,
  ModelListHook,
  ModelOverrideFilterHook,
  ModelValidateHook,
  ModelVirtualAccess,
  ModelVirtualDescriptor,
  ModelVirtualGetter,
  ModelVirtuals,
  ValidateRule,
} from './router-hooks';
import type { RequestSchemaLike } from '../validation/types';
export * from './request';
export * from './access';
export * from './router-hooks';

type RequestSchema = RequestSchemaLike;
type NestedRequestSchema = {
  default?: RequestSchema;
  data?: RequestSchema;
};

/**
 * One field's subdocument route guards: exact variant → field base → field scalar
 * or closed object. Only an absent field rule falls back to top-level variant/base
 * guards. A defined object with no applicable key denies; nested `.default` is not
 * a fallback. Dynamic legacy operation names remain supported.
 */
export interface SubOperationAccess {
  /** Base list guard for this field; fallback for both subdocument list variants. */
  list?: Validation;
  /** Base read guard for this field; fallback for both subdocument read variants. */
  read?: Validation;
  create?: Validation;
  update?: Validation;
  delete?: Validation;
  /** GET /:id/<field>; undefined inherits this field's `list` rule. */
  basicList?: Validation;
  /** POST /:id/<field>/__query; undefined inherits this field's `list` rule. */
  advancedList?: Validation;
  /** GET /:id/<field>/:subId (and HEAD); undefined inherits this field's `read` rule. */
  basicRead?: Validation;
  /** POST /:id/<field>/:subId/__query; undefined inherits this field's `read` rule. */
  advancedRead?: Validation;
  [access: string]: Validation | undefined;
}

/** Per-field subdocument route objects or scalar guards; field names remain dynamic. */
export type SubRouteGuardOptions = Record<string, Validation | SubOperationAccess>;

type SubFieldPermissionOptions = Record<string, Validation | Record<string, Validation>>;

export interface RequestSchemas {
  create?: RequestSchema;
  update?: RequestSchema;
  upsert?: RequestSchema;
  count?: RequestSchema;
  distinct?: RequestSchema;
  advancedList?: RequestSchema;
  advancedReadFilter?: RequestSchema;
  advancedRead?: RequestSchema;
  advancedCreate?: RequestSchema | NestedRequestSchema;
  advancedCreateData?: RequestSchema;
  advancedUpdate?: RequestSchema | NestedRequestSchema;
  advancedUpdateData?: RequestSchema;
  advancedUpsert?: RequestSchema | NestedRequestSchema;
  advancedUpsertData?: RequestSchema;
  subList?: RequestSchema;
  subRead?: RequestSchema;
  subCreate?: RequestSchema;
  subUpdate?: RequestSchema;
  subBulkUpdate?: RequestSchema;
}

export interface DataRequestSchemas {
  advancedList?: RequestSchema;
  advancedReadFilter?: RequestSchema;
  advancedRead?: RequestSchema;
}

/**
 * Per-method model query/presentation defaults under ModelRouterOptions.defaults.
 * Each resolver uses supplied non-nullish properties → its named bucket → built-ins.
 * Public wrappers resolve public*Args/public*Options before forwarding to internal
 * methods; resolved values win over internal defaults. Public upsert uses its create/
 * update branch's public bucket. No data/count/global default bucket or authorization
 * policy belongs here. Each fresh model-service call captures the originating runtime's
 * current defaults; nested stages retain that call's snapshot. Explicit service.defaults
 * assignments override runtime defaults. Router setters shallowly replace supplied values.
 * Fetch mode belongs to ModelRouterOptions.hydration; legacy lean/hydration keys
 * in method option buckets fail with migration diagnostics.
 * See README Configuration layers for delegation.
 */
export interface Defaults<TModel = unknown> {
  findOneArgs?: FindOneArgs<TModel>;
  findOneOptions?: Omit<FindOneOptions, 'authorization'>;
  findByIdArgs?: FindByIdArgs<TModel>;
  findByIdOptions?: Omit<FindByIdOptions, 'authorization'>;
  findArgs?: FindArgs<TModel>;
  findOptions?: Omit<FindOptions, 'authorization'>;
  createArgs?: CreateArgs;
  createOptions?: Omit<CreateOptions, 'authorization'>;
  updateOneArgs?: UpdateOneArgs<TModel>;
  updateOneOptions?: Omit<UpdateOneOptions, 'authorization'>;
  upsertOptions?: Omit<UpsertOptions, 'authorization'>;
  updateByIdArgs?: UpdateByIdArgs<TModel>;
  upsertArgs?: UpsertArgs<TModel>;
  updateByIdOptions?: Omit<UpdateByIdOptions, 'authorization'>;
  existsOptions?: ExistsOptions;
  publicListArgs?: PublicListArgs;
  publicListOptions?: PublicListOptions;
  publicCreateArgs?: PublicCreateArgs;
  publicCreateOptions?: PublicCreateOptions;
  publicReadArgs?: PublicReadArgs;
  publicReadOptions?: PublicReadOptions;
  publicUpdateArgs?: PublicUpdateArgs;
  publicUpdateOptions?: PublicUpdateOptions;
}

export interface AccessRouterLogger {
  debug?: (...args: unknown[]) => unknown;
  info?: (...args: unknown[]) => unknown;
  warn?: (...args: unknown[]) => unknown;
  error?: (...args: unknown[]) => unknown;
  isLevelEnabled?: (level: string) => boolean;
}

/**
 * Runtime-wide request initialization and resource settings, configured with
 * api.setGlobalOptions / api.setGlobalOption. These are not model options or wire
 * options. Object assignment is shallow; nested requestComplexity replaces as a unit.
 */
export interface GlobalOptions {
  /** Request grant-storage property (default `_permissions`), distinct from documentPermissionField. */
  requestPermissionField?: string;
  /**
   * Resolves runtime-owned request grants before middleware continues. A sync/async
   * `null` or `undefined` result establishes an empty map, replacing prior runtime-owned
   * grants. Missing/non-callable resolvers follow the same rule. Application-supplied
   * unowned maps (including `{}`) are preserved; same-runtime middleware reuses its state.
   * Derive grants from an authenticated server-side actor or other trusted application
   * context. Generated routers do not authenticate client claims for this hook.
   */
  globalPermissions?: (this: AccessRouterRequest, req: AccessRouterRequest) => MaybePromise<GlobalPermissionValue>;
  /** Require populate target models to be registered in the active runtime. Defaults to `true`. */
  requireRegisteredPopulateModels?: boolean;
  logger?: AccessRouterLogger;
  /** Request budgets and separate hook/persistence pools; concurrency limits are captured on first owner use. */
  requestComplexity?: RequestComplexityOptions;
}

/** Single-options createRouter overload: ordered model/data batches on one owning runtime. */
export interface RootRouterOptions {
  /** Mount path of the batch POST endpoint; mount the returned router.routes in Express. */
  basePath: string;
  /** Guard for the batch endpoint. Entries use target base operations, never basic/advanced variant names. */
  operationAccess?: Validation;
  /** Maximum entries per batch (default 100). Invalid/non-positive/unsafe constructor values use the default. */
  maxBatchEntries?: number;
  /**
   * Dual bound (default 25): at most this many distinct order groups AND each order
   * must be a non-negative safe integer <= this value. Omitted order is 0; at 25,
   * a lone order 26 and a batch containing all 26 orders 0..25 both reject.
   * Invalid/non-positive/unsafe constructor values use the default.
   */
  maxOrderGroups?: number;
  /**
   * Whole root operations per order group (default 10); separate from requestComplexity
   * hook-chain and persistence admission. Groups run in ascending order, results retain
   * input order. Invalid constructor limits use the default. Batches are not transactions.
   */
  maxConcurrentOperations?: number;
}

/** Base-operation field grants used by PermissionSchema. Basic/advanced route keys do not grant fields. */
export interface FieldOperationAccess {
  new?: Validation;
  list?: Validation;
  create?: Validation;
  read?: Validation;
  update?: Validation;
  upsert?: Validation;
  delete?: Validation;
  distinct?: Validation;
  count?: Validation;
  subs?: Validation | SubFieldPermissionOptions;
}

/**
 * Live generated-route guards, separate from PermissionSchema field grants.
 * An exact basic/advanced rule replaces its base guard; only undefined inherits
 * the base operation's exact → `.default` → scalar-shorthand resolution. Selected
 * false/empty-array/false-returning guards are terminal, not ANDed with the base.
 * Model exact lookup includes runtime-default variants; data has no model defaults.
 * Denial is HTTP 401; routes remain registered in getEndpoints() and OpenAPI.
 * Field/row/hook, root-entry, related-target and mutation-response policies keep
 * their existing base operations. Paths below use the default route segments.
 */
export interface OperationAccess extends Omit<FieldOperationAccess, 'subs'> {
  /** GET /new guard; unpaired, with no basic/advanced override. */
  new?: Validation;
  /** Base list guard and fallback for both list routes; also governs model read-to-list retries. */
  list?: Validation;
  /** Base create guard and fallback for both model create routes. */
  create?: Validation;
  /** Base read guard and fallback for both read variants; advancedRead covers both POST read routes. */
  read?: Validation;
  /** Base update guard and fallback for both model update routes. */
  update?: Validation;
  /** Base upsert guard and fallback for both upserts; create/update route variants do not gate its branches. */
  upsert?: Validation;
  /** DELETE /:id guard; unpaired, with no basic/advanced override. */
  delete?: Validation;
  /** Base distinct guard and fallback for GET and POST /distinct/:field. */
  distinct?: Validation;
  /** Base count guard and fallback for GET and POST /count. */
  count?: Validation;
  /** Fallback for a base operation without an exact rule; explicit base/variant guards take precedence. */
  default?: Validation;
  /** GET / (and HEAD) override for model/data list; undefined inherits `list`. */
  basicList?: Validation;
  /** POST /__query override for model/data list; undefined inherits `list`. */
  advancedList?: Validation;
  /** GET /:id (and HEAD) override for model/data read; undefined inherits `read`. */
  basicRead?: Validation;
  /** POST /__query/:id and /__query/__filter override for model/data read; undefined inherits `read`. */
  advancedRead?: Validation;
  /** POST / model create override; undefined inherits `create`. */
  basicCreate?: Validation;
  /** POST /__mutation model create override; undefined inherits `create`. */
  advancedCreate?: Validation;
  /** PATCH /:id model update override; undefined inherits `update`. */
  basicUpdate?: Validation;
  /** PATCH /__mutation/:id model update override; undefined inherits `update`. */
  advancedUpdate?: Validation;
  /** PUT / model upsert override; undefined inherits `upsert`. */
  basicUpsert?: Validation;
  /** PUT /__mutation model upsert override; undefined inherits `upsert`. */
  advancedUpsert?: Validation;
  /** GET /count model count override; undefined inherits `count`. */
  basicCount?: Validation;
  /** POST /count model filtered-count override; undefined inherits `count`. */
  advancedCount?: Validation;
  /** GET /distinct/:field model distinct override; undefined inherits `distinct`. */
  basicDistinct?: Validation;
  /** POST /distinct/:field model filtered-distinct override; undefined inherits `distinct`. */
  advancedDistinct?: Validation;
  /**
   * Per-field scalar or closed-object guards, with list/read variants. Legacy scalar
   * `subs` is accepted but is not an umbrella guard for absent fields; they use top-level rules.
   */
  subs?: Validation | SubRouteGuardOptions;
}

type PermissionRule = Validation | (FieldOperationAccess & { sub?: PermissionSchema });

/**
 * Field grants by base operation. Put basic/advanced route guards in operationAccess,
 * not field-rule objects. A field's `sub` defines nested permission-schema rules;
 * named scopePath uses response segments (['contacts']) to select contacts.sub.
 * Data helpers keep whole-container picks at root; a scoped child pick applies sub rules.
 */
export type PermissionSchema<TField extends string = string> = Partial<Record<TField, PermissionRule>>;

interface DocPermissions {
  list?: ModelDocPermissionsHook;
  create?: ModelDocPermissionsHook;
  read?: ModelDocPermissionsHook;
  update?: ModelDocPermissionsHook;
}

/**
 * Mongoose fetch mode, not an output type. Both modes finalize plain objects;
 * schema defaults, getters, transforms and init hooks can still change values.
 */
export type HydrationMode = 'lean' | 'hydrated';

/**
 * Server-only model configuration, captured by the owning runtime per call.
 * Set through ModelRouterOptions/DefaultModelRouterOptions and their whole-record
 * or exact hydration.<method> setters (including existing model/default decorators).
 * A supplied record replaces the previous record shallowly; omitted/undefined
 * members use built-ins, not an older/default record. Whole-record undefined clears
 * it. Invalid records/keys/modes throw before publication. Fresh calls observe owner
 * updates; in-flight calls retain their captured configuration.
 * Includes stay fixed lean; raw parents/lifecycle stages stay hydrated; subdocument
 * post-save visibility stays lean. Populate inherits its parent query; $$sq uses
 * target public settings. No per-call, wire, global, data/root or service.defaults
 * setting exists. Migrate defaults.*Options.lean explicitly (true -> 'lean', false
 * -> 'hydrated'); a former service-instance choice becomes model-wide in its runtime.
 * Legacy method-default lean/hydration controls throw migration diagnostics; stale
 * permissive per-call/wire controls are inert, not a supported configuration path.
 */
export interface ModelHydrationOptions {
  /** Public lists default to lean. */
  publicList?: HydrationMode;
  /** Identifier/filter reads and their list fallback default to hydrated. */
  publicRead?: HydrationMode;
  /** Internal find defaults to hydrated, independently of publicList. */
  find?: HydrationMode;
  /** Internal findOne defaults to hydrated, independently of publicRead/findById. */
  findOne?: HydrationMode;
  /** Internal findById defaults to hydrated; does not inherit findOne's setting. */
  findById?: HydrationMode;
}

/** Model starting defaults; data/root routers do not inherit these. Nested values assign shallowly. */
export interface DefaultModelRouterOptions<TModel = unknown> {
  /** Server-owned fetch choices, captured per call. Not a per-call or method-default option. */
  hydration?: ModelHydrationOptions;
  /** Maximum returned list rows (default 1000), independent of exact match/count totals. */
  listHardLimit?: number;
  /**
   * Serialized metadata path (default `_permissions`, dotted paths supported).
   * Finalized rows carrying it also get a non-enumerable `permissions` value alias,
   * independent of hydration/plugin, unless that output property already exists.
   * The alias is not authority or a live binding; JSON/spread omit it. Include output
   * cannot equal, contain or descend from the canonical metadata path.
   */
  documentPermissionField?: string;
  /** Express route parameter name (default `id`); fixed at router construction. */
  idParam?: string;
  /** Identifier lookup field (default `_id`); does not rename the Express route parameter. */
  idField?: string;
  /** Custom identifier-to-filter hook; when callable, takes precedence over idField. False is terminal. */
  resolveIdFilter?: ModelIdentifierHook<TModel>;
  /** External mount prefix for route metadata/logging (default `/`); mount that prefix in Express yourself. */
  parentPath?: string;
  queryRouteSegment?: string;
  mutationRouteSegment?: string;
  /**
   * Live model route guards: scalar Validation shorthand or base/variant rules.
   * `{ list: true, read: true, basicRead: false }` denies only GET /:id (and HEAD)
   * among top-level routes, retaining both advanced read POSTs subject to ordinary
   * field/row policy. Subdocument reads follow their field-rule precedence.
   * Exact runtime-default variants precede base fallback; option objects replace
   * top-level keys shallowly, rather than recursively merging operationAccess.
   */
  operationAccess?: Validation | OperationAccess;
  modelPermissionPrefix?: string;
  /**
   * When `true`, list/read/update requests without an explicit `select` return
   * field-less rows (only `_id`, plus the permission field when requested)
   * instead of all allowed fields. Applies to plain and advanced PATCH
   * (returned updated record honors `select`, including `?select=` on plain
   * PATCH and body `select` on advanced PATCH). Only an omitted (`undefined`)
   * select triggers this; explicit selects — including backend `defaults` and
   * an explicitly empty string/array (which keep their current meaning) — are
   * unaffected. Counts, ordering, includes and permission enforcement are
   * unchanged. Defaults to `false`.
   */
  requireExplicitSelect?: boolean;
  /**
   * Extra fields allowed in `sort` regardless of `list`/`read` field policy.
   * Merged as a union with permission-derived allowed fields (`id`/`_id` are
   * always allowed). Does not grant output visibility, only sortability.
   */
  sortableFields?: string[];
  /**
   * When `true`, disallowed `sort` keys are omitted from the sort sent upstream
   * (Mongoose) instead of returning `BadRequest`. Malformed sort syntax still
   * returns `BadRequest`. If every key is stripped, no sort is applied.
   * Defaults to `false` (strict: disallowed sort returns `BadRequest`).
   */
  stripDisallowedSort?: boolean;
  /**
   * When `true`, the document permissions field (`documentPermissionField`,
   * default `_permissions`) is removed from all outputs — including its empty
   * placeholder — and its generated `permissions` alias. Client `includePermissions`/`includeFieldPermissions`
   * input (query params, body/root-batch options and service-direct options)
   * as well as per-operation `defaults` are ignored (both resolve to `false`).
   * Output matches `includePermissions: false` with the permissions field
   * removed entirely. Enforcement still runs; only output metadata is
   * affected; existing business output named `permissions` is not a generated alias.
   * Defaults to `false`.
   */
  stripPermissionsField?: boolean;
  /**
   * When `true`, client `includeFieldPermissions` input (query params,
   * body/root-batch options and service-direct options) as well as
   * per-operation `defaults` are ignored and field maps (`_view`/`_edit`)
   * are never computed. `docPermissions`-hook keys still follow
   * `includePermissions`. Defaults to `false`.
   */
  disableFieldPermissions?: boolean;
}

export interface ExtendedDefaultModelRouterOptions<TModel = unknown> extends DefaultModelRouterOptions<TModel> {
  'hydration.publicList'?: HydrationMode;
  'hydration.publicRead'?: HydrationMode;
  'hydration.find'?: HydrationMode;
  'hydration.findOne'?: HydrationMode;
  'hydration.findById'?: HydrationMode;
  'operationAccess.default'?: Validation;
  'operationAccess.new'?: Validation;
  'operationAccess.list'?: Validation;
  'operationAccess.read'?: Validation;
  'operationAccess.update'?: Validation;
  'operationAccess.upsert'?: Validation;
  'operationAccess.delete'?: Validation;
  'operationAccess.create'?: Validation;
  'operationAccess.distinct'?: Validation;
  'operationAccess.count'?: Validation;
  'operationAccess.basicList'?: Validation;
  'operationAccess.advancedList'?: Validation;
  'operationAccess.basicRead'?: Validation;
  'operationAccess.advancedRead'?: Validation;
  'operationAccess.basicCreate'?: Validation;
  'operationAccess.advancedCreate'?: Validation;
  'operationAccess.basicUpdate'?: Validation;
  'operationAccess.advancedUpdate'?: Validation;
  'operationAccess.basicUpsert'?: Validation;
  'operationAccess.advancedUpsert'?: Validation;
  'operationAccess.basicCount'?: Validation;
  'operationAccess.advancedCount'?: Validation;
  'operationAccess.basicDistinct'?: Validation;
  'operationAccess.advancedDistinct'?: Validation;
  'operationAccess.subs'?: Validation | SubRouteGuardOptions;
}

/**
 * Per-registered-model configuration for api.createRouter(model, options).
 * operationAccess admits routes; permissionSchema admits fields; defaults supplies
 * named method query/presentation defaults. Trusted service authorization is per-call.
 * Router setters update live behavior shallowly; router.options retains its frozen
 * construction-time snapshot. Route-shape options require constructing a new router.
 */
export interface ModelRouterOptions<
  TModel = unknown,
  TVirtuals extends object = Record<never, never>,
> extends DefaultModelRouterOptions<TModel> {
  modelName?: string;
  basePath?: string;
  /**
   * Update grants define assignment boundaries: authorized leaves preserve omitted
   * siblings; a whole-object/array grant permits replacement (no generic deep merge).
   * Send nested JSON; literal dotted client keys are not update operators.
   * Basic/advanced keys are route guards in operationAccess, not field grants here.
   */
  permissionSchema?: PermissionSchema<AccessRouterFieldKey<TModel> | Extract<keyof TVirtuals, string>>;
  /**
   * Package-level computed fields ("virtuals", VIRT-01).
   * Typed getter/descriptor/output generics per VIRT-00A D3: typed getters
   * use a partial read-only persisted view for their scope, never
   * `Record<string, unknown>` for a known model; untyped consumers keep an
   * explicit loose fallback. Per-access records use `default` +
   * `list`/`create`/`read`/`update` (NOT `delete`/`distinct`/`count`) and
   * recursive embedded `sub` scopes mirroring
   * `permissionSchema.<field>.sub`. Inapplicable registered names stay
   * virtual (never persisted). Mutable post-construction (not a build-time
   * key); replacement swaps the frozen snapshot so in-flight planning keeps
   * a coherent version.
   *
   * Getters run after `toObject()`/lean normalization (both lean and
   * hydrated results compute), after internal document-permissions
   * computation. Virtual output and field trimming finish before
   * `decorate`/`decorateAll`/tasks. `dependsOn` fields are fetched internally
   * even when the caller may not receive them, then stripped unless independently selected and
   * authorized. Virtuals are output-only: registered names (including
   * embedded `sub` leaves) are excluded from persisted projections, client
   * write admission, and database sort/filter/distinct handling.
   * `dependsOnPopulate` declares one-hop private persisted target inputs only in
   * that getter's fourth argument. Annotate ModelVirtualDescriptor<Source, Value,
   * { ref: Target }> separately, then assign here; persisted/write/public types
   * stay unchanged. Register target models/options first in this runtime. Source
   * refs are retained automatically; target base read/tenant gates still apply.
   * The original public selection/population is preserved, including ID restoration.
   *
   * @example Shortest typed happy-path (persisted model lacks `fullAddress`):
   * ```ts
   * import acl from '@web-ts-toolkit/access-router';
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
   * // Selected output: { name: string; fullAddress?: string } — virtual is optional.
   * void router;
   * ```
   */
  virtuals?: ModelVirtuals<TModel, TVirtuals>;
  /**
   * Private persisted fetch inputs for projected document hooks (for example ownerId).
   * An array applies to every access; a per-access record uses its exact entry, then
   * default. These fields do not grant output. Integrated output captures the inputs
   * for both output and document-permission access, independently of metadata flags.
   */
  alwaysSelectFields?: string[] | Record<string, string[]>;
  docPermissions?: DocPermissions | ModelDocPermissionsHook;
  /**
   * Allowlist of `docPermissions`-hook keys exposed in API responses.
   * Enforcement always uses the full hook map; only serialization is reduced,
   * after all grant computations and decorate hooks have run. `_view`/`_edit`
   * are always kept. `undefined` (default) exposes everything (current
   * behavior); any array (including `[]`) exposes `_view`/`_edit` plus the
   * listed keys. Note `guard()` conditions on stripped doc-level keys fail
   * closed — allowlist any key a custom route guard evaluates.
   */
  exposedDocPermissionKeys?: string[];
  /** Request row scope, ANDed after query transformation; trusted rows.scope/unrestricted replace only this scope. */
  baseFilter?: ModelBaseFilterHook | Record<string, ModelBaseFilterHook>;
  /** Ordinary-query transform, run once even with trusted row policy. Mandatory IDs/joins and scope remain ANDed. */
  overrideFilter?: ModelOverrideFilterHook | Record<string, ModelOverrideFilterHook>;
  decorate?: ModelHook<TModel> | Record<string, ModelHook<TModel>>;
  decorateAll?: ModelListHook<TModel> | Record<string, ModelListHook<TModel>>;
  validate?: ValidateRule | ModelValidateHook | Record<string, ValidateRule | ModelValidateHook>;
  /**
   * Trusted model hook after validation of selected client data; output is not
   * re-filtered and may add protected/server-only fields. During update, supplied
   * children at partial policy ancestors apply without deleting omitted siblings.
   * Explicit null/undefined can clear/unset a parent; no output means no assignments.
   * Use transform document setters for deliberate whole-parent replacement.
   */
  prepare?: ModelHook<TModel> | Record<string, ModelHook<TModel>>;
  /**
   * Trusted live-document hook after update assignment and before save. May replace
   * protected state explicitly with document setters; do not blindly reintroduce
   * unfiltered context.originalData. Model hooks are not added to subdocument writes.
   */
  transform?: ModelDocumentHook<TModel> | Record<string, ModelDocumentHook<TModel>>;
  afterPersist?: ModelDocumentHook<TModel> | Record<string, ModelDocumentHook<TModel>>;
  onChange?: Record<string, ModelChangeHook>;
  beforeDelete?: ModelDeleteHook<TModel>;
  afterDelete?: ModelDeleteHook<TModel>;
  /** Generated HTTP envelope parsers; separate from validate on admitted model-write data. */
  requestSchemas?: RequestSchemas;
  /** Named method query/presentation defaults. Authorization and removed overrides are rejected, including dotted setters. */
  defaults?: Defaults<TModel>;
}

/**
 * Request-only in-memory list/read configuration. No model-default, model virtual,
 * docPermissions or trusted ServiceAuthorization layer. Set idParam/idField explicitly
 * for data identifier routes; `.routes` includes data-core initialization middleware.
 */
export interface DataRouterOptions<TData = unknown> {
  /**
   * Owned acyclic data: plain objects/arrays and primitives, Date, Buffer, Map, Set,
   * RegExp, fixed non-shared ArrayBuffer, DataView and standard numeric/bigint typed
   * arrays. Map keys/values and Set entries are copied; binary views own their visible
   * bytes. Own enumerable string properties/accessors become values at admission.
   * Functions/symbols, cycles, proxies, class instances/native subclasses, custom
   * native properties and shared/resizable/detached buffers reject with a path-bearing
   * TypeError before publication. See README for the exact supported built-ins.
   *
   * Snapshot plain containers are frozen; native properties yield fresh detached
   * copies on access (native identity is not stable). Selected service results and
   * decorator inputs are independently mutable, without a whole-dataset copy per read.
   * Replace via `runtime.setDataOption(name, 'data', next)` or `router.data(next)`;
   * undefined clears data. Existing services keep their captured data version.
   */
  data?: TData[];
  /** Maximum returned list rows (default 1000); filtering/sorting precede page-only shaping and copying. */
  listHardLimit?: number;
  /** Express parameter name; set explicitly (for example `id`). Fixed at construction, no model-default inheritance. */
  idParam?: string;
  /** Lookup field (for example `id`); without a callable resolver or string idField, lookup falls back to `_id`. */
  idField?: string;
  /** Custom identifier-to-filter hook, taking precedence over idField; false denies the query. */
  resolveIdFilter?: DataIdentifierHook<TData>;
  parentPath?: string;
  queryRouteSegment?: string;
  /**
   * Live data-route guards: list/read plus basicList/advancedList/basicRead/advancedRead.
   * Only undefined variants inherit their base; false denies with HTTP 401 while
   * routes remain registered. Data never inherits model defaults. The broader
   * legacy operation-rule object and scalar Validation shorthand remain accepted.
   */
  operationAccess?: Validation | OperationAccess;
  dataName?: string;
  basePath?: string;
  /** Base-operation field grants, independent of operationAccess's basic/advanced route guards. */
  permissionSchema?: PermissionSchema<AccessRouterFieldKey<TData>>;
  baseFilter?: DataBaseFilterHook | Record<string, DataBaseFilterHook>;
  overrideFilter?: DataOverrideFilterHook | Record<string, DataOverrideFilterHook>;
  decorate?: DataHook<TData> | Record<string, DataHook<TData>>;
  decorateAll?: DataListHook<TData> | Record<string, DataListHook<TData>>;
  requestSchemas?: DataRequestSchemas;
}

export interface ExtendedModelRouterOptions<TModel = unknown, TVirtuals extends object = Record<never, never>>
  extends ModelRouterOptions<TModel, TVirtuals>, ExtendedDefaultModelRouterOptions<TModel> {
  'alwaysSelectFields.default'?: string[];
  'alwaysSelectFields.list'?: string[];
  'alwaysSelectFields.create'?: string[];
  'alwaysSelectFields.read'?: string[];
  'alwaysSelectFields.update'?: string[];
  'docPermissions.default'?: ModelDocPermissionsHook;
  'docPermissions.list'?: ModelDocPermissionsHook;
  'docPermissions.create'?: ModelDocPermissionsHook;
  'docPermissions.read'?: ModelDocPermissionsHook;
  'docPermissions.update'?: ModelDocPermissionsHook;
  'baseFilter.default'?: ModelBaseFilterHook;
  'baseFilter.list'?: ModelBaseFilterHook;
  'baseFilter.read'?: ModelBaseFilterHook;
  'baseFilter.update'?: ModelBaseFilterHook;
  'baseFilter.delete'?: ModelBaseFilterHook;
  'overrideFilter.default'?: ModelOverrideFilterHook;
  'overrideFilter.list'?: ModelOverrideFilterHook;
  'overrideFilter.read'?: ModelOverrideFilterHook;
  'overrideFilter.update'?: ModelOverrideFilterHook;
  'overrideFilter.delete'?: ModelOverrideFilterHook;
  'decorate.default'?: ModelHook<TModel>;
  'decorate.list'?: ModelHook<TModel>;
  'decorate.create'?: ModelHook<TModel>;
  'decorate.read'?: ModelHook<TModel>;
  'decorate.update'?: ModelHook<TModel>;
  'decorateAll.default'?: ModelListHook<TModel>;
  'decorateAll.list'?: ModelListHook<TModel>;
  'validate.default'?: ValidateRule | ModelValidateHook;
  'validate.create'?: ValidateRule | ModelValidateHook;
  'validate.update'?: ValidateRule | ModelValidateHook;
  'prepare.default'?: ModelHook<TModel>;
  'prepare.create'?: ModelHook<TModel>;
  'prepare.update'?: ModelHook<TModel>;
  'transform.default'?: ModelDocumentHook<TModel>;
  'transform.update'?: ModelDocumentHook<TModel>;
  'afterPersist.default'?: ModelDocumentHook<TModel>;
  'afterPersist.create'?: ModelDocumentHook<TModel>;
  'afterPersist.update'?: ModelDocumentHook<TModel>;
  onChange?: Record<string, ModelChangeHook>;
  'requestSchemas.create'?: RequestSchema;
  'requestSchemas.update'?: RequestSchema;
  'requestSchemas.upsert'?: RequestSchema;
  'requestSchemas.count'?: RequestSchema;
  'requestSchemas.distinct'?: RequestSchema;
  'requestSchemas.advancedList'?: RequestSchema;
  'requestSchemas.advancedReadFilter'?: RequestSchema;
  'requestSchemas.advancedRead'?: RequestSchema;
  'requestSchemas.advancedCreate.default'?: RequestSchema;
  'requestSchemas.advancedCreate.data'?: RequestSchema;
  'requestSchemas.advancedUpdate'?: RequestSchema;
  'requestSchemas.advancedUpdate.default'?: RequestSchema;
  'requestSchemas.advancedUpdate.data'?: RequestSchema;
  'requestSchemas.advancedUpsert.default'?: RequestSchema;
  'requestSchemas.advancedUpsert.data'?: RequestSchema;
  'requestSchemas.subList'?: RequestSchema;
  'requestSchemas.subRead'?: RequestSchema;
  'requestSchemas.subCreate'?: RequestSchema;
  'requestSchemas.subUpdate'?: RequestSchema;
  'requestSchemas.subBulkUpdate'?: RequestSchema;
  'defaults.findOneArgs'?: Defaults<TModel>['findOneArgs'];
  'defaults.findOneOptions'?: Defaults<TModel>['findOneOptions'];
  'defaults.findByIdArgs'?: Defaults<TModel>['findByIdArgs'];
  'defaults.findByIdOptions'?: Defaults<TModel>['findByIdOptions'];
  'defaults.findArgs'?: Defaults<TModel>['findArgs'];
  'defaults.findOptions'?: Defaults<TModel>['findOptions'];
  'defaults.createArgs'?: Defaults<TModel>['createArgs'];
  'defaults.createOptions'?: Defaults<TModel>['createOptions'];
  'defaults.updateOneArgs'?: Defaults<TModel>['updateOneArgs'];
  'defaults.updateOneOptions'?: Defaults<TModel>['updateOneOptions'];
  'defaults.updateByIdArgs'?: Defaults<TModel>['updateByIdArgs'];
  'defaults.updateByIdOptions'?: Defaults<TModel>['updateByIdOptions'];
  'defaults.upsertArgs'?: Defaults<TModel>['upsertArgs'];
  'defaults.upsertOptions'?: Defaults<TModel>['upsertOptions'];
  'defaults.existsOptions'?: ExistsOptions;
  'defaults.publicListArgs'?: PublicListArgs;
  'defaults.publicListOptions'?: PublicListOptions;
  'defaults.publicCreateArgs'?: PublicCreateArgs;
  'defaults.publicCreateOptions'?: PublicCreateOptions;
  'defaults.publicReadArgs'?: PublicReadArgs;
  'defaults.publicReadOptions'?: PublicReadOptions;
  'defaults.publicUpdateArgs'?: PublicUpdateArgs;
  'defaults.publicUpdateOptions'?: PublicUpdateOptions;
  /**
   * Virtual dotted keys (VIRT-01): `virtuals`, `virtuals.<name>`,
   * `virtuals.<name>.<access>`, `virtuals.<field>.sub...` (recursive).
   * The template fallback preserves typed getter doc views for known
   * models so unknown persisted getter fields fail (including dotted
   * setters); embedded `sub` records stay structurally loose here and are
   * fully validated at runtime against the receiving Mongoose schema +
   * child scopes.
   */
  [key: `virtuals.${string}`]:
    | ModelVirtuals<TModel, TVirtuals>[Extract<keyof TVirtuals, string>]
    | ModelVirtualDescriptor<TModel, unknown>
    | ModelVirtualGetter<TModel, unknown>
    | { sub?: Record<string, unknown> }
    | Record<
        string,
        | ModelVirtualDescriptor<Record<string, unknown>, unknown>
        | ModelVirtualGetter<Record<string, unknown>, unknown>
        | { sub?: unknown }
      >;
}

export interface ExtendedDataRouterOptions<TData = unknown> extends DataRouterOptions<TData> {
  'operationAccess.default'?: Validation;
  'operationAccess.list'?: Validation;
  'operationAccess.read'?: Validation;
  'operationAccess.basicList'?: Validation;
  'operationAccess.advancedList'?: Validation;
  'operationAccess.basicRead'?: Validation;
  'operationAccess.advancedRead'?: Validation;
  'requestSchemas.advancedList'?: RequestSchema;
  'requestSchemas.advancedReadFilter'?: RequestSchema;
  'requestSchemas.advancedRead'?: RequestSchema;
}
