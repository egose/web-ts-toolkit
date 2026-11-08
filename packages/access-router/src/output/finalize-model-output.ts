/** Private selected output construction. One stage engine and materializer in both source modes. */
import { types } from 'node:util';
import { isPlainObject } from '@web-ts-toolkit/utils';
import type { AccessRouterBaseRequest, ModelHookContext, ModelOutputContext } from '../interfaces';
import type { ServiceOutputContext } from '../interfaces/service-authorization';
import type { AccessRuntime } from '../runtime';
import type {
  VirtualProjectionAccess,
  VirtualProjectionPlan,
  VirtualProjectionSnapshot,
} from '../acl/virtual-projection';
import type { AuthorizationBinding } from '../acl/service-authorization';
import {
  assertAuthorizationBinding,
  getAuthorizationPermissions,
  readServiceFinalizerConfiguration,
  readServiceOutputPolicy,
} from '../acl/service-authorization';
import {
  assertDocumentStage,
  beginDocumentStageOutput,
  closeDocumentStage,
  copyDocumentView,
  documentStageSource,
  prepareEmbeddedDocumentStage,
  prepareQueryDocumentStage,
  readDocumentStage,
  type DocumentStage,
} from '../acl/document-stage';
import {
  authorizeEmbeddedOutputPlan,
  copyAuthorizedReference,
  copyOutputValue,
  evaluateAuthorizedOutputField,
  hasWholeOutputValueGrant,
  prepareOutputDocumentStage,
  retainOutputMetadata,
  type OutputMaterialization,
} from '../acl/output-field-filter';
import {
  assertOutputPublication,
  createPublicationRowBudget,
  failOutputPublication,
  outputPublicationFor,
  runOutputPublication,
  trackPublicationWork,
  type OutputPublication,
} from '../acl/output-publication';
import {
  assertTrustedOutputBudget,
  defineTrustedOutputValue,
  failTrustedOutputBudget,
  materializeTrustedOutputValue,
  createTrustedOutputBudget,
  setTrustedOutputPath,
  shallowTrustedOutputArray,
  trustedMapOutputScope,
  visitTrustedOutput,
  type TrustedOutputBudget,
} from '../acl/trusted-output-materialization';
import { authorizationError, ServiceAuthorizationError } from '../acl/authorization-snapshot';
import { matchesCatalogPattern } from '../acl/field-catalog';
import { getRequestWorkState } from '../helpers/request-work';
import { mapWithConcurrencyLimit } from '../helpers/concurrency';
import { runVirtualGetter } from '../acl/hook-runner';
import {
  getVirtualPopulateRow,
  hasVirtualPopulatePublicReference,
  readVirtualPopulateInputs,
  readVirtualPopulateOriginalReference,
  type VirtualPopulateAddress,
  type VirtualPopulateRow,
} from '../acl/virtual-populate-execution';
import { getIncludeOriginal } from './include-output';
import { createModelOutputContext } from './model-output-context';

export type VirtualFinalizeAccess = VirtualProjectionAccess;
export interface FinalizeSnapshot extends VirtualProjectionSnapshot {
  documentPermissionField?: string;
  exposedDocPermissionKeys?: string[];
  stripPermissionsField?: boolean;
  disableFieldPermissions?: boolean;
}
export interface FinalizeModelOutputArgs {
  receivingModelName: string;
  input: unknown;
  virtualAccess: VirtualFinalizeAccess;
  outputAccess: VirtualFinalizeAccess;
  docPermissionsAccess: VirtualFinalizeAccess;
  scopePath?: readonly string[];
  plan: VirtualProjectionPlan;
  request: AccessRouterBaseRequest;
  /** Only query/operation primitives are projected; lifecycle data never crosses to callbacks. */
  context?:
    | Pick<ModelHookContext, 'operation' | 'resolvedQuery'>
    | Pick<ModelOutputContext, 'operation' | 'resolvedQuery'>;
  operation?: string;
  documentStage?: DocumentStage;
  owningDocument?: DocumentStage;
  owningBinding?: AuthorizationBinding;
  publication?: OutputPublication;
  outputBudget?: TrustedOutputBudget;
  outputDepth?: number;
  prepaid?: boolean;
  lineage?: ReadonlySet<object>;
  virtualPopulateRow?: VirtualPopulateRow;
  virtualPopulateAddress?: VirtualPopulateAddress;
  /** Exact completed target values held by this private construction, never inferred from a DTO. */
  completedReferences?: ReadonlyMap<string, unknown>;
  includeAttachments?: readonly { path: string; value: unknown }[];
  completeOutput?: (
    output: Record<string, unknown>,
    stage: DocumentStage,
    construction: OutputMaterialization,
  ) => Promise<void>;
  onFinalized?: (output: Record<string, unknown>, context: ServiceOutputContext, index?: number) => void;
}
export interface FinalizeModelOutputsArgs extends Omit<
  FinalizeModelOutputArgs,
  'input' | 'documentStage' | 'outputBudget'
