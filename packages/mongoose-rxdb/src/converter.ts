import type { CompiledPath } from './types';
import type { SchemaLike } from './types';

export interface RxJsonSchema {
  title: string;
  version: number;
  primaryKey: string;
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
  indexes?: string[][];
}

export class WriteNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WriteNormalizationError';
  }
}

export type NormalizedUpdateOperation =
  | { operator: '$set'; path: string; value: any }
  | { operator: '$unset'; path: string }
  | { operator: '$inc' | '$mul' | '$min' | '$max' | '$push' | '$addToSet' | '$pull'; path: string; value: any };

/**
 * BMRX-11 supported storage domain.
 *
 * Storage must be JSON-compatible: `null`, booleans, strings, finite numbers,
 * `Date` (normalized to ISO strings), plain objects with safe keys, and arrays
 * of supported values. `undefined`, functions, symbols, bigints, non-finite
 * numbers, and non-plain objects (class instances, Map/Set, boxed primitives)
 * are rejected with `WriteNormalizationError` instead of relying on
 * `JSON.stringify` to silently drop or coerce them.
 *
 * Policy:
 * - Top-level schema fields holding `undefined` are treated as absent (the key
 *   is omitted) so `toObject()` round-trips stay clean; nested `undefined`
 *   inside mixed/plain objects or arrays is rejected.
 * - `Date` inside mixed/plain values is normalized to an ISO string, matching
 *   typed date storage and BMRX-10 array equality.
 * - Cyclic references are rejected; recursion is bounded by
 *   `MAX_STORAGE_DEPTH`/`MAX_STORAGE_NODES` so hostile inputs fail with a
 *   controlled error instead of a stack overflow. The limits are generous for
 *   documented data (50 levels, 2000 nodes).
 */
export const MAX_STORAGE_DEPTH = 50;
export const MAX_STORAGE_NODES = 2000;

export interface NormalizedUpdatePlan {
  replacement: boolean;
  operations: NormalizedUpdateOperation[];
}

const DANGEROUS_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const RXDB_METADATA_PATHS = new Set(['_rev', '_meta', '_attachments', '_deleted']);

export function convertToRxJsonSchema(
  name: string,
  schema: SchemaLike,
  opts: { primaryKey?: string; additionalIndexes?: string[][] } = {},
): RxJsonSchema {
  const primaryKey = opts.primaryKey ?? '_id';
  const compiled = schema.getCompiledSchema?.();
  const properties: Record<string, any> = {
    [primaryKey]: { type: 'string', maxLength: 100 },
  };
  const required: string[] = compiled ? [...compiled.required] : [];

  if (compiled) {
    for (const [name, prop] of Object.entries(compiled.rxProperties)) {
      properties[name] = cloneValue(prop);
      const path = schema.paths.get(name);
      if (path?.options.immutable) properties[name] = { ...properties[name], immutable: true };
    }
  } else {
    for (const [, path] of schema.paths) {
      if (path.options.immutable) properties[path.name] = { ...properties[path.name], immutable: true };
      properties[path.name] = rxPropertyFor(path, properties[path.name]);

      if (isPathRequired(path)) {
        required.push(path.name);
      }
    }
  }

  const out: RxJsonSchema = {
    title: name.toLowerCase(),
    version: 0,
    primaryKey,
    type: 'object',
    properties,
    indexes:
      opts.additionalIndexes ?? (compiled ? compiled.indexes.map((index) => [...index]) : defaultIndexes(schema)),
  };
  if (required.length) out.required = required;
  return out;
}

function rxPropertyFor(path: CompiledPath, existing: any = {}): any {
  switch (path.type) {
    case 'string':
      return { type: 'string', ...existing };
    case 'number':
      return { type: 'number', ...existing };
    case 'boolean':
      return { type: 'boolean', ...existing };
    case 'date':
      return { type: 'string', format: 'date-time', ...existing, maxLength: 50 };
    case 'array':
      return {
        type: 'array',
        items: path.subSchema
          ? { type: 'object', properties: path.subSchema.paths.size ? schemaPropsToRx(path.subSchema) : {} }
          : primitiveItemschema(path.arrayItemType),
        ...existing,
      };
    case 'object':
      return path.subSchema
        ? { type: 'object', properties: schemaPropsToRx(path.subSchema), ...existing }
        : { type: 'object', ...existing };
    default:
      return { type: ['string', 'number', 'boolean', 'object', 'array', 'null'], ...existing };
  }
}

function primitiveItemschema(t?: string): any {
  switch (t) {
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return { type: 'string', format: 'date-time' };
    default:
      return { type: 'string' };
  }
}

function schemaPropsToRx(schema: SchemaLike): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [n, p] of schema.paths) out[n] = rxPropertyFor(p);
  return out;
}

/**
 * BMRX-14 static required policy (mirrors `schema.ts`).
 *
 * Function-valued `required` (including `[fn, message]`) is evaluated
 * dynamically by document validation and must never become an unconditional
 * RxDB storage requirement.
 */
