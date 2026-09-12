# `@web-ts-toolkit/pdf-reader`

Resource-safe browser PDF rendering, text extraction, and best-effort embedded-image extraction built on PDF.js.

## Installation

```sh
pnpm add @web-ts-toolkit/pdf-reader pdfjs-dist@~6.2.108
```

`pdfjs-dist` is a peer dependency. This package is browser-oriented, ESM-only, and requires DOM canvas APIs. Automated browser compatibility coverage currently runs the real PDF.js worker and browser canvas suite in Headless Chromium only. Firefox and WebKit are not claimed by the automated package test boundary until their Playwright browsers are added to `vitest.browser.config.mts` and pass the same fixture suite in CI.

The supported PDF.js compatibility contract is the `pdfjs-dist` `~6.2.108` peer minor. The package test and real-browser fixture suite run against `6.2.108`; future `6.x` minors are not admitted until rendering and embedded-image compatibility are exercised in a reproducible browser matrix.

Canonical imports use named exports from the package root. There is no default export, no supported deep import, and no supported CommonJS `require()` entry.

## Unreleased Migration

This follow-up release keeps the small named-export API but intentionally does not preserve the older application-local `PDFReader` names and defaults.

| Area                            | Previous contract                                                                                                            | New contract and migration                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports and worker setup        | The application-local reader was typically imported as a default export and could hide PDF.js worker wiring inside app code. | Import named exports from `@web-ts-toolkit/pdf-reader` and call `configurePdfWorker(...)` in application code. There is no default export, no deep import, and no package-owned worker asset emission.                                                                                                                                                                                                                                            |
| Load cancellation and teardown  | Concurrent callers could accidentally tear down a shared load, and lifecycle states were mostly implicit.                    | Concurrent `load()` callers share one PDF.js task, but aborting one caller rejects only that caller. The `PDFDocumentProxy` returned by `load()` is borrowed; inspect it if needed, but call `reader.destroy()` instead of `document.destroy()`. Use `reader.state` for `new` / `loading` / `loaded` / `iterating` / `failed` / `destroyed`.                                                                                                      |
| Load options                    | `load()` previously accepted only an `AbortSignal`-style cancellation pattern.                                               | `load()` still accepts an `AbortSignal`, and now also accepts `{ signal, deadlineMs }`. `deadlineMs` is caller-local and rejects with `DEADLINE_EXCEEDED` without cancelling unrelated waiters.                                                                                                                                                                                                                                                   |
| Page image results              | Older code used top-level page result fields such as `dataURL`, `dataUrl`, `mimeType`, and `isPNG`.                          | Read `page.pageImage` instead. `pageImageOutput: 'data-url'` returns `{ kind: 'data-url', mimeType, dataUrl }`; `pageImageOutput: 'blob'` returns `{ kind: 'blob', mimeType, blob }`. Keep blob object URLs alive through `decode()`/display and revoke on replacement/disposal/error; the package returns `Blob`s, never object URLs.                                                                                                            |
| Convert option names            | Older application-local option names included `getText`, `getDataURL`, `getImages`, and reader `config`.                     | Use `includeText`, `includePageImage`, `includeEmbeddedImages`, and constructor `options`. Unsupported legacy names are intentionally rejected by the type surface instead of being kept as aliases.                                                                                                                                                                                                                                              |
| Source snapshot and byte limits | Earlier docs left header stabilization, byte accounting, and retry behavior implicit.                                        | Effective headers are snapshotted once before `sourcePolicy(...)` and shared with PDF.js; in-memory `data` stays borrowed with its size rechecked after approval, and growth during approval fails before loading. Known byte lengths cover binary strings (one byte per code unit), number arrays (one byte per entry, length-first), and buffer/view `byteLength`. Synchronous load failures report `failed` and permit a fresh `load()` retry. |
| Page-stage cancellation         | Lifecycle prose combined load, page-operation, and teardown contracts.                                                       | Page-stage waits (`getPage`, text, operator list, render, encoding) settle promptly with `ABORTED`/`DESTROYED` via one shared wait contract, but underlying PDF.js work stays uncancellable and is observed only for cleanup; see the Load, Page-operation, and Teardown contracts below. A caller-created `PDFWorker` stays caller-owned and must be destroyed explicitly even when `reader.destroy()` rejects.                                  |
| Option and output validation    | Invalid runtime options and canvas results were partly unchecked.                                                            | Unsupported MIME values, malformed ranges, non-number/non-function scales, non-boolean flags, out-of-range deadlines, and empty/mismatched canvas encodes are rejected with `INVALID_OPTION` or `UNSUPPORTED_ENVIRONMENT` before page work or result publication. Caller-created canvases must be fresh DOM `HTMLCanvasElement`s.                                                                                                                 |
| Images and performance claims   | Image layout handling and benchmark retention needed bounded evidence.                                                       | One-bit (`GRAYSCALE_1BPP`) images decode by declared kind with row padding (unsupported layouts warn/skip); shared `g_` references resolve via `commonObjs` with readiness waits. Page work stays serial (`OPERATION_IN_PROGRESS` on overlap); text/operator limits still apply after PDF.js returns complete structures, with no streaming-text or concurrency API change in this release.                                                       |

