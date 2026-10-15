/** Shared source-Node / built-Chromium controls for discarded discovery responses. */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RequestSigner } from '../src/signer.js';

type DiscoveryRuntime = Pick<
  typeof import('../src/signer.js'),
  'SignerClientError' | 'createSignerClient' | 'fetchSignerBundle'
>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function runDiscoveryResponseTests(runtime: DiscoveryRuntime): void {
  const { SignerClientError, createSignerClient, fetchSignerBundle } = runtime;
  const apiOrigin = 'https://attestation.example.com';
  const replayNamespace = 'discovery-response';
  const base = { apiOrigin, replayNamespace, metadataUrl: `${apiOrigin}/signer-meta` };
  const signer: RequestSigner = {
    version: 1,
    keyId: 'recovered-key',
    publicOrigin: apiOrigin,
    replayNamespace,
    sign: async () => 'unused-proof',
  };
  const metadata = (signerUrl = '/recovered.mjs') =>
    new Response(
      JSON.stringify({
        version: 1,
        keyId: signer.keyId,
        publicOrigin: apiOrigin,
        replayNamespace,
        signerUrl,
      }),
    );
  const failure = {
    name: 'SignerClientError',
    code: 'SIGNER_LOAD_FAILED',
    message: '[express-request-attestation] Signer metadata fetch failed.',
  };

  describe('non-OK discovery response ownership', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    describe.each(['standalone', 'initial client', 'retirement refetch'] as const)('%s', (path) => {
      it.each(['settles', 'throws synchronously', 'rejects', 'stays pending'] as const)(
        'discards once without reading or waiting when cancel %s, then recovers',
        async (cancellation) => {
          vi.useFakeTimers();
          const pendingCancel = deferred<void>();
          let sink!: ReadableStreamDefaultController<Uint8Array>;
          const pull = vi.fn();
          const stream = new ReadableStream<Uint8Array>(
            {
              start(controller) {
                sink = controller;
                // More than the metadata cap, and no EOF. Status failure must not
                // accumulate this payload or turn into a cap/JSON/read-timeout error.
                controller.enqueue(new TextEncoder().encode('private upstream diagnostic '.repeat(256)));
              },
              pull,
              cancel() {
                if (cancellation === 'rejects') return Promise.reject(new Error('private cancel diagnostic'));
                if (cancellation === 'stays pending') return pendingCancel.promise;
              },
            },
            { highWaterMark: 0 },
          );
          const cancel = vi.spyOn(stream, 'cancel');
          if (cancellation === 'throws synchronously') {
            // A native underlying-source throw becomes a rejected Promise. Inject
            // the separate method-level fault to exercise the synchronous boundary.
            cancel.mockImplementation(() => {
              throw new Error('private synchronous cancel diagnostic');
            });
          }
          const getReader = vi.spyOn(stream, 'getReader');
          const response = new Response(stream, { status: 503 });
          const wholeReaders = ['arrayBuffer', 'text', 'json'].map((method) =>
            vi.spyOn(response, method as 'arrayBuffer' | 'text' | 'json'),
          );
          const responses = path === 'retirement refetch' ? [metadata('/retired.mjs'), response] : [response];
          const recoveredResponse = metadata();
          const cancelRecovered = vi.spyOn(recoveredResponse.body!, 'cancel');
          let available = false;
          const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
            void _input;
            void _init;
            if (available) return recoveredResponse;
            const next = responses.shift();
            if (next === undefined) throw new Error('unexpected metadata retry');
            return next;
          });
          const loadModule = vi.fn(async (url: string) => {
            if (url.endsWith('/retired.mjs')) throw new Error('retired module');
            return { signer };
          });
          const controller = new AbortController();
          const callerAbort = vi.fn();
          controller.signal.addEventListener('abort', callerAbort);
          const options = { ...base, fetch: fetchImpl, loadModule };
          const client = path === 'standalone' ? undefined : createSignerClient({ ...options, loadTimeoutMs: 1000 });
          const start = () =>
            client === undefined
              ? fetchSignerBundle({ ...options, signal: controller.signal }).then((bundle) => bundle.signer)
              : client.getSigner();
          try {
            const pending = start();
            const peers = client === undefined ? [pending] : [pending, client.getSigner(), client.getSigner()];
            expect(peers.every((peer) => peer === pending)).toBe(true);
            let outcomes: PromiseSettledResult<RequestSigner>[] | undefined;
            void Promise.allSettled(peers).then((results) => {
              outcomes = results;
            });
            await vi.advanceTimersByTimeAsync(0);
            expect(outcomes).toHaveLength(peers.length);
            for (const outcome of outcomes!) {
              expect(outcome).toMatchObject({ status: 'rejected', reason: failure });
              if (outcome.status === 'rejected') {
                expect(outcome.reason).toBeInstanceOf(SignerClientError);
                expect(outcome.reason.cause).toBeUndefined();
              }
            }
            const discoveries = path === 'retirement refetch' ? 2 : 1;
            const imports = path === 'retirement refetch' ? 1 : 0;
            expect(fetchImpl).toHaveBeenCalledTimes(discoveries);
            expect(loadModule).toHaveBeenCalledTimes(imports);
            expect(cancel).toHaveBeenCalledTimes(1);
            expect(getReader).not.toHaveBeenCalled();
            expect(pull).not.toHaveBeenCalled();
            for (const read of wholeReaders) expect(read).not.toHaveBeenCalled();
            expect(stream.locked).toBe(false);
            expect(vi.getTimerCount()).toBe(0);
            if (client === undefined) expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(controller.signal);

            // Neither a load deadline nor pending cancellation owns later work.
            await vi.advanceTimersByTimeAsync(2000);
            expect(fetchImpl).toHaveBeenCalledTimes(discoveries);
            expect(loadModule).toHaveBeenCalledTimes(imports);
            expect(cancel).toHaveBeenCalledTimes(1);
            expect(controller.signal.aborted).toBe(false);
            expect(callerAbort).not.toHaveBeenCalled();
            available = true;
            const recovery = start();
            const recoveryPeers =
              client === undefined ? [recovery] : [recovery, client.getSigner(), client.getSigner()];
            expect(recoveryPeers.every((peer) => peer === recovery)).toBe(true);
            expect(await Promise.all(recoveryPeers)).toEqual(recoveryPeers.map(() => signer));
            if (client !== undefined) expect(await client.getSigner()).toBe(signer);
            expect(fetchImpl).toHaveBeenCalledTimes(discoveries + 1);
            expect(loadModule).toHaveBeenCalledTimes(imports + 1);
            expect(cancelRecovered).not.toHaveBeenCalled();
            expect(recoveredResponse.bodyUsed).toBe(true);
            expect(recoveredResponse.body?.locked).toBe(false);
            expect(vi.getTimerCount()).toBe(0);
            const reason = new Error('caller still owns its signal');
            controller.abort(reason);
            expect(controller.signal.reason).toBe(reason);
            expect(callerAbort).toHaveBeenCalledTimes(1);
            expect(cancel).toHaveBeenCalledTimes(1);
          } finally {
            // Release the test-only gate after all pending-cancel/recovery assertions.
            pendingCancel.resolve(undefined);
            sink.error(new Error('bounded regression cleanup'));
            client?.dispose();
            await vi.advanceTimersByTimeAsync(0);
          }
        },
      );
    });

    it.each([0, 302, 503])('keeps the fixed failure for a bodyless non-OK response (%i)', async (status) => {
      const response = status === 0 ? Response.error() : new Response(null, { status });
      const loadModule = vi.fn(async () => ({ signer }));
      const fetchImpl = vi.fn(async () => response);
      await expect(fetchSignerBundle({ ...base, fetch: fetchImpl, loadModule })).rejects.toMatchObject(failure);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(loadModule).not.toHaveBeenCalled();
    });

    it('observes late obsolete cancellation rejection without losing current disposal ownership', async () => {
      vi.useFakeTimers();
      const obsoleteMetadata = deferred<Response>();
      const cancellation = deferred<void>();
      const obsoleteCancel = vi.fn(() => cancellation.promise);
      const obsoleteBody = new ReadableStream<Uint8Array>({ cancel: obsoleteCancel });
      const currentCancel = vi.fn();
      const currentBody = new ReadableStream<Uint8Array>({ cancel: currentCancel });
      const loadModule = vi.fn(async () => ({ signer }));
      let discoveries = 0;
      const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
        void _input;
        void _init;
        return ++discoveries === 1 ? obsoleteMetadata.promise : new Response(currentBody);
      });
      const client = createSignerClient({ ...base, fetch: fetchImpl, loadModule, loadTimeoutMs: 1000 });
      try {
        const obsolete = Promise.allSettled([client.getSigner()]);
        client.invalidate(signer.keyId);
        const current = client.getSigner();
        const currentResult = Promise.allSettled([current]);
        obsoleteMetadata.resolve(new Response(obsoleteBody, { status: 503 }));
        await expect(obsolete).resolves.toMatchObject([{ status: 'rejected', reason: failure }]);
        expect(obsoleteCancel).toHaveBeenCalledTimes(1);
        cancellation.reject(new Error('late obsolete producer failure'));
        await vi.advanceTimersByTimeAsync(0);
        expect(client.getSigner()).toBe(current);
        const currentSignal = fetchImpl.mock.calls[1]?.[1]?.signal;
        expect(currentSignal?.aborted).toBe(false);
        expect(currentCancel).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(1);
        client.dispose();
        await expect(currentResult).resolves.toMatchObject([
          {
            status: 'rejected',
            reason: {
              code: 'SIGNER_LOAD_FAILED',
              message: '[express-request-attestation] Signer discovery was aborted.',
            },
          },
        ]);
        expect(currentSignal?.aborted).toBe(true);
        expect(currentCancel).toHaveBeenCalledTimes(1);
        expect(obsoleteCancel).toHaveBeenCalledTimes(1);
        expect(currentBody.locked).toBe(false);
        expect(loadModule).not.toHaveBeenCalled();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        obsoleteMetadata.resolve(new Response(null, { status: 503 }));
        cancellation.resolve(undefined);
        client.dispose();
        await vi.advanceTimersByTimeAsync(0);
      }
    });
  });
}
