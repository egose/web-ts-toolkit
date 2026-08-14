import { getCanonicalStatus, getStatusTitle } from './status';
import type {
  Aip193ErrorInfoDetail,
  Aip193ErrorPayload,
  HttpErrorShape,
  Rfc9457ErrorPayload,
  Rfc9457ValidationError,
} from './types';

const RFC_9457_DEFAULT_TYPE = 'about:blank';
const RFC_9457_VALIDATION_ERROR_OPTIONAL_FIELDS = ['pointer', 'parameter', 'header'] as const;

const toAip193ErrorDetails = (error: HttpErrorShape, fallbackDomain: string): unknown[] => {
  const status = error.status ?? getCanonicalStatus(error.statusCode);

  return [
    createAip193ErrorInfoDetail(error.reason ?? status, error.domain ?? fallbackDomain, error.metadata),
    ...(error.errors !== undefined
      ? [{ type: 'bad_request', errors: Array.isArray(error.errors) ? [...error.errors] : error.errors }]
      : []),
    ...(error.details ?? []),
  ];
};

const toRfc9457Errors = (errors: unknown): unknown[] | undefined =>
  Array.isArray(errors) && errors.length > 0 ? [...errors] : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toRfc9457ValidationError = (value: unknown): Rfc9457ValidationError | undefined => {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, 'detail') || typeof value.detail !== 'string') {
    return undefined;
  }

  const validationError: Rfc9457ValidationError = {
    detail: value.detail,
  };

  for (const field of RFC_9457_VALIDATION_ERROR_OPTIONAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      const fieldValue = value[field];

      if (typeof fieldValue !== 'string') {
        return undefined;
      }

      validationError[field] = fieldValue;
    }
  }

  return validationError;
};

const toRfc9457ValidationErrors = (errors: unknown): Rfc9457ValidationError[] | undefined => {
  if (!Array.isArray(errors)) {
    return undefined;
  }

  const validationErrors = errors.flatMap((entry) => {
    const validationError = toRfc9457ValidationError(entry);

    return validationError ? [validationError] : [];
  });

  return validationErrors.length > 0 ? validationErrors : undefined;
};

/**
 * Creates an AIP-193 `error_info` detail entry.
 *
 * The returned `metadata` record is a shallow copy so payload mutation does not
 * mutate the source error metadata.
 *
 * @param reason Machine-readable reason, usually an application code or canonical status.
 * @param domain Logical error domain, such as `api.example.com`.
 * @param metadata Optional string metadata copied into the returned detail.
 * @returns A serializable AIP-193 `error_info` detail.
 */
export const createAip193ErrorInfoDetail = (
  reason: string,
  domain: string,
  metadata?: Readonly<Record<string, string>>,
): Aip193ErrorInfoDetail => ({
  type: 'error_info',
  reason,
  domain,
  ...(metadata ? { metadata: { ...metadata } } : {}),
});

/**
 * Converts an HTTP error shape into an AIP-193-style `{ error }` envelope.
 *
 * Emits `error.message` verbatim as the public payload message. The first detail
 * is always an `error_info` entry. Additional `errors` and `details` entries are
 * shallow-copied at the top level only.
 *
 * @param error Error-like shape with status, message, and optional structured fields.
 * @param fallbackDomain Domain used for `error_info` when `error.domain` is absent.
 * @returns A payload containing `code`, `status`, `message`, and `details`.
 */
export const toAip193ErrorPayload = (error: HttpErrorShape, fallbackDomain = 'http-errors'): Aip193ErrorPayload => {
  const status = error.status ?? getCanonicalStatus(error.statusCode);
  const details = toAip193ErrorDetails(error, fallbackDomain);

  return {
    error: {
      code: error.statusCode,
      status,
      message: error.message,
      details,
    },
  };
};

/**
 * Converts an HTTP error shape with typed extension errors into an RFC 9457 problem payload.
 *
 * Emits `message` as `detail` and passes `type`, `title`, `instance`, and array
 * `errors` through as public response data. Array-valued `errors` are shallow-copied.
 *
 * @param error Error-like shape whose `errors` field is a typed array.
 * @returns RFC 9457 problem details preserving the typed extension error entries.
 */
export function toRfc9457ErrorPayload<TError>(error: HttpErrorShape<readonly TError[]>): Rfc9457ErrorPayload<TError>;
/**
 * Converts an HTTP error shape into an RFC 9457 problem payload.
 *
 * Missing `type` falls back to `about:blank`; missing `title` falls back to the
 * canonical status title, or `Unknown` for unmapped status codes. `message` is
 * emitted verbatim as `detail`; `instance` and array-valued `errors` are emitted
 * when present.
 *
 * @param error Error-like shape with status, message, and optional problem fields.
 * @returns RFC 9457 problem details.
 */
export function toRfc9457ErrorPayload(error: HttpErrorShape): Rfc9457ErrorPayload;
export function toRfc9457ErrorPayload(error: HttpErrorShape): Rfc9457ErrorPayload {
  const errors = toRfc9457Errors(error.errors);

  return {
    type: error.type ?? RFC_9457_DEFAULT_TYPE,
    title: error.title ?? getStatusTitle(error.statusCode),
    status: error.statusCode,
    detail: error.message,
    ...(error.instance ? { instance: error.instance } : {}),
    ...(errors ? { errors } : {}),
  };
}

/**
 * Converts an HTTP error shape into an RFC 9457 validation problem payload.
 *
 * Runtime-narrows `errors` before typing the result as validation entries. Keeps
 * only own string `detail` plus optional own string `pointer`, `parameter`, and
 * `header`; extra fields are omitted. If no valid entries remain, `errors` is omitted.
 *
 * @param error Error-like shape with optional validation-style `errors` entries.
 * @returns RFC 9457 problem details with validated `errors` entries when available.
 */
export const toRfc9457ValidationErrorPayload = (error: HttpErrorShape): Rfc9457ErrorPayload<Rfc9457ValidationError> => {
  const errors = toRfc9457ValidationErrors(error.errors);

  return {
    type: error.type ?? RFC_9457_DEFAULT_TYPE,
    title: error.title ?? getStatusTitle(error.statusCode),
    status: error.statusCode,
    detail: error.message,
    ...(error.instance ? { instance: error.instance } : {}),
    ...(errors ? { errors } : {}),
  };
};
