import { describe, expect, it, vi } from 'vitest';

/**
 * PDFR-01: Real-Browser PDF.js Integration Fixtures.
 *
 * These tests execute in real Headless Chromium through Vitest's Playwright
 * provider. They assert the package's claims against genuine PDF.js worker
 * loading, canvas rendering, text extraction, page selection, malformed-input
 * rejection, password-protected input handling, and lifecycle cleanup — none
 * of which `jsdom` can validate reliably.
 *
 * The suite loads the *built* ESM bundle from `../dist/index.mjs` (not the TS
 * source) so it exercises what an installed browser consumer imports. The
 * PDF.js worker URL is supplied through the documented application boundary
 * via Vite's `?url` import against the pinned `pdfjs-dist` peer dependency,
 * then handed to `configurePdfWorker()` — the same path a real consumer
 * would take under Vite.
 *
 * Required fixtures live in `./fixtures/generated/`. They are deterministic,
 * small, license-compatible, and produced by `./fixtures/generate.py`. Do
 * not hand-edit them; see `./fixtures/README.md` for regeneration.
 *
 * Browser-provider and serialisation rules are documented in
 * `vitest.browser.config.mts` at the package root.
 */

// `vitest` is hoisted from the workspace root devDependencies.
// `@vitest/browser-playwright` lives in this package's devDependencies.
// `pdfjs-dist` is a peer of the package and a devDependency for these tests.
// `../dist/index.mjs` is the *built* ESM the installed consumer loads.
import * as pkg from '../dist/index.mjs';
import builtBundleSource from '../dist/index.mjs?raw';
import { getDocument, GlobalWorkerOptions, OPS, PDFWorker } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// `?raw` is a Vite built-in that inlines the file as a string import.
import sampleB64 from './fixtures/generated/sample.pdf.base64.txt?raw';
import multiB64 from './fixtures/generated/multi.pdf.base64.txt?raw';
import malformedB64 from './fixtures/generated/malformed.pdf.base64.txt?raw';
import encryptedB64 from './fixtures/generated/encrypted.pdf.base64.txt?raw';
import embeddedImagesB64 from './fixtures/generated/embedded-images.pdf.base64.txt?raw';
import embeddedOneBitB64 from './fixtures/generated/embedded-1bit.pdf.base64.txt?raw';
import embeddedSharedB64 from './fixtures/generated/embedded-shared.pdf.base64.txt?raw';

import type { PageResult } from '../src/types';

const PDFReader = pkg.PDFReader as typeof import('../src').PDFReader;
const configurePdfWorker = pkg.configurePdfWorker as typeof import('../src').configurePdfWorker;

/** Pinned fixture contract. The PDF.js worker is shared across all cases. */
const USER_PASSWORD = 'userpass'; // pragma: allowlist secret

function decodeFixture(b64: string): Uint8Array {
  const trimmed = b64.trim();
  const binary = globalThis.atob(trimmed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textOf(page: PageResult | undefined): string {
  if (!page?.text) return '';
  return pkg.pdfTextToString(page.text);
}

/**
 * Decodes an extracted PNG data URL back into raw RGBA pixels through the
 * real browser image pipeline, so pixel assertions verify end-to-end
 * extractor output rather than just data-URL prefixes.
 */
async function pixelsOfDataUrl(dataUrl: string): Promise<{ width: number; height: number; data: number[] }> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to create a 2D canvas context for pixel assertions.');
  context.drawImage(image, 0, 0);
  const decoded = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: Array.from(decoded.data) };
}

/**
 * Asserts `reader.destroy()` actually terminated the underlying PDF.js
 * document (no leaked loading task / document) by ensuring `numPages`
 * reports `undefined` and a second `destroy()` resolves cleanly.
 */
async function assertNoLeakedDocument(reader: InstanceType<typeof PDFReader>): Promise<void> {
  expect(reader.numPages).toBeUndefined();
  await expect(reader.destroy()).resolves.toBeUndefined();
}

function clearWorkerConfig(): void {
  GlobalWorkerOptions.workerSrc = '';
  GlobalWorkerOptions.workerPort = null;
}

function applyWorkerConfig(): void {
  configurePdfWorker(workerUrl);
}

function createRenderStartAbortCanvasFactory(controller: AbortController): {
  canvasFactory: () => HTMLCanvasElement;
  renderStarted: Promise<void>;
  getRenderStarted: () => boolean;
  getPageImageEncodeCount: () => number;
} {
  let renderStarted = false;
  let pageImageEncodeCount = 0;
  let resolveRenderStarted!: () => void;
  const renderStartedPromise = new Promise<void>((resolve) => {
    resolveRenderStarted = resolve;
  });
  const patchedContexts = new WeakSet<CanvasRenderingContext2D>();
  const renderStartMethods = [
    'save',
    'setTransform',
    'transform',
    'fillRect',
    'drawImage',
    'fillText',
    'strokeText',
    'stroke',
    'fill',
  ];
  const markRenderStarted = () => {
    if (renderStarted) return;
    renderStarted = true;
    resolveRenderStarted();
    queueMicrotask(() => controller.abort());
  };
  const patchContext = (context: CanvasRenderingContext2D) => {
    if (patchedContexts.has(context)) return;
    patchedContexts.add(context);
    const writableContext = context as unknown as Record<string, unknown>;
    for (const methodName of renderStartMethods) {
      const original = writableContext[methodName];
      if (typeof original !== 'function') continue;
      Object.defineProperty(context, methodName, {
        configurable: true,
        value(this: CanvasRenderingContext2D, ...args: unknown[]) {
          markRenderStarted();
          return original.apply(this, args);
        },
      });
    }
  };

  return {
    canvasFactory: () => {
      const canvas = document.createElement('canvas');
      const getContext = canvas.getContext.bind(canvas);
      const toDataURL = canvas.toDataURL.bind(canvas);
      canvas.getContext = ((contextId: string, options?: unknown) => {
        const context = getContext(contextId as '2d', options as CanvasRenderingContext2DSettings);
        if (contextId === '2d' && context) patchContext(context as CanvasRenderingContext2D);
        return context;
      }) as HTMLCanvasElement['getContext'];
      canvas.toDataURL = (...args) => {
        pageImageEncodeCount += 1;
        return toDataURL(...args);
      };
      return canvas;
    },
    renderStarted: renderStartedPromise,
    getRenderStarted: () => renderStarted,
    getPageImageEncodeCount: () => pageImageEncodeCount,
  };
}

