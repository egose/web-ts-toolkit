# `@web-ts-toolkit/pdf-reader`

Resource-safe browser PDF rendering, text extraction, and best-effort embedded-image extraction built on PDF.js.

## Installation

```sh
pnpm add @web-ts-toolkit/pdf-reader pdfjs-dist
```

`pdfjs-dist` is a peer dependency. This package is browser-oriented, ESM-only, and requires DOM canvas APIs.

Canonical imports use named exports from the package root. There is no default export, no supported deep import, and no supported CommonJS `require()` entry.

## Unreleased Migration

This follow-up release keeps the small named-export API but intentionally does not preserve the older application-local `PDFReader` names and defaults.

| Area                           | Previous contract                                                                                                            | New contract and migration                                                                                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports and worker setup       | The application-local reader was typically imported as a default export and could hide PDF.js worker wiring inside app code. | Import named exports from `@web-ts-toolkit/pdf-reader` and call `configurePdfWorker(...)` in application code. There is no default export, no deep import, and no package-owned worker asset emission.                                                     |
| Load cancellation and teardown | Concurrent callers could accidentally tear down a shared load, and lifecycle states were mostly implicit.                    | Concurrent `load()` callers share one PDF.js task, but aborting one caller rejects only that caller. Use `reader.state` for `new` / `loading` / `loaded` / `iterating` / `failed` / `destroyed`, and call `destroy()` to tear down shared work explicitly. |
| Load options                   | `load()` previously accepted only an `AbortSignal`-style cancellation pattern.                                               | `load()` still accepts an `AbortSignal`, and now also accepts `{ signal, deadlineMs }`. `deadlineMs` is caller-local and rejects with `DEADLINE_EXCEEDED` without cancelling unrelated waiters.                                                            |
| Page image results             | Older code used top-level page result fields such as `dataURL`, `dataUrl`, `mimeType`, and `isPNG`.                          | Read `page.pageImage` instead. `pageImageOutput: 'data-url'` returns `{ kind: 'data-url', mimeType, dataUrl }`; `pageImageOutput: 'blob'` returns `{ kind: 'blob', mimeType, blob }`.                                                                      |
| Convert option names           | Older application-local option names included `getText`, `getDataURL`, `getImages`, and reader `config`.                     | Use `includeText`, `includePageImage`, `includeEmbeddedImages`, and constructor `options`. Unsupported legacy names are intentionally rejected by the type surface instead of being kept as aliases.                                                       |

The repository `CHANGELOG.md` contains the same release-level migration summary.

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

Worker URL emission differs by bundler. Keep this setup in application code where the bundler owns asset handling. Calling `configurePdfWorker(...)` again replaces the previous package-level worker configuration. If you pass an existing `Worker`, you still own terminating it.

## Quick Start

```ts
import { PDFReader } from '@web-ts-toolkit/pdf-reader';

const bytes = new Uint8Array(await file.arrayBuffer());
const reader = new PDFReader(bytes);

try {
  await reader.load({ deadlineMs: 15_000 });

  for await (const page of reader.pages({
    includeText: true,
    includePageImage: true,
    pageImageOutput: 'blob',
    imageFormat: 'image/jpeg',
    jpegQuality: 0.85,
  })) {
    console.log(page.pageNumber, page.text, page.pageImage);
  }
} finally {
  await reader.destroy();
}
```

Use `pages()` for large PDFs because it lets the caller consume and release each result incrementally. `convert(options)` provides the same results as an array for small documents.

For a remote PDF, use `pdfUrlSource(...)` to create constructor-ready PDF.js loading data:

```ts
import { PDFReader, pdfUrlSource } from '@web-ts-toolkit/pdf-reader';

const reader = new PDFReader(
  pdfUrlSource('https://static.example.com/document.pdf', {
    withCredentials: false,
  }),
);
```

Call `load()` before `pages()` or `convert()`. Concurrent `load()` callers share one PDF.js loading task, but aborting one caller only rejects that caller; call `destroy()` to tear down the shared load. `destroy()` is idempotent, permanently closes the reader, cancels active renders, and causes in-flight lifecycle work to reject with `DESTROYED`.

## Reader State And Ownership

`reader.state` exposes the public lifecycle:

