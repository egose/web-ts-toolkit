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
 * Populate operation flags belong to the actual target's ModelRouterOptions or
 * DefaultModelRouterOptions. Stale global setters (including api.set) reject them
 * with migration guidance to setModelOptions / setDefaultModelOptions.
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
 * members use built-ins, not an older/default record. Whole-model-record undefined
 * restores default-model inheritance; default-record undefined clears that default.
 * Invalid records/keys/modes throw before publication. Fresh calls observe owner
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

/**
 * Inherited model defaults; data/root routers do not inherit these. Unspecified model
 * options follow later default updates for new calls. Explicit values (including false,
 * null, empty objects/arrays) win; setting a model option to undefined restores inheritance.
 * Exception: explicitly cleared operationAccess retains its exact-key-only default fallback;
 * a runtime catch-all/default guard is not an exact fallback in that mode.
 * Nested objects replace shallowly. Existing calls/handles and router.options keep their
 * captured snapshots; changing defaults does not rebuild already-mounted route paths.
 * The two populate operation flags retain raw override values in model snapshots;
 * their effective policy is resolved separately against the captured model defaults.
 */
export interface DefaultModelRouterOptions<TModel = unknown> {
  /**
   * Default business-field policy when a model's permissionSchema is undefined.
   * Populate targets require an effective object schema; `{}` explicitly closes
   * business fields. A model's defined schema replaces this entire default.
   */
  permissionSchema?: PermissionSchema<AccessRouterFieldKey<TModel>>;
  /** Server-owned fetch choices, captured per call. Not a per-call or method-default option. */
  hydration?: ModelHydrationOptions;
  /**
   * This target model requires the caller's effective operation (`read`, supported
   * `list` or trusted custom access) for ordinary query population (built-in default `true`).
   * Only literal `false` skips that admission gate; source entry/field authorization,
   * target field/document grants, row/base/transform policies, original selection,
   * match and mandatory reference IDs still constrain output. Denied population retains
   * permitted original IDs; admitted population misses return null/filtered arrays.
   * Targets always require an actual registered Mongoose model and an effective object permissionSchema;
   * `{}` closes business fields. A configuration-only Document needs no HTTP routes;
   * denied direct/root read/list operations stay denied.
   * Static string refs resolve on the source connection and must match that runtime's
   * configured instance. Explicit Model-valued ordinary refs can cross connections
   * when that exact model is registered/configured in the same runtime. The validated
   * model stays pinned through in-flight population; callers cannot supply a model.
   *
   * Target override → captured runtime model default → true. Explicit undefined clears
   * the override and restores inheritance; omission preserves it. Malformed non-undefined
   * JavaScript values become true. Defaults are captured before source/target option
   * reads and the first await; later top-level calls observe changes. getModelOptions and
   * router.options retain raw flag overrides; getModelOption reads the live default.
   * Source/sibling flags cannot relax
   * this target. Configure with setModelOptions/setDefaultModelOptions, never global,
   * per-query, service.defaults or client controls. Independent of private dependencies.
   */
  requireOperationAccessForPopulateQueries?: boolean;
  /**
   * This target model requires the original caller's base `operationAccess.read` before
   * loading declared private `dependsOnPopulate` inputs (built-in default `true`). Only
   * literal boolean `false` bypasses that operation gate. Target override → captured
   * runtime model default → true; explicit undefined clears the override to inherit,
   * omission preserves it, and malformed JS values other than undefined normalize true.
   * Runtime-isolated server configuration on the actual target, not the source model;
   * set runtime defaults with setDefaultModelOptions. Global setters reject these keys.
   * Captured with source/target policy before the first await; nested stages retain the
   * capture and later top-level calls refresh. No caller/query or service.defaults control.
   * Project refs to Document use Document's flags; Document's own private User ref
   * uses User's dependency flag, never Project's or Document's bypass.
   * Source/target input-field permissions are bypassed only by the declaration; the
   * virtual's output authorization still applies. Target request-mode `baseFilter.read`,
   * `overrideFilter.read` and retained reference IDs always constrain rows.
   *
   * Neither mode changes ordinary reference shape: selected/permitted parent fields keep
   * exact original IDs (including order, duplicates, missing IDs and nulls) when no admitted
   * ordinary population owns them. Private denial, row/query/getter failure or deferred
   * virtual denial cannot hide those IDs. There is no additional target-base-read reference-visibility gate.
   * Private fourth-argument inputs never implicitly enter DTOs, hooks, handles or metadata.
   * An actual registered model, effective object permissionSchema and static declarations
   * remain mandatory, independently of requireOperationAccessForPopulateQueries.
   *
   * @example
   * ```ts
   * import mongoose from 'mongoose';
   * import { createAccessRuntime, type DefaultModelRouterOptions } from '@web-ts-toolkit/access-router';
   * const api = createAccessRuntime();
   * const defaults = {
   *   requireOperationAccessForPopulateQueries: true,
   *   requireOperationAccessForPopulateDependencies: true,
   * } satisfies DefaultModelRouterOptions;
   * api.setDefaultModelOptions(defaults);
   * const Document = mongoose.model('Document', new mongoose.Schema({ name: String }));
   * const User = mongoose.model('User', new mongoose.Schema({ name: String }));
   * api.registerModelInstance(Document.modelName, Document);
   * api.registerModelInstance(User.modelName, User);
   * api.setModelOptions(Document.modelName, {
   *   operationAccess: { read: false, list: false }, permissionSchema: { name: true },
   *   requireOperationAccessForPopulateQueries: false,
   *   requireOperationAccessForPopulateDependencies: false,
   * });
   * api.setModelOptions(User.modelName, {
   *   operationAccess: { read: false, list: false }, permissionSchema: {},
   *   requireOperationAccessForPopulateQueries: true,
   *   requireOperationAccessForPopulateDependencies: true,
   * });
   * api.setModelOption(Document.modelName, 'requireOperationAccessForPopulateDependencies', undefined); // inherit again
   * // Administrative default changes apply to later calls on existing unoverridden models.
   * api.setDefaultModelOption('requireOperationAccessForPopulateDependencies', false);
   * ```
   */
  requireOperationAccessForPopulateDependencies?: boolean;
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
  /**
   * TEMPORARY UNSAFE performance escape hatch (default `false`). Only literal `true`
   * skips repeated projected-document snapshot comparisons for this model's top-level
   * `find`/public/root list responses. Captured before awaits; list-origin handles keep
   * that mode. Single reads use the independent unsafeSkipReadDocumentSnapshotChecks
   * setting. Embedded/related source stages and output values have separate flags.
   * Writes and fresh standalone helpers stay strict.
   *
   * Row/field permissions, exact ownership/binding, independent output-value checks
   * and detached callback/grant copies still run. However, source changes during a
   * callback/await are no longer detected: stale grants/decisions may authorize output.
   * Use only with trusted non-mutating application hooks, measure before rollout, and
   * restore `false` as soon as possible. Enabling logs a warning once per model transition.
   * Server model configuration only, never service.defaults, per-call or wire options.
   * Retained isolation guarantees here describe this flag alone, not the active
   * trusted runtime for unsafeUseListAuthorizationFastPath.
   */
  unsafeSkipListDocumentSnapshotChecks?: boolean;
  /**
   * TEMPORARY UNSAFE single-read escape hatch (default `false`). Only literal `true`
   * skips repeated projected-document snapshot comparisons in top-level findOne,
   * findById, public identifier/filter reads and root reads. Read-to-list retries use
   * this setting, not unsafeSkipListDocumentSnapshotChecks. Captured before awaits;
   * read-origin handles and retries keep that mode. List operations use their own flag.
   *
   * Permission rules, exact ownership/binding, independent output-value checks and
   * detached callback/grant copies still run. Source changes during callbacks/awaits
   * can leave stale grants/decisions and incorrectly authorized output. Use only with
   * trusted non-mutating hooks, measure before rollout and restore `false` promptly.
   * Embedded/related source stages use separate nested flags. Writes (including
   * read-like output) and fresh helpers stay strict. Warns per model/flag transition.
   * Server model or inherited model-default configuration only; never method defaults
   * or wire options.
   * Retained isolation guarantees describe this flag alone, not the active
   * trusted runtime for unsafeUseReadAuthorizationFastPath.
   */
  unsafeSkipReadDocumentSnapshotChecks?: boolean;
  /**
   * TEMPORARY UNSAFE (default `false`): skip output VALUE snapshot comparisons in
   * top-level LIST responses and their embedded/populated/included descendants.
   * Exact output associations, graph identities, bindings and permission rules remain;
   * scalar/native in-place mutations can now reuse stale decisions and expose data.
   * Source checks and detached callback/grant/output copies remain. Initial output
   * snapshots also remain unless unsafeSkipListInitialOutputSnapshotCopy is active.
   * Captured before awaits; handles keep this mode after rollback. Only literal `true`
   * in server model/default configuration enables it and warns on effective transition.
   * READ/retries use unsafeSkipReadOutputSnapshotChecks; writes and fresh helpers stay
   * strict. Never set from request/per-call/method defaults. Revisit/remove promptly.
   * Retained copy/graph guarantees describe this flag alone, not the active
   * trusted runtime for unsafeUseListAuthorizationFastPath.
   */
  unsafeSkipListOutputSnapshotChecks?: boolean;
  /**
   * TEMPORARY UNSAFE (default `false`): READ equivalent of unsafeSkipListOutputSnapshotChecks,
   * including findOne/findById, public/root reads, read-to-list retries and their
   * embedded/populated/included outputs. Uses the initiating READ model's captured
   * setting, not LIST or target-model settings. Value mutations may reuse stale
   * decisions; exact ownership/graph identities and permissions still run. Server
   * model/default literal `true` only; warns on effective enablement. Retained handles
   * keep their mode. Writes/fresh helpers stay strict. Revisit/remove promptly.
   * Retained copy/graph guarantees describe this flag alone, not the active
   * trusted runtime for unsafeUseReadAuthorizationFastPath.
   */
  unsafeSkipReadOutputSnapshotChecks?: boolean;
  /**
   * TEMPORARY UNSAFE (default `false`): skip repeated SOURCE snapshot comparisons for
   * embedded/populated/included document stages reached from a top-level LIST.
   * The initiating model's captured setting applies recursively, not target-model
   * flags. Parent source and all output-value checks remain independently configured;
   * parent snapshots still include nested values. Permission rules, exact binding,
   * initial source snapshots and detached copies remain. Child mutation can leave stale
   * grants/decisions and expose data. Only server model/default literal `true`
   * enables it; warns on transition. Rollback affects new calls, not captured descendants
   * or handles. READ uses its own flag; writes, dedicated subdocument operations and
   * fresh helpers stay strict. Never derive from requests. Revisit/remove promptly.
   * Retained copy/graph guarantees describe this flag alone, not the active
   * trusted runtime for unsafeUseListAuthorizationFastPath.
   */
  unsafeSkipListNestedDocumentSnapshotChecks?: boolean;
  /**
   * TEMPORARY UNSAFE (default `false`): READ equivalent of
   * unsafeSkipListNestedDocumentSnapshotChecks, including read-to-list retries.
   * Recursively skips embedded/populated/included SOURCE comparisons using the
   * initiating READ model's captured setting, independently of LIST, root source
   * and output-value flags. Parent comparisons may still observe child mutation.
   * Stale grants/decisions can expose data; permissions, identities and detached copies
   * remain. Server model/default literal `true` only; warns on effective enablement.
   * Writes/dedicated subdocument operations/fresh helpers stay strict; retained handles
   * keep their mode after rollback. Never set from requests. Revisit/remove promptly.
   * Retained copy/graph guarantees describe this flag alone, not the active
   * trusted runtime for unsafeUseReadAuthorizationFastPath.
   */
  unsafeSkipReadNestedDocumentSnapshotChecks?: boolean;
  /**
   * TEMPORARY UNSAFE (default `false`): omit the initial output-association snapshot
   * copy for eligible LIST outputs and their authenticated descendants. Active only
   * with unsafeSkipListOutputSnapshotChecks=true; otherwise dormant (warns).
   * Skips this pass's native/BSON normalization and validation observations, which
   * can change exceptions, side effects and permission outcomes. Exact ownership,
   * bounded shape admission and graph identities remain; proxies/Map/Set and open
   * ownership bindings use the original copy fallback. Source snapshots and detached
   * hook/grant/response copies remain. Not a general clone bypass. Server model/default literal true
   * only; warns on activation. Captured before awaits; retained handles keep their
   * mode after rollback. READ/retries use their own flag; writes/fresh helpers stay
   * strict. Restore false promptly; never select from requests or method defaults.
   * Retained copy/shape/graph guarantees describe this flag alone, not the active
   * trusted runtime for unsafeUseListAuthorizationFastPath.
   */
  unsafeSkipListInitialOutputSnapshotCopy?: boolean;
  /**
   * TEMPORARY UNSAFE (default `false`): READ equivalent of
   * unsafeSkipListInitialOutputSnapshotCopy, including READ-to-list retries and
   * authenticated embedded/populated/included outputs. Requires the independent
   * unsafeSkipReadOutputSnapshotChecks=true. Uses the initiating READ model's
   * captured setting, not LIST/target flags. Omits initial native normalization
   * observations; ownership/bounds/identities and detached callback/source copies
   * remain. Proxies/Map/Set fall back to copying. Server model/default literal true
   * only; warns on activation/dormancy. Writes/fresh helpers stay strict. Captured
   * handles do not change on rollback. Never derive from requests; restore false.
   * Retained copy/shape/graph guarantees describe this flag alone, not the active
   * trusted runtime for unsafeUseReadAuthorizationFastPath.
   */
  unsafeSkipReadInitialOutputSnapshotCopy?: boolean;
  /**
   * EXPERIMENTAL performance-first UNSAFE, default `false`; literal server model/default `true` only. LIST authorization
   * fast path requires ALL FOUR matching unsafeSkipListDocumentSnapshotChecks,
   * unsafeSkipListOutputSnapshotChecks, unsafeSkipListNestedDocumentSnapshotChecks and
   * unsafeSkipListInitialOutputSnapshotCopy options to be literal true. Otherwise dormant:
   * the original flags keep their independent behavior. Never enables prerequisites.
   * Explicit false overrides model defaults; undefined restores inheritance.
   *
   * Captured before hooks/awaits on find/public/root LIST origins; authenticated
   * embedded/populated/included outputs and issued handles retain that origin's mode
   * after rollback, not live target settings. Independent calls capture their own mode.
   * Independent READ queries/retries use unsafeUseReadAuthorizationFastPath. Writes,
   * write-derived output, new/create/update/upsert/delete, dedicated subdocuments and
   * fresh raw-policy helpers do not apply.
   * Never accepted in method defaults, per-call, policy, helper or wire controls.
   *
   * Eligible rows borrow projected source and ordinary hook grants, use shallow contexts,
   * and omit repeated snapshots, defensive isolation and descendant graph verification.
   * The trusted runtime retains operation/row/field rules, document hooks/getters,
   * cheap exact root binding and issued-handle membership, NOT detached source/grant/context
   * leaves or full descendant integrity. Borrowed values/grants/context, stale decisions,
   * descendant replacement and fewer native normalization/validation observations can
   * change outcomes, including denial becoming allowance. Full unvisited per-document
   * shape/bounds are lost; request/work and bounded new output-materialization limits
   * remain. Not a full ACL bypass or security-equivalent optimization. Warns on effective
   * activation/dormancy and missing-prerequisite changes, never per call or when off.
   * Measure with trusted application code and restore false promptly; already captured
   * calls/handles do not change. Shallow-unproven rows use compatible copied stages with
   * graph checks before hooks; selected reconstruction is bounded to 20,000 slots/issued
   * roots and depth 100. Selected unsupported values reject; invalid virtual returns omit.
   * Retained original children may remain discoverable after replacement; new objects
   * receive no child handle. Measure rather than assuming a speedup.
   * Ordinary grants are shared per field/read/owning embedded child; captured configuration
   * and scope views are reused. No trusted stage snapshot is issued. Native/BSON snapshot
   * wire/equality passes are omitted, but hydration, selected native/value fallbacks,
   * getter document views/return staging, private populated argument-four isolation and
   * JSON serialization can still copy/normalize. Active configuration is not a promise
   * every row is zero-copy; copied/trusted rows can coexist. No universal performance
   * gain or v0.51.0 equivalence/parity is promised. Turning false leaves the original
   * prerequisite skip flags unchanged; restore those independently for default protections.
   *
   * @example
   * ```ts
   * import { createAccessRuntime, type DefaultModelRouterOptions } from '@web-ts-toolkit/access-router';
   * const api = createAccessRuntime();
   * const list = {
   *   unsafeSkipListDocumentSnapshotChecks: true,
   *   unsafeSkipListOutputSnapshotChecks: true,
   *   unsafeSkipListNestedDocumentSnapshotChecks: true,
   *   unsafeSkipListInitialOutputSnapshotCopy: true,
   *   unsafeUseListAuthorizationFastPath: true,
   * } satisfies DefaultModelRouterOptions;
   * api.setDefaultModelOptions(list); // all READ flags remain independently off
   * api.setDefaultModelOption('unsafeUseListAuthorizationFastPath', false);
   * // Rollback protects new calls only; existing handles retain the weaker mode.
   * ```
   */
  unsafeUseListAuthorizationFastPath?: boolean;
  /**
   * EXPERIMENTAL performance-first UNSAFE, default `false`; independent READ equivalent of unsafeUseListAuthorizationFastPath.
   * Requires ALL FOUR unsafeSkipReadDocumentSnapshotChecks, unsafeSkipReadOutputSnapshotChecks,
   * unsafeSkipReadNestedDocumentSnapshotChecks and unsafeSkipReadInitialOutputSnapshotCopy
   * options to be literal true; missing prerequisites leave it dormant without changing them.
   * Explicit false overrides model defaults; undefined restores inheritance.
   * Captured before hooks/awaits for findOne/findById/public/root reads, including READ-to-list
   * retries and authenticated embedded/related descendants, never from LIST/target settings.
   * Retained issued handles keep the captured mode; rollback affects new calls only.
   *
   * Eligible rows borrow source/ordinary hook grants, use shallow contexts and omit
   * repeated snapshots, defensive isolation and descendant graph verification.
   * The trusted runtime retains actual rules/hooks/getters, operation/row admission,
   * cheap exact root binding and issuance membership, not full descendant integrity or
   * detached source/grant/context leaves. Mutation, stale decisions, descendant replacement
   * and lost native observations can turn denial into allowance; full unvisited per-document
   * shape/bounds are lost. Request/work limits remain; selected reconstruction is bounded
   * to 20,000 slots/issued roots and depth 100. Shallow-unproven rows use compatible copied
   * stages with graph checks before hooks. Unsupported selected values reject; invalid
   * virtual returns omit. Removed issued children may remain discoverable; replacements
   * receive no child handle.
   * Writes/write-derived reads, new/create/update/upsert/delete, dedicated subdocuments
   * and fresh raw-policy helpers
   * stay inapplicable. Server model/default literal true only, never method defaults or
   * per-call/policy/helper/wire controls. Warns on effective activation/dormancy and
   * missing-prerequisite changes, never per call or when off;
   * restore false promptly and measure rather than assuming equivalent security or speed.
   * Grants/context/native leaves and captured scope/config views may be shared; there
   * is no trusted stage snapshot. Selected natives/hydration/getter views/return staging/
   * private argument-four isolation/JSON serialization still normalize or copy. Active
   * configuration is not an every-row zero-copy promise. No universal gain or v0.51.0
   * equivalence/parity. Rollback does not automatically restore the four original skips.
   *
   * @example
   * ```ts
   * import acl, { type DefaultModelRouterOptions } from '@web-ts-toolkit/access-router';
   * const read = {
   *   unsafeSkipReadDocumentSnapshotChecks: true,
   *   unsafeSkipReadOutputSnapshotChecks: true,
   *   unsafeSkipReadNestedDocumentSnapshotChecks: true,
   *   unsafeSkipReadInitialOutputSnapshotCopy: true,
   *   unsafeUseReadAuthorizationFastPath: true,
   * } satisfies DefaultModelRouterOptions;
   * // User must already be registered on this runtime; never spread request options.
   * acl.setModelOptions('User', read); // LIST is not enabled
   * acl.setModelOption('User', 'unsafeUseReadAuthorizationFastPath', false);
   * // READ-to-list retries and retained handles keep the initiating READ capture.
   * ```
   */
  unsafeUseReadAuthorizationFastPath?: boolean;
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
 * Populate flags govern this model when it is the actual target, not refs leaving it.
 * Their model snapshots retain raw overrides; operation capture resolves live defaults.
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
   * Requested populate targets require an effective object schema in their owning
   * runtime (model defaults may supply it); `{}` explicitly closes business fields.
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
   * refs are retained automatically. The actual target's requireOperationAccessForPopulateDependencies
   * defaults to true; false bypasses only private target-operation admission, never
   * request read-row filters/retained IDs. Neither mode changes ordinary reference
   * shape: admitted population keeps its original authorized mask/miss; otherwise
   * selected/permitted parent fields keep exact original IDs, even on private failure.
   * Only unselected/field-denied source refs are omitted. Query operation admission is
   * independently controlled by that target's requireOperationAccessForPopulateQueries.
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
  /**
   * Once-per-root/target projected document grants, independently of skim/metadata.
   * Active unsafe query fast paths borrow ordinary source/hook input and share returned
   * grants/context leaves across field decisions/reads/owning embedded children.
   * Mutation can change permission outcomes; see ModelDocPermissionsHook and the
   * unsafeUseListAuthorizationFastPath / unsafeUseReadAuthorizationFastPath contract.
   */
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
  extends ModelRouterOptions<TModel, TVirtuals>, Omit<ExtendedDefaultModelRouterOptions<TModel>, 'permissionSchema'> {
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
