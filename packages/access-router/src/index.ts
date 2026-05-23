import mongoose from 'mongoose';
import type {} from './filter-type-tests';
import { isPlainObject, isString, isUndefined } from '@web-ts-toolkit/utils';
import middleware, { guard } from './middleware';
import { createSetCore } from './core';
import { RootRouter, ModelRouter, DataRouter, combineRoutes } from './routers';
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
  setDefaultModelOptions,
  setDefaultModelOption,
  getDefaultModelOptions,
  getDefaultModelOption,
} from './options';
import {
  GlobalOptions,
  RootRouterOptions,
  ModelRouterOptions,
  DataRouterOptions,
  AccessRouterRequest,
  AccessRouterRequestExtensions,
} from './interfaces';
import { AccessRouterPermissions, AccessRouterPermissionMap } from './permission';
import { AccessRuntime, defaultRuntime } from './runtime';
export {
  RootRouter,
  ModelRouter,
  DataRouter,
  combineRoutes,
  AccessRuntime,
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
};
export type { AccessRouterPermissions, AccessRouterPermissionMap, AccessRouterRequest, AccessRouterRequestExtensions };
export type { CombinedRouteInput } from './routers';
export * from './permission';
export * from './plugins';
export * from './interfaces';
export * from './symbols';
export * from './enums';
export * from './routers/validation';

type CreateRouter = {
  <TModel>(model: mongoose.Model<TModel>, options: ModelRouterOptions<TModel>): ModelRouter<TModel>;
  <TModel>(modelName: string, options: ModelRouterOptions<TModel>): ModelRouter<TModel>;
  (options: RootRouterOptions): RootRouter;
};

type CreateDataRouter = {
  <TData>(dataName: string, options: DataRouterOptions<TData>): DataRouter<TData>;
};

type WttSet = {
  <K extends keyof GlobalOptions>(key: K, value: GlobalOptions[K]): void;
  (options: { [K in keyof GlobalOptions]: GlobalOptions[K] }): void;
};

interface Wtt {
  runtime: AccessRuntime;
  createRouter: CreateRouter;
  createDataRouter: CreateDataRouter;
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
  RootRouter: typeof RootRouter;
  ModelRouter: typeof ModelRouter;
  DataRouter: typeof DataRouter;
}

export type AccessRuntimeApi = typeof middleware & Wtt;

function createRuntimeApi(runtime: AccessRuntime): AccessRuntimeApi {
  const runtimeMiddleware = function () {
    return createSetCore(runtime);
  } as typeof middleware;

  const wtt = runtimeMiddleware as typeof middleware & Wtt;

  wtt.runtime = runtime;

  wtt.createRouter = function (
    modelName: string | mongoose.Model<unknown> | RootRouterOptions,
    options: ModelRouterOptions | undefined,
  ) {
    const resolvedModelName =
      typeof modelName === 'string'
        ? modelName
        : modelName && 'modelName' in modelName
          ? modelName.modelName
          : modelName;

    return isUndefined(options)
      ? new RootRouter(modelName as RootRouterOptions, runtime)
      : new ModelRouter(resolvedModelName as string, options, runtime);
  } as CreateRouter;

  wtt.createDataRouter = function <TData>(dataName: string, options: DataRouterOptions<TData>) {
    return new DataRouter(dataName, options, runtime);
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
  wtt.RootRouter = RootRouter;
  wtt.ModelRouter = ModelRouter;
  wtt.DataRouter = DataRouter;

  return wtt as AccessRuntimeApi;
}

export function createAccessRuntime() {
  return createRuntimeApi(new AccessRuntime());
}

const wtt = createRuntimeApi(defaultRuntime);

export const acl = wtt;

export default acl;
