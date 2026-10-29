import mongoose from 'mongoose';
import type {} from './filter-type-tests';
import type { Router as ExpressRouter } from 'express';
import { isPlainObject, isString, isUndefined } from '@web-ts-toolkit/utils';
import middleware, { guard } from './middleware';
import type { GuardModelCondition, GuardModelConditionID } from './middleware';
import { createSetCore } from './core';
import { RootRouter, ModelRouter, DataRouter, combineRoutes } from './routers';
import { createOpenApiRouter } from './openapi/router';
import { OpenApiCollisionError } from './openapi/errors';
import { OpenApiRegistry } from './openapi/registry';
import type {
  OpenApiDocumentOptions,
  OpenApiMethod,
  OpenApiRegistryOptions,
  OpenApiRouteDescriptor,
  OpenApiRouterOptions,
} from './openapi/types';
import {
  setGlobalOptions,
  setGlobalOption,
  getGlobalOptions,
  getGlobalOption,
  setModelOptions,
  setModelOption,
  getModelOptions,
  getModelOption,
  getModelNames,
  getModelJsonSchema,
  registerModelInstance,
  hasModelInstance,
  getModelInstance,
  setDefaultModelOptions,
  setDefaultModelOption,
  getDefaultModelOptions,
  getDefaultModelOption,
} from './options';
import {
  GlobalOptions,
  RootRouterOptions,
  ExtendedDefaultModelRouterOptions,
  ExtendedModelRouterOptions,
  ModelRouterOptions,
  DataRouterOptions,
  AccessRouterRequest,
  AccessRouterRequestExtensions,
} from './interfaces';
import { AccessRouterPermissions, AccessRouterPermissionMap } from './permission';
import { AccessRuntime, defaultRuntime } from './runtime';
import {
  fromAjv,
  fromArkType,
  fromIoTs,
  fromJoi,
  fromStandardSchema,
  fromSuperstruct,
  fromValibot,
  fromVine,
  fromYup,
  defineRequestSchema,
  fromZod,
  type AjvErrorObjectLike,
  type AjvValidatorLike,
  type ArkTypeErrorsLike,
  type ArkTypeLike,
  type IoTsContextEntryLike,
  type IoTsDecodeErrorLike,
  type IoTsDecoderLike,
  type JoiSchemaLike,
  type JoiValidationErrorDetailLike,
  type RequestSchemaAdapter,
  type RequestSchemaFailure,
  type RequestSchemaIssue,
  type RequestSchemaLike,
  type RequestSchemaOptions,
  type RequestSchemaResult,
  type RequestSchemaSuccess,
  type RequestSchemaValidator,
  type StandardSchemaFailure,
  type StandardSchemaInferOutput,
  type StandardSchemaIssue,
  type StandardSchemaPathSegment,
  type StandardSchemaResult,
  type StandardSchemaSuccess,
  type StandardSchemaV1,
  type SuperstructFailureLike,
  type SuperstructValidateLike,
  type ValibotIssueLike,
  type ValibotSafeParseLike,
  type ValibotSafeParseResult,
  type ValibotPathItemLike,
  type VineValidationErrorLike,
  type VineValidationMessageLike,
  type VineValidatorLike,
  type YupSchemaLike,
  type YupValidationErrorLike,
} from './validation';
export {
  RootRouter,
  ModelRouter,
  DataRouter,
  combineRoutes,
  AccessRuntime,
  defaultRuntime,
  defineRequestSchema,
  fromAjv,
  fromArkType,
  fromIoTs,
  fromJoi,
  fromStandardSchema,
  fromSuperstruct,
  fromValibot,
  fromVine,
  fromYup,
  fromZod,
  guard,
  setGlobalOptions,
  setGlobalOption,
  getGlobalOptions,
  getGlobalOption,
  setModelOptions,
  setModelOption,
  getModelOptions,
  getModelOption,
  getModelNames,
  getModelJsonSchema,
  setDefaultModelOptions,
  setDefaultModelOption,
  getDefaultModelOptions,
  getDefaultModelOption,
  registerModelInstance,
  hasModelInstance,
  getModelInstance,
  createOpenApiRouter,
  OpenApiCollisionError,
  OpenApiRegistry,
};
export type { OpenApiRegistryOptions };
export type {
  AccessRouterPermissions,
  AccessRouterPermissionMap,
  AccessRouterRequest,
  AccessRouterRequestExtensions,
  GlobalOptions,
  RootRouterOptions,
  ExtendedDefaultModelRouterOptions,
  ModelRouterOptions,
  DataRouterOptions,
  GuardModelCondition,
  GuardModelConditionID,
  AjvErrorObjectLike,
  AjvValidatorLike,
  ArkTypeErrorsLike,
  ArkTypeLike,
  IoTsContextEntryLike,
  IoTsDecodeErrorLike,
  IoTsDecoderLike,
  JoiSchemaLike,
  JoiValidationErrorDetailLike,
  RequestSchemaAdapter,
  RequestSchemaFailure,
  RequestSchemaIssue,
  RequestSchemaLike,
  RequestSchemaOptions,
  RequestSchemaResult,
  RequestSchemaSuccess,
  RequestSchemaValidator,
  StandardSchemaFailure,
  StandardSchemaInferOutput,
  StandardSchemaIssue,
  StandardSchemaPathSegment,
  StandardSchemaResult,
  StandardSchemaSuccess,
  StandardSchemaV1,
  SuperstructFailureLike,
  SuperstructValidateLike,
  ValibotIssueLike,
  ValibotPathItemLike,
  ValibotSafeParseLike,
  ValibotSafeParseResult,
  VineValidationErrorLike,
  VineValidationMessageLike,
  VineValidatorLike,
  YupSchemaLike,
  YupValidationErrorLike,
  OpenApiDocumentOptions,
  OpenApiMethod,
  OpenApiRouteDescriptor,
  OpenApiRouterOptions,
};
export type { CombinedRouteInput } from './routers';
// Only policy inputs and opaque consumer results/handles belong to the package boundary.
export type {
  AllowedOutputFieldOptions,
  AuthorizedListResult,
  AuthorizedSingleResult,
  CreateAuthorization,
  DocumentAuthorization,
  FieldAuthorization,
  InputFieldAuthorization,
  InputFieldPath,
  MutationAuthorization,
  OperationAuthorization,
  OutputAuthorization,
  OutputFieldOptions,
  OutputFieldPath,
  OutputPlanningOptions,
  RelatedAuthorization,
  RowAuthorization,
  ServiceAuthorization,
  ServiceOutputContext,
  ServiceOutputDecorator,
} from './interfaces/service-authorization';
export type {
  NewArgs,
  NewOptions,
  PopulatePlanningOptions,
  SubdocumentName,
  SubdocumentModel,
  SubdocumentVirtuals,
  SubdocumentListOptions,
  SubdocumentReadOptions,
  SubdocumentCreateOptions,
  SubdocumentUpdateOptions,
  SubdocumentDeleteOptions,
  PublicSubdocumentListOptions,
  PublicSubdocumentReadOptions,
  PublicSubdocumentCreateOptions,
  PublicSubdocumentMutationOptions,
} from './interfaces/service';
export type { DataFieldOptions } from './interfaces/data';
export type {
  SubdocumentGateAuthorization,
  SubdocumentOutputAuthorization,
  SubdocumentInputAuthorization,
  SubdocumentReadAuthorization,
  SubdocumentMutationAuthorization,
  SubdocumentCreateAuthorization,
  SubdocumentDeleteAuthorization,
  SubdocumentVisibilityAuthorization,
  SubdocumentCreateVisibilityAuthorization,
} from './interfaces/subdocument-authorization';
export type {
  DefaultModelRouterOptions,
  HydrationMode,
  ModelHydrationOptions,
  ExtendedDataRouterOptions,
  ExtendedModelRouterOptions,
  FieldOperationAccess,
  OperationAccess,
  PermissionSchema,
  SubOperationAccess,
  SubRouteGuardOptions,
  MaybePromise,
  GlobalPermissionValue,
  ModelBaseFilterHook,
  ModelDeleteHook,
  ModelDocPermissionsHook,
  ModelDocumentHook,
  ModelHook,
  ModelIdentifierHook,
  ModelListHook,
  ModelOverrideFilterHook,
  ModelValidateHook,
  ModelVirtualAccess,
  ModelVirtualRecordAccess,
  ModelVirtualContext,
  ModelVirtualDoc,
  ModelVirtualGetter,
  ModelVirtualDescriptor,
  ModelVirtualPopulateDependency,
  ModelVirtualPopulateInputs,
  ModelVirtualAccessRecord,
  ModelVirtualLeaf,
  ModelVirtuals,
  VirtualSubModel,
  WithVirtuals,
} from './interfaces';
export type {
  GuardHook,
  Validation,
  PairedRouteAccess,
  RouteBaseAccess,
  RouteGuardAccess,
  RouteVariant,
  RouteVariantAccess,
} from './interfaces/access';
export * from './permission';
export * from './plugins';
export { redactFilter, redactPayload, safeStringify, isLevelEnabled } from './logger-helpers';
export type { OpLogContext } from './logger-helpers';

