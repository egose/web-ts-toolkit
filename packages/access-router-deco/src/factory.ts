import express, { Express, Router } from 'express';
import acl, { ModelRouterOptions } from '@web-ts-toolkit/access-router';
import {
  MODULE_ROUTERS,
  MODULE_ROUTER_OPTIONS,
  MODULE_OPTIONS,
  ROUTER_MODEL,
  ROUTER_OPTIONS,
  OPTIONS_METADATA,
  ARGS_METADATA,
  ARGS,
  HookParamtypes,
} from './constants';
import {
  getMetadata,
  getMethodMetadata,
  getAllMethodNames,
  getMethodDescriptor,
  getMethodMetadataKeysStartWith,
  isRootRouter,
  isModelRouter,
  isDefaultModelRouterOptions,
  isModelRouterOptions,
  isGlobalPermissionsMethod,
  isDocPermissionsMethod,
  isBaseFilterMethod,
  isOverrideFilterMethod,
  isValidateMethod,
  isPrepareMethod,
  isTransformMethod,
  isAfterPersistMethod,
  isDecorateMethod,
  isDecorateAllMethod,
  isRouteGuardMethod,
  isIdentifierMethod,
  isBeforeDeleteMethod,
  isAfterDeleteMethod,
} from './metadata';
import { Type } from './interfaces';

const toArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);

const compact = <T>(arr: (T | null | undefined)[]): T[] => arr.filter((x): x is T => x != null);

const HOOK_CONFIG: {
  check: (obj: object, method: string) => boolean;
  optionKey: string;
  aclKey: string;
  array: boolean;
}[] = [
  { check: isDocPermissionsMethod, optionKey: 'docPermissions', aclKey: 'docPermissions', array: false },
  { check: isBaseFilterMethod, optionKey: 'baseFilter', aclKey: 'baseFilter', array: false },
  { check: isOverrideFilterMethod, optionKey: 'overrideFilter', aclKey: 'overrideFilter', array: false },
  { check: isValidateMethod, optionKey: 'validate', aclKey: 'validate', array: true },
  { check: isPrepareMethod, optionKey: 'prepare', aclKey: 'prepare', array: true },
  { check: isTransformMethod, optionKey: 'transform', aclKey: 'transform', array: true },
  { check: isAfterPersistMethod, optionKey: 'afterPersist', aclKey: 'afterPersist', array: true },
  { check: isDecorateMethod, optionKey: 'decorate', aclKey: 'decorate', array: true },
  { check: isDecorateAllMethod, optionKey: 'decorateAll', aclKey: 'decorateAll', array: true },
  { check: isRouteGuardMethod, optionKey: 'routeGuard', aclKey: 'operationAccess', array: false },
  { check: isIdentifierMethod, optionKey: 'identifier', aclKey: 'resolveIdFilter', array: false },
  { check: isBeforeDeleteMethod, optionKey: 'beforeDelete', aclKey: 'beforeDelete', array: false },
  { check: isAfterDeleteMethod, optionKey: 'afterDelete', aclKey: 'afterDelete', array: false },
];

type OptionSetter = (aclKey: string, value: any) => void;
type OptionGetter = (aclKey: string) => any;

/**
 * @publicApi
 */
export class EgoseFactoryStatic {
  private _expressApp!: Express;

  static create(): EgoseFactoryStatic {
    return new EgoseFactoryStatic();
  }

  private constructor() {}

  public bootstrap(module: Type<any>, expressApp: Express) {
    this._expressApp = expressApp;
    const routers = getMetadata(module, MODULE_ROUTERS) || [];
    const routerOptions = getMetadata(module, MODULE_ROUTER_OPTIONS) || [];
    const globalOptions = getMetadata(module, MODULE_OPTIONS) || {};

    acl.setGlobalOptions(globalOptions);
    this.bootstrapEgose(module);

    const expressRouter = express.Router();
    const basePath = globalOptions.basePath || '/';

    for (let x = 0; x < routers.length; x++) {
      const router = routers[x];
      if (isRootRouter(router)) this.bootstrapRootRouter(router, expressRouter);
      else if (isModelRouter(router)) this.bootstrapModelRouter(router, expressRouter);
    }

    for (let x = 0; x < routerOptions.length; x++) {
      const routerOption = routerOptions[x];
      if (isDefaultModelRouterOptions(routerOption)) this.setDefaultModelRouterOptions(routerOption);
      else if (isModelRouterOptions(routerOption)) this.setModelRouterOptions(routerOption);
    }

    this._expressApp.use(basePath, expressRouter);

    if (globalOptions.handleErrors) {
      this._expressApp.use((req, res, next) => {
        next(new Error('Not Found'));
      });

      this._expressApp.use((err: any, req: any, res: any, next: any) => {
        res.status(err.status || 500);
        res.json({ message: err.message, error: err });
      });
    }
  }

  private bootstrapEgose(module: Type<any>) {
    const moduleInstance = new module();
    this.registerPropertyOptions(moduleInstance, (key, val) => acl.setGlobalOption(key as any, val));

    const methodNames = new Set(getAllMethodNames(module.prototype));
    for (const methodName of methodNames) {
      if (isGlobalPermissionsMethod(moduleInstance, methodName)) {
        this.registerMethodHookGlobal(moduleInstance, methodName, 'globalPermissions', 'globalPermissions', false);
      }
    }

    this._expressApp.use(acl());
  }

  private bootstrapRootRouter(router: any, expressRouter: Router) {
    const options = getMetadata(router, ROUTER_OPTIONS);
    const rootRouter = acl.createRouter(options);
    expressRouter.use(rootRouter.routes);
  }

