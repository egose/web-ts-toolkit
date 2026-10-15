/** Pre-query whole-value proof. Distinct cannot trim values without changing equivalence. */
import type { Schema, SchemaType } from 'mongoose';
import { isPlainObject } from '@web-ts-toolkit/utils';
import { classifyRequestFieldRule, extractOutputFieldRuleEntries } from './field-authorization';
import type { FieldPermissions } from './field-authorization';
import { isCatalogOutputPath, matchesCatalogPattern } from './field-catalog';
import type { AuthorizationConfiguration } from './service-authorization';

type DistinctSchemaType = SchemaType & {
  schema?: Schema;
  caster?: DistinctSchemaType;
  $embeddedSchemaType?: DistinctSchemaType;
  embeddedSchemaType?: DistinctSchemaType;
  $__schemaType?: DistinctSchemaType;
  $isMongooseDocumentArray?: boolean;
  $isSchemaMap?: boolean;
};

type ValueShape = { kind: 'scalar' } | { kind: 'object'; schema: Schema; prefix: string };

const schemaVariants = (schema: Schema): Schema[] =>
  Object.values((schema as Schema & { discriminators?: Record<string, Schema> }).discriminators ?? {});

const scalarTypes = new Set([
  'String',
  'Number',
  'Boolean',
  'Date',
  'ObjectId',
  'Decimal128',
  'Buffer',
  'UUID',
  'BigInt',
  'Double',
  'Int32',
]);

/** Resolve actual schema types, not the contents of a current database value. */
function typeShape(type: DistinctSchemaType | undefined, remaining: string[] = []): ValueShape | undefined {
  const seen = new Set<DistinctSchemaType>();
  while (type) {
    if (seen.has(type)) return undefined;
    seen.add(type);
    if (type.schema) {
      return remaining.length
        ? schemaShape(type.schema, remaining.join('.'))
        : { kind: 'object', schema: type.schema, prefix: '' };
    }
    if (type.instance === 'Array' || type.$isMongooseDocumentArray) {
      type = type.$embeddedSchemaType ?? type.embeddedSchemaType ?? type.caster;
      continue;
    }
    if (type.instance === 'Map' || type.$isSchemaMap) {
      // An explicit key has a known value type; the whole Map has unbounded keys.
      if (!remaining.length) return undefined;
      remaining = remaining.slice(1);
      type = type.$__schemaType;
      continue;
    }
    return !remaining.length && scalarTypes.has(type.instance) ? { kind: 'scalar' } : undefined;
  }
  return undefined;
}

function declaredSchemaShape(schema: Schema, path: string): ValueShape | undefined {
  if (Object.prototype.hasOwnProperty.call(schema.paths, path)) {
    return typeShape(schema.paths[path] as DistinctSchemaType);
  }
  if (Object.keys(schema.paths).some((name) => name.startsWith(`${path}.`))) {
    return { kind: 'object', schema, prefix: `${path}.` };
  }
  const parts = path.split('.');
  for (let length = 1; length < parts.length; length++) {
    const head = parts.slice(0, length).join('.');
    if (Object.prototype.hasOwnProperty.call(schema.paths, head)) {
      return typeShape(schema.paths[head] as DistinctSchemaType, parts.slice(length));
    }
  }
  return undefined;
}

function schemaShape(schema: Schema, path: string): ValueShape | undefined {
  const shape = declaredSchemaShape(schema, path);
  const variants = schemaVariants(schema);
  if (!variants.length) return shape;
  // A base scalar can be overridden with Mixed/a composite in a discriminator.
  // Common scalar paths remain safe; variant-dependent containers are not closed.
  return shape?.kind === 'scalar' && variants.every((variant) => declaredSchemaShape(variant, path)?.kind === 'scalar')
    ? shape
    : undefined;
}

export function isDistinctFieldAuthorized(args: {
  field: string;
  schema: Schema;
  configuration: AuthorizationConfiguration;
  permissions: FieldPermissions;
}): boolean {
  const { field, schema, configuration, permissions } = args;
  const { catalog } = configuration;
  const permissionSchema = configuration.permissionSchema as Record<string, unknown> | undefined;
  const prefix = (configuration.modelPermissionPrefix as string) ?? '';
  const rules = (path: string) => extractOutputFieldRuleEntries(permissionSchema, path, 'read');
  const granted = (path: string) =>
    rules(path).every((entry) => classifyRequestFieldRule(entry.rule, permissions, prefix) === 'granted');
  const contains = (path: string, pattern: string) =>
    matchesCatalogPattern(pattern.split('.').slice(0, path.split('.').length).join('.'), path);
  const eligible = (path: string) =>
    isCatalogOutputPath(catalog, path) &&
    !catalog.virtualPaths?.some((pattern) => matchesCatalogPattern(pattern, path, true) || contains(path, pattern)) &&
    !catalog.metadataPaths?.some((pattern) => contains(path, pattern));

  const shape = schemaShape(schema, field);
  if (!shape || !eligible(field)) return false;
  // Preserve implicit scalar identity, never use it as a grant to a composite ID.
  if (field === '_id' && shape.kind === 'scalar') return true;
  // No ancestor/descendant inference for the requested value: `.sub` entries are
  // explicit response paths too, and retain the ordinary ancestor/flat precedence.
  if (!rules(field).some((entry) => entry.path === field) || !granted(field)) return false;

  // A removed schema field can still exist in Mongo. Never drop a named policy
  // restriction merely because that descendant is absent from the current catalog.
  const declaredRulesSafe = (record: Record<string, unknown>, parent = '', active = new Set<object>()): boolean => {
    if (active.has(record)) return false;
    const next = new Set([...active, record]);
    for (const [name, raw] of Object.entries(record)) {
      const path = parent ? `${parent}.${name}` : name;
      if (path !== field && !path.startsWith(`${field}.`) && !field.startsWith(`${path}.`)) continue;
      if (path.startsWith(`${field}.`) && (!eligible(path) || !schemaShape(schema, path) || !granted(path)))
        return false;
      if (isPlainObject(raw) && raw.sub !== undefined) {
        if (!isPlainObject(raw.sub) || !declaredRulesSafe(raw.sub, path, next)) return false;
      }
    }
    return true;
  };
  if (shape.kind === 'object' && !declaredRulesSafe(permissionSchema ?? {})) return false;

  const visit = (value: ValueShape | undefined, path: string, active: Set<Schema>): boolean => {
    if (!value || !eligible(path)) return false;
    if (value.kind === 'scalar' && path.endsWith('._id')) return true;
    if (!granted(path)) return false;
    if (value.kind === 'scalar') return true;
    if (value.schema.options.strict === false || schemaVariants(value.schema).length || active.has(value.schema))
      return false;
    const next = new Set([...active, value.schema]);
    for (const [name, type] of Object.entries(value.schema.paths)) {
      if (!name.startsWith(value.prefix)) continue;
      const child = `${path}.${name.slice(value.prefix.length)}`;
      if (!visit(typeShape(type as DistinctSchemaType), child, next)) return false;
    }
    return true;
  };
  return visit(shape, field, new Set());
}
