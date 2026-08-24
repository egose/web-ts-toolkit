import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAccessRouterRuntime } from '../src/index';
import { createDeferredLifecycleHarness } from './support/lifecycle';
import {
  captureListenerSnapshot,
  getListenerCounts,
  restoreListenerSnapshot,
  RUNTIME_SIGNALS,
} from './support/process-listeners';

describe('lifecycle harness', () => {
  const originalSnapshot = captureListenerSnapshot(RUNTIME_SIGNALS);
  const sentinelSIGINT = () => {};
  const sentinelSIGTERM = () => {};
  let baselineSnapshot = originalSnapshot;
  let baselineCounts: Record<string, number>;

  beforeAll(() => {
    process.on('SIGINT', sentinelSIGINT);
    process.on('SIGTERM', sentinelSIGTERM);
    baselineSnapshot = captureListenerSnapshot(RUNTIME_SIGNALS);
    baselineCounts = getListenerCounts(RUNTIME_SIGNALS);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    restoreListenerSnapshot(baselineSnapshot, RUNTIME_SIGNALS);
    expect(process.listeners('SIGINT')).toContain(sentinelSIGINT);
    expect(process.listeners('SIGTERM')).toContain(sentinelSIGTERM);
    expect(getListenerCounts(RUNTIME_SIGNALS)).toEqual(baselineCounts);
  });

  afterAll(() => {
    restoreListenerSnapshot(originalSnapshot, RUNTIME_SIGNALS);
  });

  it('controls connect, init, shutdown, and disconnect ordering without arbitrary delays', async () => {
    const harness = createDeferredLifecycleHarness(mongoose);
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/access-router-runtime-lifecycle' },
      init: harness.initHook,
      shutdown: harness.shutdownHook,
    });

    const initPromise = runtime.init();
    await harness.connectStarted.promise;
    expect(harness.events).toEqual(['connect:start']);

    harness.allowConnect.resolve();
    await harness.initStarted.promise;
    expect(harness.events).toEqual(['connect:start', 'connect:end', 'init:start']);

    harness.allowInit.resolve();
    await initPromise;
    expect(harness.events).toEqual(['connect:start', 'connect:end', 'init:start', 'init:end']);

    const shutdownPromise = runtime.shutdown();
    await harness.shutdownStarted.promise;
    expect(harness.events).toEqual(['connect:start', 'connect:end', 'init:start', 'init:end', 'shutdown:start']);

    harness.allowShutdown.resolve();
    await harness.disconnectStarted.promise;
    expect(harness.events).toEqual([
      'connect:start',
      'connect:end',
      'init:start',
      'init:end',
      'shutdown:start',
      'shutdown:end',
      'disconnect:start',
    ]);

    harness.allowDisconnect.resolve();
    await shutdownPromise;
    expect(harness.events).toEqual([
      'connect:start',
      'connect:end',
      'init:start',
      'init:end',
      'shutdown:start',
      'shutdown:end',
      'disconnect:start',
      'disconnect:end',
    ]);
    expect(harness.connectSpy).toHaveBeenCalledTimes(1);
    expect(harness.disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('does not let shutdown during pending connect resolve before late resources are disconnected', async () => {
    const harness = createDeferredLifecycleHarness(mongoose);
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/access-router-runtime-shutdown-during-connect' },
      init: harness.initHook,
    });

    const initError = runtime.init().catch((error: unknown) => error);
    await harness.connectStarted.promise;
    const shutdownPromise = runtime.shutdown();
    await expect(runtime.init()).rejects.toThrow(/stopping/);
    let shutdownSettled = false;
    void shutdownPromise.then(() => {
      shutdownSettled = true;
    });

    harness.allowConnect.resolve();
    await harness.disconnectStarted.promise;
    await Promise.resolve();
    expect(shutdownSettled).toBe(false);
    expect(harness.events).toEqual(['connect:start', 'connect:end', 'disconnect:start']);
    expect(harness.initStarted.settled()).toBe(false);

    harness.allowDisconnect.resolve();
    await shutdownPromise;
    await expect(initError).resolves.toMatchObject({
      message: expect.stringMatching(/shutdown requested before initialization completed/i),
    });
    await expect(runtime.init()).rejects.toThrow(/stopped/);
    expect(harness.connectSpy).toHaveBeenCalledTimes(1);
    expect(harness.disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('does not let shutdown during pending config init resolve before initialized resources are cleaned', async () => {
    const harness = createDeferredLifecycleHarness(mongoose);
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/access-router-runtime-shutdown-during-init' },
      init: harness.initHook,
      shutdown: harness.shutdownHook,
    });

    const initError = runtime.init().catch((error: unknown) => error);
    await harness.connectStarted.promise;
    harness.allowConnect.resolve();
    await harness.initStarted.promise;

    const shutdownPromise = runtime.shutdown();
    let shutdownSettled = false;
    void shutdownPromise.then(() => {
      shutdownSettled = true;
    });

    harness.allowInit.resolve();
    await harness.shutdownStarted.promise;
    await Promise.resolve();
    expect(shutdownSettled).toBe(false);
    expect(harness.events).toEqual(['connect:start', 'connect:end', 'init:start', 'init:end', 'shutdown:start']);

    harness.allowShutdown.resolve();
    await harness.disconnectStarted.promise;
    harness.allowDisconnect.resolve();
    await shutdownPromise;
    await expect(initError).resolves.toMatchObject({
      message: expect.stringMatching(/shutdown requested before initialization completed/i),
    });
    expect(harness.events).toEqual([
      'connect:start',
      'connect:end',
      'init:start',
      'init:end',
      'shutdown:start',
      'shutdown:end',
      'disconnect:start',
      'disconnect:end',
    ]);
    expect(harness.connectSpy).toHaveBeenCalledTimes(1);
    expect(harness.disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('makes shutdown before initialization terminal and idempotent', async () => {
    const shutdownHook = vi.fn();
    const runtime = createAccessRouterRuntime({ shutdown: shutdownHook });

    await runtime.shutdown();
    await runtime.shutdown();

    expect(shutdownHook).toHaveBeenCalledTimes(1);
    await expect(runtime.init()).rejects.toThrow(/stopped/);
  });

  it('rolls back config init failures and preserves rollback errors after the primary failure', async () => {
    const harness = createDeferredLifecycleHarness(mongoose);
    const primary = new Error('config init failed');
    const shutdownFailure = new Error('config shutdown failed');
    const disconnectFailure = new Error('database cleanup failed');
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/access-router-runtime-init-rollback' },
      init: harness.initHook,
      shutdown: harness.shutdownHook,
    });

    const initPromise = runtime.init();
    await harness.connectStarted.promise;
    harness.allowConnect.resolve();
    await harness.initStarted.promise;
    harness.allowInit.reject(primary);
    await harness.shutdownStarted.promise;
    harness.allowShutdown.reject(shutdownFailure);
    await harness.disconnectStarted.promise;
    harness.allowDisconnect.reject(disconnectFailure);

    await expect(initPromise).rejects.toMatchObject({
      errors: [primary, shutdownFailure, disconnectFailure],
      message: 'Runtime initialization failed and rollback also failed',
    });
    expect(harness.events).toEqual([
      'connect:start',
      'connect:end',
      'init:start',
      'shutdown:start',
      'disconnect:start',
    ]);
  });

  it('rolls back partially opened connections when connect rejects', async () => {
    const connectFailure = new Error('connect failed after opening');
    const connection = {
      readyState: 0,
      models: {},
      openUri: vi.fn(async () => {
        connection.readyState = 1;
        throw connectFailure;
      }),
      close: vi.fn(async () => {
        connection.readyState = 0;
        return connection;
      }),
    } as unknown as mongoose.Connection;
    vi.spyOn(mongoose, 'createConnection').mockReturnValue(connection);
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/access-router-runtime-connect-fail' },
    });

    await expect(runtime.init()).rejects.toBe(connectFailure);
    expect(connection.openUri).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('captures config shutdown and database cleanup failures independently', async () => {
    const shutdownFailure = new Error('config shutdown failed');
    const disconnectFailure = new Error('database cleanup failed');
    const connection = {
      readyState: 0,
      models: {},
      openUri: vi.fn(async () => {
        connection.readyState = 1;
        return connection;
      }),
      close: vi.fn(async () => {
        throw disconnectFailure;
      }),
    } as unknown as mongoose.Connection;
    vi.spyOn(mongoose, 'createConnection').mockReturnValue(connection);
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/access-router-runtime-shutdown-failures' },
      shutdown: () => {
        throw shutdownFailure;
      },
    });

    await runtime.init();
    await expect(runtime.shutdown()).rejects.toMatchObject({
      errors: [shutdownFailure, disconnectFailure],
      message: 'Runtime shutdown failed',
    });
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('single-flights concurrent init and shutdown calls', async () => {
    const harness = createDeferredLifecycleHarness(mongoose);
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/access-router-runtime-single-flight' },
      init: harness.initHook,
      shutdown: harness.shutdownHook,
    });

    const initA = runtime.init();
    const initB = runtime.init();
    await harness.connectStarted.promise;
    harness.allowConnect.resolve();
    await harness.initStarted.promise;
    harness.allowInit.resolve();
    await Promise.all([initA, initB]);

    const shutdownA = runtime.shutdown();
    const shutdownB = runtime.shutdown();
    await harness.shutdownStarted.promise;
    harness.allowShutdown.resolve();
    await harness.disconnectStarted.promise;
    harness.allowDisconnect.resolve();
    await Promise.all([shutdownA, shutdownB]);

    expect(harness.connectSpy).toHaveBeenCalledTimes(1);
    expect(harness.initStarted.settled()).toBe(true);
    expect(harness.disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('retries deterministically after init and shutdown failures', async () => {
    const connection = {
      readyState: 0,
      models: {},
      openUri: vi.fn(async () => {
        connection.readyState = 1;
        return connection;
      }),
      close: vi.fn(async () => {
        connection.readyState = 0;
        return connection;
      }),
    } as unknown as mongoose.Connection;
    vi.spyOn(mongoose, 'createConnection').mockReturnValue(connection);
    const initHook = vi.fn().mockRejectedValueOnce(new Error('first init failed')).mockResolvedValueOnce(undefined);
    let failExplicitShutdown = false;
    const shutdownHook = vi.fn(async () => {
      if (failExplicitShutdown) {
        failExplicitShutdown = false;
        throw new Error('first shutdown failed');
      }
    });
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/access-router-runtime-retry' },
      init: initHook,
      shutdown: shutdownHook,
    });

    await expect(runtime.init()).rejects.toThrow('first init failed');
    expect(connection.close).toHaveBeenCalledTimes(1);

    await runtime.init();
    failExplicitShutdown = true;
    await expect(runtime.shutdown()).rejects.toThrow('first shutdown failed');
    await runtime.shutdown();

    expect(initHook).toHaveBeenCalledTimes(2);
    expect(shutdownHook).toHaveBeenCalledTimes(3);
    expect(connection.openUri).toHaveBeenCalledTimes(2);
  });

  it('rolls back serverless caller init failure without retaining an owned connection', async () => {
    const connection = {
      readyState: 0,
      models: {},
      openUri: vi.fn(async () => {
        connection.readyState = 1;
        return connection;
      }),
      close: vi.fn(async () => {
        connection.readyState = 0;
        return connection;
      }),
    } as unknown as mongoose.Connection;
    vi.spyOn(mongoose, 'createConnection').mockReturnValue(connection);
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/access-router-runtime-serverless-caller-fail' },
      express: {
        finalize(app) {
          app.get('/ok', (_req, res) => res.json({ ok: true }));
        },
      },
    });
    const handler = runtime.createServerlessHandler({
      init: () => {
        throw new Error('serverless caller init failed');
      },
    });

    await expect(handler({ httpMethod: 'GET', path: '/ok', headers: {} }, {})).rejects.toThrow(
      'serverless caller init failed',
    );
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(connection.readyState).toBe(0);
  });

  it('rolls back local caller init failure after caller shutdown failure and leaves no open port', async () => {
    const connection = {
      readyState: 0,
      models: {},
      openUri: vi.fn(async () => {
        connection.readyState = 1;
        return connection;
      }),
      close: vi.fn(async () => {
        connection.readyState = 0;
        return connection;
      }),
    } as unknown as mongoose.Connection;
    vi.spyOn(mongoose, 'createConnection').mockReturnValue(connection);
    const callerShutdownFailure = new Error('caller shutdown failed');
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/access-router-runtime-local-caller-fail' },
    });
    const local = runtime.startLocalServer({
      port: 0,
      signals: false,
      logger: { log: vi.fn(), error: vi.fn(), debug: vi.fn() },
      init: () => {
        throw new Error('local caller init failed');
      },
      onShutdown: () => {
        throw callerShutdownFailure;
      },
    });

    await expect(local.ready).rejects.toMatchObject({
      errors: [expect.any(Error), callerShutdownFailure],
      message: 'Runtime caller initialization failed and rollback also failed',
    });
    expect(local.server.listening).toBe(false);
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(connection.readyState).toBe(0);
    await local.shutdown();
  });

  it('preserves pre-existing signal listeners and restores listener counts', () => {
    const before = captureListenerSnapshot(RUNTIME_SIGNALS);
    const extraListener = () => {};

    process.once('SIGINT', extraListener);
    expect(process.listeners('SIGINT')).toContain(extraListener);

    restoreListenerSnapshot(before, RUNTIME_SIGNALS);

    expect(process.listeners('SIGINT')).toContain(sentinelSIGINT);
    expect(process.listeners('SIGTERM')).toContain(sentinelSIGTERM);
    expect(process.listeners('SIGINT')).not.toContain(extraListener);
    expect(getListenerCounts(RUNTIME_SIGNALS)).toEqual(baselineCounts);
  });
});
