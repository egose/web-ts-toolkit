import { describe, expect, it } from 'vitest';

/**
 * CLIENT-05 jsdom bundle smoke.
 *
 * Imports the *built* ESM bundle (`dist/index.mjs`), not `src`, then runs it
 * under a `jsdom` browser environment. Catches:
 *
 * 1. **Node built-in leak** — module-graph init must not touch `node:*`,
 *    `express`, or other server-only imports at import time.
 * 2. **Basic ESM browser bundling** — the published artifact imports through
 *    Vite in a browser-like environment.
 * 3. **Client invariant spot-checks** — `createDpopProof` enforces the exact
 *    uppercase method rule and insecure API origins are rejected (the
 *    `normalizeStaticOrigin` HTTPS-or-loopback gate, exercised here through
 *    the public `fetchWithDpop` scope check since scope helpers are not root
 *    exports).
 *
 * This is not a real-browser engine gate: no IndexedDB persistence, Web Locks,
 * or network is exercised here (see CLIENT-07).
 */

// Import the built bundle so the test exercises what an installed browser
// consumer actually loads.
import * as pkg from '../dist/index.mjs';

const EXPECTED_RUNTIME_EXPORTS = [
  'DpopNonceCache',
  'OidcVaultDpopClientError',
  'createDeviceFingerprint',
  'createDpopProof',
  'createOidcVaultDpopSession',
  'fetchWithDpop',
  'fingerprintJsSignalSource',
  'getOrCreateDpopKey',
] as const;

describe('CLIENT-05 browser (jsdom) bundle smoke', () => {
  it('runs in a jsdom browser environment', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement('div')).toBeInstanceOf(window.HTMLElement);
  });

  it('imports the built ESM bundle without a Node-only top-level throw', () => {
    expect(pkg).toBeDefined();
    expect(typeof pkg.createDpopProof).toBe('function');
    expect(typeof pkg.fetchWithDpop).toBe('function');
  });

  it('exposes the documented named runtime export surface with no default export', () => {
    expect(Object.keys(pkg).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
    expect('default' in pkg).toBe(false);
  });

  it('createDpopProof rejects a lowercase method from the built bundle', async () => {
    // The method gate runs before any key/crypto use, so a minimal stub key
    // suffices to prove the invariant without WebCrypto in jsdom.
    const stubKey = { privateKey: {}, publicJwk: { kty: 'EC', crv: 'P-256', x: '', y: '' } } as never;
    await expect(
      pkg.createDpopProof(stubKey, { method: 'get', url: 'https://api.example.com/' }),
    ).rejects.toMatchObject({ code: 'INVALID_DPOP_METHOD' });
  });

  it('rejects an insecure API origin through the built bundle scope check', async () => {
    const session = {
      scopeId: 'smoke',
      sessionTransport: 'body',
      login: async () => {},
      exchange: async () => {
        throw new Error('no exchange in smoke');
      },
      logout: async () => {},
      dispose() {},
      getAccessToken: () => undefined,
      getKey: async () => {
        throw new Error('no key in smoke');
      },
      refresh: async () => {
        throw new Error('no refresh in smoke');
      },
      clear: async () => {},
    } as never;
    await expect(
      pkg.fetchWithDpop(
        { session, apis: [{ origin: 'http://insecure.example.com', replayNamespace: 'smoke' }] },
        'http://insecure.example.com/api',
      ),
    ).rejects.toMatchObject({ code: 'INSECURE_DPOP_ORIGIN' });
  });
});
