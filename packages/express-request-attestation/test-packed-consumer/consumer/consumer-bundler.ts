import express from 'express';
import {
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  createSignerBundleRouter,
  createStaticKeyProvider,
  generateAttestationKey,
} from '@web-ts-toolkit/express-request-attestation';

const publicOrigin = 'https://api.example.com';
const replayNamespace = 'packed-bundler';
const maxBodyBytes = 1024 * 1024;
const now = Date.now();
const entry = generateAttestationKey('v1-packed-bundler-01', {
  acceptFrom: now - 60_000,
  acceptUntil: now + 3_600_000,
});
const keyProvider = createStaticKeyProvider({ currentKeyId: entry.keyId, keys: [entry] });
const store = createMemoryAttestationStore();
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

const app = express();
app.use('/attestation', router);
app.use(parser);
app.use(captureErrorHandler);
app.post('/api/submit', guard, (_req, res) => {
  res.json({ ok: true });
});
void [app, entry.keyId];
export {};
