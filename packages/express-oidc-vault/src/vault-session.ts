import type { OidcVaultResolvedConfig } from './config';
import { snapshotDpopBinding } from './device-binding-policy';
import { OidcVaultHttpError } from './errors';
import { FINGERPRINT_RECOGNITION_METADATA_KEY } from './fingerprint-recognition';
import { isUsableEpochMs } from './lifetime-policy';
import { recordBindingMatches, snapshotRecordBindingMatch } from './transaction-cookie';
import type {
  ExchangeCodeRecord,
  OidcVaultProviderMetadata,
  OidcVaultRecordBindingMatch,
  OidcVaultSession,
  OidcVaultSessionRevocationContext,
  OidcVaultUserProfile,
} from './types';

export const invalidVaultSession = (): OidcVaultHttpError =>
  new OidcVaultHttpError(401, 'OIDC_VAULT_INVALID_SESSION', 'Session is missing or expired.');

export const invalidExchangeCode = (): OidcVaultHttpError =>
  new OidcVaultHttpError(400, 'OIDC_VAULT_INVALID_EXCHANGE_CODE', 'Exchange code is invalid or expired.');

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/**
 * Copy portable plain data without imposing structuredClone on native metadata.
 * Iterative traversal preserves shared/cyclic containers and cannot overflow the
 * stack. Opaque provider-specific objects retain their existing semantics.
 */
