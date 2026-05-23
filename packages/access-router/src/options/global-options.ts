import { GlobalOptions } from '../interfaces';
import { defaultRuntime } from '../runtime';
import { getActiveRuntime } from '../runtime-context';

const getRuntime = () => getActiveRuntime() ?? defaultRuntime;

export const setGlobalOptions = (options: GlobalOptions) => {
  getRuntime().setGlobalOptions(options);
};

export const setGlobalOption = <K extends keyof GlobalOptions>(key: K, value: GlobalOptions[K]) => {
  getRuntime().setGlobalOption(key, value);
};

export const getGlobalOptions = () => {
  return getRuntime().getGlobalOptions();
};

export const getGlobalOption = <K extends keyof GlobalOptions>(key: K, defaultValue?: GlobalOptions[K]) => {
  return getRuntime().getGlobalOption(key, defaultValue);
};
