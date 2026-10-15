import {
  createSignerClient,
  fetchSignerBundle,
  fetchWithAttestation,
} from '@web-ts-toolkit/express-request-attestation/signer';

function observeSigner(signer, kind, shared) {
  return { kind, keyId: signer.keyId, publicOrigin: signer.publicOrigin, replayNamespace: signer.replayNamespace, shared };
}

/** Runs in Chromium with native Fetch/import, either defaulted or explicitly injected at one public boundary. */
export async function submitPreparedPost({ apiOrigin, replayNamespace, requestTarget, bodyText, includeCredentials, nativeFetch }) {
  const discoveryOptions = {
    metadataUrl: `${apiOrigin}/attestation/signer-meta`,
    apiOrigin,
    replayNamespace,
  };
  const signerClient = createSignerClient({
    ...discoveryOptions,
    ...(nativeFetch === 'client' ? { fetch: globalThis.fetch } : {}),
  });
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(new Error('Installed browser request timed out')), 10_000);
  try {
    let discoveryProbe = null;
    if (nativeFetch === 'standalone') {
      const { signer } = await fetchSignerBundle({ ...discoveryOptions, fetch: globalThis.fetch, signal: controller.signal });
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
      signerClient,
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
    const responseText = await response.text();
    const callerBodyUsed = request.bodyUsed;
    return {
      response: { ...responseState, text: responseText },
      discoveryProbe,
      credentials: request.credentials,
      callerBodyUsed,
      callerBodyText: await request.text(),
      secureContext: globalThis.isSecureContext,
      visibleCookies: globalThis.document.cookie,
    };
  } finally {
    clearTimeout(deadline);
    signerClient.dispose();
  }
}

// A page bridge keeps Vitest's SSR transform out of Chromium's native imports.
globalThis.installedBrowserConsumer = { submitPreparedPost };
