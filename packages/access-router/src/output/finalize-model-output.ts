/**
 * VIRT-03 shared output finalizer (toObject → virtuals → trim).
 *
 * One consistent boundary for all document-bearing outputs: plain-object view,
 * internal doc-permissions + global permissions available, document-aware value
 * assignment for lean and hydrated docs, then model permission trim. Captured
 * authorization plans also issue private per-document results for later picks.
 * Presentation hooks remain a subsequent application stage.
 *
 * Frozen contracts (VIRT-00A):
 * - D1: explicit `virtualAccess` / `outputAccess` / `docPermissionsAccess`;
 *   `context.operation` stays the initiating operation.
 * - D2: scope-aware context `{ receivingModelName, scopePath, virtualAccess,
 *   outputAccess, docPermissionsAccess }` + already-computed internal grants.
 *   Embedded scopes reuse the owning parent's grants with scoped field rules.
 * - D4: getters see an isolated snapshot of persisted deps + already-finalized
 *   public related/embedded outputs in argument one; declared private populated
 *   inputs are isolated in argument four (DPV D3). Sibling virtuals never visible;
 *   input mutation has no implicit effect on output/snapshots; only returned values committed;
 *   `undefined`/throw omits fail-closed; `Date`/`Buffer`/`ObjectId`/BSON cloned
 *   without JSON cloning.
 * - D5: `dependsOn` are top-level persisted names relative to scope; only absent
 *   (`missing` or `undefined`) omits; present `null`/`0`/`false`/`''` runs.
 * - D6: effective selection computed before evaluation (captured plan);
 *   internal-only deps stripped before `decorate`/tasks see the object. This is
 *   no implicit transport, not a restriction on an authorized getter's deliberate return.
 * - D7/ARL-07: per-call row/child maps preserve order; the request/runtime
 *   gate admits independent hook chains across all services and output scopes.
 *   Nested service hooks reuse a chain with FIFO, one-child-at-a-time admission
 *   at each frame, so limit-one reentry completes without unbounded fan-out.
 *   Waiting ancestors are not separate permits; admission depth is capped at
 *   64. No persistence permit is held over hooks or descendant orchestration.
 *   Trusted direct I/O and query totals are outside persistence admission.
 * - D8: arbitrary select strings preserved; registered virtuals stay virtual.
 *
 * Failure logging uses allowlisted structural metadata only
 * (model/scope/field/access/operation + fixed category); getter input, return
 * values, exception messages/stacks, and raw dependencies are never logged.
 */
import { get, isPlainObject, set } from '@web-ts-toolkit/utils';
import {
  deepIsolateValue,
  getRetainedAssociations,
  isolateDocForOutput,
  retainRawAssociation,
  setDocValue,
} from '../helpers/document';
import { mapWithConcurrencyLimit, normalizeHookConcurrencyLimit, SharedHookGate } from '../helpers/concurrency';
import { getRequestWorkState } from '../helpers/request-work';
import type { AccessRuntime } from '../runtime';
import { runVirtualGetter } from '../acl/hook-runner';
import type {
  VirtualProjectionAccess,
  VirtualProjectionPlan,
  VirtualProjectionSnapshot,
} from '../acl/virtual-projection';
import type { AccessRouterBaseRequest, ModelHookContext } from '../interfaces';
import type { ModelVirtualContext } from '../interfaces/router-hooks';
import type { Permissions } from '../permission';
import type { DocumentAuthorization, ServiceOutputContext } from '../interfaces/service-authorization';
import type { AuthorizationBinding, ResolvedServiceAuthorization } from '../acl/service-authorization';
import {
  assertAuthorizationBinding,
  getAuthorizationPermissions,
  readServiceFinalizerConfiguration,
  readServiceOutputPolicy,
  readAuthorizationFastPath,
} from '../acl/service-authorization';
import { authorizationError, copyAuthorizationValue } from '../acl/authorization-snapshot';
import {
  associateDocumentAuthorization,
  createServiceOutputContext,
  isKnownAuthorizationOutput,
  isTrustedDocumentAuthorizationStage,
  prepareQueryDocumentAuthorization,
  createTrustedOutputMemberBuilder,
  retainTrustedOutputMember,
  retainTrustedOutputSpine,
  readDocumentAuthorization,
  readDocumentAuthorizationAccess,
  transferDocumentAuthorizationGraph,
  tryStaticOutputFieldDecisions,
} from '../acl/document-authorization';
import type { DocumentAuthorizationStage, TrustedOutputMemberBuilder } from '../acl/document-authorization';
import {
  authorizeEmbeddedOutputPlan,
  copyAuthorizedReference,
  copyOutputValue,
  evaluateAuthorizedOutputField,
  hasWholeOutputValueGrant,
  prepareOutputDocumentAuthorization,
  retainOutputMetadata,
  type TrustedOutputMaterialization,
} from '../acl/output-field-filter';
import { evaluateEffectiveFieldAuthorization, extractScopedOutputRule } from '../acl/field-authorization';
import { matchesCatalogPattern } from '../acl/field-catalog';
import { readStaticOutputPlanFields } from '../acl/output-projection';
import {
  getVirtualPopulateRow,
  hasVirtualPopulatePublicReference,
  readVirtualPopulateInputs,
  readVirtualPopulateOriginalReference,
  type VirtualPopulateAddress,
  type VirtualPopulateRow,
} from '../acl/virtual-populate-execution';
import { getIncludeOriginal } from './include-output';
import {
  createTrustedOutputBudget,
  defineTrustedOutputValue,
  shallowTrustedOutput,
  shallowTrustedOutputArray,
  setTrustedOutputPath,
  trustedMapOutputScope,
  visitTrustedOutput,
  type TrustedOutputBudget,
} from '../acl/trusted-output-materialization';

export type VirtualFinalizeAccess = VirtualProjectionAccess;

export interface FinalizeSnapshot extends VirtualProjectionSnapshot {
  documentPermissionField?: string;
  exposedDocPermissionKeys?: string[] | undefined;
  stripPermissionsField?: boolean;
  disableFieldPermissions?: boolean;
}

