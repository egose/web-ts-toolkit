import 'reflect-metadata';
import type {
  AccessRouterRequest,
  ExtendedDefaultModelRouterOptions,
  GlobalPermissionValue,
  GuardHook,
  MaybePromise,
  ModelBaseFilterHook,
  ModelDeleteHook,
  ModelDocPermissionsHook,
  ModelDocumentHook,
  ModelHook,
  ModelIdentifierHook,
  ModelListHook,
  ModelOverrideFilterHook,
  ModelValidateHook,
} from '@web-ts-toolkit/access-router';
import { HOOK_DEFINITIONS, type HookDefinition, type HookDefinitionKey, type HookOperation } from '../constants';

type HookDecorator<TReturn> = <TKey extends string | symbol, TMethod extends (...args: any[]) => TReturn>(
  target: object,
  key: TKey,
  descriptor: TypedPropertyDescriptor<TMethod>,
) => void;

type IdentifierDecoratorHook<TModel = unknown> = (
  this: AccessRouterRequest,
  id: string,
) => ReturnType<ModelIdentifierHook<TModel>>;
type BeforeDeleteDecoratorHook<TModel = unknown> = ModelDeleteHook<TModel>;
type AfterDeleteDecoratorHook<TModel = unknown> = ModelDeleteHook<TModel>;
type DocPermissionsDecoratorHook = ModelDocPermissionsHook;
type BaseFilterDecoratorHook = ModelBaseFilterHook;
type OverrideFilterDecoratorHook = ModelOverrideFilterHook;
type ValidateDecoratorHook = ModelValidateHook;
type PrepareDecoratorHook<TModel = unknown> = Extract<ModelHook<TModel>, Function>;
type TransformDecoratorHook<TModel = unknown> = Extract<ModelDocumentHook<TModel>, Function>;
type AfterPersistDecoratorHook<TModel = unknown> = Extract<ModelDocumentHook<TModel>, Function>;
type DecorateDecoratorHook<TModel = unknown> = Extract<ModelHook<TModel>, Function>;
type DecorateAllDecoratorHook<TModel = unknown> = Extract<ModelListHook<TModel>, Function>;

/**
 * Instance-only decorator contract (all method hooks in this file).
 *
 * These are legacy (experimental) TypeScript method decorators for **instance
 * methods only**. At decoration time each decorator rejects:
 *
 * - static methods (`typeof target === 'function'`, i.e. the decorator was
 *   applied to the constructor rather than the prototype);
 * - missing/invalid operations for operation-bearing hooks (`undefined`,
 *   empty, wrong-type, or unsupported values), validated against
 *   `HOOK_DEFINITIONS` even when the caller passes no argument from
 *   JavaScript.
 *
 * Compatibility impact: previously a static hook (e.g. `@RouteGuard('read')`
 * on `static guard()`) compiled and received metadata but instance-prototype
 * discovery never registered it, so a deny guard silently disappeared;
 * likewise `BaseFilter()` with no operation wrote unsuffixed metadata that
 * bootstrap silently skipped. Both now throw at decoration time before any
 * metadata is written, so no watermark/operation keys are left behind. Valid
 * instance methods — including inherited and symbol-keyed ones — and
 * operationless hooks (`@GlobalPermissions`, `@Identifier`, `@BeforeDelete`,
 * `@AfterDelete`) are unaffected.
 */
const assertInstanceMethodTarget = (definition: HookDefinition, target: object) => {
  if (typeof target === 'function') {
    throw new Error(
      `Invalid @${definition.optionKey} target: static methods are not supported; decorate an instance method (not "static"). Static hooks are never registered because discovery scans instance prototypes, so this fails fast instead of silently dropping the hook.`,
    );
  }
};

const assertValidOperation = (definition: HookDefinition, operation: unknown) => {
  const allowed = definition.operations as readonly string[] | null;
  if (allowed === null) return;
  if (typeof operation !== 'string' || !allowed.includes(operation)) {
    throw new Error(
      `Invalid @${definition.optionKey} operation "${String(operation)}": expected one of ${allowed.join(', ')}`,
    );
  }
};

const setMethodMetadata = <THook extends Function>(definition: HookDefinition, operation?: string) => {
  return (target: object, key: string | symbol, descriptor: TypedPropertyDescriptor<THook>) => {
    assertInstanceMethodTarget(definition, target);
    assertValidOperation(definition, operation);
    if (descriptor.value === undefined) return;
    Reflect.defineMetadata(definition.watermark, true, descriptor.value);
    const compositeKey = operation ? `${definition.optionKey}.${operation}` : definition.optionKey;
    Reflect.defineMetadata(compositeKey, true, descriptor.value);
  };
};

