import 'reflect-metadata';
import type { RootRouterOptions, ModelRouterOptions } from '@web-ts-toolkit/access-router';
import type { DefaultModelRouterOptions } from '@web-ts-toolkit/access-router/interfaces/root';
import { ModuleMetadata } from '../interfaces';
import {
  ROOT_ROUTER_WATERMARK,
  ROUTER_WATERMARK,
  DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK,
  MODEL_ROUTER_OPTIONS_WATERMARK,
  ROUTER_MODEL,
  ROUTER_OPTIONS,
} from '../constants';

export function Module(metadata: ModuleMetadata): ClassDecorator {
  return (target: object) => {
    for (const property in metadata) {
      if (Object.prototype.hasOwnProperty.call(metadata, property)) {
        Reflect.defineMetadata(property, (metadata as any)[property], target);
      }
    }
  };
}

function createRootRouter(options: RootRouterOptions): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(ROOT_ROUTER_WATERMARK, true, target);
    Reflect.defineMetadata(ROUTER_OPTIONS, options || {}, target);
  };
}

function createModelRouter(modelName: string, options?: ModelRouterOptions): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(ROUTER_WATERMARK, true, target);
    Reflect.defineMetadata(ROUTER_MODEL, modelName, target);
    Reflect.defineMetadata(ROUTER_OPTIONS, options || {}, target);
  };
}

export const Router = function Router(
  modelNameOrOptions: string | RootRouterOptions,
  options?: ModelRouterOptions,
): ClassDecorator {
  if (typeof modelNameOrOptions === 'string') {
    return createModelRouter(modelNameOrOptions, options);
  }

  if (modelNameOrOptions !== null && typeof modelNameOrOptions === 'object') {
    return createRootRouter(modelNameOrOptions as RootRouterOptions);
  }

  throw new TypeError('Router() expects a model name string or a RootRouterOptions object');
} as {
  (modelName: string, options?: ModelRouterOptions): ClassDecorator;
  (options: RootRouterOptions): ClassDecorator;
};

function createDefaultModelRouterOptions(options: DefaultModelRouterOptions): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK, true, target);
    Reflect.defineMetadata(ROUTER_OPTIONS, options || {}, target);
  };
}

function createModelRouterOptions(modelName: string, options?: ModelRouterOptions): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(MODEL_ROUTER_OPTIONS_WATERMARK, true, target);
    Reflect.defineMetadata(ROUTER_MODEL, modelName, target);
    Reflect.defineMetadata(ROUTER_OPTIONS, options || {}, target);
  };
}

export const RouterOptions = function RouterOptions(
  modelNameOrOptions: string | DefaultModelRouterOptions,
  options?: ModelRouterOptions,
): ClassDecorator {
  if (typeof modelNameOrOptions === 'string') {
    return createModelRouterOptions(modelNameOrOptions, options);
  }

  if (modelNameOrOptions !== null && typeof modelNameOrOptions === 'object') {
    return createDefaultModelRouterOptions(modelNameOrOptions as DefaultModelRouterOptions);
  }

  throw new TypeError('RouterOptions() expects a model name string or a DefaultModelRouterOptions object');
} as {
  (modelName: string, options?: ModelRouterOptions): ClassDecorator;
  (options: DefaultModelRouterOptions): ClassDecorator;
};
