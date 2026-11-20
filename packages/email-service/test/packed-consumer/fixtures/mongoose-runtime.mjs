import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createConnection } from 'mongoose';
import { createMongooseEmailStore } from '@web-ts-toolkit/email-service/mongoose';

const require = createRequire(import.meta.url);
const cjsFactory = require('@web-ts-toolkit/email-service/mongoose').createMongooseEmailStore;
for (const factory of [createMongooseEmailStore, cjsFactory]) {
  const connection = createConnection();
  try {
    const store = factory(connection);
    await assert.rejects(store.ready(), { code: 'store_unavailable' });
    assert.equal(connection.readyState, 0);
    assert.deepEqual(connection.modelNames(), []);
  } finally {
    await connection.destroy();
  }
}