Release-note evidence for this follow-up is recorded in this README, the website package docs, and the task completion record. `CHANGELOG.md` was intentionally not edited for PDFR2-05 per maintainer instruction.

## Worker Setup

Configure the PDF.js worker explicitly in your application. The package does not use bundler-specific `?url` imports and does not mutate PDF.js globals merely by being imported.

`configurePdfWorker(...)` writes PDF.js application-global worker state (`GlobalWorkerOptions.workerSrc` or `workerPort`) for the current JavaScript realm. Use it once at application startup only when every PDF.js consumer can share the same setting. Calling it again replaces the previous global URL-or-port setting and can collide with other direct or transitive PDF.js users.

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

Worker URL emission differs by bundler. Keep this setup in application code where the bundler owns asset handling. The package emits no worker asset itself: the URL above is emitted by the application's bundler (Vite's `?url` import) and handed to `configurePdfWorker(...)` before the first `load()`. If you pass an existing `Worker`, you still own terminating it.

A DOM `Worker` is the browser thread primitive. A PDF.js `PDFWorker` is PDF.js's ownership wrapper around one such thread: it runs the PDF.js worker script and multiplexes document tasks over it. When `getDocument()` creates its own `PDFWorker` internally (the default path when the source carries no `worker`), PDF.js attaches it to the loading task and destroys it with `task.destroy()`. A caller-created `PDFWorker` passed on the source is never adopted: the task leaves its worker slot empty, so neither `reader.destroy()` nor PDF.js teardown destroys it — the caller must.

For per-document isolation, skip the global helper and pass a caller-created PDF.js `PDFWorker` through the source object. The public `PdfSource` type accepts PDF.js `DocumentInitParameters`, including its `worker` field:

```ts
import { PDFWorker } from 'pdfjs-dist';
import { PDFReader } from '@web-ts-toolkit/pdf-reader';

const worker = new PDFWorker({ name: 'tenant-a' });
const reader = new PDFReader({ data: bytes, worker });

try {
  await reader.load();
  // ... pages()/convert() ...
} finally {
  try {
    await reader.destroy();
  } finally {
    await worker.destroy();
  }
}
```

The nested `finally` destroys the caller-owned worker even when `reader.destroy()` rejects (for example, after a load failure). Destroy the reader first so in-flight document work settles before the worker goes away. When the `PDFWorker` wraps an externally supplied DOM `Worker` port instead of creating its own thread, also terminate that `Worker` yourself: `PDFWorker.destroy()` releases PDF.js state but does not terminate a caller-supplied port's thread.

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

### Load contract

Call `load()` before `pages()` or `convert()`. Concurrent `load()` callers share one PDF.js loading task, but aborting one caller only rejects that caller. The fulfilled `load()` value is the reader-owned PDF.js `PDFDocumentProxy` exposed as a borrowed interoperability handle. You may inspect metadata or call supported PDF.js read methods, but do not call `document.destroy()` on it while the reader owns the lifecycle; call `reader.destroy()` instead. External proxy destruction is unsupported because PDF.js does not provide a reliable ownership notification to keep `reader.state` authoritative after that mutation. A rejected load attempt reports `failed` and a later `load()` starts a fresh attempt.

