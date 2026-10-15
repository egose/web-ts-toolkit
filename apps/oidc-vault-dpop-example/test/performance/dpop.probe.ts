// Opt-in, bounded investigation; intentionally not *.test.ts / *.browser.ts.
// From apps/oidc-vault-dpop-example, AFTER a serialized dependency build:
// DPOP_TEST_BROWSERS=chromium pnpm exec tsx test/performance/dpop.probe.ts browser
// DPOP_TEST_BROWSERS=firefox pnpm exec tsx test/performance/dpop.probe.ts browser
// pnpm exec tsx test/performance/dpop.probe.ts server
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { availableParallelism, cpus, release } from 'node:os';

import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';
import { calculateJwkThumbprint, compactVerify, exportJWK, generateKeyPair, importJWK, SignJWT } from 'jose';

import { resolveDeviceBindingOptions } from '../../../../packages/express-oidc-vault/src/device-binding-policy';
import { createDpopNoncePolicy } from '../../../../packages/express-oidc-vault/src/dpop-nonce';
import { verifyDpopProof } from '../../../../packages/express-oidc-vault/src/dpop-proof';
import {
  createDpopReplayKey,
  createDpopReplayPolicy,
  resolveDpopEffectiveNamespace,
} from '../../../../packages/express-oidc-vault/src/dpop-replay';
import { browserNames, launchBrowser, loginApp, openApp, startBrowserFixture } from '../browser/harness';
import { CallAudit, check, CONCURRENCIES, COUNTS, measure, ProbeFailure, waves } from './metrics';
import type { runBrowserProbe } from './page-probe';

const emit = (value: object) => console.info(`DPH-07 ${JSON.stringify(value)}`);
const require = createRequire(import.meta.url);
let stage = 'prerequisites';

