import { castArray, get, noop, set } from '@web-ts-toolkit/utils';
import { Model } from '../model';
import { Document, ResponseCallback, RootQueryMeta } from '../types';
import { CustomHeaders } from '../enums';
import { ModelService } from './model-service';
import { finalizeOperationResult, normalizeTransportFailure, ResultError, ServiceError } from './service';

type ListResultShape = {
  raw: unknown;
  data: unknown;
  totalCount?: number;
  headers: Record<string, unknown>;
};

/**
 * Single item from the root-router batch response. The root router emits
 * `{ result, message, statusCode }` per entry; `result` carries the
 * success/kind/data shape used downstream.
 */
export interface RootEntry {
  result: {
    success: boolean;
    kind?: 'list' | 'single' | 'error';
    data?: unknown;
    totalCount?: number;
    count?: number;
    code?: string;
    errors?: unknown[];
    [key: string]: unknown;
  };
  message: string;
  statusCode: number;
  op?: string | null;
}

const getSubdocumentResultShape = (query: RootQueryMeta): 'list' | 'single' | 'scalar' | undefined => {
  if (query.target !== 'model') return undefined;

  switch (query.op) {
    case 'subList':
    case 'subCreate':
    case 'subBulkUpdate':
      return 'list';
    case 'subRead':
    case 'subUpdate':
      return 'single';
    case 'subDelete':
      return 'scalar';
    default:
      return undefined;
  }
};

/**
 * Unified per-request result finalization boundary used by
 * `adapter.group(...)` so every grouped entry is normalized by the same
 * rule that direct requests apply on their own success/error path.
 *
 * Responsibilities:
 *
 * - Construct the base `{ success, raw, data, message, status, headers }`
 *   result through the same `finalizeOperationResult` boundary as direct
 *   `Service.handleSuccess` / `Service.handleError` calls.
 * - Apply per-query model/subdocument/list wrapping using the metadata in
 *   `query` (the same data the direct path persists as `__query`).
 * - Compute `totalCount` for list results (mirror of `processListResult`).
 *
 * What it intentionally does NOT do:
 *
 * - Run success/failure callbacks (`Service._handleCallbacks`) — that is
 *   the caller's responsibility so adapters can decide when (and whether)
 *   to invoke them and whether `throwOnError` should short-circuit a
 *   multi-entry batch.
 * - Mutate the input `entry` or `query`. The returned object is a fresh
 *   plain object.
 */
export function finalizeRootEntry(
  query: RootQueryMeta,
  entry: RootEntry,
  responseHeaders: Record<string, unknown>,
  service: unknown,
) {
  const { result, message: entryMessage, statusCode, op } = entry;
  const success = result.success;
  const baseResult = finalizeOperationResult({
    success,
    raw: success ? result.data : result,
    status: statusCode,
    headers: responseHeaders,
    message: success ? undefined : entryMessage,
  });
  let _raw: unknown = baseResult.raw;
  let _data: unknown = baseResult.data;
  const subdocumentResultShape = getSubdocumentResultShape(query);

  if (!success) {
    _data = null;
  } else if (subdocumentResultShape) {
    if (subdocumentResultShape === 'list') {
      const rows = result.data == null ? [] : castArray(result.data);
      _raw = rows;
      _data = rows;
    }
  } else if (query.target === 'model') {
    const modelService = service as ModelService<Document> | undefined;

    if (result.kind === 'list' && Array.isArray(result.data)) {
      if (op === 'create' && !Array.isArray(query.data) && result.data.length === 1) {
        _raw = result.data[0];
        if (modelService) {
          // ARC-21: a grouped create response resolves to a freshly-persisted
          // document with server-assigned `_id`; mark `_fromExisting=true`
          // so a later save() on this wrapper cannot become a duplicate
          // create if a downstream consumer drops `_id`.
          _data = Model.create(result.data[0], modelService, undefined, true);
        }
      } else if (op !== 'distinct') {
        const rows = castArray(result.data);
        if (modelService) {
          // ARC-21: grouped list items are reads of existing documents; mark
          // `_fromExisting=true` so a save() on such an item cannot silently
          // create a duplicate if a server response shape drops `_id`.
          _data = rows.map((item) => Model.create(item, modelService, undefined, true));
        } else {
          _data = rows;
        }
      }
    } else if (result.kind === 'single' && (op === 'new' || op === 'read' || op === 'update' || op === 'upsert')) {
      if (op === 'new' && result.data && typeof result.data === 'object') {
        const { _id: _generatedId, ...draft } = result.data as Record<string, unknown>;
        void _generatedId;
        _raw = draft;
        _data = draft;
      }
      if (modelService) {
        // ARC-21: `op === 'new'` is a draft (caller intends to create) so it
        // must NOT be flagged `_fromExisting`. `read`/`update`/`upsert` are
        // reads of an existing-or-newly-persisted doc whose `_id` is in the
        // response; marking them `_fromExisting=true` prevents a grouped
        // subquery-derived wrapper from silently creating a duplicate.
        const fromExisting = op !== 'new';
        const persistenceId =
          (op === 'read' || op === 'update') && query.target === 'model' && 'id' in query ? query.id : undefined;
        _data = Model.create(_data as Partial<Document>, modelService, persistenceId, fromExisting);
      }
    }
  }

  const isSubdocumentList = subdocumentResultShape === 'list';
  const isModelOrDataList = !subdocumentResultShape && query.op === 'list';
  const returnedCount = Array.isArray(_data) ? _data.length : 0;
  const totalCount =
    success && query.options?.includeCount === true ? (result.totalCount ?? result.count ?? returnedCount) : 0;

  return {
    success,
    raw: _raw,
    data: _data,
    message: baseResult.message,
    status: statusCode,
    ...(isSubdocumentList ? { count: success ? returnedCount : 0 } : {}),
    ...(isModelOrDataList ? { totalCount } : {}),
    headers: responseHeaders,
  };
}

