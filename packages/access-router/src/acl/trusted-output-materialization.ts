/** Selected-value work only. No source/grant eligibility or descendant-identity walk. */
import { types } from 'node:util';
import { Document, mongo } from 'mongoose';
import { authorizationError, ServiceAuthorizationError } from './authorization-snapshot';
import { deepIsolateValue, isolateDocForOutput } from '../helpers/document';
import { isGeneratedPermissionsAliasSlot } from '../output/permissions-alias';

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

export type QueryAuthorizationSource =
  | { readonly kind: 'trusted'; readonly source: Record<string, unknown> }
  | { readonly kind: 'copied'; readonly source: Record<string, unknown> };

/** One hydrated conversion. A failed/unproven conversion is copied BEFORE any document hook. */
export function prepareTrustedAuthorizationSource(input: unknown): QueryAuthorizationSource {
  if (input && typeof input === 'object' && !types.isProxy(input) && input instanceof Document) {
    let raw: unknown;
    try {
      raw = input.toObject({ virtuals: false, flattenMaps: true });
    } catch {
      raw = (input as Document & { _doc: Record<string, unknown> })._doc;
      return { kind: 'copied', source: deepIsolateValue(raw, new WeakMap(), true) as Record<string, unknown> };
    }
    return isBorrowableAuthorizationRecord(raw)
      ? { kind: 'trusted', source: raw }
      : { kind: 'copied', source: deepIsolateValue(raw, new WeakMap(), true) as Record<string, unknown> };
  }
  return isBorrowableAuthorizationRecord(input)
    ? { kind: 'trusted', source: input }
    : { kind: 'copied', source: isolateDocForOutput(input) };
}

declare const budgetBrand: unique symbol;
export interface TrustedOutputBudget {
  readonly [budgetBrand]: true;
}
interface BudgetRecord {
  slots: number;
  failed: boolean;
}
const budgets = new WeakMap<TrustedOutputBudget, BudgetRecord>();

export function createTrustedOutputBudget(): TrustedOutputBudget {
  const budget = Object.freeze(Object.create(null)) as TrustedOutputBudget;
  budgets.set(budget, { slots: 0, failed: false });
  return budget;
}

/** Shared by shells, selected values, embedded builders, attachment spines and issued-root registries. */
export function visitTrustedOutput(budget: TrustedOutputBudget, depth: number, slots = 1): void {
  const record = budgets.get(budget);
  if (!record) authorizationError('invalid selected output budget');
  if (record.failed || depth > 100 || (record.slots += slots) > 20000) {
    record.failed = true;
    authorizationError('selected output exceeds structural limits');
  }
}

export function defineTrustedOutputValue(output: object, key: string, value: unknown): void {
  Object.defineProperty(output, key, { value, enumerable: true, configurable: true, writable: true });
}

/** Selected array structure only: safe data slots, bounded holes, no iterator/accessor observations. */
export function shallowTrustedOutputArray(
  input: readonly unknown[],
  budget: TrustedOutputBudget,
  depth: number,
): unknown[] {
  if (types.isProxy(input)) authorizationError('unsupported selected proxy');
  const length = Object.getOwnPropertyDescriptor(input, 'length')!.value as number;
  visitTrustedOutput(budget, depth, length + 1);
  for (const key of Reflect.ownKeys(input)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) authorizationError('invalid selected array property');
    const slot = Object.getOwnPropertyDescriptor(input, key)!;
    if (!('value' in slot) || !slot.enumerable) authorizationError('accessor/non-enumerable selected value');
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
}

/** Copy-on-write dotted spines. Raw/source and finalized target lanes never become each other's hook input. */
export function setTrustedOutputPath(
  output: Record<string, unknown>,
  path: string,
  value: unknown,
  budget: TrustedOutputBudget,
  depth = 0,
  onSpine?: (source: object, copy: object) => void,
): void {
  const parts = path.split('.');
  if (parts.some((key) => !key || unsafeKeys.has(key))) authorizationError('unsafe selected output path');
  let current = output;
  const spines: Array<{ source: object; copy: object }> = [];
  for (const [index, key] of parts.slice(0, -1).entries()) {
    visitTrustedOutput(budget, depth + index + 1);
    const slot = Object.getOwnPropertyDescriptor(current, key);
    const source = slot && 'value' in slot ? slot.value : undefined;
    const shell = isBorrowableAuthorizationRecord(source)
      ? shallowTrustedOutput(source, budget, depth + index + 1)
      : {};
    if (source && typeof source === 'object') spines.push({ source, copy: shell });
    defineTrustedOutputValue(current, key, shell);
    current = shell;
  }
  visitTrustedOutput(budget, depth + parts.length);
  defineTrustedOutputValue(current, parts[parts.length - 1], value);
  // Child-first publication of package-created spines, AFTER the complete metadata/attachment write.
  for (const spine of spines.reverse()) onSpine?.(spine.source, spine.copy);
}

