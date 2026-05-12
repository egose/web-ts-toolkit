import isString from 'lodash/isString';
import isObject from 'lodash/isObject';
import isPlainObject from 'lodash/isPlainObject';
import isUndefined from 'lodash/isUndefined';
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
import { GlobalOptions, RootRouterOptions, ModelRouterOptions, DataRouterOptions } from './interfaces';
export {
  RootRouter,
  ModelRouter,
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
export * from './permission';
export * from './plugins';
export * from './interfaces';
export * from './symbols';
export * from './enums';
export * from './routers/validation';

type CreateRouter = {
  (modelName: string, options: ModelRouterOptions): ModelRouter;
  (options: RootRouterOptions): RootRouter;
};

type CreateDataRouter = {
  (dataName: string, options: DataRouterOptions): DataRouter;
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

wtt.createRouter = function (modelName: string | RootRouterOptions, options: ModelRouterOptions | undefined) {
  return isUndefined(options)
    ? new RootRouter(modelName as RootRouterOptions)
    : new ModelRouter(modelName as string, options);
} as CreateRouter;

wtt.createDataRouter = function (dataName: string, options: DataRouterOptions) {
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

export default wtt;
