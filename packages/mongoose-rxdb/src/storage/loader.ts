export type SqliteBackend = 'premium' | 'trial-native' | 'trial-npm' | 'memory';
export type PersistentSqliteBackend = Exclude<SqliteBackend, 'memory'>;

export interface CreateSqliteDatabaseOptions {
  name?: string;
  /**
   * SQLite storage target.
   *
   * Backend-specific path contract (BMRX-21):
   *
   * - Premium receives this as the exact SQLite database file path
   *   (`sqliteDatabasePath`).
   * - RxDB trial backends (`trial-native`, `trial-npm`) receive it as
   *   `databaseNamePrefix` and create their own collection-specific files
   *   from that prefix (the prefix plus a `_trial_<databaseName>` suffix,
   *   so the on-disk names differ from the requested path).
   * - `':memory:'` (the default) is volatile-only: trial SQLite backends
   *   cannot use it because RxDB would open an ordinary relative file such
   *   as `:memory:_trial_<databaseName>` instead of SQLite's special
   *   in-memory name. `':memory:'` therefore never reaches a SQLite
   *   backend; it selects genuine RxDB memory storage when
   *   `allowMemoryFallback: true` is passed and is rejected otherwise.
   *   Reported `persistent` is `false` only for the genuine memory
   *   backend; every SQLite backend reports `persistent: true`.
   */
  filePath?: string;
  /**
   * Allow genuine volatile memory storage (`backend: 'memory'`,
   * `persistent: false`).
   *
   * This is required for `filePath: ':memory:'` (the default) and is the
   * opt-in fallback when no SQLite backend can be opened for an explicit
   * file path. Pass it only when data loss is acceptable.
   */
  allowMemoryFallback?: boolean;
}

/**
 * The volatile-only storage target (also the default `filePath`).
 *
 * BMRX-21: never pass this to a SQLite backend. RxDB trial backends treat
 * it as an opaque `databaseNamePrefix` and would open an ordinary relative
 * file named like `:memory:_trial_<databaseName>` — not SQLite's special
 * in-memory database. Only the genuine RxDB memory backend may serve it.
 */
export const MEMORY_FILE_PATH = ':memory:';

export interface SqliteStorageFailure {
  backend: SqliteBackend;
  phase: 'load' | 'open';
  cause: unknown;
}

export interface SqliteStorageInfo {
  backend: SqliteBackend;
  databaseName: string;
  filePath: string;
  persistent: boolean;
  fallbackCauses: SqliteStorageFailure[];
}

export type SqliteDatabase<T = any> = T & {
  sqliteBackend: SqliteBackend;
  sqliteStorageInfo: SqliteStorageInfo;
};

export class SqliteStorageError extends Error {
  readonly causes: SqliteStorageFailure[];
  readonly filePath: string;

  constructor(message: string, filePath: string, causes: SqliteStorageFailure[]) {
    super(message);
    this.name = 'SqliteStorageError';
    this.filePath = filePath;
    this.causes = causes;
    (this as Error & { cause?: unknown }).cause = causes[0]?.cause;
  }
}

export interface SqliteStorageResolution {
  storage: any;
  backend: SqliteBackend;
  causes: SqliteStorageFailure[];
}

export interface StorageLoaderDeps {
  importModule?: (specifier: string) => Promise<any>;
}

export interface CreateDatabaseDeps extends StorageLoaderDeps {
  createRxDatabase?: (opts: { name: string; storage: any; eventReduce: boolean }) => Promise<any>;
  addRxPlugin?: (plugin: any) => Promise<void> | void;
}

const defaultImportModule = (specifier: string): Promise<any> => import(specifier);

export async function resolveSqliteStorage(
  filePath: string,
  opts: { allowMemoryFallback?: boolean } = {},
  deps: StorageLoaderDeps = {},
): Promise<SqliteStorageResolution> {
  const importModule = deps.importModule ?? defaultImportModule;
  const causes: SqliteStorageFailure[] = [];
  // BMRX-21: ':memory:' is volatile-only and never reaches a SQLite backend,
  // where RxDB would treat it as an opaque prefix and open an ordinary file
  // named like ':memory:_trial_<databaseName>'.
  if (filePath === MEMORY_FILE_PATH) {
    if (!opts.allowMemoryFallback) throw new SqliteStorageError(memoryRequestMessage(), filePath, causes);
    return { ...(await loadMemoryBackend(importModule, causes)), causes };
  }
  const resolution = await loadFirstUsableSqliteBackend(filePath, importModule, causes);
  if (resolution) return { ...resolution, causes };
  if (opts.allowMemoryFallback) return { ...(await loadMemoryBackend(importModule, causes)), causes };
  throw new SqliteStorageError(noBackendMessage(filePath), filePath, causes);
}

