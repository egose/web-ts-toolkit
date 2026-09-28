import { expect, it, vi } from 'vitest';
import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import embeddedSharedB64 from './fixtures/generated/embedded-shared.pdf.base64.txt?raw';

/**
 * PDFR4-06 design characterization, not package acceptance tests. A public
 * getOperatorList counterpart has a different intent from render. Even without
 * package cleanup, it cannot protect its images from render cancellation/error.
 * Test-only gates delay real worker delivery; PDF.js owns cancellation/cleanup.
 */
it.each([
  ['pending', 'cancel'],
  ['prewarmed', 'cancel'],
  ['pending', 'error'],
  ['prewarmed', 'error'],
] as const)(
  'characterizes %s operators/render %s (PDFR4-06)',
  async (mode, outcome) => {
    GlobalWorkerOptions.workerSrc = workerUrl;
    const bytes = Uint8Array.from(atob(embeddedSharedB64.trim()), (character) => character.charCodeAt(0));
    const loading = getDocument({ data: bytes });
    const operatorGate = Promise.withResolvers<void>();
    const renderGate = Promise.withResolvers<void>();
    const operatorChunk = Promise.withResolvers<void>();
    const imageReady = Promise.withResolvers<string>();
    const peerCleanup = Promise.withResolvers<boolean>();
    const canvas = document.createElement('canvas');
    try {
      const doc = await loading.promise;
      const page = await doc.getPage(1);
      const internal = page as typeof page & {
        _renderPageChunk: (...args: unknown[]) => void;
        _transport: {
          messageHandler: { sendWithStream: (name: string, data: { intent: number }) => ReadableStream<unknown> };
        };
      };
      const store = page.objs as {
        resolve(id: string, value: unknown): void;
        has(id: string): boolean;
      };
      const resolveObject = store.resolve.bind(store);
      vi.spyOn(store, 'resolve').mockImplementation((id, value) => {
        resolveObject(id, value);
        imageReady.resolve(id);
      });
      const deliverChunk = internal._renderPageChunk.bind(page);
      vi.spyOn(internal, '_renderPageChunk').mockImplementation((...args) => {
        operatorChunk.resolve();
        void operatorGate.promise.then(() => {
          if (!page.destroyed) deliverChunk(...args);
        });
      });
      // Hold only the rendering reader. The real reader, read result, worker and
      // PDF.js cancellation timer remain intact; no fake clocks or sleeps.
      const handler = internal._transport.messageHandler;
      const send = handler.sendWithStream.bind(handler);
      const intents: number[] = [];
      vi.spyOn(handler, 'sendWithStream').mockImplementation((name, data) => {
        const stream = send(name, data);
        if (name !== 'GetOperatorList') return stream;
        intents.push(data.intent);
        if (!(data.intent & 0x100)) {
          const getReader = stream.getReader.bind(stream);
          vi.spyOn(stream, 'getReader').mockImplementation(() => {
            const streamReader = getReader();
            const read = streamReader.read.bind(streamReader);
            vi.spyOn(streamReader, 'read').mockImplementation(async () => {
              const value = await read();
              await renderGate.promise;
              return value;
            });
            return streamReader;
          });
        }
        return stream;
      });
      const operators = page.getOperatorList({ intent: 'display' });
      await operatorChunk.promise;
      const imageId = await imageReady.promise;
      if (mode === 'prewarmed') {
        operatorGate.resolve();
        await operators;
      }
      expect(store.has(imageId)).toBe(true);
      const cleanup = page.cleanup.bind(page);
      const cleanupSpy = vi.spyOn(page, 'cleanup').mockImplementation(() => {
        const cleaned = cleanup();
        peerCleanup.resolve(cleaned);
        return cleaned;
      });
      const viewport = page.getViewport({ scale: 1 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const nativeError = new Error('native render setup failure');
      const task = page.render({
        canvas,
        viewport,
        intent: 'display',
        ...(outcome === 'error' ? { optionalContentConfigPromise: Promise.reject(nativeError) } : {}),
      });
      const settled = task.promise.catch((error: unknown) => error);
      if (outcome === 'cancel') task.cancel();
      const error = await settled;
      if (outcome === 'error') expect(error).toBe(nativeError);
      else expect(error).toMatchObject({ name: 'RenderingCancelledException' });
      expect(intents).toEqual([0x102, 0x02]);
      // Await the peer's own cleanup event, including its actual cancellation
      // timer. No package ever requested cleanup in this experiment.
      expect(await peerCleanup.promise).toBe(mode === 'prewarmed');
      expect(cleanupSpy).toHaveBeenCalledOnce();
      operatorGate.resolve();
      const list = await operators;
      const paintedIds = list.fnArray.flatMap((operator, index) =>
        operator === OPS.paintImageXObject ? [list.argsArray[index][0] as string] : [],
      );
      expect(paintedIds).toContain(imageId);
      // A list still held by its consumer now references an erased image, both
      // when it was pending during cancellation and when it was prewarmed.
      expect(store.has(imageId)).toBe(false);
    } finally {
      operatorGate.resolve();
      renderGate.resolve();
      await loading.destroy();
      canvas.width = 0;
      canvas.height = 0;
      vi.restoreAllMocks();
    }
  },
  60_000,
);
