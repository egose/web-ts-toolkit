/** Callback binding controls run in Node and built Chromium; installed tests own the real HTTP evidence. */
import { describe, expect, it } from 'vitest';
import type { RequestSigner, SignerClient } from '../src/signer.js';

type DiscoveryRuntime = Pick<typeof import('../src/signer.js'), 'fetchSignerBundle' | 'createSignerClient'>;
type PreparedRuntime = Pick<
  typeof import('../src/signer.js'),
  'createRequestSigner' | 'fetchWithAttestation' | 'decodeTransactionId'
>;
type FetchInput = Parameters<typeof fetch>[0];
const RECEIVERS = ['ordinary', 'bound', 'closure'] as const;
const API_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'fetch-receivers';
const KEY_ID = 'receiver-key';
const METADATA_URL = `${API_ORIGIN}/attestation/signer-meta`;
const MODULE_URL = `${API_ORIGIN}/attestation/receiver.mjs`;

function recordingTransport(kind: (typeof RECEIVERS)[number], respond: typeof fetch) {
  const owner = { label: 'application-selected receiver' };
  const calls: Array<{ receiver: unknown; input: FetchInput; init: RequestInit | undefined }> = [];
  async function transport(this: unknown, input: FetchInput, init?: RequestInit): Promise<Response> {
    calls.push({ receiver: this, input, init });
    return respond(input, init);
  }
  const fetchImpl: typeof fetch =
    kind === 'ordinary'
      ? transport
      : kind === 'bound'
        ? transport.bind(owner)
        : (input, init) => transport.call(owner, input, init);
  return { fetchImpl, calls, expectedReceiver: kind === 'ordinary' ? undefined : owner };
}

export function runDiscoveryFetchReceiverTests(runtime: DiscoveryRuntime): void {
  describe('injected Fetch receiver: discovery', () => {
    for (const api of ['fetchSignerBundle', 'createSignerClient'] as const) {
      it.each(RECEIVERS)(`${api} preserves %s callback binding across discoveries`, async (kind) => {
        const signer: RequestSigner = {
          version: 1,
          keyId: KEY_ID,
          publicOrigin: API_ORIGIN,
          replayNamespace: NAMESPACE,
          sign: async () => 'not-used-by-discovery',
        };
        const transport = recordingTransport(
          kind,
          async () =>
            new Response(
              JSON.stringify({
                version: 1,
                keyId: KEY_ID,
                signerUrl: MODULE_URL,
                publicOrigin: API_ORIGIN,
                replayNamespace: NAMESPACE,
              }),
            ),
        );
        const imports: string[] = [];
        const options = {
          metadataUrl: METADATA_URL,
          apiOrigin: API_ORIGIN,
          replayNamespace: NAMESPACE,
          fetch: transport.fetchImpl,
          loadModule: async (url: string) => {
            imports.push(url);
            return { signer };
          },
        };
        if (api === 'fetchSignerBundle') {
          const controller = new AbortController();
          for (let call = 0; call < 2; call += 1) {
            expect((await runtime.fetchSignerBundle({ ...options, signal: controller.signal })).signer).toBe(signer);
          }
          expect(controller.signal.aborted).toBe(false);
        } else {
          const client = runtime.createSignerClient(options);
          try {
            const first = client.getSigner();
            expect(client.getSigner()).toBe(first);
            expect(await first).toBe(signer);
            expect(await client.getSigner()).toBe(signer);
            client.invalidate(KEY_ID);
            expect(await client.getSigner()).toBe(signer);
          } finally {
            client.dispose();
          }
        }
        expect(imports).toEqual([MODULE_URL, MODULE_URL]);
        expect(transport.calls).toHaveLength(2);
        for (const call of transport.calls) {
          expect(call.receiver).toBe(transport.expectedReceiver);
          expect(call.input).toBe(METADATA_URL);
          expect(call.init).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' });
          expect(call.init?.signal).toBeInstanceOf(AbortSignal);
        }
      });
    }
  });
}

export function runPreparedFetchReceiverTests(runtime: PreparedRuntime): void {
  describe('injected Fetch receiver: prepared requests', () => {
    for (const alias of ['fetch', 'fetchFn'] as const) {
      it.each(RECEIVERS)(`${alias} preserves %s callback binding on both stale-key attempts`, async (kind) => {
        const signer = runtime.createRequestSigner({
          keyId: KEY_ID,
          key: new Uint8Array(32).fill(9),
          publicOrigin: API_ORIGIN,
          replayNamespace: NAMESPACE,
        });
        const invalidations: string[] = [];
        const client: SignerClient = {
          getSigner: async () => signer,
          invalidate: (keyId) => {
            invalidations.push(keyId);
          },
          dispose: () => undefined,
        };
        const bodies: string[] = [];
        const proofs: string[] = [];
        const transport = recordingTransport(kind, async (input) => {
          if (!(input instanceof Request)) throw new Error('Expected a prepared native Request');
          expect(input.redirect).toBe('manual');
          bodies.push(await input.text());
          proofs.push(input.headers.get('x-client-transaction-id') ?? '');
          return bodies.length === 1
            ? new Response('stale', {
                status: 403,
                headers: { 'x-attestation-error': 'stale-key' },
              })
            : new Response('accepted');
        });
        const body = 'caller-owned bytes: café\r\n';
        const original = new Request(`${API_ORIGIN}/api/submit`, { method: 'POST', body });
        try {
          const response = await runtime.fetchWithAttestation(original, undefined, {
            signerClient: client,
            apiOrigin: API_ORIGIN,
            replayNamespace: NAMESPACE,
            [alias]: transport.fetchImpl,
          });
          expect(await response.text()).toBe('accepted');
          expect(original.bodyUsed).toBe(false);
          expect(await original.text()).toBe(body);
          expect(invalidations).toEqual([KEY_ID]);
          expect(bodies).toEqual([body, body]);
          expect(new Set(proofs.map((proof) => runtime.decodeTransactionId(proof).nonceHex)).size).toBe(2);
          expect(transport.calls).toHaveLength(2);
          for (const call of transport.calls) {
            expect(call.receiver).toBe(transport.expectedReceiver);
            expect(call.init).toBeUndefined();
          }
        } finally {
          client.dispose();
        }
      });
    }
  });
}
