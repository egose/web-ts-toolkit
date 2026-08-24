import mongoose from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import {
  combineRoutes,
  createAccessRuntime,
  type AccessRuntimeApi,
  type CombinedRouteInput,
  type DataRouter,
  type DataRouterOptions,
  type GlobalOptions,
  type ModelRouter,
  type ModelRouterOptions,
  type OpenApiRouterOptions,
  type RootRouter,
  type RootRouterOptions,
} from '@web-ts-toolkit/access-router';
import {
  createExpressApp,
  createServerlessHandler as createExpressServerlessHandler,
  startLocalServer as startExpressLocalServer,
  type ExpressAppOptions,
  type LocalServer,
  type LocalServerOptions,
  type ServerlessHandler,
  type ServerlessHandlerOptions,
} from '@web-ts-toolkit/express-runtime';
import {
  loadAccessRouterRuntimeConfigSync,
  validateAccessRouterRuntimeConfig,
  type AccessRouterRuntimeConfigLoadOptions,
} from './config-loader';
import { createAccessRouterRuntimeDatabase } from './database';

type RuntimeModel = mongoose.Model<unknown>;
type AnyValue = ReturnType<typeof JSON.parse>;
type AnyRuntimeModelDefinition = AccessRouterRuntimeModelDefinition<AnyValue>;
type AnyRuntimeDataDefinition = AccessRouterRuntimeDataDefinition<AnyValue>;
type RuntimeModelDefinitions<TConfig extends AccessRouterRuntimeConfig> = TConfig extends {
  models: ReadonlyArray<infer TDefinition>;
}
  ? TDefinition
  : AnyRuntimeModelDefinition;
type RuntimeDataDefinitions<TConfig extends AccessRouterRuntimeConfig> = TConfig extends {
  data: ReadonlyArray<infer TDefinition>;
}
  ? TDefinition
  : AnyRuntimeDataDefinition;
type UnionToIntersection<TUnion> = (TUnion extends unknown ? (value: TUnion) => void : never) extends (
  value: infer TIntersection,
) => void
  ? TIntersection
  : never;
type RuntimeModelName<TDefinition> = TDefinition extends { name: infer TName extends string } ? TName : string;
type RuntimeModelValue<TDefinition> =
  TDefinition extends AccessRouterRuntimeModelDefinition<infer TModel> ? mongoose.Model<TModel> : RuntimeModel;
type RuntimeDataValue<TDefinition> =
  TDefinition extends AccessRouterRuntimeDataDefinition<infer TData> ? TData : unknown;
type AccessRouterRuntimeModelRegistry<TConfig extends AccessRouterRuntimeConfig> = Readonly<
  UnionToIntersection<
    RuntimeModelDefinitions<TConfig> extends infer TDefinition
      ? TDefinition extends unknown
        ? { [K in RuntimeModelName<TDefinition>]: RuntimeModelValue<TDefinition> }
        : never
      : never
  >
>;
type AccessRouterRuntimeModelRouters<TConfig extends AccessRouterRuntimeConfig> = ReadonlyArray<
  ModelRouter<
    RuntimeModelValue<RuntimeModelDefinitions<TConfig>> extends mongoose.Model<infer TModel> ? TModel : unknown
  >
>;
type AccessRouterRuntimeDataRouters<TConfig extends AccessRouterRuntimeConfig> = ReadonlyArray<
  DataRouter<RuntimeDataValue<RuntimeDataDefinitions<TConfig>>>
>;
type DeepReadonly<TValue> = TValue extends (...args: AnyValue[]) => AnyValue
  ? TValue
  : TValue extends ReadonlyArray<infer TElement>
    ? ReadonlyArray<DeepReadonly<TElement>>
    : TValue extends object
      ? { readonly [K in keyof TValue]: DeepReadonly<TValue[K]> }
      : TValue;

export type AccessRouterRuntimeCustomRouteMethod =
  | 'all'
  | 'delete'
  | 'get'
  | 'head'
  | 'options'
  | 'patch'
  | 'post'
  | 'put';

export type AccessRouterRuntimeCustomRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown | Promise<unknown>;

export interface AccessRouterRuntimeCustomRoute {
  method: AccessRouterRuntimeCustomRouteMethod;
  path: string;
  handler: AccessRouterRuntimeCustomRouteHandler;
}

