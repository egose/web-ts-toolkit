/** Installed OAR-08 contract; historical filename retained for consumer-matrix continuity. */
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
  ModelRouterOptions as AdvancedModel,
  ExtendedDefaultModelRouterOptions,
  ExtendedModelRouterOptions,
  ModelOutputContext as AdvancedContext,
  ModelRequest,
  PublicListOptions,
  PublicReadOptions,
  SubdocumentReadOptions,
  Populate,
} from '@web-ts-toolkit/access-router/advanced';
import mongoose from 'mongoose';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Modes = { readAuthorizationMode?: AuthorizationMode; listAuthorizationMode?: AuthorizationMode };
type Mode = keyof Modes;
export type OwnedModeConsumerContract = [
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
});
for (const key of ['listAuthorizationMode', 'readAuthorizationMode'] as const) {
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
declare const request: ModelRequest;
declare const context: ServiceOutputContext;
const service = router.getService(request);
void service.find({ readAuthorizationMode: 'ordinary business data' });
void service.pickAllowedFields({ name: 'Ada' }, 'list');
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
