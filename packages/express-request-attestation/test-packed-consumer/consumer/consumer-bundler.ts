import {
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  createStaticKeyProvider,
  generateAttestationKey,
} from '@web-ts-toolkit/express-request-attestation';

const publicOrigin = 'https://api.example.com';
const replayNamespace = 'packed-bundler';
const now = Date.now();
const entry = generateAttestationKey('v1-packed-bundler-01', {
  acceptFrom: now - 60_000,
  acceptUntil: now + 3_600_000,
});
const keyProvider = createStaticKeyProvider({ currentKeyId: entry.keyId, keys: [entry] });
const store = createMemoryAttestationStore();
const guard = createRequestAttestationMiddleware({ publicOrigin, replayNamespace, keyProvider, store });

void [keyProvider, store, guard, entry.keyId];
export {};