export function finalizeRootTransportFailure(query: RootQueryMeta, error: unknown) {
  const failure = normalizeTransportFailure(error);
  const subdocumentResultShape = getSubdocumentResultShape(query);

  return {
    ...failure,
    ...(subdocumentResultShape === 'list' ? { count: 0 } : {}),
    ...(!subdocumentResultShape && query.op === 'list' ? { totalCount: 0 } : {}),
  };
}

/**
 * Iterate grouped entries through the per-service success/failure callback
 * pipeline and apply the documented group-level `throwOnError` policy:
 *
 * - When `groupThrowOnError` is false (the default and the historical
 *   behavior), per-entry failures return their normalized `{ success:
 *   false }` result without throwing. The caller awaiting `adapter.group(...)`
 *   receives the full array of normalized entries regardless of per-entry
 *   failure mode.
 * - When `groupThrowOnError` is true, every executed entry receives its
 *   callback before the first failed entry is surfaced as `ServiceError`.
 *
 * `groupThrowOnError` is the uniform effective adapter/service/per-call
 * policy validated by `group()` before dispatch.
 */
export function applyGroupCallbacks<TEntry extends { success: boolean }>(
  entries: TEntry[],
  services: ReadonlyArray<
    | { applyResponseCallbacks?: <E extends { success: boolean }>(res: E, throwOnErrorOverride?: boolean) => E }
    | undefined
  >,
  groupThrowOnError: boolean,
): TEntry[] {
  let callbackError: unknown;
  for (let i = 0; i < entries.length; i++) {
    const svc = services[i];
    try {
      entries[i] = svc?.applyResponseCallbacks ? svc.applyResponseCallbacks(entries[i], false) : entries[i];
    } catch (error) {
      callbackError ??= error;
    }
  }

  if (callbackError) throw callbackError;
  if (groupThrowOnError) {
    const failure = entries.find((entry) => !entry.success);
    if (failure) throw new ServiceError(toResultError(failure));
  }

  return entries;
}

const toResultError = (result: {
  success: boolean;
  raw?: unknown;
  message?: string;
  status?: number;
  headers?: Record<string, unknown>;
}): ResultError => ({
  success: false,
  raw: result.raw ?? null,
  data: null,
  message: result.message ?? '',
  status: result.status ?? 0,
  headers: result.headers ?? {},
});

const isLegacyListPayload = <TData>(value: unknown): value is { count: number; rows: TData[] } => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'count' in value && typeof value.count === 'number' && 'rows' in value && Array.isArray(value.rows);
};

export const setDefaultObjectProp = (obj: object, key: string, value: unknown) => {
  if (!get(obj, key)) {
    set(obj, key, value);
  }
};

export const ensureListResultCount = <TResult extends { totalCount?: number }>(
  result: TResult,
): TResult & { totalCount: number } => {
  result.totalCount ??= 0;
  return result as TResult & { totalCount: number };
};

export const createResponseHandler = (
  onSuccess: ResponseCallback,
  onFailure: ResponseCallback,
  throwOnError: boolean,
) => {
  const successHandler = onSuccess ?? noop;
  const failureHandler = onFailure ?? noop;

  return <T extends { success: boolean }>(res: T, shouldThrowOnError = throwOnError): T => {
    if (res.success) {
      successHandler(res);
      return res;
    }

    failureHandler(res);
    if (shouldThrowOnError) {
      throw new ServiceError(toResultError(res));
    }

    return res;
  };
};

export function processListResult<TResult, TData>(
  result: TResult & ListResultShape,
  { includeCount, includeExtraHeaders }: { includeCount: boolean; includeExtraHeaders: boolean },
  wrapItem?: (item: TData) => unknown,
): TResult & ListResultShape {
  ensureListResultCount(result);
  const wrappedRows = get(result, 'raw.data');
  const wrappedTotalCount = get(result, 'raw.meta.totalCount');

  if (Array.isArray(wrappedRows)) {
    const rows = wrappedRows as TData[];
    result.raw = wrappedRows;

    if (includeCount) {
      if (includeExtraHeaders) {
        const totalCount = get(result, `headers.${CustomHeaders.TotalCount}`, 0);
        result.totalCount = Number(totalCount);
      } else {
        result.totalCount = Number(wrappedTotalCount ?? rows.length);
      }
    }
  } else if (includeCount) {
    if (includeExtraHeaders) {
      const totalCount = get(result, `headers.${CustomHeaders.TotalCount}`, 0);
      result.totalCount = Number(totalCount);
    } else {
      if (isLegacyListPayload<TData>(result.raw)) {
        result.totalCount = result.raw.count;
        result.raw = result.raw.rows;
      } else {
        result.totalCount = 0;
        result.raw = [];
      }
    }
  }

  result.data = wrapItem ? (result.raw as TData[]).map(wrapItem) : result.raw;
  return result;
}
