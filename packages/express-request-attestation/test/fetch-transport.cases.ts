/** Fetch transport constraints: source in Node, built signer ESM in real Chromium. */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FetchWithAttestationOptions, RequestSigner, SignerClient, SignInput } from '../src/signer.js';

type FetchRuntime = Pick<
  typeof import('../src/signer.js'),
  'createRequestSigner' | 'decodeTransactionId' | 'fetchWithAttestation' | 'SignerClientError' | 'validateHeaderName'
>;

const API_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'fetch-transport';
const PROOF_HEADER = 'x-client-transaction-id';

// These pass the shared HTTP validator. Fetch forbids them regardless of value,
// including Chromium's additional Cookie2/User-Agent restrictions.
export const BROWSER_FORBIDDEN_PROOF_FIELDS = [
  'sec-proof',
  'SeC-Proof',
  'sec-',
  'proxy-proof',
  'PrOxY-Proof',
  'proxy-',
  'Accept-Charset',
  'Accept-Encoding',
  'Access-Control-Request-Headers',
  'Access-Control-Request-Method',
  'Connection',
  'Cookie2',
  'Date',
  'DNT',
  'Expect',
  'Keep-Alive',
  'Referer',
  'TE',
  'Trailer',
  'Upgrade',
  'Via',
  'User-Agent',
] as const;

function observe<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason: unknown) => ({ status: 'rejected', reason }),
  );
}

