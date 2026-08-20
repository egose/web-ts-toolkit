import type KeycloakAdminClientFluent from '@egose/keycloak-fluent';
import type { Schema } from 'mongoose';

export type KeycloakUserIdentityField = 'providerId' | 'username' | 'email';
export type KeycloakUserSyncField =
  | 'username'
  | 'email'
  | 'emailVerified'
  | 'firstName'
  | 'lastName'
  | 'enabled'
  | 'roles'
  | 'attributes';

export interface KeycloakUserSyncPaths {
  providerId: string;
  username: string;
  email: string;
  emailVerified: string;
  firstName: string;
  lastName: string;
  enabled: string;
  archived: string;
  roles: string;
  attributes: string;
}

export interface KeycloakUserSyncErrorContext {
  operation: 'save' | 'delete';
  document: unknown;
}

export interface KeycloakUserSyncLogger {
  error(message: string, context: KeycloakUserSyncErrorContext & { error: unknown }): void;
}

export interface KeycloakUserSyncDocument {
  get(path: string): unknown;
}

export interface KeycloakUserSyncPluginOptions {
  /** An authenticated client. Authentication and token refresh remain the application's responsibility. */
  client: KeycloakAdminClientFluent;
  realm: string;
  /** Identity fields to use. Defaults to providerId, username, then email. */
  identifyBy?: KeycloakUserIdentityField | readonly KeycloakUserIdentityField[];
  /** Override the Mongoose path used for each application-user property. */
  paths?: Partial<KeycloakUserSyncPaths>;
  /** Set a field to false to exclude it from change detection and Keycloak updates. */
  syncFields?: Partial<Record<KeycloakUserSyncField, boolean>>;
  /** Convert the configured roles path into Keycloak realm-role names. */
  mapRoles?: (roles: unknown, document: KeycloakUserSyncDocument) => readonly string[];
  /** Convert document state into Keycloak user attributes. Values are normalized to string arrays. */
  mapAttributes?: (document: KeycloakUserSyncDocument) => Record<string, unknown> | null | undefined;
  /** Mongoose paths that should trigger attribute syncing when mapAttributes reads dynamic fields. */
  attributePaths?: readonly string[];
  /** Attribute keys owned by this plugin. Only managed keys are removed when missing from the mapper result. */
  managedAttributes?: readonly string[];
  /** Restrict role removal to this set. Without it, assigned realm roles are reconciled exactly. */
  managedRoles?: readonly string[];
  /** Create missing desired realm roles before assigning them. Defaults to true. */
  ensureRoles?: boolean;
  /** Save a newly resolved Keycloak ID to the providerId path. Defaults to true. */
  persistProviderId?: boolean;
  /** Send VERIFY_EMAIL after changing an existing user's email. Defaults to true. */
  sendVerificationEmailOnChange?: boolean;
  /** Called after an error is logged and before it is optionally rethrown. */
  onError?: (error: unknown, context: KeycloakUserSyncErrorContext) => void | Promise<void>;
  /** Set to false to disable logging or provide a structured logger. Defaults to console. */
  logger?: KeycloakUserSyncLogger | false;
  /** Set to false to let MongoDB operations succeed after a Keycloak error. Defaults to true. */
  throwOnError?: boolean;
}

type KeycloakUser = {
  id?: string;
  username?: string;
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  attributes?: Record<string, string[]>;
};

type PluginDocument = KeycloakUserSyncDocument & {
  _id: unknown;
  isNew: boolean;
  $locals: Record<string, unknown>;
  constructor: {
    findById(id: unknown): {
      select(paths: string[]): { lean(): Promise<Record<string, unknown> | null> };
    };
    updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>;
  };
  set(path: string, value: unknown): void;
  unmarkModified(path: string): void;
  isModified(path: string): boolean;
};

type SyncState = {
  shouldSync: boolean;
  previous?: Record<string, unknown> | null;
};

const syncStateKey = 'keycloakUserSync';
const defaultPaths: KeycloakUserSyncPaths = {
  providerId: 'providerId',
  username: 'username',
  email: 'email',
  emailVerified: 'emailVerified',
  firstName: 'firstName',
  lastName: 'lastName',
  enabled: 'enabled',
  archived: 'archived',
  roles: 'roles',
  attributes: 'attributes',
};
const defaultSyncFields: Record<KeycloakUserSyncField, boolean> = {
  username: true,
  email: true,
  emailVerified: true,
  firstName: true,
  lastName: true,
  enabled: true,
  roles: true,
  attributes: true,
};

