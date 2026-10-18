import type { HydrationMode, ModelHydrationOptions } from '../interfaces/root';

const methods = ['publicList', 'publicRead', 'find', 'findOne', 'findById'] as const;

/** Validate and own the small configuration record before any runtime publication. */
export function normalizeHydration(value: unknown, path = 'hydration'): ModelHydrationOptions | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new TypeError(`${path} must be a plain record of model hydration modes`);
  const result: ModelHydrationOptions = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !(methods as readonly string[]).includes(key))
      throw new TypeError(`${path}.${String(key)} is not a supported hydration method`);
    const mode = (value as Record<string, unknown>)[key];
    if (mode !== undefined && mode !== 'lean' && mode !== 'hydrated')
      throw new TypeError(`${path}.${key} must be 'lean', 'hydrated', or undefined`);
    result[key as keyof ModelHydrationOptions] = mode as HydrationMode | undefined;
  }
  return Object.freeze(result);
}

export function normalizeHydrationUpdate(current: unknown, key: string, value: unknown) {
  if (key === 'hydration') return normalizeHydration(value);
  const method = key.slice('hydration.'.length);
  if (!(methods as readonly string[]).includes(method))
    throw new TypeError(`${key} is not a supported hydration method`);
  return normalizeHydration({ ...normalizeHydration(current), [method]: value });
}