### Page-operation contract

Page operations are reader-serial: at most one executing `pages()` iterator or `convert()` call may be active per `PDFReader`. A second overlapping page operation fails fast with `OPERATION_IN_PROGRESS` before acquiring a page proxy or allocating a canvas; create a separate reader if you need independent concurrent conversions. Calling `pages()` only creates an iterator object and does not reserve the reader until the iterator starts executing. Page-stage waits (`getPage`, text, operator list, render, encoding) settle promptly on abort/destroy via one shared wait contract, but racing never cancels the underlying PDF.js work, which continues uncancellable in the background owned only for cleanup observation. A late `getPage()` fulfillment is cleaned exactly once and never processed; late text/operator values are dropped and late rejections observed, so a subsequent conversion may safely acquire the same reader/page immediately after the prior operation settles. A suspended `pages()` generator only observes abort/destroy when the consumer resumes or closes it; destruction cannot force suspended consumer code to run.

### Teardown contract

`destroy()` is idempotent, permanently closes the reader, cancels active renders, and causes in-flight lifecycle work to reject with `DESTROYED`. It waits for PDF.js loading/document destruction, but active `pages()` or `convert()` calls finish their own page and canvas cleanup as those operation promises settle; await those operations if you need to observe that cleanup. A caller-created `PDFWorker` on the source stays caller-owned: destroy it explicitly in your own `finally` block even when `destroy()` rejects (see Worker Setup).

## Reader State And Ownership

`reader.state` exposes the public lifecycle:

| State       | Meaning                                                                              | Legal next states               |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------- |
| `new`       | Reader constructed but `load()` has not started.                                     | `loading`, `destroyed`          |
| `loading`   | One shared PDF.js loading task is in flight.                                         | `loaded`, `failed`, `destroyed` |
| `loaded`    | The PDF.js document is loaded and no page operation is active.                       | `iterating`, `destroyed`        |
| `iterating` | One executing `pages()` iterator or `convert()` call owns the reader page operation. | `loaded`, `destroyed`           |
| `failed`    | The most recent load attempt rejected. A later `load()` call starts a fresh attempt. | `loading`, `destroyed`          |
| `destroyed` | `destroy()` completed or irrevocably won a race. The reader cannot be reused.        | none                            |

Ownership and lifetime rules:

- Source bytes: the package snapshots the top-level PDF.js loading parameters once before `sourcePolicy(...)` runs and passes that same snapshot to PDF.js after approval. In-memory `data` stays a borrowed reference (never copied by the package); its byte size is rechecked after approval, so growth during approval still fails before loading. PDF.js may transfer typed-array ownership to its worker during `load()`, detaching the caller's buffer.
- Loaded document proxy: `load()` returns the borrowed `PDFDocumentProxy` owned by the reader. Callers may use supported PDF.js read APIs on it, but external `document.destroy()` is unsupported and can leave `reader.state` reporting `loaded` until a later PDF.js method fails.
- Public aliases: `LoadedPdfDocument` and `LoadedPdfPage` intentionally expose PDF.js proxy types for adjacent interoperability code. The reader API returns `LoadedPdfDocument` from `load()` and package `PageResult` objects from `pages()`/`convert()`; it does not return raw page proxies.
- Pages: one executing `pages()` iterator or `convert()` call owns the reader-level page operation at a time. Within that operation, the package owns one live `PDFPageProxy` only while processing the current page and calls `page.cleanup()` before yielding the result and on every error path. A late `getPage()` that fulfills after abort/destroy won is cleaned exactly once in the background and never processed, so sequential reuse after settle cannot overlap orphaned work.
- Page canvases: the package owns temporary render/encode canvases and always zeroes their dimensions after each settle path.
- `Blob` page images: the returned `Blob` belongs to the caller. If you create an object URL, keep it alive through decoding/display and revoke it yourself on replacement, disposal, or error (see the preview example below).
- Data URLs: returned strings belong to the caller. They are copies; the package does not retain the temporary canvas after encoding.
- Embedded-image data URLs: these are best-effort PNG copies. Repeated image XObject placements on one page share one encoded PNG string while each returned image keeps its own transform and coordinates. Unsupported image operators/layouts are skipped with `logger.warn(...)` diagnostics.
- Documents and workers: the reader owns the loaded `PDFDocumentProxy` and the shared loading task it created. Call `destroy()` in your own `finally` block to terminate document-side resources, and destroy a caller-created `PDFWorker` in a nested `finally` even when `destroy()` rejects (see Worker Setup). `configurePdfWorker(...)` mutates PDF.js application-global worker state; use a per-source PDF.js `PDFWorker` when separate readers need isolated worker configuration. When `configurePdfWorker(...)` receives a worker URL, PDF.js owns any worker instances it creates from that URL. When `configurePdfWorker(...)` receives an existing `Worker`, the caller still owns terminating that worker.

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

