/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert');
const express = require('express');

const attestation = require('@web-ts-toolkit/express-request-attestation');

assert.strictEqual(typeof attestation.createRequestAttestationMiddleware, 'function');
assert.strictEqual(typeof attestation.createAttestationBodyCapture, 'function');
assert.strictEqual(typeof attestation.createMemoryAttestationStore, 'function');
assert.strictEqual(typeof attestation.createRedisAttestationStore, 'function');
assert.strictEqual(typeof attestation.createSignerBundleRouter, 'function');
assert.strictEqual(typeof attestation.createStaticKeyProvider, 'function');
assert.strictEqual(typeof attestation.createRotatingKeyProvider, 'function');
assert.strictEqual(typeof attestation.generateAttestationKey, 'function');

(async () => {
  const now = Date.now();
  const entry = attestation.generateAttestationKey('v1-packed-cjs-01', {
    acceptFrom: now - 60_000,
    acceptUntil: now + 3_600_000,
  });
  const keyProvider = attestation.createStaticKeyProvider({ currentKeyId: entry.keyId, keys: [entry] });
  const store = attestation.createMemoryAttestationStore();
  const maxBodyBytes = 1024 * 1024;
  const capture = attestation.createAttestationBodyCapture({ maxBodyBytes });

  const app = express();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  const address = server.address();
  const apiOrigin = `http://127.0.0.1:${address.port}`;
  const guard = attestation.createRequestAttestationMiddleware({
    publicOrigin: apiOrigin,
    replayNamespace: 'packed-cjs',
    keyProvider,
    store,
  });
  app.use('/attestation', attestation.createSignerBundleRouter({ publicOrigin: apiOrigin, replayNamespace: 'packed-cjs', keyProvider }));
  app.use(express.json({ limit: maxBodyBytes, verify: capture.verify, inflate: false }));
  app.use(capture.errorHandler);
  app.use('/api', guard);
  app.post('/api/submit', (req, res) => {
    void req;
    res.json({ ok: true });
  });

  const metaRes = await fetch(`${apiOrigin}/attestation/signer-meta`);
  assert.strictEqual(metaRes.status, 200);
  const meta = await metaRes.json();
  assert.strictEqual(meta.keyId, entry.keyId);

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  console.log('packed CJS consumer ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
