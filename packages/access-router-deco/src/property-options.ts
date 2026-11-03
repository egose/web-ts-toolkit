import type { OptionMetadata, OptionScope } from './decorators/property.decorators';
import {
  isAuthorizationModeKey,
  validateAuthorizationModeKey,
  validateAuthorizationModeValue,
} from './authorization-modes';

// Deliberately bounded: extension keys and union-shaped policy/hook values retain
// their existing runtime contract. Keep the exact list in the shipped README.
const stringOptions = new Set([
  'requestPermissionField',
  'documentPermissionField',
  'idParam',
  'idField',
  'parentPath',
  'queryRouteSegment',
  'mutationRouteSegment',
  'modelPermissionPrefix',
  'modelName',
  'basePath',
]);
const populatePolicyOptions = new Set([
  'requireOperationAccessForPopulateQueries',
  'requireOperationAccessForPopulateDependencies',
]);

/** Known moved keys are not global extensions, even with inferred/legacy decorators or undefined values. */
export function validatePropertyOptionScope(option: OptionMetadata, scope?: OptionScope): void {
  if (typeof option.optionKey === 'string')
    validateAuthorizationModeKey(option.optionKey, scope === 'model' || scope === 'default');
  if (scope === 'global' && typeof option.optionKey === 'string' && populatePolicyOptions.has(option.optionKey)) {
    throw new TypeError(
      `${option.optionKey} on property ${String(option.propertyKey)} is target-model configuration; use @ModelOption on @Router(Model) / @RouterOptions(Model) or @DefaultModelOption on a default @RouterOptions provider (setModelOptions / setDefaultModelOptions), not a global @Module option`,
    );
  }
}

export function validatePropertyOptionValue(option: OptionMetadata, value: unknown): void {
  if (typeof option.optionKey === 'string' && isAuthorizationModeKey(option.optionKey)) {
    validateAuthorizationModeValue(value);
    return;
  }
  if (value === undefined || typeof option.optionKey !== 'string') return;
  const key = option.optionKey;
  const expected = stringOptions.has(key)
    ? 'string'
    : key === 'listHardLimit'
      ? 'finite number'
      : populatePolicyOptions.has(key)
        ? 'boolean'
        : undefined;
  if (!expected) return;
  const valid =
    expected === 'finite number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === expected;
  if (!valid) {
    throw new TypeError(
      `Invalid option value for ${key} on property ${String(option.propertyKey)}: expected ${expected} or undefined`,
    );
  }
}

/** Mode properties must have the same descriptor contract as model/default option bags. */
export function readPropertyOptionValue(instance: object, option: OptionMetadata): unknown {
  if (typeof option.optionKey === 'string' && isAuthorizationModeKey(option.optionKey)) {
    const slot = Object.getOwnPropertyDescriptor(instance, option.propertyKey);
    if (!slot || !('value' in slot) || !slot.enumerable)
      throw new TypeError(
        `${option.optionKey} on property ${String(option.propertyKey)} must be an own enumerable data option`,
      );
    return slot.value;
  }
  return (instance as Record<string | symbol, unknown>)[option.propertyKey];
}
