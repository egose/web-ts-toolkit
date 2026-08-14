import express, { Express, NextFunction, Request, Response, Router } from 'express';
import acl, {
  createAccessRuntime,
  type AccessRuntimeApi,
  type GlobalOptions,
  type ModelRouterOptions,
} from '@web-ts-toolkit/access-router';
import {
  MODULE_ROUTERS,
  MODULE_ROUTER_OPTIONS,
  MODULE_OPTIONS,
  ROUTER_MODEL,
  ROUTER_OPTIONS,
  OPTIONS_METADATA,
  ARGS_METADATA,
  HookParamtypes,
  HOOK_DEFINITIONS,
  MODEL_HOOK_DEFINITIONS,
  DEFAULT_MODEL_ROUTER_OPTIONS_HOOK_DEFINITIONS,
  type HookDefinition,
} from './constants';
import {
  getMetadata,
  getOwnMetadata,
  getMethodMetadata,
  getAllMethodNames,
  getMethodDescriptor,
  getMethodOwner,
  getMethodMetadataKeysStartWith,
  getOwnMetadataListFromPrototypeChain,
  isRootRouter,
  isModelRouter,
  isDefaultModelRouterOptions,
  isModelRouterOptions,
  isHookMethod,
} from './metadata';
import type { BootstrapResult, RouterModel, Type } from './interfaces';

type HookParamMetadata = { index: number; type: HookParamtypes };
type HookConfig = HookDefinition;
type HookRegistration = {
  methodName: string;
  hook: HookConfig;
  metadataKeys: string[];
  params: HookParamMetadata[];
};
type ClassRegistrationPlan = {
  methodNames: string[];
  hooks: HookRegistration[];
};
type PreparedClass = {
  Type: Type;
  instance: object;
  plan: ClassRegistrationPlan;
};
type ModuleConfigurationPlan = {
  module: PreparedClass;
  routerOptions: PreparedClass[];
  routers: (PreparedClass | undefined)[];
};

type OptionSetter = (aclKey: string, value: unknown) => void;
type OptionGetter = (aclKey: string) => any;
type ModuleOptions = GlobalOptions & { basePath?: string; handleErrors?: boolean };
type InstanceRecord = Record<string | symbol, unknown>;

const normalizeErrorStatus = (status: unknown): number => {
  if (typeof status !== 'number' || !Number.isInteger(status)) return 500;
  if (status < 400 || status > 599) return 500;
  return status;
};

const getSafeErrorMessage = (status: number, err: unknown): string => {
  if (status === 404) return 'Not Found';
  if (status >= 500) return 'Internal Server Error';
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err && 'message' in err && typeof err.message === 'string' && err.message) {
    return err.message;
  }
  return 'Request failed';
};

const installRouterErrorHandlers = (expressRouter: Router) => {
  expressRouter.use((req: Request, res: Response) => {
    res.status(404).json({ message: 'Not Found' });
  });

  expressRouter.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const status = normalizeErrorStatus(
      typeof err === 'object' && err
        ? ((err as { status?: unknown; statusCode?: unknown }).status ?? (err as { statusCode?: unknown }).statusCode)
        : undefined,
    );
    res.status(status).json({ message: getSafeErrorMessage(status, err) });
  });
};

const normalizeHookChain = (current: unknown, aclOptionKey: string): Function[] => {
  if (current == null) return [];
  if (typeof current === 'function') return [current];

  if (typeof current === 'object' && !Array.isArray(current) && Object.keys(current).length === 0) return [];

  if (Array.isArray(current)) {
    for (let index = 0; index < current.length; index++) {
      if (typeof current[index] !== 'function') {
        throw new Error(`Invalid hook chain for ${aclOptionKey}: expected a flat array of functions`);
      }
    }
    return [...current];
  }

  throw new Error(`Invalid hook chain for ${aclOptionKey}: expected a function or flat array of functions`);
};

const appendHook = (current: unknown, fn: Function, aclOptionKey: string) => {
  return [...normalizeHookChain(current, aclOptionKey), fn];
};

const getValidateOperationOption = (aclOptionKey: string, getOption: OptionGetter) => {
  const [, operation] = aclOptionKey.split('.');
  const validateOptions = getOption('validate');
  if (!operation || validateOptions == null || typeof validateOptions !== 'object') return undefined;
  if (!Object.hasOwn(validateOptions, operation)) return undefined;
  return (validateOptions as Record<string, unknown>)[operation];
};

const assertNoDuplicateValidateHook = (aclOptionKey: string, current: unknown, methodName: string) => {
  if (current === undefined) return;
  throw new Error(`Duplicate decorated validator for ${aclOptionKey} on ${methodName}`);
};

const splitModuleOptions = (options: ModuleOptions) => {
  const { basePath = '/', handleErrors = false, ...globalOptions } = options;
  return { basePath, handleErrors, globalOptions };
};

