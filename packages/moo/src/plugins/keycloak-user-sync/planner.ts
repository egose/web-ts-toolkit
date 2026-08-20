import type { KeycloakUserSyncDocument, KeycloakUserSyncField, KeycloakUserSyncPaths } from '../keycloak-user-sync';

export type KeycloakUserIdentityField = 'providerId' | 'username' | 'email';

export type RemoteUserSnapshot = {
  id?: string;
  username?: string;
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  attributes?: Record<string, string[]>;
};

export type PlannerOptions = {
  paths: Readonly<KeycloakUserSyncPaths>;
  syncFields: Readonly<Record<KeycloakUserSyncField, boolean>>;
  attributePaths?: readonly string[];
  managedAttributes?: readonly string[];
  managedRoles?: readonly string[];
  mapRoles?: (roles: unknown, document: KeycloakUserSyncDocument) => readonly string[];
  mapAttributes?: (document: KeycloakUserSyncDocument) => Record<string, unknown> | null | undefined;
  mapPassword?: (document: KeycloakUserSyncDocument) => string | null | undefined;
};

export type ChangePlan = {
  changedFields: ReadonlySet<KeycloakUserSyncField | 'providerId'>;
  trackedPaths: readonly string[];
  shouldSync: boolean;
  passwordChanged: boolean;
};

export type EmailVerificationPlan = {
  changed: boolean;
  initialLinkSameEmail: boolean;
};

export type RoleDiff<Role extends { name?: string }> = {
  desiredNames: readonly string[];
  effectiveDesiredNames: readonly string[];
  toAdd: Role[];
  toRemove: Role[];
};

export const dangerousAttributeKeys = new Set(['__proto__', 'prototype', 'constructor']);

export const assertSafeAttributeKey = (key: string) => {
  if (dangerousAttributeKeys.has(key)) {
    throw new Error(`keycloakUserSyncPlugin attribute key "${key}" is not supported`);
  }
};

export const stringValue = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export const normalizeEmail = (value: unknown) => stringValue(value)?.toLowerCase() ?? null;

export const uniqueStrings = (values: readonly unknown[]) => [
  ...new Set(values.map(stringValue).filter((value): value is string => value !== null)),
];

export const getPathValue = (value: Record<string, unknown> | null | undefined, path: string) =>
  path.split('.').reduce<unknown>((current, part) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);

export const normalizeProfileString = (value: unknown, allowClearing: boolean) => {
  if (value === null) return allowClearing ? '' : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed) return trimmed;
  return allowClearing ? '' : null;
};

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

export const normalizeAttributes = (attributes: unknown) => {
  const normalizedAttributes: Record<string, string[]> = Object.create(null);
  if (typeof attributes !== 'object' || attributes === null || Array.isArray(attributes)) return normalizedAttributes;

  for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
    const normalizedKey = stringValue(key);
    if (!normalizedKey) continue;
    assertSafeAttributeKey(normalizedKey);
    const normalizedValue = normalizeAttributeValue(value);
    if (normalizedValue) normalizedAttributes[normalizedKey] = normalizedValue;
  }

  return normalizedAttributes;
};

export const getDocumentValue = (
  document: KeycloakUserSyncDocument,
  paths: Readonly<KeycloakUserSyncPaths>,
  field: keyof KeycloakUserSyncPaths,
) => document.get(paths[field]);

export const buildTrackedPaths = (options: PlannerOptions) =>
  uniqueStrings([
    options.paths.providerId,
    ...Object.entries(options.syncFields)
      .filter(([, enabled]) => enabled)
      .flatMap(([field]) =>
        field === 'enabled'
          ? [options.paths.enabled, options.paths.archived]
          : [options.paths[field as keyof KeycloakUserSyncPaths]],
      ),
    ...(options.syncFields.attributes && options.attributePaths ? options.attributePaths : []),
  ]);

export const planChangedFields = (
  options: PlannerOptions,
  isNew: boolean,
  isModified: (path: string) => boolean,
  currentProviderId: unknown,
) => {
  const changedFields = new Set<KeycloakUserSyncField | 'providerId'>();
  if (isModified(options.paths.providerId)) changedFields.add('providerId');

  for (const [field, enabled] of Object.entries(options.syncFields) as [KeycloakUserSyncField, boolean][]) {
    if (!enabled) continue;
    const paths = field === 'enabled' ? [options.paths.enabled, options.paths.archived] : [options.paths[field]];
    if (paths.some(isModified)) changedFields.add(field);
  }

  if (options.syncFields.attributes && options.attributePaths?.some(isModified)) changedFields.add('attributes');

  const shouldPersistMissingProviderId = stringValue(currentProviderId) === null;
  const shouldSync = isNew || shouldPersistMissingProviderId || changedFields.size > 0;

  return {
    changedFields,
    trackedPaths: buildTrackedPaths(options),
    shouldSync,
    passwordChanged: changedFields.has('password'),
  } satisfies ChangePlan;
};

