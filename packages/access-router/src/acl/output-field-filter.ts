/** Shared private stage evaluator and fresh raw output-only helpers. No row/write authority. */
import { types } from 'node:util';
import { isPlainObject } from '@web-ts-toolkit/utils';
import type { ModelOutputContext, ModelRequest } from '../interfaces';
import type { AccessRuntime } from '../runtime';
import type { AccessRouterPermissions } from '../permission';
import { getRequestWorkState } from '../helpers/request-work';
import { invokeDocumentPermissions } from './document-grants';
import { authorizationError, ServiceAuthorizationError } from './authorization-snapshot';
import {
  assertDocumentStage,
  beginDocumentStageOutput,
  closeDocumentStage,
  createDocumentStage,
  documentStageSource,
  memoizeStageFieldDecision,
  prepareEmbeddedDocumentStage,
  readDocumentStage,
  readDocumentStageAccess,
  readOwningDocumentStage,
  readStageFieldDecision,
  resolveDocumentStage,
  resolveEmptyOutputHelperStage,
  type DocumentStage,
} from './document-stage';
import {
  assertAuthorizationBinding,
  captureAuthorizationPermissions,
  clearOutputHelperAuthorization,
  deriveQueryAuthorization,
  getAuthorizationPermissions,
  readServiceAuthorization,
  readServiceAuthorizationAccess,
  readServiceDocumentPermissions,
  readServiceOutputMetadata,
  readServiceOutputPolicy,
  type AuthorizationBinding,
  type AuthorizationConfiguration,
  type ResolvedServiceAuthorization,
} from './service-authorization';
import { captureOutputHelperConfiguration, getCapturedAuthorizationOption } from './model-output-planning';
import { evaluateScopedAccessRuleValue, hasExplicitFieldGrant } from './field-authorization';
import {
  clearCapturedOutputCatalog,
  isCatalogOutputPath,
  isSafeOutputPath,
  matchesCatalogPattern,
} from './field-catalog';
import { prepareExistingOutputShape, type OutputSelectionShape } from './output-selection';
import {
  callFieldPolicy,
  clearOutputFieldPolicy,
  prepareOutputPath,
  requestRuleClassification,
  type PreparedRequestRule,
} from './output-field-policy';
import {
  materializeTrustedOutputValue,
  shallowTrustedOutputArray,
  trustedMapOutputScope,
  visitTrustedOutput,
  defineTrustedOutputValue,
  failTrustedOutputBudget,
  setTrustedOutputPath,
  type TrustedOutputBudget,
} from './trusted-output-materialization';
import {
  bindOutputPublication,
  admitPublicationWork,
  assertOutputPublication,
  createCollectionOutputLedger,
  createOutputPublication,
  createPublicationRowBudget,
  failOutputPublication,
  outputPublicationFor,
  runOutputPublication,
  trackPublicationWork,
  publicationOutputLedger,
  retainPublicationResource,
  type OutputPublication,
} from './output-publication';
import { normalizeOutputAuthorizationOptions } from './output-helper-options';
import { createModelOutputContext } from '../output/model-output-context';
import { attachPermissionsAlias } from '../output/permissions-alias';
import { mapWithConcurrencyLimit } from '../helpers/concurrency';
import { admitOutputHelperManyControls, admitOutputHelperRows } from './output-helper-many-admission';
import {
  currentOutputWorkLedger,
  debitOutputWork,
  prepareOutputWorkString,
  withOutputWorkLedger,
} from './output-work-ledger';

interface ResolveOutputStageArgs {
  authorization: ResolvedServiceAuthorization;
  binding: AuthorizationBinding;
  snapshot: Record<string, unknown>;
  context: { operation?: string; resolvedQuery?: unknown };
  stage?: DocumentStage;
  owningDocument?: DocumentStage;
  owningBinding?: AuthorizationBinding;
}

