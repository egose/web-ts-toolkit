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
} from './service-authorization';
import {
  assertAuthorizationBinding,
  getAuthorizationPermissions,
  readServiceAuthorization,
  readServiceAuthorizationAccess,
  readServiceAuthorizationHydration,
  resolveServiceAuthorization,
  serviceAuthorizationInput,
} from './service-authorization';
import { authorizationError } from './authorization-snapshot';
import type { AccessRouterPermissions } from '../permission';
import type { DocumentAuthorizationStage } from './document-authorization';
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
  ServiceOutputDecorator,
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
  readonly documentStage?: DocumentAuthorizationStage;
}

type Decorator = ServiceOutputDecorator;
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
  find(
    execution: ServiceExecutionContext,
    query: PreparedModelQuery,
    filter: Filter<T>,
    args: FindArgs<T>,
    options: FindOptions<T, V>,
    decorate?: Decorator,
  ): Promise<AuthorizedListResult<T> | ErrorResult>;
  updateOne(
    execution: ServiceExecutionContext,
    filter: Filter<T>,
    data: Record<string, unknown>,
    args: UpdateOneArgs<T>,
    options: UpdateOneOptions<T, V>,
    decorate?: Decorator,
  ): Promise<AuthorizedSingleResult<T> | ErrorResult>;
  create(
    execution: ServiceExecutionContext,
    data: Record<string, unknown> | Record<string, unknown>[],
    args: CreateArgs,
    options: CreateOptions<T, V>,
    decorate?: Decorator,
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
  const registered = getServiceExecutors(receiver);
  const receiving = registered.binding();
  const binding = Object.freeze({ ...receiving, scopePath: Object.freeze([...(receiving.scopePath ?? [])]) });
  const call = resolveServiceAuthorization({
    binding,
    access,
    authorization,
    applicability,
    relatedTargets,
    parent,
    configuration: configuration ?? registered.configuration(),
    requestPermissions: requestPermissions ?? registered.permissions(),
    listResponse: access.operation === 'list' && parent === undefined,
    readResponse: access.operation === 'read' && parent === undefined,
    snapshotDerivation,
  });
  const execution = Object.freeze(Object.create(null)) as ServiceExecutionContext;
  executions.set(
    execution,
    Object.freeze({
      receiver,
      binding,
      authorization: call,
      access: readServiceAuthorizationAccess(call, binding),
      family: execution,
      hydration: resolveHydration(readServiceAuthorizationHydration(call, binding), hydration),
    }),
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
  executions.set(
    execution,
    Object.freeze({ ...record, authorization: call, access: readServiceAuthorizationAccess(call, record.binding) }),
  );
  return execution;
}
