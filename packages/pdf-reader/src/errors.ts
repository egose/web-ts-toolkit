export type PdfReaderErrorCode =
  | 'ABORTED'
  | 'CANVAS_LIMIT_EXCEEDED'
  | 'DOCUMENT_NOT_LOADED'
  | 'IMAGE_LIMIT_EXCEEDED'
  | 'INVALID_OPTION'
  | 'PAGE_LIMIT_EXCEEDED';

/** An actionable package error with a stable machine-readable code. */
export class PdfReaderError extends Error {
  public readonly code: PdfReaderErrorCode;

  public constructor(code: PdfReaderErrorCode, message: string) {
    super(message);
    this.name = 'PdfReaderError';
    this.code = code;
  }
}