const hook = <TKey extends HookDefinitionKey>(hookKey: TKey) => HOOK_DEFINITIONS[hookKey];

type OperationAccessOptionKey = Extract<keyof ExtendedDefaultModelRouterOptions, `operationAccess.${string}`>;

export type RouteGuardOperationKey = Exclude<
  OperationAccessOptionKey extends `operationAccess.${infer TOperation}` ? TOperation : never,
  'subs'
>;

/**
 * Registers a global permissions hook (`globalPermissions`).
 *
 * Valid class role: `@Module`-decorated module class only. Not valid on `@Router` or `@RouterOptions`.
 * Operations: none — scalar hook (no operation suffix).
 * Result contract: `MaybePromise<GlobalPermissionValue>` where `GlobalPermissionValue = string | string[] | Record<string,boolean> | null | undefined`.
 * Parameter injection is explicit: undecorated parameters receive no value. Use `@Request()` for the active Express request.
 * `this` is the decorated module class instance, not the request.
 */
export function GlobalPermissions(): HookDecorator<MaybePromise<GlobalPermissionValue>> {
  return setMethodMetadata(hook('globalPermissions'));
}

/**
 * Registers a document-permissions hook (`docPermissions.<operation>`).
 *
 * Valid class roles: `@Router(Model)` (model router) and `@RouterOptions(Model)` (model-specific options). Not valid on `@Module`, root routers, or default options.
 * Valid operations: `default`, `create`, `update`, `list`, `read` — one operation per decorator; scalar hook rejects duplicate `docPermissions.<op>` on the same class.
 * Result contract: `MaybePromise<Record<string, unknown>>` — per-document permission map combined with global grants via OR.
 * A field is visible when the global permission OR the document permission grants it (`permissions.has(key) || docPermissions[key]`),
 * so an empty map grants nothing by itself and never revokes a global grant; it is not a universal deny mechanism.
 * Parameter injection is explicit: use `@Document()` for the document, `@Permissions()` for resolved permissions, `@Context()` for `ModelHookContext`, optional `@Request()` for the request. `this` is the class instance.
 *
 * @param optionKey - operation name (`default` applies to `create`+`update`, `list`/`read`/`create`/`update` are operation-specific).
 */
export function DocPermissions(
  optionKey: HookOperation<'docPermissions'>,
): HookDecorator<ReturnType<DocPermissionsDecoratorHook>> {
  const definition = hook('docPermissions');
  assertValidOperation(definition, optionKey);
  return setMethodMetadata(definition, optionKey);
}

/**
 * Registers a base-filter hook (`baseFilter.<operation>`).
 *
 * Valid class roles: `@Router(Model)` and `@RouterOptions(Model)`. Not on `@Module` / root / default options.
 * Valid operations: `default`, `update`, `list`, `read`, `delete`; scalar — duplicate `baseFilter.<op>` on same class is rejected.
 * Result contract: `MaybePromise<Filter | true | null | undefined>` — filter object restricts the query; `true` means unrestricted.
 * Only `false` denies (effective result `false`). `null` / `undefined` / `true` / empty `{}` add no base restriction:
 * they normalize to no restriction, so the incoming filter (or `{}` when absent) passes through unchanged.
 * Parameter injection explicit: use `@Permissions()` for resolved permissions, optional `@Request()`. `this` is the class instance.
 *
 * @param optionKey - operation to scope the base filter.
 */
export function BaseFilter(optionKey: HookOperation<'baseFilter'>): HookDecorator<ReturnType<BaseFilterDecoratorHook>> {
  const definition = hook('baseFilter');
  assertValidOperation(definition, optionKey);
  return setMethodMetadata(definition, optionKey);
}

/**
 * Registers an override-filter hook (`overrideFilter.<operation>`).
 *
 * Valid class roles: `@Router(Model)` and `@RouterOptions(Model)`.
 * Valid operations: `default`, `update`, `list`, `read`, `delete`; scalar duplicate rejected.
 * Result contract: `MaybePromise<Filter>` — returned filter replaces/augments the incoming client filter.
 * Parameter injection explicit: use `@Filter()` for the incoming filter and `@Permissions()` for permissions, optional `@Request()`. `this` is the class instance.
 *
 * @param optionKey - operation to scope the override filter.
 */
