/** Shared authenticated output decisions and existing-value filtering. No row or write admission. */
import { types } from 'node:util';
import { isPlainObject } from '@web-ts-toolkit/utils';
import { attachPermissionsAlias } from '../output/permissions-alias';
import type { ModelHookContext, ModelRequest } from '../interfaces';
import type { DocumentAuthorization } from '../interfaces/service-authorization';
import type { AccessRuntime } from '../runtime';
import type { AccessRouterPermissions } from '../permission';
import { deepIsolateValue, isolateDocForOutput } from '../helpers/document';
import { getRequestWorkState } from '../helpers/request-work';
import { warn as warnLog } from '../logger-helpers';
import { authorizationError, copyAuthorizationValue } from './authorization-snapshot';
import {
  assertDocumentAuthorization,
  assertDocumentAuthorizationStage,
  associateDocumentAuthorization,
  bindOutputDocumentOwner,
  createDocumentAuthorizationStage,
  createTrustedOutputMemberBuilder,
  getAssociatedDocumentAuthorization,
  getIssuedEmbeddedDocumentAuthorization,
  isKnownAuthorizationOutput,
  isIssuedOutputMember,
  isTrustedDocumentAuthorization,
  isUnresolvedOutputDocument,
  memoizeDocumentFieldDecision,
  normalizeOutputAuthorizationOptions,
  readDocumentAuthorization,
  readDocumentAuthorizationAccess,
  readOutputDocumentOwner,
  prepareQueryDocumentAuthorization,
  retainTrustedOutputMember,
  retainTrustedOutputSpine,
  resolveDocumentAuthorization,
  transferDocumentAuthorization,
  transferDocumentAuthorizationGraph,
  tryStaticOutputFieldDecisions,
  tryStaticRequestFieldPaths,
} from './document-authorization';
import type { DocumentAuthorizationStage, TrustedOutputMemberBuilder } from './document-authorization';
import {
  assertAuthorizationBinding,
  getAuthorizationPermissions,
  getAuthorizationProvenance,
  readServiceAuthorization,
  readServiceAuthorizationAccess,
  readAuthorizationFastPath,
  deriveTrustedQueryAuthorization,
  readServiceDocumentPermissions,
  readServiceOutputPolicy,
  resolveServiceAuthorization,
  serviceAuthorizationInput,
} from './service-authorization';
import type {
  AuthorizationBinding,
  AuthorizationConfiguration,
  ResolvedServiceAuthorization,
} from './service-authorization';
import { captureModelAuthorizationConfiguration, getCapturedAuthorizationOption } from './model-output-planning';
import {
  classifyEffectiveFieldAuthorization,
  evaluateScopedAccessRule,
  evaluateScopedAccessRuleValue,
  hasExplicitFieldGrant,
} from './field-authorization';
import { isCatalogOutputPath, isSafeOutputPath, matchesCatalogPattern } from './field-catalog';
import { planAuthorizedModelProjection, readStaticOutputPlanFields } from './output-projection';
import type { VirtualProjectionPlan } from './virtual-projection';
import {
  callFieldPolicy,
  prepareOutputPath,
  requestRuleClassification,
  type PreparedRequestRule,
} from './output-field-policy';
import {
  createTrustedOutputBudget,
  defineTrustedOutputValue,
  materializeTrustedOutputValue,
  setTrustedOutputPath,
  shallowTrustedOutputArray,
  trustedMapOutputScope,
  visitTrustedOutput,
  type TrustedOutputBudget,
} from './trusted-output-materialization';

function assertOwningOutputDocuments(handle: DocumentAuthorization): void {
  const owner = readOutputDocumentOwner(handle);
  if (owner) {
    readDocumentAuthorizationAccess(owner.handle, owner.binding);
    assertOwningOutputDocuments(owner.handle);
  }
}

