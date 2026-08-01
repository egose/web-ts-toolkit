/**
 * Storage factory helpers for `Connection#connect(factory)`.
 *
 * - `createMemoryDatabase`: in-process memory storage. Default for tests and quick
 *   prototyping. No extra dependencies beyond `rxdb`.
 *
 * - `createSqliteDatabase`: local SQLite. Resolution order is automatic so consumer
 *   code never crashes in ill-configured environments:
 *
 *   1. **`rxdb-premium`'s `getRxStorageSqlite`** if installed and licensed
 *      (production-grade SQLite: indexed, no doc-limit, fast). Requires
 *      `rxdb-premium` as a peer and its postinstall to succeed with an access token.
 *   2. **`rxdb`'s free trial `getRxStorageSQLiteTrial`** with the **`node:sqlite`
 *      built-in** driver (Node 22+ ships SQLite natively, driven via
 *      `getSQLiteBasicsNodeNative`). Writes a real file on disk but prints a warning
 *      each load and is limited (no indexes, ~500-doc cap, slower). Fine for
 *      prototypes and small local apps.
 *   3. The same trial but with the **`sqlite3` npm driver** (older Node, or non-Node
 *      runtimes), if that npm package is installed. Same trial limits apply.
 *   4. **`getRxStorageMemory`** as a last resort, logged to stderr.
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

export async function createSqliteDatabase(opts: { name?: string; filePath?: string } = {}): Promise<any> {
  const { createRxDatabase, addRxPlugin } = await import('rxdb');
  const { getRxStorageMemory } = await import('rxdb/plugins/storage-memory');
  const { RxDBQueryBuilderPlugin } = await import('rxdb/plugins/query-builder');
  await addRxPlugin(RxDBQueryBuilderPlugin);

  const databaseName = opts.name ?? 'mongoose-rxdb-sqlite';
  const filePath = opts.filePath ?? ':memory:';
  let storage: any;
  let backend: 'premium' | 'trial-native' | 'trial-npm' | 'memory' = 'memory';

  // 1) Premium, installed + licensed.
  if (!storage) {
    try {
      const specifier = ['rxdb-premium', 'plugins', 'storage-sqlite'].join('/');
      const mod: any = await import(specifier);
      if (typeof mod.getRxStorageSqlite === 'function') {
        storage = mod.getRxStorageSqlite({ sqliteDatabasePath: filePath });
        backend = 'premium';
      }
    } catch {
      // premium absent or license unresolved; fall through to the trial path
    }
  }

  // 2) Trial + node:sqlite (Node 22+ built-in, zero installs).
  //    The spec is computed so tsup/esbuild leaves this dynamic import alone (a static
  //    `import('node:sqlite')` would be rewritten to a CJS `require('sqlite')` in the
  //    bundle, which fails on Node's `node:` prefix).
  if (!storage) {
    try {
      const nodeSqliteSpec = ['node', 'sqlite'].join(':');
      const nodeSqlite = await import(nodeSqliteSpec);
      const DatabaseSync = nodeSqlite.DatabaseSync;
      const trialMod: any = await import('rxdb/plugins/storage-sqlite');
      if (typeof trialMod.getSQLiteBasicsNodeNative === 'function' && typeof DatabaseSync === 'function') {
        storage = trialMod.getRxStorageSQLiteTrial({
          sqliteBasics: trialMod.getSQLiteBasicsNodeNative(DatabaseSync),
          databaseNamePrefix: filePath,
        });
        backend = 'trial-native';
      }
    } catch {
      // node:sqlite unavailable in this runtime; fall through to the npm sqlite3 path
    }
  }

  // 3) Trial + sqlite3 npm driver, if installed (older Node / non-Node runtimes).
  if (!storage) {
    try {
      const specifier = 'sqlite3';
      const sqlite3Mod: any = await import(specifier);
      const sqlite3 = sqlite3Mod?.default ?? sqlite3Mod;
      const trialMod: any = await import('rxdb/plugins/storage-sqlite');
      if (typeof sqlite3 === 'function' || (typeof sqlite3 === 'object' && typeof sqlite3.Database === 'function')) {
        storage = trialMod.getRxStorageSQLiteTrial({
          sqliteBasics: trialMod.getSQLiteBasicsNode(sqlite3),
          databaseNamePrefix: filePath,
        });
        backend = 'trial-npm';
      }
    } catch {
      // sqlite3 npm driver not installed; fall through to memory
    }
  }

  // 4) Memory last resort so consumer code never crashes when nothing is wired.
  if (!storage) {
    storage = getRxStorageMemory();
    backend = 'memory';
  }

  if (backend !== 'memory' && filePath !== ':memory:') {
    console.warn(
      `[mongoose-rxdb] createSqliteDatabase: using ${backend} SQLite at ${filePath}` +
        (backend.startsWith('trial')
          ? ' (limited trial: no indexes, <=500 docs/collection). Install rxdb-premium for production SQLite.'
          : ''),
    );
  } else if (backend === 'memory' && filePath !== ':memory:') {
    console.warn(
      `[mongoose-rxdb] createSqliteDatabase: SQLite unavailable (no rxdb-premium, no node:sqlite, no sqlite3 driver); falling back to in-memory storage at ${filePath}. Data will NOT persist.`,
    );
  }

  const db = await createRxDatabase({
    name: databaseName,
    storage,
    eventReduce: true,
  });
  return db;
}

export default createMemoryDatabase;
