import { Types, type Document } from 'mongoose';

export type ScalarSnapshot = Readonly<Record<string, unknown>>;

/** Copy BSON storage too: freezing its wrapper does not protect the bytes. */
export function cloneDerivedScalar(value: unknown): unknown {
  if (value instanceof Date) return new Date(value.getTime());
  // Mongoose accepts BSON ObjectIds from other module copies/ESM constructors
  // without recasting them. instanceof alone would leak their mutable storage.
  if (value !== null && typeof value === 'object') {
    const bson = value as { _bsontype?: string; id: Uint8Array; bytes: Uint8Array };
    if (bson._bsontype === 'ObjectId') return new Types.ObjectId(Buffer.from(bson.id));
    if (bson._bsontype === 'Decimal128') return new Types.Decimal128(Buffer.from(bson.bytes));
  }
  return value;
}

export function readDerivedScalar(document: Document, path: string): unknown {
  // populated() retains the persisted id even when population found no document
  // and the hydrated property is now null. Never expose the populated document.
  const id: unknown = document.populated(path);
  return id === undefined ? document.get(path, undefined, { getters: false }) : id;
}

/** No toObject(), defaults application, virtuals, getters, or transforms. */
export function snapshotDerivedInputs(document: Document, paths: readonly string[]): ScalarSnapshot {
  return copyDerivedSnapshot(Object.fromEntries(paths.map((path) => [path, readDerivedScalar(document, path)])));
}

/** Every invocation owns its view and all of its mutable scalar instances. */
export function copyDerivedSnapshot(snapshot: ScalarSnapshot, paths = Object.keys(snapshot)): ScalarSnapshot {
  return Object.freeze(Object.fromEntries(paths.map((path) => [path, cloneDerivedScalar(snapshot[path])])));
}
