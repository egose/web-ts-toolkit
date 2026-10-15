/** Native Chromium streams through the shipped ESM; no source runtime imports. */
import { describe, expect, it } from 'vitest';

import {
  SignerClientError,
  createSignerClient,
  fetchSignerBundle,
  materializeRequestBodyBytes,
} from '../dist/signer.mjs';
import type { RequestSigner } from '../dist/signer.mjs';
import { runDiscoveryResponseTests } from './discovery-response.cases.js';

runDiscoveryResponseTests({ SignerClientError, createSignerClient, fetchSignerBundle });

const apiOrigin = 'https://attestation.example.com';
const replayNamespace = 'stream-tests';
const signer: RequestSigner = {
  version: 1,
  keyId: 'stream-key',
  publicOrigin: apiOrigin,
  replayNamespace,
  sign: async () => 'unused-proof',
};
const metadata = {
  version: 1,
  keyId: signer.keyId,
  signerUrl: '/attestation/signer.stream.mjs',
  publicOrigin: apiOrigin,
  replayNamespace,
  note: 'café 🌍',
};

function requestBody(stream: ReadableStream<Uint8Array>): Request {
  return new Request(`${apiOrigin}/api/items`, {
    method: 'POST',
    body: stream,
    ...({ duplex: 'half' } as { duplex: string }),
  });
}

describe('browser byte-stream bounds (built bundle)', () => {
  it.each(['rejects', 'never settles'] as const)(
    'rejects metadata overflow before EOF when cancellation %s',
    async (cancellation) => {
      let pulls = 0;
      let cancels = 0;
      let imports = 0;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (++pulls === 1) controller.enqueue(new Uint8Array(4096));
            else if (pulls === 2) controller.enqueue(new Uint8Array(1));
          },
          cancel() {
            cancels += 1;
            return cancellation === 'rejects'
              ? Promise.reject(new Error('cancel rejected'))
              : new Promise<void>(() => undefined);
          },
        },
        { highWaterMark: 0 },
      );
      const client = createSignerClient({
        metadataUrl: `${apiOrigin}/attestation/signer-meta`,
        apiOrigin,
        replayNamespace,
        fetch: async () => new Response(stream),
        loadModule: async () => {
          imports += 1;
          return { signer };
        },
        loadTimeoutMs: 1000,
      });
      try {
        const error = await client.getSigner().catch((reason: unknown) => reason);
        expect(error).toBeInstanceOf(SignerClientError);
        expect(error).toMatchObject({ code: 'SIGNER_LOAD_FAILED', message: expect.stringContaining('4096-byte cap') });
        expect(pulls).toBe(2);
        expect(cancels).toBe(1);
        expect(imports).toBe(0);
        expect(stream.locked).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 0));
      } finally {
        client.dispose();
      }
    },
  );

  it.each([0, 1])('lets caller abort tasks interrupt productive %i-byte chunks', async (chunkBytes) => {
    const controller = new AbortController();
    const reason = new Error('browser caller abort');
    const chunk = new Uint8Array(chunkBytes);
    let pulls = 0;
    let cancels = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(sink) {
          if (++pulls > 10000) sink.close();
          else sink.enqueue(chunk);
        },
        cancel() {
          cancels += 1;
        },
      },
      { highWaterMark: 0 },
    );
    const timer = setTimeout(() => controller.abort(reason), 0);
    try {
      const outcome = await materializeRequestBodyBytes(requestBody(stream), {
        maxBodyBytes: 10000,
        signal: controller.signal,
      }).then(
        () => ({ ok: true }),
        (error: unknown) => ({ ok: false, error }),
      );
      expect(outcome).toEqual({ ok: false, error: reason });
      expect(pulls).toBeLessThan(10000);
      expect(cancels).toBe(1);
      expect(stream.locked).toBe(false);
    } finally {
      clearTimeout(timer);
    }
  });

  it.each(['rejects', 'never settles'] as const)(
    'times out stalled reads without awaiting cancellation that %s',
    async (cancellation) => {
      let cancels = 0;
      const stream = new ReadableStream<Uint8Array>({
        cancel() {
          cancels += 1;
          return cancellation === 'rejects'
            ? Promise.reject(new Error('cancel rejected'))
            : new Promise<void>(() => undefined);
        },
      });
      const error = await materializeRequestBodyBytes(requestBody(stream), { timeoutMs: 20 }).catch(
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(SignerClientError);
      expect(error).toMatchObject({ code: 'SIGNER_PREPARATION_FAILED', message: expect.stringContaining('20 ms') });
      expect(cancels).toBe(1);
      expect(stream.locked).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  );

  it('keeps the whole-load timeout effective during productive empty metadata', async () => {
    const empty = new Uint8Array(0);
    let pulls = 0;
    let cancels = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (++pulls > 100000) controller.close();
          else controller.enqueue(empty);
        },
        cancel() {
          cancels += 1;
          return new Promise<void>(() => undefined);
        },
      },
      { highWaterMark: 0 },
    );
    const client = createSignerClient({
      metadataUrl: `${apiOrigin}/attestation/signer-meta`,
      apiOrigin,
      replayNamespace,
      fetch: async () => new Response(stream),
      loadModule: async () => {
        throw new Error('must not import');
      },
      loadTimeoutMs: 20,
    });
    try {
      await expect(client.getSigner()).rejects.toMatchObject({ code: 'SIGNER_LOAD_TIMEOUT' });
      expect(pulls).toBeLessThan(100000);
      expect(cancels).toBe(1);
      expect(stream.locked).toBe(false);
    } finally {
      client.dispose();
    }
  });

  it('preserves multipart bytes and boundary at cap equality', async () => {
    const form = new FormData();
    form.append('field', 'café 🌍');
    form.append('file', new Blob([new Uint8Array([0, 255, 128, 13, 10])]), 'bytes.bin');
    const request = new Request(`${apiOrigin}/api/items`, { method: 'POST', body: form });
    const contentType = request.headers.get('content-type');
    const expected = new Uint8Array(await request.clone().arrayBuffer());
    const actual = await materializeRequestBodyBytes(request, { maxBodyBytes: expected.length });
    expect(actual).toEqual(expected);
    expect(request.headers.get('content-type')).toBe(contentType);
    expect(contentType).toContain('multipart/form-data; boundary=');
    expect(request.body?.locked).toBe(false);
  });

  it('decodes split UTF-8 at the metadata cap and rejects malformed UTF-8', async () => {
    const raw = JSON.stringify(metadata);
    const bytes = new TextEncoder().encode(raw + ' '.repeat(4096 - new TextEncoder().encode(raw).length));
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (offset === bytes.length) controller.close();
          else controller.enqueue(bytes.subarray(offset, ++offset));
        },
      },
      { highWaterMark: 0 },
    );
    let imports = 0;
    const options = {
      metadataUrl: `${apiOrigin}/attestation/signer-meta`,
      apiOrigin,
      replayNamespace,
      loadModule: async () => {
        imports += 1;
        return { signer };
      },
    };
    expect((await fetchSignerBundle({ ...options, fetch: async () => new Response(stream) })).signer.keyId).toBe(
      signer.keyId,
    );
    expect(stream.locked).toBe(false);
    await expect(
      fetchSignerBundle({
        ...options,
        fetch: async () => new Response(new Uint8Array([0xc3, 0x28])),
      }),
    ).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED', message: expect.stringContaining('valid UTF-8') });
    expect(imports).toBe(1);
  });
});