> {
  inputs: unknown[];
  documentStages?: readonly DocumentStage[];
  rowBudgets?: readonly TrustedOutputBudget[];
  rowReferences?: readonly ReadonlyMap<string, unknown>[];
}

// Reusable resolver inputs, not resolved stage facts or materialized output.
interface FinalizerPreparation {
  configuration: ReturnType<typeof readServiceFinalizerConfiguration>;
  resolve: ReturnType<typeof prepareOutputDocumentStage>;
  virtualNames: readonly string[];
}

function scopeVirtuals(root: unknown, scope: readonly string[]): Record<string, unknown> | undefined {
  let value = root;
  for (const part of scope) {
    if (!value || typeof value !== 'object') return;
    const slot = Object.getOwnPropertyDescriptor(value, part);
    if (!slot || !('value' in slot)) return;
    value = slot.value;
  }
  return isPlainObject(value) ? value : undefined;
}

function assertFinalizer(args: FinalizeModelOutputArgs): void {
  const { authorization, authorizationBinding: binding } = args.plan;
  if (!authorization || !binding) authorizationError('finalization requires a private captured call');
  assertAuthorizationBinding(authorization, binding);
  const { access } = readServiceOutputPolicy(authorization, binding);
  if (
    binding.request !== args.request ||
    binding.modelName !== args.receivingModelName ||
    access.virtualAccess !== args.virtualAccess ||
    access.outputAccess !== args.outputAccess ||
    access.docPermissionsAccess !== args.docPermissionsAccess ||
    (binding.scopePath ?? []).join('.') !==
      (args.scopePath ?? args.plan.scopePath ?? []).filter((part) => part !== 'sub').join('.')
  )
    authorizationError('finalizer call/model/scope/access mismatch');
}

function prepareFinalizer(args: FinalizeModelOutputArgs): FinalizerPreparation {
  assertFinalizer(args);
  // Configuration belongs to the captured call, not live service options.
  const configuration = readServiceFinalizerConfiguration(args.plan.authorization!, args.plan.authorizationBinding!);
  const virtuals = scopeVirtuals(configuration.virtuals, args.scopePath ?? args.plan.scopePath ?? []);
  return {
    configuration,
    resolve: prepareOutputDocumentStage(args.plan.authorization!, args.plan.authorizationBinding!, configuration),
    virtualNames: Object.keys(virtuals ?? {}).filter(
      (key) => !isPlainObject(virtuals![key]) || !Object.hasOwn(virtuals![key], 'sub'),
    ),
  };
}