function isPathRequired(path: CompiledPath): boolean {
  const req = path.options.required;
  if (Array.isArray(req)) {
    const first = req[0];
    if (typeof first === 'function') return false;
    return !!first;
  }
  if (typeof req === 'function') return false;
  return !!req;
}

function defaultIndexes(schema: SchemaLike): string[][] {
  const out: string[][] = [];
  for (const [, p] of schema.paths) {
    if (p.options.index === true) out.push([p.name]);
  }
  return out;
}

export function castDocumentToSchema(doc: any, schema: SchemaLike, opts: { applyDefaults?: boolean } = {}): any {
  if (doc == null) return doc;
  if (Array.isArray(doc)) return doc.map((d) => castDocumentToSchema(d, schema, opts));
  const out: any = { ...doc };
  for (const [name, path] of schema.paths) {
    if (!(name in out)) {
      if (opts.applyDefaults !== false && path.options.default !== undefined) {
        const rawDefault =
          typeof path.options.default === 'function' ? path.options.default() : cloneValue(path.options.default);
        out[name] = castValue(rawDefault, path, opts);
      }
      continue;
    }
    out[name] = castValue(out[name], path, opts);
  }
  return out;
}

export function documentToStorage(
  doc: any,
  schema: SchemaLike,
  opts: { applyDefaults?: boolean; allowId?: boolean } = {},
): any {
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new WriteNormalizationError('Document write value must be an object');
  }
  const out: any = Object.create(null);
  for (const key of Object.keys(doc)) assertWritableInputPath(key, schema, opts.allowId === true);
  if (opts.allowId && (doc as any)._id !== undefined) out._id = normalizeId((doc as any)._id);

  for (const [name, path] of schema.paths) {
    if (hasOwn(doc, name)) {
      const raw = (doc as any)[name];
      if (raw === undefined) continue;
      out[name] = valueToStorage(raw, path, { applyDefaults: opts.applyDefaults });
    } else if (opts.applyDefaults && path.options.default !== undefined) {
      const value = typeof path.options.default === 'function' ? path.options.default() : path.options.default;
      out[name] = valueToStorage(value, path, { applyDefaults: opts.applyDefaults });
    }
  }
  return out;
}

export function storageToDocument(doc: any, schema: SchemaLike): any {
  if (doc == null) return doc;
  if (Array.isArray(doc)) return doc.map((entry) => storageToDocument(entry, schema));
  const out: any = Object.create(null);
  if ((doc as any)._id !== undefined) out._id = (doc as any)._id;
  for (const [name, path] of schema.paths) {
    if (hasOwn(doc, name)) out[name] = valueFromStorage((doc as any)[name], path);
  }
  return out;
}

export function normalizeUpdatePlan(
  update: any,
  schema: SchemaLike,
  opts: { allowImmutable?: boolean } = {},
): NormalizedUpdatePlan {
  if (update == null || typeof update !== 'object' || Array.isArray(update)) {
    throw new WriteNormalizationError('Update must be an object');
  }
  const entries = Object.entries(update as Record<string, any>);
  const operatorEntries = entries.filter(([key]) => key.startsWith('$'));
  if (operatorEntries.length === 0) return normalizeReplacementUpdate(update, schema, opts.allowImmutable === true);
  if (operatorEntries.length !== entries.length) {
    throw new WriteNormalizationError('Update cannot mix operators with replacement fields');
  }

  const allowImmutable = opts.allowImmutable === true;
  const operations: NormalizedUpdateOperation[] = [];
  for (const [operator, rawOperand] of operatorEntries) {
    assertKnownUpdateOperator(operator);
    if (!isPlainObject(rawOperand)) throw new WriteNormalizationError(`${operator} requires an object operand`);
    for (const [rawPath, rawValue] of Object.entries(rawOperand as Record<string, any>)) {
      const resolved = resolveWritablePath(rawPath, schema, false, allowImmutable);
      switch (operator) {
        case '$set':
          operations.push({
            operator,
            path: rawPath,
            value: valueToStorage(rawValue, resolved.path, { applyDefaults: false }),
          });
          break;
        case '$unset':
          if (isBareArrayElementPath(rawPath, schema)) {
            throw new WriteNormalizationError(
              `$unset for ${rawPath} is not supported on an array index; use $pull to remove elements`,
            );
          }
          operations.push({ operator, path: rawPath });
          break;
        case '$inc':
        case '$mul':
          assertPathType(rawPath, resolved.path, 'number', operator);
          if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
            throw new WriteNormalizationError(`${operator} for ${rawPath} requires a finite number operand`);
          }
          operations.push({ operator, path: rawPath, value: rawValue });
          break;
        case '$min':
        case '$max':
          if (resolved.path.type !== 'number' && resolved.path.type !== 'date') {
            throw new WriteNormalizationError(`${operator} is only supported for number and date paths: ${rawPath}`);
          }
          operations.push({
            operator,
            path: rawPath,
            value: valueToStorage(rawValue, resolved.path, { applyDefaults: false }),
          });
          break;
        case '$push':
        case '$addToSet':
        case '$pull':
          if (!resolved.path.isArray)
            throw new WriteNormalizationError(`${operator} is only supported for array paths: ${rawPath}`);
          assertNoArrayOperatorForm(rawValue, operator, rawPath);
          operations.push({
            operator,
            path: rawPath,
            value: arrayItemToStorage(rawValue, resolved.path, { applyDefaults: false }),
          });
          break;
      }
    }
  }
  return { replacement: false, operations };
}