const resolveRouterModelName = (model: RouterModel): string => (typeof model === 'string' ? model : model.modelName);

const registerRouterModel = (runtime: AccessRuntimeApi, model: RouterModel) => {
  if (typeof model !== 'string') runtime.registerModelInstance(model.modelName, model);
};

const describeTarget = (target: object, methodName: string) =>
  `${target.constructor.name || '<anonymous>'}.${methodName}`;

const describeHookDecorator = (hook: HookConfig) => `@${hook.optionKey}`;

const getAclOptionKey = (hook: HookConfig, metadataKey: string) =>
  hook.optionKey === hook.aclKey ? metadataKey : metadataKey.replace(hook.optionKey, hook.aclKey);

/**
 * Static factory for bootstrapping decorator-based `access-router` modules.
 *
 * @example
 * EgoseFactory.bootstrap(AppModule, app);
 *
 * @publicApi
 */
export class EgoseFactoryStatic {
  private readonly bootstrappedModules = new WeakMap<Type, WeakSet<Express>>();

  static create(runtime: AccessRuntimeApi = createAccessRuntime()): EgoseFactoryStatic {
    return new EgoseFactoryStatic(runtime);
  }

  private constructor(public readonly runtime: AccessRuntimeApi) {}

  public bootstrap(module: Type, expressApp: Express): BootstrapResult {
    this.assertNotBootstrapped(module, expressApp);
    const routers = getOwnMetadata(module, MODULE_ROUTERS) || [];
    const routerOptions = getOwnMetadata(module, MODULE_ROUTER_OPTIONS) || [];
    const moduleOptions = (getOwnMetadata(module, MODULE_OPTIONS) || {}) as ModuleOptions;
    const { basePath, handleErrors, globalOptions } = splitModuleOptions(moduleOptions);

    const plan = this.validateModuleConfiguration(module, routers, routerOptions);

    this.runtime.setGlobalOptions(globalOptions);
    this.bootstrapEgose(plan.module, expressApp);

    for (let x = 0; x < routerOptions.length; x++) {
      const routerOption = routerOptions[x];
      const routerOptionPlan = plan.routerOptions[x];
      if (isDefaultModelRouterOptions(routerOption)) this.setDefaultModelRouterOptions(routerOptionPlan);
      else if (isModelRouterOptions(routerOption)) this.setModelRouterOptions(routerOptionPlan);
    }

    const expressRouter = express.Router();

    for (let x = 0; x < routers.length; x++) {
      const router = routers[x];
      if (isRootRouter(router)) this.bootstrapRootRouter(router, expressRouter);
      else if (isModelRouter(router)) this.bootstrapModelRouter(plan.routers[x]!, expressRouter);
    }

    if (handleErrors) {
      installRouterErrorHandlers(expressRouter);
    }

    expressApp.use(basePath, expressRouter);
    this.markBootstrapped(module, expressApp);

    return { runtime: this.runtime, router: expressRouter };
  }

  private assertNotBootstrapped(module: Type, expressApp: Express) {
    const apps = this.bootstrappedModules.get(module);

    if (apps?.has(expressApp)) {
      throw new Error('EgoseFactory.bootstrap() was already called for this module and Express app');
    }
  }

  private markBootstrapped(module: Type, expressApp: Express) {
    let apps = this.bootstrappedModules.get(module);

    if (!apps) {
      apps = new WeakSet<Express>();
      this.bootstrappedModules.set(module, apps);
    }

    apps.add(expressApp);
  }

  private bootstrapEgose(prepared: PreparedClass, expressApp: Express) {
    this.registerPropertyOptions(prepared.instance, (key, val) =>
      this.runtime.setGlobalOption(key as keyof GlobalOptions, val as never),
    );

    this.registerGlobalHooks(prepared.instance, prepared.plan);

    expressApp.use(this.runtime() as express.RequestHandler);
  }

  private bootstrapRootRouter(router: Type, expressRouter: Router) {
    const options = getOwnMetadata(router, ROUTER_OPTIONS);
    const rootRouter = this.runtime.createRouter(options);
    expressRouter.use(rootRouter.routes);
  }

  private bootstrapModelRouter(prepared: PreparedClass, expressRouter: Router) {
    const DecoRouter = prepared.Type;
    const model = getOwnMetadata(DecoRouter, ROUTER_MODEL) as RouterModel;
    const modelName = resolveRouterModelName(model);
    const options = getOwnMetadata(DecoRouter, ROUTER_OPTIONS) as ModelRouterOptions;

    registerRouterModel(this.runtime, model);
    this.runtime.setModelOptions(modelName, options);
    this.registerPropertyOptions(prepared.instance, (key, val) =>
      this.runtime.setModelOption(modelName, key as never, val as never),
    );
    this.registerMethodOptions(
      prepared.instance,
      prepared.plan,
      (key, val) => this.runtime.setModelOption(modelName, key as never, val as never),
      (key) => this.runtime.getModelOption(modelName, key as never),
    );

    const modelRouter =
      typeof model === 'string' ? this.runtime.createRouter(modelName, {}) : this.runtime.createRouter(model, {});

    expressRouter.use(modelRouter.routes);
  }

