/** Strict emitted-declaration fixture, compiled by the context unit suite. */
import type {
  AccessRouterRequest,
  AllowedOutputFieldOptions,
  AuthorizedListResult,
  AuthorizedSingleResult,
  CreateAuthorization,
  DocumentAuthorization,
  FieldAuthorization,
  NewArgs,
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
} from '../dist/index.js';
import type {
  CreateArgs,
  CreateOptions,
  Defaults,
  FindOptions,
  FindOneOptions,
  FindByIdOptions,
  PublicCreateArgs,
  PublicCreateOptions,
  PublicListArgs,
  PublicListOptions,
  PublicReadArgs,
  PublicReadOptions,
  PublicUpdateArgs,
  PublicUpdateOptions,
  PublicUpsertArgs,
  PublicUpsertOptions,
  RootQueryEntry,
  ServiceResult,
  SubdocumentReadOptions,
  SubdocumentCreateOptions,
  SubdocumentListOptions,
  UpdateByIdArgs,
  UpdateByIdOptions,
  UpdateOneArgs,
  UpdateOneOptions,
  UpsertArgs,
  UpsertOptions,
  OutputFieldPath as AdvancedOutputFieldPath,
  ServiceAuthorization as AdvancedServiceAuthorization,
} from '../dist/advanced.js';

interface Order {
  status: string;
  internalNote?: string;
  contacts?: readonly { email: string; ssn: string }[] | null;
}
interface Virtuals {
  summary: string;
  contacts: readonly (VirtualSubModel<Order, 'contacts'> & { badge?: string })[];
}
type Assert<T extends true> = T;
type Equal<A, B> = [A, B] extends [B, A] ? true : false;
type EntryPointParity = Assert<
  Equal<ServiceAuthorization<Order, Virtuals>, AdvancedServiceAuthorization<Order, Virtuals>>
>;
type PathParity = Assert<Equal<OutputFieldPath<Order, Virtuals>, AdvancedOutputFieldPath<Order, Virtuals>>>;

