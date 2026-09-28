import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClientSession, Db } from 'mongodb';

import { createMongoOidcVaultStore } from '../src/index';
import { createReplicaSetHarness, MONGO_TIMEOUT, type MongoMemoryHarness } from './mongo-memory';

// Pause after a real snapshot read, before the real alias delete. The writer
// uses its own store/ClientSession and commits while cleanup is paused.
const afterLivenessRead = (db: Db, hook: () => Promise<void>, failDelete = false): Db =>
  new Proxy(db, {
    get(target, property) {
      if (property !== 'collection') {
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (name: string) => {
        const collection = target.collection(name);
        return new Proxy(collection, {
          get(current, method) {
            if (name === 'oidc_vault_sessions' && method === 'find') {
              return (...args: Parameters<typeof collection.find>) => {
                const cursor = collection.find(...args);
                if (args[1]?.session) {
                  const toArray = cursor.toArray.bind(cursor);
                  cursor.toArray = async () => {
                    const records = await toArray();
                    await hook();
                    return records;
                  };
                }
                return cursor;
              };
            }
            if (failDelete && name === 'oidc_vault_rotated_session_aliases' && method === 'deleteMany') {
              return async () => {
                throw new Error('injected alias cleanup failure');
              };
            }
            const value = Reflect.get(current, method);
            return typeof value === 'function' ? value.bind(current) : value;
          },
        });
      };
    },
  });

describe('MongoDB alias cleanup snapshot boundary', () => {
  let harness: MongoMemoryHarness;
  beforeAll(async () => {
    harness = await createReplicaSetHarness({ monitorCommands: true });
  }, MONGO_TIMEOUT);
  afterAll(async () => {
    await harness?.stop();
  }, MONGO_TIMEOUT);

  for (const method of ['direct', 'subject', 'provider-session', 'logical'] as const) {
    for (const arrival of ['new-alias', 'updated-alias', 'identical-alias'] as const) {
      it(`${method}: preserves a concurrent rotation's ${arrival} after an empty liveness snapshot`, async () => {
        const db = harness.createDb('alias-race');
        const writer = createMongoOidcVaultStore({ db });
        const source = await writer.createSession({
          sessionId: 'old',
          logicalSessionId: 'lineage',
          subject: 'matched',
          providerSessionId: 'sid',
          refreshToken: 'r',
          idToken: 'i',
          expiresAt: Date.now() + 600_000,
        });
        await writer.rotateSession({ sessionId: 'old', nextSession: { ...source, sessionId: 'matched' } });
        if (arrival === 'identical-alias') {
          // Existing installations have aliases without the internal revision.
          await db
            .collection('oidc_vault_rotated_session_aliases')
            .updateOne({ _id: 'old' }, { $unset: { revision: '' } });
        }
        let arrivals = 0;
        let reads = 0;
        const deleting = createMongoOidcVaultStore({
          db: afterLivenessRead(db, async () => {
            reads += 1;
            if (arrivals++ > 0) return;
            const arriving = await writer.createSession({
              ...source,
              sessionId: arrival === 'new-alias' ? 'arrival' : 'old',
              subject: 'survivor',
              providerSessionId: 'other',
              expiresAt: source.expiresAt! + (arrival === 'identical-alias' ? 0 : 60_000),
            });
            await writer.rotateSession({
              sessionId: arriving.sessionId,
              nextSession: { ...arriving, sessionId: 'survivor' },
            });
          }),
        });
        try {
          if (method === 'direct') await deleting.deleteSession('matched');
          else if (method === 'subject') expect(await deleting.deleteSessionsBySubject('matched')).toBe(1);
          else if (method === 'provider-session')
            expect(await deleting.deleteSessionsByProviderSessionId('sid')).toBe(1);
          else expect(await deleting.deleteSessionsByLogicalSessionId('lineage')).toBe(1);
          expect(await writer.getSession('survivor')).not.toBeNull();
          const aliasId = arrival === 'new-alias' ? 'arrival' : 'old';
          expect(await db.collection('oidc_vault_rotated_session_aliases').findOne({ _id: aliasId })).not.toBeNull();
          expect(reads).toBeGreaterThanOrEqual(arrival === 'new-alias' ? 1 : 2);
          if (arrival === 'new-alias') {
            expect(await db.collection('oidc_vault_rotated_session_aliases').findOne({ _id: 'old' })).toBeNull();
          }
          await writer.deleteSession(aliasId);
          expect(await writer.getSession('survivor')).toBeNull();
          expect(await db.collection('oidc_vault_rotated_session_aliases').countDocuments()).toBe(0);
        } finally {
          await db.dropDatabase();
        }
      });
    }
  }

  it('the last concurrent scoped deletion cleans aliases instead of snapshot write skew', async () => {
    const db = harness.createDb('alias-last-delete');
    const writer = createMongoOidcVaultStore({ db });
    const first = await writer.createSession({
      sessionId: 'old',
      logicalSessionId: 'lineage',
      subject: 'a',
      refreshToken: 'r',
      idToken: 'i',
    });
    await writer.rotateSession({ sessionId: 'old', nextSession: { ...first, sessionId: 'a' } });
    await writer.createSession({ ...first, sessionId: 'b', subject: 'b' });
    let interleaved = false;
    const deleting = createMongoOidcVaultStore({
      db: afterLivenessRead(db, async () => {
        if (interleaved) return;
        interleaved = true;
        // The first cleanup saw b alive. Its own deletion of a must already be
        // committed so b's independent cleanup observes the empty lineage.
        expect(await writer.getSession('a')).toBeNull();
        expect(await writer.deleteSessionsBySubject('b')).toBe(1);
      }),
    });
    try {
      expect(await deleting.deleteSessionsBySubject('a')).toBe(1);
      expect(interleaved).toBe(true);
      expect(await db.collection('oidc_vault_rotated_session_aliases').countDocuments()).toBe(0);
    } finally {
      await db.dropDatabase();
    }
  });

  it('ignores expired peers and closes cleanup sessions on success, no-op and failure', async () => {
    const db = harness.createDb('alias-resources');
    const allocated: ClientSession[] = [];
    const start = harness.client.startSession.bind(harness.client);
    const spy = vi.spyOn(harness.client, 'startSession').mockImplementation((...args) => {
      const session = start(...args);
      if (session.explicit) {
        vi.spyOn(session, 'endSession');
        allocated.push(session);
      }
      return session;
    });
    try {
      const store = createMongoOidcVaultStore({ db, now: () => 100 });
      const source = await store.createSession({
        sessionId: 'old',
        logicalSessionId: 'lineage',
        subject: 'a',
        refreshToken: 'r',
        idToken: 'i',
      });
      await store.rotateSession({ sessionId: 'old', nextSession: { ...source, sessionId: 'a' } });
      await store.createSession({ ...source, sessionId: 'expired', expiresAt: 100 });
      await store.deleteSession('a');
      expect(await db.collection('oidc_vault_rotated_session_aliases').countDocuments()).toBe(0);
      expect(await store.deleteSessionsByLogicalSessionId('missing')).toBe(0);
      const failing = createMongoOidcVaultStore({ db: afterLivenessRead(db, async () => {}, true), now: () => 100 });
      await expect(failing.deleteSessionsByLogicalSessionId('missing')).rejects.toThrow(
        'injected alias cleanup failure',
      );
      expect(allocated.length).toBeGreaterThanOrEqual(4);
      for (const session of allocated) {
        expect(session.hasEnded).toBe(true);
        expect(session.endSession).toHaveBeenCalledTimes(1);
      }
      expect(harness.commandStartedEvents.some((event) => event.command.readConcern?.level === 'snapshot')).toBe(true);
    } finally {
      spy.mockRestore();
      await db.dropDatabase();
    }
  });
});
