/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert');

const redisStore = require('@web-ts-toolkit/express-oidc-vault-redis-store');

assert.deepStrictEqual(Object.keys(redisStore).sort(), ['OidcVaultRedisStoreRecordError', 'createRedisOidcVaultStore']);
assert.strictEqual(typeof redisStore.createRedisOidcVaultStore, 'function');
assert.strictEqual(typeof redisStore.OidcVaultRedisStoreRecordError, 'function');

const storeProvider = redisStore.createRedisOidcVaultStore({
  client: {
    async set() { return 'OK'; },
    async get() { return null; },
    async del() { return 0; },
    async sendCommand() { return null; },
  },
  keyPrefix: 'consumer',
});

assert.strictEqual(typeof storeProvider.createSession, 'function');
assert.strictEqual(typeof storeProvider.consumeExchangeCode, 'function');
assert.strictEqual(typeof storeProvider.deleteSessionsBySubject, 'function');

// A client that omits sendCommand must fail fast with an actionable diagnostic.
try {
  redisStore.createRedisOidcVaultStore({
    client: { async set() { return 'OK'; }, async get() { return null; }, async del() { return 0; } },
  });
  throw new Error('expected missing sendCommand to throw');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  assert.ok(message.includes('sendCommand'), `unexpected error message: ${message}`);
}
