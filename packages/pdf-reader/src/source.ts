export interface PdfUrlSourceOptions {
  /** Basic authentication headers forwarded to PDF.js URL loading. */
  httpHeaders?: Readonly<Record<string, string>>;
  /** Whether PDF.js should send cross-origin credentials while loading the URL. */
  withCredentials?: boolean;
  /** Password for encrypted PDFs. */
  password?: string;
  /** Maximum bytes fetched per PDF.js range request. */
  rangeChunkSize?: number;
  /** Base URL used by PDF.js when resolving relative links in the document. */
  docBaseUrl?: string;
  /** URL where predefined Adobe CMaps are located. Include the trailing slash. */
  cMapUrl?: string;
  /** Whether CMaps are binary packed. */
  cMapPacked?: boolean;
  /** URL where PDF.js standard font data is located. Include the trailing slash. */
  standardFontDataUrl?: string;
  /** URL where PDF.js WASM assets are located. Include the trailing slash. */
  wasmUrl?: string;
  /** Disable HTTP range requests. */
  disableRange?: boolean;
  /** Disable streaming PDF data. */
  disableStream?: boolean;
  /** Disable automatic prefetching after the first range request. */
  disableAutoFetch?: boolean;
  /** PDF.js verbosity level. */
  verbosity?: number;
}

export type PdfUrlSource = PdfUrlSourceOptions & {
  url: string | URL;
};

/** Creates a PDF.js URL source object that can be passed directly to `new PDFReader(...)`. */
export function pdfUrlSource(url: string | URL, options: PdfUrlSourceOptions = {}): PdfUrlSource {
  return { ...options, url };
}
