import { OidcVaultHttpError } from './errors';

/** Explicit credential rejection from a trusted custom validator; safe to treat as anonymous only with opt-in fallback. */
export class OidcVaultInvalidAccessTokenError extends OidcVaultHttpError {
  constructor(message = 'Access token rejected.') {
    super(401, 'OIDC_VAULT_INVALID_ACCESS_TOKEN', message, 'Access token validation failed.');
    this.name = 'OidcVaultInvalidAccessTokenError';
  }
}

/** Intentional onAuthContext veto. The message is public; unexpected exceptions remain sanitized server failures. */
export class OidcVaultAuthDeniedError extends OidcVaultHttpError {
  constructor(message = 'Authentication denied.', status: 401 | 403 = 403) {
    if (status !== 401 && status !== 403) throw new TypeError('Auth denial status must be 401 or 403.');
    super(status, 'OIDC_VAULT_AUTH_DENIED', message);
    this.name = 'OidcVaultAuthDeniedError';
  }
}

// Preserve original JWT diagnostics without making status/code strings into
// fallback authority. Only the built-in validator can mark its known rejections.
const credentialOutcomes = new WeakMap<object, boolean>();

export const markAccessTokenRejected = (error: unknown): void => {
  if (typeof error === 'object' && error !== null) credentialOutcomes.set(error, true);
};

export const markAccessTokenValidationFailure = (error: unknown): void => {
  if (typeof error === 'object' && error !== null) credentialOutcomes.set(error, false);
};

export const isAccessTokenRejected = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (credentialOutcomes.get(error) ?? error instanceof OidcVaultInvalidAccessTokenError);
