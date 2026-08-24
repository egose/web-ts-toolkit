import type mongoose from 'mongoose';
import { vi } from 'vitest';
import { createDeferred, type Deferred } from './deferred';

export interface DeferredLifecycleHarness {
  events: string[];
  connectStarted: Deferred<void>;
  allowConnect: Deferred<void>;
  initStarted: Deferred<void>;
  allowInit: Deferred<void>;
  shutdownStarted: Deferred<void>;
  allowShutdown: Deferred<void>;
  disconnectStarted: Deferred<void>;
  allowDisconnect: Deferred<void>;
  connection: mongoose.Connection;
  createConnectionSpy: ReturnType<typeof vi.spyOn<typeof mongoose, 'createConnection'>>;
  connectSpy: ReturnType<typeof vi.fn>;
  disconnectSpy: ReturnType<typeof vi.fn>;
  initHook: () => Promise<void>;
  shutdownHook: () => Promise<void>;
}

export function createDeferredLifecycleHarness(mongooseModule: typeof mongoose): DeferredLifecycleHarness {
  const events: string[] = [];
  const connectStarted = createDeferred<void>();
  const allowConnect = createDeferred<void>();
  const initStarted = createDeferred<void>();
  const allowInit = createDeferred<void>();
  const shutdownStarted = createDeferred<void>();
  const allowShutdown = createDeferred<void>();
  const disconnectStarted = createDeferred<void>();
  const allowDisconnect = createDeferred<void>();

  const connection = {
    readyState: 0,
    models: {},
    model: vi.fn(),
    openUri: vi.fn(async () => {
      events.push('connect:start');
      connectStarted.resolve();
      await allowConnect.promise;
      connection.readyState = 1;
      events.push('connect:end');
      return connection;
    }),
    close: vi.fn(async () => {
      events.push('disconnect:start');
      disconnectStarted.resolve();
      await allowDisconnect.promise;
      connection.readyState = 0;
      events.push('disconnect:end');
      return connection;
    }),
  } as unknown as mongoose.Connection;

  const createConnectionSpy = vi.spyOn(mongooseModule, 'createConnection').mockReturnValue(connection);

  return {
    events,
    connectStarted,
    allowConnect,
    initStarted,
    allowInit,
    shutdownStarted,
    allowShutdown,
    disconnectStarted,
    allowDisconnect,
    connection,
    createConnectionSpy,
    connectSpy: connection.openUri as ReturnType<typeof vi.fn>,
    disconnectSpy: connection.close as ReturnType<typeof vi.fn>,
    initHook: async () => {
      events.push('init:start');
      initStarted.resolve();
      await allowInit.promise;
      events.push('init:end');
    },
    shutdownHook: async () => {
      events.push('shutdown:start');
      shutdownStarted.resolve();
      await allowShutdown.promise;
      events.push('shutdown:end');
    },
  };
}
