const ERROR_BRAND_PREFIX = '@web-ts-toolkit/message-service/error/';

export function markRuntimeError(error: Error, name: string): void {
  Object.defineProperty(error, Symbol.for(`${ERROR_BRAND_PREFIX}${name}`), {
    configurable: false,
    enumerable: false,
    value: true,
  });
}

export function isRuntimeError(value: unknown, name: string): boolean {
  if (!value || typeof value !== 'object') return false;

  return (
    (value as { name?: unknown }).name === name &&
    (value as Record<symbol, unknown>)[Symbol.for(`${ERROR_BRAND_PREFIX}${name}`)] === true
  );
}
