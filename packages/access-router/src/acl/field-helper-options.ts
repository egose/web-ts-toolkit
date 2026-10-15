/** Finite named helper boundaries. No authority is inferred from legacy arguments. */
import { authorizationError, authorizationRecord, ServiceAuthorizationError } from './authorization-snapshot';
import { isSafeOutputPath } from './field-catalog';

export function assertFieldHelperCall(
  helper: string,
  count: number,
  maximum: number,
  options: unknown,
  family: 'model' | 'data' | 'populate' = 'model',
): void {
  const replacement =
    family === 'model'
      ? 'Use named output options (authorization.outputFields or documentAuthorization), and scopePath for scope.'
      : family === 'data'
        ? 'Use named DataFieldOptions ({ scopePath }); data helpers are request-only and legacy elevation is unsupported.'
        : 'Use named PopulatePlanningOptions ({ scopePath }); genPopulate is request-only.';
  const removed = (): never => {
    const detail = `${helper}: positional skipChecks/subPaths/baseFields and extra helper arguments have been removed. ${replacement}`;
    const error = new ServiceAuthorizationError(detail);
    error.message = detail;
    throw error;
  };
  // Check wrappers as well as cores: forwarding must not discard a trailing argument.
  if (count > maximum || options === null || typeof options !== 'object' || Array.isArray(options)) removed();
  const value = authorizationRecord(options, `${helper} options`);
  for (const key of ['skipChecks', 'subPaths', 'baseFields']) {
    if (key in value) removed();
  }
}

/** Scope-only request helpers have no output policy, handle, catalog or bypass. */
export function requestFieldScope(options: unknown): readonly string[] {
  const value = authorizationRecord(options, 'request field options');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (key !== 'scopePath' || !('value' in descriptor) || !descriptor.enumerable) {
      authorizationError(
        'request-only field helpers accept only named scopePath; authorization and bypass options are unsupported',
      );
    }
  }
  const scope = value.scopePath;
  if (scope === undefined) return [];
  if (!Array.isArray(scope) || scope.length > 100)
    authorizationError('scopePath must be an array of response segments');
  for (const key of Reflect.ownKeys(scope)) {
    if (key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(scope, key)!;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || !('value' in descriptor) || !descriptor.enumerable) {
      authorizationError('scopePath must contain only response segments');
    }
  }
  const result: string[] = [];
  for (let index = 0; index < scope.length; index++) {
    const part = Object.getOwnPropertyDescriptor(scope, String(index))?.value;
    if (typeof part !== 'string' || part.includes('.') || !isSafeOutputPath(part)) {
      authorizationError(
        'scopePath requires ordinary response segments, e.g. ["contacts"], without sub markers or indices',
      );
    }
    result.push(part);
  }
  return result;
}
