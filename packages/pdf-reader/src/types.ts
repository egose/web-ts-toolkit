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
 * ownership to its worker during load.
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
  /** Maximum known in-memory source bytes accepted before PDF.js starts loading. Unset by default. */
  maxSourceBytes?: number;
  /** Maximum number of document pages accepted after loading. Defaults to 1,000. */
  maxDocumentPages?: number;
  /** Maximum pixels allocated for one rendered page. Defaults to 40 megapixels. */
  maxCanvasPixels?: number;
  /** Maximum pixels allocated while copying one embedded image. Defaults to 25 megapixels. */
  maxEmbeddedImagePixels?: number;
}

export interface PdfReaderLogger {
  warn(message: string, error?: unknown): void;
}

export interface PdfReaderSourceInfo {
  /** The original source value that will be passed to PDF.js if policy allows it. */
  rawSource: PdfSource;
  /** Broad source shape so callers can distinguish direct bytes from URL-based inputs. */
  kind: 'bytes' | 'url' | 'document-init-parameters';
  /** Normalized URL string when one is present on the source. */
  url?: string;
  /** Known byte length for direct byte sources and `DocumentInitParameters.data` when synchronously measurable. */
  byteLength?: number;
  /** True when the source carries any custom HTTP headers. */
  hasHttpHeaders: boolean;
  /** Shallow copy of recognized HTTP headers when the source uses a plain object. */
  httpHeaders?: Readonly<Record<string, string>>;
  /** Whether PDF.js would send credentials for URL-based loading. */
  withCredentials: boolean;
}

export type PdfReaderSourcePolicy = (source: PdfReaderSourceInfo) => void | Promise<void>;

export interface PdfReaderOptions {
  /** Canvas boundary injectable for tests or non-DOM canvas implementations. */
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
  /** Caller-local deadline in milliseconds for waiting on `load()`. */
  deadlineMs?: number;
}

export interface ConvertOptions {
  pageRange?: PageRange;
  viewportScale?: ViewportScale;
  imageFormat?: PageImageMimeType;
  jpegQuality?: number;
  includePageImage?: boolean;
  pageImageOutput?: PageImageOutputMode;
  includeText?: boolean;
  includeEmbeddedImages?: boolean;
  /** Stops between expensive steps and cancels an active page render. */
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
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  mimeType: 'image/png';
  pageWidth: number;
  pageHeight: number;
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

export type LoadedPdfDocument = PDFDocumentProxy;
export type LoadedPdfPage = PDFPageProxy;
