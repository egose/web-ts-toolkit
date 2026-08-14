import {
  Accepted,
  AlreadyReported,
  Created,
  createHandler,
  ErrorFormats,
  HttpResponse,
  IMUsed,
  MultiStatus,
  NoContent,
  NonAuthoritativeInfo,
  OK,
  PartialContent,
  ResetContent,
  type ExpressResponseHandler,
  type MaybePromise,
} from '@web-ts-toolkit/express-response-handler';
import apiHandler from '@web-ts-toolkit/express-response-handler';
import * as clientErrors from '@web-ts-toolkit/http-errors';
import { addLeadingSlash } from '@web-ts-toolkit/utils';
import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const DEFAULT_RESPONSE_HANDLER = apiHandler;

const SUPPORTED_ROUTE_METHODS = Object.freeze([
  'acl',
  'all',
  'bind',
  'checkout',
  'connect',
  'copy',
  'delete',
  'get',
  'head',
  'link',
  'lock',
  'merge',
  'mkactivity',
  'mkcalendar',
  'mkcol',
  'move',
  'm-search',
  'notify',
  'options',
  'patch',
  'post',
  'propfind',
  'proppatch',
  'purge',
  'put',
  'query',
  'rebind',
  'report',
  'search',
  'source',
  'subscribe',
  'trace',
  'unbind',
  'unlink',
  'unlock',
  'unsubscribe',
] as const);

/** HTTP methods supported by `JsonRouter` registration and endpoint metadata. */
export type JsonRouterMethod = (typeof SUPPORTED_ROUTE_METHODS)[number];

/** Snapshot entry returned by `JsonRouter#getEndpoints()`. */
export type JsonRouterEndpoint = {
  method: Uppercase<JsonRouterMethod>;
  path: string;
};

type JsonRouterParams = Record<string, string>;
type JsonRouterQuery = Record<string, string | string[] | undefined>;

/** Route handler callback accepted by `JsonRouter` methods and route builders. */
export type JsonRouterCallback<
  Params = JsonRouterParams,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = JsonRouterQuery,
  Locals extends Record<string, unknown> = Record<string, unknown>,
  Return = unknown,
> = (
  req: Request<Params, ResBody, ReqBody, ReqQuery, Locals>,
  res: Response<ResBody, Locals>,
  next: NextFunction,
) => MaybePromise<Return>;

/** Recursive callback input accepted by router-level middleware and route registrations. */
export type JsonRouterHandlerInput<
  Params = JsonRouterParams,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = JsonRouterQuery,
  Locals extends Record<string, unknown> = Record<string, unknown>,
  Return = unknown,
> =
  | JsonRouterCallback<Params, ResBody, ReqBody, ReqQuery, Locals, Return>
  | readonly JsonRouterHandlerInput<Params, ResBody, ReqBody, ReqQuery, Locals, Return>[];

type JsonRouterMiddlewareInput = JsonRouterCallback | RequestHandler | readonly JsonRouterMiddlewareInput[];

/** Middleware callback or nested callback array accepted by the constructor. */
export type JsonRouterMiddlewares = JsonRouterMiddlewareInput | readonly JsonRouterMiddlewareInput[];

/** Registrar function exposed for each supported HTTP method on a `JsonRouter`. */
export type JsonRouterRouteRegistrar = <
  Params = JsonRouterParams,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = JsonRouterQuery,
  Locals extends Record<string, unknown> = Record<string, unknown>,
  Return = unknown,
>(
  path: string,
  ...callbacks: JsonRouterHandlerInput<Params, ResBody, ReqBody, ReqQuery, Locals, Return>[]
) => JsonRouter;

/** Fluent builder returned by `JsonRouter#route(path)`. */
export type JsonRouteBuilder = {
  [Method in JsonRouterMethod]: <
    Params = JsonRouterParams,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = JsonRouterQuery,
    Locals extends Record<string, unknown> = Record<string, unknown>,
    Return = unknown,
  >(
    ...callbacks: JsonRouterHandlerInput<Params, ResBody, ReqBody, ReqQuery, Locals, Return>[]
  ) => JsonRouteBuilder;
};

type JsonRouterRouteRegistrars = { readonly [Method in JsonRouterMethod]: JsonRouterRouteRegistrar };
type JsonRouterConstructor = Omit<typeof JsonRouterBase, 'prototype'> & {
  new (basePath?: string, middlewares?: JsonRouterMiddlewares, responseHandler?: ExpressResponseHandler): JsonRouter;
  readonly prototype: JsonRouter;
};
type ExpressRouter = ReturnType<typeof express.Router>;
type SharedHandlerProperty = 'errorMessageProvider' | 'preJson' | 'postJson' | 'preError' | 'postError';
type RouteHandler = (...args: unknown[]) => unknown;
type HandlerDefaults = Pick<ExpressResponseHandler, SharedHandlerProperty>;