export function prepareOutputDocumentStage(
  authorization: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  configuration: AuthorizationConfiguration,
): (args: ResolveOutputStageArgs) => Promise<DocumentStage> {
  const access = readServiceAuthorizationAccess(authorization, binding);
  const option = getCapturedAuthorizationOption(configuration, `docPermissions.${access.docPermissionsAccess}`);
  const hook = typeof option === 'function' ? option : undefined;
  return async (args) => {
    if (args.authorization !== authorization) authorizationError('document resolver call mismatch');
    assertAuthorizationBinding(authorization, args.binding);
    const owning = args.owningDocument ? { stage: args.owningDocument, binding: args.owningBinding! } : undefined;
    const stage = args.stage ?? createDocumentStage(authorization, args.binding, args.snapshot, owning);
    if (args.stage) assertDocumentStage(stage, authorization, args.binding, args.snapshot);
    const context =
      hook && !owning
        ? createModelOutputContext({
            modelName: args.binding.modelName,
            ...access,
            scopePath: (args.binding.scopePath ?? []).flatMap((part) => [part, 'sub']),
            resolvedQuery: args.context.resolvedQuery,
          })
        : undefined;
    await resolveDocumentStage(
      stage,
      function (doc, permissions) {
        if (owning) return readDocumentStage(owning.stage, owning.binding).grants;
        return invokeDocumentPermissions({
          invoke: hook
            ? () => {
                readDocumentStageAccess(stage, args.binding);
                return hook.call(this, doc, permissions, context!);
              }
            : undefined,
          gate: getRequestWorkState(binding.request, binding.runtime as AccessRuntime).hookGate,
          metadataField: readServiceOutputMetadata(authorization, binding).documentPermissionField,
          modelName: binding.modelName,
          access: access.docPermissionsAccess,
          operation: access.operation,
          preserveControlledErrors: true,
        });
      },
      !!hook && !owning,
    );
    return stage;
  };
}

export function resolveOutputDocumentStage(args: ResolveOutputStageArgs): Promise<DocumentStage> {
  return prepareOutputDocumentStage(
    args.authorization,
    args.binding,
    readServiceDocumentPermissions(args.authorization, args.binding),
  )(args);
}

function evaluateRequestRule(
  stage: DocumentStage,
  binding: AuthorizationBinding,
  entry: PreparedRequestRule,
  prefix: unknown,
  access: string,
): boolean | Promise<boolean> {
  const owning = readOwningDocumentStage(stage);
  if (owning && !entry.path.startsWith(`${(binding.scopePath ?? []).join('.')}.`))
    return evaluateRequestRule(owning.stage, owning.binding, entry, prefix, access);
  const ledger = publicationOutputLedger(outputPublicationFor(readDocumentStageAccess(stage, binding).authorization));
  const key = prepareOutputWorkString(['request:', access, ':', entry.path], '', ledger);
  return memoizeStageFieldDecision(stage, binding, key, function (permissions, grants) {
    const { authorization } = readDocumentStageAccess(stage, binding);
    return (
      requestRuleClassification(entry, authorization, permissions, prefix)?.decision ??
      evaluateScopedAccessRuleValue({
        req: this,
        rule: entry.rule,
        globalPermissions: permissions,
        docPermissions: grants,
        modelPermissionPrefix: prefix as string,
      })
    );
  });
}

function orderedRules(
  entries: readonly PreparedRequestRule[],
  evaluate: (entry: PreparedRequestRule) => boolean | Promise<boolean>,
): boolean | Promise<boolean> {
  for (let index = 0; index < entries.length; index++) {
    const value = evaluate(entries[index]);
    if (typeof value !== 'boolean')
      return (async () => {
        if (!(await value)) return false;
        for (let next = index + 1; next < entries.length; next++) {
          const result = evaluate(entries[next]);
          if (!(typeof result === 'boolean' ? result : await result)) return false;
        }
        return true;
      })();
    if (!value) return false;
  }
  return true;
}