export function OverrideFilter(
  optionKey: HookOperation<'overrideFilter'>,
): HookDecorator<ReturnType<OverrideFilterDecoratorHook>> {
  const definition = hook('overrideFilter');
  assertValidOperation(definition, optionKey);
  return setMethodMetadata(definition, optionKey);
}

/**
 * Registers a validation hook (`validate.<operation>`).
 *
 * Valid class roles: `@Router(Model)` and `@RouterOptions(Model)` (model scope only; not on `@Module`, root routers, or default model options).
 * Valid operations: `default`, `create`, `update`; scalar-like — duplicate `validate.<op>` on the same class is rejected (array chain semantics intentional: validators are treated as scalar reject-on-duplicate).
 * Result contract: `MaybePromise<ValidateRule>` where `ValidateRule = boolean | unknown[]` — `true` passes, `false` or non-empty array produces a controlled `400 Bad Request` validation failure with the array as issues. Returning the document itself is a type error — use `true` on success, `false` or `['field is required']` style issue array on failure; do not `throw` for expected invalid input nor return the document.
 * Parameter injection explicit: use `@Document()` for allowed data, optional `@Permissions()`, `@Context()`, `@Request()`. `this` is the class instance.
 *
 * @param optionKey - operation to scope validation.
 */
export function Validate(optionKey: HookOperation<'validate'>): HookDecorator<ReturnType<ValidateDecoratorHook>> {
  const definition = hook('validate');
  assertValidOperation(definition, optionKey);
  return setMethodMetadata(definition, optionKey);
}

/**
 * Registers a prepare hook (`prepare.<operation>`) that runs before persistence.
 *
 * Valid class roles: `@Router(Model)` and `@RouterOptions(Model)`.
 * Valid operations: `default`, `create`, `update`; array hook — multiple `@Prepare` on same class compose base-to-derived order.
 * Result contract: `MaybePromise<TValue>` — return the (possibly mutated) value to persist.
 * Parameter injection explicit: `@Document()` for the document/value, `@Permissions()`, `@Context()`, optional `@Request()`. `this` is the class instance.
 *
 * @param optionKey - operation to scope the prepare chain.
 */
export function Prepare<TModel = unknown>(
  optionKey: HookOperation<'prepare'>,
): HookDecorator<ReturnType<PrepareDecoratorHook<TModel>>> {
  const definition = hook('prepare');
  assertValidOperation(definition, optionKey);
  return setMethodMetadata(definition, optionKey);
}

/**
 * Registers a transform hook (`transform.<operation>`) that runs on the document before response.
 *
 * Valid class roles: `@Router(Model)` and `@RouterOptions(Model)`.
 * Valid operations: `default`, `update`; array hook — composes into a chain.
 * Result contract: `MaybePromise<ModelDocument<TValue>>`.
 * Parameter injection explicit: `@Document()`, `@Permissions()`, `@Context()`, optional `@Request()`. `this` is the class instance.
 *
 * @param optionKey - operation to scope the transform.
 */
export function Transform<TModel = unknown>(
  optionKey: HookOperation<'transform'>,
): HookDecorator<ReturnType<TransformDecoratorHook<TModel>>> {
  const definition = hook('transform');
  assertValidOperation(definition, optionKey);
  return setMethodMetadata(definition, optionKey);
}

/**
 * Registers an after-persist hook (`afterPersist.<operation>`).
 *
 * Valid class roles: `@Router(Model)` and `@RouterOptions(Model)`.
 * Valid operations: `default`, `create`, `update`; array hook — composes.
 * Result contract: `MaybePromise<ModelDocument<TValue>>` (side effects allowed).
 * Parameter injection explicit: `@Document()`, `@Permissions()`, `@Context()`, optional `@Request()`. `this` is the class instance.
 *
 * @param optionKey - operation to scope the hook.
 */
export function AfterPersist<TModel = unknown>(
  optionKey: HookOperation<'afterPersist'>,
): HookDecorator<ReturnType<AfterPersistDecoratorHook<TModel>>> {
  const definition = hook('afterPersist');
  assertValidOperation(definition, optionKey);
  return setMethodMetadata(definition, optionKey);
}

/**
 * Registers a decorate hook (`decorate.<operation>`) for single-document decoration.
 *
 * Valid class roles: `@Router(Model)` and `@RouterOptions(Model)`.
 * Valid operations: `default`, `create`, `update`, `list`, `read`; array hook — composes base-to-derived.
 * Result contract: `MaybePromise<TValue>` — decorated document.
 * Parameter injection explicit: `@Document()`, `@Permissions()`, `@Context()`, optional `@Request()`. `this` is the class instance.
 *
 * @param optionKey - operation to scope decoration.
 */
