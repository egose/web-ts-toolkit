import {
  createRequestSigner,
  createSignerClient,
  fetchWithAttestation,
  type SignerClient,
} from '@web-ts-toolkit/express-request-attestation/signer';

const apiOrigin = 'https://api.example.com';
const replayNamespace = 'packed-signer-browser';
const signerClient: SignerClient = createSignerClient({
  metadataUrl: `${apiOrigin}/attestation/signer-meta`,
  apiOrigin,
  replayNamespace,
});

async function example(): Promise<Response> {
  return fetchWithAttestation(
    `${apiOrigin}/api/submit`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'packed' }),
    },
    { signerClient, apiOrigin, replayNamespace },
  );
}

async function direct(): Promise<string> {
  const key = new Uint8Array(32);
  key.fill(3);
  const signer = createRequestSigner({
    keyId: 'v1-packed-signer-01',
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

void [signerClient, example, direct];
export {};
