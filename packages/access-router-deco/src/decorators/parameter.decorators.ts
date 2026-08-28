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

/**
 * Injects the active Express request (`AccessRouterRequest`) for the current hook invocation.
 * Valid on any hook method (`@GlobalPermissions`, `@DocPermissions`, `@Validate`, etc.) and on `@Identifier`. Explicit — undecorated parameters receive no value (injection never happens by position). `this` inside the hook is the class instance; use this decorator to access request data.
 */
export function Request(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.REQUEST);
}

/**
 * Injects the document / allowed data payload for the current hook.
 * Valid on model hooks (`@DocPermissions`, `@Validate`, `@Prepare`, `@Transform`, `@Decorate`, `@DecorateAll`, `@BeforeDelete`, `@AfterDelete`). Explicit — undecorated params receive nothing. Type is the model document or allowed data depending on the hook.
 */
export function Document(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.DOCUMENT);
}

/**
 * Injects resolved permissions (`AccessRouterPermissions`) for the current hook.
 * Valid on `@RouteGuard`, `@BaseFilter`, `@DocPermissions`, `@Validate`, `@Prepare`, and similar model hooks; for `@GlobalPermissions` use `@Request()` instead (permissions are the return value). Explicit injection required.
 */
export function Permissions(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.PERMISSIONS);
}

/**
 * Injects the hook context (`ModelHookContext`) supplied by `access-router`.
 * Valid on model hooks that receive context (`@DocPermissions`, `@Validate`, `@Prepare`, etc.). Explicit — undecorated params receive nothing.
 */
export function Context(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.CONTEXT);
}

/**
 * Injects the current runtime filter for `@OverrideFilter` hooks.
 * Valid only on `@OverrideFilter` methods. Explicit — must decorate the filter parameter; undecorated params receive no filter. Combine with `@Permissions()` for permission-aware filter rewriting.
 */
export function Filter(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.FILTER);
}

/**
 * Injects the route identifier string for `@Identifier` hooks.
 * Valid only on `@Identifier` methods (mapped to `resolveIdFilter`). Explicit — undecorated params receive nothing. Return a `Filter` (e.g., `{ slug: id }`) from the hook.
 */
export function Id(): ParameterDecorator {
  return (target, key, index) => mergeHookParams(target, key, index, HookParamtypes.ID);
}
