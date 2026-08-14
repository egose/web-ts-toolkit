import type { AccessRuntimeApi, GlobalOptions } from '@web-ts-toolkit/access-router';
import type { Router } from 'express';
import type mongoose from 'mongoose';

export type Type<T extends object = object> = new () => T;

/**
 * Interface defining the property object that describes the module.
 *
 * @publicApi
 */
export interface ModuleMetadata {
  routers: Type[];
  routerOptions?: Type[];
  options?: GlobalOptions & { basePath?: string; handleErrors?: boolean };
}

/**
 * Result returned by `EgoseFactory.bootstrap(...)`.
 *
 * @publicApi
 */
export interface BootstrapResult {
  runtime: AccessRuntimeApi;
  router: Router;
}

export type RouterModel = string | mongoose.Model<unknown>;
