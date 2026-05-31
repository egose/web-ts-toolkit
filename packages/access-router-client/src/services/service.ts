import { AxiosHeaders, AxiosResponse, AxiosRequestConfig, AxiosInstance } from 'axios';
import { Response } from '../types';
import { CACHE_HEADER } from '../constants';
import { createWrapHelper } from './wrap';

export interface ResultError {
  success: boolean;
  raw: unknown;
  data: unknown;
  message: string;
  status: number;
  headers: Record<string, unknown>;
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
    return { success: true, raw: res.data, status: res.status, headers: res.headers, ...extra } as Response<unknown>;
  }

  // See https://axios-http.com/docs/handling-errors
  protected handleError<T extends ResultError>(error: {
    response?: { status: number; headers: Record<string, unknown>; data: unknown };
    request?: unknown;
    message?: string;
  }) {
    const result = {
      success: false,
      raw: null,
      data: null,
      message: '',
      status: 0,
      headers: {},
    };

    if (error.response) {
      result.status = error.response.status;
      result.headers = error.response.headers;
      const responseData = error.response.data;
      result.raw = responseData;
      result.data = responseData;
      result.message = stringifyErrorPayload(responseData);
    } else if (error.request) {
      result.message = 'The server is not responding';
    } else {
      result.message = error.message;
    }

    return result as T;
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

  updateHeaders(headers: AxiosRequestConfig['headers'], { ignoreCache }: { ignoreCache?: boolean }) {
    const cacheValue = ignoreCache ? 'false' : 'true';

    if (!headers) {
      return { [CACHE_HEADER]: cacheValue };
    }

    if (headers instanceof AxiosHeaders) {
      if (headers.has(CACHE_HEADER)) return headers;
      headers.set(CACHE_HEADER, cacheValue);
      return headers;
    }

    if (CACHE_HEADER in headers) return headers;

    return {
      ...headers,
      [CACHE_HEADER]: cacheValue,
    };
  }
}

export class ServiceError extends Error {
  success: boolean;
  raw: unknown;
  data: unknown;
  status: number;
  headers: Record<string, unknown>;

  constructor(result: ResultError) {
    super(result.message);
    this.name = 'ServiceError';
    this.success = result.success;
    this.raw = result.raw;
    this.data = result.data;
    this.status = result.status;
    this.headers = result.headers;
  }
}
