/** Private authenticated query transport. No constructors or flags on service options. */
import type { Service } from '../services/service';
import type { GroupedCountInput } from '../services/grouped-count';
import type {
  Filter,
  FindArgs,
  FindOneArgs,
  FindOptions,
  FindOneOptions,
  UpdateOneArgs,
  UpdateOneOptions,
  CreateArgs,
  CreateOptions,
  ServiceOutputDecorator,
} from '../interfaces';
import { Codes } from '../enums';
import { intersectFilters } from '../core-shared';
import { deepIsolateValue } from '../helpers/document';
import { authorizationError, copyAuthorizationValue } from './authorization-snapshot';
import { readServiceAuthorization } from './service-authorization';
import { getServiceExecutors, readServiceExecution } from './service-execution';
import {
  assertOutputPublication,
  failOutputPublication,
  runOutputPublication,
  trackPublicationWork,
} from './output-publication';
import { getRequestWorkState } from '../helpers/request-work';
import type { AccessRuntime } from '../runtime';
import type { PreparedModelQuery, ResolvedIdentifier, QueryInput, ServiceExecutionContext } from './service-execution';
export type { PreparedModelQuery, ResolvedIdentifier, QueryInput } from './service-execution';

interface QueryRecord {
  readonly execution: ServiceExecutionContext;
  readonly kind: QueryInput['kind'];
  readonly original: Filter;
  readonly parsed: Filter;
  readonly transformed: Filter;
  readonly scope: Filter;
  readonly mandatory: Filter;
  readonly filter: Filter;
}
const queries = new WeakMap<PreparedModelQuery, QueryRecord>();
const identifiers = new WeakMap<ResolvedIdentifier, { family: object; receiver: object; filter: Filter }>();

export function isExecutionRowDenied<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
): boolean {
  const { authorization, binding } = readServiceExecution(receiver, execution);
  const { rows } = readServiceAuthorization(authorization, binding).authorization;
  return rows.mode === 'scope' && rows.filter === false;
}

export async function resolveModelIdentifier<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  id: string,
): Promise<ResolvedIdentifier> {
  const state = readServiceExecution(receiver, execution);
  const filter = isExecutionRowDenied(receiver, execution) ? false : await getServiceExecutors(receiver).identifier(id);
  const token = Object.freeze(Object.create(null)) as ResolvedIdentifier;
  identifiers.set(token, { family: state.family, receiver, filter: copyAuthorizationValue(filter) });
  return token;
}

export function readModelIdentifier<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  token: ResolvedIdentifier,
): Filter<T> {
  const state = readServiceExecution(receiver, execution);
  const record = identifiers.get(token);
  if (!record || record.receiver !== receiver || record.family !== state.family)
    authorizationError('invalid identifier call binding');
  return deepIsolateValue(record.filter) as Filter<T>;
}

export async function prepareModelQuery<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  input: QueryInput<T>,
  mandatoryFilter: Filter<T> = {},
  // Package related queries also retain the parsed descriptor predicate after rewriting.
  // This is private preparation state, never a service or wire option.
  preserveRelatedPredicate = false,
): Promise<PreparedModelQuery> {
  const state = readServiceExecution(receiver, execution);
  if (!state.access.rowAccess) authorizationError('execution has no row access');
  if (!['client-read', 'mutation-lookup', 'expanded'].includes(input.kind))
    authorizationError('invalid query input kind');
  const registered = getServiceExecutors(receiver);
  // Own both inputs before the first await. False scope/predicate/join needs no parser or hook.
  const original = copyAuthorizationValue(input.filter);
  const mandatory = copyAuthorizationValue(mandatoryFilter);
  const earlyDenied = original === false || mandatory === false || isExecutionRowDenied(receiver, execution);
  let parsed: Filter<T> = false;
  let parts: { transformed: Filter<T>; scope: Filter<T>; filter: Filter<T> } = {
    transformed: false,
    scope: {},
    filter: false,
  };
  if (!earlyDenied) {
    registered.validate(original, input.kind === 'expanded');
    parsed =
      input.kind === 'client-read'
        ? await trackPublicationWork(state.publication, registered.parse(deepIsolateValue(original)))
        : deepIsolateValue(original);
    // Validation after expansion measures operand budgets without interpreting marker-shaped values.
    if (input.kind === 'client-read') registered.validate(parsed, true);
    parts = await trackPublicationWork(state.publication, registered.authorize(execution, deepIsolateValue(parsed)));
  }
  // Virtual stripping applies to ordinary query input only. Never discard a mandatory scope/join.
  const filter =
    parts.filter === false
      ? false
      : intersectFilters(
          registered.strip(execution, parts.transformed),
          parts.scope,
          mandatory,
          preserveRelatedPredicate ? parsed : {},
        );
  const token = Object.freeze(Object.create(null)) as PreparedModelQuery;
  queries.set(token, {
    execution,
    ...copyAuthorizationValue({ kind: input.kind, original, parsed, ...parts, mandatory, filter }),
  });
  return token;
}

