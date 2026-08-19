# `@web-ts-toolkit/pdf-reader`

Resource-safe browser PDF rendering, text extraction, and best-effort embedded-image extraction built on PDF.js.

## Installation

```sh
pnpm add @web-ts-toolkit/pdf-reader pdfjs-dist
```

`pdfjs-dist` is a peer dependency. This package is browser-oriented and requires DOM canvas APIs.

Canonical imports use named exports from the package root. There is no default export or supported deep import.

## Worker Setup

Configure the PDF.js worker explicitly in your application. The package does not use bundler-specific `?url` imports and does not mutate PDF.js globals merely by being imported.

Vite example:

```ts
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { configurePdfWorker } from '@web-ts-toolkit/pdf-reader';

configurePdfWorker(workerUrl);
```

Alternatively, pass an existing module `Worker`:

```ts
import { configurePdfWorker } from '@web-ts-toolkit/pdf-reader';

configurePdfWorker(new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' }));
```

Worker URL emission differs by bundler. Keep this setup in application code where the bundler owns asset handling.

## Quick Start

```ts
import { PDFReader } from '@web-ts-toolkit/pdf-reader';

const bytes = new Uint8Array(await file.arrayBuffer());
const reader = new PDFReader(bytes);

try {
  await reader.load();

  for await (const page of reader.pages({
    includeText: true,
    includePageImage: true,
    imageFormat: 'image/jpeg',
    jpegQuality: 0.85,
  })) {
    console.log(page.pageNumber, page.text, page.dataUrl);
  }
} finally {
  await reader.destroy();
}
```

Use `pages()` for large PDFs because it lets the caller consume and release each result incrementally. `convert(options)` provides the same results as an array for small documents.

Call `load()` before `pages()` or `convert()`. `load()` is idempotent, and `destroy()` is idempotent and permanently closes the reader.

## Options

```ts
const pages = await reader.convert({
  pageRange: [2, 5],
  viewportScale: (width, height) => (width > height ? 1 : 1.5),
  imageFormat: 'image/png',
  includePageImage: true,
  includeText: true,
  includeEmbeddedImages: false,
  signal: abortController.signal,
});
```

- `pageRange`: one 1-based page number or an inclusive tuple. Reversed tuples are accepted and normalized.
- `viewportScale`: positive number or page-size callback; defaults to `1.5`.
- `imageFormat`: `image/png` or `image/jpeg`; defaults to PNG.
- `jpegQuality`: finite number from `0` through `1`; defaults to `0.92`.
- `includePageImage`: render the complete page to a data URL; defaults to `true`.
- `includeText`: include PDF.js `TextContent`; defaults to `true`.
- `includeEmbeddedImages`: inspect the operator stream for raster images; defaults to `false`.
- `signal`: cancels active rendering and stops before subsequent expensive operations.

## Resource Limits

Defaults reject documents above 1,000 pages, rendered pages above 40 megapixels, and copied embedded images above 25 megapixels.

```ts
const reader = new PDFReader(bytes, {
  limits: {
    maxDocumentPages: 250,
    maxCanvasPixels: 20_000_000,
    maxEmbeddedImagePixels: 10_000_000,
  },
  logger: {
    warn(message, error) {
      reportWarning(message, error);
    },
  },
});
```

Limits reduce accidental or malicious memory pressure but are not a complete sandbox. PDF parsing still occurs in PDF.js and its worker.

## Security Notes

- Prefer trusted `Uint8Array` input. PDF.js may transfer ownership of typed-array data to its worker.
- Validate remote URLs against an application allowlist before constructing a reader. URL sources cause PDF.js to perform network requests, and PDF.js loading options can include credentials or headers.
- Keep `withCredentials` disabled unless cross-origin credentials are explicitly required.
- Apply application-level file-byte and processing-time limits before calling this package.
- Keep `pdfjs-dist` current because malformed-document defenses belong primarily to PDF.js.
- Treat extracted text and images as untrusted content. Do not inject text as HTML without escaping or sanitization.

## Embedded Images

Embedded-image extraction is intentionally opt-in and best effort. It handles common raster image paint operators and current graphics transforms, including grayscale, RGB, RGBA, and `ImageBitmap` data. It may not reconstruct masks, vector graphics, patterns, nested form XObjects, or every PDF.js internal image representation. The rendered page image is the reliable visual output.

Individual unsupported images are skipped. Supply `logger.warn` if those diagnostics matter to the application. Resource-limit and cancellation errors are never swallowed.

Image `x`, `y`, `width`, and `height` values are PDF user-space coordinates before viewport scaling. The full six-value graphics transform is included when consumers need custom coordinate conversion.

## Errors And Cleanup

Validation and resource failures use `PdfReaderError` with stable codes:

- `ABORTED`
- `CANVAS_LIMIT_EXCEEDED`
- `DOCUMENT_NOT_LOADED`
- `IMAGE_LIMIT_EXCEEDED`
- `INVALID_OPTION`
- `PAGE_LIMIT_EXCEEDED`

PDF.js loading, password, and malformed-document errors pass through unchanged so callers can use PDF.js error classes. Page cleanup and canvas release run in `finally` blocks. Always call `destroy()` from your own `finally` block to terminate the document and worker.
