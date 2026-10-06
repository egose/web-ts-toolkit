import { Document } from 'mongoose';
import { get, isPlainObject, pick, set } from '@web-ts-toolkit/utils';
import { getModelOption } from '../options';
import { SubPopulate } from '../interfaces';
import { normalizeSelect } from './query';
import { isArray, isPromise, isString } from '@web-ts-toolkit/utils';

type DocumentLike = Document & { _doc: Record<string, unknown> };
type DocValue = DocumentLike | Record<string, unknown>;
type LegacyPopulateResult = { execPopulate?: () => Promise<unknown> };

function isDocument(doc: unknown): doc is DocumentLike {
  return doc instanceof Document;
}

export function getDocValue(doc: DocValue, path: string, defaultValue?: unknown) {
  if (isDocument(doc)) {
    return get(doc._doc, path, defaultValue);
  } else if (isPlainObject(doc)) {
    return get(doc, path, defaultValue);
  }
}

export function setDocValue(doc: unknown, path: string, value: unknown) {
  if (isDocument(doc)) {
    set(doc._doc, path, value);
  } else if (isPlainObject(doc)) {
    set(doc, path, value);
  }
}

export function getDocPermissions(modelName: string, doc: unknown): Record<string, unknown> {
  const docPermissionField = getModelOption(modelName, 'documentPermissionField');
  const permissions = getDocValue(doc as DocValue, docPermissionField, {});
  return isPlainObject(permissions) ? permissions : {};
}

/**
 * Reduce the doc permission map to its exposable subset for API responses.
 * Enforcement always uses the full hook map; call this only after all grant
 * computations and decorate hooks have run. `_view`/`_edit` are always kept.
 * No-op unless the `exposedDocPermissionKeys` model option is set (any array,
 * including `[]`, enables it; `undefined` preserves current behavior).
 */
export function stripUnexposedDocPermissions(modelName: string, doc: unknown): void {
  const exposed = getModelOption(modelName, 'exposedDocPermissionKeys') as string[] | undefined;
  if (exposed === undefined) return;
  const docPermissionField = getModelOption(modelName, 'documentPermissionField');
  const current = getDocValue(doc as DocValue, docPermissionField, undefined);
  if (!isPlainObject(current)) return;
  const keep = new Set(['_view', '_edit', ...exposed]);
  setDocValue(doc, docPermissionField, Object.fromEntries(Object.entries(current).filter(([key]) => keep.has(key))));
}

export function toObject<T>(doc: T | DocumentLike): T | Record<string, unknown> {
  return isDocument(doc) ? doc.toObject() : doc;
}

export const isMongooseDocument = (doc: unknown): doc is DocumentLike => isDocument(doc);

/**
 * Clone a mutable leaf without JSON cloning (VIRT-00A D4, VIRT-03).
 *
 * - `Date` → `new Date(t)`, `Buffer` → `Buffer.from`
 * - BSON `ObjectId`/`ObjectID` (detected via `_bsontype` or constructor name)
 *   → dedicated clone preserving equality semantics (`clone()` when available,
 *   otherwise reconstruct via hex string / existing value)
 * - Other BSON leaves with `_bsontype` + `clone()` (Decimal128, Long, …) → `clone()`
 * - Primitives / other objects pass through (plain/array recursion handles the rest)
 */
export const cloneIsolatedLeaf = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value as Buffer)) {
    return Buffer.from(value as Buffer);
  }
  const record = value as Record<string, unknown> & {
    _bsontype?: unknown;
    clone?: unknown;
    toHexString?: unknown;
    constructor?: { name?: string } & (new (...args: never[]) => unknown);
  };
  const bsontype = typeof record._bsontype === 'string' ? record._bsontype : undefined;
  const ctorName = typeof record.constructor?.name === 'string' ? record.constructor.name : '';
  const isObjectId =
    bsontype === 'ObjectId' ||
    bsontype === 'ObjectID' ||
    bsontype === 'ObjectIdLike' ||
    ctorName === 'ObjectId' ||
    ctorName === 'ObjectID';
  if (isObjectId) {
    if (typeof record.clone === 'function') {
      try {
        return (record.clone as () => unknown).call(value);
      } catch {
        // fall through to constructor rebuild
      }
    }
    try {
      const Ctor = record.constructor as unknown as new (...args: never[]) => unknown;
      if (typeof Ctor === 'function') {
        if (typeof record.toHexString === 'function') {
          try {
            return new Ctor((record.toHexString as () => string).call(value) as never);
          } catch {
            // fall through
          }
        }
        return new Ctor(value as never);
      }
    } catch {
      // fall through
    }
    return value;
  }
  if (typeof bsontype === 'string' && typeof record.clone === 'function') {
    try {
      return (record.clone as () => unknown).call(value);
    } catch {
      return value;
    }
  }
  return value;
};

/**
 * Recursively isolate plain objects/arrays by copy (VIRT-00A D4, VIRT-03).
 * Mutable leaves (`Date`/`Buffer`/`ObjectId`/BSON) are cloned via
 * {@link cloneIsolatedLeaf} without JSON cloning. Non-plain, non-BSON objects
 * pass through by reference (their own constructors own equality semantics).
 * Cycles are preserved via a `WeakMap` so shared references stay shared within
 * the isolated copy but never alias the input.
 */