export function applyNormalizedUpdate(
  doc: any,
  plan: NormalizedUpdatePlan,
  schema: SchemaLike,
  opts: { skipImmutableCheck?: boolean } = {},
): any {
  const before = existingStorageToWritableRecord(doc ?? {}, schema);
  const out = existingStorageToWritableRecord(doc ?? {}, schema);
  if (plan.replacement) {
    const replacement = Object.create(null);
    if ((doc as any)?._id !== undefined) replacement._id = normalizeId((doc as any)._id);
    for (const operation of plan.operations)
      if ('value' in operation) setDottedValue(replacement, operation.path, operation.value);
    if (!opts.skipImmutableCheck) assertImmutablePreserved(before, replacement, schema);
    return replacement;
  }
  for (const operation of plan.operations) {
    switch (operation.operator) {
      case '$set':
        setDottedValue(out, operation.path, operation.value);
        break;
      case '$unset':
        unsetDottedValue(out, operation.path);
        break;
      case '$inc':
      case '$mul': {
        const rawCurrent = getDottedValue(out, operation.path);
        const base = rawCurrent === undefined || rawCurrent === null ? 0 : rawCurrent;
        if (typeof base !== 'number' || !Number.isFinite(base)) {
          throw new WriteNormalizationError(
            `${operation.operator} for ${operation.path} requires a finite number value`,
          );
        }
        const result = operation.operator === '$inc' ? base + operation.value : base * operation.value;
        if (!Number.isFinite(result)) {
          throw new WriteNormalizationError(
            `${operation.operator} for ${operation.path} overflowed to a non-finite number`,
          );
        }
        setDottedValue(out, operation.path, result);
        break;
      }
      case '$min': {
        const current = getDottedValue(out, operation.path);
        if (current === undefined || operation.value < current) setDottedValue(out, operation.path, operation.value);
        break;
      }
      case '$max': {
        const current = getDottedValue(out, operation.path);
        if (current === undefined || operation.value > current) setDottedValue(out, operation.path, operation.value);
        break;
      }
      case '$push': {
        const current = getDottedValue(out, operation.path);
        setDottedValue(out, operation.path, Array.isArray(current) ? [...current, operation.value] : [operation.value]);
        break;
      }
      case '$addToSet': {
        const current = getDottedValue(out, operation.path);
        const arr = Array.isArray(current) ? current : [];
        setDottedValue(
          out,
          operation.path,
          arr.some((item) => storageDeepEqual(item, operation.value)) ? arr : [...arr, operation.value],
        );
        break;
      }
      case '$pull': {
        const current = getDottedValue(out, operation.path);
        if (Array.isArray(current))
          setDottedValue(
            out,
            operation.path,
            current.filter((item) => !storageDeepEqual(item, operation.value)),
          );
        break;
      }
    }
  }
  if (!opts.skipImmutableCheck) assertImmutablePreserved(before, out, schema);
  return out;
}

function existingStorageToWritableRecord(doc: any, schema: SchemaLike): any {
  const out: any = Object.create(null);
  if ((doc as any)._id !== undefined) out._id = normalizeId((doc as any)._id);
  for (const [name, path] of schema.paths) {
    if (hasOwn(doc, name)) {
      const raw = (doc as any)[name];
      if (raw === undefined) continue;
      out[name] = valueToStorage(raw, path);
    }
  }
  return out;
}

/**
 * BMRX-09 existing-record immutable enforcement.
 *
 * Compares the storage-normalized before/after records and rejects any change
 * to an immutable descendant, including changes smuggled through a parent
 * `$set`/`$unset`, a plain (replacement-style) update, or a loaded-document
 * save. Inserts bypass this check (insertion permission): `documentToStorage`
 * remains insert-permissive and `applyNormalizedUpdate` callers pass
 * `skipImmutableCheck` only when constructing a brand-new record (upsert
 * insert fallback). Top-level and directly addressed nested immutable paths
 * are additionally rejected during normalization; this comparison is the one
 * consistent enforcement point for parent and plain-update writes.
 *
 * Subdocument arrays are compared element-wise: overlapping indexes must keep
 * immutable descendants equal, appended elements are treated as new-subdocument
 * initialization and allowed, and removed elements reject when they carried a
 * defined immutable value.
 */
