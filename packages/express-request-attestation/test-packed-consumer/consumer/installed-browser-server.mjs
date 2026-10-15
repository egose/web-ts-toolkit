import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  ATTESTATION_ERROR_RESPONSE_HEADER,
  DEFAULT_ATTESTATION_HEADER,
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  createRotatingKeyProvider,
  createSignerBundleRouter,
  decodeTransactionId,
  generateAttestationKey,
} from '@web-ts-toolkit/express-request-attestation';

const { rotate, exposeMarker } = JSON.parse(process.argv[2]);
const replayNamespace = 'packed-installed-browser';
// Resolve through the installed public export, including its import condition.
// The import map serves these exact bytes; no source/deep import or bundler alias.
const signerEntry = fileURLToPath(import.meta.resolve('@web-ts-toolkit/express-request-attestation/signer'));
const browserEntry = fileURLToPath(new URL('./installed-browser.mjs', import.meta.url));
const browserHtml = fileURLToPath(new URL('./installed-browser.html', import.meta.url));
const sessionCookie = `installed_session=${randomUUID()}`;
const counters = {
  captureCalls: 0,
  authCalls: 0,
  authorizedCalls: 0,
  guardCalls: 0,
  rotations: 0,
  reserveCalls: 0,
  successfulReservations: 0,
  businessCalls: 0,
};
const traffic = [];
const reservations = [];
const effects = [];
const observations = new WeakMap();
const servers = [];

function listen(app) {
  const server = createServer(app);
  // Register ownership before any asynchronous setup can fail.
  servers.push(server);
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 1000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

let shutdownPromise;
function shutdown() {
  shutdownPromise ??= Promise.all(servers.map((server) => new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
      else resolve();
    });
    server.closeAllConnections();
  })));
  return shutdownPromise;
}

function stop(exitCode) {
  clearTimeout(lifetime);
  void shutdown().then(
    () => process.exit(exitCode),
    (error) => { console.error(error); process.exit(1); },
  );
}

// Parent cleanup normally closes the browser and sends SIGTERM. Disconnect and
// a hard fixture lifetime also cover a lost parent or failed test setup.
const lifetime = setTimeout(() => stop(1), 60_000);
process.once('SIGTERM', () => stop(0));
process.once('disconnect', () => stop(0));

function observe(req, res, next) {
  if (traffic.length >= 64) throw new Error('Installed fixture exceeded its request budget');
  const proof = req.get(DEFAULT_ATTESTATION_HEADER) ?? null;
  let envelope = null;
  if (proof !== null) {
    try {
      envelope = decodeTransactionId(proof);
    } catch {
      // Observation must not replace the real guard's rejection of a bad proof.
    }
  }
  const row = {
    method: req.method,
    target: req.originalUrl,
    origin: req.get('origin') ?? null,
    cookie: req.get('cookie') ?? null,
    contentType: req.get('content-type') ?? null,
    fetchMode: req.get('sec-fetch-mode') ?? null,
    fetchDest: req.get('sec-fetch-dest') ?? null,
    requestedMethod: req.get('access-control-request-method') ?? null,
    requestedHeaders: (req.get('access-control-request-headers') ?? '').split(',').filter(Boolean).map((s) => s.trim()),
    proof,
    proofHeaderCount: req.rawHeaders.filter((header, index) =>
      index % 2 === 0 && header.toLowerCase() === DEFAULT_ATTESTATION_HEADER).length,
    envelope,
    receivedAtMs: Date.now(),
    rawBodyHex: null,
    capturedBody: null,
    parsedBody: null,
    principal: null,
    status: null,
  };
  traffic.push(row);
  observations.set(req, row);
  res.once('finish', () => {
    Object.assign(row, {
      status: res.statusCode,
      marker: res.getHeader(ATTESTATION_ERROR_RESPONSE_HEADER) ?? null,
      allowOrigin: res.getHeader('access-control-allow-origin') ?? null,
      allowCredentials: res.getHeader('access-control-allow-credentials') ?? null,
      allowMethods: res.getHeader('access-control-allow-methods') ?? null,
      allowHeaders: res.getHeader('access-control-allow-headers') ?? null,
      maxAge: res.getHeader('access-control-max-age') ?? null,
      exposedHeaders: res.getHeader('access-control-expose-headers') ?? null,
      cacheControl: res.getHeader('cache-control') ?? null,
      countersAtResponse: { ...counters },
    });
  });
  next();
}

