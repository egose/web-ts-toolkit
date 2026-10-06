/**
 * VIRT-03 shared output finalizer (toObject → virtuals → trim).
 *
 * One consistent boundary for all document-bearing outputs: plain-object view,
 * internal doc-permissions + global permissions available, document-aware value
 * assignment for lean and hydrated docs, then model permission trim. Callers
 * integrate once in VIRT-04–VIRT-06; this module has no caller integration yet
 * (no `decorate`/`tasks` invocation, no snapshot lifecycle changes).
 *
 * Frozen contracts (VIRT-00A):
 * - D1: explicit `virtualAccess` / `outputAccess` / `docPermissionsAccess`;
 *   `context.operation` stays the initiating operation.
 * - D2: scope-aware context `{ receivingModelName, scopePath, virtualAccess,
 *   outputAccess, docPermissionsAccess }` + already-computed internal grants.
 *   Embedded scopes reuse the owning parent's grants with scoped field rules.
 * - D4: getters see an isolated snapshot of persisted deps + already-finalized
 *   related/embedded outputs; sibling virtuals never visible; input mutation
 *   cannot change output/snapshots; only returned values committed;
 *   `undefined`/throw omits fail-closed; `Date`/`Buffer`/`ObjectId`/BSON cloned
 *   without JSON cloning.
 * - D5: `dependsOn` are top-level persisted names relative to scope; only absent
 *   (`missing` or `undefined`) omits; present `null`/`0`/`false`/`''` runs.
 * - D6: effective selection computed before evaluation (captured plan);
 *   internal-only deps stripped before `decorate`/tasks see the object.
 * - D7 scheduling scope (recorded here, see `helpers/concurrency.ts`):
 *   `maxHookConcurrency` (default 10) bounds active virtual/getter +
 *   row-finalization orchestration work per top-level list, NOT per-row
 *   multiplied and NOT a persistence ceiling. Top-level lists finalize rows
 *   through ONE bounded map (stable index-keyed results regardless of
 *   completion order). Nested include/populate/embedded work uses bounded child
 *   maps with a finite bound derived from the same limit (sequential or
 *   sub-pooled); recursion depth is bounded by validated plan depth
 *   (`maxCorrelatedDepth` + correlated budgets for correlated paths). Recursive
 *   orchestration NEVER holds leaf persistence permits
 *   (`RequestConcurrencyScheduler.work`) while awaiting descendants or hooks —
 *   maps bound their own orchestration workers and the shared {@link SharedHookGate}
 *   is held only for getter bodies, so limit-1 completes. Getters' own trusted
 *   direct DB/network I/O is outside the leaf persistence ceiling (no
 *   dataloader/batching in v1).
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
import { runVirtualGetter } from '../acl/hook-runner';
import type {
  VirtualProjectionAccess,
  VirtualProjectionPlan,
  VirtualProjectionSnapshot,
} from '../acl/virtual-projection';
import type { AccessRouterBaseRequest, ModelHookContext } from '../interfaces';
import type { ModelVirtualContext } from '../interfaces/router-hooks';
import type { Permissions } from '../permission';

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
 * recursively) before parent getters; only finalized children appear in the
 * parent getter view. Raw association/correlated values are retained privately
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
  /** `maxHookConcurrency` scope (default 10). Shared across rows+getters. */
  concurrencyLimit?: number;
  /** Shared gate across a list operation (created per call when absent). */
  sharedGate?: SharedHookGate;
  traversal?: VirtualTraversalHooks;
  /** Explicit related targets for VIRT-05 hook point (path → target plan). */
  related?: FinalizeRelatedTarget[];
}

export interface FinalizeModelOutputsArgs extends Omit<FinalizeModelOutputArgs, 'input'> {
  inputs: unknown[];
}

