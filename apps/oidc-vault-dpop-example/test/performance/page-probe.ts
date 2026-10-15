// Loaded only by dpop.probe.ts in a real browser through the existing Vite
// fixture. Uses the built client root, real session, IndexedDB and Web Crypto.
import {
  createDpopProof,
  createOidcVaultDpopSession,
  DpopNonceCache,
  fetchWithDpop,
  getOrCreateDpopKey,
  OidcVaultDpopClientError,
} from '@web-ts-toolkit/oidc-vault-dpop-client';
import { openDB } from 'idb';
import { base64url, compactVerify, decodeJwt, importJWK } from 'jose';

// Source-only micro-component; no new public/deep package entrypoint is needed.
import { normalizeDpopTarget } from '../../../../packages/oidc-vault-dpop-client/src/scope';
import { CallAudit, check, CONCURRENCIES, COUNTS, measure, ProbeFailure, waves } from './metrics';

export const runBrowserProbe = async (input: { backendOrigin: string; transport: 'body' | 'cookie' }) => {
  const { backendOrigin, transport } = input;
  const basePath = `/auth/oidc/${transport}`;
  const scope = { frontendOrigin: location.origin, backendOrigin, basePath };
  const session = createOidcVaultDpopSession({ backendOrigin, basePath, sessionTransport: transport });
  const target = `${backendOrigin}/api/profile`;
  const namespace = 'oidc-vault-dpop-example-api';
  const nonces = new DpopNonceCache();
  const context = { session, apis: [{ origin: backendOrigin, replayNamespace: namespace }], nonces };
  const rows = [];
  const audits = [];
  let phase = 'refresh-and-nonce-bootstrap';
  try {
    // Real OIDC login occurred before navigation to this empty same-origin page.
    // Refresh/bootstrap and the first nonce challenge are outside all timings.
    const credential = await session.refresh();
    phase = 'api-nonce-bootstrap';
    const response = await fetchWithDpop(context, target);
    check(response.ok, 'API nonce bootstrap failed.');
    await response.arrayBuffer();
    phase = 'key-and-nonce-check';
    const key = await session.getKey();
    check(!key.privateKey.extractable, 'Expected a non-extractable browser key.');
    const nonce = nonces.get(JSON.stringify(['api', backendOrigin, namespace]), key.jkt);
    check(nonce, 'API nonce bootstrap did not populate its protection space.');
    const proofInput = { method: 'GET', url: target, accessToken: credential.accessToken, nonce };

    // Raw-storage component mirrors withDpopDatabase's open/get/close for the
    // installed key's actual scopeId. It is NOT an alternative authenticated read.
    const readStorage = async () => {
      const db = await openDB('oidc-vault-dpop-example-v1', 1);
      try {
        check(await db.get('keys', key.scopeId), 'Missing raw persisted key.');
      } finally {
        db.close();
      }
    };
    let captured: string[] | undefined;
    let sinkCalls = 0;
    const sink: typeof fetch = async (_url, init) => {
      sinkCalls++;
      if (captured) {
        const proof = new Headers(init?.headers).get('DPoP');
        check(proof, 'API preparation omitted its proof.');
        captured.push(proof);
      }
      return new Response(null, { status: 204 });
    };
    const prepare = () => fetchWithDpop({ ...context, fetch: sink }, target, { retry: 'never' });
    const loopback = async () => {
      const result = await fetchWithDpop(context, target, { retry: 'never' });
      check(result.ok, 'Steady-state API request failed or challenged.');
      await result.arrayBuffer();
    };
    const cases = [
      ['idb.open-get-close', readStorage],
      ['key.read-validate', () => getOrCreateDpopKey(scope, { create: false })],
      ['proof.api-retained-key', () => createDpopProof(key, proofInput)],
      ['api.prepare-local-204', prepare],
      ['api.loopback-with-body', loopback],
    ] as const;
    for (let round = 1; round <= COUNTS.rounds; round++) {
      for (const [name, run] of cases)
        for (const concurrency of CONCURRENCIES) {
          phase = `round-${round}:${name}:c-${concurrency}`;
          rows.push({ round, ...(await measure(name, COUNTS.browserWarmup, COUNTS.browserSamples, concurrency, run)) });
        }
      // Quantized browser clocks need a batch for small synchronous costs. These
      // percentiles describe per-call batch averages, NOT individual calls.
      rows.push({
        round,
        ...(await measure(
          'target.normalize-batch-100',
          COUNTS.browserWarmup,
          COUNTS.browserSamples,
          1,
          async () => {
            for (let index = 0; index < 100; index++)
              check(normalizeDpopTarget(target) === target, 'Normalization drift.');
          },
          100,
        )),
      });
    }

    // Separate audited passes establish actual operation counts and component
    // spans; instrumentation overhead is intentionally not subtracted from rows.
    for (const concurrency of CONCURRENCIES) {
      phase = `audit:c-${concurrency}`;
      const audit = new CallAudit();
      captured = [];
      sinkCalls = 0;
      try {
        for (const method of ['digest', 'importKey', 'sign', 'verify', 'generateKey', 'exportKey'])
          audit.wrap(crypto.subtle, method, `crypto.${method}`);
        audit.wrap(crypto, 'getRandomValues', 'crypto.random128', 'sync');
        audit.wrap(IDBFactory.prototype, 'open', 'idb.open', 'request');
        audit.wrap(IDBObjectStore.prototype, 'get', 'idb.get', 'request');
        audit.wrap(IDBDatabase.prototype, 'close', 'idb.close', 'sync');
        await waves(COUNTS.auditSamples, concurrency, prepare);
        for (const name of [
          'idb.open',
          'idb.get',
          'idb.close',
          'crypto.importKey',
          'crypto.verify',
          'crypto.random128',
        ])
          check(audit.count(name) === COUNTS.auditSamples, 'Unexpected API persistence/crypto operation count.');
        for (const name of ['crypto.digest', 'crypto.sign'])
          check(audit.count(name) === 2 * COUNTS.auditSamples, 'Unexpected API hash/sign operation count.');
        check(
          audit.count('crypto.generateKey') === 0 && audit.count('crypto.exportKey') === 0,
          'Steady-state API generated/exported a key.',
        );
        check(sinkCalls === COUNTS.auditSamples, 'Unexpected API attempt count.');
        audits.push({ concurrency, operations: COUNTS.auditSamples, calls: audit.snapshot() });
      } finally {
        audit.restore();
      }
      // Verify outside all instrumentation/timing. Only aggregate booleans and
      // counts leave this page; neither proofs nor decoded fields are returned.
      const publicKey = await importJWK(key.publicJwk, 'ES256');
      const ath = base64url.encode(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential.accessToken))),
      );
      const identifiers = new Set<string>();
      for (const proof of captured) {
        await compactVerify(proof, publicKey, { algorithms: ['ES256'] });
        const claims = decodeJwt(proof);
        check(
          claims.htm === 'GET' && claims.htu === target && claims.ath === ath && claims.nonce === nonce,
          'Audited API proof claims drifted.',
        );
        check(typeof claims.jti === 'string' && !identifiers.has(claims.jti), 'Audited API reused a proof JTI.');
        identifiers.add(claims.jti);
      }
      check(identifiers.size === COUNTS.auditSamples, 'Missing audited API proofs.');
      captured = undefined;
    }
    return {
      status: 'passed' as const,
      transport,
      tokenBytes: new TextEncoder().encode(credential.accessToken).length,
      nonceBytes: nonce.length,
      rows,
      audits,
      checks: { nonExtractable: true, signatureAthTargetNonceAndFreshJti: COUNTS.auditSamples * CONCURRENCIES.length },
    };
  } catch (error) {
    return {
      status: 'failed' as const,
      phase,
      diagnostic: error instanceof ProbeFailure ? error.message : 'Browser operation failed.',
      errorType:
        error instanceof Error &&
        [
          'Error',
          'TypeError',
          'ReferenceError',
          'AbortError',
          'DataError',
          'OperationError',
          'InvalidAccessError',
        ].includes(error.name)
          ? error.name
          : 'other',
      networkFailure:
        error instanceof TypeError &&
        ['Failed to fetch', 'NetworkError when attempting to fetch resource.'].includes(error.message),
      ...(error instanceof OidcVaultDpopClientError ? { code: error.code } : {}),
    };
  } finally {
    session.dispose();
  }
};
