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
import { resolveLimits } from '../src/PDFReader';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

/** Resizable `ArrayBuffer`s need V8 support for the `maxByteLength` option. */
function supportsResizableArrayBuffer(): boolean {
  try {
    const buffer = new ArrayBuffer(1, { maxByteLength: 4 });
    return typeof buffer.resize === 'function';
  } catch {
    return false;
  }
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
    expect(pdf.loadingTask.destroy).toHaveBeenCalledOnce();
  });

  it('characterizes externally destroyed borrowed document proxies as unsupported', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const reader = new PDFReader(new Uint8Array([1]));
    const documentProxy = await reader.load();
    const externalDestroyError = new Error('PDF.js document proxy was destroyed externally');

    vi.mocked(pdf.documentProxy.destroy).mockImplementation(async () => {
      vi.mocked(pdf.documentProxy.getPage).mockRejectedValue(externalDestroyError);
    });

    await documentProxy.destroy();

    expect(reader.state).toBe('loaded');
    await expect(reader.convert({ includePageImage: false, includeText: false })).rejects.toBe(externalDestroyError);
    expect(reader.state).toBe('loaded');

    await reader.destroy();
    expect(pdf.loadingTask.destroy).toHaveBeenCalledOnce();
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

  it('decodes a one-bit white pixel by kind instead of guessing gray from its length', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [5],
      argsArray: [['image-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    // GRAYSCALE_1BPP packed bit 1 = white. The old length-inferred path read
    // this single 0x80 byte as an 8-bit gray intensity of 128.
    vi.mocked(pdf.page.objs.get).mockReturnValue({
      width: 1,
      height: 1,
      kind: 1,
      data: new Uint8Array([0x80]),
      dataLen: 1,
    });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    const [page] = await reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true });

    expect(page?.images).toHaveLength(1);
    const painted = vi.mocked(canvas.context.putImageData).mock.calls[0]?.[0] as unknown as {
      data: Uint8ClampedArray;
    };
    expect(Array.from(painted.data)).toEqual([255, 255, 255, 255]);
  });

  it('unpacks one-bit rows with padding bits for widths not divisible by eight', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [5],
      argsArray: [['image-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    // 9x2 needs ceil(9/8) = 2 bytes per row. Row 0 is W,B,W,B,W,B,W,B,W
    // (0xAA 0x80); row 1 is B,W,B,W,B,W,B,W,B (0x55 0x00).
    vi.mocked(pdf.page.objs.get).mockReturnValue({
      width: 9,
      height: 2,
      kind: 1,
      data: new Uint8Array([0xaa, 0x80, 0x55, 0x00]),
      dataLen: 4,
    });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    const [page] = await reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true });

    expect(page?.images).toHaveLength(1);
    const painted = vi.mocked(canvas.context.putImageData).mock.calls[0]?.[0] as unknown as {
      data: Uint8ClampedArray;
    };
    const white = [255, 255, 255, 255];
    const black = [0, 0, 0, 255];
    expect(Array.from(painted.data)).toEqual([
      ...white,
      ...black,
      ...white,
      ...black,
      ...white,
      ...black,
      ...white,
      ...black,
      ...white,
      ...black,
      ...white,
      ...black,
      ...white,
      ...black,
      ...white,
      ...black,
      ...white,
      ...black,
    ]);
  });

  it('expands declared RGB/RGBA kinds to correct pixels including alpha', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [5, 5],
      argsArray: [['rgb-1'], ['rgba-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    vi.mocked(pdf.page.objs.get).mockImplementation((reference: string) =>
      reference === 'rgb-1'
        ? { width: 2, height: 1, kind: 2, data: new Uint8Array([255, 0, 0, 0, 255, 0]), dataLen: 6 }
        : { width: 1, height: 1, kind: 3, data: new Uint8Array([10, 20, 30, 40]), dataLen: 4 },
    );
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    const [page] = await reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true });

    expect(page?.images).toHaveLength(2);
    const calls = vi.mocked(canvas.context.putImageData).mock.calls;
    expect(Array.from((calls[0]?.[0] as unknown as { data: Uint8ClampedArray }).data)).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255,
    ]);
    expect(Array.from((calls[1]?.[0] as unknown as { data: Uint8ClampedArray }).data)).toEqual([10, 20, 30, 40]);
  });

  it('skips malformed one-bit lengths without allocating a conversion canvas', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    const canvasFactory = vi.fn(() => canvas.canvas);
    const logger = { warn: vi.fn() };
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [5],
      argsArray: [['image-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    // 9x2 needs 4 packed bytes; only 3 are present.
    vi.mocked(pdf.page.objs.get).mockReturnValue({
      width: 9,
      height: 2,
      kind: 1,
      data: new Uint8Array([0xaa, 0x80, 0x55]),
      dataLen: 3,
    });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory, logger });
    await reader.load();

    const [page] = await reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true });

    expect(page?.images).toHaveLength(0);
    expect(canvasFactory).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Skipped embedded image image-1: unsupported PDF.js image shape or data layout.',
      undefined,
    );
  });

  it('skips unsupported image kinds without allocating a conversion canvas', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    const canvasFactory = vi.fn(() => canvas.canvas);
    const logger = { warn: vi.fn() };
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [5],
      argsArray: [['image-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    vi.mocked(pdf.page.objs.get).mockReturnValue({
      width: 1,
      height: 1,
      kind: 99,
      data: new Uint8Array([1, 2, 3, 4]),
      dataLen: 4,
    });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory, logger });
    await reader.load();

    const [page] = await reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true });

    expect(page?.images).toHaveLength(0);
    expect(canvasFactory).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Skipped embedded image image-1: unsupported PDF.js image shape or data layout.',
      undefined,
    );
  });

  it('draws borrowed bitmaps without closing them', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    const previousImageBitmap = (globalThis as Record<string, unknown>).ImageBitmap;
    class FakeImageBitmap {
      close = vi.fn();
    }
    (globalThis as Record<string, unknown>).ImageBitmap = FakeImageBitmap;
    try {
      const bitmap = new FakeImageBitmap();
      vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
        fnArray: [5],
        argsArray: [['image-1']],
        lastChunk: true,
        separateAnnots: null,
      });
      vi.mocked(pdf.page.objs.get).mockReturnValue({ width: 1, height: 1, bitmap });
      const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
      await reader.load();

      const [page] = await reader.convert({
        includePageImage: false,
        includeText: false,
        includeEmbeddedImages: true,
      });

      expect(page?.images).toHaveLength(1);
      expect(canvas.context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
      expect(bitmap.close).not.toHaveBeenCalled();
    } finally {
      if (previousImageBitmap === undefined) delete (globalThis as Record<string, unknown>).ImageBitmap;
      else (globalThis as Record<string, unknown>).ImageBitmap = previousImageBitmap;
    }
  });

  it('encodes repeated image XObject references once while preserving each placement', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    vi.mocked(canvas.canvas.toDataURL).mockReturnValue('data:image/png;base64,reused');
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [1, 3, 5, 2, 1, 3, 5, 2],
      argsArray: [null, [2, 0, 0, 3, 10, 20], ['image-1'], null, null, [4, 0, 0, 5, 30, 40], ['image-1'], null],
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

    expect(page?.images).toHaveLength(2);
    expect(page?.images.map((image) => image.dataUrl)).toEqual([
      'data:image/png;base64,reused',
      'data:image/png;base64,reused',
    ]);
    expect(page?.images.map((image) => image.transform)).toEqual([
      [2, 0, 0, 3, 10, 20],
      [4, 0, 0, 5, 30, 40],
    ]);
    expect(page?.images.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 10, y: 23, width: 2, height: 3 },
      { x: 30, y: 45, width: 4, height: 5 },
    ]);
    expect(pdf.page.objs.get).toHaveBeenCalledOnce();
    expect(canvas.context.putImageData).toHaveBeenCalledOnce();
    expect(canvas.canvas.toDataURL).toHaveBeenCalledOnce();
    expect(canvas.canvas.width).toBe(0);
  });

  it('does not cache inline image encoding by synthetic keys', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    vi.mocked(canvas.canvas.toDataURL)
      .mockReturnValueOnce('data:image/png;base64,inline-1')
      .mockReturnValueOnce('data:image/png;base64,inline-2');
    const inlineImage = { width: 1, height: 1, data: new Uint8Array([10, 20, 30]), dataLen: 3 };
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [6, 6],
      argsArray: [[inlineImage], [inlineImage]],
      lastChunk: true,
      separateAnnots: null,
    });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    const [page] = await reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true });

    expect(page?.images.map((image) => image.dataUrl)).toEqual([
      'data:image/png;base64,inline-1',
      'data:image/png;base64,inline-2',
    ]);
    expect(canvas.context.putImageData).toHaveBeenCalledTimes(2);
    expect(canvas.canvas.toDataURL).toHaveBeenCalledTimes(2);
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

  it('enforces text item and string-code-unit limits after PDF.js returns text content', async () => {
    const exact = createPdfHarness({ numPages: 1 });
    vi.mocked(exact.page.getTextContent).mockResolvedValue({
      items: [{ str: 'abc' }, { str: 'de' }],
      styles: {},
      lang: null,
    } as never);
    const exactReader = new PDFReader(new Uint8Array([1]), {
      limits: { maxTextItems: 2, maxTextCodeUnits: 5 },
    });
    await exactReader.load();

    await expect(exactReader.convert({ includePageImage: false, includeEmbeddedImages: false })).resolves.toHaveLength(
      1,
    );
    expect(exact.page.cleanup).toHaveBeenCalledOnce();

    const tooManyItems = createPdfHarness({ numPages: 1 });
    vi.mocked(tooManyItems.page.getTextContent).mockResolvedValue({
      items: [{ str: 'a' }, { str: 'b' }, { str: 'c' }],
      styles: {},
      lang: null,
    } as never);
    const itemReader = new PDFReader(new Uint8Array([1]), { limits: { maxTextItems: 2 } });
    await itemReader.load();

    await expect(itemReader.convert({ includePageImage: false, includeEmbeddedImages: false })).rejects.toMatchObject({
      code: 'TEXT_LIMIT_EXCEEDED',
    });
    expect(tooManyItems.page.cleanup).toHaveBeenCalledOnce();

    const tooManyCodeUnits = createPdfHarness({ numPages: 1 });
    vi.mocked(tooManyCodeUnits.page.getTextContent).mockResolvedValue({
      items: [{ str: 'abc' }, { str: 'def' }],
      styles: {},
      lang: null,
    } as never);
    const codeUnitReader = new PDFReader(new Uint8Array([1]), { limits: { maxTextCodeUnits: 5 } });
    await codeUnitReader.load();

    await expect(
      codeUnitReader.convert({ includePageImage: false, includeEmbeddedImages: false }),
    ).rejects.toMatchObject({
      code: 'TEXT_LIMIT_EXCEEDED',
    });
    expect(tooManyCodeUnits.page.cleanup).toHaveBeenCalledOnce();
  });

  it('enforces operator count before traversing embedded-image operators', async () => {
    const exact = createPdfHarness({ numPages: 1 });
    vi.mocked(exact.page.getOperatorList).mockResolvedValue({
      fnArray: [3, 3],
      argsArray: [null, null],
      lastChunk: true,
      separateAnnots: null,
    });
    const exactReader = new PDFReader(new Uint8Array([1]), { limits: { maxOperatorCount: 2 } });
    await exactReader.load();
    await expect(
      exactReader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true }),
    ).resolves.toHaveLength(1);

    const overLimit = createPdfHarness({ numPages: 1 });
    const canvasFactory = vi.fn(() => createCanvasHarness().canvas);
    vi.mocked(overLimit.page.getOperatorList).mockResolvedValue({
      fnArray: [3, 3, 5],
      argsArray: [null, null, ['image-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    const reader = new PDFReader(new Uint8Array([1]), {
      canvasFactory,
      limits: { maxOperatorCount: 2 },
    });
    await reader.load();

    await expect(
      reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true }),
    ).rejects.toMatchObject({ code: 'OPERATOR_LIMIT_EXCEEDED' });
    expect(overLimit.page.objs.get).not.toHaveBeenCalled();
    expect(canvasFactory).not.toHaveBeenCalled();
    expect(overLimit.page.cleanup).toHaveBeenCalledOnce();
  });

  it('enforces extracted-image count before allocating the next embedded-image canvas', async () => {
    const exact = createPdfHarness({ numPages: 1 });
    vi.mocked(exact.page.getOperatorList).mockResolvedValue({
      fnArray: [5, 5],
      argsArray: [['image-1'], ['image-2']],
      lastChunk: true,
      separateAnnots: null,
    });
    vi.mocked(exact.page.objs.get).mockImplementation((reference: string) => ({
      width: 1,
      height: 1,
      data: new Uint8Array(reference === 'image-1' ? [10, 20, 30] : [40, 50, 60]),
      dataLen: 3,
    }));
    const exactReader = new PDFReader(new Uint8Array([1]), {
      canvasFactory: () => createCanvasHarness().canvas,
      limits: { maxEmbeddedImages: 2 },
    });
    await exactReader.load();
    await expect(
      exactReader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true }),
    ).resolves.toMatchObject([{ images: [{}, {}] }]);

    const overLimit = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    const canvasFactory = vi.fn(() => canvas.canvas);
    vi.mocked(overLimit.page.getOperatorList).mockResolvedValue({
      fnArray: [5, 5],
      argsArray: [['image-1'], ['image-2']],
      lastChunk: true,
      separateAnnots: null,
    });
    vi.mocked(overLimit.page.objs.get).mockReturnValue({ width: 1, height: 1, data: new Uint8Array([10, 20, 30]) });
    const reader = new PDFReader(new Uint8Array([1]), {
      canvasFactory,
      limits: { maxEmbeddedImages: 1 },
    });
    await reader.load();

    await expect(
      reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true }),
    ).rejects.toMatchObject({ code: 'IMAGE_COUNT_LIMIT_EXCEEDED' });
    expect(canvasFactory).toHaveBeenCalledOnce();
    expect(canvas.canvas.toDataURL).toHaveBeenCalledOnce();
    expect(overLimit.page.cleanup).toHaveBeenCalledOnce();
  });

  it('enforces aggregate decoded embedded-image pixels for repeated valid image operators', async () => {
    const exact = createPdfHarness({ numPages: 1 });
    vi.mocked(exact.page.getOperatorList).mockResolvedValue({
      fnArray: [5, 5],
      argsArray: [['image-1'], ['image-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    vi.mocked(exact.page.objs.get).mockReturnValue({
      width: 1,
      height: 2,
      data: new Uint8Array([10, 20, 30, 40, 50, 60]),
    });
    const exactReader = new PDFReader(new Uint8Array([1]), {
      canvasFactory: () => createCanvasHarness().canvas,
      limits: { maxEmbeddedImagePixels: 2, maxEmbeddedImagePixelsTotal: 4 },
    });
    await exactReader.load();
    await expect(
      exactReader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true }),
    ).resolves.toMatchObject([{ images: [{}, {}] }]);

    const overLimit = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    const canvasFactory = vi.fn(() => canvas.canvas);
    vi.mocked(overLimit.page.getOperatorList).mockResolvedValue({
      fnArray: [5, 5],
      argsArray: [['image-1'], ['image-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    vi.mocked(overLimit.page.objs.get).mockReturnValue({
      width: 1,
      height: 2,
      data: new Uint8Array([10, 20, 30, 40, 50, 60]),
    });
    const reader = new PDFReader(new Uint8Array([1]), {
      canvasFactory,
      limits: { maxEmbeddedImagePixels: 2, maxEmbeddedImagePixelsTotal: 3 },
    });
    await reader.load();

    await expect(
      reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true }),
    ).rejects.toMatchObject({ code: 'IMAGE_TOTAL_PIXELS_LIMIT_EXCEEDED' });
    expect(canvasFactory).toHaveBeenCalledOnce();
    expect(canvas.canvas.toDataURL).toHaveBeenCalledOnce();
    expect(overLimit.page.cleanup).toHaveBeenCalledOnce();
  });

  it('fails closed on unsafe embedded-image dimensions before canvas allocation', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvasFactory = vi.fn(() => createCanvasHarness().canvas);
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [5],
      argsArray: [['image-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    vi.mocked(pdf.page.objs.get).mockReturnValue({
      width: Number.POSITIVE_INFINITY,
      height: 1,
      data: new Uint8Array([1]),
    });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory });
    await reader.load();

    await expect(
      reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true }),
    ).rejects.toMatchObject({ code: 'IMAGE_LIMIT_EXCEEDED' });
    expect(canvasFactory).not.toHaveBeenCalled();
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
  });

  it('propagates embedded-image extraction aborts before the next canvas allocation', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvasFactory = vi.fn(() => createCanvasHarness().canvas);
    const controller = new AbortController();
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({
      fnArray: [5],
      argsArray: [['image-1']],
      lastChunk: true,
      separateAnnots: null,
    });
    vi.mocked(pdf.page.objs.get).mockImplementation(() => {
      controller.abort();
      return { width: 1, height: 1, data: new Uint8Array([10, 20, 30]) };
    });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory });
    await reader.load();

    await expect(
      reader.convert({
        includePageImage: false,
        includeText: false,
        includeEmbeddedImages: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    expect(canvasFactory).not.toHaveBeenCalled();
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
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
    vi.mocked(oversized.loadingTask.destroy).mockRejectedValue(new Error('cleanup failed'));
    const reader = new PDFReader(new Uint8Array([1]), { limits: { maxDocumentPages: 3 } });

    await expect(reader.load()).rejects.toMatchObject({ code: 'PAGE_LIMIT_EXCEEDED' });
    expect(oversized.loadingTask.destroy).toHaveBeenCalledOnce();

    createPdfHarness();
    const validReader = new PDFReader(new Uint8Array([1]));
    await validReader.load();
    await expect(validReader.convert({ pageRange: [0, 1] })).rejects.toBeInstanceOf(PdfReaderError);
    await expect(validReader.convert({ jpegQuality: Number.NaN })).rejects.toMatchObject({ code: 'INVALID_OPTION' });
  });

  it('destroys a failed PDF.js loading task once, preserves the PDF.js error, and permits retry', async () => {
    const failed = createLoadHarness();
    const reader = new PDFReader(new Uint8Array([1]));
    const pdfJsError = new Error('PasswordException: no password');
    vi.mocked(failed.loadingTask.destroy).mockRejectedValue(new Error('cleanup failed'));

    const firstLoad = reader.load();
    failed.deferred.reject(pdfJsError);

    await expect(firstLoad).rejects.toBe(pdfJsError);
    expect(failed.loadingTask.destroy).toHaveBeenCalledOnce();
    expect(reader.state).toBe('failed');

    const retry = createPdfHarness({ numPages: 1 });
    await expect(reader.load()).resolves.toBe(retry.documentProxy);
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(2);
    expect(failed.loadingTask.destroy).toHaveBeenCalledOnce();
  });

  it('clears synchronous policy rejections and retries with a fresh task', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    let calls = 0;
    const sourcePolicy = vi.fn(() => {
      calls += 1;
      if (calls === 1) throw new Error('deny once');
    });
    const reader = new PDFReader(new Uint8Array([1]), { sourcePolicy });

    await expect(reader.load()).rejects.toMatchObject({ code: 'SOURCE_POLICY_VIOLATION' });
    expect(reader.state).toBe('failed');
    expect(pdfjs.getDocument).not.toHaveBeenCalled();

    await expect(reader.load()).resolves.toBe(pdf.documentProxy);
    expect(sourcePolicy).toHaveBeenCalledTimes(2);
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);
    expect(reader.state).toBe('loaded');
  });

  it('shares one loading task when source policy synchronously reenters load', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    let reentrantState: string | undefined;
    let reentrantPromise: Promise<unknown> | undefined;
    const sourcePolicy = vi.fn(() => {
      const readerRef = readerHolder.reader;
      reentrantState = readerRef?.state;
      reentrantPromise = readerRef?.load();
    });
    const readerHolder: { reader?: PDFReader } = {};
    const reader = new PDFReader(new Uint8Array([1]), { sourcePolicy });
    readerHolder.reader = reader;

    const firstLoad = reader.load();
    const secondLoad = reader.load();
    await expect(firstLoad).resolves.toBe(pdf.documentProxy);
    await expect(secondLoad).resolves.toBe(pdf.documentProxy);
    await expect(reentrantPromise).resolves.toBe(pdf.documentProxy);

    expect(sourcePolicy).toHaveBeenCalledTimes(1);
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);
    expect(reentrantState).toBe('loading');
    expect(reader.state).toBe('loaded');
  });

  it('clears synchronous getDocument failures and preserves the original error', async () => {
    const syncError = new Error('sync getDocument boom');
    pdfjs.getDocument.mockImplementationOnce(() => {
      throw syncError;
    });
    const reader = new PDFReader(new Uint8Array([1]));

    await expect(reader.load()).rejects.toBe(syncError);
    expect(reader.state).toBe('failed');

    const retry = createPdfHarness({ numPages: 1 });
    await expect(reader.load()).resolves.toBe(retry.documentProxy);
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(2);
    expect(reader.state).toBe('loaded');
  });

  it('reports synchronous known-size and snapshot failures as failed', async () => {
    const oversized = new PDFReader(new Uint8Array([1, 2, 3]), {
      limits: { maxSourceBytes: 2 },
    });
    await expect(oversized.load()).rejects.toMatchObject({ code: 'SOURCE_LIMIT_EXCEEDED' });
    expect(oversized.state).toBe('failed');
    expect(pdfjs.getDocument).not.toHaveBeenCalled();

    const throwingSource = {
      get url() {
        throw new Error('snapshot boom');
      },
    };
    const snapshotReader = new PDFReader(throwingSource as never);
    await expect(snapshotReader.load()).rejects.toThrow('snapshot boom');
    expect(snapshotReader.state).toBe('failed');
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  it('rejects oversized known source bytes before PDF.js starts loading', async () => {
    const reader = new PDFReader(new Uint8Array([1, 2, 3]), {
      limits: { maxSourceBytes: 2 },
    });

    await expect(reader.load()).rejects.toMatchObject({ code: 'SOURCE_LIMIT_EXCEEDED' }); // pragma: allowlist secret
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  it('counts binary strings as PDF.js bytes with exact and one-over limits', async () => {
    // PDF.js converts binary strings with stringToBytes: one byte per code
    // unit (charCodeAt & 0xff). The package limit uses the same definition.
    const exact = createPdfHarness({ numPages: 1 });
    const exactReader = new PDFReader({ data: '12' } as never, { limits: { maxSourceBytes: 2 } });
    await expect(exactReader.load()).resolves.toBe(exact.documentProxy);
    expect(pdfjs.getDocument).toHaveBeenCalledOnce();

    const overReader = new PDFReader({ data: '123' } as never, { limits: { maxSourceBytes: 2 } });
    await expect(overReader.load()).rejects.toMatchObject({ code: 'SOURCE_LIMIT_EXCEEDED' });
    expect(pdfjs.getDocument).toHaveBeenCalledOnce();
  });

  it('reports binary-string byte length to policy instead of unknown', async () => {
    createPdfHarness({ numPages: 1 });
    const sourcePolicy = vi.fn();
    const reader = new PDFReader({ data: '12' } as never, { sourcePolicy });

    await reader.load();

    expect(sourcePolicy).toHaveBeenCalledWith(expect.objectContaining({ byteLength: 2 }));
  });

  it('enforces exact and one-over limits for number arrays, buffers, and sliced views', async () => {
    const cases: Array<{ name: string; data: unknown }> = [
      { name: 'number array', data: [1, 2] },
      { name: 'array buffer', data: new Uint8Array([1, 2]).buffer },
      { name: 'sliced view', data: new Uint8Array([0, 1, 2, 0]).subarray(1, 3) },
      { name: 'nested data array', data: { data: [1, 2] } },
      { name: 'nested data buffer', data: { data: new Uint8Array([1, 2]).buffer } },
    ];
    for (const { data } of cases) {
      const exact = createPdfHarness({ numPages: 1 });
      const exactReader = new PDFReader(data as never, { limits: { maxSourceBytes: 2 } });
      await expect(exactReader.load()).resolves.toBe(exact.documentProxy);
    }
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(cases.length);

    vi.clearAllMocks();
    const overCases: Array<unknown> = [
      [1, 2, 3],
      new Uint8Array([1, 2, 3]).buffer,
      new Uint8Array([0, 1, 2, 3, 0]).subarray(1, 4),
      { data: [1, 2, 3] },
      { data: '123' },
    ];
    for (const data of overCases) {
      const reader = new PDFReader(data as never, { limits: { maxSourceBytes: 2 } });
      await expect(reader.load()).rejects.toMatchObject({ code: 'SOURCE_LIMIT_EXCEEDED' });
    }
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  it('counts array length even when values are non-finite instead of reporting unknown', async () => {
    createPdfHarness({ numPages: 1 });
    const sourcePolicy = vi.fn();
    const reader = new PDFReader([Number.NaN, 1] as never, {
      limits: { maxSourceBytes: 2 },
      sourcePolicy,
    });

    await reader.load();

    // PDF.js coerces array entries via `new Uint8Array(array)`, so the known
    // length stays 2 rather than becoming unknown and bypassing the limit.
    expect(sourcePolicy).toHaveBeenCalledWith(expect.objectContaining({ byteLength: 2 }));

    const overReader = new PDFReader([Number.NaN, Number.POSITIVE_INFINITY, 1] as never, {
      limits: { maxSourceBytes: 2 },
    });
    await expect(overReader.load()).rejects.toMatchObject({ code: 'SOURCE_LIMIT_EXCEEDED' });
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized arrays by length before reading any element', async () => {
    const data = [1, 2, 3];
    Object.defineProperty(data, '0', {
      configurable: true,
      enumerable: true,
      get: () => {
        throw new Error('element must not be read for a length-based rejection');
      },
    });
    const reader = new PDFReader(data as never, { limits: { maxSourceBytes: 2 } });

    await expect(reader.load()).rejects.toMatchObject({ code: 'SOURCE_LIMIT_EXCEEDED' });
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  it('rejects an array grown above the limit during policy approval before loading', async () => {
    createPdfHarness({ numPages: 1 });
    const approval = createDeferred<void>();
    const data = [1];
    const reader = new PDFReader(data as never, {
      limits: { maxSourceBytes: 2 },
      sourcePolicy: () => approval.promise,
    });

    const loading = reader.load();
    await Promise.resolve();
    await Promise.resolve();
    data.push(2, 3);

    approval.resolve();
    await expect(loading).rejects.toMatchObject({ code: 'SOURCE_LIMIT_EXCEEDED' });
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
    expect(reader.state).toBe('failed');
  });

  it.skipIf(!supportsResizableArrayBuffer())(
    'rejects a resizable buffer grown above the limit during policy approval',
    async () => {
      createPdfHarness({ numPages: 1 });
      const approval = createDeferred<void>();
      const buffer = new ArrayBuffer(1, { maxByteLength: 4 });
      const reader = new PDFReader(buffer, {
        limits: { maxSourceBytes: 2 },
        sourcePolicy: () => approval.promise,
      });

      const loading = reader.load();
      await Promise.resolve();
      await Promise.resolve();
      buffer.resize(3);

      approval.resolve();
      await expect(loading).rejects.toMatchObject({ code: 'SOURCE_LIMIT_EXCEEDED' });
      expect(pdfjs.getDocument).not.toHaveBeenCalled();
    },
  );

  it('passes typed arrays to PDF.js by reference without a mandatory copy', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const bytes = new Uint8Array([1, 2, 3]);
    const reader = new PDFReader(bytes, { limits: { maxSourceBytes: 8 } });

    await expect(reader.load()).resolves.toBe(pdf.documentProxy);

    const effective = vi.mocked(pdfjs.getDocument).mock.calls[0]?.[0] as unknown as { data?: unknown };
    expect(effective.data).toBe(bytes);
  });

  it('leaves remote URL byte limits to the application instead of inventing a length', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const sourcePolicy = vi.fn();
    const reader = new PDFReader('https://example.com/doc.pdf', {
      limits: { maxSourceBytes: 2 },
      sourcePolicy,
    });

    await expect(reader.load()).resolves.toBe(pdf.documentProxy);
    expect(sourcePolicy).toHaveBeenCalledWith(expect.objectContaining({ byteLength: undefined }));
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

  it('waits for a custom thenable source policy before starting PDF.js work', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const approval = createDeferred<void>();
    const sourcePolicy = vi.fn(() => ({
      then: approval.promise.then.bind(approval.promise),
    }));
    const reader = new PDFReader(new Uint8Array([1]), { sourcePolicy });

    const loading = reader.load();
    await Promise.resolve();
    await Promise.resolve();

    expect(sourcePolicy).toHaveBeenCalledOnce();
    expect(pdfjs.getDocument).not.toHaveBeenCalled();

    approval.resolve();
    await expect(loading).resolves.toBe(pdf.documentProxy);
    expect(pdfjs.getDocument).toHaveBeenCalledOnce();
  });

  it('rejects a failed thenable source policy without starting PDF.js work', async () => {
    createPdfHarness({ numPages: 1 });
    const sourcePolicy = vi.fn(() => ({
      then: (_resolve: () => void, reject: (reason?: unknown) => void) => reject(new Error('private policy detail')),
    }));
    const reader = new PDFReader(new Uint8Array([1]), { sourcePolicy });

    await expect(reader.load()).rejects.toMatchObject({
      code: 'SOURCE_POLICY_VIOLATION',
      message: 'PDF source rejected by sourcePolicy.',
    });
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  it('waits for a non-Promise policy object before starting PDF.js work', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const approval = createDeferred<void>();
    const nonNativePromise = {
      then: approval.promise.then.bind(approval.promise),
      catch: approval.promise.catch.bind(approval.promise),
    };
    const sourcePolicy = vi.fn(() => nonNativePromise);
    const reader = new PDFReader(new Uint8Array([1]), { sourcePolicy });

    const loading = reader.load();
    await Promise.resolve();
    await Promise.resolve();

    expect(pdfjs.getDocument).not.toHaveBeenCalled();

    approval.resolve();
    await expect(loading).resolves.toBe(pdf.documentProxy);
  });

  it('uses the source URL and credential values approved by policy when getters change later', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    let urlReads = 0;
    let credentialReads = 0;
    const source = {
      get url() {
        urlReads += 1;
        return urlReads === 1 ? 'https://example.com/approved.pdf' : 'https://example.com/replaced.pdf';
      },
      get withCredentials() {
        credentialReads += 1;
        return credentialReads === 1 ? false : true;
      },
    };
    const sourcePolicy = vi.fn((info) => {
      expect(info).toMatchObject({
        kind: 'document-init-parameters',
        url: 'https://example.com/approved.pdf',
        withCredentials: false,
      });
    });
    const reader = new PDFReader(source as never, { sourcePolicy });

    await expect(reader.load()).resolves.toBe(pdf.documentProxy);

    expect(pdfjs.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/approved.pdf',
        withCredentials: false,
      }),
    );
  });

  it('keeps deferred source approval tied to one source snapshot despite later source mutation', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const approval = createDeferred<void>();
    const originalHeaders = { Authorization: 'Bearer first' };
    const source = {
      url: 'https://example.com/approved.pdf',
      withCredentials: false,
      httpHeaders: originalHeaders,
    };
    const sourcePolicy = vi.fn((info) => {
      expect(info).toMatchObject({
        url: 'https://example.com/approved.pdf',
        hasHttpHeaders: true,
        httpHeaders: { Authorization: 'Bearer first' },
        withCredentials: false,
      });
      return { then: approval.promise.then.bind(approval.promise) };
    });
    const reader = new PDFReader(source as never, { sourcePolicy });

    const loading = reader.load();
    await Promise.resolve();
    await Promise.resolve();
    source.url = 'https://example.com/replaced.pdf';
    source.withCredentials = true;
    source.httpHeaders = { Authorization: 'Bearer second' };

    approval.resolve();
    await expect(loading).resolves.toBe(pdf.documentProxy);

    expect(pdfjs.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/approved.pdf',
        withCredentials: false,
        httpHeaders: { Authorization: 'Bearer first' },
      }),
    );
    const effective = vi.mocked(pdfjs.getDocument).mock.calls[0]?.[0] as unknown as {
      httpHeaders?: Record<string, string>;
    };
    // Stabilized copy: equal values, owned frozen reference, late for...in
    // reads (as PDF.js performs after worker setup) stay approved.
    expect(effective.httpHeaders).toEqual({ Authorization: 'Bearer first' });
    expect(effective.httpHeaders).not.toBe(originalHeaders);
    expect(Object.isFrozen(effective.httpHeaders)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(originalHeaders)).toBe(false);
    const late: Record<string, string> = {};
    if (effective.httpHeaders) {
      for (const name in effective.httpHeaders) late[name] = effective.httpHeaders[name] as string;
    }
    expect(late).toEqual({ Authorization: 'Bearer first' });
  });

  it('stabilizes nested header mutation during deferred approval', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const approval = createDeferred<void>();
    const headers = { Authorization: 'Bearer first' };
    const source = {
      url: 'https://example.com/approved.pdf',
      httpHeaders: headers,
    };
    const sourcePolicy = vi.fn((info) => {
      expect(info.httpHeaders).toEqual({ Authorization: 'Bearer first' });
      return { then: approval.promise.then.bind(approval.promise) };
    });
    const reader = new PDFReader(source as never, { sourcePolicy });

    const loading = reader.load();
    await Promise.resolve();
    await Promise.resolve();
    // Nested mutation of the approved container before approval resolves.
    headers.Authorization = 'Bearer second';
    (headers as Record<string, string>)['X-Injected'] = 'evil';

    approval.resolve();
    await expect(loading).resolves.toBe(pdf.documentProxy);

    const effective = vi.mocked(pdfjs.getDocument).mock.calls[0]?.[0] as unknown as {
      httpHeaders?: Record<string, string>;
    };
    expect(effective.httpHeaders).toEqual({ Authorization: 'Bearer first' });
    expect(effective.httpHeaders).not.toBe(headers);
    // Late PDF.js-style for...in enumeration after worker setup is deferred.
    const late: Record<string, string> = {};
    if (effective.httpHeaders) {
      for (const name in effective.httpHeaders) late[name] = effective.httpHeaders[name] as string;
    }
    expect(late).toEqual({ Authorization: 'Bearer first' });
  });

  it('reads header getters once so policy and PDF.js agree', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    let reads = 0;
    const headers: Record<string, string> = {};
    Object.defineProperty(headers, 'Authorization', {
      enumerable: true,
      configurable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? 'Bearer first' : 'Bearer second';
      },
    });
    const source = { url: 'https://example.com/approved.pdf', httpHeaders: headers };
    let approved: unknown;
    const sourcePolicy = vi.fn((info) => {
      approved = (info as { httpHeaders?: unknown }).httpHeaders;
    });
    const reader = new PDFReader(source as never, { sourcePolicy });

    await expect(reader.load()).resolves.toBe(pdf.documentProxy);

    expect(approved).toEqual({ Authorization: 'Bearer first' });
    const effective = vi.mocked(pdfjs.getDocument).mock.calls[0]?.[0] as unknown as {
      httpHeaders?: Record<string, string>;
    };
    expect(effective.httpHeaders).toEqual({ Authorization: 'Bearer first' });
    expect(effective.httpHeaders).toEqual(approved);
  });

  it('includes inherited enumerable headers in both policy and loading data', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const headers = Object.create({ 'X-Inherited': 'yes' });
    headers.Authorization = 'Bearer first';
    const source = { url: 'https://example.com/approved.pdf', httpHeaders: headers };
    let approved: { httpHeaders?: unknown } | undefined;
    const sourcePolicy = vi.fn((info) => {
      approved = info as { httpHeaders?: unknown };
    });
    const reader = new PDFReader(source as never, { sourcePolicy });

    await expect(reader.load()).resolves.toBe(pdf.documentProxy);

    expect(approved?.httpHeaders).toEqual({ Authorization: 'Bearer first', 'X-Inherited': 'yes' });
    const effective = vi.mocked(pdfjs.getDocument).mock.calls[0]?.[0] as unknown as {
      httpHeaders?: Record<string, string>;
    };
    // PDF.js consumes via for...in (inherited included): late read must match.
    const consumed: Record<string, string> = {};
    if (effective.httpHeaders) {
      for (const name in effective.httpHeaders) consumed[name] = effective.httpHeaders[name] as string;
    }
    expect(consumed).toEqual({ Authorization: 'Bearer first', 'X-Inherited': 'yes' });
    expect(effective.httpHeaders).toEqual(approved?.httpHeaders);
  });

  it('never reports Headers entries as an equivalent record', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const headers = new Headers({ Authorization: 'Bearer secret' });
    const source = { url: 'https://example.com/approved.pdf', httpHeaders: headers };
    let approved: { hasHttpHeaders?: unknown; httpHeaders?: unknown } | undefined;
    const sourcePolicy = vi.fn((info) => {
      approved = info as { hasHttpHeaders?: unknown; httpHeaders?: unknown };
    });
    const reader = new PDFReader(source as never, { sourcePolicy });

    await expect(reader.load()).resolves.toBe(pdf.documentProxy);

    // Presence is still reported so hasHttpHeaders-only policies keep blocking,
    // but no value entries are claimed: PDF.js for...in consumption observes
    // the same empty view.
    expect(approved?.hasHttpHeaders).toBe(true);
    expect(approved?.httpHeaders).toBeUndefined();
    const effective = vi.mocked(pdfjs.getDocument).mock.calls[0]?.[0] as unknown as {
      httpHeaders?: Record<string, string>;
    };
    const consumed: Record<string, string> = {};
    if (effective.httpHeaders) {
      for (const name in effective.httpHeaders) consumed[name] = effective.httpHeaders[name] as string;
    }
    expect(consumed).toEqual({});
    expect(effective.httpHeaders ?? undefined).toEqual(approved?.httpHeaders ?? undefined);
  });

  it('builds prototype-safe snapshots for special header and source keys', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const source = JSON.parse(
      '{"url":"https://example.com/approved.pdf","__proto__":{"polluted":true},"httpHeaders":{"__proto__":"evil"}}',
    );
    const reader = new PDFReader(source as never, {});

    await expect(reader.load()).resolves.toBe(pdf.documentProxy);

    const effective = vi.mocked(pdfjs.getDocument).mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(Object.getPrototypeOf(effective)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(effective, '__proto__')).toBe(true);
    const effectiveHeaders = effective.httpHeaders as Record<string, unknown>;
    expect(Object.getPrototypeOf(effectiveHeaders)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(effectiveHeaders, '__proto__')).toBe(true);
    expect(effectiveHeaders['__proto__' as string]).toBe('evil');
  });

  it('reports non-plain header objects as header-bearing without equivalent values', async () => {
    class HeaderBag {
      forEach(callback: (value: string, name: string) => void): void {
        callback('Bearer secret', 'Authorization');
      }
    }
    const sourcePolicy = vi.fn((info) => {
      // Presence blocks header-bearing sources; values are intentionally not
      // claimed because PDF.js for...in consumption observes an empty view.
      expect(info).toMatchObject({ hasHttpHeaders: true });
      expect(info.httpHeaders).toBeUndefined();
      throw new PdfReaderError(
        'SOURCE_POLICY_VIOLATION',
        'Credentialed or header-bearing PDF sources are not allowed.',
      );
    });
    const reader = new PDFReader(
      {
        url: 'https://example.com/private.pdf',
        httpHeaders: new HeaderBag(),
      } as never,
      { sourcePolicy },
    );

    await expect(reader.load()).rejects.toMatchObject({ code: 'SOURCE_POLICY_VIOLATION' });
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  it('rejects all load waiters with DESTROYED when destroyed during asynchronous source policy approval', async () => {
    const approval = createDeferred<void>();
    const sourcePolicy = vi.fn(() => approval.promise);
    const reader = new PDFReader(new Uint8Array([1]), { sourcePolicy });

    const firstLoad = reader.load();
    const secondLoad = reader.load();
    await Promise.resolve();

    const destroying = reader.destroy();

    await expect(firstLoad).rejects.toMatchObject({ code: 'DESTROYED' });
    await expect(secondLoad).rejects.toMatchObject({ code: 'DESTROYED' });
    await expect(destroying).resolves.toBeUndefined();
    expect(pdfjs.getDocument).not.toHaveBeenCalled();

    approval.reject(new Error('late policy rejection'));
    await Promise.resolve();
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
    expect(pdfjs.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/public.pdf',
        withCredentials: true,
        httpHeaders: { Authorization: 'Bearer secret' },
        password: 'secret-password', // pragma: allowlist secret
      }),
    );
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
    expect(pdfjs.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        data: source.data,
        password: 'open-sesame', // pragma: allowlist secret
        cMapUrl: '/cmaps/',
        standardFontDataUrl: '/standard-fonts/',
        wasmUrl: '/wasm/',
        worker,
      }),
    );
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

  it('rejects an overlapping page operation before acquiring another page or canvas', async () => {
    const render = createDeferred<void>();
    const pdf = createPdfHarness({ numPages: 1, renderPromise: render.promise });
    const canvas = createCanvasHarness();
    const canvasFactory = vi.fn(() => canvas.canvas);
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory });
    await reader.load();

    const first = reader.convert({ includeText: false, includeEmbeddedImages: false });
    await vi.waitFor(() => expect(pdf.page.render).toHaveBeenCalledOnce());

    await expect(reader.convert({ includeText: false, includeEmbeddedImages: false })).rejects.toMatchObject({
      code: 'OPERATION_IN_PROGRESS',
    });
    expect(pdf.documentProxy.getPage).toHaveBeenCalledOnce();
    expect(canvasFactory).toHaveBeenCalledOnce();

    render.resolve();
    await expect(first).resolves.toHaveLength(1);
    await expect(reader.convert({ includePageImage: false, includeText: false })).resolves.toHaveLength(1);
  });

  it('does not reserve page-operation ownership until a pages() iterator starts executing', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const reader = new PDFReader(new Uint8Array([1]));
    await reader.load();

    const idleIterator = reader.pages({ includePageImage: false, includeText: false });

    await expect(reader.convert({ includePageImage: false, includeText: false })).resolves.toHaveLength(1);
    expect(pdf.documentProxy.getPage).toHaveBeenCalledOnce();

    const first = await idleIterator.next();
    expect(first.done).toBe(false);
    await idleIterator.return(undefined);
    expect(pdf.documentProxy.getPage).toHaveBeenCalledTimes(2);
  });

  it('releases page-operation ownership after validation errors and pre-work aborts', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const reader = new PDFReader(new Uint8Array([1]));
    await reader.load();

    await expect(reader.convert({ jpegQuality: Number.NaN })).rejects.toMatchObject({ code: 'INVALID_OPTION' });
    expect(pdf.documentProxy.getPage).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    await expect(reader.convert({ signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(pdf.documentProxy.getPage).not.toHaveBeenCalled();

    await expect(reader.convert({ includePageImage: false, includeText: false })).resolves.toHaveLength(1);
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

  it('rejects blob encoding with DESTROYED, releases resources once, and ignores a late blob callback', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    let resolveBlob!: (blob: Blob | null) => void;
    canvas.canvas.toBlob = vi.fn((callback: BlobCallback) => {
      resolveBlob = callback;
    });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    const converting = reader.convert({ pageImageOutput: 'blob' });
    await vi.waitFor(() => expect(canvas.canvas.toBlob).toHaveBeenCalledOnce());
    const convertingRejection = expect(converting).rejects.toMatchObject({ code: 'DESTROYED' });
    const destroying = reader.destroy();

    await convertingRejection;
    await expect(destroying).resolves.toBeUndefined();
    expect(canvas.canvas.width).toBe(0);
    expect(canvas.canvas.height).toBe(0);
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
    expect(pdf.loadingTask.destroy).toHaveBeenCalledOnce();

    resolveBlob(new Blob(['late'], { type: 'image/png' }));
    await Promise.resolve();
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
    expect(reader.state).toBe('iterating');
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();

    await iterator.return(undefined);
    expect(reader.state).toBe('loaded');
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
    await expect(reader.convert({ includePageImage: false, includeText: false })).resolves.toHaveLength(2);
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
    await expect(reader.convert({ includePageImage: false, includeText: false })).resolves.toHaveLength(2);
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
    expect(pdf.loadingTask.destroy).toHaveBeenCalledOnce();
    expect(canvas.canvas.width).toBe(0);
    expect(canvas.canvas.height).toBe(0);
  });

  it('rejects promptly with DESTROYED when destroyed during a never-settling render', async () => {
    const render = createDeferred<void>();
    const pdf = createPdfHarness({ numPages: 1, renderPromise: render.promise });
    const canvas = createCanvasHarness();
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    const converting = reader.convert();
    await vi.waitFor(() => expect(pdf.page.render).toHaveBeenCalledOnce());
    const convertingRejection = expect(converting).rejects.toMatchObject({ code: 'DESTROYED' });
    const destroying = reader.destroy();

    await convertingRejection;
    await expect(destroying).resolves.toBeUndefined();
    expect(pdf.renderTask.cancel).toHaveBeenCalledOnce();
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
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

  it('treats omitted and explicit undefined limits as identical finite defaults', () => {
    const expected = {
      maxDocumentPages: 1_000,
      maxTextItems: 50_000,
      maxTextCodeUnits: 5_000_000,
      maxOperatorCount: 100_000,
      maxCanvasPixels: 40_000_000,
      maxEmbeddedImagePixels: 25_000_000,
      maxEmbeddedImages: 1_000,
      maxEmbeddedImagePixelsTotal: 100_000_000,
    };
    const explicitUndefined = {
      maxDocumentPages: undefined,
      maxTextItems: undefined,
      maxTextCodeUnits: undefined,
      maxOperatorCount: undefined,
      maxCanvasPixels: undefined,
      maxEmbeddedImagePixels: undefined,
      maxEmbeddedImages: undefined,
      maxEmbeddedImagePixelsTotal: undefined,
      maxSourceBytes: undefined,
    };
    const spreadAssembled = { ...{}, ...{ maxDocumentPages: undefined }, ...explicitUndefined };

    expect(resolveLimits()).toEqual(expected);
    expect(resolveLimits({})).toEqual(expected);
    expect(resolveLimits(explicitUndefined)).toEqual(expected);
    expect(resolveLimits(spreadAssembled)).toEqual(expected);
    expect(resolveLimits({ maxSourceBytes: undefined })).toEqual(expected);
    expect('maxSourceBytes' in resolveLimits(explicitUndefined)).toBe(false);
  });

  it('rejects a 1,001-page document whether the page limit is omitted or explicitly undefined', async () => {
    const omitted = createPdfHarness({ numPages: 1001 });
    const omittedReader = new PDFReader(new Uint8Array([1]));
    await expect(omittedReader.load()).rejects.toMatchObject({ code: 'PAGE_LIMIT_EXCEEDED' });
    expect(omitted.loadingTask.destroy).toHaveBeenCalledOnce();
    expect(omitted.documentProxy.getPage).not.toHaveBeenCalled();

    const explicit = createPdfHarness({ numPages: 1001 });
    const spreadLimits = { ...{}, ...{ maxDocumentPages: undefined } };
    const explicitReader = new PDFReader(new Uint8Array([1]), { limits: spreadLimits });
    await expect(explicitReader.load()).rejects.toMatchObject({ code: 'PAGE_LIMIT_EXCEEDED' });
    expect(explicit.loadingTask.destroy).toHaveBeenCalledOnce();
    expect(explicit.documentProxy.getPage).not.toHaveBeenCalled();
  });

  it('rejects nullish and non-positive-safe-integer limits with INVALID_OPTION', () => {
    const names = [
      'maxDocumentPages',
      'maxTextItems',
      'maxTextCodeUnits',
      'maxOperatorCount',
      'maxCanvasPixels',
      'maxEmbeddedImagePixels',
      'maxEmbeddedImages',
      'maxEmbeddedImagePixelsTotal',
      'maxSourceBytes',
    ] as const;
    const invalidValues = [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, 1.5, 2 ** 53];
    for (const name of names) {
      for (const value of invalidValues) {
        expect(() => resolveLimits({ [name]: value } as never)).toThrowError(
          expect.objectContaining({ code: 'INVALID_OPTION' }),
        );
        expect(() => new PDFReader(new Uint8Array([1]), { limits: { [name]: value } as never })).toThrowError(
          expect.objectContaining({ code: 'INVALID_OPTION' }),
        );
      }
    }
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  it('aborts a deferred getPage promptly and cleans up the late page exactly once', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const getPageDeferred = createDeferred<PDFPageProxy>();
    getPageDeferred.promise.catch(() => undefined);
    vi.mocked(pdf.documentProxy.getPage).mockReturnValue(getPageDeferred.promise);
    const reader = new PDFReader(new Uint8Array([1]));
    await reader.load();
    const controller = new AbortController();

    const converting = reader.convert({
      signal: controller.signal,
      includePageImage: false,
      includeText: false,
      includeEmbeddedImages: false,
    });
    await vi.waitFor(() => expect(pdf.documentProxy.getPage).toHaveBeenCalledOnce());
    controller.abort();

    // Must settle with ABORTED without waiting for the deferred PDF.js work.
    await expect(converting).rejects.toMatchObject({ code: 'ABORTED' });
    expect(pdf.page.render).not.toHaveBeenCalled();
    expect(pdf.page.cleanup).not.toHaveBeenCalled();

    // Late fulfillment must not publish a result: the orphaned page is owned
    // only for cleanup observation and gets exactly one cleanup.
    getPageDeferred.resolve(pdf.page);
    await vi.waitFor(() => expect(pdf.page.cleanup).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(pdf.page.render).not.toHaveBeenCalled();
    expect(reader.state).toBe('loaded');

    // Sequential reuse cannot overlap the orphaned work: the next conversion
    // acquires the reader/page fresh after the lock was released.
    vi.mocked(pdf.documentProxy.getPage).mockResolvedValue(pdf.page);
    await expect(
      reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: false }),
    ).resolves.toHaveLength(1);
    expect(pdf.documentProxy.getPage).toHaveBeenCalledTimes(2);
    expect(pdf.page.cleanup).toHaveBeenCalledTimes(2);
  });

  it('destroys during a deferred getPage and observes a late rejection without a late result', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const getPageDeferred = createDeferred<PDFPageProxy>();
    getPageDeferred.promise.catch(() => undefined);
    vi.mocked(pdf.documentProxy.getPage).mockReturnValue(getPageDeferred.promise);
    const reader = new PDFReader(new Uint8Array([1]));
    await reader.load();

    const converting = reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: false });
    await vi.waitFor(() => expect(pdf.documentProxy.getPage).toHaveBeenCalledOnce());

    const convertingRejection = expect(converting).rejects.toMatchObject({ code: 'DESTROYED' });
    const destroying = reader.destroy();

    await convertingRejection;
    await expect(destroying).resolves.toBeUndefined();
    expect(reader.state).toBe('destroyed');

    // Late upstream rejection must be observed, not published or left unhandled.
    getPageDeferred.reject(new Error('late getPage failure'));
    await Promise.resolve();
    await Promise.resolve();
    expect(pdf.page.cleanup).not.toHaveBeenCalled();
    expect(pdf.loadingTask.destroy).toHaveBeenCalledOnce();
  });

  it('destroys during deferred text extraction and ignores the late text without a late publish', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const textDeferred = createDeferred<{ items: unknown[]; styles: unknown; lang: unknown }>();
    textDeferred.promise.catch(() => undefined);
    vi.mocked(pdf.page.getTextContent).mockReturnValue(textDeferred.promise as never);
    const reader = new PDFReader(new Uint8Array([1]));
    await reader.load();

    const converting = reader.convert({ includePageImage: false, includeEmbeddedImages: false });
    await vi.waitFor(() => expect(pdf.page.getTextContent).toHaveBeenCalledOnce());

    const convertingRejection = expect(converting).rejects.toMatchObject({ code: 'DESTROYED' });
    const destroying = reader.destroy();

    await convertingRejection;
    await expect(destroying).resolves.toBeUndefined();

    // Late text resolve must not publish a page result; the owned page is
    // still cleaned exactly once by the active operation.
    textDeferred.resolve({ items: [], styles: {}, lang: null });
    await vi.waitFor(() => expect(pdf.page.cleanup).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(pdf.page.render).not.toHaveBeenCalled();
  });

  it('aborts deferred operator retrieval promptly without starting later image work', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const operatorDeferred = createDeferred<{ fnArray: number[]; argsArray: unknown[] }>();
    operatorDeferred.promise.catch(() => undefined);
    vi.mocked(pdf.page.getOperatorList).mockReturnValue(operatorDeferred.promise as never);
    const canvasFactory = vi.fn(() => createCanvasHarness().canvas);
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory });
    await reader.load();
    const controller = new AbortController();

    const converting = reader.convert({
      signal: controller.signal,
      includePageImage: false,
      includeText: false,
      includeEmbeddedImages: true,
    });
    await vi.waitFor(() => expect(pdf.page.getOperatorList).toHaveBeenCalledOnce());
    controller.abort();

    await expect(converting).rejects.toMatchObject({ code: 'ABORTED' });
    expect(canvasFactory).not.toHaveBeenCalled();
    expect(pdf.page.objs.get).not.toHaveBeenCalled();

    // Late operator fulfillment must not resume extraction or publish images.
    operatorDeferred.resolve({ fnArray: [], argsArray: [] });
    await vi.waitFor(() => expect(pdf.page.cleanup).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(canvasFactory).not.toHaveBeenCalled();
    expect(pdf.page.objs.get).not.toHaveBeenCalled();
    expect(reader.state).toBe('loaded');

    // Lock release: a sequential conversion after the abort owns the reader fresh.
    vi.mocked(pdf.page.getOperatorList).mockResolvedValue({ fnArray: [], argsArray: [] } as never);
    await expect(
      reader.convert({ includePageImage: false, includeText: false, includeEmbeddedImages: true }),
    ).resolves.toHaveLength(1);
    expect(pdf.page.cleanup).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid runtime convert options with INVALID_OPTION before page work', async () => {
    const cases: Array<{ name: string; options: unknown }> = [
      { name: 'unsupported MIME', options: { imageFormat: 'image/gif' } },
      { name: 'MIME empty string', options: { imageFormat: '' } },
      { name: 'MIME null', options: { imageFormat: null } },
      { name: 'scale string', options: { viewportScale: '2x' } },
      { name: 'scale boolean', options: { viewportScale: true } },
      { name: 'scale object', options: { viewportScale: {} } },
      { name: 'scale zero', options: { viewportScale: 0 } },
      { name: 'scale negative', options: { viewportScale: -1 } },
      { name: 'scale NaN', options: { viewportScale: Number.NaN } },
      { name: 'scale Infinity', options: { viewportScale: Number.POSITIVE_INFINITY } },
      { name: 'flag numeric', options: { includePageImage: 1 } },
      { name: 'flag string', options: { includeText: 'yes' } },
      { name: 'flag null', options: { includeEmbeddedImages: null } },
      { name: 'flag zero', options: { includePageImage: 0 } },
      { name: 'output unknown', options: { pageImageOutput: 'base64' } },
      { name: 'jpegQuality string', options: { jpegQuality: 'high' } },
      { name: 'null options', options: null },
    ];
    for (const { name, options } of cases) {
      createPdfHarness({ numPages: 1 });
      const canvasFactory = vi.fn(() => createCanvasHarness().canvas);
      const reader = new PDFReader(new Uint8Array([1]), { canvasFactory });
      await reader.load();
      const documentProxy = pdfjs.getDocument.mock.calls.length;

      await expect(reader.convert(options as never), name).rejects.toMatchObject({ code: 'INVALID_OPTION' });
      expect(pdfjs.getDocument).toHaveBeenCalledTimes(documentProxy);
      const proxy = (await reader.load()) as unknown as { getPage: ReturnType<typeof vi.fn> };
      expect(vi.mocked(proxy.getPage)).not.toHaveBeenCalled();
      expect(canvasFactory).not.toHaveBeenCalled();
      await reader.destroy();
      vi.clearAllMocks();
    }
  });

  it('rejects malformed page ranges with INVALID_OPTION and preserves reversed tuples', async () => {
    const invalid: Array<{ name: string; pageRange: unknown }> = [
      { name: 'three elements', pageRange: [1, 2, 3] },
      { name: 'one element', pageRange: [1] },
      { name: 'empty', pageRange: [] },
      { name: 'non-array string', pageRange: '1-2' },
      { name: 'non-array object', pageRange: { start: 1, end: 2 } },
      { name: 'non-array null', pageRange: null },
      { name: 'zero value', pageRange: [0, 1] },
      { name: 'fraction', pageRange: [1.5, 2] },
      { name: 'unsafe integer', pageRange: [1, 2 ** 53] },
    ];
    const sparse = [1, 2] as unknown[];
    delete sparse[1];
    invalid.push({ name: 'sparse tuple', pageRange: sparse });
    const holey = new Array(2) as unknown;
    invalid.push({ name: 'holey array', pageRange: holey });

    for (const { name, pageRange } of invalid) {
      createPdfHarness({ numPages: 2 });
      const canvasFactory = vi.fn(() => createCanvasHarness().canvas);
      const reader = new PDFReader(new Uint8Array([1]), { canvasFactory });
      await reader.load();
      await expect(reader.convert({ pageRange: pageRange as never }), name).rejects.toMatchObject({
        code: 'INVALID_OPTION',
      });
      expect(canvasFactory).not.toHaveBeenCalled();
      await reader.destroy();
      vi.clearAllMocks();
    }

    // Reversed two-element ranges and defaults are preserved.
    createPdfHarness({ numPages: 3 });
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => createCanvasHarness().canvas });
    await reader.load();
    await expect(
      reader.convert({ pageRange: [3, 1], includePageImage: false, includeText: false }),
    ).resolves.toHaveLength(3);
    await expect(reader.convert({ includePageImage: false, includeText: false })).resolves.toHaveLength(3);
    await reader.destroy();
  });

  it('bounds load deadlines at the maximum timer delay with INVALID_OPTION', async () => {
    createPdfHarness({ numPages: 1 });
    const reader = new PDFReader(new Uint8Array([1]));
    for (const deadlineMs of [2_147_483_648, Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY, 0, -1, Number.NaN]) {
      expect(() => reader.load({ deadlineMs }), `deadlineMs=${deadlineMs}`).toThrowError(
        expect.objectContaining({ code: 'INVALID_OPTION' }),
      );
    }
    expect(pdfjs.getDocument).not.toHaveBeenCalled();

    const maxReader = new PDFReader(new Uint8Array([1]));
    const loading = maxReader.load({ deadlineMs: 2_147_483_647 });
    await expect(loading).resolves.toBeDefined();
    await maxReader.destroy();
  });

  it('rejects zero and negative page dimensions before canvas allocation', async () => {
    for (const viewport of [
      { width: 0, height: 10 },
      { width: 10, height: 0 },
      { width: -5, height: 10 },
      { width: Number.NaN, height: 10 },
      { width: Number.POSITIVE_INFINITY, height: 10 },
    ]) {
      const pdf = createPdfHarness({ numPages: 1 });
      vi.mocked(pdf.page.getViewport).mockReturnValue({ ...viewport, scale: 1 } as never);
      const canvasFactory = vi.fn(() => createCanvasHarness().canvas);
      const reader = new PDFReader(new Uint8Array([1]), { canvasFactory });
      await reader.load();

      await expect(reader.convert()).rejects.toMatchObject({ code: 'CANVAS_LIMIT_EXCEEDED' });
      expect(canvasFactory).not.toHaveBeenCalled();
      expect(pdf.page.cleanup).toHaveBeenCalledOnce();
      await reader.destroy();
      vi.clearAllMocks();
    }
  });

  it('rejects empty and mismatched data-URL encodes without publishing a false MIME', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    vi.mocked(canvas.canvas.toDataURL).mockReturnValue('data:,');
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    await expect(reader.convert({ imageFormat: 'image/png' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_ENVIRONMENT',
    });
    expect(canvas.canvas.width).toBe(0);
    expect(canvas.canvas.height).toBe(0);
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
    await reader.destroy();
    vi.clearAllMocks();

    const mismatch = createPdfHarness({ numPages: 1 });
    const mismatchCanvas = createCanvasHarness();
    vi.mocked(mismatchCanvas.canvas.toDataURL).mockReturnValue('data:image/png;base64,fallback');
    const mismatchReader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => mismatchCanvas.canvas });
    await mismatchReader.load();

    await expect(mismatchReader.convert({ imageFormat: 'image/jpeg' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_ENVIRONMENT',
    });
    expect(mismatchCanvas.canvas.width).toBe(0);
    expect(mismatch.page.cleanup).toHaveBeenCalledOnce();
    await mismatchReader.destroy();
  });

  it('rejects empty and mismatched Blob encodes without publishing a false MIME', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    canvas.canvas.toBlob = vi.fn((callback: BlobCallback) => callback(new Blob([''], { type: 'image/png' })));
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    await expect(reader.convert({ pageImageOutput: 'blob' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_ENVIRONMENT',
    });
    expect(canvas.canvas.width).toBe(0);
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
    await reader.destroy();
    vi.clearAllMocks();

    const mismatch = createPdfHarness({ numPages: 1 });
    const mismatchCanvas = createCanvasHarness();
    mismatchCanvas.canvas.toBlob = vi.fn((callback: BlobCallback, mimeType?: string) =>
      callback(new Blob(['x'], { type: 'image/png' })),
    );
    const mismatchReader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => mismatchCanvas.canvas });
    await mismatchReader.load();

    await expect(mismatchReader.convert({ pageImageOutput: 'blob', imageFormat: 'image/jpeg' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_ENVIRONMENT',
    });
    expect(mismatch.page.cleanup).toHaveBeenCalledOnce();
    await mismatchReader.destroy();
  });

  it('retains default and valid PNG/JPEG data-URL and Blob contracts', async () => {
    const pdf = createPdfHarness({ numPages: 1 });
    const canvas = createCanvasHarness();
    const reader = new PDFReader(new Uint8Array([1]), { canvasFactory: () => canvas.canvas });
    await reader.load();

    const [defaultPage] = await reader.convert({ includeText: false, includeEmbeddedImages: false });
    expect(defaultPage?.pageImage).toEqual({
      kind: 'data-url',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,page',
    });

    const [jpegPage] = await reader.convert({
      includeText: false,
      includeEmbeddedImages: false,
      imageFormat: 'image/jpeg',
      jpegQuality: 0.7,
    });
    expect(jpegPage?.pageImage).toEqual({
      kind: 'data-url',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,page',
    });

    const [blobPage] = await reader.convert({
      includeText: false,
      includeEmbeddedImages: false,
      pageImageOutput: 'blob',
    });
    expect(blobPage?.pageImage?.kind).toBe('blob');
    expect(blobPage?.pageImage?.mimeType).toBe('image/png');
    await reader.destroy();
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
