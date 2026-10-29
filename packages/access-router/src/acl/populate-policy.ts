/** Package-private model-default capture. Never use a source model's resolved flags as defaults. */
import type { ModelRouterOptions } from '../interfaces';
import type { AccessRuntime } from '../runtime';
import { populatePolicyKeys, type PopulatePolicyKey } from '../options/populate-policy';
import { authorizationError } from './authorization-snapshot';

/** Function identity survives authorization snapshot copying, retaining one owner capture. */
export type PopulatePolicyDefaultsToken = () => void;
const defaults = new WeakMap<PopulatePolicyDefaultsToken, Readonly<Record<PopulatePolicyKey, boolean>>>();

/** Call before source/target option reads and before the first await of the owning operation. */
export function capturePopulatePolicyDefaults(runtime: AccessRuntime): PopulatePolicyDefaultsToken {
  const options = runtime.getDefaultModelOptions();
  const token = () => {};
  defaults.set(
    token,
    Object.freeze({
      requireOperationAccessForPopulateQueries: options.requireOperationAccessForPopulateQueries !== false,
      requireOperationAccessForPopulateDependencies: options.requireOperationAccessForPopulateDependencies !== false,
    }),
  );
  return token;
}

/** Resolve independently against held defaults. Only undefined inherits; null must remain strict. */
export function resolvePopulatePolicy(
  options: ModelRouterOptions,
  token: PopulatePolicyDefaultsToken,
): Readonly<Record<PopulatePolicyKey, boolean>> {
  const captured = defaults.get(token);
  if (!captured) return authorizationError('invalid captured populate model defaults');
  const resolve = (key: PopulatePolicyKey) => (options[key] === undefined ? captured[key] : options[key]) !== false;
  return Object.freeze({
    requireOperationAccessForPopulateQueries: resolve(populatePolicyKeys[0]),
    requireOperationAccessForPopulateDependencies: resolve(populatePolicyKeys[1]),
  });
}

/** Nested stages must retain the original token, never recapture live defaults or source flags. */
export function getCapturedPopulatePolicyDefaults(configuration: {
  readonly populatePolicyDefaults?: PopulatePolicyDefaultsToken;
}): PopulatePolicyDefaultsToken {
  const token = configuration.populatePolicyDefaults;
  if (!token || !defaults.has(token)) return authorizationError('missing captured populate model defaults');
  return token;
}