export function assertImmutablePreserved(before: any, after: any, schema: SchemaLike, basePath = ''): void {
  for (const [name, path] of schema.paths) {
    const fullPath = basePath ? `${basePath}.${name}` : name;
    const beforeValue = before?.[name];
    const afterValue = after?.[name];
    if (path.options.immutable) {
      if (!storageDeepEqual(beforeValue, afterValue)) {
        throw new WriteNormalizationError(`Cannot modify immutable path ${fullPath}`);
      }
      continue;
    }
    if (!path.subSchema) continue;
    if (path.isArray) {
      assertImmutableArrayPreserved(beforeValue, afterValue, path, fullPath);
      continue;
    }
    if (beforeValue === undefined && afterValue === undefined) continue;
    assertImmutablePreserved(
      isRecordLike(beforeValue) ? beforeValue : Object.create(null),
      isRecordLike(afterValue) ? afterValue : Object.create(null),
      path.subSchema,
      fullPath,
    );
  }
}

function assertImmutableArrayPreserved(beforeValue: any, afterValue: any, path: CompiledPath, fullPath: string): void {
  const subSchema = path.subSchema!;
  const beforeArr = Array.isArray(beforeValue) ? beforeValue : beforeValue === undefined ? [] : [beforeValue];
  const afterArr = Array.isArray(afterValue) ? afterValue : afterValue === undefined ? [] : [afterValue];
  const overlap = Math.min(beforeArr.length, afterArr.length);
  for (let index = 0; index < overlap; index++) {
    const beforeEntry = beforeArr[index];
    const afterEntry = afterArr[index];
    if (storageDeepEqual(beforeEntry, afterEntry)) continue;
    if (!isRecordLike(beforeEntry) || !isRecordLike(afterEntry)) {
      throw new WriteNormalizationError(`Cannot modify immutable path ${fullPath}.${index}`);
    }
    assertImmutablePreserved(beforeEntry, afterEntry, subSchema, `${fullPath}.${index}`);
  }
  for (let index = overlap; index < beforeArr.length; index++) {
    if (subdocHasImmutableValue(beforeArr[index], subSchema)) {
      throw new WriteNormalizationError(`Cannot modify immutable path ${fullPath}.${index}`);
    }
  }
}

function subdocHasImmutableValue(value: any, schema: SchemaLike): boolean {
  if (value === undefined || value === null) return false;
  for (const [name, path] of schema.paths) {
    const entry = isRecordLike(value) ? value[name] : undefined;
    if (path.options.immutable) {
      if (entry !== undefined) return true;
      continue;
    }
    if (!path.subSchema || entry === undefined || entry === null) continue;
    if (path.isArray) {
      const arr = Array.isArray(entry) ? entry : [entry];
      if (arr.some((item) => subdocHasImmutableValue(item, path.subSchema!))) return true;
      continue;
    }
    if (isRecordLike(entry) && subdocHasImmutableValue(entry, path.subSchema)) return true;
  }
  return false;
}

function isRecordLike(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function storageDeepEqual(left: any, right: any): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  }
  if (!isRecordLike(left) || !isRecordLike(right)) {
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      return left.every((entry, index) => storageDeepEqual(entry, right[index]));
    }
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index++) {
    if (leftKeys[index] !== rightKeys[index] || !storageDeepEqual(left[leftKeys[index]], right[rightKeys[index]])) {
      return false;
    }
  }
  return true;
}

export function castValue(value: any, path: CompiledPath, opts: { applyDefaults?: boolean } = {}): any {
  if (value === undefined || value === null) return value;
  if (path.isArray) {
    if (!Array.isArray(value))
      return [castValue(value, { ...path, isArray: false, type: path.arrayItemType ?? 'mixed' }, opts)];
    const itemPath: CompiledPath = {
      ...path,
      name: `${path.name}[]`,
      isArray: false,
      type: path.arrayItemType ?? 'mixed',
    };
    return value.map((v) =>
      path.subSchema ? castDocumentToSchema(v, path.subSchema, opts) : castValue(v, itemPath, opts),
    );
  }
  switch (path.type) {
    case 'string':
      return typeof value === 'string' ? value : String(value);
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? n : value;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 1 || value === '1') return true;
      if (value === 'false' || value === 0 || value === '0') return false;
      return Boolean(value);
    case 'date':
      return value instanceof Date ? value : new Date(value);
    case 'object':
      if (path.subSchema) return castDocumentToSchema(value, path.subSchema, opts);
      return value;
    default:
      return value;
  }
}

function normalizeReplacementUpdate(update: any, schema: SchemaLike, allowImmutable: boolean): NormalizedUpdatePlan {
  for (const key of Object.keys(update)) resolveWritablePath(key, schema, false, allowImmutable);
  const storage = documentToStorage(update, schema, { applyDefaults: false, allowId: false });
  const operations = Object.keys(storage).map((path) => ({ operator: '$set' as const, path, value: storage[path] }));
  return { replacement: false, operations };
}

