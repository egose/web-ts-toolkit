import mongoose from 'mongoose';
import type { NextFunction, Response } from 'express';
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
// ARRT-B12: custom-route handlers reuse the delegated public model request
// type (which carries the request-core `macl` ACL contract) instead of a
// parallel request API. `ModelRequest` is public through the `advanced`
// subpath; the import is type-only and erased at runtime.
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
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
// ARRT-B11: sound heterogeneous registry. Known literal names intersect by key;
// widened/omitted names (name falls back to `string`) never intersect. They
// contribute a truthful `string` fallback of the union of all model values plus
// `undefined` for lookup absence, so dynamic lookups cannot claim impossible
// simultaneous shapes and must handle uncertainty.
type RuntimeKnownModelRecords<TConfig extends AccessRouterRuntimeConfig> =
  RuntimeModelDefinitions<TConfig> extends infer TDefinition
    ? TDefinition extends unknown
      ? string extends RuntimeModelName<TDefinition>
        ? never
        : { [K in RuntimeModelName<TDefinition>]: RuntimeModelValue<TDefinition> }
      : never
    : never;
type RuntimeKnownModelRegistry<TConfig extends AccessRouterRuntimeConfig> = [
  RuntimeKnownModelRecords<TConfig>,
] extends [never]
  ? Record<never, never>
  : UnionToIntersection<RuntimeKnownModelRecords<TConfig>>;
type RuntimeDynamicModelValues<TConfig extends AccessRouterRuntimeConfig> =
  RuntimeModelDefinitions<TConfig> extends infer TDefinition
    ? TDefinition extends unknown
      ? string extends RuntimeModelName<TDefinition>
        ? RuntimeModelValue<TDefinition>
        : never
      : never
    : never;
type RuntimeAllModelValues<TConfig extends AccessRouterRuntimeConfig> = RuntimeModelValue<
  RuntimeModelDefinitions<TConfig>
>;
type AccessRouterRuntimeModelRegistry<TConfig extends AccessRouterRuntimeConfig> = Readonly<
  RuntimeKnownModelRegistry<TConfig> &
    ([RuntimeDynamicModelValues<TConfig>] extends [never]
      ? unknown
      : { [K in string]: RuntimeAllModelValues<TConfig> | undefined })
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

/**
 * Request observed by model custom-route handlers.
 *
 * The model router mounts the shared request-core middleware before custom
 * routes, so `macl` is set up exactly as for generated CRUD routes. Setting
 * up the core is not authorization: custom routes do not inherit any
 * generated-operation guard and must enforce their own via `req.macl`
 * (for example `isAllowed`/`getPublicService`). Arbitrary methods/paths are
 * never mapped onto CRUD permissions.
 */
export type AccessRouterRuntimeCustomRouteRequest = ModelRequest;

