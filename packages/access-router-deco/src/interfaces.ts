import type { AccessRuntimeApi, GlobalOptions } from '@web-ts-toolkit/access-router';
import type { Router } from 'express';
import type mongoose from 'mongoose';

export type Type<T extends object = object> = new () => T;

/**
 * Interface defining the property object that describes the module.
 *
 * Module composition is validated before any class is instantiated:
 * - each entry in `routers` must be decorated with exactly one `@Router` role
 *   (either root `@Router(options)` or model `@Router(modelName)` / `@Router(Model)`),
 *   must have its own watermark (inherited decorators are not reused), and must not
 *   carry a `@RouterOptions` watermark (wrong-array);
 * - each entry in `routerOptions` must be decorated with exactly one
 *   `@RouterOptions` role (either default `@RouterOptions(options)` or model
 *   `@RouterOptions(modelName)`), must have its own watermark, and must not carry
 *   a `@Router` watermark;
 * - undecorated, dual-role (multiple watermarks), inherited-identity, and
 *   wrong-array entries fail fast before constructor execution or runtime mutation;
 * - provider uniqueness per module: at most one default-options provider, at most one
 *   model-options provider per effective model, and at most one model router per
 *   effective model; multiple distinct root routers and distinct model routers (different
 *   effective models) remain supported.
 *
 * @publicApi
 */
export interface ModuleMetadata {
  /** Classes decorated with `@Router` — exactly one root or model role per entry (own watermark, no `@RouterOptions`). */
  routers: Type[];
  /** Classes decorated with `@RouterOptions` — exactly one default or model role per entry (own watermark, no `@Router`). */
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

/**
 * Model reference accepted by `@Router(...)` and `@RouterOptions(...)`.
 *
 * A model name string (resolved against Mongoose's default connection at
 * bootstrap) or a Mongoose model instance (registered with the factory's
 * bound runtime before route creation, keeping same-name models from
 * separate connections isolated).
 *
 * The parameter stays generic so `RouterModel<User>` composes through
 * variables and function parameters while decorator overloads keep
 * model-specific option inference (`ModelRouterOptions<TModel>`). The
 * bare default (`RouterModel`) accepts any model type: Mongoose's
 * `Model<T>` is invariant in `T`, so `Model<unknown>` would reject
 * ordinary typed models such as `Model<{ name: string }>`; the `any`
 * default is confined to this alias and the union overloads below rather
 * than widening option or hook types.
 *
 * @publicApi
 */
export type RouterModel<TModel = any> = string | mongoose.Model<TModel>;
