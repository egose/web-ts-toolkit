import {
  createRequestSigner,
  createSignerClient,
  fetchWithAttestation,
  type FetchWithAttestationOptions,
  type RequestSigner,
  type SignerClient,
} from '@web-ts-toolkit/express-request-attestation/signer';

const apiOrigin = 'https://api.example.com';
const replayNamespace = 'decl-signer-browser';
const signerClient: SignerClient = createSignerClient({
  metadataUrl: `${apiOrigin}/attestation/signer-meta`,
  apiOrigin,
  replayNamespace,
});

async function preparedGet(signer: SignerClient): Promise<Response> {
  const options: FetchWithAttestationOptions = { signerClient: signer, apiOrigin, replayNamespace };
  return fetchWithAttestation(`${apiOrigin}/api/items`, { method: 'GET' }, options);
}

async function directSign(): Promise<string> {
  const key = new Uint8Array(32);
  key.fill(7);
  const signer: RequestSigner = createRequestSigner({
    keyId: 'v1-decl-browser-01',
    key,
    publicOrigin: apiOrigin,
    replayNamespace,
  });
  return signer.sign({
    method: 'GET',
    requestTarget: '/api/items',
    contentType: '',
    bodyHashHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // pragma: allowlist secret
    timestampMs: Date.now(),
    nonceHex: '0123456789abcdef0123456789abcdef', // pragma: allowlist secret
  });
}

void [signerClient, preparedGet, directSign];
export {};