export interface FinalizeRelatedTarget {
  /** Output path in the parent scope (top-level name for v1; dotted supported). */
  path: string;
  plan: VirtualProjectionPlan;
  snapshot: FinalizeSnapshot;
  virtualAccess: VirtualFinalizeAccess;
  outputAccess: VirtualFinalizeAccess;
  docPermissionsAccess: VirtualFinalizeAccess;
}

/**
 * Traversal/integration hooks for VIRT-05 (related) / VIRT-06 (embedded).
 * Defaults finalize through this same boundary (`finalizeModelOutput`
 * recursively) before parent getters; only finalized public children appear in
 * argument one. Declared private inputs use argument four. Raw association/correlated values are retained privately
 * (never attached to output) via `retainRawAssociation`.
 */
export interface VirtualTraversalHooks {
  finalizeEmbeddedChildren?: (args: {
    containerName: string;
    childPlan: VirtualProjectionPlan;
    rawValue: unknown;
    parentArgs: InternalFinalizeArgs;
  }) => Promise<unknown>;
  finalizeRelatedValue?: (args: {
    path: string;
    target: FinalizeRelatedTarget;
    rawValue: unknown;
    parentArgs: InternalFinalizeArgs;
  }) => Promise<unknown>;
}

export interface FinalizeModelOutputArgs {
  receivingModelName: string;
  /** Lean plain object or hydrated Mongoose document (never mutated). */
  input: unknown;
  virtualAccess: VirtualFinalizeAccess;
  outputAccess: VirtualFinalizeAccess;
  docPermissionsAccess: VirtualFinalizeAccess;
  scopePath?: string[];
  /** Captured planner output (VIRT-02) — coherent with `snapshot` for this operation. */
  plan: VirtualProjectionPlan;
  /** Captured options snapshot (permissionSchema/virtuals/prefix/field paths). */
  snapshot: FinalizeSnapshot;
  /** Request (`this` for getters / permission functions). */
  request: AccessRouterBaseRequest;
  /** Base hook context (operation stays initiating; extended to scope-aware). */
  context?: ModelHookContext;
  /** Initiating operation for logs when `context.operation` is absent. */
  operation?: string;
  /** Already-computed full internal grants (no second hook call when supplied). */
  docPermissions?: Record<string, unknown>;
  /** Global permissions override; otherwise derived from `request`. */
  globalPermissions?: { has: (key: string) => boolean; hasKey?: (key: string) => boolean };
  /** Standalone unbound finalizer limit; authenticated calls use their owner's capture. */
  concurrencyLimit?: number;
  /** Private owning service gate for legacy unbound subdocument plans. */
  sharedGate?: SharedHookGate;
  traversal?: VirtualTraversalHooks;
  /** Explicit related targets for VIRT-05 hook point (path → target plan). */
  related?: FinalizeRelatedTarget[];
  /** Package-owned stage, optionally pre-resolved. Input must be its exact unchanged projected plain snapshot. */
  documentAuthorizationStage?: DocumentAuthorizationStage;
  /** Package-only embedded ownership: reuse raw owning grants, with scope-local decisions. */
  owningDocument?: DocumentAuthorization;
  owningBinding?: AuthorizationBinding;
  /** Package-private execution handoff, never serialized or put into hook contexts/handles. */
  virtualPopulateRow?: VirtualPopulateRow;
  virtualPopulateAddress?: VirtualPopulateAddress;
  /** Private service handoff, after association; never attach this context to data. Lists supply the row index. */
  onFinalized?: (output: Record<string, unknown>, context: ServiceOutputContext, index?: number) => void;
  /** Private service assembly, BEFORE one root association. Never a public finalization certificate. */
  completeTrustedOutput?: (
    output: Record<string, unknown>,
    handle: DocumentAuthorization,
    materialization: TrustedOutputMaterialization,
  ) => Promise<void>;
  /** Package-owned selected work shared with pre-finalizer private-path cleanup. */
  trustedOutputBudget?: TrustedOutputBudget;
}

export interface FinalizeModelOutputsArgs extends Omit<
  FinalizeModelOutputArgs,
  'input' | 'documentAuthorizationStage'
> {
  inputs: unknown[];
  /** Optional pre-resolved stage per row. A stage cannot be shared by two rows, even with equal values/IDs. */
  documentAuthorizationStages?: readonly DocumentAuthorizationStage[];
}

type InternalFinalizeArgs = FinalizeModelOutputArgs & {
  scopePath: string[];
  sharedGate: SharedHookGate;
  resolvedLimit: number;
  owningDocument?: DocumentAuthorization;
  owningBinding?: AuthorizationBinding;
  materialization?: {
    budget: TrustedOutputBudget;
    depth: number;
    lineage: ReadonlySet<object>;
  };
};

/** Private to this invocation/scope. Never put preparation on traversal args or
 * hook contexts: even a detached frozen configuration can contain mutable natives.
 */
interface FinalizerPreparation {
  authorization: ResolvedServiceAuthorization | undefined;
  policy: ReturnType<typeof readServiceOutputPolicy> | undefined;
  snapshot: FinalizeSnapshot;
  baseContext: ModelHookContext;
  sharedContext: boolean;
  scopeVirtualNames: string[];
  scopedSchema: Record<string, unknown> | null;
  permissions: ReturnType<typeof getAuthorizationPermissions> | undefined;
  resolveDocument: ReturnType<typeof prepareOutputDocumentAuthorization> | undefined;
  trustedCall: boolean;
}
const trustedFinalizerScopes = new WeakMap<
  VirtualProjectionPlan,
  Omit<FinalizerPreparation, 'baseContext' | 'sharedContext'>
>();

// ---------------------------------------------------------------------------
// Scope helpers (mirror VIRT-01/VIRT-02 snapshot traversal, captured only).
// ---------------------------------------------------------------------------

const isVirtualContainerValue = (value: unknown): value is { sub: Record<string, unknown> } =>
  isPlainObject(value) && 'sub' in (value as Record<string, unknown>);

