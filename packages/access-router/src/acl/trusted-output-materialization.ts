/** Selected-value work only. No source/grant eligibility or descendant-identity walk. */
import { types } from 'node:util';
import { mongo } from 'mongoose';
import { authorizationError, ServiceAuthorizationError } from './authorization-snapshot';
import { copyPermissionsAlias, isGeneratedPermissionsAliasSlot } from '../output/permissions-alias';
import {
  currentOutputWorkLedger,
  debitOutputPayload,
  debitOutputWork,
  outsideOutputWorkLedger,
  withOutputWorkLedger,
  prepareOutputWorkString,
  type OutputWorkLedger,
} from './output-work-ledger';

const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype', '_doc', '$__']);
const protectedValueKeys = new Set([...unsafeKeys, '__v']);

/** Only root descriptors are examined. Hidden/unselected descendant shape is deliberately unproven. */
export function isBorrowableAuthorizationRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length > 20000) return false;
  for (const key of keys) {
    if (typeof key !== 'string' || unsafeKeys.has(key)) return false;
    const slot = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in slot) || (!slot.enumerable && !isGeneratedPermissionsAliasSlot(value, key, slot))) return false;
  }
  return true;
}

declare const budgetBrand: unique symbol;
export interface TrustedOutputBudget {
  readonly [budgetBrand]: true;
}
interface BudgetRecord {
  slots: number;
  failure?: ServiceAuthorizationError;
  onFailure?: (error: ServiceAuthorizationError) => void;
  ownerCheck?: () => void;
  ledger?: OutputWorkLedger;
  recipients?: readonly { budget: TrustedOutputBudget; depth: number; multiplicity: number }[];
}
const budgets = new WeakMap<TrustedOutputBudget, BudgetRecord>();

export function createTrustedOutputBudget(
  onFailure?: (error: ServiceAuthorizationError) => void,
  ownerCheck?: () => void,
  ledger?: OutputWorkLedger,
): TrustedOutputBudget {
  const budget = Object.freeze(Object.create(null)) as TrustedOutputBudget;
  // Explicit publication ownership (including an independent non-collection
  // owner) wins over an ambient synchronous configuration-preparation scope.
  const ownerLedger = arguments.length < 3 ? currentOutputWorkLedger() : ledger;
  budgets.set(budget, {
    slots: 0,
    failure: undefined,
    recipients: undefined,
    onFailure,
    ownerCheck,
    ledger: ownerLedger,
  });
  return budget;
}

/** Related construction debits every receiving root BEFORE traversal, never a fresh child allowance. */
export function createReceivingOutputBudget(
  recipients: readonly { budget: TrustedOutputBudget; depth: number; multiplicity?: number }[],
): TrustedOutputBudget {
  if (!recipients.length) authorizationError('related output requires a receiving row budget');
  const budget = createTrustedOutputBudget(undefined, undefined, undefined);
  budgets.get(budget)!.recipients = Object.freeze(
    recipients.map((entry) => {
      assertTrustedOutputBudget(entry.budget);
      if (
        !Number.isSafeInteger(entry.depth) ||
        entry.depth < 0 ||
        !Number.isSafeInteger(entry.multiplicity ?? 1) ||
        (entry.multiplicity ?? 1) < 1
      )
        authorizationError('invalid receiving output budget edge');
      return Object.freeze({ ...entry, multiplicity: entry.multiplicity ?? 1 });
    }),
  );
  const firstLedger = budgets.get(recipients[0].budget)!.ledger;
  if (firstLedger && recipients.every((edge) => budgets.get(edge.budget)!.ledger === firstLedger))
    budgets.get(budget)!.ledger = firstLedger;
  return budget;
}

export function failTrustedOutputBudget(budget: TrustedOutputBudget, error: unknown): never {
  const record = budgets.get(budget);
  if (!record) authorizationError('invalid selected output budget');
  record.failure ??=
    error instanceof ServiceAuthorizationError ? error : new ServiceAuthorizationError('unsupported selected value');
  record.onFailure?.(record.failure);
  for (const edge of record.recipients ?? []) {
    try {
      failTrustedOutputBudget(edge.budget, record.failure);
    } catch {
      /* all owners poison */
    }
  }
  throw record.failure;
}

