import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

import {
  MongoClient,
  type Admin,
  type Collection,
  type CollectionOptions,
  type CommandStartedEvent,
  type Db,
  type RunCommandOptions,
} from 'mongodb';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';

export const MONGO_TIMEOUT = 120_000;

type MongoMemoryHarnessOptions = {
  monitorCommands?: boolean;
  replicaSetMembers?: number;
  serverSelectionTimeoutMS?: number;
};

export type MongoMemoryHarness = {
  uri: string;
  client: MongoClient;
  commandStartedEvents: CommandStartedEvent[];
  createDb: (prefix: string) => Db;
  stop: () => Promise<void>;
};

const enableTestCommandsArgs = ['--setParameter', 'enableTestCommands=1'];

const createDbName = (prefix: string) => `${prefix.slice(0, 20)}-${randomUUID().slice(0, 8)}`;

const createClient = async (uri: string, options: MongoMemoryHarnessOptions = {}) => {
  const commandStartedEvents: CommandStartedEvent[] = [];
  const client = new MongoClient(uri, {
    monitorCommands: options.monitorCommands,
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
  });

  if (options.monitorCommands) {
    client.on('commandStarted', (event) => {
      commandStartedEvents.push(event);
    });
  }

  try {
    await client.connect();
  } catch (error) {
    await client.close();
    throw error;
  }

  return { client, commandStartedEvents };
};

export const createStandaloneHarness = async (options: MongoMemoryHarnessOptions = {}): Promise<MongoMemoryHarness> => {
  const server = await MongoMemoryServer.create({
    instance: {
      args: enableTestCommandsArgs,
    },
  });
  const uri = server.getUri();
  const { client, commandStartedEvents } = await createClient(uri, options);

  return {
    uri,
    client,
    commandStartedEvents,
    createDb: (prefix) => client.db(createDbName(prefix)),
    stop: async () => {
      await client.close();
      await server.stop();
    },
  };
};

export const createReplicaSetHarness = async (
  options: MongoMemoryHarnessOptions = {},
): Promise<MongoMemoryHarness & { stopPrimary: () => Promise<void> }> => {
  const replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: options.replicaSetMembers ?? 1,
      // memory-server's 500ms election default is too aggressive for concurrent
      // package fixtures. Use MongoDB's normal 10s budget for multi-member sets.
      configSettings: (options.replicaSetMembers ?? 1) > 1 ? { electionTimeoutMillis: 10_000 } : undefined,
    },
    instanceOpts: Array.from({ length: options.replicaSetMembers ?? 1 }, () => ({ args: enableTestCommandsArgs })),
  });
  const uri = replSet.getUri();
  let connected: Awaited<ReturnType<typeof createClient>> | undefined;
  try {
    connected = await createClient(uri, options);
    if ((options.replicaSetMembers ?? 1) > 1) {
      const deadline = Date.now() + 30_000;
      for (;;) {
        const status = await connected.client.db('admin').command({ replSetGetStatus: 1 });
        const members = status.members as { stateStr: string }[];
        if (
          members.length === options.replicaSetMembers &&
          members.filter((member) => member.stateStr === 'PRIMARY').length === 1 &&
          members.filter((member) => member.stateStr === 'SECONDARY').length === members.length - 1
        ) {
          break;
        }
        if (Date.now() >= deadline) throw new Error('Disposable replica set members did not become ready.');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  } catch (error) {
    try {
      await connected?.client.close();
    } finally {
      await replSet.stop();
    }
    throw error;
  }
  const { client, commandStartedEvents } = connected;

  return {
    uri,
    client,
    commandStartedEvents,
    createDb: (prefix) => client.db(createDbName(prefix)),
    stopPrimary: async () => {
      const hello = await client.db('admin').command({ hello: 1 });
      const server = replSet.servers.find((member) => hello.primary === `127.0.0.1:${member.instanceInfo?.port}`);
      if (!server) throw new Error('Disposable replica set primary not found.');
      // A graceful shutdown can hand primary to the other member before exiting.
      // Crash this disposable process so a two-voter set loses majority instead.
      const instance = server.instanceInfo?.instance;
      const process = instance?.mongodProcess;
      if (!instance || !process) throw new Error('Disposable primary process not found.');
      const exited = once(process, 'exit');
      process.kill('SIGKILL');
      await exited;
      // memory-server keeps an exited process reference after an external crash;
      // clear it only after exit so normal stop/cleanup can remove its data dir.
      instance.mongodProcess = undefined;
      await server.stop({ doCleanup: false });
    },
    stop: async () => {
      try {
        await client.close();
      } finally {
        await replSet.stop();
      }
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

      return <TSchema extends { _id?: unknown } = { _id?: unknown }>(
        name: string,
        collectionOptions?: CollectionOptions,
      ) => {
        const collection = target.collection<TSchema>(name, collectionOptions);

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

            return async (command: Record<string, unknown>, commandOptions?: RunCommandOptions) => {
              if (!failed && options.commandName in command) {
                failed = true;
                throw options.error;
              }

              return adminTarget.command(command, commandOptions);
            };
          },
        }) as Admin;
      };
    },
  }) as Db;
};
