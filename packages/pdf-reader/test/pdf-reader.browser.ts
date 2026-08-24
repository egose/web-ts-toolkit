import { describe, expect, it } from 'vitest';

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
import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// `?raw` is a Vite built-in that inlines the file as a string import.
import sampleB64 from './fixtures/generated/sample.pdf.base64.txt?raw';
import multiB64 from './fixtures/generated/multi.pdf.base64.txt?raw';
import malformedB64 from './fixtures/generated/malformed.pdf.base64.txt?raw';
import encryptedB64 from './fixtures/generated/encrypted.pdf.base64.txt?raw';
import embeddedImagesB64 from './fixtures/generated/embedded-images.pdf.base64.txt?raw';

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
  const items = (page.text as unknown as { items: Array<{ str?: string }> }).items;
  return items.map((item) => item.str ?? '').join('');
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
      // The `pages()` generator's `finally` block released the active page
      // even on the abort path; the reader's `destroy()` must be a no-op.
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