function valueToStorage(value: any, path: CompiledPath, opts: { applyDefaults?: boolean } = {}): any {
  if (value === null) return null;
  if (value === undefined) {
    throw new WriteNormalizationError(`Path ${path.name} does not support undefined; omit the field or use null`);
  }
  const nestedDefaults = opts.applyDefaults === true;
  if (path.isArray) {
    if (!Array.isArray(value)) return [arrayItemToStorage(value, path, { applyDefaults: opts.applyDefaults })];
    return value.map((entry) => arrayItemToStorage(entry, path, { applyDefaults: opts.applyDefaults }));
  }
  switch (path.type) {
    case 'string': {
      if (typeof value === 'string') return value;
      if (typeof value === 'symbol' || typeof value === 'function') {
        throw new WriteNormalizationError(`Path ${path.name} requires a string-compatible value`);
      }
      try {
        return String(value);
      } catch {
        throw new WriteNormalizationError(`Path ${path.name} requires a string-compatible value`);
      }
    }
    case 'number': {
      let n: number;
      try {
        n = typeof value === 'number' ? value : Number(value);
      } catch {
        throw new WriteNormalizationError(`Path ${path.name} requires a finite number`);
      }
      if (!Number.isFinite(n)) throw new WriteNormalizationError(`Path ${path.name} requires a finite number`);
      return n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 1 || value === '1') return true;
      if (value === 'false' || value === 0 || value === '0') return false;
      return Boolean(value);
    case 'date':
      return dateToStorage(value, path.name);
    case 'object':
      if (path.subSchema)
        return documentToStorage(value, path.subSchema, { applyDefaults: nestedDefaults, allowId: false });
      return cloneSafePlain(value, path.name);
    case 'mixed':
      return cloneSafePlain(value, path.name);
    default:
      return value;
  }
}

/**
 * BMRX-10 array element equality and operand policy.
 *
 * `$addToSet` deduplicates and `$pull` removes by `storageDeepEqual` over the
 * storage-normalized element (primitives by value, Date elements by their ISO
 * string, plain objects/arrays structurally with key-order-insensitive object
 * comparison). `$push`/`$addToSet`/`$pull` accept only whole-array paths and a
 * single literal element; Mongo-style operator/predicate forms (`$each`,
 * `$elemMatch`, `$position`, `$slice`, `$sort`, positional `$`, etc.) are
 * rejected explicitly and never interpreted. Object/array operands on primitive
 * scalar arrays are rejected instead of being stringified.
 */
function assertNoArrayOperatorForm(value: any, operator: string, pathName: string): void {
  if (isPlainObject(value) && Object.keys(value).some((key) => key.startsWith('$'))) {
    throw new WriteNormalizationError(
      `${operator} for ${pathName} does not support operator or predicate forms; pass a single literal array element`,
    );
  }
}

function arrayItemToStorage(value: any, path: CompiledPath, opts: { applyDefaults?: boolean } = {}): any {
  if (path.subSchema) {
    if (Array.isArray(value)) {
      throw new WriteNormalizationError(
        `Array element for ${path.name} must be a single subdocument object, not an array`,
      );
    }
    return documentToStorage(value, path.subSchema, {
      applyDefaults: opts.applyDefaults === true,
      allowId: false,
    });
  }
  const itemType = path.arrayItemType ?? 'mixed';
  if (itemType !== 'mixed' && itemType !== 'object' && itemType !== 'array') {
    if (value !== null && value !== undefined && typeof value === 'object' && !(value instanceof Date)) {
      throw new WriteNormalizationError(
        `Array element for ${path.name} requires a ${itemType} value, not an object or array`,
      );
    }
    if (Array.isArray(value)) {
      throw new WriteNormalizationError(`Array element for ${path.name} must be a single ${itemType} value`);
    }
  }
  if (Array.isArray(value) && itemType !== 'mixed' && itemType !== 'array') {
    throw new WriteNormalizationError(`Array element for ${path.name} must be a single value, not an array`);
  }
  const itemPath: CompiledPath = {
    ...path,
    name: `${path.name}[]`,
    isArray: false,
    type: itemType,
  };
  return valueToStorage(value, itemPath, { applyDefaults: opts.applyDefaults });
}

function isArrayIndexSegment(segment: string): boolean {
  return /^(0|[1-9]\d*)$/.test(segment);
}

function valueFromStorage(value: any, path: CompiledPath): any {
  if (value === undefined || value === null) return value;
  if (path.isArray) {
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((entry) => arrayItemFromStorage(entry, path));
  }
  if (path.type === 'date') return value instanceof Date ? value : new Date(value);
  if (path.type === 'object' && path.subSchema) return storageToDocument(value, path.subSchema);
  return cloneValue(value);
}