export const buildProfilePayload = (
  document: KeycloakUserSyncDocument,
  options: PlannerOptions,
  allowClearing = false,
  changedFields?: ReadonlySet<KeycloakUserSyncField | 'providerId'>,
) => {
  const payload: RemoteUserSnapshot = {};
  const shouldInclude = (field: KeycloakUserSyncField) => !changedFields || changedFields.has(field);
  const copyString = (field: 'username' | 'email' | 'firstName' | 'lastName') => {
    if (!options.syncFields[field] || !shouldInclude(field)) return;
    const value = normalizeProfileString(getDocumentValue(document, options.paths, field), allowClearing);
    if (value !== null) payload[field] = value;
  };

  copyString('username');
  copyString('email');
  copyString('firstName');
  copyString('lastName');

  if (
    options.syncFields.emailVerified &&
    shouldInclude('emailVerified') &&
    typeof getDocumentValue(document, options.paths, 'emailVerified') === 'boolean'
  ) {
    payload.emailVerified = getDocumentValue(document, options.paths, 'emailVerified') as boolean;
  }

  if (options.syncFields.enabled && shouldInclude('enabled')) {
    const archived = getDocumentValue(document, options.paths, 'archived');
    const enabled = getDocumentValue(document, options.paths, 'enabled');
    if (typeof archived === 'boolean') payload.enabled = !archived;
    else if (typeof enabled === 'boolean') payload.enabled = enabled;
  }

  return payload;
};

export const getDesiredRoles = (document: KeycloakUserSyncDocument, options: PlannerOptions) => {
  if (!options.syncFields.roles) return null;
  const source = getDocumentValue(document, options.paths, 'roles');
  const mapped = options.mapRoles ? options.mapRoles(source, document) : Array.isArray(source) ? source : null;
  if (!mapped) return null;
  return uniqueStrings(mapped);
};

export const getDesiredAttributes = (document: KeycloakUserSyncDocument, options: PlannerOptions) => {
  if (!options.syncFields.attributes) return null;
  const source = options.mapAttributes
    ? options.mapAttributes(document)
    : getDocumentValue(document, options.paths, 'attributes');
  return normalizeAttributes(source);
};

export const getDesiredPassword = (document: KeycloakUserSyncDocument, options: PlannerOptions) => {
  if (!options.syncFields.password) return null;
  const value = options.mapPassword
    ? options.mapPassword(document)
    : getDocumentValue(document, options.paths, 'password');
  return typeof value === 'string' && value.length > 0 ? value : null;
};

export const mergeAttributes = (
  user: RemoteUserSnapshot | null,
  document: KeycloakUserSyncDocument,
  options: PlannerOptions,
) => {
  const desiredAttributes = getDesiredAttributes(document, options);
  if (!desiredAttributes) return undefined;

  const currentAttributes: Record<string, string[]> = Object.assign(Object.create(null), user?.attributes ?? {});

  if (options.managedAttributes) {
    for (const key of options.managedAttributes) {
      delete currentAttributes[key];
    }
  }

  return Object.assign(Object.create(null), currentAttributes, desiredAttributes);
};

export const planEmailVerification = ({
  created,
  wasNew,
  syncEmail,
  syncEmailVerified,
  previousEmail,
  currentEmail,
  remoteEmail,
}: {
  created: boolean;
  wasNew: boolean;
  syncEmail: boolean;
  syncEmailVerified: boolean;
  previousEmail: unknown;
  currentEmail: unknown;
  remoteEmail: unknown;
}) => {
  const normalizedPreviousEmail = normalizeEmail(previousEmail);
  const normalizedCurrentEmail = normalizeEmail(currentEmail);
  const normalizedRemoteEmail = normalizeEmail(remoteEmail);
  const emailSyncTargetChanged =
    !created && syncEmail && normalizedCurrentEmail !== null && normalizedRemoteEmail !== normalizedCurrentEmail;
  const persistedLocalEmailChanged =
    !created &&
    !wasNew &&
    syncEmail &&
    normalizedCurrentEmail !== null &&
    normalizedPreviousEmail !== normalizedCurrentEmail;
  const initialLinkSameEmail =
    wasNew && !created && normalizedCurrentEmail !== null && normalizedRemoteEmail === normalizedCurrentEmail;

  return {
    changed: syncEmailVerified && (persistedLocalEmailChanged || (emailSyncTargetChanged && !initialLinkSameEmail)),
    initialLinkSameEmail,
  } satisfies EmailVerificationPlan;
};

export const planRoleDiff = <Role extends { name?: string }>(
  desiredNames: readonly string[],
  assignedRoles: readonly Role[],
  desiredRoles: readonly Role[],
  managedRoles?: readonly string[],
) => {
  const managedNames = managedRoles ? new Set(managedRoles) : null;
  const effectiveDesiredNames = managedNames ? desiredNames.filter((name) => managedNames.has(name)) : desiredNames;
  const assignedNames = new Set(assignedRoles.map((role) => role.name).filter((name): name is string => Boolean(name)));
  const desiredNameSet = new Set(effectiveDesiredNames);

  return {
    desiredNames,
    effectiveDesiredNames,
    toAdd: desiredRoles.filter((role) => role.name && !assignedNames.has(role.name)),
    toRemove: managedNames
      ? assignedRoles.filter((role) => role.name && !desiredNameSet.has(role.name) && managedNames.has(role.name))
      : [],
  } satisfies RoleDiff<Role>;
};
