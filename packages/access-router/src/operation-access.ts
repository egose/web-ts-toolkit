import type { OperationAccessContext, Validation } from './interfaces/access';

const operations = new Set(['new', 'list', 'read', 'create', 'update', 'upsert', 'delete', 'count', 'distinct']);
const subOperations = new Set(['list', 'read', 'create', 'update', 'delete']);
const members = new Set(['default', 'basic', 'advanced', 'root']);

// Diagnostic denylist only. These identifiers are never resolved or translated into guards.
const removedAccesses = new Set(
  ['List', 'Read', 'Create', 'Update', 'Upsert', 'Count', 'Distinct'].flatMap((operation) => [
    `basic${operation}`,
    `advanced${operation}`,
  ]),
);

export const isRemovedOperationAccess = (access: unknown): boolean =>
  typeof access === 'string' && removedAccesses.has(access);

/** Configuration-member paths are not operations or trusted custom target accesses. */
export function isOperationAccessMemberPath(access: string): boolean {
  const keys = access.split('.');
  if (operations.has(keys[0]) && members.has(keys[1])) return true;
  return keys[0] === 'subs' && keys[1] !== '' && subOperations.has(keys[2]) && members.has(keys[3]);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** Exact own-data reads also work with frozen/captured policy, without a live runtime. */
function readOwnOption(root: unknown, key: string): unknown {
  let value = root;
  for (const part of key.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    const slot = Object.getOwnPropertyDescriptor(value, part);
    if (!slot || !('value' in slot)) return undefined;
    value = slot.value;
  }
  return value;
}

export interface OperationAccessReaders {
  /** Exact stored path, with no parent or runtime fallback. */
  readOption(key: string): unknown;
  /** Same exact path in this model owner's defaults. Omit for data routers. */
  readDefaultOption?(key: string): unknown;
}

/** Pass complete effective option snapshots; defaults are a separate, same-owner snapshot. */
export function createOperationAccessReaders(options: unknown, defaults?: unknown): OperationAccessReaders {
  return {
    readOption: (key) => readOwnOption(options, key),
    readDefaultOption: defaults === undefined ? undefined : (key) => readOwnOption(defaults, key),
  };
}

type OperationAccessSelection = OperationAccessReaders & {
  baseAccess: string;
  /** Omit for secondary/base checks. Never infer this from the request. */
  context?: OperationAccessContext;
  subdocuments?: boolean;
};

const scalarGuard = (value: unknown): Validation | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'function')
    return value as Validation;
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value;
  return false;
};

/** Only the selected operation object's OWN default applies; no recursive runtime merge. */
function operationDefault(value: unknown): Validation | undefined {
  if (!isRecord(value)) return scalarGuard(value);
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !members.has(key))) return false;
  return scalarGuard(readOwnOption(value, 'default'));
}

/** Select exactly one guard. Invalid defined values deny, and only undefined falls through. */
export function selectOperationAccessGuard({
  baseAccess,
  context,
  readOption,
  readDefaultOption,
  subdocuments = false,
}: OperationAccessSelection): Validation | undefined {
  const keys = baseAccess.split('.');
  if (
    isRemovedOperationAccess(baseAccess) ||
    isOperationAccessMemberPath(baseAccess) ||
    (keys[0] === 'subs' && isRemovedOperationAccess(keys[2]))
  )
    return false;
  if (context !== undefined && !['basic', 'advanced', 'root'].includes(context)) return false;

  const exact = (key: string) => {
    const value = readOption(key);
    return value === undefined ? readDefaultOption?.(key) : value;
  };
  const contextGuard = (key: string, supported: boolean): Validation | undefined =>
    context === undefined || !supported ? undefined : scalarGuard(exact(`${key}.${context}`));

  let access = baseAccess;
  if (subdocuments && keys[0] === 'subs') {
    if (keys.length < 3 || keys[1] === '') return false;
    const fieldKey = `operationAccess.subs.${keys[1]}`;
    const operationKey = `operationAccess.${baseAccess}`;
    const selected = contextGuard(operationKey, keys.length === 3 && subOperations.has(keys[2]));
    if (selected !== undefined) return selected;
    const operation = exact(operationKey);
    if (operation !== undefined) {
      // Custom operation objects were never scalar grants; supported operations get nested defaults.
      const guard =
        keys.length === 3 && subOperations.has(keys[2]) ? operationDefault(operation) : scalarGuard(operation);
      if (guard !== undefined) return guard;
    }
    const field = exact(fieldKey);
    if (field !== undefined) return scalarGuard(field);
    // An absent field, unlike a closed field object, uses the top-level operation.
    access = keys[2];
  }

  const operationKey = `operationAccess.${access}`;
  const selected = contextGuard(operationKey, operations.has(access));
  if (selected !== undefined) return selected;

  const operation = readOption(operationKey);
  if (operation !== undefined) {
    const guard = operations.has(access) ? operationDefault(operation) : scalarGuard(operation);
    if (guard !== undefined) return guard;
  }

  const outerDefault = readOption('operationAccess.default');
  if (outerDefault !== undefined) return scalarGuard(outerDefault);
  const outer = readOption('operationAccess');
  if (outer !== undefined) return scalarGuard(outer);

  // Explicit whole-model undefined keeps exact-operation fallback, not a runtime catch-all.
  const inherited = readDefaultOption?.(operationKey);
  return operations.has(access) ? operationDefault(inherited) : scalarGuard(inherited);
}