const copyPortableData = <T>(value: T, omitRecognition = false): T => {
  const copies = new Map<object, object>();
  const pending: Array<{ source: object; target: object }> = [];
  const copy = (item: unknown): unknown => {
    if (!Array.isArray(item) && !isPlainObject(item)) return item;
    const existing = copies.get(item);
    if (existing) return existing;
    const target = Array.isArray(item)
      ? new Array(item.length)
      : (Object.create(Object.getPrototypeOf(item)) as object);
    copies.set(item, target);
    pending.push({ source: item, target });
    return target;
  };
  const result = copy(value);
  for (let index = 0; index < pending.length; index++) {
    const { source, target } = pending[index];
    for (const key of Object.keys(source)) {
      if (omitRecognition && key === FINGERPRINT_RECOGNITION_METADATA_KEY) continue;
      Object.defineProperty(target, key, {
        value: copy(Reflect.get(source, key)),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return result as T;
};

/** Invocation-owned session data for issuers/hooks/stores; never share private profile/metadata containers. */
export const copyVaultSession = (session: Readonly<OidcVaultSession>, omitRecognition = false): OidcVaultSession =>
  copyPortableData(session, omitRecognition);

/** Reserved private recognition evidence is never a profile/claim, even if a provider or hook supplies that key. */
export const copyVaultUserProfile = (user: OidcVaultUserProfile | undefined): OidcVaultUserProfile | undefined =>
  copyPortableData(user, true);

const snapshotProvider = (value: unknown): Readonly<OidcVaultProviderMetadata> | undefined => {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) throw invalidVaultSession();
  const { issuer, clientId } = value;
  if (
    (issuer !== undefined && typeof issuer !== 'string') ||
    (clientId !== undefined && typeof clientId !== 'string')
  ) {
    throw invalidVaultSession();
  }
  return Object.freeze({
    ...(issuer === undefined ? {} : { issuer }),
    ...(clientId === undefined ? {} : { clientId }),
  });
};

/** Each known identity field is exact; omissions remain legacy-compatible and are never backfilled. */
export const assertVaultSessionIdentity = (
  session: Pick<OidcVaultSession, 'provider'>,
  config: OidcVaultResolvedConfig,
): void => {
  if (
    (session.provider?.issuer !== undefined && session.provider.issuer !== config.issuer) ||
    (session.provider?.clientId !== undefined && session.provider.clientId !== config.clientId)
  )
    throw invalidVaultSession();
};

/** Capture security scalars once before async proof/provider/store work; no mutable original record is retained. */
export const snapshotVaultSession = (
  record: OidcVaultSession,
  expectedSessionId: string,
  now: number,
): Readonly<OidcVaultSession> => {
  const {
    sessionId,
    logicalSessionId,
    subject,
    providerSessionId,
    provider: rawProvider,
    deviceBinding: rawBinding,
    refreshToken,
    idToken,
    accessToken,
    scope,
    expiresAt,
    createdAt,
    updatedAt,
    user,
    metadata,
  } = record;
  if (
    sessionId !== expectedSessionId ||
    typeof sessionId !== 'string' ||
    !sessionId ||
    typeof subject !== 'string' ||
    !subject ||
    (logicalSessionId !== undefined && (typeof logicalSessionId !== 'string' || !logicalSessionId)) ||
    (providerSessionId !== undefined && typeof providerSessionId !== 'string') ||
    typeof refreshToken !== 'string' ||
    typeof idToken !== 'string' ||
    (accessToken !== undefined && typeof accessToken !== 'string') ||
    (scope !== undefined && typeof scope !== 'string') ||
    !isUsableEpochMs(createdAt) ||
    !isUsableEpochMs(updatedAt) ||
    !isUsableEpochMs(now) ||
    (expiresAt !== undefined && (!isUsableEpochMs(expiresAt) || expiresAt <= now))
  )
    throw invalidVaultSession();
  const provider = snapshotProvider(rawProvider);
  const binding = snapshotDpopBinding(rawBinding);
  if (binding !== undefined && Object.keys(rawBinding as object).length !== 2) throw invalidVaultSession();
  return Object.freeze({
    sessionId,
    logicalSessionId,
    subject,
    providerSessionId,
    provider,
    ...(binding === undefined ? {} : { deviceBinding: binding }),
    refreshToken,
    idToken,
    accessToken,
    scope,
    expiresAt,
    createdAt,
    updatedAt,
    ...(user === undefined ? {} : { user: copyPortableData(user) }),
    ...(metadata === undefined ? {} : { metadata: copyPortableData(metadata) }),
  });
};

/** A read is not a lease: recheck original authority/generation at the next credential-use boundary. */
export const assertVaultSessionMatches = (
  actual: Readonly<OidcVaultSession>,
  original: Readonly<OidcVaultSession>,
): void => {
  if (
    actual.sessionId !== original.sessionId ||
    actual.logicalSessionId !== original.logicalSessionId ||
    actual.subject !== original.subject ||
    actual.providerSessionId !== original.providerSessionId ||
    actual.provider?.issuer !== original.provider?.issuer ||
    actual.provider?.clientId !== original.provider?.clientId ||
    actual.deviceBinding?.jkt !== original.deviceBinding?.jkt ||
    actual.expiresAt !== original.expiresAt ||
    actual.createdAt !== original.createdAt ||
    actual.updatedAt !== original.updatedAt ||
    actual.refreshToken !== original.refreshToken ||
    actual.idToken !== original.idToken ||
    actual.accessToken !== original.accessToken ||
    actual.scope !== original.scope
  )
    throw invalidVaultSession();
};

export interface VaultExchangeCodeSnapshot extends ExchangeCodeRecord {
  readonly match: Readonly<OidcVaultRecordBindingMatch>;
}

export const snapshotVaultExchangeCode = (
  record: ExchangeCodeRecord,
  expectedCode: string,
  now: number,
): Readonly<VaultExchangeCodeSnapshot> => {
  const { code, sessionId, returnTo, createdAt, expiresAt } = record;
  if (
    code !== expectedCode ||
    typeof sessionId !== 'string' ||
    !sessionId ||
    (returnTo !== undefined && typeof returnTo !== 'string') ||
    !isUsableEpochMs(createdAt) ||
    !isUsableEpochMs(expiresAt) ||
    !isUsableEpochMs(now) ||
    expiresAt <= now
  )
    throw invalidExchangeCode();
  const match = snapshotRecordBindingMatch(record);
  return Object.freeze({
    code,
    sessionId,
    returnTo,
    createdAt,
    expiresAt,
    match,
    ...(match.deviceBinding === null ? {} : { deviceBinding: match.deviceBinding }),
    ...(match.browserBindingHash === null ? {} : { browserBindingHash: match.browserBindingHash }),
  });
};

export const assertVaultExchangeCodeMatches = (
  actual: Readonly<VaultExchangeCodeSnapshot>,
  original: Readonly<VaultExchangeCodeSnapshot>,
): void => {
  if (
    actual.code !== original.code ||
    actual.sessionId !== original.sessionId ||
    actual.returnTo !== original.returnTo ||
    actual.createdAt !== original.createdAt ||
    actual.expiresAt !== original.expiresAt ||
    !recordBindingMatches(actual.match, original.match)
  )
    throw invalidExchangeCode();
};

/** Binding is evidence from login on BOTH records, never from the current presenter. */
export const assertVaultExchangeSessionBinding = (
  code: Readonly<VaultExchangeCodeSnapshot>,
  session: Readonly<OidcVaultSession>,
): void => {
  if (code.sessionId !== session.sessionId || code.deviceBinding?.jkt !== session.deviceBinding?.jkt)
    throw invalidVaultSession();
};

/** Credential-free original lineage/provider/key authority, also used when binding is disabled. */
export const snapshotVaultRevocationContext = (
  context: OidcVaultSessionRevocationContext,
): Readonly<OidcVaultSessionRevocationContext> => {
  const { logicalSessionId, provider, deviceBinding } = context;
  if (typeof logicalSessionId !== 'string' || !logicalSessionId) throw invalidVaultSession();
  const identity = snapshotProvider(provider);
  const binding = snapshotDpopBinding(deviceBinding);
  if (binding !== undefined && Object.keys(deviceBinding as object).length !== 2) throw invalidVaultSession();
  return Object.freeze({
    logicalSessionId,
    ...(identity === undefined ? {} : { provider: identity }),
    ...(binding === undefined ? {} : { deviceBinding: binding }),
  });
};

export const assertVaultRevocationContextMatches = (
  actual: Readonly<OidcVaultSessionRevocationContext>,
  original: Readonly<OidcVaultSessionRevocationContext>,
): void => {
  if (
    actual.logicalSessionId !== original.logicalSessionId ||
    actual.provider?.issuer !== original.provider?.issuer ||
    actual.provider?.clientId !== original.provider?.clientId ||
    actual.deviceBinding?.jkt !== original.deviceBinding?.jkt
  ) {
    throw invalidVaultSession();
  }
};
