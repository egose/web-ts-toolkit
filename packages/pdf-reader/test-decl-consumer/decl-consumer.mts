// @ts-expect-error The package intentionally has no default export.
import PDFReaderDefault from '@web-ts-toolkit/pdf-reader';
// @ts-expect-error Deep imports are intentionally unsupported.
import { PDFReader as DeepReader } from '@web-ts-toolkit/pdf-reader/PDFReader';

import { GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';

import {
  PDFReader,
  PdfReaderError,
  configurePdfWorker,
  pdfUrlSource,
  type BlobPageImage,
  type ConvertOptions,
  type DataUrlPageImage,
  type ExtractedImage,
  type PageImageResult,
  type PageResult,
  type PdfReaderOptions,
  type PdfReaderState,
  type PdfSource,
  type PdfUrlSource,
  type PdfUrlSourceOptions,
  type PdfTextContent,
} from '@web-ts-toolkit/pdf-reader';

const expectTypeAssignableTo = <TExpected,>(_actual: TExpected): void => {
  void _actual;
};

const workerUrl = new URL('./pdf.worker.min.mjs', import.meta.url).toString();
configurePdfWorker(workerUrl);

const source: PdfSource = { data: new Uint8Array([0x25, 0x50, 0x44, 0x46]) };
const urlSourceOptions: PdfUrlSourceOptions = { withCredentials: false };
const urlSource: PdfUrlSource = pdfUrlSource('https://example.com/document.pdf', urlSourceOptions);
const options: PdfReaderOptions = {
  canvasFactory: () => document.createElement('canvas'),
  limits: {
    maxDocumentPages: 32,
    maxCanvasPixels: 4_000_000,
    maxEmbeddedImagePixels: 2_000_000,
  },
};

const reader = new PDFReader(source, options);
const urlReader = new PDFReader(urlSource, options);
const loadResult = reader.load(new AbortController().signal);
const convertOptions: ConvertOptions = {
  imageFormat: 'image/png',
  includePageImage: true,
  pageImageOutput: 'blob',
  includeText: true,
  includeEmbeddedImages: true,
  signal: new AbortController().signal,
};
const pages: AsyncGenerator<PageResult> = reader.pages(convertOptions);
const converted = reader.convert({ imageFormat: 'image/jpeg', signal: new AbortController().signal });

const page = {} as PageResult;
const image = {} as ExtractedImage;
const pdfError = new PdfReaderError('ABORTED', 'cancelled');
const publicText: PdfTextContent | undefined = page.text;
const state: PdfReaderState = reader.state;

expectTypeAssignableTo<typeof PDFReader>(PDFReader);
expectTypeAssignableTo<PdfSource>(urlSource);
expectTypeAssignableTo<Promise<PDFDocumentProxy>>(loadResult);
expectTypeAssignableTo<AsyncGenerator<PageResult>>(pages);
expectTypeAssignableTo<Promise<PageResult[]>>(converted);
expectTypeAssignableTo<PdfTextContent | undefined>(publicText);
expectTypeAssignableTo<PageImageResult | undefined>(page.pageImage);
expectTypeAssignableTo<PdfReaderState>(state);
expectTypeAssignableTo<number>(image.width);
expectTypeAssignableTo<string>(GlobalWorkerOptions.workerSrc);
expectTypeAssignableTo<AbortSignal>(convertOptions.signal as AbortSignal);

if (page.pageImage?.kind === 'blob') {
  expectTypeAssignableTo<BlobPageImage>(page.pageImage);
  expectTypeAssignableTo<Blob>(page.pageImage.blob);
}

if (page.pageImage?.kind === 'data-url') {
  expectTypeAssignableTo<DataUrlPageImage>(page.pageImage);
  expectTypeAssignableTo<string>(page.pageImage.dataUrl);
}

// @ts-expect-error Only PNG and JPEG page output formats are supported.
const invalidFormat: ConvertOptions = { imageFormat: 'image/webp' };
// @ts-expect-error Legacy application-local option name was intentionally removed.
const legacyGetText: ConvertOptions = { getText: true };
// @ts-expect-error Legacy application-local option name was intentionally removed.
const legacyGetDataUrl: ConvertOptions = { getDataURL: true };
// @ts-expect-error Canvas injection must return an HTMLCanvasElement.
const invalidCanvasOptions: PdfReaderOptions = { canvasFactory: () => ({}) };
// @ts-expect-error Legacy application-local reader option was intentionally removed.
const legacyReaderOptions: PdfReaderOptions = { config: {} };
// @ts-expect-error Legacy application-local page result property was intentionally removed.
void page.dataURL;
// @ts-expect-error Legacy application-local page result property was intentionally removed.
void page.isPNG;
// @ts-expect-error Legacy page result property was replaced by the discriminated `pageImage` union.
void page.dataUrl;
// @ts-expect-error Legacy page result property was replaced by the discriminated `pageImage` union.
void page.mimeType;

void [
  PDFReaderDefault,
  DeepReader,
  GlobalWorkerOptions.workerPort,
  invalidFormat,
  invalidCanvasOptions,
  legacyGetDataUrl,
  legacyGetText,
  legacyReaderOptions,
  page.viewport,
  pdfError.code,
  state,
  urlReader.state,
];
