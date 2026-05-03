import assert from 'assert';

import { CSVResponse } from './responses/csv';
import { Response } from './responses';
import { HttpResponse } from './http-response';
import {
  defaultErrorMessageProvider,
  toSimpleErrorPayload,
  toStructuredGenericErrorPayload,
  toStructuredHttpErrorPayload,
} from './error-format';
import type {
  AsyncHook,
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
  const errorFormat = options.errorFormat || 'simple';
  const errorDomain = options.errorDomain || 'express-response-handler';

  let errorMessageProvider = defaultErrorMessageProvider;
  let preJson: Hook | null = null;
  let postJson: Hook | null = null;
  let preError: Hook | null = null;
  let postError: Hook | null = null;
  let preJsonHook: AsyncHook | null = null;
  let postJsonHook: AsyncHook | null = null;
  let preErrorHook: AsyncHook | null = null;
  let postErrorHook: AsyncHook | null = null;

  const sendBaseJson = function (res: ResponseLike, data: unknown, event: EventState) {
    if (res.headersSent || event.canceled) {
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
    if (res.headersSent || event.canceled) {
      return;
    }

    const error = err as ErrorWithPayload;

    if (error.statusCode) {
      if (errorFormat === 'aip193') {
        res.status(error.statusCode).send(toStructuredHttpErrorPayload(error, errorDomain));
        return;
      }

      const payload: Record<string, unknown> = { message: error.message || '' };

      if (error.errors !== undefined) {
        payload.errors = error.errors;
      }

      res.status(error.statusCode).send(payload);
      return;
    }

    const result = errorMessageProvider(err);

    if (errorFormat === 'aip193') {
      const payload = toStructuredGenericErrorPayload(result, errorDomain);

      res.status(payload.error.code).send(payload);
      return;
    }

    res.status(422).send(toSimpleErrorPayload(result));
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
    if (res.headersSent || event.canceled) {
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
      if (fn === null) {
        preJson = null;
        preJsonHook = null;
        rebuildSendJson();
        return;
      }

      assert.ok(isFunction(fn), 'pre-json hook must be a function');
      preJson = fn;
      preJsonHook = promisify(fn);
      rebuildSendJson();
    },
    get postJson() {
      return postJson;
    },
    set postJson(fn: Hook | null) {
      if (fn === null) {
        postJson = null;
        postJsonHook = null;
        rebuildSendJson();
        return;
      }

      assert.ok(isFunction(fn), 'post-json hook must be a function');
      postJson = fn;
      postJsonHook = promisify(fn);
      rebuildSendJson();
    },
    get preError() {
      return preError;
    },
    set preError(fn: Hook | null) {
      if (fn === null) {
        preError = null;
        preErrorHook = null;
        rebuildSendError();
        return;
      }

      assert.ok(isFunction(fn), 'pre-error hook must be a function');
      preError = fn;
      preErrorHook = promisify(fn);
      rebuildSendError();
    },
    get postError() {
      return postError;
    },
    set postError(fn: Hook | null) {
      if (fn === null) {
        postError = null;
        postErrorHook = null;
        rebuildSendError();
        return;
      }

      assert.ok(isFunction(fn), 'post-error hook must be a function');
      postError = fn;
      postErrorHook = promisify(fn);
      rebuildSendError();
    },
  };
}
