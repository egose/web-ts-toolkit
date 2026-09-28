import type { OptionMetadata } from './decorators/property.decorators';

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

export function validatePropertyOptionValue(option: OptionMetadata, value: unknown): void {
  if (value === undefined || typeof option.optionKey !== 'string') return;
  const key = option.optionKey;
  const expected = stringOptions.has(key)
    ? 'string'
    : key === 'listHardLimit'
      ? 'finite number'
      : key === 'requireRegisteredPopulateModels'
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
