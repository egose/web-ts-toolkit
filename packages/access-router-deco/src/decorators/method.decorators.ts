import 'reflect-metadata';
import type {
  AccessRouterRequest,
  ExtendedDefaultModelRouterOptions,
  GlobalPermissionValue,
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

const setMethodMetadata = <THook extends Function>(definition: HookDefinition, operation?: string) => {
  return (target: object, key: string | symbol, descriptor: TypedPropertyDescriptor<THook>) => {
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

export function GlobalPermissions(): HookDecorator<MaybePromise<GlobalPermissionValue>> {
  return setMethodMetadata(hook('globalPermissions'));
}

export function DocPermissions(
  optionKey: HookOperation<'docPermissions'>,
): HookDecorator<ReturnType<DocPermissionsDecoratorHook>> {
  return setMethodMetadata(hook('docPermissions'), optionKey);
}

export function BaseFilter(optionKey: HookOperation<'baseFilter'>): HookDecorator<ReturnType<BaseFilterDecoratorHook>> {
  return setMethodMetadata(hook('baseFilter'), optionKey);
}

export function OverrideFilter(
  optionKey: HookOperation<'overrideFilter'>,
): HookDecorator<ReturnType<OverrideFilterDecoratorHook>> {
  return setMethodMetadata(hook('overrideFilter'), optionKey);
}

export function Validate(optionKey: HookOperation<'validate'>): HookDecorator<ReturnType<ValidateDecoratorHook>> {
  return setMethodMetadata(hook('validate'), optionKey);
}

export function Prepare<TModel = unknown>(
  optionKey: HookOperation<'prepare'>,
): HookDecorator<ReturnType<PrepareDecoratorHook<TModel>>> {
  return setMethodMetadata(hook('prepare'), optionKey);
}

export function Transform<TModel = unknown>(
  optionKey: HookOperation<'transform'>,
): HookDecorator<ReturnType<TransformDecoratorHook<TModel>>> {
  return setMethodMetadata(hook('transform'), optionKey);
}

export function AfterPersist<TModel = unknown>(
  optionKey: HookOperation<'afterPersist'>,
): HookDecorator<ReturnType<AfterPersistDecoratorHook<TModel>>> {
  return setMethodMetadata(hook('afterPersist'), optionKey);
}

export function Decorate<TModel = unknown>(
  optionKey: HookOperation<'decorate'>,
): HookDecorator<ReturnType<DecorateDecoratorHook<TModel>>> {
  return setMethodMetadata(hook('decorate'), optionKey);
}

export function DecorateAll<TModel = unknown>(
  optionKey: HookOperation<'decorateAll'>,
): HookDecorator<ReturnType<DecorateAllDecoratorHook<TModel>>> {
  return setMethodMetadata(hook('decorateAll'), optionKey);
}

export function RouteGuard(optionKey: RouteGuardOperationKey): HookDecorator<unknown> {
  return setMethodMetadata(hook('routeGuard'), optionKey);
}

export function Identifier<TModel = unknown>(): HookDecorator<ReturnType<IdentifierDecoratorHook<TModel>>> {
  return setMethodMetadata(hook('identifier'));
}

export function BeforeDelete<TModel = unknown>(): HookDecorator<ReturnType<BeforeDeleteDecoratorHook<TModel>>> {
  return setMethodMetadata(hook('beforeDelete'));
}

export function AfterDelete<TModel = unknown>(): HookDecorator<ReturnType<AfterDeleteDecoratorHook<TModel>>> {
  return setMethodMetadata(hook('afterDelete'));
}
