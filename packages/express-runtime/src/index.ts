import http from 'node:http';
import type { Express, RequestHandler, ErrorRequestHandler } from 'express';
import express from 'express';
import serverless from 'serverless-http';
import { MAX_INTEGER_OPTION_VALUE, parsePortValue, validateFiniteInteger } from './numeric-validation';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

const defaultLogger: Logger = {
  log: (...args: unknown[]) => console.log(...args),
  error: (...args: unknown[]) => console.error(...args),
  debug: (...args: unknown[]) => console.debug(...args),
};

// ---------------------------------------------------------------------------
// createExpressApp
// ---------------------------------------------------------------------------

export interface RouterMount {
  /**
   * Mount path. May be a string or a function returning a string at runtime
   * (e.g. derive from `NODE_ENV` so the same app serves serverless and local
   * URLs without re-wiring).
   */
  path: string | (() => string);
  handler: RequestHandler;
}

export interface ExpressAppOptions {
  /**
   * Middleware registered before the built-in body parsers. Use this for
   * logging, helmet, request-id, etc. Express error handlers in this slot only
   * catch errors from earlier middleware, not later router errors.
   */
  preMiddleware?: ReadonlyArray<RequestHandler | ErrorRequestHandler>;
  /**
   * Middleware registered after body parsers, before routers. Default location
   * for cookies, sessions, auth, CORS, etc. Error-handler entries here only
   * catch errors from earlier slots.
   */
  middleware?: ReadonlyArray<RequestHandler | ErrorRequestHandler>;
  /**
   * Middleware registered after all routers (e.g. a 404 catch-all). Error
   * handlers here catch router errors only if Express reaches this slot before
   * a later handler; prefer `errorHandler` for the final app-wide error handler.
   */
  postMiddleware?: ReadonlyArray<RequestHandler | ErrorRequestHandler>;
  /**
   * `express.json()` options. Pass `false` to disable. Default: `{ limit: '1mb' }`.
   */
  json?: Parameters<typeof express.json>[0] | false;
  /**
   * `express.urlencoded()` options. Pass `false` to disable.
   * Default: `{ extended: false, limit: '1mb' }`.
   */
  urlencoded?: Parameters<typeof express.urlencoded>[0] | false;
  /** Single router convenience. Same as `routers: [router]`. */
  router?: RouterMount;
  /**
   * Multiple routers mounted in order. If `router` is also provided, it is
   * mounted first.
   */
  routers?: ReadonlyArray<RouterMount>;
  /**
   * Express `trust proxy` setting. **Default: `false`** (opt-in). Setting this
   * to a number/loop without a trusted upstream proxy is a security
   * risk (`X-Forwarded-*` spoofing).
   */
  trustProxy?: boolean | number | string | ReadonlyArray<string>;
  /** Disable the `x-powered-by` header. Default: `true`. */
  disablePoweredBy?: boolean;
  /** Express `etag` setting. Default: `false` (disable cache validation). */
  etag?: boolean | string;
  /**
   * Hook called after routers and `postMiddleware`, before `errorHandler`. Use
   * this to register routes that the error handler should catch — routes added
   * after `createExpressApp` returns will not be wrapped by `errorHandler`.
   */
  finalize?(app: Express): void;
  /** Error handler registered last (4-arg middleware). */
  errorHandler?: ErrorRequestHandler;
  /** Logger used internally. Default: `console`. */
  logger?: Logger;
}

function applySettings(app: Express, options: ExpressAppOptions): void {
  if (options.disablePoweredBy !== false) {
    app.disable('x-powered-by');
  }
  app.set('etag', options.etag ?? false);
  // Security default: do NOT trust X-Forwarded-* unless the caller opts in.
  app.set('trust proxy', options.trustProxy ?? false);
}

function applyMiddlewareList(
  app: Express,
  list: ReadonlyArray<RequestHandler | ErrorRequestHandler> | undefined,
): void {
  if (list) {
    for (const mw of list) {
      app.use(mw);
    }
  }
}