export interface AccessRouterRuntimeDbConfig {
  url?: string;
  options?: mongoose.ConnectOptions;
  disconnectOnShutdown?: boolean;
  connection?: mongoose.Connection;
}

interface AccessRouterRuntimeModelDefinitionBase<TModel = unknown> {
  name?: string;
  router: ModelRouterOptions<TModel>;
  customRoutes?: ReadonlyArray<AccessRouterRuntimeCustomRoute>;
}

export interface AccessRouterRuntimeExistingModelDefinition<
  TModel = unknown,
> extends AccessRouterRuntimeModelDefinitionBase<TModel> {
  model: mongoose.Model<TModel>;
  schema?: never;
  collection?: never;
}

export interface AccessRouterRuntimeSchemaModelDefinition<
  TModel = unknown,
> extends AccessRouterRuntimeModelDefinitionBase<TModel> {
  name: string;
  schema: mongoose.Schema<TModel>;
  model?: never;
  collection?: string;
}

export type AccessRouterRuntimeModelDefinition<TModel = unknown> =
  | AccessRouterRuntimeExistingModelDefinition<TModel>
  | AccessRouterRuntimeSchemaModelDefinition<TModel>;

export interface AccessRouterRuntimeDataDefinition<TData = unknown> {
  name: string;
  router: DataRouterOptions<TData>;
}

export interface AccessRouterRuntimeContext<TConfig extends AccessRouterRuntimeConfig = AccessRouterRuntimeConfig> {
  config: DeepReadonly<TConfig>;
  runtime: AccessRuntimeApi;
  app: ReturnType<typeof createExpressApp>;
  models: AccessRouterRuntimeModelRegistry<TConfig>;
  modelRouters: AccessRouterRuntimeModelRouters<TConfig>;
  dataRouters: AccessRouterRuntimeDataRouters<TConfig>;
  rootRouter?: RootRouter;
  openApiRouter?: ReturnType<AccessRuntimeApi['createOpenApiRouter']>;
}

export interface AccessRouterRuntimeDevOptions {
  /** Default watch paths for `wtt-access-router-runtime dev`. */
  watch?: ReadonlyArray<string>;
  /** Default watch extensions for `wtt-access-router-runtime dev`. */
  ext?: ReadonlyArray<string>;
  /** Default watch debounce delay in ms for `wtt-access-router-runtime dev`. */
  delay?: number;
}

export interface AccessRouterRuntimeConfig {
  db?: AccessRouterRuntimeDbConfig;
  globalOptions?: GlobalOptions;
  defaultModelOptions?: Parameters<AccessRuntimeApi['setDefaultModelOptions']>[0];
  rootRouter?: RootRouterOptions | false;
  models?: ReadonlyArray<AnyRuntimeModelDefinition>;
  data?: ReadonlyArray<AnyRuntimeDataDefinition>;
  openApi?: OpenApiRouterOptions | false;
  extraRoutes?: ReadonlyArray<CombinedRouteInput>;
  dev?: AccessRouterRuntimeDevOptions;
  express?: Omit<ExpressAppOptions, 'router' | 'routers' | 'finalize'> & {
    finalize?: ExpressAppOptions['finalize'];
  };
  init?: (context: AccessRouterRuntimeContext) => Promise<void> | void;
  shutdown?: (context: AccessRouterRuntimeContext) => Promise<void> | void;
}

export type AccessRouterRuntimeAppConfig = Omit<AccessRouterRuntimeConfig, 'db' | 'init' | 'shutdown'> & {
  db?: never;
  init?: never;
  shutdown?: never;
};

export interface AccessRouterRuntimeInstance<
  TConfig extends AccessRouterRuntimeConfig = AccessRouterRuntimeConfig,
> extends AccessRouterRuntimeContext<TConfig> {
  init: () => Promise<void>;
  shutdown: () => Promise<void>;
  createServerlessHandler: <
    TEvent extends object = Record<string, unknown>,
    TContext extends object = Record<string, unknown>,
  >(
    options?: ServerlessHandlerOptions<TEvent, TContext>,
  ) => ServerlessHandler<TEvent, TContext>;
  startLocalServer: (options?: LocalServerOptions) => LocalServer;
}

