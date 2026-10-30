import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseCookieSessionVersion, sameCookieBinding } from '../src/cookie-session';
import {
  DPOP_DATABASE_NAME,
  readCookieSessionVersion,
  readDpopScopeState,
  removeDpopScope,
  writeCookieSessionVersion,
  type CookieSessionVersion,
} from '../src/key-database';
import { createSessionLifecycle } from '../src/session-lifecycle';

vi.mock('idb', () => ({ openDB: vi.fn() }));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const fixture = () => {
  const started = deferred<void>();
  const request = deferred<IDBValidKey>();
  const done = deferred<void>();
  const abort = vi.fn(() => {
    const error = new DOMException('Transaction aborted', 'AbortError');
    request.reject(error);
    done.reject(error);
  });
  const put = vi.fn(() => {
    started.resolve();
    return request.promise;
  });
  const transaction = vi.fn(() => ({ store: { put }, done: done.promise, abort }));
  const close = vi.fn();
  const db = { transaction, close } as unknown as Awaited<ReturnType<typeof openDB>>;
  vi.mocked(openDB).mockResolvedValue(db);
  const lifecycle = createSessionLifecycle();
  const authority = lifecycle.capture();
  const addListener = vi.spyOn(authority.signal, 'addEventListener');
  const removeListener = vi.spyOn(authority.signal, 'removeEventListener');
  const value: CookieSessionVersion = { jkt: 'key', generation: 'new-generation', active: true };
  return {
    db,
    lifecycle,
    authority,
    value,
    started,
    request,
    done,
    put,
    transaction,
    abort,
    close,
    addListener,
    removeListener,
  };
};

beforeEach(() => vi.resetAllMocks());

describe('DPH-02 cookie metadata transaction authority', () => {
  it.each(['invalidate', 'dispose'] as const)(
    'does not start a write after %s during database open',
    async (action) => {
      const f = fixture();
      const opened = deferred<Awaited<ReturnType<typeof openDB>>>();
      vi.mocked(openDB).mockReturnValueOnce(opened.promise);
      const writing = writeCookieSessionVersion('scope', f.value, f.authority);
      const result = writing.catch((error: unknown) => error);
      f.lifecycle[action]();
      opened.resolve(f.db);
      expect(await result).toMatchObject({
        code: action === 'dispose' ? 'DPOP_SESSION_DISPOSED' : 'DPOP_OPERATION_SUPERSEDED',
      });
      expect(f.transaction).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
      expect(f.close).toHaveBeenCalledOnce();
    },
  );

  it.each(['invalidate', 'dispose'] as const)(
    'aborts an in-flight write on %s and cleans its listener',
    async (action) => {
      const f = fixture();
      const writing = writeCookieSessionVersion('scope', f.value, f.authority);
      const result = writing.catch((error: unknown) => error);
      await f.started.promise;
      f.lifecycle[action]();
      expect(await result).toMatchObject({ name: 'AbortError' });
      expect(f.abort).toHaveBeenCalledOnce();
      expect(f.put).toHaveBeenCalledExactlyOnceWith(f.value, 'scope');
      expect(f.addListener).toHaveBeenCalledOnce();
      expect(f.removeListener).toHaveBeenCalledExactlyOnceWith('abort', f.addListener.mock.calls[0][1]);
      expect(f.close).toHaveBeenCalledOnce();
    },
  );

  it('waits for transaction commit and removes the listener on success', async () => {
    const f = fixture();
    let settled = false;
    const writing = writeCookieSessionVersion('scope', f.value, f.authority).then(() => {
      settled = true;
    });
    await f.started.promise;
    f.request.resolve('scope');
    await Promise.resolve();
    expect(settled).toBe(false);
    f.done.resolve();
    await writing;
    expect(f.transaction).toHaveBeenCalledExactlyOnceWith('cookieSessions', 'readwrite');
    expect(f.removeListener).toHaveBeenCalledExactlyOnceWith('abort', f.addListener.mock.calls[0][1]);
    f.lifecycle.dispose();
    expect(f.abort).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledOnce();
  });

  it('already-disposed authority does not even open the database', async () => {
    const f = fixture();
    f.lifecycle.dispose();
    await expect(writeCookieSessionVersion('scope', f.value, f.authority)).rejects.toMatchObject({
      code: 'DPOP_SESSION_DISPOSED',
    });
    expect(openDB).not.toHaveBeenCalled();
  });
});

