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
  ValidateRule,
} from './router-hooks';
import type { RequestSchemaLike } from '../validation/types';
export * from './request';
export * from './access';
export * from './router-hooks';

interface DefaultFindOneArgs<TModel = unknown> extends Omit<FindOneArgs<TModel>, 'overrides'> {}
interface DefaultFindByIdArgs<TModel = unknown> extends Omit<FindByIdArgs<TModel>, 'overrides'> {}
interface DefaultFindArgs<TModel = unknown> extends Omit<FindArgs<TModel>, 'overrides'> {}

type RequestSchema = RequestSchemaLike;
type NestedRequestSchema = {
  default?: RequestSchema;
  data?: RequestSchema;
};

type SubRouteGuardOptions = Record<string, Validation | Record<string, Validation>>;

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

export interface Defaults<TModel = unknown> {
  findOneArgs?: DefaultFindOneArgs<TModel>;
  findOneOptions?: FindOneOptions;
  findByIdArgs?: DefaultFindByIdArgs<TModel>;
  findByIdOptions?: FindByIdOptions;
  findArgs?: DefaultFindArgs<TModel>;
  findOptions?: FindOptions;
  createArgs?: CreateArgs;
  createOptions?: CreateOptions;
  updateOneArgs?: UpdateOneArgs<TModel>;
  updateOneOptions?: UpdateOneOptions;
  upsertOptions?: UpsertOptions;
  updateByIdArgs?: UpdateByIdArgs<TModel>;
  upsertArgs?: UpsertArgs<TModel>;
  updateByIdOptions?: UpdateByIdOptions;
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

export interface GlobalOptions {
  requestPermissionField?: string;
  globalPermissions?: (this: AccessRouterRequest, req: AccessRouterRequest) => MaybePromise<GlobalPermissionValue>;
  /** Require populate target models to be registered in the active runtime. Defaults to `true`. */
  requireRegisteredPopulateModels?: boolean;
  logger?: AccessRouterLogger;
  requestComplexity?: RequestComplexityOptions;
}

export interface RootRouterOptions {
  basePath: string;
  operationAccess?: Validation;
  maxBatchEntries?: number;
  maxOrderGroups?: number;
  /** Whole root operations per order group; separate from requestComplexity.maxBulkConcurrency persistence admission. */
  maxConcurrentOperations?: number;
}

interface OperationAccess {
  new?: Validation;
  list?: Validation;
  create?: Validation;
  read?: Validation;
  update?: Validation;
  upsert?: Validation;
  delete?: Validation;
  distinct?: Validation;
  count?: Validation;
  subs?: Validation | SubRouteGuardOptions;
}

type PermissionRule = Validation | OperationAccess;

export type PermissionSchema<TField extends string = string> = Partial<Record<TField, PermissionRule>>;

interface DocPermissions {
  list?: ModelDocPermissionsHook;
  create?: ModelDocPermissionsHook;
  read?: ModelDocPermissionsHook;
  update?: ModelDocPermissionsHook;
}

export interface DefaultModelRouterOptions<TModel = unknown> {
  listHardLimit?: number;
  /** Authorization metadata path (default `_permissions`); include output cannot equal, contain or descend from it. */
  documentPermissionField?: string;
  idParam?: string;
  idField?: string;
  resolveIdFilter?: ModelIdentifierHook<TModel>;
  parentPath?: string;
  queryRouteSegment?: string;
  mutationRouteSegment?: string;
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
   * placeholder — and client `includePermissions`/`includeFieldPermissions`
   * input (query params, body/root-batch options and service-direct options)
   * as well as per-operation `defaults` are ignored (both resolve to `false`).
   * Output matches `includePermissions: false` with the permissions field
   * removed entirely. Enforcement still runs; only output metadata is
   * affected. Defaults to `false`.
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
  'operationAccess.subs'?: SubRouteGuardOptions;
}

export interface ModelRouterOptions<TModel = unknown> extends DefaultModelRouterOptions<TModel> {
  modelName?: string;
  basePath?: string;
  /**
   * Update grants define assignment boundaries: authorized leaves preserve omitted
   * siblings; a whole-object/array grant permits replacement (no generic deep merge).
   * Send nested JSON; literal dotted client keys are not update operators.
   */
  permissionSchema?: PermissionSchema<AccessRouterFieldKey<TModel>>;
  alwaysSelectFields?: string[];
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
  baseFilter?: ModelBaseFilterHook | Record<string, ModelBaseFilterHook>;
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
  requestSchemas?: RequestSchemas;
  defaults?: Defaults<TModel>;
}

export interface DataRouterOptions<TData = unknown> {
  /**
   * In-memory records are owned by the router as an immutable configured snapshot.
   * Mutating this array or its records after configuration does not change served data;
   * use `setDataOption(name, 'data', nextRecords)` or `router.data(nextRecords)` to replace it.
   */
  data?: TData[];
  listHardLimit?: number;
  idParam?: string;
  idField?: string;
  resolveIdFilter?: DataIdentifierHook<TData>;
  parentPath?: string;
  queryRouteSegment?: string;
  operationAccess?: Validation | OperationAccess;
  dataName?: string;
  basePath?: string;
  permissionSchema?: PermissionSchema<AccessRouterFieldKey<TData>>;
  baseFilter?: DataBaseFilterHook | Record<string, DataBaseFilterHook>;
  overrideFilter?: DataOverrideFilterHook | Record<string, DataOverrideFilterHook>;
  decorate?: DataHook<TData> | Record<string, DataHook<TData>>;
  decorateAll?: DataListHook<TData> | Record<string, DataListHook<TData>>;
  requestSchemas?: DataRequestSchemas;
}

export interface ExtendedModelRouterOptions<TModel = unknown>
  extends ModelRouterOptions<TModel>, ExtendedDefaultModelRouterOptions<TModel> {
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
  'defaults.findOneArgs'?: DefaultFindOneArgs<TModel>;
  'defaults.findOneOptions'?: FindOneOptions;
  'defaults.findByIdArgs'?: DefaultFindByIdArgs<TModel>;
  'defaults.findByIdOptions'?: FindByIdOptions;
  'defaults.findArgs'?: DefaultFindArgs<TModel>;
  'defaults.findOptions'?: FindOptions;
  'defaults.createArgs'?: CreateArgs;
  'defaults.createOptions'?: CreateOptions;
  'defaults.updateOneArgs'?: UpdateOneArgs<TModel>;
  'defaults.updateOneOptions'?: UpdateOneOptions;
  'defaults.updateByIdArgs'?: UpdateByIdArgs<TModel>;
  'defaults.updateByIdOptions'?: UpdateByIdOptions;
  'defaults.upsertArgs'?: UpsertArgs<TModel>;
  'defaults.existsOptions'?: ExistsOptions;
  'defaults.publicListArgs'?: PublicListArgs;
  'defaults.publicListOptions'?: PublicListOptions;
  'defaults.publicCreateArgs'?: PublicCreateArgs;
  'defaults.publicCreateOptions'?: PublicCreateOptions;
  'defaults.publicReadArgs'?: PublicReadArgs;
  'defaults.publicReadOptions'?: PublicReadOptions;
  'defaults.publicUpdateArgs'?: PublicUpdateArgs;
  'defaults.publicUpdateOptions'?: PublicUpdateOptions;
}

export interface ExtendedDataRouterOptions<TData = unknown> extends DataRouterOptions<TData> {
  'requestSchemas.advancedList'?: RequestSchema;
  'requestSchemas.advancedReadFilter'?: RequestSchema;
  'requestSchemas.advancedRead'?: RequestSchema;
}