type CreateRouter = {
  /**
   * Create a model CRUD router and register this exact Mongoose model/connection
   * with the owning runtime. Configure operationAccess and permissionSchema, then
   * mount the returned `.routes` in Express after express.json(). Route middleware
   * initializes req.macl; field enforcement does not require permissionsPlugin.
   */
  <TModel, TVirtuals extends object = Record<never, never>>(
    model: mongoose.Model<TModel>,
    options: ModelRouterOptions<TModel, TVirtuals>,
  ): ModelRouter<TModel, TVirtuals>;
  /**
   * Create a router for an already-registered model name. Isolated runtimes require
   * registerModelInstance(name, model) first; default acl also adopts mongoose.model(name).
   * Prefer the model-instance overload for explicit connection ownership.
   */
  <TModel, TVirtuals extends object = Record<never, never>>(
    modelName: string,
    options: ModelRouterOptions<TModel, TVirtuals>,
  ): ModelRouter<TModel, TVirtuals>;
  /** Create an ordered root batch endpoint for this runtime's targets; mount `.routes`. */
  (options: RootRouterOptions): RootRouter;
};

type CreateDataRouter = {
  /**
   * Create request-only list/read routes over an owned in-memory dataset. Set
   * operationAccess, permissionSchema, idParam and idField explicitly. Mount `.routes`;
   * middleware initializes req.dacl. No MongoDB connection or model defaults are used.
   * Data replacement affects new services; existing services keep their captured version.
   */
  <TData>(dataName: string, options: DataRouterOptions<TData>): DataRouter<TData>;
};

