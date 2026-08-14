import { randomUUID } from 'node:crypto';

import { MongoClient, type Admin, type Collection, type CommandStartedEvent, type Db } from 'mongodb';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';

export const MONGO_TIMEOUT = 120_000;

type MongoMemoryHarnessOptions = {
  monitorCommands?: boolean;
};

export type MongoMemoryHarness = {
  client: MongoClient;
  commandStartedEvents: CommandStartedEvent[];
  createDb: (prefix: string) => Db;
  stop: () => Promise<void>;
};

const enableTestCommandsArgs = ['--setParameter', 'enableTestCommands=1'];

const createDbName = (prefix: string) => `${prefix.slice(0, 20)}-${randomUUID().slice(0, 8)}`;

const createClient = async (uri: string, options: MongoMemoryHarnessOptions = {}) => {
  const commandStartedEvents: CommandStartedEvent[] = [];
  const client = new MongoClient(uri, { monitorCommands: options.monitorCommands });

  if (options.monitorCommands) {
    client.on('commandStarted', (event) => {
      commandStartedEvents.push(event);
    });
  }

  await client.connect();

  return { client, commandStartedEvents };
};

export const createStandaloneHarness = async (options: MongoMemoryHarnessOptions = {}): Promise<MongoMemoryHarness> => {
  const server = await MongoMemoryServer.create({
    instance: {
      args: enableTestCommandsArgs,
    },
  });
  const { client, commandStartedEvents } = await createClient(server.getUri(), options);

  return {
    client,
    commandStartedEvents,
    createDb: (prefix) => client.db(createDbName(prefix)),
    stop: async () => {
      await client.close();
      await server.stop();
    },
  };
};

export const createReplicaSetHarness = async (options: MongoMemoryHarnessOptions = {}): Promise<MongoMemoryHarness> => {
  const replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
    },
    instanceOpts: [
      {
        args: enableTestCommandsArgs,
      },
    ],
  });
  const { client, commandStartedEvents } = await createClient(replSet.getUri(), options);

  return {
    client,
    commandStartedEvents,
    createDb: (prefix) => client.db(createDbName(prefix)),
    stop: async () => {
      await client.close();
      await replSet.stop();
    },
  };
};

export const withFailCommand = async <T>(
  db: Db,
  options: {
    failCommands: string[];
    times?: number;
    errorCode?: number;
  },
  run: () => Promise<T>,
): Promise<T> => {
  await db.admin().command({
    configureFailPoint: 'failCommand',
    mode: { times: options.times ?? 1 },
    data: {
      failCommands: options.failCommands,
      errorCode: options.errorCode ?? 10107,
    },
  });

  try {
    return await run();
  } finally {
    await db.admin().command({
      configureFailPoint: 'failCommand',
      mode: 'off',
    });
  }
};

export const createDbWithCollectionWriteFailure = (
  db: Db,
  options: {
    collectionName: string;
    methodName: 'insertOne' | 'updateOne' | 'deleteOne';
    error?: Error;
  },
): Db => {
  let failed = false;
  const error = options.error ?? new Error(`Injected ${options.collectionName}.${options.methodName} failure`);

  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'collection') {
        return Reflect.get(target, property, receiver);
      }

      return <TSchema extends { _id?: unknown } = { _id?: unknown }>(name: string) => {
        const collection = target.collection<TSchema>(name);

        if (name !== options.collectionName) {
          return collection;
        }

        return new Proxy(collection, {
          get(collectionTarget, collectionProperty, collectionReceiver) {
            if (collectionProperty !== options.methodName) {
              return Reflect.get(collectionTarget, collectionProperty, collectionReceiver);
            }

            return async (...args: unknown[]) => {
              if (!failed) {
                failed = true;
                throw error;
              }

              const method = Reflect.get(collectionTarget, collectionProperty, collectionReceiver) as (
                ...methodArgs: unknown[]
              ) => Promise<unknown>;
              return method.apply(collectionTarget, args);
            };
          },
        }) as Collection<TSchema>;
      };
    },
  }) as Db;
};

export const createDbWithAdminCommandFailure = (
  db: Db,
  options: {
    commandName: string;
    error: Error;
  },
): Db => {
  let failed = false;

  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'admin') {
        return Reflect.get(target, property, receiver);
      }

      return () => {
        const admin = target.admin();

        return new Proxy(admin, {
          get(adminTarget, adminProperty, adminReceiver) {
            if (adminProperty !== 'command') {
              return Reflect.get(adminTarget, adminProperty, adminReceiver);
            }

            return async (command: Record<string, unknown>, ...args: unknown[]) => {
              if (!failed && options.commandName in command) {
                failed = true;
                throw options.error;
              }

              return adminTarget.command(command, ...args);
            };
          },
        }) as Admin;
      };
    },
  }) as Db;
};