const stringValue = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeEmail = (value: unknown) => stringValue(value)?.toLowerCase() ?? null;

const getPathValue = (value: Record<string, unknown> | null | undefined, path: string) =>
  path.split('.').reduce<unknown>((current, part) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);

const uniqueStrings = (values: readonly unknown[]) => [
  ...new Set(values.map(stringValue).filter((value): value is string => value !== null)),
];

const normalizeAttributeValue = (value: unknown): string[] | null => {
  if (value === null || value === undefined) return null;

  const values = Array.isArray(value) ? value : [value];
  const normalized = values
    .map((item) => {
      if (item instanceof Date) return item.toISOString();
      if (typeof item === 'string') return item;
      if (typeof item === 'number' || typeof item === 'boolean' || typeof item === 'bigint') return String(item);
      return null;
    })
    .filter((item): item is string => item !== null);

  return normalized.length ? normalized : null;
};

const normalizeAttributes = (attributes: unknown) => {
  if (typeof attributes !== 'object' || attributes === null || Array.isArray(attributes)) return {};

  return Object.entries(attributes as Record<string, unknown>).reduce<Record<string, string[]>>(
    (result, [key, value]) => {
      const normalizedKey = stringValue(key);
      const normalizedValue = normalizeAttributeValue(value);
      if (normalizedKey && normalizedValue) result[normalizedKey] = normalizedValue;
      return result;
    },
    {},
  );
};

const getState = (document: PluginDocument) => document.$locals[syncStateKey] as SyncState | undefined;

/**
 * Synchronizes document saves and document `deleteOne()` calls with a Keycloak user.
 * Query updates and query deletes are intentionally not intercepted because they do not provide a document identity.
 */