/** Evaluate only the selected guard; hook identity, request binding and errors belong to the evaluator. */
export async function resolveRouteOperationAccess({
  canActivate,
  ...selection
}: OperationAccessSelection & { canActivate(guard: Validation): Promise<boolean> }): Promise<boolean> {
  const guard = selectOperationAccessGuard(selection);
  return guard === undefined ? false : canActivate(guard);
}

function rejectRemovedKey(key: string, prefix: string): never {
  const context = key.startsWith('basic') ? 'basic' : 'advanced';
  const operation = key.slice(context.length);
  const replacement = `${operation[0].toLowerCase()}${operation.slice(1)}.${context}`;
  throw new TypeError(
    `Removed operation-access key "${prefix}${key}"; use "${prefix}${replacement}" instead. ` +
      `Move the operation's former scalar guard to its "default" member when using an object.`,
  );
}

function assertOperationNode(node: unknown, prefix: string): void {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  for (const key of removedAccesses) if (key in node) rejectRemovedKey(key, prefix);
  // Dotted bulk keys are not aliases either. Inspect only operation positions, never business fields.
  for (const key of Object.getOwnPropertyNames(node)) {
    const [operation] = key.split('.');
    if (isRemovedOperationAccess(operation)) rejectRemovedKey(operation, prefix);
  }
}

/** Validate an entire option update before any option manager can publish part of it. */
export function assertOperationAccessOptions(options: unknown): void {
  if (!options || typeof options !== 'object') return;
  for (const key of Object.getOwnPropertyNames(options)) {
    if (key === 'operationAccess' || key.startsWith('operationAccess.')) {
      assertOperationAccessUpdate(key, (options as Record<string, unknown>)[key]);
    }
  }
}

/** Validate whole guards, field maps and exact/dotted/fluent updates through the same boundary. */
export function assertOperationAccessUpdate(key: string, value: unknown): void {
  const path = key.split('.');
  if (path[0] !== 'operationAccess') return;
  if (isRemovedOperationAccess(path[1])) rejectRemovedKey(path[1], 'operationAccess.');
  if (path[1] === 'subs' && path.length >= 4 && isRemovedOperationAccess(path[3]))
    rejectRemovedKey(path[3], `operationAccess.subs.${path[2]}.`);

  if (path.length === 1) {
    assertOperationNode(value, 'operationAccess.');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const property of Object.getOwnPropertyNames(value)) {
        if (property === 'subs' || property.startsWith('subs.'))
          assertOperationAccessUpdate(`operationAccess.${property}`, (value as Record<string, unknown>)[property]);
      }
    }
  } else if (path.length === 2 && path[1] === 'subs') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const field of Object.getOwnPropertyNames(value))
        assertOperationAccessUpdate(`operationAccess.subs.${field}`, (value as Record<string, unknown>)[field]);
    }
  } else if (path.length === 3 && path[1] === 'subs') {
    assertOperationNode(value, `${key}.`);
  }
}
