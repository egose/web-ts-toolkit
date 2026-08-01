/**
 * Storage factory helpers for `Connection#connect(factory)`.
 *
 * - `createMemoryDatabase`: in-process memory storage. Default for tests and quick
 *   prototyping. No extra dependencies beyond `rxdb`.
 *
 * - `createSqliteDatabase`: local SQLite via `rxdb-premium`'s `storage-sqlite`.
 *   rxdb-premium is a licensed, separately-distributed package whose install requires
 *   an access token; if it is not present (or the dynamic import throws), this helper
 *   transparently falls back to memory storage so consumer code never crashes in
 *   environments without premium installed. When you need real SQLite persistence,
 *   install `rxdb-premium`, set the `RXDB_PREMIUM` access token per its docs, and allow
 *   its build scripts in your workspace (e.g. `allowBuilds: { 'rxdb-premium': true }`).
 *
 * The SQLite import is resolved via a computed module specifier so that bundlers and
 * type-checking do not hard-fail when rxdb-premium (an optional peer) is absent.
 */
export async function createMemoryDatabase(opts: { name?: string } = {}): Promise<any> {
  const { createRxDatabase } = await import('rxdb');
  const { getRxStorageMemory } = await import('rxdb/plugins/storage-memory');
  const storage = getRxStorageMemory();
  return await createRxDatabase({
    name: opts.name ?? 'mongoose-rxdb-memory-test-' + Math.random().toString(36).slice(2),
    storage,
    eventReduce: true,
  });
}

export async function createSqliteDatabase(opts: { name?: string; filePath?: string } = {}): Promise<any> {
  const { createRxDatabase } = await import('rxdb');
  const { getRxStorageMemory } = await import('rxdb/plugins/storage-memory');
  let storage: any;
  try {
    const specifier = ['rxdb-premium', 'plugins', 'storage-sqlite'].join('/');
    const mod: any = await import(specifier);
    storage = mod.getRxStorageSqlite({ sqliteDatabasePath: opts.filePath ?? ':memory:' });
  } catch {
    storage = getRxStorageMemory();
  }
  return await createRxDatabase({
    name: opts.name ?? 'mongoose-rxdb-sqlite',
    storage,
    eventReduce: true,
  });
}

export default createMemoryDatabase;