const paths: readonly OutputFieldPath<Order, Virtuals>[] = [
  'status',
  'contacts',
  'contacts.email',
  'contacts.badge',
  'summary',
];
const grant: FieldAuthorization<OutputFieldPath<Order, Virtuals>> = { mode: 'grant', paths };
const policy: ServiceAuthorization<Order, Virtuals> = {
  rows: { mode: 'scope', filter: { status: 'open', 'contacts.email': 'reader@example.test' } },
  outputFields: grant,
  related: {
    customer: {
      model: 'Customer',
      operation: { mode: 'grant' },
      outputFields: { mode: 'grant', paths: ['billingEmail'] },
    },
  },
};
const rows: RowAuthorization<Order> = { mode: 'scope', filter: false };
const operation: OperationAuthorization = { mode: 'request' };
const related: RelatedAuthorization = { model: 'Customer', rows: { mode: 'unrestricted' } };
const create: CreateAuthorization<Order, Virtuals> = { outputFields: grant, related: { customer: related } };
const output: OutputAuthorization<Order, Virtuals> = { outputFields: grant };
const planning: OutputPlanningOptions<Order, Virtuals> = { authorization: output, scopePath: ['contacts'] };
const allowed: AllowedOutputFieldOptions<Order, Virtuals> = { ...planning, purpose: 'output' };
const internal: [
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
const newArgs: NewArgs = { select: ['-status'] };
const mutationSelect: [CreateArgs, UpdateOneArgs<Order>, UpdateByIdArgs<Order>, UpsertArgs<Order>] = [
  { select: ['status'] },
  { select: 'status' },
  { select: { status: 1 } },
  { select: [] },
];
const unknownModel: ServiceAuthorization = { outputFields: { mode: 'grant', paths: ['dynamic.path'] } };
const anyModel: ServiceAuthorization<any> = unknownModel;
const indexedModel: ServiceAuthorization<Record<string, unknown>> = unknownModel;
interface Recursive {
  value: string;
  child?: Recursive;
}
const bounded: OutputFieldPath<Recursive> = 'child.child.child.child.value';
// @ts-expect-error uses DeepFieldPath's finite default depth
const unbounded: OutputFieldPath<Recursive> = 'child.child.child.child.child.value';
// @ts-expect-error known models have no arbitrary string fallback
const badPath: OutputFieldPath<Order, Virtuals> = 'typo';
// @ts-expect-error ordinary response paths do not contain permission-definition markers
const markerPath: OutputFieldPath<Order, Virtuals> = 'contacts.sub.email';
// @ts-expect-error virtual output does not enter persisted filter typing
const virtualFilter: RowAuthorization<Order> = { mode: 'scope', filter: { summary: 'x' } };
// @ts-expect-error grants expose readonly paths
grant.paths.push('status');
// @ts-expect-error policy properties are readonly
policy.rows = { mode: 'unrestricted' };
// @ts-expect-error unsupported write elevation
const writePolicy: ServiceAuthorization = { inputFields: { mode: 'unrestricted' } };
// @ts-expect-error dedicated subdocument elevation is deferred
const subPolicy: ServiceAuthorization = { subdocuments: {} };
// @ts-expect-error initiating operation is package-owned
const topOperation: ServiceAuthorization = { operation: { mode: 'grant' } };
// @ts-expect-error variant-specific property
const variant: FieldAuthorization = { mode: 'request', paths: [] };
// @ts-expect-error no string shorthand
const shorthand: ServiceAuthorization = 'unrestricted';
// @ts-expect-error create cannot request row authority, even request mode
const createRows: CreateOptions<Order> = { authorization: { rows: { mode: 'request' } } };
// @ts-expect-error new has no target dispatch
const newRelated: NewOptions<Order> = { authorization: { related: {} } };
// @ts-expect-error helpers accept output authority only
const helperRows: OutputPlanningOptions<Order> = { authorization: { rows: { mode: 'request' } } };
// @ts-expect-error no bypass baseFields on named helper options
const baseFields: OutputFieldOptions = { baseFields: ['internalNote'] };
// @ts-expect-error named genAllowedFields is explicitly output-only
const noPurpose: AllowedOutputFieldOptions = {};

declare const handle: DocumentAuthorization;
const reuse: OutputFieldOptions = { documentAuthorization: handle };
// @ts-expect-error no structural constructor for handles
const forged: DocumentAuthorization = {};
// @ts-expect-error raw policy and handle are mutually exclusive
const mixed: OutputFieldOptions = { documentAuthorization: handle, authorization: {} };
// @ts-expect-error a handle already binds its scope
const mixedScope: OutputFieldOptions = { documentAuthorization: handle, scopePath: [] };

type InternalControl =
  | 'authorization'
  | 'documentAuthorization'
  | 'execution'
  | 'preparedQuery'
  | 'preparedFilter'
  | 'operation';
type PublicSurface = [
  PublicCreateArgs,
  PublicCreateOptions,
  PublicListArgs,
  PublicListOptions,
  PublicReadArgs,
  PublicReadOptions,
  PublicUpdateArgs,
  PublicUpdateOptions,
  PublicUpsertArgs,
  PublicUpsertOptions,
  SubdocumentReadOptions,
  SubdocumentCreateOptions,
  SubdocumentListOptions,
];
type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type PublicHasNoControls = Assert<Equal<Extract<KeysOfUnion<PublicSurface[number]>, InternalControl>, never>>;
type RootOptions = RootQueryEntry extends infer E ? (E extends { options?: infer O } ? O : never) : never;
type RootArgs = RootQueryEntry extends infer E ? (E extends { args?: infer A } ? A : never) : never;
type RootHasNoControls = Assert<
  Equal<Extract<KeysOfUnion<NonNullable<RootArgs | RootOptions>>, InternalControl>, never>
>;
type DefaultOptions = NonNullable<Defaults[keyof Defaults]>;
type DefaultsHaveNoControls = Assert<Equal<Extract<KeysOfUnion<DefaultOptions>, InternalControl>, never>>;
// @ts-expect-error public mutation options remain request-only
const publicCreate: PublicCreateOptions = { authorization: policy };
// @ts-expect-error public reads remain request-only
const publicRead: PublicReadOptions = { authorization: policy };
// @ts-expect-error root model envelopes cannot carry authority
const root: RootQueryEntry = {
  target: 'model',
  name: 'Order',
  op: 'read',
  id: 'id',
  options: { authorization: policy },
};
// @ts-expect-error root data options are not a generic control-slot escape hatch
const dataRoot: RootQueryEntry = { target: 'data', name: 'Order', op: 'list', options: { authorization: policy } };
// @ts-expect-error authority is never inherited from router defaults
const defaults: Defaults<Order> = { findOptions: { authorization: policy } };
// @ts-expect-error mutation defaults also exclude authority
const mutationDefaults: Defaults<Order> = { createOptions: { authorization: create } };

declare const request: AccessRouterRequest;
const service = request.macl!.getService<Order, Virtuals>('Order');
service.find({}, { select: ['summary'] }, { authorization: policy });
service.findOne({}, {}, { authorization: policy });
service.findById('id', {}, { authorization: policy });
service.create({}, { select: ['status'] }, createOptions);
service.updateOne({}, {}, { select: ['status'] }, { authorization: policy });
service.updateById('id', {}, { select: ['status'] }, { authorization: policy });
service.upsert({}, {}, { select: ['status'] }, { authorization: policy });
service.new(newArgs, newOptions);
service.genSelect('read', ['internalNote'], { authorization: output });
service.genQuerySelect('read', ['email', 'badge'], planning);
request.macl!.genSelect<Order, Virtuals>('Order', 'read', undefined, planning);
request.macl!.genQuerySelect<Order, Virtuals>('Order', 'read', undefined, planning);
// Legacy positional calls remain available, independently of output authority.
service.genSelect('create', undefined, false, ['contacts', 'sub']);
service.genAllowedFields({}, 'read', { authorization: output, purpose: 'output' });
service.pickAllowedFields({}, 'read', { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } });
service.trimOutputFields({}, 'read', { documentAuthorization: handle });
request.macl!.genAllowedFields<Order, Virtuals>('Order', {}, 'read', {
  purpose: 'output',
  documentAuthorization: handle,
});
request.macl!.pickAllowedFields<{}, Order, Virtuals>('Order', {}, 'read', {
  authorization: { outputFields: { mode: 'grant', paths: ['contacts.email'] } },
});
request.macl!.trimOutputFields('Order', {}, 'read', { documentAuthorization: handle });
service.pickAllowedFields({}, 'update', ['internalNote']); // isolated positional compatibility
// @ts-expect-error allowed-field output overload requires an explicit purpose
service.genAllowedFields({}, 'read', { authorization: policy });
// @ts-expect-error named output helpers cannot add positional bypass fields
service.pickAllowedFields({}, 'read', { authorization: policy, baseFields: ['internalNote'] });
// @ts-expect-error only one authority source per output helper call
service.trimOutputFields({}, 'read', { documentAuthorization: handle, authorization: policy });
// @ts-expect-error scope is derived from an authenticated handle
request.macl!.pickAllowedFields('Order', {}, 'read', { documentAuthorization: handle, scopePath: ['contacts'] });
// @ts-expect-error output grant paths retain the receiving model/virtual type
service.pickAllowedFields({}, 'read', { authorization: { outputFields: { mode: 'grant', paths: ['missing'] } } });
// @ts-expect-error output helpers accept no row policy
request.macl!.trimOutputFields('Order', {}, 'read', { authorization: { rows: { mode: 'unrestricted' } } });
// @ts-expect-error named planning paths retain model/virtual typing
service.genSelect('read', ['internalNote'], { authorization: { outputFields: { mode: 'grant', paths: ['missing'] } } });
// @ts-expect-error output planning cannot authorize writes or rows
service.genQuerySelect('read', undefined, { authorization: { rows: { mode: 'unrestricted' } } });
// @ts-expect-error named options do not accept a positional authority bypass
service.genSelect('read', undefined, { baseFields: ['internalNote'] });
// @ts-expect-error planning cannot consume document output handles
request.macl!.genQuerySelect('Order', 'read', undefined, { documentAuthorization: handle });
// @ts-expect-error service calls retain the receiving model's output path type
service.findOne({}, {}, { authorization: { outputFields: { mode: 'grant', paths: ['missing'] } } });
// @ts-expect-error create does not accept row scope
service.create({}, {}, { authorization: { rows: { mode: 'request' } } });
const publicService = request.macl!.getPublicService<Order, Virtuals>('Order');
publicService._read('id', {}, { skim: true });
// @ts-expect-error public wrapper retains its own option type
publicService._read('id', {}, { authorization: policy });

