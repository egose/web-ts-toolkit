/** Package-private, bounded data for numeric grouped counts; never an authority token. */
import { mongo } from 'mongoose';
import { copyAuthorizationValue } from '../acl/authorization-snapshot';
import { Codes } from '../enums';
import type { ErrorResult } from '../interfaces';

const MAX_GROUPS = 1000;
const MAX_KEYS = 10000;
const MAX_KEY_BYTES = 64 * 1024;
const MAX_TOTAL_KEY_BYTES = 1024 * 1024;
const MAX_NODES = 20000;
const MAX_DEPTH = 8;
const MAX_FIELD_BYTES = 1024;

export class GroupedCountInputError extends Error {
  readonly result: ErrorResult;

  constructor(detail: string) {
    super(detail);
    this.result = { success: false, kind: 'error', code: Codes.BadRequest, errors: [{ detail }] };
  }
}

function invalid(detail: string): never {
  throw new GroupedCountInputError(`Grouped count: ${detail}`);
}

export function assertCountForeignFieldSize(field: string): void {
  if (Buffer.byteLength(field) > MAX_FIELD_BYTES) invalid(`foreignField exceeds ${MAX_FIELD_BYTES} bytes`);
}

export interface GroupedCountInput {
  readonly values: readonly unknown[];
  readonly aliases: readonly string[];
  readonly groups: readonly (readonly number[])[];
}

/** Check width/bytes before cloning or BSON serialization, including native mutable leaves. */
class KeyBudget {
  private nodes = 0;
  private keys = 0;
  private bytes = 0;

  visitNode(): void {
    if (++this.nodes > MAX_NODES) invalid(`key structure exceeds ${MAX_NODES} nodes`);
  }

