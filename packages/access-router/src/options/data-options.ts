import mongoose from 'mongoose';
import { addLeadingSlash, isNil, isString } from '@web-ts-toolkit/utils';
import { OptionsManager, getNestedOption } from './manager';
import { DataRouterOptions, ExtendedDataRouterOptions } from '../interfaces';

const pluralize = mongoose.pluralize();

const dataOptions: Record<string, OptionsManager<DataRouterOptions, ExtendedDataRouterOptions>> = {};

const defaultDataOptions: DataRouterOptions = {
  basePath: null,
  queryPath: '__query',
};

const normalizeBasePath = (name: string, value: string | null | undefined) => {
  if (isNil(value)) {
    return `/${pluralize(name)}`;
  }

  return isString(value) ? addLeadingSlash(value) : '';
};

const createDataOptions = (dataName: string) => {
  const manager = new OptionsManager<DataRouterOptions, ExtendedDataRouterOptions>({
    ...defaultDataOptions,
    dataName,
  });

  manager
    .onchange('basePath', function (newval, key, target, oldval) {
      (target as Record<string, unknown>)[key] = normalizeBasePath(
        dataName,
        isString(newval) || isNil(newval) ? newval : undefined,
      );
    })
    .build();

  return manager;
};

const getOrCreateDataOptions = (dataName: string) => {
  let manager = dataOptions[dataName];
  if (!manager) {
    manager = createDataOptions(dataName);
    dataOptions[dataName] = manager;
  }

  return manager;
};

export const setDataOptions = <TData = unknown>(dataName: string, options: DataRouterOptions<TData>) => {
  const manager = getOrCreateDataOptions(dataName);
  const dataOptions = manager.fetch();

  manager.assign({ ...dataOptions, ...options });
};

export const setDataOption = <K extends keyof DataRouterOptions<TData>, TData = unknown>(
  dataName: string,
  key: K,
  value: DataRouterOptions<TData>[K],
) => {
  const manager = getOrCreateDataOptions(dataName);

  manager.set(key, value);
};

export const getDataOptions = <TData = unknown>(dataName: string) => {
  const manager = getOrCreateDataOptions(dataName);
  return manager.fetch() as DataRouterOptions<TData>;
};

export const getDataOption = <K extends keyof DataRouterOptions<TData>, TData = unknown>(
  dataName: string,
  key: K | string,
  defaultValue?: DataRouterOptions<TData>[K],
) => {
  const manager = getOrCreateDataOptions(dataName);

  return getNestedOption(manager, key, defaultValue) as DataRouterOptions<TData>[K];
};

export const getExactDataOption = <K extends keyof ExtendedDataRouterOptions<TData>, TData = unknown>(
  dataName: string,
  key: K | string,
) => {
  const manager = getOrCreateDataOptions(dataName);
  return manager.get(key) as ExtendedDataRouterOptions<TData>[K];
};

export const getDataNames = () => {
  return Object.keys(dataOptions);
};
