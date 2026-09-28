import type { PersistenceRecord } from './rx-adapter';

/** Internal partition boundary; not a package entrypoint. Input IDs must be strings. */
export function partitionBulkInsert(
  docs: PersistenceRecord[],
): Array<{ docs: PersistenceRecord[]; indexes: number[] }> {
  const passes: Array<{ docs: PersistenceRecord[]; indexes: number[] }> = [];
  const occurrences = new Map<string, number>();
  for (let index = 0; index < docs.length; index++) {
    const id = docs[index]._id;
    // This ID already occupies passes 0..occurrence-1, so its next occurrence
    // belongs directly in that numbered pass. One get/set per input record;
    // no scan of earlier passes, even when every record has the same ID.
    const occurrence = occurrences.get(id) ?? 0;
    occurrences.set(id, occurrence + 1);
    const pass = (passes[occurrence] ??= { docs: [], indexes: [] });
    pass.docs.push(docs[index]);
    pass.indexes.push(index);
  }
  return passes;
}