interface ResolveOutputDocumentAuthorizationArgs {
  authorization: ResolvedServiceAuthorization;
  binding: AuthorizationBinding;
  snapshot: Record<string, unknown>;
  context: ModelHookContext;
  stage?: DocumentAuthorizationStage;
  owningDocument?: DocumentAuthorization;
  owningBinding?: AuthorizationBinding;
  knownOutput?: boolean;
}

/** Per-finalizer-pass preparation. Share only the hook identity and validated
 * primitive access tuple, never mutable configuration leaves with row callbacks.
 * The supplied configuration is a package-owned detached read, not a public plan.
 */
export function prepareOutputDocumentAuthorization(
  authorization: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  configuration: AuthorizationConfiguration,
): (args: ResolveOutputDocumentAuthorizationArgs) => Promise<DocumentAuthorization> {
  const access = readServiceAuthorizationAccess(authorization, binding);
  const key = `docPermissions.${access.docPermissionsAccess}`;
  const docPermissions = configuration.docPermissions;
  // Captured plain records have immutable own slots. A bare function can have
  // mutable access/default properties (including getters); native parents can
  // also execute application methods. Compound access paths can traverse those
  // parents too. Keep such lookups per resolution, with a fresh copy of just
  // this slice, rather than caching a mutable authority.
  const invariant =
    /^[A-Za-z0-9_-]+$/.test(access.docPermissionsAccess) && (docPermissions == null || isPlainObject(docPermissions));
  const option = invariant ? getCapturedAuthorizationOption(configuration, key) : undefined;
  const hook = typeof option === 'function' ? option : undefined;
  const trusted = readAuthorizationFastPath(authorization, binding)?.mode === 'active';
  const resolveHook = invariant
    ? () => hook
    : trusted
      ? () => {
          const option = getCapturedAuthorizationOption(configuration, key);
          return typeof option === 'function' ? option : undefined;
        }
      : () => {
          const slice = { catalog: configuration.catalog, ...copyAuthorizationValue({ docPermissions }, true) };
          const option = getCapturedAuthorizationOption(slice, key);
          return typeof option === 'function' ? option : undefined;
        };
  return async (args) => {
    if (args.authorization !== authorization) authorizationError('document resolver call mismatch');
    assertAuthorizationBinding(authorization, args.binding);
    return resolveOutputDocumentAuthorizationWithHook(args, access, resolveHook);
  };
}

export async function resolveOutputDocumentAuthorization(
  args: ResolveOutputDocumentAuthorizationArgs,
): Promise<DocumentAuthorization> {
  const configuration = readServiceDocumentPermissions(args.authorization, args.binding);
  return prepareOutputDocumentAuthorization(args.authorization, args.binding, configuration)(args);
}

