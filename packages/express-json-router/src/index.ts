import apiHandler from '@web-ts-toolkit/express-response-handler';
import {
  Accepted,
  AlreadyReported,
  Created,
  IMUsed,
  MultiStatus,
  NoContent,
  NonAuthoritativeInfo,
  OK,
  PartialContent,
  ResetContent,
} from '@web-ts-toolkit/express-response-handler/responses/success';
import * as clientErrors from '@web-ts-toolkit/http-errors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

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

  static readonly clientErrors = clientErrors;
  static readonly success = success;
  static readonly HttpResponse = apiHandler.HttpResponse;

  static get errorMessageProvider(): typeof apiHandler.errorMessageProvider {
    return apiHandler.errorMessageProvider;
  }

  static set errorMessageProvider(customErrorMessageProvider: typeof apiHandler.errorMessageProvider) {
    apiHandler.errorMessageProvider = customErrorMessageProvider;
  }

  static get preJson(): typeof apiHandler.preJson {
    return apiHandler.preJson;
  }

  static set preJson(preJsonHookFn: typeof apiHandler.preJson) {
    apiHandler.preJson = preJsonHookFn;
  }

  static get postJson(): typeof apiHandler.postJson {
    return apiHandler.postJson;
  }

  static set postJson(postJsonHookFn: typeof apiHandler.postJson) {
    apiHandler.postJson = postJsonHookFn;
  }

  static get preError(): typeof apiHandler.preError {
    return apiHandler.preError;
  }

  static set preError(preErrorHookFn: typeof apiHandler.preError) {
    apiHandler.preError = preErrorHookFn;
  }

  static get postError(): typeof apiHandler.postError {
    return apiHandler.postError;
  }

  static set postError(postErrorHookFn: typeof apiHandler.postError) {
    apiHandler.postError = postErrorHookFn;
  }

  constructor(basePath = '', middlewares?: JsonRouterCallback | JsonRouterCallback[]) {
    this.basePath = normalizeBasePath(basePath);
    this.middlewares = toMiddlewareList(middlewares);
    this._router = express.Router();

    for (const method of METHODS) {
      const routerMethod = this._router[method] as unknown as ((...args: unknown[]) => unknown) | undefined;

      if (typeof routerMethod !== 'function') {
        continue;
      }

      this.methods.push(method);

      Object.defineProperty(this, method, {
        value: (path: string, ...callbacks: JsonRouterCallback[]) => {
          const fullPath = joinRoutePath(this.basePath, path);
          const handlers = apiHandler.handleResponse([...this.middlewares, ...callbacks]);

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
