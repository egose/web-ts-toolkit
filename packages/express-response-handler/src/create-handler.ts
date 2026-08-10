import assert from 'assert';
import { isArray, isFunction, isPromise } from '@web-ts-toolkit/utils';

import { isCSVResponse } from './responses/csv';
import { isResponse } from './responses';
import { HttpResponse } from './http-response';
import {
  defaultErrorMessageProvider,
  FALLBACK_ERROR_STATUS,
  normalizeThrownError,
  toRfc9457GenericErrorPayload,
  toRfc9457HttpErrorPayload,
  toSimpleErrorPayload,
  toStructuredGenericErrorPayload,
  toStructuredHttpErrorPayload,
  validateErrorStatusCode,
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

type InternalExpressResponseHandler = ExpressResponseHandler & {
  handleResult: (res: ResponseLike, result: unknown, event: EventState) => void;
  handlePromise: (res: ResponseLike, promise: PromiseLike<unknown>, event: EventState) => PromiseLike<unknown>;
};

const promisify =
  (fn: Hook): AsyncHook =>
  (value) =>
    Promise.resolve()
      .then(() => fn(value))
      .then(() => undefined);

const RFC_9457_CONTENT_TYPE = 'application/problem+json';
const SUPPORTED_RFC_9457_CONTENT_TYPES = new Set(['application/problem+json', 'application/json']);

type HttpErrorSender = (res: ResponseLike, error: ErrorWithPayload, errorDomain: string) => void;
type GenericErrorSender = (res: ResponseLike, result: ErrorMessageResult, errorDomain: string) => void;

type HandlerConfig = Readonly<{
  errorFormat: ErrorFormat;
  errorDomain: string;
  rfc9457ContentType: 'application/problem+json' | 'application/json';
}>;

const shouldSkipResponse = (res: ResponseLike, event: EventState): boolean => res.headersSent || event.canceled;

const sendProblemJson = (res: ResponseLike, statusCode: number, payload: unknown, contentType: string): void => {
  res.status(statusCode);
  res.set('Content-Type', contentType);
  res.send(payload);
};

const sendHttpErrorByFormat: Record<ErrorFormat, HttpErrorSender> = {
  [ErrorFormats.simple]: (res, error) => {
    const statusCode = validateErrorStatusCode(error.statusCode ?? FALLBACK_ERROR_STATUS, 'error.statusCode');
    const payload: Record<string, unknown> = { message: error.message ?? '' };

    if (error.errors !== undefined) {
      payload.errors = error.errors;
    }

    res.status(statusCode).send(payload);
  },
  [ErrorFormats.aip193]: (res, error, domain) => {
    const statusCode = validateErrorStatusCode(error.statusCode ?? FALLBACK_ERROR_STATUS, 'error.statusCode');
    res.status(statusCode).send(toStructuredHttpErrorPayload(error, domain));
  },
  [ErrorFormats.rfc9457]: (res, error, domain) => {
    const statusCode = validateErrorStatusCode(error.statusCode ?? FALLBACK_ERROR_STATUS, 'error.statusCode');
    sendProblemJson(res, statusCode, toRfc9457HttpErrorPayload(error, domain), RFC_9457_CONTENT_TYPE);
  },
};

const sendGenericErrorByFormat: Record<ErrorFormat, GenericErrorSender> = {
  [ErrorFormats.simple]: (res, result) => {
    res.status(FALLBACK_ERROR_STATUS).send(toSimpleErrorPayload(result));
  },
  [ErrorFormats.aip193]: (res, result, domain) => {
    const payload = toStructuredGenericErrorPayload(result, domain);

    res.status(validateErrorStatusCode(payload.error.code, 'error.code')).send(payload);
  },
  [ErrorFormats.rfc9457]: (res, result) => {
    const payload = toRfc9457GenericErrorPayload(result);

    const statusCode = payload.status ?? FALLBACK_ERROR_STATUS;
    sendProblemJson(res, validateErrorStatusCode(statusCode, 'problem.status'), payload, RFC_9457_CONTENT_TYPE);
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

const validateHandlerConfig = (options: ExpressResponseHandlerOptions): HandlerConfig => {
  const errorFormat = options.errorFormat ?? ErrorFormats.simple;
  const errorDomain = options.errorDomain ?? 'express-response-handler';
  const rfc9457ContentType = options.rfc9457ContentType ?? RFC_9457_CONTENT_TYPE;

  assert.ok(
    Object.values(ErrorFormats).includes(errorFormat),
    `errorFormat must be one of: ${Object.values(ErrorFormats).join(', ')}`,
  );
  assert.ok(typeof errorDomain === 'string' && errorDomain.length > 0, 'errorDomain must be a non-empty string');
  assert.ok(
    SUPPORTED_RFC_9457_CONTENT_TYPES.has(rfc9457ContentType),
    'rfc9457ContentType must be one of: application/problem+json, application/json',
  );

  return Object.freeze({ errorFormat, errorDomain, rfc9457ContentType });
};

/**
 * Creates an Express response handler that wraps route handlers and serializes
 * return values, thrown `HttpError`s, and explicit `HttpResponse` wrappers.
 *
 * @example
 * const { handleResponse, HttpResponse } = createHandler();
 * app.get('/health', handleResponse(() => ({ ok: true })));
 */
export function createHandler(options: ExpressResponseHandlerOptions = {}): ExpressResponseHandler {
  const config = validateHandlerConfig(options);

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

  const noopRebuild = (): void => {
    // Hooks are consulted directly by dispatchValue/dispatchError at request
    // time, so updating the stored async-hook variable is sufficient.
  };

  const sendBaseJson = function (
    res: ResponseLike,
    data: unknown,
    event: EventState,
    onBeforeOutputError?: (error: unknown) => void,
  ): boolean {
    if (shouldSkipResponse(res, event)) {
      return false;
    }

    if (data === undefined) {
      return false;
    }

    if (isResponse(data)) {
      res.status(data.statusCode).json(data.data);
      return true;
    }

    if (isCSVResponse(data)) {
      data.streamCsv(res, onBeforeOutputError);
      return true;
    }

    res.json(data);
    return true;
  };

  const sendBaseError = function (res: ResponseLike, err: unknown, event: EventState): boolean {
    if (shouldSkipResponse(res, event)) {
      return false;
    }

    const error = normalizeThrownError(err);

    if (error.statusCode !== undefined) {
      const statusCode = validateErrorStatusCode(error.statusCode, 'error.statusCode');

      if (config.errorFormat === ErrorFormats.rfc9457) {
        sendProblemJson(
          res,
          statusCode,
          toRfc9457HttpErrorPayload(error, config.errorDomain),
          config.rfc9457ContentType,
        );
        return true;
      }

      sendHttpErrorByFormat[config.errorFormat](res, error, config.errorDomain);
      return true;
    }

    const result = errorMessageProvider(err);

    if (config.errorFormat === ErrorFormats.rfc9457) {
      const payload = toRfc9457GenericErrorPayload(result);
      const statusCode = payload.status ?? FALLBACK_ERROR_STATUS;

      sendProblemJson(res, validateErrorStatusCode(statusCode, 'problem.status'), payload, config.rfc9457ContentType);
      return true;
    }

    sendGenericErrorByFormat[config.errorFormat](res, result, config.errorDomain);
    return true;
  };

  type ErrorReporter = (err: unknown) => void;
  type SuccessReporter = () => void;

  const invokePostHook = (hook: AsyncHook, value: unknown, onFailure: ErrorReporter): void => {
    hook(value).then(
      () => undefined,
      (err) => onFailure(err),
    );
  };

  const invokePostHookOnFinish = (
    res: ResponseLike,
    hook: AsyncHook,
    value: unknown,
    onFailure: ErrorReporter,
  ): void => {
    if (isFunction(res.once)) {
      res.once('finish', () => invokePostHook(hook, value, onFailure));
      return;
    }

    invokePostHook(hook, value, onFailure);
  };

  const terminalErrorBoundary = (
    res: ResponseLike,
    next: NextFunction,
    terminalError: unknown,
    event: EventState,
  ): void => {
    if (event.canceled) {
      return;
    }

    next(terminalError);
  };

  const dispatchError = (res: ResponseLike, next: NextFunction, err: unknown, event: EventState): void => {
    const reportFailure: ErrorReporter = (failure) => {
      terminalErrorBoundary(res, next, failure, event);
    };

    const sendFormatted = (failure: unknown) => {
      let didSend = false;

      try {
        didSend = sendBaseError(res, failure, event);
      } catch (senderFailure) {
        reportFailure(senderFailure === undefined ? failure : senderFailure);
        return;
      }

      if (didSend && postErrorHook) {
        invokePostHookOnFinish(res, postErrorHook, failure, reportFailure);
      }
    };

    if (event.canceled) {
      return;
    }

    const runSender = () => sendFormatted(err);

    if (preErrorHook) {
      preErrorHook(err).then(
        () => sendFormatted(err),
        (hookErr) => sendFormatted(hookErr === undefined ? err : hookErr),
      );
      return;
    }

    runSender();
  };

  const dispatchValue = (
    res: ResponseLike,
    next: NextFunction,
    data: unknown,
    event: EventState,
    onSerialized: SuccessReporter,
  ): void => {
    const reportFailure: ErrorReporter = (failure) => {
      terminalErrorBoundary(res, next, failure, event);
    };

    const sendFormattedError = (failure: unknown) => {
      try {
        sendBaseError(res, failure, event);
      } catch (senderFailure) {
        reportFailure(senderFailure === undefined ? failure : senderFailure);
      }
    };

    const runSender = () => {
      let didSend = false;

      try {
        didSend = sendBaseJson(res, data, event, sendFormattedError);
      } catch (senderFailure) {
        const failure = senderFailure === undefined ? new Error('response serialization failed') : senderFailure;

        if (res.headersSent) {
          reportFailure(failure);
          return;
        }

        sendFormattedError(failure);
        return;
      }

      if (didSend && postJsonHook) {
        invokePostHookOnFinish(res, postJsonHook, data, reportFailure);
      }

      onSerialized();
    };

    if (preJsonHook) {
      preJsonHook(data).then(runSender, (hookErr) =>
        sendFormattedError(hookErr === undefined ? new Error('pre-json hook failed') : hookErr),
      );
      return;
    }

    runSender();
  };

  const handlePromise = function (
    res: ResponseLike,
    promise: PromiseLike<unknown>,
    event: EventState,
  ): PromiseLike<unknown> {
    return Promise.resolve(promise).then(
      (data) => {
        if (event.nextError) {
          sendBaseError(res, event.nextError, event);
          return undefined;
        }

        sendBaseJson(res, data, event);
        return undefined;
      },
      (err) => {
        sendBaseError(res, err, event);
        return undefined;
      },
    );
  };

  const handleResult = function (res: ResponseLike, result: unknown, event: EventState) {
    if (shouldSkipResponse(res, event)) {
      return;
    }

    if (event.nextError) {
      sendBaseError(res, event.nextError, event);
      return;
    }

    if (isPromise(result)) {
      void handlePromise(res, result, event);
      return;
    }

    sendBaseJson(res, result, event);
  };

  const nextFn = function (event: EventState, next: NextFunction): NextFunction {
    return function (error?: unknown) {
      if (event.canceled) {
        return;
      }

      if (error === undefined) {
        event.canceled = true;
        next();
        return;
      }

      if (error === 'route' || error === 'router' || error instanceof Error) {
        event.canceled = true;
        next(error);
        return;
      }

      event.nextError = new TypeError('next(value) is not supported; return a value instead');
    };
  };

  const runLifecycle = (res: ResponseLike, next: NextFunction, result: unknown, event: EventState): void => {
    const finalize = (resolved: unknown) => {
      if (event.canceled) {
        return;
      }

      if (event.nextError) {
        dispatchError(res, next, event.nextError, event);
        return;
      }

      dispatchValue(res, next, resolved, event, () => undefined);
    };

    if (isPromise(result)) {
      Promise.resolve(result).then(
        (resolved) => finalize(resolved),
        (err) => {
          if (res.headersSent) {
            next(err);
            return;
          }

          dispatchError(res, next, err, event);
        },
      );
      return;
    }

    finalize(result);
  };

  const routerFn = function (fn: MiddlewareFunction): RouterFunction {
    return function (req: unknown, res: ResponseLike, next: NextFunction) {
      const event: EventState = { canceled: false, nextError: null };

      try {
        const result = fn(req as Parameters<typeof fn>[0], res as Parameters<typeof fn>[1], nextFn(event, next));
        runLifecycle(res, next, result, event);
      } catch (err) {
        if (res.headersSent) {
          next(err);
          return;
        }

        dispatchError(res, next, err, event);
      }
    } as RouterFunction;
  };

  const handleResponse: HandleResponse = function (...fns: Array<MiddlewareFunction | MiddlewareFunction[]>) {
    const middlewares = normalizeMiddlewareList(fns);

    return middlewares.length === 1 ? routerFn(middlewares[0]) : middlewares.map(routerFn);
  } as HandleResponse;

  const handler: InternalExpressResponseHandler = {
    handleResponse,
    handleResult,
    handlePromise,
    HttpResponse,
    createHandler,
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
        noopRebuild,
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
        noopRebuild,
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
        noopRebuild,
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
        noopRebuild,
      );
    },
  };

  return handler;
}