type InternalFinalizeArgs = FinalizeModelOutputArgs & {
  scopePath: string[];
  sharedGate: SharedHookGate;
  resolvedLimit: number;
};

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
    const grants = args.docPermissions as Record<string, unknown>;
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
      return await req.macl.resolveFinalizerDocPermissions(
        args.receivingModelName,
        isolatedForHook,
        args.docPermissionsAccess,
        scopeContext,
        undefined,
      );
    }
    if (req?.macl?.genDocPermissions) {
      const grants = (await req.macl.genDocPermissions(
        args.receivingModelName,
        isolatedForHook,
        args.docPermissionsAccess,
        scopeContext,
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
      const grants = (await (hook as Function).call(
        args.request,
        isolatedForHook,
        globalPerms,
        scopeContext,
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

async function finalizeSingleDoc(args: InternalFinalizeArgs, input: unknown): Promise<Record<string, unknown>> {
  // Core also constructs services. Resolve its policy helpers at invocation time
  // so importing Service directly cannot initialize PublicService before Service.
  const { evaluateScopedAccessRule, extractScopedOutputRule } = await import('../core');
  const scopePath = args.scopePath;
  const plan = args.plan;
  const snapshot = args.snapshot;
  const limit = args.resolvedLimit;
  const gate = args.sharedGate;

  // 1. Normalize to an isolated output object (never mutates input/snapshots).
  const isolated = isolateDocForOutput(input);
  const output = (isPlainObject(isolated) ? isolated : {}) as Record<string, unknown>;

  // Scope-aware context (operation stays initiating; three accesses effective).
  const baseContext = (args.context ?? {}) as ModelHookContext;
  const operation = baseContext.operation ?? args.operation ?? args.virtualAccess;
  const scopeContext = {
    ...baseContext,
    modelName: args.receivingModelName,
    operation,
    receivingModelName: args.receivingModelName,
    scopePath: [...scopePath],
    virtualAccess: args.virtualAccess,
    outputAccess: args.outputAccess,
    docPermissionsAccess: args.docPermissionsAccess,
  } as ModelHookContext & ModelVirtualContext;

  // 2. Internal grants available even when metadata disabled (single resolution).
  const docGrants = await resolveDocPermissions(args, output, scopeContext);
  const globalPerms = resolveGlobalPermissions(args);
  const modelPermissionPrefix = snapshot.modelPermissionPrefix ?? '';
  const documentPermissionField = snapshot.documentPermissionField ?? '_permissions';
  const scopedSchema = getScopedPermissionSchema(
    (snapshot.permissionSchema ?? null) as Record<string, unknown> | null,
    scopePath,
  );

  // 3. Finalize related/embedded children through the same boundary BEFORE
  //    parent getters. Raw association values retained privately; only
  //    finalized children appear in the parent getter view. Child orchestration
  //    uses bounded maps with the same finite limit and never holds persistence
  //    permits (orchestration only) or the shared hook gate while awaiting.
  const childPlans = plan.childPlans ?? {};
  for (const [containerName, childPlan] of Object.entries(childPlans)) {
    if (!(containerName in output)) continue;
    const rawContainer = (output as Record<string, unknown>)[containerName];
    if (rawContainer === undefined || rawContainer === null) continue;
    retainRawAssociation(output, containerName, rawContainer);
    const childSnapshot = snapshot;
    const childBase: InternalFinalizeArgs = {
      ...args,
      scopePath: [...(childPlan.scopePath ?? [...scopePath, containerName, 'sub'])],
      plan: childPlan,
      snapshot: childSnapshot,
      // Embedded reuses the owning parent's grants + accesses (VIRT-00A D2).
      docPermissions: docGrants,
      context: scopeContext as unknown as ModelHookContext,
    };
    const finalizeOneChild = async (rawChild: unknown): Promise<unknown> => {
      if (!isPlainObject(rawChild) && !Array.isArray(rawChild)) return deepIsolateValue(rawChild);
      if (args.traversal?.finalizeEmbeddedChildren) {
        return args.traversal.finalizeEmbeddedChildren({
          containerName,
          childPlan,
          rawValue: rawChild,
          parentArgs: args,
        });
      }
      return finalizeSingleDoc(childBase, rawChild);
    };
    if (Array.isArray(rawContainer)) {
      const finalized = await mapWithConcurrencyLimit(rawContainer, limit, (entry) => finalizeOneChild(entry));
      (output as Record<string, unknown>)[containerName] = finalized;
    } else if (isPlainObject(rawContainer)) {
      (output as Record<string, unknown>)[containerName] = await finalizeOneChild(rawContainer);
    }
    // Primitives left as-is (no embedded traversal).
  }

  const relatedTargets = args.related ?? [];
  for (const target of relatedTargets) {
    let rawRelated: unknown;
    try {
      rawRelated = target.path.includes('.')
        ? get(output as object, target.path)
        : (output as Record<string, unknown>)[target.path];
    } catch {
      continue;
    }
    if (rawRelated === undefined || rawRelated === null) continue;
    // Scalar reference IDs (population skipped) are not documents.
    if (typeof rawRelated === 'string' || typeof rawRelated === 'number' || typeof rawRelated === 'bigint') continue;
    const bsontype = (rawRelated as Record<string, unknown>)?._bsontype;
    if (typeof bsontype === 'string') continue;
    retainRawAssociation(output, target.path, rawRelated);
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
      context: scopeContext as unknown as ModelHookContext,
      related: target.plan.relatedPlans?.length
        ? (args.related ?? []).filter((entry) => entry.path.startsWith(`${target.path}.`))
        : [],
    };
    const finalizeOneRelated = async (rawChild: unknown): Promise<unknown> => {
      if (!isPlainObject(rawChild) && !Array.isArray(rawChild)) return rawChild;
      if (typeof (rawChild as Record<string, unknown>)?._bsontype === 'string') return rawChild;
      if (args.traversal?.finalizeRelatedValue) {
        return args.traversal.finalizeRelatedValue({ path: target.path, target, rawValue: rawChild, parentArgs: args });
      }
      return finalizeSingleDoc(relatedBase, rawChild);
    };
    let finalized: unknown;
    if (Array.isArray(rawRelated)) {
      finalized = await mapWithConcurrencyLimit(rawRelated, limit, (entry) => finalizeOneRelated(entry));
    } else if (isPlainObject(rawRelated)) {
      finalized = await finalizeOneRelated(rawRelated);
    } else {
      continue;
    }
    try {
      if (target.path.includes('.')) set(output as object, target.path, finalized);
      else (output as Record<string, unknown>)[target.path] = finalized;
    } catch {
      // leave output unchanged on path errors
    }
  }

  // 4. Stable view for getters: strip stale virtual keys (no fallback), then
  //    isolate once. Every getter receives its own isolated copy so input
  //    mutation cannot leak across siblings/output/snapshots.
  const scopeVirtualNames = getScopeVirtualNames(snapshot, scopePath);
  for (const virtualName of scopeVirtualNames) {
    if (virtualName in output) delete (output as Record<string, unknown>)[virtualName];
  }
  const stableBase = deepIsolateValue(output);
  const scopeLabel = scopePath.length > 0 ? scopePath.join('.') : '';

  // 5. Resolve candidate auth (captured scoped schema + actual grants + global)
  //    before invoking getters; evaluate against the stable view only.
  const candidates = plan.candidates ?? [];
  const staged = new Map<string, unknown>();
  const runCandidate = async (candidate: {
    name: string;
    descriptor: { get: (...args: never[]) => unknown; dependsOn: string[] };
  }): Promise<void> => {
    const dependsOn = Array.isArray(candidate.descriptor?.dependsOn) ? candidate.descriptor.dependsOn : [];
    for (const dep of dependsOn) {
      if (typeof dep !== 'string' || isAbsentDependency(stableBase as Record<string, unknown>, dep)) return;
    }
    const rule = extractScopedOutputRule(scopedSchema, candidate.name, args.outputAccess);
    // Bare `{ sub }` containers or unknown shapes deny (planner parity).
    if (rule !== null && typeof rule === 'object' && !Array.isArray(rule) && typeof rule !== 'function') return;
    const allowed = await evaluateScopedAccessRule({
      req: args.request,
      rule,
      globalPermissions: globalPerms,
      docPermissions: docGrants,
      modelPermissionPrefix,
    });
    if (!allowed) return;
    const getter = candidate.descriptor?.get;
    if (typeof getter !== 'function') return;
    const isolatedView = deepIsolateValue(stableBase);
    const virtualContext = {
      ...scopeContext,
      docPermissions: docGrants,
    } as unknown as ModelVirtualContext;
    // Shared gate held ONLY for the getter body (never while awaiting children).
    const outcome = await gate.run(() =>
      runVirtualGetter({
        req: args.request,
        getter: getter as Function,
        view: isolatedView,
        permissions: globalPerms as unknown as Permissions,
        context: virtualContext,
        logMeta: {
          modelName: args.receivingModelName,
          scope: scopeLabel,
          field: candidate.name,
          virtualAccess: args.virtualAccess,
          outputAccess: args.outputAccess,
          operation,
        },
      }),
    );
    if (!outcome.ok) return;
    if (outcome.value === undefined) return;
    staged.set(candidate.name, deepIsolateValue(outcome.value));
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
      setDocValue(output, name, stagedValue);
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
  const allowedPersisted: string[] = [];
  for (const field of eligiblePersisted) {
    const rule = extractScopedOutputRule(scopedSchema, field, args.outputAccess);
    if (rule !== null && typeof rule === 'object' && !Array.isArray(rule) && typeof rule !== 'function') {
      // Persisted `{ sub }` containers carry the access rule alongside `sub`;
      // fall back to the access entry when present (collectSchemaFields parity).
      const rec = rule as Record<string, unknown>;
      const accessRule = rec[args.outputAccess];
      if (accessRule === undefined) continue;
      const allowed = await evaluateScopedAccessRule({
        req: args.request,
        rule: accessRule,
        globalPermissions: globalPerms,
        docPermissions: docGrants,
        modelPermissionPrefix,
      });
      if (allowed) allowedPersisted.push(field);
      continue;
    }
    const allowed = await evaluateScopedAccessRule({
      req: args.request,
      rule,
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
  if (!plan.outputIdExcluded && '_id' in output) keep.add('_id');
  if (documentPermissionField in output) keep.add(documentPermissionField);

  const trimmed: Record<string, unknown> = {};
  for (const key of keep) {
    if (key in output) trimmed[key] = (output as Record<string, unknown>)[key];
  }
  // Retain private associations for VIRT-05/06 without attaching to output.
  void getRetainedAssociations;

  // Never persist computed output here; snapshots/decorate ordering untouched.
  return trimmed;
}

/**
 * Finalize a single document through the shared boundary.
 */
export async function finalizeModelOutput(args: FinalizeModelOutputArgs): Promise<Record<string, unknown>> {
  const limit = normalizeHookConcurrencyLimit(args.concurrencyLimit, 10);
  const gate = args.sharedGate ?? new SharedHookGate(limit);
  const internal: InternalFinalizeArgs = {
    ...args,
    scopePath: [...(args.scopePath ?? [])],
    sharedGate: gate,
    resolvedLimit: limit,
  };
  return finalizeSingleDoc(internal, args.input);
}

/**
 * Finalize a top-level list through ONE bounded row map with a shared hook
 * gate, so peak active getter work stays at or below `concurrencyLimit`
 * (default `maxHookConcurrency`, 10) instead of multiplying by row count.
 * Results preserve input order regardless of completion order. No persistence
 * permits are held while awaiting hooks/descendants; nested child maps use the
 * same finite limit with the gate held only for getter bodies, so limit-1
 * completes.
 */
export async function finalizeModelOutputs(args: FinalizeModelOutputsArgs): Promise<Record<string, unknown>[]> {
  const limit = normalizeHookConcurrencyLimit(args.concurrencyLimit, 10);
  const gate = args.sharedGate ?? new SharedHookGate(limit);
  const { inputs, ...rest } = args;
  return mapWithConcurrencyLimit(inputs, limit, (input) => {
    const internal: InternalFinalizeArgs = {
      ...(rest as FinalizeModelOutputArgs),
      scopePath: [...(rest.scopePath ?? [])],
      sharedGate: gate,
      resolvedLimit: limit,
    };
    return finalizeSingleDoc(internal, input);
  });
}

export const __finalizeInternals = {
  getScopeVirtualNames,
  getScopedPermissionSchema,
};
