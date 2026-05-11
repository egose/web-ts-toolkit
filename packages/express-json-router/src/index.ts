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
} from '@web-ts-toolkit/express-response-handler';
import apiHandler from '@web-ts-toolkit/express-response-handler';
import * as clientErrors from '@web-ts-toolkit/http-errors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

const DEFAULT_RESPONSE_HANDLER = apiHandler;

const METHODS = [
  'all',
  'checkout',
  'copy',
  'delete',
  'get',
  'head',
  'lock',
  'merge',
  'mkactivity',
  'mkcol',
  'move',
  'm-search',
  'notify',
  'options',
  'patch',
  'post',
  'purge',
  'put',
  'report',
  'search',
  'subscribe',
  'trace',
  'unlock',
  'unsubscribe',
] as const;

type RouteMethod = (typeof METHODS)[number];
type JsonRouterCallback = (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>;
type RouteRegistrar = (path: string, ...callbacks: JsonRouterCallback[]) => JsonRouter;
type JsonRouteBuilder = { [Method in RouteMethod]: (...callbacks: JsonRouterCallback[]) => JsonRouteBuilder };
type Endpoint = {
  method: Uppercase<RouteMethod>;
  path: string;
};
type ExpressRouter = ReturnType<typeof express.Router>;
type JsonRouterMiddlewares = JsonRouterCallback | JsonRouterCallback[];
type SharedHandlerProperty = 'errorMessageProvider' | 'preJson' | 'postJson' | 'preError' | 'postError';
type RouteHandler = (...args: unknown[]) => unknown;

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

const addLeadingSlash = (value: string): string => (value.startsWith('/') ? value : `/${value}`);

const normalizeBasePath = (value: string): string => {
  if (!value || value === '/') {
    return '';
  }

  return addLeadingSlash(value).replace(/\/+$/, '');
};

const joinRoutePath = (basePath: string, path: string): string => `${basePath}${addLeadingSlash(path)}`;

const toMiddlewareList = (middlewares?: JsonRouterCallback | JsonRouterCallback[]): JsonRouterCallback[] => {
  if (!middlewares) {
    return [];
  }

  return Array.isArray(middlewares) ? middlewares : [middlewares];
};

class JsonRouter {
  readonly methods: RouteMethod[] = [];
  readonly endpoints: Endpoint[] = [];
  readonly middlewares: JsonRouterCallback[];
  readonly basePath: string;
  readonly responseHandler: ExpressResponseHandler;
  all!: RouteRegistrar;
  checkout!: RouteRegistrar;
  copy!: RouteRegistrar;
  delete!: RouteRegistrar;
  get!: RouteRegistrar;
  head!: RouteRegistrar;
  lock!: RouteRegistrar;
  merge!: RouteRegistrar;
  mkactivity!: RouteRegistrar;
  mkcol!: RouteRegistrar;
  move!: RouteRegistrar;
  ['m-search']!: RouteRegistrar;
  notify!: RouteRegistrar;
  options!: RouteRegistrar;
  patch!: RouteRegistrar;
  post!: RouteRegistrar;
  purge!: RouteRegistrar;
  put!: RouteRegistrar;
  report!: RouteRegistrar;
  search!: RouteRegistrar;
  subscribe!: RouteRegistrar;
  trace!: RouteRegistrar;
  unlock!: RouteRegistrar;
  unsubscribe!: RouteRegistrar;
  private readonly _router: ExpressRouter;

  private static getSharedHandlerProperty<Name extends SharedHandlerProperty>(
    name: Name,
  ): (typeof DEFAULT_RESPONSE_HANDLER)[Name] {
    return DEFAULT_RESPONSE_HANDLER[name];
  }

  private static setSharedHandlerProperty<Name extends SharedHandlerProperty>(
    name: Name,
    value: (typeof DEFAULT_RESPONSE_HANDLER)[Name],
  ): void {
    DEFAULT_RESPONSE_HANDLER[name] = value;
  }

  static readonly clientErrors = clientErrors;
  static readonly success = success;
  static readonly defaultHandler = DEFAULT_RESPONSE_HANDLER;
  static readonly HttpResponse = HttpResponse;
  static readonly ErrorFormats = ErrorFormats;
  static readonly createHandler = createHandler;

  static get errorMessageProvider(): typeof DEFAULT_RESPONSE_HANDLER.errorMessageProvider {
    return JsonRouter.getSharedHandlerProperty('errorMessageProvider');
  }

  static set errorMessageProvider(customErrorMessageProvider: typeof DEFAULT_RESPONSE_HANDLER.errorMessageProvider) {
    JsonRouter.setSharedHandlerProperty('errorMessageProvider', customErrorMessageProvider);
  }

  static get preJson(): typeof DEFAULT_RESPONSE_HANDLER.preJson {
    return JsonRouter.getSharedHandlerProperty('preJson');
  }

  static set preJson(preJsonHookFn: typeof DEFAULT_RESPONSE_HANDLER.preJson) {
    JsonRouter.setSharedHandlerProperty('preJson', preJsonHookFn);
  }

  static get postJson(): typeof DEFAULT_RESPONSE_HANDLER.postJson {
    return JsonRouter.getSharedHandlerProperty('postJson');
  }

  static set postJson(postJsonHookFn: typeof DEFAULT_RESPONSE_HANDLER.postJson) {
    JsonRouter.setSharedHandlerProperty('postJson', postJsonHookFn);
  }

  static get preError(): typeof DEFAULT_RESPONSE_HANDLER.preError {
    return JsonRouter.getSharedHandlerProperty('preError');
  }

  static set preError(preErrorHookFn: typeof DEFAULT_RESPONSE_HANDLER.preError) {
    JsonRouter.setSharedHandlerProperty('preError', preErrorHookFn);
  }

  static get postError(): typeof DEFAULT_RESPONSE_HANDLER.postError {
    return JsonRouter.getSharedHandlerProperty('postError');
  }

  static set postError(postErrorHookFn: typeof DEFAULT_RESPONSE_HANDLER.postError) {
    JsonRouter.setSharedHandlerProperty('postError', postErrorHookFn);
  }

  constructor(
    basePath = '',
    middlewares?: JsonRouterMiddlewares,
    responseHandler: ExpressResponseHandler = DEFAULT_RESPONSE_HANDLER,
  ) {
    this.basePath = normalizeBasePath(basePath);
    this.middlewares = toMiddlewareList(middlewares);
    this.responseHandler = responseHandler;
    this._router = express.Router();

    for (const method of METHODS) {
      const routerMethod = this._router[method] as unknown as RouteHandler | undefined;

      if (typeof routerMethod !== 'function') {
        continue;
      }

      this.methods.push(method);

      Object.defineProperty(this, method, {
        value: (path: string, ...callbacks: JsonRouterCallback[]) => {
          const fullPath = joinRoutePath(this.basePath, path);
          const handlers = this.responseHandler.handleResponse([...this.middlewares, ...callbacks]);

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

  get original(): ExpressRouter {
    return this._router;
  }

  param(...args: Parameters<ExpressRouter['param']>): ReturnType<ExpressRouter['param']> {
    return this._router.param(...args);
  }

  use(...args: Parameters<ExpressRouter['use']>): ReturnType<ExpressRouter['use']> {
    return this._router.use(...args);
  }

  route(path: string): JsonRouteBuilder {
    const definition = {} as JsonRouteBuilder;

    for (const method of this.methods) {
      Object.defineProperty(definition, method, {
        value: (...callbacks: JsonRouterCallback[]) => {
          this[method](path, ...callbacks);
          return definition;
        },
        enumerable: false,
        writable: false,
        configurable: false,
      });
    }

    return definition;
  }

  addEndpoint(method: RouteMethod, path: string): void {
    this.endpoints.push({
      method: method.toUpperCase() as Uppercase<RouteMethod>,
      path: this.normalizePath(path),
    });
  }

  getEndpoints(): Endpoint[] {
    return this.endpoints.map((endpoint) => ({ ...endpoint }));
  }

  normalizePath(path: string): string {
    return addLeadingSlash(path);
  }
}

export = JsonRouter;