export const deepIsolateValue = <T>(value: T, seen: WeakMap<object, unknown> = new WeakMap()): T => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date || (typeof Buffer !== 'undefined' && Buffer.isBuffer(value as unknown as Buffer))) {
    return cloneIsolatedLeaf(value) as T;
  }
  const record = value as Record<string, unknown> & { _bsontype?: unknown };
  if (
    typeof record._bsontype === 'string' ||
    (value as { constructor?: { name?: string } }).constructor?.name === 'ObjectId' ||
    (value as { constructor?: { name?: string } }).constructor?.name === 'ObjectID'
  ) {
    return cloneIsolatedLeaf(value) as T;
  }
  if (Array.isArray(value)) {
    if (seen.has(value as unknown as object)) return seen.get(value as unknown as object) as T;
    const out: unknown[] = [];
    seen.set(value as unknown as object, out);
    for (const entry of value as unknown[]) out.push(deepIsolateValue(entry, seen));
    return out as T;
  }
  if (isPlainObject(value)) {
    if (seen.has(value as unknown as object)) return seen.get(value as unknown as object) as T;
    const out: Record<string, unknown> = {};
    seen.set(value as unknown as object, out);
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = deepIsolateValue(entry, seen);
    }
    return out as T;
  }
  return value;
};

/**
 * Normalize a lean or hydrated input to an isolated plain-object output
 * (VIRT-03 requirement 2). Hydrated documents go through
 * `toObject({ virtuals: false })` so Mongoose getter virtuals never leak;
 * lean plain objects are recursively isolated. The input (and lifecycle
 * snapshots holding its references) is never mutated and the result never
 * aliases mutable input state.
 */
export const isolateDocForOutput = (doc: unknown): Record<string, unknown> => {
  if (isDocument(doc)) {
    let raw: unknown;
    try {
      raw = (doc as DocumentLike & { toObject: (opts?: unknown) => unknown }).toObject({ virtuals: false });
    } catch {
      raw = (doc as DocumentLike)._doc;
    }
    return deepIsolateValue(raw as Record<string, unknown>);
  }
  return deepIsolateValue((doc ?? {}) as Record<string, unknown>);
};

/** Delete a top-level virtual key from an isolated plain output (no fallback). */
export const unsetIsolatedVirtual = (output: Record<string, unknown>, fieldName: string): void => {
  if (output != null && typeof output === 'object' && fieldName in output) {
    delete (output as Record<string, unknown>)[fieldName];
  }
};

/**
 * Private association/correlated retention (VIRT-03 requirement 3, VIRT-05/06 hook).
 * Raw association values are retained privately keyed by the finalized output
 * object and never attached to the output itself, so getters and serializers
 * see only finalized children.
 */
const retainedAssociations = new WeakMap<object, Record<string, unknown>>();

export const retainRawAssociation = (output: object, key: string, rawIsolated: unknown): void => {
  if (output == null || typeof output !== 'object') return;
  let entry = retainedAssociations.get(output);
  if (!entry) {
    entry = {};
    retainedAssociations.set(output, entry);
  }
  entry[key] = deepIsolateValue(rawIsolated);
};

export const getRetainedAssociations = (output: object): Record<string, unknown> | undefined => {
  if (output == null || typeof output !== 'object') return undefined;
  const entry = retainedAssociations.get(output);
  return entry ? { ...entry } : undefined;
};

export function pickDocFields(doc: unknown, fields: string[] = []) {
  if (isDocument(doc)) {
    doc._doc = pick(doc._doc, fields);
    return doc;
  } else {
    return pick(doc as Record<string, unknown>, fields);
  }
}

export async function populateDoc(doc: Document, target: unknown): Promise<unknown> {
  let p = doc.populate(target as Parameters<Document['populate']>[0]);
  if (isPromise(p)) return p;

  // for backward compatibility, utilize the 'execPopulate' method to populate the target fields.
  return 'execPopulate' in p && (p as LegacyPopulateResult).execPopulate?.();
}

export const normalizeSubPopulate = (
  populate?: SubPopulate | SubPopulate[] | string | string[] | null,
): SubPopulate | SubPopulate[] =>
  isArray(populate)
    ? populate.map((item): SubPopulate => (isString(item) ? { path: item } : item))
    : isString(populate)
      ? { path: populate }
      : (populate ?? []);

export const genSubPopulate = (sub: string, popul?: SubPopulate | SubPopulate[] | string | string[]): SubPopulate[] => {
  if (!popul) return [];

  let populate: (SubPopulate | string)[] = isArray(popul) ? popul : [popul];
  populate = populate.map((p: SubPopulate | string): SubPopulate => {
    const ret: SubPopulate = isString(p)
      ? { path: `${sub}.${p}` }
      : {
          path: `${sub}.${p.path}`,
          select: normalizeSelect(p.select),
        };

    return ret;
  });

  return populate as SubPopulate[];
};
