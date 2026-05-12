import express from 'express';
import { Diff } from 'deep-diff';
import type { Permissions } from '../permission';
import { DataMiddlewareContext, Filter, MiddlewareContext, Validation } from './base';
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

interface DefaultFindOneArgs extends Omit<FindOneArgs, 'overrides'> {}
interface DefaultFindByIdArgs extends Omit<FindByIdArgs, 'overrides'> {}
interface DefaultFindArgs extends Omit<FindArgs, 'overrides'> {}

type MaybePromise<T> = T | Promise<T>;

type GlobalPermissionValue = Record<string, boolean> | string[] | string | null | undefined;

type BaseFilterHook = (
  this: express.Request,
  permissions: Permissions,
) => MaybePromise<Filter | true | null | undefined>;

type OverrideFilterHook = (this: express.Request, filter: Filter, permissions: Permissions) => MaybePromise<Filter>;

type MiddlewareHook<TValue, TContext> = (
  this: express.Request,
  value: TValue,
  permissions: Permissions,
  context: TContext,
) => MaybePromise<TValue>;

type MiddlewareChain<TValue, TContext> = MiddlewareHook<TValue, TContext> | Array<MiddlewareHook<TValue, TContext>>;

type ValidateRule = boolean | unknown[];

type ValidateHook = (
  this: express.Request,
  allowedData: unknown,
  permissions: Permissions,
  context: MiddlewareContext,
) => MaybePromise<ValidateRule>;

type DocPermissionsHook = (
  this: express.Request,
  doc: unknown,
  permissions: Permissions,
  context: MiddlewareContext,
) => MaybePromise<Record<string, unknown>>;

type ChangeHook = (
  this: express.Request,
  previousValue: unknown,
  nextValue: unknown,
  changes: Diff<unknown>[],
  context: MiddlewareContext,
) => MaybePromise<void>;

type ModelMiddleware = MiddlewareChain<unknown, MiddlewareContext>;
type ModelListMiddleware = MiddlewareChain<unknown[], MiddlewareContext>;
type DataMiddleware = MiddlewareChain<unknown, DataMiddlewareContext>;
type DataListMiddleware = MiddlewareChain<unknown[], DataMiddlewareContext>;

type SubRouteGuardOptions = Record<string, Validation | Record<string, Validation>>;

