import KeycloakAdminClientFluent, {
  createManagedKeycloakClient,
  type ManagedKeycloakClientOptions,
  type ManagedKeycloakCredential,
} from '@egose/keycloak-fluent';
import type { ClientSession, Schema } from 'mongoose';

import {
  assertSafeAttributeKey,
  buildProfilePayload,
  buildTrackedPaths,
  getDesiredPassword,
  getDesiredRoles,
  getDocumentValue,
  getPathValue,
  mergeAttributes,
  normalizeEmail,
  planChangedFields,
  planEmailVerification,
  stringValue,
  uniqueStrings,
} from './keycloak-user-sync/planner';

export { createManagedKeycloakClient, type ManagedKeycloakClientOptions };
export type ManagedKeycloakClientSecret = ManagedKeycloakCredential;

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

export type KeycloakUserIdentityField = 'providerId' | 'username' | 'email';
export type KeycloakUserSyncField =
  | 'username'
  | 'email'
  | 'emailVerified'
  | 'firstName'
  | 'lastName'
  | 'enabled'
  | 'roles'
  | 'attributes'
  | 'password';

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
  password: string;
}

export interface KeycloakUserSyncErrorContext {
  operation: 'save' | 'delete';
  localDocumentId?: string;
}

export interface KeycloakUserSyncSensitiveErrorContext extends KeycloakUserSyncErrorContext {
  document: unknown;
}

/**
 * Allowlisted logger error summary. The logger boundary never receives the
 * original error, its message/stack/cause, transport request/response data,
 * or arbitrary enumerable properties — only a sanitized name plus optional
 * machine codes. `onError` still receives the original error for private
 * processing.
 */
export interface KeycloakUserSyncLoggedError {
  readonly name: string;
  readonly code?: string;
  readonly status?: number;
}

export interface KeycloakUserSyncLogContext extends KeycloakUserSyncErrorContext {
  readonly error: KeycloakUserSyncLoggedError;
}

export interface KeycloakUserSyncLogger {
  error(message: string, context: KeycloakUserSyncLogContext): void | Promise<void>;
}

export interface KeycloakUserSyncDocument {
  get(path: string): unknown;
}

export interface KeycloakUserSyncPluginOptions {
  /** A client that can provide admin access tokens. Use createManagedKeycloakClient for lazy managed authentication. */
  client: KeycloakAdminClientFluent;
  realm: string;
  /**
   * Identity fields to use. Must be non-empty. Defaults to providerId, username, then email.
   * `providerId` is treated as server-controlled after persistence and cannot be reassigned by ordinary saves.
   */
  identifyBy?: KeycloakUserIdentityField | readonly KeycloakUserIdentityField[];
  /** Override the Mongoose path used for each application-user property. Built-in synced fields must exist in the schema. */
  paths?: Partial<KeycloakUserSyncPaths>;
  /** Set a field to false to exclude it from change detection and Keycloak updates. */
  syncFields?: Partial<Record<KeycloakUserSyncField, boolean>>;
  /** Convert the configured roles path into Keycloak realm-role names. Role removals are limited by `managedRoles`. */
  mapRoles?: (roles: unknown, document: KeycloakUserSyncDocument) => readonly string[];
  /** Convert document state into Keycloak user attributes. Values are normalized to string arrays and unsafe keys are rejected. */
  mapAttributes?: (document: KeycloakUserSyncDocument) => Record<string, unknown> | null | undefined;
  /** Convert document state into a plaintext Keycloak password. Only used when syncFields.password is true. */
  mapPassword?: (document: KeycloakUserSyncDocument) => string | null | undefined;
  /** Mongoose paths that should trigger attribute syncing when mapAttributes reads dynamic fields. */
  attributePaths?: readonly string[];
  /**
   * Mongoose paths that should trigger role syncing when mapRoles reads
   * fields beyond the configured roles path (e.g. a tier or plan field).
   * Honored only while `syncFields.roles` is enabled. The configured roles
   * path always triggers; these are additional explicit dependencies.
   */
  rolePaths?: readonly string[];
  /**
   * Mongoose paths that should trigger password syncing when mapPassword
   * reads fields beyond the configured password path (e.g. a virtual
   * backing field or pending-password input). Honored only while
   * `syncFields.password` is enabled. The mapper itself is still evaluated
   * only for creation or an actual password-sync intent.
   */
  passwordPaths?: readonly string[];
  /** Attribute keys owned by this plugin. Only managed keys are removed when missing from the mapper result. */
  managedAttributes?: readonly string[];
  /** Role names this plugin owns. Role removal is limited to this set; without it, role sync is additive-only. */
  managedRoles?: readonly string[];
  /** Create missing desired realm roles before assigning them. Defaults to true; disable to fail on unknown roles. */
  ensureRoles?: boolean;
  /** Maximum desired role names accepted for one sync operation. Defaults to 100. */
  maxRolesPerSync?: number;
  /** Save a newly resolved Keycloak ID to the providerId path. Defaults to true. The providerId path is immutable after persistence. */
  persistProviderId?: boolean;
  /** Send VERIFY_EMAIL after changing an existing user's email when emailVerified syncing is enabled. Defaults to true. */
  sendVerificationEmailOnChange?: boolean;
  /** Mark reset-password credentials for created and existing users as temporary. Defaults to false. */
  passwordTemporary?: boolean;
  /**
   * Called after a sync error. By default the context contains only safe metadata.
   * Enable includeDocumentInErrorContext only for private handlers that can receive sensitive document state.
   */
  onError?: (
    error: unknown,
    context: KeycloakUserSyncErrorContext | KeycloakUserSyncSensitiveErrorContext,
  ) => void | Promise<void>;
  /** Include the full Mongoose document in onError context. The document may contain plaintext passwords and PII. */
  includeDocumentInErrorContext?: boolean;
  /** Set to false to disable logging or provide a structured logger. Defaults to console. */
  logger?: KeycloakUserSyncLogger | false;
  /** Set to false to let document saves succeed after a Keycloak error. Deletes still block on remote delete failure. Defaults to true. */
  throwOnError?: boolean;
}