async function resolveOutputDocumentAuthorizationWithHook(
  args: ResolveOutputDocumentAuthorizationArgs,
  access: ReturnType<typeof readServiceAuthorizationAccess>,
  resolveHook: () => Function | undefined,
): Promise<DocumentAuthorization> {
  const { authorization, binding } = args;
  const stage = args.stage ?? createDocumentAuthorizationStage(authorization, binding, args.snapshot);
  if (args.stage) assertDocumentAuthorizationStage(stage, authorization, binding, args.snapshot);
  const handle = await resolveDocumentAuthorization(stage, async function (doc, permissions) {
    if (args.owningDocument) return readDocumentAuthorization(args.owningDocument, args.owningBinding!).grants;
    if (args.knownOutput) return {};
    const hook = resolveHook();
    if (!hook) return {};
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
  bindOutputDocumentOwner(handle, args.knownOutput, args.owningDocument, args.owningBinding);
  return handle;
}

function evaluateRequestRule(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  entry: PreparedRequestRule,
  prefix: unknown,
  access: string,
): boolean | Promise<boolean> {
  assertOwningOutputDocuments(handle);
  const owner = readOutputDocumentOwner(handle);
  if (owner && !entry.path.startsWith(`${(binding.scopePath ?? []).join('.')}.`)) {
    return evaluateRequestRule(owner.handle, owner.binding, entry, prefix, access);
  }
  if (isTrustedDocumentAuthorization(handle, binding))
    return memoizeDocumentFieldDecision(
      handle,
      binding,
      `request:${access}:${entry.path}`,
      function (permissions, grants) {
        const { authorization } = readDocumentAuthorizationAccess(handle, binding);
        const classification = requestRuleClassification(entry, authorization, permissions, prefix);
        const allowed =
          classification?.decision ??
          evaluateScopedAccessRuleValue({
            req: this,
            rule: entry.rule,
            globalPermissions: permissions,
            docPermissions: grants,
            modelPermissionPrefix: prefix as string,
          });
        if (typeof allowed !== 'boolean')
          return (async () => {
            const result = await allowed;
            assertOwningOutputDocuments(handle);
            readDocumentAuthorizationAccess(handle, binding);
            return result;
          })();
        assertOwningOutputDocuments(handle);
        return allowed;
      },
    );
  return memoizeDocumentFieldDecision(
    handle,
    binding,
    `request:${access}:${entry.path}`,
    async function (permissions, grants) {
      const { authorization } = readDocumentAuthorizationAccess(handle, binding);
      const classification = requestRuleClassification(entry, authorization, permissions, prefix);
      let allowed = classification?.decision;
      if (allowed === undefined) {
        // Rules already come from an owned read (or a retained function's live
        // slots). Copying again can normalize an invalid BSON rule into a grant.
        // Object/native prefixes are resolution-local, never retained in the
        // call cache, so their coercion receiver also keeps legacy semantics.
        allowed = await evaluateScopedAccessRule({
          req: this,
          rule: entry.rule,
          globalPermissions: permissions,
          docPermissions: grants,
          modelPermissionPrefix: prefix as string,
        });
      }
      assertOwningOutputDocuments(handle);
      return allowed;
    },
  );
}

/** One effective decision per path in this document/scope/stage, shared by finalizers and picks. */
export function evaluateAuthorizedOutputField(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  field: string,
): boolean | Promise<boolean> {
  const { authorization } = readDocumentAuthorizationAccess(handle, binding);
  assertOwningOutputDocuments(handle);
  const path = [...(binding.scopePath ?? []), field].join('.');
  const trusted = isTrustedDocumentAuthorization(handle, binding);
  if (trusted)
    return memoizeDocumentFieldDecision(handle, binding, `output:${path}`, function (permissions) {
      const policy = callFieldPolicy(authorization, binding);
      const { outputAccess } = readDocumentAuthorizationAccess(handle, binding);
      const prepared = prepareOutputPath(policy, authorization, binding, path, outputAccess);
      const unresolved = isUnresolvedOutputDocument(handle);
      const state = unresolved
        ? (prepared.state ??
          classifyEffectiveFieldAuthorization({
            path,
            rules: prepared.entries.map((entry) => entry.rule),
            modelPermissionPrefix: policy.prefix as string,
            outputFields: policy.outputFields,
            globalPermissions: permissions,
          }))
        : undefined;
      if (unresolved && state !== 'granted') return false;
      if (prepared.backendGrant) return true;
      const finish = () => {
        assertOwningOutputDocuments(handle);
        readDocumentAuthorizationAccess(handle, binding);
      };
      return orderedRequestRules(
        prepared.entries,
        (entry) => evaluateRequestRule(handle, binding, entry, policy.prefix, outputAccess),
        finish,
      );
    });
  // Hits still validate the stage/binding, but do not read/copy configuration or
  // extract rules. A mutable public plan's fieldStates is never consulted.
  const decision = memoizeDocumentFieldDecision(handle, binding, `output:${path}`, async function (permissions) {
    const policy = callFieldPolicy(authorization, binding);
    const { outputAccess } = readDocumentAuthorizationAccess(handle, binding);
    const prepared = prepareOutputPath(policy, authorization, binding, path, outputAccess);
    const unresolved = isUnresolvedOutputDocument(handle);
    const state = unresolved
      ? (prepared.state ??
        classifyEffectiveFieldAuthorization({
          path,
          rules: prepared.entries.map((entry) => entry.rule),
          modelPermissionPrefix: policy.prefix as string,
          outputFields: policy.outputFields,
          globalPermissions: permissions,
        }))
      : undefined;
    let allowed: boolean;
    if (unresolved && state !== 'granted') allowed = false;
    else if (prepared.backendGrant) allowed = true;
    else {
      // Even static entries must consult/populate their stage's request memo in
      // order. Skipping to a later denial drops earlier stateful callbacks;
      // bypassing the memo also changes exact/nested ancestor decision reuse.
      allowed = true;
      for (const entry of prepared.entries) {
        if (!(await evaluateRequestRule(handle, binding, entry, policy.prefix, outputAccess))) {
          allowed = false;
          break;
        }
      }
    }
    assertOwningOutputDocuments(handle);
    return allowed;
  });
  return readOutputDocumentOwner(handle)
    ? (decision as Promise<boolean>).then((allowed) => {
        assertOwningOutputDocuments(handle);
        return allowed;
      })
    : decision;
}

/** Shared ordered extractor results; no speculative callbacks or await for a settled boolean. */
function orderedRequestRules(
  entries: readonly PreparedRequestRule[],
  evaluate: (entry: PreparedRequestRule) => boolean | Promise<boolean>,
  check: () => void,
): boolean | Promise<boolean> {
  for (let index = 0; index < entries.length; index++) {
    const value = evaluate(entries[index]);
    if (typeof value !== 'boolean')
      return (async () => {
        if (!(await value)) {
          check();
          return false;
        }
        check();
        for (let next = index + 1; next < entries.length; next++) {
          const result = evaluate(entries[next]);
          if (!(typeof result === 'boolean' ? result : await result)) {
            check();
            return false;
          }
          check();
        }
        return true;
      })();
    if (!value) {
      check();
      return false;
    }
  }
  check();
  return true;
}

/** Request-user metadata only; shares request decisions, never includes backend field grants. */
export async function requestOutputFieldPaths(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  access: string,
): Promise<string[]> {
  const staticFields = tryStaticRequestFieldPaths(handle, binding, access);
  if (staticFields) {
    // One resume boundary for the entire pass, never an await per scalar field.
    if (!isTrustedDocumentAuthorization(handle, binding)) await Promise.resolve();
    readDocumentAuthorizationAccess(handle, binding);
    return staticFields;
  }
  const { authorization } = readDocumentAuthorizationAccess(handle, binding);
  assertOwningOutputDocuments(handle);
  const policy = callFieldPolicy(authorization, binding);
  const fields: string[] = [];
  for (const path of policy.requestPaths ?? Object.keys(policy.schema ?? {})) {
    const { entries } = prepareOutputPath(policy, authorization, binding, path, access);
    let allowed = true;
    for (const entry of entries) {
      const decision = evaluateRequestRule(handle, binding, entry, policy.prefix, access);
      if (!(typeof decision === 'boolean' ? decision : await decision)) {
        allowed = false;
        break;
      }
    }
    if (allowed && entries.length) fields.push(path);
  }
  assertOwningOutputDocuments(handle);
  readDocumentAuthorizationAccess(handle, binding);
  return fields;
}

const embeddedPlans = new WeakMap<VirtualProjectionPlan, WeakMap<VirtualProjectionPlan, VirtualProjectionPlan>>();

/** Embedded scopes inherit the owning model policy, but get per-element stage/decision owners. */
export function authorizeEmbeddedOutputPlan(
  parent: VirtualProjectionPlan,
  child: VirtualProjectionPlan,
): VirtualProjectionPlan {
  const binding = {
    ...parent.authorizationBinding!,
    scopePath: child.responseScopePath ?? child.scopePath.filter((p) => p !== 'sub'),
  };
  assertAuthorizationBinding(parent.authorization!, parent.authorizationBinding!);
  if (readAuthorizationFastPath(parent.authorization!, parent.authorizationBinding!)?.mode === 'active') {
    if (!Object.values(parent.childPlans).includes(child)) authorizationError('unknown embedded output plan');
    let scopes = embeddedPlans.get(parent);
    if (!scopes) embeddedPlans.set(parent, (scopes = new WeakMap()));
    const previous = scopes.get(child);
    if (previous) {
      assertAuthorizationBinding(previous.authorization!, binding);
      return previous;
    }
    const view = readServiceAuthorization(parent.authorization!, parent.authorizationBinding!);
    const authorization = deriveTrustedQueryAuthorization({
      binding,
      ...view,
      requestPermissions: getAuthorizationPermissions(parent.authorization!, parent.authorizationBinding!),
      parent: parent.authorization,
      snapshotDerivation: { kind: 'embedded', parentBinding: parent.authorizationBinding! },
    });
    if (!authorization) authorizationError('invalid trusted embedded edge');
    const scoped = {
      ...child,
      authorization,
      authorizationBinding: Object.freeze({ ...binding, scopePath: Object.freeze([...(binding.scopePath ?? [])]) }),
    };
    scopes.set(child, scoped);
    return scoped;
  }
  const view = readServiceAuthorization(parent.authorization!, parent.authorizationBinding!);
  const authorization = resolveServiceAuthorization({
    binding,
    ...view,
    requestPermissions: getAuthorizationPermissions(parent.authorization!, parent.authorizationBinding!),
    authorization: serviceAuthorizationInput(view.authorization, view.relatedTargets),
    parent: parent.authorization,
    snapshotDerivation: { kind: 'embedded', parentBinding: parent.authorizationBinding! },
  });
  return { ...child, authorization, authorizationBinding: binding };
}

/** Only a selected eligible value root can have whole-subtree authority. Declared
 * embedded containers and descendant-only selections have no root field state.
 */
export function hasWholeOutputValueGrant(plan: VirtualProjectionPlan, field: string): boolean {
  if (plan.fieldStates?.[field] !== 'granted') return false;
  const binding = plan.authorizationBinding!;
  const { outputFields } = readServiceOutputPolicy(plan.authorization!, binding);
  return hasExplicitFieldGrant(outputFields, [...(binding.scopePath ?? []), field].join('.'));
}

/** Safe value copy for scalar/opaque roots and computed values; metadata is a separate channel. */
export interface TrustedOutputMaterialization {
  readonly budget: TrustedOutputBudget;
  readonly members: TrustedOutputMemberBuilder;
  readonly depth: number;
  /** Retained helpers may reuse only this root's actual issued target membership. */
  readonly rootOutput?: object;
}

export function copyOutputValue(
  value: unknown,
  plan: VirtualProjectionPlan,
  path: string,
  trusted?: TrustedOutputMaterialization,
): unknown {
  const { catalog } = readServiceOutputPolicy(plan.authorization!, plan.authorizationBinding!);
  const virtualValue = catalog.virtualPaths?.some((p) => matchesCatalogPattern(p, path));
  const opaque = catalog.opaquePaths?.some((p) => matchesCatalogPattern(p, path));
  const excluded = plan.effectiveSelectNorm
    .filter((token) => token.startsWith('-'))
    .map((token) => [...(plan.authorizationBinding!.scopePath ?? []), token.slice(1)].join('.'));
  if (trusted)
    return materializeTrustedOutputValue(
      value,
      path,
      trusted.budget,
      {
        keep(key, child) {
          if (excluded.some((entry) => child === entry || child.startsWith(`${entry}.`))) return false;
          return (
            (opaque || isSafeOutputPath(key)) &&
            !catalog.protectedPaths?.some((p) => matchesCatalogPattern(p, child, true)) &&
            (opaque || virtualValue || isCatalogOutputPath(catalog, child))
          );
        },
      },
      trusted.depth,
    );
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
        catalog.protectedPaths?.some((p) => matchesCatalogPattern(p, child, true)) ||
        (!opaque && !virtualValue && !isCatalogOutputPath(catalog, child))
      )
        continue;
      output[key] = visit(entry, child);
    }
    return output;
  };
  return visit(value, path);
}