describe('PDFR-01 real-browser PDF.js integration', () => {
  it('ingests real fixture text with page attribution and no package canvas allocation', async () => {
    applyWorkerConfig();
    const canvasFactory = vi.fn((): HTMLCanvasElement => {
      throw new Error('Text-only ingestion must not allocate a package canvas.');
    });
    const reader = new PDFReader(decodeFixture(multiB64), { canvasFactory });
    const records: Array<{ pageNumber: number; text: string }> = [];
    const expectedRecords = [
      { pageNumber: 1, text: 'Page 1 text' },
      { pageNumber: 2, text: 'Page 2 landscape' },
      { pageNumber: 3, text: 'Page 3 image-page' },
    ];
    const output = document.createElement('pre');
    try {
      await reader.load();
      for await (const page of reader.pages({
        includeText: true,
        includePageImage: false,
        includeEmbeddedImages: false,
      })) {
        expect(page.text).toBeDefined();
        expect(page.pageImage).toBeUndefined();
        if (!page.text) throw new Error('Missing fixture text.');
        const text = pkg.pdfTextToString(page.text);
        records.push({ pageNumber: page.pageNumber, text });
        output.textContent = `Page ${page.pageNumber}\n${text}`;
        expect(output.textContent).toBe(`Page ${page.pageNumber}\n${expectedRecords[page.pageIndex].text}`);
      }
      expect(records).toEqual(expectedRecords);
      expect(canvasFactory).not.toHaveBeenCalled();
    } finally {
      await reader.destroy();
      await assertNoLeakedDocument(reader);
    }
  });

  it('does not mutate PDF.js worker globals at module evaluation and the built bundle contains no Vite-only worker import', () => {
    // Importing the built bundle alone must not configure the worker. That
    // remains an explicit application boundary via `configurePdfWorker(...)`.
    clearWorkerConfig();
    expect(GlobalWorkerOptions.workerSrc).toBe('');
    expect(GlobalWorkerOptions.workerPort).toBeNull();

    // The runtime bundle itself must not embed a Vite-only `?url` import.
    // Consumers own worker asset emission in application code.
    expect(builtBundleSource).not.toContain('?url');
    expect(builtBundleSource).not.toContain('pdf.worker.min.mjs');
  });

  it('fails closed when the worker is not configured through the application boundary', async () => {
    clearWorkerConfig();
    const bytes = decodeFixture(sampleB64);
    const reader = new PDFReader(bytes, {
      canvasFactory: () => document.createElement('canvas'),
    });

    try {
      await expect(reader.load()).rejects.toThrow();
      expect(reader.numPages).toBeUndefined();
    } finally {
      await reader.destroy();
      await assertNoLeakedDocument(reader);
    }
  }, 60_000);

  it('boots a real PDF.js worker and renders a one-page PDF with text', async () => {
    applyWorkerConfig();
    const bytes = decodeFixture(sampleB64);
    const reader = new PDFReader(bytes, {
      canvasFactory: () => document.createElement('canvas'),
    });

    try {
      const doc = await reader.load();
      // Real PDF.js reports the fixture's single page.
      expect(doc.numPages).toBe(1);
      expect(reader.numPages).toBe(1);

      const pages = await reader.convert({ includeText: true, includePageImage: true });
      expect(pages).toHaveLength(1);

      const [page] = pages as PageResult[];
      expect(page?.pageNumber).toBe(1);
      expect(page?.pageIndex).toBe(0);
      expect(page?.numPages).toBe(1);

      // Text extraction against real PDF.js produced from `fpdf2` fixture.
      expect(textOf(page)).toContain('Page 1');

      // Rendered page image is present and has the right MIME prefix.
      expect(page?.pageImage?.kind).toBe('data-url');
      expect(page?.pageImage?.mimeType).toBe('image/png');
      expect(page?.pageImage && 'dataUrl' in page.pageImage ? page.pageImage.dataUrl : '').toMatch(
        /^data:image\/png;base64,/,
      );
      expect(page?.pageImage && 'dataUrl' in page.pageImage ? page.pageImage.dataUrl.length : 0).toBeGreaterThan(256);

      // Viewport came from real PDF.js, not a mock.
      expect(page?.viewport.width).toBeGreaterThan(0);
      expect(page?.viewport.height).toBeGreaterThan(0);
    } finally {
      await reader.destroy();
      await assertNoLeakedDocument(reader);
    }
  }, 60_000);

  it('loads real PDF.js bytes from a binary string at the exact limit and rejects one-over', async () => {
    applyWorkerConfig();
    const bytes = decodeFixture(sampleB64);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] as number);

    // Exact limit: the binary string follows PDF.js `stringToBytes` (one byte
    // per code unit) and converts into the same one-page document.
    const exact = new PDFReader({ data: binary } as never, {
      canvasFactory: () => document.createElement('canvas'),
      limits: { maxSourceBytes: binary.length },
    });
    try {
      const doc = await exact.load();
      expect(doc.numPages).toBe(1);
      const pages = await exact.convert({ includeText: true, includePageImage: false });
      expect(textOf(pages[0])).toContain('Page 1');
    } finally {
      await exact.destroy();
      await assertNoLeakedDocument(exact);
    }

    // One byte over: rejected before the worker starts, with no live document.
    const over = new PDFReader({ data: binary } as never, {
      limits: { maxSourceBytes: binary.length - 1 },
    });
    await expect(over.load()).rejects.toMatchObject({ code: 'SOURCE_LIMIT_EXCEEDED' });
    expect(over.state).toBe('failed');
    await over.destroy();
  }, 60_000);

  it('loads multi-page fixture, honours selected page numbers, and proofs non-trivial viewport', async () => {
    applyWorkerConfig();
    const bytes = decodeFixture(multiB64);
    const reader = new PDFReader(bytes, {
      canvasFactory: () => document.createElement('canvas'),
    });

    try {
      const doc = await reader.load();
      // Real fixture has 3 pages (text + landscape + image embed).
      expect(doc.numPages).toBe(3);

      // Single-page selection through `pageRange: number`.
      const onlySecond = await reader.convert({ pageRange: 2, includePageImage: false });
      expect(onlySecond).toHaveLength(1);
      expect(onlySecond[0]?.pageNumber).toBe(2);
      // PDF.js reports a landscape viewport: width > height, which
      // distinguishes a real PDF from a mock returning the same 200x300 box.
      expect(onlySecond[0]?.viewport.width).toBeGreaterThan(onlySecond[0]?.viewport.height ?? 0);

      // Tuple page selection. Reversed tuple normalization is a documented
      // behavior in `ConvertOptions`; cover it with `[3, 1]`.
      const all = await reader.convert({ pageRange: [3, 1], includeText: true, includePageImage: false });
      expect(all.map((page) => page.pageNumber)).toEqual([1, 2, 3]);

      // The third page contains text and is one of the not-yet-rendered pages.
      expect(textOf(all[2])).toContain('Page 3');
    } finally {
      await reader.destroy();
      await assertNoLeakedDocument(reader);
    }
  }, 60_000);

  it('extracts JPEG page output with the correct MIME type when requested', async () => {
    applyWorkerConfig();
    const bytes = decodeFixture(sampleB64);
    const reader = new PDFReader(bytes, {
      canvasFactory: () => document.createElement('canvas'),
    });

    try {
      await reader.load();
      const [page] = await reader.convert({
        includeText: false,
        includePageImage: true,
        imageFormat: 'image/jpeg',
        jpegQuality: 0.7,
      });
      expect(page?.pageImage).toMatchObject({ kind: 'data-url', mimeType: 'image/jpeg' });
      expect(page?.pageImage && 'dataUrl' in page.pageImage ? page.pageImage.dataUrl : '').toMatch(
        /^data:image\/jpeg;base64,/,
      );
    } finally {
      await reader.destroy();
      await assertNoLeakedDocument(reader);
    }
  }, 60_000);

  it('returns blob page output without base64 conversion and records the data-url tradeoff', async () => {
    applyWorkerConfig();
    const bytes = decodeFixture(multiB64);
    const reader = new PDFReader(bytes, {
      canvasFactory: () => document.createElement('canvas'),
    });

    try {
      await reader.load();

      const dataUrlStart = performance.now();
      const [dataUrlPage] = await reader.convert({
        pageRange: 3,
        includeText: false,
        includeEmbeddedImages: false,
        pageImageOutput: 'data-url',
      });
      const dataUrlElapsedMs = performance.now() - dataUrlStart;

      const blobStart = performance.now();
      const [blobPage] = await reader.convert({
        pageRange: 3,
        includeText: false,
        includeEmbeddedImages: false,
        pageImageOutput: 'blob',
      });
      const blobElapsedMs = performance.now() - blobStart;

      expect(dataUrlPage?.pageImage).toMatchObject({ kind: 'data-url', mimeType: 'image/png' });
      expect(blobPage?.pageImage).toMatchObject({ kind: 'blob', mimeType: 'image/png' });

      const dataUrlLength =
        dataUrlPage?.pageImage && 'dataUrl' in dataUrlPage.pageImage ? dataUrlPage.pageImage.dataUrl.length : 0;
      const blobBytes = blobPage?.pageImage && 'blob' in blobPage.pageImage ? blobPage.pageImage.blob.size : 0;

      expect(blobBytes).toBeGreaterThan(0);
      expect(dataUrlLength).toBeGreaterThan(blobBytes);
      console.info(
        `PDFR-05 measurement fixture=multi.pdf#3 dataUrlElapsedMs=${dataUrlElapsedMs.toFixed(2)} blobElapsedMs=${blobElapsedMs.toFixed(2)} dataUrlChars=${dataUrlLength} blobBytes=${blobBytes}`,
      );
    } finally {
      await reader.destroy();
      await assertNoLeakedDocument(reader);
    }
  }, 60_000);

  it('keeps a caller-owned worker and blob preview alive through decode, then releases both (PDFR3-09)', async () => {
    applyWorkerConfig();
    // Mirrors the README Worker Setup + blob-preview example: the
    // caller-created PDFWorker is destroyed in a nested finally even when
    // reader teardown rejects, and the object URL stays alive until the
    // preview decodes (immediate revocation after assignment rejects).
    const worker = new PDFWorker({ name: 'pdfr3-09-preview' });
    const reader = new PDFReader(
      { data: decodeFixture(sampleB64), worker },
      { canvasFactory: () => document.createElement('canvas') },
    );
    const preview = document.createElement('img');
    document.body.append(preview);
    let objectUrl: string | undefined;
    try {
      await reader.load();
      const [page] = await reader.convert({
        includeText: false,
        includePageImage: true,
        pageImageOutput: 'blob',
      });
      expect(page?.pageImage?.kind).toBe('blob');
      const blob = page?.pageImage && 'blob' in page.pageImage ? page.pageImage.blob : undefined;
      expect(blob).toBeInstanceOf(Blob);

      objectUrl = URL.createObjectURL(blob as Blob);
      preview.src = objectUrl;
      await preview.decode();
      expect(preview.naturalWidth).toBeGreaterThan(0);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      preview.remove();
      try {
        await reader.destroy();
      } finally {
        await worker.destroy();
      }
    }

    expect(worker.destroyed).toBe(true);
    await assertNoLeakedDocument(reader);
  }, 60_000);

  it('destroys a caller-owned worker explicitly when load fails (PDFR3-09)', async () => {
    applyWorkerConfig();
    const worker = new PDFWorker({ name: 'pdfr3-09-failure' });
    const reader = new PDFReader(
      { data: decodeFixture(malformedB64), worker },
      { canvasFactory: () => document.createElement('canvas') },
    );

    try {
      await expect(reader.load()).rejects.toThrow();
      expect(reader.numPages).toBeUndefined();
    } finally {
      try {
        await reader.destroy();
      } finally {
        await worker.destroy();
      }
    }

    expect(worker.destroyed).toBe(true);
    await assertNoLeakedDocument(reader);
  }, 60_000);

  it('fails on a malformed/truncated PDF with a structured error and leaves no live document', async () => {
    applyWorkerConfig();
    const bytes = decodeFixture(malformedB64);
    const reader = new PDFReader(bytes, {
      canvasFactory: () => document.createElement('canvas'),
    });

    // PDF.js surfaces a malformed-document error that is NOT one of the
    // package's own `PdfReaderError` codes; the contract is that PDF.js
    // errors pass through unchanged so callers can use PDF.js error classes.
    await expect(reader.load()).rejects.toThrow();
    // After a failed load, the reader should own no document.
    expect(reader.numPages).toBeUndefined();

    // Idempotent `destroy()` is the fail-closed path: a second `destroy()`
    // must not double-destroy an already-cleared loading task.
    await expect(reader.destroy()).resolves.toBeUndefined();
  }, 60_000);

  it('rejects encrypted PDF without a password and fails closed without leaking the loading task', async () => {
    applyWorkerConfig();
    const bytes = decodeFixture(encryptedB64);
    const reader = new PDFReader(bytes, {
      canvasFactory: () => document.createElement('canvas'),
    });

    // PDF.js raises its `PasswordException` because no password was supplied.
    // The package's contract is to let PDF.js errors pass through, so we only
    // assert it rejected and no document was published.
    await expect(reader.load()).rejects.toThrow();
    expect(reader.numPages).toBeUndefined();
    await reader.destroy();
    await assertNoLeakedDocument(reader);
  }, 60_000);

  it('loads encrypted PDF when the user password is supplied and extracts text', async () => {
    applyWorkerConfig();
    const bytes = decodeFixture(encryptedB64);
    const reader = new PDFReader(
      { data: bytes, password: USER_PASSWORD },
      { canvasFactory: () => document.createElement('canvas') },
    );

    try {
      const doc = await reader.load();
      expect(doc.numPages).toBe(1);
      const [page] = await reader.convert({ includeText: true, includePageImage: false });
      expect(textOf(page)).toContain('Secret');
    } finally {
      await reader.destroy();
      await assertNoLeakedDocument(reader);
    }
  }, 60_000);

  it('characterizes real PDF.js embedded-image operators and browser-owned image objects for the supported peer minor', async () => {
    applyWorkerConfig();
    const bytes = decodeFixture(embeddedImagesB64);
    const task = getDocument({ data: bytes });

    try {
      const doc = await task.promise;
      const page1 = await doc.getPage(1);
      const page2 = await doc.getPage(2);
      const page1Operators = await page1.getOperatorList();
      const page2Operators = await page2.getOperatorList();

      expect(page1Operators.fnArray).toContain(OPS.paintInlineImageXObject);
      const xobjectRefs = page1Operators.argsArray
        .filter((_, index) => page1Operators.fnArray[index] === OPS.paintImageXObject)
        .map((args) => (Array.isArray(args) ? args[0] : undefined))
        .filter((value): value is string => typeof value === 'string');
      expect(new Set(xobjectRefs).size).toBeLessThan(xobjectRefs.length);

      const resolvedImages = await Promise.all(xobjectRefs.map((reference) => page1.objs.get(reference)));
      const sawImageBitmap = resolvedImages.some(
        (image) =>
          typeof ImageBitmap !== 'undefined' &&
          image &&
          typeof image === 'object' &&
          'bitmap' in image &&
          image.bitmap instanceof ImageBitmap,
      );
      expect(sawImageBitmap).toBe(true);

      expect(page2Operators.fnArray).toContain(OPS.paintFormXObjectBegin);
      expect(page2Operators.fnArray).toContain(OPS.paintFormXObjectEnd);
    } finally {
      await task.destroy();
    }
  }, 60_000);

  it('extracts inline, repeated, transformed, RGBA, and form-nested images from the PDFR-06 fixture', async () => {
    applyWorkerConfig();
    const bytes = decodeFixture(embeddedImagesB64);
    let embeddedEncodeCount = 0;
    const reader = new PDFReader(bytes, {
      canvasFactory: () => {
        const canvas = document.createElement('canvas');
        const toDataURL = canvas.toDataURL.bind(canvas);
        canvas.toDataURL = (...args) => {
          embeddedEncodeCount += 1;
          return toDataURL(...args);
        };
        return canvas;
      },
    });

    try {
      await reader.load();
      const pages = await reader.convert({
        includeText: false,
        includePageImage: false,
        includeEmbeddedImages: true,
      });

      expect(pages).toHaveLength(2);
      expect(pages[0]?.images).toHaveLength(6);
      expect(pages[1]?.images).toHaveLength(1);

      expect(pages[0]?.images.map((image) => image.transform)).toEqual([
        [10, 0, 0, 10, 10, 10],
        [10, 0, 0, 10, 30, 10],
        [10, 0, 0, 10, 50, 10],
        [6, 0, 0, 8, 20, 22],
        [-10, 0, 0, 10, 90, 10],
        [10, 0, 0, 10, 10, 40],
      ]);
      expect(pages[0]?.images.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
        { x: 10, y: 20, width: 10, height: 10 },
        { x: 30, y: 20, width: 10, height: 10 },
        { x: 50, y: 20, width: 10, height: 10 },
        { x: 20, y: 30, width: 6, height: 8 },
        { x: 80, y: 20, width: 10, height: 10 },
        { x: 10, y: 50, width: 10, height: 10 },
      ]);
      expect(pages[0]?.images.map((image) => image.dataUrl.startsWith('data:image/png;base64,'))).toEqual([
        true,
        true,
        true,
        true,
        true,
        true,
      ]);
      expect(pages[0]?.images.map((image) => image.size)).toEqual([4, 4, 4, 4, 4, 4]);
      expect(embeddedEncodeCount).toBe(4);

      expect(pages[1]?.images[0]).toMatchObject({
        x: 30,
        y: 80,
        width: 20,
        height: 30,
        size: 4,
        transform: [20, 0, 0, 30, 30, 50],
      });
      expect(pages[1]?.images[0]?.dataUrl).toMatch(/^data:image\/png;base64,/);
    } finally {
      await reader.destroy();
      await assertNoLeakedDocument(reader);
    }
  }, 60_000);

  it('decodes one-bit image XObjects to correct pixels with bitmap conversion enabled and disabled', async () => {
    applyWorkerConfig();
    const white = [255, 255, 255, 255];
    const black = [0, 0, 0, 255];
    // 9x2 fixture rows: row 0 is W,B,W,B,W,B,W,B,W; row 1 is B,W,B,W,B,W,B,W,B.
    const wideRow = (first: number[]) => {
      const second = first === white ? black : white;
      return [first, second, first, second, first, second, first, second, first].flat();
    };
    const expectedWide = [...wideRow(white), ...wideRow(black)];

    for (const isOffscreenCanvasSupported of [true, false]) {
      // Fresh bytes per iteration: PDF.js may transfer (detach) the typed
      // array to its worker during load, so a shared buffer cannot load twice.
      const iterationBytes = decodeFixture(embeddedOneBitB64);
      const reader = new PDFReader({ data: iterationBytes, isOffscreenCanvasSupported } as never, {
        canvasFactory: () => document.createElement('canvas'),
      });
      try {
        await reader.load();
        const pages = await reader.convert({
          includeText: false,
          includePageImage: false,
          includeEmbeddedImages: true,
        });
        expect(pages).toHaveLength(1);
        expect(pages[0]?.images).toHaveLength(2);

        // Single white pixel: the pre-fix length-inferred path returned gray
        // `[128,128,128,255]` for this `0x80` byte with bitmaps disabled.
        const single = await pixelsOfDataUrl(pages[0]?.images[0]?.dataUrl ?? '');
        expect([single.width, single.height]).toEqual([1, 1]);
        expect(single.data).toEqual(white);

        const wide = await pixelsOfDataUrl(pages[0]?.images[1]?.dataUrl ?? '');
        expect([wide.width, wide.height]).toEqual([9, 2]);
        expect(wide.data).toEqual(expectedWide);
      } finally {
        await reader.destroy();
        await assertNoLeakedDocument(reader);
      }
    }
  }, 120_000);

  it.each(['direct', 'nested'] as const)('uses iframe signals: %s load and conversion (PDFR4-03)', async (mode) => {
    applyWorkerConfig();
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const realm = iframe.contentWindow as Window & typeof globalThis;
    const controller = new realm.AbortController();
    expect(controller.signal).not.toBeInstanceOf(AbortSignal);
    expect(controller.signal).toBeInstanceOf(realm.AbortSignal);
    let releasePolicy!: () => void;
    const policyGate = new Promise<void>((resolve) => {
      releasePolicy = resolve;
    });
    const sourcePolicy = vi.fn(() => policyGate);
    const reader = new PDFReader(decodeFixture(sampleB64), { sourcePolicy });
    const load = (signal: AbortSignal) => (mode === 'direct' ? reader.load(signal) : reader.load({ signal }));
    let releaseText!: () => void;
    const textGate = new Promise<void>((resolve) => {
      releaseText = resolve;
    });
    try {
      const preAborted = new realm.AbortController();
      preAborted.abort();
      expect(() => load(preAborted.signal)).toThrowError(expect.objectContaining({ code: 'ABORTED' }));
      expect(sourcePolicy).not.toHaveBeenCalled();
      const add = vi.spyOn(controller.signal, 'addEventListener');
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const pending = load(controller.signal);
      const cancelled = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
      expect(sourcePolicy).toHaveBeenCalledOnce();
      controller.abort();
      await cancelled;
      expect(add).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
      releasePolicy();

      const active = new realm.AbortController();
      const documentProxy = await load(active.signal);
      await expect(load(active.signal)).resolves.toBe(documentProxy);
      expect(() => load(controller.signal)).toThrowError(expect.objectContaining({ code: 'ABORTED' }));
      const page = await documentProxy.getPage(1);
      const getTextContent = page.getTextContent.bind(page);
      let textStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        textStarted = resolve;
      });
      vi.spyOn(page, 'getTextContent').mockImplementationOnce(async (...args) => {
        const text = await getTextContent(...args);
        textStarted();
        await textGate;
        return text;
      });
      const pageAdd = vi.spyOn(active.signal, 'addEventListener');
      const pageRemove = vi.spyOn(active.signal, 'removeEventListener');
      const conversion = reader.convert({ signal: active.signal, includePageImage: false });
      const conversionCancelled = expect(conversion).rejects.toMatchObject({ code: 'ABORTED' });
      await started;
      active.abort();
      await conversionCancelled;
      expect(pageAdd).toHaveBeenCalled();
      for (const [event, callback] of pageAdd.mock.calls) expect(pageRemove).toHaveBeenCalledWith(event, callback);
      expect(reader.state).toBe('loaded');
      releaseText();
      const success = new realm.AbortController();
      const successAdd = vi.spyOn(success.signal, 'addEventListener');
      const successRemove = vi.spyOn(success.signal, 'removeEventListener');
      const results = await reader.convert({ signal: success.signal, includePageImage: false });
      expect(textOf(results[0])).toContain('Page 1 text');
      expect(successAdd).toHaveBeenCalled();
      for (const [event, callback] of successAdd.mock.calls)
        expect(successRemove).toHaveBeenCalledWith(event, callback);
    } finally {
      releasePolicy();
      releaseText();
      await reader.destroy();
      iframe.remove();
      await assertNoLeakedDocument(reader);
    }
  });

  it('extracts a cross-page shared image on every page via the document-wide store (PDFR3-13)', async () => {
    applyWorkerConfig();
    // PDFR3-07 reproduced this as a defect: the same image Ref painted on
    // >= 2 pages is globalized by the worker into `page.commonObjs` under a
    // `g_`-prefixed ID, and the pre-fix extractor (page.objs only) omitted
    // the page 2-3 paints. The fixed adapter routes `g_` IDs to
    // `page.commonObjs` and awaits readiness via callback-form `get`.
    const bytes = decodeFixture(embeddedSharedB64);
    const reader = new PDFReader(bytes, {
      canvasFactory: () => document.createElement('canvas'),
    });
    try {
      await reader.load();
      const pages = await reader.convert({
        includeText: false,
        includePageImage: false,
        includeEmbeddedImages: true,
      });

      // Two paints on page 1, one paint each on pages 2-3: all four must be
      // extracted, pre- and post-render identical (rendering never moves the
      // object between stores, per the PDFR3-07 probe measurements).
      expect(pages).toHaveLength(3);
      expect(pages[0]?.images).toHaveLength(2);
      expect(pages[1]?.images).toHaveLength(1);
      expect(pages[2]?.images).toHaveLength(1);

      expect(pages[0]?.images.map((image) => image.transform)).toEqual([
        [8, 0, 0, 8, 10, 10],
        [8, 0, 0, 8, 30, 10],
      ]);
      expect(pages[1]?.images[0]?.transform).toEqual([8, 0, 0, 8, 10, 10]);
      expect(pages[2]?.images[0]?.transform).toEqual([8, 0, 0, 8, 10, 10]);

      // Solid-red 8x8 DeviceRGB fixture: every extracted paint must decode
      // to exact red pixels end to end, whichever PDF.js image path served it.
      const red = [255, 0, 0, 255];
      const expected = Array.from({ length: 8 * 8 }, () => red).flat();
      for (const page of pages) {
        for (const image of page.images) {
          const decoded = await pixelsOfDataUrl(image.dataUrl);
          expect([decoded.width, decoded.height]).toEqual([8, 8]);
          expect(decoded.data).toEqual(expected);
        }
      }
    } finally {
      await reader.destroy();
      await assertNoLeakedDocument(reader);
    }
  }, 120_000);

  it('preserves real cached images across cancel/immediate retry (PDFR4-02)', async () => {
    applyWorkerConfig();
    const reader = new PDFReader(decodeFixture(embeddedSharedB64));
    const gate = Promise.withResolvers<void>();
    const firstStarted = Promise.withResolvers<void>();
    const retryStarted = Promise.withResolvers<void>();
    try {
      const doc = await reader.load();
      const page = await doc.getPage(1);
      expect(await doc.getPage(1)).toBe(page);
      // Gate actual PDF.js operator generation, not just delivery of an already
      // completed list. getOperatorList still creates/caches its real intent
      // state and both conversions wait on the same PDF.js promise.
      const internal = page as typeof page & { _pumpOperatorList: (...args: unknown[]) => void };
      const pump = internal._pumpOperatorList.bind(page);
      vi.spyOn(internal, '_pumpOperatorList').mockImplementation((...args) => {
        void gate.promise.then(() => pump(...args));
      });
      const getOperators = page.getOperatorList.bind(page);
      const promises: ReturnType<typeof getOperators>[] = [];
      vi.spyOn(page, 'getOperatorList').mockImplementation((...args) => {
        const pending = getOperators(...args);
        promises.push(pending);
        if (promises.length === 1) firstStarted.resolve();
        else retryStarted.resolve();
        return pending;
      });
      const cleanup = vi.spyOn(page, 'cleanup');
      const options = { pageRange: 1, includeText: false, includePageImage: false, includeEmbeddedImages: true };
      const controller = new AbortController();
      const cancelled = reader.convert({ ...options, signal: controller.signal });
      await firstStarted.promise;
      controller.abort();
      await expect(cancelled).rejects.toMatchObject({ code: 'ABORTED' });
      expect(cleanup).not.toHaveBeenCalled();
      const retried = reader.convert(options);
      await retryStarted.promise;
      expect(promises[1]).toBe(promises[0]);
      expect(cleanup).not.toHaveBeenCalled();
      gate.resolve();
      const [result] = await retried;
      expect(result?.images).toHaveLength(2);
      expect(cleanup).toHaveBeenCalledOnce();
      const expected = Array.from({ length: 64 }, () => [255, 0, 0, 255]).flat();
      for (const image of result?.images ?? []) {
        const decoded = await pixelsOfDataUrl(image.dataUrl);
        expect([decoded.width, decoded.height]).toEqual([8, 8]);
        expect(decoded.data).toEqual(expected);
      }
    } finally {
      gate.resolve();
      await reader.destroy();
      vi.restoreAllMocks();
      await assertNoLeakedDocument(reader);
    }
  }, 60_000);

  it.each(['abort', 'error'] as const)(
    'render %s: fresh retry (PDFR4-06)',
    async (outcome) => {
      applyWorkerConfig();
      const reader = new PDFReader(decodeFixture(embeddedSharedB64));
      const freshReader = new PDFReader(decodeFixture(embeddedSharedB64));
      const gate = Promise.withResolvers<void>();
      const renderStarted = Promise.withResolvers<void>();
      const lostImage = Promise.withResolvers<never>();
      void lostImage.promise.catch(() => undefined);
      const nativeError = new Error('native render setup failure');
      try {
        const doc = await reader.load();
        const page = await doc.getPage(1);
        const getPage = vi.spyOn(doc, 'getPage');
        // Coordinator-approved replacement of the PDFR4-05 same-reader recovery
        // assertion. The old failure/pixel-loss evidence remains in the task file
        // and render-intents.browser.ts; safe recovery now requires fresh bytes.
        // Keep the real stream reader and render-cancellation behavior. Delay
        // chunk delivery, rather than replacing render/operator promises.
        const internal = page as typeof page & { _renderPageChunk: (...args: unknown[]) => void };
        const deliverChunk = internal._renderPageChunk.bind(page);
        vi.spyOn(internal, '_renderPageChunk').mockImplementation((...args) => {
          void gate.promise.then(() => {
            if (!page.destroyed) deliverChunk(...args);
          });
        });
        const store = page.objs as {
          has(id: string): boolean;
          get(id: string, callback?: (value: unknown) => void): unknown;
          resolve(id: string, value: unknown): void;
          clear(): void;
        };
        const liveIds = new Set<string>();
        const clearedIds = new Set<string>();
        const resolveObject = store.resolve.bind(store);
        const clearObjects = store.clear.bind(store);
        const getObject = store.get.bind(store);
        vi.spyOn(store, 'resolve').mockImplementation((id, value) => {
          liveIds.add(id);
          clearedIds.delete(id);
          resolveObject(id, value);
        });
        vi.spyOn(store, 'clear').mockImplementation(() => {
          for (const id of liveIds) clearedIds.add(id);
          liveIds.clear();
          clearObjects();
        });
        vi.spyOn(store, 'get').mockImplementation((id, callback) => {
          if (clearedIds.has(id) && !store.has(id)) {
            lostImage.reject(new Error(`Retry requested previously resolved image ${id} after PDF.js cleared it.`));
          }
          return getObject(id, callback);
        });
        const render = page.render.bind(page);
        vi.spyOn(page, 'render').mockImplementation((params) => {
          const task = render({
            ...params,
            ...(outcome === 'error' ? { optionalContentConfigPromise: Promise.reject(nativeError) } : {}),
          });
          renderStarted.resolve();
          return task;
        });
        const getOperators = vi.spyOn(page, 'getOperatorList');
        const controller = new AbortController();
        const cancelled = reader.convert({ pageRange: 1, includeText: false, signal: controller.signal });
        await renderStarted.promise;
        if (outcome === 'abort') {
          controller.abort();
          await expect(cancelled).rejects.toMatchObject({ code: 'ABORTED' });
        } else await expect(cancelled).rejects.toBe(nativeError);
        expect(reader.state).toBe('destroyed');
        const options = {
          pageRange: 1,
          includeText: false,
          includePageImage: false,
          includeEmbeddedImages: true,
        };
        await expect(reader.convert(options)).rejects.toMatchObject({ code: 'DESTROYED' });
        await expect(reader.pages(options).next()).rejects.toMatchObject({ code: 'DESTROYED' });
        expect(() => reader.load()).toThrow(expect.objectContaining({ code: 'DESTROYED' }));
        expect(getPage).toHaveBeenCalledOnce();
        expect(getOperators).not.toHaveBeenCalled();
        gate.resolve();
        const destroying = reader.destroy();
        expect(reader.destroy()).toBe(destroying);
        await destroying;
        await freshReader.load();
        // A lost-object event fails immediately instead of waiting for a timeout
        // on the callback PDF.js can no longer fulfill.
        const [result] = await Promise.race([freshReader.convert(options), lostImage.promise]);
        expect(result?.images).toHaveLength(2);
        const expected = Array.from({ length: 64 }, () => [255, 0, 0, 255]).flat();
        for (const image of result?.images ?? []) {
          const decoded = await pixelsOfDataUrl(image.dataUrl);
          expect([decoded.width, decoded.height]).toEqual([8, 8]);
          expect(decoded.data).toEqual(expected);
        }
      } finally {
        gate.resolve();
        await reader.destroy();
        await freshReader.destroy();
        vi.restoreAllMocks();
        await assertNoLeakedDocument(reader);
        await assertNoLeakedDocument(freshReader);
      }
    },
    60_000,
  );

  it.each([
    ['canvasFactory', 'abort'],
    ['canvasFactory', 'destroy'],
    ['viewportScale', 'abort'],
    ['viewportScale', 'destroy'],
  ] as const)('stops real PDF.js work after synchronous %s %s (PDFR4-01)', async (boundary, lifecycle) => {
    applyWorkerConfig();
    const controller = new AbortController();
    const canvas = document.createElement('canvas');
    const cancel = () => (lifecycle === 'abort' ? controller.abort() : void reader.destroy());
    const canvasFactory = vi.fn(() => {
      cancel();
      return canvas;
    });
    const reader = new PDFReader(decodeFixture(sampleB64), { canvasFactory });
    try {
      const documentProxy = await reader.load();
      const page = await documentProxy.getPage(1);
      const render = vi.spyOn(page, 'render');
      const viewport = vi.spyOn(page, 'getViewport');
      const cleanup = vi.spyOn(page, 'cleanup');
      const getContext = vi.spyOn(canvas, 'getContext');
      await expect(
        reader.convert({
          signal: controller.signal,
          includeText: false,
          viewportScale:
            boundary === 'viewportScale'
              ? () => {
                  cancel();
                  return 2;
                }
              : 2,
        }),
      ).rejects.toMatchObject({ code: lifecycle === 'abort' ? 'ABORTED' : 'DESTROYED' });
      expect(render).not.toHaveBeenCalled();
      expect(getContext).not.toHaveBeenCalled();
      expect(viewport).toHaveBeenCalledOnce();
      expect(cleanup).toHaveBeenCalledOnce();
      expect(canvasFactory).toHaveBeenCalledTimes(boundary === 'canvasFactory' ? 1 : 0);
      expect([canvas.width, canvas.height]).toEqual(boundary === 'canvasFactory' ? [0, 0] : [300, 150]);
      if (lifecycle === 'abort') {
        // No render/text/operator work was started by the cancelled operation.
        // A real-peer text-only retry verifies that its reader lock is released.
        const [retried] = await reader.convert({ includePageImage: false });
        expect(textOf(retried)).toBe('Page 1 text');
      }
    } finally {
      await reader.destroy();
      await assertNoLeakedDocument(reader);
      vi.restoreAllMocks();
    }
  });

  it('cancels an active render and surfaces ABORTED without leaving a live canvas or page', async () => {
    applyWorkerConfig();
    const bytes = decodeFixture(multiB64);
    const controller = new AbortController();
    const renderHook = createRenderStartAbortCanvasFactory(controller);
    const reader = new PDFReader(bytes, {
      canvasFactory: renderHook.canvasFactory,
    });

    try {
      await reader.load();
      const collected: PageResult[] = [];
      const iterate = (async () => {
        for await (const page of reader.pages({
          includePageImage: true,
          includeText: false,
          viewportScale: 5,
          signal: controller.signal,
        })) {
          collected.push(page);
        }
      })();

      await renderHook.renderStarted;
      expect(renderHook.getRenderStarted()).toBe(true);
      await expect(iterate).rejects.toMatchObject({ code: 'ABORTED' });
      expect(collected).toHaveLength(0);
      expect(renderHook.getPageImageEncodeCount()).toBe(0);
      // Automatic public teardown has started; explicit destruction joins it.
      expect(reader.state).toBe('destroyed');
      await expect(reader.destroy()).resolves.toBeUndefined();
    } finally {
      await reader.destroy();
      await assertNoLeakedDocument(reader);
    }
  }, 60_000);

  it('negates deep-import regressions: built ESM exposes only the documented named exports and no default', () => {
    // The browser bundle is the consumer-visible artifact, so a present
    // default export or an accidentally re-exported deep path would be a
    // real public-contract regression.
    expect((pkg as unknown as { default?: unknown }).default).toBeUndefined();
    expect(typeof pkg.configurePdfWorker).toBe('function');
    expect(typeof pkg.PDFReader).toBe('function');
    expect(typeof pkg.PdfReaderError).toBe('function');
  });
});
