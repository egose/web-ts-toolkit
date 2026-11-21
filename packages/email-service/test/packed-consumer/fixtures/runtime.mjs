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
};

assert(Number(process.versions.node.split('.')[0]) >= 24, 'consumer must use Node >=24');
for (const peer of ['mongoose', 'nodemailer']) {
  if (peers[peer]) assert.match(import.meta.resolve(peer), new RegExp(`/node_modules/${peer}/`));
  else assert.throws(() => import.meta.resolve(peer), { code: 'ERR_MODULE_NOT_FOUND' });
}
for (const subpath of ['index.js', 'dist/index.js']) {
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
  assert.equal(fileURLToPath(import.meta.resolve(specifier)), join(packageDir, output, `${name}.mjs`));
  assert.equal(cjsRequire.resolve(specifier), join(packageDir, output, `${name}.js`));
  if (name === 'smtp' && !peers.nodemailer) {
    // Resolution alone works. Importing the actual adapter opts into Nodemailer.
    await assert.rejects(import(specifier), { code: 'ERR_MODULE_NOT_FOUND', message: /nodemailer/ });
    assert.throws(() => cjsRequire(specifier), { code: 'MODULE_NOT_FOUND', message: /nodemailer/ });
    continue;
  }
  // In contrast to SMTP, the Mongoose module itself needs no runtime peer.
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