export function readPreparedModelQuery<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  token: PreparedModelQuery,
) {
  readServiceExecution(receiver, execution);
  const record = queries.get(token);
  if (!record || record.execution !== execution) authorizationError('invalid prepared query call/access binding');
  const { execution: _execution, ...snapshot } = record;
  return deepIsolateValue(snapshot) as Omit<QueryRecord, 'execution'> & { filter: Filter<T> };
}

const denied = () => ({
  success: false as const,
  kind: 'error' as const,
  code: Codes.Forbidden as const,
  query: { filter: false as const },
});
type Decorator = ServiceOutputDecorator;

async function outputOperation<T, V extends object, TResult>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  work: () => Promise<TResult>,
): Promise<TResult> {
  const { publication, ownsPublication } = readServiceExecution(receiver, execution);
  if (ownsPublication) return runOutputPublication(publication, work);
  assertOutputPublication(publication);
  try {
    return await trackPublicationWork(publication, work());
  } catch (error) {
    failOutputPublication(publication, error);
    throw error;
  }
}

async function decorateResult<T, V extends object, TResult>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  result: TResult,
  decorate?: Decorator,
): Promise<TResult> {
  if (!decorate) return result;
  const value = result as
    | import('../interfaces').AuthorizedSingleResult
    | import('../interfaces').AuthorizedListResult
    | import('../interfaces').ErrorResult;
  if (!value.success) return result;
  const { binding } = readServiceExecution(receiver, execution);
  const gate = getRequestWorkState(binding.request, binding.runtime as AccessRuntime).hookGate;
  if (value.kind === 'single')
    return { ...value, data: await gate.run(() => decorate(value.data, value.context)) } as TResult;
  const data = await getRequestWorkState(binding.request, binding.runtime as AccessRuntime).scheduler.map(
    value.data,
    (row, index) => gate.run(() => decorate(row, value.contexts[index])),
  );
  return { ...value, data } as TResult;
}

export async function executePreparedFindOne<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  query: PreparedModelQuery,
  args: FindOneArgs<T> = {},
  options: FindOneOptions<T, V> = {},
) {
  const { filter } = readPreparedModelQuery(receiver, execution, query);
  const access = readServiceExecution(receiver, execution).access.rowAccess;
  if (access !== 'read' && access !== 'list') authorizationError('findOne row access mismatch');
  return filter === false
    ? denied()
    : outputOperation(receiver, execution, () =>
        getServiceExecutors(receiver).findOne(execution, filter, args, { ...options, access }),
      );
}
export async function executePreparedFind<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  query: PreparedModelQuery,
  args: FindArgs<T> = {},
  options: FindOptions<T, V> = {},
  decorate?: Decorator,
) {
  const { filter } = readPreparedModelQuery(receiver, execution, query);
  if (readServiceExecution(receiver, execution).access.rowAccess !== 'list')
    authorizationError('find row access mismatch');
  const result = await (filter === false
    ? denied()
    : outputOperation(receiver, execution, () =>
        getServiceExecutors(receiver).find(execution, query, filter, args, options),
      ));
  return decorateResult(receiver, execution, result, decorate);
}
export async function executePreparedUpdateOne<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  query: PreparedModelQuery,
  data: Record<string, unknown>,
  args: UpdateOneArgs<T> = {},
  options: UpdateOneOptions<T, V> = {},
  decorate?: Decorator,
) {
  const { filter } = readPreparedModelQuery(receiver, execution, query);
  if (readServiceExecution(receiver, execution).access.rowAccess !== 'update')
    authorizationError('update row access mismatch');
  const result = await (filter === false
    ? denied()
    : outputOperation(receiver, execution, () =>
        getServiceExecutors(receiver).updateOne(execution, filter, data, args, options),
      ));
  return decorateResult(receiver, execution, result, decorate);
}
export async function executeCreate<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  data: Record<string, unknown> | Record<string, unknown>[],
  args: CreateArgs = {},
  options: CreateOptions<T, V> = {},
  decorate?: Decorator,
) {
  const state = readServiceExecution(receiver, execution);
  if (state.access.rowAccess || state.access.virtualAccess !== 'create')
    authorizationError('create execution access mismatch');
  const result = await outputOperation(receiver, execution, () =>
    getServiceExecutors(receiver).create(execution, data, args, options),
  );
  return decorateResult(receiver, execution, result, decorate);
}
export async function executePreparedExists<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  query: PreparedModelQuery,
  includeId = false,
) {
  const { filter } = readPreparedModelQuery(receiver, execution, query);
  return filter === false ? denied() : getServiceExecutors(receiver).exists(filter, includeId);
}
export async function executePreparedCount<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  query: PreparedModelQuery,
) {
  const { filter } = readPreparedModelQuery(receiver, execution, query);
  return filter === false ? denied() : getServiceExecutors(receiver).count(filter);
}
export async function executePreparedGroupedCount<T, V extends object>(
  receiver: Service<T, V>,
  execution: ServiceExecutionContext,
  query: PreparedModelQuery,
  foreignField: string,
  input: GroupedCountInput,
) {
  const { filter } = readPreparedModelQuery(receiver, execution, query);
  return filter === false ? denied() : getServiceExecutors(receiver).groupedCount(filter, foreignField, input);
}