/** Runtime-bound OpenAPI factory; returns an Express router mounted directly with app.use(). */
type CreateRuntimeOpenApiRouter = (options?: OpenApiRouterOptions) => ExpressRouter;

type WttSet = {
  /** Set one global option. Populate flags use setModelOption/setDefaultModelOption; stale global placement throws migration guidance. */
  <K extends keyof GlobalOptions>(key: K, value: GlobalOptions[K]): void;
  /** Shallowly replace supplied globals; populate flags belong to setModelOptions/setDefaultModelOptions. */
  (options: { [K in keyof GlobalOptions]: GlobalOptions[K] }): void;
};

interface Wtt {
  /** Owning options/model/OpenAPI registry; also exposes data and exact option getters/setters. */
  runtime: AccessRuntime;
  /** Model instance/name + options creates CRUD routes; a single options object creates a root batch. */
  createRouter: CreateRouter;
  /** Owned in-memory list/read router; no model-default or backend field-grant layer. */
  createDataRouter: CreateDataRouter;
  /** This runtime's OpenAPI/Swagger UI router. Unlike the standalone export, takes only options. */
  createOpenApiRouter: CreateRuntimeOpenApiRouter;
  combineRoutes: typeof combineRoutes;
  set: WttSet;
  setGlobalOptions: typeof setGlobalOptions;
  setGlobalOption: typeof setGlobalOption;
  getGlobalOptions: typeof getGlobalOptions;
  getGlobalOption: typeof getGlobalOption;
  setModelOptions: typeof setModelOptions;
  setModelOption: typeof setModelOption;
  getModelOptions: typeof getModelOptions;
  getModelOption: typeof getModelOption;
  getModelNames: typeof getModelNames;
  getModelJsonSchema: typeof getModelJsonSchema;
  setDefaultModelOptions: typeof setDefaultModelOptions;
  setDefaultModelOption: typeof setDefaultModelOption;
  getDefaultModelOptions: typeof getDefaultModelOptions;
  getDefaultModelOption: typeof getDefaultModelOption;
  registerModelInstance: <TModel>(modelName: string, model: mongoose.Model<TModel>) => void;
  hasModelInstance: (modelName: string) => boolean;
  getModelInstance: <TModel = unknown>(modelName: string) => mongoose.Model<TModel> | null;
  RootRouter: typeof RootRouter;
  ModelRouter: typeof ModelRouter;
  DataRouter: typeof DataRouter;
}

/**
 * Callable runtime-bound facade returned by createAccessRuntime (also the type of acl).
 * Calling api() creates model request middleware for custom routes; generated `.routes`
 * already initialize their own model/data cores. api.runtime is the AccessRuntime owner.
 * Configuration methods on this facade remain bound to that owner.
 */
export type AccessRuntimeApi = typeof middleware & Wtt;

type MongooseModelLike = mongoose.Model<unknown>;

const isMongooseModel = (value: unknown): value is MongooseModelLike =>
  typeof value === 'function' && value !== null && 'modelName' in value && 'schema' in value;