export async function createSqliteDatabaseWithLoaders(
  opts: CreateSqliteDatabaseOptions = {},
  deps: CreateDatabaseDeps = {},
): Promise<SqliteDatabase> {
  const importModule = deps.importModule ?? defaultImportModule;
  const rxdb = await importModule('rxdb');
  const queryBuilder = await importModule('rxdb/plugins/query-builder');
  const addRxPlugin = deps.addRxPlugin ?? rxdb.addRxPlugin;
  await addRxPlugin(queryBuilder.RxDBQueryBuilderPlugin);

  const databaseName = opts.name ?? 'mongoose-rxdb-sqlite';
  const filePath = opts.filePath ?? MEMORY_FILE_PATH;
  const allowMemoryFallback = opts.allowMemoryFallback === true;
  const causes: SqliteStorageFailure[] = [];
  const createRxDatabase = deps.createRxDatabase ?? rxdb.createRxDatabase;

  // BMRX-21: ':memory:' (explicit or default) is volatile-only. Trial SQLite
  // backends would treat it as an opaque `databaseNamePrefix` and open an
  // ordinary relative file such as `:memory:_trial_<databaseName>` instead
  // of SQLite's special in-memory name, while metadata would still claim
  // `persistent: false`. Never route it to a SQLite backend: select genuine
  // memory storage with explicit opt-in, or reject with guidance.
  if (filePath === MEMORY_FILE_PATH) {
    if (!allowMemoryFallback) throw new SqliteStorageError(memoryRequestMessage(), filePath, causes);
    const resolution = await loadMemoryBackend(importModule, causes);
    let db: any;
    try {
      db = await createRxDatabase({ name: databaseName, storage: resolution.storage, eventReduce: true });
    } catch (cause) {
      causes.push({ backend: 'memory', phase: 'open', cause });
      throw new SqliteStorageError(noBackendMessage(filePath), filePath, causes);
    }
    try {
      await assertSqliteStartup(db);
    } catch (cause) {
      causes.push({ backend: 'memory', phase: 'open', cause });
      await closeFailedDatabase(db, 'memory', causes);
      throw new SqliteStorageError(noBackendMessage(filePath), filePath, causes);
    }
    warnSelectedBackend(resolution.backend, filePath);
    return annotateDatabase(db, {
      backend: resolution.backend,
      databaseName,
      filePath,
      persistent: false,
      fallbackCauses: [...causes],
    });
  }

  for (const candidate of sqliteBackends) {
    const resolution = await loadSqliteBackend(candidate, filePath, importModule, causes);
    if (!resolution) continue;
    let db: any;
    try {
      db = await createRxDatabase({ name: databaseName, storage: resolution.storage, eventReduce: true });
    } catch (cause) {
      causes.push({ backend: resolution.backend, phase: 'open', cause });
      continue;
    }
    try {
      await assertSqliteStartup(db);
    } catch (cause) {
      causes.push({ backend: resolution.backend, phase: 'open', cause });
      await closeFailedDatabase(db, resolution.backend, causes);
      continue;
    }
    warnSelectedBackend(resolution.backend, filePath);
    return annotateDatabase(db, {
      backend: resolution.backend,
      databaseName,
      filePath,
      persistent: filePath !== ':memory:',
      fallbackCauses: [...causes],
    });
  }

  if (allowMemoryFallback) {
    const resolution = await loadMemoryBackend(importModule, causes);
    let db: any;
    try {
      db = await createRxDatabase({ name: databaseName, storage: resolution.storage, eventReduce: true });
    } catch (cause) {
      causes.push({ backend: 'memory', phase: 'open', cause });
      throw new SqliteStorageError(noBackendMessage(filePath), filePath, causes);
    }
    try {
      await assertSqliteStartup(db);
    } catch (cause) {
      causes.push({ backend: 'memory', phase: 'open', cause });
      await closeFailedDatabase(db, 'memory', causes);
      throw new SqliteStorageError(noBackendMessage(filePath), filePath, causes);
    }
    warnSelectedBackend(resolution.backend, filePath);
    return annotateDatabase(db, {
      backend: resolution.backend,
      databaseName,
      filePath,
      persistent: false,
      fallbackCauses: [...causes],
    });
  }

  throw new SqliteStorageError(noBackendMessage(filePath), filePath, causes);
}

