/** The same native Fetch contract runs against source in Node and built ESM in Chromium. */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FetchWithAttestationOptions, RequestSigner, SignerClient, SignInput } from '../src/signer.js';

type FetchRuntime = Pick<
  typeof import('../src/signer.js'),
  'createRequestSigner' | 'decodeTransactionId' | 'fetchWithAttestation'
>;

const API_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'fetch-ownership';
const PROOF_HEADER = 'x-client-transaction-id';
const STALE_HEADERS = { 'x-attestation-error': 'stale-key', 'content-type': 'application/json' };
const STALE_JSON = '{"code":"ATTESTATION_STALE_KEY","message":"retired 🌍"}';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function observe<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason: unknown) => ({ status: 'rejected', reason }),
  );
}

/** A bounded old-code reproduction; always observe late rejection and clear the fuse. */
async function within<T>(promise: Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 500);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function streamRequest(stream: ReadableStream<Uint8Array>, init: RequestInit = {}): Request {
  return new Request(`${API_ORIGIN}/api/submit`, {
    method: 'POST',
    body: stream,
    ...({ duplex: 'half' } as { duplex: string }),
    ...init,
  });
}

function closeForCleanup(controller: ReadableStreamDefaultController<Uint8Array>): void {
  try {
    controller.close();
  } catch {
    /* Already cancelled/closed. */
  }
}

function cancelForCleanup(body: ReadableStream<Uint8Array> | null): void {
  if (body !== null && !body.locked) void body.cancel().catch(() => undefined);
}