export function assertTrustedOutputBudget(budget: TrustedOutputBudget): void {
  const record = budgets.get(budget);
  if (!record) authorizationError('invalid selected output budget');
  record.ownerCheck?.();
  record.ledger?.check();
  if (record.failure) throw record.failure;
  for (const edge of record.recipients ?? []) assertTrustedOutputBudget(edge.budget);
}

/** Shared by selected values, embedded builders, attachment spines and related occurrences. */
export function visitTrustedOutput(
  budget: TrustedOutputBudget,
  depth: number,
  slots = 1,
  charged?: Set<OutputWorkLedger>,
): void {
  const record = budgets.get(budget);
  if (!record) authorizationError('invalid selected output budget');
  assertTrustedOutputBudget(budget);
  if (record.recipients?.length) charged ??= new Set();
  if (record.ledger && !charged?.has(record.ledger)) {
    debitOutputWork(record.ledger, slots);
    charged?.add(record.ledger);
  }
  if (depth > 100 || (record.slots += slots) > 20000)
    failTrustedOutputBudget(budget, new ServiceAuthorizationError('selected output exceeds structural limits'));
  try {
    for (const edge of record.recipients ?? [])
      visitTrustedOutput(edge.budget, depth + edge.depth, slots * edge.multiplicity, charged);
  } catch (error) {
    // Failure of any shared receiver poisons every registered receiver, including
    // ones charged earlier in this same synchronous admission.
    failTrustedOutputBudget(budget, error);
  }
}

/** A branded catalog's actual construction already debited the operation ledger.
 * Preserve the separate capture owner's allowance without billing that SAME
 * omitted visit again. Never used for source/selected/native admission. */
export function preloadTrustedOutputBudget(budget: TrustedOutputBudget, depth: number, slots: number): void {
  const record = budgets.get(budget);
  if (!record) authorizationError('invalid selected output budget');
  visitTrustedOutput(budget, depth, slots, record.ledger ? new Set([record.ledger]) : undefined);
}

/** Payload is debited BEFORE an explicit router-owned preparation/copy. */
export function prepareTrustedOutputPayload(
  budget: TrustedOutputBudget,
  value: string | number,
  charged?: Set<OutputWorkLedger>,
): void {
  const record = budgets.get(budget);
  if (!record) authorizationError('invalid selected output budget');
  if (!record.ledger && !record.recipients?.length) return;
  assertTrustedOutputBudget(budget);
  if (record.recipients?.length) charged ??= new Set();
  if (record.ledger && !charged?.has(record.ledger)) {
    debitOutputPayload(record.ledger, value);
    charged?.add(record.ledger);
  }
  for (const edge of record.recipients ?? []) prepareTrustedOutputPayload(edge.budget, value, charged);
}

export function defineTrustedOutputValue(output: object, key: string, value: unknown): void {
  Object.defineProperty(output, key, { value, enumerable: true, configurable: true, writable: true });
}

/** Selected array structure only: safe data slots, bounded holes, no iterator/accessor observations. */
export function shallowTrustedOutputArray(
  input: readonly unknown[],
  budget: TrustedOutputBudget,
  depth: number,
  prepaid = false,
): unknown[] {
  if (types.isProxy(input))
    failTrustedOutputBudget(budget, new ServiceAuthorizationError('unsupported selected proxy'));
  const length = Object.getOwnPropertyDescriptor(input, 'length')!.value as number;
  visitTrustedOutput(budget, depth, prepaid ? 0 : 1);
  if (length) visitTrustedOutput(budget, depth + 1, length);
  for (const key of Reflect.ownKeys(input)) {
    if (key === 'length') continue;
    visitTrustedOutput(budget, depth + 1);
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key))
      failTrustedOutputBudget(budget, new ServiceAuthorizationError('invalid selected array property'));
    const slot = Object.getOwnPropertyDescriptor(input, key)!;
    if (!('value' in slot) || !slot.enumerable)
      failTrustedOutputBudget(budget, new ServiceAuthorizationError('accessor/non-enumerable selected value'));
  }
  const output: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const slot = Object.getOwnPropertyDescriptor(input, String(index));
    defineTrustedOutputValue(output, String(index), slot && 'value' in slot ? slot.value : undefined);
  }
  return output;
}

