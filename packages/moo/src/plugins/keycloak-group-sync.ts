import type KeycloakAdminClientFluent from '@egose/keycloak-fluent';
import type { Schema } from 'mongoose';

import { normalizeKeycloakGroupSyncOptions } from './keycloak-group-sync/planner';
import { registerKeycloakGroupSyncSaveHooks } from './keycloak-group-sync/save';

const registeredSchemas = new WeakSet<Schema>();

/** A subgroup name or a subgroup with its own description and descendants. */
export type KeycloakGroupSyncRole = string | KeycloakGroupSyncRoleDefinition;

/** A node in either the fixed or the document-backed subgroup tree. */
export interface KeycloakGroupSyncRoleDefinition {
  /** A map-safe group name, unique among siblings. See {@link KeycloakGroupSyncPaths.name}. */
  readonly name: string;
  /** Keycloak's native description. Omit it to preserve the remote description, or supply `''` to clear it. */
  readonly description?: string;
  /** Desired subgroups of this node. Strings and objects can be mixed at every level. */
  readonly children?: readonly KeycloakGroupSyncRole[];
}

/** Declared Mongoose fields for an organization's Keycloak groups. Dotted paths are supported. */
export interface KeycloakGroupSyncPaths {
  /**
   * Stable org slug (`String`). Group names must be nonblank. They cannot contain
   * `/`, `.`, or NUL, start with `$`, have surrounding whitespace, or be a
   * reserved Mongoose map key (`__proto__`, `prototype`, `constructor`).
   */
  readonly name: string;
  /** Optional root description (`String`). A missing or null value preserves the remote description. */
  readonly description?: string;
  /** Server-controlled root group ID (`String`). */
  readonly providerId: string;
  /** Server-controlled `Map` of `String` IDs, keyed by org-relative subgroup paths such as `engineering/admin`. */
  readonly roleGroupIds: string;
  /**
   * Document-backed roles (`Array`). Use `[Schema.Types.Mixed]` to store both
   * strings and objects. Omit when supplying fixed `roles`.
   */
  readonly roles?: string;
}

/**
 * Configure Keycloak group provisioning with exactly one role source: `roles`
 * (snapshotted on registration) or `paths.roles`. An empty tree or a missing or
 * null document-backed list provisions only the root. The tree supports up to 16
 * subgroup levels below the root and 500 subgroups, including intermediate groups.
 */
export type KeycloakGroupSyncPluginOptions = {
  /** Application-supplied Keycloak Fluent client with managed admin authentication. */
  readonly client: KeycloakAdminClientFluent;
  /** Keycloak realm containing the organization's groups. */
  readonly realm: string;
} & (
  | {
      /** The slug, ID storage, and optional root description paths. */
      readonly paths: KeycloakGroupSyncPaths & { readonly roles?: never };
      /** Fixed subgroup tree shared by all documents using this schema. */
      readonly roles: readonly KeycloakGroupSyncRole[];
    }
  | {
      /** Include `roles` to read the desired subgroup tree from each document. */
      readonly paths: KeycloakGroupSyncPaths & { readonly roles: string };
      readonly roles?: never;
    }
);

/**
 * Provision the organization group's desired tree on document `save()` and
 * `Model.create()`. Reconciliation runs after MongoDB persistence, and rejects
 * the save promise if it fails. Invalid configuration throws at registration.
 *
 * @example
 * orgSchema.plugin(keycloakGroupSyncPlugin, {
 *   client: keycloak,
 *   realm: 'application',
 *   paths: { name: 'slug', providerId: 'keycloak.groupId', roleGroupIds: 'keycloak.roleGroupIds' },
 *   roles: ['member', { name: 'engineering', children: ['admin'] }],
 * });
 */
export function keycloakGroupSyncPlugin(schema: Schema, options: KeycloakGroupSyncPluginOptions): void {
  if (registeredSchemas.has(schema)) throw new Error('keycloakGroupSyncPlugin is already registered on this schema');
  const config = normalizeKeycloakGroupSyncOptions(schema, options);
  registerKeycloakGroupSyncSaveHooks(schema, config);
  registeredSchemas.add(schema);
}
