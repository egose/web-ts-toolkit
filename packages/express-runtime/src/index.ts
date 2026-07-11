import http from 'node:http';
import type { Express, RequestHandler, ErrorRequestHandler } from 'express';
import express from 'express';
import serverless from 'serverless-http';

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
   * logging, helmet, request-id, etc.
   */
  preMiddleware?: ReadonlyArray<RequestHandler | ErrorRequestHandler>;
  /**
   * Middleware registered after body parsers, before routers. Default location
   * for cookies, sessions, auth, CORS, etc.
   */
  middleware?: ReadonlyArray<RequestHandler | ErrorRequestHandler>;
  /**
   * Middleware registered after all routers (e.g. a 404 catch-all).
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

export function createExpressApp(options: ExpressAppOptions = {}): Express {
  const app = express();

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
export type ServerlessHandler = ((event: unknown, context: unknown) => Promise<unknown>) & {
  /**
   * Reset the memoized init promise. Call to retry a failed cold-start
   * (`init()` rejection is memoized; without `reset()` every subsequent
   * invocation re-throws).
   */
  reset: () => void;
};

/** Type of the options object accepted by `serverless-http`. */
export type ServerlessHttpOptions = NonNullable<Parameters<typeof serverless>[1]>;

export interface ServerlessRequest {
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ServerlessHandlerOptions {
  /**
   * Called once per cold start before delegating to the handler. The resulting
   * promise is memoized so subsequent warm invocations skip re-initialization.
   * A rejected promise is **also** memoized — call `handler.reset()` to retry.
   * Use this for DB connections, cache warmup, etc.
   */
  init?: () => Promise<void>;
  /**
   * Hook called for each request before Express processes it. The default
   * implementation works around serverless-http issue #305 by parsing Buffer
   * bodies into JSON or strings. Pass a function to override this behavior.
   */
  request?: (req: ServerlessRequest) => void | Promise<void>;
  /** Hook called after Express finishes processing. */
  response?: (res: unknown) => void | Promise<void>;
  /**
   * Additional options forwarded to `serverless-http` (e.g. `provider`,
   * `binary`, `basePath`). `request` and `response` are controlled by the
   * dedicated hooks above.
   */
  serverlessOptions?: Omit<ServerlessHttpOptions, 'request' | 'response'>;
  /**
   * Skip parsing bodies larger than this in the default request hook.
   * Default: `1mb`. Platform events bypass Express body-parser limits, so the
   * default hook applies its own size guard.
   */
  maxBodyBytes?: number;
  logger?: Logger;
}

/**
 * The default serverless request hook. Parses Buffer bodies into JSON (when
 * `content-type` starts with `application/json`, allowing charset variations)
 * or UTF-8 strings — a workaround for serverless-http issue #305.
 *
 * Exported for direct unit testing.
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
  try {
    const bodyStr = req.body.toString('utf8');
    const contentType = (req.headers?.['content-type'] ?? '').toLowerCase();
    if (contentType.startsWith('application/json')) {
      req.body = JSON.parse(bodyStr);
    } else {
      req.body = bodyStr;
    }
  } catch (error) {
    logger.error('Failed to parse serverless request body:', error);
  }
}

export function createServerlessHandler(app: Express, options: ServerlessHandlerOptions = {}): ServerlessHandler {
  const logger = options.logger ?? defaultLogger;
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
  const requestHook = options.request ?? ((req: ServerlessRequest) => defaultRequestHook(req, maxBodyBytes, logger));

  const baseOptions: ServerlessHttpOptions = {
    ...(options.serverlessOptions ?? {}),
    request: requestHook as ServerlessHttpOptions['request'],
  };
  if (options.response) {
    baseOptions.response = options.response as ServerlessHttpOptions['response'];
  }

  const apiHandler = serverless(app, baseOptions);

  let initialized: Promise<void> | null = null;
  const ensureInit = (): Promise<void> => {
    if (!initialized) {
      logger.debug?.('Serverless cold start: running init');
      initialized = options.init ? options.init() : Promise.resolve();
    }
    return initialized;
  };

  const handler = async (event: unknown, context: unknown): Promise<unknown> => {
    await ensureInit();
    return apiHandler(event as object, context as object);
  };
  handler.reset = () => {
    initialized = null;
  };
  return handler as ServerlessHandler;
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
   * Trigger graceful shutdown. Resolves after `onShutdown` and `server.close`
   * complete (or after `shutdownTimeout` ms, force-closing idle connections).
   * If `exitAfterShutdown` is `true`, the process exits before the promise
   * resolves.
   */
  shutdown: () => Promise<void>;
}

const DEFAULT_SIGNALS: ReadonlyArray<NodeJS.Signals> = ['SIGINT', 'SIGTERM'];
const DEFAULT_SHUTDOWN_TIMEOUT = 5000;

/**
 * Normalize a port value to a number or a named-pipe string. Throws on invalid
 * values (negative, out of 16-bit range). Empty/undefined falls back to
 * `process.env.PORT` then `8080`.
 *
 * Exported for direct unit testing.
 */
export function normalizePort(val: number | string | undefined): number | string {
  if (val === undefined || val === '') {
    const envPort = process.env.PORT;
    if (envPort === undefined || envPort === '') {
      return 8080;
    }
    val = envPort;
  }
  if (typeof val === 'string') {
    const parsed = Number(val);
    if (Number.isNaN(parsed)) {
      // Non-numeric string: treat as named pipe path.
      return val;
    }
    val = parsed;
  }
  if (!Number.isFinite(val) || val < 0 || val > 65535) {
    throw new Error(`Invalid port: ${String(val)}`);
  }
  return val as number;
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
  const shutdownTimeout = options.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT;

  const server = http.createServer(app);
  app.set('port', port);

  const onError = (error: NodeJS.ErrnoException): void => {
    if (options.onError) {
      options.onError(error);
    } else {
      defaultOnError(error, port, logger);
    }
  };
  const onListening = (): void => {
    const addr = server.address();
    const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr?.port}`;
    logger.log(`Server running at http://${host}:${port}/ (${bind})`);
    options.onListening?.();
  };

  server.on('error', onError);
  server.on('listening', onListening);

  const shutdown = async (): Promise<void> => {
    logger.log('Shutting down...');
    try {
      if (options.onShutdown) {
        await options.onShutdown();
      }
    } catch (err) {
      logger.error('onShutdown hook failed:', err);
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        // Force-close idle connections after the timeout (Node 18.2+).
        server.closeAllConnections?.();
        resolve();
      }, shutdownTimeout);
      server.close((err) => {
        clearTimeout(timer);
        if (err) {
          logger.error('Server close error:', err);
        }
        resolve();
      });
    });
    if (options.exitAfterShutdown) {
      process.exit(0);
    }
  };

  if (options.signals !== false) {
    const list = options.signals === undefined || options.signals === true ? DEFAULT_SIGNALS : options.signals;
    for (const sig of list) {
      process.once(sig, () => void shutdown());
    }
  }

  const start = async (): Promise<void> => {
    try {
      if (options.init) {
        await options.init();
      }
      if (typeof port === 'number') {
        server.listen(port, host);
      } else {
        // Named pipe: listen takes the path, not (port, host).
        server.listen(port);
      }
    } catch (err) {
      // Surface init/listen failures via the server error handler so the
      // rejection does not become an unhandled promise rejection.
      server.emit('error', err);
    }
  };

  void start();

  return {
    server,
    shutdown,
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { Express, RequestHandler, ErrorRequestHandler };
export type { Options as RawServerlessHttpOptions } from 'serverless-http';
