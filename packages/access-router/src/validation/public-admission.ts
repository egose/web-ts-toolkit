import JsonRouter from '@web-ts-toolkit/express-json-router';
import { isPlainObject } from '@web-ts-toolkit/utils';
import { Codes } from '../enums';
import { unsafeServerOptions } from '../acl/unsafe-snapshot-options';
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
  'snapshotDerivation',
  'resolvedAuthorization',
  'preparedQuery',
  'preparedFilter',
  'preparedModelQuery',
  'resolvedIdentifier',
  'skipParsing',
  'skipAuthorization',
  'alreadyAuthorized',
  ...unsafeServerOptions,
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
type ControlAdmissionKind = PublicAdmissionKind | 'policy' | 'policies' | 'defaults';

const defaultControlBuckets = [
  'findOneArgs',
  'findOneOptions',
  'findByIdArgs',
  'findByIdOptions',
  'findArgs',
  'findOptions',
  'createArgs',
  'createOptions',
  'updateOneArgs',
  'updateOneOptions',
  'upsertOptions',
  'updateByIdArgs',
  'upsertArgs',
  'updateByIdOptions',
  'existsOptions',
  'publicListArgs',
  'publicListOptions',
  'publicCreateArgs',
  'publicCreateOptions',
  'publicReadArgs',
  'publicReadOptions',
  'publicUpdateArgs',
  'publicUpdateOptions',
] as const;

/** Synchronous whole-tree preflight before any sibling dispatch. Does not parse
 * predicates or substituted correlated values. Only $$sq introduces control slots
 * inside business data; ordinary properties (even `options`) remain inert data.
 */
export function assertPublicAdmission(input: unknown, kind: PublicAdmissionKind = 'envelope'): void {
  assertPublicControlAdmission(input, kind);
}

function assertPublicControlAdmission(input: unknown, kind: ControlAdmissionKind): void {
  walkControlAdmission(
    input,
    kind,
    (record, path) => {
      for (const key of privateControls) {
        // Presence includes undefined, non-enumerable and inherited JS controls.
        if (key in record) {
          throw new PublicAdmissionError(
            (unsafeServerOptions as readonly string[]).includes(key)
              ? `Unsupported public control ${path}.${key}; this unsafe flag is server model configuration only`
              : `Unsupported public control ${path}.${key}; use explicit per-call internal service options for backend authorization`,
          );
        }
      }
    },
    (detail) => {
      throw new PublicAdmissionError(detail);
    },
  );
}

/** Service/helper/policy preflight uses the SAME bounded control/data lanes, but must
 * not reject existing backend per-call authorization or other public-only controls.
 */
export function assertNoServerModelControls(
  input: unknown,
  reject: (detail: string) => never,
  kind: ControlAdmissionKind = 'envelope',
): void {
  walkControlAdmission(
    input,
    kind,
    (record, path) => {
      for (const key of unsafeServerOptions)
        if (key in record) reject(`${path}.${key} is server model configuration only`);
    },
    reject,
  );
}

function walkControlAdmission(
  input: unknown,
  kind: ControlAdmissionKind,
  check: (record: Record<string, unknown>, path: string) => void,
  reject: (detail: string) => never,
): void {
  const pending = [{ value: input, kind, path: 'request', depth: 0 }];
  const seen = new WeakMap<object, Set<ControlAdmissionKind>>();
  let slots = 1;
  while (pending.length) {
    const { value, kind: slot, path, depth } = pending.pop()!;
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
    const kinds = seen.get(value) ?? new Set<ControlAdmissionKind>();
    if (kinds.has(slot)) continue;
    kinds.add(slot);
    seen.set(value, kinds);
    const add = (child: unknown, childKind: ControlAdmissionKind, key: string) => {
      if (child === undefined || child === null) return;
      if (++slots > 20000 || depth >= 100) reject('control admission exceeds structural limits');
      pending.push({ value: child, kind: childKind, path: `${path}.${key}`, depth: depth + 1 });
    };
    const record = value as Record<string, unknown>;
    if (slot !== 'data' && slot !== 'policies') check(record, path);
    // Preflight must not execute a policy/control accessor before the existing
    // snapshot validator can reject it. Inherited data slots still count as controls.
    const read = (key: string): unknown => {
      let owner: object | null = value;
      for (let depth = 0; owner; depth++, owner = Object.getPrototypeOf(owner)) {
        if (depth > 100) reject('control admission prototype depth exceeded');
        const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        if (!descriptor) continue;
        if (!('value' in descriptor)) reject(`accessor control/data property: ${path}.${key}`);
        return descriptor.value;
      }
      return undefined;
    };
    if (Array.isArray(value)) {
      if (value.length > 20000) reject('control admission array exceeds structural limits');
      for (let index = 0; index < value.length; index++) {
        if (index in value) add(read(String(index)), slot, String(index));
      }
      continue;
    }
    if (slot === 'data') {
      if (!isPlainObject(value)) continue;
      // $$sq alone introduces control slots inside business data, including JS slots.
      add(read('$$sq'), 'envelope', '$$sq');
      for (const key of Object.keys(value)) if (key !== '$$sq') add(read(key), 'data', key);
      continue;
    }
    if (slot === 'defaults') {
      const keys = new Set([...Object.keys(value), ...defaultControlBuckets]);
      if (keys.size > 20000) reject('control admission defaults exceeds structural limits');
      // Named buckets can be inherited/non-enumerable and disappear in a clone.
      // All other enumerable default values retain the existing control preflight.
      for (const key of keys) if (key in record) add(read(key), 'envelope', key);
      continue;
    }
    if (slot === 'policies') {
      for (const key of Object.keys(value)) add(read(key), 'policy', key);
      continue;
    }
    if (slot === 'policy') {
      for (const key of ['rows', 'outputFields', 'inputFields', 'operation']) add(read(key), 'policy', key);
      add(read('related'), 'policies', 'related');
      add(read('filter'), 'data', 'filter');
      continue;
    }
    for (const key of ['args', 'options', 'sqOptions']) add(read(key), 'envelope', key);
    add(read('include'), 'include', 'include');
    add(read('populate'), 'populate', 'populate');
    add(read('authorization'), 'policy', 'authorization');
    for (const key of ['filter', 'match', 'data']) add(read(key), 'data', key);
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
  // Descriptor admission precedes readers/cloners, including hydration's named
  // bucket lookup. Never invoke a bucket getter to discover its unsafe controls.
  assertPublicControlAdmission(defaults, 'defaults');
  assertHydrationDefaults(defaults);
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