export interface Defaults {
  findOneArgs?: DefaultFindOneArgs;
  findOneOptions?: FindOneOptions;
  findByIdArgs?: DefaultFindByIdArgs;
  findByIdOptions?: FindByIdOptions;
  findArgs?: DefaultFindArgs;
  findOptions?: FindOptions;
  createArgs?: CreateArgs;
  createOptions?: CreateOptions;
  updateOneArgs?: UpdateOneArgs;
  updateOneOptions?: UpdateOneOptions;
  upsertOptions?: UpsertOptions;
  updateByIdArgs?: UpdateByIdArgs;
  upsertArgs?: UpsertArgs;
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
  globalPermissions?: (this: express.Request, req: express.Request) => MaybePromise<GlobalPermissionValue>;
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

interface PermissionSchema {
  [key: string]: Access;
}

interface DocPermissions {
  list?: Function;
  create?: Function;
  read?: Function;
  update?: Function;
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

export interface ModelRouterOptions extends DefaultModelRouterOptions {
  modelName?: string;
  basePath?: string;
  permissionSchema?: PermissionSchema;
  _permissionSchemaKeys?: string[];
  _globalPermissionKeys?: Record<string, string[]>;
  _modelPermissionKeys?: Record<string, string[]>;
  mandatoryFields?: string[];
  docPermissions?: DocPermissions | DocPermissionsHook;
  baseFilter?: BaseFilterHook | Record<string, BaseFilterHook>;
  overrideFilter?: OverrideFilterHook | Record<string, OverrideFilterHook>;
  decorate?: ModelMiddleware | Record<string, ModelMiddleware>;
  decorateAll?: ModelListMiddleware | Record<string, ModelListMiddleware>;
  validate?: ValidateRule | ValidateHook | Record<string, ValidateRule | ValidateHook>;
  prepare?: ModelMiddleware | Record<string, ModelMiddleware>;
  transform?: ModelMiddleware | Record<string, ModelMiddleware>;
  finalize?: ModelMiddleware | Record<string, ModelMiddleware>;
  change?: Record<string, ChangeHook>;
  defaults?: Defaults;
}

export interface DataRouterOptions {
  data?: unknown[];
  listHardLimit?: number;
  idParam?: string;
  identifier?: string | Function;
  parentPath?: string;
  queryPath?: string;
  routeGuard?: Validation | Access;
  dataName?: string;
  basePath?: string;
  permissionSchema?: PermissionSchema;
  baseFilter?: BaseFilterHook | Record<string, BaseFilterHook>;
  overrideFilter?: OverrideFilterHook | Record<string, OverrideFilterHook>;
  decorate?: DataMiddleware | Record<string, DataMiddleware>;
  decorateAll?: DataListMiddleware | Record<string, DataListMiddleware>;
}

export interface ExtendedModelRouterOptions extends ModelRouterOptions, ExtendedDefaultModelRouterOptions {
  'mandatoryFields.default'?: string[];
  'mandatoryFields.list'?: string[];
  'mandatoryFields.create'?: string[];
  'mandatoryFields.read'?: string[];
  'mandatoryFields.update'?: string[];
  'docPermissions.default'?: DocPermissionsHook;
  'docPermissions.list'?: DocPermissionsHook;
  'docPermissions.create'?: DocPermissionsHook;
  'docPermissions.read'?: DocPermissionsHook;
  'docPermissions.update'?: DocPermissionsHook;
  'baseFilter.default'?: BaseFilterHook;
  'baseFilter.list'?: BaseFilterHook;
  'baseFilter.read'?: BaseFilterHook;
  'baseFilter.update'?: BaseFilterHook;
  'baseFilter.delete'?: BaseFilterHook;
  'overrideFilter.default'?: OverrideFilterHook;
  'overrideFilter.list'?: OverrideFilterHook;
  'overrideFilter.read'?: OverrideFilterHook;
  'overrideFilter.update'?: OverrideFilterHook;
  'overrideFilter.delete'?: OverrideFilterHook;
  'decorate.default'?: ModelMiddleware;
  'decorate.list'?: ModelMiddleware;
  'decorate.create'?: ModelMiddleware;
  'decorate.read'?: ModelMiddleware;
  'decorate.update'?: ModelMiddleware;
  'decorateAll.default'?: ModelListMiddleware;
  'decorateAll.list'?: ModelListMiddleware;
  'validate.default'?: ValidateRule | ValidateHook;
  'validate.create'?: ValidateRule | ValidateHook;
  'validate.update'?: ValidateRule | ValidateHook;
  'prepare.default'?: ModelMiddleware;
  'prepare.create'?: ModelMiddleware;
  'prepare.update'?: ModelMiddleware;
  'transform.default'?: ModelMiddleware;
  'transform.update'?: ModelMiddleware;
  'finalize.default'?: ModelMiddleware;
  'finalize.create'?: ModelMiddleware;
  'finalize.update'?: ModelMiddleware;
  'defaults.findOneArgs'?: DefaultFindOneArgs;
  'defaults.findOneOptions'?: FindOneOptions;
  'defaults.findByIdArgs'?: DefaultFindByIdArgs;
  'defaults.findByIdOptions'?: FindByIdOptions;
  'defaults.findArgs'?: DefaultFindArgs;
  'defaults.findOptions'?: FindOptions;
  'defaults.createArgs'?: CreateArgs;
  'defaults.createOptions'?: CreateOptions;
  'defaults.updateOneArgs'?: UpdateOneArgs;
  'defaults.updateOneOptions'?: UpdateOneOptions;
  'defaults.updateByIdArgs'?: UpdateByIdArgs;
  'defaults.updateByIdOptions'?: UpdateByIdOptions;
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
export type FinalizeAccess = 'create' | 'update' | string;
