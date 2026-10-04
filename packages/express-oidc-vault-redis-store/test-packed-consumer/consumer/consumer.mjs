import assert from 'node:assert';

import { createRedisOidcVaultStore, OidcVaultRedisStoreRecordError } from '@web-ts-toolkit/express-oidc-vault-redis-store';
import { createClient } from 'redis';
import { OidcVaultDpopReplayCapacityError } from '@web-ts-toolkit/express-oidc-vault';
import { assertDeviceBindingStore } from './store-contract.mjs';

const expectedExports = ['createRedisOidcVaultStore', 'OidcVaultRedisStoreRecordError'].sort();

const actualExports = Object.keys(await import('@web-ts-toolkit/express-oidc-vault-redis-store')).sort();
assert.deepStrictEqual(actualExports, expectedExports);
assert.strictEqual(typeof createRedisOidcVaultStore, 'function');
assert.strictEqual(typeof OidcVaultRedisStoreRecordError, 'function');

const client = {
  async set() { return 'OK'; },
  async get() { return null; },
  async del() { return 0; },
  async sendCommand() { return null; },
};

const storeProvider = createRedisOidcVaultStore({ client, keyPrefix: 'consumer' });
assert.strictEqual(typeof storeProvider.createSession, 'function');
assert.strictEqual(typeof storeProvider.consumeExchangeCode, 'function');
assert.strictEqual(typeof storeProvider.deleteSessionsBySubject, 'function');
for (const method of ['getAuthorizationTransaction', 'consumeAuthorizationTransactionIfMatches',
  'getExchangeCode', 'consumeExchangeCodeIfMatches', 'getSessionRevocationContext', 'reserveDpopProof']) {
  assert.strictEqual(typeof storeProvider[method], 'function');
}

const redis = createClient({ url: process.argv[2] });
const peer = createClient({ url: process.argv[2] });
await redis.connect();
await peer.connect();
try {
  const options = { keyPrefix: process.argv[3], dpopReplayMaxEntries: 1 };
  await assertDeviceBindingStore(createRedisOidcVaultStore({ ...options, client: redis }), OidcVaultDpopReplayCapacityError,
    createRedisOidcVaultStore({ ...options, client: peer }));
} finally { await peer.quit(); await redis.quit(); }

try {
  createRedisOidcVaultStore({
    client: { async set() { return 'OK'; }, async get() { return null; }, async del() { return 0; } },
  });
  throw new Error('expected missing sendCommand to throw');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  assert.ok(message.includes('sendCommand'), `unexpected error message: ${message}`);
}
