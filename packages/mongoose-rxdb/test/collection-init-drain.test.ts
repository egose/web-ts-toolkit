import { describe, expect, it } from 'vitest';
import { Connection, Schema } from '../src/index';
import { createMemoryDatabase } from '../src/storage/index';
import { createDeferred, nextTick } from './support/async';

interface GatedDb {
  db: any;
  gate: ReturnType<typeof createDeferred<void>>;
  collectionCloseCalls: string[];
  storageCloseCalls: string[];
}

async function createGatedMemoryDb(name: string): Promise<GatedDb> {
  const db = await createMemoryDatabase({ name });
  const gate = createDeferred<void>();
  const collectionCloseCalls: string[] = [];
  const storageCloseCalls: string[] = [];
  const origAdd = db.addCollections.bind(db);
  db.addCollections = async (definitions: Record<string, unknown>) => {
    await gate.promise;
    const result = await origAdd(definitions);
    for (const [collectionName, collection] of Object.entries<any>(db.collections)) {
      const coll = collection as any;
      if (coll != null && typeof coll === 'object' && !coll.__bmrx18Wrapped) {
        coll.__bmrx18Wrapped = true;
        const origClose = coll.close.bind(coll);
        coll.close = async (...args: unknown[]) => {
          collectionCloseCalls.push(collectionName);
          return origClose(...args);
        };
        const storageInstance = coll.storageInstance;
        if (
          storageInstance != null &&
          typeof storageInstance.close === 'function' &&
          !storageInstance.__bmrx18Wrapped
        ) {
          storageInstance.__bmrx18Wrapped = true;
          const origStorageClose = storageInstance.close.bind(storageInstance);
          storageInstance.close = async (...args: unknown[]) => {
            storageCloseCalls.push(collectionName);
            return origStorageClose(...args);
          };
        }
      }
    }
    return result;
  };
  return { db, gate, collectionCloseCalls, storageCloseCalls };
}

function trackUnhandled(): { unhandled: unknown[]; release: () => void } {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  return { unhandled, release: () => process.off('unhandledRejection', onUnhandled) };
}

