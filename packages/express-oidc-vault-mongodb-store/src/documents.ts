import type {
  AuthorizationTransaction,
  AuthorizationTransactionInput,
  ExchangeCodeRecord,
  ExchangeCodeRecordInput,
  OidcVaultSession,
} from '@web-ts-toolkit/express-oidc-vault';

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
export type RotatedSessionAliasDocument = { _id: string; logicalSessionId: string; expiresAt: Date };

export const sessionToDocument = (session: OidcVaultSession): SessionDocument => ({
  _id: session.sessionId,
  logicalSessionId: session.logicalSessionId ?? session.sessionId,
  subject: session.subject,
  providerSessionId: session.providerSessionId,
  provider: session.provider,
  refreshToken: session.refreshToken,
  idToken: session.idToken,
  accessToken: session.accessToken,
  scope: session.scope,
  expiresAt: typeof session.expiresAt === 'number' ? new Date(session.expiresAt) : undefined,
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
  provider: session.provider,
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
): AuthorizationTransactionDocument => ({
  _id: record.state,
  ...record,
  expiresAt: new Date(record.expiresAt),
});

export const exchangeCodeToDocument = (record: ExchangeCodeRecordInput): ExchangeCodeDocument => ({
  _id: record.code,
  ...record,
  expiresAt: new Date(record.expiresAt),
});

export const authorizationDocumentToRecord = (record: AuthorizationTransactionDocument): AuthorizationTransaction => ({
  state: record.state,
  nonce: record.nonce,
  pkceVerifier: record.pkceVerifier,
  codeChallenge: record.codeChallenge,
  returnTo: record.returnTo,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt.getTime(),
  metadata: record.metadata,
});

export const exchangeDocumentToRecord = (record: ExchangeCodeDocument): ExchangeCodeRecord => ({
  code: record.code,
  sessionId: record.sessionId,
  returnTo: record.returnTo,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt.getTime(),
});

export const isExpired = (record: ExpirableDocument, now: number): boolean =>
  record.expiresAt instanceof Date && record.expiresAt.getTime() <= now;
