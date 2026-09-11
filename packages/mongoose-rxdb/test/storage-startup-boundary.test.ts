import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStorageError, createSqliteDatabaseWithLoaders } from '../src/storage/loader';

function missingExcept(modules: Record<string, any>) {
  return async (specifier: string) => {
    if (specifier in modules) return modules[specifier];
    throw new Error(`missing ${specifier}`);
  };
}

const trialModule = {
  getSQLiteBasicsNodeNative: (DatabaseSync: unknown) => ({ kind: 'native-basics', DatabaseSync }),
  getSQLiteBasicsNode: (sqlite3: unknown) => ({ kind: 'npm-basics', sqlite3 }),
  getRxStorageSQLiteTrial: (opts: unknown) => ({ kind: 'trial-storage', opts }),
};

let dbCounter = 0;
function uniqueDbName(prefix: string): string {
  dbCounter += 1;
  return `${prefix}_${process.pid}_${Date.now()}_${dbCounter}`;
}

describe('BMRX-20 deferred SQLite startup failures are fail-closed', () => {
  it('falls through from a deferred native open failure instead of returning a falsely ready backend', async () => {
    const openFailure = new Error('PROBE_OPEN_FAILURE');
    const failedClose = vi.fn(async () => undefined);
    const healthyClose = vi.fn(async () => undefined);
    const createRxDatabase = vi.fn(async (opts: { storage: { kind: string } }) => {
      if (opts.storage.kind === 'premium-storage') {
        // Deferred failure shape observed against real RxDB 17.5.0: the
        // creation promise resolves, the token settles, and the open cause is
        // published on `startupErrors`.
        return { storageToken: Promise.resolve(2), startupErrors: [openFailure], close: failedClose };
      }
      return { storageToken: Promise.resolve('token'), startupErrors: [], close: healthyClose };
    });

    const db = await createSqliteDatabaseWithLoaders(
      { name: uniqueDbName('deferred_fail'), filePath: '/tmp/deferred-fail.db' },
      {
        createRxDatabase,
        addRxPlugin: async () => undefined,
        importModule: missingExcept({
          rxdb: { createRxDatabase, addRxPlugin: async () => undefined },
          'rxdb/plugins/query-builder': { RxDBQueryBuilderPlugin: {} },
          'rxdb-premium/plugins/storage-sqlite': {
            getRxStorageSqlite: (opts: unknown) => ({ kind: 'premium-storage', opts }),
          },
          'node:sqlite': { DatabaseSync: function DatabaseSync() {} },
          'rxdb/plugins/storage-sqlite': trialModule,
        }),
      },
    );

    expect(db.sqliteBackend).toBe('trial-native');
    expect(db.sqliteStorageInfo).toMatchObject({
      backend: 'trial-native',
      persistent: true,
      fallbackCauses: [{ backend: 'premium', phase: 'open', cause: openFailure }],
    });
    expect(failedClose).toHaveBeenCalledTimes(1);
    expect(healthyClose).not.toHaveBeenCalled();
    expect(createRxDatabase).toHaveBeenCalledTimes(2);
  });

  it('prefers the published startup cause when the token promise itself rejects', async () => {
    const openFailure = new Error('PROBE_OPEN_FAILURE');
    const tokenFailure = new TypeError("Cannot read properties of undefined (reading 'token')");
    const failedClose = vi.fn(async () => undefined);
    const createRxDatabase = vi.fn(async () => ({
      storageToken: Promise.reject(tokenFailure),
      startupErrors: [openFailure, tokenFailure],
      close: failedClose,
    }));

    await expect(
      createSqliteDatabaseWithLoaders(
        { name: uniqueDbName('deferred_reject'), filePath: '/tmp/deferred-reject.db' },
        {
          createRxDatabase,
          addRxPlugin: async () => undefined,
          importModule: missingExcept({
            rxdb: { createRxDatabase, addRxPlugin: async () => undefined },
            'rxdb/plugins/query-builder': { RxDBQueryBuilderPlugin: {} },
            'rxdb-premium/plugins/storage-sqlite': {
              getRxStorageSqlite: (opts: unknown) => ({ kind: 'premium-storage', opts }),
            },
          }),
        },
      ),
    ).rejects.toMatchObject({
      name: 'SqliteStorageError',
      filePath: '/tmp/deferred-reject.db',
      causes: [
        { backend: 'premium', phase: 'open', cause: openFailure },
        { backend: 'trial-native', phase: 'load' },
        { backend: 'trial-npm', phase: 'load' },
      ],
    });
    expect(failedClose).toHaveBeenCalledTimes(1);
  });

  it('records a failed cleanup without masking the original startup cause', async () => {
    const openFailure = new Error('PROBE_OPEN_FAILURE');
    const cleanupFailure = new Error('PROBE_CLOSE_FAILURE');
    const createRxDatabase = vi.fn(async () => ({
      storageToken: Promise.resolve('token'),
      startupErrors: [openFailure],
      close: vi.fn(async () => {
        throw cleanupFailure;
      }),
    }));

    const error = await createSqliteDatabaseWithLoaders(
      { name: uniqueDbName('cleanup_fail'), filePath: '/tmp/cleanup-fail.db' },
      {
        createRxDatabase,
        addRxPlugin: async () => undefined,
        importModule: missingExcept({
          rxdb: { createRxDatabase, addRxPlugin: async () => undefined },
          'rxdb/plugins/query-builder': { RxDBQueryBuilderPlugin: {} },
          'rxdb-premium/plugins/storage-sqlite': {
            getRxStorageSqlite: (opts: unknown) => ({ kind: 'premium-storage', opts }),
          },
        }),
      },
    ).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(SqliteStorageError);
    expect(error).toMatchObject({
      filePath: '/tmp/cleanup-fail.db',
      causes: [
        { backend: 'premium', phase: 'open', cause: openFailure },
        { backend: 'premium', phase: 'open', cause: cleanupFailure },
        { backend: 'trial-native', phase: 'load' },
        { backend: 'trial-npm', phase: 'load' },
      ],
    });
    // The original open cause stays first, so `SqliteStorageError.cause`
    // preserves it rather than the cleanup failure.
    expect((error as SqliteStorageError).cause).toBe(openFailure);
  });

  it('treats databases without lifecycle evidence as started (loader-seam fakes)', async () => {
    const createRxDatabase = vi.fn(async () => ({ close: vi.fn() }));

    const db = await createSqliteDatabaseWithLoaders(
      { name: uniqueDbName('no_evidence'), filePath: '/tmp/no-evidence.db' },
      {
        createRxDatabase,
        addRxPlugin: async () => undefined,
        importModule: missingExcept({
          rxdb: { createRxDatabase, addRxPlugin: async () => undefined },
          'rxdb/plugins/query-builder': { RxDBQueryBuilderPlugin: {} },
          'rxdb-premium/plugins/storage-sqlite': {
            getRxStorageSqlite: (opts: unknown) => ({ kind: 'premium-storage', opts }),
          },
        }),
      },
    );

    expect(db.sqliteBackend).toBe('premium');
    expect(createRxDatabase).toHaveBeenCalledTimes(1);
  });
});

