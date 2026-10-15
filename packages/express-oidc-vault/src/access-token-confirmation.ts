import { isCanonicalDpopJkt } from './device-binding-policy';
import { OidcVaultHttpError } from './errors';
import type { OidcVaultAccessTokenConfirmation } from './types';

export const invalidAccessToken = (diagnostic: string): OidcVaultHttpError =>
  new OidcVaultHttpError(401, 'OIDC_VAULT_INVALID_ACCESS_TOKEN', diagnostic, 'Access token validation failed.');

/** Shape only, never authentication. Issuance supplies a TypeError factory to retain its 500/rollback boundary. */
export const snapshotJkt = (
  value: unknown,
  invalid: (diagnostic: string) => Error = invalidAccessToken,
): Readonly<OidcVaultAccessTokenConfirmation> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid('Access token confirmation must be a plain jkt object.');
  }
  const prototype = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  if ((prototype !== Object.prototype && prototype !== null) || keys.length !== 1 || keys[0] !== 'jkt') {
    throw invalid('Access token confirmation contains unsupported fields.');
  }
  const { jkt } = value as { jkt: unknown };
  if (!isCanonicalDpopJkt(jkt)) throw invalid('Access token confirmation is not a canonical SHA-256 thumbprint.');
  return Object.freeze({ jkt });
};

/** Bound local JWT wire profile: three nonempty, canonical unpadded base64url segments. */
export const isCompactSignedJwt = (token: string): boolean => {
  const parts = token.split('.');
  return (
    parts.length === 3 &&
    parts.every((part) =>
      /^[A-Za-z0-9_-]+$/.test(part) ? Buffer.from(part, 'base64url').toString('base64url') === part : false,
    )
  );
};

/** Shape-only exp conversion; JOSE remains responsible for authenticating JWT expiry. */
export const readJwtExpirationMs = (exp: unknown): number | undefined => {
  if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp < 0) return undefined;
  const milliseconds = exp * 1000;
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
};

/** Called only on a cryptographically verified JWT payload, before application mapping. */
export const snapshotVerifiedJwtConfirmation = (
  claims: Record<string, unknown>,
): Readonly<OidcVaultAccessTokenConfirmation> | null => (Object.hasOwn(claims, 'cnf') ? snapshotJkt(claims.cnf) : null);

/** Request-aware adapters must explicitly return null or an authentic supported confirmation. */
export const snapshotAccessTokenConfirmation = (value: unknown): Readonly<OidcVaultAccessTokenConfirmation> | null =>
  value === null ? null : snapshotJkt(value);
