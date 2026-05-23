import { DataRouterOptions, ExtendedDataRouterOptions } from '../interfaces';
import { defaultRuntime } from '../runtime';
import { getActiveRuntime } from '../runtime-context';

const getRuntime = () => getActiveRuntime() ?? defaultRuntime;

export const setDataOptions = <TData = unknown>(dataName: string, options: DataRouterOptions<TData>) => {
  getRuntime().setDataOptions(dataName, options);
};

export const setDataOption = <K extends keyof DataRouterOptions<TData>, TData = unknown>(
  dataName: string,
  key: K,
  value: DataRouterOptions<TData>[K],
) => {
  getRuntime().setDataOption(dataName, key, value);
};

export const getDataOptions = <TData = unknown>(dataName: string) => {
  return getRuntime().getDataOptions<TData>(dataName);
};

export const getDataOption = <K extends keyof DataRouterOptions<TData>, TData = unknown>(
  dataName: string,
  key: K | string,
  defaultValue?: DataRouterOptions<TData>[K],
) => {
  return getRuntime().getDataOption(dataName, key, defaultValue);
};

export const getExactDataOption = <K extends keyof ExtendedDataRouterOptions<TData>, TData = unknown>(
  dataName: string,
  key: K | string,
) => {
  return getRuntime().getExactDataOption(dataName, key);
};

export const getDataNames = () => {
  return getRuntime().getDataNames();
};
