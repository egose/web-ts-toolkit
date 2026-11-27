import type { Schema, SchemaType } from 'mongoose';

import type { KeycloakGroupSyncPaths, KeycloakGroupSyncPluginOptions } from '../keycloak-group-sync';

interface PlannedGroup {
  readonly name: string;
  readonly description: string | undefined;
}

interface PlannedRoleGroup extends PlannedGroup {
  /** Flat key in the subgroup ID map. */
  readonly key: string;
  /** `null` means the org root is the immediate parent. */
  readonly parentKey: string | null;
}

export interface KeycloakGroupSyncConfig {
  readonly client: KeycloakGroupSyncPluginOptions['client'];
  readonly realm: string;
  readonly paths: Omit<KeycloakGroupSyncPaths, 'roles'>;
  /** Either a persisted roles path or the validated fixed subgroup plan. */
  readonly roleSource: string | readonly PlannedRoleGroup[];
}

interface KeycloakGroupSyncPlan {
  readonly root: PlannedGroup;
  readonly roleGroups: readonly PlannedRoleGroup[];
}

type StoredSchemaType = SchemaType & {
  $isSingleNested?: boolean;
  // Older Mongoose 8 minors do not expose getEmbeddedSchemaType().
  $__schemaType?: SchemaType;
};

const maxRoleDepth = 16;
const maxRoleGroups = 500;
const reservedMapKeys = new Set(['__proto__', 'constructor', 'prototype']);

const isSafeMongoSegment = (value: string) =>
  !value.startsWith('$') && !value.includes('.') && !value.includes('\0') && !reservedMapKeys.has(value);

const invalid = (location: string, reason: string) => new TypeError(`keycloakGroupSyncPlugin ${location}: ${reason}`);

// schema.path() also accepts dynamic map entries and positional array paths.
// Walk declared fields, crossing only single nested subdocuments.
function getStoredSchemaType(schema: Schema, segments: readonly string[]): StoredSchemaType | undefined {
  let currentSchema = schema;
  let localPath = '';
  for (let index = 0; index < segments.length; index++) {
    localPath = localPath ? `${localPath}.${segments[index]}` : segments[index];
    if (!Object.hasOwn(currentSchema.paths, localPath)) continue;
    const type = currentSchema.paths[localPath] as StoredSchemaType;
    if (index === segments.length - 1) return type;
    if (!type.$isSingleNested || !type.schema) return undefined;
    currentSchema = type.schema;
    localPath = '';
  }
}

function requireSchemaPath(
  schema: Schema,
  field: keyof KeycloakGroupSyncPaths,
  value: unknown,
  expected: 'String' | 'Map of String' | 'Array',
): string {
  const location = `paths.${field}`;
  if (typeof value !== 'string') throw invalid(location, 'expected a dotted schema path string');
  const segments = value.split('.');
  if (!segments.every((segment) => segment.trim() && isSafeMongoSegment(segment))) {
    throw invalid(location, 'expected a safe dotted schema path');
  }
  const type = getStoredSchemaType(schema, segments);
  const matches =
    expected === 'Map of String'
      ? type?.instance === 'Map' && (type.getEmbeddedSchemaType?.() ?? type.$__schemaType)?.instance === 'String'
      : type?.instance === expected;
  if (!matches) throw invalid(location, `${JSON.stringify(value)} must be a persisted ${expected} schema path`);
  return value;
}

function requireGroupName(value: unknown, location: string): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.trim() !== value ||
    value.includes('/') ||
    !isSafeMongoSegment(value)
  ) {
    throw invalid(location, 'expected a nonblank, map-safe group name without slashes or surrounding whitespace');
  }
  return value;
}

export function validateGroupSyncOrgName(config: KeycloakGroupSyncConfig, value: unknown): string {
  return requireGroupName(value, `paths.name (${config.paths.name})`);
}

function readDescription(value: unknown, location: string): string | undefined {
  if (value !== undefined && typeof value !== 'string') throw invalid(location, 'expected a string description');
  return value;
}

