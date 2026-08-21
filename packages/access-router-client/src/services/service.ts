import { AxiosHeaders, AxiosResponse, AxiosRequestConfig, AxiosInstance } from 'axios';
import { FailureResult, Response } from '../types';
import { CACHE_HEADER } from '../constants';
import { createWrapHelper } from './wrap';

/**
 * Normalized failure payload. Mirrors {@link FailureResult} but kept
 * structurally loose (the {@link Response} discriminated union narrows
 * these fields automatically when consumers branch on `result.success`).
 */
export interface ResultError {
  success: false;
  raw: unknown;
  data: null;
  message: string;
  status: number;
  headers: Record<string, unknown>;
  totalCount?: number;
}

const readProblemDetail = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  if ('detail' in value && typeof value.detail === 'string' && value.detail) {
    return value.detail;
  }

  if ('message' in value && typeof value.message === 'string' && value.message) {
    return value.message;
  }

  if ('title' in value && typeof value.title === 'string' && value.title) {
    return value.title;
  }

  if ('errors' in value && Array.isArray(value.errors)) {
    for (const item of value.errors) {
      if (typeof item === 'string' && item) {
        return item;
      }

      const nested = readProblemDetail(item);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
};

const stringifyErrorPayload = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }

  const detail = readProblemDetail(value);
  if (detail) {
    return detail;
  }

  if (value == null) {
    return '';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export interface OperationResultInput {
  success: boolean;
  raw: unknown;
  status: number;
  headers?: Record<string, unknown>;
  message?: string;
  totalCount?: number;
}

interface TransportError {
  response?: { status: number; headers: Record<string, unknown>; data: unknown };
  request?: unknown;
  message?: string;
}

interface OperationSuccess {
  success: true;
  raw: unknown;
  data: unknown;
  message: string;
  status: number;
  headers: Record<string, unknown>;
  totalCount?: number;
}

/** Shared transport-to-public-result boundary for direct and grouped requests. */
export function finalizeOperationResult(input: OperationResultInput & { success: true }): OperationSuccess;
export function finalizeOperationResult(input: OperationResultInput & { success: false }): ResultError;
export function finalizeOperationResult(input: OperationResultInput): OperationSuccess | ResultError;
export function finalizeOperationResult({
  success,
  raw,
  status,
  headers = {},
  message,
  totalCount,
}: OperationResultInput): OperationSuccess | ResultError {
  if (success) {
    return {
      success: true,
      raw,
      data: raw,
      message: '',
      status,
      headers,
      ...(totalCount == null ? {} : { totalCount }),
    } as const;
  }

  return {
    success: false,
    raw,
    data: null,
    message: message ?? stringifyErrorPayload(raw),
    status,
    headers,
    ...(totalCount == null ? {} : { totalCount }),
  } as const;
}

export const normalizeTransportFailure = (error: unknown): ResultError => {
  const transportError = (error && typeof error === 'object' ? error : {}) as TransportError;
  let raw: unknown = null;
  let status = 0;
  let headers: Record<string, unknown> = {};
  let message: string | undefined;

  if (transportError.response) {
    status = transportError.response.status;
    headers = transportError.response.headers;
    raw = transportError.response.data;
  } else if (transportError.request) {
    message = 'The server is not responding';
  } else {
    message = transportError.message;
  }

  return finalizeOperationResult({ success: false, raw, status, headers, message });
};

/**
 * Low-level base class shared by {@link ModelService} and {@link DataService}.
 * Subclassing is supported as an advanced opt-in for callers that need a
 * bespoke service shape: subclasses extend `Service`, build on the shared
 * Axios instance, and reuse the `wrapGet`/`wrapPost`/... paths registered
 * against the adapter's `basePath`. Most callers should use
 * `adapter.createModelService<T>(...)` / `adapter.createDataService<T>(...)`
 * rather than subclassing `Service` directly.
 *
 * The `handleSuccess`/`handleError` helpers normalize Axios responses into
 * the package's {@link Response} discriminated union so direct subclasses
 * produce the same success/failure contract as the built-in services.
 */
export class Service {
  protected _axios!: AxiosInstance;
  protected _basePath!: string;
  private _wrap: ReturnType<typeof createWrapHelper>;
  private _throwOnError: boolean;

  constructor(axios: AxiosInstance, basePath: string, throwOnError = false) {
    this._axios = axios;
    this._basePath = basePath;
    this._wrap = createWrapHelper(axios, basePath);
    this._throwOnError = throwOnError;
  }

  protected handleSuccess<T extends Response<unknown, unknown> = Response<unknown>>(
    res: AxiosResponse<unknown, unknown>,
    extra = {},
  ): T {
    return {
      ...finalizeOperationResult({
        success: true,
        raw: res.data,
        status: res.status,
        headers: res.headers,
      }),
      ...extra,
    } as T;
  }

  // See https://axios-http.com/docs/handling-errors
  protected handleError<T extends Response<unknown, unknown>>(error: unknown): Extract<T, FailureResult> {
    return normalizeTransportFailure(error) as Extract<T, FailureResult>;
  }

  /** Resolves per-call policy against the already-resolved service/adapter default. */
  resolveThrowOnError(override?: boolean): boolean {
    return override ?? this._throwOnError;
  }

  wrapGet<T = unknown>(url: string, defaultAxiosRequestConfig: AxiosRequestConfig = {}) {
    return this._wrap.wrapGet<T>(url, defaultAxiosRequestConfig);
  }

  wrapPost<T = unknown>(url: string, defaultAxiosRequestConfig: AxiosRequestConfig = {}) {
    return this._wrap.wrapPost<T>(url, defaultAxiosRequestConfig);
  }

  wrapPut<T = unknown>(url: string, defaultAxiosRequestConfig: AxiosRequestConfig = {}) {
    return this._wrap.wrapPut<T>(url, defaultAxiosRequestConfig);
  }

  wrapPatch<T = unknown>(url: string, defaultAxiosRequestConfig: AxiosRequestConfig = {}) {
    return this._wrap.wrapPatch<T>(url, defaultAxiosRequestConfig);
  }

  wrapDelete<T = unknown>(url: string, defaultAxiosRequestConfig: AxiosRequestConfig = {}) {
    return this._wrap.wrapDelete<T>(url, defaultAxiosRequestConfig);
  }

  /**
   * Public bridge to the per-service success/failure callback pipeline and
   * `throwOnError` policy. Adapter-internal grouping machinery calls this so
   * that grouped entries go through the same finalization the direct path
   * uses (`createResponseHandler`). Returns `res` unchanged on success and
   * throws `ServiceError` when both `res.success === false` and the
   * `throwOnError` override (or the service-level default) are enabled.
   */
  applyResponseCallbacks<T extends { success: boolean }>(res: T, throwOnErrorOverride?: boolean): T {
    const handler = (this as unknown as { _handleCallbacks: <E extends { success: boolean }>(e: E, t?: boolean) => E })
      ._handleCallbacks;
    return handler ? handler(res, throwOnErrorOverride) : res;
  }

  /**
   * Returns a fresh headers object that includes the package-owned
   * `CACHE_HEADER` set to `"true"` (cache eligible) or `"false"` (bypass)
   * according to the `ignoreCache` option. The caller's `CACHE_HEADER`
   * value, if any, wins over the `ignoreCache` default.
   *
   * The input `headers` object is **never mutated**: an `AxiosHeaders`
   * instance is cloned via `.toJSON()` before any value is set, and a
   * plain-object headers input is shallow-copied. Reusing the same
   * caller-owned headers across multiple requests therefore has no
   * hidden side effects, and the order of invocations is irrelevant.
   */
  updateHeaders(
    headers: AxiosRequestConfig['headers'],
    { ignoreCache }: { ignoreCache?: boolean },
  ): AxiosRequestConfig['headers'] {
    const cacheValue = ignoreCache ? 'false' : 'true';

    if (!headers) {
      return { [CACHE_HEADER]: cacheValue };
    }

    if (headers instanceof AxiosHeaders) {
      if (headers.has(CACHE_HEADER)) return headers;
      const cloned = new AxiosHeaders(headers.toJSON());
      cloned.set(CACHE_HEADER, cacheValue);
      return cloned;
    }

    if (CACHE_HEADER in headers) return headers;

    return {
      ...headers,
      [CACHE_HEADER]: cacheValue,
    };
  }
}

export class ServiceError extends Error {
  success: false;
  readonly raw: unknown;
  readonly data: null;
  readonly status: number;
  readonly headers: Record<string, unknown>;

  constructor(result: ResultError) {
    super(result.message);
    this.name = 'ServiceError';
    this.success = false;
    this.raw = result.raw;
    this.data = null;
    this.status = result.status;
    this.headers = result.headers;
  }
}