export function defineRuntimeConfig<TConfig extends AccessRouterRuntimeConfig>(config: TConfig): TConfig {
  return config;
}

type RuntimeLifecycleState = 'idle' | 'initializing' | 'ready' | 'stopping' | 'stopped' | 'failed';

const shutdownDuringInitMessage = 'Runtime shutdown requested before initialization completed';

function createLifecycleStateError(state: RuntimeLifecycleState): Error {
  if (state === 'stopping') {
    return new Error('Runtime lifecycle is stopping; initialization cannot start');
  }
  if (state === 'stopped') {
    return new Error('Runtime lifecycle has stopped; initialization cannot start');
  }
  return new Error(`Runtime lifecycle is ${state}; initialization cannot start`);
}

function isShutdownDuringInitError(error: unknown): boolean {
  return error instanceof Error && error.message === shutdownDuringInitMessage;
}

function combineLifecycleErrors(primary: unknown, secondaryErrors: unknown[], message: string): never {
  if (secondaryErrors.length === 0) {
    throw primary;
  }
  throw new AggregateError([primary, ...secondaryErrors], message);
}

function throwCleanupErrors(errors: unknown[], message: string): void {
  if (errors.length === 0) return;
  if (errors.length === 1) {
    throw errors[0];
  }
  throw new AggregateError(errors, message);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function snapshotDbConfig(db: AccessRouterRuntimeDbConfig | undefined): AccessRouterRuntimeDbConfig | undefined {
  if (!db) return undefined;
  return {
    ...db,
    ...(db.options ? { options: { ...db.options } } : {}),
  };
}

function freezeReadonlyArraySnapshot<TValue>(
  value: ReadonlyArray<TValue> | undefined,
): ReadonlyArray<TValue> | undefined {
  return value ? Object.freeze([...value]) : undefined;
}

function createContextConfigSnapshot<TConfig extends AccessRouterRuntimeConfig>(
  config: TConfig,
): DeepReadonly<TConfig> {
  const snapshot = { ...config } as Record<string, unknown>;

  if (config.db) {
    snapshot.db = Object.freeze(snapshotDbConfig(config.db) ?? {});
  }
  if (config.models) {
    snapshot.models = freezeReadonlyArraySnapshot(config.models);
  }
  if (config.data) {
    snapshot.data = freezeReadonlyArraySnapshot(config.data);
  }
  if (config.extraRoutes) {
    snapshot.extraRoutes = freezeReadonlyArraySnapshot(config.extraRoutes);
  }
  if (config.dev) {
    snapshot.dev = Object.freeze({
      ...config.dev,
      ...(config.dev.watch ? { watch: freezeReadonlyArraySnapshot(config.dev.watch) } : {}),
      ...(config.dev.ext ? { ext: freezeReadonlyArraySnapshot(config.dev.ext) } : {}),
    });
  }
  if (config.express) {
    snapshot.express = Object.freeze({ ...config.express });
  }

  return Object.freeze(snapshot) as DeepReadonly<TConfig>;
}

function assertAppOnlyConfigHasNoLifecycleRequirements(config: AccessRouterRuntimeConfig): void {
  if (hasOwn(config, 'db') || config.init || config.shutdown) {
    throw new Error(
      'createAccessRouterRuntimeApp() only accepts lifecycle-free configs. Use createAccessRouterRuntime(config).app when the config defines db, init, or shutdown.',
    );
  }
}

async function collectLifecycleCleanupErrors(steps: ReadonlyArray<() => Promise<void> | void>): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

export function createAccessRouterRuntime<TConfig extends AccessRouterRuntimeConfig>(
  config: TConfig,
): AccessRouterRuntimeInstance<TConfig> {
  validateAccessRouterRuntimeConfig(config);

  const runtime = createAccessRuntime();
  const lifecycleDb = snapshotDbConfig(config.db);
  const lifecycleInit = config.init;
  const lifecycleShutdown = config.shutdown;
  const database = createAccessRouterRuntimeDatabase(lifecycleDb, config.models ?? []);

  if (config.globalOptions) {
    runtime.setGlobalOptions(config.globalOptions);
  }
  if (config.defaultModelOptions) {
    runtime.setDefaultModelOptions(config.defaultModelOptions);
  }

  const models: Record<string, RuntimeModel> = {};
  const modelRouters: ModelRouter<unknown>[] = [];
  const dataRouters: DataRouter<unknown>[] = [];

  for (const definition of config.models ?? []) {
    const model = database.resolveModel(definition);
    models[model.modelName] = model;
    const modelRouter = runtime.createRouter(
      model,
      definition.router as ModelRouterOptions<unknown>,
    ) as ModelRouter<unknown>;

    for (const route of definition.customRoutes ?? []) {
      modelRouter.router[route.method](route.path, route.handler);
    }

    modelRouters.push(modelRouter);
  }

  for (const definition of config.data ?? []) {
    dataRouters.push(
      runtime.createDataRouter(definition.name, {
        ...definition.router,
        dataName: definition.router.dataName ?? definition.name,
      }) as DataRouter<unknown>,
    );
  }

  const rootRouter =
    config.rootRouter === false || !config.rootRouter ? undefined : runtime.createRouter(config.rootRouter);
  const openApiRouter =
    config.openApi === false || !config.openApi ? undefined : runtime.createOpenApiRouter(config.openApi);
  const mountedRoutes: CombinedRouteInput[] = [
    ...modelRouters,
    ...dataRouters,
    ...(rootRouter ? [rootRouter] : []),
    ...(config.extraRoutes ?? []),
    ...(openApiRouter ? [openApiRouter] : []),
  ];
  const combinedRouter = mountedRoutes.length > 0 ? combineRoutes(...mountedRoutes) : undefined;

  const safeExpressOptions = { ...(config.express ?? {}) } as ExpressAppOptions;
  const userFinalize = safeExpressOptions.finalize;
  delete safeExpressOptions.finalize;
  delete safeExpressOptions.router;
  delete safeExpressOptions.routers;
  const app = createExpressApp({
    ...safeExpressOptions,
    ...(combinedRouter ? { routers: [{ path: '/', handler: combinedRouter }] } : {}),
    finalize: userFinalize,
  });

  const context: AccessRouterRuntimeContext<TConfig> = {
    config: createContextConfigSnapshot(config),
    runtime,
    app,
    models: Object.freeze({ ...models }) as AccessRouterRuntimeModelRegistry<TConfig>,
    modelRouters: Object.freeze([...modelRouters]) as AccessRouterRuntimeModelRouters<TConfig>,
    dataRouters: Object.freeze([...dataRouters]) as AccessRouterRuntimeDataRouters<TConfig>,
    rootRouter,
    openApiRouter,
  };

  let lifecycleState: RuntimeLifecycleState = 'idle';
  let initPromise: Promise<void> | null = null;
  let shutdownPromise: Promise<void> | null = null;

  const getLifecycleState = (): RuntimeLifecycleState => lifecycleState;

  const init = async (): Promise<void> => {
    if (lifecycleState === 'ready') {
      return;
    }
    if (lifecycleState === 'initializing' && initPromise) {
      return initPromise;
    }
    if (lifecycleState === 'stopping' || lifecycleState === 'stopped') {
      throw createLifecycleStateError(lifecycleState);
    }

    lifecycleState = 'initializing';
    let configInitStarted = false;
    initPromise = (async () => {
      try {
        await database.connect();
        if (getLifecycleState() === 'stopping') {
          throw new Error(shutdownDuringInitMessage);
        }
        configInitStarted = true;
        await lifecycleInit?.(context);
        if (getLifecycleState() === 'stopping') {
          throw new Error(shutdownDuringInitMessage);
        }
        lifecycleState = 'ready';
      } catch (error) {
        if (getLifecycleState() === 'stopping') {
          throw error;
        }

        const cleanupErrors = await collectLifecycleCleanupErrors([
          ...(configInitStarted && lifecycleShutdown ? [() => lifecycleShutdown(context)] : []),
          () => database.disconnect(),
        ]);
        lifecycleState = 'failed';
        combineLifecycleErrors(error, cleanupErrors, 'Runtime initialization failed and rollback also failed');
      } finally {
        initPromise = null;
      }
    })();

    return initPromise;
  };

  const shutdown = async (): Promise<void> => {
    if (lifecycleState === 'stopped') {
      return;
    }
    if (shutdownPromise) {
      return shutdownPromise;
    }

    const pendingInit = lifecycleState === 'initializing' ? initPromise : null;
    lifecycleState = 'stopping';
    shutdownPromise = (async () => {
      let pendingInitError: unknown;
      if (pendingInit) {
        try {
          await pendingInit;
        } catch (error) {
          pendingInitError = error;
        }
      }

      const cleanupErrors = await collectLifecycleCleanupErrors([
        ...(lifecycleShutdown ? [() => lifecycleShutdown(context)] : []),
        () => database.disconnect(),
      ]);

      if (pendingInitError && !isShutdownDuringInitError(pendingInitError) && cleanupErrors.length > 0) {
        lifecycleState = 'failed';
        combineLifecycleErrors(
          pendingInitError,
          cleanupErrors,
          'Runtime initialization failed and rollback also failed',
        );
      }

      if (cleanupErrors.length > 0) {
        lifecycleState = 'failed';
        throwCleanupErrors(cleanupErrors, 'Runtime shutdown failed');
      }

      lifecycleState = 'stopped';
      if (pendingInitError && !isShutdownDuringInitError(pendingInitError)) {
        throw pendingInitError;
      }
    })().finally(() => {
      shutdownPromise = null;
    });

    return shutdownPromise;
  };

  const rollbackCallerInitFailure = async (
    primaryError: unknown,
    callerShutdown?: () => Promise<void> | void,
  ): Promise<never> => {
    const cleanupErrors = await collectLifecycleCleanupErrors([...(callerShutdown ? [callerShutdown] : []), shutdown]);
    combineLifecycleErrors(
      primaryError,
      cleanupErrors,
      'Runtime caller initialization failed and rollback also failed',
    );
  };

  const runComposedShutdown = async (callerShutdown?: () => Promise<void> | void): Promise<void> => {
    const cleanupErrors = await collectLifecycleCleanupErrors([...(callerShutdown ? [callerShutdown] : []), shutdown]);
    throwCleanupErrors(cleanupErrors, 'Runtime shutdown failed');
  };

  return {
    ...context,
    init,
    shutdown,
    createServerlessHandler<
      TEvent extends object = Record<string, unknown>,
      TContext extends object = Record<string, unknown>,
    >(options: ServerlessHandlerOptions<TEvent, TContext> = {}) {
      return createExpressServerlessHandler(app, {
        ...options,
        init: async () => {
          await init();
          try {
            await options.init?.();
          } catch (error) {
            await rollbackCallerInitFailure(error);
          }
        },
      });
    },
    startLocalServer(options: LocalServerOptions = {}) {
      return startExpressLocalServer(app, {
        ...options,
        init: async () => {
          await init();
          try {
            await options.init?.();
          } catch (error) {
            await rollbackCallerInitFailure(error, options.onShutdown);
          }
        },
        onShutdown: async () => {
          await runComposedShutdown(options.onShutdown);
        },
      });
    },
  };
}

export function createAccessRouterRuntimeApp<TConfig extends AccessRouterRuntimeAppConfig>(config: TConfig) {
  assertAppOnlyConfigHasNoLifecycleRequirements(config);
  return createAccessRouterRuntime(config).app;
}

export function createAccessRouterRuntimeServerlessHandler<
  TEvent extends object = Record<string, unknown>,
  TContext extends object = Record<string, unknown>,
>(
  config: AccessRouterRuntimeConfig,
  options?: ServerlessHandlerOptions<TEvent, TContext>,
): ServerlessHandler<TEvent, TContext> {
  return createAccessRouterRuntime(config).createServerlessHandler(options);
}

export function loadAccessRouterRuntime(
  configPath: string,
  options: AccessRouterRuntimeConfigLoadOptions = {},
): AccessRouterRuntimeInstance {
  return createAccessRouterRuntime(loadAccessRouterRuntimeConfigSync(configPath, options));
}

export {
  loadAccessRouterRuntimeConfigSync,
  normalizeAccessRouterRuntimeConfigExport,
  validateAccessRouterRuntimeConfig,
} from './config-loader';

export type {
  AccessRouterRuntimeConfigLoadOptions,
  CombinedRouteInput,
  DataRouterOptions,
  GlobalOptions,
  ModelRouterOptions,
  OpenApiRouterOptions,
  RootRouterOptions,
  LocalServerOptions,
  ServerlessHandlerOptions,
};
