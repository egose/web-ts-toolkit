import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageName = '@web-ts-toolkit/email-service';
const cjsRequire = createRequire(import.meta.url);
const [packageDir, output, peerJson] = process.argv.slice(2);
const peers = JSON.parse(peerJson);
const expectedExports = {
  index: [
    'EmailError',
    'createEmailAdmin',
    'createEmailBatchAdmission',
    'createEmailBatchService',
    'createEmailRelay',
    'createEmailService',
    'createEmailTemplateRegistry',
    'createEmailWorker',
    'createMemoryEmailStore',
    'createSmtpAcceptanceResult',
    'defineLocalTemplate',
    'defineSendGridTemplate',
  ],
  smtp: ['createSmtpProvider'],
  sendgrid: ['createSendGridProvider'],
  mongoose: ['createMongooseEmailStore'],
  attachments: ['checkManagedAttachmentRetention'],
  'attachments/mongoose': ['createMongooseAttachmentStore'],
  'attachments/s3': ['createS3AttachmentClient', 'createS3AttachmentStore'],
  'attachments/azure': ['createAzureAttachmentContainerClient', 'createAzureAttachmentStore'],
};
const runtimePeer = {
  smtp: 'nodemailer',
  'attachments/s3': '@aws-sdk/client-s3',
  'attachments/azure': '@azure/storage-blob',
};

assert(Number(process.versions.node.split('.')[0]) >= 24, 'consumer must use Node >=24');
for (const peer of ['mongoose', ...Object.values(runtimePeer)]) {
  if (peers[peer]) assert.match(import.meta.resolve(peer), new RegExp(`/node_modules/${peer}/`));
  else assert.throws(() => import.meta.resolve(peer), { code: 'ERR_MODULE_NOT_FOUND' });
}
for (const subpath of [
  'index.js',
  'dist/index.js',
  'attachments-s3.js',
  'dist/attachments-azure.mjs',
  'attachments/store',
]) {
  assert.throws(() => cjsRequire.resolve(`${packageName}/${subpath}`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  assert.throws(() => import.meta.resolve(`${packageName}/${subpath}`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
}

let unexpectedCalls = 0;
const unexpected = () => {
  unexpectedCalls++;
  assert.fail('email-service started a timer during import');
};
for (const name of ['setTimeout', 'setInterval', 'setImmediate']) globalThis[name] = unexpected;
Object.assign(cjsRequire('node:timers'), { setTimeout: unexpected, setInterval: unexpected, setImmediate: unexpected });
Object.assign(cjsRequire('node:timers/promises'), {
  setTimeout: unexpected,
  setInterval: unexpected,
  setImmediate: unexpected,
});
syncBuiltinESMExports();

const modules = {};
for (const [name, expected] of Object.entries(expectedExports)) {
  const specifier = name === 'index' ? packageName : `${packageName}/${name}`;
  const stem = name.replace('/', '-');
  assert.equal(fileURLToPath(import.meta.resolve(specifier)), join(packageDir, output, `${stem}.mjs`));
  assert.equal(cjsRequire.resolve(specifier), join(packageDir, output, `${stem}.js`));
  const peer = runtimePeer[name];
  if (peer && !peers[peer]) {
    // Resolution alone works. Only importing the actual adapter opts into its runtime peer.
    await assert.rejects(import(specifier), { code: 'ERR_MODULE_NOT_FOUND', message: new RegExp(peer) });
    assert.throws(() => cjsRequire(specifier), { code: 'MODULE_NOT_FOUND', message: new RegExp(peer) });
    continue;
  }
  // Both Mongoose modules use the caller's driver and need no runtime peer.
  const builds = [await import(specifier), cjsRequire(specifier)];
  for (const entry of builds) {
    assert.deepEqual(Object.keys(entry).sort(), expected);
    for (const exported of expected) assert.equal(typeof entry[exported], 'function');
  }
  modules[name] = builds;
}
const [esmRoot, cjsRoot] = modules.index;
const esmError = new esmRoot.EmailError('invalid_input');
const cjsError = new cjsRoot.EmailError('invalid_input');
assert.equal(esmError.code, 'invalid_input');
assert.equal(esmError.code, cjsError.code);
assert.equal(esmError.message, cjsError.message);

if (modules['attachments/s3']) {
  const [esm, cjs] = modules['attachments/s3'];
  const { S3Client } = await import('@aws-sdk/client-s3');
  const config = { region: 'us-east-1', credentials: { accessKeyId: 'synthetic', secretAccessKey: 'synthetic' } };
  const binding = {
    bucket: 'private-delivery',
    resolverKey: 'managed',
    namespace: 'a933fb82-7cce-4249-a09b-09252328f84f',
    prefix: 'delivery/',
  };
  const ordinary = new S3Client(config);
  const esmClient = esm.createS3AttachmentClient(config);
  const cjsClient = cjs.createS3AttachmentClient(config);
  try {
    assert(esmClient instanceof S3Client && cjsClient instanceof S3Client);
    assert.equal(esm.createS3AttachmentStore(esmClient, binding).resolverKey, 'managed');
    assert.equal(cjs.createS3AttachmentStore(cjsClient, binding).resolverKey, 'managed');
    assert.throws(() => esm.createS3AttachmentStore(ordinary, binding), { code: 'invalid_config' });
    assert.throws(() => cjs.createS3AttachmentStore(ordinary, binding), { code: 'invalid_config' });
    assert.throws(() => esm.createS3AttachmentStore(cjsClient, binding), { code: 'invalid_config' });
    assert.throws(() => cjs.createS3AttachmentStore(esmClient, binding), { code: 'invalid_config' });
  } finally {
    ordinary.destroy();
    esmClient.destroy();
    cjsClient.destroy();
  }
}

for (const [index, entry] of modules.sendgrid.entries()) {
  assert.throws(
    () => entry.createSendGridProvider({ key: 'test', apiKey: '' }),
    (error) => {
      assert.equal(error.code, 'invalid_config');
      assert.equal(error instanceof modules.index[index].EmailError, false, 'same-format subpath error identity');
      return true;
    },
  );
  const provider = entry.createSendGridProvider({ key: 'test', apiKey: 'synthetic-key', mode: 'sandbox' });
  assert.deepEqual(provider.ref, { kind: 'sendgrid', key: 'test', mode: 'sandbox' });
  const prepared = provider.prepare({
    jobId: randomUUID(),
    attemptId: randomUUID(),
    snapshot: {
      version: 1,
      kind: 'sendgrid',
      provider: provider.ref,
      template: { key: 'fixture', revision: 'v1' },
      preparedAt: 1_000,
      expiresAt: 2_000,
      priority: 0,
      attachments: [],
      correlation: {},
      envelope: {
        from: { address: 'from@example.invalid' },
        to: [{ address: 'to@example.invalid' }],
        cc: [],
        bcc: [],
      },
      templateId: 'd-0123456789abcdeffedcba9876543210',
      data: {},
    },
    attachments: [],
  });
  assert.deepEqual(await prepared.submit({ signal: AbortSignal.abort(), timeoutMs: 1 }), {
    outcome: 'unknown',
    retry: 'never',
    stage: 'connect',
    reason: 'provider_aborted',
  });
  await assert.rejects(prepared.submit({ signal: AbortSignal.abort(), timeoutMs: 1 }), { code: 'closed' });
}
assert.equal(unexpectedCalls, 0);

console.log(process.versions.node);
