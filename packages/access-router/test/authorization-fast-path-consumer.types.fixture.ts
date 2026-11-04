/** Installed four-operation contract; historical filename retained for consumer-matrix continuity. */
import acl, {
  createAccessRuntime,
  setModelOption,
  setDefaultModelOption,
  type AuthorizationMode,
  type DefaultModelRouterOptions,
  type ModelRouterOptions,
  type ModelOutputContext,
  type ServiceOutputContext,
  type ServiceAuthorization,
  type GlobalOptions,
  type RootRouterOptions,
  type DataRouterOptions,
} from '@web-ts-toolkit/access-router';
import type {
  DefaultModelRouterOptions as AdvancedDefaults,
  AuthorizationMode as AdvancedMode,
  ModelRouterOptions as AdvancedModel,
  ExtendedDefaultModelRouterOptions,
  ExtendedModelRouterOptions,
  ModelOutputContext as AdvancedContext,
  ModelRequest,
  PublicListOptions,
  PublicReadOptions,
  PublicCreateOptions,
  PublicUpdateOptions,
  CreateOptions,
  UpdateOneOptions,
  UpsertOptions,
  AdvancedCreateBody,
  AdvancedUpdateBody,
  SubdocumentReadOptions,
  Populate,
} from '@web-ts-toolkit/access-router/advanced';
import mongoose from 'mongoose';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Modes = {
  readAuthorizationMode?: AuthorizationMode;
  listAuthorizationMode?: AuthorizationMode;
  createAuthorizationMode?: AuthorizationMode;
  updateAuthorizationMode?: AuthorizationMode;
};
type Mode = keyof Modes;
export type OwnedModeConsumerContract = [
  Assert<Equal<AuthorizationMode, 'isolated' | 'trusted'>>,
  Assert<Equal<AuthorizationMode, AdvancedMode>>,
  Assert<Equal<Pick<DefaultModelRouterOptions, Mode>, Modes>>,
  Assert<Equal<Pick<ModelRouterOptions, Mode>, Modes>>,
  Assert<Equal<Pick<AdvancedDefaults, Mode>, Modes>>,
  Assert<Equal<Pick<AdvancedModel, Mode>, Modes>>,
  Assert<Equal<Pick<ExtendedDefaultModelRouterOptions, Mode>, Modes>>,
  Assert<Equal<Pick<ExtendedModelRouterOptions, Mode>, Modes>>,
  Assert<Equal<Extract<Mode, keyof GlobalOptions>, never>>,
  Assert<Equal<Extract<Mode, keyof RootRouterOptions>, never>>,
  Assert<Equal<Extract<Mode, keyof DataRouterOptions>, never>>,
  Assert<Equal<Extract<Mode, keyof PublicListOptions>, never>>,
  Assert<Equal<Extract<Mode, keyof PublicReadOptions>, never>>,
  Assert<Equal<Extract<Mode, keyof PublicCreateOptions>, never>>,
  Assert<Equal<Extract<Mode, keyof PublicUpdateOptions>, never>>,
  Assert<Equal<Extract<Mode, keyof CreateOptions>, never>>,
  Assert<Equal<Extract<Mode, keyof UpdateOneOptions>, never>>,
  Assert<Equal<Extract<Mode, keyof UpsertOptions>, never>>,
  Assert<Equal<Extract<Mode, keyof AdvancedCreateBody>, never>>,
  Assert<Equal<Extract<Mode, keyof AdvancedUpdateBody>, never>>,
  Assert<Equal<Extract<Mode, keyof SubdocumentReadOptions>, never>>,
  Assert<Equal<Extract<Mode, keyof ServiceAuthorization>, never>>,
  Assert<Equal<Extract<Mode, keyof Populate>, never>>,
  Assert<Equal<ModelOutputContext, AdvancedContext>>,
  Assert<Equal<ServiceOutputContext, AdvancedContext>>,
];

type Row = { name: string; contacts: { email: string }[]; readAuthorizationMode?: string };
const api = createAccessRuntime();
const Model = mongoose.model<Row>(
  'OwnedModeTypeConsumer',
  new mongoose.Schema<Row>({ name: String, contacts: [{ email: String }], readAuthorizationMode: String }),
);
const router = api.createRouter(Model, {
  operationAccess: { list: true, read: true },
  permissionSchema: { name: true },
  readAuthorizationMode: 'isolated',
  listAuthorizationMode: 'trusted',
  createAuthorizationMode: 'isolated',
  updateAuthorizationMode: 'trusted',
});
for (const key of [
  'readAuthorizationMode',
  'listAuthorizationMode',
  'createAuthorizationMode',
  'updateAuthorizationMode',
] as const) {
  for (const value of ['isolated', 'trusted', undefined] as const) {
    api.setModelOption(Model.modelName, key, value);
    api.runtime.setModelOption(Model.modelName, key, value);
    router.setOption(key, value).set(key, value);
    api.setDefaultModelOption(key, value);
    acl.setModelOption(Model.modelName, key, value);
    setModelOption(Model.modelName, key, value);
    setDefaultModelOption(key, value);
    const effective: AuthorizationMode | undefined = api.getModelOption(Model.modelName, key);
    void effective;
  }
}
api.setDefaultModelOptions({ readAuthorizationMode: 'isolated' });
api.setModelOptions(Model.modelName, { listAuthorizationMode: undefined });
api.setDefaultModelOptions({ createAuthorizationMode: 'trusted', updateAuthorizationMode: 'isolated' });
api.setModelOptions(Model.modelName, { createAuthorizationMode: undefined, updateAuthorizationMode: 'trusted' });
// @ts-expect-error CREATE mode remains a literal enum, not a boolean switch
api.setModelOption(Model.modelName, 'createAuthorizationMode', true);
// @ts-expect-error UPDATE defaults use the same literal enum
api.setDefaultModelOptions({ updateAuthorizationMode: 'TRUSTED' });
// @ts-expect-error fluent setters retain the exact optional union
router.set('updateAuthorizationMode', false);
declare const request: ModelRequest;
declare const context: ServiceOutputContext;
const service = router.getService(request);
void service.find({ readAuthorizationMode: 'ordinary business data' });
void service.pickAllowedFields({ name: 'Ada' }, 'list');
// @ts-expect-error write modes are not per-call selectors
void service.create({}, {}, { createAuthorizationMode: 'trusted' });
// @ts-expect-error write modes are not method defaults
service.defaults = { updateOneOptions: { updateAuthorizationMode: 'trusted' } };
void [context.modelName, context.docPermissions, context.resolvedQuery?.select];

// @ts-expect-error private capture types are not shipped public exports
import type { AuthorizationFastPathCapture } from '@web-ts-toolkit/access-router';
// @ts-expect-error private source types are not advanced exports
import type { QueryAuthorizationSource } from '@web-ts-toolkit/access-router/advanced';
// @ts-expect-error no public output issuer
import { createTrustedOutputBudget } from '@web-ts-toolkit/access-router';
// @ts-expect-error no public captured-mode reader
import { readAuthorizationFastPath } from '@web-ts-toolkit/access-router/advanced';
void [createTrustedOutputBudget, readAuthorizationFastPath];
export type PrivateImportsRemainInvalid = [AuthorizationFastPathCapture, QueryAuthorizationSource];
