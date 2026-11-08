/** Package-private execution owners. Never service options or package exports. */
import type { Filter } from '../interfaces/query-types';
import type {
  AuthorizationAccess,
  AuthorizationBinding,
  AuthorizationConfiguration,
  AuthorizationApplicability,
  AuthorizationRelatedTarget,
  ResolvedServiceAuthorization,
  ResolveServiceAuthorizationInput,
  WriteOperation,
  WriteOutputBranch,
} from './service-authorization';
import {
  assertAuthorizationBinding,
  getAuthorizationPermissions,
  readServiceAuthorization,
  readServiceAuthorizationAccess,
  readServiceAuthorizationHydration,
  resolveServiceAuthorization,
  resolveWriteServiceAuthorization,
  deriveWriteOutputAuthorization,
  serviceAuthorizationInput,
} from './service-authorization';
import { authorizationError } from './authorization-snapshot';
import type { AccessRouterPermissions } from '../permission';
import {
  bindOutputPublication,
  assertOutputPublication,
  createOutputPublication,
  outputPublicationFor,
  type OutputPublication,
} from './output-publication';
import type { TrustedOutputBudget } from './trusted-output-materialization';
import type { DocumentCondition } from './document-guard';
import { assertDocumentConditionReceiver } from './document-guard';
import type { Service } from '../services/service';
import type { GroupedCountInput } from '../services/grouped-count';
import type { ModelServiceIntent } from '../services/model-service-intent';
import type {
  FindArgs,
  FindOneArgs,
  FindOptions,
  FindOneOptions,
  UpdateOneArgs,
  UpdateOneOptions,
  CreateArgs,
  CreateOptions,
  SingleResult,
  AuthorizedSingleResult,
  AuthorizedListResult,
  ErrorResult,
  HydrationMode,
  ModelHydrationOptions,
} from '../interfaces';

declare const preparedQueryBrand: unique symbol;
declare const resolvedIdentifierBrand: unique symbol;
declare const serviceExecutionBrand: unique symbol;

export interface PreparedModelQuery {
  readonly [preparedQueryBrand]: true;
}
export interface ResolvedIdentifier {
  readonly [resolvedIdentifierBrand]: true;
}
export type QueryInput<T = unknown> =
  | { readonly kind: 'client-read'; readonly filter: Filter<T> }
  | { readonly kind: 'mutation-lookup'; readonly filter: Filter<T> }
  | { readonly kind: 'expanded'; readonly filter: Filter<T> };

export interface ServiceExecutionContext {
  readonly [serviceExecutionBrand]: true;
}

/** Intended private owner record, not structurally accepted authority. */
export interface ServiceExecutionState {
  readonly queryIntent?: ModelServiceIntent;
  readonly hydration: HydrationMode;
  readonly authorization: ResolvedServiceAuthorization;
  readonly access: AuthorizationAccess;
  readonly preparedQuery?: PreparedModelQuery;
  readonly identifier?: ResolvedIdentifier;
  readonly publication: OutputPublication;
  readonly ownsPublication: boolean;
}