const scopeFixture = (
  key: unknown = { jkt: 'old-key', privateKey: 'corrupt' },
  cookie: unknown = {
    jkt: 'old-key',
    generation: 'old-generation',
    active: true,
  },
) => {
  const rows = {
    keys: new Map<string, unknown>([
      ['scope', key],
      ['unrelated', { jkt: 'other-key' }],
    ]),
    cookieSessions: new Map<string, unknown>([
      ['scope', cookie],
      ['unrelated', { generation: 'other-generation' }],
    ]),
  };
  const started = deferred<void>();
  const keyDeleted = deferred<void>();
  const cookieDeleted = deferred<void>();
  const done = deferred<void>();
  const deleted: Array<[keyof typeof rows, string]> = [];
  const abort = vi.fn(() => {
    const error = new DOMException('Transaction aborted', 'AbortError');
    keyDeleted.reject(error);
    cookieDeleted.reject(error);
    done.reject(error);
  });
  const stores = Object.fromEntries(
    Object.entries(rows).map(([name, values]) => [
      name,
      {
        get: vi.fn(async (id: string) => values.get(id)),
        getKey: vi.fn(async (id: string) => (values.has(id) ? id : undefined)),
        delete: vi.fn((id: string) => {
          deleted.push([name as keyof typeof rows, id]);
          started.resolve();
          return name === 'keys' ? keyDeleted.promise : cookieDeleted.promise;
        }),
      },
    ]),
  );
  const transaction = vi.fn(() => ({ objectStore: (name: string) => stores[name], done: done.promise, abort }));
  const close = vi.fn();
  const db = { transaction, close } as unknown as Awaited<ReturnType<typeof openDB>>;
  vi.mocked(openDB).mockResolvedValue(db);
  const lifecycle = createSessionLifecycle();
  const authority = lifecycle.capture();
  const commit = () => {
    for (const [name, id] of deleted) rows[name].delete(id);
    keyDeleted.resolve();
    cookieDeleted.resolve();
    done.resolve();
  };
  return { rows, started, stores, deleted, done, abort, transaction, close, db, lifecycle, authority, commit };
};

describe('DPH-06 scoped key/metadata transaction authority', () => {
  it.each([undefined, null, 'corrupt', { jkt: 'mismatched', version: 99 }])(
    'deletes corrupt key %j and metadata together, leaving unrelated rows and the installed schema intact',
    async (key) => {
      const f = scopeFixture(key, { jkt: 'old-key', generation: 'old-generation', active: true });
      // An explicitly stored undefined value is distinct from no record.
      f.rows.keys.set('scope', key);
      const removing = removeDpopScope('scope', f.authority);
      await f.started.promise;
      expect(f.transaction).toHaveBeenCalledExactlyOnceWith(['keys', 'cookieSessions'], 'readwrite');
      expect(f.deleted).toEqual([
        ['keys', 'scope'],
        ['cookieSessions', 'scope'],
      ]);
      let settled = false;
      void removing.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      f.commit();
      expect(await removing).toMatchObject({
        keyPresent: true,
        cookiePresent: true,
        version: {
          jkt: 'old-key',
          generation: 'old-generation',
          active: true,
        },
      });
      expect([...f.rows.keys]).toEqual([['unrelated', { jkt: 'other-key' }]]);
      expect([...f.rows.cookieSessions]).toEqual([['unrelated', { generation: 'other-generation' }]]);
      expect(openDB).toHaveBeenCalledWith(DPOP_DATABASE_NAME, 1, expect.any(Object));
      expect(f.close).toHaveBeenCalledOnce();
      expect(f.abort).not.toHaveBeenCalled();
    },
  );

  it('recognizes present-but-undefined/corrupt records when checking a reset notification', async () => {
    const f = scopeFixture();
    f.rows.keys.set('scope', undefined);
    f.rows.cookieSessions.set('scope', null);
    const reading = readDpopScopeState('scope', f.authority);
    f.done.resolve();
    expect(await reading).toEqual({ keyPresent: true, cookiePresent: true, keyJkt: undefined, version: undefined });
    expect(f.transaction).toHaveBeenCalledExactlyOnceWith(['keys', 'cookieSessions'], 'readonly');
    expect(f.deleted).toEqual([]);
  });

  it.each([undefined, null, -1, NaN, Infinity, '1800000000000'])(
    'retains old metadata while omitting invalid timing hint %s',
    async (refreshedAt) => {
      const f = scopeFixture({ jkt: 'key' }, { jkt: 'key', generation: 'generation', active: true, refreshedAt });
      const reading = readDpopScopeState('scope', f.authority);
      f.done.resolve();
      expect((await reading).version).toEqual({ jkt: 'key', generation: 'generation', active: true });
    },
  );

  it('retains a safe generation timing hint without projecting unrelated fields', async () => {
    const f = scopeFixture(
      { jkt: 'key' },
      { jkt: 'key', generation: 'generation', active: true, refreshedAt: 1_800_000_000_000, extra: 'not-coordination' },
    );
    const reading = readDpopScopeState('scope', f.authority);
    f.done.resolve();
    expect((await reading).version).toEqual({
      jkt: 'key',
      generation: 'generation',
      active: true,
      refreshedAt: 1_800_000_000_000,
    });
  });

  it.each(['invalidate', 'dispose'] as const)(
    'does not begin deletion after %s during database open',
    async (action) => {
      const f = scopeFixture();
      const opened = deferred<Awaited<ReturnType<typeof openDB>>>();
      vi.mocked(openDB).mockReturnValueOnce(opened.promise);
      const removing = removeDpopScope('scope', f.authority).catch((error: unknown) => error);
      f.lifecycle[action]();
      opened.resolve(f.db);
      expect(await removing).toMatchObject({
        code: action === 'dispose' ? 'DPOP_SESSION_DISPOSED' : 'DPOP_OPERATION_SUPERSEDED',
      });
      expect(f.transaction).not.toHaveBeenCalled();
      expect(f.deleted).toEqual([]);
      expect(f.close).toHaveBeenCalledOnce();
    },
  );

  it.each(['invalidate', 'dispose'] as const)(
    'aborts both scoped deletes on %s without committing either',
    async (action) => {
      const f = scopeFixture();
      const add = vi.spyOn(f.authority.signal, 'addEventListener');
      const remove = vi.spyOn(f.authority.signal, 'removeEventListener');
      const removing = removeDpopScope('scope', f.authority).catch((error: unknown) => error);
      await f.started.promise;
      f.lifecycle[action]();
      expect(await removing).toMatchObject({
        code: action === 'dispose' ? 'DPOP_SESSION_DISPOSED' : 'DPOP_OPERATION_SUPERSEDED',
      });
      expect(f.abort).toHaveBeenCalledOnce();
      expect(f.rows.keys.has('scope')).toBe(true);
      expect(f.rows.cookieSessions.has('scope')).toBe(true);
      expect(remove).toHaveBeenCalledExactlyOnceWith('abort', add.mock.calls[0][1]);
      expect(f.close).toHaveBeenCalledOnce();
    },
  );

  it('disposed authority performs no database open for deletion or notification checks', async () => {
    const f = scopeFixture();
    f.lifecycle.dispose();
    await expect(removeDpopScope('scope', f.authority)).rejects.toMatchObject({ code: 'DPOP_SESSION_DISPOSED' });
    await expect(readDpopScopeState('scope', f.authority)).rejects.toMatchObject({ code: 'DPOP_SESSION_DISPOSED' });
    expect(openDB).not.toHaveBeenCalled();
  });
});

