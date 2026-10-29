import { DefaultModelRouterOptions, ExtendedDefaultModelRouterOptions } from '../interfaces';
import { defaultRuntime } from '../runtime';
import { getActiveRuntime } from '../runtime-context';

const getRuntime = () => getActiveRuntime() ?? defaultRuntime;

/**
 * Update inherited model defaults shallowly. Unspecified model options follow these
 * updates for new calls, including existing models; explicit model values (even false
 * or empty objects/arrays) win. Model undefined restores inheritance. Existing calls,
 * handles, router.options snapshots and mounted route paths are not rewritten.
 * Explicitly cleared operationAccess keeps its existing exact-key-only default fallback.
 */
export const setDefaultModelOptions = (options: DefaultModelRouterOptions) => {
  getRuntime().setDefaultModelOptions(options);
};

/** Update one inherited model default, with the same precedence as setDefaultModelOptions. */
export const setDefaultModelOption = <K extends keyof ExtendedDefaultModelRouterOptions>(
  key: K,
  value: ExtendedDefaultModelRouterOptions[K],
) => {
  getRuntime().setDefaultModelOption(key, value);
};

export const getDefaultModelOptions = () => {
  return getRuntime().getDefaultModelOptions();
};

export const getDefaultModelOption = <K extends keyof ExtendedDefaultModelRouterOptions>(
  key: K,
  defaultValue?: ExtendedDefaultModelRouterOptions[K],
) => {
  return getRuntime().getDefaultModelOption(key, defaultValue);
};
