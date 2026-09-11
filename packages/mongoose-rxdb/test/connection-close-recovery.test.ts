import { describe, expect, it, vi } from 'vitest';
import { Connection } from '../src/index';
import { createDeferred, nextTick } from './support/async';

function controllableDb(name = 'bmrx17') {
  const close = vi.fn(async () => undefined);
  const db = {
    collections: {} as Record<string, unknown>,
    addCollections: vi.fn(async (definitions: Record<string, unknown>) => {
      for (const key of Object.keys(definitions)) db.collections[key] = {};
      return db.collections;
    }),
    close,
    destroy: close,
    name,
    options: {},
    storage: {},
  };
  return { db, close };
}

describe('BMRX-17 connection close race and recovery', () => {
  it('gated close plus queued connects yields one factory and one outcome', async () => {
    const first = controllableDb('bmrx17_first');
    const second = controllableDb('bmrx17_second');
    const closeGate = createDeferred<void>();
    first.close.mockImplementationOnce(() => closeGate.promise.then(() => undefined));

    const conn = new Connection();
    await conn.connect(() => Promise.resolve(first.db as any));

    const closing = conn.disconnect();
    await nextTick();
    expect(conn.state).toBe('closing');

    const factory = vi.fn(() => Promise.resolve(second.db as any));
    const firstConnect = conn.connect(factory);
    const secondConnect = conn.connect(factory);
    await nextTick();
    await nextTick();
    expect(factory).toHaveBeenCalledTimes(0);

    closeGate.resolve();
    await closing;
    await Promise.all([firstConnect, secondConnect]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(conn.state).toBe('connected');
    expect(conn.db).toBe(second.db);
    expect(first.close).toHaveBeenCalledTimes(1);
    await conn.disconnect();
    expect(conn.state).toBe('disconnected');
  });

  it('reversed factory completion cannot corrupt state', async () => {
    const slow = controllableDb('bmrx17_slow');
    const fast = controllableDb('bmrx17_fast');
    const slowGate = createDeferred<void>();
    const slowFactory = vi.fn(() => slowGate.promise.then(() => slow.db as any));
    const fastFactory = vi.fn(() => Promise.resolve(fast.db as any));

    const conn = new Connection();
    const firstConnect = conn.connect(slowFactory);
    await nextTick();
    expect(conn.state).toBe('connecting');

    const closing = conn.disconnect();
    // Queued reconnect waits behind close; it must join, not race.
    const queued = conn.connect(fastFactory);
    slowGate.resolve();
    await expect(firstConnect).rejects.toThrow(/closed while opening/i);
    await closing;
    await queued;
    expect(slowFactory).toHaveBeenCalledTimes(1);
    expect(fastFactory).toHaveBeenCalledTimes(1);
    expect(conn.state).toBe('connected');
    expect(conn.db).toBe(fast.db);
    // Stale slow database was closed instead of published.
    expect(slow.close).toHaveBeenCalledTimes(1);
    await conn.disconnect();
  });

  it('close failure preserves cause and allows retry without leaking the database', async () => {
    const { db, close } = controllableDb('bmrx17_fail');
    const cause = new Error('BMRX17_CLOSE_FAILURE');
    close.mockRejectedValueOnce(cause);
    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db as any));

    await expect(conn.disconnect()).rejects.toBe(cause);
    // Recoverable policy: not labelled disconnected, no stuck closing state,
    // database retained, bookkeeping cleared for retry.
    expect(conn.state).toBe('connected');
    expect(conn.db).toBe(db);
    expect((conn as unknown as { disconnectPromise: unknown }).disconnectPromise).toBeNull();

    // A connect attempted while the database is still open is rejected
    // truthfully instead of opening a second database.
    await expect(conn.connect(() => Promise.resolve(controllableDb('bmrx17_other').db as any))).rejects.toThrow(
      /already connected/i,
    );
    expect(conn.db).toBe(db);

    // Retry disconnect succeeds and closes exactly the retained database.
    await conn.disconnect();
    expect(conn.state).toBe('disconnected');
    expect(conn.db).toBeNull();
    expect(close).toHaveBeenCalledTimes(2);

    // A fresh connect works after recovery.
    const next = controllableDb('bmrx17_next');
    await conn.connect(() => Promise.resolve(next.db as any));
    expect(conn.state).toBe('connected');
    expect(conn.db).toBe(next.db);
    await conn.disconnect();
  });

  it('queued connects behind a failed close receive the close cause without opening a factory', async () => {
    const { db, close } = controllableDb('bmrx17_queued_fail');
    const cause = new Error('BMRX17_QUEUED_CLOSE_FAILURE');
    const closeGate = createDeferred<void>();
    close.mockImplementationOnce(() => closeGate.promise.then(() => Promise.reject(cause)));

    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db as any));

    const closing = conn.disconnect();
    await nextTick();
    const factory = vi.fn(() => Promise.resolve(controllableDb('bmrx17_never').db as any));
    const queued = conn.connect(factory);
    const queuedAgain = conn.connect(factory);
    closeGate.resolve();
    await expect(closing).rejects.toBe(cause);
    await expect(queued).rejects.toBe(cause);
    await expect(queuedAgain).rejects.toBe(cause);
    expect(factory).not.toHaveBeenCalled();
    expect(conn.state).toBe('connected');
    expect(conn.db).toBe(db);
    await conn.disconnect();
  });
});