type PluginDocument = KeycloakUserSyncDocument & {
  _id: unknown;
  isNew: boolean;
  $locals: Record<string, unknown>;
  constructor: {
    findById(id: unknown): {
      select(paths: string[]): {
        session(session: ClientSession | null): { lean(): Promise<Record<string, unknown> | null> };
        lean(): Promise<Record<string, unknown> | null>;
      };
    };
    updateOne(
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: { session?: ClientSession | null },
    ): Promise<unknown>;
  };
  $session(): ClientSession | null;
  set(path: string, value: unknown): void;
  unmarkModified(path: string): void;
  isModified(path: string): boolean;
};

type SyncState = {
  shouldSync: boolean;
  passwordChanged: boolean;
  changedFields: ReadonlySet<KeycloakUserSyncField | 'providerId'>;
  wasNew: boolean;
  previous?: Record<string, unknown> | null;
};

type NormalizedKeycloakUserSyncPluginOptions = Omit<
  KeycloakUserSyncPluginOptions,
  | 'realm'
  | 'identifyBy'
  | 'paths'
  | 'syncFields'
  | 'attributePaths'
  | 'rolePaths'
  | 'passwordPaths'
  | 'managedAttributes'
  | 'managedRoles'
> & {
  realm: string;
  identifyBy: readonly KeycloakUserIdentityField[];
  paths: Readonly<KeycloakUserSyncPaths>;
  syncFields: Readonly<Record<KeycloakUserSyncField, boolean>>;
  attributePaths?: readonly string[];
  rolePaths?: readonly string[];
  passwordPaths?: readonly string[];
  managedAttributes?: readonly string[];
  managedRoles?: readonly string[];
};

const syncStateKey = 'keycloakUserSync';
const pluginRegisteredKey = Symbol('keycloakUserSyncPluginRegistered');
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
  password: 'password', // pragma: allowlist secret
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
  password: false,
};

const identityFields = ['providerId', 'username', 'email'] as const;
const syncFieldNames = [
  'username',
  'email',
  'emailVerified',
  'firstName',
  'lastName',
  'enabled',
  'roles',
  'attributes',
  'password',
] as const;
const pathNames = [
  'providerId',
  'username',
  'email',
  'emailVerified',
  'firstName',
  'lastName',
  'enabled',
  'archived',
  'roles',
  'attributes',
  'password',
] as const;

const isIdentityField = (value: unknown): value is KeycloakUserIdentityField =>
  typeof value === 'string' && (identityFields as readonly string[]).includes(value);

const hasSchemaPath = (schema: Schema, path: string) => {
  const schemaWithVirtuals = schema as Schema & { virtualpath?(path: string): unknown };
  return Boolean(schema.path(path) ?? schemaWithVirtuals.virtualpath?.(path));
};

const requiredString = (value: unknown, name: string) => {
  const normalized = stringValue(value);
  if (!normalized) throw new Error(`keycloakUserSyncPlugin requires a non-empty ${name}`);
  return normalized;
};

const validateOptionKeys = (value: unknown, allowed: readonly string[], name: string) => {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`keycloakUserSyncPlugin ${name} must be an object`);
  }

  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`keycloakUserSyncPlugin received unsupported ${name} key "${key}"`);
  }
};

