import type { HttpResponseHelpers } from './http-response';

export type ErrorMessageResult = string | Record<string, unknown>;
export type ErrorMessageProvider = (error: unknown) => ErrorMessageResult;
export type ErrorFormat = 'simple' | 'aip193';
export type MaybePromise<T> = T | Promise<T>;
export type Hook = (value: unknown) => unknown;
export type AsyncHook = (value: unknown) => Promise<unknown>;
export type NextFunction = (error?: unknown) => void;

export type ExpressResponseHandlerOptions = {
  errorFormat?: ErrorFormat;
  errorDomain?: string;
};

export type ResponseLike = {
  headersSent: boolean;
  status(code: number): ResponseLike;
  json(data: unknown): unknown;
  send(data: unknown): unknown;
  set(name: string, value: string): unknown;
  end(): void;
};

export type EventState = {
  canceled: boolean;
  nextError: unknown;
};

export type MiddlewareFunction<Request = unknown, Response extends ResponseLike = ResponseLike, Return = unknown> = (
  req: Request,
  res: Response,
  next: NextFunction,
) => MaybePromise<Return>;

export type RouterFunction<Request = unknown, Response extends ResponseLike = ResponseLike> = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void;

export type HandleResponse = {
  <Request = unknown, Response extends ResponseLike = ResponseLike, Return = unknown>(
    fn: MiddlewareFunction<Request, Response, Return>,
  ): RouterFunction<Request, Response>;
  <Request = unknown, Response extends ResponseLike = ResponseLike, Return = unknown>(
    ...fns: Array<MiddlewareFunction<Request, Response, Return>>
  ): Array<RouterFunction<Request, Response>>;
  <Request = unknown, Response extends ResponseLike = ResponseLike, Return = unknown>(
    fns: Array<MiddlewareFunction<Request, Response, Return>>,
  ): Array<RouterFunction<Request, Response>>;
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
};

export type ExpressResponseHandlerFactory = (options?: ExpressResponseHandlerOptions) => ExpressResponseHandler;

export type ExpressResponseHandler = {
  handleResponse: HandleResponse;
  handleResult: (res: ResponseLike, result: unknown, event: EventState) => void;
  handlePromise: (res: ResponseLike, promise: Promise<unknown>, event: EventState) => void;
  HttpResponse: HttpResponseHelpers;
  createExpressResponseHandler: ExpressResponseHandlerFactory;
  errorMessageProvider: ErrorMessageProvider;
  preJson: Hook | null;
  postJson: Hook | null;
  preError: Hook | null;
  postError: Hook | null;
};
