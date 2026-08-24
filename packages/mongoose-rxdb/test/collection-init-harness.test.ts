import { describe, expect, it, vi } from 'vitest';
import { Connection, Schema } from '../src/index';
import { createDeferred, nextTick } from './support/async';

function createControllableDb() {
  const collection = {};
  const gate = createDeferred<void>();
  const close = vi.fn(async () => undefined);
  const addCollections = vi.fn(async (definitions: Record<string, unknown>) => {
    await gate.promise;
    for (const name of Object.keys(definitions)) db.collections[name] = collection;
    return db.collections;
  });
  const db = {
    collections: {} as Record<string, unknown>,
    addCollections,
    close,
    destroy: close,
    name: 'controllable',
    options: {},
    storage: {},
  };
  return { db, gate, collection, addCollections, close };
}

describe('MRX-01 collection initialization harness', () => {
  it('can keep collection initialization pending and then complete it without sleeps', async () => {
    const { db, gate } = createControllableDb();
    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db as any));

    const Model = conn.model('PendingInit', new Schema({ name: String }), 'pending_init');
    await nextTick();
    expect(Model.collection).toBeNull();

    gate.resolve();
    await conn.resolveModelCollection(Model);
    expect(Model.collection).not.toBeNull();
  });

  it('can make collection initialization reject without producing an unhandled rejection', async () => {
    const error = new Error('init failed');
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const conn = new Connection();
      await conn.connect(() =>
        Promise.resolve({
          collections: {},
          addCollections: async () => {
            throw error;
          },
          close: async () => undefined,
          destroy: async () => undefined,
          name: 'rejecting-mrx01',
          options: {},
          storage: {},
        } as any),
      );

      const Model = conn.model('RejectedInit', new Schema({ name: String }), 'rejected_init');
      await expect(conn.resolveModelCollection(Model)).rejects.toBe(error);
      await nextTick();
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('can make collection initialization succeed through a controlled addCollections call', async () => {
    const { db, gate } = createControllableDb();
    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db as any));

    const Model = conn.model('SuccessfulInit', new Schema({ name: String }), 'successful_init');
    gate.resolve();
    await expect(conn.resolveModelCollection(Model)).resolves.toBeTruthy();
    expect(Object.keys(db.collections)).toEqual(['successful_init']);
  });
});

describe('MRX-04 connection and collection lifecycle', () => {
  it('single-flights equivalent collection initialization by normalized collection name', async () => {
    const { db, gate, addCollections } = createControllableDb();
    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db as any));
    const firstSchema = new Schema({ name: String });
    const secondSchema = new Schema({ name: String });

    const First = conn.model('FirstLifecycleUser', firstSchema, 'LifecycleUsers');
    const Second = conn.model('SecondLifecycleUser', secondSchema, 'lifecycleusers');
    await nextTick();
    expect(addCollections).toHaveBeenCalledTimes(1);

    gate.resolve();
    const [firstAdapter, secondAdapter] = await Promise.all([
      conn.resolveModelCollection(First),
      conn.resolveModelCollection(Second),
    ]);
    expect(firstAdapter).toBe(secondAdapter);
    expect(First.collection).toBe(firstAdapter);
    expect(Second.collection).toBe(secondAdapter);
  });

  it('rejects incompatible same-name and case-colliding collection schemas deterministically', async () => {
    const { db } = createControllableDb();
    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db as any));

    conn.model('LifecycleUserA', new Schema({ name: String }), 'LifecycleUsers');
    expect(() => conn.model('LifecycleUserB', new Schema({ name: String, age: Number }), 'lifecycleusers')).toThrow(
      /incompatible schema.*model overwrite does not migrate/i,
    );
    expect(conn.modelNames()).toEqual(['LifecycleUserA']);
  });

  it('removes failed model compilation from modelNames and avoids unhandled rejections', async () => {
    const error = new Error('init failed');
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const conn = new Connection();
      await conn.connect(() =>
        Promise.resolve({
          collections: {},
          addCollections: async () => {
            throw error;
          },
          close: async () => undefined,
          destroy: async () => undefined,
          name: 'rejecting',
          options: {},
          storage: {},
        } as any),
      );

      const Model = conn.model('RejectedLifecycleInit', new Schema({ name: String }), 'rejected_lifecycle_init');
      await expect(conn.resolveModelCollection(Model)).rejects.toBe(error);
      await nextTick();
      expect(conn.modelNames()).not.toContain('RejectedLifecycleInit');
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('disconnect during pending initialization rejects readiness and leaves no live adapter', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { db, gate, close } = createControllableDb();
      const conn = new Connection();
      await conn.connect(() => Promise.resolve(db as any));
      const Model = conn.model('DisconnectPendingInit', new Schema({ name: String }), 'disconnect_pending_init');
      const readiness = conn.resolveModelCollection(Model);
      await nextTick();

      await conn.disconnect();

      await expect(readiness).rejects.toThrow(/connection closed/i);
      expect(Model.collection).toBeNull();
      expect(conn.modelNames()).toEqual([]);
      expect(close).toHaveBeenCalledTimes(1);

      gate.resolve();
      await nextTick();
      expect(Model.collection).toBeNull();
      await expect(Model.find().exec()).rejects.toThrow(
        /active connection|no longer registered|not attached|connection closed/i,
      );
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('rejects connected reconnects and invalidates old models after disconnect', async () => {
    const first = createControllableDb();
    const second = createControllableDb();
    first.gate.resolve();
    second.gate.resolve();
    const conn = new Connection();
    await conn.connect(() => Promise.resolve(first.db as any));
    const User = conn.model('ReconnectLifecycleUser', new Schema({ name: String }), 'reconnect_lifecycle_user');
    await conn.resolveModelCollection(User);

    await expect(conn.connect(() => Promise.resolve(second.db as any))).rejects.toThrow(/already connected/i);
    expect(conn.state).toBe('connected');

    await conn.disconnect();
    expect(User.collection).toBeNull();
    await conn.connect(() => Promise.resolve(second.db as any));
    await expect(User.find().exec()).rejects.toThrow(
      /no longer registered|active connection|not attached|connection closed/i,
    );
  });

  it('single-flights connect and disconnect calls', async () => {
    const { db, gate, close } = createControllableDb();
    gate.resolve();
    const factory = vi.fn(() => Promise.resolve(db as any));
    const conn = new Connection();

    const firstConnect = conn.connect(factory);
    const secondConnect = conn.connect(factory);
    await Promise.all([firstConnect, secondConnect]);
    expect(factory).toHaveBeenCalledTimes(1);

    const firstDisconnect = conn.disconnect();
    const secondDisconnect = conn.disconnect();
    await Promise.all([firstDisconnect, secondDisconnect]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(conn.state).toBe('disconnected');
  });

  it('rejects unsupported string connection input before creating storage', async () => {
    const conn = new Connection();
    await expect(conn.connect('mongodb://example.invalid' as any)).rejects.toThrow(
      /connection strings are not supported/i,
    );
    expect(conn.state).toBe('disconnected');
  });
});
