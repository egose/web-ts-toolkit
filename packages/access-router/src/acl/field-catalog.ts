/** Owned schema catalog: never discovers authority by enumerating a returned document. */
import type { Schema, SchemaType } from 'mongoose';
import type { AuthorizationFieldCatalog } from './service-authorization';

type CatalogSchemaType = SchemaType & {
  schema?: Schema;
  caster?: CatalogSchemaType;
  $embeddedSchemaType?: CatalogSchemaType;
  embeddedSchemaType?: CatalogSchemaType;
  $isMongooseDocumentArray?: boolean;
  $isSchemaMap?: boolean;
  $__schemaType?: CatalogSchemaType;
};

const safeSegment = (part: string) =>
  !!part &&
  part !== 'sub' &&
  !['__proto__', 'constructor', 'prototype', '_doc', '__v'].includes(part) &&
  !/^[+$-]|[\s*]/.test(part) &&
  !part.includes('[') &&
  !part.includes(']') &&
  !/^\d+$/.test(part) &&
  ![...part].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

export const isSafeOutputPath = (path: string): boolean => path.split('.').every(safeSegment);

/** `$*` exists only inside the captured catalog, never in a caller grant. */
export function matchesCatalogPattern(pattern: string, path: string, descendants = false): boolean {
  const expected = pattern.split('.');
  const actual = path.split('.');
  return (
    (descendants ? actual.length >= expected.length : actual.length === expected.length) &&
    expected.every((part, index) => part === '$*' || part === actual[index])
  );
}

export function isCatalogOutputPath(catalog: AuthorizationFieldCatalog, path: string): boolean {
  if (!isSafeOutputPath(path)) return false;
  if (catalog.protectedPaths?.some((p) => matchesCatalogPattern(p, path, true))) return false;
  if (catalog.referencePaths?.some((p) => matchesCatalogPattern(p, path, true) && !matchesCatalogPattern(p, path)))
    return false;
  if (catalog.virtualPaths?.some((p) => matchesCatalogPattern(p, path, true) && !matchesCatalogPattern(p, path)))
    return false;
  return (
    catalog.paths.includes(path) ||
    !!catalog.dynamicPaths?.some((p) => matchesCatalogPattern(p, path)) ||
    !!catalog.opaquePaths?.some((p) => matchesCatalogPattern(p, path, true))
  );
}

export function captureAuthorizationFieldCatalog(
  schema: Schema,
  virtuals: Record<string, unknown> | null | undefined,
  documentPermissionField = '_permissions',
): AuthorizationFieldCatalog {
  const paths = new Set<string>();
  const containers = new Set<string>();
  const opaque = new Set<string>();
  const references = new Set<string>();
  const virtualPaths = new Set<string>();
  const protectedPaths = new Set<string>([documentPermissionField, '_doc', '$__', '__v']);
  const add = (path: string) => {
    // Internal map patterns have one safe arbitrary-key segment.
    if (path.split('.').every((part) => part === '$*' || safeSegment(part))) paths.add(path);
  };
  const ancestors = (path: string) => {
    const parts = path.split('.');
    for (let n = 1; n < parts.length; n++) {
      const parent = parts.slice(0, n).join('.');
      add(parent);
      containers.add(parent);
    }
  };
  const visitType = (type: CatalogSchemaType, path: string, active: Set<Schema>) => {
    add(path);
    ancestors(path);
    const element = type.$embeddedSchemaType ?? type.embeddedSchemaType ?? type.caster;
    if (type.options?.ref || type.options?.refPath || element?.options?.ref || element?.options?.refPath) {
      references.add(path);
      return;
    }
    if (type.$isSchemaMap || type.instance === 'Map') {
      // Scalar maps accept keys, not arbitrary interiors; Mixed maps accept both.
      const value = type.$__schemaType;
      if (value) visitType(value, `${path}.$*`, active);
      else opaque.add(path);
      containers.delete(path); // omitted selection includes the declared Map root
      return;
    }
    const child = type.schema ?? element?.schema;
    if (child) {
      containers.add(path);
      if (!active.has(child)) visitSchema(child, path, new Set([...active, child]));
      return;
    }
    if (type.instance === 'Mixed' || element?.instance === 'Mixed') opaque.add(path);
  };
  const visitSchema = (current: Schema, prefix: string, active: Set<Schema>) => {
    const version = current.options.versionKey;
    if (typeof version === 'string') protectedPaths.add(prefix ? `${prefix}.${version}` : version);
    for (const [name, raw] of Object.entries(current.paths)) {
      if (name.includes('$*')) continue; // traversed through the owning Map type
      visitType(raw as CatalogSchemaType, prefix ? `${prefix}.${name}` : name, active);
    }
  };
  visitSchema(schema, '', new Set([schema]));
  const visitVirtuals = (record: Record<string, unknown> | null | undefined, prefix: string) => {
    for (const [name, value] of Object.entries(record ?? {})) {
      if (value === undefined) continue;
      const path = prefix ? `${prefix}.${name}` : name;
      if (!isSafeOutputPath(path)) continue;
      if (value && typeof value === 'object' && 'sub' in value) {
        // Registered embedded containers are receiving-model scopes, never ref interiors.
        if (references.has(path)) continue;
        add(path);
        containers.add(path);
        visitVirtuals((value as { sub: Record<string, unknown> }).sub, path);
      } else {
        add(path);
        ancestors(path);
        virtualPaths.add(path);
      }
    }
  };
  visitVirtuals(virtuals, '');
  const eligible = [...paths].filter((p) => ![...protectedPaths].some((v) => matchesCatalogPattern(v, p, true)));
  return Object.freeze({
    paths: Object.freeze(eligible.filter((p) => !p.includes('$*'))),
    dynamicPaths: Object.freeze(eligible.filter((p) => p.includes('$*'))),
    containerPaths: Object.freeze([...containers]),
    opaquePaths: Object.freeze([...opaque]),
    referencePaths: Object.freeze([...references]),
    virtualPaths: Object.freeze([...virtualPaths]),
    protectedPaths: Object.freeze([...protectedPaths]),
  });
}
