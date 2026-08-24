export type PdfReaderErrorCode =
  | 'ABORTED'
  | 'CANVAS_LIMIT_EXCEEDED'
  | 'DEADLINE_EXCEEDED'
  | 'DESTROYED'
  | 'DOCUMENT_NOT_LOADED'
  | 'IMAGE_LIMIT_EXCEEDED'
  | 'IMAGE_COUNT_LIMIT_EXCEEDED'
  | 'IMAGE_TOTAL_PIXELS_LIMIT_EXCEEDED'
  | 'INVALID_OPTION'
  | 'OPERATOR_LIMIT_EXCEEDED'
  | 'OPERATION_IN_PROGRESS'
  | 'PAGE_LIMIT_EXCEEDED'
  | 'SOURCE_LIMIT_EXCEEDED'
  | 'SOURCE_POLICY_VIOLATION'
  | 'TEXT_LIMIT_EXCEEDED'
  | 'UNSUPPORTED_ENVIRONMENT';

/** An actionable package error with a stable machine-readable code. */
export class PdfReaderError extends Error {
  public readonly code: PdfReaderErrorCode;

  public constructor(code: PdfReaderErrorCode, message: string) {
    super(message);
    this.name = 'PdfReaderError';
    this.code = code;
  }
}
