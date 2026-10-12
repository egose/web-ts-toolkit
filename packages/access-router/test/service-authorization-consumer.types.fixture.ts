/** SVA-10: compiled from installed package names in Bundler, NodeNext ESM and CJS. */
import type {
  AllowedOutputFieldOptions,
  AuthorizedListResult,
  AuthorizedSingleResult,
  CreateAuthorization,
  DocumentAuthorization,
  FieldAuthorization,
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
  DocumentAuthorization as AdvancedDocumentAuthorization,
  PublicCreateOptions,
  PublicListOptions,
  PublicReadOptions,
  PublicUpdateOptions,
  PublicUpsertOptions,
  RootQueryEntry,
  SelectedPublicOutput,
  SubdocumentCreateOptions,
  SubdocumentListOptions,
  SubdocumentReadOptions,
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
const create: CreateAuthorization<Order, Virtuals> = { ...output, related: { customer: related } };
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
// @ts-expect-error write elevation is deferred
const inputPolicy: ServiceAuthorization = { inputFields: { mode: 'unrestricted' } };
// @ts-expect-error dedicated subdocument elevation is deferred
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
    { authorization: policy },
    { authorization: policy },
    { authorization: policy },
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
  // Isolated legacy overloads remain, independently of the removed service container.
  await service.genSelect('create', undefined, false, ['contacts', 'sub']);
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
  | SubdocumentListOptions
  | SubdocumentReadOptions
  | SubdocumentCreateOptions;
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
// @ts-expect-error root batch model entries cannot express server capabilities
const root: RootQueryEntry = {
  target: 'model',
  name: 'Order',
  op: 'read',
  id: 'id',
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
// @ts-expect-error the export map also blocks source deep imports
export type PrivateDeepImport =
  import('@web-ts-toolkit/access-router/src/acl/service-authorization').ResolvedServiceAuthorization;

void [
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