export function keycloakUserSyncPlugin(schema: Schema, options: KeycloakUserSyncPluginOptions) {
  if (!options?.client || !options.realm) {
    throw new Error('keycloakUserSyncPlugin requires client and realm options');
  }

  const paths = { ...defaultPaths, ...options.paths };
  const syncFields = { ...defaultSyncFields, ...options.syncFields };
  const configuredIdentities: readonly KeycloakUserIdentityField[] =
    options.identifyBy === undefined
      ? ['providerId', 'username', 'email']
      : typeof options.identifyBy === 'string'
        ? [options.identifyBy]
        : options.identifyBy;
  const identities = [...new Set(configuredIdentities)];
  const trackedPaths = uniqueStrings([
    paths.providerId,
    ...Object.entries(syncFields)
      .filter(([, enabled]) => enabled)
      .flatMap(([field]) =>
        field === 'enabled' ? [paths.enabled, paths.archived] : [paths[field as keyof KeycloakUserSyncPaths]],
      ),
    ...(syncFields.attributes && options.attributePaths ? options.attributePaths : []),
  ]);

  const handleError = async (error: unknown, context: KeycloakUserSyncErrorContext) => {
    const logger = options.logger === false ? null : (options.logger ?? console);
    logger?.error(`Keycloak user sync failed during ${context.operation}`, { ...context, error });
    await options.onError?.(error, context);

    if (options.throwOnError !== false) throw error;
  };

  const getDocumentValue = (document: PluginDocument, field: keyof KeycloakUserSyncPaths) => document.get(paths[field]);
  const getPreviousValue = (previous: Record<string, unknown> | null | undefined, field: keyof KeycloakUserSyncPaths) =>
    getPathValue(previous, paths[field]);

  const getUsername = (document: PluginDocument) =>
    stringValue(getDocumentValue(document, 'username')) ?? stringValue(getDocumentValue(document, 'email'));

  const resolveUser = async (
    document: PluginDocument,
    previous?: Record<string, unknown> | null,
  ): Promise<{ user: KeycloakUser | null; duplicateEmailsAllowed: boolean }> => {
    const realmHandle = options.client.realm(options.realm);
    const realm = await realmHandle.get();
    if (!realm) throw new Error(`Keycloak realm "${options.realm}" was not found`);

    const duplicateEmailsAllowed = realm.duplicateEmailsAllowed === true;
    const orderedIdentities = duplicateEmailsAllowed
      ? (['providerId', 'username', 'email'] as const).filter((identity) => identities.includes(identity))
      : identities;

    for (const identity of orderedIdentities) {
      if (identity === 'providerId') {
        for (const providerId of uniqueStrings([
          getDocumentValue(document, 'providerId'),
          getPreviousValue(previous, 'providerId'),
        ])) {
          const user = await realmHandle.user(getUsername(document) ?? providerId).getById(providerId);
          if (user) return { user, duplicateEmailsAllowed };
        }
      }

      if (identity === 'username') {
        for (const username of uniqueStrings([
          getDocumentValue(document, 'username'),
          getPreviousValue(previous, 'username'),
        ])) {
          const user = await realmHandle.user(username).get();
          if (user) return { user, duplicateEmailsAllowed };
        }
      }

      if (identity === 'email') {
        for (const email of uniqueStrings([getDocumentValue(document, 'email'), getPreviousValue(previous, 'email')])) {
          const matches = (
            await options.client.core.users.find({ realm: options.realm, email, exact: true, first: 0, max: 2 })
          ).filter((user) => normalizeEmail(user.email) === normalizeEmail(email));

          if (matches.length > 1) {
            throw new Error(`Cannot identify a unique Keycloak user for email "${email}"`);
          }
          if (matches.length === 1) return { user: matches[0], duplicateEmailsAllowed };
        }
      }
    }

    return { user: null, duplicateEmailsAllowed };
  };

  const buildPayload = (document: PluginDocument) => {
    const payload: KeycloakUser = {};
    const copyString = (field: 'username' | 'email' | 'firstName' | 'lastName') => {
      if (!syncFields[field]) return;
      const value = stringValue(getDocumentValue(document, field));
      if (value !== null) payload[field] = value;
    };

    copyString('username');
    copyString('email');
    copyString('firstName');
    copyString('lastName');

    if (syncFields.emailVerified && typeof getDocumentValue(document, 'emailVerified') === 'boolean') {
      payload.emailVerified = getDocumentValue(document, 'emailVerified') as boolean;
    }

    if (syncFields.enabled) {
      const archived = getDocumentValue(document, 'archived');
      const enabled = getDocumentValue(document, 'enabled');
      if (typeof archived === 'boolean') payload.enabled = !archived;
      else if (typeof enabled === 'boolean') payload.enabled = enabled;
    }

    return payload;
  };

  const getDesiredRoles = (document: PluginDocument) => {
    if (!syncFields.roles) return [];
    const source = getDocumentValue(document, 'roles');
    const mapped = options.mapRoles ? options.mapRoles(source, document) : Array.isArray(source) ? source : [];
    return uniqueStrings(mapped);
  };

  const getDesiredAttributes = (document: PluginDocument) => {
    if (!syncFields.attributes) return null;
    const source = options.mapAttributes ? options.mapAttributes(document) : getDocumentValue(document, 'attributes');
    return normalizeAttributes(source);
  };

  const mergeAttributes = (user: KeycloakUser | null, document: PluginDocument) => {
    const desiredAttributes = getDesiredAttributes(document);
    if (!desiredAttributes) return undefined;

    const currentAttributes = { ...(user?.attributes ?? {}) };

    if (options.managedAttributes) {
      for (const key of options.managedAttributes) {
        delete currentAttributes[key];
      }
    }

    return {
      ...currentAttributes,
      ...desiredAttributes,
    };
  };

  const syncRoles = async (user: KeycloakUser, document: PluginDocument) => {
    if (!syncFields.roles || !user.id) return;

    const realmHandle = options.client.realm(options.realm);
    const desiredNames = getDesiredRoles(document);
    const managedNames = options.managedRoles ? new Set(options.managedRoles) : null;
    const effectiveDesiredNames = managedNames ? desiredNames.filter((name) => managedNames.has(name)) : desiredNames;
    const desiredRoles = [];

    for (const roleName of effectiveDesiredNames) {
      const roleHandle = realmHandle.role(roleName);
      if (options.ensureRoles !== false) await roleHandle.ensure({});
      const role = await roleHandle.get();
      if (!role?.id) throw new Error(`Keycloak realm role "${roleName}" was not found`);
      desiredRoles.push(role);
    }

    const assignedRoles = await options.client.core.users.listRealmRoleMappings({ realm: options.realm, id: user.id });
    const assignedNames = new Set(
      assignedRoles.map((role) => role.name).filter((name): name is string => Boolean(name)),
    );
    const desiredNameSet = new Set(effectiveDesiredNames);
    const toAdd = desiredRoles.filter((role) => role.name && !assignedNames.has(role.name));
    const toRemove = assignedRoles.filter(
      (role) => role.name && !desiredNameSet.has(role.name) && (!managedNames || managedNames.has(role.name)),
    );

    if (toAdd.length) {
      await options.client.core.users.addRealmRoleMappings({
        realm: options.realm,
        id: user.id,
        roles: toAdd as never,
      });
    }
    if (toRemove.length) {
      await options.client.core.users.delRealmRoleMappings({
        realm: options.realm,
        id: user.id,
        roles: toRemove as never,
      });
    }
  };

  const persistProviderId = async (document: PluginDocument, providerId: string) => {
    if (options.persistProviderId === false || getDocumentValue(document, 'providerId') === providerId) return;
    document.set(paths.providerId, providerId);
    await document.constructor.updateOne({ _id: document._id }, { $set: { [paths.providerId]: providerId } });
    document.unmarkModified(paths.providerId);
  };

  const syncDocument = async (document: PluginDocument, previous?: Record<string, unknown> | null) => {
    const realmHandle = options.client.realm(options.realm);
    const resolved = await resolveUser(document, previous);
    let user = resolved.user;
    let created = false;
    const payload = buildPayload(document);

    if (!user) {
      const username = getUsername(document);
      if (!username) throw new Error('Cannot create a Keycloak user without a username or email');
      payload.attributes = mergeAttributes(null, document);
      user = await realmHandle.user(username).create(payload);
      created = true;
    }

    if (!user?.id) throw new Error('Keycloak did not return a user ID');
    const userId = user.id;

    const previousEmail = normalizeEmail(getPreviousValue(previous, 'email'));
    const currentEmail = normalizeEmail(getDocumentValue(document, 'email'));
    const remoteEmail = normalizeEmail(user.email);
    const emailChanged =
      !created &&
      syncFields.email &&
      currentEmail !== null &&
      (previousEmail !== currentEmail || remoteEmail !== currentEmail);

    if (!created) {
      if (emailChanged) payload.emailVerified = false;
      payload.attributes = mergeAttributes(user, document);
      await options.client.core.users.update({ realm: options.realm, id: userId }, payload);
      user = { ...user, ...payload };
    }

    await syncRoles(user, document);
    await persistProviderId(document, userId);

    if (emailChanged && options.sendVerificationEmailOnChange !== false) {
      await options.client.core.users.sendVerifyEmail({ realm: options.realm, id: userId });
    }
  };

  const deleteDocument = async (document: PluginDocument) => {
    const { user } = await resolveUser(document);
    if (user?.id) await options.client.core.users.del({ realm: options.realm, id: user.id });
  };

  schema.pre('save', async function keycloakUserSyncPreSave(this: PluginDocument) {
    const shouldSync = this.isNew || trackedPaths.some((path) => this.isModified(path));
    const state: SyncState = { shouldSync };
    this.$locals[syncStateKey] = state;
    if (!shouldSync || this.isNew) return;
    state.previous = await this.constructor.findById(this._id).select(trackedPaths).lean();
  });

  schema.post('save', async function keycloakUserSyncPostSave(this: PluginDocument) {
    const state = getState(this);
    if (!state?.shouldSync) return;
    try {
      await syncDocument(this, state.previous);
    } catch (error) {
      await handleError(error, { operation: 'save', document: this });
    }
  });

  schema.pre(
    'deleteOne',
    { document: true, query: false },
    async function keycloakUserSyncPreDelete(this: PluginDocument) {
      try {
        await deleteDocument(this);
      } catch (error) {
        await handleError(error, { operation: 'delete', document: this });
      }
    },
  );
}