/** A planned named Map scope reads ONLY its selected keys, not the whole source Map/value graph. */
export function trustedMapOutputScope(
  value: unknown,
  fields: readonly string[],
  budget: TrustedOutputBudget,
  depth: number,
): unknown {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !types.isMap(value)) return value;
  const output: Record<string, unknown> = {};
  visitTrustedOutput(budget, depth);
  for (const key of fields) {
    visitTrustedOutput(budget, depth + 1);
    if (unsafeKeys.has(key)) continue;
    if (Map.prototype.has.call(value, key)) defineTrustedOutputValue(output, key, Map.prototype.get.call(value, key));
  }
  return output;
}

/** Shallow, ordinary working shell; never mutates the borrowed hook/source root. */
export function shallowTrustedOutput(
  source: Record<string, unknown>,
  budget: TrustedOutputBudget,
  depth = 0,
): Record<string, unknown> {
  try {
    visitTrustedOutput(budget, depth);
    const output: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(source)) {
      visitTrustedOutput(budget, depth + 1);
      if (typeof key !== 'string' || unsafeKeys.has(key)) authorizationError('unsafe selected output root');
      const slot = Object.getOwnPropertyDescriptor(source, key)!;
      if (isGeneratedPermissionsAliasSlot(source, key, slot)) continue;
      if (!('value' in slot) || !slot.enumerable) authorizationError('changed borrowed output root');
      defineTrustedOutputValue(output, key, slot.value);
    }
    return output;
  } catch (error) {
    failTrustedOutputBudget(budget, error);
  }
}