export interface ServiceExecutors<T, V extends object> {
  binding(): AuthorizationBinding;
  configuration(): AuthorizationConfiguration;
  permissions(): AccessRouterPermissions;
  parse(filter: Filter<T>): Promise<Filter<T>>;
  validate(filter: Filter<T>, expanded: boolean): void;
  strip(execution: ServiceExecutionContext, filter: Filter<T>): Filter<T>;
  identifier(id: string): Promise<Filter<T>>;
  authorize(
    execution: ServiceExecutionContext,
    filter: Filter<T>,
  ): Promise<{ transformed: Filter<T>; scope: Filter<T>; filter: Filter<T> }>;
  findOne(
    execution: ServiceExecutionContext,
    filter: Filter<T>,
    args: FindOneArgs<T>,
    options: FindOneOptions<T, V>,
  ): Promise<AuthorizedSingleResult<T> | ErrorResult>;
  findOneCondition(
    execution: ServiceExecutionContext,
    filter: Filter<T>,
    args: FindOneArgs<T>,
    options: FindOneOptions<T, V>,
  ): Promise<boolean | ErrorResult>;
  find(
    execution: ServiceExecutionContext,
    query: PreparedModelQuery,
    filter: Filter<T>,
    args: FindArgs<T>,
    options: FindOptions<T, V>,
  ): Promise<AuthorizedListResult<T> | ErrorResult>;
  updateOne(
    execution: ServiceExecutionContext,
    filter: Filter<T>,
    data: Record<string, unknown>,
    args: UpdateOneArgs<T>,
    options: UpdateOneOptions<T, V>,
  ): Promise<AuthorizedSingleResult<T> | ErrorResult>;
  create(
    execution: ServiceExecutionContext,
    data: Record<string, unknown> | Record<string, unknown>[],
    args: CreateArgs,
    options: CreateOptions<T, V>,
  ): Promise<AuthorizedListResult<T> | ErrorResult>;
  exists(filter: Filter<T>, includeId: boolean): Promise<SingleResult<unknown> | ErrorResult>;
  count(filter: Filter<T>): Promise<SingleResult<number> | ErrorResult>;
  groupedCount(
    filter: Filter<T>,
    foreignField: string,
    input: GroupedCountInput,
  ): Promise<SingleResult<number[]> | ErrorResult>;
  /** Fixed lean visibility re-fetch after subdocument persistence. Never a service option. */
  subdocumentVisibility(args: { filter: Filter<T>; select: string; populate: unknown }): Promise<unknown>;
}
// Generic association is checked at registration/read; never accepted structurally at dispatch.
const executors = new WeakMap<object, ServiceExecutors<any, any>>();
interface ExecutionRecord extends ServiceExecutionState {
  readonly receiver: object;
  readonly binding: AuthorizationBinding;
  readonly family: object;
  readonly purpose: { readonly kind: 'dto' } | { readonly kind: 'condition'; readonly condition: DocumentCondition };
  readonly outputBudget?: (row: unknown, index: number) => TrustedOutputBudget | null;
  /** Only the dedicated root issuer creates this; ordinary constructors cannot. */
  readonly writeOrigin?: WriteOperation;
}
const executions = new WeakMap<ServiceExecutionContext, ExecutionRecord>();

export function registerServiceExecutors<T, V extends object>(
  receiver: Service<T, V>,
  value: ServiceExecutors<T, V>,
): void {
  if (executors.has(receiver)) authorizationError('receiver already registered');
  executors.set(receiver, Object.freeze({ ...value }));
}
export function getServiceExecutors<T, V extends object>(receiver: Service<T, V>): ServiceExecutors<T, V> {
  const registered = executors.get(receiver);
  if (!registered) authorizationError('unregistered service receiver');
  return registered;
}

/** Synchronous capture, before any identifier, parser or application hook. */
export function createServiceExecution<T, V extends object>(
  receiver: Service<T, V>,
  access: AuthorizationAccess,
  authorization?: unknown,
  applicability: AuthorizationApplicability = 'service',
  relatedTargets: readonly AuthorizationRelatedTarget[] = [],
  parent?: ResolvedServiceAuthorization,
  configuration?: AuthorizationConfiguration,
  requestPermissions?: AccessRouterPermissions,
  hydration: keyof ModelHydrationOptions | HydrationMode = access.operation === 'list' ? 'find' : 'findOne',
  snapshotDerivation?: ResolveServiceAuthorizationInput['snapshotDerivation'],
): ServiceExecutionContext {
  return prepareServiceExecution(
    receiver,
    access,
    authorization,
    applicability,
    relatedTargets,
    parent,
    configuration,
    requestPermissions,
    hydration,
    snapshotDerivation,
  );
}

/** Only real root write entries use this issuer; NEW/dedicated/helpers stay generic. */
export function createWriteServiceExecution<T, V extends object>(
  receiver: Service<T, V>,
  operation: WriteOperation,
  authorization?: unknown,
  applicability: AuthorizationApplicability = operation === 'create' ? 'create' : 'mutation',
  relatedTargets: readonly AuthorizationRelatedTarget[] = [],
): ServiceExecutionContext {
  const branch = operation === 'create' ? 'create' : 'update';
  return prepareServiceExecution(
    receiver,
    {
      operation,
      ...(branch === 'update' ? { rowAccess: 'update' } : {}),
      virtualAccess: branch,
      outputAccess: 'read',
      docPermissionsAccess: branch,
    },
    authorization,
    applicability,
    relatedTargets,
    undefined,
    undefined,
    undefined,
    'findOne',
    undefined,
    operation,
  );
}

