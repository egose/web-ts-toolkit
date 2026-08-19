import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export type PdfSource = NonNullable<Parameters<typeof import('pdfjs-dist').getDocument>[0]>;

export type TransformMatrix = readonly [number, number, number, number, number, number];

export type PageRange = number | readonly [start: number, end: number];

export type ViewportScale = number | ((pageWidth: number, pageHeight: number) => number);

/** PDF.js text output without requiring consumers to import PDF.js internals. */
export type PdfTextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;

export interface PdfReaderLimits {
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

export interface PdfReaderOptions {
  /** Canvas boundary injectable for tests or non-DOM canvas implementations. */
  canvasFactory?: () => HTMLCanvasElement;
  /** Optional warning sink. The package never writes directly to the console. */
  logger?: PdfReaderLogger;
  limits?: PdfReaderLimits;
}

export interface ConvertOptions {
  pageRange?: PageRange;
  viewportScale?: ViewportScale;
  imageFormat?: 'image/png' | 'image/jpeg';
  jpegQuality?: number;
  includePageImage?: boolean;
  includeText?: boolean;
  includeEmbeddedImages?: boolean;
  /** Stops between expensive steps and cancels an active page render. */
  signal?: AbortSignal;
}

export interface ExtractedImage {
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
  numPages: number;
  pageNumber: number;
  pageIndex: number;
  dataUrl?: string;
  mimeType?: 'image/png' | 'image/jpeg';
  viewport: PageViewport;
  text?: PdfTextContent;
  images: ExtractedImage[];
}

export type LoadedPdfDocument = PDFDocumentProxy;
export type LoadedPdfPage = PDFPageProxy;
