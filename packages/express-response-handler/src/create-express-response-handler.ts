import assert from 'assert';

import { CSVResponse } from './responses/csv';
import { Response } from './responses';
import { HttpResponse } from './http-response';
import {
  defaultErrorMessageProvider,
  toRfc9457GenericErrorPayload,
  toRfc9457HttpErrorPayload,
  toSimpleErrorPayload,
  toStructuredGenericErrorPayload,
  toStructuredHttpErrorPayload,
} from './error-format';
import { ErrorFormats } from './error-formats';
import type {
  AsyncHook,
  ErrorFormat,
  ErrorMessageResult,
  ErrorMessageProvider,
  ErrorWithPayload,
  ExpressResponseHandler,
  ExpressResponseHandlerOptions,
  HandleResponse,
  Hook,
  MiddlewareFunction,
  NextFunction,
  EventState,
  ResponseLike,
  RouterFunction,
} from './types';

const isFunction = (value: unknown): value is (...args: unknown[]) => unknown => typeof value === 'function';
const isPromise = <T>(value: unknown): value is Promise<T> => Boolean(value) && isFunction((value as Promise<T>).then);
const promisify =
  (fn: Hook): AsyncHook =>
  (value) =>
    Promise.resolve().then(() => fn(value));
const { isArray } = Array;

const invokePostHook = (hook: AsyncHook, value: unknown): void => {
  void hook(value).catch(() => undefined);
};

const RFC_9457_CONTENT_TYPE = 'application/problem+json';

type HttpErrorSender = (res: ResponseLike, error: ErrorWithPayload, errorDomain: string) => void;
type GenericErrorSender = (res: ResponseLike, result: ErrorMessageResult, errorDomain: string) => void;

const shouldSkipResponse = (res: ResponseLike, event: EventState): boolean => res.headersSent || event.canceled;

const sendProblemJson = (res: ResponseLike, statusCode: number, payload: unknown): void => {
  res.status(statusCode);
  res.set('Content-Type', RFC_9457_CONTENT_TYPE);
  res.send(payload);
};

const sendHttpErrorByFormat: Record<ErrorFormat, HttpErrorSender> = {
  [ErrorFormats.simple]: (res, error) => {
    const payload: Record<string, unknown> = { message: error.message ?? '' };

    if (error.errors !== undefined) {
      payload.errors = error.errors;
    }

    res.status(error.statusCode ?? 500).send(payload);
  },
  [ErrorFormats.aip193]: (res, error, domain) => {
    res.status(error.statusCode ?? 500).send(toStructuredHttpErrorPayload(error, domain));
  },
  [ErrorFormats.rfc9457]: (res, error, domain) => {
    sendProblemJson(res, error.statusCode ?? 500, toRfc9457HttpErrorPayload(error, domain));
  },
};

const sendGenericErrorByFormat: Record<ErrorFormat, GenericErrorSender> = {
  [ErrorFormats.simple]: (res, result) => {
    res.status(422).send(toSimpleErrorPayload(result));
  },
  [ErrorFormats.aip193]: (res, result, domain) => {
    const payload = toStructuredGenericErrorPayload(result, domain);

    res.status(payload.error.code).send(payload);
  },
  [ErrorFormats.rfc9457]: (res, result) => {
    const payload = toRfc9457GenericErrorPayload(result);

    sendProblemJson(res, payload.status ?? 422, payload);
  },
};

const assertMiddleware: (fn: unknown) => asserts fn is MiddlewareFunction = (fn) => {
  assert.ok(isFunction(fn), 'middleware handler must be a function');
};

const normalizeMiddlewareList = (fns: Array<MiddlewareFunction | MiddlewareFunction[]>): MiddlewareFunction[] => {
  assert.ok(fns.length > 0, 'at least one middleware handler is required');

  if (fns.length > 1) {
    fns.forEach(assertMiddleware);
    return fns as MiddlewareFunction[];
  }

  if (isArray(fns[0])) {
    assert.ok(fns[0].length > 0, 'at least one middleware handler is required');
    fns[0].forEach(assertMiddleware);
    return fns[0];
  }

  assertMiddleware(fns[0]);
  return [fns[0]];
};

