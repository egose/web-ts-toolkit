import { DefaultModelRouterOptions, ExtendedDefaultModelRouterOptions } from '../interfaces';
import { defaultRuntime } from '../runtime';
import { getActiveRuntime } from '../runtime-context';

const getRuntime = () => getActiveRuntime() ?? defaultRuntime;

export const setDefaultModelOptions = (options: DefaultModelRouterOptions) => {
  getRuntime().setDefaultModelOptions(options);
};

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
