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

  constructor(axios: AxiosInstance, basePath: string) {
    this._axios = axios;
    this._basePath = basePath;
    this._wrap = createWrapHelper(axios, basePath);
  }

  protected handleSuccess(res: AxiosResponse<unknown, unknown>, extra = {}) {
    return {
      success: true,
      raw: res.data,
      data: res.data,
      message: '',
      status: res.status,
      headers: res.headers,
      ...extra,
    } as Response<unknown>;
  }

  // See https://axios-http.com/docs/handling-errors
  protected handleError<T extends Response<unknown, unknown>>(error: {
    response?: { status: number; headers: Record<string, unknown>; data: unknown };
    request?: unknown;
    message?: string;
  }): Extract<T, FailureResult<unknown>> {
    const result = {
      success: false as const,
      raw: null as unknown,
      data: null,
      message: '',
      status: 0,
      headers: {},
      totalCount: 0,
    };

    if (error.response) {
      result.status = error.response.status;
      result.headers = error.response.headers;
      const responseData = error.response.data;
      result.raw = responseData;
      result.message = stringifyErrorPayload(responseData);
    } else if (error.request) {
      result.message = 'The server is not responding';
    } else {
      result.message = error.message;
    }

    return result as unknown as Extract<T, FailureResult<unknown>>;
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
