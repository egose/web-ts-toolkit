/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS consumer fixture. */
import express = require('express');
import attestation = require('@web-ts-toolkit/express-request-attestation');
import signing = require('@web-ts-toolkit/express-request-attestation/signer');

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
const guard: express.RequestHandler = attestation.createRequestAttestationMiddleware({
  publicOrigin,
  replayNamespace,
  keyProvider,
  store,
});
const router: express.Router = attestation.createSignerBundleRouter({ publicOrigin, replayNamespace, keyProvider });
const parser: express.RequestHandler = express.json({
  limit: maxBodyBytes,
  verify: capture.verify,
  inflate: false,
});
const captureErrorHandler: express.ErrorRequestHandler = capture.errorHandler;

function requireBearerAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.headers.authorization !== 'Bearer good-token') {
    res.status(401).json({ code: 'UNAUTHORIZED' });
    return;
  }
  next();
}

const entryKeyId: string = entry.keyId;
const app = express();
app.use('/attestation', router);
app.use(parser);
app.use(captureErrorHandler);
app.post('/api/submit', requireBearerAuth, guard, (_req, res) => {
  res.json({ ok: true });
});
void [app, entryKeyId];

// NodeNext require conditions must resolve both public declaration entries.
const signerClient: signing.SignerClient = signing.createSignerClient({
  metadataUrl: `${publicOrigin}/attestation/signer-meta`,
  apiOrigin: publicOrigin,
  replayNamespace,
});
function preparedRequest(request: Request): Promise<Response> {
  return signing.fetchWithAttestation(request, undefined, { signerClient, apiOrigin: publicOrigin, replayNamespace });
}
void preparedRequest;
export {};
