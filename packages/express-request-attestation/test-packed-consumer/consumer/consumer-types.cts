/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS consumer fixture. */
import attestation = require('@web-ts-toolkit/express-request-attestation');

const publicOrigin = 'https://api.example.com';
const replayNamespace = 'packed-types-cts';
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
const guard = attestation.createRequestAttestationMiddleware({ publicOrigin, replayNamespace, keyProvider, store });

const entryKeyId: string = entry.keyId;
void [keyProvider, store, guard, entryKeyId];
export {};
