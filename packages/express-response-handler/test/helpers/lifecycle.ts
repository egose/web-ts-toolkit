import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import request from 'supertest';
import type { Server } from 'node:http';

/**
 * Probes whether a request reached Express error middleware exactly once. The
 * probe installs a terminal error middleware on the Express app via
 * {@link ResponseLifecycleProbe.install}. Tests reset the probe between
 * requests or read cumulative counters across a scenario.
 *
 * The probe middleware must be installed AFTER the routes whose error path it
 * observes: Express only invokes error-handling middleware that appears
 * downstream of the layer that called `next(err)`. Tests that need to observe
 * routes registered last call `install()` after registration; routes added
 * afterward never reach the probe.
 */
export type ResponseLifecycleProbe = {
  install(): void;
  reset(): void;
  dispose(): void;
  readonly errorMiddlewareCalls: unknown[];
  readonly errorMiddlewareReachedOnce: boolean;
  readonly errorMiddlewareNeverReached: boolean;
};

export type ResponseLifecycleProbeOptions = {
  mount?: {
    onErrorMiddleware?: ErrorRequestHandler;
  };
};

/**
 * Creates a test-only Express probe that observes Express error middleware
 * invocation once per request. The default terminal middleware sends a 500 and
 * forwards the original error to downstream error handlers; provide
 * `mount.onErrorMiddleware` to override that behavior.
 *
 * @example
 * const app = express();
 * const probe = createResponseLifecycleProbe(app);
 * probe.install();
 * app.get('/route', handler.handleResponse(() => { throw new Error('boom'); }));
 * await request(app).get('/route').expect(500);
 * expect(probe.errorMiddlewareReachedOnce).toBe(true);
 */
export const createResponseLifecycleProbe = (
  app: express.Express,
  options: ResponseLifecycleProbeOptions = {},
): ResponseLifecycleProbe => {
  let installed = false;
  const errorMiddlewareCalls: unknown[] = [];

  const errorMiddleware: ErrorRequestHandler = (err, _req, res, next) => {
    errorMiddlewareCalls.push(err);
    const custom = options.mount?.onErrorMiddleware;
    if (custom) {
      custom(err, _req, res, next);
      return;
    }

    if (!res.headersSent) {
      res.status(500).json({ message: 'probe-error-middleware' });
    }

    next(err);
  };

  return {
    install(): void {
      if (installed) {
        return;
      }

      installed = true;
      app.use(errorMiddleware);
    },
    reset(): void {
      errorMiddlewareCalls.length = 0;
    },
    get errorMiddlewareCalls() {
      return errorMiddlewareCalls;
    },
    get errorMiddlewareReachedOnce() {
      return errorMiddlewareCalls.length === 1;
    },
    get errorMiddlewareNeverReached() {
      return errorMiddlewareCalls.length === 0;
    },
    dispose(): void {
      installed = false;
    },
  };
};

/**
 * Tracks `finish` and `close` on a single Express response. The tracker is
 * constructed per request; call {@link ResponseTerminationTracker.attachedMiddleware}
 * to mount an Express middleware that captures the response for the request,
 * then read `finishedOnce`/`closedOnce` after the request terminates.
 *
 * Use this when a test must prove whether a request finished, closed without
 * finishing, or terminated twice. Listeners are removed via `dispose()` so a
 * test process never leaks response listeners across groups.
 */
export type ResponseTerminationTracker = {
  readonly attachedMiddleware: express.RequestHandler;
  readonly finishCount: number;
  readonly closeCount: number;
  readonly finishedOnce: boolean;
  readonly closedOnce: boolean;
  reset(): void;
  dispose(): void;
};

