export type HttpErrorMetadataValue = string | number | boolean | bigint | null | undefined;

export type HttpErrorOptions = ErrorOptions & {
  status?: string;
  reason?: string;
  domain?: string;
  metadata?: Record<string, HttpErrorMetadataValue>;
  details?: unknown[];
  errors?: unknown;
};

export type HttpErrorShape = {
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
