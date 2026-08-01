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

export function convertToRxJsonSchema(
  name: string,
  schema: SchemaLike,
  opts: { primaryKey?: string; additionalIndexes?: string[][] } = {},
): RxJsonSchema {
  const primaryKey = opts.primaryKey ?? '_id';
  const properties: Record<string, any> = {
    [primaryKey]: { type: 'string', maxLength: 100 },
  };
  const required: string[] = [];

  for (const [, path] of schema.paths) {
    if (path.options.immutable) properties[path.name] = { ...properties[path.name], immutable: true };
    properties[path.name] = rxPropertyFor(path, properties[path.name]);

    if (isPathRequired(path)) {
      required.push(path.name);
    }
  }

  const out: RxJsonSchema = {
    title: name.toLowerCase(),
    version: 0,
    primaryKey,
    type: 'object',
    properties,
    indexes: opts.additionalIndexes ?? defaultIndexes(schema),
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
      return { type: ['string', 'number'], format: 'date-time', ...existing, maxLength: 50 };
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
      return { type: ['string', 'number'], format: 'date-time' };
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
    if (p.options.index === true || p.options.unique === true) out.push([p.name]);
  }
  return out;
}

export function castDocumentToSchema(doc: any, schema: SchemaLike): any {
  if (doc == null) return doc;
  if (Array.isArray(doc)) return doc.map((d) => castDocumentToSchema(d, schema));
  const out: any = { ...doc };
  for (const [name, path] of schema.paths) {
    if (!(name in out)) {
      if (path.options.default !== undefined) {
        out[name] = typeof path.options.default === 'function' ? path.options.default() : path.options.default;
      }
      continue;
    }
    out[name] = castValue(out[name], path);
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
