import express from 'express';
import { Diff } from 'deep-diff';
import type { z } from 'zod';
import type { Core } from '../core';
import type { DataCore } from '../core-data';
import type { AccessRouterPermissions } from '../permission';
import { DataMiddlewareContext, DataRequest, Filter, MiddlewareContext, ModelRequest, Validation } from './base';
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

interface DefaultFindOneArgs<TModel = unknown> extends Omit<FindOneArgs<TModel>, 'overrides'> {}
interface DefaultFindByIdArgs<TModel = unknown> extends Omit<FindByIdArgs<TModel>, 'overrides'> {}
interface DefaultFindArgs<TModel = unknown> extends Omit<FindArgs<TModel>, 'overrides'> {}

type MaybePromise<T> = T | Promise<T>;
type RequestZodSchema = z.ZodTypeAny;

export interface AccessRouterRequestExtensions {
  macl?: Core;
  dacl?: DataCore;
}

export type AccessRouterRequest = express.Request & AccessRouterRequestExtensions;

export type AccessRouterFieldKey<T> = [Extract<keyof T, string>] extends [never] ? string : Extract<keyof T, string>;

type GlobalPermissionValue = Record<string, boolean> | string[] | string | null | undefined;

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

type ValidateRule = boolean | unknown[];

type ValidateHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  allowedData: unknown,
  permissions: AccessRouterPermissions,
  context: MiddlewareContext,
) => MaybePromise<ValidateRule>;

type DocPermissionsHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  doc: unknown,
  permissions: AccessRouterPermissions,
  context: MiddlewareContext,
) => MaybePromise<Record<string, unknown>>;

type ChangeHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  previousValue: unknown,
  nextValue: unknown,
  changes: Diff<unknown>[],
  context: MiddlewareContext,
) => MaybePromise<void>;

type DeleteHook<TValue = unknown, TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  value: TValue,
  permissions: AccessRouterPermissions,
  context: MiddlewareContext,
) => MaybePromise<void>;

type ModelBaseFilterHook = BaseFilterHook<ModelRequest>;
type DataBaseFilterHook = BaseFilterHook<DataRequest>;
type ModelOverrideFilterHook = OverrideFilterHook<ModelRequest>;
type DataOverrideFilterHook = OverrideFilterHook<DataRequest>;
type ModelValidateHook = ValidateHook<ModelRequest>;
type ModelDocPermissionsHook = DocPermissionsHook<ModelRequest>;
type ModelChangeHook = ChangeHook<ModelRequest>;
type ModelDeleteHook<TValue = unknown> = DeleteHook<TValue, ModelRequest>;
type ModelHook<TValue = unknown> = HookChain<TValue, MiddlewareContext, ModelRequest>;
type ModelListHook<TValue = unknown> = HookChain<TValue[], MiddlewareContext, ModelRequest>;
type DataHook<TValue = unknown> = HookChain<TValue, DataMiddlewareContext, DataRequest>;
type DataListHook<TValue = unknown> = HookChain<TValue[], DataMiddlewareContext, DataRequest>;

type SubRouteGuardOptions = Record<string, Validation | Record<string, Validation>>;

export interface RequestSchemas {
  create?: RequestZodSchema;
  update?: RequestZodSchema;
  upsert?: RequestZodSchema;
  count?: RequestZodSchema;
  distinct?: RequestZodSchema;
  advancedList?: RequestZodSchema;
  advancedReadFilter?: RequestZodSchema;
  advancedRead?: RequestZodSchema;
  advancedCreate?: RequestZodSchema;
  advancedCreateData?: RequestZodSchema;
  advancedUpdate?: RequestZodSchema;
  advancedUpdateData?: RequestZodSchema;
  advancedUpsert?: RequestZodSchema;
  advancedUpsertData?: RequestZodSchema;
  subList?: RequestZodSchema;
  subRead?: RequestZodSchema;
  subCreate?: RequestZodSchema;
  subUpdate?: RequestZodSchema;
  subBulkUpdate?: RequestZodSchema;
}

export interface DataRequestSchemas {
  advancedList?: RequestZodSchema;
  advancedReadFilter?: RequestZodSchema;
  advancedRead?: RequestZodSchema;
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
}

export interface GlobalOptions {
  requestPermissionField?: string;
  globalPermissions?: (this: AccessRouterRequest, req: AccessRouterRequest) => MaybePromise<GlobalPermissionValue>;
  logger?: AccessRouterLogger;
}

export interface RootRouterOptions {
  basePath: string;
  routeGuard?: Validation;
}

interface Access {
  list?: Validation;
  create?: Validation;
  read?: Validation;
  update?: Validation;
  delete?: Validation;
  distinct?: Validation;
  count?: Validation;
  sub?: Validation | SubRouteGuardOptions;
}

type PermissionRule = Validation | Access;

export type PermissionSchema<TField extends string = string> = Partial<Record<TField, PermissionRule>>;

interface DocPermissions {
  list?: ModelDocPermissionsHook;
  create?: ModelDocPermissionsHook;
  read?: ModelDocPermissionsHook;
  update?: ModelDocPermissionsHook;
}

export interface DefaultModelRouterOptions {
  listHardLimit?: number;
  documentPermissionField?: string;
  idParam?: string;
  identifier?: string | Function;
  parentPath?: string;
  queryPath?: string;
  mutationPath?: string;
  routeGuard?: Validation | Access;
  modelPermissionPrefix?: string;
}