describe('BMRX-20 real RxDB startup orchestration (rxdb 17.x supported lifecycle)', () => {
  it('throws SqliteStorageError preserving the open cause when the real native open rejects', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bmrx20-intercepted-'));
    try {
      const { createRxDatabase: realCreateRxDatabase } = await import('rxdb');
      const seen: any[] = [];
      class BoomSync {
        constructor() {
          throw new Error('PROBE_OPEN_FAILURE');
        }
      }

      const error = await createSqliteDatabaseWithLoaders(
        { name: uniqueDbName('bmrx20intercepted'), filePath: join(dir, 'intercepted.db') },
        {
          createRxDatabase: async (opts: { name: string; storage: any; eventReduce: boolean }) => {
            const db = await realCreateRxDatabase(opts);
            seen.push(db);
            return db;
          },
          importModule: async (specifier: string) => {
            if (specifier === 'rxdb-premium/plugins/storage-sqlite') {
              throw new Error('premium unavailable (BMRX-20 probe)');
            }
            if (specifier === 'node:sqlite') {
              const real = await import('node:sqlite');
              return { ...real, DatabaseSync: BoomSync };
            }
            if (specifier === 'sqlite3') throw new Error('sqlite3 unavailable (BMRX-20 probe)');
            return import(specifier);
          },
        },
      ).catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(SqliteStorageError);
      expect(error).toMatchObject({ name: 'SqliteStorageError' });
      const causes = (error as SqliteStorageError).causes;
      const nativeOpen = causes.find((cause) => cause.backend === 'trial-native' && cause.phase === 'open');
      expect(nativeOpen, 'expected an aggregated trial-native open failure').toBeDefined();
      expect((nativeOpen?.cause as Error)?.message).toBe('PROBE_OPEN_FAILURE');
      // trial-npm was never falsely selected; its load failure is aggregated.
      expect(causes.some((cause) => cause.backend === 'trial-npm')).toBe(true);
      expect(causes.some((cause) => cause.backend === 'memory')).toBe(false);
      // The failed native database was cleaned up, not leaked.
      expect(seen.length).toBe(1);
      expect(seen[0].closed).toBe(true);
      expect(seen[0].startupErrors.map((entry: unknown) => (entry as Error)?.message ?? String(entry))).toContain(
        'PROBE_OPEN_FAILURE',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('selects a genuinely started trial-native backend when the open succeeds', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bmrx20-healthy-'));
    try {
      const db = await createSqliteDatabaseWithLoaders(
        { name: uniqueDbName('bmrx20healthy'), filePath: join(dir, 'healthy.db') },
        {
          importModule: async (specifier: string) => {
            if (specifier === 'rxdb-premium/plugins/storage-sqlite') {
              throw new Error('premium unavailable (BMRX-20 probe)');
            }
            return import(specifier);
          },
        },
      );

      try {
        expect(db.sqliteBackend).toBe('trial-native');
        expect(db.sqliteStorageInfo).toMatchObject({ backend: 'trial-native', persistent: true });
        expect(db.startupErrors).toEqual([]);
        await expect(db.storageToken).resolves.toEqual(expect.any(String));
        const files = readdirSync(dir);
        expect(files.length).toBeGreaterThan(0);
        expect(files.some((file) => file.includes('healthy.db'))).toBe(true);
      } finally {
        await db.close();
      }
      expect(db.closed).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
