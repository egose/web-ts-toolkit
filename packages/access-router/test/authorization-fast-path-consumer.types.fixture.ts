/** Installed package-only FP-04 contract; the flags are configuration, never call/handle authority. */
import acl, {
  createAccessRuntime,
  setModelOption,
  setDefaultModelOption,
  type DefaultModelRouterOptions,
  type ModelRouterOptions,
  type DocumentAuthorization,
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
  DocumentAuthorization as AdvancedHandle,
  ServiceOutputContext as AdvancedContext,
  ModelRequest,
  PublicListOptions,
  PublicReadOptions,
  SubdocumentReadOptions,
  Populate,
} from '@web-ts-toolkit/access-router/advanced';
import mongoose from 'mongoose';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Flags = { unsafeUseListAuthorizationFastPath?: boolean; unsafeUseReadAuthorizationFastPath?: boolean };
type Flag = keyof Flags;
export type FastPathConsumerContract = [
  Assert<Equal<Pick<DefaultModelRouterOptions, Flag>, Flags>>,
  Assert<Equal<Pick<ModelRouterOptions, Flag>, Flags>>,
  Assert<Equal<Pick<AdvancedDefaults, Flag>, Flags>>,
  Assert<Equal<Pick<AdvancedModel, Flag>, Flags>>,
  Assert<Equal<Pick<ExtendedDefaultModelRouterOptions, Flag>, Flags>>,
  Assert<Equal<Pick<ExtendedModelRouterOptions, Flag>, Flags>>,
  Assert<Equal<Extract<Flag, keyof GlobalOptions>, never>>,
  Assert<Equal<Extract<Flag, keyof RootRouterOptions>, never>>,
  Assert<Equal<Extract<Flag, keyof DataRouterOptions>, never>>,
  Assert<Equal<Extract<Flag, keyof PublicListOptions>, never>>,
  Assert<Equal<Extract<Flag, keyof PublicReadOptions>, never>>,
  Assert<Equal<Extract<Flag, keyof SubdocumentReadOptions>, never>>,
  Assert<Equal<Extract<Flag, keyof ServiceAuthorization>, never>>,
  Assert<Equal<DocumentAuthorization, AdvancedHandle>>,
  Assert<Equal<ServiceOutputContext, AdvancedContext>>,
  Assert<Equal<Extract<keyof DocumentAuthorization, string>, never>>,
];

type Row = { name: string; contacts: { email: string }[]; unsafeUseListAuthorizationFastPath?: boolean };
const api = createAccessRuntime();
const Model = mongoose.model<Row>(
  'FastPathTypeConsumer',
  new mongoose.Schema<Row>({
    name: String,
    contacts: [{ email: String }],
    unsafeUseListAuthorizationFastPath: Boolean,
  }),
);
const router = api.createRouter(Model, {
  operationAccess: { list: true, read: true },
  permissionSchema: { name: true },
  unsafeSkipListDocumentSnapshotChecks: true,
  unsafeSkipListOutputSnapshotChecks: true,
  unsafeSkipListNestedDocumentSnapshotChecks: true,
  unsafeSkipListInitialOutputSnapshotCopy: true,
  unsafeUseListAuthorizationFastPath: true,
});
for (const key of ['unsafeUseListAuthorizationFastPath', 'unsafeUseReadAuthorizationFastPath'] as const) {
  for (const value of [true, false, undefined]) {
    api.setModelOption(Model.modelName, key, value);
    api.runtime.setModelOption(Model.modelName, key, value);
    router.setOption(key, value).set(key, value);
    api.setDefaultModelOption(key, value);
    acl.setModelOption(Model.modelName, key, value);
    setModelOption(Model.modelName, key, value);
    setDefaultModelOption(key, value);
    const effective: boolean | undefined = api.getModelOption(Model.modelName, key);
    void effective;
  }
}
api.setDefaultModelOptions({ unsafeUseReadAuthorizationFastPath: false });
api.setModelOptions(Model.modelName, { unsafeUseListAuthorizationFastPath: undefined });
declare const request: ModelRequest;
declare const context: ServiceOutputContext;
const service = router.getService(request);
const handle: DocumentAuthorization = context.documentAuthorization;
const lookup: DocumentAuthorization | undefined = context.getDocumentAuthorization({});
void service.find({ unsafeUseListAuthorizationFastPath: true }); // same-named business filter is data
void service.pickAllowedFields({ name: 'Ada' }, 'list', { documentAuthorization: handle });

// @ts-expect-error optional boolean is not a truthy/string setting
const invalidModel: ModelRouterOptions = { unsafeUseListAuthorizationFastPath: 'true' };
// @ts-expect-error optional boolean is not a numeric setting
const invalidDefault: DefaultModelRouterOptions = { unsafeUseReadAuthorizationFastPath: 1 };
// @ts-expect-error global configuration cannot select this model-only mode
api.setGlobalOption('unsafeUseListAuthorizationFastPath', true);
// @ts-expect-error per-call LIST controls cannot select the fast path
void service.find({}, {}, { unsafeUseListAuthorizationFastPath: true });
// @ts-expect-error per-call READ controls cannot select the fast path
void service.findOne({}, {}, { unsafeUseReadAuthorizationFastPath: true });
// @ts-expect-error named helpers accept policy or an opaque handle, never a mode selector
void service.pickAllowedFields({}, 'read', { unsafeUseReadAuthorizationFastPath: true });
// @ts-expect-error method defaults are not server configuration
service.defaults.publicListOptions = { unsafeUseListAuthorizationFastPath: true };
// @ts-expect-error policy is not fast-path configuration
const invalidPolicy: ServiceAuthorization = { unsafeUseReadAuthorizationFastPath: true };
// @ts-expect-error populate control slots cannot select an origin mode
const invalidPopulate: Populate = { path: 'contacts', unsafeUseListAuthorizationFastPath: true };
// @ts-expect-error dedicated subdocument methods do not accept fast-path flags
void service.readSub('parent', 'contacts', 'child', { unsafeUseReadAuthorizationFastPath: true });
// @ts-expect-error an empty object cannot manufacture the package-issued opaque handle
const forged: DocumentAuthorization = {};
// @ts-expect-error handle contains no public mode, snapshot, issuer or graph certificate
handle.unsafeUseListAuthorizationFastPath;
// @ts-expect-error private capture types are not shipped public exports
import type { AuthorizationFastPathCapture } from '@web-ts-toolkit/access-router';
// @ts-expect-error private trusted source types are not advanced exports
import type { QueryAuthorizationSource } from '@web-ts-toolkit/access-router/advanced';
// @ts-expect-error no public trusted output issuer
import { createTrustedOutputBudget } from '@web-ts-toolkit/access-router';
// @ts-expect-error no public captured-mode reader
import { readAuthorizationFastPath } from '@web-ts-toolkit/access-router/advanced';
void [
  lookup,
  invalidModel,
  invalidDefault,
  invalidPolicy,
  invalidPopulate,
  forged,
  createTrustedOutputBudget,
  readAuthorizationFastPath,
];
export type PrivateImportsRemainInvalid = [AuthorizationFastPathCapture, QueryAuthorizationSource];