export type AccessRouterRuntimeCustomRouteHandler = (
  req: AccessRouterRuntimeCustomRouteRequest,
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

/**
 * Ignored deprecated dev metadata. These fields are validated for shape but
 * never consumed by the `dev` watch supervisor.
 *
 * Watch supervision is controlled only by explicit CLI flags (`--watch`,
 * `--ext`, `--delay`); bare `--watch` defaults to `.`. The supervisor never
 * loads the access-router-runtime config in the parent process, so config
 * `dev` values cannot alter supervisor scope, extensions, or delay. Prefer
 * CLI flags and remove `dev` from configs when convenient.
 */
export interface AccessRouterRuntimeDevOptions {
  /** @deprecated Ignored metadata; pass `--watch <paths>` explicitly instead. */
  watch?: ReadonlyArray<string>;
  /** @deprecated Ignored metadata; pass `--ext <extensions>` explicitly instead. */
  ext?: ReadonlyArray<string>;
  /** @deprecated Ignored metadata; pass `--delay <ms>` explicitly instead. */
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

export function defineRuntimeConfig<const TConfig extends AccessRouterRuntimeConfig>(config: TConfig): TConfig {
  return config;
}

type RuntimeLifecycleState = 'idle' | 'initializing' | 'ready' | 'stopping' | 'stopped' | 'failed';

const shutdownDuringInitMessage = 'Runtime shutdown requested before initialization completed';

class ShutdownDuringInitError extends Error {
  constructor() {
    super(shutdownDuringInitMessage);
    this.name = 'ShutdownDuringInitError';
  }
}

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
  return error instanceof ShutdownDuringInitError;
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

function isPlainSnapshotObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Snapshot policy for structured `db.options` values (ARRT-B06):
// clone plain objects/arrays recursively so later caller mutations cannot
// alter captured lifecycle options. Opaque values (functions, class
// instances such as driver helpers, Buffers/Dates/Maps/Sets, Mongoose
// connections/schemas) are kept by reference and never traversed or frozen,
// so required identity/behavior is preserved. No JSON round-trip is used.
function cloneSnapshotValue<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneSnapshotValue(entry)) as unknown as TValue;
  }
  if (isPlainSnapshotObject(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      cloned[key] = cloneSnapshotValue(entry);
    }
    return cloned as unknown as TValue;
  }
  return value;
}

// Freeze only the cloned plain structure exposed via `runtime.config`.
// Opaque references stay shared and unfrozen by design; the public view is
// therefore not a full deep freeze, only lifecycle-relevant plain structure
// is immutable.
function freezePlainSnapshotValue<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    for (const entry of value) {
      freezePlainSnapshotValue(entry);
    }
    return Object.freeze(value);
  }
  if (isPlainSnapshotObject(value)) {
    for (const entry of Object.values(value)) {
      freezePlainSnapshotValue(entry);
    }
    return Object.freeze(value);
  }
  return value;
}