async function finalizeOutputDocument(
  args: FinalizeModelOutputArgs,
  preparation: FinalizerPreparation,
): Promise<Record<string, unknown>> {
  assertFinalizer(args);
  const plan = args.plan,
    binding = plan.authorizationBinding!,
    authorization = plan.authorization!;
  const owner = args.publication ?? outputPublicationFor(authorization);
  assertOutputPublication(owner);
  const budget = args.outputBudget ?? createPublicationRowBudget(owner),
    depth = args.outputDepth ?? 0;
  const construction = { budget, depth };
  const admitted = args.documentStage
    ? undefined
    : prepareQueryDocumentStage(
        authorization,
        binding,
        args.input,
        args.owningDocument ? { stage: args.owningDocument, binding: args.owningBinding! } : undefined,
      );
  const stage = args.documentStage ?? admitted!.stage;
  const source = args.documentStage ? documentStageSource(stage, binding) : admitted!.source;
  assertDocumentStage(stage, authorization, binding, source);
  const lineage = args.lineage ?? new Set<object>();
  if (lineage.has(source))
    failTrustedOutputBudget(budget, new ServiceAuthorizationError('cyclic selected document output'));
  const nextLineage = new Set(lineage).add(source);
  visitTrustedOutput(budget, depth, args.prepaid ? 0 : 1);
  // Resolve this stage's document facts before field decisions and bounded materialization.
  await preparation.resolve({
    authorization,
    binding,
    snapshot: source,
    stage,
    context: { operation: args.operation ?? '', resolvedQuery: args.context?.resolvedQuery },
    owningDocument: args.owningDocument,
    owningBinding: args.owningBinding,
  });
  beginDocumentStageOutput(stage, binding);
  const { grants, ...access } = readDocumentStage(stage, binding);
  const context = createModelOutputContext({
    modelName: binding.modelName,
    operation: access.operation,
    scopePath: args.scopePath ?? plan.scopePath,
    virtualAccess: access.virtualAccess,
    outputAccess: access.outputAccess,
    docPermissionsAccess: access.docPermissionsAccess,
    docPermissions: grants,
    resolvedQuery: args.context?.resolvedQuery,
  });
  const gate = getRequestWorkState(binding.request, binding.runtime as AccessRuntime).hookGate;
  const original = getIncludeOriginal(args.input, authorization);
  const privateRow =
    args.virtualPopulateRow ?? (original && typeof original === 'object' ? getVirtualPopulateRow(original) : undefined);
  const address = args.virtualPopulateAddress ?? [];
  // A working shell is internal preparation, not selected-output work or a DTO certificate.
  const working: Record<string, unknown> = {};
  // Without getters, output reads selected data descriptors directly below.
  // An unused full-source working shell is neither isolation nor admission.
  if (plan.candidates?.length)
    for (const key of Object.keys(source)) {
      const slot = Object.getOwnPropertyDescriptor(source, key)!;
      if ('value' in slot) defineTrustedOutputValue(working, key, slot.value);
    }
  const finalizedChildren = new Map<string, unknown>();
  for (const [field, childPlan] of Object.entries(plan.childPlans ?? {})) {
    if (!Object.hasOwn(source, field)) continue;
    visitTrustedOutput(budget, depth + 1); // BEFORE policy/value observation, including denied child structure.
    if (hasWholeOutputValueGrant(plan, field)) continue;
    const slot = Object.getOwnPropertyDescriptor(source, field)!;
    if (!('value' in slot)) failTrustedOutputBudget(budget, new ServiceAuthorizationError('accessor selected output'));
    const scoped = authorizeEmbeddedOutputPlan(plan, childPlan);
    const base: FinalizeModelOutputArgs = {
      ...args,
      input: undefined,
      plan: scoped,
      scopePath: childPlan.scopePath,
      documentStage: undefined,
      owningDocument: stage,
      owningBinding: binding,
      publication: owner,
      outputBudget: budget,
      completeOutput: undefined,
      onFinalized: undefined,
      virtualPopulateRow: privateRow,
      lineage: nextLineage,
      prepaid: true,
    };
    const childPreparation = prepareFinalizer(base);
    const one = async (
      value: unknown,
      childDepth: number,
      childAddress: VirtualPopulateAddress,
      ancestors: ReadonlySet<object>,
    ): Promise<unknown> => {
      assertOutputPublication(owner);
      visitTrustedOutput(budget, childDepth, 0);
      if (value && typeof value === 'object' && types.isProxy(value))
        failTrustedOutputBudget(budget, new ServiceAuthorizationError('unsupported selected proxy'));
      if (Array.isArray(value)) {
        if (ancestors.has(value))
          failTrustedOutputBudget(budget, new ServiceAuthorizationError('cyclic selected document output'));
        const arrayLineage = new Set(ancestors).add(value);
        const entries = shallowTrustedOutputArray(value, budget, childDepth, true);
        return mapWithConcurrencyLimit(
          entries,
          gate.limit,
          (entry, index) => one(entry, childDepth + 1, [...childAddress, index], arrayLineage),
          (error) => failOutputPublication(owner, error),
        );
      }
      if (value == null) return value;
      if (!isPlainObject(value)) {
        if (typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol')
          failTrustedOutputBudget(budget, new ServiceAuthorizationError('unsupported selected embedded value'));
        return null;
      }
      return finalizeOutputDocument(
        {
          ...base,
          input: value,
          documentStage: prepareEmbeddedDocumentStage(scoped.authorization!, scoped.authorizationBinding!, value, {
            stage,
            binding,
          }).stage,
          outputDepth: childDepth,
          virtualPopulateAddress: childAddress,
          lineage: ancestors,
        },
        childPreparation,
      );
    };
    const value = await one(
      trustedMapOutputScope(slot.value, childPlan.outputPersistedFields, budget, depth + 1),
      depth + 1,
      [...address, field],
      nextLineage,
    );
    finalizedChildren.set(field, value);
    defineTrustedOutputValue(working, field, value);
  }
  // Completed related target values are private handoffs from actual target construction.
  for (const field of plan.outputPersistedFields) {
    const key = [...address, field].join('.');
    if (args.completedReferences?.has(key)) defineTrustedOutputValue(working, field, args.completedReferences.get(key));
  }
  for (const { path, value } of args.includeAttachments ?? [])
    setTrustedOutputPath(working, path, value, budget, depth);
  for (const field of preparation.virtualNames) delete working[field];
  const candidates = plan.candidates ?? [];
  const hasDependencies = (dependsOn: readonly string[]) =>
    dependsOn.every((key) => Object.hasOwn(working, key) && working[key] !== undefined);
  const needsView = candidates.some(
    (candidate) =>
      typeof candidate.descriptor.get === 'function' && hasDependencies(candidate.descriptor.dependsOn ?? []),
  );
  if (needsView) {
    const catalog = readServiceOutputPolicy(authorization, binding).catalog;
    for (const field of plan.outputPersistedFields) {
      const path = [...(binding.scopePath ?? []), field].join('.');
      if (
        !args.completedReferences?.has([...address, field].join('.')) &&
        catalog.referencePaths?.some((entry) => matchesCatalogPattern(entry, path))
      )
        defineTrustedOutputValue(
          working,
          field,
          copyAuthorizedReference(working[field], path, { budget: createTrustedOutputBudget(), depth: 0 }),
        );
    }
  }
  const stableBase = needsView ? copyDocumentView(working) : undefined;
  let viewConsumers = candidates.filter(
    (candidate) =>
      typeof candidate.descriptor.get === 'function' && hasDependencies(candidate.descriptor.dependsOn ?? []),
  ).length;
  const getterView = () => {
    // All earlier exposures were detached from this still-private stable base.
    // The final possible consumer may take it directly: no future callback can
    // read it, and sibling/native views have already been independently copied.
    if (stableBase && --viewConsumers === 0) return stableBase;
    return copyDocumentView(stableBase ?? working);
  };
  const staged = new Map<string, unknown>();
  await mapWithConcurrencyLimit(
    candidates,
    gate.limit,
    async (candidate) => {
      assertOutputPublication(owner);
      visitTrustedOutput(budget, depth + 1);
      if (!hasDependencies(candidate.descriptor.dependsOn ?? [])) return;
      const decision = evaluateAuthorizedOutputField(stage, binding, candidate.name);
      if (!(typeof decision === 'boolean' ? decision : await decision)) return;
      const privateInputs = privateRow
        ? readVirtualPopulateInputs(privateRow, address, candidate.name)
        : candidate.descriptor.dependsOnPopulate?.length
          ? { available: false as const }
          : { available: true as const, populated: {} };
      if (!privateInputs.available) return;
      const outcome = await trackPublicationWork(
        owner,
        runVirtualGetter({
          req: args.request,
          gate,
          getter: candidate.descriptor.get,
          view: getterView(),
          permissions: getAuthorizationPermissions(authorization, binding),
          context,
          populated: privateInputs.populated,
          logMeta: {
            modelName: binding.modelName,
            scope: context.scopePath.join('.'),
            field: candidate.name,
            virtualAccess: args.virtualAccess,
            outputAccess: args.outputAccess,
            operation: context.operation,
          },
        }),
      );
      readDocumentStage(stage, binding);
      assertTrustedOutputBudget(budget);
      if (!outcome.ok || outcome.value === undefined) return; // getter BODY throws still omit.
      staged.set(
        candidate.name,
        copyOutputValue(
          outcome.value,
          plan,
          [...(binding.scopePath ?? []), candidate.name].join('.'),
          { budget, depth: depth + 1 },
          true,
        ),
      );
    },
    (error) => failOutputPublication(owner, error),
  );
  // Field decisions and copies below remain stage-local and charged to the receiving budget.
  const output: Record<string, unknown> = {};
  for (const field of plan.outputPersistedFields) {
    if (
      !Object.hasOwn(source, field) &&
      !finalizedChildren.has(field) &&
      !args.completedReferences?.has([...address, field].join('.'))
    )
      continue;
    if (!plan.childPlans[field]) visitTrustedOutput(budget, depth + 1);
    if (finalizedChildren.has(field)) {
      defineTrustedOutputValue(output, field, finalizedChildren.get(field));
      continue;
    }
    const decision = evaluateAuthorizedOutputField(stage, binding, field);
    if (!(typeof decision === 'boolean' ? decision : await decision)) continue;
    const slot = Object.getOwnPropertyDescriptor(source, field);
    if (slot && !('value' in slot))
      failTrustedOutputBudget(budget, new ServiceAuthorizationError('accessor selected output'));
    let value: unknown = slot?.value;
    if (privateRow && !hasVirtualPopulatePublicReference(privateRow, address, field)) {
      const originalRef = readVirtualPopulateOriginalReference(privateRow, address, field);
      if (originalRef) value = originalRef.present ? originalRef.value : undefined;
    }
    const completedKey = [...address, field].join('.');
    const path = [...(binding.scopePath ?? []), field].join('.');
    const next = { budget, depth: depth + 1 };
    if (args.completedReferences?.has(completedKey)) {
      // Exact private handoff: target construction and this parent's isolation
      // copy already charged the receiving budget. Never infer this from a DTO.
      value = args.completedReferences.get(completedKey);
    } else if (
      readServiceOutputPolicy(authorization, binding).catalog.referencePaths?.some((entry) =>
        matchesCatalogPattern(entry, path),
      )
    )
      value = copyAuthorizedReference(value, path, next, true);
    else value = copyOutputValue(value, plan, path, next, true);
    if (value !== undefined) defineTrustedOutputValue(output, field, value);
  }
  for (const [field, value] of staged) defineTrustedOutputValue(output, field, value);
  if (!plan.outputIdExcluded && plan.fetchIdRetained && Object.hasOwn(source, '_id') && !Object.hasOwn(output, '_id')) {
    visitTrustedOutput(budget, depth + 1);
    defineTrustedOutputValue(
      output,
      '_id',
      materializeTrustedOutputValue(source._id, '_id', budget, { keep: () => true }, depth + 1, true),
    );
  }
  // Completion may reenter; revalidate stage, budget and publication before closing the stage.
  if (args.completeOutput) await args.completeOutput(output, stage, construction);
  else retainOutputMetadata(output, source, preparation.configuration, binding.scopePath ?? [], construction);
  readDocumentStage(stage, binding);
  assertTrustedOutputBudget(budget);
  assertOutputPublication(owner);
  closeDocumentStage(stage);
  args.onFinalized?.(output, context);
  return output;
}

export async function finalizeModelOutput(args: FinalizeModelOutputArgs): Promise<Record<string, unknown>> {
  const owner = args.publication ?? outputPublicationFor(args.plan.authorization!);
  const work = async () => {
    try {
      return await finalizeOutputDocument({ ...args, publication: owner }, prepareFinalizer(args));
    } catch (error) {
      failOutputPublication(owner, error);
      throw error;
    }
  };
  // Nested work keeps its enclosing publication; only the owning entry settles it.
  return args.publication ? work() : runOutputPublication(owner, work);
}

export async function finalizeModelOutputs(args: FinalizeModelOutputsArgs): Promise<Record<string, unknown>[]> {
  const { inputs, documentStages, rowBudgets, rowReferences, ...rest } = args;
  if (
    (documentStages && (documentStages.length !== inputs.length || new Set(documentStages).size !== inputs.length)) ||
    (rowBudgets && rowBudgets.length !== inputs.length)
  )
    authorizationError('list output requires distinct stages and one budget per row');
  const owner = args.publication ?? outputPublicationFor(args.plan.authorization!);
  const work = async () => {
    const base = { ...rest, input: undefined as unknown, publication: owner };
    // Only this existing batch shares preparation; row facts and budgets remain distinct.
    const preparation = prepareFinalizer(base);
    const gate = getRequestWorkState(args.request, args.plan.authorizationBinding!.runtime as AccessRuntime).hookGate;
    return mapWithConcurrencyLimit(
      inputs,
      gate.limit,
      (input, index) =>
        finalizeOutputDocument(
          {
            ...base,
            input,
            documentStage: documentStages?.[index],
            outputBudget: rowBudgets?.[index] ?? createPublicationRowBudget(owner),
            completedReferences: rowReferences?.[index] ?? rest.completedReferences,
            onFinalized: rest.onFinalized ? (output, context) => rest.onFinalized!(output, context, index) : undefined,
          },
          preparation,
        ),
      (error) => failOutputPublication(owner, error),
    );
  };
  return args.publication ? work() : runOutputPublication(owner, work);
}
