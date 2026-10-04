import { createOidcVaultDpopSession, type OidcVaultDpopSession } from '@web-ts-toolkit/oidc-vault-dpop-client';

export const backendOrigin = import.meta.env.VITE_BACKEND_ORIGIN ?? 'http://127.0.0.1:4330';

const basePath = '/auth/oidc/body';

let session: OidcVaultDpopSession | undefined;

/** Lazily created browser singleton: construction touches sessionStorage, so never run it at module top level. */
export const getSession = (): OidcVaultDpopSession =>
  (session ??= createOidcVaultDpopSession({ backendOrigin, basePath, sessionTransport: 'body' }));

/** Exact API scope; the replay namespace must match the backend (`API_REPLAY_NAMESPACE`). */
export const apis = [{ origin: backendOrigin, replayNamespace: 'oidc-vault-dpop-example-api' }];
