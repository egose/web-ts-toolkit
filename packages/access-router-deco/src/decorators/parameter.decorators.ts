import 'reflect-metadata';
import { ARGS_METADATA, HookParamtypes } from '../constants';

type HookParamMetadata = { index: number; type: HookParamtypes };

const mergeHookParams = (target: object, key: string | symbol | undefined, index: number, type: HookParamtypes) => {
  if (key === undefined) return;
  const args = (Reflect.getOwnMetadata(ARGS_METADATA, target.constructor, key) || []) as HookParamMetadata[];
  Reflect.defineMetadata(
    ARGS_METADATA,
    args.filter((arg) => arg.index !== index).concat({ index, type }),
    target.constructor,
    key,
  );
};

export function Request(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.REQUEST);
}

export function Document(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.DOCUMENT);
}

export function Permissions(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.PERMISSIONS);
}

export function Context(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.CONTEXT);
}

export function Filter(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.FILTER);
}

export function Id(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.ID);
}
