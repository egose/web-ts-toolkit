import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OidcVaultStoreConflictError } from '@web-ts-toolkit/express-oidc-vault';
import type { Collection, Db } from 'mongodb';
import { defineOidcVaultStoreProviderConformanceSuite } from '../../express-oidc-vault/test/store-provider-conformance';
import { createMongoOidcVaultStore } from '../src/index';
import {
  createReplicaSetHarness,
  createStandaloneHarness,
  createDbWithAdminCommandFailure,
  createDbWithCollectionWriteFailure,
  withFailCommand,
  MONGO_TIMEOUT,
  type MongoMemoryHarness,
} from './mongo-memory';

type MongoExplainPlan = {
  indexName?: string;
  inputStage?: MongoExplainPlan;
  inputStages?: MongoExplainPlan[];
};

type MongoExecutionStatsExplain = {
  queryPlanner: { winningPlan: MongoExplainPlan };
  executionStats: {
    totalDocsExamined: number;
    nReturned: number;
  };
};

const getWinningIndexName = (plan: MongoExplainPlan): string | undefined => {
  if (plan.indexName !== undefined) {
    return plan.indexName;
  }

  if (plan.inputStage !== undefined) {
    return getWinningIndexName(plan.inputStage);
  }

  for (const inputStage of plan.inputStages ?? []) {
    const indexName = getWinningIndexName(inputStage);

    if (indexName !== undefined) {
      return indexName;
    }
  }

  return undefined;
};

const createDbWithDeleteOneSpy = (
  db: Db,
  options: {
    collectionName: string;
    beforeDeleteOne?: (collection: Collection, filter: unknown) => Promise<void>;
  },
): { db: Db; getDeleteOneCalls: () => number } => {
  let deleteOneCalls = 0;

  return {
    db: new Proxy(db, {
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
              if (collectionProperty !== 'deleteOne') {
                return Reflect.get(collectionTarget, collectionProperty, collectionReceiver);
              }

              return async (filter: unknown, ...args: unknown[]) => {
                deleteOneCalls += 1;
                await options.beforeDeleteOne?.(collectionTarget as Collection, filter);

                const deleteOne = Reflect.get(collectionTarget, collectionProperty, collectionReceiver) as (
                  deleteFilter: unknown,
                  ...deleteArgs: unknown[]
                ) => Promise<unknown>;
                return deleteOne.apply(collectionTarget, [filter, ...args]);
              };
            },
          }) as Collection<TSchema>;
        };
      },
    }) as Db,
    getDeleteOneCalls: () => deleteOneCalls,
  };
};

const createDbWithStartSessionHook = (db: Db, onBeforeTransaction: () => Promise<void>): Db => {
  const bind = (value: unknown, target: object) =>
    typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;

  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'client') {
        return bind(Reflect.get(target, property, receiver), target);
      }

      const client = Reflect.get(target, property, receiver) as {
        startSession: (...args: unknown[]) => Record<string, unknown>;
      };
      return new Proxy(client, {
        get(clientTarget, clientProperty, clientReceiver) {
          if (clientProperty !== 'startSession') {
            return bind(Reflect.get(clientTarget, clientProperty, clientReceiver), clientTarget);
          }

          return (...args: unknown[]) => {
            const startSession = Reflect.get(clientTarget, clientProperty, clientReceiver) as (
              ...startArgs: unknown[]
            ) => Record<string, unknown>;
            const session = startSession.apply(clientTarget, args);
            const originalWithTransaction = session['withTransaction'] as (
              fn: (s: unknown) => Promise<unknown>,
              ...rest: unknown[]
            ) => Promise<unknown>;
            let hooked = false;
            session['withTransaction'] = async (fn: (s: unknown) => Promise<unknown>, ...rest: unknown[]) => {
              if (!hooked) {
                hooked = true;
                await onBeforeTransaction();
              }

              return originalWithTransaction.call(session, fn, ...rest);
            };
            return session;
          };
        },
      });
    },
  }) as Db;
};

const createDbWithSessionLifecycleSpy = (db: Db): { db: Db; counts: () => { started: number; ended: number } } => {
  let started = 0;
  let ended = 0;
  const realClient = (db as unknown as { client: { startSession: (...args: unknown[]) => Record<string, unknown> } })
    .client;
  const countingClient = new Proxy(realClient, {
    get(target, property, receiver) {
      if (property !== 'startSession') {
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      }

      return (...args: unknown[]) => {
        started += 1;
        const session = (target as { startSession: (...startArgs: unknown[]) => Record<string, unknown> }).startSession(
          ...args,
        );
        const originalEndSession = session['endSession'] as (...endArgs: unknown[]) => Promise<unknown>;
        session['endSession'] = async (...endArgs: unknown[]) => {
          ended += 1;
          return originalEndSession.apply(session, endArgs);
        };
        return session;
      };
    },
  });
  const wrappedDb = new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'client') {
        return countingClient;
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  }) as Db;

  return { db: wrappedDb, counts: () => ({ started, ended }) };
};