/** A populated DTO needs its target's authenticated stage. Parent authority covers only the ref. */
export function copyAuthorizedReference(
  value: unknown,
  plan: VirtualProjectionPlan,
  path: string,
  trusted?: TrustedOutputMaterialization,
): unknown {
  if (trusted) {
    const active = new WeakSet<object>();
    const { relatedTargets } = readServiceAuthorization(plan.authorization!, plan.authorizationBinding!);
    const target = relatedTargets.find((entry) => entry.path === path);
    const one = (input: unknown, depth: number): unknown => {
      visitTrustedOutput(trusted.budget, depth);
      if (input && typeof input === 'object' && types.isProxy(input)) authorizationError('unsupported selected proxy');
      if (Array.isArray(input)) {
        if (active.has(input)) authorizationError('cyclic selected output');
        active.add(input);
        try {
          return shallowTrustedOutputArray(input, trusted.budget, depth).map((entry) => one(entry, depth + 1));
        } finally {
          active.delete(input);
        }
      }
      if (isPlainObject(input)) {
        const handle =
          target && (!trusted.rootOutput || isIssuedOutputMember(trusted.rootOutput, input))
            ? getAssociatedDocumentAuthorization(input, plan.authorization)
            : undefined;
        if (handle) {
          const expected: AuthorizationBinding = {
            ...plan.authorizationBinding!,
            model: target.model!,
            modelName: target.modelName,
            scopePath: [],
          };
          readDocumentAuthorizationAccess(handle, expected);
          retainTrustedOutputMember(trusted.members, input);
          return input;
        }
        const id = Object.getOwnPropertyDescriptor(input, '_id');
        if (!id) return undefined;
        if (!('value' in id)) authorizationError('unsupported selected reference');
        return materializeTrustedOutputValue(id.value, path, trusted.budget, { keep: () => true }, depth + 1);
      }
      return materializeTrustedOutputValue(input, path, trusted.budget, { keep: () => true }, depth);
    };
    return one(value, trusted.depth);
  }
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
  trusted?: TrustedOutputMaterialization,
): void {
  if (scope.length || configuration.stripPermissionsField) return;
  const parts = ((configuration.documentPermissionField as string) ?? '_permissions').split('.');
  let value: unknown = source;
  for (const part of parts) value = isPlainObject(value) ? value[part] : undefined;
  if (!isPlainObject(value)) return;
  const keys = configuration.exposedDocPermissionKeys as string[] | undefined;
  if (trusted) {
    const metadata: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      visitTrustedOutput(trusted.budget, trusted.depth + 1);
      if (key === '_view' || key === '_edit' ? configuration.disableFieldPermissions : keys && !keys.includes(key))
        continue;
      defineTrustedOutputValue(metadata, key, value[key]);
    }
    setTrustedOutputPath(output, parts.join('.'), metadata, trusted.budget, trusted.depth, (source, copy) =>
      retainTrustedOutputSpine(trusted.members, source, copy),
    );
    attachPermissionsAlias(output, parts.join('.'));
    return;
  }
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
  // Picking filters existing values; requireExplicitSelect and requested selection do not apply.
  return planAuthorizedModelProjection({ authorization, binding, effectiveSelect: [] });
}