describe('OBEAR-03 mode-discriminated cookie metadata', () => {
  it.each([
    [
      { jkt: 'key', generation: 'legacy', active: true },
      { jkt: 'key', generation: 'legacy', active: true },
    ],
    [
      { mode: 'dpop', jkt: 'key', generation: 'bound', active: true },
      { mode: 'dpop', jkt: 'key', generation: 'bound', active: true },
    ],
    [
      {
        mode: 'bearer',
        generation: 'unbound',
        active: true,
        refreshedAt: 1_800_000_000_000,
        sessionId: 'never-project',
        accessToken: 'never-project',
      },
      { mode: 'bearer', generation: 'unbound', active: true, refreshedAt: 1_800_000_000_000 },
    ],
  ])('reads only validated coordination fields without accessing the key store (%j)', async (record, expected) => {
    const get = vi.fn(async () => record);
    const close = vi.fn();
    vi.mocked(openDB).mockResolvedValue({ get, close } as unknown as Awaited<ReturnType<typeof openDB>>);
    expect(await readCookieSessionVersion('scope')).toEqual(expected);
    expect(get).toHaveBeenCalledExactlyOnceWith('cookieSessions', 'scope');
    expect(openDB).toHaveBeenCalledWith(DPOP_DATABASE_NAME, 1, expect.any(Object));
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { generation: 'missing-mode', active: true },
    { mode: 'unknown', jkt: 'key', generation: 'g', active: true },
    { mode: 'bearer', jkt: undefined, generation: 'g', active: true },
    { mode: 'bearer', jkt: 'fake-binding', generation: 'g', active: true },
    { mode: 'bearer', generation: '', active: true },
    { mode: 'bearer', generation: 'g', active: 'true' },
  ])('rejects ambiguous/corrupt mode records (%j)', (record) => {
    expect(parseCookieSessionVersion(record)).toBeUndefined();
  });

  it('legacy records/messages are DPoP only, never the same binding as Bearer', () => {
    const legacy = { jkt: 'key', generation: 'g', active: true };
    expect(sameCookieBinding(legacy, { ...legacy, mode: 'dpop' })).toBe(true);
    expect(sameCookieBinding(legacy, { mode: 'bearer', generation: 'g', active: true })).toBe(false);
    expect(
      sameCookieBinding(
        { mode: 'bearer', generation: 'g', active: true },
        { mode: 'bearer', generation: 'new', active: true },
      ),
    ).toBe(false);
  });

  it.each(['bearer', 'dpop'] as const)(
    'rechecks the captured generation inside deletion and preserves a newer %s row and key',
    async (mode) => {
      const f = scopeFixture();
      const expected = { jkt: 'old-key', generation: 'old-generation', active: true };
      f.rows.cookieSessions.set(
        'scope',
        mode === 'bearer'
          ? { mode, generation: 'replacement', active: true }
          : { mode, jkt: 'old-key', generation: 'replacement', active: true },
      );
      const removing = removeDpopScope('scope', f.authority, (current) => sameCookieBinding(current.version, expected));
      f.done.resolve();
      expect(await removing).toBeUndefined();
      expect(f.deleted).toEqual([]);
      expect(f.rows.keys.has('scope')).toBe(true);
      expect(f.rows.cookieSessions.has('scope')).toBe(true);
      expect(f.transaction).toHaveBeenCalledWith(['keys', 'cookieSessions'], 'readwrite');
    },
  );
});
