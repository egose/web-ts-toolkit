import JsonRouter from '@web-ts-toolkit/express-json-router';
import { isPlainObject } from '@web-ts-toolkit/utils';
import { Codes } from '../enums';
import type {
  ErrorResult,
  FindOneOptions,
  FindOptions,
  PublicListArgs,
  PublicListOptions,
  PublicReadArgs,
  PublicReadOptions,
} from '../interfaces';

// Control slots only. These names remain valid in payloads, predicates, projections
// and task data. Keep this list in sync with private execution transports.
const privateControls = [
  'authorization',
  'overrides',
  'documentAuthorization',
  'documentAuthorizationStage',
  'execution',
  'executionContext',
  'serviceExecutionContext',
  'resolvedAuthorization',
  'preparedQuery',
  'preparedFilter',
  'preparedModelQuery',
  'resolvedIdentifier',
  'skipParsing',
  'skipAuthorization',
  'alreadyAuthorized',
  'unsafeSkipListDocumentSnapshotChecks',
  'unsafeSkipReadDocumentSnapshotChecks',
  'operation',
] as const;

export class PublicAdmissionError extends JsonRouter.clientErrors.BadRequestError {
  readonly result: ErrorResult<{ detail: string }>;

  constructor(detail: string) {
    const errors = [{ detail }];
    super('Bad Request', { errors });
    this.result = { success: false, kind: 'error', code: Codes.BadRequest, errors };
  }
}

export type PublicAdmissionKind = 'envelope' | 'include' | 'populate' | 'data';

/** Synchronous whole-tree preflight before any sibling dispatch. Does not parse
 * predicates or substituted correlated values. Only $$sq introduces control slots
 * inside business data; ordinary properties (even `options`) remain inert data.
 */
export function assertPublicAdmission(input: unknown, kind: PublicAdmissionKind = 'envelope'): void {
  const pending = [{ value: input, kind, path: 'request' }];
  const seen = new WeakMap<object, Set<PublicAdmissionKind>>();
  while (pending.length) {
    const { value, kind: slot, path } = pending.pop()!;
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
    const kinds = seen.get(value) ?? new Set<PublicAdmissionKind>();
    if (kinds.has(slot)) continue;
    kinds.add(slot);
    seen.set(value, kinds);
    const add = (child: unknown, childKind: PublicAdmissionKind, key: string) => {
      pending.push({ value: child, kind: childKind, path: `${path}.${key}` });
    };
    const record = value as Record<string, unknown>;
    if (slot !== 'data') {
      for (const key of privateControls) {
        // Presence includes undefined, non-enumerable and inherited JS controls.
        if (key in record) {
          throw new PublicAdmissionError(
            key === 'unsafeSkipListDocumentSnapshotChecks' || key === 'unsafeSkipReadDocumentSnapshotChecks'
              ? `Unsupported public control ${path}.${key}; this unsafe flag is server model configuration only`
              : `Unsupported public control ${path}.${key}; use explicit per-call internal service options for backend authorization`,
          );
        }
      }
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => add(child, slot, String(index)));
      continue;
    }
    if (slot === 'data') {
      if (!isPlainObject(value)) continue;
      for (const [key, child] of Object.entries(value)) add(child, key === '$$sq' ? 'envelope' : 'data', key);
      continue;
    }
    for (const key of ['args', 'options', 'sqOptions']) add(record[key], 'envelope', key);
    add(record.include, 'include', 'include');
    add(record.populate, 'populate', 'populate');
    for (const key of ['filter', 'match', 'data']) add(record[key], 'data', key);
  }
}

/** Legacy hydration configuration fails synchronously, including service.defaults assignment. */
export function assertHydrationDefaults(defaults: unknown): void {
  if (defaults && typeof defaults === 'object') {
    const record = defaults as Record<string, unknown>;
    if ('hydration' in record)
      throw new TypeError('defaults.hydration is unsupported; use model hydration configuration');
    for (const bucket of [
      'publicListOptions',
      'publicReadOptions',
      'findOptions',
      'findOneOptions',
      'findByIdOptions',
      'createOptions',
      'updateOneOptions',
      'updateByIdOptions',
      'upsertOptions',
      'existsOptions',
      'publicCreateOptions',
      'publicUpdateOptions',
    ]) {
      const options = record[bucket];
      if (!options || (typeof options !== 'object' && typeof options !== 'function')) continue;
      for (const key of ['lean', 'hydration']) {
        if (!(key in options)) continue;
        const method = bucket.slice(0, -'Options'.length);
        const migration = ['publicList', 'publicRead', 'find', 'findOne', 'findById'].includes(method)
          ? `use model hydration.${method} ('lean' or 'hydrated')`
          : 'this method has a fixed fetch mode';
        throw new TypeError(`defaults.${bucket}.${key} is unsupported; ${migration}`);
      }
    }
  }
}

/** Defaults never carry per-call authority, including through dotted setters. */
export function assertPublicDefaults(defaults: unknown): void {
  assertHydrationDefaults(defaults);
  assertPublicAdmission(defaults);
  if (defaults && typeof defaults === 'object') {
    for (const value of Object.values(defaults)) assertPublicAdmission(value);
  }
}

const listArgs = ['select', 'populate', 'include', 'sort', 'skip', 'limit', 'page', 'pageSize', 'tasks'] as const;
const readArgs = ['select', 'populate', 'include', 'sort', 'tasks'] as const;
const listOptions = [
  'skim',
  'includePermissions',
  'includeFieldPermissions',
  'includeCount',
  'populateAccess',
] as const;
const readOptions = ['skim', 'includePermissions', 'includeFieldPermissions', 'tryList', 'populateAccess'] as const;

/** Positive forwarding; unknown keys and symbols never reach a receiving service. */
export function pickPublicKeys<T>(input: unknown, keys: readonly string[]): T {
  const result: Record<string, unknown> = {};
  if (input && typeof input === 'object') {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(input, key)) result[key] = (input as Record<string, unknown>)[key];
    }
  }
  return result as T;
}

export function forwardPublicArgs(input: unknown, op: 'list' | 'read'): PublicListArgs & PublicReadArgs {
  assertPublicAdmission(input);
  return pickPublicKeys(input, op === 'list' ? listArgs : readArgs);
}

export function forwardPublicOptions(input: unknown, op: 'list' | 'read'): PublicListOptions & PublicReadOptions {
  assertPublicAdmission(input);
  return pickPublicKeys(input, op === 'list' ? listOptions : readOptions);
}

const requestAuthorization = Object.freeze({ outputFields: Object.freeze({ mode: 'request' as const }) });

type RequestPresentationOptions = Omit<FindOptions & FindOneOptions, 'authorization'>;

/** Package-created request-only policy. Missing rows/related dimensions also mean
 * request authority. Only presentation keys and the package-selected read access
 * are copied; private association/execution transport must travel separately.
 */
export function requestOnlyServiceOptions(options: RequestPresentationOptions) {
  return {
    ...pickPublicKeys<RequestPresentationOptions>(options, [...listOptions, 'access']),
    authorization: requestAuthorization,
  };
}
