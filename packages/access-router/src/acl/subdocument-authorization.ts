/** Private scoped orchestration. No issuer or bypass flag is exported by the package. */
import { get } from '@web-ts-toolkit/utils';
import type { Model } from 'mongoose';
import type { Service } from '../services/service';
import type { Filter, FieldAuthorization, ModelRequest, Projection, SubPopulate, Validation } from '../interfaces';
import { genSubPopulate, filterCollection } from '../helpers';
import { deepIsolateValue } from '../helpers/document';
import { evaluateRouteGuard, intersectFilters, resolveIdentifierFilter } from '../core-shared';
import { validateRequestComplexity } from '../request-complexity';
import { assertPublicAdmission, assertPublicDefaults } from '../validation/public-admission';
import { isVirtualDbPath, stripSubVirtualKeysFromFilter, validateClientFilter } from '../services/base';
import { authorizationError, authorizationRecord, copyAuthorizationValue } from './authorization-snapshot';
import {
  assertAuthorizationKeys,
  assertAuthorizationPath,
  getAuthorizationPermissions,
  readServiceAuthorization,
} from './service-authorization';
import { createServiceExecution, getServiceExecutors, readServiceExecution } from './service-execution';
import type { ServiceExecutionContext } from './service-execution';
import { isExecutionRowDenied } from './prepared-query';
import { isCatalogOutputPath, matchesCatalogPattern } from './field-catalog';
import { getCapturedAuthorizationOption } from './model-output-planning';
import { prepareSubdocumentOutput } from './subdocument-output';

type Method = 'list' | 'read' | 'create' | 'update' | 'bulkUpdate' | 'delete';
interface Gate {
  execution: ServiceExecutionContext;
  operation: 'request' | 'grant';
}
export interface SubdocumentCall {
  sub: string;
  method: Method;
  scoped: boolean;
  parent: Gate;
  child: Gate;
  visibility?: { parent: Gate; child: Gate; list?: Gate };
  output?: ReturnType<typeof prepareSubdocumentOutput>;
}

