/** Strict descriptor-only collection/control admission, before native/source effects. */
import { types } from 'node:util';
import { authorizationError, copyAuthorizationValue } from './authorization-snapshot';
import { assertFieldHelperCall } from './field-helper-options';
import { isSafeOutputPath } from './field-catalog';
import { debitOutputWork } from './output-work-ledger';

const intrinsicObjectKeys = new Set([
  'constructor',
  '__defineGetter__',
  '__defineSetter__',
  'hasOwnProperty',
  '__lookupGetter__',
  '__lookupSetter__',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
  '__proto__',
  'toLocaleString',
]);

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || types.isProxy(value)) authorizationError(`invalid ${label}`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) authorizationError(`invalid ${label} prototype`);
  for (const key of keys)
    if (key in value && !Object.hasOwn(value, key)) authorizationError(`inherited ${label} property`);
  if (prototype)
    for (const key of Reflect.ownKeys(prototype)) {
      debitOutputWork();
      if (typeof key !== 'string' || !intrinsicObjectKeys.has(key)) authorizationError(`inherited ${label} control`);
    }
  for (const key of Reflect.ownKeys(value)) {
    debitOutputWork();
    const slot = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !keys.includes(key) || !slot.enumerable || !('value' in slot))
      authorizationError(`unsupported ${label} property`);
  }
  // Reject inherited control presence too, without evaluating a value/getter.
  for (const key of [
    'purpose',
    'select',
    'selection',
    'query',
    'populate',
    'rows',
    'inputFields',
    'related',
    'mode',
    'skipChecks',
    'subPaths',
    'baseFields',
    'documentAuthorization',
    'documentAuthorizationStage',
    'execution',
    'resolvedAuthorization',
    'preparedQuery',
    'handle',
    'token',
  ])
    if (!keys.includes(key) && key in value) authorizationError(`unsupported ${label} control: ${key}`);
  return value as Record<string, unknown>;
}

/** Also used for grant/scope arrays: no iterator or getter is ever consulted. */
function denseArray(value: unknown, maximum: number, label: string): unknown[] {
  if (!value || typeof value !== 'object' || types.isProxy(value)) authorizationError(`invalid ${label}`);
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    authorizationError(`${label} must be an ordinary dense Array`);
  const length = Object.getOwnPropertyDescriptor(value, 'length')!.value as number;
  if (length > maximum) authorizationError(`${label} exceeds position limit`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) authorizationError(`${label} must contain only dense positions`);
  debitOutputWork(undefined, length);
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(index));
    if (!slot || !('value' in slot) || !slot.enumerable) authorizationError(`invalid ${label} position`);
    Object.defineProperty(result, index, { value: slot.value, enumerable: true, configurable: true, writable: true });
  }
  return result;
}

export function admitOutputHelperManyControls(count: number, maximum: number, access: unknown, options: unknown) {
  assertFieldHelperCall('pickAllowedFieldsMany', count, maximum, options);
  if (typeof access !== 'string') authorizationError('invalid output-helper access');
  const value = exactRecord(options, ['authorization', 'scopePath'], 'output options');
  if (value.scopePath !== undefined) {
    const scope = denseArray(value.scopePath, 100, 'scopePath');
    for (const part of scope)
      if (typeof part !== 'string' || part.includes('.') || !isSafeOutputPath(part))
        authorizationError('scopePath requires ordinary response segments');
  }
  if (value.authorization !== undefined) {
    const policy = exactRecord(value.authorization, ['outputFields'], 'authorization');
    if (policy.outputFields !== undefined) {
      const fields = exactRecord(policy.outputFields, ['mode', 'paths'], 'outputFields');
      if (fields.mode !== 'request' && fields.mode !== 'unrestricted' && fields.mode !== 'grant')
        authorizationError('unknown outputFields mode');
      if (fields.mode === 'grant') {
        const paths = denseArray(fields.paths, 20000, 'grant.paths');
        for (const path of paths)
          if (typeof path !== 'string' || !isSafeOutputPath(path)) authorizationError('invalid output grant path');
      } else if ('paths' in fields) authorizationError('paths require outputFields grant mode');
    }
  }
  return copyAuthorizationValue(value);
}

export function admitOutputHelperRows(rows: unknown): unknown[] {
  return denseArray(rows, 1000, 'rows');
}
