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
  type AttestationMongoStoreError,
  type AttestationStore,
  type CreateMongoAttestationStoreOptions,
  type MongoAttestationStoreDb,
} from '@web-ts-toolkit/express-request-attestation';
import {
  createSignerClient,
  fetchWithAttestation,
  type SignerClient,
} from '@web-ts-toolkit/express-request-attestation/signer';

const publicOrigin = 'https://api.example.com';
const replayNamespace = 'decl-backend-strict';
const maxBodyBytes = 1024 * 1024;
const now = Date.now();
const entry = generateAttestationKey('v1-decl-01', {
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

function requireBearerAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.headers.authorization !== 'Bearer good-token') {
    res.status(401).json({ code: 'UNAUTHORIZED' });
    return;
  }
  next();
}

const entryKeyId: string = entry.keyId;
const captureLimit: number = capture.maxBodyBytes;

const app = express();
app.use('/attestation', router);
app.use(parser);
app.use(captureErrorHandler);
app.post('/api/submit', requireBearerAuth, guard, (_req, res) => {
  res.json({ ok: true });
});
void [app, entryKeyId, captureLimit];

// NodeNext import conditions must resolve both public declaration entries.
const signerClient: SignerClient = createSignerClient({
  metadataUrl: `${publicOrigin}/attestation/signer-meta`,
  apiOrigin: publicOrigin,
  replayNamespace,
});
function preparedRequest(request: Request): Promise<Response> {
  return fetchWithAttestation(request, undefined, { signerClient, apiOrigin: publicOrigin, replayNamespace });
}
void preparedRequest;

// The public Mongo store accepts structural injection without importing driver types.
declare const mongoDb: MongoAttestationStoreDb;
const mongoOptions: CreateMongoAttestationStoreOptions = { db: mongoDb, maxEntries: 50000 };
const mongoStore: AttestationStore = createMongoAttestationStore(mongoOptions);
const mongoErrorName: AttestationMongoStoreError['name'] = 'AttestationMongoStoreError';

void [mongoStore, mongoErrorName];
export {};