/** Captures and validates every mutation and response dimension before the first await. */
export function prepareSubdocumentCall<T, V extends object>(
  service: Service<T, V>,
  sub: string,
  method: Method,
  options: unknown,
): SubdocumentCall {
  assertPublicDefaults(service.defaults);
  const original = options === undefined ? {} : authorizationRecord(options, 'subdocument options');
  // Inspect inherited/non-enumerable controls before positively excluding the one internal slot.
  const publicPart = Object.create(Object.getPrototypeOf(original));
  for (const key of Reflect.ownKeys(original)) {
    if (key !== 'authorization')
      Object.defineProperty(publicPart, key, Object.getOwnPropertyDescriptor(original, key)!);
  }
  assertPublicAdmission(publicPart);
  const keys =
    method === 'list'
      ? ['filter', 'select']
      : method === 'read'
        ? ['select', 'populate']
        : method === 'create'
          ? ['addFirst']
          : [];
  assertAuthorizationKeys(original, [...keys, 'authorization'], 'subdocument options');
  const descriptor = Object.getOwnPropertyDescriptor(original, 'authorization');
  if (descriptor && (!('value' in descriptor) || !descriptor.enumerable))
    authorizationError('authorization must be enumerable data');
  const raw = copyAuthorizationValue(original.authorization);
  const input = deepIsolateValue(original);
  const errors = validateRequestComplexity(raw, service.getRequestComplexity());
  if (errors.length) authorizationError(errors[0].detail);
  const policy = raw === undefined ? {} : authorizationRecord(raw, 'subdocument authorization');
  const mutation = method === 'create' || method === 'update' || method === 'bulkUpdate';
  assertAuthorizationKeys(
    policy,
    mutation ? ['parent', 'child', 'visibility'] : ['parent', 'child'],
    'subdocument authorization',
  );
  assertAuthorizationPath(sub);
  const registered = getServiceExecutors(service);
  const binding = registered.binding();
  const schemaType = (binding.model as Model<unknown>).schema.path(sub);
  if (sub.includes('.') || !schemaType?.schema || schemaType.instance !== 'Array')
    authorizationError(`dedicated subdocument path must be a top-level embedded document array: ${sub}`);
  const configuration = copyAuthorizationValue(registered.configuration(), true);
  const permissions = registered.permissions();
  const operation = `sub${method[0].toUpperCase()}${method.slice(1)}`;
  const access = method === 'bulkUpdate' ? 'update' : method;
  const makeGate = (
    value: unknown,
    rowAccess: string,
    dimension?: 'inputFields' | 'outputFields',
    existing = true,
  ): Gate => {
    const gate = value === undefined ? {} : authorizationRecord(value, rowAccess);
    assertAuthorizationKeys(
      gate,
      ['operation', ...(existing ? ['rows'] : []), ...(dimension ? [dimension] : [])],
      rowAccess,
    );
    const op = gate.operation === undefined ? { mode: 'request' } : authorizationRecord(gate.operation, 'operation');
    assertAuthorizationKeys(op, ['mode'], 'operation');
    if (op.mode !== 'request' && op.mode !== 'grant') authorizationError('unknown operation mode');
    const fields = dimension ? gate[dimension] : undefined;
    let prefixed = fields;
    if (fields !== undefined) {
      const field = authorizationRecord(fields, dimension!);
      if (field.mode === 'grant') {
        if (!Array.isArray(field.paths)) authorizationError('grant.paths must be an array');
        prefixed = {
          ...field,
          paths: Array.from(field.paths as unknown[], (path) => {
            assertAuthorizationPath(path);
            if (path.split('.').length > service.getRequestComplexity().maxDepth)
              authorizationError('child field path exceeds maximum depth');
            if (
              dimension === 'inputFields' &&
              isVirtualDbPath(`${sub}.${path}`, {
                virtuals: configuration.virtuals as Record<string, unknown>,
              })
            )
              authorizationError(`dedicated virtual input path: ${path}`);
            return `${sub}.${path}`;
          }),
        };
      }
    }
    const execution = createServiceExecution(
      service,
      { operation, rowAccess, virtualAccess: access, outputAccess: 'read', docPermissionsAccess: 'read' },
      { ...(existing ? { rows: gate.rows } : {}), ...(dimension ? { [dimension]: prefixed } : {}) },
      dimension === 'inputFields' ? 'mutation' : 'service',
      [],
      undefined,
      configuration,
      permissions,
    );
    const state = readServiceExecution(service, execution);
    const rows = readServiceAuthorization(state.authorization, state.binding).authorization.rows;
    if (rows.mode === 'scope' && rows.filter !== false) {
      const issues = validateClientFilter(rows.filter);
      if (issues.length) authorizationError(issues[0]);
      // Predicate operands stay inert. Validate query keys, not literal objects under $eq/$in.
      const scope = rowAccess.startsWith('subs.') ? sub : '';
      const catalog = configuration.catalog;
      const visitOperators = (value: unknown, path: string) => {
        if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof RegExp) return;
        for (const [key, operand] of Object.entries(value)) {
          if (['$in', '$nin', '$all'].includes(key) && !Array.isArray(operand))
            authorizationError(`${key} scope operand must be an array`);
          if (key === '$exists' && typeof operand !== 'boolean')
            authorizationError('$exists scope operand must be boolean');
          if (key === '$size' && (!Number.isSafeInteger(operand) || Number(operand) < 0))
            authorizationError('$size scope operand must be a nonnegative integer');
          if (key === '$not') visitOperators(operand, path);
          if (key === '$elemMatch') visit(operand, path);
          if (key === '$all' && Array.isArray(operand)) {
            for (const item of operand) {
              if (item && typeof item === 'object' && '$elemMatch' in item) visit(item.$elemMatch, path);
            }
          }
        }
      };
      const visit = (query: unknown, prefix = scope) => {
        const object = authorizationRecord(query, 'scope predicate');
        for (const [key, operand] of Object.entries(object)) {
          if (['$and', '$or', '$nor'].includes(key)) {
            if (!Array.isArray(operand) || !operand.length) authorizationError(`invalid scope ${key}`);
            operand.forEach((entry) => visit(entry, prefix));
          } else {
            const path = prefix ? `${prefix}.${key}` : key;
            const relative = scope ? path.slice(scope.length + 1) : path;
            if (relative.split('.').length > service.getRequestComplexity().maxDepth)
              authorizationError('row path exceeds maximum depth');
            const persisted =
              (catalog.persistedPaths ?? catalog.paths).some((p) => matchesCatalogPattern(p, path)) ||
              catalog.opaquePaths?.some((p) => matchesCatalogPattern(p, path, true));
            if (!persisted || !isCatalogOutputPath(catalog, path) || catalog.virtualPaths?.includes(path))
              authorizationError(`invalid scoped row path: ${path}`);
            visitOperators(operand, path);
          }
        }
      };
      visit(rows.filter);
      try {
        filterCollection([], rows.filter);
      } catch {
        authorizationError('unsupported scoped row predicate');
      }
    }
    return { execution, operation: op.mode as Gate['operation'] };
  };
  const parent = makeGate(policy.parent, method === 'list' || method === 'read' ? 'read' : 'update');
  const child = makeGate(
    policy.child,
    `subs.${sub}.${access}`,
    mutation ? 'inputFields' : method !== 'delete' ? 'outputFields' : undefined,
    method !== 'create',
  );
  const call: SubdocumentCall = { sub, method, scoped: raw !== undefined, parent, child };
  let outputChild = child;
  if (mutation) {
    const visibility = policy.visibility === undefined ? {} : authorizationRecord(policy.visibility, 'visibility');
    assertAuthorizationKeys(
      visibility,
      method === 'create' ? ['parent', 'child', 'list'] : ['parent', 'child'],
      'visibility',
    );
    call.visibility = {
      parent: makeGate(visibility.parent, 'read'),
      child: makeGate(visibility.child, `subs.${sub}.read`, 'outputFields'),
      ...(method === 'create' ? { list: makeGate(visibility.list, `subs.${sub}.list`) } : {}),
    };
    outputChild = call.visibility.child;
  }
  if (method !== 'delete') {
    const state = readServiceExecution(service, outputChild.execution);
    const view = readServiceAuthorization(state.authorization, state.binding);
    call.output = prepareSubdocumentOutput(
      service,
      sub,
      operation,
      access,
      method === 'list' ? 'list' : 'read',
      input.select as Projection,
      genSubPopulate(sub, input.populate as SubPopulate | SubPopulate[]),
      {
        configuration,
        permissions: getAuthorizationPermissions(state.authorization, state.binding),
        authorization: { outputFields: view.authorization.outputFields },
      },
    );
  }
  return call;
}

