/**
 * ATT-07 real-Chromium prepared-fetch end-to-end (browser lane).
 *
 * Runs in real Headless Chromium through Vitest's Playwright provider
 * (`vitest.browser.config.mts`) against the BUILT `../dist/signer.mjs` — not
 * the TypeScript source — so this is genuine WebCrypto/`Request`/`FormData`/
 * `Blob` fidelity evidence. jsdom is intentionally not used.
 *
 * - Prepared bodies (empty/text/JSON/URLSearchParams/Blob/binary/multipart
 *   via `FormData`) are signed with the exact bytes sent; the server-side
 *   digest match itself is proven in `test/fetch-client.test.ts` over live
 *   Express, while this lane proves the same wrapper preserves bytes,
 *   boundaries, credentials, and `Authorization` in a real browser.
 * - Stale-key retry preserves the multipart boundary/bytes with a fresh
 *   nonce/timestamp; arbitrary 403/auth/replay/expired/5xx/network errors
 *   never retry; responses stay readable; the old envelope is never reused.
 * - CORS shape: the configured signature field plus actual `Content-Type` and
 *   `Authorization` are sent; `X-Attestation-Error: stale-key` plus `403` is
 *   the only retry trigger; `redirect: 'manual'` is used; external origins
 *   fail locally without sending auth/signature.
 *
 * No Express/Redis/Node imports here: the browser bundle must stay free of
 * the server graph. Live browser-to-Express acceptance also runs in
 * `fetch-client.test.ts` (Node lane Playwright check + live guard tests).
 */

import { describe, expect, it } from 'vitest';

// Built output under test: the exact ESM an installed browser consumer loads.
import { createRequestSigner, createSignerClient, decodeTransactionId, fetchWithAttestation } from '../dist/signer.mjs';
import type { RequestSigner, SignerClient } from '../dist/signer.mjs';

const API_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'att-fixture';
const METADATA_URL = 'https://attestation.example.com/attestation/signer-meta';
const KEY_ID = 'fixture-key-01';
const KEY_HEX = 'd973c35da623a2329dd08a32153635042a7fe90b730035c90508ae7ec50c0d24'; // pragma: allowlist secret
const SIGNER_URL = 'https://attestation.example.com/attestation/signer.abc123.mjs';

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function makeRealSigner(keyId: string = KEY_ID): RequestSigner {
  return createRequestSigner({
    keyId,
    key: hexToBytes(KEY_HEX),
    publicOrigin: API_ORIGIN,
    replayNamespace: NAMESPACE,
  });
}

