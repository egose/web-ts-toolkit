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

/**
 * Declares the application module that `EgoseFactoryStatic.create().bootstrap()` (or legacy `EgoseFactory.bootstrap()`) will bootstrap.
 *
 * Valid class role: top-level module class passed as the first argument to `bootstrap`. Composition is validated before any constructor runs:
 * `routers` entries must be classes decorated with `@Router` (exactly one root or model role, own watermark), `routerOptions` with `@RouterOptions`
 * (exactly one default or model role, own watermark); inherited, dual-role, missing or misplaced entries fail fast.
 * No operation suffix. Metadata is read before construction; `this` is not used.
 *
 * @param metadata - module composition with `routers`, `routerOptions`, and global `options` (`basePath`, `handleErrors`, `GlobalOptions`).
 */
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

/**
 * Declares a router.
 *
 * Valid class roles:
 * - Model router: `@Router('ModelName')` or `@Router(Model)` — valid only on classes listed in `@Module({ routers: [...] })` as model routers; registers model options/route via `runtime.setModelOptions` / `createRouter(model)`.
 * - Root router: `@Router({ basePath, ... })` — valid only as a root router entry; registers via `runtime.createRouter(options)` and mounts as an Express root batch router.
 * Must be listed in `@Module({ routers: [...] })`. Duplicate effective model per module is rejected; distinct root and distinct model routers are allowed.
 * This decorator only writes metadata; `EgoseFactoryStatic.create().bootstrap()` performs registration. Decorated hook methods run with `this` bound to the class instance — use `@Request()` for request data.
 *
 * @param modelNameOrOptions - model name string, Mongoose model instance, or `RootRouterOptions` object for a root router.
 * @param options - optional `ModelRouterOptions` when the first argument is a model.
 */
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

/**
 * Declares model router options.
 *
 * Valid class roles:
 * - Default model options: `@RouterOptions({ operationAccess, ... })` — valid only on classes listed in `@Module({ routerOptions: [...] })` as default providers (at most one per module).
 * - Per-model options: `@RouterOptions('ModelName')` or `@RouterOptions(Model)` — valid only as model-specific options providers (at most one per effective model per module).
 * Applied before route construction in precedence: default → model-specific `@RouterOptions` → `@Router` options → `@Option` / decorated hooks on the same class. May carry `@ModelOption`/`@DefaultModelOption`/`@Option` properties and model hooks (`@RouteGuard`, `@Identifier`, etc.) per `HOOK_DEFINITIONS.defaultModelOptions`.
 * This decorator only writes metadata; bootstrap performs `setDefaultModelOptions` / `setModelOptions`. `this` on hook methods is the class instance.
 *
 * @param modelNameOrOptions - model name/Mongoose model for per-model options, or `DefaultModelRouterOptions` for shared defaults.
 * @param options - optional `ModelRouterOptions` when the first argument is a model.
 */
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