describe('createMongoOidcVaultStore', () => {
  let standalone: MongoMemoryHarness;
  let replicaSet: MongoMemoryHarness;

  beforeAll(async () => {
    [standalone, replicaSet] = await Promise.all([createStandaloneHarness(), createReplicaSetHarness()]);
  }, MONGO_TIMEOUT);

  afterAll(async () => {
    await Promise.all([standalone.stop(), replicaSet.stop()]);
  }, MONGO_TIMEOUT);

  defineOidcVaultStoreProviderConformanceSuite('mongodb', {
    createContext: () => {
      let now = 100;
      const db = replicaSet.createDb('conf');

      return {
        store: createMongoOidcVaultStore({ db, now: () => now }),
        setNow: (nextNow) => {
          now = nextNow;
        },
        cleanup: async () => {
          await db.dropDatabase();
        },
      };
    },
    sessionCreateMode: 'upsert',
    reusedSessionIdClearsStaleAlias: false,
  });

  it('exposes readiness for startup checks before accepting traffic', async () => {
    const db = replicaSet.createDb('mongo-store-ready-test');
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });

    await expect(store.ready()).resolves.toBeUndefined();
    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });
    await expect(store.getSession('sess_1')).resolves.toMatchObject({ sessionId: 'sess_1' });
  });

  it('rejects invalid or accidentally shared collection names synchronously', () => {
    const db = replicaSet.createDb('mongo-store-invalid-collections-test');

    expect(() =>
      createMongoOidcVaultStore({
        db,
        authorizationTransactionsCollectionName: '',
      }),
    ).toThrow('collection name must not be empty');

    expect(() =>
      createMongoOidcVaultStore({
        db,
        authorizationTransactionsCollectionName: 'shared_auth',
        exchangeCodesCollectionName: 'shared_auth',
      }),
    ).toThrow('shared collections are not supported');
  });

  it('rejects readiness and store operations with the same initialization error', async () => {
    const db = replicaSet.createDb('mongo-store-ready-index-failure-test');
    await db
      .collection('oidc_vault_sessions')
      .createIndex({ expiresAt: -1 }, { expireAfterSeconds: 0, name: 'expiresAt_ttl' });
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });

    let readyError: unknown;

    try {
      await store.ready();
    } catch (error) {
      readyError = error;
    }

    expect(readyError).toBeInstanceOf(Error);

    await expect(store.getSession('sess_1')).rejects.toBe(readyError);
  });

  it('uses scoped deletion indexes for repeated subject and provider-session IDs', async () => {
    const db = replicaSet.createDb('mongo-store-scoped-delete-plan-test');
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });
    await store.ready();

    const sessions = db.collection('oidc_vault_sessions');
    const issuers = Array.from({ length: 10 }, (_, index) => `issuer_${index}`);
    const clientIds = Array.from({ length: 10 }, (_, index) => `client_${index}`);
    const documents = [];

    for (let identity = 0; identity < 2; identity += 1) {
      for (const issuer of issuers) {
        for (const clientId of clientIds) {
          for (let duplicate = 0; duplicate < 10; duplicate += 1) {
            documents.push({
              _id: `sess_${identity}_${issuer}_${clientId}_${duplicate}`,
              logicalSessionId: `logical_${identity}_${issuer}_${clientId}_${duplicate}`,
              subject: `user_${identity}`,
              providerSessionId: `provider_sid_${identity}`,
              provider: { issuer, clientId },
              refreshToken: 'refresh',
              idToken: 'id',
              createdAt: 1000,
              updatedAt: 1000,
            });
          }
        }
      }
    }

    await sessions.insertMany(documents);

    const scopedPlans = [
      {
        filter: { subject: 'user_0', 'provider.issuer': 'issuer_0' },
        indexName: 'subject_scope_idx',
        docsExamined: 100,
        nReturned: 100,
      },
      {
        filter: { subject: 'user_0', 'provider.clientId': 'client_0' },
        indexName: 'subject_scope_idx',
        docsExamined: 100,
        nReturned: 100,
      },
      {
        filter: { subject: 'user_0', 'provider.issuer': 'issuer_0', 'provider.clientId': 'client_0' },
        indexName: 'subject_scope_idx',
        docsExamined: 10,
        nReturned: 10,
      },
      {
        filter: { providerSessionId: 'provider_sid_0', 'provider.issuer': 'issuer_0' },
        indexName: 'provider_session_scope_idx',
        docsExamined: 100,
        nReturned: 100,
      },
      {
        filter: { providerSessionId: 'provider_sid_0', 'provider.clientId': 'client_0' },
        indexName: 'provider_session_scope_idx',
        docsExamined: 100,
        nReturned: 100,
      },
      {
        filter: { providerSessionId: 'provider_sid_0', 'provider.issuer': 'issuer_0', 'provider.clientId': 'client_0' },
        indexName: 'provider_session_scope_idx',
        docsExamined: 10,
        nReturned: 10,
      },
    ];

    for (const expectedPlan of scopedPlans) {
      const explain = (await sessions
        .find(expectedPlan.filter)
        .explain('executionStats')) as MongoExecutionStatsExplain;

      expect(getWinningIndexName(explain.queryPlanner.winningPlan)).toBe(expectedPlan.indexName);
      expect(explain.executionStats.totalDocsExamined).toBe(expectedPlan.docsExamined);
      expect(explain.executionStats.nReturned).toBe(expectedPlan.nReturned);
    }

    await expect(sessions.indexExists(['subject_scope_idx', 'provider_session_scope_idx'])).resolves.toBe(true);
  });

  it('handles initialization rejection immediately until readiness is awaited', async () => {
    const db = replicaSet.createDb('mongo-store-ready-unhandled-test');
    const error = Object.assign(new Error('Injected hello failure'), { code: 10107 });
    let unhandled: unknown;
    const onUnhandled = (reason: unknown) => {
      unhandled = reason;
    };

    process.once('unhandledRejection', onUnhandled);
    const store = createMongoOidcVaultStore({
      db: createDbWithAdminCommandFailure(db, { commandName: 'hello', error }),
      now: () => 1000,
    });

    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    process.off('unhandledRejection', onUnhandled);

    expect(unhandled).toBeUndefined();
    await expect(store.ready()).rejects.toBe(error);
    await expect(
      store.createSession({
        sessionId: 'sess_1',
        subject: 'user_1',
        refreshToken: 'refresh_1',
        idToken: 'id_1',
      }),
    ).rejects.toBe(error);
  });

  it('creates, reads, rotates, and deletes sessions', async () => {
    const db = replicaSet.createDb('mongo-store-session-test');
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });

    const created = await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      providerSessionId: 'provider_sid_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      scope: 'openid email profile',
    });

    expect(created).toMatchObject({ sessionId: 'sess_1', createdAt: 1000, updatedAt: 1000 });
    expect(await store.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });

    const rotated = await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: {
        ...created,
        sessionId: 'sess_2',
        providerSessionId: 'provider_sid_1',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
        updatedAt: 1001,
      },
    });

    expect(rotated).toMatchObject({ sessionId: 'sess_2', refreshToken: 'refresh_2' });
    expect(await store.getSession('sess_1')).toBeNull();

    await store.deleteSession('sess_2');
    expect(await store.getSession('sess_2')).toBeNull();

    await store.createSession({
      sessionId: 'sess_3',
      subject: 'user_1',
      providerSessionId: 'provider_sid_1',
      refreshToken: 'refresh_3',
      idToken: 'id_3',
    });
    await store.createSession({
      sessionId: 'sess_4',
      subject: 'user_1',
      refreshToken: 'refresh_4',
      idToken: 'id_4',
    });

    expect(
      await store.deleteSessionsByProviderSessionId({
        providerSessionId: 'provider_sid_1',
        issuer: 'https://issuer-a.example.com',
      }),
    ).toBe(0);
    expect(await store.deleteSessionsByProviderSessionId('provider_sid_1')).toBe(1);
    expect(await store.getSession('sess_3')).toBeNull();
    expect(await store.getSession('sess_4')).not.toBeNull();
    expect(
      await store.deleteSessionsBySubject({
        subject: 'user_1',
        clientId: 'client-1',
      }),
    ).toBe(0);
    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
    expect(await store.getSession('sess_4')).toBeNull();
  });

  it('rejects rotating a session that was already rotated', async () => {
    const db = replicaSet.createDb('mongo-store-rotate-conflict-test');
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: {
        sessionId: 'sess_2',
        subject: 'user_1',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
        createdAt: 1000,
        updatedAt: 1001,
      },
    });

    await expect(
      store.rotateSession({
        sessionId: 'sess_1',
        nextSession: {
          sessionId: 'sess_3',
          subject: 'user_1',
          refreshToken: 'refresh_3',
          idToken: 'id_3',
          createdAt: 1000,
          updatedAt: 1002,
        },
      }),
    ).rejects.toBeInstanceOf(OidcVaultStoreConflictError);
  });

  it('allows only one concurrent rotation and deletes the current rotated session by logical session ID', async () => {
    const db = replicaSet.createDb('mongo-store-logical-session-delete-test');
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });

    const created = await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    const attempts = await Promise.allSettled([
      store.rotateSession({
        sessionId: 'sess_1',
        nextSession: {
          ...created,
          sessionId: 'sess_2',
          refreshToken: 'refresh_2',
          updatedAt: 1001,
        },
      }),
      store.rotateSession({
        sessionId: 'sess_1',
        nextSession: {
          ...created,
          sessionId: 'sess_3',
          refreshToken: 'refresh_3',
          updatedAt: 1002,
        },
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === 'rejected')).toMatchObject({
      reason: expect.any(OidcVaultStoreConflictError),
    });

    const rotated = attempts.find(
      (attempt): attempt is PromiseFulfilledResult<typeof created> => attempt.status === 'fulfilled',
    )?.value;

    expect(rotated).toBeDefined();
    expect(await store.deleteSessionsByLogicalSessionId(created.logicalSessionId ?? created.sessionId)).toBe(1);
    expect(await store.getSession(rotated!.sessionId)).toBeNull();
  });

  it('bounds rotated-session aliases for sessions without explicit expiry', async () => {
    let now = 1000;
    const db = replicaSet.createDb('mongo-store-alias-retention-test');
    const store = createMongoOidcVaultStore({ db, now: () => now, rotatedSessionAliasRetentionMs: 100 });
    const aliases = db.collection('oidc_vault_rotated_session_aliases');

    const created = await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });
    const rotated = await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: { ...created, sessionId: 'sess_2', refreshToken: 'refresh_2', updatedAt: 1001 },
    });
    const rotatedAgain = await store.rotateSession({
      sessionId: 'sess_2',
      nextSession: { ...rotated, sessionId: 'sess_3', refreshToken: 'refresh_3', updatedAt: 1002 },
    });

    expect(await aliases.countDocuments({ logicalSessionId: created.logicalSessionId })).toBe(2);
    await expect(aliases.distinct('expiresAt', { logicalSessionId: created.logicalSessionId })).resolves.toEqual([
      new Date(1100),
    ]);

    now = 1100;

    await store.rotateSession({
      sessionId: 'sess_3',
      nextSession: { ...rotatedAgain, sessionId: 'sess_4', refreshToken: 'refresh_4', updatedAt: 1100 },
    });

    expect(await aliases.find({}, { projection: { _id: 1, expiresAt: 1 } }).toArray()).toEqual([
      { _id: 'sess_3', expiresAt: new Date(1200) },
    ]);
    expect(await store.getSession('sess_4')).toMatchObject({ sessionId: 'sess_4' });

    await expect(aliases.indexExists(['expiresAt_ttl', 'logical_session_idx'])).resolves.toBe(true);
  });

  it('removes rotated-session aliases for every session deletion API', async () => {
    const db = replicaSet.createDb('mongo-store-alias-delete-test');
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });
    const aliases = db.collection('oidc_vault_rotated_session_aliases');

    const createRotated = async (prefix: string, extra: { subject?: string; providerSessionId?: string } = {}) => {
      const created = await store.createSession({
        sessionId: `${prefix}_1`,
        subject: extra.subject ?? `${prefix}_user`,
        providerSessionId: extra.providerSessionId,
        refreshToken: `${prefix}_refresh_1`,
        idToken: `${prefix}_id_1`,
      });

      await store.rotateSession({
        sessionId: `${prefix}_1`,
        nextSession: {
          ...created,
          sessionId: `${prefix}_2`,
          refreshToken: `${prefix}_refresh_2`,
          updatedAt: 1001,
        },
      });

      return created.logicalSessionId ?? created.sessionId;
    };

    const currentLogicalSessionId = await createRotated('current');
    await store.deleteSession('current_2');
    expect(await store.getSession('current_2')).toBeNull();
    expect(await aliases.countDocuments({ logicalSessionId: currentLogicalSessionId })).toBe(0);

    const staleLogicalSessionId = await createRotated('stale');
    await store.deleteSession('stale_1');
    expect(await store.getSession('stale_2')).toBeNull();
    expect(await aliases.countDocuments({ logicalSessionId: staleLogicalSessionId })).toBe(0);

    const logicalSessionId = await createRotated('logical');
    expect(await store.deleteSessionsByLogicalSessionId(logicalSessionId)).toBe(1);
    expect(await aliases.countDocuments({ logicalSessionId })).toBe(0);

    const subjectLogicalSessionId = await createRotated('subject', { subject: 'subject_user' });
    expect(await store.deleteSessionsBySubject('subject_user')).toBe(1);
    expect(await aliases.countDocuments({ logicalSessionId: subjectLogicalSessionId })).toBe(0);

    const providerLogicalSessionId = await createRotated('provider', { providerSessionId: 'provider_sid' });
    expect(await store.deleteSessionsByProviderSessionId('provider_sid')).toBe(1);
    expect(await aliases.countDocuments({ logicalSessionId: providerLogicalSessionId })).toBe(0);
  });

  it('deletes the replacement session when deletion races with committed rotation', async () => {
    const db = replicaSet.createDb('mongo-store-delete-rotation-race-test');
    const rotatingStore = createMongoOidcVaultStore({ db, now: () => 1000 });
    const created = await rotatingStore.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });
    let rotated = false;
    const { db: wrappedDb } = createDbWithDeleteOneSpy(db, {
      collectionName: 'oidc_vault_sessions',
      beforeDeleteOne: async (_collection, filter) => {
        if (!rotated && typeof filter === 'object' && filter !== null && '_id' in filter && filter._id === 'sess_1') {
          rotated = true;
          await rotatingStore.rotateSession({
            sessionId: 'sess_1',
            nextSession: { ...created, sessionId: 'sess_2', refreshToken: 'refresh_2', updatedAt: 1001 },
          });
        }
      },
    });
    const deletingStore = createMongoOidcVaultStore({ db: wrappedDb, now: () => 1000 });

    await deletingStore.deleteSession('sess_1');

    expect(rotated).toBe(true);
    expect(await rotatingStore.getSession('sess_1')).toBeNull();
    expect(await rotatingStore.getSession('sess_2')).toBeNull();
    expect(
      await db.collection('oidc_vault_rotated_session_aliases').countDocuments({ logicalSessionId: 'sess_1' }),
    ).toBe(0);
  });

  it('consumes transaction records once and filters expired records without waiting for TTL cleanup', async () => {
    let now = 100;
    const db = replicaSet.createDb('mongo-store-transaction-test');
    const store = createMongoOidcVaultStore({ db, now: () => now });

    await store.createAuthorizationTransaction({
      state: 'state_1',
      nonce: 'nonce_1',
      pkceVerifier: 'verifier_1',
      codeChallenge: 'challenge_1',
      createdAt: 100,
      expiresAt: 200,
    });
    await store.createExchangeCode({
      code: 'code_1',
      sessionId: 'sess_1',
      createdAt: 100,
      expiresAt: 200,
    });

    expect(await store.consumeAuthorizationTransaction('state_1')).toMatchObject({ state: 'state_1' });
    expect(await store.consumeAuthorizationTransaction('state_1')).toBeNull();

    now = 250;

    expect(await store.consumeExchangeCode('code_1')).toBeNull();
  });

  it('enforces explicit session expiry before TTL cleanup runs', async () => {
    let now = 100;
    const db = replicaSet.createDb('mongo-store-session-expiry-test');
    const store = createMongoOidcVaultStore({ db, now: () => now });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      expiresAt: 200,
    });

    expect(await store.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });

    now = 250;

    expect(await store.getSession('sess_1')).toBeNull();
  });

  it('does not delete a fresh session replacement while cleaning up an expired read', async () => {
    const db = replicaSet.createDb('mongo-store-session-expiry-race-test');
    const { db: wrappedDb } = createDbWithDeleteOneSpy(db, {
      collectionName: 'oidc_vault_sessions',
      beforeDeleteOne: async (collection, filter) => {
        if (typeof filter !== 'object' || filter === null || !('_id' in filter) || filter._id !== 'sess_1') {
          return;
        }

        await collection.replaceOne(
          { _id: 'sess_1' },
          {
            _id: 'sess_1',
            logicalSessionId: 'sess_1',
            subject: 'user_1',
            refreshToken: 'fresh_refresh',
            idToken: 'fresh_id',
            expiresAt: new Date(500),
            createdAt: 250,
            updatedAt: 250,
          },
          { upsert: true },
        );
      },
    });
    const store = createMongoOidcVaultStore({ db: wrappedDb, now: () => 250 });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'old_refresh',
      idToken: 'old_id',
      expiresAt: 200,
    });

    expect(await store.getSession('sess_1')).toBeNull();
    expect(await db.collection('oidc_vault_sessions').findOne({ _id: 'sess_1' })).toMatchObject({
      refreshToken: 'fresh_refresh',
      expiresAt: new Date(500),
    });
  });

  it('aborts rotation when the source is replaced between the source read and transaction start', async () => {
    const db = replicaSet.createDb('mongo-store-rotation-source-replaced-test');
    const baseStore = createMongoOidcVaultStore({ db, now: () => 1000 });
    const created = await baseStore.createSession({
      sessionId: 'sess_1',
      subject: 'user_A',
      refreshToken: 'refresh_A',
      idToken: 'id_A',
      scope: 'openid',
    });

    let replaced = false;
    const wrappedDb = createDbWithStartSessionHook(db, async () => {
      if (!replaced) {
        replaced = true;
        await baseStore.createSession({
          sessionId: 'sess_1',
          logicalSessionId: 'lineage_NEW',
          subject: 'user_B',
          refreshToken: 'refresh_B',
          idToken: 'id_B',
          scope: 'openid email',
        });
      }
    });
    const rotatingStore = createMongoOidcVaultStore({ db: wrappedDb, now: () => 1000 });

    await expect(
      rotatingStore.rotateSession({
        sessionId: 'sess_1',
        nextSession: { ...created, sessionId: 'sess_2', refreshToken: 'refresh_A2', updatedAt: 1001 },
      }),
    ).rejects.toThrow('OIDC vault session changed before rotation could commit.');

    expect(replaced).toBe(true);
    expect(await baseStore.getSession('sess_1')).toMatchObject({
      subject: 'user_B',
      logicalSessionId: 'lineage_NEW',
      refreshToken: 'refresh_B',
    });
    expect(await baseStore.getSession('sess_2')).toBeNull();
    expect(await db.collection('oidc_vault_rotated_session_aliases').countDocuments({ _id: 'sess_1' })).toBe(0);

    await baseStore.deleteSession('sess_1');
    expect(await baseStore.getSession('sess_1')).toBeNull();
    expect(await baseStore.getSession('sess_2')).toBeNull();
  });

  it('aborts rotation when the source expires before the transaction commits', async () => {
    let now = 100;
    const db = replicaSet.createDb('mongo-store-rotation-source-expiry-test');
    const baseStore = createMongoOidcVaultStore({ db, now: () => now });
    const created = await baseStore.createSession({
      sessionId: 'sess_e',
      subject: 'user_A',
      refreshToken: 'refresh_A',
      idToken: 'id_A',
      expiresAt: 200,
    });

    const wrappedDb = createDbWithStartSessionHook(db, async () => {
      now = 250;
    });
    const rotatingStore = createMongoOidcVaultStore({ db: wrappedDb, now: () => now });

    await expect(
      rotatingStore.rotateSession({
        sessionId: 'sess_e',
        nextSession: { ...created, sessionId: 'sess_e2', refreshToken: 'refresh_A2', updatedAt: 150 },
      }),
    ).rejects.toThrow('OIDC vault session no longer exists for rotation.');

    expect(await baseStore.getSession('sess_e2')).toBeNull();
    expect(await db.collection('oidc_vault_sessions').findOne({ _id: 'sess_e' })).toMatchObject({
      refreshToken: 'refresh_A',
      expiresAt: new Date(200),
    });
  });

  it(
    'aborts a retried rotation when the source changes between transaction attempts',
    async () => {
      const db = replicaSet.createDb('mongo-store-rotation-retry-source-test');
      const baseStore = createMongoOidcVaultStore({ db, now: () => 1000 });
      const created = await baseStore.createSession({
        sessionId: 'sess_r',
        subject: 'user_A',
        refreshToken: 'refresh_A',
        idToken: 'id_A',
      });

      let replaced = false;
      const wrappedDb = new Proxy(db, {
        get(target, property, receiver) {
          if (property !== 'collection') {
            const value = Reflect.get(target, property, receiver);
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
          }

          return (name: string) => {
            const collection = (target as Db).collection(name);

            if (name !== 'oidc_vault_sessions') {
              return collection;
            }

            return new Proxy(collection, {
              get(collectionTarget, collectionProperty, collectionReceiver) {
                if (collectionProperty !== 'insertOne') {
                  return Reflect.get(collectionTarget, collectionProperty, collectionReceiver);
                }

                return async (...args: unknown[]) => {
                  if (!replaced) {
                    replaced = true;
                    await db.collection('oidc_vault_sessions').replaceOne(
                      { _id: 'sess_r' },
                      {
                        _id: 'sess_r',
                        logicalSessionId: 'lineage_NEW',
                        subject: 'user_B',
                        refreshToken: 'refresh_B',
                        idToken: 'id_B',
                        createdAt: 1000,
                        updatedAt: 1000,
                      },
                      { upsert: true },
                    );
                  }

                  const insertOne = Reflect.get(collectionTarget, collectionProperty, collectionReceiver) as (
                    ...insertArgs: unknown[]
                  ) => Promise<unknown>;
                  return insertOne.apply(collectionTarget, args);
                };
              },
            });
          };
        },
      }) as Db;
      const rotatingStore = createMongoOidcVaultStore({ db: wrappedDb, now: () => 1000 });

      await expect(
        withFailCommand(db, { failCommands: ['insert'], times: 1, errorCode: 112 }, () =>
          rotatingStore.rotateSession({
            sessionId: 'sess_r',
            nextSession: { ...created, sessionId: 'sess_r2', refreshToken: 'refresh_A2', updatedAt: 1001 },
          }),
        ),
      ).rejects.toThrow('OIDC vault session changed before rotation could commit.');

      expect(replaced).toBe(true);
      expect(await baseStore.getSession('sess_r')).toMatchObject({
        subject: 'user_B',
        logicalSessionId: 'lineage_NEW',
        refreshToken: 'refresh_B',
      });
      expect(await baseStore.getSession('sess_r2')).toBeNull();
      expect(await db.collection('oidc_vault_rotated_session_aliases').countDocuments({ _id: 'sess_r' })).toBe(0);
    },
    MONGO_TIMEOUT,
  );

  it('does not issue a second delete after consuming expired authorization transactions or exchange codes', async () => {
    const authorizationDb = replicaSet.createDb('mongo-store-auth-consume-expiry-test');
    const authorizationSpy = createDbWithDeleteOneSpy(authorizationDb, {
      collectionName: 'oidc_vault_authorization_transactions',
    });
    const authorizationStore = createMongoOidcVaultStore({ db: authorizationSpy.db, now: () => 250 });

    await authorizationStore.createAuthorizationTransaction({
      state: 'state_1',
      nonce: 'nonce_1',
      pkceVerifier: 'verifier_1',
      codeChallenge: 'challenge_1',
      createdAt: 100,
      expiresAt: 200,
    });

    expect(await authorizationStore.consumeAuthorizationTransaction('state_1')).toBeNull();
    expect(authorizationSpy.getDeleteOneCalls()).toBe(0);

    const exchangeDb = replicaSet.createDb('mongo-store-exchange-consume-expiry-test');
    const exchangeSpy = createDbWithDeleteOneSpy(exchangeDb, { collectionName: 'oidc_vault_exchange_codes' });
    const exchangeStore = createMongoOidcVaultStore({ db: exchangeSpy.db, now: () => 250 });

    await exchangeStore.createExchangeCode({
      code: 'code_1',
      sessionId: 'sess_1',
      createdAt: 100,
      expiresAt: 200,
    });

    expect(await exchangeStore.consumeExchangeCode('code_1')).toBeNull();
    expect(exchangeSpy.getDeleteOneCalls()).toBe(0);
  });

  it('does not issue a second delete after consuming an expired rotated-session alias', async () => {
    const db = replicaSet.createDb('mongo-store-alias-consume-expiry-test');
    const spy = createDbWithDeleteOneSpy(db, { collectionName: 'oidc_vault_rotated_session_aliases' });
    const store = createMongoOidcVaultStore({ db: spy.db, now: () => 250 });

    await store.createSession({
      sessionId: 'sess_2',
      logicalSessionId: 'logical_1',
      subject: 'user_1',
      refreshToken: 'refresh_2',
      idToken: 'id_2',
    });
    await db.collection('oidc_vault_rotated_session_aliases').insertOne({
      _id: 'sess_1',
      logicalSessionId: 'logical_1',
      expiresAt: new Date(200),
    });

    await store.deleteSession('sess_1');

    expect(spy.getDeleteOneCalls()).toBe(0);
    expect(await store.getSession('sess_2')).toMatchObject({ sessionId: 'sess_2' });
  });

  it('consumes backchannel logout token jti values once', async () => {
    const db = replicaSet.createDb('mongo-store-backchannel-jti-test');
    const store = createMongoOidcVaultStore({ db, now: () => 100 });

    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 200 })).toBe(true);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 200 })).toBe(false);
  });

  it('replaces expired backchannel logout token jti values without waiting for TTL cleanup', async () => {
    let now = 100;
    const db = replicaSet.createDb('mongo-store-backchannel-jti-expiry-test');
    const spy = createDbWithDeleteOneSpy(db, { collectionName: 'oidc_vault_backchannel_logout_token_jtis' });
    const store = createMongoOidcVaultStore({ db: spy.db, now: () => now });

    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 200 })).toBe(true);

    now = 199;
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 300 })).toBe(false);

    now = 200;
    const results = await Promise.all([
      store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 300 }),
      store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 300 }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 300 })).toBe(false);
    expect(spy.getDeleteOneCalls()).toBe(0);
    expect(await db.collection('oidc_vault_backchannel_logout_token_jtis').findOne({ _id: 'logout_1' })).toMatchObject({
      expiresAt: new Date(300),
    });
  });

  it('rejects standalone readiness instead of allowing non-transaction writes', async () => {
    const db = standalone.createDb('mongo-store-standalone-rotation-test');
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });

    await expect(store.ready()).rejects.toThrow('transaction-capable MongoDB deployment');
    await expect(
      store.createSession({
        sessionId: 'sess_1',
        subject: 'user_1',
        refreshToken: 'refresh_1',
        idToken: 'id_1',
      }),
    ).rejects.toThrow('transaction-capable MongoDB deployment');
  });

  it(
    'surfaces hello failures during readiness without caching them as unsupported topology',
    async () => {
      const db = replicaSet.createDb('mongo-store-hello-failure-test');
      const error = Object.assign(new Error('Injected hello failure'), { code: 10107 });
      const store = createMongoOidcVaultStore({
        db: createDbWithAdminCommandFailure(db, { commandName: 'hello', error }),
        now: () => 1000,
      });

      await expect(store.ready()).rejects.toMatchObject({ code: 10107 });
      await expect(
        store.createSession({
          sessionId: 'sess_1',
          subject: 'user_1',
          refreshToken: 'refresh_1',
          idToken: 'id_1',
        }),
      ).rejects.toBe(error);
    },
    MONGO_TIMEOUT,
  );

  it(
    'rolls back transaction writes when a rotation write boundary fails before commit',
    async () => {
      const db = replicaSet.createDb('mongo-store-failpoint-test');
      const store = createMongoOidcVaultStore({
        db: createDbWithCollectionWriteFailure(db, {
          collectionName: 'oidc_vault_rotated_session_aliases',
          methodName: 'updateOne',
        }),
        now: () => 1000,
      });

      const created = await store.createSession({
        sessionId: 'sess_1',
        subject: 'user_1',
        refreshToken: 'refresh_1',
        idToken: 'id_1',
      });

      await expect(
        store.rotateSession({
          sessionId: 'sess_1',
          nextSession: {
            ...created,
            sessionId: 'sess_2',
            refreshToken: 'refresh_2',
            updatedAt: 1001,
          },
        }),
      ).rejects.toThrow();

      expect(await store.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });
      expect(await store.getSession('sess_2')).toBeNull();
      await store.deleteSession('sess_1');
      expect(await store.getSession('sess_1')).toBeNull();
    },
    MONGO_TIMEOUT,
  );

  it('closes every allocated ClientSession exactly once across rotation outcomes', async () => {
    const db = replicaSet.createDb('mongo-store-session-lifecycle-test');
    const spy = createDbWithSessionLifecycleSpy(db);
    const store = createMongoOidcVaultStore({ db: spy.db, now: () => 1000 });

    const created = await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    const rotated = await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: { ...created, sessionId: 'sess_2', refreshToken: 'refresh_2', updatedAt: 1001 },
    });
    expect(rotated).toMatchObject({ sessionId: 'sess_2' });
    expect(spy.counts()).toEqual({ started: 1, ended: 1 });

    await expect(
      store.rotateSession({
        sessionId: 'missing',
        nextSession: { ...created, sessionId: 'missing_next', refreshToken: 'refresh_x', updatedAt: 1002 },
      }),
    ).rejects.toBeInstanceOf(OidcVaultStoreConflictError);
    expect(spy.counts()).toEqual({ started: 1, ended: 1 });
    expect(await store.getSession('missing_next')).toBeNull();

    await store.createSession({
      sessionId: 'sess_exp',
      subject: 'user_1',
      refreshToken: 'refresh_exp',
      idToken: 'id_exp',
      expiresAt: 500,
    });
    await expect(
      store.rotateSession({
        sessionId: 'sess_exp',
        nextSession: { ...created, sessionId: 'sess_exp_next', refreshToken: 'refresh_y', updatedAt: 1003 },
      }),
    ).rejects.toBeInstanceOf(OidcVaultStoreConflictError);
    expect(spy.counts()).toEqual({ started: 1, ended: 1 });
    expect(await store.getSession('sess_exp_next')).toBeNull();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        store.rotateSession({
          sessionId: 'missing',
          nextSession: {
            ...created,
            sessionId: `missing_retry_${attempt}`,
            refreshToken: 'refresh_z',
            updatedAt: 1004,
          },
        }),
      ).rejects.toBeInstanceOf(OidcVaultStoreConflictError);
    }
    expect(spy.counts()).toEqual({ started: 1, ended: 1 });
    expect(await store.getSession('sess_2')).toMatchObject({ sessionId: 'sess_2' });
  });

  it('closes the allocated session when source reads and transaction writes fail without committing replacement', async () => {
    const readDb = replicaSet.createDb('mongo-store-session-lifecycle-read-failure-test');
    const readSpy = createDbWithSessionLifecycleSpy(readDb);
    let findOneFailed = false;
    const readFailingDb = new Proxy(readSpy.db, {
      get(target, property, receiver) {
        if (property !== 'collection') {
          const value = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        }

        return (name: string) => {
          const collection = (target as Db).collection(name);

          if (name !== 'oidc_vault_sessions') {
            return collection;
          }

          return new Proxy(collection, {
            get(collectionTarget, collectionProperty, collectionReceiver) {
              if (collectionProperty !== 'findOne') {
                return Reflect.get(collectionTarget, collectionProperty, collectionReceiver);
              }

              return async (...args: unknown[]) => {
                if (!findOneFailed) {
                  findOneFailed = true;
                  throw new Error('Injected sessions.findOne failure');
                }

                const method = Reflect.get(collectionTarget, collectionProperty, collectionReceiver) as (
                  ...methodArgs: unknown[]
                ) => Promise<unknown>;
                return method.apply(collectionTarget, args);
              };
            },
          });
        };
      },
    }) as Db;
    const readStore = createMongoOidcVaultStore({ db: readFailingDb, now: () => 1000 });
    const readCreated = await readStore.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    await expect(
      readStore.rotateSession({
        sessionId: 'sess_1',
        nextSession: { ...readCreated, sessionId: 'sess_2', refreshToken: 'refresh_2', updatedAt: 1001 },
      }),
    ).rejects.toThrow('Injected sessions.findOne failure');
    expect(findOneFailed).toBe(true);
    expect(readSpy.counts()).toEqual({ started: 0, ended: 0 });
    expect(await readStore.getSession('sess_2')).toBeNull();
    expect(await readStore.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });

    const writeDb = replicaSet.createDb('mongo-store-session-lifecycle-write-failure-test');
    const writeSpy = createDbWithSessionLifecycleSpy(writeDb);
    const writeStore = createMongoOidcVaultStore({
      db: createDbWithCollectionWriteFailure(writeSpy.db, {
        collectionName: 'oidc_vault_sessions',
        methodName: 'insertOne',
      }),
      now: () => 1000,
    });
    const writeCreated = await writeStore.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    await expect(
      writeStore.rotateSession({
        sessionId: 'sess_1',
        nextSession: { ...writeCreated, sessionId: 'sess_2', refreshToken: 'refresh_2', updatedAt: 1001 },
      }),
    ).rejects.toThrow();
    expect(writeSpy.counts()).toEqual({ started: 1, ended: 1 });
    expect(await writeStore.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });
    expect(await writeStore.getSession('sess_2')).toBeNull();
    expect(
      await writeDb.collection('oidc_vault_rotated_session_aliases').countDocuments({ logicalSessionId: 'sess_1' }),
    ).toBe(0);
  });
});