function planRoleGroups(input: unknown, location: string): readonly PlannedRoleGroup[] {
  const groups: PlannedRoleGroup[] = [];
  const ancestors = new Set<readonly unknown[]>();

  function visit(list: unknown, listLocation: string, parentKey: string | null, depth: number) {
    if (!Array.isArray(list)) throw invalid(listLocation, 'expected an array of roles');
    if (ancestors.has(list)) throw invalid(listLocation, 'cyclic role tree');
    if (list.length > 0 && depth > maxRoleDepth) {
      throw invalid(listLocation, `role trees support at most ${maxRoleDepth} subgroup levels`);
    }

    ancestors.add(list);
    const siblingNames = new Set<string>();
    for (let index = 0; index < list.length; index++) {
      const roleLocation = `${listLocation}[${index}]`;
      if (groups.length === maxRoleGroups) {
        throw invalid(roleLocation, `role trees support at most ${maxRoleGroups} subgroups`);
      }
      const role: unknown = list[index];
      const node = typeof role === 'string' ? { name: role } : role;
      if (typeof node !== 'object' || node === null || Array.isArray(node)) {
        throw invalid(roleLocation, 'expected a group name string or a role object');
      }
      const { name: rawName, description, children } = node as Record<string, unknown>;
      const name = requireGroupName(rawName, `${roleLocation}.name`);
      if (siblingNames.has(name)) throw invalid(roleLocation, `duplicate sibling group name ${JSON.stringify(name)}`);
      siblingNames.add(name);

      const key = parentKey === null ? name : `${parentKey}/${name}`;
      const desiredDescription = readDescription(description, `${roleLocation}.description`);
      groups.push(Object.freeze({ name, key, parentKey, description: desiredDescription }));
      if (children !== undefined) visit(children, `${roleLocation}.children`, key, depth + 1);
    }
    // Shared branches are allowed; only a back edge in the active branch is a cycle.
    ancestors.delete(list);
  }

  visit(input, location, null, 1);
  return Object.freeze(groups);
}

/** Validate schema paths and snapshot the supplied configuration at registration. */
export function normalizeKeycloakGroupSyncOptions(
  schema: Schema,
  options: KeycloakGroupSyncPluginOptions,
): KeycloakGroupSyncConfig {
  const client = options?.client;
  if (typeof client?.realm !== 'function') throw invalid('client', 'expected a Keycloak Fluent client');
  const { realm: configuredRealm, paths: configuredPaths, roles } = options;
  const realm = typeof configuredRealm === 'string' ? configuredRealm.trim() : '';
  if (!realm) throw invalid('realm', 'expected a non-empty realm name');
  if (typeof configuredPaths !== 'object' || configuredPaths === null || Array.isArray(configuredPaths)) {
    throw invalid('paths', 'expected an object of schema paths');
  }

  const { name, description, providerId, roleGroupIds, roles: rolesPath } = configuredPaths;
  if ((roles === undefined) === (rolesPath === undefined)) {
    throw invalid('roles', 'configure exactly one of roles or paths.roles');
  }

  const paths = Object.freeze({
    name: requireSchemaPath(schema, 'name', name, 'String'),
    ...(description === undefined
      ? {}
      : { description: requireSchemaPath(schema, 'description', description, 'String') }),
    providerId: requireSchemaPath(schema, 'providerId', providerId, 'String'),
    roleGroupIds: requireSchemaPath(schema, 'roleGroupIds', roleGroupIds, 'Map of String'),
  });
  if (paths.providerId === paths.name || paths.providerId === paths.description) {
    throw invalid('paths.providerId', 'the stored root ID must have its own schema path');
  }
  for (const field of ['providerId', 'roleGroupIds'] as const) {
    const path = paths[field];
    if (path === '_id' || path.startsWith('_id.') || path === schema.options.versionKey) {
      throw invalid(`paths.${field}`, 'cannot store a Keycloak ID in a MongoDB ID or Mongoose version path');
    }
  }

  const roleSource =
    rolesPath === undefined ? planRoleGroups(roles, 'roles') : requireSchemaPath(schema, 'roles', rolesPath, 'Array');
  return Object.freeze({ client, realm, paths, roleSource });
}

/** Read an actual stored field from a lean document, bypassing inherited properties. */
export function readGroupSyncPath(document: Record<string, unknown>, path: string): unknown {
  let value: unknown = document;
  for (const segment of path.split('.')) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, segment)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

/** Build the entire desired plan before reconciliation performs any Keycloak writes. */
export function planKeycloakGroups(
  config: KeycloakGroupSyncConfig,
  document: Record<string, unknown>,
): KeycloakGroupSyncPlan {
  const name = validateGroupSyncOrgName(config, readGroupSyncPath(document, config.paths.name));
  const descriptionPath = config.paths.description;
  const description =
    descriptionPath === undefined
      ? undefined
      : readDescription(
          readGroupSyncPath(document, descriptionPath) ?? undefined,
          `paths.description (${descriptionPath})`,
        );
  const roleGroups =
    typeof config.roleSource === 'string'
      ? planRoleGroups(readGroupSyncPath(document, config.roleSource) ?? [], `paths.roles (${config.roleSource})`)
      : config.roleSource;
  return Object.freeze({ root: Object.freeze({ name, description }), roleGroups });
}