export interface ExtendedDefaultModelRouterOptions extends DefaultModelRouterOptions {
  'routeGuard.default'?: Validation;
  'routeGuard.new'?: Validation;
  'routeGuard.list'?: Validation;
  'routeGuard.read'?: Validation;
  'routeGuard.update'?: Validation;
  'routeGuard.delete'?: Validation;
  'routeGuard.create'?: Validation;
  'routeGuard.distinct'?: Validation;
  'routeGuard.count'?: Validation;
  'routeGuard.subs'?: SubRouteGuardOptions;
}

export interface ModelRouterOptions<TModel = unknown> extends DefaultModelRouterOptions {
  modelName?: string;
  basePath?: string;
  permissionSchema?: PermissionSchema<AccessRouterFieldKey<TModel>>;
  _permissionSchemaKeys?: string[];
  _globalPermissionKeys?: Record<string, string[]>;
  _modelPermissionKeys?: Record<string, string[]>;
  mandatoryFields?: string[];
  docPermissions?: DocPermissions | ModelDocPermissionsHook;
  baseFilter?: ModelBaseFilterHook | Record<string, ModelBaseFilterHook>;
  overrideFilter?: ModelOverrideFilterHook | Record<string, ModelOverrideFilterHook>;
  decorate?: ModelHook<TModel> | Record<string, ModelHook<TModel>>;
  decorateAll?: ModelListHook<TModel> | Record<string, ModelListHook<TModel>>;
  validate?: ValidateRule | ModelValidateHook | Record<string, ValidateRule | ModelValidateHook>;
  prepare?: ModelHook<TModel> | Record<string, ModelHook<TModel>>;
  transform?: ModelHook<TModel> | Record<string, ModelHook<TModel>>;
  afterPersist?: ModelHook<TModel> | Record<string, ModelHook<TModel>>;
  change?: Record<string, ModelChangeHook>;
  beforeDelete?: ModelDeleteHook<TModel>;
  afterDelete?: ModelDeleteHook<TModel>;
  requestSchemas?: RequestSchemas;
  defaults?: Defaults<TModel>;
}

export interface DataRouterOptions<TData = unknown> {
  data?: TData[];
  listHardLimit?: number;
  idParam?: string;
  identifier?: string | Function;
  parentPath?: string;
  queryPath?: string;
  routeGuard?: Validation | Access;
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
  extends ModelRouterOptions<TModel>, ExtendedDefaultModelRouterOptions {
  'mandatoryFields.default'?: string[];
  'mandatoryFields.list'?: string[];
  'mandatoryFields.create'?: string[];
  'mandatoryFields.read'?: string[];
  'mandatoryFields.update'?: string[];
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
  'decorate.default'?: ModelHook;
  'decorate.list'?: ModelHook;
  'decorate.create'?: ModelHook;
  'decorate.read'?: ModelHook;
  'decorate.update'?: ModelHook;
  'decorateAll.default'?: ModelListHook;
  'decorateAll.list'?: ModelListHook;
  'validate.default'?: ValidateRule | ModelValidateHook;
  'validate.create'?: ValidateRule | ModelValidateHook;
  'validate.update'?: ValidateRule | ModelValidateHook;
  'prepare.default'?: ModelHook;
  'prepare.create'?: ModelHook;
  'prepare.update'?: ModelHook;
  'transform.default'?: ModelHook;
  'transform.update'?: ModelHook;
  'afterPersist.default'?: ModelHook;
  'afterPersist.create'?: ModelHook;
  'afterPersist.update'?: ModelHook;
  'requestSchemas.create'?: RequestZodSchema;
  'requestSchemas.update'?: RequestZodSchema;
  'requestSchemas.upsert'?: RequestZodSchema;
  'requestSchemas.count'?: RequestZodSchema;
  'requestSchemas.distinct'?: RequestZodSchema;
  'requestSchemas.advancedList'?: RequestZodSchema;
  'requestSchemas.advancedReadFilter'?: RequestZodSchema;
  'requestSchemas.advancedRead'?: RequestZodSchema;
  'requestSchemas.advancedCreate.default'?: RequestZodSchema;
  'requestSchemas.advancedCreate.data'?: RequestZodSchema;
  'requestSchemas.advancedUpdate'?: RequestZodSchema;
  'requestSchemas.advancedUpdate.default'?: RequestZodSchema;
  'requestSchemas.advancedUpdate.data'?: RequestZodSchema;
  'requestSchemas.advancedUpsert.default'?: RequestZodSchema;
  'requestSchemas.advancedUpsert.data'?: RequestZodSchema;
  'requestSchemas.subList'?: RequestZodSchema;
  'requestSchemas.subRead'?: RequestZodSchema;
  'requestSchemas.subCreate'?: RequestZodSchema;
  'requestSchemas.subUpdate'?: RequestZodSchema;
  'requestSchemas.subBulkUpdate'?: RequestZodSchema;
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
  'requestSchemas.advancedList'?: RequestZodSchema;
  'requestSchemas.advancedReadFilter'?: RequestZodSchema;
  'requestSchemas.advancedRead'?: RequestZodSchema;
}

export type SelectAccess = 'list' | 'create' | 'read' | 'update' | string;
export type RouteGuardAccess =
  | 'new'
  | 'list'
  | 'read'
  | 'update'
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
