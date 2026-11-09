import type {
  AccessRouterRequest,
  DocumentGrants,
  FieldOperationAccess,
  FieldPermissionHook,
  FieldValidation,
  GuardHook,
  ModelDocPermissionsHook,
  ModelRouterOptions,
  ModelOutputContext,
  ModelOutputHook,
  ModelOutputListHook,
  ServiceOutputContext,
  OperationAccess,
  PermissionSchema,
  Validation,
} from '@web-ts-toolkit/access-router';
import type {
  DocumentGrants as AdvancedGrants,
  FieldPermissionHook as AdvancedFieldHook,
  FieldValidation as AdvancedFieldValidation,
  GuardHook as AdvancedGuard,
  ModelRequest,
} from '@web-ts-toolkit/access-router/advanced';
export { copyPaths } from '@web-ts-toolkit/access-router/processors';

export const facts: DocumentGrants = { owner: true, suspended: false };
export const advancedFacts: AdvancedGrants = facts;

export const field: FieldPermissionHook = function (permissions, grants) {
  const request: AccessRouterRequest = this;
  return request.get('x-actor') !== undefined && permissions.has('reader') && grants.owner === true;
};
export const advancedField: AdvancedFieldHook = field;
export const fieldArity: Parameters<FieldPermissionHook>['length'] = 2;
export const fieldGrammar: FieldValidation[] = [true, 'reader', ['reader'], field];
export const advancedGrammar: AdvancedFieldValidation[] = fieldGrammar;
export const fields: FieldOperationAccess = {
  read: field,
  update: (permissions, grants) => permissions.has('editor') && !grants.suspended,
};
export const schema: PermissionSchema = { salary: fields, name: field };

export const guard: GuardHook = function (permissions) {
  const request: AccessRouterRequest = this;
  return request.get('x-actor') !== undefined && permissions.has('reader');
};
export const advancedGuard: AdvancedGuard = guard;
export const guardArity: Parameters<GuardHook>['length'] = 1;
export const validation: Validation = guard;
export const operations: OperationAccess = {
  read: { default: guard, basic: guard },
  subs: { children: { read: guard } },
};

export const docPermissions: ModelDocPermissionsHook = async function (doc, permissions, context) {
  const request: ModelRequest = this;
  const previous: DocumentGrants | undefined = context.docPermissions;
  return {
    owner: !!doc && typeof doc === 'object' && 'owner' in doc && doc.owner === request.get('x-actor'),
    suspended: permissions.has('suspended') || previous?.suspended === true,
  };
};

export const options: ModelRouterOptions<{ salary: number; name: string }> = {
  readAuthorizationMode: 'isolated',
  listAuthorizationMode: 'trusted',
  modelPermissionPrefix: 'doc:',
  docPermissions: { read: docPermissions },
  permissionSchema: {
    salary: { read: field },
    name: (permissions, grants) => permissions.has('reader') || grants.owner === true,
  },
  operationAccess: { read: guard },
};

export const decorate: ModelOutputHook = (doc, _permissions, context) => {
  const diagnostic: ModelOutputContext = context;
  const facts: DocumentGrants = diagnostic.docPermissions;
  const scope: readonly string[] = diagnostic.scopePath;
  const paths: readonly string[] | undefined = diagnostic.resolvedQuery?.populate;
  void [facts, scope, paths];
  return doc;
};
export const decorateAll: ModelOutputListHook = (docs, _permissions, context) => {
  const diagnostic: ModelOutputContext = context;
  void diagnostic;
  return docs;
};
export function consumeOutput(context: ServiceOutputContext): ModelOutputContext {
  return context;
}