function prepareServiceExecution<T, V extends object>(
  receiver: Service<T, V>,
  access: AuthorizationAccess,
  authorization: unknown,
  applicability: AuthorizationApplicability,
  relatedTargets: readonly AuthorizationRelatedTarget[],
  parent: ResolvedServiceAuthorization | undefined,
  configuration: AuthorizationConfiguration | undefined,
  requestPermissions: AccessRouterPermissions | undefined,
  hydration: keyof ModelHydrationOptions | HydrationMode,
  snapshotDerivation: ResolveServiceAuthorizationInput['snapshotDerivation'],
  writeOrigin?: WriteOperation,
): ServiceExecutionContext {
  const registered = getServiceExecutors(receiver);
  const receiving = registered.binding();
  const binding = Object.freeze({ ...receiving, scopePath: Object.freeze([...(receiving.scopePath ?? [])]) });
  const permissions = requestPermissions ?? registered.permissions();
  const input = {
    binding,
    access,
    authorization,
    applicability,
    relatedTargets,
    parent,
    configuration: configuration ?? registered.configuration(),
    requestPermissions: permissions,
    listResponse: access.operation === 'list' && parent === undefined,
    readResponse: access.operation === 'read' && parent === undefined,
    snapshotDerivation,
  };
  const call = writeOrigin ? resolveWriteServiceAuthorization(input, writeOrigin) : resolveServiceAuthorization(input);
  const execution = Object.freeze(Object.create(null)) as ServiceExecutionContext;
  const publication =
    parent && snapshotDerivation?.kind === 'related' ? outputPublicationFor(parent) : createOutputPublication();
  bindOutputPublication(call, publication);
  executions.set(
    execution,
    Object.freeze({
      receiver,
      binding,
      authorization: call,
      publication,
      ownsPublication: !parent || snapshotDerivation?.kind !== 'related',
      access: readServiceAuthorizationAccess(call, binding),
      family: execution,
      purpose: Object.freeze({ kind: 'dto' as const }),
      writeOrigin,
      hydration: resolveHydration(readServiceAuthorizationHydration(call, binding), hydration),
    }),
  );
  return execution;
}

/** Canonical post-write workers plan against this child, but dispatch query tokens
 * with their original input execution. No new capture, family or publication owner. */
export function deriveWriteOutputExecution<T, V extends object>(
  receiver: Service<T, V>,
  parent: ServiceExecutionContext,
  branch: WriteOutputBranch,
): ServiceExecutionContext {
  const record = readServiceExecution(receiver, parent);
  if (
    !record.writeOrigin ||
    record.purpose.kind !== 'dto' ||
    outputPublicationFor(record.authorization) !== record.publication
  )
    authorizationError('invalid write output purpose/publication');
  assertOutputPublication(record.publication);
  const call = deriveWriteOutputAuthorization(record.authorization, record.binding, branch);
  bindOutputPublication(call, record.publication);
  const execution = Object.freeze(Object.create(null)) as ServiceExecutionContext;
  executions.set(
    execution,
    Object.freeze({ ...record, authorization: call, ownsPublication: false, writeOrigin: undefined }),
  );
  return execution;
}

/** Issued only by the lexical PublicService condition reader, never from service options. */
export function withExecutionDocumentCondition<T, V extends object>(
  receiver: Service<T, V>,
  parent: ServiceExecutionContext,
  condition: DocumentCondition,
): ServiceExecutionContext {
  assertDocumentConditionReceiver(receiver);
  const record = readServiceExecution(receiver, parent);
  if (record.purpose.kind !== 'dto' || record.access.operation !== 'read' || record.access.rowAccess !== 'read')
    authorizationError('invalid condition execution origin');
  const execution = Object.freeze(Object.create(null)) as ServiceExecutionContext;
  executions.set(
    execution,
    Object.freeze({ ...record, purpose: Object.freeze({ kind: 'condition' as const, condition }) }),
  );
  return execution;
}

function resolveHydration(
  configuration: Pick<AuthorizationConfiguration, 'hydration'>,
  source: keyof ModelHydrationOptions | HydrationMode,
): HydrationMode {
  if (source === 'lean' || source === 'hydrated') return source;
  return (
    (configuration.hydration as ModelHydrationOptions | undefined)?.[source] ??
    (source === 'publicList' ? 'lean' : 'hydrated')
  );
}

