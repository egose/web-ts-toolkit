/**
 * Storage factory helpers for `Connection#connect(factory)`.
 *
 * - `createMemoryDatabase`: in-process memory storage. Default for tests and quick
 *   prototyping. No extra dependencies beyond `rxdb`.
 *
 * - `createSqliteDatabase`: local SQLite. Persistent requests fail closed by
 *   default when no SQLite backend can be opened:
 *
 *   1. **`rxdb-premium`'s `getRxStorageSqlite`** if installed and licensed
 *      (production-grade SQLite: indexed, no doc-limit, fast). Requires
 *      `rxdb-premium` as a peer and its postinstall to succeed with an access token.
 *   2. **`rxdb`'s free trial `getRxStorageSQLiteTrial`** with the **`node:sqlite`
 *      built-in** driver (Node 22+ ships SQLite natively, driven via
 *      `getSQLiteBasicsNodeNative`). Writes a real file on disk but prints a warning
 *      each load and is limited (no indexes, ~500-doc cap, slower). Fine for
 *      prototypes and small local apps.
 *   3. The same trial but with the **`sqlite3` npm driver** in Node, if that npm
 *      package is installed. Same trial limits apply.
 *   4. **`getRxStorageMemory`** only when `allowMemoryFallback: true` is passed.
 *
 * The returned database has `sqliteBackend` and `sqliteStorageInfo` properties so
 * callers can inspect the selected backend and any earlier fallback causes.
 *
 * Both helpers register the RxDB query-builder plugin, which `RxCollectionAdapter`
 * relies on for `.sort()`/`.limit()`. If you wire your own RxDB database via
 * `Connection#connect(myFactory)`, your factory must add it itself:
 *
 * ```ts
 * import { addRxPlugin } from 'rxdb';
 * import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
 * // ... before createRxDatabase(...)
 * await addRxPlugin(RxDBQueryBuilderPlugin);
 * ```
 */
import { createSqliteDatabaseWithLoaders, type CreateSqliteDatabaseOptions, type SqliteDatabase } from './loader';

export {
  SqliteStorageError,
  type CreateSqliteDatabaseOptions,
  type PersistentSqliteBackend,
  type SqliteBackend,
  type SqliteDatabase,
  type SqliteStorageFailure,
  type SqliteStorageInfo,
  type SqliteStorageResolution,
} from './loader';

export async function createMemoryDatabase(opts: { name?: string } = {}): Promise<any> {
  const { createRxDatabase, addRxPlugin } = await import('rxdb');
  const { getRxStorageMemory } = await import('rxdb/plugins/storage-memory');
  const { RxDBQueryBuilderPlugin } = await import('rxdb/plugins/query-builder');
  await addRxPlugin(RxDBQueryBuilderPlugin);
  const db = await createRxDatabase({
    name: opts.name ?? 'mongoose-rxdb-memory-test-' + Math.random().toString(36).slice(2),
    storage: getRxStorageMemory(),
    eventReduce: true,
  });
  return db;
}

export async function createSqliteDatabase(opts: CreateSqliteDatabaseOptions = {}): Promise<SqliteDatabase> {
  return createSqliteDatabaseWithLoaders(opts);
}

export default createMemoryDatabase;
