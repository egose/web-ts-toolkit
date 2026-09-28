import express, { Express, NextFunction, Request, Response, Router } from 'express';
import mongoose from 'mongoose';
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
  HOOK_DEFINITION_LIST,
  HOOK_CLASS_ROLES,
  ROOT_ROUTER_WATERMARK,
  ROUTER_WATERMARK,
  DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK,
  MODEL_ROUTER_OPTIONS_WATERMARK,
  type HookDefinition,
  type HookClassRole,
} from './constants';
import {
  getMetadata,
  getOwnMetadata,
  getMethodMetadata,
  getAllMethodNames,
  getMethodDescriptor,
  getMethodOwner,
  getMethodMetadataReader,
  getOwnMetadataListFromPrototypeChain,
  isRootRouter,
  isModelRouter,
  isDefaultModelRouterOptions,
  isModelRouterOptions,
} from './metadata';
import type { BootstrapResult, RouterModel, Type } from './interfaces';
import type { OptionMetadata, OptionScope } from './decorators/property.decorators';
import { validatePropertyOptionValue } from './property-options';

type HookParamMetadata = { index: number; type: HookParamtypes };
type HookConfig = HookDefinition;
type HookRegistration = {
  methodName: string | symbol;
  hook: HookConfig;
  metadataKeys: string[];
  params: HookParamMetadata[];
};
type ClassRegistrationPlan = {
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
type RuntimeSnapshot = { restore: () => void };

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

/**
 * Exact-slot read without runtime `default`/root fallback.
 *
 * `getModelOption('prepare.update')` resolves `prepare.default` and the
 * whole `prepare` record when the exact slot is missing, so it cannot be
 * used to decide whether `prepare.update` itself is occupied. This helper
 * traverses own properties only: a sibling map such as
 * `{ create: [...] }` yields `undefined` for `prepare.update`, while a
 * malformed exact value such as `{ bad: true }` stored at the exact slot
 * is returned as-is so `normalizeHookChain` still rejects it.
 */
const getExactNestedValue = (container: unknown, key: string): unknown => {
  if (container == null) return undefined;
  const parts = key.split('.');
  let current: unknown = container;
  for (const part of parts) {
    if (current == null) return undefined;
    if (typeof current !== 'object' && typeof current !== 'function') return undefined;
    if (!Object.hasOwn(current as object, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const readExactStoredOption = (
  runtime: { getModelOptions?: (modelName: string) => unknown; getDefaultModelOptions?: () => unknown },
  modelName: string | null,
  isDefault: boolean,
  key: string,
): unknown => {
  try {
    if (isDefault) {
      if (typeof runtime.getDefaultModelOptions !== 'function') return undefined;
      return getExactNestedValue(runtime.getDefaultModelOptions(), key);
    }
    if (!modelName || typeof runtime.getModelOptions !== 'function') return undefined;
    return getExactNestedValue(runtime.getModelOptions(modelName), key);
  } catch {
    return undefined;
  }
};

const isValidateRootShorthand = (root: unknown): boolean => {
  if (root == null) return false;
  if (typeof root === 'function' || typeof root === 'boolean') return true;
  if (Array.isArray(root)) return true;
  return false;
};

const isArrayHookRootShorthand = (root: unknown): boolean => {
  if (root == null) return false;
  if (typeof root === 'function') return true;
  if (Array.isArray(root)) return true;
  return false;
};

/**
 * Root-shorthand contract for `validate` (BDECO-01):
 * - `validate` may be a root shorthand (`boolean | unknown[] | hook`),
 *   a `default` fallback, or an operation map (`{ create, update, default }`).
 * - A decorated `@Validate(op)` occupies exactly `validate.<op>`. When the
 *   exact slot is already defined, bootstrap rejects under the existing
 *   duplicate policy.
 * - When the exact slot is free but a root shorthand is stored, bootstrap
 *   also rejects under the duplicate policy instead of replacing the root
 *   record (which would silently weaken unrelated operations such as
 *   `update` when only `create` is decorated). A plain operation map without
 *   this operation (sibling or `default` only) does not conflict.
 */
const getValidateExactConflict = (
  runtime: { getModelOptions?: (modelName: string) => unknown; getDefaultModelOptions?: () => unknown },
  modelName: string | null,
  isDefault: boolean,
  aclOptionKey: string,
): unknown => {
  const exact = readExactStoredOption(runtime, modelName, isDefault, aclOptionKey);
  if (exact !== undefined) return exact;
  const root = readExactStoredOption(runtime, modelName, isDefault, 'validate');
  if (isValidateRootShorthand(root)) return root;
  return undefined;
};

const assertArrayRootShorthandFree = (
  runtime: { getModelOptions?: (modelName: string) => unknown; getDefaultModelOptions?: () => unknown },
  modelName: string | null,
  isDefault: boolean,
  aclOptionKey: string,
  methodName: string | symbol,
): void => {
  const base = aclOptionKey.split('.')[0] as string;
  if (!base || base === aclOptionKey) return;
  const root = readExactStoredOption(runtime, modelName, isDefault, base);
  if (isArrayHookRootShorthand(root)) {
    throw new Error(
      `Conflicting root hook chain for ${aclOptionKey} on ${describeMethodKey(methodName)}: "${base}" is already configured as a root shorthand; register operation slots or a root shorthand, not both`,
    );
  }
};

const getValidateOperationOption = (aclOptionKey: string, getOption: OptionGetter) => {
  const [, operation] = aclOptionKey.split('.');
  const validateOptions = getOption('validate');
  if (!operation || validateOptions == null || typeof validateOptions !== 'object') return undefined;
  if (!Object.hasOwn(validateOptions, operation)) return undefined;
  return (validateOptions as Record<string, unknown>)[operation];
};

const assertNoDuplicateValidateHook = (aclOptionKey: string, current: unknown, methodName: string | symbol) => {
  if (current === undefined) return;
  throw new Error(`Duplicate decorated validator for ${aclOptionKey} on ${describeMethodKey(methodName)}`);
};

const splitModuleOptions = (options: ModuleOptions) => {
  const { basePath = '/', handleErrors = false, ...globalOptions } = options;
  return { basePath, handleErrors, globalOptions };
};

const resolveRouterModelName = (model: RouterModel): string => (typeof model === 'string' ? model : model.modelName);

const registerRouterModel = (runtime: AccessRuntimeApi, model: RouterModel) => {
  if (typeof model !== 'string') {
    runtime.registerModelInstance(model.modelName, model);
    return;
  }

  const globalModel = mongoose.models[model] as mongoose.Model<unknown> | undefined;
  if (globalModel) runtime.registerModelInstance(model, globalModel);
};

const describeTarget = (target: object, methodName: string | symbol) => {
  const key = typeof methodName === 'symbol' ? methodName.toString() : methodName;
  return `${(target as any).constructor?.name || '<anonymous>'}.${key}`;
};

const describeMethodKey = (key: string | symbol) => (typeof key === 'symbol' ? key.toString() : key);

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
  private readonly bootstrapInProgress = new WeakMap<Type, WeakSet<Express>>();

  static create(runtime: AccessRuntimeApi = createAccessRuntime()): EgoseFactoryStatic {
    return new EgoseFactoryStatic(runtime);
  }

  private constructor(public readonly runtime: AccessRuntimeApi) {}

  /**
   * Bootstraps a decorated module onto an Express app.
   *
   * Transaction boundary (atomic publication):
   * - **Outside rollback:** arbitrary user constructors/field initializers executed
   *   while building `ModuleConfigurationPlan` (via `new Type()`) are not undone.
   *   Express internals outside the mount stack (e.g., app settings, already-sent
   *   responses) are also not rolled back. Preventing nested package bootstrap
   *   does not roll back those user-code side effects.
   * - **Inside rollback:** package-controlled runtime state (global/default/model
   *   options, model instance registrations, model refs/subs/atts, OpenAPI
   *   registrations) is snapshotted via `createBootstrapSnapshot()` after user
   *   construction but before any potentially mutating preflight or setter.
   *   Both snapshot/restore methods are required, directly on the API or its
   *   underlying runtime; acquisition/capability failures stop before mutation.
   *   On failure, runtime restore and app-stack cleanup are attempted independently.
   *   Preflight runs inside the guarded region so a
   *   default-runtime lazy model lookup that later conflicts leaves the
   *   snapshot unchanged. Host `expressApp` publication is delayed until all
   *   registration and router construction succeed; on failure the app's internal
   *   stack is truncated to its pre-bootstrap length. This includes a throwing
   *   final `expressApp.use(...)`. Successful rollback rethrows the exact original
   *   value. Recovery failures throw `AggregateError` with the original first in
   *   `errors` and as `cause`, followed by runtime restore/app cleanup failures.
   *   Failed recovery leaves the affected state uncertain and requires host
   *   recovery before retry; rollback success is not guaranteed if recovery throws.
   * - **Ownership:** an in-progress tuple is reserved before user
   *   constructors/callbacks execute; reentrant bootstrap for the same
   *   module/app is rejected before nested publication and the reservation
   *   is always released. `markBootstrapped` is set only after the final
   *   mount succeeds, so retrying after successful rollback behaves like a
   *   clean first attempt with exactly one mounted module router (request
   *   runtime initialization scoped inside it) and one copy of every
   *   route/hook. Independent module/app tuples are unaffected.
   *   Request runtime initialization is scoped to the module router mounted at
   *   `basePath`; it does not run on unrelated host routes. Applications
   *   needing runtime initialization outside module routes must explicitly own
   *   that middleware (e.g. `app.use(factory.runtime())`).
   */
  public bootstrap(module: Type, expressApp: Express): BootstrapResult {
    this.assertNotBootstrapped(module, expressApp);
    this.markBootstrapInProgress(module, expressApp);
    let runtimeSnapshot: RuntimeSnapshot | null = null;
    let appStackCapture: { stack: any[] | null; length: number } | null = null;
    try {
      const routers = getOwnMetadata(module, MODULE_ROUTERS) || [];
      const routerOptions = getOwnMetadata(module, MODULE_ROUTER_OPTIONS) || [];
      const moduleOptions = (getOwnMetadata(module, MODULE_OPTIONS) || {}) as ModuleOptions;
      const { basePath, handleErrors, globalOptions } = splitModuleOptions(moduleOptions);

      const plan = this.validateModuleConfiguration(module, routers, routerOptions);

      runtimeSnapshot = this.createRuntimeSnapshot();
      appStackCapture = this.captureAppStack(expressApp);

      this.validateHookChainPreflight(plan);
      this.validateModelRegistrationPreflight(plan);

      this.runtime.setGlobalOptions(globalOptions);
      this.bootstrapEgose(plan.module);

      // Apply default providers before model providers regardless of caller
      // array order: `setModelOptions` materializes current defaults into the
      // model manager at call time, so a model provider running before a
      // later default provider would retain stale defaults (guards, parentPath,
      // idParam). Relative order within each group is preserved, and each entry
      // keeps its associated plan via the shared index.
      const providerOrder = [
        ...routerOptions.keys().filter((x: number) => isDefaultModelRouterOptions(routerOptions[x])),
        ...routerOptions.keys().filter((x: number) => isModelRouterOptions(routerOptions[x])),
      ];
      for (const x of providerOrder) {
        const routerOption = routerOptions[x];
        const routerOptionPlan = plan.routerOptions[x];
        if (isDefaultModelRouterOptions(routerOption)) this.setDefaultModelRouterOptions(routerOptionPlan);
        else if (isModelRouterOptions(routerOption)) this.setModelRouterOptions(routerOptionPlan);
      }

      const expressRouter = express.Router();
      // Scope request runtime initialization to the module router (BDECO-03):
      // the init middleware runs only under `basePath`, before module routes
      // and the opt-in module error boundary. Applications needing runtime
      // init outside module routes must explicitly own that middleware
      // (e.g. `app.use(factory.runtime())`).
      const runtimeMiddleware = this.runtime() as unknown as express.RequestHandler;
      expressRouter.use(runtimeMiddleware);

      for (let x = 0; x < routers.length; x++) {
        const router = routers[x];
        const build = () => {
          if (isRootRouter(router)) this.bootstrapRootRouter(router, expressRouter);
          else if (isModelRouter(router)) this.bootstrapModelRouter(plan.routers[x]!, expressRouter, basePath);
        };
        if (basePath && basePath !== '/') this.runtime.runtime.withOpenApiPathPrefix(basePath, build);
        else build();
      }

      if (handleErrors) {
        installRouterErrorHandlers(expressRouter!);
      }

      expressApp.use(basePath, expressRouter!);
      this.markBootstrapped(module, expressApp);

      return { runtime: this.runtime, router: expressRouter! };
    } catch (err) {
      const recoveryErrors: unknown[] = [];
      const failedSteps: string[] = [];
      try {
        if (runtimeSnapshot) this.restoreRuntimeSnapshot(runtimeSnapshot);
      } catch (restoreError) {
        recoveryErrors.push(restoreError);
        failedSteps.push('runtime restore');
      }
      try {
        if (appStackCapture) this.restoreAppStack(expressApp, appStackCapture);
      } catch (cleanupError) {
        recoveryErrors.push(cleanupError);
        failedSteps.push('app-stack cleanup');
      }
      if (recoveryErrors.length) {
        throw new AggregateError(
          [err, ...recoveryErrors],
          `Bootstrap failed and recovery failed (${failedSteps.join(', ')}); affected state is uncertain and requires host recovery before retry`,
          { cause: err },
        );
      }
      throw err;
    } finally {
      this.clearBootstrapInProgress(module, expressApp);
    }
  }

  private assertNotBootstrapped(module: Type, expressApp: Express) {
    const apps = this.bootstrappedModules.get(module);

    if (apps?.has(expressApp)) {
      throw new Error('EgoseFactory.bootstrap() was already called for this module and Express app');
    }

    const inProgress = this.bootstrapInProgress.get(module);
    if (inProgress?.has(expressApp)) {
      throw new Error(
        'EgoseFactory.bootstrap() reentrant call detected for this module and Express app (bootstrap already in progress); nested publication is rejected before any nested router is mounted',
      );
    }
  }

  private markBootstrapInProgress(module: Type, expressApp: Express) {
    let apps = this.bootstrapInProgress.get(module);
    if (!apps) {
      apps = new WeakSet<Express>();
      this.bootstrapInProgress.set(module, apps);
    }
    apps.add(expressApp);
  }

  private clearBootstrapInProgress(module: Type, expressApp: Express) {
    this.bootstrapInProgress.get(module)?.delete(expressApp);
  }

  private markBootstrapped(module: Type, expressApp: Express) {
    let apps = this.bootstrappedModules.get(module);

    if (!apps) {
      apps = new WeakSet<Express>();
      this.bootstrappedModules.set(module, apps);
    }

    apps.add(expressApp);
  }

  private createRuntimeSnapshot(): RuntimeSnapshot {
    const anyRuntime: any = this.runtime as any;
    // Resolve each method independently: API facades may expose one directly
    // and the other on .runtime. Preserve direct-method precedence and `this`.
    const createOwner = typeof anyRuntime.createBootstrapSnapshot === 'function' ? anyRuntime : anyRuntime.runtime;
    const restoreOwner = typeof anyRuntime.restoreBootstrapSnapshot === 'function' ? anyRuntime : anyRuntime.runtime;
    const create = createOwner?.createBootstrapSnapshot;
    const restore = restoreOwner?.restoreBootstrapSnapshot;
    if (typeof create !== 'function' || typeof restore !== 'function') {
      throw new Error(
        'EgoseFactory.bootstrap() requires callable createBootstrapSnapshot() and restoreBootstrapSnapshot() on the runtime API or its underlying runtime',
      );
    }
    // Capture the restore capability before acquiring the snapshot or invoking
    // setup callbacks; rollback must not depend on a later method lookup.
    const restoreSnapshot = restore.bind(restoreOwner);
    const snapshot = create.call(createOwner);
    if (snapshot == null) {
      throw new Error('EgoseFactory.bootstrap() createBootstrapSnapshot() returned no snapshot');
    }
    return { restore: () => restoreSnapshot(snapshot) };
  }

  private restoreRuntimeSnapshot(snapshot: RuntimeSnapshot): void {
    snapshot.restore();
  }

  private getExpressStack(app: Express): any[] | null {
    const a: any = app as any;
    if (a._router?.stack && Array.isArray(a._router.stack)) return a._router.stack;
    if (a.router?.stack && Array.isArray(a.router.stack)) return a.router.stack;
    if (typeof a._getRouter === 'function') {
      const r = a._getRouter();
      if (r?.stack && Array.isArray(r.stack)) return r.stack;
    }
    return null;
  }

  private captureAppStack(app: Express): { stack: any[] | null; length: number } {
    const stack = this.getExpressStack(app);
    return { stack, length: stack ? stack.length : 0 };
  }

  private restoreAppStack(app: Express, captured: { stack: any[] | null; length: number }): void {
    const stack = captured.stack ?? this.getExpressStack(app);
    if (stack) {
      stack.length = captured.length;
    } else {
      // If stack didn't exist before but was created during failed attempt, truncate newly created stack
      const cur = this.getExpressStack(app);
      if (cur) cur.length = captured.length;
    }
  }

  private validateHookChainPreflight(plan: ModuleConfigurationPlan): void {
    // Module-level global hooks
    for (const reg of plan.module.plan.hooks) {
      for (const key of reg.metadataKeys) {
        const aclKey = getAclOptionKey(reg.hook, key);
        if (reg.hook.array && reg.hook.aclKey !== 'validate') {
          const current = (this.runtime as any).getGlobalOption(aclKey as any);
          normalizeHookChain(current, aclKey);
        }
      }
    }

    // RouterOptions (default and model)
    for (let i = 0; i < plan.routerOptions.length; i++) {
      const prepared = plan.routerOptions[i];
      const decoType = prepared.Type;
      const isDefault = isDefaultModelRouterOptions(decoType);
      const modelName: string | null = isDefault
        ? null
        : resolveRouterModelName(getOwnMetadata(decoType, ROUTER_MODEL) as RouterModel);
      for (const reg of prepared.plan.hooks) {
        for (const key of reg.metadataKeys) {
          const aclKey = getAclOptionKey(reg.hook, key);
          if (reg.hook.array && reg.hook.aclKey !== 'validate') {
            // Avoid creating a new manager for a model that doesn't exist yet — treat missing as empty
            const shouldCheck = isDefault || this.shouldValidateModelHook(modelName);
            if (!shouldCheck) continue;
            assertArrayRootShorthandFree(this.runtime as any, modelName, isDefault, aclKey, reg.methodName);
            const current = readExactStoredOption(this.runtime as any, modelName, isDefault, aclKey);
            normalizeHookChain(current, aclKey);
          } else if (reg.hook.aclKey === 'validate') {
            const shouldCheck = isDefault || this.shouldValidateModelHook(modelName);
            if (!shouldCheck) continue;
            const current = getValidateExactConflict(this.runtime as any, modelName, isDefault, aclKey);
            assertNoDuplicateValidateHook(aclKey, current, reg.methodName);
          }
        }
      }
    }

    // Model routers
    for (let i = 0; i < plan.routers.length; i++) {
      const prepared = plan.routers[i];
      if (!prepared) continue;
      const model = getOwnMetadata(prepared.Type, ROUTER_MODEL) as RouterModel;
      const modelName = resolveRouterModelName(model);
      for (const reg of prepared.plan.hooks) {
        for (const key of reg.metadataKeys) {
          const aclKey = getAclOptionKey(reg.hook, key);
          if (reg.hook.array && reg.hook.aclKey !== 'validate') {
            if (!this.shouldValidateModelHook(modelName)) continue;
            assertArrayRootShorthandFree(this.runtime as any, modelName, false, aclKey, reg.methodName);
            const current = readExactStoredOption(this.runtime as any, modelName, false, aclKey);
            normalizeHookChain(current, aclKey);
          } else if (reg.hook.aclKey === 'validate') {
            if (!this.shouldValidateModelHook(modelName)) continue;
            const current = getValidateExactConflict(this.runtime as any, modelName, false, aclKey);
            assertNoDuplicateValidateHook(aclKey, current, reg.methodName);
          }
        }
      }
    }
  }

  private shouldValidateModelHook(modelName: string | null): boolean {
    if (!modelName) return true;
    const anyRuntime: any = this.runtime as any;
    // Prefer underlying runtime hasModel check to avoid creating a manager via getModelOption side-effect
    const inner = anyRuntime.runtime ?? anyRuntime;
    if (typeof inner.hasModel === 'function') {
      try {
        return !!inner.hasModel(modelName);
      } catch {
        return false;
      }
    }
    if (typeof anyRuntime.getModelNames === 'function') {
      try {
        const names: string[] = anyRuntime.getModelNames();
        if (names.includes(modelName)) return true;
      } catch {
        // ignore
      }
    }
    if (typeof anyRuntime.hasModelInstance === 'function') {
      try {
        if (anyRuntime.hasModelInstance(modelName)) return true;
      } catch {
        // ignore
      }
    }
    // No manager yet — treat as no existing chain to validate
    return false;
  }

  private validateModelRegistrationPreflight(plan: ModuleConfigurationPlan): void {
    const checkModel = (model: RouterModel | null) => {
      if (!model || typeof model === 'string') return;
      const modelName = resolveRouterModelName(model);
      const anyRuntime: any = this.runtime as any;
      let existing: any = null;
      let hasExisting = false;
      try {
        if (typeof anyRuntime.getModelInstance === 'function') {
          existing = anyRuntime.getModelInstance(modelName);
          hasExisting = !!existing;
        } else if (anyRuntime.runtime && typeof anyRuntime.runtime.getModelInstance === 'function') {
          existing = anyRuntime.runtime.getModelInstance(modelName);
          hasExisting = !!existing;
        }
      } catch {
        hasExisting = false;
      }
      if (hasExisting && existing !== model) {
        throw new Error(
          `Runtime model registry conflict: model "${modelName}" is already registered to a different mongoose.Model instance on this runtime. Use a distinct model name or a separate runtime.`,
        );
      }
    };

    for (const prepared of plan.routerOptions) {
      const m = getOwnMetadata(prepared.Type, ROUTER_MODEL) as RouterModel | null;
      if (m) checkModel(m);
    }
    for (const prepared of plan.routers) {
      if (!prepared) continue;
      const m = getOwnMetadata(prepared.Type, ROUTER_MODEL) as RouterModel | null;
      if (m) checkModel(m);
    }
  }

  private bootstrapEgose(prepared: PreparedClass) {
    this.registerPropertyOptions(prepared.instance, (key, val) =>
      this.runtime.setGlobalOption(key as keyof GlobalOptions, val as never),
    );

    this.registerGlobalHooks(prepared.instance, prepared.plan);
  }

  private bootstrapRootRouter(router: Type, expressRouter: Router) {
    const options = getOwnMetadata(router, ROUTER_OPTIONS);
    const rootRouter = this.runtime.createRouter(options);
    expressRouter.use(rootRouter.routes);
  }

  private bootstrapModelRouter(prepared: PreparedClass, expressRouter: Router, moduleBasePath: string) {
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
      { modelName, isDefault: false },
    );

    const mount = moduleBasePath.replace(/\/+$/, '');
    const parent = this.runtime.getModelOption(modelName, 'parentPath');
    if (mount && typeof parent === 'string' && (parent === mount || parent.startsWith(`${mount}/`))) {
      throw new TypeError(
        `Model ${modelName} parentPath repeats module mount ${mount}; remove the old OpenAPI mount workaround and use servers for an external proxy prefix`,
      );
    }
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
      { modelName: null, isDefault: true },
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
      { modelName, isDefault: false },
    );
  }

  private registerPropertyOptions(instance: object, setOption: OptionSetter) {
    const optionProps = getOwnMetadataListFromPrototypeChain<OptionMetadata>(
      Object.getPrototypeOf(instance),
      OPTIONS_METADATA,
      'optionKey',
    );

    for (let x = 0; x < optionProps.length; x++) {
      const optionProp = optionProps[x];
      const value = (instance as InstanceRecord)[optionProp.propertyKey];
      validatePropertyOptionValue(optionProp, value);
      setOption(optionProp.optionKey as string, value);
    }
  }

  private registerMethodOptions(
    instance: object,
    plan: ClassRegistrationPlan,
    setOption: OptionSetter,
    getOption: OptionGetter,
    scope?: { modelName: string | null; isDefault: boolean },
  ) {
    for (const registration of plan.hooks) {
      this.registerMethodHookOnAcl(instance, registration, setOption, getOption, scope);
    }
  }

  private getClassDisplayName(cls: Type): string {
    return (cls as any).name || '<anonymous>';
  }

  private getModuleDisplayName(mod: Type): string {
    return (mod as any).name || '<anonymous>';
  }

  private resolveModelNameForValidation(cls: Type): string | null {
    const model = getOwnMetadata(cls, ROUTER_MODEL) as RouterModel | null;
    if (model == null) return null;
    if (typeof model === 'string') return model;
    if (model !== null && typeof (model as any).modelName === 'string') {
      const name = (model as any).modelName;
      return typeof name === 'string' && name.length > 0 ? name : null;
    }
    return null;
  }

  /**
   * Validate every entry in `routers` and `routerOptions` before any class is
   * instantiated. Each `routers` entry must have exactly one own Router watermark
   * (root or model) and no RouterOptions watermark; each `routerOptions` entry
   * must have exactly one own RouterOptions watermark (default or model) and no
   * Router watermark. Inherited watermarks (own false but prototype-chain true)
   * are rejected as inherited-identity, multiple watermarks as dual-role,
   * single wrong-kind watermark as wrong-array, and zero watermarks as
   * undecorated. Provider uniqueness per module is also enforced:
   * - at most one default-options provider
   * - at most one model-options provider per effective model
   * - at most one model router per effective model
   * Distinct root routers and distinct model routers (different model names) are allowed.
   * No constructor is invoked and no runtime/app mutation has occurred when validation fails.
   */
  private validateModuleRoles(module: Type, routers: Type[], routerOptions: Type[]): void {
    const moduleName = this.getModuleDisplayName(module);

    // --- per-entry role validation for routers ---
    for (let i = 0; i < routers.length; i++) {
      const cls = routers[i];
      const className = this.getClassDisplayName(cls);
      const hasRootOwn = !!getOwnMetadata(cls, ROOT_ROUTER_WATERMARK);
      const hasModelOwn = !!getOwnMetadata(cls, ROUTER_WATERMARK);
      const hasDefaultOptsOwn = !!getOwnMetadata(cls, DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK);
      const hasModelOptsOwn = !!getOwnMetadata(cls, MODEL_ROUTER_OPTIONS_WATERMARK);
      const hasRootInherited = !hasRootOwn && !!getMetadata(cls, ROOT_ROUTER_WATERMARK);
      const hasModelInherited = !hasModelOwn && !!getMetadata(cls, ROUTER_WATERMARK);
      const hasDefaultOptsInherited = !hasDefaultOptsOwn && !!getMetadata(cls, DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK);
      const hasModelOptsInherited = !hasModelOptsOwn && !!getMetadata(cls, MODEL_ROUTER_OPTIONS_WATERMARK);
      const hasAnyInherited = hasRootInherited || hasModelInherited || hasDefaultOptsInherited || hasModelOptsInherited;
      const ownCount = Number(hasRootOwn) + Number(hasModelOwn) + Number(hasDefaultOptsOwn) + Number(hasModelOptsOwn);

      if (ownCount > 1) {
        const found: string[] = [];
        if (hasRootOwn) found.push('@Router (root)');
        if (hasModelOwn) found.push('@Router (model)');
        if (hasDefaultOptsOwn) found.push('@RouterOptions (default)');
        if (hasModelOptsOwn) found.push('@RouterOptions (model)');
        throw new Error(
          `Invalid module "${moduleName}": class "${className}" in "routers" array has conflicting role watermarks [${found.join(', ')}]; expected exactly one supported role — @Router({ basePath }) for root or @Router(modelName/Model) for model — remove extra decorators`,
        );
      }

      if (ownCount === 1) {
        if (hasAnyInherited) {
          const inheritedList: string[] = [];
          if (hasRootInherited) inheritedList.push('@Router (root) inherited');
          if (hasModelInherited) inheritedList.push('@Router (model) inherited');
          if (hasDefaultOptsInherited) inheritedList.push('@RouterOptions (default) inherited');
          if (hasModelOptsInherited) inheritedList.push('@RouterOptions (model) inherited');
          // Even though ownCount is 1, inherited identity from ancestor is disallowed and indicates a misplaced inheritance pattern
          throw new Error(
            `Invalid module "${moduleName}": class "${className}" in "routers" array has inherited role identity [${inheritedList.join(', ')}] without own decoration; expected own @Router — decorate "${className}" directly with @Router (inherited decorators are not reused)`,
          );
        }
        if (hasDefaultOptsOwn || hasModelOptsOwn) {
          const found = hasDefaultOptsOwn ? '@RouterOptions (default)' : '@RouterOptions (model)';
          throw new Error(
            `Invalid module "${moduleName}": class "${className}" in "routers" array is decorated as ${found} but placed in "routers"; expected @Router — move "${className}" to "routerOptions" array or decorate with @Router`,
          );
        }
        // valid router entry (root or model)
        continue;
      }

      // ownCount === 0
      if (hasAnyInherited) {
        const inheritedList: string[] = [];
        if (hasRootInherited) inheritedList.push('@Router (root) inherited');
        if (hasModelInherited) inheritedList.push('@Router (model) inherited');
        if (hasDefaultOptsInherited) inheritedList.push('@RouterOptions (default) inherited');
        if (hasModelOptsInherited) inheritedList.push('@RouterOptions (model) inherited');
        throw new Error(
          `Invalid module "${moduleName}": class "${className}" in "routers" array has inherited role identity [${inheritedList.join(', ')}] without own decoration; expected own @Router — decorate "${className}" directly with @Router (inherited decorators are not reused)`,
        );
      }
      throw new Error(
        `Invalid module "${moduleName}": class "${className}" in "routers" array is not decorated with @Router; expected exactly one of @Router({ basePath }) (root) or @Router(modelName/Model) (model) — decorate "${className}" with @Router`,
      );
    }

    // --- per-entry role validation for routerOptions ---
    for (let i = 0; i < routerOptions.length; i++) {
      const cls = routerOptions[i];
      const className = this.getClassDisplayName(cls);
      const hasRootOwn = !!getOwnMetadata(cls, ROOT_ROUTER_WATERMARK);
      const hasModelOwn = !!getOwnMetadata(cls, ROUTER_WATERMARK);
      const hasDefaultOptsOwn = !!getOwnMetadata(cls, DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK);
      const hasModelOptsOwn = !!getOwnMetadata(cls, MODEL_ROUTER_OPTIONS_WATERMARK);
      const hasRootInherited = !hasRootOwn && !!getMetadata(cls, ROOT_ROUTER_WATERMARK);
      const hasModelInherited = !hasModelOwn && !!getMetadata(cls, ROUTER_WATERMARK);
      const hasDefaultOptsInherited = !hasDefaultOptsOwn && !!getMetadata(cls, DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK);
      const hasModelOptsInherited = !hasModelOptsOwn && !!getMetadata(cls, MODEL_ROUTER_OPTIONS_WATERMARK);
      const hasAnyInherited = hasRootInherited || hasModelInherited || hasDefaultOptsInherited || hasModelOptsInherited;
      const ownCount = Number(hasRootOwn) + Number(hasModelOwn) + Number(hasDefaultOptsOwn) + Number(hasModelOptsOwn);

      if (ownCount > 1) {
        const found: string[] = [];
        if (hasRootOwn) found.push('@Router (root)');
        if (hasModelOwn) found.push('@Router (model)');
        if (hasDefaultOptsOwn) found.push('@RouterOptions (default)');
        if (hasModelOptsOwn) found.push('@RouterOptions (model)');
        throw new Error(
          `Invalid module "${moduleName}": class "${className}" in "routerOptions" array has conflicting role watermarks [${found.join(', ')}]; expected exactly one supported role — @RouterOptions({ }) for default or @RouterOptions(modelName/Model) for model — remove extra decorators`,
        );
      }

      if (ownCount === 1) {
        if (hasAnyInherited) {
          const inheritedList: string[] = [];
          if (hasRootInherited) inheritedList.push('@Router (root) inherited');
          if (hasModelInherited) inheritedList.push('@Router (model) inherited');
          if (hasDefaultOptsInherited) inheritedList.push('@RouterOptions (default) inherited');
          if (hasModelOptsInherited) inheritedList.push('@RouterOptions (model) inherited');
          throw new Error(
            `Invalid module "${moduleName}": class "${className}" in "routerOptions" array has inherited role identity [${inheritedList.join(', ')}] without own decoration; expected own @RouterOptions — decorate "${className}" directly with @RouterOptions (inherited decorators are not reused)`,
          );
        }
        if (hasRootOwn || hasModelOwn) {
          const found = hasRootOwn ? '@Router (root)' : '@Router (model)';
          throw new Error(
            `Invalid module "${moduleName}": class "${className}" in "routerOptions" array is decorated as ${found} but placed in "routerOptions"; expected @RouterOptions — move "${className}" to "routers" array or decorate with @RouterOptions`,
          );
        }
        continue;
      }

      if (hasAnyInherited) {
        const inheritedList: string[] = [];
        if (hasRootInherited) inheritedList.push('@Router (root) inherited');
        if (hasModelInherited) inheritedList.push('@Router (model) inherited');
        if (hasDefaultOptsInherited) inheritedList.push('@RouterOptions (default) inherited');
        if (hasModelOptsInherited) inheritedList.push('@RouterOptions (model) inherited');
        throw new Error(
          `Invalid module "${moduleName}": class "${className}" in "routerOptions" array has inherited role identity [${inheritedList.join(', ')}] without own decoration; expected own @RouterOptions — decorate "${className}" directly with @RouterOptions (inherited decorators are not reused)`,
        );
      }
      throw new Error(
        `Invalid module "${moduleName}": class "${className}" in "routerOptions" array is not decorated with @RouterOptions; expected exactly one of @RouterOptions({ }) (default) or @RouterOptions(modelName/Model) (model) — decorate "${className}" with @RouterOptions`,
      );
    }

    // --- uniqueness validation ---
    // one default-options provider per module
    const defaultProviders: Type[] = [];
    for (const cls of routerOptions) {
      if (getOwnMetadata(cls, DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK)) defaultProviders.push(cls);
    }
    if (defaultProviders.length > 1) {
      const names = defaultProviders.map((c) => `"${this.getClassDisplayName(c)}"`).join(', ');
      throw new Error(
        `Invalid module "${moduleName}": duplicate default RouterOptions provider in "routerOptions" array: classes ${names} both provide default model options; expected at most one default provider per module`,
      );
    }

    // one model-options provider per effective model
    const modelOptsMap = new Map<string, Type[]>();
    for (const cls of routerOptions) {
      if (getOwnMetadata(cls, MODEL_ROUTER_OPTIONS_WATERMARK)) {
        const modelName = this.resolveModelNameForValidation(cls);
        if (modelName == null) continue;
        const list = modelOptsMap.get(modelName) || [];
        list.push(cls);
        modelOptsMap.set(modelName, list);
      }
    }
    for (const [modelName, list] of modelOptsMap.entries()) {
      if (list.length > 1) {
        const names = list.map((c) => `"${this.getClassDisplayName(c)}"`).join(', ');
        throw new Error(
          `Invalid module "${moduleName}": duplicate RouterOptions provider for model "${modelName}" in "routerOptions" array: classes ${names} both target model "${modelName}"; expected at most one model-options provider per model per module`,
        );
      }
    }

    // one model router per effective model
    const modelRouterMap = new Map<string, Type[]>();
    for (const cls of routers) {
      if (getOwnMetadata(cls, ROUTER_WATERMARK)) {
        const modelName = this.resolveModelNameForValidation(cls);
        if (modelName == null) continue;
        const list = modelRouterMap.get(modelName) || [];
        list.push(cls);
        modelRouterMap.set(modelName, list);
      }
    }
    for (const [modelName, list] of modelRouterMap.entries()) {
      if (list.length > 1) {
        const names = list.map((c) => `"${this.getClassDisplayName(c)}"`).join(', ');
        throw new Error(
          `Invalid module "${moduleName}": duplicate model router for effective model "${modelName}" in "routers" array: classes ${names} both target model "${modelName}"; expected at most one model router per effective model per module — use distinct models or merge into one router class`,
        );
      }
    }
  }

  private validateModuleConfiguration(module: Type, routers: Type[], routerOptions: Type[]): ModuleConfigurationPlan {
    // Fail fast before any class construction or runtime/app mutation
    this.validateModuleRoles(module, routers, routerOptions);

    const moduleInstance = new module();
    const modulePlan = this.compileRegistrationPlan(moduleInstance, 'module');
    const preparedRouterOptions: PreparedClass[] = [];
    const preparedRouters: (PreparedClass | undefined)[] = [];

    for (const DecoRouterOptions of routerOptions) {
      const role = isDefaultModelRouterOptions(DecoRouterOptions) ? 'defaultOptions' : 'modelOptions';
      const instance = new DecoRouterOptions();
      preparedRouterOptions.push({
        Type: DecoRouterOptions,
        instance,
        plan: this.compileRegistrationPlan(instance, role),
      });
    }

    for (const DecoRouter of routers) {
      if (isModelRouter(DecoRouter)) {
        const instance = new DecoRouter();
        preparedRouters.push({
          Type: DecoRouter,
          instance,
          plan: this.compileRegistrationPlan(instance, 'modelRouter'),
        });
      } else {
        // Root routers have no hook host instance. Validate their effective
        // prototype declarations without running constructors/field initializers.
        this.compileRegistrationPlan(DecoRouter.prototype, 'rootRouter', DecoRouter.prototype);
        preparedRouters.push(undefined);
      }
    }

    return {
      module: { Type: module, instance: moduleInstance, plan: modulePlan },
      routerOptions: preparedRouterOptions,
      routers: preparedRouters,
    };
  }

  private isValidHookMetadataKey(key: string, hook: HookConfig): boolean {
    if (hook.operations === null) {
      return key === hook.optionKey;
    }
    if (key === hook.optionKey) return false;
    if (!key.startsWith(`${hook.optionKey}.`)) return false;
    const suffix = key.slice(hook.optionKey.length + 1);
    if (!suffix || suffix.includes('.')) return false;
    return (hook.operations as readonly string[]).includes(suffix);
  }

  private assertNoDuplicateScalarHooks(instance: object, registrations: HookRegistration[]) {
    const seen = new Map<string, { methodName: string | symbol; hook: HookConfig }>();
    const className =
      ((instance as any).constructor?.name as string | undefined) ||
      (instance.constructor as any)?.name ||
      '<anonymous>';
    for (const reg of registrations) {
      const isScalar = !reg.hook.array || reg.hook.aclKey === 'validate';
      if (!isScalar) continue;
      for (const key of reg.metadataKeys) {
        const aclKey = getAclOptionKey(reg.hook, key);
        const prev = seen.get(aclKey);
        if (prev) {
          if (reg.hook.aclKey === 'validate') {
            throw new Error(
              `Duplicate decorated validator for ${aclKey} on ${className}.${describeMethodKey(reg.methodName)} conflicts with ${className}.${describeMethodKey(prev.methodName)} (hook ${describeHookDecorator(reg.hook)} effective ACL option "${aclKey}")`,
            );
          }
          throw new Error(
            `Duplicate decorated ${describeHookDecorator(reg.hook)} for ${aclKey} on ${className}.${describeMethodKey(reg.methodName)} conflicts with ${className}.${describeMethodKey(prev.methodName)} (effective ACL option "${aclKey}")`,
          );
        }
        seen.set(aclKey, { methodName: reg.methodName, hook: reg.hook });
      }
    }
  }

  /**
   * Build the registration plan and validate all known hooks against the class role.
   * Root routers supply their prototype directly and are never constructed.
   * Method enumeration via `getAllMethodNames` is base-to-derived and symbol-safe:
   * - distinct methods from Base→Child→GrandChild yield in that order for array hooks,
   *   so base normalization runs before child specialization;
   * - overridden keys are yielded only at the most-derived owner, discarding stale base
   *   hook and parameter metadata.
   * Property inheritance (`registerPropertyOptions` via `getOwnMetadataListFromPrototypeChain`)
   * remains independently base-to-derived with child replacement.
   */
  private compileRegistrationPlan(
    instance: object,
    role: HookClassRole,
    prototype: object = Object.getPrototypeOf(instance),
  ): ClassRegistrationPlan {
    const propertyScope: OptionScope | undefined =
      role === 'module'
        ? 'global'
        : role === 'defaultOptions'
          ? 'default'
          : role === 'modelRouter' || role === 'modelOptions'
            ? 'model'
            : undefined;
    for (const option of getOwnMetadataListFromPrototypeChain<OptionMetadata>(
      prototype,
      OPTIONS_METADATA,
      'optionKey',
    )) {
      if (!propertyScope || (option.scope && option.scope !== propertyScope)) {
        throw new TypeError(
          `Invalid option scope on ${describeTarget(instance, option.propertyKey)}: ${option.scope ?? 'legacy'} option ${String(option.optionKey)} is not supported on ${HOOK_CLASS_ROLES[role].label}`,
        );
      }
    }
    const methodNames = [...getAllMethodNames(prototype)];
    const { label, hooks }: { label: string; hooks: readonly HookConfig[] } = HOOK_CLASS_ROLES[role];
    const registrations: HookRegistration[] = [];

    for (const methodName of methodNames) {
      // Bootstrap-local, no process-global cache: one prototype traversal + one
      // descriptor/metadata lookup per effective method. Previously this loop
      // filtered every hook definition via isHookMethod which re-traversed
      // the prototype chain per hook (O(methods * hooks * prototypes)).
      // Fetch the owner/descriptor once and read its member anchor plus legacy
      // function metadata (no extra prototype walk per hook).
      const owner = getMethodOwner(instance, methodName);
      if (!owner) continue;
      const descriptor = Reflect.getOwnPropertyDescriptor(owner, methodName);
      if (!descriptor || typeof descriptor.value !== 'function') continue;
      const metadata = getMethodMetadataReader(owner, methodName, descriptor.value);

      // Discover every known family in this same bounded traversal. Filtering
      // to allowed hooks first would silently drop wrong-role declarations,
      // including a disallowed family mixed with otherwise valid hooks.
      const matches = HOOK_DEFINITION_LIST.filter((hook) => metadata.get(hook.watermark));
      if (matches.length === 0) continue;
      const targetName = describeTarget(instance, methodName);
      for (const hook of matches) {
        if (hooks.includes(hook)) continue;
        const placements = Object.values(HOOK_CLASS_ROLES)
          .filter((entry) => (entry.hooks as readonly HookConfig[]).includes(hook))
          .map((entry) => entry.label);
        throw new Error(
          `Invalid decorator configuration on ${targetName}: ${describeHookDecorator(hook)} is not supported on ${label}; valid placement: ${placements.join(', ')}. Move the hook to a provider with a supported role`,
        );
      }
      if (matches.length > 1) {
        throw new Error(
          `Invalid decorator configuration on ${targetName}: multiple hook decorators (${matches
            .map(describeHookDecorator)
            .join(', ')}) are not supported; split each hook onto its own method`,
        );
      }
      const hook = matches[0];

      const params = this.getMethodParamMetadataFromOwner(owner, instance, methodName);
      this.validateMethodParams(params, hook, targetName);
      const rawKeys = metadata.keysStartWith(hook.optionKey);
      const metadataKeys = rawKeys.filter((k) => this.isValidHookMetadataKey(k, hook));
      if (metadataKeys.length === 0) continue;
      registrations.push({
        methodName,
        hook,
        metadataKeys,
        params,
      });
    }

    this.assertNoDuplicateScalarHooks(instance, registrations);

    return { hooks: registrations };
  }

  private getMethodParamMetadataFromOwner(
    owner: object,
    instance: object,
    methodName: string | symbol,
  ): HookParamMetadata[] {
    const metadataTarget = owner && 'constructor' in owner ? (owner as any).constructor : (instance as any).constructor;
    return (Reflect.getOwnMetadata(ARGS_METADATA, metadataTarget, methodName) as HookParamMetadata[] | undefined) || [];
  }

  private validateMethodFunction(instance: object, methodName: string | symbol, hook: HookConfig, targetName: string) {
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
    if (registration.metadataKeys.length === 0) return;
    if (!registration.metadataKeys.some((k) => this.isValidHookMetadataKey(k, hook))) return;
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
    scope?: { modelName: string | null; isDefault: boolean },
  ) {
    const { hook } = registration;
    for (let x = 0; x < registration.metadataKeys.length; x++) {
      const key = registration.metadataKeys[x];
      if (!this.isValidHookMetadataKey(key, hook)) continue;
      const val = getMethodMetadata(routerOrOptions, registration.methodName, key);
      if (val !== true) continue;

      const fn = this.wrapMethod(routerOrOptions, registration);
      if (!fn) continue;

      const aclOptionKey = getAclOptionKey(hook, key);

      if (hook.array && hook.aclKey !== 'validate') {
        if (scope) {
          assertArrayRootShorthandFree(
            this.runtime as any,
            scope.modelName,
            scope.isDefault,
            aclOptionKey,
            registration.methodName,
          );
          const exact = readExactStoredOption(this.runtime as any, scope.modelName, scope.isDefault, aclOptionKey);
          setOption(aclOptionKey, appendHook(exact, fn, aclOptionKey));
        } else {
          setOption(aclOptionKey, appendHook(getOption(aclOptionKey), fn, aclOptionKey));
        }
      } else {
        if (hook.aclKey === 'validate') {
          const current = scope
            ? getValidateExactConflict(this.runtime as any, scope.modelName, scope.isDefault, aclOptionKey)
            : getValidateOperationOption(aclOptionKey, getOption);
          assertNoDuplicateValidateHook(aclOptionKey, current, registration.methodName);
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
      // Assign each injected value at its declared parameter index so
      // undecorated positions stay undefined (holes) instead of compacting.
      // Holes spread/apply as `undefined`, letting default parameters apply.
      const sparse: unknown[] = [];
      const sorted = params.slice().sort((a, b) => a.index - b.index);
      for (const meta of sorted) {
        if (meta.type === HookParamtypes.REQUEST) {
          sparse[meta.index] = this;
          continue;
        }

        const index = arglist.findIndex((v) => v === meta.type);
        sparse[meta.index] = args[index];
      }

      return dtor.value.apply(target, sparse);
    };
  }

  private getMethodParamMetadata(target: object, methodName: string | symbol): HookParamMetadata[] {
    const methodOwner = getMethodOwner(target, methodName);
    const metadataTarget = methodOwner && 'constructor' in methodOwner ? methodOwner.constructor : target.constructor;
    return (Reflect.getOwnMetadata(ARGS_METADATA, metadataTarget, methodName) as HookParamMetadata[] | undefined) || [];
  }
}

export const EgoseFactory = EgoseFactoryStatic.create(acl);
