/** SVA-10: compiled from installed package names in Bundler, NodeNext ESM and CJS. */
import type {
  AllowedOutputFieldOptions,
  AuthorizedListResult,
  AuthorizedSingleResult,
  CreateAuthorization,
  DocumentAuthorization,
  FieldAuthorization,
  InputFieldAuthorization,
  InputFieldPath,
  MutationAuthorization,
  ModelRouter,
  ModelRouterOptions,
  NewOptions,
  OperationAuthorization,
  OutputAuthorization,
  OutputFieldOptions,
  OutputFieldPath,
  OutputPlanningOptions,
  RelatedAuthorization,
  RowAuthorization,
  ServiceAuthorization,
  ServiceOutputContext,
  ServiceOutputDecorator,
  VirtualSubModel,
  SubdocumentReadAuthorization,
  SubdocumentMutationAuthorization,
  SubdocumentCreateAuthorization,
  SubdocumentDeleteAuthorization,
  SubdocumentVisibilityAuthorization,
  SubdocumentCreateVisibilityAuthorization,
  SubdocumentModel,
  SubdocumentName,
} from '@web-ts-toolkit/access-router';
import type {
  AdvancedCreateBody,
  AdvancedListBody,
  AdvancedReadBody,
  AdvancedReadFilterBody,
  AdvancedUpdateBody,
  AdvancedUpsertBody,
  CreateOptions,
  Defaults,
  FindByIdOptions,
  FindOneOptions,
  FindOptions,
  ModelRequest,
  OutputFieldPath as AdvancedOutputFieldPath,
  ServiceAuthorization as AdvancedServiceAuthorization,
  InputFieldPath as AdvancedInputFieldPath,
  MutationAuthorization as AdvancedMutationAuthorization,
  DocumentAuthorization as AdvancedDocumentAuthorization,
  PublicCreateOptions,
  PublicListOptions,
  PublicReadOptions,
  PublicUpdateOptions,
  PublicUpsertOptions,
  RootQueryEntry,
  SelectedPublicOutput,
  PublicSubdocumentCreateOptions,
  PublicSubdocumentListOptions,
  PublicSubdocumentReadOptions,
  PublicSubdocumentMutationOptions,
  SubdocumentReadAuthorization as AdvancedSubdocumentReadAuthorization,
  SubdocumentUpdateOptions,
  UpdateByIdOptions,
  UpdateOneOptions,
  UpsertOptions,
} from '@web-ts-toolkit/access-router/advanced';

interface Order {
  status?: string;
  internalNote?: string;
  tenantId: string;
  contacts?: readonly { email: string; ssn: string }[] | null;
}
interface Virtuals {
  summary: string;
  contacts: readonly (VirtualSubModel<Order, 'contacts'> & { badge: string })[];
}
type Assert<T extends true> = T;
type Equal<A, B> = [A, B] extends [B, A] ? true : false;
export type EntryParity = Assert<
  Equal<ServiceAuthorization<Order, Virtuals>, AdvancedServiceAuthorization<Order, Virtuals>>
>;
export type PathParity = Assert<Equal<OutputFieldPath<Order, Virtuals>, AdvancedOutputFieldPath<Order, Virtuals>>>;
export type HandleParity = Assert<Equal<DocumentAuthorization, AdvancedDocumentAuthorization>>;
export type InputPathParity = Assert<Equal<InputFieldPath<Order>, AdvancedInputFieldPath<Order>>>;
export type MutationParity = Assert<
  Equal<MutationAuthorization<Order, Virtuals>, AdvancedMutationAuthorization<Order, Virtuals>>
>;
export type SubdocumentParity = Assert<
  Equal<SubdocumentReadAuthorization<Order>, AdvancedSubdocumentReadAuthorization<Order>>
