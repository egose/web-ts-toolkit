// Metadata keys use Symbol.for for intentional cross-copy interoperability of class watermarks
// (e.g., multiple installed copies sharing Router/Module identity). Operation metadata remains
// string-based but is validated against HOOK_DEFINITIONS before producing any ACL registration
// to prevent forged same-prefix keys from creating runtime options.
const metadataKey = (name: string) => Symbol.for(`@web-ts-toolkit/access-router-deco:${name}`);

export const MODULE_ROUTERS = metadataKey('module.routers');
export const MODULE_ROUTER_OPTIONS = metadataKey('module.routerOptions');
export const MODULE_OPTIONS = metadataKey('module.options');

export const ROOT_ROUTER_WATERMARK = metadataKey('rootRouter');
export const ROUTER_WATERMARK = metadataKey('modelRouter');
export const DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK = metadataKey('defaultModelRouterOptions');
export const MODEL_ROUTER_OPTIONS_WATERMARK = metadataKey('modelRouterOptions');
export const ROUTER_MODEL = metadataKey('router.model');
export const ROUTER_OPTIONS = metadataKey('router.options');
export const ARGS_METADATA = metadataKey('args');
export const OPTIONS_METADATA = metadataKey('options');

export const GLOBAL_PERMISSIONS_WATERMARK = metadataKey('hook.globalPermissions');
export const DOC_PERMISSIONS_WATERMARK = metadataKey('hook.docPermissions');
export const ROUTE_GUARD_WATERMARK = metadataKey('hook.routeGuard');
export const BASE_FILTER_WATERMARK = metadataKey('hook.baseFilter');
export const VALIDATE_WATERMARK = metadataKey('hook.validate');
export const PREPARE_WATERMARK = metadataKey('hook.prepare');
export const TRANSFORM_WATERMARK = metadataKey('hook.transform');
export const DECORATE_WATERMARK = metadataKey('hook.decorate');
export const DECORATE_ALL_WATERMARK = metadataKey('hook.decorateAll');
export const IDENTIFIER_WATERMARK = metadataKey('hook.identifier');
export const OVERRIDE_FILTER_WATERMARK = metadataKey('hook.overrideFilter');
export const AFTER_PERSIST_WATERMARK = metadataKey('hook.afterPersist');
export const BEFORE_DELETE_WATERMARK = metadataKey('hook.beforeDelete');
export const AFTER_DELETE_WATERMARK = metadataKey('hook.afterDelete');

export enum HookParamtypes {
  REQUEST,
  DOCUMENT,
  CONTEXT,
  PERMISSIONS,
  FILTER,
  ID,
}

export const GLOBAL_PERMISSIONS_ARGS = [HookParamtypes.REQUEST];
export const DOC_PERMISSIONS_ARGS = [HookParamtypes.DOCUMENT, HookParamtypes.PERMISSIONS, HookParamtypes.CONTEXT];
export const ROUTE_GUARD_ARGS = [HookParamtypes.PERMISSIONS];
export const BASE_FILTER_ARGS = [HookParamtypes.PERMISSIONS];
export const VALIDATE_ARGS = [HookParamtypes.DOCUMENT, HookParamtypes.PERMISSIONS, HookParamtypes.CONTEXT];
export const PREPARE_ARGS = [HookParamtypes.DOCUMENT, HookParamtypes.PERMISSIONS, HookParamtypes.CONTEXT];
export const TRANSFORM_ARGS = [HookParamtypes.DOCUMENT, HookParamtypes.PERMISSIONS, HookParamtypes.CONTEXT];
export const DECORATE_ARGS = [HookParamtypes.DOCUMENT, HookParamtypes.PERMISSIONS, HookParamtypes.CONTEXT];
export const DECORATE_ALL_ARGS = [HookParamtypes.DOCUMENT, HookParamtypes.PERMISSIONS, HookParamtypes.CONTEXT];
export const OVERRIDE_FILTER_ARGS = [HookParamtypes.FILTER, HookParamtypes.PERMISSIONS];
export const AFTER_PERSIST_ARGS = [HookParamtypes.DOCUMENT, HookParamtypes.PERMISSIONS, HookParamtypes.CONTEXT];
export const BEFORE_DELETE_ARGS = [HookParamtypes.DOCUMENT, HookParamtypes.PERMISSIONS, HookParamtypes.CONTEXT];
export const AFTER_DELETE_ARGS = [HookParamtypes.DOCUMENT, HookParamtypes.PERMISSIONS, HookParamtypes.CONTEXT];

export const IDENTIFIER_ARGS = [HookParamtypes.ID];

const routeGuardOperations = [
  'default',
  'new',
  'list',
  'create',
  'read',
  'update',
  'upsert',
  'delete',
  'distinct',
  'count',
] as const;

