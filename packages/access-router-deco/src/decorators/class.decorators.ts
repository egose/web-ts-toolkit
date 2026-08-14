import 'reflect-metadata';
import type { RootRouterOptions, ModelRouterOptions } from '@web-ts-toolkit/access-router';
import type { DefaultModelRouterOptions } from '@web-ts-toolkit/access-router/advanced';
import { ModuleMetadata, type RouterModel } from '../interfaces';
import {
  MODULE_OPTIONS,
  MODULE_ROUTER_OPTIONS,
  MODULE_ROUTERS,
  ROOT_ROUTER_WATERMARK,
  ROUTER_WATERMARK,
  DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK,
  MODEL_ROUTER_OPTIONS_WATERMARK,
  ROUTER_MODEL,
  ROUTER_OPTIONS,
} from '../constants';

export function Module(metadata: ModuleMetadata): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(MODULE_ROUTERS, metadata.routers, target);
    Reflect.defineMetadata(MODULE_ROUTER_OPTIONS, metadata.routerOptions, target);
    Reflect.defineMetadata(MODULE_OPTIONS, metadata.options, target);
  };
}

function createRootRouter(options: RootRouterOptions): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(ROOT_ROUTER_WATERMARK, true, target);
    Reflect.defineMetadata(ROUTER_OPTIONS, options || {}, target);
  };
}

const isMongooseModel = (value: unknown): value is Exclude<RouterModel, string> =>
  typeof value === 'function' && value !== null && 'modelName' in value && 'schema' in value;

function assertValidRouterModel(model: RouterModel, decoratorName: string) {
  if (typeof model === 'string') {
    if (model.length === 0) throw new TypeError(`${decoratorName}() expects a non-empty model name string`);
    return;
  }

  if (isMongooseModel(model) && typeof model.modelName === 'string' && model.modelName.length > 0) return;

  throw new TypeError(`${decoratorName}() expects a model name string or a Mongoose model instance`);
}

function createModelRouter(model: RouterModel, options?: ModelRouterOptions): ClassDecorator {
  assertValidRouterModel(model, 'Router');
  return (target: object) => {
    Reflect.defineMetadata(ROUTER_WATERMARK, true, target);
    Reflect.defineMetadata(ROUTER_MODEL, model, target);
    Reflect.defineMetadata(ROUTER_OPTIONS, options || {}, target);
  };
}

export const Router = function Router(
  modelNameOrOptions: RouterModel | RootRouterOptions,
  options?: ModelRouterOptions,
): ClassDecorator {
  if (typeof modelNameOrOptions === 'string' || isMongooseModel(modelNameOrOptions)) {
    return createModelRouter(modelNameOrOptions, options);
  }

  if (modelNameOrOptions !== null && typeof modelNameOrOptions === 'object' && 'modelName' in modelNameOrOptions) {
    throw new TypeError('Router() expects a valid Mongoose model instance when modelName is provided');
  }

  if (modelNameOrOptions !== null && typeof modelNameOrOptions === 'object') {
    return createRootRouter(modelNameOrOptions as RootRouterOptions);
  }

  throw new TypeError('Router() expects a model name string, a Mongoose model instance, or a RootRouterOptions object');
} as {
  (modelName: string, options?: ModelRouterOptions): ClassDecorator;
  <TModel>(model: import('mongoose').Model<TModel>, options?: ModelRouterOptions<TModel>): ClassDecorator;
  (options: RootRouterOptions): ClassDecorator;
};

function createDefaultModelRouterOptions(options: DefaultModelRouterOptions): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK, true, target);
    Reflect.defineMetadata(ROUTER_OPTIONS, options || {}, target);
  };
}

function createModelRouterOptions(model: RouterModel, options?: ModelRouterOptions): ClassDecorator {
  assertValidRouterModel(model, 'RouterOptions');
  return (target: object) => {
    Reflect.defineMetadata(MODEL_ROUTER_OPTIONS_WATERMARK, true, target);
    Reflect.defineMetadata(ROUTER_MODEL, model, target);
    Reflect.defineMetadata(ROUTER_OPTIONS, options || {}, target);
  };
}

export const RouterOptions = function RouterOptions(
  modelNameOrOptions: RouterModel | DefaultModelRouterOptions,
  options?: ModelRouterOptions,
): ClassDecorator {
  if (typeof modelNameOrOptions === 'string' || isMongooseModel(modelNameOrOptions)) {
    return createModelRouterOptions(modelNameOrOptions, options);
  }

  if (modelNameOrOptions !== null && typeof modelNameOrOptions === 'object' && 'modelName' in modelNameOrOptions) {
    throw new TypeError('RouterOptions() expects a valid Mongoose model instance when modelName is provided');
  }

  if (modelNameOrOptions !== null && typeof modelNameOrOptions === 'object') {
    return createDefaultModelRouterOptions(modelNameOrOptions as DefaultModelRouterOptions);
  }

  throw new TypeError(
    'RouterOptions() expects a model name string, a Mongoose model instance, or a DefaultModelRouterOptions object',
  );
} as {
  (modelName: string, options?: ModelRouterOptions): ClassDecorator;
  <TModel>(model: import('mongoose').Model<TModel>, options?: ModelRouterOptions<TModel>): ClassDecorator;
  (options: DefaultModelRouterOptions): ClassDecorator;
};
