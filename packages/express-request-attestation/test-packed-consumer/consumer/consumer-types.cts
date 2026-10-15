/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS consumer fixture. */
import express = require('express');
import attestation = require('@web-ts-toolkit/express-request-attestation');
import signing = require('@web-ts-toolkit/express-request-attestation/signer');

const publicOrigin = 'https://api.example.com';
const replayNamespace = 'packed-types-cts';
const maxBodyBytes = 1024 * 1024;
const now = Date.now();
const entry = attestation.generateAttestationKey('v1-packed-cts-01', {
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

const entryKeyId: string = entry.keyId;
const app = express();
app.use('/attestation', router);
app.use(parser);
app.use(captureErrorHandler);
app.post('/api/submit', guard, (_req, res) => {
  res.json({ ok: true });
});
void [app, entryKeyId];

const signerClient: signing.SignerClient = signing.createSignerClient({
  metadataUrl: `${publicOrigin}/attestation/signer-meta`,
  apiOrigin: publicOrigin,
  replayNamespace,
});
function preparedRequest(request: Request): Promise<Response> {
  return signing.fetchWithAttestation(request, undefined, { signerClient, apiOrigin: publicOrigin, replayNamespace });
}
async function explicitNativeFetch(request: Request): Promise<readonly [Response, Response]> {
  const discovery = {
    metadataUrl: `${publicOrigin}/attestation/signer-meta`, apiOrigin: publicOrigin, replayNamespace, fetch: globalThis.fetch,
  };
  await signing.fetchSignerBundle(discovery);
  const client: signing.SignerClient = signing.createSignerClient(discovery);
  try {
    await client.getSigner();
    const options = { signerClient: client, apiOrigin: publicOrigin, replayNamespace };
    return [
      await signing.fetchWithAttestation(request, undefined, { ...options, fetch: globalThis.fetch }),
      await signing.fetchWithAttestation(request, undefined, { ...options, fetchFn: globalThis.fetch }),
    ];
  } finally {
    client.dispose();
  }
}
void [preparedRequest, explicitNativeFetch];
export {};