export function evaluateAuthorizedOutputField(
  stage: DocumentStage,
  binding: AuthorizationBinding,
  field: string,
): boolean | Promise<boolean> {
  const { authorization, outputAccess } = readDocumentStage(stage, binding);
  const ledger = publicationOutputLedger(outputPublicationFor(authorization));
  const path = prepareOutputWorkString([...(binding.scopePath ?? []), field], '.', ledger);
  const key = prepareOutputWorkString(['output:', path], '', ledger);
  const previous = readStageFieldDecision(stage, binding, key);
  if (previous !== undefined) return previous;
  debitOutputWork(ledger); // attempted field decision, including backend grants
  const policy = withOutputWorkLedger(ledger, () => callFieldPolicy(authorization, binding));
  const prepared = withOutputWorkLedger(ledger, () =>
    prepareOutputPath(policy, authorization, binding, path, outputAccess),
  );
  if (prepared.backendGrant) return true;
  const evaluate = () =>
    orderedRules(prepared.entries, (entry) => evaluateRequestRule(stage, binding, entry, policy.prefix, outputAccess));
  // Static aggregates add no decision of their own. Keep exact request-key
  // first-decision semantics, and one shared aggregate promise for async rules.
  return prepared.documentDependent ? memoizeStageFieldDecision(stage, binding, key, evaluate) : evaluate();
}

/** Metadata shares request decisions, never backend output grants. */
export async function requestOutputFieldPaths(
  stage: DocumentStage,
  binding: AuthorizationBinding,
  access: string,
  construction: OutputMaterialization,
): Promise<string[]> {
  const { authorization } = readDocumentStage(stage, binding);
  const policy = callFieldPolicy(authorization, binding);
  const fields: string[] = [];
  for (const path of policy.requestPaths ?? Object.keys(policy.schema ?? {})) {
    // An attempted metadata key is selected work even when its rule denies it.
    // Admit before policy evaluation, not after collecting only allowed paths.
    visitTrustedOutput(construction.budget, construction.depth + 1);
    const { entries } = prepareOutputPath(policy, authorization, binding, path, access);
    const allowed = orderedRules(entries, (entry) => evaluateRequestRule(stage, binding, entry, policy.prefix, access));
    if (entries.length && (typeof allowed === 'boolean' ? allowed : await allowed)) fields.push(path);
  }
  readDocumentStage(stage, binding);
  return fields;
}

const embeddedPlans = new WeakMap<OutputSelectionShape, WeakMap<OutputSelectionShape, OutputSelectionShape>>();
export function authorizeEmbeddedOutputPlan<T extends OutputSelectionShape>(parent: T, child: T): T {
  const ledger = publicationOutputLedger(outputPublicationFor(parent.authorization!));
  if (ledger && currentOutputWorkLedger() !== ledger)
    return withOutputWorkLedger(ledger, () => authorizeEmbeddedOutputPlan(parent, child));
  if (!Object.values(parent.childPlans).includes(child)) authorizationError('unknown embedded output plan');
  const binding = {
    ...parent.authorizationBinding!,
    scopePath: child.responseScopePath ?? child.scopePath.filter((part) => part !== 'sub'),
  };
  assertAuthorizationBinding(parent.authorization!, parent.authorizationBinding!);
  let scopes = embeddedPlans.get(parent);
  if (!scopes) embeddedPlans.set(parent, (scopes = new WeakMap()));
  const previous = scopes.get(child);
  if (previous) {
    assertAuthorizationBinding(previous.authorization!, binding);
    return previous as T;
  }
  const view = readServiceAuthorization(parent.authorization!, parent.authorizationBinding!);
  const authorization = deriveQueryAuthorization({
    ...view,
    binding,
    requestPermissions: getAuthorizationPermissions(parent.authorization!, parent.authorizationBinding!),
    parent: parent.authorization,
    snapshotDerivation: { kind: 'embedded', parentBinding: parent.authorizationBinding! },
  });
  if (!authorization) authorizationError('invalid embedded edge');
  bindOutputPublication(authorization, outputPublicationFor(parent.authorization!));
  const publication = outputPublicationFor(authorization);
  if (publicationOutputLedger(publication))
    retainPublicationResource(publication, () => clearOutputHelperAuthorization(authorization));
  const scoped = {
    ...child,
    authorization,
    authorizationBinding: Object.freeze({ ...binding, scopePath: Object.freeze([...binding.scopePath]) }),
  };
  scopes.set(child, scoped);
  return scoped;
}