const getScopeVirtualsObject = (
  rootVirtuals: Record<string, unknown> | null | undefined,
  scopePath: string[],
): Record<string, unknown> | null => {
  if (!rootVirtuals || !isPlainObject(rootVirtuals)) return null;
  if (scopePath.length === 0) return rootVirtuals;
  let current: unknown = rootVirtuals;
  for (let i = 0; i < scopePath.length; i += 2) {
    const field = scopePath[i];
    const subMarker = scopePath[i + 1];
    if (!field || subMarker !== 'sub') return null;
    if (!isPlainObject(current)) return null;
    const container = (current as Record<string, unknown>)[field];
    if (!isVirtualContainerValue(container)) return null;
    current = (container as { sub: Record<string, unknown> }).sub;
    if (!isPlainObject(current)) return null;
  }
  return current as Record<string, unknown>;
};

const getScopeVirtualNames = (snapshot: FinalizeSnapshot, scopePath: string[]): string[] => {
  const scopeVirtuals = getScopeVirtualsObject(
    (snapshot.virtuals ?? null) as Record<string, unknown> | null,
    scopePath,
  );
  if (!scopeVirtuals) return [];
  return Object.entries(scopeVirtuals)
    .filter(([, v]) => v !== undefined && !isVirtualContainerValue(v))
    .map(([k]) => k);
};