export const trackResponseTermination = (): ResponseTerminationTracker => {
  let activeResponse: Response | undefined;
  let finishCount = 0;
  let closeCount = 0;
  let finishListener: (() => void) | undefined;
  let closeListener: (() => void) | undefined;

  const detach = (): void => {
    if (activeResponse && finishListener) {
      activeResponse.off('finish', finishListener);
    }

    if (activeResponse && closeListener) {
      activeResponse.off('close', closeListener);
    }

    activeResponse = undefined;
    finishListener = undefined;
    closeListener = undefined;
  };

  const attachedMiddleware: express.RequestHandler = (_req: Request, res: Response, next) => {
    activeResponse = res;
    finishListener = () => {
      finishCount += 1;
    };
    closeListener = () => {
      closeCount += 1;
    };
    res.on('finish', finishListener);
    res.on('close', closeListener);
    next();
  };

  return {
    attachedMiddleware,
    get finishCount() {
      return finishCount;
    },
    get closeCount() {
      return closeCount;
    },
    get finishedOnce() {
      return finishCount === 1;
    },
    get closedOnce() {
      return closeCount === 1;
    },
    reset(): void {
      detach();
      finishCount = 0;
      closeCount = 0;
    },
    dispose(): void {
      detach();
      finishCount = 0;
      closeCount = 0;
    },
  };
};

/**
 * Observes `unhandledRejection` and `uncaughtException` for the lifetime of a
 * single test group. Every listener registered by this helper is removed in
 * `dispose()`, so a test process is never left with phantom global handlers.
 */
export const captureProcessErrors = () => {
  const rejections: unknown[] = [];
  const exceptions: unknown[] = [];
  const rejectionListener = (reason: unknown) => {
    rejections.push(reason);
  };
  const exceptionListener = (err: unknown) => {
    exceptions.push(err);
  };

  process.on('unhandledRejection', rejectionListener);
  process.on('uncaughtException', exceptionListener);

  return {
    get rejections() {
      return rejections;
    },
    get exceptions() {
      return exceptions;
    },
    get observedUnhandledRejection() {
      return rejections.length > 0;
    },
    get observedUncaughtException() {
      return exceptions.length > 0;
    },
    dispose(): void {
      process.off('unhandledRejection', rejectionListener);
      process.off('uncaughtException', exceptionListener);
    },
  };
};

export type ProcessErrorCapture = ReturnType<typeof captureProcessErrors>;

/**
 * Bundles a fresh Express app with a lifecycle probe and an
 * unhandled-rejection/uncaught-exception observer. The probe is NOT installed
 * by default; call {@link ResponseLifecycleProbe.install} AFTER registering
 * routes that should reach Express error middleware, because Express only
 * invokes error-handling layers downstream of the layer that called
 * `next(err)`.
 *
 * Use `dispose()` to clear every listener this helper registered; tests should
 * call it from `afterEach` so a missing probe cannot leak process listeners
 * into later groups.
 */
export const createInstrumentedApp = (options: { captureProcess?: boolean } = {}) => {
  const app = express();
  const probe = createResponseLifecycleProbe(app);
  const tracker = trackResponseTermination();
  const processCapture = options.captureProcess ? captureProcessErrors() : null;

  const dispose = (): void => {
    probe.reset();
    probe.dispose();
    tracker.dispose();
    processCapture?.dispose();
  };

  return {
    app,
    probe,
    tracker,
    processCapture,
    dispose,
  };
};

export type InstrumentedApp = ReturnType<typeof createInstrumentedApp>;

/**
 * Builds an Express app and listener pair suitable for tests that need a real
 * TCP socket (for example to verify backpressure-bound streaming). The socket
 * binds to a random free port (`port: 0`) and is closed via `dispose()`.
 */
export const createBoundApp = async () => {
  const app = express();
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => {
    server.on('listening', () => resolve());
  });
  const address = server.address();
  if (address == null || typeof address === 'string') {
    server.close();
    throw new Error('failed to bind test server');
  }

  return {
    app,
    server,
    port: address.port,
    dispose(): Promise<void> {
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
  };
};

export type BoundApp = ReturnType<typeof createBoundApp>;

/**
 * Restores every mutable field on an `ExpressResponseHandler` to its factory
 * defaults so later test groups do not inherit mutated hooks or providers.
 * Pass the default singleton or a `createHandler()` instance plus the default
 * provider to restore.
 */
export const resetHandlerState = (
  handler: {
    errorMessageProvider: unknown;
    preJson: unknown;
    postJson: unknown;
    preError: unknown;
    postError: unknown;
  },
  defaults: { errorMessageProvider: unknown },
): void => {
  handler.errorMessageProvider = defaults.errorMessageProvider;
  handler.preJson = null;
  handler.postJson = null;
  handler.preError = null;
  handler.postError = null;
};

export { request };
