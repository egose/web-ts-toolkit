import type { OptionMetadata, OptionScope } from './decorators/property.decorators';

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
  if (scope === 'global' && typeof option.optionKey === 'string' && populatePolicyOptions.has(option.optionKey)) {
    throw new TypeError(
      `${option.optionKey} on property ${String(option.propertyKey)} is target-model configuration; use @ModelOption on @Router(Model) / @RouterOptions(Model) or @DefaultModelOption on a default @RouterOptions provider (setModelOptions / setDefaultModelOptions), not a global @Module option`,
    );
  }
}

export function validatePropertyOptionValue(option: OptionMetadata, value: unknown): void {
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
