import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { MAX_UNIX_MS, MESSAGE_LIMITS } from '../constants';
import { EmailError, type EmailErrorCode } from '../errors';

export function invalid(code: EmailErrorCode): never {
  throw new EmailError(code);
}

/** Recognize only the boundary's own allowlist, without class identity, getters, or retaining the thrown value. */
export function allowedErrorCode<C extends EmailErrorCode>(error: unknown, allowed: readonly C[]): C | undefined {
  if (typeof error !== 'object' || error === null || types.isProxy(error)) return;
  const code: unknown = Object.getOwnPropertyDescriptor(error, 'code')?.value;
  return allowed.find((candidate) => candidate === code);
}

function dataObject(value: unknown, code: EmailErrorCode): object {
  if (typeof value !== 'object' || value === null || types.isProxy(value)) invalid(code);
  return value;
}

export function isArray(value: object, code: EmailErrorCode): boolean {
  return Array.isArray(dataObject(value, code));
}

/** Check the width before copying, sorting, or visiting children. */
export function plainKeys(value: unknown, maxKeys: number, code: EmailErrorCode): string[] {
  const object = dataObject(value, code);
  const proto: unknown = Object.getPrototypeOf(object);
  if (Array.isArray(object) || (proto !== null && proto !== Object.prototype)) invalid(code);
  // Reflect.ownKeys is needed to see non-enumerable and symbol properties. JS has no bounded own-key iterator.
  const keys = Reflect.ownKeys(object);
  if (keys.length > maxKeys || keys.some((key) => typeof key !== 'string')) invalid(code);
  return keys as string[];
}

export function ownData(value: object, key: string, code: EmailErrorCode): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid(code);
  return descriptor.value;
}

/** Read an exact structural record without invoking user code. Optional own fields remain distinguishable from absent ones. */
export function readRecord<R extends string, O extends string>(
  value: unknown,
  required: readonly R[],
  optional: readonly O[],
  code: EmailErrorCode,
): Record<R, unknown> & Partial<Record<O, unknown>> {
  const keys = plainKeys(value, required.length + optional.length, code);
  const copy = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (!required.includes(key as R) && !optional.includes(key as O)) invalid(code);
    copy[key] = ownData(value as object, key, code);
  }
  for (const key of required) {
    if (!Object.hasOwn(copy, key)) invalid(code);
  }
  return copy as Record<R, unknown> & Partial<Record<O, unknown>>;
}

/** Arrays have no custom prototype, holes, accessors, or extra own properties. */
export function denseArrayLength(value: unknown, maxLength: number, code: EmailErrorCode): number {
  const object = dataObject(value, code);
  if (!Array.isArray(object) || Object.getPrototypeOf(object) !== Array.prototype) invalid(code);
  const { length } = object;
  if (length > maxLength || Reflect.ownKeys(object).length !== length + 1) invalid(code);
  // Callers read every position using ownData (also catches holes masked by extra properties).
  return length;
}

export function readArray<T>(
  value: unknown,
  maxLength: number,
  code: EmailErrorCode,
  read: (item: unknown) => T,
): readonly T[] {
  const length = denseArrayLength(value, maxLength, code);
  const copy: T[] = [];
  for (let i = 0; i < length; i++) copy.push(read(ownData(value as object, String(i), code)));
  return Object.freeze(copy);
}

export function integer(value: unknown, min: number, max: number, code: EmailErrorCode): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid(code);
  return value === 0 ? 0 : value;
}

export type IntegerBounds = { readonly default: number; readonly min: number; readonly max: number };

export function boundedOption(value: unknown, bounds: IntegerBounds, code: EmailErrorCode = 'invalid_config'): number {
  return value === undefined ? bounds.default : integer(value, bounds.min, bounds.max, code);
}

export function unixMs(value: unknown, code: EmailErrorCode): number {
  return integer(value, 0, MAX_UNIX_MS, code);
}

export function utf8Length(value: string, maxBytes: number, code: EmailErrorCode): number {
  // A string has at least as many UTF-8 bytes as UTF-16 code units. Short-circuit huge inputs.
  // With /u, surrogate pairs match their astral code point, not the surrogate range.
  if (value.length > maxBytes || /[\uD800-\uDFFF]/u.test(value)) invalid(code);
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > maxBytes) invalid(code);
  return bytes;
}

export function utf8String(value: unknown, maxBytes: number, code: EmailErrorCode): string {
  if (typeof value !== 'string') invalid(code);
  utf8Length(value, maxBytes, code);
  return value;
}

export function headerString(value: unknown, maxBytes: number, code: EmailErrorCode): string {
  const text = utf8String(value, maxBytes, code);
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch < 0x20 || ch === 0x7f) invalid(code);
  }
  return text;
}

export function opaqueToken(value: unknown, maxBytes: number, code: EmailErrorCode): string {
  if (typeof value !== 'string' || value.length > maxBytes || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    invalid(code);
  }
  return value;
}

export function scopeToken(value: unknown, code: EmailErrorCode = 'invalid_command'): string {
  return opaqueToken(value, MESSAGE_LIMITS.scopeBytes, code);
}

export function identifier(value: unknown, code: EmailErrorCode): string {
  return opaqueToken(value, MESSAGE_LIMITS.identifierBytes, code);
}

export function uuidV4(value: unknown, code: EmailErrorCode): string {
  if (
    typeof value !== 'string' ||
    value.length !== 36 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  ) {
    invalid(code);
  }
  return value;
}

export function hashToken(value: unknown, code: EmailErrorCode): string {
  if (typeof value !== 'string' || value.length !== 64 || !/^[0-9a-f]{64}$/.test(value)) invalid(code);
  return value;
}

export function jsonKey(key: string, code: EmailErrorCode): void {
  utf8Length(key, MESSAGE_LIMITS.jsonKeyBytes, code);
  if (
    key === '__proto__' ||
    key === 'prototype' ||
    key === 'constructor' ||
    key.includes('.') ||
    key.includes('$') ||
    key.includes('\0')
  ) {
    invalid(code);
  }
}