>;
type Contact = SubdocumentModel<Order, 'contacts'>;
export type SubdocumentInference = Assert<Equal<Contact, { email: string; ssn: string }>>;
export type EmptyPublicSubMutation = Assert<Equal<PublicSubdocumentMutationOptions['authorization'], never>>;
const subName: SubdocumentName<Order> = 'contacts';
// @ts-expect-error scalar model fields are not embedded arrays
const badSubName: SubdocumentName<Order> = 'tenantId';
const subRead = {
  parent: { operation: { mode: 'grant' }, rows: { mode: 'scope', filter: { tenantId: 'a' } } },
  child: {
    rows: { mode: 'scope', filter: { email: 'a@example.test' } },
    outputFields: { mode: 'grant', paths: ['email', 'badge'] },
  },
} as const satisfies SubdocumentReadAuthorization<Order, Contact, { badge: string }>;
const subVisibility: SubdocumentVisibilityAuthorization<Order, Contact, { badge: string }> = {
  parent: subRead.parent,
  child: subRead.child,
};
const subCreateVisibility: SubdocumentCreateVisibilityAuthorization<Order, Contact, { badge: string }> = {
  ...subVisibility,
  list: { operation: { mode: 'grant' }, rows: { mode: 'unrestricted' } },
};
const subMutation: SubdocumentMutationAuthorization<Order, Contact, { badge: string }> = {
  parent: subRead.parent,
  child: { inputFields: { mode: 'grant', paths: ['email'] } },
  visibility: subVisibility,
};
const subCreate: SubdocumentCreateAuthorization<Order, Contact, { badge: string }> = {
  child: { inputFields: { mode: 'unrestricted' } },
  visibility: subCreateVisibility,
};
const subDelete: SubdocumentDeleteAuthorization<Order, Contact> = {
  parent: subRead.parent,
  child: { operation: { mode: 'grant' } },
};
// @ts-expect-error parent fields are inapplicable to a dedicated child operation
const badSubParent: SubdocumentReadAuthorization<Order> = { parent: { outputFields: { mode: 'request' } } };
// @ts-expect-error create has no existing-child lookup scope
const badSubCreate: SubdocumentCreateAuthorization<Order, Contact> = { child: { rows: { mode: 'request' } } };
// @ts-expect-error update/bulk visibility cannot grant child list (create alone uses it)
const badSubVisibility: SubdocumentVisibilityAuthorization = { list: { operation: { mode: 'grant' } } };
// @ts-expect-error no fields or visibility on deletion, including pretyped mutation policies
const badSubDelete: SubdocumentDeleteAuthorization<Order, Contact> = subMutation;
// @ts-expect-error mutation writes/visibility cannot be forwarded as read policy
const badSubRead: SubdocumentReadAuthorization<Order, Contact> = subMutation;

const paths = [
  'internalNote',
  'summary',
  'contacts.email',
  'contacts.badge',
] as const satisfies readonly OutputFieldPath<Order, Virtuals>[];
const fieldGrant: FieldAuthorization<OutputFieldPath<Order, Virtuals>> = { mode: 'grant', paths };
const output = { outputFields: fieldGrant } satisfies OutputAuthorization<Order, Virtuals>;
const related: RelatedAuthorization = {
  model: 'Customer',
  operation: { mode: 'grant' },
  rows: { mode: 'scope', filter: { tenantId: 'a' } },
  outputFields: { mode: 'grant', paths: ['billingEmail'] },
  related: { manager: { model: 'User', outputFields: { mode: 'request' } } },
};
const policy: ServiceAuthorization<Order, Virtuals> = {
  ...output,
  rows: { mode: 'scope', filter: { tenantId: 'a', 'contacts.email': 'a@example.test' } },
  related: { customer: related },
};
const inputPaths = ['internalNote', 'contacts.email'] as const satisfies readonly InputFieldPath<Order>[];
const inputFields: InputFieldAuthorization<Order> = { mode: 'grant', paths: inputPaths };
const mutation: MutationAuthorization<Order, Virtuals> = { ...policy, inputFields };
const create: CreateAuthorization<Order, Virtuals> = { ...output, inputFields, related: { customer: related } };
const unknownInput: InputFieldAuthorization = { mode: 'grant', paths: ['dynamic.path'] };
const anyInput: InputFieldAuthorization<any> = unknownInput;
const mapInput: InputFieldPath<{ labels: Map<string, { email: string }> }> = 'labels.work.email';
const mixedInput: InputFieldPath<{ payload: unknown }> = 'payload.business.name';
// @ts-expect-error BSON implementation properties are not persisted descendants
const bsonInput: InputFieldPath<{ ref: import('mongoose').Types.ObjectId }> = 'ref.toHexString';
// @ts-expect-error Date implementation methods are not persisted paths
const dateInput: InputFieldPath<{ createdAt: Date }> = 'createdAt.getTime';
const planning: OutputPlanningOptions<Order, Virtuals> = { authorization: output, scopePath: ['contacts'] as const };
const unknownPolicy: ServiceAuthorization = { outputFields: { mode: 'grant', paths: ['dynamic.path'] } };
const anyPolicy: ServiceAuthorization<any> = unknownPolicy;
const indexedPolicy: ServiceAuthorization<Record<string, unknown>> = unknownPolicy;
const empty: FieldAuthorization = { mode: 'grant', paths: [] as const };
const modes: readonly RowAuthorization<Order>[] = [
  { mode: 'request' },
  { mode: 'unrestricted' },
  { mode: 'scope', filter: {} },
  { mode: 'scope', filter: false },
];
const operation: OperationAuthorization = { mode: 'request' };
const projectedHooks: ModelRouterOptions<Order, Virtuals> = {
  alwaysSelectFields: { default: ['tenantId'], read: ['tenantId', 'status'] },
};