  key(value: unknown): { alias: string; value: unknown } {
    if (++this.keys > MAX_KEYS) invalid(`key occurrences exceed ${MAX_KEYS}`);
    let payloadBytes = 0;
    const charge = (bytes: number) => {
      payloadBytes += bytes;
      if (payloadBytes > MAX_KEY_BYTES) invalid(`key exceeds ${MAX_KEY_BYTES} bytes`);
    };
    const visit = (input: unknown, depth: number): void => {
      this.visitNode();
      if (depth > MAX_DEPTH) invalid(`key structure exceeds depth ${MAX_DEPTH}`);
      if (typeof input === 'function' || typeof input === 'symbol') invalid('unsupported equality key');
      if (typeof input === 'string') {
        charge(Buffer.byteLength(input));
      } else if (input === null || typeof input !== 'object' || input instanceof Date) {
        charge(8);
      } else if (Buffer.isBuffer(input)) {
        charge(input.length);
      } else if (input instanceof mongo.BSON.BSONValue) {
        // These BSON values contain executable/regex semantics or nested scopes,
        // rather than an equality key. Other native BSON leaves are measured directly.
        if (
          input instanceof mongo.BSON.Code ||
          input instanceof mongo.BSON.DBRef ||
          input instanceof mongo.BSON.BSONRegExp
        )
          invalid('unsupported equality key');
        charge(mongo.BSON.calculateObjectSize({ value: input }));
      } else {
        const array = Array.isArray(input);
        if (array && input.length > MAX_KEYS) invalid(`key array exceeds ${MAX_KEYS} entries`);
        if (!array && Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
          invalid('unsupported equality key');
        for (const key in input) {
          if (!Object.hasOwn(input, key)) continue;
          const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
          if (!('value' in descriptor) || ['__proto__', 'prototype', 'constructor'].includes(key))
            invalid('unsupported key property');
          charge(Buffer.byteLength(key) + 2);
          visit(descriptor.value, depth + 1);
        }
      }
    };
    visit(value, 0);
    // String aliases deliberately retain the pre-existing first-occurrence rule.
    // Values have been bounded and checked for executable/accessor properties first.
    const snapshot = copyAuthorizationValue(value);
    if (
      snapshot !== null &&
      typeof snapshot === 'object' &&
      (Object.getPrototypeOf(snapshot) === Object.prototype || Object.getPrototypeOf(snapshot) === null) &&
      Object.keys(snapshot)[0]?.startsWith('$') &&
      !(Object.hasOwn(snapshot, '$ref') && Object.hasOwn(snapshot, '$id'))
    ) {
      // Mongo rejects expression documents directly inside query $in. Complete
      // literal DBRef documents are its exception. Do not inspect nested literal
      // objects/arrays here: their dollar-prefixed fields are ordinary data.
      invalid('operator documents are not equality keys');
    }
    const alias = String(snapshot);
    const aliasBytes = Buffer.byteLength(alias);
    const bsonBytes = mongo.BSON.calculateObjectSize({ value: snapshot }, { ignoreUndefined: false });
    if (Math.max(aliasBytes, bsonBytes) > MAX_KEY_BYTES) invalid(`key exceeds ${MAX_KEY_BYTES} bytes`);
    this.bytes += aliasBytes + bsonBytes;
    if (this.bytes > MAX_TOTAL_KEY_BYTES) invalid(`key payload exceeds ${MAX_TOTAL_KEY_BYTES} bytes`);
    return { alias, value: snapshot };
  }
}

function snapshotGroups<T>(
  sources: readonly T[],
  valueOf: (source: T) => unknown,
  multipleKeys: boolean,
): GroupedCountInput {
  if (!Array.isArray(sources)) invalid('values must be an array');
  if (sources.length > MAX_GROUPS) invalid(`groups exceed ${MAX_GROUPS}`);
  const budget = new KeyBudget();
  const values: unknown[] = [];
  const aliases: string[] = [];
  const indices = new Map<string, number>();
  const groups: number[][] = [];
  for (const source of sources) {
    const group = new Set<number>();
    const add = (value: unknown) => {
      const { alias, value: snapshot } = budget.key(value);
      let index = indices.get(alias);
      if (index === undefined) {
        index = values.length;
        indices.set(alias, index);
        aliases.push(alias);
        values.push(snapshot);
      }
      group.add(index);
    };
    const local = valueOf(source);
    if (multipleKeys && Array.isArray(local)) {
      if (local.length > MAX_KEYS) invalid(`key occurrences exceed ${MAX_KEYS}`);
      for (const value of local) {
        if (Array.isArray(value)) {
          budget.visitNode();
          if (value.length > MAX_KEYS) invalid(`key occurrences exceed ${MAX_KEYS}`);
          // Preserve the legacy one-level flatten, without unbounded spread/flatMap.
          for (const entry of value) add(entry);
        } else add(value);
      }
    } else add(local);
    groups.push([...group]);
  }
  return Object.freeze({
    values: Object.freeze(values),
    aliases: Object.freeze(aliases),
    groups: Object.freeze((multipleKeys ? groups : values.map((_, i) => [i])).map((group) => Object.freeze(group))),
  });
}

function inputBoundary(create: () => GroupedCountInput): GroupedCountInput {
  try {
    return create();
  } catch (error) {
    if (error instanceof GroupedCountInputError) throw error;
    // Native BSON/string conversion and unsupported snapshots are input failures,
    // never raw TypeErrors or database errors. This boundary performs no queries.
    invalid('invalid equality key');
  }
}

export function prepareCountValues(values: readonly unknown[]): GroupedCountInput {
  return inputBoundary(() => snapshotGroups(values, (value) => value, false));
}

export function prepareCountGroups<T>(parents: readonly T[], localKeys: (parent: T) => unknown): GroupedCountInput {
  return inputBoundary(() => snapshotGroups(parents, localKeys, true));
}

/** Bound cast expansion by its actual use across groups, not just distinct operands. */
export function castCountGroups(input: GroupedCountInput, values: readonly unknown[]) {
  if (!Array.isArray(values) || values.length !== input.values.length)
    invalid('foreign field query casting must retain the join operands');
  const budget = new KeyBudget();
  return input.groups.map((indices, group) => ({
    group,
    keys: indices.map((index) => budget.key(values[index]).value),
  }));
}