function applyRouters(app: Express, options: ExpressAppOptions): void {
  const mounts: RouterMount[] = [];
  if (options.router) mounts.push(options.router);
  if (options.routers) mounts.push(...options.routers);
  for (const mount of mounts) {
    const path = typeof mount.path === 'function' ? mount.path() : mount.path;
    app.use(path, mount.handler);
  }
}

function createDefaultErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, _res, next) => {
    logger.error('Unhandled Express error:', error);
    next(error);
  };
}

export function createExpressApp(options: ExpressAppOptions = {}): Express {
  const app = express();
  const logger = options.logger ?? defaultLogger;

  applySettings(app, options);
  applyMiddlewareList(app, options.preMiddleware);

  if (options.json !== false) {
    app.use(express.json(options.json ?? { limit: '1mb' }));
  }
  if (options.urlencoded !== false) {
    app.use(express.urlencoded(options.urlencoded ?? { extended: false, limit: '1mb' }));
  }

  applyMiddlewareList(app, options.middleware);
  applyRouters(app, options);
  applyMiddlewareList(app, options.postMiddleware);

  if (options.finalize) {
    options.finalize(app);
  }

  if (options.errorHandler) {
    app.use(options.errorHandler);
  } else {
    app.use(createDefaultErrorHandler(logger));
  }

  return app;
}

// ---------------------------------------------------------------------------
// createServerlessHandler
// ---------------------------------------------------------------------------

/**
 * A platform-agnostic serverless handler. Works with Netlify, Vercel, AWS
 * Lambda, and any platform that calls `(event, context)` and expects a
 * response.
 */
export type ServerlessHandler<
  TEvent extends object = Record<string, unknown>,
  TContext extends object = Record<string, unknown>,
> = ((event: TEvent, context: TContext) => Promise<object>) & {
  /**
   * Reset the memoized init promise after it settles. Call to retry a failed
   * cold-start (`init()` rejection is memoized; without `reset()` every
   * subsequent invocation re-throws). Calls while init is still pending are
   * ignored so they cannot start concurrent initialization.
   */
  reset: () => void;
};

/** Type of the options object accepted by `serverless-http`. */
export type ServerlessHttpOptions = NonNullable<Parameters<typeof serverless>[1]>;