/** Uses the immutable gate configuration/actor, never changes request permissions. */
export async function subdocumentGateAllowed<T, V extends object>(
  service: Service<T, V>,
  gate: Gate,
): Promise<boolean> {
  if (gate.operation === 'grant') return true;
  const state = readServiceExecution(service, gate.execution);
  const { configuration } = readServiceAuthorization(state.authorization, state.binding);
  const access = state.access.rowAccess!;
  let guard: unknown;
  if (access.startsWith('subs.')) {
    const [, sub, op] = access.split('.');
    guard = get(configuration, `operationAccess.${access}`);
    if (guard === undefined) guard = get(configuration, `operationAccess.subs.${sub}`);
    if (guard === undefined) guard = getCapturedAuthorizationOption(configuration, `operationAccess.${op}`);
  } else guard = getCapturedAuthorizationOption(configuration, `operationAccess.${access}`);
  return evaluateRouteGuard(
    state.binding.request as ModelRequest,
    getAuthorizationPermissions(state.authorization, state.binding),
    guard as Validation,
  );
}

export async function subdocumentRows<T, V extends object>(
  service: Service<T, V>,
  gate: Gate,
  filter: Filter = {},
  mandatory: Filter = {},
  sub?: string,
): Promise<Filter> {
  if (filter === false || mandatory === false || isExecutionRowDenied(service, gate.execution)) return false;
  // A transform may mutate its query in place. Mandatory identifiers/selection must
  // already be detached, exactly as in prepareModelQuery's private boundary.
  const required = copyAuthorizationValue(mandatory);
  const state = readServiceExecution(service, gate.execution);
  const { configuration } = readServiceAuthorization(state.authorization, state.binding);
  const ordinary = deepIsolateValue(filter);
  // Preserve dedicated list's original contract: strip client virtual keys before
  // transformation; neither supplied scope nor configured transform results are stripped.
  const query =
    sub && state.access.rowAccess === `subs.${sub}.list`
      ? stripSubVirtualKeysFromFilter(ordinary, { virtuals: configuration.virtuals as Record<string, unknown> }, sub)
      : ordinary;
  const parts = await getServiceExecutors(service).authorize(gate.execution, query as Filter<T>);
  return parts.filter === false
    ? false
    : intersectFilters(parts.transformed as Filter, parts.scope as Filter, required);
}

export async function subdocumentParentFilter<T, V extends object>(
  service: Service<T, V>,
  gate: Gate,
  id: string,
): Promise<Filter<T>> {
  if (isExecutionRowDenied(service, gate.execution)) return false;
  const state = readServiceExecution(service, gate.execution);
  const { configuration } = readServiceAuthorization(state.authorization, state.binding);
  const identifier = await resolveIdentifierFilter<T>(
    state.binding.request as ModelRequest,
    configuration.idField as string | undefined,
    configuration.resolveIdFilter as Parameters<typeof resolveIdentifierFilter<T>>[2],
    id,
  );
  return subdocumentRows(service, gate, identifier, identifier) as Promise<Filter<T>>;
}

export function subdocumentInputPolicy<T, V extends object>(service: Service<T, V>, call: SubdocumentCall) {
  const state = readServiceExecution(service, call.child.execution);
  const view = readServiceAuthorization(state.authorization, state.binding);
  return {
    ...state,
    configuration: view.configuration,
    inputFields: view.authorization.inputFields as FieldAuthorization,
  };
}
