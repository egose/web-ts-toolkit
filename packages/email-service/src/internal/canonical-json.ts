import { createHash } from 'node:crypto';
import { MESSAGE_LIMITS } from '../constants';
import type { JsonObject, JsonValue } from '../contracts/message';
import type { EmailErrorCode } from '../errors';
import { denseArrayLength, invalid, isArray, jsonKey, ownData, plainKeys, utf8Length } from './validation';

type TreeLimits = { readonly depth: number; readonly values: number };
const treeLimits: TreeLimits = { depth: MESSAGE_LIMITS.jsonDepth, values: MESSAGE_LIMITS.jsonValues };

/** Detached, frozen plain JSON and its exact compact UTF-8 representation. Never stringifies user objects. */
export function canonicalJson(
  input: unknown,
  maxBytes: number,
  code: EmailErrorCode = 'invalid_snapshot',
  limits: TreeLimits = treeLimits,
): { value: JsonValue; encoded: string } {
  let bytesLeft = maxBytes;
  let valuesLeft = limits.values;
  const chunks: string[] = [];
  const ancestors = new Set<object>();

  function append(text: string, bytes = text.length): void {
    if (bytes > bytesLeft) invalid(code);
    bytesLeft -= bytes;
    chunks.push(text);
  }

  function appendString(text: string): void {
    let bytes = 2 + utf8Length(text, bytesLeft - 2, code);
    // Count the JSON escape overhead before allocating the encoded scalar.
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 0x22 || ch === 0x5c || ch === 8 || ch === 9 || ch === 10 || ch === 12 || ch === 13) bytes++;
      else if (ch < 0x20) bytes += 5;
      if (bytes > bytesLeft) invalid(code);
    }
    append(JSON.stringify(text), bytes);
  }

  function visit(value: unknown, depth: number): JsonValue {
    if (depth > limits.depth || --valuesLeft < 0 || bytesLeft < 1) invalid(code);
    switch (typeof value) {
      case 'string':
        appendString(value);
        return value;
      case 'number':
        if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) invalid(code);
        append(JSON.stringify(value));
        return value === 0 ? 0 : value;
      case 'boolean':
        append(value ? 'true' : 'false');
        return value;
      case 'object':
        if (value === null) {
          append('null');
          return null;
        }
        break;
      default:
        invalid(code);
    }

    if (ancestors.has(value)) invalid(code);
    ancestors.add(value);
    try {
      // Check for proxies before even calling Array.isArray (which throws on a revoked proxy).
      const maxChildren = depth === limits.depth ? 0 : valuesLeft;
      if (isArray(value, code)) {
        const length = denseArrayLength(value, maxChildren, code);
        if (length && 2 * length + 1 > bytesLeft) invalid(code);
        const copy: JsonValue[] = [];
        append('[');
        for (let i = 0; i < length; i++) {
          if (i) append(',');
          copy.push(visit(ownData(value, String(i), code), depth + 1));
        }
        append(']');
        return Object.freeze(copy);
      }

      const keys = plainKeys(value, maxChildren, code);
      if (keys.length && 5 * keys.length + 1 > bytesLeft) invalid(code);
      for (const key of keys) jsonKey(key, code);
      const copy = Object.create(null) as Record<string, JsonValue>;
      append('{');
      for (const [index, key] of keys.sort().entries()) {
        if (index) append(',');
        appendString(key);
        append(':');
        copy[key] = visit(ownData(value, key, code), depth + 1);
      }
      append('}');
      return Object.freeze(copy);
    } finally {
      ancestors.delete(value);
    }
  }

  const value = visit(input, 0);
  return { value, encoded: chunks.join('') };
}

export function copyJsonObject(input: unknown, maxBytes: number, code: EmailErrorCode): JsonObject {
  if (typeof input !== 'object' || input === null || isArray(input, code)) invalid(code);
  return canonicalJson(input, maxBytes, code).value as JsonObject;
}

export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashJson(input: unknown, maxBytes: number, code: EmailErrorCode = 'invalid_snapshot'): string {
  return sha256(canonicalJson(input, maxBytes, code).encoded);
}