export interface ServerlessRequest {
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export type ServerlessResponse = http.ServerResponse;

export type ServerlessRequestHook<
  TEvent extends object = Record<string, unknown>,
  TContext extends object = Record<string, unknown>,
> = (req: ServerlessRequest, event: TEvent, context: TContext) => void | Promise<void>;

export type ServerlessResponseHook<
  TEvent extends object = Record<string, unknown>,
  TContext extends object = Record<string, unknown>,
> = (res: ServerlessResponse, event: TEvent, context: TContext) => void | Promise<void>;

export interface ServerlessHandlerOptions<
  TEvent extends object = Record<string, unknown>,
  TContext extends object = Record<string, unknown>,
> {
  /**
   * Called once per cold start before delegating to the handler. The resulting
   * promise is memoized so subsequent warm invocations skip re-initialization.
   * Synchronous throws and rejected promises are **also** memoized — call
   * `handler.reset()` after settlement to retry. Use this for DB connections,
   * cache warmup, etc.
   */
  init?: () => void | Promise<void>;
  /**
   * Hook called for each request before Express processes it. serverless-http
   * passes `(request, event, context)` to the hook; the event/context generic
   * parameters should match the configured provider.
   */
  request?: ServerlessRequestHook<TEvent, TContext>;
  /** Hook called after Express finishes processing as `(response, event, context)`. */
  response?: ServerlessResponseHook<TEvent, TContext>;
  /**
   * Additional options forwarded to `serverless-http` (e.g. `provider`,
   * `binary`, `basePath`). `request` and `response` are controlled by the
   * dedicated hooks above.
   */
  serverlessOptions?: Omit<ServerlessHttpOptions, 'request' | 'response'>;
  /**
   * Conversion threshold for the default request hook. Bodies larger than this
   * remain unchanged for Express/serverless-http to handle. Default: `1mb`.
   * This is not an end-to-end request rejection limit.
   */
  maxBodyBytes?: number;
  logger?: Logger;
}

/**
 * The default serverless request hook. With serverless-http 4, AWS-style event
 * bodies are already replayed through the request stream, so JSON Buffers are
 * left for Express parsers to consume once. For plain hook-unit inputs without a
 * readable stream, JSON is parsed for exact `application/json` and structured
 * `application/*+json` media types. Other Buffers are converted to UTF-8
 * strings. Malformed JSON is treated as client input and left unchanged without
 * logging an internal error.
 *
 * Public extension seam used by the default `createServerlessHandler()` request
 * hook and by consumers that want the same conservative body conversion policy
 * in a custom hook.
 */
export function defaultRequestHook(
  req: ServerlessRequest,
  maxBodyBytes: number = 1024 * 1024,
  logger: Logger = defaultLogger,
): void {
  if (!req.body || !Buffer.isBuffer(req.body)) {
    return;
  }
  if (req.body.length > maxBodyBytes) {
    logger.debug?.(' Skipping oversized serverless body for content-type parsing');
    return;
  }
  const bodyStr = req.body.toString('utf8');
  const contentType = getHeaderValue(req.headers, 'content-type');
  if (isJsonMediaType(contentType)) {
    if (isReadableRequest(req)) {
      return;
    }
    try {
      req.body = JSON.parse(bodyStr);
    } catch (_error) {
      void _error;
    }
    return;
  }

  req.body = bodyStr;
}

function getHeaderValue(headers: ServerlessRequest['headers'], name: string): string {
  if (!headers) return '';
  const direct = headers[name];
  if (direct !== undefined) return Array.isArray(direct) ? direct.join(', ') : direct;
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = found?.[1];
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : value;
}

function getMediaType(contentType: string): string {
  return contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function isJsonMediaType(contentType: string): boolean {
  const mediaType = getMediaType(contentType);
  if (mediaType === 'application/json') return true;
  if (!mediaType.startsWith('application/')) return false;
  const subtype = mediaType.slice('application/'.length);
  return subtype.endsWith('+json') && subtype.length > '+json'.length;
}

function isReadableRequest(req: ServerlessRequest): boolean {
  const candidate = req as unknown as { pipe?: unknown; on?: unknown; read?: unknown };
  return (
    req instanceof http.IncomingMessage ||
    (typeof candidate.pipe === 'function' && typeof candidate.on === 'function' && typeof candidate.read === 'function')
  );
}

export function createServerlessHandler<
  TEvent extends object = Record<string, unknown>,
  TContext extends object = Record<string, unknown>,
>(app: Express, options: ServerlessHandlerOptions<TEvent, TContext> = {}): ServerlessHandler<TEvent, TContext> {
  const logger = options.logger ?? defaultLogger;
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
  const requestHook: ServerlessRequestHook<TEvent, TContext> =
    options.request ?? ((req) => defaultRequestHook(req, maxBodyBytes, logger));

  const baseOptions: ServerlessHttpOptions = {
    ...(options.serverlessOptions ?? {}),
    request: requestHook,
  };
  if (options.response) {
    baseOptions.response = options.response;
  }

  const apiHandler = serverless(app, baseOptions);

  let initialized: Promise<void> | null = null;
  let initSettled = false;
  const ensureInit = (): Promise<void> => {
    if (!initialized) {
      logger.debug?.('Serverless cold start: running init');
      initSettled = false;
      initialized = Promise.resolve()
        .then(() => options.init?.())
        .then(
          () => {
            initSettled = true;
          },
          (error) => {
            initSettled = true;
            throw error;
          },
        );
    }
    return initialized;
  };

  const handler = async (event: TEvent, context: TContext): Promise<object> => {
    await ensureInit();
    return apiHandler(event, context);
  };
  handler.reset = () => {
    if (initialized && !initSettled) {
      logger.debug?.('Serverless init reset ignored while initialization is pending');
      return;
    }
    initialized = null;
    initSettled = false;
  };
  return handler as ServerlessHandler<TEvent, TContext>;
}

// ---------------------------------------------------------------------------
// startLocalServer
// ---------------------------------------------------------------------------

export interface LocalServerOptions {
  /**
   * Port number or named pipe. Defaults to `process.env.PORT` or `8080`.
   * Strings that don't parse as numbers are treated as named pipe paths.
   */
  port?: number | string;
  /** Hostname to bind. Defaults to `process.env.HOST` or `0.0.0.0`. */
  host?: string;
  /** Called once before the server starts listening. */
  init?: () => Promise<void>;
  /**
   * Called on graceful shutdown (via signal handler or `shutdown()`). The
   * server closes and (if `exitAfterShutdown`) the process exits after this
   * resolves.
   */
  onShutdown?: () => Promise<void> | void;
  /** Called when the server starts listening. */
  onListening?: () => void;
  /** Called when the server encounters an error. Default logs and exits. */
  onError?: (error: NodeJS.ErrnoException) => void;
  /**
   * Register signal handlers for graceful shutdown. Default: `true`
   * (`SIGINT` + `SIGTERM`). Set `false` to manage the lifecycle manually via
   * `shutdown()`. Pass an explicit array to choose different signals.
   */
  signals?: boolean | ReadonlyArray<NodeJS.Signals>;
  /** Max ms to wait for in-flight requests on shutdown. Default: `5000`. */
  shutdownTimeout?: number;
  /**
   * Call `process.exit(0)` after graceful shutdown completes. Default: `false`
   * (programmatic callers manage the process themselves). The CLI sets this to
   * `true`.
   */
  exitAfterShutdown?: boolean;
  logger?: Logger;
}

export interface LocalServer {
  /** The underlying `http.Server`. */
  server: http.Server;
  /**
   * Trigger graceful shutdown. Stops accepting new connections first, drains
   * in-flight requests up to `shutdownTimeout`, then runs `onShutdown`.
   * `shutdownTimeout` covers only request draining; `onShutdown` errors are
   * logged and reject. Memoized so concurrent calls/signals execute at most
   * once. If `exitAfterShutdown` is `true`, the process exits before the
   * promise resolves.
   */
  shutdown: () => Promise<void>;
  /**
   * Awaitable readiness promise. Resolves when the server is listening,
   * rejects on init or listen failure. Rejects if shutdown is requested
   * before listening (e.g. shutdown during pending init).
   */
  ready: Promise<void>;
}

/**
 * Lifecycle states for the local server.
 * - initializing: init running or pending listen
 * - listening: server is accepting connections
 * - stopping: shutdown has been requested, draining
 * - stopped: shutdown completed or server closed externally
 * - failed: init or listen failed
 */
export type LocalServerState = 'initializing' | 'listening' | 'stopping' | 'stopped' | 'failed';

const DEFAULT_SIGNALS: ReadonlyArray<NodeJS.Signals> = ['SIGINT', 'SIGTERM'];
const DEFAULT_SHUTDOWN_TIMEOUT = 5000;

/**
 * Normalize a port value to a number or a named-pipe string. Throws on invalid
 * values (negative, out of 16-bit range). Empty/undefined falls back to
 * `process.env.PORT` then `8080`.
 *
 * Public helper used by `startLocalServer()` and CLI integrations to normalize
 * `PORT`-style configuration into an HTTP port number or named pipe.
 */
export function normalizePort(val: number | string | undefined, name = 'port'): number | string {
  if (val === undefined || val === '') {
    const envPort = process.env.PORT;
    if (envPort === undefined || envPort === '') {
      return 8080;
    }
    val = envPort;
  }
  return parsePortValue(val, name);
}

function defaultOnError(error: NodeJS.ErrnoException, port: number | string, logger: Logger): void {
  if (error.syscall !== 'listen') {
    throw error;
  }
  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;
  if (error.code === 'EACCES') {
    logger.error(`${bind} requires elevated privileges`);
    process.exit(1);
  } else if (error.code === 'EADDRINUSE') {
    logger.error(`${bind} is already in use`);
    process.exit(1);
  } else {
    throw error;
  }
}

export function startLocalServer(app: Express, options: LocalServerOptions = {}): LocalServer {
  const logger = options.logger ?? defaultLogger;
  const port = normalizePort(options.port);
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const shutdownTimeout = validateFiniteInteger(options.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT, {
    name: 'shutdownTimeout',
    min: 0,
    max: MAX_INTEGER_OPTION_VALUE,
  });

  const server = http.createServer(app);
  app.set('port', port);

  let state: LocalServerState = 'initializing';
  let shutdownPromise: Promise<void> | null = null;
  let readySettled = false;
  let readyResolve!: () => void;
  let readyReject!: (err: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = () => {
      if (!readySettled) {
        readySettled = true;
        resolve();
      }
    };
    readyReject = (err: unknown) => {
      if (!readySettled) {
        readySettled = true;
        reject(err);
      }
    };
  });
  // Prevent unhandledRejection when caller hasn't yet awaited ready.
  ready.catch(() => {});

  const ownedSignalHandlers = new Map<NodeJS.Signals, () => void>();

  const cleanupSignalHandlers = (): void => {
    for (const [sig, handler] of ownedSignalHandlers.entries()) {
      process.removeListener(sig as string, handler);
    }
    ownedSignalHandlers.clear();
  };

  const handleListenError = (error: NodeJS.ErrnoException): void => {
    if (state === 'stopping' || state === 'stopped' || state === 'failed') {
      logger.error('Server error after terminal state:', error);
      return;
    }
    if (state === 'initializing') {
      state = 'failed';
      cleanupSignalHandlers();
      readyReject(error);
      if (options.onError) {
        try {
          options.onError(error);
        } catch (e) {
          logger.error(e);
        }
      } else {
        try {
          defaultOnError(error, port, logger);
        } catch (e) {
          logger.error(e);
        }
      }
      // Ensure server is not left half-open
      try {
        server.close();
      } catch (_err) {
        void _err;
      }
      return;
    }
    // listening state: runtime error
    if (options.onError) {
      try {
        options.onError(error);
      } catch (e) {
        logger.error(e);
      }
    } else {
      try {
        defaultOnError(error, port, logger);
      } catch (e) {
        logger.error(e);
      }
    }
  };

  const onListening = (): void => {
    if (state === 'stopping' || state === 'stopped' || state === 'failed') {
      // Shutdown requested before listening succeeded — close immediately and keep not listening.
      try {
        server.close();
      } catch (_err) {
        void _err;
      }
      return;
    }
    state = 'listening';
    const addr = server.address();
    const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${(addr as { port: number } | null)?.port}`;
    // Log the actual bound address for port 0.
    const actualPort = typeof addr === 'object' && addr !== null ? (addr as { port: number }).port : port;
    if (typeof addr === 'object' && addr !== null) {
      logger.log(`Server running at http://${host}:${actualPort}/ (${bind})`);
    } else if (typeof addr === 'string') {
      logger.log(`Server running at pipe ${addr} (${bind})`);
    } else {
      logger.log(`Server running at http://${host}:${port}/ (${bind})`);
    }
    try {
      options.onListening?.();
    } catch (e) {
      logger.error('onListening hook failed:', e);
    }
    readyResolve();
  };

