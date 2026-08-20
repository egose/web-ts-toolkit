import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

const pdfjs = vi.hoisted(() => ({
  getDocument: vi.fn(),
  workerOptions: { workerSrc: '', workerPort: null as Worker | null },
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: pdfjs.getDocument,
  GlobalWorkerOptions: pdfjs.workerOptions,
  OPS: {
    save: 1,
    restore: 2,
    transform: 3,
    paintXObject: 4,
    paintImageXObject: 5,
    paintInlineImageXObject: 6,
    paintFormXObjectBegin: 7,
    paintFormXObjectEnd: 8,
    paintImageMaskXObject: 9,
  },
  Util: {
    transform: (left: number[], right: number[]) => [
      left[0] * right[0] + left[2] * right[1],
      left[1] * right[0] + left[3] * right[1],
      left[0] * right[2] + left[2] * right[3],
      left[1] * right[2] + left[3] * right[3],
      left[0] * right[4] + left[2] * right[5] + left[4],
      left[1] * right[4] + left[3] * right[5] + left[5],
    ],
  },
}));

import { configurePdfWorker, PDFReader, PdfReaderError, pdfUrlSource } from '../src';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

interface CanvasHarness {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

function createCanvasHarness(): CanvasHarness {
  const context = {
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    drawImage: vi.fn(),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn((mimeType: string) => `data:${mimeType};base64,page`),
    toBlob: vi.fn((callback: BlobCallback, mimeType?: string) =>
      callback(new Blob([mimeType ?? 'image/png'], { type: mimeType })),
    ),
  } as unknown as HTMLCanvasElement;
  return { canvas, context };
}

function createPdfHarness(options: { numPages?: number; renderPromise?: Promise<void> } = {}) {
  const viewport = { width: 200, height: 300, scale: 2 };
  const renderTask = {
    promise: options.renderPromise ?? Promise.resolve(),
    cancel: vi.fn(),
  } as unknown as RenderTask;
  const page = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      ...viewport,
      width: 100 * scale,
      height: 150 * scale,
      scale,
    })),
    getTextContent: vi.fn(async () => ({ items: [], styles: {}, lang: null })),
    getOperatorList: vi.fn(async () => ({ fnArray: [], argsArray: [] })),
    render: vi.fn(() => renderTask),
    cleanup: vi.fn(),
    objs: { get: vi.fn() },
  } as unknown as PDFPageProxy;
  const documentProxy = {
    numPages: options.numPages ?? 2,
    getPage: vi.fn(async () => page),
    destroy: vi.fn(async () => undefined),
  } as unknown as PDFDocumentProxy;
  const loadingTask = {
    promise: Promise.resolve(documentProxy),
    destroy: vi.fn(async () => undefined),
  } as unknown as PDFDocumentLoadingTask;
  pdfjs.getDocument.mockReturnValue(loadingTask);
  return { documentProxy, loadingTask, page, renderTask };
}

function createLoadHarness(options: { numPages?: number } = {}) {
  const deferred = createDeferred<PDFDocumentProxy>();
  const documentProxy = {
    numPages: options.numPages ?? 2,
    getPage: vi.fn(),
    destroy: vi.fn(async () => undefined),
  } as unknown as PDFDocumentProxy;
  const loadingTask = {
    promise: deferred.promise,
    destroy: vi.fn(async () => undefined),
  } as unknown as PDFDocumentLoadingTask;
  pdfjs.getDocument.mockReturnValue(loadingTask);
  return { deferred, documentProxy, loadingTask };
}

