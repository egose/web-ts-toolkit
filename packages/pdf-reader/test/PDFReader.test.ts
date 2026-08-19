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

import { configurePdfWorker, PDFReader, PdfReaderError } from '../src';

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
    expect(pages[0]).toMatchObject({ pageNumber: 2, pageIndex: 1, mimeType: 'image/jpeg' });
    expect(pages[0]?.dataUrl).toBe('data:image/jpeg;base64,page');
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
});

describe('configurePdfWorker', () => {
  it('accepts worker URLs and existing workers without module-load mutation', () => {
    expect(pdfjs.workerOptions).toEqual({ workerSrc: '', workerPort: null });
    configurePdfWorker('/assets/pdf.worker.mjs');
    expect(pdfjs.workerOptions.workerSrc).toBe('/assets/pdf.worker.mjs');

    const worker = {} as Worker;
    configurePdfWorker(worker);
    expect(pdfjs.workerOptions.workerPort).toBe(worker);
  });
});