export function Decorate<TModel = unknown>(
  optionKey: HookOperation<'decorate'>,
): HookDecorator<ReturnType<DecorateDecoratorHook<TModel>>> {
  const definition = hook('decorate');
  assertValidOperation(definition, optionKey);
  return setMethodMetadata(definition, optionKey);
}

/**
 * Registers a decorate-all hook (`decorateAll.<operation>`) for list decoration.
 *
 * Valid class roles: `@Router(Model)` and `@RouterOptions(Model)`.
 * Valid operations: `default`, `list`; array hook — composes.
 * Result contract: `MaybePromise<TValue[]>` — decorated array.
 * Parameter injection explicit: `@Document()` for the array, `@Permissions()`, `@Context()`, optional `@Request()`. `this` is the class instance.
 *
 * @param optionKey - operation to scope decoration.
 */
export function DecorateAll<TModel = unknown>(
  optionKey: HookOperation<'decorateAll'>,
): HookDecorator<ReturnType<DecorateAllDecoratorHook<TModel>>> {
  const definition = hook('decorateAll');
  assertValidOperation(definition, optionKey);
  return setMethodMetadata(definition, optionKey);
}

/**
 * Registers a route-guard hook (`operationAccess.<operation>`).
 *
 * Valid class roles: `@Router(Model)`, `@RouterOptions(Model)`, and `@RouterOptions` default model options (the only hook valid on default options alongside `@Identifier`).
 * Valid operations: `default`, `new`, `list`, `create`, `read`, `update`, `upsert`, `delete`, `distinct`, `count` (`subs` is a nested option, not a scalar guard — use typed model options). Scalar — duplicate `operationAccess.<op>` on same class is rejected. Throws at decoration time for invalid operations.
 * Result contract: `MaybePromise<boolean>` — `true` allows, `false` denies (non-boolean truthy values are not valid and fail strict types; returning object/string/number/void is a type error).
 * Parameter injection explicit: use `@Permissions()` for resolved permissions, optional `@Request()`. `this` is the class instance.
 *
 * @param optionKey - scalar guard operation.
 */
export function RouteGuard(optionKey: RouteGuardOperationKey): HookDecorator<ReturnType<GuardHook>> {
  const definition = hook('routeGuard');
  assertValidOperation(definition, optionKey);
  return setMethodMetadata(definition, optionKey);
}

/**
 * Registers an identifier hook (`resolveIdFilter`) mapping route `id` to a filter.
 *
 * Valid class roles: `@Router(Model)`, `@RouterOptions(Model)`, and default model options (`@RouterOptions` without model) — maps to `resolveIdFilter`.
 * Operations: none — scalar hook, one per class (duplicate rejected).
 * Result contract: `MaybePromise<Filter<TValue>>` — filter selecting the document by id.
 * Parameter injection explicit: use `@Id()` for the route identifier string, optional `@Request()` for the request.
 * `this` is the decorated class instance — the same binding as every other hook in this file (wired via `wrapMethod`);
 * it is never the request object.
 * No operation param.
 */
export function Identifier<TModel = unknown>(): HookDecorator<ReturnType<IdentifierDecoratorHook<TModel>>> {
  return setMethodMetadata(hook('identifier'));
}

/**
 * Registers a before-delete hook (`beforeDelete`).
 *
 * Valid class roles: `@Router(Model)` and `@RouterOptions(Model)`. Not on `@Module`/root/default.
 * Operations: none — scalar.
 * Result contract: `MaybePromise<void>` — side-effect hook; throwing aborts delete.
 * Parameter injection explicit: use `@Document()` for the document about to be deleted, `@Permissions()`, `@Context()`, optional `@Request()`. `this` is the class instance.
 */
export function BeforeDelete<TModel = unknown>(): HookDecorator<ReturnType<BeforeDeleteDecoratorHook<TModel>>> {
  return setMethodMetadata(hook('beforeDelete'));
}

/**
 * Registers an after-delete hook (`afterDelete`).
 *
 * Valid class roles: `@Router(Model)` and `@RouterOptions(Model)`.
 * Operations: none — scalar.
 * Result contract: `MaybePromise<void>`.
 * Parameter injection explicit: `@Document()` for the deleted document, `@Permissions()`, `@Context()`, optional `@Request()`. `this` is the class instance.
 */
export function AfterDelete<TModel = unknown>(): HookDecorator<ReturnType<AfterDeleteDecoratorHook<TModel>>> {
  return setMethodMetadata(hook('afterDelete'));
}
