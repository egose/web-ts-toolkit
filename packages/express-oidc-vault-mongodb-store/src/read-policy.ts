import type { Collection, Db, Document } from 'mongodb';

// Own only the vault collection's read preference. Db/client settings (including
// concerns and BSON options) keep their normal inheritance and caller ownership.
// Transactions also need explicit primary: their defaults come from the client,
// independently of the collection. Do not rely on this fallback inside a txn.
export const primaryCollection = <T extends Document>(db: Db, name: string): Collection<T> =>
  db.collection<T>(name, { readPreference: 'primary' });
