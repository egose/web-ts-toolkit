/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS consumer fixture. */
import type express = require('express');
import attestation = require('@web-ts-toolkit/express-request-attestation');

const publicOrigin = 'https://api.example.com';
const replayNamespace = 'decl-backend-cts';
const maxBodyBytes = 1024 * 1024;
const now = Date.now();
const entry = attestation.generateAttestationKey('v1-decl-cts-01', {
  acceptFrom: now - 60_000,
  acceptUntil: now + 3_600_000,
});
const keyProvider: attestation.AttestationKeyProvider = attestation.createStaticKeyProvider({
  currentKeyId: entry.keyId,
  keys: [entry],
});
const store: attestation.AttestationStore = attestation.createMemoryAttestationStore();
const capture = attestation.createAttestationBodyCapture({ maxBodyBytes });
const guard = attestation.createRequestAttestationMiddleware({
  publicOrigin,
  replayNamespace,
  keyProvider,
  store,
});
const router = attestation.createSignerBundleRouter({ publicOrigin, replayNamespace, keyProvider });

function requireBearerAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.headers.authorization !== 'Bearer good-token') {
    res.status(401).json({ code: 'UNAUTHORIZED' });
    return;
  }
  next();
}

const entryKeyId: string = entry.keyId;
void [keyProvider, store, capture, guard, router, requireBearerAuth, entryKeyId];
export {};
