import { castArray, get, noop, set } from '@web-ts-toolkit/utils';
import { Model } from '../model';
import { Document, ResponseCallback, RootQueryMeta } from '../types';
import { CustomHeaders } from '../enums';
import { ModelService } from './model-service';
import { ResultError, ServiceError } from './service';

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
  result: { success: boolean; kind?: 'list' | 'single' | 'error'; data?: unknown; totalCount?: number; count?: number };
  message: string;
  statusCode: number;
  op?: string;
}

/**
 * Unified per-request result finalization boundary used by
 * `adapter.group(...)` so every grouped entry is normalized by the same
 * rule that direct requests apply on their own success/error path.
 *
 * Responsibilities:
 *
 * - Construct the base `{ success, raw, data, message, status, headers }`
 *   result that the direct path produces via `Service.handleSuccess` /
 *   `Service.handleError`.
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
): {
  success: boolean;
  raw: unknown;
  data: unknown;
  message: string;
  status: number;
  count: number;
  totalCount: number;
  headers: Record<string, unknown>;
} {
  const { result, message: entryMessage, statusCode, op } = entry;
  const success = result.success;
  const message = entryMessage ?? '';
  let _raw: unknown = success ? result.data : null;
  let _data: unknown = _raw;

  if (!success) {
    _data = null;
  } else if (query.target === 'model') {
    const modelService = service as ModelService<Document> | undefined;

    if (result.kind === 'list' && Array.isArray(result.data)) {
      if (op === 'create' && result.data.length === 1) {
        _raw = result.data[0];
        if (modelService) {
          // ARC-21: a grouped create response resolves to a freshly-persisted
          // document with server-assigned `_id`; mark `_fromExisting=true`
          // so a later save() on this wrapper cannot become a duplicate
          // create if a downstream consumer drops `_id`.
          _data = Model.create(result.data[0], modelService, undefined, true);
        }
      } else if (op !== 'distinct' && op !== 'subList') {
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
      if (modelService) {
        // ARC-21: `op === 'new'` is a draft (caller intends to create) so it
        // must NOT be flagged `_fromExisting`. `read`/`update`/`upsert` are
        // reads of an existing-or-newly-persisted doc whose `_id` is in the
        // response; marking them `_fromExisting=true` prevents a grouped
        // subquery-derived wrapper from silently creating a duplicate.
        const fromExisting = op !== 'new';
        const persistenceId = op === 'read' && query.target === 'model' && 'id' in query ? query.id : undefined;
        _data = Model.create(result.data, modelService, persistenceId, fromExisting);
      }
    }
  }

  const count = success && result.kind === 'list' ? (result.totalCount ?? result.count ?? 0) : 0;

  return {
    success,
    raw: _raw,
    data: _data,
    message,
    status: statusCode,
    count,
    // `totalCount` is the historical field name on `ListModelResponse`.
    // The sibling server emits `count` on plain list results; subdocument
    // list responses (`SubDocumentListResponse`) only carry `count`. Both
    // fields mirror the same value so callers reading either name see the
    // server-reported count.
    totalCount: count,
    headers: responseHeaders,
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
 * - When `groupThrowOnError` is true, the first entry whose
 *   `applyResponseCallbacks(...)` would throw (i.e. the first `{ success:
 *   false }` entry) throws the resulting `ServiceError` from inside that
 *   entry's `applyResponseCallbacks` call and short-circuits the iteration.
 *   The remaining entries are not finalized. This matches how `throwOnError`
 *   behaves in the direct path: the caller awaits a single rejection instead
 *   of receiving the array.
 *
 * `groupThrowOnError` is derived once by the caller from the shared per-call
 * request config (group requires all members to share one
 * `AxiosRequestConfig`), so a batch is uniformly throw-on-error or
 * return-per-entry.
 */
export function applyGroupCallbacks<TEntry extends { success: boolean }>(
  entries: TEntry[],
  services: ReadonlyArray<
    | { applyResponseCallbacks?: <E extends { success: boolean }>(res: E, throwOnErrorOverride?: boolean) => E }
    | undefined
  >,
  groupThrowOnError: boolean,
): TEntry[] {
  for (let i = 0; i < entries.length; i++) {
    const svc = services[i];
    const finalized = svc?.applyResponseCallbacks
      ? svc.applyResponseCallbacks(entries[i], groupThrowOnError)
      : entries[i];
    entries[i] = finalized;
    if (groupThrowOnError && !finalized.success) {
      // The first failure in a throw-on-error group short-circuits the
      // batch. The `ServiceError` was already thrown from inside
      // `applyResponseCallbacks`, so control flow transfers to the
      // caller's reject branch and the loop halts without finalizing the
      // remaining entries.
      break;
    }
  }
  return entries;
}

const toResultError = (result: { success: boolean } & Partial<ResultError>): ResultError => ({
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
