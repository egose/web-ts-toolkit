import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { startLocalServer, type LocalServer, type LocalServerOptions } from '@web-ts-toolkit/express-runtime';
import { createApp } from './app';
import { databaseName, port } from './domain';
import { registerMessageModels, registerMessageTemplates } from './messages';
import { seedDemoData, seedDemoMessages } from './session';

/** Starts the demo's owned database and HTTP server; shutdown drains HTTP first. */
export async function startExampleServer(
  options: Pick<LocalServerOptions, 'port' | 'host' | 'signals' | 'onListening'> = {},
): Promise<LocalServer> {
  const mongoServer = new MongoMemoryReplSet({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  let server: LocalServer | undefined;
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      try {
        await mongoose.disconnect();
      } finally {
        await mongoServer.stop();
      }
    })();
    return cleanupPromise;
  };

  try {
    await mongoServer.start();
    await mongoose.connect(mongoServer.getUri(), { dbName: databaseName });
    registerMessageModels();
    registerMessageTemplates();
    await seedDemoData();
    await seedDemoMessages();

    server = startLocalServer(createApp(), {
      port,
      ...options,
      // Handle readiness rejection below rather than exiting before cleanup.
      onError: (error) => console.error('Example HTTP server error:', error),
      onShutdown: cleanup,
    });
    await server.ready;
    return server;
  } catch (error) {
    try {
      try {
        await server?.shutdown();
      } finally {
        // A failed listen does not invoke the runtime's shutdown hook.
        await cleanup();
      }
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Example startup and cleanup failed', { cause: cleanupError });
    }
    throw error;
  }
}
