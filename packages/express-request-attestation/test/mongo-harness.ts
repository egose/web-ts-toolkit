/**
 * MONGO-02 disposable MongoDB replica-set harness (task sections 1/4).
 *
 * Starts a disposable single-node replica set via `mongodb-memory-server`
 * (`MongoMemoryReplSet`, count 1), hands out isolated databases with
 * randomized names, and cleans up per test via `dropDatabase`.
 *
 * - No production connection string is ever used; every database comes from
 *   the disposable replica set owned by this harness.
 * - Harness startup failure (missing binary, no registry/network) blocks the
 *   `test:mongo` lane instead of skip-passing: `beforeAll` lets the error
 *   throw so the lane fails loudly.
 *
 * Prerequisites: `mongodb-memory-server` replica-set binary download
 * (registry/network) for the live lane. Production deployments require a
 * replica set (transactions); the single-node set here is test-only.
 */

import { randomUUID } from 'node:crypto';

import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export const MONGO_TIMEOUT = 120_000;

export interface MongoHarness {
  readonly uri: string;
  readonly client: MongoClient;
  createDb(prefix: string): Db;
  dropDb(db: Db): Promise<void>;
  stop(): Promise<void>;
}

const createDbName = (prefix: string): string => {
  const sanitized = prefix.replace(/[^a-z0-9]+/gi, '-').slice(0, 20);
  return `${sanitized}-${randomUUID().slice(0, 8)}`;
};

/**
 * Start one disposable single-node replica set and connect the primary
 * harness client. The caller owns `stop()`; every test must use an isolated
 * database via `createDb` and clean it with `dropDb`.
 */
export async function createMongoHarness(): Promise<MongoHarness> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
    },
  });
  const uri = replSet.getUri();
  const client = new MongoClient(uri);
  try {
    await client.connect();
  } catch (error) {
    await client.close().catch(() => undefined);
    await replSet.stop().catch(() => undefined);
    throw error;
  }

  return {
    uri,
    client,
    createDb: (prefix: string) => client.db(createDbName(prefix)),
    dropDb: async (db: Db) => {
      await db.dropDatabase();
    },
    stop: async () => {
      await client.close();
      await replSet.stop();
    },
  };
}