const browserProbe = async () => {
  check(
    browserNames.length > 0 &&
      browserNames.length <= 2 &&
      new Set(browserNames).size === browserNames.length &&
      browserNames.every((name) => name === 'chromium' || name === 'firefox'),
    'Use chromium and/or firefox once each.',
  );
  for (const name of browserNames) {
    stage = `${name}:launch`;
    const browser = await launchBrowser(name);
    try {
      for (const transport of ['body', 'cookie'] as const) {
        stage = `${name}:${transport}:fixture-login`;
        const fixture = await startBrowserFixture(browser, { tokenLifetimeSeconds: 900, nonceLifetimeSeconds: 300 });
        try {
          const page = await openApp(fixture, transport);
          await loginApp(page);
          // Navigation disposes the app's session/listeners while retaining this
          // tab's actual sessionStorage handle, origin's IDB and HttpOnly cookie.
          // Use Vite's native document response, with no Playwright routing/cache
          // interception affecting subsequent cross-origin fetch/preflight work.
          await page.goto(`${fixture.frontendOrigin}/test/performance/blank.html`);
          stage = `${name}:${transport}:measure`;
          const result = await page.evaluate(
            async ({ backendOrigin, transport }) => {
              const load = new Function('return import("/test/performance/page-probe.ts")') as () => Promise<{
                runBrowserProbe: typeof runBrowserProbe;
              }>;
              return (await load()).runBrowserProbe({ backendOrigin, transport });
            },
            { backendOrigin: fixture.backend.backendOrigin, transport },
          );
          const label = { browser: name, version: browser.version(), transport };
          if (result.status === 'failed')
            emit({
              ...label,
              ...result,
              refreshStatuses: fixture.backend.requests
                .filter((request) => request.path === `/auth/oidc/${transport}/refresh`)
                .map((request) => request.status),
            });
          check(result.status === 'passed', 'Browser probe did not pass.');
          emit({ ...label, tokenBytes: result.tokenBytes, nonceBytes: result.nonceBytes, checks: result.checks });
          for (const row of result.rows) emit({ ...label, ...row });
          for (const audit of result.audits) emit({ ...label, diagnosticAudit: audit });
        } finally {
          await fixture.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
};

const serverProbe = async () => {
  stage = 'server:setup';
  const now = 1_800_000_000_000; // Fixed epoch: no expiry/cleanup during the timed fill.
  const accessToken = 'p'.repeat(512); // Synthetic ath input; no JWT validator in this component probe.
  const protectionSpace = {
    type: 'api' as const,
    publicOrigin: 'https://probe.example.invalid',
    replayNamespace: 'dph07',
  };
  const target = `${protectionSpace.publicOrigin}/api/profile`;
  const namespace = resolveDpopEffectiveNamespace(protectionSpace);
  const secret = randomBytes(32);
  const proofOptions = resolveDeviceBindingOptions({ mode: 'required', nonce: { secret, lifetimeSeconds: 300 } })!;
  const noncePolicy = createDpopNoncePolicy({ secret, lifetimeSeconds: 300, namespace: JSON.stringify(namespace) });
  const pair = await generateKeyPair('ES256');
  const jwk = await exportJWK(pair.publicKey);
  const jkt = await calculateJwkThumbprint(jwk);
  const nonce = noncePolicy.issue(jkt, now);
  const ath = createHash('sha256').update(accessToken, 'ascii').digest('base64url');
  const makeProof = () =>
    new SignJWT({ htm: 'GET', htu: target, iat: now / 1000, jti: randomBytes(16).toString('base64url'), ath, nonce })
      .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk })
      .sign(pair.privateKey);
  const verify = (proof: string) =>
    verifyDpopProof({ proof, method: 'GET', targetUrl: target, proofOptions, expectedJkt: jkt, accessToken });
  const capacity = 100_000;
  const prefill = 4096;
  const makeStore = async () => {
    const store = createMemoryOidcVaultStore({ dpopReplayMaxEntries: capacity, now: () => now });
    for (let index = 0; index < prefill; index++)
      check(
        await store.reserveDpopProof({
          replayKey: createDpopReplayKey(namespace, jkt, `prefill-${index}`),
          expiresAt: now + 65_000,
        }),
        'Replay prefill failed.',
      );
    return store;
  };
  const policyFor = (store: ReturnType<typeof createMemoryOidcVaultStore>) =>
    createDpopReplayPolicy({ protectionSpace, proofOptions, replayStore: store, now: () => now });
  emit({
    server: 'ES256',
    tokenBytes: accessToken.length,
    nonceBytes: nonce.length,
    clock: 'fixed',
    proofMaxAgeSeconds: 60,
    clockSkewSeconds: 5,
    memoryPrefill: prefill,
    memoryCapacity: capacity,
  });

  for (let round = 1; round <= COUNTS.rounds; round++)
    for (const concurrency of CONCURRENCIES) {
      stage = `server:round-${round}:c-${concurrency}`;
      const proofs: string[] = [];
      // Generation and one verification of every input are outside all timers.
      const replayKeys: string[] = [];
      for (let index = 0; index < COUNTS.serverWarmup + COUNTS.serverSamples; index++) {
        const proof = await makeProof();
        const verified = await verify(proof);
        check(typeof verified.jti === 'string', 'Missing signed server JTI.');
        proofs.push(proof);
        replayKeys.push(createDpopReplayKey(namespace, jkt, verified.jti));
      }
      check(new Set(replayKeys).size === proofs.length, 'Duplicate input proof JTI.');
      const rawStore = await makeStore();
      const policy = policyFor(await makeStore());
      const cases = [
        ['crypto.import-jwk', () => importJWK(jwk, 'ES256')],
        [
          'crypto.compact-verify-retained-key',
          (index: number) => compactVerify(proofs[index], pair.publicKey, { algorithms: ['ES256'] }),
        ],
        ['crypto.jwk-thumbprint', () => calculateJwkThumbprint(jwk)],
        ['nonce.verify', async () => check(noncePolicy.verify(nonce, jkt, now), 'Valid nonce failed verification.')],
        ['replay.derive-key', async (index: number) => createDpopReplayKey(namespace, jkt, `derive-${index}`)],
        [
          'replay.memory-reserve',
          async (index: number) =>
            check(
              await rawStore.reserveDpopProof({ replayKey: replayKeys[index], expiresAt: now + 65_000 }),
              'Unique memory admission failed.',
            ),
        ],
        ['proof.verifyDpopProof', (index: number) => verify(proofs[index])],
        [
          'proof.verify-nonce-memory',
          async (index: number) =>
            check(
              (await policy.verifyAndReserve(() => verify(proofs[index]))).type === 'accepted',
              'Full proof admission failed.',
            ),
        ],
      ] as const;
      for (const [name, run] of cases)
        emit({
          server: 'ES256',
          round,
          ...(await measure(name, COUNTS.serverWarmup, COUNTS.serverSamples, concurrency, run)),
        });
    }

  for (const concurrency of CONCURRENCIES) {
    stage = `server:audit-c-${concurrency}`;
    const proofs: string[] = [];
    for (let index = 0; index < COUNTS.auditSamples; index++) proofs.push(await makeProof());
    const store = await makeStore();
    const policy = policyFor(store);
    const audit = new CallAudit();
    try {
      for (const method of ['importKey', 'verify', 'digest']) audit.wrap(crypto.subtle, method, `crypto.${method}`);
      audit.wrap(store, 'reserveDpopProof', 'replay.reserve');
      await waves(COUNTS.auditSamples, concurrency, async (index) =>
        check(
          (await policy.verifyAndReserve(() => verify(proofs[index]))).type === 'accepted',
          'Audited admission failed.',
        ),
      );
      for (const name of ['crypto.importKey', 'crypto.verify', 'crypto.digest', 'replay.reserve'])
        check(audit.count(name) === COUNTS.auditSamples, 'Unexpected server crypto/replay count.');
      emit({
        server: 'ES256',
        diagnosticAudit: { concurrency, operations: COUNTS.auditSamples, calls: audit.snapshot() },
      });
    } finally {
      audit.restore();
    }
  }

  stage = 'server:admission-sanity';
  const store = await makeStore();
  let reservations = 0;
  const reserve = store.reserveDpopProof.bind(store);
  store.reserveDpopProof = (input) => {
    reservations++;
    return reserve(input);
  };
  const policy = policyFor(store);
  const proof = await makeProof();
  const outcomes = await Promise.allSettled(
    Array.from({ length: 8 }, () => policy.verifyAndReserve(() => verify(proof))),
  );
  check(
    outcomes.filter((result) => result.status === 'fulfilled' && result.value.type === 'accepted').length === 1,
    'Concurrent replay had other than one winner.',
  );
  check(
    outcomes.filter((result) => result.status === 'rejected' && result.reason?.code === 'OIDC_VAULT_INVALID_DPOP_PROOF')
      .length === 7,
    'Concurrent duplicates did not fail closed.',
  );
  const isRejected = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return false;
    } catch (error) {
      return (error as { code?: string }).code === 'OIDC_VAULT_INVALID_DPOP_PROOF';
    }
  };
  check(await isRejected(() => policy.verifyAndReserve(() => verify(proof))), 'Accepted reservation was released.');
  const before = reservations;
  const segments = proof.split('.');
  const signature = Buffer.from(segments[2], 'base64url');
  signature[0] ^= 1;
  segments[2] = signature.toString('base64url');
  check(await isRejected(() => policy.verifyAndReserve(() => verify(segments.join('.')))), 'Invalid signature passed.');
  check(reservations === before, 'Invalid signature reached replay admission.');
  const otherSpace = createDpopReplayPolicy({
    protectionSpace: { ...protectionSpace, replayNamespace: 'dph07-other' },
    proofOptions,
    replayStore: store,
    now: () => now,
  });
  check(
    (await otherSpace.verifyAndReserve(() => verify(proof))).type === 'nonce-challenge' && reservations === before,
    'Nonce crossed protection spaces or reserved before challenge.',
  );
  emit({
    serverChecks: {
      concurrentSameProof: 8,
      accepted: 1,
      rejected: 7,
      reservationRetained: true,
      invalidSignatureBeforeReservation: true,
      nonceSpaceSeparation: true,
    },
  });
};

try {
  emit({
    runtime: {
      node: process.version,
      v8: process.versions.v8,
      openssl: process.versions.openssl,
      platform: process.platform,
      arch: process.arch,
      kernel: release(),
      cpu: cpus()[0]?.model,
      availableParallelism: availableParallelism(),
      uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE ?? 'default (4)',
      playwright: require('playwright/package.json').version,
      jose: require('jose/package.json').version,
    },
    counts: COUNTS,
    concurrencies: CONCURRENCIES,
  });
  const mode = process.argv[2];
  check(mode === 'browser' || mode === 'server', 'Choose browser or server mode.');
  if (mode === 'browser') await browserProbe();
  else await serverProbe();
  emit({ status: 'passed', mode });
} catch (error) {
  // Never print arbitrary errors, request objects, assertions with actual values,
  // traces, browser console/page content or fixture credential evidence.
  emit({
    status: 'failed',
    stage,
    errorType: error instanceof Error ? error.name : 'unknown',
    ...(error instanceof ProbeFailure ? { diagnostic: error.message } : {}),
  });
  process.exitCode = 1;
}
