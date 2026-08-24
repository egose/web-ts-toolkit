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

function isPathRequired(path: CompiledPath): boolean {
  const req = path.options.required;
  if (Array.isArray(req)) return !!req[0];
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
        out[name] = typeof path.options.default === 'function' ? path.options.default() : path.options.default;
      }
      continue;
    }
    out[name] = castValue(out[name], path);
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
    if (hasOwn(doc, name)) out[name] = valueToStorage((doc as any)[name], path);
    else if (opts.applyDefaults && path.options.default !== undefined) {
      const value = typeof path.options.default === 'function' ? path.options.default() : path.options.default;
      out[name] = valueToStorage(value, path);
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

export function normalizeUpdatePlan(update: any, schema: SchemaLike): NormalizedUpdatePlan {
  if (update == null || typeof update !== 'object' || Array.isArray(update)) {
    throw new WriteNormalizationError('Update must be an object');
  }
  const entries = Object.entries(update as Record<string, any>);
  const operatorEntries = entries.filter(([key]) => key.startsWith('$'));
  if (operatorEntries.length === 0) return normalizeReplacementUpdate(update, schema);
  if (operatorEntries.length !== entries.length) {
    throw new WriteNormalizationError('Update cannot mix operators with replacement fields');
  }

  const operations: NormalizedUpdateOperation[] = [];
  for (const [operator, rawOperand] of operatorEntries) {
    assertKnownUpdateOperator(operator);
    if (!isPlainObject(rawOperand)) throw new WriteNormalizationError(`${operator} requires an object operand`);
    for (const [rawPath, rawValue] of Object.entries(rawOperand as Record<string, any>)) {
      const resolved = resolveWritablePath(rawPath, schema, false);
      switch (operator) {
        case '$set':
          operations.push({ operator, path: rawPath, value: valueToStorage(rawValue, resolved.path) });
          break;
        case '$unset':
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
          operations.push({ operator, path: rawPath, value: valueToStorage(rawValue, resolved.path) });
          break;
        case '$push':
        case '$addToSet':
        case '$pull':
          if (!resolved.path.isArray)
            throw new WriteNormalizationError(`${operator} is only supported for array paths: ${rawPath}`);
          operations.push({ operator, path: rawPath, value: arrayItemToStorage(rawValue, resolved.path) });
          break;
      }
    }
  }
  return { replacement: false, operations };
}

export function applyNormalizedUpdate(doc: any, plan: NormalizedUpdatePlan, schema: SchemaLike): any {
  const out = existingStorageToWritableRecord(doc ?? {}, schema);
  if (plan.replacement) {
    const replacement = Object.create(null);
    if ((doc as any)?._id !== undefined) replacement._id = normalizeId((doc as any)._id);
    for (const operation of plan.operations)
      if ('value' in operation) setDottedValue(replacement, operation.path, operation.value);
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
        setDottedValue(out, operation.path, (getDottedValue(out, operation.path) ?? 0) + operation.value);
        break;
      case '$mul':
        setDottedValue(out, operation.path, (getDottedValue(out, operation.path) ?? 0) * operation.value);
        break;
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
          arr.some((item) => Object.is(item, operation.value)) ? arr : [...arr, operation.value],
        );
        break;
      }
      case '$pull': {
        const current = getDottedValue(out, operation.path);
        if (Array.isArray(current))
          setDottedValue(
            out,
            operation.path,
            current.filter((item) => !Object.is(item, operation.value)),
          );
        break;
      }
    }
  }
  return out;
}

function existingStorageToWritableRecord(doc: any, schema: SchemaLike): any {
  const out: any = Object.create(null);
  if ((doc as any)._id !== undefined) out._id = normalizeId((doc as any)._id);
  for (const [name, path] of schema.paths) {
    if (hasOwn(doc, name)) out[name] = valueToStorage((doc as any)[name], path);
  }
  return out;
}

export function castValue(value: any, path: CompiledPath): any {
  if (value === undefined || value === null) return value;
  if (path.isArray) {
    if (!Array.isArray(value))
      return [castValue(value, { ...path, isArray: false, type: path.arrayItemType ?? 'mixed' })];
    const itemPath: CompiledPath = {
      ...path,
      name: `${path.name}[]`,
      isArray: false,
      type: path.arrayItemType ?? 'mixed',
    };
    return value.map((v) => (path.subSchema ? castDocumentToSchema(v, path.subSchema) : castValue(v, itemPath)));
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
      if (path.subSchema) return castDocumentToSchema(value, path.subSchema);
      return value;
    default:
      return value;
  }
}

function normalizeReplacementUpdate(update: any, schema: SchemaLike): NormalizedUpdatePlan {
  const storage = documentToStorage(update, schema, { applyDefaults: false, allowId: false });
  const operations = Object.keys(storage).map((path) => ({ operator: '$set' as const, path, value: storage[path] }));
  return { replacement: false, operations };
}

function valueToStorage(value: any, path: CompiledPath): any {
  if (value === undefined || value === null) return value;
  if (path.isArray) {
    if (!Array.isArray(value)) return [arrayItemToStorage(value, path)];
    return value.map((entry) => arrayItemToStorage(entry, path));
  }
  switch (path.type) {
    case 'string':
      return typeof value === 'string' ? value : String(value);
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
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
      if (path.subSchema) return documentToStorage(value, path.subSchema, { applyDefaults: true, allowId: false });
      return cloneSafePlain(value, path.name);
    case 'mixed':
      return cloneSafePlain(value, path.name);
    default:
      return value;
  }
}

function arrayItemToStorage(value: any, path: CompiledPath): any {
  if (path.subSchema) return documentToStorage(value, path.subSchema, { applyDefaults: true, allowId: false });
  const itemPath: CompiledPath = {
    ...path,
    name: `${path.name}[]`,
    isArray: false,
    type: path.arrayItemType ?? 'mixed',
  };
  return valueToStorage(value, itemPath);
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
  if (root.subSchema) {
    const nestedPath = segments.slice(1).join('.');
    const nested = resolveWritablePath(nestedPath, root.subSchema, false, allowImmutable);
    return { path: { ...nested.path, name: pathName }, segments };
  }
  if (root.type === 'object' || root.type === 'mixed')
    return { path: { ...root, name: pathName, type: 'mixed', isArray: false }, segments };
  throw new WriteNormalizationError(`Path ${pathName} is not a nested object path`);
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

function setDottedValue(target: any, pathName: string, value: any): void {
  const segments = splitPath(pathName);
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!isPlainObject(cursor[segment])) cursor[segment] = Object.create(null);
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = value;
}

function unsetDottedValue(target: any, pathName: string): void {
  const segments = splitPath(pathName);
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i++) {
    cursor = cursor[segments[i]];
    if (!isPlainObject(cursor)) return;
  }
  delete cursor[segments[segments.length - 1]];
}

function getDottedValue(target: any, pathName: string): any {
  let cursor = target;
  for (const segment of splitPath(pathName)) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function cloneSafePlain(value: any, pathName: string): any {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return dateToStorage(value, pathName);
  if (Array.isArray(value)) return value.map((entry, index) => cloneSafePlain(entry, `${pathName}.${index}`));
  if (!isPlainObject(value))
    throw new WriteNormalizationError(`Path ${pathName} requires a plain object, array, date, or primitive value`);
  const out: any = Object.create(null);
  for (const [key, nested] of Object.entries(value)) {
    splitPath(key);
    out[key] = cloneSafePlain(nested, `${pathName}.${key}`);
  }
  return out;
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
