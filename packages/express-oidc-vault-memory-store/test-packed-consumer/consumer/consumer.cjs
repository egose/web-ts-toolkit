/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert');

const memoryStore = require('@web-ts-toolkit/express-oidc-vault-memory-store');

assert.deepStrictEqual(Object.keys(memoryStore).sort(), ['createMemoryOidcVaultStore']);
assert.strictEqual(typeof memoryStore.createMemoryOidcVaultStore, 'function');

const storeProvider = memoryStore.createMemoryOidcVaultStore();
assert.strictEqual(typeof storeProvider.createSession, 'function');
assert.strictEqual(typeof storeProvider.consumeExchangeCode, 'function');