const getScopedPermissionSchema = (
  root: Record<string, unknown> | null | undefined,
  scopePath: string[],
): Record<string, unknown> | null => {
  if (!root || !isPlainObject(root)) return null;
  if (scopePath.length === 0) return root;
  try {
    const scoped = get(root as object, scopePath.join('.')) as unknown;
    return isPlainObject(scoped) ? (scoped as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const resolveGlobalPermissions = (args: FinalizeModelOutputArgs): { has: (key: string) => boolean } => {
  if (args.globalPermissions) return args.globalPermissions as { has: (key: string) => boolean };
  const req = args.request as Record<string | symbol, unknown> & {
    macl?: { getPermissions?: () => { has: (k: string) => boolean } };
  };
  try {
    if (req?.macl?.getPermissions) {
      const perms = req.macl.getPermissions();
      if (perms && typeof (perms as { has?: unknown }).has === 'function') {
        return perms as { has: (key: string) => boolean };
      }
    }
  } catch {
    // fall through to deny-all
  }
  return { has: () => false };
};

const resolveDocPermissions = async (
  args: InternalFinalizeArgs,
  isolatedForHook: Record<string, unknown>,
  scopeContext: ModelHookContext,
): Promise<Record<string, unknown>> => {
  if (args.docPermissions != null && typeof args.docPermissions === 'object' && !Array.isArray(args.docPermissions)) {
    const grants = deepIsolateValue(args.docPermissions);
    (scopeContext as ModelHookContext).docPermissions = grants;
    return grants;
  }
  const req = args.request as Record<string, unknown> & {
    macl?: {
      resolveFinalizerDocPermissions?: (
        model: string,
        doc: unknown,
        access: string,
        ctx: ModelHookContext,
        supplied?: unknown,
      ) => Promise<Record<string, unknown>>;
      genDocPermissions?: (
        model: string,
        doc: unknown,
        access: string,
        ctx: ModelHookContext,
      ) => Promise<Record<string, unknown>>;
    };
  };
  try {
    if (req?.macl?.resolveFinalizerDocPermissions) {
      return await args.sharedGate.run(() =>
        req.macl!.resolveFinalizerDocPermissions!(
          args.receivingModelName,
          isolatedForHook,
          args.docPermissionsAccess,
          scopeContext,
          undefined,
        ),
      );
    }
    if (req?.macl?.genDocPermissions) {
      const grants = (await args.sharedGate.run(() =>
        req.macl!.genDocPermissions!(args.receivingModelName, isolatedForHook, args.docPermissionsAccess, scopeContext),
      )) as Record<string, unknown>;
      (scopeContext as ModelHookContext).docPermissions = grants ?? {};
      return grants ?? {};
    }
  } catch {
    // fail-closed below
  }
  // Fallback without a Core instance: invoke the configured hook directly.
  try {
    const { getModelOption } = await import('../options');
    const hook = getModelOption(
      args.receivingModelName,
      `docPermissions.${args.docPermissionsAccess}`,
      null,
    ) as unknown;
    if (typeof hook === 'function') {
      const globalPerms = resolveGlobalPermissions(args);
      const grants = (await args.sharedGate.run(() =>
        (hook as Function).call(args.request, isolatedForHook, globalPerms, scopeContext),
      )) as Record<string, unknown>;
      const normalized = isPlainObject(grants) ? (grants as Record<string, unknown>) : {};
      (scopeContext as ModelHookContext).docPermissions = normalized;
      return normalized;
    }
  } catch {
    // fall through
  }
  const empty: Record<string, unknown> = {};
  (scopeContext as ModelHookContext).docPermissions = empty;
  return empty;
};

const isAbsentDependency = (stableView: Record<string, unknown>, dep: string): boolean => {
  if (!(dep in stableView)) return true;
  return (stableView as Record<string, unknown>)[dep] === undefined;
};

// ---------------------------------------------------------------------------
// Single-document finalization.
// ---------------------------------------------------------------------------

function assertFinalizerCall(
  args: InternalFinalizeArgs,
  prepared: Pick<FinalizerPreparation, 'authorization' | 'policy'>,
): void {
  const plan = args.plan;
  const binding = plan.authorizationBinding;
  if (plan.authorization !== prepared.authorization) authorizationError('finalizer call changed during pass');
  if (plan.authorization && binding) assertAuthorizationBinding(plan.authorization, binding);
  const access = prepared.policy?.access;
  if (
    plan.authorization &&
    (!binding ||
      binding.request !== args.request ||
      binding.modelName !== args.receivingModelName ||
      access?.virtualAccess !== args.virtualAccess ||
      access.outputAccess !== args.outputAccess ||
      access.docPermissionsAccess !== args.docPermissionsAccess ||
      (binding.scopePath ?? []).join('.') !== args.scopePath.filter((p) => p !== 'sub').join('.'))
  ) {
    authorizationError('finalizer call/model/scope/access mismatch');
  }
}

function prepareFinalizer(args: InternalFinalizeArgs, sharedContext = false): FinalizerPreparation {
  const { authorization, authorizationBinding: binding } = args.plan;
  const policy = authorization && binding ? readServiceOutputPolicy(authorization, binding) : undefined;
  assertFinalizerCall(args, { authorization, policy });
  const trustedCall = !!authorization && readAuthorizationFastPath(authorization, binding!)?.mode === 'active';
  const reusable = trustedCall ? trustedFinalizerScopes.get(args.plan) : undefined;
  if (reusable) {
    if (reusable.authorization !== authorization) authorizationError('changed trusted finalizer scope');
    return { ...reusable, baseContext: { ...args.context } as ModelHookContext, sharedContext };
  }
  const configuration = authorization ? readServiceFinalizerConfiguration(authorization, binding!) : undefined;
  const snapshot = configuration ? (configuration as FinalizeSnapshot) : deepIsolateValue(args.snapshot);
  const prepared: FinalizerPreparation = {
    authorization,
    policy,
    snapshot,
    baseContext: trustedCall
      ? ({ ...args.context } as ModelHookContext)
      : deepIsolateValue(args.context ?? ({} as ModelHookContext)),
    sharedContext,
    scopeVirtualNames: getScopeVirtualNames(snapshot, args.scopePath),
    scopedSchema: configuration
      ? null // Authenticated field decisions own their separate call-scoped rule preparation.
      : getScopedPermissionSchema(snapshot.permissionSchema as Record<string, unknown> | null, args.scopePath),
    permissions: authorization ? getAuthorizationPermissions(authorization, binding!) : undefined,
    resolveDocument: authorization
      ? prepareOutputDocumentAuthorization(authorization, binding!, configuration!)
      : undefined,
    trustedCall,
  };
  if (trustedCall) {
    const { baseContext: _context, sharedContext: _shared, ...scope } = prepared;
    trustedFinalizerScopes.set(args.plan, scope);
  }
  return prepared;
}

async function finalizeSingleDoc(
  args: InternalFinalizeArgs,
  input: unknown,
  prepared: FinalizerPreparation,
): Promise<Record<string, unknown>> {
  // Revalidate each row/scope even though invariant preparation is shared.
  assertFinalizerCall(args, prepared);
  const scopePath = args.scopePath;
  const plan = args.plan;
  const binding = plan.authorizationBinding;
  const captured = prepared.policy;
  const snapshot = prepared.snapshot;
  const limit = args.resolvedLimit;
  const gate = args.sharedGate;
  const original = getIncludeOriginal(input, prepared.authorization);
  const privateRow =
    args.virtualPopulateRow ?? (original && typeof original === 'object' ? getVirtualPopulateRow(original) : undefined);
  const privateAddress = args.virtualPopulateAddress ?? [];

  const querySource =
    captured && !args.documentAuthorizationStage
      ? prepareQueryDocumentAuthorization(plan.authorization!, binding!, input)
      : undefined;
  const stage = args.documentAuthorizationStage ?? querySource?.stage;
  const source = querySource?.source ?? input;
  const trustedSource = !!stage && isTrustedDocumentAuthorizationStage(stage, plan.authorization!, binding!);
  const budget = prepared.trustedCall
    ? (args.materialization?.budget ?? args.trustedOutputBudget ?? querySource?.budget ?? createTrustedOutputBudget())
    : undefined;
  const depth = args.materialization?.depth ?? 0;
  const lineage = args.materialization?.lineage ?? new Set<object>();
  if (budget) {
    visitTrustedOutput(budget, depth);
    if (source && typeof source === 'object' && lineage.has(source))
      authorizationError('cyclic selected document output');
  }
  const nextLineage = new Set(lineage);
  if (source && typeof source === 'object') nextLineage.add(source);
  const members: TrustedOutputMemberBuilder | undefined = budget
    ? createTrustedOutputMemberBuilder(plan.authorization!, binding!, budget)
    : undefined;
  const trusted: TrustedOutputMaterialization | undefined = trustedSource
    ? { budget: budget!, members: members!, depth }
    : undefined;

  // Borrowed rows have no whole-source isolation. The shallow working shell is made AFTER the hook.
  const isolated = trustedSource ? undefined : isolateDocForOutput(source);
  let output = (isPlainObject(isolated) ? isolated : {}) as Record<string, unknown>;
  // Already-finalized target values can enter this boundary through package traversal.
  // Preserve their identities only via an explicit package-created copy transfer.
  if (captured && !trustedSource && isPlainObject(input))
    for (const key of Object.keys(output)) {
      transferDocumentAuthorizationGraph(input[key], output[key]);
    }

  // Scope-aware context (operation stays initiating; three accesses effective).
  // A single-row pass already owns this snapshot. Only reusable preparation
  // needs a second copy to keep later rows independent of this row's hooks.
  const baseContext = prepared.trustedCall
    ? { ...prepared.baseContext }
    : prepared.sharedContext
      ? deepIsolateValue(prepared.baseContext)
      : prepared.baseContext;
  const operation = captured?.access.operation ?? baseContext.operation ?? args.operation ?? args.virtualAccess;
  const scopeContext = {
    ...baseContext,
    modelName: args.receivingModelName,
    mongooseModel: captured ? binding!.model : baseContext.mongooseModel,
    operation,
    receivingModelName: args.receivingModelName,
    scopePath: [...scopePath],
    virtualAccess: args.virtualAccess,
    outputAccess: args.outputAccess,
    docPermissionsAccess: args.docPermissionsAccess,
  } as ModelHookContext & ModelVirtualContext;

  // 2. Internal grants available even when metadata disabled (single resolution).
  let documentAuthorization: DocumentAuthorization | undefined;
  let metadataSource = output;
  if (captured) {
    const projected = stage ? (source as Record<string, unknown>) : deepIsolateValue(output);
    metadataSource = trustedSource ? (source as Record<string, unknown>) : deepIsolateValue(output);
    documentAuthorization = await prepared.resolveDocument!({
      authorization: plan.authorization!,
      binding: binding!,
      snapshot: projected,
      context: scopeContext,
      stage,
      owningDocument: args.owningDocument,
      owningBinding: args.owningBinding,
      knownOutput:
        !args.documentAuthorizationStage && !!input && typeof input === 'object' && isKnownAuthorizationOutput(input),
    });
  }
  const docGrants = documentAuthorization
    ? readDocumentAuthorization(documentAuthorization, binding!).grants
    : await resolveDocPermissions(args, output, scopeContext);
  if (trusted) output = shallowTrustedOutput(source as Record<string, unknown>, trusted.budget, depth);
  scopeContext.docPermissions = trusted ? docGrants : deepIsolateValue(docGrants);
  const globalPerms = prepared.permissions ?? resolveGlobalPermissions(args);
  const modelPermissionPrefix = captured ? '' : deepIsolateValue(snapshot.modelPermissionPrefix ?? '');
  const documentPermissionField = captured
    ? '_permissions'
    : deepIsolateValue(snapshot.documentPermissionField ?? '_permissions');
  const scopedSchema = deepIsolateValue(prepared.scopedSchema);

  // 3. Finalize related/embedded children through the same boundary BEFORE
  //    parent getters. Raw association values retained privately; only
  //    finalized public children appear in argument one; declared private inputs
  //    use argument four. Child orchestration
  //    uses bounded maps with the same finite limit and never holds persistence
  //    permits (orchestration only) or the shared hook gate while awaiting.
  const childPlans = plan.childPlans ?? {};
  for (const [containerName, childPlan] of Object.entries(childPlans)) {
    if (!(containerName in output)) continue;
    let rawContainer = (output as Record<string, unknown>)[containerName];
    if (rawContainer === undefined || rawContainer === null) continue;
    if (captured && hasWholeOutputValueGrant(plan, containerName)) {
      // A selected opaque root grant covers its safe existing subtree, even
      // when a dynamic child rule also caused a minimal fallback child plan.
      output[containerName] = copyOutputValue(
        rawContainer,
        plan,
        [...(binding!.scopePath ?? []), containerName].join('.'),
        trusted,
      );
      continue;
    }
    if (trusted)
      rawContainer = trustedMapOutputScope(rawContainer, childPlan.outputPersistedFields, trusted.budget, depth + 1);
    // A child plan grants minimal structure, not a scalar ancestor fetched as
    // a private input (notably a schema-valid Mixed root).
    if (captured && !isPlainObject(rawContainer) && !Array.isArray(rawContainer)) {
      if (
        trusted &&
        (typeof rawContainer === 'object' || typeof rawContainer === 'function' || typeof rawContainer === 'symbol')
      )
        authorizationError('unsupported selected embedded value');
      delete output[containerName];
      continue;
    }
    if (!trusted) retainRawAssociation(output, containerName, rawContainer);
    const childBase: InternalFinalizeArgs = {
      ...args,
      scopePath: [...(childPlan.scopePath ?? [...scopePath, containerName, 'sub'])],
      plan: captured ? authorizeEmbeddedOutputPlan(plan, childPlan) : childPlan,
      // Authenticated preparation reads its own authority. Do not clone an
      // otherwise unused public configuration graph on default traversal.
      snapshot: args.snapshot,
      // Embedded reuses the owning parent's grants + accesses (VIRT-00A D2).
      docPermissions: docGrants,
      context: scopeContext as unknown as ModelHookContext,
      documentAuthorizationStage: undefined,
      onFinalized: undefined,
      completeTrustedOutput: undefined,
      trustedOutputBudget: undefined,
      owningDocument: documentAuthorization,
      owningBinding: binding,
      related: [],
      virtualPopulateRow: privateRow,
      materialization: budget ? { budget, depth: depth + 1, lineage: nextLineage } : undefined,
    };
    let childPreparation: FinalizerPreparation | undefined;
    const finalizeOneChild = async (
      rawChild: unknown,
      address: VirtualPopulateAddress,
      childDepth = depth + 1,
      childLineage: ReadonlySet<object> = nextLineage,
    ): Promise<unknown> => {
      if (budget) visitTrustedOutput(budget, childDepth);
      if (captured && Array.isArray(rawChild)) {
        if (budget) {
          if (childLineage.has(rawChild)) authorizationError('cyclic selected document output');
        }
        const arrayLineage = new Set(childLineage);
        arrayLineage.add(rawChild);
        return mapWithConcurrencyLimit(
          budget ? shallowTrustedOutputArray(rawChild, budget, childDepth) : rawChild,
          limit,
          (entry, index) => finalizeOneChild(entry, [...address, index], childDepth + 1, arrayLineage),
        );
      }
      if (!isPlainObject(rawChild) && !Array.isArray(rawChild)) {
        if (
          trusted &&
          rawChild != null &&
          (typeof rawChild === 'object' || typeof rawChild === 'function' || typeof rawChild === 'symbol')
        )
          authorizationError('unsupported selected embedded value');
        return captured ? null : deepIsolateValue(rawChild);
      }
      if (args.traversal?.finalizeEmbeddedChildren) {
        return args.traversal.finalizeEmbeddedChildren({
          containerName,
          childPlan: childBase.plan,
          rawValue: rawChild,
          parentArgs: captured
            ? {
                ...args,
                owningDocument: documentAuthorization,
                owningBinding: binding,
                docPermissions: docGrants,
                context: scopeContext,
                virtualPopulateRow: privateRow,
                virtualPopulateAddress: address,
              }
            : { ...args, virtualPopulateRow: privateRow, virtualPopulateAddress: address },
        });
      }
      const finalized = await finalizeSingleDoc(
        {
          ...childBase,
          virtualPopulateAddress: address,
          materialization: budget ? { budget, depth: childDepth, lineage: childLineage } : undefined,
        },
        rawChild,
        (childPreparation ??= prepareFinalizer(
          childBase,
          Array.isArray(rawContainer) && (rawContainer.length > 1 || Array.isArray(rawContainer[0])),
        )),
      );
      if (members) retainTrustedOutputMember(members, finalized);
      return finalized;
    };
    if (Array.isArray(rawContainer)) {
      const finalized = await mapWithConcurrencyLimit(
        budget ? shallowTrustedOutputArray(rawContainer, budget, depth + 1) : rawContainer,
        limit,
        (entry, index) => finalizeOneChild(entry, [...privateAddress, containerName, index]),
      );
      (output as Record<string, unknown>)[containerName] = finalized;
    } else if (isPlainObject(rawContainer)) {
      (output as Record<string, unknown>)[containerName] = await finalizeOneChild(rawContainer, [
        ...privateAddress,
        containerName,
      ]);
    }
    // Primitives left as-is (no embedded traversal).
  }

  const relatedTargets = args.related ?? [];
  for (const target of relatedTargets) {
    let rawRelated: unknown;
    let originalRelated: unknown;
    try {
      rawRelated = target.path.includes('.')
        ? get(output as object, target.path)
        : (output as Record<string, unknown>)[target.path];
      originalRelated = get(original as object, target.path);
    } catch {
      continue;
    }
    if (rawRelated === undefined || rawRelated === null) continue;
    // Scalar reference IDs (population skipped) are not documents.
    if (typeof rawRelated === 'string' || typeof rawRelated === 'number' || typeof rawRelated === 'bigint') continue;
    const bsontype = (rawRelated as Record<string, unknown>)?._bsontype;
    if (typeof bsontype === 'string') continue;
    if (!trusted) retainRawAssociation(output, target.path, rawRelated);
    const relatedBase: InternalFinalizeArgs = {
      ...args,
      receivingModelName: target.plan.receivingModelName ?? args.receivingModelName,
      virtualAccess: target.virtualAccess,
      outputAccess: target.outputAccess,
      docPermissionsAccess: target.docPermissionsAccess,
      scopePath: [...(target.plan.scopePath ?? [])],
      plan: target.plan,
      snapshot: target.snapshot,
      // Related targets resolve their OWN grants (target docPermissionsAccess),
      // never the parent's map.
      docPermissions: undefined,
      documentAuthorizationStage: undefined,
      onFinalized: undefined,
      completeTrustedOutput: undefined,
      trustedOutputBudget: undefined,
      owningDocument: undefined,
      owningBinding: undefined,
      virtualPopulateRow: undefined,
      virtualPopulateAddress: [],
      context: scopeContext as unknown as ModelHookContext,
      related: target.plan.relatedPlans?.length
        ? (args.related ?? []).filter((entry) => entry.path.startsWith(`${target.path}.`))
        : [],
    };
    let relatedPreparation: FinalizerPreparation | undefined;
    const finalizeOneRelated = async (rawChild: unknown, originalChild: unknown = rawChild): Promise<unknown> => {
      if (!isPlainObject(rawChild) && !Array.isArray(rawChild)) return rawChild;
      if (typeof (rawChild as Record<string, unknown>)?._bsontype === 'string') return rawChild;
      const childOriginal = getIncludeOriginal(originalChild, target.plan.authorization);
      const childRow =
        childOriginal && typeof childOriginal === 'object' ? getVirtualPopulateRow(childOriginal) : undefined;
      if (args.traversal?.finalizeRelatedValue) {
        return args.traversal.finalizeRelatedValue({
          path: target.path,
          target,
          rawValue: rawChild,
          parentArgs: { ...args, virtualPopulateRow: childRow, virtualPopulateAddress: [] },
        });
      }
      const finalized = await finalizeSingleDoc(
        { ...relatedBase, virtualPopulateRow: childRow },
        rawChild,
        (relatedPreparation ??= prepareFinalizer(relatedBase, Array.isArray(rawRelated) && rawRelated.length > 1)),
      );
      if (members) retainTrustedOutputMember(members, finalized);
      return finalized;
    };
    let finalized: unknown;
    if (Array.isArray(rawRelated)) {
      finalized = await mapWithConcurrencyLimit(rawRelated, limit, (entry, index) =>
        finalizeOneRelated(entry, Array.isArray(originalRelated) ? originalRelated[index] : undefined),
      );
    } else if (isPlainObject(rawRelated)) {
      finalized = await finalizeOneRelated(rawRelated, originalRelated);
    } else {
      continue;
    }
    try {
      if (trusted)
        setTrustedOutputPath(output, target.path, finalized, trusted.budget, depth, (source, copy) =>
          retainTrustedOutputSpine(trusted.members, source, copy),
        );
      else if (target.path.includes('.')) set(output as object, target.path, finalized);
      else (output as Record<string, unknown>)[target.path] = finalized;
    } catch {
      // leave output unchanged on path errors
    }
  }

  // 4. Stable view for getters: strip stale virtual keys (no fallback), then
  //    isolate only if a getter can run. Establish the view BEFORE candidate
  //    permission callbacks, preserving its ordering/isolation contract.
  for (const virtualName of prepared.scopeVirtualNames) {
    if (virtualName in output) delete (output as Record<string, unknown>)[virtualName];
  }
  const candidates = plan.candidates ?? [];
  const needsGetterView = candidates.some((candidate) => {
    const descriptor = candidate.descriptor;
    if (typeof descriptor?.get !== 'function') return false;
    if (!privateRow && descriptor.dependsOnPopulate?.length) return false;
    const dependsOn = Array.isArray(descriptor.dependsOn) ? descriptor.dependsOn : [];
    return dependsOn.every((dep) => typeof dep === 'string' && !isAbsentDependency(output, dep));
  });
  let stableBase = needsGetterView ? deepIsolateValue(output) : undefined;
  const scopeLabel = scopePath.length > 0 ? scopePath.join('.') : '';

  // 5. Resolve candidate auth (captured scoped schema + actual grants + global)
  //    before invoking getters; evaluate against the stable view only.
  const staged = new Map<string, unknown>();
  const runCandidate = async (candidate: {
    name: string;
    descriptor: { get: (...args: never[]) => unknown; dependsOn: string[]; dependsOnPopulate?: unknown[] };
  }): Promise<void> => {
    const dependsOn = Array.isArray(candidate.descriptor?.dependsOn) ? candidate.descriptor.dependsOn : [];
    for (const dep of dependsOn) {
      if (typeof dep !== 'string' || isAbsentDependency(stableBase ?? output, dep)) return;
    }
    const candidateDecision = documentAuthorization
      ? evaluateAuthorizedOutputField(documentAuthorization, binding!, candidate.name)
      : undefined;
    const allowed = documentAuthorization
      ? typeof candidateDecision === 'boolean'
        ? candidateDecision
        : await candidateDecision
      : await evaluateEffectiveFieldAuthorization({
          req: args.request,
          path: candidate.name,
          rules: [extractScopedOutputRule(scopedSchema, candidate.name, args.outputAccess)],
          globalPermissions: globalPerms,
          docPermissions: deepIsolateValue(docGrants),
          modelPermissionPrefix,
        });
    if (!allowed) return;
    const getter = candidate.descriptor?.get;
    if (typeof getter !== 'function') return;
    const privateInputs = privateRow
      ? readVirtualPopulateInputs(privateRow, privateAddress, candidate.name)
      : candidate.descriptor.dependsOnPopulate?.length
        ? { available: false as const }
        : { available: true as const, populated: {} };
    if (!privateInputs.available) return;
    const isolatedView = deepIsolateValue((stableBase ??= deepIsolateValue(output)));
    const virtualContext = {
      ...(trusted ? scopeContext : deepIsolateValue(scopeContext)),
      docPermissions: trusted ? docGrants : deepIsolateValue(docGrants),
    } as unknown as ModelVirtualContext;
    // A getter may await a service: its descendant hooks reuse a bounded chain.
    const outcome = await runVirtualGetter({
      req: args.request,
      gate,
      getter: getter as Function,
      view: isolatedView,
      permissions: globalPerms as unknown as Permissions,
      context: virtualContext,
      populated: privateInputs.populated,
      logMeta: {
        modelName: args.receivingModelName,
        scope: scopeLabel,
        field: candidate.name,
        virtualAccess: args.virtualAccess,
        outputAccess: args.outputAccess,
        operation,
      },
    });
    if (!outcome.ok) return;
    if (outcome.value === undefined) return;
    if (trusted) {
      try {
        staged.set(
          candidate.name,
          copyOutputValue(outcome.value, plan, [...(binding!.scopePath ?? []), candidate.name].join('.'), trusted),
        );
      } catch {
        // Invalid getter returns retain the existing fail-closed omission channel.
      }
    } else staged.set(candidate.name, deepIsolateValue(outcome.value));
  };

  // Bounded getter work (no unbounded Promise.all; stable order via index map).
  await mapWithConcurrencyLimit(candidates, limit, (candidate) =>
    runCandidate(
      candidate as { name: string; descriptor: { get: (...args: never[]) => unknown; dependsOn: string[] } },
    ),
  );

  // 6. Commit ONLY returned values via setDocValue (no input mutation, no fallback).
  for (const [name, stagedValue] of staged) {
    try {
      if (trusted) defineTrustedOutputValue(output, name, stagedValue);
      else setDocValue(output, name, stagedValue);
    } catch {
      // Omit on commit errors (fail-closed).
      if (name in output) delete (output as Record<string, unknown>)[name];
    }
  }

  // 7. Trim using scoped outputAccess, then enforce original output selection
  //    and remove virtual-only/internal association dependencies. Visibility
  //    requires independent eligibility PLUS authorization, never fetch
  //    membership. Metadata serialization stays at the caller boundary.
  const eligiblePersisted = new Set(plan.outputPersistedFields ?? []);
  const eligibleVirtuals = new Set(plan.outputVirtualNames ?? []);
  const staticDecisions = documentAuthorization
    ? tryStaticOutputFieldDecisions(documentAuthorization, binding!, plan, [...eligiblePersisted])
    : undefined;
  if (staticDecisions) {
    // Preserve a scheduled/resume mutation boundary, amortized over the row.
    // The synchronous batch has already closed; no capability crosses this await.
    if (!trusted) await Promise.resolve();
    assertFinalizerCall(args, prepared);
    readDocumentAuthorizationAccess(documentAuthorization!, binding!);
    if (!readStaticOutputPlanFields(plan, prepared.authorization!)) authorizationError('changed static output plan');
  }
  const allowedPersisted: string[] = [];
  for (const field of eligiblePersisted) {
    if (documentAuthorization) {
      // Child plans already apply full-path rules. A denied ancestor cannot
      // suppress the minimal structure of an authorized descendant.
      if (plan.childPlans[field]) allowedPersisted.push(field);
      else {
        const decision = staticDecisions
          ? staticDecisions.get(field) === true
          : evaluateAuthorizedOutputField(documentAuthorization, binding!, field);
        if (typeof decision === 'boolean' ? decision : await decision) allowedPersisted.push(field);
      }
      continue;
    }
    const rule = extractScopedOutputRule(scopedSchema, field, args.outputAccess);
    if (rule !== null && typeof rule === 'object' && !Array.isArray(rule) && typeof rule !== 'function') {
      // Persisted `{ sub }` containers carry the access rule alongside `sub`;
      // fall back to the access entry when present (collectSchemaFields parity).
      const rec = rule as Record<string, unknown>;
      const accessRule = rec[args.outputAccess];
      if (accessRule === undefined) continue;
      const allowed = await evaluateEffectiveFieldAuthorization({
        req: args.request,
        path: field,
        rules: [accessRule],
        globalPermissions: globalPerms,
        docPermissions: docGrants,
        modelPermissionPrefix,
      });
      if (allowed) allowedPersisted.push(field);
      continue;
    }
    const allowed = await evaluateEffectiveFieldAuthorization({
      req: args.request,
      path: field,
      rules: [rule],
      globalPermissions: globalPerms,
      docPermissions: docGrants,
      modelPermissionPrefix,
    });
    if (allowed) allowedPersisted.push(field);
  }
  const keep = new Set<string>(allowedPersisted);
  for (const name of staged.keys()) {
    if (eligibleVirtuals.has(name)) keep.add(name);
  }
  if (!plan.outputIdExcluded && (!captured || plan.fetchIdRetained) && '_id' in output) keep.add('_id');
  if (!captured && documentPermissionField in output) keep.add(documentPermissionField);

  const trimmed: Record<string, unknown> = {};
  for (const key of keep) {
    // Reconstruction is independent of every getter outcome. Private-only work
    // cannot implicitly populate output; a getter's deliberate return is separate.
    // Source selection/field authorization alone permits original IDs. Admitted
    // ordinary population owns its DTO/null/filtered-array result, even on a miss.
    // Neither result is gated by private admission; originals never come from targets.
    if (privateRow && !hasVirtualPopulatePublicReference(privateRow, privateAddress, key)) {
      const ref = readVirtualPopulateOriginalReference(privateRow, privateAddress, key);
      if (ref) {
        if (ref.present) output[key] = ref.value;
        else delete output[key];
      }
    }
    if (!(key in output)) continue;
    if (trusted && staged.has(key)) {
      defineTrustedOutputValue(trimmed, key, output[key]);
    } else if (captured && !plan.childPlans[key]) {
      const path = [...(binding!.scopePath ?? []), key].join('.');
      const value = captured.catalog.referencePaths?.some((p) => matchesCatalogPattern(p, path))
        ? copyAuthorizedReference(output[key], plan, path, trusted)
        : copyOutputValue(output[key], plan, path, trusted);
      if (trusted) defineTrustedOutputValue(trimmed, key, value);
      else trimmed[key] = value;
      if (trimmed[key] === undefined) delete trimmed[key];
    } else if (trusted) defineTrustedOutputValue(trimmed, key, output[key]);
    else trimmed[key] = output[key];
  }
  if (documentAuthorization) {
    // Only the small metadata slice needs a row-owned copy. Open configuration
    // can contain coercible native leaves; never let them mutate the pass's copy.
    if (trusted && args.completeTrustedOutput)
      await args.completeTrustedOutput(trimmed, documentAuthorization, trusted);
    else
      retainOutputMetadata(
        trimmed,
        metadataSource,
        trusted
          ? (snapshot as unknown as Record<string, unknown>)
          : copyAuthorizationValue(
              {
                documentPermissionField: snapshot.documentPermissionField,
                stripPermissionsField: snapshot.stripPermissionsField,
                exposedDocPermissionKeys: snapshot.exposedDocPermissionKeys,
                disableFieldPermissions: snapshot.disableFieldPermissions,
              },
              true,
            ),
        binding!.scopePath ?? [],
        trusted,
      );
    associateDocumentAuthorization(documentAuthorization, binding!, trimmed, members);
    args.onFinalized?.(
      trimmed,
      createServiceOutputContext(scopeContext, documentAuthorization, {
        binding: binding!,
        output: trimmed,
        outputAccess: args.outputAccess,
        authorization: plan.authorization,
        stage: readDocumentAuthorizationAccess(documentAuthorization, binding!).stage,
      }),
    );
    if (staticDecisions) {
      assertFinalizerCall(args, prepared);
      readDocumentAuthorizationAccess(documentAuthorization, binding!);
    }
  }
  // Retain private associations for VIRT-05/06 without attaching to output.
  void getRetainedAssociations;

  // Never persist computed output here; snapshots/decorate ordering untouched.
  return trimmed;
}

function finalizerGate(args: FinalizeModelOutputArgs | FinalizeModelOutputsArgs): SharedHookGate {
  const binding = args.plan.authorizationBinding;
  if (binding) return getRequestWorkState(binding.request, binding.runtime as AccessRuntime).hookGate;
  // Services supply their captured owner even for legacy unbound embedded plans.
  // Only standalone internal finalizer callers use the explicit local fallback.
  return args.sharedGate ?? new SharedHookGate(normalizeHookConcurrencyLimit(args.concurrencyLimit));
}

/** Finalize a single document through the shared boundary. */
export async function finalizeModelOutput(args: FinalizeModelOutputArgs): Promise<Record<string, unknown>> {
  const gate = finalizerGate(args);
  const limit = gate.limit;
  const internal: InternalFinalizeArgs = {
    ...args,
    scopePath: [...(args.scopePath ?? args.plan.scopePath ?? [])],
    sharedGate: gate,
    resolvedLimit: limit,
  };
  return finalizeSingleDoc(internal, args.input, prepareFinalizer(internal));
}

/**
 * Finalize rows with stable output indices and per-call bounded workers.
 * Authenticated calls share request/runtime hook-chain admission with other
 * services; waiting recursive callback frames are not extra permits. Neither
 * row maps nor hook callbacks hold persistence permits.
 */
export async function finalizeModelOutputs(args: FinalizeModelOutputsArgs): Promise<Record<string, unknown>[]> {
  const gate = finalizerGate(args);
  const limit = gate.limit;
  const { inputs, documentAuthorizationStages, ...rest } = args;
  if (
    'documentAuthorizationStage' in args ||
    (documentAuthorizationStages &&
      (documentAuthorizationStages.length !== inputs.length ||
        new Set(documentAuthorizationStages).size !== inputs.length))
  ) {
    authorizationError('list finalization requires a distinct document stage per row');
  }
  if (!inputs.length) return [];
  const internal: InternalFinalizeArgs = {
    ...(rest as FinalizeModelOutputArgs),
    scopePath: [...(rest.scopePath ?? rest.plan.scopePath ?? [])],
    sharedGate: gate,
    resolvedLimit: limit,
  };
  const prepared = prepareFinalizer(internal, inputs.length > 1);
  return mapWithConcurrencyLimit(inputs, limit, (input, index) => {
    return finalizeSingleDoc(
      {
        ...internal,
        onFinalized: rest.onFinalized ? (output, context) => rest.onFinalized!(output, context, index) : undefined,
        documentAuthorizationStage: documentAuthorizationStages?.[index],
      },
      input,
      prepared,
    );
  });
}

export const __finalizeInternals = {
  getScopeVirtualNames,
  getScopedPermissionSchema,
};
