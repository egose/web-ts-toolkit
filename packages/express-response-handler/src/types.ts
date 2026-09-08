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
  reported: boolean;
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
  // Single-function input returns a single router function.
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
  // Empty-array input is rejected at runtime
  // (`at least one middleware handler is required`); typed as never so it
  // fails compilation instead of pretending to return routers.
  (fns: readonly []): never;
  // Singleton-array input returns a single router function. This reflects the
  // shipped length-dependent runtime (`middlewares.length === 1` unwraps),
  // not input-shape consistency.
  //
  // Contract choice (B-ERH-07): audit of workspace callers shows single-fn,
  // variadic-multi, fixed multi-array, and one dynamic-array caller
  // (`express-json-router` spreads `[...middlewares, ...routeCallbacks]` and
  // forwards the result to Express, which accepts either a function or an
  // array). No workspace caller depends on singleton arrays returning an
  // array, but changing singleton-array runtime to always return an array
  // would still break external callers (`.map()`/length checks) and needs
  // release notes plus maintainer approval. So the declaration accurately
  // types existing length-dependent behavior; input-shape consistency
  // (`[fn] -> [router]`) is deferred, not applied silently.
  <
    Params = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = Query,
    Locals extends Record<string, unknown> = Record<string, unknown>,
    Return = unknown,
  >(
    fns: readonly [MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>],
  ): RouterFunction<Params, ResBody, ReqBody, ReqQuery, Locals>;
  // Fixed multi-array input (2 or more) always returns an array.
  <
    Params = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = Query,
    Locals extends Record<string, unknown> = Record<string, unknown>,
    Return = unknown,
  >(
    fns: readonly [
      MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>,
      MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>,
      ...Array<MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>>,
    ],
  ): Array<RouterFunction<Params, ResBody, ReqBody, ReqQuery, Locals>>;
  // Dynamic-length array input: the runtime unwraps length 1 to a single
  // function, returns an array for length 2+, and throws for length 0. The
  // union return avoids pretending a compile-time guarantee exists.
  <
    Params = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = Query,
    Locals extends Record<string, unknown> = Record<string, unknown>,
    Return = unknown,
  >(
    fns: readonly MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>[],
  ):
    | RouterFunction<Params, ResBody, ReqBody, ReqQuery, Locals>
    | Array<RouterFunction<Params, ResBody, ReqBody, ReqQuery, Locals>>;
  // Empty variadic input is rejected at runtime; typed as never.
  (): never;
  // Fixed variadic input (2 or more functions) always returns an array.
  <
    Params = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = Query,
    Locals extends Record<string, unknown> = Record<string, unknown>,
    Return = unknown,
  >(
    fn1: MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>,
    fn2: MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>,
    ...rest: Array<MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>>
  ): Array<RouterFunction<Params, ResBody, ReqBody, ReqQuery, Locals>>;
  // Dynamic-length variadic spread (for example `handleResponse(...list)` with
  // `list: MiddlewareFunction[]`): singleton resolves to a single function at
  // runtime, multi resolves to an array, empty throws. Union return documents
  // the absence of a compile-time length guarantee.
  <
    Params = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = Query,
    Locals extends Record<string, unknown> = Record<string, unknown>,
    Return = unknown,
  >(
    ...fns: Array<MiddlewareFunction<Params, ResBody, ReqBody, ReqQuery, Locals, Return>>
  ):
    | RouterFunction<Params, ResBody, ReqBody, ReqQuery, Locals>
    | Array<RouterFunction<Params, ResBody, ReqBody, ReqQuery, Locals>>;
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
