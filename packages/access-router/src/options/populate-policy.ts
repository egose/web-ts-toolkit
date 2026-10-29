/** Populate flags resolve captured defaults separately from stored model overrides. */
export const populatePolicyKeys = [
  'requireOperationAccessForPopulateQueries',
  'requireOperationAccessForPopulateDependencies',
] as const;
export type PopulatePolicyKey = (typeof populatePolicyKeys)[number];

export function isPopulatePolicyKey(key: string): key is PopulatePolicyKey {
  return (populatePolicyKeys as readonly string[]).includes(key);
}

/** Undefined restores inheritance; every other value except primitive false is strict. */
export function normalizePopulatePolicyValue(value: unknown): boolean | undefined {
  return value === undefined ? undefined : value !== false;
}

export function normalizePopulatePolicyOptions<T extends object>(options: T): T {
  const next = { ...options };
  for (const key of populatePolicyKeys) {
    if (key in options)
      (next as Record<string, unknown>)[key] = normalizePopulatePolicyValue((options as Record<string, unknown>)[key]);
  }
  return next;
}

/** Reject before any global assignment, including an explicitly undefined stale key. */
export function assertNoGlobalPopulatePolicy(key: string): void {
  if (isPopulatePolicyKey(key))
    throw new TypeError(
      `${key} is target-model configuration; migrate to setModelOptions(targetModelName, { ${key}: value }) or setDefaultModelOptions({ ${key}: value }) for runtime model defaults`,
    );
}