function createRuntimeApi(runtime: AccessRuntime): AccessRuntimeApi {
  const runtimeMiddleware = function () {
    return createSetCore(runtime);
  } as typeof middleware;

  const wtt = runtimeMiddleware as typeof middleware & Wtt;

  wtt.runtime = runtime;

  wtt.createRouter = function (
    modelName: string | MongooseModelLike | RootRouterOptions,
    options: ModelRouterOptions | undefined,
  ) {
    if (isUndefined(options)) {
      return new RootRouter(modelName as RootRouterOptions, runtime);
    }

    if (typeof modelName === 'string') {
      return new ModelRouter(modelName, options, runtime);
    }

    if (isMongooseModel(modelName)) {
      const name = String(modelName.modelName);
      runtime.registerModelInstance(name, modelName);
      return ModelRouter.fromModel(modelName, options, runtime);
    }

    throw new TypeError(`createRouter: unsupported first argument type: ${typeof modelName}`);
  } as CreateRouter;

  wtt.createDataRouter = function <TData>(dataName: string, options: DataRouterOptions<TData>) {
    return new DataRouter(dataName, options, runtime);
  };

  wtt.createOpenApiRouter = function (options) {
    return createOpenApiRouter(runtime, options);
  };

  wtt.combineRoutes = combineRoutes;

  wtt.set = function <K extends keyof GlobalOptions>(keyOrOptions: K | GlobalOptions, value?: unknown) {
    if (arguments.length === 2 && isString(keyOrOptions)) {
      return runtime.setGlobalOption(keyOrOptions as K, value as GlobalOptions[K]);
    }

    if (arguments.length === 1 && isPlainObject(keyOrOptions)) {
      return runtime.setGlobalOptions(keyOrOptions as GlobalOptions);
    }
  };

  wtt.setGlobalOptions = runtime.setGlobalOptions.bind(runtime);
  wtt.setGlobalOption = runtime.setGlobalOption.bind(runtime);
  wtt.getGlobalOptions = runtime.getGlobalOptions.bind(runtime);
  wtt.getGlobalOption = runtime.getGlobalOption.bind(runtime);
  wtt.setModelOptions = runtime.setModelOptions.bind(runtime);
  wtt.setModelOption = runtime.setModelOption.bind(runtime);
  wtt.getModelOptions = runtime.getModelOptions.bind(runtime);
  wtt.getModelOption = runtime.getModelOption.bind(runtime);
  wtt.getModelNames = runtime.getModelNames.bind(runtime);
  wtt.getModelJsonSchema = runtime.getModelJsonSchema.bind(runtime);
  wtt.setDefaultModelOptions = runtime.setDefaultModelOptions.bind(runtime);
  wtt.setDefaultModelOption = runtime.setDefaultModelOption.bind(runtime);
  wtt.getDefaultModelOptions = runtime.getDefaultModelOptions.bind(runtime);
  wtt.getDefaultModelOption = runtime.getDefaultModelOption.bind(runtime);
  wtt.registerModelInstance = runtime.registerModelInstance.bind(runtime);
  wtt.hasModelInstance = runtime.hasModelInstance.bind(runtime);
  wtt.getModelInstance = runtime.getModelInstance.bind(runtime);
  wtt.RootRouter = RootRouter;
  wtt.ModelRouter = ModelRouter;
  wtt.DataRouter = DataRouter;

  return wtt as AccessRuntimeApi;
}

/**
 * Create an isolated Express/Mongoose router API with its own options, model registry,
 * OpenAPI registry and request-owned work pools. Requires Node >=22, Express >=5 and
 * Mongoose >=8. Pass a Mongoose model instance to createRouter, or register it before
 * using a string name; isolated runtimes do not fall back to global mongoose.models.
 *
 * The returned callable facade exposes factories/setters; `.runtime` is its owner.
 * Mount generated `.routes` after express.json(); connect MongoDB before listening.
 * Model operations default to denied until operationAccess is configured, and field
 * visibility requires permissionSchema. permissionsPlugin is only an optional raw-document alias.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import mongoose from 'mongoose';
 * import { createAccessRuntime } from '@web-ts-toolkit/access-router';
 * const api = createAccessRuntime();
 * const Product = mongoose.model('Product', new mongoose.Schema({ name: String }));
 * const products = api.createRouter(Product, {
 *   basePath: '/products',
 *   operationAccess: { list: true, read: true },
 *   permissionSchema: { name: true },
 * });
 * const app = express();
 * app.use(express.json());
 * app.use(products.routes);
 * // Await mongoose.connect(uri) before app.listen(port).
 * ```
 * @returns A fresh AccessRuntimeApi. See the shipped README's Configuration layers.
 */
export function createAccessRuntime() {
  return createRuntimeApi(new AccessRuntime());
}

const wtt = createRuntimeApi(defaultRuntime);

/**
 * Shared default-runtime API. Canonical import: `import acl from '@web-ts-toolkit/access-router'`;
 * named `{ acl }` is identical. CommonJS uses `require('@web-ts-toolkit/access-router').acl`.
 * Use createAccessRuntime() for an isolated registry/configuration. Mount factory `.routes`;
 * calling acl() alone supplies model middleware for custom handlers.
 */
export const acl = wtt;

export default acl;