function arrayItemFromStorage(value: any, path: CompiledPath): any {
  if (path.subSchema) return storageToDocument(value, path.subSchema);
  const itemPath: CompiledPath = {
    ...path,
    name: `${path.name}[]`,
    isArray: false,
    type: path.arrayItemType ?? 'mixed',
  };
  return valueFromStorage(value, itemPath);
}

function dateToStorage(value: any, pathName: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new WriteNormalizationError(`Path ${pathName} requires a valid date`);
  return date.toISOString();
}

function assertWritableInputPath(pathName: string, schema: SchemaLike, allowId: boolean): void {
  resolveWritablePath(pathName, schema, allowId, true);
}

function resolveWritablePath(
  pathName: string,
  schema: SchemaLike,
  allowId: boolean,
  allowImmutable = false,
): { path: CompiledPath; segments: string[] } {
  const segments = splitPath(pathName);
  if (pathName === '_id') {
    if (allowId)
      return {
        path: { name: '_id', type: 'string', options: {}, definition: String, nested: false, isArray: false },
        segments,
      };
    throw new WriteNormalizationError('Cannot modify immutable primary key path _id');
  }
  if (RXDB_METADATA_PATHS.has(segments[0]))
    throw new WriteNormalizationError(`Cannot modify RxDB metadata path ${segments[0]}`);

  const direct = schema.paths.get(pathName);
  if (direct) return assertMutable(pathName, direct, segments, allowImmutable);

  const root = schema.paths.get(segments[0]);
  if (!root) throw new WriteNormalizationError(`Unknown schema path: ${pathName}`);
  if (!allowImmutable && root.options.immutable)
    throw new WriteNormalizationError(`Cannot modify immutable path ${segments[0]}`);
  if (segments.length === 1) return { path: root, segments };
  if (root.isArray) {
    return resolveArrayTraversal(pathName, segments, root, allowImmutable);
  }
  if (root.subSchema) {
    const nestedPath = segments.slice(1).join('.');
    const nested = resolveWritablePath(nestedPath, root.subSchema, false, allowImmutable);
    return { path: { ...nested.path, name: pathName }, segments };
  }
  if (root.type === 'object' || root.type === 'mixed')
    return { path: { ...root, name: pathName, type: 'mixed', isArray: false }, segments };
  throw new WriteNormalizationError(`Path ${pathName} is not a nested object path`);
}

/**
 * BMRX-10 safe array update paths.
 *
 * Ambiguous non-indexed traversal through an array (for example `items.n` on a
 * subdocument array) is rejected: it cannot name a single element and the old
 * writer replaced the array with a plain object. Only explicit canonical
 * indexes (`items.0.n`, `tags.0`) are accepted:
 * - `arr` addresses the whole array.
 * - `arr.<index>` addresses one existing element (validated against the item
 *   type; `$unset` on a bare index is rejected to avoid holes — use `$pull`).
 * - `arr.<index>.<field...>` addresses a field inside one subdocument element.
 * Scalar array elements have no deeper fields; anything beyond the index is
 * rejected. Positional/Mongoose predicate operators (`$`, `$[]`, `$elemMatch`)
 * are not supported and are rejected as unknown paths/operators, never added
 * silently.
 */
function resolveArrayTraversal(
  pathName: string,
  segments: string[],
  root: CompiledPath,
  allowImmutable: boolean,
): { path: CompiledPath; segments: string[] } {
  const indexSegment = segments[1];
  if (!isArrayIndexSegment(indexSegment)) {
    throw new WriteNormalizationError(
      `Ambiguous array path ${pathName}: use an explicit index such as ${segments[0]}.0` +
        (segments.length > 1 ? `.${segments.slice(1).join('.')}` : ''),
    );
  }
  if (segments.length === 2) {
    if (pathName.includes('$')) throw new WriteNormalizationError(`Unsupported array path: ${pathName}`);
    return { path: arrayElementPath(pathName, root), segments };
  }
  if (!root.subSchema) {
    throw new WriteNormalizationError(`Path ${pathName} does not address a nested field of an array element`);
  }
  const nestedPath = segments.slice(2).join('.');
  const nested = resolveWritablePath(nestedPath, root.subSchema, false, allowImmutable);
  if (nested.path.isArray) {
    return { path: { ...nested.path, name: pathName }, segments };
  }
  return { path: { ...nested.path, name: pathName }, segments };
}

function arrayElementPath(pathName: string, root: CompiledPath): CompiledPath {
  if (root.subSchema) {
    return {
      name: pathName,
      type: 'object',
      options: {},
      definition: root.definition,
      nested: false,
      isArray: false,
      subSchema: root.subSchema,
    };
  }
  return {
    ...root,
    name: pathName,
    isArray: false,
    type: root.arrayItemType ?? 'mixed',
    subSchema: undefined,
  };
}

function assertMutable(
  pathName: string,
  path: CompiledPath,
  segments: string[],
  allowImmutable: boolean,
): { path: CompiledPath; segments: string[] } {
  if (!allowImmutable && path.options.immutable)
    throw new WriteNormalizationError(`Cannot modify immutable path ${pathName}`);
  return { path, segments };
}