interface Recursive {
  value: string;
  child?: Recursive;
}
const bounded: OutputFieldPath<Recursive> = 'child.child.child.child.value';
// @ts-expect-error bounded paths do not recursively widen to string
const tooDeep: OutputFieldPath<Recursive> = 'child.child.child.child.child.value';
// @ts-expect-error known models reject misspelled paths
const badPath: OutputFieldPath<Order, Virtuals> = 'contacts.emali';
// @ts-expect-error grant paths are response paths, not permission-definition paths
const definitionPath: OutputFieldPath<Order, Virtuals> = 'contacts.sub.email';
// @ts-expect-error selection tokens are not grant paths
const signedPath: OutputFieldPath<Order> = '-internalNote';
// @ts-expect-error arrays use ordinary child paths without numeric indices
const indexedPath: OutputFieldPath<Order> = 'contacts.0.email';
// @ts-expect-error wildcard grants are unsupported
const wildcard: OutputFieldPath<Order> = 'contacts.*';
// @ts-expect-error persisted row filters never gain virtual fields
const virtualFilter: RowAuthorization<Order> = { mode: 'scope', filter: { summary: 'x' } };
// @ts-expect-error typed row predicates retain persisted leaf types
const badFilter: RowAuthorization<Order> = { mode: 'scope', filter: { tenantId: 1 } };
// @ts-expect-error readonly path tuples are not mutable authority
fieldGrant.paths.push('status');
// @ts-expect-error readonly policy fields cannot be reassigned
policy.outputFields = { mode: 'unrestricted' };
// @ts-expect-error no boolean shorthand
const booleanPolicy: ServiceAuthorization = true;
// @ts-expect-error no string shorthand
const stringPolicy: ServiceAuthorization = 'unrestricted';
// @ts-expect-error no unknown field mode
const fieldMode: FieldAuthorization = { mode: 'scope', filter: {} };
// @ts-expect-error grant mode requires paths
const missingPaths: FieldAuthorization = { mode: 'grant' };
// @ts-expect-error paths must be an array
const scalarPaths: FieldAuthorization = { mode: 'grant', paths: 'internalNote' };
// @ts-expect-error no unknown row mode
const rowMode: RowAuthorization = { mode: 'grant' };
// @ts-expect-error scope requires an explicit predicate
const missingScope: RowAuthorization = { mode: 'scope' };
// @ts-expect-error null is not request fallback
const nullScope: RowAuthorization = { mode: 'scope', filter: null };
// @ts-expect-error undefined is not request fallback
const undefinedScope: RowAuthorization = { mode: 'scope', filter: undefined };
// @ts-expect-error related operation has no unrestricted mode
const operationMode: OperationAuthorization = { mode: 'unrestricted' };

