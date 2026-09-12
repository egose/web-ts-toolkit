import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export type PdfDocumentInitParameters = NonNullable<Parameters<typeof import('pdfjs-dist').getDocument>[0]>;

export type PdfTypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

/**
 * PDF.js `getDocument(...)` source accepted by the package root.
 *
 * Prefer trusted in-memory bytes when possible. PDF.js may transfer typed-array
 * ownership to its worker during load, detaching the caller's buffer: keep no
 * further use of the buffer after `load()` starts and retry a detached-input
 * failure with fresh bytes. In-memory `data` references stay borrowed (never
 * copied by the package), so only the byte size is re-validated after source
 * policy approval; concurrent byte-content mutation is caller-visible and
 * unsupported.
 */
export type PdfSource = string | URL | ArrayBuffer | PdfTypedArray | number[] | PdfDocumentInitParameters;

export type TransformMatrix = readonly [number, number, number, number, number, number];

export type PageRange = number | readonly [start: number, end: number];

export type ViewportScale = number | ((pageWidth: number, pageHeight: number) => number);

export type PageImageMimeType = 'image/png' | 'image/jpeg';

export type PageImageOutputMode = 'data-url' | 'blob';

/**
 * Public lifecycle states reported by `PDFReader.state`.
 *
 * `failed` means the most recent package- or PDF.js-owned load attempt
 * rejected and a later `load()` call will start a fresh attempt.
 */
export type PdfReaderState = 'new' | 'loading' | 'loaded' | 'iterating' | 'failed' | 'destroyed';

/** PDF.js text output without requiring consumers to import PDF.js internals. */
export type PdfTextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;

export interface PdfReaderLimits {
  /**
   * Maximum known in-memory source bytes accepted before PDF.js starts loading. Unset by default.
   *
   * The limit counts PDF.js byte conversion: binary-string code units (one
   * byte each), number-array entries (one byte each), and buffer/view
   * `byteLength` (sliced views count only their slice). It is checked before
   * source-policy approval and rechecked after approval, so growth during
   * approval still fails before loading. Remote downloads have no
   * synchronously knowable length and stay application-owned via
   * fetch/range transport controls.
   */
  maxSourceBytes?: number;
  /** Maximum number of document pages accepted after loading. Defaults to 1,000. */
  maxDocumentPages?: number;
  /** Maximum PDF.js text items retained for one page. Defaults to 50,000. */
  maxTextItems?: number;
  /** Maximum string code units retained across one page's text items. Defaults to 5,000,000. */
  maxTextCodeUnits?: number;
  /** Maximum PDF.js operators traversed for embedded-image extraction on one page. Defaults to 100,000. */
  maxOperatorCount?: number;
  /** Maximum pixels allocated for one rendered page. Defaults to 40 megapixels. */
  maxCanvasPixels?: number;
  /** Maximum pixels allocated while copying one embedded image. Defaults to 25 megapixels. */
  maxEmbeddedImagePixels?: number;
  /** Maximum extracted embedded images returned for one page. Defaults to 1,000. */
  maxEmbeddedImages?: number;
  /** Maximum decoded embedded-image pixels copied across one page. Defaults to 100 megapixels. */
  maxEmbeddedImagePixelsTotal?: number;
}

export interface PdfReaderLogger {
  warn(message: string, error?: unknown): void;
}

export interface PdfReaderSourceInfo {
  /**
   * Immutable shallow snapshot that will be passed to PDF.js if policy allows it.
   *
   * Stabilized request fields (`url` as a string, `httpHeaders` as an owned
   * frozen record) are read once before policy approval, so later caller
   * mutation or getter re-evaluation cannot change the effective request.
   * Opaque objects (`data` bytes, `worker`, factories, range transports) are
   * deliberately borrowed by reference and pass through unchanged; the
   * snapshot freezes only the outer params object, not recursive contents.
   */
  rawSource: Readonly<PdfDocumentInitParameters>;
  /** Broad source shape so callers can distinguish direct bytes from URL-based inputs. */
  kind: 'bytes' | 'url' | 'document-init-parameters';
  /** Normalized URL string when one is present on the source. */
  url?: string;
  /** Known byte length for direct byte sources and `DocumentInitParameters.data` when synchronously measurable: binary-string length, array length, or buffer/view `byteLength`. Remote URL sources report `undefined`; their response-byte limits remain application-owned. */
  byteLength?: number;
  /** True when the source carries any custom HTTP headers. */
  hasHttpHeaders: boolean;
  /**
   * Owned frozen copy of the effective HTTP headers enumerated exactly as
   * PDF.js consumes them (`for...in`, inherited included, `undefined`
   * skipped, values string-coerced). Non-plain containers (e.g. `Headers`)
   * report `hasHttpHeaders: true` with no value entries rather than a
   * false-equivalent record; gate on `hasHttpHeaders` to block them.
   */
  httpHeaders?: Readonly<Record<string, string>>;
  /** Whether PDF.js would send credentials for URL-based loading. */
  withCredentials: boolean;
}

