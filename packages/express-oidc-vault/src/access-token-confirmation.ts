import { isCanonicalDpopJkt } from './device-binding-policy';
import { OidcVaultHttpError } from './errors';
import type { OidcVaultAccessTokenConfirmation } from './types';

export const invalidAccessToken = (diagnostic: string): OidcVaultHttpError =>
  new OidcVaultHttpError(401, 'OIDC_VAULT_INVALID_ACCESS_TOKEN', diagnostic, 'Access token validation failed.');

/** Only a plain, exact jkt confirmation is supported; malformed is never unbound. */
const snapshotJkt = (value: unknown): Readonly<OidcVaultAccessTokenConfirmation> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidAccessToken('Access token confirmation must be a plain jkt object.');
  }
  const prototype = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  if ((prototype !== Object.prototype && prototype !== null) || keys.length !== 1 || keys[0] !== 'jkt') {
    throw invalidAccessToken('Access token confirmation contains unsupported fields.');
  }
  const { jkt } = value as { jkt: unknown };
  if (!isCanonicalDpopJkt(jkt))
    throw invalidAccessToken('Access token confirmation is not a canonical SHA-256 thumbprint.');
  return Object.freeze({ jkt });
};

/** Called only on a cryptographically verified JWT payload, before application mapping. */
export const snapshotVerifiedJwtConfirmation = (
  claims: Record<string, unknown>,
): Readonly<OidcVaultAccessTokenConfirmation> | null => (Object.hasOwn(claims, 'cnf') ? snapshotJkt(claims.cnf) : null);

/** Request-aware adapters must explicitly return null or an authentic supported confirmation. */
export const snapshotAccessTokenConfirmation = (value: unknown): Readonly<OidcVaultAccessTokenConfirmation> | null =>
  value === null ? null : snapshotJkt(value);
