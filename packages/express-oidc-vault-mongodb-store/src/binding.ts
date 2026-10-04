import { OidcVaultStoreConflictError } from '@web-ts-toolkit/express-oidc-vault';
import type {
  OidcVaultDpopBinding,
  OidcVaultRecordBindingMatch,
  OidcVaultSession,
  OidcVaultSessionRevocationContext,
} from '@web-ts-toolkit/express-oidc-vault';
import type { Document } from 'mongodb';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isHash = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 43 && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
export const isBinding = (value: unknown): value is OidcVaultDpopBinding =>
  isRecord(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
  Object.keys(value).length === 2 &&
  Object.hasOwn(value, 'type') &&
  Object.hasOwn(value, 'jkt') &&
  value.type === 'dpop' &&
  isHash(value.jkt);
export const hasValidSessionBinding = (record: { deviceBinding?: unknown }): boolean =>
  record.deviceBinding === undefined || isBinding(record.deviceBinding);
export const hasValidRecordBinding = (record: { deviceBinding?: unknown; browserBindingHash?: unknown }): boolean =>
  hasValidSessionBinding(record) &&
  (record.browserBindingHash === undefined || isHash(record.browserBindingHash)) &&
  (record.deviceBinding === undefined || record.browserBindingHash !== undefined);
export const assertRecordBinding = (record: { deviceBinding?: unknown; browserBindingHash?: unknown }): void => {
  if (!hasValidRecordBinding(record))
    throw new TypeError('OIDC vault store record has invalid device/browser binding.');
};
export const assertSessionBinding = (record: { deviceBinding?: unknown }): void => {
  if (!hasValidSessionBinding(record)) throw new TypeError('OIDC vault store session has invalid device binding.');
};
export const isBindingMatch = (match: unknown): match is OidcVaultRecordBindingMatch =>
  isRecord(match) &&
  Object.hasOwn(match, 'deviceBinding') &&
  Object.hasOwn(match, 'browserBindingHash') &&
  (match.deviceBinding === null || isBinding(match.deviceBinding)) &&
  (match.browserBindingHash === null || isHash(match.browserBindingHash));

/** Null matches BSON absence only, never BSON null. Field-order-independent exact two-field binding. */
export const bindingMatchFilter = (match: OidcVaultRecordBindingMatch): Document => ({
  ...(match.deviceBinding === null
    ? { deviceBinding: { $exists: false } }
    : {
        'deviceBinding.type': match.deviceBinding.type,
        'deviceBinding.jkt': match.deviceBinding.jkt,
        $expr: {
          $eq: [
            {
              $size: {
                $objectToArray: { $cond: [{ $eq: [{ $type: '$deviceBinding' }, 'object'] }, '$deviceBinding', {}] },
              },
            },
            2,
          ],
        },
      }),
  browserBindingHash: match.browserBindingHash === null ? { $exists: false } : match.browserBindingHash,
});

export const inheritSessionBinding = (source: OidcVaultSession, next: OidcVaultSession): void => {
  assertSessionBinding(source);
  assertSessionBinding(next);
  if (next.deviceBinding !== undefined && next.deviceBinding.jkt !== source.deviceBinding?.jkt) {
    throw new OidcVaultStoreConflictError('OIDC vault session rotation cannot change or add device binding.');
  }
  if (source.deviceBinding !== undefined) next.deviceBinding = { type: 'dpop', jkt: source.deviceBinding.jkt };
};

export type SessionAuthority = {
  _id: string;
  logicalSessionId?: string;
  subject: string;
  provider?: { issuer?: string; clientId?: string };
  deviceBinding?: OidcVaultDpopBinding;
  expiresAt?: Date;
};

export const toRevocationContext = (session: SessionAuthority): OidcVaultSessionRevocationContext => {
  assertSessionBinding(session);
  // Pre-binding Mongo mapper emitted BSON null for omitted provider/expiry.
  // Normalize only these non-binding fields of genuinely unbound legacy rows.
  const provider = session.deviceBinding === undefined && session.provider === null ? undefined : session.provider;
  const expiry = session.deviceBinding === undefined && session.expiresAt === null ? undefined : session.expiresAt;
  if (
    typeof session._id !== 'string' ||
    typeof session.subject !== 'string' ||
    (session.logicalSessionId !== undefined && typeof session.logicalSessionId !== 'string') ||
    (expiry !== undefined && (!(expiry instanceof Date) || !Number.isFinite(expiry.getTime()))) ||
    (provider !== undefined &&
      (!isRecord(provider) ||
        (provider.issuer !== undefined && typeof provider.issuer !== 'string') ||
        (provider.clientId !== undefined && typeof provider.clientId !== 'string')))
  ) {
    throw new Error('OIDC vault MongoDB lineage has malformed session/provider authority.');
  }
  return {
    logicalSessionId: session.logicalSessionId ?? session._id,
    ...(session.deviceBinding === undefined ? {} : { deviceBinding: { ...session.deviceBinding } }),
    ...(provider === undefined
      ? {}
      : {
          provider: {
            ...(provider.issuer === undefined ? {} : { issuer: provider.issuer }),
            ...(provider.clientId === undefined ? {} : { clientId: provider.clientId }),
          },
        }),
  };
};

export const assertSameLineageAuthority = (source: SessionAuthority, member: SessionAuthority): void => {
  toRevocationContext(member);
  if (
    source.deviceBinding?.jkt !== member.deviceBinding?.jkt ||
    source.subject !== member.subject ||
    source.provider?.issuer !== member.provider?.issuer ||
    source.provider?.clientId !== member.provider?.clientId
  ) {
    throw new Error('OIDC vault MongoDB lineage has inconsistent device binding or provider identity.');
  }
};
