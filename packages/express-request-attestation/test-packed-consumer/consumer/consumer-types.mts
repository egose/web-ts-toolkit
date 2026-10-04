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
const guard = createRequestAttestationMiddleware({ publicOrigin, replayNamespace, keyProvider, store });
const router = createSignerBundleRouter({ publicOrigin, replayNamespace, keyProvider });

const entryKeyId: string = entry.keyId;
void [keyProvider, store, capture, guard, router, entryKeyId];
export {};
