import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MEMORY_FILE_PATH,
  SqliteStorageError,
  createSqliteDatabaseWithLoaders,
  resolveSqliteStorage,
} from '../src/storage/loader';

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

function baseSeam(extra: Record<string, any> = {}) {
  return {
    rxdb: { createRxDatabase: vi.fn(), addRxPlugin: async () => undefined },
    'rxdb/plugins/query-builder': { RxDBQueryBuilderPlugin: {} },
    ...extra,
  };
}

describe('BMRX-21 exact driver targets for explicit file paths (loader seam)', () => {
  it('passes the exact file path to Premium (sqliteDatabasePath)', async () => {
    const resolution = await resolveSqliteStorage(
      '/tmp/bmrx21-premium.db',
      {},
      {
        importModule: missingExcept({
          'rxdb-premium/plugins/storage-sqlite': {
            getRxStorageSqlite: (opts: unknown) => ({ kind: 'premium-storage', opts }),
          },
        }),
      },
    );
    expect(resolution.backend).toBe('premium');
    expect(resolution.storage).toEqual({
      kind: 'premium-storage',
      opts: { sqliteDatabasePath: '/tmp/bmrx21-premium.db' },
    });
  });

  it('passes the exact file path as databaseNamePrefix to trial-native', async () => {
    const DatabaseSync = function DatabaseSync() {};
    const resolution = await resolveSqliteStorage(
      '/tmp/bmrx21-native.db',
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
      databaseNamePrefix: '/tmp/bmrx21-native.db',
    });
  });

  it('passes the exact file path as databaseNamePrefix to trial-npm', async () => {
    const sqlite3 = { Database: function Database() {} };
    const resolution = await resolveSqliteStorage(
      '/tmp/bmrx21-npm.db',
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
      databaseNamePrefix: '/tmp/bmrx21-npm.db',
    });
  });

  it('reports persistent:true for explicit-path SQLite backends', async () => {
    const createRxDatabase = vi.fn(async () => ({ close: vi.fn() }));
    const db = await createSqliteDatabaseWithLoaders(
      { name: uniqueDbName('bmrx21persist'), filePath: '/tmp/bmrx21-persist.db' },
      {
        createRxDatabase,
        addRxPlugin: async () => undefined,
        importModule: missingExcept({
          ...baseSeam(),
          'rxdb-premium/plugins/storage-sqlite': {
            getRxStorageSqlite: (opts: unknown) => ({ kind: 'premium-storage', opts }),
          },
        }),
      },
    );
    expect(db.sqliteBackend).toBe('premium');
    expect(db.sqliteStorageInfo).toMatchObject({
      backend: 'premium',
      filePath: '/tmp/bmrx21-persist.db',
      persistent: true,
    });
  });
});