  const handleClose = (): void => {
    if (state === 'stopping') {
      // shutdown is handling close; final transition to stopped happens in shutdown flow
      return;
    }
    if (state === 'listening') {
      state = 'stopped';
      cleanupSignalHandlers();
      return;
    }
    if (state === 'initializing' && !readySettled) {
      state = 'stopped';
      cleanupSignalHandlers();
      readyReject(new Error('Server closed before listening'));
      return;
    }
    if (state === 'initializing') {
      state = 'stopped';
      cleanupSignalHandlers();
    }
  };

  server.on('error', handleListenError);
  server.on('listening', onListening);
  server.on('close', handleClose);

  const doShutdown = async (): Promise<void> => {
    // Mark stopping before awaiting anything
    if (state === 'stopping' || state === 'stopped') {
      return;
    }
    if (state === 'failed') {
      state = 'stopped';
      cleanupSignalHandlers();
      return;
    }
    state = 'stopping';

    // Reject ready if not yet listening — shutdown before listening is a terminal failure for ready
    if (!readySettled) {
      readyReject(new Error('Server shutdown before listening'));
    }

    // Remove only owned signal handlers
    cleanupSignalHandlers();

    logger.log('Shutting down...');

    // Stop accepting new connections before application resource teardown,
    // drain in-flight requests up to the timeout, then run onShutdown.
    await new Promise<void>((resolve) => {
      if (!server.listening) {
        // Never started or already closed externally — deterministic no-op
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        try {
          server.closeAllConnections?.();
        } catch (_err) {
          void _err;
        }
        done();
      }, shutdownTimeout);
      timer.unref?.();
      try {
        server.close((err) => {
          if (err) {
            logger.error('Server close error:', err);
          }
          done();
        });
      } catch (err) {
        logger.error('Server close error:', err);
        done();
      }
    });