// Known wrong-variant keys also reject on reusable, non-literal inputs.
const requestWithPaths = { mode: 'request', paths } as const;
const unrestrictedWithPaths = { mode: 'unrestricted', paths } as const;
const requestWithFilter = { mode: 'request', filter: {} } as const;
const unrestrictedWithFilter = { mode: 'unrestricted', filter: {} } as const;
// @ts-expect-error request mode cannot carry grant paths
const badRequestFields: FieldAuthorization = requestWithPaths;
// @ts-expect-error unrestricted mode cannot carry grant paths
const badUnrestrictedFields: FieldAuthorization = unrestrictedWithPaths;
// @ts-expect-error request mode cannot carry a trusted scope
const badRequestRows: RowAuthorization = requestWithFilter;
// @ts-expect-error unrestricted mode cannot carry a trusted scope
const badUnrestrictedRows: RowAuthorization = unrestrictedWithFilter;
// @ts-expect-error output-only helpers cannot accept a reusable full call policy
const broadOutput: OutputAuthorization<Order, Virtuals> = policy;
// @ts-expect-error create has no existing-row scope, including from reusable policies
const broadCreate: CreateAuthorization<Order, Virtuals> = policy;
// @ts-expect-error reads cannot accept mutation-only input authority
const inputPolicy: ServiceAuthorization = { inputFields: { mode: 'unrestricted' } };
// @ts-expect-error reusable mutation policies also reject on reads
const broadRead: ServiceAuthorization<Order, Virtuals> = mutation;
// @ts-expect-error a reusable create policy containing input authority cannot be used on reads
const createAsRead: FindOptions<Order, Virtuals> = { authorization: create };
// @ts-expect-error input grant paths never include registered output virtuals
const virtualInput: InputFieldPath<Order> = 'summary';
// @ts-expect-error embedded virtuals do not enter the persisted input shape
const embeddedVirtualInput: InputFieldPath<Order> = 'contacts.badge';
// @ts-expect-error input grants cannot address indices
const indexedInput: InputFieldPath<Order> = 'contacts.0.email';
// @ts-expect-error known persisted paths catch typos
const typoInput: InputFieldPath<Order> = 'internalNotes';
// @ts-expect-error identity is never elevatable even when present in the model type
const identityInput: InputFieldPath<{ _id: string; status: string }> = '_id';
// @ts-expect-error control metadata is never elevatable
const metadataInput: InputFieldPath<{ nested: { _permissions: object; status: string } }> = 'nested._permissions';
// @ts-expect-error input grant union rejects wrong-variant paths
const requestInput: InputFieldAuthorization = { mode: 'request', paths: [] };
// @ts-expect-error input paths are immutable
inputFields.paths.push('status');
// @ts-expect-error related read/count policies never accept mutation authority
const relatedInput: RelatedAuthorization = { model: 'Order', inputFields };
// @ts-expect-error dedicated policy is a separate method-specific shape, not a model-root tree
const subPolicy: ServiceAuthorization = { subdocuments: {} };
// @ts-expect-error initiating operation is private execution state
const topOperation: ServiceAuthorization = { operation: { mode: 'grant' } };
// @ts-expect-error target model is mandatory
const missingModel: RelatedAuthorization = { outputFields: empty };