  private bootstrapModelRouter(DecoRouter: any, expressRouter: Router) {
    const modelName = getMetadata(DecoRouter, ROUTER_MODEL) as string;
    const options = getMetadata(DecoRouter, ROUTER_OPTIONS) as ModelRouterOptions;
    const modelRouter = acl.createRouter(modelName, options);

    const instance = new DecoRouter();
    this.registerPropertyOptions(instance, (key, val) => acl.setModelOption(modelName, key as any, val));
    this.registerMethodOptions(
      instance,
      DecoRouter.prototype,
      (key, val) => acl.setModelOption(modelName, key as any, val),
      (key) => acl.getModelOption(modelName, key as any),
    );

    expressRouter.use(modelRouter.routes);
  }

  private setDefaultModelRouterOptions(DecoRouterOptions: any) {
    const options = getMetadata(DecoRouterOptions, ROUTER_OPTIONS) as ModelRouterOptions;
    acl.setDefaultModelOptions(options);

    const instance = new DecoRouterOptions();
    this.registerPropertyOptions(instance, (key, val) => acl.setDefaultModelOption(key as any, val));
    this.registerMethodOptions(
      instance,
      DecoRouterOptions.prototype,
      (key, val) => acl.setDefaultModelOption(key as any, val),
      (key) => acl.getDefaultModelOption(key as any),
      [{ check: isRouteGuardMethod, optionKey: 'routeGuard', aclKey: 'operationAccess', array: false }],
    );
  }

  private setModelRouterOptions(DecoRouterOptions: any) {
    const modelName = getMetadata(DecoRouterOptions, ROUTER_MODEL) as string;
    const options = getMetadata(DecoRouterOptions, ROUTER_OPTIONS) as ModelRouterOptions;
    acl.setModelOptions(modelName, options);

    const instance = new DecoRouterOptions();
    this.registerPropertyOptions(instance, (key, val) => acl.setModelOption(modelName, key as any, val));
    this.registerMethodOptions(
      instance,
      DecoRouterOptions.prototype,
      (key, val) => acl.setModelOption(modelName, key as any, val),
      (key) => acl.getModelOption(modelName, key as any),
    );
  }

  private registerPropertyOptions(instance: any, setOption: OptionSetter) {
    const optionProps: { optionKey: string; propertyKey: string }[] = getMetadata(instance, OPTIONS_METADATA) || [];

    for (let x = 0; x < optionProps.length; x++) {
      const optionProp = optionProps[x];
      const value = instance[optionProp.propertyKey];
      setOption(optionProp.optionKey, value);
    }
  }

  private registerMethodOptions(
    instance: any,
    prototype: any,
    setOption: OptionSetter,
    getOption: OptionGetter,
    filter?: { check: (obj: object, method: string) => boolean; optionKey: string; aclKey: string; array: boolean }[],
  ) {
    const methodNames = new Set(getAllMethodNames(prototype));
    const hooks = filter || HOOK_CONFIG;

    for (const methodName of methodNames) {
      for (const hook of hooks) {
        if (hook.check(instance, methodName)) {
          this.registerMethodHookOnAcl(
            instance,
            methodName,
            hook.optionKey,
            hook.aclKey,
            hook.array,
            setOption,
            getOption,
          );
          break;
        }
      }
    }
  }

  private registerMethodHookGlobal(
    routerOrOptions: any,
    methodName: string,
    optionKey: string,
    aclKey: string,
    arrayType: boolean,
  ) {
    const fn = this.wrapMethod(routerOrOptions, methodName, optionKey);
    if (!fn) return;

    if (arrayType) {
      const curr = toArray(compact([acl.getGlobalOption(aclKey as any)]));
      acl.setGlobalOption(aclKey as any, [...curr, fn] as any);
    } else {
      acl.setGlobalOption(aclKey as any, fn as any);
    }
  }

  private registerMethodHookOnAcl(
    routerOrOptions: any,
    methodName: string,
    optionKey: string,
    aclKey: string,
    arrayType: boolean,
    setOption: OptionSetter,
    getOption: OptionGetter,
  ) {
    const keys = getMethodMetadataKeysStartWith(routerOrOptions, methodName, optionKey);
    for (let x = 0; x < keys.length; x++) {
      const key = keys[x];
      const val = getMethodMetadata(routerOrOptions, methodName, key);
      if (val !== true) continue;

      const fn = this.wrapMethod(routerOrOptions, methodName, optionKey);
      if (!fn) continue;

      // Map decorator metadata key to access-router option key.
      // e.g. "routeGuard.delete" → "operationAccess.delete" (decorator name differs from ACL key)
      // e.g. "docPermissions.create" → "docPermissions.create" (same key, no transformation needed)
      const aclOptionKey = optionKey === aclKey ? key : key.replace(optionKey, aclKey);

      if (arrayType) {
        const curr = toArray(compact([getOption(aclOptionKey)]));
        setOption(aclOptionKey, [...curr, fn]);
      } else {
        setOption(aclOptionKey, fn);
      }
    }
  }

  private wrapMethod(target: object, methodName: string, optionKey: string) {
    const dtor = getMethodDescriptor(target, methodName);
    if (!dtor || typeof dtor.value !== 'function') return null;

    const arglist = ARGS[optionKey as keyof typeof ARGS] || [];
    const metalist = Reflect.getMetadata(ARGS_METADATA, target.constructor, methodName) || [];

    return function (this: any, ...args: any[]) {
      const ordered = metalist
        .slice()
        .sort((a: any, b: any) => a.index - b.index)
        .map((meta: any) => {
          if (meta.type === HookParamtypes.REQUEST) return this;

          const index = arglist.findIndex((v: number) => v === meta.type);
          return args[index];
        });

      return dtor.value.call(target, ...ordered);
    };
  }
}

export const EgoseFactory = EgoseFactoryStatic.create();