export const HOOK_DEFINITIONS = {
  globalPermissions: {
    watermark: GLOBAL_PERMISSIONS_WATERMARK,
    optionKey: 'globalPermissions',
    aclKey: 'globalPermissions',
    array: false,
    args: GLOBAL_PERMISSIONS_ARGS,
    operations: null,
    defaultModelOptions: false,
  },
  docPermissions: {
    watermark: DOC_PERMISSIONS_WATERMARK,
    optionKey: 'docPermissions',
    aclKey: 'docPermissions',
    array: false,
    args: DOC_PERMISSIONS_ARGS,
    operations: ['default', 'create', 'update', 'list', 'read'],
    defaultModelOptions: false,
  },
  routeGuard: {
    watermark: ROUTE_GUARD_WATERMARK,
    optionKey: 'routeGuard',
    aclKey: 'operationAccess',
    array: false,
    args: ROUTE_GUARD_ARGS,
    operations: routeGuardOperations,
    defaultModelOptions: true,
  },
  baseFilter: {
    watermark: BASE_FILTER_WATERMARK,
    optionKey: 'baseFilter',
    aclKey: 'baseFilter',
    array: false,
    args: BASE_FILTER_ARGS,
    operations: ['default', 'update', 'list', 'read', 'delete'],
    defaultModelOptions: false,
  },
  overrideFilter: {
    watermark: OVERRIDE_FILTER_WATERMARK,
    optionKey: 'overrideFilter',
    aclKey: 'overrideFilter',
    array: false,
    args: OVERRIDE_FILTER_ARGS,
    operations: ['default', 'update', 'list', 'read', 'delete'],
    defaultModelOptions: false,
  },
  validate: {
    watermark: VALIDATE_WATERMARK,
    optionKey: 'validate',
    aclKey: 'validate',
    array: true,
    args: VALIDATE_ARGS,
    operations: ['default', 'create', 'update'],
    defaultModelOptions: false,
  },
  prepare: {
    watermark: PREPARE_WATERMARK,
    optionKey: 'prepare',
    aclKey: 'prepare',
    array: true,
    args: PREPARE_ARGS,
    operations: ['default', 'create', 'update'],
    defaultModelOptions: false,
  },
  transform: {
    watermark: TRANSFORM_WATERMARK,
    optionKey: 'transform',
    aclKey: 'transform',
    array: true,
    args: TRANSFORM_ARGS,
    operations: ['default', 'update'],
    defaultModelOptions: false,
  },
  afterPersist: {
    watermark: AFTER_PERSIST_WATERMARK,
    optionKey: 'afterPersist',
    aclKey: 'afterPersist',
    array: true,
    args: AFTER_PERSIST_ARGS,
    operations: ['default', 'create', 'update'],
    defaultModelOptions: false,
  },
  decorate: {
    watermark: DECORATE_WATERMARK,
    optionKey: 'decorate',
    aclKey: 'decorate',
    array: true,
    args: DECORATE_ARGS,
    operations: ['default', 'create', 'update', 'list', 'read'],
    defaultModelOptions: false,
  },
  decorateAll: {
    watermark: DECORATE_ALL_WATERMARK,
    optionKey: 'decorateAll',
    aclKey: 'decorateAll',
    array: true,
    args: DECORATE_ALL_ARGS,
    operations: ['default', 'list'],
    defaultModelOptions: false,
  },
  beforeDelete: {
    watermark: BEFORE_DELETE_WATERMARK,
    optionKey: 'beforeDelete',
    aclKey: 'beforeDelete',
    array: false,
    args: BEFORE_DELETE_ARGS,
    operations: null,
    defaultModelOptions: false,
  },
  afterDelete: {
    watermark: AFTER_DELETE_WATERMARK,
    optionKey: 'afterDelete',
    aclKey: 'afterDelete',
    array: false,
    args: AFTER_DELETE_ARGS,
    operations: null,
    defaultModelOptions: false,
  },
  identifier: {
    watermark: IDENTIFIER_WATERMARK,
    optionKey: 'identifier',
    aclKey: 'resolveIdFilter',
    array: false,
    args: IDENTIFIER_ARGS,
    operations: null,
    defaultModelOptions: true,
  },
} as const;

export type HookDefinitionKey = keyof typeof HOOK_DEFINITIONS;
export type HookDefinition = (typeof HOOK_DEFINITIONS)[HookDefinitionKey];
export type HookOptionKey = HookDefinition['optionKey'];
export type HookOperation<TKey extends HookDefinitionKey> = NonNullable<
  (typeof HOOK_DEFINITIONS)[TKey]['operations']
>[number];

export const HOOK_DEFINITION_LIST = Object.values(HOOK_DEFINITIONS);
export const MODEL_HOOK_DEFINITIONS = HOOK_DEFINITION_LIST.filter((hook) => hook.optionKey !== 'globalPermissions');
export const DEFAULT_MODEL_ROUTER_OPTIONS_HOOK_DEFINITIONS = MODEL_HOOK_DEFINITIONS.filter(
  (hook) => hook.defaultModelOptions,
);
