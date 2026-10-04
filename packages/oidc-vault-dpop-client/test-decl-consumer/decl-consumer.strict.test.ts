import { describe, expect, it } from 'vitest';

import {
  createDeviceFingerprint,
  createDpopProof,
  createOidcVaultDpopSession,
  DpopNonceCache,
  fetchWithDpop,
  fingerprintJsSignalSource,
  getOrCreateDpopKey,
  OidcVaultDpopClientError,
} from '@web-ts-toolkit/oidc-vault-dpop-client';
import type {
  DpopApi,
  DpopFetchContext,
  DpopFetchOptions,
  DpopKey,
  DpopKeyScope,
  DpopProofInput,
  OidcVaultDpopSession,
  OidcVaultDpopSessionOptions,
} from '@web-ts-toolkit/oidc-vault-dpop-client';
import * as rootNamespace from '@web-ts-toolkit/oidc-vault-dpop-client';

// TypeScript narrowing helper used in place of `expectTypeOf` so the
// underlying type-level assertion is enforced by the strict consumer
// `tsc --noEmit` checks (the `tsconfig-nodenext.json` and
// `tsconfig-bundler.json` files in this directory). Vitest's runtime only
// executes the `expect(...)` lines; the `checkTypes` closure below is never
// invoked, so forming (but not running) browser-crypto calls inside it is
// safe in Node while `tsc` still checks every expression.
const expectTypeAssignableTo = <TExpected>(_actual: TExpected): void => {
  // type-only side-effect: if `_actual` does not satisfy `TExpected`,
  // `tsc` errors at compile time. The runtime body is intentionally
  // empty.
  void _actual;
};

/**
 * CLIENT-06: built declarations must compile under `strict: true` and
 * `skipLibCheck: false` for both NodeNext and Bundler consumers. These
 * positive tests use the published root surface (named imports only, no
 * default export, no `src/` deep import) the way external callers do.
 *
 * Compiled against `dist/index.d.ts`/`dist/index.d.mts` via the consumer
 * `tsconfig-nodenext.json` and `tsconfig-bundler.json` scripts in this
 * directory (wired into the package `typecheck` aggregate).
 */
describe('oidc-vault-dpop-client built-declaration consumer (CLIENT-06)', () => {
  it('exposes the documented named runtime surface from the package root with no default export', () => {
    // CLIENT-08: DpopNonceCache joined the root runtime surface so consumers
    // can share nonce state with fetchWithDpop without deep imports.
    const expected = [
      'DpopNonceCache',
      'OidcVaultDpopClientError',
      'createDeviceFingerprint',
      'createDpopProof',
      'createOidcVaultDpopSession',
      'fetchWithDpop',
      'fingerprintJsSignalSource',
      'getOrCreateDpopKey',
    ].sort();
    expect(Object.keys(rootNamespace).sort()).toEqual(expected);
    expect('default' in rootNamespace).toBe(false);
    expect(typeof createOidcVaultDpopSession).toBe('function');
    expect(typeof fetchWithDpop).toBe('function');
    expect(typeof createDpopProof).toBe('function');
    expect(typeof getOrCreateDpopKey).toBe('function');
    expect(typeof createDeviceFingerprint).toBe('function');
    expect(typeof fingerprintJsSignalSource).toBe('function');
    expect(typeof DpopNonceCache).toBe('function');
    expect(new DpopNonceCache().get('space', 'jkt')).toBeUndefined();
    const err = new OidcVaultDpopClientError('DPOP_KEY_LOST', 'Sign in again.', true);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('OidcVaultDpopClientError');
    expect(err.code).toBe('DPOP_KEY_LOST');
    expect(err.requiresLogin).toBe(true);
  });

  it('creates a session from typed options without inferred-type leaks', () => {
    const checkTypes = () => {
      const options: OidcVaultDpopSessionOptions = {
        backendOrigin: 'https://auth.example.com',
        basePath: '/auth/oidc/body',
        sessionTransport: 'body',
      };
      const session = createOidcVaultDpopSession(options);
      expectTypeAssignableTo<OidcVaultDpopSession>(session);
      expectTypeAssignableTo<string>(session.scopeId);
      expectTypeAssignableTo<'body' | 'cookie'>(session.sessionTransport);
    };
    void checkTypes;
    expect(createOidcVaultDpopSession).toBeDefined();
  });

  it('rejects unknown transports at the consumer boundary', () => {
    const checkTypes = () => {
      createOidcVaultDpopSession({
        backendOrigin: 'https://auth.example.com',
        // @ts-expect-error — only 'body' | 'cookie' are valid transports.
        sessionTransport: 'header',
      });
    };
    void checkTypes;
  });

  it('keeps fetch context/apis typed in the installed declarations', () => {
    const checkTypes = () => {
      const api: DpopApi = { origin: 'https://api.example.com', replayNamespace: 'vault-api' };
      expectTypeAssignableTo<DpopApi>(api);
      const options: DpopFetchOptions = { method: 'GET', retry: 'never' };
      expectTypeAssignableTo<DpopFetchOptions>(options);
      const session = {} as OidcVaultDpopSession;
      const context: DpopFetchContext = { session, apis: [api] };
      expectTypeAssignableTo<DpopFetchContext>(context);
      expectTypeAssignableTo<Promise<Response>>(fetchWithDpop(context, 'https://api.example.com/things'));
      // @ts-expect-error — apis is required; a session alone is not a fetch context.
      expectTypeAssignableTo<DpopFetchContext>({ session });
    };
    void checkTypes;
  });

  it('keeps proof/key/fingerprint helpers typed', () => {
    const checkTypes = () => {
      const scope: DpopKeyScope = {
        frontendOrigin: 'https://app.example.com',
        backendOrigin: 'https://auth.example.com',
        basePath: '/auth/oidc/body',
      };
      expectTypeAssignableTo<Promise<DpopKey>>(getOrCreateDpopKey(scope));
      const key = {} as DpopKey;
      const proofInput: DpopProofInput = { method: 'GET', url: 'https://api.example.com/things' };
      expectTypeAssignableTo<Promise<string>>(createDpopProof(key, proofInput));
      const source = fingerprintJsSignalSource(async () => {
        throw new Error('no vendor fingerprint in typecheck');
      });
      const fingerprint = createDeviceFingerprint(source);
      expectTypeAssignableTo<Promise<Readonly<Record<string, string>>>>(fingerprint.headers());
    };
    void checkTypes;
  });
});
