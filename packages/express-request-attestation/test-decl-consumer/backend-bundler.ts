import {
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createMongoAttestationStore,
  createRequestAttestationMiddleware,
  createSignerBundleRouter,
  createStaticKeyProvider,
  generateAttestationKey,
  type AttestationKeyProvider,
  type AttestationStore,
  type MongoAttestationStoreDb,
} from '@web-ts-toolkit/express-request-attestation';

const publicOrigin = 'https://api.example.com';
const replayNamespace = 'decl-backend-bundler';
const maxBodyBytes = 1024 * 1024;
const now = Date.now();
const entry = generateAttestationKey('v1-decl-bundler-01', {
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

// MONGO-03: Bundler resolution also sees the MongoDB replay store without the
// `mongodb` driver installed.
declare const mongoDb: MongoAttestationStoreDb;
const mongoStore: AttestationStore = createMongoAttestationStore({ db: mongoDb });

void [mongoStore];
export {};
