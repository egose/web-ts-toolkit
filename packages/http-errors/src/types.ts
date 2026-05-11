export type HttpErrorMetadataValue = string | number | boolean | bigint | null | undefined;

export type HttpErrorProblemFields = {
  type?: string;
  title?: string;
  instance?: string;
};

export type HttpErrorOptions = ErrorOptions &
  HttpErrorProblemFields & {
    status?: string;
    reason?: string;
    domain?: string;
    metadata?: Record<string, HttpErrorMetadataValue>;
    details?: unknown[];
    errors?: unknown;
  };

export type HttpErrorShape = HttpErrorProblemFields & {
  statusCode: number;
  status?: string;
  message: string;
  reason?: string;
  domain?: string;
  metadata?: Record<string, string>;
  details?: unknown[];
  errors?: unknown;
};

export type Aip193ErrorInfoDetail = {
  type: 'error_info';
  reason: string;
  domain: string;
  metadata?: Record<string, string>;
};

export type Aip193ErrorPayload = {
  error: {
    code: number;
    status: string;
    message: string;
    details?: unknown[];
  };
};

export type Rfc9457ErrorPayload<TError = unknown> = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: TError[];
};

export type Rfc9457ValidationError = {
  detail: string;
  pointer?: string;
  parameter?: string;
  header?: string;
};
