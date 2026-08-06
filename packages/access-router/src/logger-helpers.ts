import { getGlobalOption } from './options';
import { defaultLogger } from './logger-default';
import type { AccessRouterLogger } from './interfaces';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_FILTER_KEYS = new Set<string>([
  'password',
  'pwd',
  'secret',
  'token',
  'access_token',
  'refreshtoken',
  'api_key',
  'apikey',
  'authorization',
  'authtoken',
  'credentials',
  'privatekey',
  'ssn',
  'creditcard',
  'cardnumber',
  'cvv',
  'tenantid',
  'tenant',
]);

const SENSITIVE_PAYLOAD_KEYS = new Set<string>(SENSITIVE_FILTER_KEYS);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const safeReplace = (value: unknown, seen: WeakSet<object>): unknown => {
  if (value === null || typeof value === 'undefined') return value;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);
    try {
      if (Array.isArray(value)) {
        return value.map((entry) => safeReplace(entry, seen));
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = safeReplace(v, seen);
      }
      return out;
    } finally {
      seen.delete(value as object);
    }
  }
  return value;
};

const redactObjectKeys = (value: unknown, sensitiveKeys: Set<string>, seen: WeakSet<object>): unknown => {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => redactObjectKeys(entry, sensitiveKeys, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lowered = String(k).toLowerCase();
      if (sensitiveKeys.has(lowered)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactObjectKeys(v, sensitiveKeys, seen);
      }
    }
    return out;
  } finally {
    seen.delete(value as object);
  }
};

export const redactFilter = <T>(filter: T): T => {
  return redactObjectKeys(filter, SENSITIVE_FILTER_KEYS, new WeakSet()) as T;
};

export const redactPayload = <T>(payload: T): T => {
  return redactObjectKeys(payload, SENSITIVE_PAYLOAD_KEYS, new WeakSet()) as T;
};

export const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(safeReplace(value, new WeakSet()));
  } catch {
    return '[Unserializable]';
  }
};

const countFilterKeys = (filter: unknown): number => {
  if (filter === null || typeof filter === 'undefined') return 0;
  if (typeof filter !== 'object') return 0;
  if (Array.isArray(filter)) return 0;

  let count = 0;
  const stack: unknown[] = [filter];
  const seen = new WeakSet<object>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== 'object' || Array.isArray(current)) continue;
    if (seen.has(current as object)) continue;
    seen.add(current as object);

    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      // Count own key names; do not traverse into values or record them.
      // Operator keys ($and, $or, $in, etc.) carry nested predicates and count
      // as structural nodes themselves but their nested predicates are walked
      // to surface cardinality without ever serializing their values.
      count += 1;

      if (typeof key === 'string' && key.startsWith('$') && value !== null && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (const entry of value) {
            if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
              stack.push(entry);
            }
          }
        } else {
          stack.push(value);
        }
      }
    }
  }

  return count;
};

export const summarizeFilter = <T>(filter: T): { filterKeyValueCount: number } => {
  return { filterKeyValueCount: countFilterKeys(filter) };
};

const resolveLogger = (): AccessRouterLogger => {
  return getGlobalOption('logger') ?? defaultLogger;
};

export const isLevelEnabled = (level: LogLevel): boolean => {
  const target = resolveLogger();
  const fn = target?.isLevelEnabled as ((level: LogLevel) => boolean) | undefined;
  if (typeof fn === 'function') {
    try {
      return !!fn.call(target, level);
    } catch {
      return true;
    }
  }
  // Conservative fallback: assume enabled so loggers without isLevelEnabled still
  // get the structured payload, matching prior behavior.
  return true;
};

export interface OpLogContext {
  op: string;
  modelName?: string;
  dataName?: string;
  populateCount?: number;
  selectCount?: number;
  page?: number;
  pageSize?: number;
  skip?: number;
  limit?: number;
  sort?: unknown;
  filterKeyValueCount?: number;
  startedAt?: number;
  durationMs?: number;
  resultCode?: string | number;
}

const buildOpMessage = (ctx: OpLogContext): string => {
  const trimmed: Record<string, unknown> = { op: ctx.op };
  if (ctx.modelName) trimmed.modelName = ctx.modelName;
  if (ctx.dataName) trimmed.dataName = ctx.dataName;
  if (ctx.page != null) trimmed.page = ctx.page;
  if (ctx.pageSize != null) trimmed.pageSize = ctx.pageSize;
  if (ctx.skip != null) trimmed.skip = ctx.skip;
  if (ctx.limit != null) trimmed.limit = ctx.limit;
  if (ctx.sort != null) trimmed.sort = ctx.sort;
  if (ctx.populateCount != null) trimmed.populateCount = ctx.populateCount;
  if (ctx.selectCount != null) trimmed.selectCount = ctx.selectCount;
  if (ctx.filterKeyValueCount != null) trimmed.filterKeyValueCount = ctx.filterKeyValueCount;
  if (ctx.startedAt != null && ctx.durationMs == null) {
    trimmed.startedAt = ctx.startedAt;
  }
  if (ctx.durationMs != null) trimmed.durationMs = ctx.durationMs;
  if (ctx.resultCode != null) trimmed.resultCode = ctx.resultCode;
  // ARF-07: never emit raw query/filter/input values. Only structure/cardinality
  // metadata (filterKeyValueCount) is recorded; raw client filter values (emails,
  // names, IDs, tenant keys) and redacted copies are intentionally omitted.
  return safeStringify(trimmed);
};

const safeApply = (fn: (...args: unknown[]) => unknown, thisArg: unknown, args: unknown[]): void => {
  try {
    fn.apply(thisArg, args);
  } catch {
    // Logging failures must never break request handling.
  }
};

export const debug = (ctx: OpLogContext): void => {
  if (!isLevelEnabled('debug')) return;
  const target = resolveLogger();
  const fn = target?.debug ?? defaultLogger.debug;
  const message = buildOpMessage(ctx);
  safeApply(fn as (...a: unknown[]) => unknown, target ?? defaultLogger, [message]);
};

export const info = (ctx: OpLogContext): void => {
  const target = resolveLogger();
  const fn = target?.info ?? defaultLogger.info;
  const message = buildOpMessage(ctx);
  safeApply(fn as (...a: unknown[]) => unknown, target ?? defaultLogger, [message]);
};

export const warn = (message: string, meta?: Record<string, unknown>): void => {
  const target = resolveLogger();
  const fn = target?.warn ?? defaultLogger.warn;
  safeApply(fn as (...a: unknown[]) => unknown, target ?? defaultLogger, meta != null ? [message, meta] : [message]);
};

export const logInfoMessage = (message: string, ...args: unknown[]): void => {
  const target = resolveLogger();
  const fn = target?.info ?? defaultLogger.info;
  const payload = args.length > 0 ? [message, ...args] : [message];
  safeApply(fn as (...a: unknown[]) => unknown, target ?? defaultLogger, payload);
};

export const error = (error: unknown): void => {
  const target = resolveLogger();
  const fn = target?.error ?? defaultLogger.error;
  safeApply(fn as (...a: unknown[]) => unknown, target ?? defaultLogger, [error]);
};
