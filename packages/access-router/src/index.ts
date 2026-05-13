import mongoose from 'mongoose';
import type {} from './filter-type-tests';
import { isPlainObject, isString, isUndefined } from '@web-ts-toolkit/utils';
import middleware, { guard } from './middleware';
import { RootRouter, ModelRouter, DataRouter } from './routers';
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
export {
  RootRouter,
  ModelRouter,
  DataRouter,
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
  createRouter: CreateRouter;
  createDataRouter: CreateDataRouter;
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

const wtt = middleware as typeof middleware & Wtt;

wtt.createRouter = function (
  modelName: string | mongoose.Model<unknown> | RootRouterOptions,
  options: ModelRouterOptions | undefined,
) {
  const resolvedModelName =
    typeof modelName === 'string' ? modelName : modelName && 'modelName' in modelName ? modelName.modelName : modelName;

  return isUndefined(options)
    ? new RootRouter(modelName as RootRouterOptions)
    : new ModelRouter(resolvedModelName as string, options);
} as CreateRouter;

wtt.createDataRouter = function <TData>(dataName: string, options: DataRouterOptions<TData>) {
  return new DataRouter(dataName, options);
};

wtt.set = function <K extends keyof GlobalOptions>(keyOrOptions: K | GlobalOptions, value?: unknown) {
  if (arguments.length === 2 && isString(keyOrOptions)) {
    return setGlobalOption(keyOrOptions as K, value as GlobalOptions[K]);
  }

  if (arguments.length === 1 && isPlainObject(keyOrOptions)) {
    return setGlobalOptions(keyOrOptions as GlobalOptions);
  }
};

wtt.setGlobalOptions = setGlobalOptions;
wtt.setGlobalOption = setGlobalOption;
wtt.getGlobalOptions = getGlobalOptions;
wtt.getGlobalOption = getGlobalOption;
wtt.setModelOptions = setModelOptions;
wtt.setModelOption = setModelOption;
wtt.getModelOptions = getModelOptions;
wtt.getModelOption = getModelOption;
wtt.setDefaultModelOptions = setDefaultModelOptions;
wtt.setDefaultModelOption = setDefaultModelOption;
wtt.getDefaultModelOptions = getDefaultModelOptions;
wtt.getDefaultModelOption = getDefaultModelOption;
wtt.RootRouter = RootRouter;
wtt.ModelRouter = ModelRouter;
wtt.DataRouter = DataRouter;

export const acl = wtt;

export default acl;
