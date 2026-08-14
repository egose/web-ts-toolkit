import assert from 'node:assert';

import { createRedisOidcVaultStore, OidcVaultRedisStoreRecordError } from '@web-ts-toolkit/express-oidc-vault-redis-store';

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

try {
  createRedisOidcVaultStore({
    client: { async set() { return 'OK'; }, async get() { return null; }, async del() { return 0; } },
  });
  throw new Error('expected missing sendCommand to throw');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  assert.ok(message.includes('sendCommand'), `unexpected error message: ${message}`);
}