function snapshotDbConfig(db: AccessRouterRuntimeDbConfig | undefined): AccessRouterRuntimeDbConfig | undefined {
  if (!db) return undefined;
  return {
    ...db,
    ...(db.options ? { options: cloneSnapshotValue(db.options) } : {}),
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
    const dbSnapshot = snapshotDbConfig(config.db);
    if (dbSnapshot?.options) {
      freezePlainSnapshotValue(dbSnapshot.options);
    }
    snapshot.db = Object.freeze(dbSnapshot ?? {});
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
  const hasSchemaBackedModels = (config.models ?? []).some((definition) => hasOwn(definition, 'schema'));
  if (hasSchemaBackedModels) {
    throw new Error(
      'createAccessRouterRuntimeApp() does not support schema-backed models because they allocate a runtime-owned connection with no disposal handle. Use createAccessRouterRuntime(config) and call init()/shutdown() to release the connection and generated models.',
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

export function createAccessRouterRuntime<const TConfig extends AccessRouterRuntimeConfig>(
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
  let rootRouter: RootRouter | undefined;
  let openApiRouter: ReturnType<AccessRuntimeApi['createOpenApiRouter']> | undefined;
  let app!: ReturnType<typeof createExpressApp>;

  try {
    database.prevalidateModels();

    for (const definition of config.models ?? []) {
      const model = database.resolveModel(definition);
      models[model.modelName] = model;
      const modelRouter = runtime.createRouter(
        model,
        definition.router as ModelRouterOptions<unknown>,
      ) as ModelRouter<unknown>;

      for (const route of definition.customRoutes ?? []) {
        // ARRT-B12: adapt the `ModelRequest`-typed custom handler to the
        // plain-Express `JsonRouter` registrar without changing behavior.
        // The model router's request-core middleware runs first, so the
        // `macl` contract the handler observes is always initialized; no
        // CRUD permission is inferred from the arbitrary method/path.
        const customHandler = route.handler;
        modelRouter.router[route.method](route.path, (req, res, next) =>
          customHandler(req as AccessRouterRuntimeCustomRouteRequest, res, next),
        );
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

    rootRouter =
      config.rootRouter === false || !config.rootRouter ? undefined : runtime.createRouter(config.rootRouter);
    openApiRouter =
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
    app = createExpressApp({
      ...safeExpressOptions,
      ...(combinedRouter ? { routers: [{ path: '/', handler: combinedRouter }] } : {}),
      finalize: userFinalize,
    });
  } catch (constructionError) {
    const cleanupErrors: unknown[] = [];
    try {
      database.rollbackConstruction();
    } catch (cleanupError) {
      if (cleanupError instanceof AggregateError) {
        cleanupErrors.push(...cleanupError.errors);
      } else {
        cleanupErrors.push(cleanupError);
      }
    }
    combineLifecycleErrors(constructionError, cleanupErrors, 'Runtime construction failed and cleanup also failed');
  }

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
  const pendingAdapterInits = new Set<Promise<void>>();

  const getLifecycleState = (): RuntimeLifecycleState => lifecycleState;

  const isTerminalShutdown = (): boolean =>
    shutdownPromise !== null || lifecycleState === 'stopping' || lifecycleState === 'stopped';

  const awaitPendingAdapterInits = async (): Promise<void> => {
    for (;;) {
      const pending = [...pendingAdapterInits];
      if (pending.length === 0) {
        return;
      }
      await Promise.allSettled(pending);
    }
  };

  const init = async (): Promise<void> => {
    if (lifecycleState === 'ready') {
      return;
    }
    if (lifecycleState === 'initializing' && initPromise) {
      return initPromise;
    }
    if (shutdownPromise) {
      throw createLifecycleStateError('stopping');
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
          throw new ShutdownDuringInitError();
        }
        configInitStarted = true;
        await lifecycleInit?.(context);
        if (getLifecycleState() === 'stopping') {
          throw new ShutdownDuringInitError();
        }
        lifecycleState = 'ready';
      } catch (error) {
        if (getLifecycleState() === 'stopping') {
          throw error;
        }

        const cleanupErrors = await collectLifecycleCleanupErrors([
          ...(configInitStarted && lifecycleShutdown ? [() => lifecycleShutdown(context)] : []),
          () => database.rollback(),
        ]);
        if (getLifecycleState() === 'stopping') {
          combineLifecycleErrors(error, cleanupErrors, 'Runtime initialization failed and rollback also failed');
        }
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
      let hasPendingInitError = false;
      let pendingInitError: unknown;
      if (pendingInit) {
        try {
          await pendingInit;
        } catch (error) {
          hasPendingInitError = true;
          pendingInitError = error;
        }
      }

      // Wait for complete adapter startup (runtime init + caller hooks) so a
      // deferred caller acquisition cannot settle after teardown. Entries for
      // a failing adapter are removed before its rollback calls shutdown, so
      // this cannot deadlock on itself; it joins other pending adapters.
      await awaitPendingAdapterInits();

      const cleanupErrors = await collectLifecycleCleanupErrors([
        ...(lifecycleShutdown ? [() => lifecycleShutdown(context)] : []),
        () => database.disconnect(),
      ]);

      if (hasPendingInitError && !isShutdownDuringInitError(pendingInitError) && cleanupErrors.length > 0) {
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
      if (hasPendingInitError && !isShutdownDuringInitError(pendingInitError)) {
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
    // Wait for deferred caller acquisition before running caller cleanup so
    // cleanup follows acquisition exactly once. Runtime shutdown also waits,
    // making the second wait a no-op join.
    await awaitPendingAdapterInits();
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
      const { init: callerInit, ...innerOptions } = options;
      const inner = createExpressServerlessHandler(app, innerOptions);
      let adapterInit: Promise<void> | null = null;
      let adapterSettled = false;

      const ensureAdapterInit = (): Promise<void> => {
        if (!adapterInit) {
          adapterSettled = false;
          adapterInit = (async () => {
            let entryResolve!: () => void;
            const entry = new Promise<void>((resolve) => {
              entryResolve = resolve;
            });
            pendingAdapterInits.add(entry);
            let entryReleased = false;
            const releaseEntry = (): void => {
              if (!entryReleased) {
                entryReleased = true;
                pendingAdapterInits.delete(entry);
                entryResolve();
              }
            };
            try {
              await init();
              try {
                await callerInit?.();
              } catch (error) {
                releaseEntry();
                await rollbackCallerInitFailure(error);
              }
              if (isTerminalShutdown()) {
                throw new ShutdownDuringInitError();
              }
            } finally {
              releaseEntry();
            }
          })().then(
            () => {
              adapterSettled = true;
            },
            (error: unknown) => {
              adapterSettled = true;
              throw error;
            },
          );
        }
        return adapterInit;
      };

      const handler = (async (event: TEvent, context: TContext): Promise<object> => {
        await ensureAdapterInit();
        if (isTerminalShutdown()) {
          throw new ShutdownDuringInitError();
        }
        return inner(event, context);
      }) as ServerlessHandler<TEvent, TContext>;
      handler.reset = () => {
        if (adapterInit && !adapterSettled) {
          return;
        }
        adapterInit = null;
        adapterSettled = false;
        inner.reset();
      };
      return handler;
    },
    startLocalServer(options: LocalServerOptions = {}) {
      const callerInit = options.init;
      const callerShutdown = options.onShutdown;
      let callerShutdownStarted = false;
      let callerShutdownPending: Promise<void> | null = null;
      const callerShutdownOnce = async (): Promise<void> => {
        if (callerShutdownPending) {
          return callerShutdownPending;
        }
        if (callerShutdownStarted) {
          return;
        }
        callerShutdownStarted = true;
        callerShutdownPending = (async () => {
          await callerShutdown?.();
        })();
        try {
          await callerShutdownPending;
        } finally {
          callerShutdownPending = null;
        }
      };

      const local = startExpressLocalServer(app, {
        ...options,
        init: async () => {
          let entryResolve!: () => void;
          const entry = new Promise<void>((resolve) => {
            entryResolve = resolve;
          });
          pendingAdapterInits.add(entry);
          let entryReleased = false;
          const releaseEntry = (): void => {
            if (!entryReleased) {
              entryReleased = true;
              pendingAdapterInits.delete(entry);
              entryResolve();
            }
          };
          try {
            await init();
            try {
              await callerInit?.();
            } catch (error) {
              releaseEntry();
              await rollbackCallerInitFailure(error, callerShutdownOnce);
            }
            if (isTerminalShutdown()) {
              throw new ShutdownDuringInitError();
            }
          } finally {
            releaseEntry();
          }
        },
        onShutdown: async () => {
          await runComposedShutdown(callerShutdownOnce);
        },
      });

      const wrappedReady = local.ready.catch(async (listenError: unknown) => {
        try {
          await runComposedShutdown(callerShutdownOnce);
        } catch (rollbackError) {
          const secondary = rollbackError instanceof AggregateError ? rollbackError.errors : [rollbackError];
          combineLifecycleErrors(listenError, secondary, 'Runtime local readiness failed and rollback also failed');
        }
        throw listenError;
      });
      wrappedReady.catch(() => {});

      const wrappedShutdown = async (): Promise<void> => {
        let localError: unknown;
        let hasLocalError = false;
        try {
          await local.shutdown();
        } catch (error) {
          hasLocalError = true;
          localError = error;
        }
        try {
          await runComposedShutdown(callerShutdownOnce);
        } catch (composedError) {
          if (hasLocalError) {
            throw localError;
          }
          throw composedError;
        }
        if (hasLocalError) {
          throw localError;
        }
      };

      return {
        server: local.server,
        ready: wrappedReady,
        shutdown: wrappedShutdown,
      };
    },
  };
}

export function createAccessRouterRuntimeApp<const TConfig extends AccessRouterRuntimeAppConfig>(config: TConfig) {
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
