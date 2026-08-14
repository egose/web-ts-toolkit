import assert from 'node:assert';

import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const expected = ['createMemoryOidcVaultStore'].sort();

const actual = Object.keys(await import('@web-ts-toolkit/express-oidc-vault-memory-store')).sort();
assert.deepStrictEqual(actual, expected);
assert.strictEqual(typeof createMemoryOidcVaultStore, 'function');

const storeProvider = createMemoryOidcVaultStore();
assert.strictEqual(typeof storeProvider.createSession, 'function');
assert.strictEqual(typeof storeProvider.consumeExchangeCode, 'function');
