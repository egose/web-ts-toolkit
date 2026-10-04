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
for (const method of ['getAuthorizationTransaction', 'consumeAuthorizationTransactionIfMatches',
  'getExchangeCode', 'consumeExchangeCodeIfMatches', 'getSessionRevocationContext', 'reserveDpopProof']) {
  assert.strictEqual(typeof storeProvider[method], 'function');
}

(async () => {
  const { createClient } = require('redis');
  const { OidcVaultDpopReplayCapacityError } = require('@web-ts-toolkit/express-oidc-vault');
  const { assertDeviceBindingStore } = await import('./store-contract.mjs');
  const redis = createClient({ url: process.argv[2] });
  const peer = createClient({ url: process.argv[2] });
  await redis.connect(); await peer.connect();
  try {
    const options = { keyPrefix: process.argv[3], dpopReplayMaxEntries: 1 };
    await assertDeviceBindingStore(redisStore.createRedisOidcVaultStore({ ...options, client: redis }), OidcVaultDpopReplayCapacityError,
      redisStore.createRedisOidcVaultStore({ ...options, client: peer }));
  } finally { await peer.quit(); await redis.quit(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

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