describe("BMRX-21 ':memory:' never reaches a SQLite backend (loader seam)", () => {
  it('selects genuine memory storage with persistent:false when opt-in is passed', async () => {
    const createRxDatabase = vi.fn(async (opts: { storage: unknown }) => ({ close: vi.fn(), storage: opts.storage }));
    const seenSpecs: string[] = [];
    const db = await createSqliteDatabaseWithLoaders(
      { name: uniqueDbName('bmrx21mem'), filePath: ':memory:', allowMemoryFallback: true },
      {
        createRxDatabase,
        addRxPlugin: async () => undefined,
        importModule: async (specifier: string) => {
          seenSpecs.push(specifier);
          if (specifier === 'rxdb') return { createRxDatabase, addRxPlugin: async () => undefined };
          if (specifier === 'rxdb/plugins/query-builder') return { RxDBQueryBuilderPlugin: {} };
          if (specifier === 'rxdb/plugins/storage-memory') {
            return { getRxStorageMemory: () => ({ kind: 'memory-storage' }) };
          }
          throw new Error(`sqlite backend must not be loaded for :memory:, got ${specifier}`);
        },
      },
    );
    expect(db.sqliteBackend).toBe('memory');
    expect(db.sqliteStorageInfo).toMatchObject({ backend: 'memory', filePath: ':memory:', persistent: false });
    expect(createRxDatabase).toHaveBeenCalledTimes(1);
    expect(seenSpecs).not.toContain('rxdb-premium/plugins/storage-sqlite');
    expect(seenSpecs).not.toContain('rxdb/plugins/storage-sqlite');
    expect(seenSpecs).not.toContain('node:sqlite');
    expect(seenSpecs).not.toContain('sqlite3');
  });

  it('rejects explicit :memory: without opt-in before any database is opened', async () => {
    const createRxDatabase = vi.fn(async () => ({ close: vi.fn() }));
    const error = await createSqliteDatabaseWithLoaders(
      { name: uniqueDbName('bmrx21memreject'), filePath: ':memory:' },
      {
        createRxDatabase,
        addRxPlugin: async () => undefined,
        importModule: missingExcept({
          ...baseSeam(),
          'rxdb-premium/plugins/storage-sqlite': {
            getRxStorageSqlite: (opts: unknown) => ({ kind: 'premium-storage', opts }),
          },
        }),
      },
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(SqliteStorageError);
    expect(error).toMatchObject({ filePath: ':memory:' });
    expect(String((error as Error).message)).toMatch(/allowMemoryFallback/);
    expect(createRxDatabase).not.toHaveBeenCalled();
  });

  it('rejects the default (no filePath) without opt-in: fail-closed truthful default', async () => {
    const createRxDatabase = vi.fn(async () => ({ close: vi.fn() }));
    const error = await createSqliteDatabaseWithLoaders(
      { name: uniqueDbName('bmrx21default') },
      {
        createRxDatabase,
        addRxPlugin: async () => undefined,
        importModule: missingExcept(baseSeam()),
      },
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(SqliteStorageError);
    expect(error).toMatchObject({ filePath: MEMORY_FILE_PATH });
    expect(createRxDatabase).not.toHaveBeenCalled();
  });

  it('resolves the default to genuine memory with opt-in', async () => {
    const createRxDatabase = vi.fn(async () => ({ close: vi.fn() }));
    const db = await createSqliteDatabaseWithLoaders(
      { name: uniqueDbName('bmrx21defaultmem'), allowMemoryFallback: true },
      {
        createRxDatabase,
        addRxPlugin: async () => undefined,
        importModule: missingExcept({
          ...baseSeam(),
          'rxdb/plugins/storage-memory': { getRxStorageMemory: () => ({ kind: 'memory-storage' }) },
        }),
      },
    );
    expect(db.sqliteBackend).toBe('memory');
    expect(db.sqliteStorageInfo).toMatchObject({ filePath: ':memory:', persistent: false });
  });

  it('resolveSqliteStorage rejects :memory: without opt-in and resolves memory with it', async () => {
    await expect(
      resolveSqliteStorage(':memory:', {}, { importModule: missingExcept(baseSeam()) }),
    ).rejects.toMatchObject({ name: 'SqliteStorageError', filePath: ':memory:' });
    const resolution = await resolveSqliteStorage(
      ':memory:',
      { allowMemoryFallback: true },
      {
        importModule: missingExcept({
          ...baseSeam(),
          'rxdb/plugins/storage-memory': { getRxStorageMemory: () => ({ kind: 'memory-storage' }) },
        }),
      },
    );
    expect(resolution.backend).toBe('memory');
  });
});

describe('BMRX-21 intercepted opens: prefixed driver targets, never bare :memory:', () => {
  it('opens trial-native with a prefixed target for explicit paths (not the bare file path)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bmrx21-intercept-'));
    try {
      const { createRxDatabase: realCreateRxDatabase } = await import('rxdb');
      const openedNames: string[] = [];
      const filePath = join(dir, 'explicit.db');
      const databaseName = uniqueDbName('bmrx21prefixed');
      const db = await createSqliteDatabaseWithLoaders(
        { name: databaseName, filePath },
        {
          createRxDatabase: (opts: { name: string; storage: any; eventReduce: boolean }) => realCreateRxDatabase(opts),
          importModule: async (specifier: string) => {
            if (specifier === 'rxdb-premium/plugins/storage-sqlite') {
              throw new Error('premium unavailable (BMRX-21 probe)');
            }
            if (specifier === 'node:sqlite') {
              const real = await import('node:sqlite');
              const RealSync = (real as any).DatabaseSync;
              class RecordingSync extends RealSync {
                constructor(name: any) {
                  openedNames.push(String(name));
                  super(name);
                }
              }
              return { ...real, DatabaseSync: RecordingSync };
            }
            return import(specifier);
          },
        },
      );
      try {
        expect(db.sqliteBackend).toBe('trial-native');
        expect(db.sqliteStorageInfo).toMatchObject({ persistent: true, filePath });
        // RxDB derives `<prefix>_trial_<databaseName>`: the driver target is
        // neither the bare prefix nor SQLite's special ':memory:' name.
        expect(openedNames.length).toBeGreaterThan(0);
        for (const name of openedNames) {
          expect(name).toBe(`${filePath}_trial_${databaseName}`);
          expect(name).not.toBe(filePath);
          expect(name).not.toBe(':memory:');
        }
        const files = readdirSync(dir);
        expect(files.some((file) => file.includes('explicit.db'))).toBe(true);
      } finally {
        await db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("never touches the native driver for ':memory:' with opt-in", async () => {
    const { createRxDatabase: realCreateRxDatabase } = await import('rxdb');
    let driverOpens = 0;
    const db = await createSqliteDatabaseWithLoaders(
      { name: uniqueDbName('bmrx21nodriver'), filePath: ':memory:', allowMemoryFallback: true },
      {
        createRxDatabase: (opts: { name: string; storage: any; eventReduce: boolean }) => realCreateRxDatabase(opts),
        importModule: async (specifier: string) => {
          if (specifier === 'node:sqlite' || specifier === 'sqlite3') {
            driverOpens += 1;
            throw new Error(`SQLite driver must not load for :memory:, got ${specifier}`);
          }
          if (specifier === 'rxdb-premium/plugins/storage-sqlite') {
            throw new Error('premium unavailable (BMRX-21 probe)');
          }
          return import(specifier);
        },
      },
    );
    try {
      expect(db.sqliteBackend).toBe('memory');
      expect(db.sqliteStorageInfo).toMatchObject({ persistent: false });
      expect(driverOpens).toBe(0);
    } finally {
      await db.close();
    }
  }, 30_000);
});

describe('BMRX-21 isolated real-driver persistence behavior', () => {
  it('trial-native persists across close/reopen in a second process for explicit paths', async () => {
    // Same-process same-name reopen is rejected by RxDB itself ('opened db
    // with different creator method') because each loader call builds a fresh
    // native basics object, so cross-process reopen (like _sqlite-smoke) is
    // the truthful durability proof. Requires a fresh `dist` build first.
    const { mkdirSync, existsSync, statSync } = await import('node:fs');
    const { pathToFileURL } = await import('node:url');
    const { runChecked, cleanupTrackedChildren } = await import('./support/subprocess');
    const { writeProjectFile } = await import('./support/temp');
    const dir = mkdtempSync(join(tmpdir(), 'bmrx21-persist-'));
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const { Connection, Schema } = await import('../src/index');
      const { createSqliteDatabaseWithLoaders: createWithLoaders } = await import('../src/storage/loader');
      const filePath = join(dir, 'persist.db');
      const dbName = uniqueDbName('bmrx21reopen');
      const tag = `${process.pid}_${dbCounter}`;
      const blockingImport = async (specifier: string) => {
        if (specifier === 'rxdb-premium/plugins/storage-sqlite') {
          throw new Error('premium blocked to force trial-native (BMRX-21 probe)');
        }
        return import(specifier);
      };
      const conn = new Connection();
      await conn.connect(() => createWithLoaders({ name: dbName, filePath }, { importModule: blockingImport }));
      expect(conn.ready().sqliteStorageInfo).toMatchObject({ backend: 'trial-native', persistent: true });
      const User = conn.model(`Bmrx21Persist${tag}`, new Schema({ name: String }) as never, `bmrx21persist_${tag}`);
      await (User as any).create({ name: 'Ada' });
      await (User as any).create({ name: 'Bob' });
      expect(await (User as any).countDocuments().exec()).toBe(2);
      await conn.disconnect();

      // Trial backends derive collection-specific files from the prefix.
      const files = readdirSync(dir);
      expect(files.some((file) => file.includes('persist.db'))).toBe(true);
      const totalBytes = files.reduce((sum, f) => {
        try {
          return sum + statSync(join(dir, f)).size;
        } catch {
          return sum;
        }
      }, 0);
      expect(totalBytes).toBeGreaterThan(0);

      const packageRoot = join(__dirname, '..');
      writeProjectFile(
        dir,
        'reopen.mjs',
        `import { Connection, Schema } from ${JSON.stringify(pathToFileURL(join(packageRoot, 'dist', 'index.mjs')).href)};
import { createSqliteDatabase } from ${JSON.stringify(pathToFileURL(join(packageRoot, 'dist', 'storage', 'index.mjs')).href)};

const conn = new Connection();
await conn.connect(() => createSqliteDatabase({ name: ${JSON.stringify(dbName)}, filePath: ${JSON.stringify(filePath)} }));
if (conn.ready().sqliteStorageInfo.persistent !== true) throw new Error('expected persistent:true on reopen');
if (conn.ready().sqliteBackend === 'memory') throw new Error('reopen fell back to memory');
const schema = new Schema({ name: String });
const User = conn.model(${JSON.stringify(`Bmrx21Persist${tag}`)}, schema, ${JSON.stringify(`bmrx21persist_${tag}`)});
const count = await User.countDocuments({}).exec();
const ada = await User.findOne({ name: 'Ada' }).exec();
await conn.disconnect();
if (count !== 2) throw new Error('expected 2 reopened docs, got ' + count);
if (!ada || ada.name !== 'Ada') throw new Error('expected to reopen Ada');
`,
      );
      await runChecked('node', ['reopen.mjs'], { cwd: dir, timeoutMs: 15_000 });
      await cleanupTrackedChildren();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('memory mode creates no relative files and does not persist into a second process', async () => {
    // Note: RxDB's memory storage intentionally keeps collection state in a
    // module-global Map even after close (filesystem-like test behavior), so
    // same-process same-name reopen can still see data. Genuine volatility is
    // proven by the absence of files plus a fresh process starting empty.
    // The child reopen requires a fresh `dist` build first.
    const { pathToFileURL } = await import('node:url');
    const { runChecked, cleanupTrackedChildren } = await import('./support/subprocess');
    const { writeProjectFile } = await import('./support/temp');
    const dir = mkdtempSync(join(tmpdir(), 'bmrx21-volatile-'));
    const cwdBefore = new Set(readdirSync(process.cwd()));
    try {
      const { Connection, Schema } = await import('../src/index');
      const { createSqliteDatabaseWithLoaders: createWithLoaders } = await import('../src/storage/loader');
      const dbName = uniqueDbName('bmrx21volatile');
      const tag = `${process.pid}_${dbCounter}`;
      const conn = new Connection();
      await conn.connect(() => createWithLoaders({ name: dbName, filePath: ':memory:', allowMemoryFallback: true }));
      expect(conn.ready().sqliteBackend).toBe('memory');
      expect(conn.ready().sqliteStorageInfo).toMatchObject({ persistent: false });
      const User = conn.model(`Bmrx21Volatile${tag}`, new Schema({ name: String }) as never, `bmrx21vol_${tag}`);
      await (User as any).create({ name: 'Ada' });
      expect(await (User as any).countDocuments().exec()).toBe(1);
      await conn.disconnect();

      // No ordinary `:memory:_trial_*` relative file may appear in cwd or the
      // isolated dir as a side effect of volatile mode.
      expect(readdirSync(dir)).toEqual([]);
      const cwdAfter = readdirSync(process.cwd());
      expect(cwdAfter.filter((file) => file.includes(':memory:'))).toEqual([]);
      expect(cwdAfter.filter((file) => !cwdBefore.has(file) && file.includes('bmrx21'))).toEqual([]);

      const packageRoot = join(__dirname, '..');
      writeProjectFile(
        dir,
        'reopen-mem.mjs',
        `import { Connection, Schema } from ${JSON.stringify(pathToFileURL(join(packageRoot, 'dist', 'index.mjs')).href)};
import { createSqliteDatabase } from ${JSON.stringify(pathToFileURL(join(packageRoot, 'dist', 'storage', 'index.mjs')).href)};

const conn = new Connection();
await conn.connect(() => createSqliteDatabase({ name: ${JSON.stringify(dbName)}, filePath: ':memory:', allowMemoryFallback: true }));
if (conn.ready().sqliteBackend !== 'memory') throw new Error('expected memory backend, got ' + conn.ready().sqliteBackend);
if (conn.ready().sqliteStorageInfo.persistent !== false) throw new Error('expected persistent:false');
const schema = new Schema({ name: String });
const User = conn.model(${JSON.stringify(`Bmrx21Volatile${tag}`)}, schema, ${JSON.stringify(`bmrx21vol_${tag}`)});
const count = await User.countDocuments({}).exec();
await conn.disconnect();
if (count !== 0) throw new Error('expected volatile store to reopen empty, got ' + count);
`,
      );
      await runChecked('node', ['reopen-mem.mjs'], { cwd: dir, timeoutMs: 15_000 });
      await cleanupTrackedChildren();
      expect(readdirSync(dir).filter((file) => file.includes(':memory:'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('premium uses the exact file path where available (skipped otherwise)', async () => {
    let premiumAvailable = true;
    try {
      await import('rxdb-premium/plugins/storage-sqlite');
    } catch {
      premiumAvailable = false;
    }
    if (!premiumAvailable) {
      console.warn('[bmrx21] rxdb-premium storage-sqlite unavailable; skipped premium exact-path verification');
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'bmrx21-premium-'));
    try {
      const { createSqliteDatabaseWithLoaders: createWithLoaders } = await import('../src/storage/loader');
      const filePath = join(dir, 'exact.db');
      const db = await createWithLoaders({ name: uniqueDbName('bmrx21premium'), filePath });
      try {
        expect(db.sqliteBackend).toBe('premium');
        expect(db.sqliteStorageInfo).toMatchObject({ persistent: true, filePath });
        expect(readdirSync(dir)).toContain('exact.db');
      } finally {
        await db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('trial-npm uses the prefixed target where available (skipped otherwise)', async () => {
    let npmAvailable = true;
    try {
      const sqlite3Mod: any = await import('sqlite3');
      const sqlite3 = sqlite3Mod?.default ?? sqlite3Mod;
      if (!(typeof sqlite3 === 'function' || typeof sqlite3?.Database === 'function')) npmAvailable = false;
      else {
        // The npm driver's native bindings may be missing even when the
        // package resolves; probe an actual open before claiming coverage.
        await new Promise<void>((resolve, reject) => {
          try {
            const probe = new sqlite3.Database(':memory:', (err: unknown) =>
              err ? reject(err) : probe.close((closeErr: unknown) => (closeErr ? reject(closeErr) : resolve())),
            );
          } catch (cause) {
            reject(cause);
          }
        });
      }
    } catch {
      npmAvailable = false;
    }
    if (!npmAvailable) {
      console.warn('[bmrx21] sqlite3 npm driver unavailable; skipped trial-npm real-driver verification');
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'bmrx21-npm-'));
    try {
      const { Connection, Schema } = await import('../src/index');
      const { createSqliteDatabaseWithLoaders: createWithLoaders } = await import('../src/storage/loader');
      const filePath = join(dir, 'npm.db');
      const dbName = uniqueDbName('bmrx21npm');
      const npmOnlyImport = async (specifier: string) => {
        if (specifier === 'rxdb-premium/plugins/storage-sqlite') {
          throw new Error('premium blocked to force trial-npm (BMRX-21 probe)');
        }
        if (specifier === 'node:sqlite') throw new Error('native blocked to force trial-npm (BMRX-21 probe)');
        return import(specifier);
      };
      const conn = new Connection();
      await conn.connect(() => createWithLoaders({ name: dbName, filePath }, { importModule: npmOnlyImport }));
      try {
        expect(conn.ready().sqliteStorageInfo).toMatchObject({ backend: 'trial-npm', persistent: true });
        const User = conn.model(`Bmrx21Npm_${dbCounter}`, new Schema({ name: String }) as never);
        await (User as any).create({ name: 'Ada' });
        expect(await (User as any).countDocuments().exec()).toBe(1);
      } finally {
        await conn.disconnect();
      }
      const files = readdirSync(dir);
      expect(files.some((file) => file.includes('npm.db'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