const normalizeOptionalStringList = (values: unknown, name: string) => {
  if (values === undefined) return undefined;
  if (!Array.isArray(values)) throw new Error(`keycloakUserSyncPlugin ${name} must be an array of non-empty strings`);

  return Object.freeze(
    uniqueStrings(
      values.map((value, index) => {
        const normalized = stringValue(value);
        if (!normalized) throw new Error(`keycloakUserSyncPlugin ${name}[${index}] must be a non-empty string`);
        if (name === 'managedAttributes') assertSafeAttributeKey(normalized);
        return normalized;
      }),
    ),
  );
};

const normalizeMaxRolesPerSync = (value: unknown) => {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error('keycloakUserSyncPlugin maxRolesPerSync must be a positive safe integer');
  }
  return value as number;
};

const normalizeIdentityList = (identifyBy: KeycloakUserSyncPluginOptions['identifyBy']) => {
  const configured =
    identifyBy === undefined
      ? ['providerId', 'username', 'email']
      : typeof identifyBy === 'string'
        ? [identifyBy]
        : identifyBy;

  if (!Array.isArray(configured)) {
    throw new Error('keycloakUserSyncPlugin identifyBy must be a supported identity or non-empty identity array');
  }

  const identities = configured.map((identity, index) => {
    if (!isIdentityField(identity)) {
      throw new Error(`keycloakUserSyncPlugin identifyBy[${index}] must be providerId, username, or email`);
    }
    return identity;
  });

  const uniqueIdentities = Object.freeze([...new Set(identities)]);
  if (uniqueIdentities.length === 0) throw new Error('keycloakUserSyncPlugin identifyBy must not be empty');
  return uniqueIdentities;
};

const normalizePaths = (paths: KeycloakUserSyncPluginOptions['paths']) => {
  validateOptionKeys(paths, pathNames, 'paths');
  const normalized = { ...defaultPaths };

  for (const name of pathNames) {
    const value = paths?.[name];
    if (value !== undefined) normalized[name] = requiredString(value, `paths.${name}`);
  }

  return Object.freeze(normalized);
};

const normalizeSyncFields = (syncFields: KeycloakUserSyncPluginOptions['syncFields']) => {
  validateOptionKeys(syncFields, syncFieldNames, 'syncFields');
  return Object.freeze({ ...defaultSyncFields, ...syncFields });
};

const validateConfiguredSchemaPath = (schema: Schema, path: string, name: string) => {
  if (!hasSchemaPath(schema, path)) {
    throw new Error(`keycloakUserSyncPlugin ${name} path "${path}" does not exist in the schema`);
  }
};

const normalizeOptions = (schema: Schema, options: KeycloakUserSyncPluginOptions) => {
  if (!options?.client) throw new Error('keycloakUserSyncPlugin requires a client option');

  const paths = normalizePaths(options.paths);
  const syncFields = normalizeSyncFields(options.syncFields);
  const normalized: NormalizedKeycloakUserSyncPluginOptions = Object.freeze({
    ...options,
    realm: requiredString(options.realm, 'realm option'),
    identifyBy: normalizeIdentityList(options.identifyBy),
    paths,
    syncFields,
    attributePaths: normalizeOptionalStringList(options.attributePaths, 'attributePaths'),
    rolePaths: normalizeOptionalStringList(options.rolePaths, 'rolePaths'),
    passwordPaths: normalizeOptionalStringList(options.passwordPaths, 'passwordPaths'),
    managedAttributes: normalizeOptionalStringList(options.managedAttributes, 'managedAttributes'),
    managedRoles: normalizeOptionalStringList(options.managedRoles, 'managedRoles'),
    maxRolesPerSync: normalizeMaxRolesPerSync(options.maxRolesPerSync),
  });

  validateConfiguredSchemaPath(schema, paths.providerId, 'paths.providerId');
  for (const identity of normalized.identifyBy)
    validateConfiguredSchemaPath(schema, paths[identity], `paths.${identity}`);
  if (syncFields.emailVerified) validateConfiguredSchemaPath(schema, paths.emailVerified, 'paths.emailVerified');
  if (syncFields.firstName) validateConfiguredSchemaPath(schema, paths.firstName, 'paths.firstName');
  if (syncFields.lastName) validateConfiguredSchemaPath(schema, paths.lastName, 'paths.lastName');
  if (syncFields.enabled && !hasSchemaPath(schema, paths.enabled) && !hasSchemaPath(schema, paths.archived)) {
    throw new Error(
      `keycloakUserSyncPlugin requires either paths.enabled "${paths.enabled}" or paths.archived "${paths.archived}" in the schema`,
    );
  }
  if (syncFields.roles && !normalized.mapRoles) validateConfiguredSchemaPath(schema, paths.roles, 'paths.roles');
  if (syncFields.attributes && !normalized.mapAttributes)
    validateConfiguredSchemaPath(schema, paths.attributes, 'paths.attributes');
  if (syncFields.password && !normalized.mapPassword)
    validateConfiguredSchemaPath(schema, paths.password, 'paths.password');

  return normalized;
};