/** Do not gather later decisions across a value getter, traversal or native copy.
 * Primitive own data slots need no application execution while copying. Native
 * *stage* leaves are fine: the decision body never reads document values.
 */
function primitiveHelperFields(source: Record<string, unknown>, plan: VirtualProjectionPlan): string[] | undefined {
  if (types.isProxy(source)) return;
  const canonical = readStaticOutputPlanFields(plan, plan.authorization!);
  if (!canonical) return;
  const fields: string[] = [];
  for (const field of canonical) {
    const slot = Object.getOwnPropertyDescriptor(source, field);
    if (!slot) continue;
    if (!('value' in slot)) return;
    const value = slot.value;
    if ((value !== null && typeof value === 'object') || typeof value === 'function' || typeof value === 'symbol')
      return;
    if (value !== undefined) fields.push(field);
  }
  return fields;
}

async function filterExistingOutput(
  source: Record<string, unknown>,
  plan: VirtualProjectionPlan,
  handle: DocumentAuthorization,
  associated: boolean,
  parentBudget?: TrustedOutputBudget,
  depth = 0,
): Promise<{ output: Record<string, unknown>; fields: string[] }> {
  const binding = plan.authorizationBinding!;
  const trustedStage = isTrustedDocumentAuthorization(handle, binding);
  const budget =
    readAuthorizationFastPath(plan.authorization!, binding)?.mode === 'active'
      ? (parentBudget ?? createTrustedOutputBudget())
      : undefined;
  const members = budget ? createTrustedOutputMemberBuilder(plan.authorization!, binding, budget) : undefined;
  const trusted: TrustedOutputMaterialization | undefined =
    budget && trustedStage
      ? {
          budget,
          members: members!,
          depth,
          rootOutput: associated ? source : undefined,
        }
      : undefined;
  if (trusted) visitTrustedOutput(trusted.budget, depth);
  const { configuration } = readServiceAuthorization(plan.authorization!, binding);
  const output: Record<string, unknown> = {};
  const fields: string[] = [];
  const primitiveFields = primitiveHelperFields(source, plan);
  const staticDecisions = primitiveFields && tryStaticOutputFieldDecisions(handle, binding, plan, primitiveFields);
  if (staticDecisions) {
    if (!trusted) await Promise.resolve();
    // Handle-based helpers authenticate both input stage and exact associated
    // output again after yielding, not merely their memoized field outcomes.
    if (associated) assertDocumentAuthorization(handle, { binding, output: source, outputAccess: plan.outputAccess });
    else readDocumentAuthorizationAccess(handle, binding);
    if (!readStaticOutputPlanFields(plan, plan.authorization!)) authorizationError('changed static output plan');
  }
  for (const field of new Set([...plan.outputPersistedFields, ...plan.outputVirtualNames])) {
    if (!Object.prototype.hasOwnProperty.call(source, field) || source[field] === undefined) continue;
    const childPlan = plan.childPlans[field];
    if (childPlan && !hasWholeOutputValueGrant(plan, field)) {
      const scoped = authorizeEmbeddedOutputPlan(plan, childPlan);
      const childFields = new Set<string>();
      const arrays = new WeakSet<object>();
      const one = async (value: unknown, childDepth = depth + 1): Promise<unknown> => {
        if (Array.isArray(value)) {
          if (trusted && arrays.has(value)) authorizationError('cyclic selected document output');
          const entries = trusted ? shallowTrustedOutputArray(value, trusted.budget, childDepth) : value;
          arrays.add(value);
          const values: unknown[] = [];
          try {
            for (const entry of entries) values.push((await one(entry, childDepth + 1)) ?? null);
          } finally {
            arrays.delete(value);
          }
          return values;
        }
        // Descendant authority cannot authorize an unrelated scalar ancestor.
        // Null containers/array positions convey shape without exposing values.
        if (!isPlainObject(value)) return value === null ? null : undefined;
        const childHandle = associated
          ? trusted
            ? getIssuedEmbeddedDocumentAuthorization(source, value, handle, scoped.authorizationBinding!)
            : getAssociatedDocumentAuthorization(value)
          : undefined;
        let child = scoped;
        if (childHandle) {
          const state = readDocumentAuthorizationAccess(childHandle, scoped.authorizationBinding!);
          if (getAuthorizationProvenance(state.authorization) !== getAuthorizationProvenance(plan.authorization!))
            authorizationError('child call mismatch');
          child = helperPlan(state.authorization, scoped.authorizationBinding!);
        }
        const prepared =
          !childHandle && trusted
            ? prepareQueryDocumentAuthorization(child.authorization!, child.authorizationBinding!, value)
            : undefined;
        const resolved =
          childHandle ??
          (await resolveOutputDocumentAuthorization({
            authorization: child.authorization!,
            binding: child.authorizationBinding!,
            snapshot: prepared?.source ?? (isolateDocForOutput(value) as Record<string, unknown>),
            stage: prepared?.stage,
            context: {
              modelName: binding.modelName,
              mongooseModel: binding.model as ModelHookContext['mongooseModel'],
              operation: plan.outputAccess,
            },
            owningDocument: handle,
            owningBinding: binding,
          }));
        const result = await filterExistingOutput(
          prepared?.source ?? value,
          child,
          resolved,
          !!childHandle,
          budget,
          childDepth,
        );
        if (members) retainTrustedOutputMember(members, result.output);
        result.fields.forEach((path) => childFields.add(`${field}.${path}`));
        return result.output;
      };
      // Serial child work does not multiply hook concurrency or share element decision caches.
      const value = await one(
        trusted
          ? trustedMapOutputScope(source[field], childPlan.outputPersistedFields, trusted.budget, depth + 1)
          : source[field],
      );
      if (value !== undefined) {
        if (trusted) defineTrustedOutputValue(output, field, value);
        else output[field] = value;
      }
      fields.push(...childFields);
    } else if (
      staticDecisions
        ? staticDecisions.get(field) === true
        : await evaluateAuthorizedOutputField(handle, binding, field)
    ) {
      const path = [...(binding.scopePath ?? []), field].join('.');
      const value = configuration.catalog.referencePaths?.some((p) => matchesCatalogPattern(p, path))
        ? copyAuthorizedReference(source[field], plan, path, trusted)
        : copyOutputValue(source[field], plan, path, trusted);
      if (trusted) defineTrustedOutputValue(output, field, value);
      else output[field] = value;
      if (associated && !trusted) transferDocumentAuthorizationGraph(source[field], output[field]);
      if (output[field] !== undefined) fields.push(field);
      else delete output[field];
    }
  }
  if (plan.fetchIdRetained && Object.prototype.hasOwnProperty.call(source, '_id')) {
    const id = trusted
      ? materializeTrustedOutputValue(source._id, '_id', trusted.budget, { keep: () => true }, depth + 1)
      : deepIsolateValue(source._id);
    if (trusted) defineTrustedOutputValue(output, '_id', id);
    else output._id = id;
    fields.push('_id');
  }
  retainOutputMetadata(output, source, configuration, binding.scopePath ?? [], trusted);
  if (trusted) associateDocumentAuthorization(handle, binding, output, trusted.members);
  else if (members) {
    if (associated) assertDocumentAuthorization(handle, { binding, output: source, outputAccess: plan.outputAccess });
    associateDocumentAuthorization(handle, binding, output, members);
  } else if (associated)
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
      configuration: () => captureModelAuthorizationConfiguration(runtime, modelName),
      requestPermissions: args.permissions,
      access: { operation: access, virtualAccess: access, outputAccess: access, docPermissionsAccess: access },
    },
    args.options,
    args.purpose,
  );
  if (normalized.kind === 'document') {
    const { documentAuthorization: handle, binding } = normalized;
    assertDocumentAuthorization(handle, { binding, output: args.doc as object, outputAccess: access });
    const state = readDocumentAuthorizationAccess(handle, binding);
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