describe('BMRX-18 late initialization drain and invalidated models', () => {
  it('completes a real gated initialization without orphan closes', async () => {
    const { unhandled, release } = trackUnhandled();
    try {
      const { db, gate, collectionCloseCalls, storageCloseCalls } = await createGatedMemoryDb(
        `bmrx18_gated_ok_${Date.now()}`,
      );
      const conn = new Connection();
      await conn.connect(() => Promise.resolve(db));
      const Model = conn.model('GatedOk', new Schema({ name: String }), 'bmrx18_gated_ok');
      await nextTick();
      expect(Model.collection).toBeNull();

      gate.resolve();
      const adapter = await conn.resolveModelCollection(Model);
      expect(adapter).toBeTruthy();
      expect(Model.collection).toBe(adapter);
      expect(db.collections['bmrx18_gated_ok']).toBeTruthy();
      expect(db.closed).toBe(false);
      expect(collectionCloseCalls).toEqual([]);
      expect(storageCloseCalls).toEqual([]);

      await conn.disconnect();
      expect(db.closed).toBe(true);
      expect(Model.collection).toBeNull();
      await nextTick();
      expect(unhandled).toEqual([]);
    } finally {
      release();
    }
  });

  it('drains a real gated failure without orphan resources', async () => {
    const { unhandled, release } = trackUnhandled();
    try {
      const db = await createMemoryDatabase({ name: `bmrx18_gated_fail_${Date.now()}` });
      const gate = createDeferred<void>();
      const cause = new Error('BMRX18_GATED_INIT_FAILURE');
      const origAdd = db.addCollections.bind(db);
      db.addCollections = async () => {
        await gate.promise;
        void origAdd;
        throw cause;
      };
      const conn = new Connection();
      await conn.connect(() => Promise.resolve(db));
      const Model = conn.model('GatedFail', new Schema({ name: String }), 'bmrx18_gated_fail');
      const readiness = conn.resolveModelCollection(Model);
      await nextTick();
      expect(Model.collection).toBeNull();

      gate.resolve();
      await expect(readiness).rejects.toBe(cause);
      await nextTick();
      expect(Model.collection).toBeNull();
      expect(conn.modelNames()).not.toContain('GatedFail');
      expect(Object.keys(db.collections)).toEqual([]);
      await conn.disconnect();
      expect(unhandled).toEqual([]);
    } finally {
      release();
    }
  });

  it('disconnect during pending real initialization rejects promptly and closes the late collection on settlement', async () => {
    const { unhandled, release } = trackUnhandled();
    try {
      const { db, gate, collectionCloseCalls, storageCloseCalls } = await createGatedMemoryDb(
        `bmrx18_gated_disc_${Date.now()}`,
      );
      const conn = new Connection();
      await conn.connect(() => Promise.resolve(db));
      const Model = conn.model('GatedDisconnect', new Schema({ name: String }), 'bmrx18_gated_disconnect');
      const readiness = conn.resolveModelCollection(Model);
      await nextTick();
      expect(Model.collection).toBeNull();

      let disconnectSettled = false;
      const disconnecting = conn.disconnect().then(
        () => {
          disconnectSettled = true;
        },
        (error) => {
          disconnectSettled = true;
          throw error;
        },
      );
      // Pending callers reject promptly without waiting for the gate.
      await expect(readiness).rejects.toThrow(/connection closed/i);
      expect(Model.collection).toBeNull();
      expect(conn.modelNames()).toEqual([]);

      // Shutdown retains ownership: it must not settle until the gated
      // initialization settles and its late collection is closed.
      await nextTick();
      await nextTick();
      expect(disconnectSettled).toBe(false);
      expect(db.closed).toBe(false);

      gate.resolve();
      await disconnecting;
      expect(disconnectSettled).toBe(true);
      expect(db.closed).toBe(true);
      // The late-created collection was drained: exactly one collection
      // close and at least one storage-instance close, no live orphan.
      expect(collectionCloseCalls).toEqual(['bmrx18_gated_disconnect']);
      expect(storageCloseCalls.length).toBeGreaterThanOrEqual(1);
      expect(Object.keys(db.collections)).toEqual([]);
      expect(Model.collection).toBeNull();
      await expect(Model.find().exec()).rejects.toThrow(
        /active connection|no longer registered|not attached|connection closed/i,
      );
      await nextTick();
      expect(unhandled).toEqual([]);
    } finally {
      release();
    }
  });

  it('delete during pending real initialization keeps the deleted model invalid without a stale adapter', async () => {
    const { unhandled, release } = trackUnhandled();
    try {
      const { db, gate, collectionCloseCalls, storageCloseCalls } = await createGatedMemoryDb(
        `bmrx18_gated_del_${Date.now()}`,
      );
      const conn = new Connection();
      await conn.connect(() => Promise.resolve(db));
      const Old = conn.model('GatedDelete', new Schema({ name: String }), 'bmrx18_gated_delete');
      const pending = conn.resolveModelCollection(Old);
      await nextTick();

      conn.deleteModel('GatedDelete');
      await expect(pending).rejects.toThrow(/no longer registered|was deleted/i);
      expect(Old.collection).toBeNull();

      gate.resolve();
      // A valid replacement reuses the drained entry and initializes; awaiting
      // it also settles the shared gated addCollections without sleeps.
      const Replacement = conn.model('GatedDeleteReplacement', new Schema({ name: String }), 'bmrx18_gated_delete');
      const adapter = await conn.resolveModelCollection(Replacement);
      await nextTick();
      // Late entry success must not restore the deleted model.
      expect(Old.collection).toBeNull();
      await expect(Old.find().exec()).rejects.toThrow(/no longer registered|not attached|was deleted/i);
      // The connection still owns the collection (no orphan close while open).
      expect(db.collections['bmrx18_gated_delete']).toBeTruthy();
      expect(collectionCloseCalls).toEqual([]);
      expect(storageCloseCalls).toEqual([]);
      expect(adapter).toBeTruthy();
      expect(Replacement.collection).toBe(adapter);
      await Replacement.create({ name: 'kept' } as never);
      expect(await Replacement.countDocuments().exec()).toBe(1);

      await conn.disconnect();
      await nextTick();
      expect(unhandled).toEqual([]);
    } finally {
      release();
    }
  });

  it('overwrite during pending real initialization keeps the old model invalid while the replacement initializes', async () => {
    const { unhandled, release } = trackUnhandled();
    try {
      const { db, gate, collectionCloseCalls } = await createGatedMemoryDb(`bmrx18_gated_over_${Date.now()}`);
      const conn = new Connection();
      await conn.connect(() => Promise.resolve(db));
      const Old = conn.model('GatedOverwrite', new Schema({ name: String }), 'bmrx18_gated_overwrite');
      const oldPending = conn.resolveModelCollection(Old);
      await nextTick();

      const Next = conn.model('GatedOverwrite', new Schema({ name: String }), 'bmrx18_gated_overwrite', {
        overwrite: true,
      });
      await expect(oldPending).rejects.toThrow(/no longer registered|was overwritten/i);
      expect(Old.collection).toBeNull();
      const nextPending = conn.resolveModelCollection(Next);
      await nextTick();
      expect(Next.collection).toBeNull();

      gate.resolve();
      const adapter = await nextPending;
      expect(adapter).toBeTruthy();
      expect(Next.collection).toBe(adapter);
      // Late shared-entry success must not restore the overwritten model.
      await nextTick();
      expect(Old.collection).toBeNull();
      await expect(Old.find().exec()).rejects.toThrow(/no longer registered|not attached|was overwritten/i);
      expect(collectionCloseCalls).toEqual([]);

      await Next.create({ name: 'replacement' } as never);
      expect(await Next.countDocuments().exec()).toBe(1);

      await conn.disconnect();
      await nextTick();
      expect(unhandled).toEqual([]);
    } finally {
      release();
    }
  });
});
