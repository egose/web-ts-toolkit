import express from 'express';
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

// Bundler resolution also sees the structural Mongo store without driver imports.
declare const mongoDb: MongoAttestationStoreDb;
const mongoStore: AttestationStore = createMongoAttestationStore({ db: mongoDb });

void [mongoStore];
export {};