describe('PDFReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfjs.workerOptions.workerSrc = '';
    pdfjs.workerOptions.workerPort = null;
  });

  it('loads once, streams selected pages, and releases page and canvas resources', async () => {
    const pdf = createPdfHarness();
    const canvas = createCanvasHarness();
    const reader = new PDFReader(new Uint8Array([1, 2, 3]), { canvasFactory: () => canvas.canvas });

    const firstDocument = await reader.load();
    const secondDocument = await reader.load();
    const pages = await reader.convert({ pageRange: 2, imageFormat: 'image/jpeg', jpegQuality: 0.8 });

    expect(firstDocument).toBe(pdf.documentProxy);
    expect(secondDocument).toBe(pdf.documentProxy);
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);
    expect(pdf.documentProxy.getPage).toHaveBeenCalledWith(2);
    expect(pages[0]).toMatchObject({ pageNumber: 2, pageIndex: 1 });
    expect(pages[0]?.pageImage).toEqual({
      kind: 'data-url',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,page',
    });
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
    expect(canvas.canvas.width).toBe(0);
    expect(canvas.canvas.height).toBe(0);

    await reader.destroy();
    await reader.destroy();
    expect(pdf.documentProxy.destroy).toHaveBeenCalledOnce();
  });

  it('rejects unsafe page allocation before creating a canvas and still cleans up the page', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvasFactory = vi.fn(() => createCanvasHarness().canvas);
    const reader = new PDFReader(new Uint8Array([1]), {
      canvasFactory,
      limits: { maxCanvasPixels: 10 },
    });
    await reader.load();

    await expect(reader.convert()).rejects.toMatchObject({ code: 'CANVAS_LIMIT_EXCEEDED' });
    expect(canvasFactory).not.toHaveBeenCalled();
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
  });

  it('extracts RGB image data with its active transform', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [3, 5],
      argsArray: [[2, 0, 0, 3, 10, 20], ['image-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    vi.mocked(pdf.page.objs.get).mockReturnValue({
      width: 1,
      height: 1,
      data: new Uint8Array([10, 20, 30]),
      dataLen: 3,
    });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    const [page] = await reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true });

    expect(page?.images[0]).toMatchObject({
      dataUrl: 'data:image/png;base64,page',
      x: 10,
      y: 23,
      width: 2,
      height: 3,
      size: 3,
      transform: [2, 0, 0, 3, 10, 20],
    });
    expect(canvas.context.putImageData).toHaveBeenCalledOnce();
    expect(canvas.canvas.width).toBe(0);
  });

  it('applies nested form XObject matrices when extracting embedded images', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [7, 5, 8],
      argsArray: [
        [
          [2, 0, 0, 3, 1, 2],
          [0, 0, 1, 1],
        ],
        ['image-1'],
        null,
      ],
      lastChunk: true,
      separateAnnots: null,
    });
    vi.mocked(pdf.page.objs.get).mockReturnValue({
      width: 1,
      height: 1,
      data: new Uint8Array([255, 0, 0]),
      dataLen: 3,
    });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    const [page] = await reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true });

    expect(page?.images[0]).toMatchObject({
      x: 1,
      y: 5,
      width: 2,
      height: 3,
      transform: [2, 0, 0, 3, 1, 2],
    });
  });

  it('skips unsupported image-mask operators without aborting later embedded-image extraction', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    const logger = { warn: vi.fn() };
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [9, 5],
      argsArray: [[{ width: 1, height: 1 }], ['image-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    vi.mocked(pdf.page.objs.get).mockReturnValue({
      width: 1,
      height: 1,
      data: new Uint8Array([10, 20, 30]),
      dataLen: 3,
    });
    const reader = new PDFReader(new Uint8Array([1]), {
      canvasFactory: () => canvas.canvas,
      logger,
    });
    await reader.load();

    const [page] = await reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true });

    expect(page?.images).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Skipped embedded image operator paintImageMaskXObject: image masks are not supported.',
      undefined,
    );
  });

  it('supports blob page output and releases the canvas after async encoding', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    const [page] = await reader.convert({ pageImageOutput: 'blob', imageFormat: 'image/jpeg' });

    expect(page?.pageImage?.kind).toBe('blob');
    expect(page?.pageImage?.mimeType).toBe('image/jpeg');
    expect(page?.pageImage && 'blob' in page.pageImage ? await page.pageImage.blob.text() : '').toBe('image/jpeg');
    expect(canvas.canvas.toBlob).toHaveBeenCalledOnce();
    expect(canvas.canvas.toDataURL).not.toHaveBeenCalled();
    expect(canvas.canvas.width).toBe(0);
    expect(canvas.canvas.height).toBe(0);
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
  });

  it('releases the canvas when blob encoding returns null', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    canvas.canvas.toBlob = vi.fn((callback: BlobCallback) => callback(null));
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    await expect(reader.convert({ pageImageOutput: 'blob' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_ENVIRONMENT',
      message: 'Canvas Blob encoding returned null for image/png.',
    });
    expect(canvas.canvas.width).toBe(0);
    expect(canvas.canvas.height).toBe(0);
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
  });

  it('normalizes unsupported canvas implementations with structured errors', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    canvas.canvas.getContext = vi.fn(() => null);
    canvas.canvas.toBlob = undefined as unknown as HTMLCanvasElement['toBlob'];
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    await expect(reader.convert()).rejects.toMatchObject({
      code: 'UNSUPPORTED_ENVIRONMENT',
      message: 'Failed to create a 2D canvas context for page 1.',
    });
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();

    const pdfBlob = createPdfHarness({ numPages: 1 });
    const blobCanvas = createCanvasHarness();
    blobCanvas.canvas.toBlob = undefined as unknown as HTMLCanvasElement['toBlob'];
    const blobReader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => blobCanvas.canvas });
    await blobReader.load();

    await expect(blobReader.convert({ pageImageOutput: 'blob' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_ENVIRONMENT',
      message: 'Canvas Blob encoding is not supported by this canvas implementation.',
    });
    expect(pdfBlob.page.cleanup).toHaveBeenCalledOnce();
  });

  it('validates page ranges and document page limits with structured errors', async () => {
    const oversized = createPdfHarness({ numPages: 4 });
    const reader = new PDFReader(new Uint8Array([1]), { limits: { maxDocumentPages: 3 } });

    await expect(reader.load()).rejects.toMatchObject({ code: 'PAGE_LIMIT_EXCEEDED' });
    expect(oversized.documentProxy.destroy).toHaveBeenCalledOnce();

    createPdfHarness();
    const validReader = new PDFReader(new Uint8Array([1]));
    await validReader.load();
    await expect(validReader.convert({ pageRange: [0, 1] })).rejects.toBeInstanceOf(PdfReaderError);
    await expect(validReader.convert({ jpegQuality: Number.NaN })).rejects.toMatchObject({ code: 'INVALID_OPTION' });
  });

  it('rejects oversized known source bytes before PDF.js starts loading', async () => {
    const reader = new PDFReader(new Uint8Array([1, 2, 3]), {
      limits: { maxSourceBytes: 2 },
    });

    await expect(reader.load()).rejects.toMatchObject({ code: 'SOURCE_LIMIT_EXCEEDED' }); // pragma: allowlist secret
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  it('rejects denied URL sources before PDF.js network work starts and exposes normalized policy data', async () => {
    const source = {
      url: 'https://example.com/private.pdf',
      withCredentials: true,
      httpHeaders: { Authorization: 'Bearer secret' },
      password: 'secret-password', // pragma: allowlist secret
    };
    const sourcePolicy = vi.fn((info) => {
      expect(info).toMatchObject({
        kind: 'document-init-parameters',
        url: 'https://example.com/private.pdf',
        hasHttpHeaders: true,
        httpHeaders: { Authorization: 'Bearer secret' },
        withCredentials: true,
      });
      throw new Error('denied');
    });
    const reader = new PDFReader(source as never, { sourcePolicy });

    await expect(reader.load()).rejects.toMatchObject({ code: 'SOURCE_POLICY_VIOLATION' });
    expect(sourcePolicy).toHaveBeenCalledOnce(); // pragma: allowlist secret
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  it('creates constructor-ready PDF URL sources with PDF.js loading options', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const source = pdfUrlSource(new URL('https://example.com/public.pdf'), {
      withCredentials: true,
      httpHeaders: { Authorization: 'Bearer secret' },
      password: 'secret-password', // pragma: allowlist secret
    });
    const sourcePolicy = vi.fn();
    const reader = new PDFReader(source, { sourcePolicy });

    await expect(reader.load()).resolves.toBe(pdf.documentProxy);
    expect(source).toMatchObject({
      url: new URL('https://example.com/public.pdf'),
      withCredentials: true,
      httpHeaders: { Authorization: 'Bearer secret' },
      password: 'secret-password', // pragma: allowlist secret
    });
    expect(sourcePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'document-init-parameters',
        url: 'https://example.com/public.pdf',
        hasHttpHeaders: true,
        withCredentials: true,
      }),
    );
    expect(pdfjs.getDocument).toHaveBeenCalledWith(source);
  });

  it('passes allowed loading parameters through unchanged after source policy approval', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const worker = {};
    const source = {
      data: new Uint8Array([1, 2, 3]),
      password: 'open-sesame', // pragma: allowlist secret
      cMapUrl: '/cmaps/',
      standardFontDataUrl: '/standard-fonts/',
      wasmUrl: '/wasm/',
      worker,
    };
    const sourcePolicy = vi.fn();
    const reader = new PDFReader(source as never, { sourcePolicy });

    await expect(reader.load()).resolves.toBe(pdf.documentProxy);
    expect(sourcePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'document-init-parameters',
        byteLength: 3,
        withCredentials: false,
        hasHttpHeaders: false,
      }),
    );
    expect(pdfjs.getDocument).toHaveBeenCalledWith(source);
  });

  it('rejects invalid load deadlines synchronously', () => {
    const reader = new PDFReader(new Uint8Array([1]));

    try {
      reader.load({ deadlineMs: 0 });
      throw new Error('expected load() to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_OPTION' });
    }
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  it('clears load deadline timers when the shared load succeeds', async () => {
    vi.useFakeTimers();
    const pdf = createLoadHarness();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const reader = new PDFReader(new Uint8Array([1]));

    try {
      const loading = reader.load({ deadlineMs: 50 });
      pdf.deferred.resolve(pdf.documentProxy);
      await vi.runAllTimersAsync();

      await expect(loading).resolves.toBe(pdf.documentProxy);
      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects only the timed-out load caller and clears abort listeners', async () => {
    vi.useFakeTimers();
    const pdf = createLoadHarness();
    const reader = new PDFReader(new Uint8Array([1]));
    const controller = new AbortController();
    const addEventListenerSpy = vi.spyOn(controller.signal, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(controller.signal, 'removeEventListener');

    try {
      const timedOut = reader.load({ deadlineMs: 10, signal: controller.signal });
      const waiting = reader.load();
      const timedOutExpectation = expect(timedOut).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' });

      await vi.advanceTimersByTimeAsync(10);
      await timedOutExpectation;
      expect(addEventListenerSpy).toHaveBeenCalledOnce();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function));

      pdf.deferred.resolve(pdf.documentProxy);
      await expect(waiting).resolves.toBe(pdf.documentProxy);
      expect(pdf.loadingTask.destroy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears load deadline timers when destroy wins the race', async () => {
    vi.useFakeTimers();
    const pdf = createLoadHarness();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const reader = new PDFReader(new Uint8Array([1]));

    try {
      const loading = reader.load({ deadlineMs: 100 });
      const destroying = reader.destroy();
      const loadingExpectation = expect(loading).rejects.toMatchObject({ code: 'DESTROYED' });
      pdf.deferred.reject(new Error('pdf.js cancelled load'));
      await vi.runAllTimersAsync();

      await loadingExpectation;
      await expect(destroying).resolves.toBeUndefined();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels an active render when the caller aborts', async () => {
    let settleRender: (() => void) | undefined;
    const renderPromise = new Promise<void>((resolve) => {
      settleRender = resolve;
    });
    const pdf = createPdfHarness({ renderPromise });
    const canvas = createCanvasHarness();
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    const controller = new AbortController();
    await reader.load();

    const converting = reader.convert({ signal: controller.signal });
    await vi.waitFor(() => expect(pdf.page.render).toHaveBeenCalledOnce());
    controller.abort();
    settleRender?.();

    await expect(converting).rejects.toMatchObject({ code: 'ABORTED' });
    expect(pdf.renderTask.cancel).toHaveBeenCalledOnce();
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
    expect(canvas.canvas.width).toBe(0);
  });

  it('rejects blob encoding with ABORTED and ignores a late blob callback', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    let resolveBlob!: (blob: Blob | null) => void;
    canvas.canvas.toBlob = vi.fn((callback: BlobCallback) => {
      resolveBlob = callback;
    });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    const controller = new AbortController();
    await reader.load();

    const converting = reader.convert({ pageImageOutput: 'blob', signal: controller.signal });
    await vi.waitFor(() => expect(canvas.canvas.toBlob).toHaveBeenCalledOnce());
    controller.abort();
    resolveBlob(new Blob(['late'], { type: 'image/png' }));

    await expect(converting).rejects.toMatchObject({ code: 'ABORTED' });
    expect(canvas.canvas.width).toBe(0);
    expect(canvas.canvas.height).toBe(0);
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
  });

  it('keeps one aborted load caller from destroying a concurrent shared load', async () => {
    const pdf = createLoadHarness();
    const reader = new PDFReader(new Uint8Array([1]));
    const aborted = new AbortController();

    const firstLoad = reader.load(aborted.signal);
    const secondLoad = reader.load();

    aborted.abort();
    await expect(firstLoad).rejects.toMatchObject({ code: 'ABORTED' });
    expect(pdf.loadingTask.destroy).not.toHaveBeenCalled();

    pdf.deferred.resolve(pdf.documentProxy);
    await expect(secondLoad).resolves.toBe(pdf.documentProxy);
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);
    expect(reader.numPages).toBe(2);
  });

  it('destroys the shared loading task exactly once and rejects all load waiters when destroy races with load', async () => {
    const pdf = createLoadHarness();
    const reader = new PDFReader(new Uint8Array([1]));

    const firstLoad = reader.load();
    const secondLoad = reader.load();
    const firstLoadExpectation = expect(firstLoad).rejects.toMatchObject({ code: 'DESTROYED' });
    const secondLoadExpectation = expect(secondLoad).rejects.toMatchObject({ code: 'DESTROYED' });

    const destroying = reader.destroy();
    pdf.deferred.reject(new Error('pdf.js cancelled load'));

    await firstLoadExpectation;
    await secondLoadExpectation;
    await expect(destroying).resolves.toBeUndefined();
    expect(pdf.loadingTask.destroy).toHaveBeenCalledOnce();
    expect(reader.numPages).toBeUndefined();
  });

  it('cleans up the yielded page before early iterator return', async () => {
    const pdf = createPdfHarness({ numPages: 2 });
    const reader = new PDFReader(new Uint8Array([1]));
    await reader.load();

    const iterator = reader.pages({ includePageImage: false, includeText: false });
    const first = await iterator.next();

    expect(first.done).toBe(false);
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();

    await iterator.return(undefined);
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
  });

  it('cleans up the current page exactly once when the consumer throws', async () => {
    const pdf = createPdfHarness({ numPages: 2 });
    const reader = new PDFReader(new Uint8Array([1]));
    await reader.load();

    await expect(
      (async () => {
        for await (const page of reader.pages({ includePageImage: false, includeText: false })) {
          expect(page.pageNumber).toBe(1);
          throw new Error('stop after first page');
        }
      })(),
    ).rejects.toThrow('stop after first page');

    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
  });

  it('cancels active rendering and normalizes destroy races to DESTROYED', async () => {
    const render = createDeferred<void>();
    const pdf = createPdfHarness({ renderPromise: render.promise });
    const canvas = createCanvasHarness();
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    const converting = reader.convert({ signal: new AbortController().signal });
    await vi.waitFor(() => expect(pdf.page.render).toHaveBeenCalledOnce());

    const destroying = reader.destroy();
    const convertingExpectation = expect(converting).rejects.toMatchObject({ code: 'DESTROYED' });
    render.reject(new Error('render cancelled by destroy'));

    await convertingExpectation;
    await expect(destroying).resolves.toBeUndefined();
    expect(pdf.renderTask.cancel).toHaveBeenCalledOnce();
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
    expect(pdf.documentProxy.destroy).toHaveBeenCalledOnce();
    expect(canvas.canvas.width).toBe(0);
    expect(canvas.canvas.height).toBe(0);
  });

  it('reports lifecycle state transitions across failure, retry, iteration, and destroy', async () => {
    const canvas = createCanvasHarness();
    const failedLoad = createLoadHarness();
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });

    expect(reader.state).toBe('new');
    const firstLoad = reader.load();
    expect(reader.state).toBe('loading');

    failedLoad.deferred.reject(new Error('malformed pdf'));
    await expect(firstLoad).rejects.toThrow('malformed pdf');
    expect(reader.state).toBe('failed');

    const render = createDeferred<void>();
    const loadedPdf = createPdfHarness({ numPages: 1, renderPromise: render.promise });
    const retryLoad = reader.load();
    expect(reader.state).toBe('loading');
    await expect(retryLoad).resolves.toBe(loadedPdf.documentProxy);
    expect(reader.state).toBe('loaded');

    const converting = reader.convert({ includeText: false, includeEmbeddedImages: false, includePageImage: true });
    await vi.waitFor(() => expect(loadedPdf.page.render).toHaveBeenCalledOnce());
    expect(reader.state).toBe('iterating');

    render.resolve();
    await expect(converting).resolves.toHaveLength(1);
    expect(reader.state).toBe('loaded');

    await reader.destroy();
    expect(reader.state).toBe('destroyed');
  });
});

describe('configurePdfWorker', () => {
  it('accepts worker URLs and existing workers without module-load mutation', () => {
    expect(pdfjs.workerOptions).toEqual({ workerSrc: '', workerPort: null });
    configurePdfWorker('/assets/pdf.worker.mjs');
    expect(pdfjs.workerOptions.workerSrc).toBe('/assets/pdf.worker.mjs');
    expect(pdfjs.workerOptions.workerPort).toBeNull();

    const worker = {} as Worker;
    configurePdfWorker(worker);
    expect(pdfjs.workerOptions.workerSrc).toBe('');
    expect(pdfjs.workerOptions.workerPort).toBe(worker);

    configurePdfWorker('/assets/pdf.worker.next.mjs');
    expect(pdfjs.workerOptions.workerSrc).toBe('/assets/pdf.worker.next.mjs');
    expect(pdfjs.workerOptions.workerPort).toBeNull();
  });
});
