import {
  createSignerClient,
  fetchSignerBundle,
  fetchWithAttestation,
  SignerClientError,
} from '@web-ts-toolkit/express-request-attestation/signer';
import { createBrowserDiagnostics } from './installed-browser-observer.mjs';

let latestDiagnostics = null;

/** Opt-in causal controls, deliberately separate from the observation-only facade. */
function withRetryFault(client, fault, injected) {
  if (fault === undefined || fault === 'retry-request') return client;
  let loads = 0;
  let signs = 0;
  let firstProof;
  return {
    getSigner() {
      if (++loads === 2 && fault === 'load-before-discovery') {
        injected();
        return Promise.reject(new SignerClientError('SIGNER_LOAD_FAILED', 'Controlled replacement load rejection.'));
      }
      return client.getSigner().then((signer) => ({
        ...signer,
        async sign(input) {
          const sign = ++signs;
          if (sign === 2 && fault === 'sign') {
            injected();
            throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Controlled replacement signing rejection.');
          }
          const proof = await signer.sign(input);
          if (sign === 1) firstProof = proof;
          if (sign === 2 && (fault === 'retry-header' || fault === 'repeat-proof')) {
            injected();
            // Native Headers rejects the newline before any retry transport.
            return fault === 'retry-header' ? 'controlled\ninvalid-header-value' : firstProof;
          }
          return proof;
        },
      }));
    },
    invalidate(keyId) {
      if (fault === 'invalidate') {
        injected();
        throw new Error('Controlled invalidation failure.');
      }
      return client.invalidate(keyId);
    },
    dispose() {
      firstProof = undefined;
      return client.dispose();
    },
  };
}

function observeSigner(signer, kind, shared) {
  return {
    kind,
    keyId: signer.keyId,
    publicOrigin: signer.publicOrigin,
    replayNamespace: signer.replayNamespace,
    shared,
  };
}

/** Runs in Chromium with native Fetch/import, either defaulted or explicitly injected at one public boundary. */
export async function submitPreparedPost({
  apiOrigin,
  replayNamespace,
  requestTarget,
  bodyText,
  includeCredentials,
  nativeFetch,
  fault,
}) {
  const discoveryOptions = {
    metadataUrl: `${apiOrigin}/attestation/signer-meta`,
    apiOrigin,
    replayNamespace,
  };
  const signerClient = createSignerClient({
    ...discoveryOptions,
    ...(nativeFetch === 'client' ? { fetch: globalThis.fetch } : {}),
  });
  const controlledClient = withRetryFault(signerClient, fault, () => diagnostics.injected(fault));
  const diagnostics = createBrowserDiagnostics(controlledClient);
  latestDiagnostics = diagnostics;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(new Error('Installed browser request timed out')), 10_000);
  let result;
  try {
    let discoveryProbe = null;
    if (nativeFetch === 'standalone') {
      const { signer } = await fetchSignerBundle({
        ...discoveryOptions,
        fetch: globalThis.fetch,
        signal: controller.signal,
      });
      discoveryProbe = observeSigner(signer, 'standalone', null);
    } else if (nativeFetch === 'client') {
      const [signer, peer] = await Promise.all([signerClient.getSigner(), signerClient.getSigner()]);
      const cached = await signerClient.getSigner();
      discoveryProbe = observeSigner(signer, 'client', signer === peer && signer === cached);
    }
    const request = new Request(`${apiOrigin}${requestTarget}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-client-transaction-id': 'caller-proof-must-be-replaced',
      },
      body: bodyText,
      // Omission is deliberate in the same-origin and missing-credentials controls.
      ...(includeCredentials ? { credentials: 'include' } : {}),
      signal: controller.signal,
    });
    const response = await fetchWithAttestation(request, undefined, {
      signerClient: diagnostics.client,
      apiOrigin,
      replayNamespace,
      maxBodyBytes: 4096,
      ...(nativeFetch === 'fetch' ? { fetch: globalThis.fetch } : {}),
      ...(nativeFetch === 'fetchFn' ? { fetchFn: globalThis.fetch } : {}),
    });
    // These are page-JavaScript observations, subject to native CORS filtering.
    const responseState = {
      status: response.status,
      type: response.type,
      url: response.url,
      redirected: response.redirected,
      marker: response.headers.get('x-attestation-error'),
      cacheControl: response.headers.get('cache-control'),
      bodyUsed: response.bodyUsed,
      bodyLocked: response.body?.locked,
    };
    diagnostics.returned(responseState);
    const responseText = await response.text();
    const callerBodyUsed = request.bodyUsed;
    result = {
      response: { ...responseState, text: responseText },
      discoveryProbe,
      credentials: request.credentials,
      callerBodyUsed,
      callerBodyText: await request.text(),
      secureContext: globalThis.isSecureContext,
      visibleCookies: globalThis.document.cookie,
    };
  } catch (error) {
    diagnostics.rejected(error, controller.signal.aborted);
    throw error;
  } finally {
    clearTimeout(deadline);
    diagnostics.client.dispose();
  }
  return { ...result, diagnostics: diagnostics.snapshot() };
}

// A page bridge keeps Vitest's SSR transform out of Chromium's native imports.
globalThis.installedBrowserConsumer = {
  submitPreparedPost,
  readDiagnostics: () => latestDiagnostics?.snapshot() ?? null,
};
