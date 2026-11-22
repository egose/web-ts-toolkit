import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createConnection } from 'mongoose';
import * as esmAttachments from '@web-ts-toolkit/email-service/attachments/mongoose';
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

const cjsAttachments = require('@web-ts-toolkit/email-service/attachments/mongoose');
for (const { createMongooseAttachmentStore } of [esmAttachments, cjsAttachments]) {
  const connection = createConnection();
  try {
    const store = createMongooseAttachmentStore(connection, {
      resolverKey: 'files',
      namespace: 'b6f95fc4-6594-4382-a892-631dcc9de100',
    });
    assert.equal(store.resolverKey, 'files');
    await assert.rejects(store.ready(), { code: 'store_unavailable' });
    assert.equal(connection.readyState, 0);
    assert.deepEqual(connection.modelNames(), []);
  } finally {
    await connection.destroy();
  }
}
