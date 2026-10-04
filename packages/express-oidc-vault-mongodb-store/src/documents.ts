import type {
  AuthorizationTransaction,
  AuthorizationTransactionInput,
  ExchangeCodeRecord,
  ExchangeCodeRecordInput,
  OidcVaultSession,
} from '@web-ts-toolkit/express-oidc-vault';
import { hasValidRecordBinding, hasValidSessionBinding } from './binding';

export type ExpirableDocument = {
  _id: string;
  expiresAt?: Date;
};

export type AuthorizationTransactionDocument = Omit<AuthorizationTransaction, 'expiresAt'> & {
  _id: string;
  expiresAt: Date;
};
export type ExchangeCodeDocument = Omit<ExchangeCodeRecord, 'expiresAt'> & { _id: string; expiresAt: Date };
export type SessionDocument = Omit<OidcVaultSession, 'sessionId' | 'expiresAt'> & { _id: string; expiresAt?: Date };
export type BackchannelLogoutTokenJtiDocument = { _id: string; expiresAt: Date };
export type DpopProofDocument = { _id: string; expiresAt: Date };
export type DpopReplayCapacityDocument = {
  _id: string;
  kind: 'capacity' | 'reservation';
  entries?: number;
  revision?: number;
  maxEntries?: number;
  proofsCollectionName?: string;
  replayKey?: string;
  /** Indexed accounting expiry, deliberately NOT TTL-deleted. */
  expiresAt?: Date;
};
export type RotatedSessionAliasDocument = {
  _id: string;
  logicalSessionId: string;
  expiresAt: Date;
  /** Forces a write on reuse even when lineage/expiry are identical; absent on legacy rows. */
  revision?: number;
};

const providerToDocument = (
  provider: NonNullable<OidcVaultSession['provider']>,
): NonNullable<OidcVaultSession['provider']> => {
  if (provider === null || typeof provider !== 'object') return provider;
  const prototype = Object.getPrototypeOf(provider);
  if (prototype !== Object.prototype && prototype !== null) return provider;
  const copy = { ...provider };
  if (copy.issuer === undefined) delete copy.issuer;
  if (copy.clientId === undefined) delete copy.clientId;
  return copy;
};

export const sessionToDocument = (session: OidcVaultSession): SessionDocument => ({
  _id: session.sessionId,
  logicalSessionId: session.logicalSessionId ?? session.sessionId,
  subject: session.subject,
  providerSessionId: session.providerSessionId,
  ...(session.provider === undefined ? {} : { provider: providerToDocument(session.provider) }),
  ...(session.deviceBinding === undefined ? {} : { deviceBinding: { ...session.deviceBinding } }),
  refreshToken: session.refreshToken,
  idToken: session.idToken,
  accessToken: session.accessToken,
  scope: session.scope,
  ...(session.expiresAt === undefined ? {} : { expiresAt: new Date(session.expiresAt) }),
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  user: session.user,
  metadata: session.metadata,
});

export const documentToSession = (session: SessionDocument): OidcVaultSession => ({
  sessionId: session._id,
  logicalSessionId: session.logicalSessionId ?? session._id,
  subject: session.subject,
  providerSessionId: session.providerSessionId,
  provider: session.deviceBinding === undefined && session.provider === null ? undefined : session.provider,
  ...(session.deviceBinding === undefined ? {} : { deviceBinding: { ...session.deviceBinding } }),
  refreshToken: session.refreshToken,
  idToken: session.idToken,
  accessToken: session.accessToken,
  scope: session.scope,
  expiresAt: session.expiresAt?.getTime(),
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  user: session.user,
  metadata: session.metadata,
});

export const authorizationTransactionToDocument = (
  record: AuthorizationTransactionInput,
): AuthorizationTransactionDocument => {
  const document = { _id: record.state, ...record, expiresAt: new Date(record.expiresAt) };
  // BSON otherwise converts explicit undefined to null, which is invalid security data.
  if (document.deviceBinding === undefined) delete document.deviceBinding;
  if (document.browserBindingHash === undefined) delete document.browserBindingHash;
  return document;
};

export const exchangeCodeToDocument = (record: ExchangeCodeRecordInput): ExchangeCodeDocument => {
  const document = { _id: record.code, ...record, expiresAt: new Date(record.expiresAt) };
  if (document.deviceBinding === undefined) delete document.deviceBinding;
  if (document.browserBindingHash === undefined) delete document.browserBindingHash;
  return document;
};

export const authorizationDocumentToRecord = (record: AuthorizationTransactionDocument): AuthorizationTransaction => ({
  state: record.state,
  nonce: record.nonce,
  pkceVerifier: record.pkceVerifier,
  codeChallenge: record.codeChallenge,
  returnTo: record.returnTo,
  ...(record.deviceBinding === undefined ? {} : { deviceBinding: { ...record.deviceBinding } }),
  ...(record.browserBindingHash === undefined ? {} : { browserBindingHash: record.browserBindingHash }),
  createdAt: record.createdAt,
  expiresAt: record.expiresAt.getTime(),
  metadata: record.metadata,
});

export const exchangeDocumentToRecord = (record: ExchangeCodeDocument): ExchangeCodeRecord => ({
  code: record.code,
  sessionId: record.sessionId,
  returnTo: record.returnTo,
  ...(record.deviceBinding === undefined ? {} : { deviceBinding: { ...record.deviceBinding } }),
  ...(record.browserBindingHash === undefined ? {} : { browserBindingHash: record.browserBindingHash }),
  createdAt: record.createdAt,
  expiresAt: record.expiresAt.getTime(),
});

export const isExpired = (record: ExpirableDocument, now: number): boolean =>
  record.expiresAt instanceof Date && record.expiresAt.getTime() <= now;

const validDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());
const optionalString = (value: unknown): boolean => value === undefined || typeof value === 'string';

export const validAuthorizationDocument = (record: AuthorizationTransactionDocument, state: string): boolean =>
  record._id === state &&
  record.state === state &&
  typeof record.nonce === 'string' &&
  typeof record.pkceVerifier === 'string' &&
  typeof record.codeChallenge === 'string' &&
  Number.isFinite(record.createdAt) &&
  validDate(record.expiresAt) &&
  hasValidRecordBinding(record);

export const validExchangeDocument = (record: ExchangeCodeDocument, code: string): boolean =>
  record._id === code &&
  record.code === code &&
  typeof record.sessionId === 'string' &&
  Number.isFinite(record.createdAt) &&
  validDate(record.expiresAt) &&
  hasValidRecordBinding(record);

export const validSessionDocument = (record: SessionDocument, sessionId: string): boolean =>
  record._id === sessionId &&
  typeof record.subject === 'string' &&
  optionalString(record.logicalSessionId) &&
  typeof record.refreshToken === 'string' &&
  typeof record.idToken === 'string' &&
  (record.expiresAt === undefined ||
    (record.deviceBinding === undefined && record.expiresAt === null) ||
    validDate(record.expiresAt)) &&
  hasValidSessionBinding(record);