/** Remove a private fetch-only path without changing a borrowed descendant. */
export function unsetTrustedOutputPath(
  output: Record<string, unknown>,
  path: string,
  budget: TrustedOutputBudget,
  onSpine?: (source: object, copy: object) => void,
): void {
  const parts = path.split('.');
  if (parts.some((key) => !key || unsafeKeys.has(key))) authorizationError('unsafe selected output path');
  let current = output;
  const spines: Array<{ source: object; copy: object }> = [];
  for (const [index, key] of parts.slice(0, -1).entries()) {
    const slot = Object.getOwnPropertyDescriptor(current, key);
    if (!slot || !('value' in slot) || !isBorrowableAuthorizationRecord(slot.value)) return;
    const shell = shallowTrustedOutput(slot.value, budget, index + 1);
    spines.push({ source: slot.value, copy: shell });
    defineTrustedOutputValue(current, key, shell);
    current = shell;
  }
  delete current[parts[parts.length - 1]];
  for (const spine of spines.reverse()) onSpine?.(spine.source, spine.copy);
}

/** Brand-family lookup is bounded and does not trust _bsontype/constructor-name tags. */
function isBsonValue(input: object): boolean {
  let prototype = Object.getPrototypeOf(input);
  for (let depth = 0; prototype && depth <= 100; depth++) {
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
function selectedBsonBytes(input: unknown): Buffer {
  if (!input || typeof input !== 'object' || types.isProxy(input) || !types.isUint8Array(input))
    authorizationError('unsupported selected BSON bytes');
  const prototype = Object.getPrototypeOf(Uint8Array.prototype);
  const buffer = Object.getOwnPropertyDescriptor(prototype, 'buffer')!.get!.call(input) as ArrayBuffer;
  const offset = Object.getOwnPropertyDescriptor(prototype, 'byteOffset')!.get!.call(input) as number;
  const length = Object.getOwnPropertyDescriptor(prototype, 'byteLength')!.get!.call(input) as number;
  // Never invoke a subclass's iterator, length accessor, valueOf or species constructor.
  return Buffer.from(new Uint8Array(buffer, offset, length));
}

export interface TrustedValuePolicy {
  /** Called after key-budget admission, before a data descriptor read; excluded values remain unobserved. */
  keep(key: string, path: string): boolean;
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
    if (input === null || typeof input !== 'object') return input;
    if (types.isProxy(input)) authorizationError('unsupported selected proxy');
    if (!entered && active.has(input)) authorizationError('cyclic selected output');
    if (!entered) active.add(input);
    try {
      const hook = selectedDataProperty(input, 'toBSON');
      if (typeof hook === 'function') {
        if (!observeHook) authorizationError('chained selected BSON hooks');
        const normalized: unknown = Reflect.apply(hook, input, []);
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
          defineWireValue(output, key, value);
          return value;
        };
        const bytes = (key: string, length?: number) => {
          const value = selectedBsonBytes(selectedDataProperty(input, key, true));
          if (length !== undefined && value.length !== length) authorizationError('invalid selected BSON bytes');
          defineWireValue(output, key, value);
        };
        const method = (key: string) => {
          if (selectedDataProperty(input, key) !== selectedDataProperty(prototype!, key))
            authorizationError('unsupported selected BSON serializer override');
        };
        const document = (key: string) => {
          const raw = selectedDataProperty(input, key, true);
          const value = prepareWire(raw, `${current}.${key}`, level + 1, true, false, true);
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
              prepareWire(selectedDataProperty(input, 'oid', true), `${current}.oid`, level + 1),
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
        const time: unknown = Reflect.apply(getTime, input, []);
        if (typeof time !== 'number') authorizationError('unsupported selected BSON date');
        return noHook(new Date(time));
      }
      if (types.isUint8Array(input)) return noHook(selectedBsonBytes(input));
      if (types.isRegExp(input)) {
        const source = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source')!.get!.call(input) as string;
        const flags = ['hasIndices', 'global', 'ignoreCase', 'multiline', 'dotAll', 'unicode', 'unicodeSets', 'sticky']
          .map((name, index) =>
            Object.getOwnPropertyDescriptor(RegExp.prototype, name)?.get?.call(input) ? 'dgimsuvy'[index] : '',
          )
          .join('');
        return noHook(new RegExp(source, flags));
      }
      const output = Object.create(null) as Record<string, unknown>;
      if (types.isMap(input)) {
        for (const [key, entry] of Map.prototype.entries.call(input)) {
          visitTrustedOutput(budget, level + 1);
          if (typeof key !== 'string') authorizationError('selected Map requires string keys');
          if (protectedValueKeys.has(key) || !policy.keep(key, `${current}.${key}`)) continue;
          defineWireValue(output, key, prepareWire(entry, `${current}.${key}`, level + 1));
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
        visitTrustedOutput(budget, level + 1, length);
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
        if (protectedValueKeys.has(key) || (key === 'toBSON' && (array || typeof hook === 'function'))) continue;
        if (array && !/^(0|[1-9]\d*)$/.test(key)) authorizationError('invalid selected array property');
        const child = array ? current : `${current}.${key}`;
        if (!array && !policy.keep(key, child)) continue;
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
  for (const key of wireKeys) {
    const slot = Object.getOwnPropertyDescriptor(Object.prototype, key);
    if (slot && !('value' in slot)) authorizationError('inherited accessor selected BSON output');
  }
  const wrapper = Object.create(null) as Record<string, unknown>;
  defineTrustedOutputValue(wrapper, 'value', prepared);
  return mongo.BSON.deserialize(mongo.BSON.serialize(wrapper), { promoteValues: false, bsonRegExp: true }).value;
}

/** Safe selected materialization, exactly once. Supported native/subclass fallback is value-local. */
export function materializeTrustedOutputValue(
  value: unknown,
  path: string,
  budget: TrustedOutputBudget,
  policy: TrustedValuePolicy,
  depth = 0,
): unknown {
  const active = new WeakSet<object>();
  const visit = (input: unknown, current: string, level: number, slots = 1): unknown => {
    visitTrustedOutput(budget, level, slots);
    if (typeof input === 'function' || typeof input === 'symbol') authorizationError('unsupported selected value');
    if (input === null || typeof input !== 'object') return input;
    if (types.isProxy(input)) authorizationError('unsupported selected proxy');
    if (active.has(input)) authorizationError('cyclic selected output');
    active.add(input);
    try {
      // Selected natives still normalize. Fetch-only natives are never visited here.
      if (types.isDate(input)) return new Date(input.getTime());
      if (Buffer.isBuffer(input)) return Buffer.from(input);
      if (types.isRegExp(input)) {
        const output = new RegExp(input.source, input.flags);
        output.lastIndex = input.lastIndex;
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
          if (protectedValueKeys.has(key) || !policy.keep(key, `${current}.${key}`)) continue;
          defineTrustedOutputValue(output, key, visit(entry, `${current}.${key}`, level + 1));
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
        visitTrustedOutput(budget, level + 1, length);
        (output as unknown[]).length = length;
      }
      for (const key of Reflect.ownKeys(input)) {
        if (array && key === 'length') continue;
        // Admission precedes policy callbacks and descriptor/value reads, even
        // for denied/protected keys. An accepted child uses the prepaid slot.
        visitTrustedOutput(budget, level + 1);
        if (typeof key !== 'string') authorizationError('symbol selected output key');
        if (protectedValueKeys.has(key)) continue;
        if (array && !/^(0|[1-9]\d*)$/.test(key)) authorizationError('invalid selected array property');
        const child = array ? current : `${current}.${key}`;
        if (!array && !policy.keep(key, child)) continue;
        const slot = Object.getOwnPropertyDescriptor(input, key)!;
        if (isGeneratedPermissionsAliasSlot(input, key, slot)) continue;
        if (!('value' in slot) || !slot.enumerable) authorizationError('accessor/non-enumerable selected value');
        defineTrustedOutputValue(output, key, visit(slot.value, child, level + 1, 0));
      }
      return output;
    } catch (error) {
      // Never expose an arbitrary native exception or partially materialized value.
      if (error instanceof ServiceAuthorizationError) throw error;
      authorizationError('unsupported selected value');
    } finally {
      active.delete(input);
    }
  };
  return visit(value, path, depth);
}
