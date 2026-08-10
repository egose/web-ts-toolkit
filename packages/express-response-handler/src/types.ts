import type {
  NextFunction as ExpressNextFunction,
  ParamsDictionary,
  Query,
  Request,
  RequestHandler,
  Response as ExpressResponse,
} from 'express-serve-static-core';
import type { HttpResponseHelpers } from './http-response';
import type { ErrorFormats } from './error-formats';

export type ErrorMessageResult = string | Record<string, unknown>;
export type ErrorMessageProvider = (error: unknown) => ErrorMessageResult;
export type ErrorFormat = (typeof ErrorFormats)[keyof typeof ErrorFormats];
export type MaybePromise<T> = T | PromiseLike<T>;
export type Hook = (value: unknown) => void | PromiseLike<void>;
export type AsyncHook = (value: unknown) => Promise<void>;
export type NextRouteControl = 'route' | 'router';
export type NextFunction = ExpressNextFunction;

export type ExpressResponseHandlerOptions = {
  errorFormat?: ErrorFormat;
  errorDomain?: string;
  rfc9457ContentType?: 'application/problem+json' | 'application/json';
};

export type ResponseLike = {
  headersSent: boolean;
  status(code: number): ResponseLike;
  json(data: unknown): unknown;
  send(data: unknown): unknown;
  set(name: string, value: string): unknown;
  once?(event: 'finish', listener: () => void): unknown;
  end(): void;
};

export type EventState = {
  canceled: boolean;
  nextError: unknown;
};

export type MiddlewareFunction<
  Params = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Query,
  Locals extends Record<string, unknown> = Record<string, unknown>,
  Return = unknown,
> = (
  req: Request<Params, ResBody, ReqBody, ReqQuery, Locals>,
  res: ExpressResponse<ResBody, Locals>,
  next: NextFunction,
) => MaybePromise<Return>;

export type RouterFunction<
  Params = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Query,
  Locals extends Record<string, unknown> = Record<string, unknown>,
> = RequestHandler<Params, ResBody, ReqBody, ReqQuery, Locals>;

export type HandleResponse = {
  <
    Params = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = Query,
    Locals extends Record<string, unknown> = Record<string, unknown>,
    Return = unknown,
  >(
    fn: MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>,
  ): RouterFunction<Params, ResBody, ReqBody, ReqQuery, Locals>;
  <
    Params = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = Query,
    Locals extends Record<string, unknown> = Record<string, unknown>,
    Return = unknown,
  >(
    ...fns: Array<MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>>
  ): Array<RouterFunction<Params, ResBody, ReqBody, ReqQuery, Locals>>;
  <
    Params = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = Query,
    Locals extends Record<string, unknown> = Record<string, unknown>,
    Return = unknown,
  >(
    fns: Array<MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>>,
  ): Array<RouterFunction<Params, ResBody, ReqBody, ReqQuery, Locals>>;
};

export type ErrorWithPayload = {
  statusCode?: number;
  message?: string;
  errors?: unknown;
  _message?: string;
  status?: string;
  reason?: string;
  domain?: string;
  metadata?: unknown;
  details?: unknown;
  type?: string;
  title?: string;
  instance?: string;
};

export type CreateHandler = (options?: ExpressResponseHandlerOptions) => ExpressResponseHandler;

export type ExpressResponseHandler = {
  handleResponse: HandleResponse;
  HttpResponse: HttpResponseHelpers;
  createHandler: CreateHandler;
  errorMessageProvider: ErrorMessageProvider;
  preJson: Hook | null;
  postJson: Hook | null;
  preError: Hook | null;
  postError: Hook | null;
};