function serveBrowser(app) {
  app.get('/', (req, res) => { void req; res.sendFile(browserHtml); });
  app.get('/installed-browser.mjs', (req, res) => { void req; res.sendFile(browserEntry); });
  app.get('/installed-signer.mjs', (req, res) => {
    void req;
    // import.meta.resolve follows pnpm's .pnpm directory. Permit that resolved
    // file explicitly; Express's default dotfile policy otherwise returns 404.
    res.sendFile(signerEntry, { dotfiles: 'allow' });
  });
}

try {
  const api = express();
  const web = express();
  const apiOrigin = await listen(api);
  const webOrigin = await listen(web);
  const now = Date.now();
  const initial = generateAttestationKey('installed-k1', { acceptFrom: now - 60_000, acceptUntil: now + 3_600_000 });
  const replacement = generateAttestationKey('installed-k2', { acceptFrom: now - 60_000, acceptUntil: now + 3_600_000 });
  const keyProvider = createRotatingKeyProvider({ currentKeyId: initial.keyId, keys: [initial] });
  const memory = createMemoryAttestationStore({ maxEntries: 8 });
  const store = {
    async reserve(input) {
      counters.reserveCalls += 1;
      const result = await memory.reserve(input);
      if (result === 'reserved') counters.successfulReservations += 1;
      reservations.push({ ...input, result });
      return result;
    },
  };
  const capture = createAttestationBodyCapture({ maxBodyBytes: 4096 });
  const guard = createRequestAttestationMiddleware({ publicOrigin: apiOrigin, replayNamespace, keyProvider, store });

  // The report is a harness side channel, never used for browser discovery or API transport.
  api.get('/__report', (req, res) => {
    void req;
    res.json({ counters, traffic, reservations, effects, sessionCookie });
  });
  api.use(observe);
  web.use(observe);
  api.use((req, res, next) => {
    if (req.get('origin') === webOrigin) {
      res.set('Access-Control-Allow-Origin', webOrigin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.vary('Origin');
      if (exposeMarker) res.set('Access-Control-Expose-Headers', ATTESTATION_ERROR_RESPONSE_HEADER);
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', `content-type, ${DEFAULT_ATTESTATION_HEADER}`);
        // Force a real preflight on each attempt instead of relying on browser cache state.
        res.set('Access-Control-Max-Age', '0');
        res.status(204).end();
        return;
      }
    }
    next();
  });
  serveBrowser(api);
  serveBrowser(web);
  api.get('/session', (req, res) => {
    void req;
    // Two loopback ports are cross-origin but same-site. This is not a third-party cookie test.
    res.set('Set-Cookie', `${sessionCookie}; HttpOnly; SameSite=Lax; Path=/`);
    res.type('html').send('<!doctype html><title>Fixture session established</title>');
  });
  api.use('/attestation', createSignerBundleRouter({ publicOrigin: apiOrigin, replayNamespace, keyProvider }));
  api.use(express.json({
    limit: 4096,
    inflate: false,
    verify(req, res, bytes, encoding) {
      counters.captureCalls += 1;
      observations.get(req).rawBodyHex = bytes.toString('hex');
      capture.verify(req, res, bytes, encoding);
      observations.get(req).capturedBody = capture.getRecord(req);
    },
  }));
  api.use(capture.errorHandler);
  api.post('/api/submit', (req, res, next) => {
    const row = observations.get(req);
    row.parsedBody = req.body;
    counters.authCalls += 1;
    if (!(req.get('cookie') ?? '').split(';').some((cookie) => cookie.trim() === sessionCookie)) {
      res.set('Cache-Control', 'no-store').status(401).json({ code: 'UNAUTHORIZED', message: 'Fixture session is required.' });
      return;
    }
    counters.authorizedCalls += 1;
    row.principal = 'installed-browser-user';
    if (rotate && counters.rotations === 0) {
      // The POST has already been signed and captured. Drop K1 before the real
      // guard reads its snapshot; only the guard creates the stale response.
      keyProvider.replace({ currentKeyId: replacement.keyId, keys: [replacement] });
      counters.rotations += 1;
    }
    counters.guardCalls += 1;
    guard(req, res, next);
  }, (req, res) => {
    counters.businessCalls += 1;
    const effect = {
      principal: observations.get(req).principal,
      body: req.body,
      target: req.originalUrl,
      capturedBody: capture.getRecord(req),
    };
    effects.push(effect);
    res.json({ ok: true, ...effect });
  });
  process.send({ type: 'ready', apiOrigin, webOrigin, replayNamespace, signerEntry });
} catch (error) {
  console.error(error);
  stop(1);
}