export function hasWholeOutputValueGrant(plan: OutputSelectionShape, field: string): boolean {
  return withOutputWorkLedger(
    publicationOutputLedger(outputPublicationFor(plan.authorization!)),
    () =>
      plan.fieldStates?.[field] === 'granted' &&
      hasExplicitFieldGrant(
        readServiceOutputPolicy(plan.authorization!, plan.authorizationBinding!).outputFields,
        [...(plan.authorizationBinding!.scopePath ?? []), field].join('.'),
      ),
  );
}

export interface OutputMaterialization {
  readonly budget: TrustedOutputBudget;
  readonly depth: number;
}

export function copyOutputValue(
  value: unknown,
  plan: OutputSelectionShape,
  path: string,
  construction: OutputMaterialization,
  prepaid = false,
): unknown {
  return prepareOutputValueCopy(plan)(value, path, construction, prepaid);
}

/** Immutable call-local copy policy; does not memoize decisions or certify values. */
function prepareOutputValueCopy(plan: OutputSelectionShape) {
  const { catalog } = readServiceOutputPolicy(plan.authorization!, plan.authorizationBinding!);
  const excluded = plan.effectiveSelectNorm
    .filter((token) => token.startsWith('-'))
    .map((token) => [...(plan.authorizationBinding!.scopePath ?? []), token.slice(1)].join('.'));
  return (value: unknown, path: string, construction: OutputMaterialization, prepaid = false): unknown => {
    assertAuthorizationBinding(plan.authorization!, plan.authorizationBinding!);
    return withOutputWorkLedger(publicationOutputLedger(outputPublicationFor(plan.authorization!)), () => {
      const virtual = catalog.virtualPaths?.some((entry) => matchesCatalogPattern(entry, path));
      const opaque = catalog.opaquePaths?.some((entry) => matchesCatalogPattern(entry, path));
      return materializeTrustedOutputValue(
        value,
        path,
        construction.budget,
        {
          keep(key, child) {
            return (
              !excluded.some((entry) => child === entry || child.startsWith(`${entry}.`)) &&
              (opaque || isSafeOutputPath(key)) &&
              !catalog.protectedPaths?.some((entry) => matchesCatalogPattern(entry, child, true)) &&
              (opaque || virtual || isCatalogOutputPath(catalog, child))
            );
          },
        },
        construction.depth,
        prepaid,
      );
    });
  };
}

/** Raw refs disclose only IDs. Completed target values travel in private construction arguments, not DTO associations. */
export function copyAuthorizedReference(
  value: unknown,
  path: string,
  construction: OutputMaterialization,
  prepaid = false,
): unknown {
  if (value && typeof value === 'object' && types.isProxy(value))
    failTrustedOutputBudget(construction.budget, new ServiceAuthorizationError('unsupported selected proxy'));
  if (Array.isArray(value)) {
    const entries = shallowTrustedOutputArray(value, construction.budget, construction.depth, prepaid);
    return entries.map((entry) =>
      copyAuthorizedReference(entry, path, { ...construction, depth: construction.depth + 1 }, true),
    );
  }
  if (isPlainObject(value)) {
    visitTrustedOutput(construction.budget, construction.depth, prepaid ? 0 : 1);
    visitTrustedOutput(construction.budget, construction.depth + 1);
    const id = Object.getOwnPropertyDescriptor(value, '_id');
    if (!id) return undefined;
    if (!('value' in id))
      failTrustedOutputBudget(construction.budget, new ServiceAuthorizationError('unsupported selected reference'));
    return materializeTrustedOutputValue(
      id.value,
      path,
      construction.budget,
      { keep: () => true },
      construction.depth + 1,
      true,
    );
  }
  return materializeTrustedOutputValue(
    value,
    path,
    construction.budget,
    { keep: () => true },
    construction.depth,
    prepaid,
  );
}