const assertStringPath: (value: unknown, label: string) => asserts value is string = (value, label) => {
  if (typeof value !== 'string') {
    throw new TypeError(`JsonRouter ${label} must be a string path`);
  }
};

const success = {
  OK,
  Created,
  Accepted,
  NonAuthoritativeInfo,
  NoContent,
  ResetContent,
  PartialContent,
  MultiStatus,
  AlreadyReported,
  IMUsed,
};

const normalizeBasePath = (value: string): string => {
  assertStringPath(value, 'basePath');

  if (!value || value === '/') {
    return '';
  }

  return addLeadingSlash(value).replace(/\/+$/, '');
};

const joinRoutePath = (basePath: string, path: string): string => {
  assertStringPath(path, 'route path');

  return `${basePath}${addLeadingSlash(path)}`;
};

const assertJsonRouterCallback: (handler: unknown) => asserts handler is JsonRouterCallback = (handler) => {
  if (typeof handler !== 'function') {
    throw new TypeError('middleware handler must be a function');
  }

  if (handler.length >= 4) {
    throw new TypeError('route-local error middleware must be mounted with use()');
  }
};

const flattenHandlerInputs = (handlers: readonly unknown[]): JsonRouterCallback[] => {
  const flattened: JsonRouterCallback[] = [];

  for (const handler of handlers) {
    if (Array.isArray(handler)) {
      flattened.push(...flattenHandlerInputs(handler));
      continue;
    }

    assertJsonRouterCallback(handler);
    flattened.push(handler);
  }

  return flattened;
};

const assertHasMiddleware = (handlers: readonly JsonRouterCallback[]): void => {
  if (handlers.length === 0) {
    throw new TypeError('at least one middleware handler is required');
  }
};

const toMiddlewareList = (middlewares?: JsonRouterMiddlewares): JsonRouterCallback[] => {
  if (!middlewares) {
    return [];
  }

  return flattenHandlerInputs(Array.isArray(middlewares) ? middlewares : [middlewares]);
};

const createResponseHandlerFromDefaults = (defaults: HandlerDefaults): ExpressResponseHandler => {
  const handler = createHandler();

  handler.errorMessageProvider = defaults.errorMessageProvider;
  handler.preJson = defaults.preJson;
  handler.postJson = defaults.postJson;
  handler.preError = defaults.preError;
  handler.postError = defaults.postError;

  return handler;
};

/**
 * Express router that serializes route handler return values as JSON and
 * converts thrown `HttpError`s into structured error responses.
 *
 * @example
 * import JsonRouter from '@web-ts-toolkit/express-json-router';
 * const router = new JsonRouter('/api');
 * router.get('/health', () => ({ ok: true }));
 */
class JsonRouterBase {
  private readonly _methods: JsonRouterMethod[] = [];
  private readonly _endpoints: JsonRouterEndpoint[] = [];
  private readonly _middlewares: JsonRouterCallback[];
  /** Normalized base path prepended to every registered route. */
  readonly basePath: string;
  /** Response handler instance captured when this router is constructed. */
  readonly responseHandler: ExpressResponseHandler;
  private readonly _router: ExpressRouter;
  private static defaultHandlerDefaults: HandlerDefaults = {
    errorMessageProvider: DEFAULT_RESPONSE_HANDLER.errorMessageProvider,
    preJson: DEFAULT_RESPONSE_HANDLER.preJson,
    postJson: DEFAULT_RESPONSE_HANDLER.postJson,
    preError: DEFAULT_RESPONSE_HANDLER.preError,
    postError: DEFAULT_RESPONSE_HANDLER.postError,
  };

  private static getSharedHandlerProperty<Name extends SharedHandlerProperty>(name: Name): HandlerDefaults[Name] {
    return JsonRouterBase.defaultHandlerDefaults[name];
  }

  private static setSharedHandlerProperty<Name extends SharedHandlerProperty>(
    name: Name,
    value: HandlerDefaults[Name],
  ): void {
    JsonRouterBase.defaultHandlerDefaults[name] = value;
  }

  static readonly clientErrors = clientErrors;
  static readonly success = success;
  static readonly HttpResponse = HttpResponse;
  static readonly ErrorFormats = ErrorFormats;
  static readonly createHandler = createHandler;
  static readonly supportedMethods = SUPPORTED_ROUTE_METHODS;

  /**
   * Creates a fresh response handler from the current static defaults.
   * Existing routers keep the handler instance captured during construction.
   */
  static get defaultHandler(): ExpressResponseHandler {
    return createResponseHandlerFromDefaults(JsonRouterBase.defaultHandlerDefaults);
  }

  static get errorMessageProvider(): typeof DEFAULT_RESPONSE_HANDLER.errorMessageProvider {
    return JsonRouterBase.getSharedHandlerProperty('errorMessageProvider');
  }

  static set errorMessageProvider(customErrorMessageProvider: typeof DEFAULT_RESPONSE_HANDLER.errorMessageProvider) {
    JsonRouterBase.setSharedHandlerProperty('errorMessageProvider', customErrorMessageProvider);
  }