function splitPath(pathName: string): string[] {
  if (typeof pathName !== 'string' || pathName.length === 0)
    throw new WriteNormalizationError('Write path must be a non-empty string');
  const segments = pathName.split('.');
  for (const segment of segments) {
    if (!segment) throw new WriteNormalizationError(`Invalid dotted path: ${pathName}`);
    if (DANGEROUS_PATH_SEGMENTS.has(segment))
      throw new WriteNormalizationError(`Dangerous write path segment is not allowed: ${segment}`);
  }
  return segments;
}

function assertKnownUpdateOperator(operator: string): asserts operator is NormalizedUpdateOperation['operator'] {
  switch (operator) {
    case '$set':
    case '$unset':
    case '$inc':
    case '$mul':
    case '$min':
    case '$max':
    case '$push':
    case '$addToSet':
    case '$pull':
      return;
    default:
      throw new WriteNormalizationError(`Unsupported update operator: ${operator}`);
  }
}

function assertPathType(pathName: string, path: CompiledPath, type: CompiledPath['type'], operator: string): void {
  if (path.type !== type || path.isArray)
    throw new WriteNormalizationError(`${operator} is only supported for ${type} paths: ${pathName}`);
}

/**
 * BMRX-10 container-preserving dotted access.
 *
 * Traversal never implicitly converts an array into an object or vice versa:
 * - stepping through an array requires a canonical index segment, otherwise a
 *   `WriteNormalizationError` is thrown (this is what previously turned
 *   `items` into `{ n: 3 }`);
 * - stepping through a missing/primitive container throws on `$set`/arithmetic
 *   (so typos cannot fabricate structure) and is a no-op read for `$unset`;
 * - `$set` to an out-of-bounds index throws instead of creating holes;
 * - `$unset` on a bare array index throws (use `$pull`); unsetting a missing
 *   nested path is a no-op.
 */
function setDottedValue(target: any, pathName: string, value: any): void {
  const segments = splitPath(pathName);
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const next = segments[i + 1];
    if (Array.isArray(cursor)) {
      if (!isArrayIndexSegment(segment)) {
        throw new WriteNormalizationError(
          `Ambiguous array path ${pathName}: use an explicit index instead of ${segment}`,
        );
      }
      const index = Number(segment);
      if (!hasOwn(cursor, segment) || index >= cursor.length) {
        throw new WriteNormalizationError(`Array index out of bounds: ${pathName}`);
      }
      const child = cursor[index];
      if (child == null || typeof child !== 'object') {
        throw new WriteNormalizationError(`Cannot traverse non-object array element: ${pathName}`);
      }
      if (Array.isArray(child)) {
        if (!isArrayIndexSegment(next)) {
          throw new WriteNormalizationError(
            `Ambiguous array path ${pathName}: use an explicit index instead of ${next}`,
          );
        }
      } else if (!isPlainObject(child)) {
        throw new WriteNormalizationError(`Cannot traverse non-object array element: ${pathName}`);
      }
      cursor = child;
      continue;
    }
    if (!isPlainObject(cursor)) {
      throw new WriteNormalizationError(`Cannot traverse non-object value: ${pathName}`);
    }
    const child = cursor[segment];
    if (Array.isArray(child)) {
      if (!isArrayIndexSegment(next)) {
        throw new WriteNormalizationError(`Ambiguous array path ${pathName}: use an explicit index instead of ${next}`);
      }
      cursor = child;
      continue;
    }
    if (child == null || typeof child !== 'object') {
      if (child !== undefined && child !== null) {
        throw new WriteNormalizationError(`Cannot traverse non-object value: ${pathName}`);
      }
      cursor[segment] = Object.create(null);
      cursor = cursor[segment];
      continue;
    }
    if (!isPlainObject(child)) {
      throw new WriteNormalizationError(`Cannot traverse non-object value: ${pathName}`);
    }
    cursor = child;
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(cursor)) {
    if (!isArrayIndexSegment(last)) {
      throw new WriteNormalizationError(`Ambiguous array path ${pathName}: use an explicit index instead of ${last}`);
    }
    const index = Number(last);
    if (index > cursor.length) {
      throw new WriteNormalizationError(`Array index out of bounds: ${pathName}`);
    }
    if (index === cursor.length) {
      cursor.push(value);
      return;
    }
    cursor[index] = value;
    return;
  }
  if (!isPlainObject(cursor)) {
    throw new WriteNormalizationError(`Cannot write non-object value: ${pathName}`);
  }
  cursor[last] = value;
}