/** Metadata remains DATA. Retaining it cannot supply stage facts or row authority. */
export function retainOutputMetadata(
  output: Record<string, unknown>,
  source: Record<string, unknown>,
  configuration: Record<string, unknown>,
  scope: readonly string[],
  construction: OutputMaterialization,
  admitRoot = false,
): void {
  if (scope.length) return;
  const path = (configuration.documentPermissionField as string) ?? '_permissions';
  // Raw helpers selected their present literal roots, including protected metadata.
  // Charge that encountered root before strip/exposure or reading its value. The
  // ordinary query consumer keeps its existing metadata construction accounting.
  const prepaid = admitRoot && Object.hasOwn(source, path.split('.')[0]);
  if (prepaid) visitTrustedOutput(construction.budget, construction.depth + 1);
  if (configuration.stripPermissionsField) return;
  let value: unknown = source;
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object') return;
    const slot = Object.getOwnPropertyDescriptor(value, part);
    if (!slot || !('value' in slot)) return;
    value = slot.value;
  }
  if (!isPlainObject(value)) return;
  const keys = configuration.exposedDocPermissionKeys as readonly string[] | undefined;
  const metadata = materializeTrustedOutputValue(
    value,
    path,
    construction.budget,
    {
      keep(key, child) {
        // Exposure selects top-level metadata entries. It must not recursively
        // strip the contents of retained _view/_edit DATA maps (or other retained
        // presentation values); native/selected bounds still apply at every key.
        if (child !== `${path}.${key}`) return true;
        return key === '_view' || key === '_edit'
          ? !configuration.disableFieldPermissions
          : !keys || keys.includes(key);
      },
    },
    construction.depth + path.split('.').length,
    prepaid && !path.includes('.'),
  );
  setTrustedOutputPath(output, path, metadata, construction.budget, construction.depth);
  attachPermissionsAlias(output, path);
}

/** Track actual continuations only, checking the owning live stage before resumed work. */
function continueExistingOutput<T, U>(
  value: T | Promise<T>,
  stage: DocumentStage,
  binding: AuthorizationBinding,
  owner: OutputPublication,
  accept: (value: T) => U | Promise<U>,
): U | Promise<U> {
  const checked = (result: T) => {
    readDocumentStage(stage, binding);
    return accept(result);
  };
  if (!types.isPromise(value)) return checked(value);
  // A synchronous callback may have caught an inner controlled failure. Do not
  // allocate/admit a continuation after poison (or strand its rejected promise).
  readDocumentStage(stage, binding);
  return trackPublicationWork(
    owner,
    value.then(checked).catch((error) => {
      failOutputPublication(owner, error);
      throw error;
    }),
  );
}

interface ExistingOutputResult {
  output: Record<string, unknown>;
  fields: string[];
}