export async function installedServiceCalls(req: ModelRequest, router: ModelRouter<Order, Virtuals>) {
  router.setOptions(projectedHooks);
  router.alwaysSelectFields({ read: ['status'], inspection: ['tenantId'] });
  router.setOption('alwaysSelectFields.read', ['status']);
  const service = router.getService(req);
  const sameModel = req.macl.getService<Order, Virtuals>('Order');
  await service.listSub('id', subName, { filter: { email: 'a@example.test' }, authorization: subRead });
  await service.readSub('id', 'contacts', 'child-id', { authorization: subRead });
  const subOptions: SubdocumentUpdateOptions<Order, Contact, { badge: string }> = { authorization: subMutation };
  await service.updateSub('id', 'contacts', 'child-id', { email: 'changed' }, subOptions);
  await service.bulkUpdateSub('id', 'contacts', [{ _id: 'child-id', email: 'changed' }], subOptions);
  await service.createSub('id', 'contacts', { email: 'created' }, { addFirst: true, authorization: subCreate });
  await service.deleteSub('id', 'contacts', 'child-id', { authorization: subDelete });
  // @ts-expect-error child output paths are inferred relative to contacts, not the parent model
  await service.readSub('id', 'contacts', 'child-id', {
    authorization: { child: { outputFields: { mode: 'grant', paths: ['contacts.email'] } } },
  });
  // @ts-expect-error virtual paths cannot become child input fields
  await service.updateSub(
    'id',
    'contacts',
    'child-id',
    {},
    { authorization: { child: { inputFields: { mode: 'grant', paths: ['badge'] } } } },
  );
  // @ts-expect-error unrelated parent input is outside the selected child
  await service.createSub(
    'id',
    'contacts',
    {},
    { authorization: { child: { inputFields: { mode: 'grant', paths: ['tenantId'] } } } },
  );
  // @ts-expect-error read methods reject input even if supplied by a reusable mutation policy
  await service.readSub('id', 'contacts', 'child-id', subOptions);
  // @ts-expect-error referenced targets have no dedicated related policy dimension
  await service.readSub('id', 'contacts', 'child-id', { authorization: { child: { related: {} } } });
  const publicSub = router.getPublicService(req);
  await publicSub.listSub('id', 'contacts', { select: ['email'] });
  await publicSub.readSub('id', 'contacts', 'child-id');
  await publicSub.createSub('id', 'contacts', { authorization: 'ordinary payload' }, { addFirst: true });
  await publicSub.updateSub('id', 'contacts', 'child-id', { overrides: 'ordinary payload' });
  // @ts-expect-error public dedicated list is request-only
  await publicSub.listSub('id', 'contacts', { authorization: subRead });
  // @ts-expect-error public dedicated read is request-only
  await publicSub.readSub('id', 'contacts', 'child-id', { authorization: subRead });
  // @ts-expect-error public dedicated create is request-only
  await publicSub.createSub('id', 'contacts', {}, { authorization: subCreate });
  // @ts-expect-error public dedicated update has no capability slot, including pretyped options
  await publicSub.updateSub('id', 'contacts', 'child-id', {}, subOptions);
  // @ts-expect-error public dedicated bulk update is request-only
  await publicSub.bulkUpdateSub('id', 'contacts', [], { authorization: subMutation });
  // @ts-expect-error public dedicated delete is request-only
  await publicSub.deleteSub('id', 'contacts', 'child-id', { authorization: subDelete });
  const options: [
    FindOptions<Order, Virtuals>,
    FindOneOptions<Order, Virtuals>,
    FindByIdOptions<Order, Virtuals>,
    UpdateOneOptions<Order, Virtuals>,
    UpdateByIdOptions<Order, Virtuals>,
    UpsertOptions<Order, Virtuals>,
  ] = [
    { authorization: policy },
    { authorization: policy },
    { authorization: policy },
    { authorization: mutation },
    { authorization: mutation },
    { authorization: mutation },
  ];
  const createOptions: CreateOptions<Order, Virtuals> = { authorization: create };
  const newOptions: NewOptions<Order, Virtuals> = { authorization: output, skim: true };
  const decorator: ServiceOutputDecorator = (doc, context) => {
    const handle: DocumentAuthorization = context.documentAuthorization;
    void handle;
    return doc;
  };
  const list = await service.find({}, { select: ['summary'] }, options[0], decorator);
  const single = await sameModel.findOne({}, { select: ['status', 'internalNote'] }, { authorization: output });
  await service.findById('id', {}, options[2]);
  await service.create({}, { select: ['status'] }, createOptions, decorator);
  await service.updateOne({}, {}, { select: 'status' }, options[3], decorator);
  await service.updateById('id', {}, { select: { status: 1 } }, options[4]);
  await service.upsert({}, {}, { select: [] }, options[5]);
  await service.create({ internalNote: 'backend' }, {}, { authorization: { inputFields: { mode: 'unrestricted' } } });
  // @ts-expect-error a reusable mutation policy is not a read capability
  await service.findOne({}, {}, { authorization: mutation });
  // @ts-expect-error input authority is unavailable even with update access on a read method
  await service.findOne({}, {}, { access: 'update', authorization: mutation });
  // @ts-expect-error templates cannot write
  await service.new({}, { authorization: { inputFields } });
  // @ts-expect-error output helpers cannot consume mutation policy even under update access
  await service.pickAllowedFields({}, 'update', { authorization: mutation });
  // @ts-expect-error output planning cannot consume input policy
  await service.genSelect('create', undefined, { authorization: { inputFields } });
  // @ts-expect-error public mutations reject internal authority
  await router.getPublicService(req)._create({}, {}, { authorization: create });
  await service.new({ select: ['-status'] }, newOptions); // select is historically ignored
  await service.genSelect('read', ['internalNote'], { authorization: output });
  await service.genQuerySelect('read', ['email', 'badge'], planning);
  await req.macl.genQuerySelect<Order, Virtuals>('Order', 'read', undefined, planning);
  await service.genAllowedFields({}, 'read', { authorization: output, purpose: 'output' });
  await service.pickAllowedFields({}, 'read', { authorization: output });
  if (single.success) {
    const result: AuthorizedSingleResult<Order> = single;
    const context: ServiceOutputContext = result.context;
    const handle = context.documentAuthorization;
    const reuse: OutputFieldOptions<Order, Virtuals> = { documentAuthorization: handle };
    const allowed: AllowedOutputFieldOptions<Order, Virtuals> = { ...reuse, purpose: 'output' };
    const picked = await service.pickAllowedFields(result.data, 'read', reuse);
    await service.trimOutputFields(picked, 'read', reuse);
    await service.genAllowedFields(picked, 'read', allowed);
    await req.macl.pickAllowedFields<Order, Order, Virtuals>('Order', picked, 'read', reuse);
    const lookup: DocumentAuthorization | undefined = context.getDocumentAuthorization(result.data);
    const note: string | undefined = result.data.internalNote;
    // @ts-expect-error a grant does not make an optional persisted value exist
    const requiredNote: string = result.data.internalNote;
    // @ts-expect-error raw policy and handle are mutually exclusive, including reusable values
    const mixed: OutputFieldOptions = { documentAuthorization: handle, authorization: output };
    // @ts-expect-error handle scope cannot be overridden
    await service.trimOutputFields(picked, 'read', { documentAuthorization: handle, scopePath: [] });
    // @ts-expect-error only one source of authority per helper call
    await service.pickAllowedFields(picked, 'read', { documentAuthorization: handle, authorization: output });
    void [lookup, note, requiredNote, mixed];
  }
  if (list.success) {
    const result: AuthorizedListResult<Order> = list;
    const context: ServiceOutputContext | undefined = result.contexts[0];
    // @ts-expect-error aligned output contexts are readonly
    result.contexts.push(context!);
  }
  // @ts-expect-error no structural handle constructor
  const forged: DocumentAuthorization = {};
  // @ts-expect-error no backend row authority for create
  await service.create({}, {}, { authorization: policy });
  // @ts-expect-error new has output authority only
  await service.new({}, { authorization: create });
  // @ts-expect-error named helper accepts output authority only, even in a variable
  await service.genAllowedFields({}, 'read', { authorization: policy, purpose: 'output' });
  // @ts-expect-error named output-field admission requires purpose
  await service.genAllowedFields({}, 'read', { authorization: output });
  // @ts-expect-error named options cannot carry positional bypasses
  await service.genSelect('read', undefined, { authorization: output, skipChecks: true });
  // @ts-expect-error named options cannot carry baseFields
  await service.pickAllowedFields({}, 'read', { authorization: output, baseFields: ['status'] });
  // @ts-expect-error public methods never accept backend authorization
  await router.getPublicService(req)._read('id', {}, { authorization: output });
  // @ts-expect-error standalone row-only helpers keep request-policy signatures
  await service.exists({}, { authorization: policy });
  // @ts-expect-error removed service overrides do not coexist with explicit policy
  await service.findOne({}, { overrides: {} }, { authorization: output });
  // @ts-expect-error no public prepared-query option
  await service.findOne({}, {}, { preparedQuery: {} });
  // @ts-expect-error no public execution option
  await service.findOne({}, {}, { execution: {} });
  // @ts-expect-error positional skipChecks/subPaths are removed in this breaking release
  await service.genSelect('create', undefined, false, ['contacts', 'sub']);
  // @ts-expect-error arbitrary baseFields are removed; use named output options
  await service.pickAllowedFields({}, 'read', ['status']);
  void forged;
}

