import assert from 'node:assert';

import {
  DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS,
  DEFAULT_EXCHANGE_CODE_TTL_MS,
  DEFAULT_OIDC_SCOPES,
  DEFAULT_OIDC_VAULT_BASE_PATH,
  DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT,
  OIDC_VAULT_ROUTE_PATHS,
  OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT,
  OidcVaultStoreConflictError,
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
  createOidcVaultMiddleware,
  normalizeOidcVaultBasePath,
  resolveOidcVaultConfig,
  resolveOidcVaultConfigFromEnv,
} from '@web-ts-toolkit/express-oidc-vault';

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

const actual = Object.keys(await import('@web-ts-toolkit/express-oidc-vault')).sort();
assert.deepStrictEqual(actual, expected);
assert.strictEqual(DEFAULT_OIDC_SCOPES, 'openid email profile');
assert.strictEqual(DEFAULT_OIDC_VAULT_BASE_PATH, '/auth/oidc');
assert.strictEqual(DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT, '16kb');
assert.strictEqual(DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS, 600_000);
assert.strictEqual(DEFAULT_EXCHANGE_CODE_TTL_MS, 30_000);
assert.strictEqual(OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT, 16);
assert.strictEqual(OIDC_VAULT_ROUTE_PATHS.login, '/login');
assert.strictEqual(typeof createOidcVaultAccessTokenMiddleware, 'function');
assert.strictEqual(typeof createOidcVaultJwtAccessTokenValidator, 'function');
assert.strictEqual(typeof createOidcVaultMiddleware, 'function');
assert.strictEqual(normalizeOidcVaultBasePath('custom'), '/custom');
assert.strictEqual(typeof resolveOidcVaultConfig, 'function');
assert.strictEqual(typeof resolveOidcVaultConfigFromEnv, 'function');
assert.ok(new OidcVaultStoreConflictError() instanceof Error);
