import assert from 'node:assert';
import { createHash, createHmac } from 'node:crypto';
import express from 'express';
import {
  buildMacInputBytes,
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  createSignerBundleRouter,
  createStaticKeyProvider,
  encodeTransactionId,
  generateAttestationKey,
} from '@web-ts-toolkit/express-request-attestation';

const expectedRoot = [
  'ATTESTATION_ERROR_RESPONSE_HEADER',
  'AttestationCapacityError',
  'AttestationError',
  'AttestationProtocolError',
  'DEFAULT_ATTESTATION_HEADER',
  'buildMacInputBytes',
  'createAttestationBodyCapture',
  'createMemoryAttestationStore',
  'createRedisAttestationStore',
  'createRequestAttestationMiddleware',
  'createRotatingKeyProvider',
  'createSignerBundleRouter',
  'createStaticKeyProvider',
  'deriveAttestationReplayKey',
  'encodeTransactionId',
  'generateAttestationKey',
].sort();

const actualRoot = Object.keys(await import('@web-ts-toolkit/express-request-attestation')).sort();
for (const name of expectedRoot) {
  assert.ok(actualRoot.includes(name), `root export missing: ${name}`);
}

const publicOriginPlaceholder = 'https://api.example.com';
void publicOriginPlaceholder;

const now = Date.now();
const entry = generateAttestationKey('v1-packed-esm-01', {
  acceptFrom: now - 60_000,
  acceptUntil: now + 3_600_000,
});
const keyProvider = createStaticKeyProvider({ currentKeyId: entry.keyId, keys: [entry] });
const store = createMemoryAttestationStore();
const maxBodyBytes = 1024 * 1024;
const capture = createAttestationBodyCapture({ maxBodyBytes });

const app = express();
const started = await new Promise((resolve, reject) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
  server.on('error', reject);
});
const address = started.address();
assert.ok(address !== null && typeof address === 'object');
const apiOrigin = `http://127.0.0.1:${address.port}`;

const guard = createRequestAttestationMiddleware({
  publicOrigin: apiOrigin,
  replayNamespace: 'packed-esm',
  keyProvider,
  store,
});
app.use('/attestation', createSignerBundleRouter({ publicOrigin: apiOrigin, replayNamespace: 'packed-esm', keyProvider }));
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
assert.strictEqual(meta.publicOrigin, apiOrigin);

const bodyText = JSON.stringify({ packed: true });
const timestampMs = Date.now();
const nonceHex = '0123456789abcdef0123456789abcdef'; // pragma: allowlist secret
const bodyHashHex = createHash('sha256').update(bodyText, 'utf8').digest('hex');
const macInput = buildMacInputBytes({
  replayNamespace: 'packed-esm',
  publicOrigin: apiOrigin,
  keyId: entry.keyId,
  timestampMs,
  nonceHex,
  method: 'POST',
  requestTarget: '/api/submit',
  contentType: 'application/json',
  bodyHashHex,
});
const mac = createHmac('sha256', Buffer.from(entry.key)).update(macInput).digest('base64url');
const transactionId = encodeTransactionId({ keyId: entry.keyId, timestampMs, nonceHex, mac });

const guarded = await fetch(`${apiOrigin}/api/submit`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-client-transaction-id': transactionId },
  body: bodyText,
});
assert.strictEqual(guarded.status, 200);
await guarded.arrayBuffer();

await new Promise((resolve, reject) => started.close((err) => (err ? reject(err) : resolve())));
console.log('packed ESM consumer ok');
