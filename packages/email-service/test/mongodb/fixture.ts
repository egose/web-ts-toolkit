import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { createConnection, type ConnectOptions, type Connection, type mongo } from 'mongoose';
import { vi } from 'vitest';
import { createMongooseEmailStore } from '../../src/mongoose';
import type { StoreFixture } from '../conformance/store-fixtures';

export const JOBS = 'email_jobs';
export const ACTIVITIES = 'email_activities';
export const DURABLE = { w: 'majority', j: true, wtimeout: 3_000 } as const;
export const TEST_PARAMETERS = ['--setParameter', 'enableTestCommands=1'];

export function checkScratch(): void {
  const root = resolve(import.meta.dirname, '../../../..');
  const temp = realpathSync(tmpdir());
  if (!relative(root, temp).split(sep)[0]?.startsWith('_tmp')) {
    throw new Error('Set TMPDIR to an existing, gitignored repo-local _tmp* directory.');
  }
  execFileSync('git', ['check-ignore', '--', temp], { cwd: root, stdio: 'ignore' });
}

export async function replicaSet(count: 1 | 3, extraArgs: readonly string[] = []) {
  checkScratch();
  return MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION ?? '8.2.6' },
    replSet: { count, storageEngine: 'wiredTiger', args: [...TEST_PARAMETERS, ...extraArgs] },
  });
}

export async function standalone() {
  checkScratch();
  return MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION ?? '8.2.6' } });
}

export async function connect(uri: string, options?: ConnectOptions) {
  const connection = createConnection(uri, {
    serverSelectionTimeoutMS: 4_000,
    connectTimeoutMS: 4_000,
    heartbeatFrequencyMS: 500,
    monitorCommands: true,
    maxAdaptiveRetries: 0,
    ...options,
  });
  try {
    return await connection.asPromise();
  } catch (error) {
    await connection.destroy();
    throw error;
  }
}

export function uriFor(repl: MongoMemoryReplSet) {
  return repl.getUri(`email_${randomUUID().replaceAll('-', '')}`);
}

export async function fixture(repl: MongoMemoryReplSet, options?: ConnectOptions) {
  const uri = uriFor(repl);
  const first = await connect(uri, options);
  try {
    const second = await connect(uri, options);
    return {
      uri,
      first,
      second,
      primary: createMongooseEmailStore(first),
      peer: createMongooseEmailStore(second),
      now: () => serverNow(second),
      async close() {
        try {
          await second.dropDatabase();
        } finally {
          await Promise.all([first.destroy(), second.destroy()]);
        }
      },
    } satisfies StoreFixture & { first: Connection; second: Connection; uri: string };
  } catch (error) {
    await first.destroy();
    throw error;
  }
}

export function dbOf(connection: Connection): mongo.Db {
  if (!connection.db) throw new Error('Fixture connection has no database');
  return connection.db;
}

export async function serverNow(connection: Connection): Promise<number> {
  const { localTime } = await connection.getClient().db('admin').command({ hello: 1, maxTimeMS: 1_000 });
  if (!(localTime instanceof Date)) throw new Error('Expected localTime on fixture primary');
  return localTime.getTime();
}

export async function waitForTime(connection: Connection, target: number, timeoutMs = 7_000): Promise<void> {
  const end = performance.now() + timeoutMs;
  for (;;) {
    const now = await serverNow(connection);
    if (now >= target) return;
    if (performance.now() >= end) throw new Error('Fixture did not reach the expected server time');
    await sleep(Math.min(30, target - now));
  }
}

export function commandTrace(connection: Connection, databaseName = dbOf(connection).databaseName) {
  const commands: mongo.CommandStartedEvent[] = [];
  const listener = (event: mongo.CommandStartedEvent) => {
    if (event.databaseName === databaseName) commands.push(event);
  };
  const client = connection.getClient();
  client.on('commandStarted', listener);
  return { commands, close: () => client.off('commandStarted', listener) };
}

/** Test-only barrier at the public driver call, not a mock of server time or of the command's result. */
export function intercept(
  db: mongo.Db,
  matches: (command: mongo.Document) => boolean,
  run: (send: () => Promise<mongo.Document>, command: mongo.Document) => Promise<mongo.Document>,
) {
  const command = db.command.bind(db);
  return vi
    .spyOn(db, 'command')
    .mockImplementation((body, options) =>
      matches(body) ? run(() => command(body, options), body) : command(body, options),
    );
}

export async function withFailPoint<T>(
  admin: mongo.Db,
  name: string,
  run: (entered: () => Promise<void>) => Promise<T>,
  options?: { data?: object; mode?: 'alwaysOn' | { times: number } },
): Promise<T> {
  const { mode = 'alwaysOn', data } = options ?? {};
  const { count } = await admin.command({ configureFailPoint: name, mode, ...(data ? { data } : {}) });
  if (typeof count !== 'number') throw new Error('Expected failpoint counter');
  try {
    return await run(async () => {
      await admin.command({ waitForFailPoint: name, timesEntered: count + 1, maxTimeMS: 5_000 });
    });
  } finally {
    await admin.command({ configureFailPoint: name, mode: 'off' });
  }
}
