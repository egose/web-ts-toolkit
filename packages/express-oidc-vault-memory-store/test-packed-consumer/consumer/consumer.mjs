import assert from 'node:assert';

import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';
import { OidcVaultDpopReplayCapacityError } from '@web-ts-toolkit/express-oidc-vault';
import { assertDeviceBindingStore } from './store-contract.mjs';

const expected = ['createMemoryOidcVaultStore'].sort();

const actual = Object.keys(await import('@web-ts-toolkit/express-oidc-vault-memory-store')).sort();
assert.deepStrictEqual(actual, expected);
assert.strictEqual(typeof createMemoryOidcVaultStore, 'function');

const storeProvider = createMemoryOidcVaultStore();
assert.strictEqual(typeof storeProvider.createSession, 'function');
assert.strictEqual(typeof storeProvider.consumeExchangeCode, 'function');
for (const method of ['getAuthorizationTransaction', 'consumeAuthorizationTransactionIfMatches',
  'getExchangeCode', 'consumeExchangeCodeIfMatches', 'getSessionRevocationContext', 'reserveDpopProof']) {
  assert.strictEqual(typeof storeProvider[method], 'function');
}

await assertDeviceBindingStore(createMemoryOidcVaultStore({ dpopReplayMaxEntries: 1 }), OidcVaultDpopReplayCapacityError);