const sqliteBackends: PersistentSqliteBackend[] = ['premium', 'trial-native', 'trial-npm'];

async function loadFirstUsableSqliteBackend(
  filePath: string,
  importModule: (specifier: string) => Promise<any>,
  causes: SqliteStorageFailure[],
): Promise<{ storage: any; backend: PersistentSqliteBackend } | undefined> {
  for (const backend of sqliteBackends) {
    const resolution = await loadSqliteBackend(backend, filePath, importModule, causes);
    if (resolution) return resolution;
  }
  return undefined;
}

async function loadSqliteBackend(
  backend: PersistentSqliteBackend,
  filePath: string,
  importModule: (specifier: string) => Promise<any>,
  causes: SqliteStorageFailure[],
): Promise<{ storage: any; backend: PersistentSqliteBackend } | undefined> {
  try {
    if (backend === 'premium') return { backend, storage: await loadPremiumStorage(filePath, importModule) };
    if (backend === 'trial-native') return { backend, storage: await loadTrialNativeStorage(filePath, importModule) };
    return { backend, storage: await loadTrialNpmStorage(filePath, importModule) };
  } catch (cause) {
    causes.push({ backend, phase: 'load', cause });
    return undefined;
  }
}

async function loadPremiumStorage(filePath: string, importModule: (specifier: string) => Promise<any>): Promise<any> {
  const specifier = ['rxdb-premium', 'plugins', 'storage-sqlite'].join('/');
  const mod: any = await importModule(specifier);
  if (typeof mod.getRxStorageSqlite !== 'function') throw new Error('rxdb-premium storage-sqlite export missing');
  return mod.getRxStorageSqlite({ sqliteDatabasePath: filePath });
}

async function loadTrialNativeStorage(
  filePath: string,
  importModule: (specifier: string) => Promise<any>,
): Promise<any> {
  const nodeSqliteSpec = ['node', 'sqlite'].join(':');
  const nodeSqlite = await importModule(nodeSqliteSpec);
  const DatabaseSync = nodeSqlite.DatabaseSync;
  const trialMod: any = await importModule('rxdb/plugins/storage-sqlite');
  if (typeof trialMod.getRxStorageSQLiteTrial !== 'function') throw new Error('RxDB trial SQLite export missing');
  if (typeof trialMod.getSQLiteBasicsNodeNative !== 'function' || typeof DatabaseSync !== 'function') {
    throw new Error('node:sqlite DatabaseSync support missing');
  }
  return trialMod.getRxStorageSQLiteTrial({
    sqliteBasics: trialMod.getSQLiteBasicsNodeNative(DatabaseSync),
    databaseNamePrefix: filePath,
  });
}

async function loadTrialNpmStorage(filePath: string, importModule: (specifier: string) => Promise<any>): Promise<any> {
  const sqlite3Mod: any = await importModule('sqlite3');
  const sqlite3 = sqlite3Mod?.default ?? sqlite3Mod;
  const trialMod: any = await importModule('rxdb/plugins/storage-sqlite');
  if (typeof trialMod.getRxStorageSQLiteTrial !== 'function') throw new Error('RxDB trial SQLite export missing');
  if (typeof trialMod.getSQLiteBasicsNode !== 'function') throw new Error('RxDB sqlite3 basics export missing');
  if (!(typeof sqlite3 === 'function' || (typeof sqlite3 === 'object' && typeof sqlite3.Database === 'function'))) {
    throw new Error('sqlite3 package does not expose Database');
  }
  return trialMod.getRxStorageSQLiteTrial({
    sqliteBasics: trialMod.getSQLiteBasicsNode(sqlite3),
    databaseNamePrefix: filePath,
  });
}

async function loadMemoryBackend(
  importModule: (specifier: string) => Promise<any>,
  causes: SqliteStorageFailure[],
): Promise<{ storage: any; backend: 'memory' }> {
  try {
    const { getRxStorageMemory } = await importModule('rxdb/plugins/storage-memory');
    return { backend: 'memory', storage: getRxStorageMemory() };
  } catch (cause) {
    causes.push({ backend: 'memory', phase: 'load', cause });
    throw new SqliteStorageError(
      'Memory fallback was enabled, but RxDB memory storage could not be loaded.',
      ':memory:',
      causes,
    );
  }
}