type Wire =
  | AdvancedListBody
  | AdvancedReadBody
  | AdvancedReadFilterBody
  | AdvancedCreateBody
  | AdvancedUpdateBody
  | AdvancedUpsertBody;
type PublicOptions =
  | PublicListOptions
  | PublicReadOptions
  | PublicCreateOptions
  | PublicUpdateOptions
  | PublicUpsertOptions
  | PublicSubdocumentListOptions
  | PublicSubdocumentReadOptions
  | PublicSubdocumentCreateOptions;
type Controls = 'authorization' | 'overrides' | 'documentAuthorization' | 'execution' | 'preparedQuery' | 'operation';
type Keys<T> = T extends unknown ? keyof NonNullable<T> : never;
type OptionsOf<T> = T extends { options?: infer O } ? O : never;
export type NoWireAuthority = Assert<
  Equal<
    Extract<
      Keys<
        Wire | OptionsOf<Wire> | PublicOptions | RootQueryEntry | OptionsOf<RootQueryEntry> | Defaults[keyof Defaults]
      >,
      Controls
    >,
    never
  >
>;
// @ts-expect-error HTTP advanced bodies cannot express server capabilities
const wire: AdvancedListBody = { options: { authorization: output } };
const root: RootQueryEntry = {
  target: 'model',
  name: 'Order',
  op: 'read',
  id: 'id',
  // @ts-expect-error root batch model entries cannot express server capabilities
  options: { authorization: output },
};
// @ts-expect-error defaults cannot inherit server authority
const defaults: Defaults<Order> = { findOptions: { authorization: output } };
const optionalVirtual: SelectedPublicOutput<Order, ['summary'], Virtuals> = {};
// @ts-expect-error selected/granted virtuals can be omitted by the runtime
const requiredVirtual: { summary: string } = optionalVirtual;