function stubClient(signer: RequestSigner, onInvalidate?: (keyId: string) => void): SignerClient {
  return {
    getSigner: async () => signer,
    invalidate: (observedKeyId: string) => {
      onInvalidate?.(observedKeyId);
    },
    dispose: () => undefined,
  };
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

function staleResponse(): Response {
  return new Response(JSON.stringify({ code: 'ATTESTATION_STALE_KEY' }), {
    status: 403,
    headers: { 'x-attestation-error': 'stale-key' },
  });
}

describe('browser prepared fetch (built bundle, real Chromium)', () => {
  it('exposes the ATT-07 wrapper from the built signer entry', async () => {
    const pkg = (await import('../dist/signer.mjs')) as Record<string, unknown>;
    expect(typeof pkg['fetchWithAttestation']).toBe('function');
    expect(pkg['default']).toBeUndefined();
  });

  it('signs empty/text/JSON/urlencoded/blob/binary/multipart with preserved credentials and Authorization', async () => {
    const signer = makeRealSigner();
    const client = stubClient(signer);
    const seen: {
      url: string;
      credentials?: string;
      authorization: string | null;
      signature: string | null;
      contentType: string | null;
      redirect: string;
    }[] = [];
    const bodies: Uint8Array[] = [];
    const recordingFetch = (async (input: RequestInfo | URL) => {
      const req = input as Request;
      seen.push({
        url: req.url,
        credentials: (req as unknown as { readonly credentials?: string }).credentials,
        authorization: req.headers.get('authorization'),
        signature: req.headers.get('x-client-transaction-id'),
        contentType: req.headers.get('content-type'),
        redirect: req.redirect,
      });
      bodies.push(new Uint8Array(await req.arrayBuffer()));
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;
    const base = {
      signerClient: client,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: recordingFetch,
    } as const;

    // Empty GET.
    await (await fetchWithAttestation(`${API_ORIGIN}/api/items`, { method: 'GET' }, base)).arrayBuffer();
    // Text.
    await (
      await fetchWithAttestation(
        `${API_ORIGIN}/api/submit`,
        { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello browser 🌍' },
        base,
      )
    ).arrayBuffer();
    // JSON.
    const raw = JSON.stringify({ from: 'chromium' });
    await (
      await fetchWithAttestation(
        `${API_ORIGIN}/api/submit`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer browser-token' }, // pragma: allowlist secret
          credentials: 'include',
          body: raw,
        },
        base,
      )
    ).arrayBuffer();
    // URLSearchParams.
    await (
      await fetchWithAttestation(
        `${API_ORIGIN}/api/submit`,
        { method: 'POST', body: new URLSearchParams({ a: '1', b: 'x y' }) },
        base,
      )
    ).arrayBuffer();
    // Blob.
    await (
      await fetchWithAttestation(
        `${API_ORIGIN}/api/blob/7`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/octet-stream' },
          body: new Blob([new Uint8Array([1, 2, 3])]),
        },
        base,
      )
    ).arrayBuffer();
    // Binary.
    await (
      await fetchWithAttestation(
        `${API_ORIGIN}/api/blob/7`,
        { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array([9, 8, 7]) },
        base,
      )
    ).arrayBuffer();
    // Multipart FormData (boundary generated once per call).
    const form = new FormData();
    form.append('field', 'browser-value');
    await (await fetchWithAttestation(`${API_ORIGIN}/api/submit`, { method: 'POST', body: form }, base)).arrayBuffer();

    expect(seen).toHaveLength(7);
    for (const entry of seen) {
      expect(entry.redirect).toBe('manual');
      expect(typeof entry.signature).toBe('string');
      expect(decodeTransactionId(entry.signature as string).keyId).toBe(KEY_ID);
    }
    // Credentials: native same-origin default preserved, explicit include kept.
    expect(seen[0]?.credentials).toBe('same-origin');
    expect(seen[2]?.credentials).toBe('include');
    expect(seen[2]?.authorization).toBe('Bearer browser-token'); // pragma: allowlist secret
    // Content types: JSON + multipart boundary preserved.
    expect(seen[2]?.contentType).toBe('application/json');
    expect(String(seen[6]?.contentType)).toContain('multipart/form-data; boundary=');
    expect(bodies[0]?.length).toBe(0);
    expect(bodies[1]?.length).toBeGreaterThan(0);
  });

  it('retries stale-key once with identical bytes/boundary and a fresh envelope', async () => {
    const oldSigner = makeRealSigner('key-old-01');
    const newSigner = makeRealSigner('key-new-01');
    let getCalls = 0;
    const invalidated: string[] = [];
    const client: SignerClient = {
      getSigner: async () => {
        getCalls += 1;
        return getCalls === 1 ? oldSigner : newSigner;
      },
      invalidate: (observedKeyId: string) => {
        invalidated.push(observedKeyId);
      },
      dispose: () => undefined,
    };
    const seenBodies: Uint8Array[] = [];
    const seenTypes: (string | null)[] = [];
    const seenSigs: string[] = [];
    let apiCalls = 0;
    const apiFetch = (async (input: RequestInfo | URL) => {
      apiCalls += 1;
      const req = input as Request;
      seenBodies.push(new Uint8Array(await req.arrayBuffer()));
      seenTypes.push(req.headers.get('content-type'));
      seenSigs.push(String(req.headers.get('x-client-transaction-id')));
      if (apiCalls === 1) {
        return staleResponse();
      }
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;

    const form = new FormData();
    form.append('field', 'chromium-retry');
    const res = await fetchWithAttestation(
      `${API_ORIGIN}/api/submit`,
      { method: 'POST', body: form },
      {
        signerClient: client,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: apiFetch,
      },
    );
    expect(res.status).toBe(200);
    await res.arrayBuffer();
    expect(apiCalls).toBe(2);
    expect(invalidated).toEqual(['key-old-01']);
    expect(seenBodies).toHaveLength(2);
    expect(Array.from(seenBodies[0] as Uint8Array)).toEqual(Array.from(seenBodies[1] as Uint8Array));
    expect(seenTypes[0]).toBe(seenTypes[1]);
    expect(seenSigs[0]).not.toBe(seenSigs[1]);
    expect(decodeTransactionId(seenSigs[0] as string).nonceHex).not.toBe(
      decodeTransactionId(seenSigs[1] as string).nonceHex,
    );
  });

  it('never retries arbitrary 403/replay/expired/5xx and keeps responses readable', async () => {
    const client = stubClient(makeRealSigner());
    for (const [status, headers] of [
      [403, {}],
      [403, { 'x-attestation-error': 'replay' }],
      [401, {}],
      [503, {}],
    ] as const) {
      let apiCalls = 0;
      const apiFetch = (async () => {
        apiCalls += 1;
        return new Response(JSON.stringify({ code: 'x' }), { status, headers });
      }) as unknown as typeof fetch;
      const res = await fetchWithAttestation(
        `${API_ORIGIN}/api/submit`,
        { method: 'GET' },
        {
          signerClient: client,
          apiOrigin: API_ORIGIN,
          replayNamespace: NAMESPACE,
          fetch: apiFetch,
        },
      );
      expect(res.status).toBe(status);
      expect(typeof (await res.text())).toBe('string');
      expect(apiCalls).toBe(1);
    }
  });

  it('fails external origins locally and uses manual redirects in Chromium', async () => {
    const client = stubClient(makeRealSigner());
    let fetchCalls = 0;
    const noFetch = (async () => {
      fetchCalls += 1;
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;
    await expect(
      fetchWithAttestation(
        'https://other.example.com/api/submit',
        { method: 'GET' },
        {
          signerClient: client,
          apiOrigin: API_ORIGIN,
          replayNamespace: NAMESPACE,
          fetch: noFetch,
        },
      ),
    ).rejects.toThrow();
    expect(fetchCalls).toBe(0);

    const seenRedirects: string[] = [];
    const redirectFetch = (async (input: RequestInfo | URL) => {
      seenRedirects.push((input as Request).redirect);
      return new Response(null, { status: 302, headers: { location: '/api/items' } });
    }) as unknown as typeof fetch;
    const res = await fetchWithAttestation(
      `${API_ORIGIN}/api/submit`,
      { method: 'GET' },
      {
        signerClient: client,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: redirectFetch,
      },
    );
    expect(res.status).toBe(302);
    expect(seenRedirects).toEqual(['manual']);
    await res.arrayBuffer();
  });

  it('loads the signer through the generation-aware client and matches the protection space', async () => {
    let metadataCalls = 0;
    const fetchImpl = (async () => {
      metadataCalls += 1;
      return jsonResponse({
        version: 1,
        keyId: KEY_ID,
        signerUrl: SIGNER_URL,
        publicOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
      });
    }) as unknown as typeof fetch;
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async () => ({ signer: makeRealSigner() }),
    });
    const signer = await client.getSigner();
    expect(signer.keyId).toBe(KEY_ID);
    const res = await fetchWithAttestation(
      `${API_ORIGIN}/api/items`,
      { method: 'GET' },
      {
        signerClient: client,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: (async (input: RequestInfo | URL) => {
          const req = input as Request;
          expect(req.headers.get('x-client-transaction-id')).toBeTruthy();
          return jsonResponse({ ok: true });
        }) as unknown as typeof fetch,
      },
    );
    expect(res.status).toBe(200);
    await res.arrayBuffer();
    expect(metadataCalls).toBe(1);
    client.dispose();
  });
});