declare const single: AuthorizedSingleResult<Order>;
declare const list: AuthorizedListResult<Order>;
const context: ServiceOutputContext = single.context;
const decorator: ServiceOutputDecorator = (doc, ctx) => {
  const result: DocumentAuthorization = ctx.documentAuthorization;
  void result;
  return doc;
};
const compatibleResults: ServiceResult<Order>[] = [single, list];
const fromGraph: DocumentAuthorization | undefined = context.getDocumentAuthorization({});
// @ts-expect-error returned contexts are readonly
list.contexts.push(context);
// @ts-expect-error resolved call context is not exported, even from advanced
type PrivateContext = import('../dist/advanced.js').ResolvedServiceAuthorization;
// @ts-expect-error no runtime token constructor on the root
type PrivateIssuer = typeof import('../dist/index.js').resolveServiceAuthorization;

void [
  paths,
  rows,
  operation,
  related,
  allowed,
  internal,
  createOptions,
  newOptions,
  newArgs,
  mutationSelect,
  unknownModel,
  anyModel,
  indexedModel,
  bounded,
  unbounded,
  badPath,
  markerPath,
  virtualFilter,
  writePolicy,
  subPolicy,
  topOperation,
  variant,
  shorthand,
  createRows,
  newRelated,
  helperRows,
  baseFields,
  noPurpose,
  reuse,
  forged,
  mixed,
  mixedScope,
  publicCreate,
  publicRead,
  root,
  dataRoot,
  defaults,
  mutationDefaults,
  decorator,
  compatibleResults,
  fromGraph,
];