function filterExistingOutput(
  source: Record<string, unknown>,
  plan: OutputSelectionShape,
  stage: DocumentStage,
  construction: OutputMaterialization,
  owner: OutputPublication,
  prepaid = false,
): ExistingOutputResult | Promise<ExistingOutputResult> {
  const binding = plan.authorizationBinding!;
  beginDocumentStageOutput(stage, binding);
  visitTrustedOutput(construction.budget, construction.depth, prepaid ? 0 : 1);
  const output: Record<string, unknown> = {},
    fields: string[] = [];
  const policy = readServiceOutputPolicy(plan.authorization!, binding);
  const metadata = readServiceOutputMetadata(plan.authorization!, binding);
  const copyValue = prepareOutputValueCopy(plan);
  const ledger = publicationOutputLedger(owner);
  const metadataRoot = !binding.scopePath?.length
    ? (metadata.documentPermissionField ?? '_permissions').split('.')[0]
    : undefined;
  const { eligible, selected } = withOutputWorkLedger(ledger, () => {
    debitOutputWork(ledger, plan.outputPersistedFields.length + 1);
    const eligible = new Set(plan.outputPersistedFields);
    for (const field of plan.outputVirtualNames) {
      debitOutputWork(ledger);
      eligible.add(field);
    }
    debitOutputWork(ledger, eligible.size + 1);
    const roots = new Set(eligible);
    for (const key of Object.keys(source)) {
      debitOutputWork(ledger);
      // Denied/protected present roots are encountered selected slots, not
      // permission to read a value or invent a dynamic descendant. ID/metadata
      // have their own prepaid builders. No temporary combined/filter buffers.
      if (
        !key.includes('.') &&
        isSafeOutputPath(key) &&
        !(key === '_id' && plan.fetchIdRetained) &&
        key !== metadataRoot
      )
        roots.add(key);
    }
    debitOutputWork(ledger, roots.size + 1);
    return { eligible, selected: [...roots] };
  });
  const appendField = (field: string) => {
    debitOutputWork(ledger);
    defineTrustedOutputValue(fields, String(fields.length), field);
  };
  const resume = <T, U>(value: T | Promise<T>, accept: (value: T) => U | Promise<U>) =>
    continueExistingOutput(value, stage, binding, owner, accept);
  const fieldValue = (field: string): void | Promise<void> => {
    readDocumentStage(stage, binding);
    if (!Object.hasOwn(source, field)) return;
    visitTrustedOutput(construction.budget, construction.depth + 1);
    if (!eligible.has(field)) return;
    const childPlan = plan.childPlans[field];
    if (childPlan && !hasWholeOutputValueGrant(plan, field)) {
      const scoped = authorizeEmbeddedOutputPlan(plan, childPlan);
      const slot = Object.getOwnPropertyDescriptor(source, field)!;
      if (!('value' in slot)) authorizationError('accessor selected output');
      const one = (value: unknown, depth: number): unknown | Promise<unknown> => {
        readDocumentStage(stage, binding);
        visitTrustedOutput(construction.budget, depth, 0);
        if (value && typeof value === 'object' && types.isProxy(value))
          failTrustedOutputBudget(construction.budget, new ServiceAuthorizationError('unsupported selected proxy'));
        if (Array.isArray(value)) {
          const entries = shallowTrustedOutputArray(value, construction.budget, depth, true);
          const values: unknown[] = [];
          const append = (start: number): unknown[] | Promise<unknown[]> => {
            for (let index = start; index < entries.length; index++) {
              const value = one(entries[index], depth + 1);
              if (types.isPromise(value))
                return resume(value, (result) => {
                  values.push(result ?? null);
                  return append(index + 1);
                });
              values.push(value ?? null);
            }
            return values;
          };
          return append(0);
        }
        if (!isPlainObject(value)) {
          if (value && (typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol'))
            failTrustedOutputBudget(
              construction.budget,
              new ServiceAuthorizationError('unsupported selected embedded value'),
            );
          return value === null ? null : undefined;
        }
        const child = prepareEmbeddedDocumentStage(scoped.authorization!, scoped.authorizationBinding!, value, {
          stage,
          binding,
        }).stage;
        resolveEmptyOutputHelperStage(child, scoped.authorizationBinding!);
        const result = filterExistingOutput(
          documentStageSource(child, scoped.authorizationBinding!),
          scoped,
          child,
          { ...construction, depth },
          owner,
          true,
        );
        return resume(result, (result) => {
          result.fields.forEach((path) => appendField(prepareOutputWorkString([field, path], '.', ledger)));
          return result.output;
        });
      };
      const value = one(
        trustedMapOutputScope(slot.value, childPlan.outputPersistedFields, construction.budget, construction.depth + 1),
        construction.depth + 1,
      );
      return resume(value, (value) => {
        if (value !== undefined) defineTrustedOutputValue(output, field, value);
      });
    } else {
      const decision = evaluateAuthorizedOutputField(stage, binding, field);
      return resume(decision, (allowed) => {
        if (!allowed) return;
        const slot = Object.getOwnPropertyDescriptor(source, field)!;
        if (!('value' in slot)) authorizationError('accessor selected output');
        if (slot.value === undefined) return;
        const ledger = publicationOutputLedger(owner);
        const path = prepareOutputWorkString([...(binding.scopePath ?? []), field], '.', ledger);
        const next = { ...construction, depth: construction.depth + 1 };
        const reference = withOutputWorkLedger(ledger, () =>
          policy.catalog.referencePaths?.some((entry) => matchesCatalogPattern(entry, path)),
        );
        const value = reference
          ? copyAuthorizedReference(slot.value, path, next, true)
          : copyValue(slot.value, path, next, true);
        if (value !== undefined) {
          defineTrustedOutputValue(output, field, value);
          appendField(field);
        }
      });
    }
  };
  const finish = (): ExistingOutputResult => {
    readDocumentStage(stage, binding);
    if (plan.fetchIdRetained && Object.hasOwn(source, '_id') && !Object.hasOwn(output, '_id')) {
      visitTrustedOutput(construction.budget, construction.depth + 1);
      defineTrustedOutputValue(
        output,
        '_id',
        materializeTrustedOutputValue(
          source._id,
          '_id',
          construction.budget,
          { keep: () => true },
          construction.depth + 1,
          true,
        ),
      );
      appendField('_id');
    }
    retainOutputMetadata(output, source, metadata, binding.scopePath ?? [], construction, true);
    readDocumentStage(stage, binding);
    closeDocumentStage(stage);
    debitOutputWork(ledger, fields.length + 1);
    const unique = new Set(fields);
    debitOutputWork(ledger, unique.size + 1);
    return { output, fields: [...unique] };
  };
  const walk = (start: number): ExistingOutputResult | Promise<ExistingOutputResult> => {
    for (let index = start; index < selected.length; index++) {
      const value = fieldValue(selected[index]);
      if (types.isPromise(value)) return resume(value, () => walk(index + 1));
    }
    return finish();
  };
  return walk(0);
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
  if (!model) authorizationError(`unknown receiving model: ${modelName}`);
  const receiver = { request, runtime, model, modelName };
  const { authorization } = normalizeOutputAuthorizationOptions(
    {
      binding: receiver,
      configuration: () => captureOutputHelperConfiguration(runtime, modelName),
      requestPermissions: args.permissions,
      access: { operation: access, virtualAccess: access, outputAccess: access, docPermissionsAccess: access },
    },
    args.options,
    args.purpose,
  );
  const binding = { ...receiver, scopePath: (args.options as { scopePath?: readonly string[] }).scopePath };
  const owner = outputPublicationFor(authorization);
  return runOutputPublication(owner, async () => {
    if (args.doc == null) return { output: args.doc, fields: [] as string[] };
    const stage = createDocumentStage(authorization, binding, args.doc);
    resolveEmptyOutputHelperStage(stage, binding);
    try {
      const source = documentStageSource(stage, binding);
      // This helper can only filter fields actually present on this detached
      // input. Do not plan absent embedded/virtual subtrees or query dependencies.
      // Use safe literal root names, not arbitrary input strings as select syntax.
      return await filterExistingOutput(
        source,
        prepareExistingOutputShape(authorization, binding, source),
        stage,
        { budget: createPublicationRowBudget(owner), depth: 0 },
        owner,
      );
    } catch (error) {
      failOutputPublication(owner, error);
      throw error;
    }
  });
}

/** One explicit call: shared capture/publication, NEVER shared row source/facts/memo. */
export async function filterModelOutputManyForHelper(args: {
  request: ModelRequest;
  runtime: AccessRuntime;
  modelName: string;
  access: string;
  rows: unknown;
  options: unknown;
  argumentCount: number;
  permissions: () => AccessRouterPermissions;
}): Promise<readonly unknown[]> {
  const owner = createOutputPublication();
  const ledger = createCollectionOutputLedger(owner);
  let rows: unknown[] = [];
  const admitted: Array<{ stage: DocumentStage; source: Record<string, unknown>; plan: OutputSelectionShape } | null> =
    [];
  retainPublicationResource(owner, () => {
    rows.length = 0;
    admitted.length = 0;
  });
  return runOutputPublication(owner, async () => {
    try {
      const { request, runtime, modelName, access } = args;
      withOutputWorkLedger(ledger, () => {
        const options = admitOutputHelperManyControls(args.argumentCount, 4, access, args.options);
        if (typeof modelName !== 'string') authorizationError('invalid receiving model name');
        const model = runtime.getModelInstance(modelName);
        if (!model) authorizationError(`unknown receiving model: ${modelName}`);
        // Actor primitives MUST precede native configuration exposure. Initialized
        // permissions, not a fresh evaluation of live req.user, are authoritative.
        const permissions = captureAuthorizationPermissions(args.permissions(), true);
        const receiver = { request, runtime, model, modelName };
        const { authorization } = normalizeOutputAuthorizationOptions(
          {
            binding: receiver,
            configuration: () => captureOutputHelperConfiguration(runtime, modelName),
            requestPermissions: permissions,
            access: { operation: access, virtualAccess: access, outputAccess: access, docPermissionsAccess: access },
          },
          options,
        );
        bindOutputPublication(authorization, owner);
        let capturedCatalog: AuthorizationConfiguration['catalog'] | undefined;
        retainPublicationResource(owner, () => {
          clearOutputFieldPolicy(authorization);
          if (capturedCatalog) clearCapturedOutputCatalog(capturedCatalog);
          capturedCatalog = undefined;
          clearOutputHelperAuthorization(authorization);
        });
        const binding = { ...receiver, scopePath: options.scopePath as readonly string[] | undefined };
        // Empty/nullish batches still validate the scope/catalog and policy.
        const view = readServiceOutputPolicy(authorization, binding);
        capturedCatalog = view.catalog;
        if (binding.scopePath?.length && !isCatalogOutputPath(view.catalog, binding.scopePath.join('.')))
          authorizationError('unknown output scope');
        rows = admitOutputHelperRows(args.rows);
        for (let index = 0; index < rows.length; index++) {
          const row = rows[index];
          if (row == null) {
            defineTrustedOutputValue(admitted, String(index), null);
            continue;
          }
          const stage = createDocumentStage(authorization, binding, row);
          resolveEmptyOutputHelperStage(stage, binding);
          const source = documentStageSource(stage, binding);
          defineTrustedOutputValue(admitted, String(index), {
            stage,
            source,
            plan: prepareExistingOutputShape(authorization, binding, source),
          });
        }
      });
      const { scheduler, hookGate } = getRequestWorkState(request, runtime);
      if (!rows.length) return [];
      return await mapWithConcurrencyLimit(
        rows,
        Math.min(rows.length, scheduler.limit, hookGate.limit),
        async (row, index) => {
          assertOutputPublication(owner);
          const entry = admitted[index];
          if (!entry) return row;
          try {
            const track = admitPublicationWork(owner);
            const work = hookGate
              .run(async () => {
                assertOutputPublication(owner);
                const result = await filterExistingOutput(
                  entry.source,
                  entry.plan,
                  entry.stage,
                  { budget: createPublicationRowBudget(owner), depth: 0 },
                  owner,
                );
                assertOutputPublication(owner);
                return result.output;
              })
              .catch((error: unknown) => {
                throw error instanceof ServiceAuthorizationError
                  ? error
                  : new ServiceAuthorizationError('collection output admission failed');
              });
            return await track(work);
          } catch (error) {
            failOutputPublication(
              owner,
              error instanceof ServiceAuthorizationError
                ? error
                : new ServiceAuthorizationError('collection output admission failed'),
            );
            assertOutputPublication(owner);
          }
        },
        (error) => failOutputPublication(owner, error),
      );
    } catch (error) {
      failOutputPublication(
        owner,
        error instanceof ServiceAuthorizationError
          ? error
          : new ServiceAuthorizationError('unsupported collection output preparation'),
      );
      assertOutputPublication(owner);
      throw error;
    }
  });
}
