/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert');

const memoryStore = require('@web-ts-toolkit/express-oidc-vault-memory-store');

assert.deepStrictEqual(Object.keys(memoryStore).sort(), ['createMemoryOidcVaultStore']);
assert.strictEqual(typeof memoryStore.createMemoryOidcVaultStore, 'function');

const storeProvider = memoryStore.createMemoryOidcVaultStore();
assert.strictEqual(typeof storeProvider.createSession, 'function');
assert.strictEqual(typeof storeProvider.consumeExchangeCode, 'function');
for (const method of ['getAuthorizationTransaction', 'consumeAuthorizationTransactionIfMatches',
  'getExchangeCode', 'consumeExchangeCodeIfMatches', 'getSessionRevocationContext', 'reserveDpopProof']) {
  assert.strictEqual(typeof storeProvider[method], 'function');
}

(async () => {
  const { assertDeviceBindingStore } = await import('./store-contract.mjs');
  const { OidcVaultDpopReplayCapacityError } = require('@web-ts-toolkit/express-oidc-vault');
  await assertDeviceBindingStore(memoryStore.createMemoryOidcVaultStore({ dpopReplayMaxEntries: 1 }), OidcVaultDpopReplayCapacityError);
})().catch((error) => { console.error(error); process.exitCode = 1; });
