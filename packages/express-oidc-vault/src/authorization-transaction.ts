import type { OidcVaultResolvedConfig } from './config';
import { OidcVaultHttpError } from './errors';
import {
  FINGERPRINT_RECOGNITION_METADATA_KEY,
  fingerprintRecognitionMatches,
  snapshotFingerprintRecognition,
  withFingerprintRecognitionMetadata,
  type FingerprintRecognition,
} from './fingerprint-recognition';
import { isUsableEpochMs } from './lifetime-policy';
import { recordBindingMatches, snapshotRecordBindingMatch } from './transaction-cookie';
import type { AuthorizationTransaction, OidcVaultProviderMetadata, OidcVaultRecordBindingMatch } from './types';

const PROVIDER_METADATA_KEY = 'oidcVaultTransactionProvider';
export const invalidAuthorizationState = (): OidcVaultHttpError =>
  new OidcVaultHttpError(400, 'OIDC_VAULT_INVALID_STATE', 'OIDC state is invalid or expired.');

/** Portable private identity evidence for new POST records; no discovery or credential material needed. */
export const createTransactionProviderMetadata = (config: OidcVaultResolvedConfig): Record<string, unknown> => ({
  [PROVIDER_METADATA_KEY]: { issuer: config.issuer, clientId: config.clientId },
});

export interface AuthorizationTransactionSnapshot extends AuthorizationTransaction {
  readonly match: Readonly<OidcVaultRecordBindingMatch>;
  readonly provider?: Readonly<OidcVaultProviderMetadata>;
  readonly fingerprintRecognition?: Readonly<FingerprintRecognition>;
}

/** Capture the original scalar/identity/binding authority once; store reads are preflight, never locks. */
export const snapshotAuthorizationTransaction = (
  record: AuthorizationTransaction,
  state: string,
  now: number,
): Readonly<AuthorizationTransactionSnapshot> => {
  const { state: storedState, nonce, pkceVerifier, codeChallenge, returnTo, createdAt, expiresAt, metadata } = record;
  if (
    storedState !== state ||
    typeof nonce !== 'string' ||
    typeof pkceVerifier !== 'string' ||
    typeof codeChallenge !== 'string' ||
    (returnTo !== undefined && typeof returnTo !== 'string') ||
    !isUsableEpochMs(createdAt) ||
    !isUsableEpochMs(expiresAt) ||
    !isUsableEpochMs(now) ||
    expiresAt <= now
  ) {
    throw invalidAuthorizationState();
  }
  const match = snapshotRecordBindingMatch(record);
  let fingerprintRecognition: Readonly<FingerprintRecognition> | undefined;
  try {
    fingerprintRecognition = snapshotFingerprintRecognition(metadata);
  } catch {
    throw invalidAuthorizationState();
  }
  if (fingerprintRecognition !== undefined && match.browserBindingHash === null) throw invalidAuthorizationState();
  const value: unknown = metadata?.[PROVIDER_METADATA_KEY];
  let provider: Readonly<OidcVaultProviderMetadata> | undefined;
  if (value !== undefined) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalidAuthorizationState();
    const { issuer, clientId } = value as Record<string, unknown>;
    if (
      (issuer !== undefined && typeof issuer !== 'string') ||
      (clientId !== undefined && typeof clientId !== 'string')
    ) {
      throw invalidAuthorizationState();
    }
    provider = Object.freeze({
      ...(issuer === undefined ? {} : { issuer }),
      ...(clientId === undefined ? {} : { clientId }),
    });
  }
  return Object.freeze({
    state,
    nonce,
    pkceVerifier,
    codeChallenge,
    returnTo,
    createdAt,
    expiresAt,
    ...(metadata === undefined
      ? {}
      : {
          metadata: Object.freeze({
            ...withFingerprintRecognitionMetadata(metadata, fingerprintRecognition),
            ...(provider === undefined ? {} : { [PROVIDER_METADATA_KEY]: provider }),
            ...(fingerprintRecognition === undefined
              ? {}
              : { [FINGERPRINT_RECOGNITION_METADATA_KEY]: fingerprintRecognition }),
          }),
        }),
    ...(match.deviceBinding === null ? {} : { deviceBinding: match.deviceBinding }),
    ...(match.browserBindingHash === null ? {} : { browserBindingHash: match.browserBindingHash }),
    match,
    ...(provider === undefined ? {} : { provider }),
    ...(fingerprintRecognition === undefined ? {} : { fingerprintRecognition }),
  });
};

/** Enforce each defined identifier verbatim; missing identity remains legacy-compatible. */
export const assertAuthorizationTransactionIdentity = (
  transaction: Readonly<AuthorizationTransactionSnapshot>,
  config: OidcVaultResolvedConfig,
): void => {
  if (
    (transaction.provider?.issuer !== undefined && transaction.provider.issuer !== config.issuer) ||
    (transaction.provider?.clientId !== undefined && transaction.provider.clientId !== config.clientId)
  ) {
    throw invalidAuthorizationState();
  }
};

/** Recheck the atomic return before upstream work, including upsert/replacement races and provider omissions. */
export const assertAuthorizationTransactionMatches = (
  actual: Readonly<AuthorizationTransactionSnapshot>,
  original: Readonly<AuthorizationTransactionSnapshot>,
): void => {
  if (
    actual.state !== original.state ||
    actual.nonce !== original.nonce ||
    actual.pkceVerifier !== original.pkceVerifier ||
    actual.codeChallenge !== original.codeChallenge ||
    actual.returnTo !== original.returnTo ||
    actual.createdAt !== original.createdAt ||
    actual.expiresAt !== original.expiresAt ||
    actual.provider?.issuer !== original.provider?.issuer ||
    actual.provider?.clientId !== original.provider?.clientId ||
    !fingerprintRecognitionMatches(actual.fingerprintRecognition, original.fingerprintRecognition) ||
    !recordBindingMatches(actual.match, original.match)
  )
    throw invalidAuthorizationState();
};