function unsetDottedValue(target: any, pathName: string): void {
  const segments = splitPath(pathName);
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const next = segments[i + 1];
    if (Array.isArray(cursor)) {
      if (!isArrayIndexSegment(segment)) {
        throw new WriteNormalizationError(
          `Ambiguous array path ${pathName}: use an explicit index instead of ${segment}`,
        );
      }
      const index = Number(segment);
      if (!hasOwn(cursor, segment) || index >= cursor.length) return;
      cursor = cursor[index];
      continue;
    }
    if (!isPlainObject(cursor)) return;
    const child = cursor[segment];
    if (Array.isArray(child)) {
      if (!isArrayIndexSegment(next)) {
        throw new WriteNormalizationError(`Ambiguous array path ${pathName}: use an explicit index instead of ${next}`);
      }
      cursor = child;
      continue;
    }
    cursor = child;
    if (cursor == null || typeof cursor !== 'object' || Array.isArray(cursor)) {
      if (cursor == null) return;
      if (Array.isArray(cursor)) continue;
      return;
    }
    if (!isPlainObject(cursor)) return;
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(cursor)) {
    throw new WriteNormalizationError(
      `$unset for ${pathName} is not supported on an array index; use $pull to remove elements`,
    );
  }
  if (!isPlainObject(cursor)) return;
  delete cursor[last];
}

function getDottedValue(target: any, pathName: string): any {
  let cursor = target;
  for (const segment of splitPath(pathName)) {
    if (Array.isArray(cursor)) {
      if (!isArrayIndexSegment(segment)) {
        throw new WriteNormalizationError(
          `Ambiguous array path ${pathName}: use an explicit index instead of ${segment}`,
        );
      }
      const index = Number(segment);
      if (!hasOwn(cursor, segment) || index >= cursor.length) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (cursor == null || typeof cursor !== 'object') return undefined;
    if (isPlainObject(cursor) || hasOwn(cursor, segment)) {
      cursor = (cursor as Record<string, any>)[segment];
      continue;
    }
    return undefined;
  }
  return cursor;
}

function isBareArrayElementPath(pathName: string, schema: SchemaLike): boolean {
  let current: SchemaLike | undefined = schema;
  const segments = splitPath(pathName);
  let index = 0;
  while (current && index < segments.length) {
    const field = segments[index];
    const defined = current.paths.get(field);
    if (!defined) return false;
    if (defined.isArray) {
      if (index + 1 >= segments.length) return false;
      if (!isArrayIndexSegment(segments[index + 1])) return false;
      if (index + 2 === segments.length) return true;
      if (!defined.subSchema) return false;
      current = defined.subSchema;
      index += 2;
      continue;
    }
    if (defined.subSchema) {
      if (index + 1 === segments.length) return false;
      current = defined.subSchema;
      index += 1;
      continue;
    }
    return false;
  }
  return false;
}

function cloneSafePlain(
  value: any,
  pathName: string,
  depth = 0,
  seen: Set<object> = new Set(),
  state: { count: number } = { count: 0 },
): any {
  state.count += 1;
  if (state.count > MAX_STORAGE_NODES) {
    throw new WriteNormalizationError(`Path ${pathName} exceeds the supported storage size limit`);
  }
  if (value === undefined) {
    throw new WriteNormalizationError(`Path ${pathName} does not support undefined; omit the field or use null`);
  }
  if (value === null) return null;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return value;
  if (valueType === 'number') {
    if (!Number.isFinite(value)) throw new WriteNormalizationError(`Path ${pathName} requires a finite number`);
    return value;
  }
  if (valueType !== 'object') {
    throw new WriteNormalizationError(`Path ${pathName} requires a JSON-compatible value, not ${valueType}`);
  }
  if (depth > MAX_STORAGE_DEPTH) {
    throw new WriteNormalizationError(`Path ${pathName} exceeds the supported nesting depth`);
  }
  if (value instanceof Date) return dateToStorage(value, pathName);
  if (seen.has(value)) throw new WriteNormalizationError(`Path ${pathName} contains a cyclic reference`);
  if (Array.isArray(value)) {
    seen.add(value);
    try {
      return value.map((entry, index) => cloneSafePlain(entry, `${pathName}.${index}`, depth + 1, seen, state));
    } finally {
      seen.delete(value);
    }
  }
  if (!isPlainObject(value))
    throw new WriteNormalizationError(`Path ${pathName} requires a plain object, array, date, or primitive value`);
  seen.add(value);
  try {
    const out: any = Object.create(null);
    for (const [key, nested] of Object.entries(value)) {
      splitPath(key);
      out[key] = cloneSafePlain(nested, `${pathName}.${key}`, depth + 1, seen, state);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

function cloneValue(value: any): any {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(cloneValue);
  const out: any = Object.create(null);
  for (const [key, nested] of Object.entries(value)) out[key] = cloneValue(nested);
  return out;
}

function normalizeId(value: any): string {
  if (value === undefined || value === null) throw new WriteNormalizationError('_id must be a non-empty string');
  const id = typeof value === 'string' ? value : String(value);
  if (!id) throw new WriteNormalizationError('_id must be a non-empty string');
  return id;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