export type PdfReaderSourcePolicy = (source: PdfReaderSourceInfo) => void | PromiseLike<void>;

export interface PdfReaderOptions {
  /** Creates a fresh DOM `HTMLCanvasElement` for each package-owned page or embedded-image render. */
  canvasFactory?: () => HTMLCanvasElement;
  /** Optional warning sink. The package never writes directly to the console. */
  logger?: PdfReaderLogger;
  limits?: PdfReaderLimits;
  /** Optional pre-load policy hook for rejecting sources before PDF.js starts work. */
  sourcePolicy?: PdfReaderSourcePolicy;
}

export interface LoadOptions {
  /** Cancels only the current load caller, not other callers sharing the same underlying PDF.js task. */
  signal?: AbortSignal;
  /** Caller-local deadline in milliseconds for waiting on `load()`. Must be a positive finite number not exceeding 2,147,483,647 (the maximum browser/Node timer delay); larger values are rejected with `INVALID_OPTION`. */
  deadlineMs?: number;
}

export interface ConvertOptions {
  /**
   * 1-based page selection: one page number or an inclusive `[start, end]`
   * tuple. Reversed tuples are normalized; defaults to all pages.
   */
  pageRange?: PageRange;
  /** Render scale factor or page-size callback. Defaults to `1.5`. */
  viewportScale?: ViewportScale;
  /** Page render format. Defaults to `'image/png'`. */
  imageFormat?: PageImageMimeType;
  /** JPEG quality from `0` through `1`, applied only to `'image/jpeg'`. Defaults to `0.92`; PNG output ignores it. */
  jpegQuality?: number;
  /** Render the full page under `page.pageImage`. Defaults to `true`. */
  includePageImage?: boolean;
  /** Page-image payload shape. Defaults to `'data-url'`. */
  pageImageOutput?: PageImageOutputMode;
  /** Include PDF.js `TextContent` under `page.text`. Defaults to `true`. */
  includeText?: boolean;
  /** Best-effort embedded raster extraction under `page.images`. Defaults to `false`. */
  includeEmbeddedImages?: boolean;
  /** Stops between expensive steps and settles pending page/text/operator/render waits promptly. Upstream PDF.js work is uncancellable and observed only for cleanup; a suspended pages() consumer observes cancellation on resume. */
  signal?: AbortSignal;
}

export interface DataUrlPageImage {
  /** Inline base64 page image. The package owns the temporary canvas, not the returned string. */
  kind: 'data-url';
  mimeType: PageImageMimeType;
  dataUrl: string;
}

export interface BlobPageImage {
  /** Binary page image. Callers own any object URL created from this blob. */
  kind: 'blob';
  mimeType: PageImageMimeType;
  blob: Blob;
}

export type PageImageResult = DataUrlPageImage | BlobPageImage;

export interface ExtractedImage {
  /** Best-effort PNG data URL copied from a PDF.js image object. */
  dataUrl: string;
  /** Left edge in PDF user-space units, before viewport scaling. */
  x: number;
  /**
   * Upper bound in PDF user-space units, before viewport scaling.
   *
   * `y` is the top of the transformed unit square (`max` of the mapped
   * corners), not the baseline origin.
   */
  y: number;
  /** Width in PDF user-space units, before viewport scaling. */
  width: number;
  /** Height in PDF user-space units, before viewport scaling. */
  height: number;
  /**
   * Decoded PDF.js image source size in bytes (`dataLen` when reported,
   * else raw `data.byteLength`). Not the encoded PNG data-URL length.
   */
  size: number;
  mimeType: 'image/png';
  /** Unscaled page width in PDF user-space units (`viewport.width / viewport.scale`). */
  pageWidth: number;
  /** Unscaled page height in PDF user-space units (`viewport.height / viewport.scale`). */
  pageHeight: number;
  /** Full six-value graphics transform active when the image was painted. */
  transform: TransformMatrix;
}

export interface PageResult {
  /** Total document pages from the loaded PDF.js document proxy. */
  numPages: number;
  pageNumber: number;
  pageIndex: number;
  /** Optional full-page render owned by the caller after the page canvas is released. */
  pageImage?: PageImageResult;
  viewport: PageViewport;
  /** Optional PDF.js text content. Treat extracted strings as untrusted input. */
  text?: PdfTextContent;
  /** Best-effort embedded raster images extracted from the current page. */
  images: ExtractedImage[];
}

/**
 * Borrowed PDF.js document proxy returned by `PDFReader.load()`.
 *
 * The reader owns lifecycle teardown. Callers may inspect metadata and call
 * supported PDF.js read methods, but must not call `destroy()` on this proxy
 * while the `PDFReader` owns it. Use `PDFReader.destroy()` instead.
 */
export type LoadedPdfDocument = PDFDocumentProxy;

/**
 * PDF.js page proxy alias for consumers interoperating with PDF.js APIs.
 *
 * `PDFReader.pages()` returns package `PageResult` objects, not raw page
 * proxies. This alias is exported so applications can type adjacent PDF.js
 * integration code without relying on unsupported package deep imports.
 */
export type LoadedPdfPage = PDFPageProxy;
