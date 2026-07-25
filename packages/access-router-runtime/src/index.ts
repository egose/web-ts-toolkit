import mongoose from 'mongoose';
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
import { loadAccessRouterRuntimeConfigSync } from './config-loader';

type RuntimeModel = mongoose.Model<unknown>;

export interface AccessRouterRuntimeDbConfig {
  url?: string;
  options?: mongoose.ConnectOptions;
  disconnectOnShutdown?: boolean;
}

export interface AccessRouterRuntimeModelDefinition<TModel = unknown> {
  name?: string;
  model?: mongoose.Model<TModel>;
  schema?: mongoose.Schema<TModel>;
  collection?: string;
  router: ModelRouterOptions<TModel>;
}

export interface AccessRouterRuntimeDataDefinition<TData = unknown> {
  name: string;
  router: DataRouterOptions<TData>;
}

export interface AccessRouterRuntimeContext {
  config: AccessRouterRuntimeConfig;
  runtime: AccessRuntimeApi;
  app: ReturnType<typeof createExpressApp>;
  models: Record<string, RuntimeModel>;
  modelRouters: ModelRouter<unknown>[];
  dataRouters: DataRouter<unknown>[];
  rootRouter?: RootRouter;
  openApiRouter?: ReturnType<AccessRuntimeApi['createOpenApiRouter']>;
}

export interface AccessRouterRuntimeConfig {
  db?: AccessRouterRuntimeDbConfig;
  globalOptions?: GlobalOptions;
  defaultModelOptions?: Parameters<AccessRuntimeApi['setDefaultModelOptions']>[0];
  rootRouter?: RootRouterOptions | false;
  models?: ReadonlyArray<AccessRouterRuntimeModelDefinition>;
  data?: ReadonlyArray<AccessRouterRuntimeDataDefinition>;
  openApi?: OpenApiRouterOptions | false;
  extraRoutes?: ReadonlyArray<CombinedRouteInput>;
  express?: Omit<ExpressAppOptions, 'router' | 'routers' | 'finalize'> & {
    finalize?: ExpressAppOptions['finalize'];
  };
  init?: (context: AccessRouterRuntimeContext) => Promise<void> | void;
  shutdown?: (context: AccessRouterRuntimeContext) => Promise<void> | void;
}

export interface AccessRouterRuntimeInstance extends AccessRouterRuntimeContext {
  init: () => Promise<void>;
  shutdown: () => Promise<void>;
  createServerlessHandler: (options?: ServerlessHandlerOptions) => ServerlessHandler;
  startLocalServer: (options?: LocalServerOptions) => LocalServer;
}

function resolveModelName(definition: AccessRouterRuntimeModelDefinition): string {
  return definition.name ?? definition.model?.modelName ?? definition.router.modelName ?? '';
}

function resolveModel(definition: AccessRouterRuntimeModelDefinition): RuntimeModel {
  if (definition.model) {
    return definition.model as unknown as RuntimeModel;
  }

  const modelName = resolveModelName(definition);
  if (!modelName) {
    throw new Error('Model definitions require `name` when `model` is not provided.');
  }

  if (!definition.schema) {
    throw new Error(`Model definition "${modelName}" requires either \`model\` or \`schema\`.`);
  }

  return (mongoose.models[modelName] ??
    mongoose.model(modelName, definition.schema, definition.collection)) as unknown as RuntimeModel;
}

export function defineRuntimeConfig<TConfig extends AccessRouterRuntimeConfig>(config: TConfig): TConfig {
  return config;
}

export function createAccessRouterRuntime(config: AccessRouterRuntimeConfig): AccessRouterRuntimeInstance {
  const runtime = createAccessRuntime();

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
    const model = resolveModel(definition);
    models[model.modelName] = model;
    modelRouters.push(
      runtime.createRouter(model, definition.router as ModelRouterOptions<unknown>) as ModelRouter<unknown>,
    );
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
  ];
  const combinedRouter = mountedRoutes.length > 0 ? combineRoutes(...mountedRoutes) : undefined;

  const expressOptions = config.express ?? {};
  const userFinalize = expressOptions.finalize;
  const app = createExpressApp({
    ...expressOptions,
    finalize(expressApp) {
      if (combinedRouter) {
        expressApp.use(combinedRouter);
      }
      if (openApiRouter) {
        expressApp.use(openApiRouter);
      }
      userFinalize?.(expressApp);
    },
  });

  const context: AccessRouterRuntimeContext = {
    config,
    runtime,
    app,
    models,
    modelRouters,
    dataRouters,
    rootRouter,
    openApiRouter,
  };

  let initPromise: Promise<void> | null = null;
  let shutdownPromise: Promise<void> | null = null;

  const init = async (): Promise<void> => {
    if (!initPromise) {
      initPromise = (async () => {
        if (config.db?.url && mongoose.connection.readyState !== 1) {
          await mongoose.connect(config.db.url, config.db.options);
        }
        await config.init?.(context);
      })().catch((error) => {
        initPromise = null;
        throw error;
      });
    }

    return initPromise;
  };

  const shutdown = async (): Promise<void> => {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        await config.shutdown?.(context);
        const shouldDisconnect = config.db?.disconnectOnShutdown ?? Boolean(config.db?.url);
        if (shouldDisconnect && (initPromise !== null || mongoose.connection.readyState !== 0)) {
          await mongoose.disconnect();
        }
      })().finally(() => {
        initPromise = null;
        shutdownPromise = null;
      });
    }

    return shutdownPromise;
  };

  return {
    ...context,
    init,
    shutdown,
    createServerlessHandler(options: ServerlessHandlerOptions = {}) {
      return createExpressServerlessHandler(app, {
        ...options,
        init: async () => {
          await init();
          await options.init?.();
        },
      });
    },
    startLocalServer(options: LocalServerOptions = {}) {
      return startExpressLocalServer(app, {
        ...options,
        init: async () => {
          await init();
          await options.init?.();
        },
        onShutdown: async () => {
          await options.onShutdown?.();
          await shutdown();
        },
      });
    },
  };
}

export function createAccessRouterRuntimeApp(config: AccessRouterRuntimeConfig) {
  return createAccessRouterRuntime(config).app;
}

export function createAccessRouterRuntimeServerlessHandler(
  config: AccessRouterRuntimeConfig,
  options?: ServerlessHandlerOptions,
): ServerlessHandler {
  return createAccessRouterRuntime(config).createServerlessHandler(options);
}

export function loadAccessRouterRuntime(configPath: string): AccessRouterRuntimeInstance {
  return createAccessRouterRuntime(loadAccessRouterRuntimeConfigSync(configPath));
}

export { loadAccessRouterRuntimeConfigSync };

export type {
  CombinedRouteInput,
  DataRouterOptions,
  GlobalOptions,
  ModelRouterOptions,
  OpenApiRouterOptions,
  RootRouterOptions,
  LocalServerOptions,
  ServerlessHandlerOptions,
};