export function createExpressResponseHandler(options: ExpressResponseHandlerOptions = {}): ExpressResponseHandler {
  const errorFormat = options.errorFormat ?? ErrorFormats.simple;
  const errorDomain = options.errorDomain ?? 'express-response-handler';

  let errorMessageProvider = defaultErrorMessageProvider;
  let preJson: Hook | null = null;
  let postJson: Hook | null = null;
  let preError: Hook | null = null;
  let postError: Hook | null = null;
  let preJsonHook: AsyncHook | null = null;
  let postJsonHook: AsyncHook | null = null;
  let preErrorHook: AsyncHook | null = null;
  let postErrorHook: AsyncHook | null = null;

  const updateHook = (
    fn: Hook | null,
    name: string,
    setState: (syncHook: Hook | null, asyncHook: AsyncHook | null) => void,
    rebuild: () => void,
  ): void => {
    if (fn === null) {
      setState(null, null);
      rebuild();
      return;
    }

    assert.ok(isFunction(fn), `${name} hook must be a function`);
    setState(fn, promisify(fn));
    rebuild();
  };

  const sendBaseJson = function (res: ResponseLike, data: unknown, event: EventState) {
    if (shouldSkipResponse(res, event)) {
      return;
    }

    if (data instanceof Response) {
      res.status(data.statusCode).json(data.data);
      return;
    }

    if (data instanceof CSVResponse) {
      data.streamCsv(res);
      return;
    }

    res.json(data);
  };

  const sendBaseError = function (res: ResponseLike, err: unknown, event: EventState) {
    if (shouldSkipResponse(res, event)) {
      return;
    }

    const error = err as ErrorWithPayload;

    if (error.statusCode) {
      sendHttpErrorByFormat[errorFormat](res, error, errorDomain);
      return;
    }

    const result = errorMessageProvider(err);
    sendGenericErrorByFormat[errorFormat](res, result, errorDomain);
  };

  let sendJson = sendBaseJson;
  let sendError = sendBaseError;

  const rebuildSendJson = (): void => {
    if (!preJsonHook && !postJsonHook) {
      sendJson = sendBaseJson;
      return;
    }

    sendJson = function (res: ResponseLike, data: unknown, event: EventState) {
      const finalize = () => {
        try {
          sendBaseJson(res, data, event);
        } catch (err) {
          sendError(res, err, event);
          return;
        }

        if (postJsonHook) {
          invokePostHook(postJsonHook, data);
        }
      };

      if (preJsonHook) {
        preJsonHook(data).then(finalize, (err) => sendError(res, err, event));
        return;
      }

      finalize();
    };
  };

  const rebuildSendError = (): void => {
    if (!preErrorHook && !postErrorHook) {
      sendError = sendBaseError;
      return;
    }

    sendError = function (res: ResponseLike, err: unknown, event: EventState) {
      const finalize = () => {
        sendBaseError(res, err, event);

        if (postErrorHook) {
          invokePostHook(postErrorHook, err);
        }
      };

      if (preErrorHook) {
        preErrorHook(err).then(finalize, (hookErr) => sendBaseError(res, hookErr, event));
        return;
      }

      finalize();
    };
  };

  const handlePromise = function (res: ResponseLike, promise: Promise<unknown>, event: EventState) {
    promise
      .then((data) => {
        if (event.nextError) {
          sendError(res, event.nextError, event);

          return;
        }

        sendJson(res, data, event);
      })
      .catch((err) => sendError(res, err, event));
  };

  const handleResult = function (res: ResponseLike, result: unknown, event: EventState) {
    if (shouldSkipResponse(res, event)) {
      return;
    }

    if (event.nextError) {
      sendError(res, event.nextError, event);

      return;
    }

    if (isPromise(result)) {
      handlePromise(res, result, event);
      return;
    }

    sendJson(res, result, event);
  };

  const nextFn = function (event: EventState, next: NextFunction): NextFunction {
    return function (...args: unknown[]) {
      if (args.length === 0) {
        event.canceled = true;
        next();
        return;
      }

      if (args[0] instanceof Error) {
        event.nextError = args[0];
        return;
      }

      event.nextError = new TypeError('next(value) is not supported; return a value instead');
    };
  };

  const routerFn = function (fn: MiddlewareFunction): RouterFunction {
    return function (req: unknown, res: ResponseLike, next: NextFunction) {
      const event: EventState = { canceled: false, nextError: null };

      try {
        const result = fn(req, res, nextFn(event, next));
        handleResult(res, result, event);
      } catch (err) {
        if (res.headersSent) {
          return;
        }

        sendError(res, err, event);
      }
    };
  };

  const handleResponse: HandleResponse = function (...fns: Array<MiddlewareFunction | MiddlewareFunction[]>) {
    const middlewares = normalizeMiddlewareList(fns);

    return middlewares.length === 1 ? routerFn(middlewares[0]) : middlewares.map(routerFn);
  } as HandleResponse;

  return {
    handleResponse,
    handleResult,
    handlePromise,
    HttpResponse,
    createExpressResponseHandler,
    get errorMessageProvider() {
      return errorMessageProvider;
    },
    set errorMessageProvider(fn: ErrorMessageProvider) {
      assert.ok(isFunction(fn), 'error message provider must be a function');
      errorMessageProvider = fn;
    },
    get preJson() {
      return preJson;
    },
    set preJson(fn: Hook | null) {
      updateHook(
        fn,
        'pre-json',
        (syncHook, asyncHook) => {
          preJson = syncHook;
          preJsonHook = asyncHook;
        },
        rebuildSendJson,
      );
    },
    get postJson() {
      return postJson;
    },
    set postJson(fn: Hook | null) {
      updateHook(
        fn,
        'post-json',
        (syncHook, asyncHook) => {
          postJson = syncHook;
          postJsonHook = asyncHook;
        },
        rebuildSendJson,
      );
    },
    get preError() {
      return preError;
    },
    set preError(fn: Hook | null) {
      updateHook(
        fn,
        'pre-error',
        (syncHook, asyncHook) => {
          preError = syncHook;
          preErrorHook = asyncHook;
        },
        rebuildSendError,
      );
    },
    get postError() {
      return postError;
    },
    set postError(fn: Hook | null) {
      updateHook(
        fn,
        'post-error',
        (syncHook, asyncHook) => {
          postError = syncHook;
          postErrorHook = asyncHook;
        },
        rebuildSendError,
      );
    },
  };
}