| State       | Meaning                                                                              | Legal next states               |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------- |
| `new`       | Reader constructed but `load()` has not started.                                     | `loading`, `destroyed`          |
| `loading`   | One shared PDF.js loading task is in flight.                                         | `loaded`, `failed`, `destroyed` |
| `loaded`    | The PDF.js document is loaded and no page work is active.                            | `iterating`, `destroyed`        |
| `iterating` | `pages()` or `convert()` currently owns a page proxy, render task, or encoder step.  | `loaded`, `destroyed`           |
| `failed`    | The most recent load attempt rejected. A later `load()` call starts a fresh attempt. | `loading`, `destroyed`          |
| `destroyed` | `destroy()` completed or irrevocably won a race. The reader cannot be reused.        | none                            |

Ownership and lifetime rules:

- Source bytes: the package passes your `PdfSource` to PDF.js unchanged after `sourcePolicy(...)` approval. PDF.js may transfer typed-array ownership to its worker during `load()`.
- Pages: `pages()` and `convert()` own the live `PDFPageProxy` only while processing that page. The package calls `page.cleanup()` before yielding the result and on every error path.
- Page canvases: the package owns temporary render/encode canvases and always zeroes their dimensions after each settle path.
- `Blob` page images: the returned `Blob` belongs to the caller. If you create an object URL, revoke it yourself.
- Data URLs: returned strings belong to the caller. They are copies; the package does not retain the temporary canvas after encoding.
- Embedded-image data URLs: these are best-effort PNG copies. Unsupported image operators/layouts are skipped with `logger.warn(...)` diagnostics.
- Documents and workers: the reader owns the loaded `PDFDocumentProxy` and the shared loading task it created. Call `destroy()` in your own `finally` block to terminate document-side resources. When `configurePdfWorker(...)` receives a worker URL, PDF.js owns any worker instances it creates from that URL. When `configurePdfWorker(...)` receives an existing `Worker`, the caller still owns terminating that worker.

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
- `jpegQuality`: finite number from `0` through `1`; defaults to `0.92`. It is applied only when `imageFormat` is `image/jpeg`; PNG output ignores it.
- `includePageImage`: render the complete page and include it under `page.pageImage`; defaults to `true`.
- `pageImageOutput`: `data-url` or `blob`; defaults to `data-url`.
- `includeText`: include PDF.js `TextContent`; defaults to `true`.
- `includeEmbeddedImages`: inspect the operator stream for raster images; defaults to `false`.
- `signal`: cancels active rendering and stops before subsequent expensive operations.

`pageImage` is a discriminated union so the output mode and payload cannot contradict each other:

```ts
if (page.pageImage?.kind === 'blob') {
  const objectUrl = URL.createObjectURL(page.pageImage.blob);
  try {
    preview.src = objectUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

if (page.pageImage?.kind === 'data-url') {
  preview.src = page.pageImage.dataUrl;
}
```

This package returns `Blob` objects directly rather than object URLs so callers keep explicit ownership of any `URL.createObjectURL(...)` lifecycle.

## Performance And Concurrency

Page work remains serial in the runtime API. PDFR-07 adds a real-browser benchmark under `packages/pdf-reader/benchmark/` that compares the current `pages()` behavior against an external page-level scheduler with a hard concurrency bound of `2`, deterministic output ordering, and abort handling.

Run it with:

```sh
pnpm --filter @web-ts-toolkit/pdf-reader benchmark
```

The recorded local run on Headless Chromium `151.0.7922.34` showed bounded overlap materially improving the synthetic `long.pdf` (`207.1 ms` to `107.3 ms`) and `image-heavy.pdf` (`62.3 ms` to `39.3 ms`) fixtures, while `text-heavy.pdf` stayed effectively flat (`69.7 ms` to `72.5 ms`) and peak active pages/canvases deterministically doubled from `1/1` to `2/2`.

The package still does not expose a concurrency option because that evidence is not yet enough to set a safe browser memory/backpressure contract. See the benchmark README and the PDFR-07 completion evidence for the recorded browser/hardware context and full results.

## Resource Limits

Defaults reject documents above 1,000 pages, rendered pages above 40 megapixels, and copied embedded images above 25 megapixels.

```ts
import { PDFReader, PdfReaderError } from '@web-ts-toolkit/pdf-reader';

const reader = new PDFReader(bytes, {
  limits: {
    maxSourceBytes: 25_000_000,
    maxDocumentPages: 250,
    maxCanvasPixels: 20_000_000,
    maxEmbeddedImagePixels: 10_000_000,
  },
  sourcePolicy(source) {
    if (source.url && !source.url.startsWith('https://static.example.com/')) {
      throw new PdfReaderError('SOURCE_POLICY_VIOLATION', 'Remote PDF source rejected by sourcePolicy.');
    }
    if (source.withCredentials || source.hasHttpHeaders) {
      throw new PdfReaderError(
        'SOURCE_POLICY_VIOLATION',
        'Credentialed or header-bearing PDF sources are not allowed.',
      );
    }
  },
  logger: {
    warn(message, error) {
      reportWarning(message, error);
    },
  },
});
```