  private setDefaultModelRouterOptions(prepared: PreparedClass) {
    const DecoRouterOptions = prepared.Type;
    const options = getOwnMetadata(DecoRouterOptions, ROUTER_OPTIONS) as ModelRouterOptions;
    this.runtime.setDefaultModelOptions(options);

    this.registerPropertyOptions(prepared.instance, (key, val) =>
      this.runtime.setDefaultModelOption(key as never, val as never),
    );
    this.registerMethodOptions(
      prepared.instance,
      prepared.plan,
      (key, val) => this.runtime.setDefaultModelOption(key as never, val as never),
      (key) => this.runtime.getDefaultModelOption(key as never),
    );
  }

  private setModelRouterOptions(prepared: PreparedClass) {
    const DecoRouterOptions = prepared.Type;
    const model = getOwnMetadata(DecoRouterOptions, ROUTER_MODEL) as RouterModel;
    const modelName = resolveRouterModelName(model);
    const options = getOwnMetadata(DecoRouterOptions, ROUTER_OPTIONS) as ModelRouterOptions;
    registerRouterModel(this.runtime, model);
    this.runtime.setModelOptions(modelName, options);

    this.registerPropertyOptions(prepared.instance, (key, val) =>
      this.runtime.setModelOption(modelName, key as never, val as never),
    );
    this.registerMethodOptions(
      prepared.instance,
      prepared.plan,
      (key, val) => this.runtime.setModelOption(modelName, key as never, val as never),
      (key) => this.runtime.getModelOption(modelName, key as never),
    );
  }

  private registerPropertyOptions(instance: object, setOption: OptionSetter) {
    const optionProps: { optionKey: string; propertyKey: string }[] = getOwnMetadataListFromPrototypeChain(
      Object.getPrototypeOf(instance),
      OPTIONS_METADATA,
      'optionKey',
    );

    for (let x = 0; x < optionProps.length; x++) {
      const optionProp = optionProps[x];
      const value = (instance as InstanceRecord)[optionProp.propertyKey];
      setOption(optionProp.optionKey, value);
    }
  }

  private registerMethodOptions(
    instance: object,
    plan: ClassRegistrationPlan,
    setOption: OptionSetter,
    getOption: OptionGetter,
  ) {
    for (const registration of plan.hooks) {
      this.registerMethodHookOnAcl(instance, registration, setOption, getOption);
    }
  }

  private validateModuleConfiguration(module: Type, routers: Type[], routerOptions: Type[]): ModuleConfigurationPlan {
    const moduleInstance = new module();
    const modulePlan = this.compileRegistrationPlan(moduleInstance, [HOOK_DEFINITIONS.globalPermissions]);
    const preparedRouterOptions: PreparedClass[] = [];
    const preparedRouters: (PreparedClass | undefined)[] = [];

    for (const DecoRouterOptions of routerOptions) {
      const hooks = isDefaultModelRouterOptions(DecoRouterOptions)
        ? DEFAULT_MODEL_ROUTER_OPTIONS_HOOK_DEFINITIONS
        : MODEL_HOOK_DEFINITIONS;
      const instance = new DecoRouterOptions();
      preparedRouterOptions.push({
        Type: DecoRouterOptions,
        instance,
        plan: this.compileRegistrationPlan(instance, hooks),
      });
    }

    for (const DecoRouter of routers) {
      if (isModelRouter(DecoRouter)) {
        const instance = new DecoRouter();
        preparedRouters.push({
          Type: DecoRouter,
          instance,
          plan: this.compileRegistrationPlan(instance, MODEL_HOOK_DEFINITIONS),
        });
      } else {
        preparedRouters.push(undefined);
      }
    }

    return {
      module: { Type: module, instance: moduleInstance, plan: modulePlan },
      routerOptions: preparedRouterOptions,
      routers: preparedRouters,
    };
  }