describe('createMongoOidcVaultStore replica set', () => {
  let replicaSet: MongoMemoryHarness;

  beforeAll(async () => {
    replicaSet = await createReplicaSetHarness({ monitorCommands: true });
  }, MONGO_TIMEOUT);

  afterAll(async () => {
    await replicaSet.stop();
  }, MONGO_TIMEOUT);

  it('rotates sessions through the transaction path', async () => {
    const db = replicaSet.createDb('mongo-store-replica-rotation-test');
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });

    const created = await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    const rotated = await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: {
        ...created,
        sessionId: 'sess_2',
        refreshToken: 'refresh_2',
        updatedAt: 1001,
      },
    });

    expect(rotated).toMatchObject({ sessionId: 'sess_2', refreshToken: 'refresh_2' });
    expect(await store.getSession('sess_1')).toBeNull();
    expect(await store.getSession('sess_2')).toMatchObject({ sessionId: 'sess_2' });
    expect(replicaSet.commandStartedEvents.some((event) => event.commandName === 'commitTransaction')).toBe(true);

    await expect(
      store.rotateSession({
        sessionId: 'sess_1',
        nextSession: {
          ...created,
          sessionId: 'sess_3',
          refreshToken: 'refresh_3',
          updatedAt: 1002,
        },
      }),
    ).rejects.toThrow('rotation');
  });
});