Limits reduce accidental or malicious memory pressure but are not a complete sandbox. PDF parsing still occurs in PDF.js and its worker.

`maxSourceBytes` is enforced only when the package can know the byte length synchronously, including direct typed arrays, array buffers, number arrays, and `DocumentInitParameters.data`. It does not apply to remote downloads.

`sourcePolicy(source)` runs before `getDocument()` and can reject remote URLs, protocols, origins, credentials, headers, or any other caller-supplied loading parameters. The original source object still passes through unchanged when the policy allows it, so PDF.js passwords, CMap/font/WASM URLs, and caller-created workers remain available.

## Security Notes

- Prefer trusted `Uint8Array` input. PDF.js may transfer ownership of typed-array data to its worker.
- Use `sourcePolicy` to reject remote URLs, protocols, origins, credentialed requests, or header-bearing sources before PDF.js starts network work.
- `configurePdfWorker(...)` mutates PDF.js global worker options only when you call it, not at module evaluation. Reconfiguring it clears the previous URL-or-port setting so stale worker globals do not win unexpectedly.
- Keep `withCredentials` disabled unless cross-origin credentials are explicitly required.
- Use `maxSourceBytes` for synchronously knowable in-memory sources. Remote response-byte limits still belong to application-controlled fetch/range transport because this package does not intercept PDF.js network I/O.
- Use `load({ deadlineMs })` or your own `AbortSignal` to bound load wait time. The package clears deadline timers and abort listeners on success, failure, caller abort, and destroy.
- Keep `pdfjs-dist` current because malformed-document defenses belong primarily to PDF.js.
- Treat extracted text and images as untrusted content. Do not inject text as HTML without escaping or sanitization.

## Embedded Images

Embedded-image extraction stays on the package root as an opt-in convenience (`includeEmbeddedImages: true`), but the operator traversal now lives behind one private extractor boundary instead of mixing PDF.js internals into reader lifecycle code.

The real-browser fixture suite for the supported `pdfjs-dist` peer minor (`~5.7.284`) characterizes inline images, image XObjects, repeated references, nested save/restore transforms, mirrored transforms, grayscale, RGB, RGBA soft-mask images, browser `ImageBitmap`-backed image objects, and nested form XObjects with their own matrices.

Standalone image-mask operators, vector graphics, patterns, and unknown PDF.js image-object layouts remain unsupported. They are skipped with `logger.warn(...)` diagnostics rather than failing the entire page. The extractor never calls `ImageBitmap.close()` because PDF.js owns bitmap lifetime through `page.cleanup()` and document destruction.

Individual unsupported images are skipped. Supply `logger.warn` if those diagnostics matter to the application. Resource-limit and cancellation errors are never swallowed.

Image `x`, `y`, `width`, and `height` values are PDF user-space coordinates before viewport scaling. The full six-value graphics transform is included when consumers need custom coordinate conversion.

## Errors And Cleanup

Validation and resource failures use `PdfReaderError` with stable codes:

- `ABORTED`
- `CANVAS_LIMIT_EXCEEDED`
- `DEADLINE_EXCEEDED`
- `DESTROYED`
- `DOCUMENT_NOT_LOADED`
- `IMAGE_LIMIT_EXCEEDED`
- `INVALID_OPTION`
- `PAGE_LIMIT_EXCEEDED`
- `SOURCE_LIMIT_EXCEEDED`
- `SOURCE_POLICY_VIOLATION`
- `UNSUPPORTED_ENVIRONMENT`

Package-owned errors cover invalid options, lifecycle cancellation/destroy/deadline states, resource limits, source-policy/known-byte rejections, and unsupported canvas/runtime features such as missing 2D contexts or missing `toBlob()` support.

PDF.js loading, password, malformed-document, response, and rendering errors pass through unchanged so callers can use PDF.js error classes. Abort and destroy races are normalized to package `PdfReaderError` codes rather than leaking PDF.js cancellation exceptions. Best-effort embedded-image skips do not throw; they call `logger.warn(...)` when a logger is supplied. Always call `destroy()` from your own `finally` block to terminate reader-owned document resources.
