/** Shared authenticated output decisions and existing-value filtering. No row or write admission. */
import { isPlainObject } from '@web-ts-toolkit/utils';
import { attachPermissionsAlias } from '../output/permissions-alias';
import type { ModelHookContext, ModelRequest } from '../interfaces';
import type { DocumentAuthorization } from '../interfaces/service-authorization';
import type { AccessRuntime } from '../runtime';
import type { AccessRouterPermissions } from '../permission';
import { deepIsolateValue, isolateDocForOutput } from '../helpers/document';
import { getRequestWorkState } from '../helpers/request-work';
import { warn as warnLog } from '../logger-helpers';
import { authorizationError } from './authorization-snapshot';
import {
  assertDocumentAuthorization,
  assertDocumentAuthorizationStage,
  associateDocumentAuthorization,
  createDocumentAuthorizationStage,
  getAssociatedDocumentAuthorization,
  isKnownAuthorizationOutput,
  memoizeDocumentFieldDecision,
  normalizeOutputAuthorizationOptions,
  readDocumentAuthorization,
  resolveDocumentAuthorization,
  transferDocumentAuthorization,
  transferDocumentAuthorizationGraph,
} from './document-authorization';
import type { DocumentAuthorizationStage } from './document-authorization';
import {
  getAuthorizationPermissions,
  getAuthorizationProvenance,
  readServiceAuthorization,
  resolveServiceAuthorization,
  serviceAuthorizationInput,
} from './service-authorization';
import type { AuthorizationBinding, ResolvedServiceAuthorization } from './service-authorization';
import { captureModelAuthorizationConfiguration, getCapturedAuthorizationOption } from './model-output-planning';
import {
  classifyEffectiveFieldAuthorization,
  evaluateEffectiveFieldAuthorization,
  evaluateScopedAccessRule,
  extractOutputFieldRuleEntries,
  hasExplicitFieldGrant,
} from './field-authorization';
import { isCatalogOutputPath, isSafeOutputPath, matchesCatalogPattern } from './field-catalog';
import { planCatalogProjection } from './output-projection';
import type { VirtualProjectionPlan, VirtualProjectionSnapshot } from './virtual-projection';

// A fresh policy on a known trimmed output cannot reconstruct document-dependent authority.
const unresolvedDocuments = new WeakSet<DocumentAuthorization>();
const owningDocuments = new WeakMap<
  DocumentAuthorization,
  { handle: DocumentAuthorization; binding: AuthorizationBinding }
>();