    // Drain complete — now run application cleanup under documented policy:
    // shutdownTimeout covers only draining; cleanup failure is reported and
    // propagates unless the CLI-owned process exit path handles it here.
    let shutdownError: unknown;
    try {
      if (options.onShutdown) {
        await options.onShutdown();
      }
    } catch (err) {
      logger.error('onShutdown hook failed:', err);
      shutdownError = err;
    }

    if (shutdownError) {
      state = 'failed';
      if (options.exitAfterShutdown) {
        process.exit(1);
      }
      throw shutdownError;
    }

    state = 'stopped';

    if (options.exitAfterShutdown) {
      process.exit(0);
    }
  };

  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = doShutdown();
    return shutdownPromise;
  };

  if (options.signals !== false) {
    const list =
      options.signals === undefined || options.signals === true
        ? DEFAULT_SIGNALS
        : (options.signals as ReadonlyArray<NodeJS.Signals>);
    for (const sig of list) {
      const handler = () => {
        void shutdown().catch(() => {});
      };
      ownedSignalHandlers.set(sig, handler);
      process.once(sig as string, handler);
    }
  }

  const start = async (): Promise<void> => {
    try {
      if (options.init) {
        await options.init();
      }
      if (state === 'stopping' || state === 'stopped' || state === 'failed') {
        // Completed shutdown must prevent pending startup from listening later.
        return;
      }
      if (typeof port === 'number') {
        server.listen(port, host);
      } else {
        server.listen(port);
      }
    } catch (err) {
      if (state === 'stopping' || state === 'stopped') {
        logger.error('Init failed after shutdown started:', err);
        return;
      }
      state = 'failed';
      cleanupSignalHandlers();
      const error = err as NodeJS.ErrnoException;
      readyReject(error);
      if (options.onError) {
        try {
          options.onError(error);
        } catch (e) {
          logger.error(e);
        }
      } else {
        // Init failures are not listen errors — log rather than throwing via defaultOnError
        logger.error('Init failed:', error);
      }
      try {
        server.close();
      } catch (_err) {
        void _err;
      }
    }
  };

  void start();

  return {
    server,
    shutdown,
    ready,
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { Express, RequestHandler, ErrorRequestHandler };
export type { Options as RawServerlessHttpOptions } from 'serverless-http';
export { parsePortValue, validateFiniteInteger } from './numeric-validation';