/** Retain the existing dot/bare/quoted-bracket output-path grammar, bounded before construction. */
function selectedOutputPathParts(path: string, budget: TrustedOutputBudget, depth: number): string[] {
  const parts: string[] = [];
  for (const match of path.matchAll(/[^.[\]]+|\[(?:([^"'[\]]+)|["']([^"']+)["'])\]/g)) {
    const part = match[1] ?? match[2] ?? match[0];
    if (!part || unsafeKeys.has(part))
      failTrustedOutputBudget(budget, new ServiceAuthorizationError('unsafe selected output path'));
    visitTrustedOutput(budget, depth + parts.length + 1, 0);
    parts.push(part);
  }
  if (!parts.length) failTrustedOutputBudget(budget, new ServiceAuthorizationError('unsafe selected output path'));
  return parts;
}

/** Copy-on-write spines. Raw/source and finalized target lanes never become each other's hook input. */
export function setTrustedOutputPath(
  output: Record<string, unknown>,
  path: string,
  value: unknown,
  budget: TrustedOutputBudget,
  depth = 0,
): void {
  try {
    const parts = selectedOutputPathParts(path, budget, depth);
    let current = output;
    for (const [index, key] of parts.slice(0, -1).entries()) {
      visitTrustedOutput(budget, depth + index + 1);
      const slot = Object.getOwnPropertyDescriptor(current, key);
      const source = slot && 'value' in slot ? slot.value : undefined;
      const shell = isBorrowableAuthorizationRecord(source)
        ? shallowTrustedOutput(source, budget, depth + index + 1)
        : {};
      defineTrustedOutputValue(current, key, shell);
      current = shell;
    }
    visitTrustedOutput(budget, depth + parts.length);
    defineTrustedOutputValue(current, parts[parts.length - 1], value);
    assertTrustedOutputBudget(budget);
  } catch (error) {
    failTrustedOutputBudget(budget, error);
  }
}

/** Remove a private fetch-only path without changing a borrowed descendant. */
export function unsetTrustedOutputPath(
  output: Record<string, unknown>,
  path: string,
  budget: TrustedOutputBudget,
): void {
  try {
    const parts = selectedOutputPathParts(path, budget, 0);
    let current = output;
    for (const [index, key] of parts.slice(0, -1).entries()) {
      const slot = Object.getOwnPropertyDescriptor(current, key);
      if (!slot || !('value' in slot) || !isBorrowableAuthorizationRecord(slot.value)) return;
      const shell = shallowTrustedOutput(slot.value, budget, index + 1);
      defineTrustedOutputValue(current, key, shell);
      current = shell;
    }
    delete current[parts[parts.length - 1]];
    assertTrustedOutputBudget(budget);
  } catch (error) {
    failTrustedOutputBudget(budget, error);
  }
}

/** Brand-family lookup is bounded and does not trust _bsontype/constructor-name tags. */
function isBsonValue(input: object): boolean {
  let prototype = Object.getPrototypeOf(input);
  for (let depth = 0; prototype && depth <= 100; depth++) {
    debitOutputWork();
    if (types.isProxy(prototype)) return false;
    if (prototype === mongo.BSON.BSONValue.prototype) return true;
    prototype = Object.getPrototypeOf(prototype);
  }
  return false;
}

const bsonFamilies = new Map<object, string>(
  Object.entries({
    ObjectId: mongo.BSON.ObjectId,
    Code: mongo.BSON.Code,
    DBRef: mongo.BSON.DBRef,
    Timestamp: mongo.BSON.Timestamp,
    Long: mongo.BSON.Long,
    Decimal128: mongo.BSON.Decimal128,
    Binary: mongo.BSON.Binary,
    Double: mongo.BSON.Double,
    Int32: mongo.BSON.Int32,
    BSONRegExp: mongo.BSON.BSONRegExp,
    BSONSymbol: mongo.BSON.BSONSymbol,
    MinKey: mongo.BSON.MinKey,
    MaxKey: mongo.BSON.MaxKey,
  }).map(([name, family]) => [family.prototype, name]),
);

/** No arbitrary accessors, proxy prototypes, constructor names or bare BSON tags. */
function selectedDataProperty(input: object, key: string, own = false): unknown {
  let object: object | null = input;
  for (let depth = 0; object && depth <= 100; depth++) {
    debitOutputWork();
    if (types.isProxy(object)) authorizationError('unsupported selected proxy');
    const slot = Object.getOwnPropertyDescriptor(object, key);
    if (slot) {
      if (!('value' in slot)) authorizationError('accessor selected BSON state');
      return slot.value;
    }
    object = own ? null : Object.getPrototypeOf(object);
  }
  if (object) authorizationError('unsupported selected prototype depth');
  return undefined;
}

/** Native byte storage is a scalar, not an enumerable object/array of output slots. */
function selectedBsonBytes(input: unknown, budget: TrustedOutputBudget): Buffer {
  if (!input || typeof input !== 'object' || types.isProxy(input) || !types.isUint8Array(input))
    authorizationError('unsupported selected BSON bytes');
  const prototype = Object.getPrototypeOf(Uint8Array.prototype);
  const buffer = Object.getOwnPropertyDescriptor(prototype, 'buffer')!.get!.call(input) as ArrayBuffer;
  const offset = Object.getOwnPropertyDescriptor(prototype, 'byteOffset')!.get!.call(input) as number;
  const length = Object.getOwnPropertyDescriptor(prototype, 'byteLength')!.get!.call(input) as number;
  prepareTrustedOutputPayload(budget, length);
  // Never invoke a subclass's iterator, length accessor, valueOf or species constructor.
  return Buffer.from(new Uint8Array(buffer, offset, length));
}

const regexpFlagNames = [
  'hasIndices',
  'global',
  'ignoreCase',
  'multiline',
  'dotAll',
  'unicode',
  'unicodeSets',
  'sticky',
];
function prepareRegExpFlags(input: object, budget: TrustedOutputBudget): string {
  const ledger = budgets.get(budget)!.ledger;
  if (ledger) debitOutputWork(ledger, regexpFlagNames.length);
  const flags: string[] = [];
  for (let index = 0; index < regexpFlagNames.length; index++)
    if (Object.getOwnPropertyDescriptor(RegExp.prototype, regexpFlagNames[index])?.get?.call(input)) {
      prepareTrustedOutputPayload(budget, 1);
      defineTrustedOutputValue(flags, String(flags.length), 'dgimsuvy'[index]);
    }
  prepareTrustedOutputPayload(budget, flags.length);
  return flags.join('');
}

export interface TrustedValuePolicy {
  /** Called after key-budget admission, before a data descriptor read; excluded values remain unobserved. */
  keep(key: string, path: string): boolean;
  /** Input/policy snapshots reject protected native keys rather than dropping a row constraint. */
  readonly rejectProtectedKeys?: boolean;
}

/** Value-local native compatibility, never a whole-source eligibility pass. */
function copyTrustedBsonValue(
  value: object,
  path: string,
  budget: TrustedOutputBudget,
  policy: TrustedValuePolicy,
  depth: number,
  active: WeakSet<object>,
): unknown {
  // BSON deserializers assign into ordinary records and native constructors. A
  // normalization hook may have installed inherited setters: reject those keys
  // before the wire copy, without an extra recursive graph/identity walk.
  const wireKeys = new Set([
    'value',
    'code',
    'scope',
    'collection',
    'oid',
    'db',
    'fields',
    'low',
    'high',
    'unsigned',
    'buffer',
    'sub_type',
    'position',
    'pattern',
    'options',
    'bytes',
    'i0',
    'i1',
    'i2',
    'i3',
  ]);
  const defineWireValue = (output: object, key: string, value: unknown) => {
    debitOutputWork();
    prepareTrustedOutputPayload(budget, key);
    wireKeys.add(key);
    defineTrustedOutputValue(output, key, value);
  };

  /** Only the selected BSON fallback enters this preparation. The serializer never
   * receives application containers, hooks, descriptors or subclass methods. Count
   * aliases per emitted occurrence; active ancestors (including the outer ordinary
   * materializer) reject cycles. The root is already charged/entered by visit(). */
  const prepareWire = (
    input: unknown,
    current: string,
    level: number,
    observeHook = true,
    entered = false,
    documentRoot = false,
    slots = 1,
  ): unknown => {
    if (!entered) visitTrustedOutput(budget, level, slots);
    if (typeof input === 'function' || typeof input === 'symbol') authorizationError('unsupported selected BSON value');
    if (input === null || typeof input !== 'object') {
      if (typeof input === 'string') prepareTrustedOutputPayload(budget, input);
      return input;
    }
    if (types.isProxy(input)) authorizationError('unsupported selected proxy');
    if (!entered && active.has(input)) authorizationError('cyclic selected output');
    if (!entered) active.add(input);
    try {
      const hook = selectedDataProperty(input, 'toBSON');
      if (typeof hook === 'function') {
        if (!observeHook) authorizationError('chained selected BSON hooks');
        const normalized: unknown = outsideOutputWorkLedger(() => Reflect.apply(hook, input, []));
        // Self-returning native hooks are legitimate, but never observed twice.
        if (normalized !== input) return prepareWire(normalized, current, level, false, false, documentRoot);
      }

      if (isBsonValue(input)) {
        if (documentRoot) authorizationError('unsupported selected BSON document');
        let prototype: object | null = input;
        for (let hops = 0; prototype && !bsonFamilies.has(prototype) && hops <= 100; hops++) {
          if (types.isProxy(prototype)) authorizationError('unsupported selected proxy');
          if (Object.hasOwn(prototype, '_bsontype') || Object.hasOwn(prototype, Symbol.for('@@mdb.bson.type')))
            authorizationError('overridden selected BSON brand');
          prototype = Object.getPrototypeOf(prototype);
        }
        if (!prototype || !bsonFamilies.has(prototype)) authorizationError('unsupported selected BSON family');
        const family = bsonFamilies.get(prototype)!;
        const output = Object.create(prototype) as Record<string, unknown>;
        // Even an inherited data hook must not run again during the one wire copy.
        Object.defineProperty(output, 'toBSON', { value: undefined });
        const field = (key: string, type: 'string' | 'number' | 'boolean') => {
          const value = selectedDataProperty(input, key, true);
          if (typeof value !== type) authorizationError('unsupported selected BSON state');
          if (typeof value === 'string') prepareTrustedOutputPayload(budget, value);
          defineWireValue(output, key, value);
          return value;
        };
        const bytes = (key: string, length?: number) => {
          const value = selectedBsonBytes(selectedDataProperty(input, key, true), budget);
          if (length !== undefined && value.length !== length) authorizationError('invalid selected BSON bytes');
          defineWireValue(output, key, value);
        };
        const method = (key: string) => {
          if (selectedDataProperty(input, key) !== selectedDataProperty(prototype!, key))
            authorizationError('unsupported selected BSON serializer override');
        };
        const document = (key: string) => {
          const raw = selectedDataProperty(input, key, true);
          const value = prepareWire(raw, prepareOutputWorkString([current, key]), level + 1, true, false, true);
          // Code scopes / DBRef fields are documents, not another native as a
          // document root. Nested BSON values inside these documents remain supported.
          if (!value || typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== null))
            authorizationError('unsupported selected BSON document');
          defineWireValue(output, key, value);
        };
        switch (family) {
          case 'Code': {
            field('code', 'string');
            const scope = selectedDataProperty(input, 'scope', true);
            if (scope != null) document('scope');
            else defineWireValue(output, 'scope', scope); // Never inherit a hook-installed scope.
            break;
          }
          case 'DBRef': {
            field('collection', 'string');
            const db = selectedDataProperty(input, 'db', true);
            if (db != null) field('db', 'string');
            defineWireValue(
              output,
              'oid',
              prepareWire(
                selectedDataProperty(input, 'oid', true),
                prepareOutputWorkString([current, 'oid']),
                level + 1,
              ),
            );
            document('fields');
            // BSON's DBRef serializer does Object.assign into an ordinary object.
            // Reproduce its ordered wire document with safe own definitions instead.
            const ordered = Object.create(null) as Record<string, unknown>;
            defineWireValue(ordered, '$ref', output.collection);
            defineWireValue(ordered, '$id', output.oid);
            if (db != null) defineWireValue(ordered, '$db', output.db);
            for (const key of Object.keys(output.fields as object))
              defineWireValue(ordered, key, (output.fields as Record<string, unknown>)[key]);
            return ordered;
          }
          case 'ObjectId':
            method('serializeInto');
            if (Object.hasOwn(input, 'buffer'))
              bytes('buffer', 12); // BSON 6 (Mongoose 8).
            else for (const key of ['i0', 'i1', 'i2', 'i3']) field(key, 'number'); // BSON 7.
            break;
          case 'Timestamp':
          case 'Long':
            method('getLowBits');
            method('getHighBits');
            field('low', 'number');
            field('high', 'number');
            field('unsigned', 'boolean');
            break;
          case 'Decimal128':
            bytes('bytes', 16);
            break;
          case 'Binary': {
            bytes('buffer');
            const position = field('position', 'number') as number;
            const subtype = field('sub_type', 'number') as number;
            if (
              !Number.isInteger(position) ||
              position < 0 ||
              position > (output.buffer as Buffer).length ||
              !Number.isInteger(subtype) ||
              subtype < 0 ||
              subtype > 255
            )
              authorizationError('invalid selected BSON binary');
            break;
          }
          case 'Int32':
            method('valueOf');
            field('value', 'number');
            break;
          case 'Double':
            field('value', 'number');
            break;
          case 'BSONSymbol':
            field('value', 'string');
            break;
          case 'BSONRegExp':
            field('pattern', 'string');
            field('options', 'string');
            break;
          // MinKey / MaxKey have no contained state.
        }
        return output;
      }

      // Do not let the serializer infer a native family from an application tag.
      if (selectedDataProperty(input, '_bsontype') != null) authorizationError('unsupported selected BSON tag');
      const noHook = <T extends object>(value: T): T => {
        Object.defineProperty(value, 'toBSON', { value: undefined });
        return value;
      };
      if (types.isDate(input)) {
        const getTime = selectedDataProperty(input, 'getTime');
        if (typeof getTime !== 'function') authorizationError('unsupported selected BSON date');
        const time: unknown = outsideOutputWorkLedger(() => Reflect.apply(getTime, input, []));
        if (typeof time !== 'number') authorizationError('unsupported selected BSON date');
        prepareTrustedOutputPayload(budget, 8);
        return noHook(new Date(time));
      }
      if (types.isUint8Array(input)) return noHook(selectedBsonBytes(input, budget));
      if (types.isRegExp(input)) {
        const source = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source')!.get!.call(input) as string;
        prepareTrustedOutputPayload(budget, source);
        const flags = prepareRegExpFlags(input, budget);
        prepareTrustedOutputPayload(budget, flags);
        return noHook(new RegExp(source, flags));
      }
      const output = Object.create(null) as Record<string, unknown>;
      if (types.isMap(input)) {
        for (const [key, entry] of Map.prototype.entries.call(input)) {
          visitTrustedOutput(budget, level + 1);
          if (typeof key !== 'string') authorizationError('selected Map requires string keys');
          if (protectedValueKeys.has(key)) {
            if (policy.rejectProtectedKeys) authorizationError('protected native snapshot key');
            continue;
          }
          const child = prepareOutputWorkString([current, key]);
          if (!policy.keep(key, child)) continue;
          prepareTrustedOutputPayload(budget, key);
          defineWireValue(output, key, prepareWire(entry, child, level + 1));
        }
        return output;
      }
      const array = Array.isArray(input);
      const prototype = Object.getPrototypeOf(input);
      if (!array && prototype !== Object.prototype && prototype !== null)
        authorizationError('unsupported selected object');
      const container: Record<string, unknown> | unknown[] = array ? noHook([]) : output;
      if (array) {
        const length = Object.getOwnPropertyDescriptor(input, 'length')!.value as number;
        if (length) visitTrustedOutput(budget, level + 1, length);
        (container as unknown[]).length = length;
        // Own undefined slots prevent serializer reads of inherited numeric accessors.
        for (let index = 0; index < length; index++) defineWireValue(container, String(index), undefined);
      }
      for (const key of Reflect.ownKeys(input)) {
        if (array && key === 'length') continue;
        // Filtering is selected work even if the key is denied/protected. This
        // slot also admits an accepted child's root; do not charge it twice.
        visitTrustedOutput(budget, level + 1);
        if (typeof key !== 'string') authorizationError('symbol selected output key');
        if (protectedValueKeys.has(key)) {
          if (policy.rejectProtectedKeys) authorizationError('protected native snapshot key');
          continue;
        }
        if (key === 'toBSON' && (array || typeof hook === 'function')) continue;
        if (array && !/^(0|[1-9]\d*)$/.test(key)) authorizationError('invalid selected array property');
        const child = array ? current : prepareOutputWorkString([current, key]);
        if (!array && !policy.keep(key, child)) continue;
        prepareTrustedOutputPayload(budget, key);
        const slot = Object.getOwnPropertyDescriptor(input, key)!;
        if (!('value' in slot) || !slot.enumerable) authorizationError('accessor/non-enumerable selected value');
        defineWireValue(container, key, prepareWire(slot.value, child, level + 1, true, false, false, 0));
      }
      return container;
    } finally {
      if (!entered) active.delete(input);
    }
  };

  const prepared = prepareWire(value, path, depth, true, true);
  assertTrustedOutputBudget(budget);
  for (const key of wireKeys) {
    const slot = Object.getOwnPropertyDescriptor(Object.prototype, key);
    if (slot && !('value' in slot)) authorizationError('inherited accessor selected BSON output');
  }
  const wrapper = Object.create(null) as Record<string, unknown>;
  defineTrustedOutputValue(wrapper, 'value', prepared);
  // The prepared input above is router work. Opaque BSON wire temporaries and
  // returned storage are dependency-owned; no claim of an exact memory cap.
  const result = outsideOutputWorkLedger(
    () => mongo.BSON.deserialize(mongo.BSON.serialize(wrapper), { promoteValues: false, bsonRegExp: true }).value,
  );
  assertTrustedOutputBudget(budget);
  return result;
}

/** Safe selected materialization, exactly once. Supported native/subclass fallback is value-local. */
export function materializeTrustedOutputValue(
  value: unknown,
  path: string,
  budget: TrustedOutputBudget,
  policy: TrustedValuePolicy,
  depth = 0,
  prepaid = false,
): unknown {
  const ledger = budgets.get(budget)?.ledger;
  if (ledger && currentOutputWorkLedger() !== ledger)
    return withOutputWorkLedger(ledger, () =>
      materializeTrustedOutputValue(value, path, budget, policy, depth, prepaid),
    );
  // Primitive leaves need the same receiving-budget/depth/poison checks, but
  // cannot contain a graph, native method or cycle. Do not allocate a traversal
  // closure and ancestor WeakSet for every scalar selected field.
  if (value === null || (typeof value !== 'object' && typeof value !== 'function' && typeof value !== 'symbol')) {
    try {
      visitTrustedOutput(budget, depth, prepaid ? 0 : 1);
      if (typeof value === 'string') prepareTrustedOutputPayload(budget, value);
      assertTrustedOutputBudget(budget);
      return value;
    } catch (error) {
      failTrustedOutputBudget(budget, error);
    }
  }
  const active = new WeakSet<object>();
  const visit = (input: unknown, current: string, level: number, slots = 1): unknown => {
    visitTrustedOutput(budget, level, slots);
    if (typeof input === 'function' || typeof input === 'symbol') authorizationError('unsupported selected value');
    if (input === null || typeof input !== 'object') {
      if (typeof input === 'string') prepareTrustedOutputPayload(budget, input);
      return input;
    }
    if (types.isProxy(input)) authorizationError('unsupported selected proxy');
    if (active.has(input)) authorizationError('cyclic selected output');
    active.add(input);
    try {
      // Selected natives still normalize. Fetch-only natives are never visited here.
      if (types.isDate(input)) {
        const method = selectedDataProperty(input, 'getTime');
        if (typeof method !== 'function') authorizationError('unsupported selected date');
        const time: unknown = outsideOutputWorkLedger(() => Reflect.apply(method, input, []));
        if (typeof time !== 'number') authorizationError('unsupported selected date');
        prepareTrustedOutputPayload(budget, 8);
        return new Date(time);
      }
      if (Buffer.isBuffer(input)) return selectedBsonBytes(input, budget);
      if (types.isRegExp(input)) {
        const source = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source')!.get!.call(input) as string;
        prepareTrustedOutputPayload(budget, source);
        const flags = prepareRegExpFlags(input, budget);
        prepareTrustedOutputPayload(budget, flags);
        const output = new RegExp(source, flags);
        const lastIndex = selectedDataProperty(input, 'lastIndex', true);
        if (typeof lastIndex !== 'number') authorizationError('unsupported selected regexp');
        output.lastIndex = lastIndex;
        return output;
      }
      if (isBsonValue(input)) {
        try {
          return copyTrustedBsonValue(input, current, budget, policy, level, active);
        } catch (error) {
          if (error instanceof ServiceAuthorizationError) throw error;
          authorizationError('unsupported selected BSON value');
        }
      }
      if (types.isMap(input)) {
        const output: Record<string, unknown> = {};
        // Use the real Map brand's iterator, not a user replacement iterator.
        for (const [key, entry] of Map.prototype.entries.call(input)) {
          visitTrustedOutput(budget, level + 1);
          if (typeof key !== 'string') authorizationError('selected Map requires string keys');
          if (protectedValueKeys.has(key)) {
            if (policy.rejectProtectedKeys) authorizationError('protected native snapshot key');
            continue;
          }
          const child = prepareOutputWorkString([current, key]);
          if (!policy.keep(key, child)) continue;
          prepareTrustedOutputPayload(budget, key);
          defineTrustedOutputValue(output, key, visit(entry, child, level + 1));
        }
        return output;
      }
      const array = Array.isArray(input);
      const prototype = Object.getPrototypeOf(input);
      if (!array && prototype !== Object.prototype && prototype !== null)
        authorizationError('unsupported selected object');
      const output: Record<string, unknown> | unknown[] = array ? [] : {};
      if (array) {
        const length = Object.getOwnPropertyDescriptor(input, 'length')!.value as number;
        if (length) visitTrustedOutput(budget, level + 1, length);
        (output as unknown[]).length = length;
      }
      for (const key of Reflect.ownKeys(input)) {
        if (array && key === 'length') continue;
        // Admission precedes policy callbacks and descriptor/value reads, even
        // for denied/protected keys. An accepted child uses the prepaid slot.
        visitTrustedOutput(budget, level + 1);
        if (typeof key !== 'string') authorizationError('symbol selected output key');
        if (protectedValueKeys.has(key)) {
          if (policy.rejectProtectedKeys) authorizationError('protected native snapshot key');
          continue;
        }
        if (array && !/^(0|[1-9]\d*)$/.test(key)) authorizationError('invalid selected array property');
        const child = array ? current : prepareOutputWorkString([current, key]);
        if (!array && !policy.keep(key, child)) continue;
        prepareTrustedOutputPayload(budget, key);
        const slot = Object.getOwnPropertyDescriptor(input, key)!;
        if (isGeneratedPermissionsAliasSlot(input, key, slot)) continue;
        if (!('value' in slot) || !slot.enumerable) authorizationError('accessor/non-enumerable selected value');
        defineTrustedOutputValue(output, key, visit(slot.value, child, level + 1, 0));
      }
      return copyPermissionsAlias(input, output);
    } catch (error) {
      // Never expose an arbitrary native exception or partially materialized value.
      failTrustedOutputBudget(budget, error);
    } finally {
      active.delete(input);
    }
  };
  try {
    const result = visit(value, path, depth, prepaid ? 0 : 1);
    assertTrustedOutputBudget(budget);
    return result;
  } catch (error) {
    failTrustedOutputBudget(budget, error);
  }
}
