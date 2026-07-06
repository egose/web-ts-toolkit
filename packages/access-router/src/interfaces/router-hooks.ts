import type { AccessRouterPermissions } from '../permission';
import type {
  Change,
  DataHookContext,
  DataRequest,
  Filter,
  ModelDocument,
  ModelHookContext,
  ModelRequest,
} from './base';
import type { AccessRouterRequest } from './request';

export type MaybePromise<T> = T | Promise<T>;

export type AccessRouterFieldKey<T> = [Extract<keyof T, string>] extends [never] ? string : Extract<keyof T, string>;

export type IdentifierHook<TValue, TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  id: string,
) => MaybePromise<Filter<TValue>>;

export type GlobalPermissionValue = Record<string, boolean> | string[] | string | null | undefined;

type BaseFilterHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  permissions: AccessRouterPermissions,
) => MaybePromise<Filter | true | null | undefined>;

type OverrideFilterHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  filter: Filter,
  permissions: AccessRouterPermissions,
) => MaybePromise<Filter>;

type Hook<TValue, TContext, TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  value: TValue,
  permissions: AccessRouterPermissions,
  context: TContext,
) => MaybePromise<TValue>;

type HookChain<TValue, TContext, TRequest extends AccessRouterRequest = AccessRouterRequest> =
  | Hook<TValue, TContext, TRequest>
  | Array<Hook<TValue, TContext, TRequest>>;

export type ValidateRule = boolean | unknown[];

type ValidateHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  allowedData: unknown,
  permissions: AccessRouterPermissions,
  context: ModelHookContext,
) => MaybePromise<ValidateRule>;

type DocPermissionsHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  doc: unknown,
  permissions: AccessRouterPermissions,
  context: ModelHookContext,
) => MaybePromise<Record<string, unknown>>;

type ChangeHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  previousValue: unknown,
  nextValue: unknown,
  changes: Change[],
  context: ModelHookContext,
) => MaybePromise<void>;

type DeleteHook<TValue = unknown, TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  value: TValue,
  permissions: AccessRouterPermissions,
  context: ModelHookContext,
) => MaybePromise<void>;

type DocumentHook<TValue, TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  value: ModelDocument<TValue>,
  permissions: AccessRouterPermissions,
  context: ModelHookContext,
) => MaybePromise<ModelDocument<TValue>>;

type DocumentHookChain<TValue, TRequest extends AccessRouterRequest = AccessRouterRequest> =
  | DocumentHook<TValue, TRequest>
  | Array<DocumentHook<TValue, TRequest>>;

export type ModelBaseFilterHook = BaseFilterHook<ModelRequest>;
export type DataBaseFilterHook = BaseFilterHook<DataRequest>;
export type ModelOverrideFilterHook = OverrideFilterHook<ModelRequest>;
export type DataOverrideFilterHook = OverrideFilterHook<DataRequest>;
export type ModelIdentifierHook<TValue = unknown> = IdentifierHook<TValue, ModelRequest>;
export type DataIdentifierHook<TValue = unknown> = IdentifierHook<TValue, DataRequest>;
export type ModelValidateHook = ValidateHook<ModelRequest>;
export type ModelDocPermissionsHook = DocPermissionsHook<ModelRequest>;
export type ModelChangeHook = ChangeHook<ModelRequest>;
export type ModelDocumentHook<TValue = unknown> = DocumentHookChain<TValue, ModelRequest>;
export type ModelDeleteHook<TValue = unknown> = DeleteHook<ModelDocument<TValue>, ModelRequest>;
export type ModelHook<TValue = unknown> = HookChain<TValue, ModelHookContext, ModelRequest>;
export type ModelListHook<TValue = unknown> = HookChain<TValue[], ModelHookContext, ModelRequest>;
export type DataHook<TValue = unknown> = HookChain<TValue, DataHookContext, DataRequest>;
export type DataListHook<TValue = unknown> = HookChain<TValue[], DataHookContext, DataRequest>;
