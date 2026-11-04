/** Compiled separately and required to fail; never part of positive consumer sources. */
import type {
  DocumentAuthorization,
  ModelRouterOptions,
  DefaultModelRouterOptions,
  GlobalOptions,
  ModelOutputContext,
  OutputFieldOptions,
  ServiceAuthorization,
} from '@web-ts-toolkit/access-router';
import type {
  AdvancedCreateBody,
  AdvancedUpdateBody,
  CreateOptions,
  FindOptions,
  ModelRequest,
  Populate,
  UpdateOneOptions,
} from '@web-ts-toolkit/access-router/advanced';
const retired1: ModelRouterOptions = { unsafeSkipListDocumentSnapshotChecks: undefined };
const retired2: ModelRouterOptions = { unsafeSkipReadDocumentSnapshotChecks: false };
const retired3: ModelRouterOptions = { unsafeSkipListOutputSnapshotChecks: true };
const retired4: ModelRouterOptions = { unsafeSkipReadOutputSnapshotChecks: true };
const retired5: DefaultModelRouterOptions = { unsafeSkipListNestedDocumentSnapshotChecks: true };
const retired6: DefaultModelRouterOptions = { unsafeSkipReadNestedDocumentSnapshotChecks: true };
const retired7: DefaultModelRouterOptions = { unsafeSkipListInitialOutputSnapshotCopy: true };
const retired8: DefaultModelRouterOptions = { unsafeSkipReadInitialOutputSnapshotCopy: true };
const retired9: ModelRouterOptions = { unsafeUseListAuthorizationFastPath: true };
const retired10: DefaultModelRouterOptions = { unsafeUseReadAuthorizationFastPath: true };
const invalidModel: ModelRouterOptions = { readAuthorizationMode: true };
const invalidDefault: DefaultModelRouterOptions = { listAuthorizationMode: 'true' };
const invalidGlobal: GlobalOptions = { readAuthorizationMode: 'trusted' };
const perCall: FindOptions = { listAuthorizationMode: 'trusted' };
const helper: OutputFieldOptions = { readAuthorizationMode: 'trusted' };
const policy: ServiceAuthorization = { readAuthorizationMode: 'trusted' };
const populate: Populate = { path: 'contacts', listAuthorizationMode: 'trusted' };
const invalidCreate: ModelRouterOptions = { createAuthorizationMode: false };
const invalidUpdate: DefaultModelRouterOptions = { updateAuthorizationMode: 'TRUSTED' };
const createCall: CreateOptions = { createAuthorizationMode: 'trusted' };
const updateCall: UpdateOneOptions = { updateAuthorizationMode: 'trusted' };
const createWire: AdvancedCreateBody = { options: { createAuthorizationMode: 'trusted' } };
const updateWire: AdvancedUpdateBody = { options: { updateAuthorizationMode: 'trusted' } };
const writeGlobal: GlobalOptions = { updateAuthorizationMode: 'trusted' };
const writeHelper: OutputFieldOptions = { createAuthorizationMode: 'trusted' };
const writePolicy: ServiceAuthorization = { updateAuthorizationMode: 'trusted' };
const writePopulate: Populate = { path: 'contacts', createAuthorizationMode: 'trusted' };
const rich: ModelRouterOptions = { docPermissions: () => ({ membership: { owner: true } }) };
declare const context: ModelOutputContext;
context.currentDocument;
context.mongooseModel;
context.originalDocumentSnapshot;
context.finalDocumentSnapshot;
context.originalData;
context.allowedData;
context.preparedData;
context.allowedFields;
context.modifiedPaths;
context.changes;
context.resolvedQuery?.filter;
context.documentAuthorization;
context.getDocumentAuthorization({});
const oldHelper: OutputFieldOptions = { documentAuthorization: context };
declare const req: ModelRequest;
req.macl.getService('Employee').defaults.findOptions = { listAuthorizationMode: 'trusted' };
req.macl.getService('Employee').defaults.publicReadOptions = { readAuthorizationMode: 'trusted' };
req.macl.getService('Employee').find({}, {}, { listAuthorizationMode: 'trusted' });
req.macl.getService('Employee').findOne({}, {}, { readAuthorizationMode: 'trusted' });
req.macl.getService('Employee').findById('employee', {}, { readAuthorizationMode: 'trusted' });
req.macl.getService('Employee').create({}, {}, { createAuthorizationMode: 'trusted' });
req.macl.getService('Employee').updateOne({}, {}, {}, { updateAuthorizationMode: 'trusted' });
req.macl.getService('Employee').upsert({}, {}, {}, { createAuthorizationMode: 'trusted' });
req.macl.getService('Employee').defaults.createOptions = { createAuthorizationMode: 'trusted' };
req.macl.getService('Employee').defaults.updateOneOptions = { updateAuthorizationMode: 'trusted' };
req.macl.getService('Employee').readSub('parent', 'contacts', 'child', { readAuthorizationMode: 'trusted' });
req.macl.getService('Employee').pickAllowedFields({}, 'read', { readAuthorizationMode: 'trusted' });
req.macl.getService('Employee').find({}, {}, { unsafeUseListAuthorizationFastPath: false });
req.macl.getService('Employee').findOne({}, {}, { unsafeSkipReadDocumentSnapshotChecks: undefined });
req.macl.getService('Employee').pickAllowedFields({}, 'read', { documentAuthorization: context });
req.macl.getService('Employee').trimOutputFields({}, 'read', { documentAuthorization: context, scopePath: [] });
void [
  retired1,
  retired2,
  retired3,
  retired4,
  retired5,
  retired6,
  retired7,
  retired8,
  retired9,
  retired10,
  invalidModel,
  invalidDefault,
  invalidGlobal,
  perCall,
  helper,
  policy,
  populate,
  invalidCreate,
  invalidUpdate,
  createCall,
  updateCall,
  createWire,
  updateWire,
  writeGlobal,
  writeHelper,
  writePolicy,
  writePopulate,
  rich,
  oldHelper,
];
export type OldHandle = DocumentAuthorization;
