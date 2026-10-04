import type express from 'express';
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
const guard = createRequestAttestationMiddleware({ publicOrigin, replayNamespace, keyProvider, store });
const router = createSignerBundleRouter({ publicOrigin, replayNamespace, keyProvider });

function requireBearerAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.headers.authorization !== 'Bearer good-token') {
    res.status(401).json({ code: 'UNAUTHORIZED' });
    return;
  }
  next();
}

const entryKeyId: string = entry.keyId;
const guardKind: string = typeof guard;
const routerKind: string = typeof router;
const captureLimit: number = capture.maxBodyBytes;

void [keyProvider, store, capture, guard, router, requireBearerAuth, entryKeyId, guardKind, routerKind, captureLimit];

// MONGO-03: root named import of the MongoDB replay store typechecks without
// installing the `mongodb` driver (structural `Db` injection only).
declare const mongoDb: MongoAttestationStoreDb;
const mongoOptions: CreateMongoAttestationStoreOptions = { db: mongoDb, maxEntries: 50000 };
const mongoStore: AttestationStore = createMongoAttestationStore(mongoOptions);
const mongoErrorName: AttestationMongoStoreError['name'] = 'AttestationMongoStoreError';

void [mongoStore, mongoErrorName];
export {};
