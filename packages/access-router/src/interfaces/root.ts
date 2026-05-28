import express from 'express';
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
}

export interface GlobalOptions {
  requestPermissionField?: string;
  globalPermissions?: (this: AccessRouterRequest, req: AccessRouterRequest) => MaybePromise<GlobalPermissionValue>;
  logger?: AccessRouterLogger;
}

export interface RootRouterOptions {
  basePath: string;
  operationAccess?: Validation;
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
  documentPermissionField?: string;
  idParam?: string;
  idField?: string;
  resolveIdFilter?: ModelIdentifierHook<TModel>;
  parentPath?: string;
  queryRouteSegment?: string;
  mutationRouteSegment?: string;
  operationAccess?: Validation | OperationAccess;
  modelPermissionPrefix?: string;
}

export interface ExtendedDefaultModelRouterOptions<TModel = unknown> extends DefaultModelRouterOptions<TModel> {
  'operationAccess.default'?: Validation;
  'operationAccess.new'?: Validation;
  'operationAccess.list'?: Validation;
  'operationAccess.read'?: Validation;
  'operationAccess.update'?: Validation;
  'operationAccess.delete'?: Validation;
  'operationAccess.create'?: Validation;
  'operationAccess.distinct'?: Validation;
  'operationAccess.count'?: Validation;
  'operationAccess.subs'?: SubRouteGuardOptions;
}

export interface ModelRouterOptions<TModel = unknown> extends DefaultModelRouterOptions<TModel> {
  modelName?: string;
  basePath?: string;
  permissionSchema?: PermissionSchema<AccessRouterFieldKey<TModel>>;
  alwaysSelectFields?: string[];
  docPermissions?: DocPermissions | ModelDocPermissionsHook;
  baseFilter?: ModelBaseFilterHook | Record<string, ModelBaseFilterHook>;
  overrideFilter?: ModelOverrideFilterHook | Record<string, ModelOverrideFilterHook>;
  decorate?: ModelHook<TModel> | Record<string, ModelHook<TModel>>;
  decorateAll?: ModelListHook<TModel> | Record<string, ModelListHook<TModel>>;
  validate?: ValidateRule | ModelValidateHook | Record<string, ValidateRule | ModelValidateHook>;
  prepare?: ModelHook<TModel> | Record<string, ModelHook<TModel>>;
  transform?: ModelDocumentHook<TModel> | Record<string, ModelDocumentHook<TModel>>;
  afterPersist?: ModelDocumentHook<TModel> | Record<string, ModelDocumentHook<TModel>>;
  onChange?: Record<string, ModelChangeHook>;
  beforeDelete?: ModelDeleteHook<TModel>;
  afterDelete?: ModelDeleteHook<TModel>;
  requestSchemas?: RequestSchemas;
  defaults?: Defaults<TModel>;
}

export interface DataRouterOptions<TData = unknown> {
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
  'transform.default'?: ModelDocumentHook;
  'transform.update'?: ModelDocumentHook;
  'afterPersist.default'?: ModelDocumentHook;
  'afterPersist.create'?: ModelDocumentHook;
  'afterPersist.update'?: ModelDocumentHook;
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