  private compileRegistrationPlan(instance: object, hooks: readonly HookConfig[]): ClassRegistrationPlan {
    const methodNames = [...new Set(getAllMethodNames(Object.getPrototypeOf(instance)))];
    const registrations: HookRegistration[] = [];

    for (const methodName of methodNames) {
      const matches = hooks.filter((hook) => isHookMethod(instance, methodName, hook));
      if (matches.length === 0) continue;

      const targetName = describeTarget(instance, methodName);
      if (matches.length > 1) {
        throw new Error(
          `Invalid decorator configuration on ${targetName}: multiple hook decorators (${matches
            .map(describeHookDecorator)
            .join(', ')}) are not supported; split each hook onto its own method`,
        );
      }

      const hook = matches[0];
      this.validateMethodFunction(instance, methodName, hook, targetName);
      const params = this.getMethodParamMetadata(instance, methodName);
      this.validateMethodParams(params, hook, targetName);
      registrations.push({
        methodName,
        hook,
        metadataKeys: getMethodMetadataKeysStartWith(instance, methodName, hook.optionKey),
        params,
      });
    }

    return { methodNames, hooks: registrations };
  }

  private validateMethodFunction(instance: object, methodName: string, hook: HookConfig, targetName: string) {
    const dtor = getMethodDescriptor(instance, methodName);
    if (!dtor || typeof dtor.value !== 'function') {
      throw new Error(
        `Invalid decorator configuration on ${targetName}: ${describeHookDecorator(
          hook,
        )} must decorate an existing method function`,
      );
    }
  }

  private validateMethodParams(metalist: HookParamMetadata[], hook: HookConfig, targetName: string) {
    const arglist = hook.args;
    const seen = new Set<number>();

    for (const meta of metalist) {
      if (seen.has(meta.index)) {
        throw new Error(
          `Invalid decorator configuration on ${targetName}: duplicate parameter decorator at index ${meta.index} for ${describeHookDecorator(
            hook,
          )}; keep only one parameter decorator per argument`,
        );
      }
      seen.add(meta.index);

      if (meta.type === HookParamtypes.REQUEST || arglist.includes(meta.type)) {
        continue;
      }

      throw new Error(
        `Invalid decorator configuration on ${targetName}: parameter index ${meta.index} uses unsupported parameter type ${HookParamtypes[meta.type]} for ${describeHookDecorator(
          hook,
        )}; use a parameter decorator supported by this hook`,
      );
    }
  }

  private registerMethodHookGlobal(routerOrOptions: object, registration: HookRegistration) {
    const { hook } = registration;
    const fn = this.wrapMethod(routerOrOptions, registration);
    if (!fn) return;

    if (hook.array) {
      this.runtime.setGlobalOption(
        hook.aclKey as any,
        appendHook(this.runtime.getGlobalOption(hook.aclKey as keyof GlobalOptions), fn, hook.aclKey) as never,
      );
    } else {
      this.runtime.setGlobalOption(hook.aclKey as keyof GlobalOptions, fn as never);
    }
  }

  private registerGlobalHooks(instance: object, plan: ClassRegistrationPlan) {
    for (const registration of plan.hooks) this.registerMethodHookGlobal(instance, registration);
  }

  private registerMethodHookOnAcl(
    routerOrOptions: object,
    registration: HookRegistration,
    setOption: OptionSetter,
    getOption: OptionGetter,
  ) {
    const { hook } = registration;
    for (let x = 0; x < registration.metadataKeys.length; x++) {
      const key = registration.metadataKeys[x];
      const val = getMethodMetadata(routerOrOptions, registration.methodName, key);
      if (val !== true) continue;

      const fn = this.wrapMethod(routerOrOptions, registration);
      if (!fn) continue;

      const aclOptionKey = getAclOptionKey(hook, key);

      if (hook.array && hook.aclKey !== 'validate') {
        setOption(aclOptionKey, appendHook(getOption(aclOptionKey), fn, aclOptionKey));
      } else {
        if (hook.aclKey === 'validate') {
          assertNoDuplicateValidateHook(
            aclOptionKey,
            getValidateOperationOption(aclOptionKey, getOption),
            registration.methodName,
          );
        }
        setOption(aclOptionKey, fn);
      }
    }
  }

  private wrapMethod(target: object, registration: HookRegistration) {
    const { hook, methodName, params } = registration;
    const dtor = getMethodDescriptor(target, methodName);
    if (!dtor || typeof dtor.value !== 'function') return null;

    const arglist = hook.args;

    return function (this: unknown, ...args: unknown[]) {
      const ordered = params
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((meta) => {
          if (meta.type === HookParamtypes.REQUEST) return this;

          const index = arglist.findIndex((v) => v === meta.type);
          return args[index];
        });

      return dtor.value.call(target, ...ordered);
    };
  }

  private getMethodParamMetadata(target: object, methodName: string): HookParamMetadata[] {
    const methodOwner = getMethodOwner(target, methodName);
    const metadataTarget = methodOwner && 'constructor' in methodOwner ? methodOwner.constructor : target.constructor;
    return Reflect.getOwnMetadata(ARGS_METADATA, metadataTarget, methodName) || [];
  }
}

export const EgoseFactory = EgoseFactoryStatic.create(acl);
