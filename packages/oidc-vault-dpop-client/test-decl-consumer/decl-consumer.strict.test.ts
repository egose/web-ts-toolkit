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
  BearerAccessToken,
  BearerApi,
  BearerFetchContext,
  DpopAccessToken,
  DpopApi,
  DpopFetchContext,
  DpopFetchOptions,
  DpopKey,
  DpopKeyScope,
  DpopProofInput,
  OidcVaultDpopSession,
  OidcVaultDpopAutoRefreshOptions,
  OidcVaultDpopSessionOptions,
  OidcVaultAccessToken,
  OidcVaultBearerSession,
  OidcVaultBearerSessionOptions,
  OidcVaultSession,
  OidcVaultSessionOptions,
  OidcVaultFetchContext,
  OidcVaultLogoutNavigationInput,
  OidcVaultLogoutNavigationResult,
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

type TypesEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectTypesEqual = <TActual, TExpected>(_equal: TypesEqual<TActual, TExpected>): void => {
  void _equal;
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
        requestTimeoutMs: 15_000,
        maxResponseBytes: 1_048_576,
        autoRefresh: {
          refreshBeforeExpiryMs: 60_000,
          maxRefreshIntervalMs: 20 * 60_000,
        } satisfies OidcVaultDpopAutoRefreshOptions,
        onAutoRefreshError: (error) => expectTypeAssignableTo<unknown>(error),
        onCredentialsChanged: (credentials) => expectTypeAssignableTo<DpopAccessToken | undefined>(credentials),
      };
      const session = createOidcVaultDpopSession(options);
      expectTypeAssignableTo<OidcVaultDpopSession>(session);
      expectTypeAssignableTo<string>(session.scopeId);
      expectTypeAssignableTo<'body' | 'cookie'>(session.sessionTransport);
      expectTypeAssignableTo<Promise<void>>(session.resetKey());
      expectTypeAssignableTo<Promise<void>>(session.logoutAndNavigate());
      expectTypeAssignableTo<OidcVaultLogoutNavigationInput>({ sessionId: 'opaque' });
      expectTypeAssignableTo<OidcVaultLogoutNavigationResult>({
        loggedOut: true,
        navigationUrl: 'https://auth.example.com/auth/oidc/body/logout/navigation',
      });
      // @ts-expect-error — return destinations are server configuration, not input.
      session.logoutAndNavigate('https://evil.example');
      // @ts-expect-error — reset is scoped by the session, never an arbitrary key id.
      session.resetKey('another-scope');
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
      createOidcVaultDpopSession({
        backendOrigin: 'https://auth.example.com',
        // @ts-expect-error — observers are callbacks, not storage adapters.
        onCredentialsChanged: 'localStorage',
      });
      createOidcVaultDpopSession({ backendOrigin: 'https://auth.example.com', autoRefresh: false });
      createOidcVaultDpopSession({
        backendOrigin: 'https://auth.example.com',
        // @ts-expect-error — enabled configuration is an options object, not true.
        autoRefresh: true,
      });
      // @ts-expect-error — durations are numeric milliseconds, not strings.
      expectTypeAssignableTo<OidcVaultDpopAutoRefreshOptions>({ maxRefreshIntervalMs: '20m' });
    };
    void checkTypes;
  });

  it('preserves exact default DPoP types and infers explicit Bearer and runtime-boolean sessions', () => {
    const checkTypes = () => {
      const backendOrigin = 'https://auth.example.com';
      expectTypesEqual<DpopAccessToken['tokenType'], 'DPoP'>(true);
      expectTypesEqual<DpopAccessToken['jkt'], string>(true);
      expectTypesEqual<
        OidcVaultDpopSessionOptions['onCredentialsChanged'],
        ((credentials: DpopAccessToken | undefined) => void) | undefined
      >(true);
      const defaults = createOidcVaultDpopSession({
        backendOrigin,
        onCredentialsChanged(credentials) {
          expectTypesEqual<typeof credentials, DpopAccessToken | undefined>(true);
          void credentials;
        },
      });
      const explicitTrue = createOidcVaultDpopSession({
        backendOrigin,
        dpop: true,
        onCredentialsChanged(credentials) {
          expectTypesEqual<typeof credentials, DpopAccessToken | undefined>(true);
          void credentials;
        },
      });
      const annotated: OidcVaultDpopSessionOptions = {
        backendOrigin,
        onCredentialsChanged(credentials) {
          expectTypesEqual<typeof credentials, DpopAccessToken | undefined>(true);
          void credentials;
        },
      };
      const annotatedSession = createOidcVaultDpopSession(annotated);
      expectTypeAssignableTo<true>(defaults.dpop);
      expectTypeAssignableTo<true>(explicitTrue.dpop);
      expectTypeAssignableTo<true>(annotatedSession.dpop);
      expectTypesEqual<ReturnType<typeof defaults.getAccessToken>, DpopAccessToken | undefined>(true);
      expectTypeAssignableTo<Promise<DpopAccessToken>>(explicitTrue.exchange('code'));
      expectTypeAssignableTo<Promise<DpopAccessToken>>(annotatedSession.refresh());
      expectTypeAssignableTo<string>(defaults.getAccessToken()!.jkt);
      expectTypeAssignableTo<'DPoP'>(defaults.getAccessToken()!.tokenType);

      const bearer = createOidcVaultDpopSession({
        backendOrigin,
        dpop: false,
        autoRefresh: { refreshBeforeExpiryMs: 60_000 },
        onAutoRefreshError: (error) => expectTypeAssignableTo<unknown>(error),
        onCredentialsChanged(credentials) {
          expectTypesEqual<typeof credentials, BearerAccessToken | undefined>(true);
          void credentials;
        },
      });
      const bearerOptions: OidcVaultBearerSessionOptions = {
        backendOrigin,
        dpop: false,
        onCredentialsChanged(credentials) {
          expectTypesEqual<typeof credentials, BearerAccessToken | undefined>(true);
          void credentials;
        },
      };
      expectTypesEqual<typeof bearer, OidcVaultBearerSession>(true);
      expectTypesEqual<ReturnType<typeof bearer.getAccessToken>, BearerAccessToken | undefined>(true);
      expectTypeAssignableTo<OidcVaultBearerSession>(createOidcVaultDpopSession(bearerOptions));
      expectTypeAssignableTo<false>(bearer.dpop);
      expectTypeAssignableTo<'Bearer'>(bearer.getAccessToken()!.tokenType);
      expectTypeAssignableTo<Promise<BearerAccessToken>>(bearer.exchange('code'));
      expectTypeAssignableTo<Promise<BearerAccessToken>>(bearer.refresh({ rejectedToken: 'opaque' }));
      // @ts-expect-error — Bearer credentials have neither a thumbprint nor a DPoP scheme.
      expectTypeAssignableTo<DpopAccessToken>(bearer.getAccessToken()!);
      // @ts-expect-error — no fabricated binding on unbound credentials.
      void bearer.getAccessToken()!.jkt;
      // @ts-expect-error — key operations are absent, not optional Bearer capabilities.
      bearer.getKey();
      // @ts-expect-error — Bearer cannot delete an installed DPoP key.
      bearer.resetKey();
      // @ts-expect-error — unbound provider navigation is not supported.
      bearer.logoutAndNavigate();
      // @ts-expect-error — a factory's mode is immutable.
      bearer.dpop = false;
      // @ts-expect-error — the original options name still selects only DPoP.
      expectTypeAssignableTo<OidcVaultDpopSessionOptions>({ backendOrigin, dpop: false });

      const dpopEnabled: boolean = Math.random() > 0.5;
      const dynamic = createOidcVaultDpopSession({
        backendOrigin,
        dpop: dpopEnabled,
        onCredentialsChanged(credentials) {
          expectTypesEqual<typeof credentials, OidcVaultAccessToken | undefined>(true);
          if (credentials?.tokenType === 'DPoP') expectTypeAssignableTo<string>(credentials.jkt);
          if (credentials?.tokenType === 'Bearer') {
            expectTypeAssignableTo<BearerAccessToken>(credentials);
            // @ts-expect-error — the credential union narrows away DPoP fields.
            void credentials.jkt;
          }
        },
      });
      const dynamicOptions: OidcVaultSessionOptions = {
        backendOrigin,
        dpop: dpopEnabled,
        autoRefresh: { refreshBeforeExpiryMs: 60_000, maxRefreshIntervalMs: 20 * 60_000 },
        onCredentialsChanged(credentials) {
          expectTypesEqual<typeof credentials, OidcVaultAccessToken | undefined>(true);
          void credentials;
        },
      };
      expectTypesEqual<typeof dynamic, OidcVaultSession>(true);
      expectTypeAssignableTo<OidcVaultSession>(createOidcVaultDpopSession(dynamicOptions));
      expectTypeAssignableTo<boolean>(dynamic.dpop);
      expectTypeAssignableTo<OidcVaultAccessToken | undefined>(dynamic.getAccessToken());
      if (dynamic.dpop) {
        expectTypeAssignableTo<Promise<DpopKey>>(dynamic.getKey());
        expectTypeAssignableTo<Promise<DpopAccessToken>>(dynamic.refresh());
        expectTypeAssignableTo<string>(dynamic.getAccessToken()!.jkt);
      } else {
        expectTypeAssignableTo<OidcVaultBearerSession>(dynamic);
        expectTypeAssignableTo<Promise<BearerAccessToken>>(dynamic.refresh());
        // @ts-expect-error — dpop: false removes key operations after narrowing.
        dynamic.getKey();
      }
      // @ts-expect-error — un-narrowed runtime sessions are not DPoP-only adapters.
      expectTypeAssignableTo<OidcVaultDpopSession>(dynamic);

      const dpopObserver = (credentials: DpopAccessToken | undefined): void => {
        void credentials;
      };
      const bearerObserver = (credentials: BearerAccessToken | undefined): void => {
        void credentials;
      };
      // @ts-expect-error — false cannot select a DPoP-only observer through another overload.
      createOidcVaultDpopSession({ backendOrigin, dpop: false, onCredentialsChanged: dpopObserver });
      // @ts-expect-error — omission cannot select a Bearer-only observer through the runtime overload.
      createOidcVaultDpopSession({ backendOrigin, onCredentialsChanged: bearerObserver });
      // @ts-expect-error — a runtime mode requires an observer that accepts both credential types.
      createOidcVaultDpopSession({ backendOrigin, dpop: dpopEnabled, onCredentialsChanged: dpopObserver });
      // @ts-expect-error — runtime booleans cannot assume Bearer-only observation either.
      createOidcVaultDpopSession({ backendOrigin, dpop: dpopEnabled, onCredentialsChanged: bearerObserver });
      // @ts-expect-error — autoRefresh true is not a policy in Bearer mode either.
      createOidcVaultDpopSession({ backendOrigin, dpop: false, autoRefresh: true });

      // An existing custom adapter can still omit the newly added property.
      const { dpop: factoryMode, ...legacyAdapter } = defaults;
      void factoryMode;
      expectTypeAssignableTo<OidcVaultDpopSession>(legacyAdapter);
      expectTypeAssignableTo<Promise<Response>>(
        fetchWithDpop(
          {
            session: legacyAdapter,
            apis: [{ origin: backendOrigin, replayNamespace: 'legacy' }],
          },
          `${backendOrigin}/api`,
        ),
      );
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

  it('allows namespace omission only for definitely-Bearer fetch contexts', () => {
    const checkTypes = () => {
      const origin = 'https://api.example.com';
      const bearer = createOidcVaultDpopSession({ backendOrigin: origin, dpop: false });
      const api: BearerApi = { origin, pathPrefix: '/api', credentials: 'include' };
      const bearerContext: BearerFetchContext = { session: bearer, apis: [api], nonces: new DpopNonceCache() };
      expectTypeAssignableTo<Promise<Response>>(fetchWithDpop(bearerContext, `${origin}/api`));
      expectTypeAssignableTo<Promise<Response>>(fetchWithDpop({ session: bearer, apis: [{ origin }] }, origin));
      expectTypeAssignableTo<Promise<Response>>(
        fetchWithDpop({ session: bearer, apis: [{ origin, replayNamespace: 'unused' }] }, origin),
      );
      expectTypeAssignableTo<BearerApi>({ origin, replayNamespace: 'compatible' } satisfies DpopApi);
      // @ts-expect-error — no weakening of the existing DPoP namespace requirement.
      expectTypeAssignableTo<DpopApi>({ origin });
      // @ts-expect-error — optional namespace is a string, not a mode switch or boolean.
      expectTypeAssignableTo<BearerApi>({ origin, replayNamespace: false });
      // @ts-expect-error — Bearer adapters cannot satisfy the default DPoP context.
      expectTypeAssignableTo<DpopFetchContext>(bearerContext);

      const dpop = createOidcVaultDpopSession({ backendOrigin: origin });
      // @ts-expect-error — DPoP calls cannot use namespace-free scopes through the Bearer overload.
      fetchWithDpop({ session: dpop, apis: [{ origin }] }, origin);
      // @ts-expect-error — definitely-Bearer context requires the explicit false discriminator.
      expectTypeAssignableTo<BearerFetchContext>({ session: dpop, apis: [{ origin }] });
      const dynamic = createOidcVaultDpopSession({ backendOrigin: origin, dpop: Math.random() > 0.5 });
      const runtime: OidcVaultFetchContext = { session: dynamic, apis: [{ origin, replayNamespace: 'runtime-api' }] };
      expectTypeAssignableTo<Promise<Response>>(fetchWithDpop(runtime, `${origin}/api`));
      expectTypeAssignableTo<Promise<Response>>(fetchWithDpop({ session: dynamic, apis: runtime.apis }, origin));
      // @ts-expect-error — a runtime mode can be DPoP, so namespaces remain required.
      expectTypeAssignableTo<OidcVaultFetchContext>({ session: dynamic, apis: [{ origin }] });
      // @ts-expect-error — a runtime session cannot sneak namespace-free policies through another overload.
      fetchWithDpop({ session: dynamic, apis: [{ origin }] }, origin);
      if (!dynamic.dpop) fetchWithDpop({ session: dynamic, apis: [{ origin }] }, origin);
      // @ts-expect-error — request options cannot override the session authentication mode.
      fetchWithDpop(bearerContext, origin, { dpop: true });
    };
    void checkTypes;
  });

  it('types independent gateway services with optional path scopes and per-service credentials', () => {
    const checkTypes = () => {
      const origin = 'https://gateway.example.com';
      const apis = [
        { origin, pathPrefix: '/orders', replayNamespace: 'orders-api' },
        { origin, pathPrefix: '/billing', replayNamespace: 'billing-api', credentials: 'include' },
        { origin, pathPrefix: '/orders/admin/', replayNamespace: 'orders-admin-api', credentials: 'omit' },
      ] as const satisfies readonly DpopApi[];
      const session = {} as OidcVaultDpopSession;
      const context: DpopFetchContext = { session, apis };
      expectTypeAssignableTo<Promise<Response>>(fetchWithDpop(context, `${origin}/orders?limit=20`));
      expectTypeAssignableTo<Promise<Response>>(fetchWithDpop(context, `${origin}/billing/invoices`));
      // Omission and explicit root remain valid origin-wide policies.
      expectTypeAssignableTo<DpopApi>({ origin, replayNamespace: 'origin-wide' });
      expectTypeAssignableTo<DpopApi>({ origin, pathPrefix: '/', replayNamespace: 'root-fallback' });
      // @ts-expect-error — a path prefix is an optional string, not a URL object.
      expectTypeAssignableTo<DpopApi>({ origin, replayNamespace: 'bad', pathPrefix: new URL(origin) });
      // @ts-expect-error — API credentials are explicitly omit/include, never Fetch's same-origin default.
      expectTypeAssignableTo<DpopApi>({ origin, replayNamespace: 'bad', credentials: 'same-origin' });
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
      const proofInput: DpopProofInput = {
        method: 'GET',
        url: 'https://api.example.com/things',
        signal: new AbortController().signal,
      };
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