Constructor `canvasFactory`, when supplied, must create a fresh DOM `HTMLCanvasElement` for each package-owned render or embedded-image copy. Non-DOM canvas objects are not part of the documented runtime contract unless they satisfy the browser `HTMLCanvasElement` behavior used by PDF.js and this package.

`pageImage` is a discriminated union so the output mode and payload cannot contradict each other. This package returns `Blob` objects directly rather than object URLs so callers keep explicit ownership of any `URL.createObjectURL(...)` lifecycle. Keep the URL alive through decoding/display: revoking it immediately after assigning `preview.src` invalidates the preview before it loads.

Self-contained browser preview with one live URL at a time, released on replacement, disposal, or error:

```ts
function showBlobPreview(preview: HTMLImageElement, blob: Blob): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  const previous = preview.dataset.previewUrl;
  preview.dataset.previewUrl = objectUrl;
  if (previous) URL.revokeObjectURL(previous);
  preview.src = objectUrl;
  return preview.decode().catch((error: unknown) => {
    // The preview never displayed: release the URL just installed.
    if (preview.dataset.previewUrl === objectUrl) {
      delete preview.dataset.previewUrl;
      preview.removeAttribute('src');
    }
    URL.revokeObjectURL(objectUrl);
    throw error;
  });
}

function releaseBlobPreview(preview: HTMLImageElement): void {
  const current = preview.dataset.previewUrl;
  if (current) {
    delete preview.dataset.previewUrl;
    preview.removeAttribute('src');
    URL.revokeObjectURL(current);
  }
}

if (page.pageImage?.kind === 'blob') {
  try {
    await showBlobPreview(preview, page.pageImage.blob);
  } catch {
    showPreviewFallback();
  }
  // ... later, when the preview is replaced or the view is disposed:
  // releaseBlobPreview(preview);
}

if (page.pageImage?.kind === 'data-url') {
  preview.src = page.pageImage.dataUrl;
}
```

## Performance And Concurrency

Page work is serial per reader in the runtime API. A loaded `PDFReader` permits one executing `pages()` iterator or `convert()` call at a time and rejects overlap with `OPERATION_IN_PROGRESS`; it does not queue page operations. PDFR-07 adds a real-browser benchmark under `packages/pdf-reader/benchmark/` that compares the current `pages()` behavior against an external page-level scheduler candidate (not a runtime API) with concurrency `2`, a declared reorder window of `2` retained completed-but-unemittable pages, deterministic output ordering, and stage-synchronized abort handling.

Run it with:

```sh
pnpm --filter @web-ts-toolkit/pdf-reader benchmark
```

The current baseline (2026-09-12, Headless Chromium `151.0.7922.34`, `pdfjs-dist 6.2.108`, 1 warmup + 3 measured repeats) reports conversion-only, load, and load-inclusive times separately, with global simultaneous page/canvas peaks: `long.pdf` converts at a median `220.4 ms` serial vs `176.6 ms` bounded with simultaneous `2/2` ownership and retention within the window, while the bounded path loads a second document (~110–150 ms extra) so load-inclusive totals still favor serial on these small fixtures. `text-heavy.pdf` and `image-heavy.pdf` show modest conversion-only gains with the same doubled ownership. Peaks count PDF.js-internal page proxies and package-owned canvases simultaneously across both documents; PDF.js worker heap and compositor memory are excluded. The 2026-08-19 single-sample numbers are preserved as historical in the benchmark README and must not be compared sample-for-sample.

