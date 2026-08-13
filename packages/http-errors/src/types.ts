/** Scalar values accepted in `HttpErrorOptions.metadata` before string normalization. */
export type HttpErrorMetadataValue = string | number | boolean | bigint | null | undefined;

/** RFC 9457 problem fields stored on an HTTP error and emitted by RFC serializers. */
export type HttpErrorProblemFields = {
  /** Problem type URI. Falls back to `about:blank` when serialized if absent. */
  type?: string;
  /** Public problem title. Falls back to the status title when serialized if absent. */
  title?: string;
  /** Problem instance URI emitted only when present. */
  instance?: string;
};

/**
 * Constructor options for `HttpError`, `ClientError`, `ServerError`, and specific subclasses.
 *
 * `message`, `details`, `errors`, `metadata`, `type`, `title`, and `instance` can
 * be emitted verbatim by serializers. Do not place secrets or log-only diagnostics
 * in these fields. Top-level `metadata`, `details`, and array-valued `errors` are
 * shallow-snapshotted by `HttpError` construction.
 */
export type HttpErrorOptions<TErrors = unknown> = ErrorOptions &
  HttpErrorProblemFields & {
    /** Override canonical status text for serializers such as AIP-193. */
    status?: string;
    /** Machine-readable application reason, such as `INVALID_EMAIL`. */
    reason?: string;
    /** Logical application domain, such as `api.example.com`. */
    domain?: string;
    /** Key-value metadata normalized to strings and copied into serialized payloads. */
    metadata?: Readonly<Record<string, HttpErrorMetadataValue>>;
    /** Additional structured details emitted by AIP-193 payloads. */
    details?: readonly unknown[];
    /** Extension or validation errors emitted by RFC 9457 helpers when array-valued. */
    errors?: TErrors;
  };

/**
 * Minimal error-like input accepted by serializers.
 *
 * This shape allows using real `HttpError` instances or compatible plain objects.
 * Serializers treat `message` and structured fields as public response data.
 */
export type HttpErrorShape<TErrors = unknown> = HttpErrorProblemFields & {
  /** HTTP error status code used as the response code/status. */
  statusCode: number;
  /** Canonical or custom status string used by AIP-193 payloads. */
  status?: string;
  /** Public error detail/message emitted verbatim. */
  message: string;
  /** Machine-readable application reason used by AIP-193 `error_info`. */
  reason?: string;
  /** Domain used by AIP-193 `error_info`. */
  domain?: string;
  /** String metadata copied into AIP-193 `error_info`. */
  metadata?: Readonly<Record<string, string>>;
  /** Additional AIP-193 detail entries. */
  details?: readonly unknown[];
  /** RFC 9457 extension or validation errors. Array-valued entries are shallow-copied. */
  errors?: TErrors;
};

/** AIP-193 `error_info` detail entry emitted as the first AIP-193 detail. */
export type Aip193ErrorInfoDetail = {
  type: 'error_info';
  reason: string;
  domain: string;
  metadata?: Readonly<Record<string, string>>;
};

/** Google/AIP-193-style error response envelope. */
export type Aip193ErrorPayload = {
  error: {
    /** HTTP status code. */
    code: number;
    /** Canonical or custom status string. */
    status: string;
    /** Public error message emitted verbatim from the input error. */
    message: string;
    /** Structured details, beginning with an `error_info` entry. */
    details?: readonly unknown[];
  };
};

/** RFC 9457 problem-details payload with optional typed `errors` extension entries. */
export type Rfc9457ErrorPayload<TError = unknown> = {
  /** Problem type URI, defaulting to `about:blank` when absent on the input. */
  type: string;
  /** Public problem title, defaulting to the status title or `Unknown`. */
  title: string;
  /** HTTP status code. */
  status: number;
  /** Public problem detail emitted verbatim from the input error message. */
  detail: string;
  /** Problem instance URI, emitted only when present on the input. */
  instance?: string;
  /** Optional extension errors. Validation helpers emit only validated entries. */
  errors?: readonly TError[];
};

/** RFC 9457 validation error entry accepted by `toRfc9457ValidationErrorPayload`. */
export type Rfc9457ValidationError = {
  /** Human-readable validation detail. Required and must be an own string field. */
  detail: string;
  /** JSON Pointer to the invalid field, when available. */
  pointer?: string;
  /** Query/path/header parameter name, when available. */
  parameter?: string;
  /** Header name, when available. */
  header?: string;
};
