import { abortable, assertNotAborted, bestEffort, cancelResponse } from './abort';
import { vaultRequestTimeout, vaultResponseTooLarge } from './errors';

interface VaultHttpOptions {
  signal: AbortSignal;
  requestTimeoutMs: number;
  maxResponseBytes: number;
}

/** One HTTP attempt: the deadline includes headers, all streamed bytes and JSON parsing. */
export const requestVaultJson = async (
  request: typeof fetch,
  url: string,
  init: RequestInit,
  { signal, requestTimeoutMs, maxResponseBytes }: VaultHttpOptions,
): Promise<{ status: number; nonce: string | null; value: unknown }> => {
  assertNotAborted(signal);
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  // The proof/credential clock can be injected and frozen. Use a monotonic
  // transport clock, including checks after synchronous decoding/parsing when
  // a timer cannot run until JavaScript yields (or a suspended tab resumes).
  const started = performance.now();
  const timeout = setTimeout(() => controller.abort(vaultRequestTimeout()), requestTimeoutMs);
  const assertActive = () => {
    if (!controller.signal.aborted && performance.now() - started >= requestTimeoutMs)
      controller.abort(vaultRequestTimeout());
    assertNotAborted(controller.signal);
  };
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let bodyDone = false;
  try {
    response = await abortable(
      controller.signal,
      () => request(url, { ...init, signal: controller.signal }),
      cancelResponse,
    );
    assertActive();
    // Native fetch responses are immutable, but supported injected responses
    // need not be. Body reads/cleanup must not alter the admitted recovery data.
    const status = response.status;
    const nonce = response.headers.get('DPoP-Nonce');
    let value: unknown;
    try {
      if (response.body) {
        const bodyReader = response.body.getReader();
        reader = bodyReader;
        const decoder = new TextDecoder();
        let bytes = 0;
        let text = '';
        for (;;) {
          assertActive();
          const chunk = await abortable(controller.signal, () => bodyReader.read());
          assertActive();
          if (chunk.done) {
            bodyDone = true;
            break;
          }
          // Native fetch bodies contain Uint8Array chunks. Treat malformed
          // injected bodies like the previous response.json() failure path.
          if (!ArrayBuffer.isView(chunk.value)) throw new TypeError('Invalid vault response body.');
          if (chunk.value.byteLength > maxResponseBytes - bytes) {
            controller.abort(vaultResponseTooLarge());
            assertActive();
          }
          bytes += chunk.value.byteLength;
          text += decoder.decode(chunk.value, { stream: true });
        }
        value = JSON.parse(text + decoder.decode()) as unknown;
      }
    } catch {
      // Preserve malformed/unreadable-JSON handling at the route's existing
      // response-contract boundary. Abort/resource bounds must escape it.
      assertActive();
      value = undefined;
    }
    assertActive();
    return { status, nonce, value };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
    if (reader) {
      const bodyReader = reader;
      if (!bodyDone) bestEffort(() => bodyReader.cancel());
      bestEffort(() => bodyReader.releaseLock());
    } else if (response) cancelResponse(response);
  }
};