const getState = (document: PluginDocument) => document.$locals[syncStateKey] as SyncState | undefined;

const loggerTokenPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

const toLoggerToken = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > 64) return undefined;
  if (!loggerTokenPattern.test(value)) return undefined;
  return value;
};

/**
 * Build the allowlisted logger error summary without touching unsafe error
 * surfaces. Only `name`, `code`, and `status`/`statusCode` are read (each
 * validated); message, stack, cause, request/response, enumerable payload
 * properties, and custom inspection hooks are never read, spread, or
 * serialized, so transport secrets cannot flow into logs.
 */
const toLoggedError = (error: unknown): KeycloakUserSyncLoggedError => {
  if (typeof error !== 'object' || error === null) return { name: 'UnknownError' };
  try {
    const candidate = error as { name?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
    const name = toLoggerToken(candidate.name) ?? 'Error';
    const code = toLoggerToken(candidate.code);
    const rawStatus = candidate.status ?? candidate.statusCode;
    const status =
      typeof rawStatus === 'number' && Number.isSafeInteger(rawStatus) && rawStatus >= 0 && rawStatus <= 999
        ? rawStatus
        : undefined;
    return { name, ...(code === undefined ? {} : { code }), ...(status === undefined ? {} : { status }) };
  } catch {
    return { name: 'Error' };
  }
};

const getDocumentSession = (document: PluginDocument) => document.$session?.() ?? null;

const assertNoDocumentSession = (document: PluginDocument, operation: 'save' | 'delete') => {
  if (getDocumentSession(document)) {
    throw new Error(
      `keycloakUserSyncPlugin direct ${operation} hooks do not support Mongoose sessions or transactions; use an application-owned outbox/worker for transactional delivery`,
    );
  }
};

/**
 * Synchronizes document saves and document `deleteOne()` calls with a Keycloak user.
 * Query updates and query deletes are intentionally not intercepted because they do not provide a document identity.
 * Direct hooks are non-atomic with MongoDB and reject Mongoose sessions/transactions; use an application outbox for transactional delivery.
 */
export function keycloakUserSyncPlugin(schema: Schema, rawOptions: KeycloakUserSyncPluginOptions) {
  const schemaWithMarker = schema as Schema & { [pluginRegisteredKey]?: boolean };
  if (schemaWithMarker[pluginRegisteredKey]) {
    throw new Error('keycloakUserSyncPlugin is already registered on this schema');
  }

  const options = normalizeOptions(schema, rawOptions);
  schemaWithMarker[pluginRegisteredKey] = true;

  const paths = options.paths;
  const syncFields = options.syncFields;
  const identities = options.identifyBy;
  const realmHandle = options.client.realm(options.realm);
  const trackedPaths = buildTrackedPaths(options);
  const identitySnapshotPaths = uniqueStrings([...trackedPaths, paths.providerId, paths.username, paths.email]);

  const buildSafeErrorContext = (operation: KeycloakUserSyncErrorContext['operation'], document: PluginDocument) => ({
    operation,
    localDocumentId: document._id === undefined || document._id === null ? undefined : String(document._id),
  });

  const handleError = async (
    error: unknown,
    operation: KeycloakUserSyncErrorContext['operation'],
    document: PluginDocument,
  ) => {
    const safeContext = buildSafeErrorContext(operation, document);
    const logger = options.logger === false ? null : ((options.logger ?? console) as KeycloakUserSyncLogger);
    try {
      // Safe logging boundary: only the allowlisted summary reaches the
      // logger. The original error is preserved below for throwing and for
      // the private onError callback, which is a distinct channel.
      await logger?.error(`Keycloak user sync failed during ${operation}`, {
        ...safeContext,
        error: toLoggedError(error),
      });
    } catch {
      // Preserve the original sync error; logging must not change the sync policy.
    }

    try {
      const callbackContext = options.includeDocumentInErrorContext ? { ...safeContext, document } : safeContext;
      await options.onError?.(error, callbackContext);
    } catch {
      // Preserve the original sync error; callback failures are observer failures.
    }

    if (options.throwOnError !== false) throw error;
  };

  const readDocumentValue = (document: PluginDocument, field: keyof KeycloakUserSyncPaths) =>
    getDocumentValue(document, paths, field);
  const getPreviousValue = (previous: Record<string, unknown> | null | undefined, field: keyof KeycloakUserSyncPaths) =>
    getPathValue(previous, paths[field]);

  const getUsername = (document: PluginDocument) =>
    stringValue(readDocumentValue(document, 'username')) ?? stringValue(readDocumentValue(document, 'email'));

  const readPersistedSnapshot = async (document: PluginDocument) =>
    document.constructor
      .findById(document._id)
      .select(identitySnapshotPaths)
      .session(getDocumentSession(document))
      .lean();

  /**
   * Single persisted-identity resolution boundary shared by saves and deletes.
   *
   * New local documents perform explicitly authorized initial linking through
   * their current identity values. Existing documents resolve only through
   * their persisted snapshot: a stored providerId is authoritative, a stale
   * binding fails closed instead of falling through to an unrelated account,
   * and current mutable username/email values that resolve to a different
   * remote user are reported as identity conflicts. Callers must not touch
   * that remote account when this function throws.
   */
  const resolveUser = async (
    document: PluginDocument,
    snapshot: Record<string, unknown> | null | undefined,
    wasNew: boolean,
  ): Promise<{ user: KeycloakUser | null; duplicateEmailsAllowed: boolean }> => {
    const realm = await realmHandle.get();
    if (!realm) throw new Error(`Keycloak realm "${options.realm}" was not found`);

    const duplicateEmailsAllowed = realm.duplicateEmailsAllowed === true;
    const orderedIdentities = duplicateEmailsAllowed
      ? (['providerId', 'username', 'email'] as const).filter((identity) => identities.includes(identity))
      : identities;

    const getCompleteUserById = async (user: KeycloakUser) => {
      if (!user.id) return user;
      return (await realmHandle.userById(user.id).get()) ?? user;
    };

    const findByProviderId = async (providerId: string) => realmHandle.userById(providerId).get();
    const findByUsername = async (username: string) => realmHandle.user(username).get();
    const findByEmail = async (email: string) => {
      const matches = (
        await realmHandle.searchUsers(email, { attribute: 'email', exact: true, first: 0, max: 2 })
      ).filter((user) => normalizeEmail(user.email) === normalizeEmail(email));

      if (matches.length > 1) {
        throw new Error('Cannot identify a unique Keycloak user for the configured email identity');
      }
      if (matches.length === 1) return getCompleteUserById(matches[0]);
      return null;
    };

    const findByIdentity = async (identity: KeycloakUserIdentityField, value: string) => {
      if (identity === 'providerId') return findByProviderId(value);
      if (identity === 'username') return findByUsername(value);
      return findByEmail(value);
    };

    const identityConflict = () =>
      new Error(
        'keycloakUserSyncPlugin detected a Keycloak identity conflict; refusing to relink to a different remote user',
      );

    if (wasNew) {
      for (const identity of orderedIdentities) {
        for (const value of uniqueStrings([
          readDocumentValue(document, identity),
          getPreviousValue(snapshot, identity),
        ])) {
          const user = await findByIdentity(identity, value);
          if (user) return { user, duplicateEmailsAllowed };
        }
      }

      return { user: null, duplicateEmailsAllowed };
    }

    if (!snapshot) {
      throw new Error(
        'keycloakUserSyncPlugin cannot verify the persisted Keycloak identity for this document; refusing to sync a possibly relinked account',
      );
    }

    const persistedValue = (identity: KeycloakUserIdentityField) => stringValue(getPreviousValue(snapshot, identity));
    const currentValue = (identity: KeycloakUserIdentityField) => stringValue(readDocumentValue(document, identity));
    const persistedProviderId = persistedValue('providerId');
    const currentProviderId = currentValue('providerId');
    if (persistedProviderId && currentProviderId && persistedProviderId !== currentProviderId) {
      throw new Error('keycloakUserSyncPlugin providerId is server-controlled and cannot be changed after persistence');
    }

    // A changed username always identifies a different unique account. A
    // changed email does so only when the realm forbids duplicate emails;
    // duplicate-email realms may legitimately share one address across
    // accounts bound by providerId, and the binding below keeps B untouched.
    const isRelinkProtected = (identity: KeycloakUserIdentityField) =>
      identity === 'username' || (identity === 'email' && !duplicateEmailsAllowed);

    const checkCurrentDoesNotRelink = async (identity: KeycloakUserIdentityField, boundId: string) => {
      if (!identities.includes(identity) || !isRelinkProtected(identity)) return;
      const current = currentValue(identity);
      if (!current) return;
      const persisted = persistedValue(identity);
      const unchanged =
        identity === 'email'
          ? persisted !== null && normalizeEmail(persisted) === normalizeEmail(current)
          : persisted === current;
      if (persisted !== null && unchanged) return;
      const user = await findByIdentity(identity, current);
      if (user?.id && user.id !== boundId) throw identityConflict();
    };

    if (persistedProviderId) {
      // The stored providerId is authoritative: it keeps duplicate-email
      // realms working (one address may legitimately be shared) and avoids
      // extra lookups on every sync. Current-value conflicts are still
      // verified below, and a stale binding fails closed without fallthrough.
      const bound = await findByProviderId(persistedProviderId);
      if (!bound?.id) {
        throw new Error(
          'keycloakUserSyncPlugin persisted Keycloak identity no longer exists; refusing to relink to a different remote user',
        );
      }
      await checkCurrentDoesNotRelink('username', bound.id);
      await checkCurrentDoesNotRelink('email', bound.id);
      return { user: bound, duplicateEmailsAllowed };
    }

    let bound: KeycloakUser | null = null;
    for (const identity of orderedIdentities) {
      if (identity === 'providerId') continue;
      const persisted = persistedValue(identity);
      if (!persisted) continue;
      const user = await findByIdentity(identity, persisted);
      if (!user?.id) continue;
      if (bound?.id && bound.id !== user.id) throw identityConflict();
      bound ??= user;
    }

    if (bound?.id) {
      await checkCurrentDoesNotRelink('username', bound.id);
      await checkCurrentDoesNotRelink('email', bound.id);
      if (currentProviderId) {
        const owner = await findByProviderId(currentProviderId);
        if (owner?.id && owner.id !== bound.id) throw identityConflict();
      }
      return { user: bound, duplicateEmailsAllowed };
    }

    // No persisted binding exists: any current identity that already resolves
    // remotely would be a silent relink, so fail closed instead of linking it.
    if (currentProviderId) {
      const owner = await findByProviderId(currentProviderId);
      if (owner?.id) throw identityConflict();
    }
    for (const identity of orderedIdentities) {
      if (identity === 'providerId') continue;
      const current = currentValue(identity);
      if (!current) continue;
      const user = await findByIdentity(identity, current);
      if (user?.id) throw identityConflict();
    }

    return { user: null, duplicateEmailsAllowed };
  };

  const getProvisioningFlags = (error: unknown) => {
    if (typeof error !== 'object' || error === null) return null;
    const candidate = error as {
      name?: unknown;
      accountPersists?: unknown;
      accountEnabled?: unknown;
      passwordApplied?: unknown;
      initialProvisioning?: unknown;
    };
    if (
      candidate.name !== 'UserPasswordProvisioningError' &&
      !('accountPersists' in candidate) &&
      !('initialProvisioning' in candidate)
    ) {
      return null;
    }
    return candidate;
  };

  const isAlreadyExistsError = (error: unknown) =>
    error instanceof Error && /already exists in realm/.test(error.message);

  const readIntendedEnabled = (document: PluginDocument) => {
    if (!syncFields.enabled) return undefined;
    const archived = readDocumentValue(document, 'archived');
    if (typeof archived === 'boolean') return !archived;
    const enabled = readDocumentValue(document, 'enabled');
    if (typeof enabled === 'boolean') return enabled;
    return undefined;
  };

  /**
   * Small private creation-recovery flow with explicit outcome, credential,
   * and enablement state.
   *
   * Only new local documents may recover (explicitly authorized initial
   * linking). Recovery requires proof that this attempt left a disabled
   * account behind: a password-provisioning error with `accountPersists`
   * (matching the supported fluent contract) or, when no password was
   * involved, the existing post-create convergence case. Unrelated creation
   * errors and already-exists collisions rethrow without touching the
   * resolved account, so another account's credentials can never be reset
   * here. Password completion additionally requires an exact username match.
   */
  const recoverPartialCreation = async (
    document: PluginDocument,
    username: string,
    creationError: unknown,
    desiredPassword: string | null,
  ) => {
    if (identities.length === 0) throw creationError;
    if (isAlreadyExistsError(creationError)) throw creationError;
    const flags = getProvisioningFlags(creationError);
    if (flags && flags.accountPersists === false) throw creationError;
    if (desiredPassword && !(flags && flags.accountPersists === true)) throw creationError;
    const recoveredUser = await resolveCreatedUser(document, username);
    if (!recoveredUser?.id) throw creationError;
    if (desiredPassword) {
      const candidateUsername = stringValue(recoveredUser.username);
      if (!candidateUsername || candidateUsername !== username) throw creationError;
    }
    return { user: recoveredUser, passwordAlreadyApplied: flags?.passwordApplied === true };
  };

  const resolveCreatedUser = async (document: PluginDocument, username: string) => {
    const userByUsername = await realmHandle.user(username).get();
    if (userByUsername) return userByUsername;

    const email = stringValue(readDocumentValue(document, 'email'));
    if (!email) return null;

    const matches = (
      await realmHandle.searchUsers(email, { attribute: 'email', exact: true, first: 0, max: 2 })
    ).filter((user) => normalizeEmail(user.email) === normalizeEmail(email));

    if (matches.length > 1) throw new Error('Cannot identify a unique Keycloak user for the configured email identity');
    const match = matches[0];
    if (!match?.id) return match ?? null;
    return (await realmHandle.userById(match.id).get()) ?? match;
  };

  const syncRoles = async (user: KeycloakUser, document: PluginDocument) => {
    if (!syncFields.roles || !user.id) return;

    const desiredNames = getDesiredRoles(document, options);
    if (desiredNames === null) return;
    const maxRolesPerSync = options.maxRolesPerSync ?? 100;
    if (desiredNames.length > maxRolesPerSync) {
      throw new Error(`keycloakUserSyncPlugin supports at most ${maxRolesPerSync} desired roles per sync operation`);
    }
    if (desiredNames.length === 0 && !options.managedRoles) return;

    await realmHandle.userById(user.id).reconcileRealmRoles(desiredNames, {
      ensureMissing: options.ensureRoles !== false,
      managedRoleNames: options.managedRoles,
      maxRoles: maxRolesPerSync,
    });
  };

  const persistProviderId = async (document: PluginDocument, providerId: string) => {
    if (options.persistProviderId === false || readDocumentValue(document, 'providerId') === providerId) return;
    document.set(paths.providerId, providerId);
    await document.constructor.updateOne(
      { _id: document._id },
      { $set: { [paths.providerId]: providerId } },
      { session: getDocumentSession(document) },
    );
    document.unmarkModified(paths.providerId);
  };

  const syncDocument = async (document: PluginDocument, state: SyncState) => {
    const resolved = await resolveUser(document, state.previous, state.wasNew);
    let user = resolved.user;
    let created = false;
    let recoveredPartial = false;
    let passwordAlreadyApplied = false;
    const shouldSyncProfile =
      state.wasNew ||
      ['username', 'email', 'emailVerified', 'firstName', 'lastName', 'enabled'].some((field) =>
        state.changedFields.has(field as KeycloakUserSyncField),
      );
    const shouldSyncAttributes = state.wasNew || state.changedFields.has('attributes');
    const payload = shouldSyncProfile
      ? buildProfilePayload(document, options, Boolean(resolved.user), state.wasNew ? undefined : state.changedFields)
      : {};
    // Evaluate the password mapper only for creation or an actual
    // password-sync intent. Unrelated updates must neither invoke the mapper
    // nor trigger credential operations. The cached value preserves MOO-02
    // recovery: creation evaluates once, and a recovered partial creation
    // reuses that same outcome for its reset-before-enable step.
    let cachedPassword: string | null | undefined;
    let passwordEvaluated = false;
    const readDesiredPassword = () => {
      if (!passwordEvaluated) {
        cachedPassword = getDesiredPassword(document, options);
        passwordEvaluated = true;
      }
      return cachedPassword ?? null;
    };

    if (!user) {
      const username = getUsername(document);
      if (!username) throw new Error('Cannot create a Keycloak user without a username or email');
      payload.attributes = mergeAttributes(null, document, options);
      const creationPassword = readDesiredPassword();
      try {
        user =
          (await realmHandle.user(username).create({
            username,
            ...payload,
            ...(creationPassword && {
              password: creationPassword,
              passwordTemporary: options.passwordTemporary ?? false,
            }),
          })) ?? null;
        created = true;
      } catch (error) {
        // Creation recovery resolves through live identity values, which is
        // only authorized initial linking for new local documents. An
        // existing document without a persisted binding must fail closed
        // instead of relinking to whoever currently matches.
        if (!state.wasNew) throw error;
        const recovered = await recoverPartialCreation(document, username, error, creationPassword);
        user = recovered.user;
        recoveredPartial = true;
        passwordAlreadyApplied = recovered.passwordAlreadyApplied;
      }
    }

    if (!user?.id) throw new Error('Keycloak did not return a user ID');
    const userId = user.id;
    // Safe persistence before credential work so a retry resolves through the
    // authoritative MOO-01 providerId binding instead of a fresh lookup.
    await persistProviderId(document, userId);

    const emailVerificationPlan = planEmailVerification({
      created,
      wasNew: state.wasNew,
      syncEmail: syncFields.email,
      syncEmailVerified: syncFields.emailVerified,
      previousEmail: getPreviousValue(state.previous, 'email'),
      currentEmail: readDocumentValue(document, 'email'),
      remoteEmail: user.email,
    });

    // Explicit credential/enablement state: a required password must succeed
    // before the account is enabled. Recovered partial creations and password
    // changes therefore apply the profile without `enabled`, reset the
    // credential with the configured temporary policy, and only then enable.
    // No password is ever placed in a generic profile payload.
    const desiredPassword =
      !created && !passwordAlreadyApplied && (recoveredPartial || state.passwordChanged)
        ? readDesiredPassword()
        : (cachedPassword ?? null);
    const willResetPassword =
      Boolean(desiredPassword) && !created && !passwordAlreadyApplied && (recoveredPartial || state.passwordChanged);

    if (!created) {
      if (emailVerificationPlan.initialLinkSameEmail) delete payload.emailVerified;
      if (emailVerificationPlan.changed) {
        const email = stringValue(readDocumentValue(document, 'email'));
        if (syncFields.email && email) payload.email = email;
        payload.emailVerified = false;
      }
      if (shouldSyncAttributes) payload.attributes = mergeAttributes(user, document, options);
      if (willResetPassword) {
        const { enabled: deferredEnabled, ...profileWithoutEnabled } = payload;
        const intendedEnabled =
          typeof deferredEnabled === 'boolean' ? deferredEnabled : (readIntendedEnabled(document) ?? true);
        if (Object.keys(profileWithoutEnabled).length > 0) {
          await realmHandle.userById(userId).update(profileWithoutEnabled);
          user = { ...user, ...profileWithoutEnabled };
        }
        await realmHandle
          .userById(userId)
          .resetPassword(desiredPassword as string, { temporary: options.passwordTemporary ?? false });
        user = { ...user };
        await realmHandle.userById(userId).update({ enabled: intendedEnabled });
        user = { ...user, enabled: intendedEnabled };
      } else {
        if (Object.keys(payload).length > 0) {
          await realmHandle.userById(userId).update(payload);
          user = { ...user, ...payload };
        }
      }
    }

    if (created || state.changedFields.has('roles')) await syncRoles(user, document);

    if (emailVerificationPlan.changed && options.sendVerificationEmailOnChange !== false) {
      await realmHandle.userById(userId).sendVerifyEmail();
    }
  };

  const deleteDocument = async (document: PluginDocument) => {
    if (document.isNew) {
      throw new Error('keycloakUserSyncPlugin cannot delete a Keycloak user for a document that was never persisted');
    }
    const snapshot = await readPersistedSnapshot(document);
    const { user } = await resolveUser(document, snapshot, false);
    if (user?.id) await realmHandle.userById(user.id).delete();
  };

  schema.pre('save', async function keycloakUserSyncPreSave(this: PluginDocument) {
    assertNoDocumentSession(this, 'save');
    const providerIdChanged = !this.isNew && this.isModified(paths.providerId);
    const changePlan = planChangedFields(
      options,
      this.isNew,
      (path) => this.isModified(path),
      options.persistProviderId === false ? 'disabled' : this.get(paths.providerId),
    );
    const state: SyncState = { ...changePlan, wasNew: this.isNew };
    this.$locals[syncStateKey] = state;
    if (!state.shouldSync || this.isNew) return;
    state.previous = await readPersistedSnapshot(this);

    if (providerIdChanged) {
      const previousProviderId = stringValue(getPreviousValue(state.previous, 'providerId'));
      const currentProviderId = stringValue(readDocumentValue(this, 'providerId'));
      if (previousProviderId !== currentProviderId) {
        throw new Error(
          'keycloakUserSyncPlugin providerId is server-controlled and cannot be changed after persistence',
        );
      }
    }
  });

  schema.post('save', async function keycloakUserSyncPostSave(this: PluginDocument) {
    const state = getState(this);
    if (!state?.shouldSync) return;
    try {
      await syncDocument(this, state);
    } catch (error) {
      await handleError(error, 'save', this);
    }
  });

  schema.pre(
    'deleteOne',
    { document: true, query: false },
    async function keycloakUserSyncPreDelete(this: PluginDocument) {
      assertNoDocumentSession(this, 'delete');
      try {
        await deleteDocument(this);
      } catch (error) {
        await handleError(error, 'delete', this);
        throw error;
      }
    },
  );
}
