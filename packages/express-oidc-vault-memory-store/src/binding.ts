import { OidcVaultStoreConflictError } from '@web-ts-toolkit/express-oidc-vault';
import type {
  OidcVaultDpopBinding,
  OidcVaultRecordBindingMatch,
  OidcVaultSession,
  OidcVaultSessionRevocationContext,
} from '@web-ts-toolkit/express-oidc-vault';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const isHash = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 43 && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);

export const isBinding = (value: unknown): value is OidcVaultDpopBinding =>
  isRecord(value) &&
  Object.keys(value).length === 2 &&
  Object.hasOwn(value, 'type') &&
  Object.hasOwn(value, 'jkt') &&
  value.type === 'dpop' &&
  isHash(value.jkt);

export const hasValidBinding = (record: { deviceBinding?: unknown }): boolean =>
  record.deviceBinding === undefined || isBinding(record.deviceBinding);

export const hasValidRecordBinding = (record: { deviceBinding?: unknown; browserBindingHash?: unknown }): boolean =>
  hasValidBinding(record) &&
  (record.browserBindingHash === undefined || isHash(record.browserBindingHash)) &&
  (record.deviceBinding === undefined || record.browserBindingHash !== undefined);

export const assertRecordBinding = (record: { deviceBinding?: unknown; browserBindingHash?: unknown }): void => {
  if (!hasValidRecordBinding(record))
    throw new TypeError('OIDC vault store record has invalid device/browser binding.');
};

export const assertSessionBinding = (record: { deviceBinding?: unknown }): void => {
  if (!hasValidBinding(record)) throw new TypeError('OIDC vault store session has invalid device binding.');
};

export const isBindingMatch = (match: unknown): match is OidcVaultRecordBindingMatch =>
  isRecord(match) &&
  Object.hasOwn(match, 'deviceBinding') &&
  Object.hasOwn(match, 'browserBindingHash') &&
  (match.deviceBinding === null || isBinding(match.deviceBinding)) &&
  (match.browserBindingHash === null || isHash(match.browserBindingHash));

export const matchesRecordBinding = (
  record: { deviceBinding?: OidcVaultDpopBinding; browserBindingHash?: string },
  match: OidcVaultRecordBindingMatch,
): boolean =>
  (match.deviceBinding === null
    ? record.deviceBinding === undefined
    : record.deviceBinding?.type === match.deviceBinding.type &&
      record.deviceBinding.jkt === match.deviceBinding.jkt) &&
  (match.browserBindingHash === null
    ? record.browserBindingHash === undefined
    : record.browserBindingHash === match.browserBindingHash);

export const inheritSessionBinding = (source: OidcVaultSession, next: OidcVaultSession): void => {
  assertSessionBinding(source);
  assertSessionBinding(next);
  if (next.deviceBinding !== undefined && next.deviceBinding.jkt !== source.deviceBinding?.jkt) {
    throw new OidcVaultStoreConflictError('OIDC vault session rotation cannot change or add device binding.');
  }
  if (source.deviceBinding !== undefined) next.deviceBinding = { type: 'dpop', jkt: source.deviceBinding.jkt };
};

/** Only allowlisted revocation authority; never copy arbitrary provider fields. */
export const sessionRevocationContext = (session: OidcVaultSession): OidcVaultSessionRevocationContext => {
  assertSessionBinding(session);
  if (
    typeof session.sessionId !== 'string' ||
    typeof session.subject !== 'string' ||
    (session.logicalSessionId !== undefined && typeof session.logicalSessionId !== 'string')
  ) {
    throw new Error('OIDC vault store lineage has malformed session authority.');
  }
  const provider = session.provider;
  if (
    provider !== undefined &&
    (!isRecord(provider) ||
      (provider.issuer !== undefined && typeof provider.issuer !== 'string') ||
      (provider.clientId !== undefined && typeof provider.clientId !== 'string'))
  ) {
    throw new Error('OIDC vault store lineage has malformed provider identity.');
  }
  return {
    logicalSessionId: session.logicalSessionId ?? session.sessionId,
    ...(provider === undefined
      ? {}
      : {
          provider: {
            ...(typeof provider.issuer === 'string' ? { issuer: provider.issuer } : {}),
            ...(typeof provider.clientId === 'string' ? { clientId: provider.clientId } : {}),
          },
        }),
    ...(session.deviceBinding === undefined ? {} : { deviceBinding: { ...session.deviceBinding } }),
  };
};

export const hasValidSessionRecord = (session: OidcVaultSession, sessionId: string): boolean =>
  session.sessionId === sessionId &&
  typeof session.subject === 'string' &&
  (session.logicalSessionId === undefined || typeof session.logicalSessionId === 'string') &&
  typeof session.refreshToken === 'string' &&
  typeof session.idToken === 'string' &&
  (session.expiresAt === undefined || Number.isFinite(session.expiresAt)) &&
  hasValidBinding(session);

export const assertSameLineageAuthority = (source: OidcVaultSession, member: OidcVaultSession): void => {
  assertSessionBinding(member);
  const authority = sessionRevocationContext(member);
  if (
    source.deviceBinding?.jkt !== authority.deviceBinding?.jkt ||
    source.subject !== member.subject ||
    source.provider?.issuer !== authority.provider?.issuer ||
    source.provider?.clientId !== authority.provider?.clientId
  ) {
    throw new Error('OIDC vault store lineage has inconsistent device binding or provider identity.');
  }
};
