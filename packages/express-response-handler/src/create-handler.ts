import assert from 'assert';
import { isArray, isFunction, isPromise } from '@web-ts-toolkit/utils';

import { isCSVResponse } from './responses/csv';
import { isResponse, validateHttpStatusCode } from './responses';
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

const promisify =
  (fn: Hook): AsyncHook =>
  (value) =>
    Promise.resolve()
      .then(() => fn(value))
      .then((): undefined => undefined);

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

const normalizeMiddlewareList = (
  fns: Array<MiddlewareFunction | readonly MiddlewareFunction[]>,
): MiddlewareFunction[] => {
  assert.ok(fns.length > 0, 'at least one middleware handler is required');

  if (fns.length > 1) {
    fns.forEach(assertMiddleware);
    return fns as MiddlewareFunction[];
  }

  if (isArray(fns[0])) {
    const nested = fns[0] as readonly MiddlewareFunction[];
    assert.ok(nested.length > 0, 'at least one middleware handler is required');
    nested.forEach(assertMiddleware);
    return [...nested];
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
  ): void => {
    if (fn === null) {
      setState(null, null);
      return;
    }

    assert.ok(isFunction(fn), `${name} hook must be a function`);
    setState(fn, promisify(fn));
  };

  // Terminal failures thrown or rejected by handlers, hooks, providers, or
  // serializers must stay on the Express error channel. Raw forwarding lets
  // falsy values (`null`, `false`, `0`, `''`, `undefined`) become ordinary
  // continuation and `'route'`/`'router'` become routing instructions.
  // Explicit caller-supplied `next(...)` keeps its own contract and bypasses
  // this helper. Ordinary Errors keep identity; anything else is wrapped so
  // Express recognizes it while the original stays observable as `cause`.
  const describeTerminalFailure = (failure: unknown): string => {
    try {
      if (failure === undefined) {
        return 'undefined';
      }

      if (failure === null) {
        return 'null';
      }

      if (typeof failure === 'symbol') {
        return failure.toString();
      }

      if (typeof failure === 'string') {
        return failure;
      }

      if (typeof failure === 'object' && failure !== null) {
        const message = (failure as { message?: unknown }).message;

        if (typeof message === 'string' && message.length > 0) {
          return message;
        }
      }

      return String(failure);
    } catch {
      return 'Internal Server Error';
    }
  };

  const toTerminalError = (failure: unknown): unknown => {
    if (failure instanceof Error) {
      return failure;
    }

    const error = new Error(describeTerminalFailure(failure));

    try {
      (error as Error & { cause: unknown }).cause = failure;
    } catch {
      // Preserve terminal delegation even if cause assignment fails.
    }

    return error;
  };

  // Single private enforcement point for request ownership. Settlement
  // (`canceled`) gates handler settlement, hook continuation, automatic send,
  // and terminal delegation. Observability reporting (`reported`) gates
  // intentional post-hook failure reporting so a completed response can still
  // be observed without allowing stale handler failures to re-enter routing.
  const claimSlot = (event: EventState, slot: 'canceled' | 'reported'): boolean => {
    if (event[slot]) {
      return false;
    }

    event[slot] = true;
    return true;
  };

  const delegateTerminalError = (
    _res: ResponseLike,
    next: NextFunction,
    terminalError: unknown,
    event: EventState,
  ): void => {
    if (!claimSlot(event, 'canceled')) {
      return;
    }

    next(toTerminalError(terminalError));
  };

  const reportHookObservation = (
    _res: ResponseLike,
    next: NextFunction,
    observation: unknown,
    event: EventState,
  ): void => {
    if (!claimSlot(event, 'reported')) {
      return;
    }

    next(toTerminalError(observation));
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
      res.status(validateHttpStatusCode(data.statusCode)).json(data.data);
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

  const invokePostHook = (hook: AsyncHook, value: unknown, onFailure: ErrorReporter): void => {
    hook(value).then(
      (): undefined => undefined,
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

  const dispatchError = (res: ResponseLike, next: NextFunction, err: unknown, event: EventState): void => {
    const reportTerminal: ErrorReporter = (failure) => {
      delegateTerminalError(res, next, failure, event);
    };
    const reportObservation: ErrorReporter = (failure) => {
      reportHookObservation(res, next, failure, event);
    };

    const sendFormatted = (failure: unknown) => {
      if (event.canceled) {
        return;
      }

      let didSend: boolean;

      try {
        didSend = sendBaseError(res, failure, event);
      } catch (senderFailure) {
        reportTerminal(senderFailure === undefined ? failure : senderFailure);
        return;
      }

      if (!didSend) {
        if (res.headersSent) {
          reportTerminal(failure);
        }

        return;
      }

      claimSlot(event, 'canceled');

      if (postErrorHook) {
        invokePostHookOnFinish(res, postErrorHook, failure, reportObservation);
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

  const dispatchValue = (res: ResponseLike, next: NextFunction, data: unknown, event: EventState): void => {
    // No-return/manual exclusion runs before any success hook: a handler that
    // returns `undefined` owns the response (sync write or async callback).
    // Never run preJson/postJson or emit an unsolicited 500 for this path.
    if (data === undefined) {
      if (event.canceled) {
        return;
      }

      // Manual response ownership: a synchronous res.* write already
      // committed headers without returning a value. Claim settlement so a
      // late callback cannot transfer ownership a second time.
      if (res.headersSent) {
        claimSlot(event, 'canceled');
      }

      return;
    }

    if (event.canceled) {
      return;
    }

    // Manual ownership already taken with a returned value (sync res.* write
    // plus a value). Skip success hooks and delegate the owned stale outcome
    // for observability rather than attempting a second body.
    if (res.headersSent) {
      delegateTerminalError(res, next, data, event);
      return;
    }

    const reportTerminal: ErrorReporter = (failure) => {
      if (!event.canceled) {
        delegateTerminalError(res, next, failure, event);
        return;
      }

      reportHookObservation(res, next, failure, event);
    };
    const reportObservation: ErrorReporter = (failure) => {
      reportHookObservation(res, next, failure, event);
    };

    // Tracks whether a success-path fallback has started. Once true, a
    // previously scheduled CSV postJson must not run on the fallback error's
    // finish; the fallback runs postError instead.
    let fallbackOccurred = false;
    // True once our own automatic send claimed settlement (CSV streams claim
    // immediately, before async pre-output failures can arrive). Same-owner
    // CSV fallbacks may still render when headers are open, even though the
    // event is already canceled by our own claim.
    let autoSendClaimed = false;

    const schedulePostJson = (value: unknown): void => {
      const activePostJsonHook = postJsonHook;

      if (!activePostJsonHook) {
        return;
      }

      const guardedHook: AsyncHook = (observed) => {
        if (fallbackOccurred) {
          return Promise.resolve();
        }

        return activePostJsonHook(observed);
      };

      invokePostHookOnFinish(res, guardedHook, value, reportObservation);
    };

    const scheduleFallbackPostError = (failure: unknown): void => {
      const activePostErrorHook = postErrorHook;

      if (!activePostErrorHook) {
        return;
      }

      invokePostHookOnFinish(res, activePostErrorHook, failure, reportObservation);
    };

    // Bounded fallback send after preError settles (or directly when no
    // preError). Runs preError at most once for this fallback, never re-enters
    // a failing preError/provider, and keeps the original failure visible to
    // error hooks while the client still receives a redacted body.
    const sendFallbackFormatted = (failure: unknown): void => {
      if (!autoSendClaimed && event.canceled) {
        return;
      }

      if (res.headersSent) {
        reportTerminal(failure);
        return;
      }

      if (autoSendClaimed) {
        const bypassEvent: EventState = { canceled: false, reported: event.reported };

        try {
          const didFallbackSend = sendBaseError(res, failure, bypassEvent);

          if (didFallbackSend) {
            scheduleFallbackPostError(failure);
          } else {
            reportTerminal(failure);
          }
        } catch (senderFailure) {
          reportTerminal(senderFailure === undefined ? failure : senderFailure);
        }

        return;
      }

      try {
        const didFallbackSend = sendBaseError(res, failure, event);

        if (didFallbackSend) {
          claimSlot(event, 'canceled');
          scheduleFallbackPostError(failure);
        } else if (res.headersSent) {
          reportTerminal(failure);
        }
      } catch (senderFailure) {
        reportTerminal(senderFailure === undefined ? failure : senderFailure);
      }
    };

    // One bounded error lifecycle for success-path serialization, pre-hook,
    // and CSV-before-output failures. The original failure stays visible to
    // preError/postError; a failing preError/provider never recurses.
    const runFallbackLifecycle = (originalFailure: unknown): void => {
      if (fallbackOccurred) {
        return;
      }

      fallbackOccurred = true;

      if (!preErrorHook) {
        sendFallbackFormatted(originalFailure);
        return;
      }

      preErrorHook(originalFailure).then(
        () => sendFallbackFormatted(originalFailure),
        (hookErr) => sendFallbackFormatted(hookErr === undefined ? originalFailure : hookErr),
      );
    };

    // CSV pre-output failures share ownership with the started stream: the
    // automatic send already claimed settlement, but headers are still open,
    // so the same owner may still render a single error body through the
    // bounded error lifecycle (with preError/postError, never postJson).
    const sendFallbackError = (failure: unknown): void => {
      runFallbackLifecycle(failure);
    };

    const runSender = (): void => {
      if (event.canceled) {
        return;
      }

      // Recheck committed headers when the (possibly async) continuation
      // settles: an owned partial write must delegate rather than attempt a
      // second body or silently leave the partial open.
      if (res.headersSent) {
        delegateTerminalError(res, next, data, event);
        return;
      }

      let didSend: boolean;

      try {
        didSend = sendBaseJson(res, data, event, sendFallbackError);
      } catch (senderFailure) {
        const failure = senderFailure === undefined ? new Error('response serialization failed') : senderFailure;

        if (res.headersSent) {
          reportTerminal(failure);
          return;
        }

        runFallbackLifecycle(failure);
        return;
      }

      if (!didSend) {
        if (res.headersSent) {
          delegateTerminalError(res, next, data, event);
        }

        return;
      }

      claimSlot(event, 'canceled');
      autoSendClaimed = true;

      schedulePostJson(data);
    };

    if (preJsonHook) {
      preJsonHook(data).then(
        () => {
          runSender();
        },
        (hookErr) => {
          if (event.canceled) {
            return;
          }

          if (res.headersSent) {
            // Owned partial: still give preError visibility, then delegate
            // without a second body. Bounded to one preError, no postError
            // when no error body can be sent.
            runFallbackLifecycle(hookErr === undefined ? new Error('pre-json hook failed') : hookErr);
            return;
          }

          runFallbackLifecycle(hookErr === undefined ? new Error('pre-json hook failed') : hookErr);
        },
      );
      return;
    }

    runSender();
  };

  const nextFn = function (event: EventState, next: NextFunction): NextFunction {
    return function (error?: unknown) {
      if (!claimSlot(event, 'canceled')) {
        return;
      }

      if (error === undefined) {
        next();
        return;
      }

      next(error);
    };
  };

  const runLifecycle = (res: ResponseLike, next: NextFunction, result: unknown, event: EventState): void => {
    const finalize = (resolved: unknown) => {
      if (event.canceled) {
        return;
      }

      dispatchValue(res, next, resolved, event);
    };

    if (isPromise(result)) {
      Promise.resolve(result).then(
        (resolved) => finalize(resolved),
        (err) => {
          if (event.canceled) {
            return;
          }

          if (res.headersSent) {
            delegateTerminalError(res, next, err, event);
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
      const event: EventState = { canceled: false, reported: false };

      try {
        const result = fn(req as Parameters<typeof fn>[0], res as Parameters<typeof fn>[1], nextFn(event, next));
        runLifecycle(res, next, result, event);
      } catch (err) {
        if (event.canceled) {
          return;
        }

        if (res.headersSent) {
          delegateTerminalError(res, next, err, event);
          return;
        }

        dispatchError(res, next, err, event);
      }
    } as RouterFunction;
  };

  const handleResponse: HandleResponse = function (...fns: Array<MiddlewareFunction | readonly MiddlewareFunction[]>) {
    const middlewares = normalizeMiddlewareList(fns);

    return middlewares.length === 1 ? routerFn(middlewares[0]) : middlewares.map(routerFn);
  } as HandleResponse;

  const handler: ExpressResponseHandler = {
    handleResponse,
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
      updateHook(fn, 'pre-json', (syncHook, asyncHook) => {
        preJson = syncHook;
        preJsonHook = asyncHook;
      });
    },
    get postJson() {
      return postJson;
    },
    set postJson(fn: Hook | null) {
      updateHook(fn, 'post-json', (syncHook, asyncHook) => {
        postJson = syncHook;
        postJsonHook = asyncHook;
      });
    },
    get preError() {
      return preError;
    },
    set preError(fn: Hook | null) {
      updateHook(fn, 'pre-error', (syncHook, asyncHook) => {
        preError = syncHook;
        preErrorHook = asyncHook;
      });
    },
    get postError() {
      return postError;
    },
    set postError(fn: Hook | null) {
      updateHook(fn, 'post-error', (syncHook, asyncHook) => {
        postError = syncHook;
        postErrorHook = asyncHook;
      });
    },
  };

  return handler;
}
