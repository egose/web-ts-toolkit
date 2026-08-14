/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert');

const oidcVault = require('@web-ts-toolkit/express-oidc-vault');

const expected = [
  'DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS',
  'DEFAULT_EXCHANGE_CODE_TTL_MS',
  'DEFAULT_OIDC_SCOPES',
  'DEFAULT_OIDC_VAULT_BASE_PATH',
  'DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT',
  'OIDC_VAULT_ROUTE_PATHS',
  'OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT',
  'OidcVaultStoreConflictError',
  'createOidcVaultAccessTokenMiddleware',
  'createOidcVaultJwtAccessTokenValidator',
  'createOidcVaultMiddleware',
  'normalizeOidcVaultBasePath',
  'resolveOidcVaultConfig',
  'resolveOidcVaultConfigFromEnv',
].sort();

assert.deepStrictEqual(Object.keys(oidcVault).sort(), expected);
assert.strictEqual(oidcVault.DEFAULT_OIDC_SCOPES, 'openid email profile');
assert.strictEqual(oidcVault.DEFAULT_OIDC_VAULT_BASE_PATH, '/auth/oidc');
assert.strictEqual(typeof oidcVault.createOidcVaultMiddleware, 'function');
assert.strictEqual(typeof oidcVault.createOidcVaultAccessTokenMiddleware, 'function');
assert.strictEqual(oidcVault.normalizeOidcVaultBasePath('/custom/'), '/custom');
assert.ok(new oidcVault.OidcVaultStoreConflictError() instanceof Error);