export function runFetchTransportTests(runtime: FetchRuntime): void {
  const { createRequestSigner, decodeTransactionId, fetchWithAttestation, SignerClientError, validateHeaderName } =
    runtime;

  function fixture(headerName = PROOF_HEADER, reply: (attempt: number) => Response = () => new Response('ok')) {
    const realSigner = createRequestSigner({
      keyId: 'transport-key',
      key: new Uint8Array(32).fill(9),
      publicOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
    });
    const proofs: string[] = [];
    const sign = vi.fn(async (input: SignInput) => {
      const proof = await realSigner.sign(input);
      proofs.push(proof);
      return proof;
    });
    const signer: RequestSigner = { ...realSigner, sign };
    const client: SignerClient = { getSigner: vi.fn(async () => signer), invalidate: vi.fn(), dispose: vi.fn() };
    const sent: Request[] = [];
    const bodies: string[] = [];
    const transport = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request;
      sent.push(request);
      bodies.push(await request.text());
      return reply(sent.length);
    });
    const now = vi.fn(Date.now);
    const options: FetchWithAttestationOptions = {
      signerClient: client,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      headerName,
      fetch: transport,
      now,
    };
    return { options, client, sign, realSigner, proofs, sent, bodies, transport, now };
  }

  function expectNoDependencyWork(context: ReturnType<typeof fixture>): void {
    expect(context.client.getSigner).toHaveBeenCalledTimes(0);
    expect(context.sign).toHaveBeenCalledTimes(0);
    expect(context.now).toHaveBeenCalledTimes(0);
    expect(context.transport).toHaveBeenCalledTimes(0);
    expect(context.client.invalidate).toHaveBeenCalledTimes(0);
    expect(context.client.dispose).toHaveBeenCalledTimes(0);
  }

  describe('Fetch proof transport boundary', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it.each(BROWSER_FORBIDDEN_PROOF_FIELDS)(
      'rejects browser-forbidden %s before even reading init.body',
      async (headerName) => {
        expect(() => validateHeaderName(headerName)).not.toThrow();
        const context = fixture(headerName);
        const body = vi.fn(() => 'must not prepare');
        const init: RequestInit = { method: 'POST' };
        Object.defineProperty(init, 'body', { get: body });
        let constructions = 0;
        vi.stubGlobal(
          'Request',
          new Proxy(Request, {
            construct(target, args) {
              constructions += 1;
              return Reflect.construct(target, args);
            },
          }),
        );
        const outcome = await observe(fetchWithAttestation(`${API_ORIGIN}/api/submit`, init, context.options));
        expect({
          status: outcome.status,
          bodyReads: body.mock.calls.length,
          constructions,
          apiCalls: context.transport.mock.calls.length,
          sentProofs: context.sent.map((request) => request.headers.get(headerName)),
        }).toEqual({ status: 'rejected', bodyReads: 0, constructions: 0, apiCalls: 0, sentProofs: [] });
        expect(outcome).toMatchObject({ reason: { name: 'SignerClientError', code: 'SIGNER_PREPARATION_FAILED' } });
        if (outcome.status === 'rejected') expect(outcome.reason).toBeInstanceOf(SignerClientError);
        expectNoDependencyWork(context);
      },
    );

    it.each(['URL string', 'URL object', 'Request override', 'inherited mode', 'undefined mode override'] as const)(
      'rejects no-cors from %s before construction, cloning, or body getters',
      async (source) => {
        const inherited = source === 'inherited mode' || source === 'undefined mode override';
        const original = new Request(`${API_ORIGIN}/api/submit`, {
          method: 'POST',
          body: 'caller bytes',
          mode: inherited ? 'no-cors' : 'cors',
        });
        const originalBody = original.body;
        const clone = vi.spyOn(original, 'clone');
        const body = vi.fn(() => undefined);
        const init: RequestInit | undefined =
          source === 'inherited mode'
            ? undefined
            : {
                method: 'POST',
                mode: inherited ? undefined : 'no-cors',
              };
        if (init !== undefined) Object.defineProperty(init, 'body', { get: body });
        const input =
          source === 'URL string' ? original.url : source === 'URL object' ? new URL(original.url) : original;
        const context = fixture();
        let constructions = 0;
        vi.stubGlobal(
          'Request',
          new Proxy(Request, {
            construct(target, args) {
              constructions += 1;
              return Reflect.construct(target, args);
            },
          }),
        );
        const outcome = await observe(fetchWithAttestation(input, init, context.options));
        expect({
          status: outcome.status,
          bodyReads: body.mock.calls.length,
          constructions,
          apiCalls: context.transport.mock.calls.length,
        }).toEqual({ status: 'rejected', bodyReads: 0, constructions: 0, apiCalls: 0 });
        expect(outcome).toMatchObject({
          reason: {
            name: 'SignerClientError',
            code: 'SIGNER_PREPARATION_FAILED',
            message: expect.stringContaining('no-cors'),
          },
        });
        expectNoDependencyWork(context);
        expect(clone).toHaveBeenCalledTimes(0);
        expect(original.body).toBe(originalBody);
        expect(original.bodyUsed).toBe(false);
        expect(original.body?.locked).toBe(false);
        expect(await original.text()).toBe('caller bytes');
      },
    );

    it('rejects an inherited non-enumerable no-cors getter once, with its original receiver', async () => {
      const context = fixture();
      const init: RequestInit = Object.create({ method: 'POST' });
      const mode = vi.fn(function (this: RequestInit) {
        expect(this).toBe(init);
        return 'no-cors';
      });
      const body = vi.fn(() => 'must not prepare');
      Object.defineProperty(Object.getPrototypeOf(init), 'mode', { get: mode });
      Object.defineProperty(init, 'body', { get: body });
      await expect(fetchWithAttestation(`${API_ORIGIN}/api/submit`, init, context.options)).rejects.toMatchObject({
        name: 'SignerClientError',
        code: 'SIGNER_PREPARATION_FAILED',
        message: expect.stringContaining('no-cors'),
      });
      expect(mode).toHaveBeenCalledTimes(1);
      expect(body).toHaveBeenCalledTimes(0);
      expectNoDependencyWork(context);
    });

    it.each(['mode', 'header'] as const)(
      'leaves an explicit stream caller-owned on static %s rejection',
      async (failure) => {
        const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
          controller.close();
        });
        const cancel = vi.fn();
        const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
        const context = fixture(failure === 'header' ? 'sec-proof' : PROOF_HEADER);
        let constructions = 0;
        vi.stubGlobal(
          'Request',
          new Proxy(Request, {
            construct(target, args) {
              constructions += 1;
              return Reflect.construct(target, args);
            },
          }),
        );
        try {
          const outcome = await observe(
            fetchWithAttestation(
              `${API_ORIGIN}/api/submit`,
              {
                method: 'POST',
                body,
                mode: failure === 'mode' ? 'no-cors' : 'cors',
                ...({ duplex: 'half' } as { duplex: string }),
              },
              context.options,
            ),
          );
          expect(outcome).toMatchObject({
            status: 'rejected',
            reason: { name: 'SignerClientError', code: 'SIGNER_PREPARATION_FAILED' },
          });
          expect(constructions).toBe(0);
          expect(pull).toHaveBeenCalledTimes(0);
          expect(cancel).toHaveBeenCalledTimes(0);
          expect(body.locked).toBe(false);
          expectNoDependencyWork(context);
        } finally {
          if (!body.locked) await body.cancel();
        }
      },
    );

    it('checks the native resolved mode before reading an accepted body', async () => {
      // A JavaScript caller can pass a coercible enum value. Native construction
      // resolves it; pre-read validation must still stop no-cors and own cleanup.
      const original = new Request(`${API_ORIGIN}/api/submit`, { method: 'POST', body: 'caller bytes' });
      const context = fixture();
      const readers: ReturnType<typeof vi.spyOn>[] = [];
      vi.stubGlobal(
        'Request',
        new Proxy(Request, {
          construct(target, args) {
            const request = Reflect.construct(target, args) as Request;
            if (request.body !== null) readers.push(vi.spyOn(request.body, 'getReader'));
            return request;
          },
        }),
      );
      const outcome = await observe(
        fetchWithAttestation(
          original,
          {
            mode: { toString: () => 'no-cors' } as unknown as RequestMode,
          },
          context.options,
        ),
      );
      expect(outcome).toMatchObject({
        status: 'rejected',
        reason: {
          name: 'SignerClientError',
          code: 'SIGNER_PREPARATION_FAILED',
          message: expect.stringContaining('no-cors'),
        },
      });
      for (const reader of readers) expect(reader).toHaveBeenCalledTimes(0);
      expectNoDependencyWork(context);
      expect(original.bodyUsed).toBe(false);
      expect(original.body?.locked).toBe(false);
      expect(await original.text()).toBe('caller bytes');
    });

    it.each(['cors', 'same-origin'] as const)(
      'snapshots a %s mode getter before init.body can change it, including a stale retry',
      async (mode) => {
        const original = new Request(`${API_ORIGIN}/api/submit`, { method: 'POST', mode: 'no-cors', body: 'original' });
        const stale = new Response('retired', { status: 403, headers: { 'x-attestation-error': 'stale-key' } });
        const context = fixture(PROOF_HEADER, (attempt) => (attempt === 1 ? stale : new Response('ok')));
        const init: RequestInit = Object.create({ credentials: 'omit' });
        let currentMode: RequestMode = mode;
        const readMode = vi.fn(function (this: RequestInit) {
          expect(this).toBe(init);
          return currentMode;
        });
        const readBody = vi.fn(function (this: RequestInit) {
          expect(this).toBe(init);
          currentMode = 'no-cors';
          return 'replacement';
        });
        const readHeaders = vi.fn(function (this: RequestInit) {
          expect(this).toBe(init);
          return { 'x-from-prototype': 'retained' };
        });
        Object.defineProperty(Object.getPrototypeOf(init), 'mode', { get: readMode });
        Object.defineProperty(Object.getPrototypeOf(init), 'headers', { get: readHeaders });
        Object.defineProperty(init, 'body', { get: readBody });
        const response = await fetchWithAttestation(original, init, context.options);
        expect(await response.text()).toBe('ok');
        expect(readMode).toHaveBeenCalledTimes(1);
        expect(readBody).toHaveBeenCalledTimes(1);
        expect(readHeaders).toHaveBeenCalled();
        expect(context.transport).toHaveBeenCalledTimes(2);
        expect(context.sent.map((request) => request.mode)).toEqual([mode, mode]);
        expect(context.sent.map((request) => request.headers.get(PROOF_HEADER))).toEqual(context.proofs);
        expect(context.bodies).toEqual(['replacement', 'replacement']);
        expect(new Set(context.proofs).size).toBe(2);
        for (const request of context.sent) {
          expect(request.credentials).toBe('omit');
          expect(request.headers.get('x-from-prototype')).toBe('retained');
          expect(request.redirect).toBe('manual');
        }
        expect(original.bodyUsed).toBe(false);
        expect(await original.text()).toBe('original');
      },
    );

    it.each([undefined, 'cors', 'same-origin'] as const)(
      'preserves allowed custom proof fields with mode %s',
      async (mode) => {
        for (const headerName of [
          PROOF_HEADER,
          'X-Custom-Sig_1',
          'X-Sec-Proof',
          'SecProof',
          'ProxyProof',
          'X-HTTP-Method',
          'X-HTTP-Method-Override',
          'X-Method-Override',
          'Access-Control-Request-Private-Network',
        ]) {
          const context = fixture(headerName);
          const headers = new Headers({ authorization: 'Bearer preserved', 'content-type': 'text/plain' });
          headers.append(headerName, 'caller-old-1');
          headers.append(headerName, 'caller-old-2');
          const response = await fetchWithAttestation(
            `${API_ORIGIN}/api/submit`,
            {
              method: 'POST',
              mode,
              headers,
              credentials: 'include',
              body: 'signed bytes',
            },
            context.options,
          );
          expect(await response.text()).toBe('ok');
          expect(context.transport).toHaveBeenCalledTimes(1);
          expect(context.bodies).toEqual(['signed bytes']);
          const request = context.sent[0]!;
          expect(request.mode).toBe(mode ?? 'cors');
          expect(request.headers.get(headerName)).toBe(context.proofs[0]);
          expect(decodeTransactionId(context.proofs[0]!).keyId).toBe('transport-key');
          expect(request.headers.get('authorization')).toBe('Bearer preserved');
          expect(request.credentials).toBe('include');
          expect(request.redirect).toBe('manual');
          expect(headers.get(headerName)).toBe('caller-old-1, caller-old-2');
        }
      },
    );

    it.each([
      ['missing', 1],
      ['replaced', 1],
      ['appended', 1],
      ['missing', 2],
      ['replaced', 2],
      ['appended', 2],
    ] as const)(
      'does not send a %s proof on constructed attempt %s and releases only the unsent body',
      async (mutation, failAt) => {
        const original = new Request(`${API_ORIGIN}/api/submit`, { method: 'POST', body: 'caller bytes' });
        const stale = new Response('{"code":"ATTESTATION_STALE_KEY"}', {
          status: 403,
          headers: { 'x-attestation-error': 'stale-key' },
        });
        const staleCancel = vi.spyOn(stale.body!, 'cancel');
        const context = fixture(PROOF_HEADER, (attempt) =>
          failAt === 2 && attempt === 1 ? stale : new Response('ok'),
        );
        let prepared = 0;
        let beforeMutation: string | null = null;
        let unsent: Request | undefined;
        let unsentCancel: ReturnType<typeof vi.spyOn> | undefined;
        // Change only the final native Request, after unrestricted Headers received
        // the right proof. A check of the temporary Headers alone cannot pass this.
        vi.stubGlobal(
          'Request',
          new Proxy(Request, {
            construct(target, args) {
              const request = Reflect.construct(target, args) as Request;
              if (request.headers.has(PROOF_HEADER) && ++prepared === failAt) {
                beforeMutation = request.headers.get(PROOF_HEADER);
                if (mutation === 'missing') request.headers.delete(PROOF_HEADER);
                else if (mutation === 'replaced') request.headers.set(PROOF_HEADER, 'different-proof');
                else request.headers.append(PROOF_HEADER, 'extra-proof');
                unsent = request;
                unsentCancel = vi.spyOn(request.body!, 'cancel');
              }
              return request;
            },
          }),
        );
        const outcome = await observe(fetchWithAttestation(original, undefined, context.options));
        expect(context.transport).toHaveBeenCalledTimes(failAt - 1);
        expect(context.sign).toHaveBeenCalledTimes(failAt);
        expect(beforeMutation).toBe(context.proofs[failAt - 1]);
        expect(unsentCancel).toHaveBeenCalledTimes(1);
        expect(unsent?.bodyUsed).toBe(true);
        expect(unsent?.body?.locked).toBe(false);
        expect(staleCancel).toHaveBeenCalledTimes(0);
        if (failAt === 1) {
          expect(outcome).toMatchObject({
            status: 'rejected',
            reason: { name: 'SignerClientError', code: 'SIGNER_PREPARATION_FAILED' },
          });
          if (outcome.status === 'rejected') expect(outcome.reason).toBeInstanceOf(SignerClientError);
        } else {
          expect(outcome).toMatchObject({ status: 'fulfilled', value: stale });
          expect(stale.bodyUsed).toBe(false);
          expect(stale.body?.locked).toBe(false);
          expect(await stale.json()).toEqual({ code: 'ATTESTATION_STALE_KEY' });
        }
        expect(context.client.invalidate).toHaveBeenCalledTimes(failAt - 1);
        expect(original.bodyUsed).toBe(false);
        expect(await original.text()).toBe('caller bytes');
      },
    );

    it('rejects native whitespace normalization rather than sending a different proof', async () => {
      const context = fixture();
      context.sign.mockImplementation(async (input) => ` \t${await context.realSigner.sign(input)}\t `);
      await expect(
        fetchWithAttestation(`${API_ORIGIN}/api/submit`, { method: 'POST', body: 'bytes' }, context.options),
      ).rejects.toMatchObject({ name: 'SignerClientError', code: 'SIGNER_PREPARATION_FAILED' });
      expect(context.transport).toHaveBeenCalledTimes(0);
      expect(context.sign).toHaveBeenCalledTimes(1);
      expect(context.client.invalidate).toHaveBeenCalledTimes(0);
    });
  });
}