  static get preJson(): typeof DEFAULT_RESPONSE_HANDLER.preJson {
    return JsonRouterBase.getSharedHandlerProperty('preJson');
  }

  static set preJson(preJsonHookFn: typeof DEFAULT_RESPONSE_HANDLER.preJson) {
    JsonRouterBase.setSharedHandlerProperty('preJson', preJsonHookFn);
  }

  static get postJson(): typeof DEFAULT_RESPONSE_HANDLER.postJson {
    return JsonRouterBase.getSharedHandlerProperty('postJson');
  }

  static set postJson(postJsonHookFn: typeof DEFAULT_RESPONSE_HANDLER.postJson) {
    JsonRouterBase.setSharedHandlerProperty('postJson', postJsonHookFn);
  }

  static get preError(): typeof DEFAULT_RESPONSE_HANDLER.preError {
    return JsonRouterBase.getSharedHandlerProperty('preError');
  }

  static set preError(preErrorHookFn: typeof DEFAULT_RESPONSE_HANDLER.preError) {
    JsonRouterBase.setSharedHandlerProperty('preError', preErrorHookFn);
  }

  static get postError(): typeof DEFAULT_RESPONSE_HANDLER.postError {
    return JsonRouterBase.getSharedHandlerProperty('postError');
  }

  static set postError(postErrorHookFn: typeof DEFAULT_RESPONSE_HANDLER.postError) {
    JsonRouterBase.setSharedHandlerProperty('postError', postErrorHookFn);
  }

  /**
   * Creates a JSON router with a normalized base path, optional shared middleware,
   * and a snapshot of the current static response-handler defaults.
   */
  constructor(
    basePath = '',
    middlewares?: JsonRouterMiddlewares,
    responseHandler: ExpressResponseHandler = JsonRouterBase.defaultHandler,
  ) {
    this.basePath = normalizeBasePath(basePath);
    this._middlewares = toMiddlewareList(middlewares);
    this.responseHandler = responseHandler;
    this._router = express.Router();

    for (const method of SUPPORTED_ROUTE_METHODS) {
      const routerMethod = (this._router as ExpressRouter & Partial<Record<JsonRouterMethod, RouteHandler>>)[method];

      if (typeof routerMethod !== 'function') {
        throw new Error(`Express Router does not expose the supported ${method.toUpperCase()} route method`);
      }

      this._methods.push(method);

      Object.defineProperty(this, method, {
        value: (path: string, ...callbacks: JsonRouterHandlerInput[]) => {
          const routeCallbacks = flattenHandlerInputs(callbacks);
          assertHasMiddleware(routeCallbacks);

          const fullPath = joinRoutePath(this.basePath, path);
          const handlers = this.responseHandler.handleResponse([...this._middlewares, ...routeCallbacks]);

          routerMethod.call(this._router, fullPath, handlers);
          this.addEndpoint(method, fullPath);

          return this;
        },
        enumerable: false,
        writable: false,
        configurable: false,
      });
    }
  }

  /** Middleware callbacks captured during construction. */
  get middlewares(): JsonRouterCallback[] {
    return this._middlewares.slice();
  }

  /** Underlying Express router to mount with `app.use(router.original)`. */
  get original(): ExpressRouter {
    return this._router;
  }

  param(...args: Parameters<ExpressRouter['param']>): ReturnType<ExpressRouter['param']> {
    return this._router.param(...args);
  }

  use(...args: Parameters<ExpressRouter['use']>): ReturnType<ExpressRouter['use']> {
    return this._router.use(...args);
  }

  /**
   * Starts a fluent route builder for one path.
   * Registered handlers still pass through this router's response handler.
   */
  route(path: string): JsonRouteBuilder {
    assertStringPath(path, 'route path');

    const definition = {} as JsonRouteBuilder;

    for (const method of this._methods) {
      Object.defineProperty(definition, method, {
        value: (...callbacks: JsonRouterHandlerInput[]) => {
          (this as unknown as JsonRouter)[method](path, ...callbacks);
          return definition;
        },
        enumerable: false,
        writable: false,
        configurable: false,
      });
    }

    return definition;
  }

  private addEndpoint(method: JsonRouterMethod, path: string): void {
    this._endpoints.push({
      method: method.toUpperCase() as Uppercase<JsonRouterMethod>,
      path: this.normalizePath(path),
    });
  }

  /** Returns a defensive copy of registered endpoint method/path metadata. */
  getEndpoints(): JsonRouterEndpoint[] {
    return this._endpoints.map((endpoint) => ({ ...endpoint }));
  }

  private normalizePath(path: string): string {
    return addLeadingSlash(path);
  }
}

interface JsonRouter extends JsonRouterBase, JsonRouterRouteRegistrars {}

const JsonRouter = JsonRouterBase as unknown as JsonRouterConstructor;

export default JsonRouter;
