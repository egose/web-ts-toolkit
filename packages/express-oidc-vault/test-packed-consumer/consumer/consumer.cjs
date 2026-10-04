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
  'OidcVaultDpopReplayCapacityError',
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
assert.ok(new oidcVault.OidcVaultDpopReplayCapacityError() instanceof Error);
assert.strictEqual(new oidcVault.OidcVaultDpopReplayCapacityError().name, 'OidcVaultDpopReplayCapacityError');

// Real installed CJS request-aware helper/middleware construction and legacy
// confirmation refusal; the ESM consumer exercises full HTTP proof/replay.
(async () => {
  const { SignJWT } = require('jose');
  const key = new Uint8Array(32).fill(23);
  const jkt = 'A'.repeat(43);
  const validator = oidcVault.createOidcVaultJwtAccessTokenValidator({ key, algorithms: ['HS256'], mapClaims: () => ({ subject: 'packed-cjs-user' }) });
  const token = await new SignJWT({ sub: 'original-user', cnf: { jkt } }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('15m').sign(key);
  assert.deepStrictEqual((await validator.validate(token)).confirmation, { jkt });
  assert.deepStrictEqual((await validator.validateWithRequest({ token, scheme: 'DPoP', req: {} })).confirmation, { jkt });
  const unbound = await new SignJWT({ sub: 'unbound-user' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('15m').sign(key);
  assert.strictEqual(Object.hasOwn(await validator.validate(unbound), 'confirmation'), false);
  assert.strictEqual((await validator.validateWithRequest({ token: unbound, scheme: 'Bearer', req: {} })).confirmation, null);
  assert.strictEqual(typeof oidcVault.createOidcVaultAccessTokenMiddleware({ validator, deviceBinding: {
    publicOrigin: 'https://api.example.com', replayNamespace: 'packed-cjs-api', replayStore: { async reserveDpopProof() { return false; } },
  } }), 'function');
  // Transaction-cookie declarations/runtime are bundled into the CJS root.
  // No opt-in is needed to validate explicitly supplied public cookie options.
  assert.throws(() => oidcVault.createOidcVaultMiddleware({
    backendOrigin: 'https://api.example.com', storeProvider: {}, transactionCookie: { sameSite: 'strict' },
  }), /transactionCookie.sameSite must be lax or none/);
  // DBJWT-09 recognition configuration is discoverable/validated by the CJS root.
  assert.throws(() => oidcVault.createOidcVaultMiddleware({
    backendOrigin: 'https://api.example.com', storeProvider: {}, fingerprintRecognition: { headerName: 'Authorization' },
  }), /fingerprintRecognition.headerName must not collide/);
  assert.throws(() => oidcVault.createOidcVaultMiddleware({
    backendOrigin: 'https://api.example.com', storeProvider: {}, fingerprintRecognition: {},
  }), /fingerprintRecognition requires storeProvider.getAuthorizationTransaction/);
})().catch((error) => { console.error(error); process.exitCode = 1; });
