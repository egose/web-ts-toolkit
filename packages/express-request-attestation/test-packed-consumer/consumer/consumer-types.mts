import express from 'express';
import {
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  createSignerBundleRouter,
  createStaticKeyProvider,
  generateAttestationKey,
  type AttestationKeyProvider,
  type AttestationStore,
} from '@web-ts-toolkit/express-request-attestation';
import {
  createSignerClient,
  fetchSignerBundle,
  fetchWithAttestation,
  type SignerClient,
} from '@web-ts-toolkit/express-request-attestation/signer';

const publicOrigin = 'https://api.example.com';
const replayNamespace = 'packed-types-esm';
const maxBodyBytes = 1024 * 1024;
const now = Date.now();
const entry = generateAttestationKey('v1-packed-types-01', {
  acceptFrom: now - 60_000,
  acceptUntil: now + 3_600_000,
});
const keyProvider: AttestationKeyProvider = createStaticKeyProvider({
  currentKeyId: entry.keyId,
  keys: [entry],
});
const store: AttestationStore = createMemoryAttestationStore();
const capture = createAttestationBodyCapture({ maxBodyBytes });
const guard: express.RequestHandler = createRequestAttestationMiddleware({
  publicOrigin,
  replayNamespace,
  keyProvider,
  store,
});
const router: express.Router = createSignerBundleRouter({ publicOrigin, replayNamespace, keyProvider });
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

const signerClient: SignerClient = createSignerClient({
  metadataUrl: `${publicOrigin}/attestation/signer-meta`,
  apiOrigin: publicOrigin,
  replayNamespace,
});
function preparedRequest(request: Request): Promise<Response> {
  return fetchWithAttestation(request, undefined, { signerClient, apiOrigin: publicOrigin, replayNamespace });
}
async function explicitNativeFetch(request: Request): Promise<readonly [Response, Response]> {
  const discovery = {
    metadataUrl: `${publicOrigin}/attestation/signer-meta`, apiOrigin: publicOrigin, replayNamespace, fetch: globalThis.fetch,
  };
  await fetchSignerBundle(discovery);
  const client: SignerClient = createSignerClient(discovery);
  try {
    await client.getSigner();
    const options = { signerClient: client, apiOrigin: publicOrigin, replayNamespace };
    return [
      await fetchWithAttestation(request, undefined, { ...options, fetch: globalThis.fetch }),
      await fetchWithAttestation(request, undefined, { ...options, fetchFn: globalThis.fetch }),
    ];
  } finally {
    client.dispose();
  }
}
void [preparedRequest, explicitNativeFetch];
export {};