/** Package-selected method/fixed mode, carried only by an authenticated execution. */
export function withExecutionHydration<T, V extends object>(
  receiver: Service<T, V>,
  parent: ServiceExecutionContext,
  source: keyof ModelHydrationOptions | HydrationMode,
): ServiceExecutionContext {
  const record = readServiceExecution(receiver, parent);
  const configuration = readServiceAuthorizationHydration(record.authorization, record.binding);
  const execution = Object.freeze(Object.create(null)) as ServiceExecutionContext;
  executions.set(execution, Object.freeze({ ...record, hydration: resolveHydration(configuration, source) }));
  return execution;
}

export function readServiceExecution<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
): ExecutionRecord {
  const record = executions.get(execution);
  if (!record || record.receiver !== receiver) authorizationError('invalid execution receiver/call');
  assertAuthorizationBinding(record.authorization, getServiceExecutors(receiver).binding());
  return record;
}

/** Private row-budget receiver, fixed before a related query constructs any output. */
export function withExecutionOutputBudget<T, V extends object>(
  receiver: Service<T, V>,
  parent: ServiceExecutionContext,
  outputBudget: (row: unknown, index: number) => TrustedOutputBudget | null,
): ServiceExecutionContext {
  const record = readServiceExecution(receiver, parent);
  const execution = Object.freeze(Object.create(null)) as ServiceExecutionContext;
  executions.set(execution, Object.freeze({ ...record, outputBudget }));
  return execution;
}

/** Own effective output arguments alongside the authenticated configuration/actor.
 * Derivations retain intent; only package-selected branch/fallback options differ.
 */
export function withExecutionQueryIntent<T, V extends object>(
  receiver: Service<T, V>,
  parent: ServiceExecutionContext,
  queryIntent: ModelServiceIntent,
): ServiceExecutionContext {
  const record = readServiceExecution(receiver, parent);
  const execution = Object.freeze(Object.create(null)) as ServiceExecutionContext;
  executions.set(execution, Object.freeze({ ...record, queryIntent }));
  return execution;
}

/** Explicit branch/fallback derivation; query tokens still require the exact execution. */
export function deriveServiceExecution<T, V extends object>(
  receiver: Service<T, V>,
  parent: ServiceExecutionContext,
  access: AuthorizationAccess,
  applicability: AuthorizationApplicability = 'service',
): ServiceExecutionContext {
  const record = readServiceExecution(receiver, parent);
  const captured = readServiceAuthorization(record.authorization, record.binding);
  if (
    record.purpose.kind === 'condition' &&
    (applicability !== 'service' ||
      record.access.operation !== 'read' ||
      record.access.rowAccess !== 'read' ||
      access.operation !== 'read' ||
      access.rowAccess !== 'list' ||
      access.virtualAccess !== 'list' ||
      access.outputAccess !== 'list' ||
      access.docPermissionsAccess !== 'list')
  )
    authorizationError('condition purpose may only follow a read-to-list retry');
  const policy = serviceAuthorizationInput(captured.authorization, captured.relatedTargets);
  const { outputFields, related } = policy;
  const { inputFields } = captured.authorization;
  const authorization =
    applicability === 'create'
      ? { inputFields, outputFields, related }
      : applicability === 'mutation'
        ? { ...policy, inputFields }
        : applicability === 'output'
          ? { outputFields }
          : policy;
  const call = resolveServiceAuthorization({
    binding: record.binding,
    access,
    authorization,
    applicability,
    relatedTargets: captured.relatedTargets,
    configuration: captured.configuration,
    requestPermissions: getAuthorizationPermissions(record.authorization, record.binding),
    parent: record.authorization,
    // The resolver authenticates root-read provenance and the unchanged owner tuple.
    // Effective list access is still a read; write branches cannot inherit this marker.
    readResponse: record.access.operation === 'read' && access.operation === 'read',
    snapshotDerivation: { kind: 'retry', parentBinding: record.binding },
  });
  const execution = Object.freeze(Object.create(null)) as ServiceExecutionContext;
  const publication =
    record.access.operation === 'read' && access.operation === 'read' ? createOutputPublication() : record.publication;
  bindOutputPublication(call, publication);
  executions.set(
    execution,
    Object.freeze({
      ...record,
      publication,
      authorization: call,
      access: readServiceAuthorizationAccess(call, record.binding),
    }),
  );
  return execution;
}
