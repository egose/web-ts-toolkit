import { describe, expect, it, vi } from 'vitest';
import { createSqliteDatabaseWithLoaders, resolveSqliteStorage } from '../src/storage/loader';

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

describe('MRX-01 deterministic SQLite storage loader seam', () => {
  it('selects Premium when that backend is available', async () => {
    const resolution = await resolveSqliteStorage(
      '/tmp/premium.db',
      {},
      {
        importModule: missingExcept({
          'rxdb-premium/plugins/storage-sqlite': {
            getRxStorageSqlite: (opts: unknown) => ({ kind: 'premium-storage', opts }),
          },
        }),
      },
    );

    expect(resolution).toEqual({
      backend: 'premium',
      causes: [],
      storage: { kind: 'premium-storage', opts: { sqliteDatabasePath: '/tmp/premium.db' } },
    });
  });

  it('selects the native trial backend independently from Premium and sqlite3', async () => {
    const DatabaseSync = function DatabaseSync() {};
    const resolution = await resolveSqliteStorage(
      '/tmp/native.db',
      {},
      {
        importModule: missingExcept({
          'node:sqlite': { DatabaseSync },
          'rxdb/plugins/storage-sqlite': trialModule,
        }),
      },
    );

    expect(resolution.backend).toBe('trial-native');
    expect(resolution.storage.opts).toEqual({
      sqliteBasics: { kind: 'native-basics', DatabaseSync },
      databaseNamePrefix: '/tmp/native.db',
    });
  });

  it('selects the npm sqlite3 trial backend when native sqlite is unavailable', async () => {
    const sqlite3 = { Database: function Database() {} };
    const resolution = await resolveSqliteStorage(
      '/tmp/npm.db',
      {},
      {
        importModule: missingExcept({
          sqlite3,
          'rxdb/plugins/storage-sqlite': trialModule,
        }),
      },
    );

    expect(resolution.backend).toBe('trial-npm');
    expect(resolution.storage.opts).toEqual({
      sqliteBasics: { kind: 'npm-basics', sqlite3 },
      databaseNamePrefix: '/tmp/npm.db',
    });
  });

  it('rejects by default when no SQLite backend can be loaded', async () => {
    await expect(resolveSqliteStorage('/tmp/memory.db', {}, { importModule: missingExcept({}) })).rejects.toMatchObject(
      {
        name: 'SqliteStorageError',
        filePath: '/tmp/memory.db',
        causes: [
          { backend: 'premium', phase: 'load' },
          { backend: 'trial-native', phase: 'load' },
          { backend: 'trial-npm', phase: 'load' },
        ],
      },
    );
  });

  it('selects memory only when fallback is explicit', async () => {
    const resolution = await resolveSqliteStorage(
      '/tmp/memory.db',
      { allowMemoryFallback: true },
      {
        importModule: missingExcept({
          'rxdb/plugins/storage-memory': { getRxStorageMemory: () => ({ kind: 'memory-storage' }) },
        }),
      },
    );

    expect(resolution.backend).toBe('memory');
    expect(resolution.storage).toEqual({ kind: 'memory-storage' });
    expect(resolution.causes.map((cause) => [cause.backend, cause.phase])).toEqual([
      ['premium', 'load'],
      ['trial-native', 'load'],
      ['trial-npm', 'load'],
    ]);
  });

  it('falls through from a Premium open failure to the next SQLite tier and exposes causes', async () => {
    const openFailure = new Error('premium open failed');
    const createRxDatabase = vi.fn(async (opts: { storage: { kind: string } }) => {
      if (opts.storage.kind === 'premium-storage') throw openFailure;
      return { close: vi.fn() };
    });

    const db = await createSqliteDatabaseWithLoaders(
      { name: 'open_fail', filePath: '/tmp/open-fail.db' },
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
      databaseName: 'open_fail',
      filePath: '/tmp/open-fail.db',
      persistent: true,
      fallbackCauses: [{ backend: 'premium', phase: 'open', cause: openFailure }],
    });
    expect(createRxDatabase).toHaveBeenCalledTimes(2);
  });

  it('rejects with every backend-specific cause when no backend opens', async () => {
    const premiumOpenFailure = new Error('premium open failed');
    const nativeOpenFailure = new Error('native open failed');
    const createRxDatabase = vi.fn().mockRejectedValueOnce(premiumOpenFailure).mockRejectedValueOnce(nativeOpenFailure);

    await expect(
      createSqliteDatabaseWithLoaders(
        { name: 'no_backend', filePath: '/tmp/no-backend.db' },
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
      ),
    ).rejects.toMatchObject({
      name: 'SqliteStorageError',
      filePath: '/tmp/no-backend.db',
      causes: [
        { backend: 'premium', phase: 'open', cause: premiumOpenFailure },
        { backend: 'trial-native', phase: 'open', cause: nativeOpenFailure },
        { backend: 'trial-npm', phase: 'load' },
      ],
    });

    await expect(
      createSqliteDatabaseWithLoaders(
        { name: 'memory_fallback', filePath: '/tmp/memory-fallback.db', allowMemoryFallback: true },
        {
          createRxDatabase: vi.fn(async () => ({ close: vi.fn() })),
          addRxPlugin: async () => undefined,
          importModule: missingExcept({
            rxdb: { createRxDatabase, addRxPlugin: async () => undefined },
            'rxdb/plugins/query-builder': { RxDBQueryBuilderPlugin: {} },
            'rxdb/plugins/storage-memory': { getRxStorageMemory: () => ({ kind: 'memory-storage' }) },
          }),
        },
      ),
    ).resolves.toMatchObject({
      sqliteBackend: 'memory',
      sqliteStorageInfo: { backend: 'memory', persistent: false },
    });
  });
});