// Neither the opaque consumer handle nor the documented service acquisition adds issuers.
// @ts-expect-error no standalone Service export
export type PrivateService = import('@web-ts-toolkit/access-router').Service;
// @ts-expect-error resolved call owners are private
export type PrivateCall = import('@web-ts-toolkit/access-router/advanced').ResolvedServiceAuthorization;
// @ts-expect-error execution owners are private
export type PrivateExecution = import('@web-ts-toolkit/access-router/advanced').ServiceExecutionContext;
// @ts-expect-error prepared tokens are private
export type PrivatePrepared = import('@web-ts-toolkit/access-router/advanced').PreparedModelQuery;
// @ts-expect-error document-handle issuers are private
export type PrivateIssuer = typeof import('@web-ts-toolkit/access-router').createDocumentAuthorizationStage;
// @ts-expect-error private executors are not advanced runtime exports
export type PrivateExecutor = typeof import('@web-ts-toolkit/access-router/advanced').executePreparedFind;
export type PrivateDeepImport =
  // @ts-expect-error the export map also blocks source deep imports
  import('@web-ts-toolkit/access-router/src/acl/service-authorization').ResolvedServiceAuthorization;

void [
  badSubName,
  badSubParent,
  badSubCreate,
  badSubVisibility,
  badSubDelete,
  badSubRead,
  anyInput,
  mapInput,
  mixedInput,
  bsonInput,
  dateInput,
  broadRead,
  createAsRead,
  virtualInput,
  embeddedVirtualInput,
  indexedInput,
  typoInput,
  identityInput,
  metadataInput,
  requestInput,
  relatedInput,
  anyPolicy,
  indexedPolicy,
  modes,
  operation,
  bounded,
  tooDeep,
  badPath,
  definitionPath,
  signedPath,
  indexedPath,
  wildcard,
  virtualFilter,
  badFilter,
  booleanPolicy,
  stringPolicy,
  fieldMode,
  missingPaths,
  scalarPaths,
  rowMode,
  missingScope,
  nullScope,
  undefinedScope,
  operationMode,
  badRequestFields,
  badUnrestrictedFields,
  badRequestRows,
  badUnrestrictedRows,
  broadOutput,
  broadCreate,
  inputPolicy,
  subPolicy,
  topOperation,
  missingModel,
  wire,
  root,
  defaults,
  requiredVirtual,
];