export async function resolveOutputDocumentAuthorization(args: {
  authorization: ResolvedServiceAuthorization;
  binding: AuthorizationBinding;
  snapshot: Record<string, unknown>;
  context: ModelHookContext;
  stage?: DocumentAuthorizationStage;
  owningDocument?: DocumentAuthorization;
  owningBinding?: AuthorizationBinding;
  knownOutput?: boolean;
}): Promise<DocumentAuthorization> {
  const { authorization, binding } = args;
  const { configuration, access } = readServiceAuthorization(authorization, binding);
  const stage = args.stage ?? createDocumentAuthorizationStage(authorization, binding, args.snapshot);
  if (args.stage) assertDocumentAuthorizationStage(stage, authorization, binding, args.snapshot);
  const handle = await resolveDocumentAuthorization(stage, async function (doc, permissions) {
    if (args.owningDocument) return readDocumentAuthorization(args.owningDocument, args.owningBinding!).grants;
    if (args.knownOutput) return {};
    const hook = getCapturedAuthorizationOption(configuration, `docPermissions.${access.docPermissionsAccess}`);
    if (typeof hook !== 'function') return {};
    try {
      const run = () => hook.call(this, doc, permissions, args.context);
      const grants = await getRequestWorkState(binding.request, binding.runtime as AccessRuntime).hookGate.run(run);
      return isPlainObject(grants) ? grants : {};
    } catch (error) {
      warnLog('docPermissions hook failed; applying empty document permissions', {
        modelName: binding.modelName,
        access: access.docPermissionsAccess,
        operation: access.operation,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  });
  if (args.knownOutput || (args.owningDocument && unresolvedDocuments.has(args.owningDocument)))
    unresolvedDocuments.add(handle);
  if (args.owningDocument) owningDocuments.set(handle, { handle: args.owningDocument, binding: args.owningBinding! });
  return handle;
}

function evaluateRequestRule(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  entry: { path: string; rule: unknown },
  prefix: string,
  access: string,
): Promise<boolean> {
  const owner = owningDocuments.get(handle);
  if (owner && !entry.path.startsWith(`${(binding.scopePath ?? []).join('.')}.`)) {
    return evaluateRequestRule(owner.handle, owner.binding, entry, prefix, access);
  }
  return memoizeDocumentFieldDecision(
    handle,
    binding,
    `request:${access}:${entry.path}`,
    function (permissions, grants) {
      return evaluateScopedAccessRule({
        req: this,
        rule: entry.rule,
        globalPermissions: permissions,
        docPermissions: grants,
        modelPermissionPrefix: prefix,
      });
    },
  );
}

/** One effective decision per path in this document/scope/stage, shared by finalizers and picks. */
export function evaluateAuthorizedOutputField(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  field: string,
): Promise<boolean> {
  const { authorization } = readDocumentAuthorization(handle, binding);
  const { configuration, authorization: policy, access } = readServiceAuthorization(authorization, binding);
  const path = [...(binding.scopePath ?? []), field].join('.');
  const entries = extractOutputFieldRuleEntries(
    configuration.permissionSchema as Record<string, unknown>,
    path,
    access.outputAccess,
  );
  return memoizeDocumentFieldDecision(handle, binding, `output:${path}`, function (permissions, grants) {
    const args = {
      path,
      rules: entries.map((entry) => entry.rule),
      outputFields: policy.outputFields,
      globalPermissions: permissions,
      modelPermissionPrefix: (configuration.modelPermissionPrefix as string) ?? '',
    };
    if (unresolvedDocuments.has(handle) && classifyEffectiveFieldAuthorization(args) !== 'granted') return false;
    return evaluateEffectiveFieldAuthorization({
      ...args,
      req: this,
      docPermissions: grants,
      evaluateRule: (_rule, index) =>
        evaluateRequestRule(handle, binding, entries[index], args.modelPermissionPrefix, access.outputAccess),
    });
  });
}

/** Request-user metadata only; shares request decisions, never includes backend field grants. */
export async function requestOutputFieldPaths(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  access: string,
): Promise<string[]> {
  const { authorization } = readDocumentAuthorization(handle, binding);
  const { configuration } = readServiceAuthorization(authorization, binding);
  const schema = configuration.permissionSchema as Record<string, unknown> | undefined;
  const fields: string[] = [];
  for (const path of Object.keys(schema ?? {})) {
    const entries = extractOutputFieldRuleEntries(schema, path, access);
    let allowed = true;
    for (const entry of entries) {
      if (
        !(await evaluateRequestRule(
          handle,
          binding,
          entry,
          (configuration.modelPermissionPrefix as string) ?? '',
          access,
        ))
      ) {
        allowed = false;
        break;
      }
    }
    if (allowed && entries.length) fields.push(path);
  }
  return fields;
}

/** Embedded scopes inherit the owning model policy, but get per-element stage/decision owners. */
export function authorizeEmbeddedOutputPlan(
  parent: VirtualProjectionPlan,
  child: VirtualProjectionPlan,
): VirtualProjectionPlan {
  const binding = {
    ...parent.authorizationBinding!,
    scopePath: child.responseScopePath ?? child.scopePath.filter((p) => p !== 'sub'),
  };
  const view = readServiceAuthorization(parent.authorization!, parent.authorizationBinding!);
  const authorization = resolveServiceAuthorization({
    binding,
    ...view,
    requestPermissions: getAuthorizationPermissions(parent.authorization!, parent.authorizationBinding!),
    authorization: serviceAuthorizationInput(view.authorization, view.relatedTargets),
    parent: parent.authorization,
  });
  return { ...child, authorization, authorizationBinding: binding };
}

/** Only a selected eligible value root can have whole-subtree authority. Declared
 * embedded containers and descendant-only selections have no root field state.
 */
export function hasWholeOutputValueGrant(plan: VirtualProjectionPlan, field: string): boolean {
  if (plan.fieldStates?.[field] !== 'granted') return false;
  const binding = plan.authorizationBinding!;
  const { authorization } = readServiceAuthorization(plan.authorization!, binding);
  return hasExplicitFieldGrant(authorization.outputFields, [...(binding.scopePath ?? []), field].join('.'));
}

/** Safe value copy for scalar/opaque roots and computed values; metadata is a separate channel. */
export function copyOutputValue(value: unknown, plan: VirtualProjectionPlan, path: string): unknown {
  const { configuration } = readServiceAuthorization(plan.authorization!, plan.authorizationBinding!);
  const virtualValue = configuration.catalog.virtualPaths?.some((p) => matchesCatalogPattern(p, path));
  const opaque = configuration.catalog.opaquePaths?.some((p) => matchesCatalogPattern(p, path));
  const excluded = plan.effectiveSelectNorm
    .filter((token) => token.startsWith('-'))
    .map((token) => [...(plan.authorizationBinding!.scopePath ?? []), token.slice(1)].join('.'));
  const visit = (input: unknown, current: string): unknown => {
    if (Array.isArray(input)) return input.map((entry) => visit(entry, current));
    if (input instanceof Map) return visit(Object.fromEntries(input), current);
    if (!isPlainObject(input)) return deepIsolateValue(input);
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(input)) {
      const child = `${current}.${key}`;
      if (excluded.some((entry) => child === entry || child.startsWith(`${entry}.`))) continue;
      // An authorized opaque root is a value, not a policy path. Inert escaped
      // marker-shaped business keys survive; prototype/implementation keys do not.
      const safeValueKey = !['__proto__', 'constructor', 'prototype', '_doc', '$__', '__v'].includes(key);
      if (
        !(opaque ? safeValueKey : isSafeOutputPath(key)) ||
        configuration.catalog.protectedPaths?.some((p) => matchesCatalogPattern(p, child, true)) ||
        (!opaque && !virtualValue && !isCatalogOutputPath(configuration.catalog, child))
      )
        continue;
      output[key] = visit(entry, child);
    }
    return output;
  };
  return visit(value, path);
}

/** A populated DTO needs its target's authenticated stage. Parent authority covers only the ref. */
export function copyAuthorizedReference(value: unknown, plan: VirtualProjectionPlan, path: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => copyAuthorizedReference(entry, plan, path));
  if (!isPlainObject(value)) return deepIsolateValue(value);
  const handle = getAssociatedDocumentAuthorization(value, plan.authorization);
  if (handle) {
    // Lookup is identity authenticated; verify provenance without treating exposed metadata as state.
    const copy = deepIsolateValue(value);
    transferDocumentAuthorizationGraph(value, copy);
    return copy;
  }
  return Object.prototype.hasOwnProperty.call(value, '_id') ? deepIsolateValue(value._id) : undefined;
}

/** Metadata posture never changes internal grants and never synthesizes request privileges. */
export function retainOutputMetadata(
  output: Record<string, unknown>,
  source: Record<string, unknown>,
  configuration: Record<string, unknown>,
  scope: readonly string[],
): void {
  if (scope.length || configuration.stripPermissionsField) return;
  const parts = ((configuration.documentPermissionField as string) ?? '_permissions').split('.');
  let value: unknown = source;
  for (const part of parts) value = isPlainObject(value) ? value[part] : undefined;
  if (!isPlainObject(value)) return;
  const keys = configuration.exposedDocPermissionKeys as string[] | undefined;
  const metadata = Object.fromEntries(
    Object.entries(value).filter(([key]) =>
      key === '_view' || key === '_edit' ? !configuration.disableFieldPermissions : !keys || keys.includes(key),
    ),
  );
  // Metadata may live under an already-authorized embedded container. Build an
  // explicit copy before adding it; mutating that container would stale its handle.
  const copy = { ...output };
  let target = copy;
  for (const part of parts.slice(0, -1)) {
    target[part] = isPlainObject(target[part]) ? { ...target[part] } : {};
    target = target[part] as Record<string, unknown>;
  }
  target[parts[parts.length - 1]] = deepIsolateValue(metadata);
  transferDocumentAuthorizationGraph(output[parts[0]], copy[parts[0]]);
  output[parts[0]] = copy[parts[0]];
  attachPermissionsAlias(output, parts.join('.'));
}

function helperPlan(authorization: ResolvedServiceAuthorization, binding: AuthorizationBinding): VirtualProjectionPlan {
  const { configuration, authorization: policy, access } = readServiceAuthorization(authorization, binding);
  if (binding.scopePath?.length && !isCatalogOutputPath(configuration.catalog, binding.scopePath.join('.')))
    authorizationError('unknown output scope');
  // Picking filters existing values; requireExplicitSelect and requested selection do not apply.
  const plan = planCatalogProjection(
    {
      receivingModelName: binding.modelName,
      snapshot: configuration as VirtualProjectionSnapshot,
      ...access,
      effectiveSelect: [],
      scopePath: (binding.scopePath ?? []).flatMap((part) => [part, 'sub']),
      globalPermissions: getAuthorizationPermissions(authorization, binding),
    },
    policy.outputFields,
  );
  return { ...plan, authorization, authorizationBinding: binding };
}

async function filterExistingOutput(
  source: Record<string, unknown>,
  plan: VirtualProjectionPlan,
  handle: DocumentAuthorization,
  associated: boolean,
): Promise<{ output: Record<string, unknown>; fields: string[] }> {
  const binding = plan.authorizationBinding!;
  const { configuration } = readServiceAuthorization(plan.authorization!, binding);
  const output: Record<string, unknown> = {};
  const fields: string[] = [];
  for (const field of new Set([...plan.outputPersistedFields, ...plan.outputVirtualNames])) {
    if (!Object.prototype.hasOwnProperty.call(source, field) || source[field] === undefined) continue;
    const childPlan = plan.childPlans[field];
    if (childPlan && !hasWholeOutputValueGrant(plan, field)) {
      const scoped = authorizeEmbeddedOutputPlan(plan, childPlan);
      const childFields = new Set<string>();
      const one = async (value: unknown): Promise<unknown> => {
        if (Array.isArray(value)) {
          const values: unknown[] = [];
          for (const entry of value) values.push((await one(entry)) ?? null);
          return values;
        }
        // Descendant authority cannot authorize an unrelated scalar ancestor.
        // Null containers/array positions convey shape without exposing values.
        if (!isPlainObject(value)) return value === null ? null : undefined;
        const childHandle = associated ? getAssociatedDocumentAuthorization(value) : undefined;
        let child = scoped;
        if (childHandle) {
          const state = readDocumentAuthorization(childHandle, scoped.authorizationBinding!);
          if (getAuthorizationProvenance(state.authorization) !== getAuthorizationProvenance(plan.authorization!))
            authorizationError('child call mismatch');
          child = helperPlan(state.authorization, scoped.authorizationBinding!);
        }
        const resolved =
          childHandle ??
          (await resolveOutputDocumentAuthorization({
            authorization: child.authorization!,
            binding: child.authorizationBinding!,
            snapshot: isolateDocForOutput(value) as Record<string, unknown>,
            context: {
              modelName: binding.modelName,
              mongooseModel: binding.model as ModelHookContext['mongooseModel'],
              operation: plan.outputAccess,
            },
            owningDocument: handle,
            owningBinding: binding,
          }));
        const result = await filterExistingOutput(value, child, resolved, !!childHandle);
        result.fields.forEach((path) => childFields.add(`${field}.${path}`));
        return result.output;
      };
      // Serial child work does not multiply hook concurrency or share element decision caches.
      const value = await one(source[field]);
      if (value !== undefined) output[field] = value;
      fields.push(...childFields);
    } else if (await evaluateAuthorizedOutputField(handle, binding, field)) {
      const path = [...(binding.scopePath ?? []), field].join('.');
      output[field] = configuration.catalog.referencePaths?.some((p) => matchesCatalogPattern(p, path))
        ? copyAuthorizedReference(source[field], plan, path)
        : copyOutputValue(source[field], plan, path);
      if (associated) transferDocumentAuthorizationGraph(source[field], output[field]);
      if (output[field] !== undefined) fields.push(field);
      else delete output[field];
    }
  }
  if (plan.fetchIdRetained && Object.prototype.hasOwnProperty.call(source, '_id')) {
    output._id = deepIsolateValue(source._id);
    fields.push('_id');
  }
  retainOutputMetadata(output, source, configuration, binding.scopePath ?? []);
  if (associated)
    transferDocumentAuthorization(
      handle,
      { binding, output: source, outputAccess: plan.outputAccess, authorization: plan.authorization },
      output,
    );
  else associateDocumentAuthorization(handle, binding, output);
  return { output, fields: [...new Set(fields)] };
}

export async function filterModelOutputForHelper(args: {
  request: ModelRequest;
  runtime: AccessRuntime;
  modelName: string;
  access: string;
  permissions: AccessRouterPermissions;
  doc: unknown;
  options: unknown;
  purpose?: 'output';
}): Promise<{ output: unknown; fields: string[] }> {
  const { request, runtime, modelName, access } = args;
  const model = runtime.getModelInstance(modelName);
  if (!model) return authorizationError(`unknown receiving model: ${modelName}`);
  const receiver = { request, runtime, model, modelName };
  const normalized = normalizeOutputAuthorizationOptions(
    {
      binding: receiver,
      configuration: captureModelAuthorizationConfiguration(runtime, modelName),
      requestPermissions: args.permissions,
      access: { operation: access, virtualAccess: access, outputAccess: access, docPermissionsAccess: access },
    },
    args.options,
    args.purpose,
  );
  if (normalized.kind === 'document') {
    const { documentAuthorization: handle, binding } = normalized;
    assertDocumentAuthorization(handle, { binding, output: args.doc as object, outputAccess: access });
    const state = readDocumentAuthorization(handle, binding);
    return filterExistingOutput(
      args.doc as Record<string, unknown>,
      helperPlan(state.authorization, binding),
      handle,
      true,
    );
  }
  const binding = { ...receiver, scopePath: (args.options as { scopePath?: readonly string[] }).scopePath };
  const plan = helperPlan(normalized.authorization, binding);
  if (args.doc == null) return { output: args.doc, fields: [] };
  const source = isolateDocForOutput(args.doc);
  if (!isPlainObject(source)) return authorizationError('output helper requires one plain or hydrated document');
  const knownOutput = !!args.doc && typeof args.doc === 'object' && isKnownAuthorizationOutput(args.doc);
  const handle = await resolveOutputDocumentAuthorization({
    authorization: normalized.authorization,
    binding,
    snapshot: deepIsolateValue(source),
    context: { modelName, mongooseModel: model as ModelHookContext['mongooseModel'], operation: access },
    knownOutput,
  });
  return filterExistingOutput(source, plan, handle, false);
}