function annotateDatabase<T>(db: T, info: SqliteStorageInfo): SqliteDatabase<T> {
  const target = db as SqliteDatabase<T>;
  target.sqliteBackend = info.backend;
  target.sqliteStorageInfo = info;
  return target;
}

/**
 * BMRX-20: establish real backend startup before a database is reported ready.
 *
 * `createRxDatabase()` alone does not prove the storage backend opened: RxDB
 * defers internal-store writes, so a rejecting native open can surface after
 * `createRxDatabase()` has already resolved (the database then records the
 * failure instead of throwing). This helper uses the same supported lifecycle
 * evidence RxDB itself uses in `ensureNoStartupErrors` (invoked on
 * `addCollections`): settle the public `storageToken` promise, which resolves
 * only after the storage backend has been opened for the internal store, then
 * rethrow the first entry of the public `startupErrors` array when present.
 *
 * Supported-version bound: `storageToken: Promise<string>` and
 * `startupErrors: (RxError | RxTypeError)[]` are public members of
 * `RxDatabaseBase` in the supported `rxdb >=17.4.0 <18` range (verified against
 * 17.5.0 by `storage-startup-boundary.test.ts`, which drives real trial-native
 * startup with an intercepted rejecting open). Databases that expose neither
 * member (e.g. loader-seam fakes) are treated as started, preserving the
 * synchronous-rejection contract for immediate `createRxDatabase()` failures.
 */
async function assertSqliteStartup(db: any): Promise<void> {
  const token: unknown = (db as { storageToken?: unknown } | null | undefined)?.storageToken;
  if (token !== null && token !== undefined && typeof (token as PromiseLike<unknown>).then === 'function') {
    try {
      await token;
    } catch {
      // Deferred failures are published on `startupErrors`; fall through and
      // prefer that entry below so the original open cause is preserved.
    }
  }
  const startupErrors: unknown = (db as { startupErrors?: unknown } | null | undefined)?.startupErrors;
  if (Array.isArray(startupErrors) && startupErrors.length > 0) {
    throw startupErrors[0];
  }
}

/**
 * BMRX-20: release a database whose deferred startup failed so failed
 * resources do not leak. A cleanup failure is recorded in the shared cause
 * aggregation (as an `open`-phase entry for that backend) without masking the
 * original startup cause or escaping the fallback loop.
 */
async function closeFailedDatabase(db: any, backend: SqliteBackend, causes: SqliteStorageFailure[]): Promise<void> {
  try {
    if (typeof (db as { close?: unknown } | null | undefined)?.close === 'function') {
      await (db as { close: () => Promise<unknown> }).close();
    }
  } catch (cause) {
    causes.push({ backend, phase: 'open', cause });
  }
}

function warnSelectedBackend(backend: SqliteBackend, filePath: string): void {
  if (backend !== 'memory' && filePath !== ':memory:') {
    console.warn(
      `[mongoose-rxdb] createSqliteDatabase: using ${backend} SQLite at ${filePath}` +
        (backend.startsWith('trial')
          ? ' (limited trial: no indexes, <=500 docs/collection). Install rxdb-premium for production SQLite.'
          : ''),
    );
  } else if (backend === 'memory' && filePath !== ':memory:') {
    console.warn(
      `[mongoose-rxdb] createSqliteDatabase: explicit memory fallback selected for ${filePath}. Data will NOT persist.`,
    );
  }
}

/**
 * BMRX-21: guidance for volatile-only `':memory:'` requests without explicit
 * opt-in. Trial SQLite backends cannot serve `':memory:'` (RxDB would open an
 * ordinary relative file such as `:memory:_trial_<databaseName>`), so callers
 * must choose genuine memory storage explicitly or provide a file path.
 */
function memoryRequestMessage(): string {
  return (
    `Volatile '${MEMORY_FILE_PATH}' storage requires { allowMemoryFallback: true } ` +
    'to select genuine in-memory storage (data will NOT persist). ' +
    'Trial SQLite backends cannot use it: RxDB would open an ordinary relative file ' +
    `such as '${MEMORY_FILE_PATH}_trial_<databaseName>' instead of SQLite's special in-memory name. ` +
    'Pass an explicit filePath for persistent SQLite storage.'
  );
}

function noBackendMessage(filePath: string): string {
  return (
    `No usable SQLite storage backend could be opened for ${filePath}. ` +
    'Install and configure rxdb-premium, use a Node runtime with node:sqlite support, install sqlite3, ' +
    'or pass { allowMemoryFallback: true } to accept volatile memory storage explicitly.'
  );
}