The package still does not expose a concurrency option because that evidence is not yet enough to set a safe browser memory/backpressure contract, and no runtime concurrency or Blob-output change is proposed on the basis of these numbers. See the benchmark README and the PDFR-07 completion evidence for the recorded browser/hardware context and full results.

Overlapping `pages()` or `convert()` calls on the same reader are newly rejected rather than being allowed to multiply active page/canvas ownership. Sequential reuse after the prior operation finishes is still supported.

## Resource Limits

Defaults reject documents above 1,000 pages, one page's retained text above 50,000 items or 5,000,000 string code units, embedded-image extraction above 100,000 PDF.js operators, rendered pages above 40 megapixels, one copied embedded image above 25 megapixels, one page above 1,000 extracted embedded images, and one page above 100 megapixels of aggregate decoded embedded-image pixels.

```ts
import { PDFReader, PdfReaderError } from '@web-ts-toolkit/pdf-reader';

const reader = new PDFReader(bytes, {
  limits: {
    maxSourceBytes: 25_000_000,
    maxDocumentPages: 250,
    maxTextItems: 10_000,
    maxTextCodeUnits: 1_000_000,
    maxOperatorCount: 20_000,
    maxCanvasPixels: 20_000_000,
    maxEmbeddedImagePixels: 10_000_000,
    maxEmbeddedImages: 250,
    maxEmbeddedImagePixelsTotal: 40_000_000,
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

`maxSourceBytes` is enforced only when the package can know the byte length synchronously, including direct typed arrays, array buffers, number arrays, binary strings, and `DocumentInitParameters.data`. Binary strings count one byte per code unit and number arrays one byte per entry, matching PDF.js conversion; oversized arrays are rejected by length without traversing entries. The check runs before `sourcePolicy(...)` and again after approval, so arrays extended or resizable buffers grown during approval still fail before loading. It does not apply to remote downloads.

Text and operator limits are enforced after PDF.js returns a complete page text content or operator list, but before the package retains the text result or traverses the operator list. These checks bound package-owned processing and returned results; they cannot prevent PDF.js from initially constructing those PDF.js structures.

Embedded-image limits are enforced before allocating or encoding the next extracted embedded-image canvas. `maxEmbeddedImagePixels` applies to one copied image, `maxEmbeddedImages` applies to extracted images returned for one page, and `maxEmbeddedImagePixelsTotal` applies to aggregate decoded pixels copied for one page, including repeated references to the same underlying PDF image object. Repeated image XObject references reuse one encoded data URL per page only after these aggregate placement limits pass; inline images are not cached by synthetic keys. Unsafe non-finite or overflowing image dimensions fail closed with a resource-limit error. Exact aggregate encoded PNG data-url bytes are not knowable until after browser canvas encoding, so the package does not claim a separate pre-encoding output-byte cap; use the decoded-pixel limits to bound package allocation and encoding work.

`sourcePolicy(source)` runs before `getDocument()` and can reject remote URLs, protocols, origins, credentials, headers, or any other caller-supplied loading parameters. The `source.rawSource` value is an immutable shallow snapshot of the PDF.js parameters that will be used for loading after approval. Top-level getters and later source-object mutation cannot change the approved URL, credential flag, headers reference, password, CMap/font/WASM URLs, or caller-created worker. Opaque objects such as caller-created workers and in-memory data references are preserved rather than recursively cloned.

## Security Notes

- Prefer trusted `Uint8Array` input. PDF.js may transfer ownership of typed-array data to its worker, detaching your buffer; do not reuse the buffer after `load()` starts, and retry a detached-input failure with fresh bytes. Mutating borrowed byte content after approval is unsupported; only the size is re-validated.
- Use `sourcePolicy` to reject remote URLs, protocols, origins, credentialed requests, or header-bearing sources before PDF.js starts network work.
- `configurePdfWorker(...)` mutates PDF.js application-global worker options only when you call it, not at module evaluation. Reconfiguring it clears the previous URL-or-port setting so stale worker globals do not win unexpectedly, but the replacement can affect other PDF.js consumers in the same realm. Use a per-source PDF.js `PDFWorker` for isolation.
- Keep `withCredentials` disabled unless cross-origin credentials are explicitly required.
- Use `maxSourceBytes` for synchronously knowable in-memory sources. Remote response-byte limits still belong to application-controlled fetch/range transport because this package does not intercept PDF.js network I/O.
- Use `load({ deadlineMs })` or your own `AbortSignal` to bound load wait time. The package clears deadline timers and abort listeners on success, failure, caller abort, and destroy.
- Keep `pdfjs-dist` current within the supported `~6.2.108` peer minor because malformed-document defenses belong primarily to PDF.js. Wider PDF.js minors require new package compatibility evidence before use.
- Treat extracted text and images as untrusted content. Do not inject text as HTML without escaping or sanitization.

## Embedded Images

Embedded-image extraction stays on the package root as an opt-in convenience (`includeEmbeddedImages: true`), but the operator traversal now lives behind one private extractor boundary instead of mixing PDF.js internals into reader lifecycle code.

The real-browser fixture suite for the supported `pdfjs-dist` peer minor (`~6.2.108`) characterizes inline images, image XObjects, repeated references, nested save/restore transforms, mirrored transforms, grayscale, RGB, RGBA soft-mask images, one-bit (`GRAYSCALE_1BPP`) image XObjects with pixel assertions under both `ImageBitmap` and packed-bit paths, browser `ImageBitmap`-backed image objects, and nested form XObjects with their own matrices.

Standalone image-mask operators, vector graphics, patterns, and unknown PDF.js image-object layouts remain unsupported. They are skipped with `logger.warn(...)` diagnostics rather than failing the entire page. The extractor never calls `ImageBitmap.close()` because PDF.js owns bitmap lifetime through `page.cleanup()` and document destruction.

Individual unsupported images are skipped. Supply `logger.warn` if those diagnostics matter to the application. Resource-limit and cancellation errors are never swallowed.

Image `x`, `y`, `width`, and `height` values are PDF user-space coordinates before viewport scaling. `x` is the left edge and `y` is the upper bound (top) of the transformed image square; `pageWidth`/`pageHeight` report the unscaled page size in the same units. The full six-value graphics transform is included when consumers need custom coordinate conversion. `size` reports the decoded PDF.js image source bytes (`dataLen` when reported, else raw `data.byteLength`), not the encoded PNG data-URL length.

Shared images painted on several pages are resolved through PDF.js's document-wide `commonObjs` store (`g_`-prefixed references) with readiness awaited through the same cancellation contract as other page-stage waits; page-local references keep using `page.objs`. Repeated placements on one page still share one encoded PNG string after per-placement aggregate pixel limits pass.

## Errors And Cleanup

Validation and resource failures use `PdfReaderError` with stable codes:

- `ABORTED`
- `CANVAS_LIMIT_EXCEEDED`
- `DEADLINE_EXCEEDED`
- `DESTROYED`
- `DOCUMENT_NOT_LOADED`
- `IMAGE_LIMIT_EXCEEDED`
- `IMAGE_COUNT_LIMIT_EXCEEDED`
- `IMAGE_TOTAL_PIXELS_LIMIT_EXCEEDED`
- `INVALID_OPTION`
- `OPERATOR_LIMIT_EXCEEDED`
- `OPERATION_IN_PROGRESS`
- `PAGE_LIMIT_EXCEEDED`
- `SOURCE_LIMIT_EXCEEDED`
- `SOURCE_POLICY_VIOLATION`
- `TEXT_LIMIT_EXCEEDED`
- `UNSUPPORTED_ENVIRONMENT`

Package-owned errors cover invalid options, lifecycle cancellation/destroy/deadline states, resource limits, source-policy/known-byte rejections, and unsupported canvas/runtime features such as missing 2D contexts or missing `toBlob()` support.

PDF.js loading, password, malformed-document, response, and rendering errors pass through unchanged so callers can use PDF.js error classes. Abort and destroy races are normalized to package `PdfReaderError` codes rather than leaking PDF.js cancellation exceptions. Best-effort embedded-image skips do not throw; they call `logger.warn(...)` when a logger is supplied. Always call `destroy()` from your own `finally` block to terminate reader-owned document resources.