export function runFetchOwnershipTests(runtime: FetchRuntime): void {
  const { createRequestSigner, decodeTransactionId, fetchWithAttestation } = runtime;

  function realSigner(): RequestSigner {
    return createRequestSigner({
      keyId: 'ownership-key',
      key: new Uint8Array(32).fill(7),
      publicOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
    });
  }

  function clientFor(signer = realSigner()): SignerClient {
    return { getSigner: vi.fn(async () => signer), invalidate: vi.fn(), dispose: vi.fn() };
  }

  function options(fetchImpl: typeof fetch, signerClient = clientFor()): FetchWithAttestationOptions {
    return { signerClient, apiOrigin: API_ORIGIN, replayNamespace: NAMESPACE, fetch: fetchImpl };
  }

  /** Observe actual native construction, including the interval before transport. */
  function recordSignedRequests(): Request[] {
    const requests: Request[] = [];
    const NativeRequest = Request;
    vi.stubGlobal(
      'Request',
      new Proxy(NativeRequest, {
        construct(target, args) {
          const request = Reflect.construct(target, args) as Request;
          if (request.headers.has(PROOF_HEADER)) requests.push(request);
          return request;
        },
      }),
    );
    return requests;
  }

  describe('native Fetch ownership', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    describe('caller-owned finite POST Requests', () => {
      it.each([
        ['omitted init', undefined],
        ['omitted body', {}],
        ['undefined body', { body: undefined }],
        ['null body', { body: null }],
      ] as const)(
        'supports an authentication retry with %s and leaves original bytes readable',
        async (_label, init) => {
          const text = 'exact bytes: \u0000\ufeffcafé 🌍\r\n';
          const controller = new AbortController();
          const original = new Request(`${API_ORIGIN}/api/submit?tag=a&tag=b`, {
            method: 'POST',
            body: text,
            signal: controller.signal,
            headers: { 'content-type': 'text/plain; charset=utf-8', authorization: 'Bearer old' },
            credentials: 'include',
            mode: 'cors',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            integrity: 'sha256-fixture',
            keepalive: true,
            redirect: 'follow',
          });
          const requests: Request[] = [];
          const bodies: Uint8Array[] = [];
          const config = options(async (input) => {
            const request = input as Request;
            requests.push(request);
            bodies.push(new Uint8Array(await request.arrayBuffer()));
            return new Response(requests.length === 1 ? 'refresh auth' : 'ok', {
              status: requests.length === 1 ? 401 : 200,
            });
          });
          const first = await fetchWithAttestation(original, init, config);
          expect(await first.text()).toBe('refresh auth');
          expect(original.bodyUsed).toBe(false);
          expect(original.body?.locked).toBe(false);
          const headers = new Headers(original.headers);
          headers.set('authorization', 'Bearer refreshed');
          const second = await fetchWithAttestation(
            original,
            { ...init, headers, referrerPolicy: 'no-referrer' },
            config,
          );
          expect(await second.text()).toBe('ok');
          expect(original.bodyUsed).toBe(false);
          expect(original.headers.get('authorization')).toBe('Bearer old');
          expect(await original.text()).toBe(text);
          expect(bodies).toEqual([new TextEncoder().encode(text), new TextEncoder().encode(text)]);
          expect(requests.map((request) => request.headers.get('authorization'))).toEqual([
            'Bearer old',
            'Bearer refreshed',
          ]);
          for (const request of requests) {
            expect(request.url).toBe(original.url);
            expect(request.method).toBe('POST');
            expect(request.headers.get('content-type')).toBe(original.headers.get('content-type'));
            expect(request.credentials).toBe('include');
            expect(request.mode).toBe('cors');
            expect(request.cache).toBe('no-store');
            expect(request.integrity).toBe('sha256-fixture');
            expect(request.keepalive).toBe(true);
            expect(request.redirect).toBe('manual');
            expect(request.signal.aborted).toBe(false);
          }
          // Native Request resets inherited referrer policy when a nonempty init
          // dictionary is applied; an explicit policy wins on the authentication retry.
          expect(requests.map((request) => request.referrerPolicy)).toEqual([
            init !== undefined && 'body' in init && init.body === null ? '' : 'no-referrer',
            'no-referrer',
          ]);
          const nonces = requests.map((request) => decodeTransactionId(request.headers.get(PROOF_HEADER)!).nonceHex);
          expect(new Set(nonces).size).toBe(2);
          expect(config.signerClient.invalidate).not.toHaveBeenCalled();
          controller.abort('caller finished');
          expect(requests.every((request) => request.signal.reason === 'caller finished')).toBe(true);
        },
      );

      it('shares one finite multipart Request across concurrent calls, then reuses it with the same boundary', async () => {
        const form = new FormData();
        form.append('field', 'concurrent café 🌍');
        form.append('file', new Blob([new Uint8Array([0, 255, 128, 13, 10])]), 'bytes.bin');
        const original = new Request(`${API_ORIGIN}/api/submit`, { method: 'POST', body: form });
        const contentType = original.headers.get('content-type');
        const bodies: Uint8Array[] = [];
        const proofs: string[] = [];
        const types: (string | null)[] = [];
        const config = options(async (input) => {
          const request = input as Request;
          bodies.push(new Uint8Array(await request.arrayBuffer()));
          types.push(request.headers.get('content-type'));
          proofs.push(request.headers.get(PROOF_HEADER)!);
          return new Response('ok');
        });
        const outcomes = await Promise.allSettled(
          Array.from({ length: 6 }, () => fetchWithAttestation(original, undefined, config)),
        );
        expect(outcomes.every((result) => result.status === 'fulfilled')).toBe(true);
        expect(original.bodyUsed).toBe(false);
        expect(original.body?.locked).toBe(false);
        for (const outcome of outcomes) if (outcome.status === 'fulfilled') await outcome.value.text();
        // A caller may start consuming its branch after all wrappers have cloned it.
        const last = fetchWithAttestation(original, undefined, config);
        const expected = new Uint8Array(await original.arrayBuffer());
        expect(await (await last).text()).toBe('ok');
        expect(bodies).toHaveLength(7);
        expect(
          bodies.every((bytes) => bytes.length === expected.length && bytes.every((byte, i) => byte === expected[i])),
        ).toBe(true);
        expect(types).toEqual(Array(7).fill(contentType));
        expect(contentType).toContain('multipart/form-data; boundary=');
        expect(new Set(proofs).size).toBe(7);
        expect(new Set(proofs.map((proof) => decodeTransactionId(proof).nonceHex)).size).toBe(7);
      });

      it.each(['unread', 'used', 'locked'] as const)(
        'inherits only readable bodies and accepts non-null overrides for a %s Request without cloning it',
        async (state) => {
          const original = new Request(`${API_ORIGIN}/api/submit`, { method: 'POST', body: 'original' });
          if (state === 'used') await original.text();
          const reader = state === 'locked' ? original.body!.getReader() : undefined;
          const clone = vi.spyOn(original, 'clone');
          const wasUsed = original.bodyUsed;
          const wasLocked = original.body!.locked;
          const bodies: string[] = [];
          const config = options(async (input) => {
            bodies.push(await (input as Request).text());
            return new Response('ok');
          });
          try {
            if (state !== 'unread') {
              for (const init of [undefined, {}, { body: undefined }, { body: null }]) {
                await expect(fetchWithAttestation(original, init, config)).rejects.toMatchObject({
                  code: 'SIGNER_PREPARATION_FAILED',
                });
              }
              expect(config.signerClient.getSigner).not.toHaveBeenCalled();
              expect(bodies).toEqual([]);
            }
            // Empty string/zero bytes override too. WebIDL also reads inherited init properties.
            for (const init of [
              { body: '' },
              { body: new Uint8Array(0) },
              Object.create({ body: 'replacement' }) as RequestInit,
            ]) {
              expect(await (await fetchWithAttestation(original, init, config)).text()).toBe('ok');
              expect(original.bodyUsed).toBe(wasUsed);
              expect(original.body!.locked).toBe(wasLocked);
            }
            expect(bodies).toEqual(['', '', 'replacement']);
            expect(clone).not.toHaveBeenCalled();
          } finally {
            reader?.releaseLock();
          }
          if (state !== 'used') expect(await original.text()).toBe('original');
        },
      );

      it('preserves inherited settings and explicit signal/header overrides with one FormData serialization', async () => {
        const inheritedSignal = new AbortController();
        const explicitSignal = new AbortController();
        const original = new Request(`${API_ORIGIN}/api/submit?original=1`, {
          method: 'POST',
          body: 'used original',
          signal: inheritedSignal.signal,
          headers: { authorization: 'Bearer inherited', 'content-type': 'original/type' },
          credentials: 'include',
          mode: 'cors',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          integrity: 'sha256-fixture',
          keepalive: true,
        });
        await original.text();
        inheritedSignal.abort(new Error('old signal'));
        const form = new FormData();
        form.append('field', 'replacement 🌍');
        const NativeRequest = Request;
        let serializations = 0;
        vi.stubGlobal(
          'Request',
          new Proxy(NativeRequest, {
            construct(target, args) {
              if ((args[1] as RequestInit | undefined)?.body === form) serializations += 1;
              return Reflect.construct(target, args);
            },
          }),
        );
        const requests: Request[] = [];
        const bodies: Uint8Array[] = [];
        const config = options(async (input) => {
          requests.push(input as Request);
          bodies.push(new Uint8Array(await (input as Request).arrayBuffer()));
          return new Response('ok');
        });
        await (
          await fetchWithAttestation(
            original,
            {
              body: 'replacement',
              signal: explicitSignal.signal,
              referrerPolicy: 'no-referrer',
            },
            config,
          )
        ).text();
        await (
          await fetchWithAttestation(
            original,
            {
              body: form,
              signal: explicitSignal.signal,
              credentials: 'omit',
              headers: { authorization: 'Bearer explicit' },
              referrerPolicy: 'no-referrer',
            },
            config,
          )
        ).text();
        expect(requests.map((request) => request.credentials)).toEqual(['include', 'omit']);
        expect(requests.map((request) => request.headers.get('authorization'))).toEqual([
          'Bearer inherited',
          'Bearer explicit',
        ]);
        expect(requests[0]!.headers.get('content-type')).toBe('original/type');
        const type = requests[1]!.headers.get('content-type')!;
        expect(type).toContain('multipart/form-data; boundary=');
        const parsed = await new Response(bodies[1]! as BodyInit, { headers: { 'content-type': type } }).formData();
        expect(parsed.get('field')).toBe('replacement 🌍');
        expect(serializations).toBe(1);
        for (const request of requests) {
          expect(request.url).toBe(original.url);
          expect(request.method).toBe('POST');
          expect(request.mode).toBe('cors');
          expect(request.cache).toBe('no-store');
          expect(request.referrerPolicy).toBe('no-referrer');
          expect(request.integrity).toBe('sha256-fixture');
          expect(request.keepalive).toBe(true);
          expect(request.redirect).toBe('manual');
          expect(request.signal.aborted).toBe(false);
        }
        explicitSignal.abort('new signal');
        expect(requests.every((request) => request.signal.reason === 'new signal')).toBe(true);
      });

      it('samples init.body once for ownership and construction while retaining prototype dictionary properties', async () => {
        const original = new Request(`${API_ORIGIN}/api/submit`, { method: 'POST', body: 'original' });
        let bodyReads = 0;
        const init = Object.create({ credentials: 'omit', headers: { 'x-from-prototype': 'retained' } }) as RequestInit;
        Object.defineProperty(init, 'body', {
          get() {
            return ++bodyReads === 1 ? 'replacement' : undefined;
          },
        });
        const sent: Request[] = [];
        const config = options(async (input) => {
          sent.push(input as Request);
          return new Response('ok');
        });
        expect(await (await fetchWithAttestation(original, init, config)).text()).toBe('ok');
        expect(bodyReads).toBe(1);
        expect(await sent[0]!.text()).toBe('replacement');
        expect(sent[0]!.credentials).toBe('omit');
        expect(sent[0]!.headers.get('x-from-prototype')).toBe('retained');
        expect(original.bodyUsed).toBe(false);
        expect(await original.text()).toBe('original');
      });

      it('owns an explicit stream only after native construction and cancels it on pre-read rejection', async () => {
        for (const failure of ['construction', 'origin', 'encoding', 'abort'] as const) {
          const cancel = vi.fn(() => new Promise<void>(() => undefined));
          const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
          const controller = new AbortController();
          const reason = new Error('pre-read explicit abort');
          if (failure === 'abort') controller.abort(reason);
          const config = options(vi.fn(async () => new Response('must not send')));
          const outcome = await within(
            observe(
              fetchWithAttestation(
                `${API_ORIGIN}/api/submit`,
                {
                  method: failure === 'construction' ? 'GET' : 'POST',
                  body,
                  signal: controller.signal,
                  ...({ duplex: 'half' } as { duplex: string }),
                  ...(failure === 'encoding' ? { headers: { 'content-encoding': 'gzip' } } : {}),
                },
                { ...config, ...(failure === 'origin' ? { apiOrigin: 'https://other.example.com' } : {}) },
              ),
            ),
          );
          expect(outcome?.status).toBe('rejected');
          if (failure === 'abort' && outcome?.status === 'rejected') expect(outcome.reason).toBe(reason);
          expect(body.locked).toBe(false);
          expect(cancel).toHaveBeenCalledTimes(failure === 'construction' ? 0 : 1);
          expect(config.fetch).not.toHaveBeenCalled();
          expect(config.signerClient.getSigner).not.toHaveBeenCalled();
          cancelForCleanup(body);
        }
      });

      it.each(['construction', 'origin', 'encoding', 'abort'] as const)(
        'releases only its inherited branch after a pre-read %s failure',
        async (failure) => {
          const cancel = vi.fn();
          let sink!: ReadableStreamDefaultController<Uint8Array>;
          const stream = new ReadableStream<Uint8Array>(
            {
              start(controller) {
                sink = controller;
              },
              cancel,
            },
            { highWaterMark: 0 },
          );
          const controller = new AbortController();
          const reason = new Error('abort before reading');
          const original = streamRequest(stream, {
            signal: controller.signal,
            ...(failure === 'encoding' ? { headers: { 'content-encoding': 'gzip' } } : {}),
          });
          if (failure === 'abort') controller.abort(reason);
          const fetchImpl = vi.fn(async () => new Response('must not send'));
          const config = options(fetchImpl);
          const result = observe(
            fetchWithAttestation(original, failure === 'construction' ? { method: 'GET' } : undefined, {
              ...config,
              ...(failure === 'origin' ? { apiOrigin: 'https://other.example.com' } : {}),
            }),
          );
          try {
            const outcome = await within(result);
            expect(outcome?.status).toBe('rejected');
            if (outcome?.status === 'rejected') {
              if (failure === 'abort') expect(outcome.reason).toBe(reason);
              else
                expect(outcome.reason).toMatchObject({
                  code: failure === 'origin' ? 'SIGNER_ORIGIN_MISMATCH' : 'SIGNER_PREPARATION_FAILED',
                });
            }
            expect(fetchImpl).not.toHaveBeenCalled();
            expect(config.signerClient.getSigner).not.toHaveBeenCalled();
            expect(original.bodyUsed).toBe(false);
            expect(original.body?.locked).toBe(false);
            // Native tee cancellation cannot reach the producer while the caller owns its branch.
            expect(cancel).not.toHaveBeenCalled();
            const released = await within(observe(original.body!.cancel('caller releases its branch')));
            expect(released?.status).toBe('fulfilled');
            expect(cancel).toHaveBeenCalledTimes(1);
          } finally {
            closeForCleanup(sink);
            await result;
          }
        },
      );

      it.each(['limit', 'timeout'] as const)(
        'bounds an inherited %s failure while the caller can still read its branch',
        async (failure) => {
          const bytes = new TextEncoder().encode('caller-owned bytes');
          const cancel = vi.fn();
          let sink!: ReadableStreamDefaultController<Uint8Array>;
          const stream = new ReadableStream<Uint8Array>(
            {
              start(controller) {
                sink = controller;
                if (failure === 'limit') controller.enqueue(bytes);
              },
              cancel,
            },
            { highWaterMark: 0 },
          );
          const original = streamRequest(stream);
          const config = options(vi.fn(async () => new Response('must not send')));
          try {
            const outcome = await within(
              observe(
                fetchWithAttestation(original, undefined, {
                  ...config,
                  maxBodyBytes: 4,
                  bodyReadTimeoutMs: 20,
                }),
              ),
            );
            expect(outcome).toMatchObject({
              status: 'rejected',
              reason: {
                code: 'SIGNER_PREPARATION_FAILED',
                message: expect.stringContaining(failure === 'limit' ? '4-byte limit' : '20 ms'),
              },
            });
            expect(original.bodyUsed).toBe(false);
            expect(original.body?.locked).toBe(false);
            expect(cancel).not.toHaveBeenCalled();
            expect(config.fetch).not.toHaveBeenCalled();
            if (failure === 'timeout') sink.enqueue(bytes);
            sink.close();
            expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes);
          } finally {
            closeForCleanup(sink);
          }
        },
      );
    });

    describe('stale-response ownership', () => {
      it.each(['reload', 'signing', 'same envelope', 'request construction'] as const)(
        'returns readable JSON and text when retry %s falls back',
        async (failure) => {
          for (const format of ['json', 'text'] as const) {
            const signer = realSigner();
            const signInputs: SignInput[] = [];
            let firstProof: string | undefined;
            const sign = vi.fn(async (input: SignInput) => {
              signInputs.push(input);
              if (firstProof !== undefined) {
                if (failure === 'signing') throw new Error('signing failed');
                if (failure === 'same envelope') return firstProof;
                if (failure === 'request construction') return 'invalid\nheader';
              }
              firstProof = await signer.sign(input);
              return firstProof;
            });
            const client = clientFor({ ...signer, sign });
            if (failure === 'reload')
              vi.mocked(client.getSigner)
                .mockResolvedValueOnce({ ...signer, sign })
                .mockRejectedValueOnce(new Error('reload failed'));
            const payload = format === 'json' ? STALE_JSON : 'retired key: café 🌍';
            const stale = new Response(payload, { status: 403, headers: STALE_HEADERS });
            const cancel = vi.spyOn(stale.body!, 'cancel');
            const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
              await (input as Request).arrayBuffer();
              return stale;
            });
            const response = await fetchWithAttestation(
              `${API_ORIGIN}/api/submit`,
              { method: 'POST', body: 'same bytes' },
              options(fetchImpl, client),
            );
            expect(response).toBe(stale);
            expect(response.bodyUsed).toBe(false);
            expect(response.body?.locked).toBe(false);
            expect(cancel).not.toHaveBeenCalled();
            if (format === 'json') expect(await response.json()).toEqual(JSON.parse(STALE_JSON));
            else expect(await response.text()).toBe(payload);
            expect(fetchImpl).toHaveBeenCalledTimes(1);
            expect(client.invalidate).toHaveBeenCalledExactlyOnceWith(signer.keyId);
            if (signInputs.length === 2) expect(signInputs[0]!.nonceHex).not.toBe(signInputs[1]!.nonceHex);
          }
        },
      );

      it('does not touch the first response while replacement discovery and signing are pending', async () => {
        const replacement = deferred<RequestSigner>();
        const proof = deferred<string>();
        const reloading = deferred<void>();
        const signing = deferred<SignInput>();
        const signer = realSigner();
        const client = clientFor(signer);
        vi.mocked(client.getSigner)
          .mockResolvedValueOnce(signer)
          .mockImplementationOnce(() => {
            reloading.resolve();
            return replacement.promise;
          });
        const stale = new Response(STALE_JSON, { status: 403, headers: STALE_HEADERS });
        const cancel = vi.spyOn(stale.body!, 'cancel');
        const fetchImpl = vi
          .fn(async () => stale)
          .mockResolvedValueOnce(stale)
          .mockResolvedValueOnce(new Response('ok'));
        const result = observe(fetchWithAttestation(`${API_ORIGIN}/api/items`, undefined, options(fetchImpl, client)));
        try {
          expect(await within(reloading.promise.then(() => true))).toBe(true);
          expect(cancel).not.toHaveBeenCalled();
          expect(stale.bodyUsed).toBe(false);
          replacement.resolve({
            ...signer,
            sign: (input) => {
              signing.resolve(input);
              return proof.promise;
            },
          });
          const input = await within(signing.promise);
          expect(input).toBeDefined();
          expect(cancel).not.toHaveBeenCalled();
          expect(stale.bodyUsed).toBe(false);
          proof.resolve(await signer.sign(input!));
          const outcome = await result;
          expect(outcome.status).toBe('fulfilled');
          if (outcome.status === 'fulfilled') expect(await outcome.value.text()).toBe('ok');
          expect(cancel).toHaveBeenCalledTimes(1);
          expect(fetchImpl).toHaveBeenCalledTimes(2);
        } finally {
          replacement.resolve(signer);
          proof.resolve('cleanup-proof');
          await result;
        }
      });

      it.each(['never settles', 'rejects', 'throws synchronously'] as const)(
        'prepares the retry before disposing the first response even when cancel %s',
        async (cancellation) => {
          const release = deferred<void>();
          const requests = recordSignedRequests();
          let preparedAtCancel = 0;
          const cancelled = vi.fn(() => {
            preparedAtCancel = requests.length;
            if (cancellation === 'rejects') return Promise.reject(new Error('cancel rejected'));
            return release.promise;
          });
          const stale = new Response(new ReadableStream<Uint8Array>({ cancel: cancelled }), {
            status: 403,
            headers: STALE_HEADERS,
          });
          if (cancellation === 'throws synchronously') {
            vi.spyOn(stale.body!, 'cancel').mockImplementationOnce(() => {
              preparedAtCancel = requests.length;
              throw new Error('cancel threw');
            });
          }
          const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            await (input as Request).arrayBuffer();
            return fetchImpl.mock.calls.length === 1 ? stale : new Response('ok');
          });
          const result = observe(
            fetchWithAttestation(
              `${API_ORIGIN}/api/submit`,
              { method: 'POST', body: 'retry bytes' },
              options(fetchImpl),
            ),
          );
          try {
            const outcome = await within(result);
            expect(outcome?.status).toBe('fulfilled');
            if (outcome?.status === 'fulfilled') expect(await outcome.value.text()).toBe('ok');
            expect(preparedAtCancel).toBe(2);
            expect(fetchImpl).toHaveBeenCalledTimes(2);
            expect(requests).toHaveLength(2);
            expect(requests.every((request) => request.redirect === 'manual')).toBe(true);
            if (cancellation !== 'throws synchronously') expect(cancelled).toHaveBeenCalledTimes(1);
            // Give unhandled-rejection reporting a task turn too.
            await new Promise((resolve) => setTimeout(resolve, 0));
          } finally {
            release.resolve();
            await result;
            cancelForCleanup(stale.body);
          }
        },
      );

      it('does not wait for cancellation of a native response tee with an unread sibling', async () => {
        let sink!: ReadableStreamDefaultController<Uint8Array>;
        const sibling = new Response(
          new ReadableStream<Uint8Array>(
            {
              start(controller) {
                sink = controller;
                controller.enqueue(new TextEncoder().encode(STALE_JSON));
              },
            },
            { highWaterMark: 0 },
          ),
          { status: 403, headers: STALE_HEADERS },
        );
        const stale = sibling.clone();
        let cancellationSettled = false;
        const nativeCancel = stale.body!.cancel.bind(stale.body);
        const cancel = vi.spyOn(stale.body!, 'cancel').mockImplementation((reason) => {
          const pending = nativeCancel(reason);
          void pending.then(
            () => {
              cancellationSettled = true;
            },
            () => {
              cancellationSettled = true;
            },
          );
          return pending;
        });
        const fetchImpl = vi
          .fn(async () => stale)
          .mockResolvedValueOnce(stale)
          .mockResolvedValueOnce(new Response('ok'));
        const result = observe(fetchWithAttestation(`${API_ORIGIN}/api/items`, undefined, options(fetchImpl)));
        try {
          const outcome = await within(result);
          expect(outcome?.status).toBe('fulfilled');
          if (outcome?.status === 'fulfilled') expect(await outcome.value.text()).toBe('ok');
          expect(cancel).toHaveBeenCalledTimes(1);
          expect(cancellationSettled).toBe(false);
          expect(sibling.bodyUsed).toBe(false);
          sink.close();
          expect(await sibling.json()).toEqual(JSON.parse(STALE_JSON));
          expect(fetchImpl).toHaveBeenCalledTimes(2);
        } finally {
          closeForCleanup(sink);
          cancelForCleanup(sibling.body);
          await result;
        }
      });

      it.each(['rejects', 'never settles'] as const)(
        'honors abort during response cancellation that %s without sending the prepared retry',
        async (cancellation) => {
          const controller = new AbortController();
          const reason = new Error('caller aborted during cancellation');
          const release = deferred<void>();
          const requests = recordSignedRequests();
          const cancel = vi.fn(() => {
            controller.abort(reason);
            return cancellation === 'rejects' ? Promise.reject(new Error('cancel rejected')) : release.promise;
          });
          const stale = new Response(new ReadableStream<Uint8Array>({ cancel }), {
            status: 403,
            headers: STALE_HEADERS,
          });
          const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            await (input as Request).arrayBuffer();
            return stale;
          });
          const result = observe(
            fetchWithAttestation(
              `${API_ORIGIN}/api/submit`,
              {
                method: 'POST',
                body: 'retry bytes',
                signal: controller.signal,
              },
              options(fetchImpl),
            ),
          );
          try {
            expect(await within(result)).toEqual({ status: 'rejected', reason });
            expect(cancel).toHaveBeenCalledTimes(1);
            expect(fetchImpl).toHaveBeenCalledTimes(1);
            expect(requests).toHaveLength(2);
            expect(requests[1]!.bodyUsed).toBe(true);
            expect(requests[1]!.body?.locked).toBe(false);
          } finally {
            release.resolve();
            await result;
          }
        },
      );

      it.each(['initial load', 'replacement load'] as const)(
        'aborts waiting for %s without disposing the shared client or sending late work',
        async (phase) => {
          const controller = new AbortController();
          const reason = new Error('caller stops waiting');
          const started = deferred<void>();
          const load = deferred<RequestSigner>();
          const signer = realSigner();
          const sign = vi.fn(signer.sign);
          const client = clientFor({ ...signer, sign });
          if (phase === 'replacement load') vi.mocked(client.getSigner).mockResolvedValueOnce({ ...signer, sign });
          vi.mocked(client.getSigner).mockImplementationOnce(() => {
            started.resolve();
            return load.promise;
          });
          const stale = new Response(STALE_JSON, { status: 403, headers: STALE_HEADERS });
          const cancel = vi.spyOn(stale.body!, 'cancel');
          const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            await (input as Request).arrayBuffer();
            return stale;
          });
          const original = new Request(`${API_ORIGIN}/api/submit`, {
            method: 'POST',
            body: 'caller bytes',
            signal: controller.signal,
          });
          const result = observe(fetchWithAttestation(original, undefined, options(fetchImpl, client)));
          try {
            expect(await within(started.promise.then(() => true))).toBe(true);
            expect(cancel).not.toHaveBeenCalled();
            controller.abort(reason);
            expect(await within(result)).toEqual({ status: 'rejected', reason });
            expect(client.dispose).not.toHaveBeenCalled();
            expect(original.bodyUsed).toBe(false);
            expect(await original.text()).toBe('caller bytes');
            expect(cancel).toHaveBeenCalledTimes(phase === 'replacement load' ? 1 : 0);
            // A late failure is observed, with no extra signing or transport.
            load.reject(new Error('late shared load rejection'));
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(sign).toHaveBeenCalledTimes(phase === 'replacement load' ? 1 : 0);
            expect(fetchImpl).toHaveBeenCalledTimes(phase === 'replacement load' ? 1 : 0);
          } finally {
            controller.abort(reason);
            load.resolve({ ...signer, sign });
            await result;
            cancelForCleanup(stale.body);
          }
        },
      );

      it('propagates retry transport uncertainty after one possible effect and never makes a third attempt', async () => {
        const stale = new Response(STALE_JSON, { status: 403, headers: STALE_HEADERS });
        const cancel = vi.spyOn(stale.body!, 'cancel');
        const client = clientFor();
        const error = new TypeError('connection lost after handler');
        let effects = 0;
        const proofs: string[] = [];
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
          const request = input as Request;
          await request.arrayBuffer();
          proofs.push(request.headers.get(PROOF_HEADER)!);
          if (proofs.length === 1) return stale;
          effects += 1;
          throw error;
        });
        await expect(
          fetchWithAttestation(
            `${API_ORIGIN}/api/submit`,
            { method: 'POST', body: 'operation' },
            options(fetchImpl, client),
          ),
        ).rejects.toBe(error);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(effects).toBe(1);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(client.invalidate).toHaveBeenCalledTimes(1);
        expect(new Set(proofs).size).toBe(2);
      });
    });

    it.each([false, true])(
      'digest-call experiment: hashes one immutable 32768-byte snapshot (stale retry = %s)',
      async (retry) => {
        const original = Uint8Array.from({ length: 32768 }, (_, i) => i % 251);
        const expected = original.slice();
        const signer = realSigner();
        const signInputs: SignInput[] = [];
        const client = clientFor({
          ...signer,
          sign: async (input) => {
            signInputs.push(input);
            return signer.sign(input);
          },
        });
        const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
        const digestInputs: number[] = [];
        let digestResultBytes = 0;
        const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, bytes) => {
          digestInputs.push(bytes.byteLength);
          const result = await nativeDigest(algorithm, bytes);
          digestResultBytes += result.byteLength;
          return result;
        });
        const headers = new Headers({ 'content-type': 'application/octet-stream' });
        const bodies: Uint8Array[] = [];
        const types: (string | null)[] = [];
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
          const request = input as Request;
          bodies.push(new Uint8Array(await request.arrayBuffer()));
          types.push(request.headers.get('content-type'));
          original.fill(255);
          headers.set('content-type', 'changed/by-caller');
          return retry && bodies.length === 1
            ? new Response(STALE_JSON, { status: 403, headers: STALE_HEADERS })
            : new Response('ok');
        });
        const response = await fetchWithAttestation(
          `${API_ORIGIN}/api/submit`,
          { method: 'POST', body: original, headers },
          options(fetchImpl, client),
        );
        expect(await response.text()).toBe('ok');
        console.info('fetch snapshot digest', {
          retry,
          inputBytes: expected.length,
          attempts: bodies.length,
          digestCalls: digest.mock.calls.length,
          digestInputs,
          digestResultBytes,
        });
        expect(bodies).toEqual(retry ? [expected, expected] : [expected]);
        expect(types).toEqual(Array(bodies.length).fill('application/octet-stream'));
        expect(
          signInputs.every(
            (input) => input.bodyHashHex === '09fed9cbfb98b6ab0f3e8ff63b7b1f9b0e07d58b225295c78fdc023cc4985a72',
          ),
        ).toBe(true);
        expect(new Set(signInputs.map((input) => input.nonceHex)).size).toBe(bodies.length);
        expect(digestInputs).toEqual([32768]);
        expect(digestResultBytes).toBe(32);
      },
    );
  });
}
