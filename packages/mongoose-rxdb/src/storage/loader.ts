export type SqliteBackend = 'premium' | 'trial-native' | 'trial-npm' | 'memory';
export type PersistentSqliteBackend = Exclude<SqliteBackend, 'memory'>;

export interface CreateSqliteDatabaseOptions {
  name?: string;
  /**
   * Persistent SQLite storage target.
   *
   * Premium uses this as the exact SQLite database file path. RxDB trial
   * backends receive it as `databaseNamePrefix` and create their own
   * collection-specific files from that prefix.
   */
  filePath?: string;
  /** Allow volatile memory storage when no SQLite backend can be opened. */
  allowMemoryFallback?: boolean;
}

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
  const filePath = opts.filePath ?? ':memory:';
  const allowMemoryFallback = opts.allowMemoryFallback === true;
  const causes: SqliteStorageFailure[] = [];
  const createRxDatabase = deps.createRxDatabase ?? rxdb.createRxDatabase;

  for (const candidate of sqliteBackends) {
    const resolution = await loadSqliteBackend(candidate, filePath, importModule, causes);
    if (!resolution) continue;
    try {
      const db = await createRxDatabase({ name: databaseName, storage: resolution.storage, eventReduce: true });
      warnSelectedBackend(resolution.backend, filePath);
      return annotateDatabase(db, {
        backend: resolution.backend,
        databaseName,
        filePath,
        persistent: filePath !== ':memory:',
        fallbackCauses: [...causes],
      });
    } catch (cause) {
      causes.push({ backend: resolution.backend, phase: 'open', cause });
    }
  }

  if (allowMemoryFallback) {
    const resolution = await loadMemoryBackend(importModule, causes);
    try {
      const db = await createRxDatabase({ name: databaseName, storage: resolution.storage, eventReduce: true });
      warnSelectedBackend(resolution.backend, filePath);
      return annotateDatabase(db, {
        backend: resolution.backend,
        databaseName,
        filePath,
        persistent: false,
        fallbackCauses: [...causes],
      });
    } catch (cause) {
      causes.push({ backend: 'memory', phase: 'open', cause });
    }
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

function noBackendMessage(filePath: string): string {
  return (
    `No usable SQLite storage backend could be opened for ${filePath}. ` +
    'Install and configure rxdb-premium, use a Node runtime with node:sqlite support, install sqlite3, ' +
    'or pass { allowMemoryFallback: true } to accept volatile memory storage explicitly.'
  );
}
