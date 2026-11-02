/** Shared private stage evaluator and fresh raw output-only helpers. No row/write authority. */
import { types } from 'node:util';
import { isPlainObject } from '@web-ts-toolkit/utils';
import type { ModelOutputContext, ModelRequest } from '../interfaces';
import type { AccessRuntime } from '../runtime';
import type { AccessRouterPermissions } from '../permission';
import { getRequestWorkState } from '../helpers/request-work';
import { EMPTY_DOCUMENT_GRANTS, invokeDocumentPermissions } from './document-grants';
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
  type DocumentStage,
} from './document-stage';
import {
  assertAuthorizationBinding,
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
import { isCatalogOutputPath, isSafeOutputPath, matchesCatalogPattern } from './field-catalog';
import { planAuthorizedModelProjection } from './output-projection';
import type { VirtualProjectionPlan } from './virtual-projection';
import {
  callFieldPolicy,
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
  createPublicationRowBudget,
  failOutputPublication,
  outputPublicationFor,
  runOutputPublication,
  type OutputPublication,
} from './output-publication';
import { normalizeOutputAuthorizationOptions } from './output-helper-options';
import { createModelOutputContext } from '../output/model-output-context';
import { attachPermissionsAlias } from '../output/permissions-alias';

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
  return memoizeStageFieldDecision(stage, binding, `request:${access}:${entry.path}`, function (permissions, grants) {
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
  const path = [...(binding.scopePath ?? []), field].join('.');
  const key = `output:${path}`;
  const previous = readStageFieldDecision(stage, binding, key);
  if (previous !== undefined) return previous;
  const policy = callFieldPolicy(authorization, binding);
  const prepared = prepareOutputPath(policy, authorization, binding, path, outputAccess);
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

const embeddedPlans = new WeakMap<VirtualProjectionPlan, WeakMap<VirtualProjectionPlan, VirtualProjectionPlan>>();
export function authorizeEmbeddedOutputPlan(
  parent: VirtualProjectionPlan,
  child: VirtualProjectionPlan,
): VirtualProjectionPlan {
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
    return previous;
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
  const scoped = {
    ...child,
    authorization,
    authorizationBinding: Object.freeze({ ...binding, scopePath: Object.freeze([...binding.scopePath]) }),
  };
  scopes.set(child, scoped);
  return scoped;
}

export function hasWholeOutputValueGrant(plan: VirtualProjectionPlan, field: string): boolean {
  return (
    plan.fieldStates?.[field] === 'granted' &&
    hasExplicitFieldGrant(
      readServiceOutputPolicy(plan.authorization!, plan.authorizationBinding!).outputFields,
      [...(plan.authorizationBinding!.scopePath ?? []), field].join('.'),
    )
  );
}

export interface OutputMaterialization {
  readonly budget: TrustedOutputBudget;
  readonly depth: number;
}

export function copyOutputValue(
  value: unknown,
  plan: VirtualProjectionPlan,
  path: string,
  construction: OutputMaterialization,
  prepaid = false,
): unknown {
  const { catalog } = readServiceOutputPolicy(plan.authorization!, plan.authorizationBinding!);
  const virtual = catalog.virtualPaths?.some((entry) => matchesCatalogPattern(entry, path));
  const opaque = catalog.opaquePaths?.some((entry) => matchesCatalogPattern(entry, path));
  const excluded = plan.effectiveSelectNorm
    .filter((token) => token.startsWith('-'))
    .map((token) => [...(plan.authorizationBinding!.scopePath ?? []), token.slice(1)].join('.'));
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
): void {
  if (scope.length || configuration.stripPermissionsField) return;
  const path = (configuration.documentPermissionField as string) ?? '_permissions';
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
  );
  setTrustedOutputPath(output, path, metadata, construction.budget, construction.depth);
  attachPermissionsAlias(output, path);
}

async function filterExistingOutput(
  source: Record<string, unknown>,
  plan: VirtualProjectionPlan,
  stage: DocumentStage,
  construction: OutputMaterialization,
  owner: OutputPublication,
  prepaid = false,
): Promise<{ output: Record<string, unknown>; fields: string[] }> {
  const binding = plan.authorizationBinding!;
  beginDocumentStageOutput(stage, binding);
  visitTrustedOutput(construction.budget, construction.depth, prepaid ? 0 : 1);
  const output: Record<string, unknown> = {},
    fields: string[] = [];
  for (const field of new Set([...plan.outputPersistedFields, ...plan.outputVirtualNames])) {
    if (!Object.hasOwn(source, field)) continue;
    visitTrustedOutput(construction.budget, construction.depth + 1);
    const childPlan = plan.childPlans[field];
    if (childPlan && !hasWholeOutputValueGrant(plan, field)) {
      const scoped = authorizeEmbeddedOutputPlan(plan, childPlan);
      const slot = Object.getOwnPropertyDescriptor(source, field)!;
      if (!('value' in slot)) authorizationError('accessor selected output');
      const one = async (value: unknown, depth: number): Promise<unknown> => {
        visitTrustedOutput(construction.budget, depth, 0);
        if (value && typeof value === 'object' && types.isProxy(value))
          failTrustedOutputBudget(construction.budget, new ServiceAuthorizationError('unsupported selected proxy'));
        if (Array.isArray(value)) {
          const entries = shallowTrustedOutputArray(value, construction.budget, depth, true);
          const values: unknown[] = [];
          for (const entry of entries) values.push((await one(entry, depth + 1)) ?? null);
          return values;
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
        await resolveDocumentStage(child, () => readDocumentStage(stage, binding).grants);
        const result = await filterExistingOutput(
          documentStageSource(child, scoped.authorizationBinding!),
          scoped,
          child,
          { ...construction, depth },
          owner,
          true,
        );
        result.fields.forEach((path) => fields.push(`${field}.${path}`));
        return result.output;
      };
      const value = await one(
        trustedMapOutputScope(slot.value, childPlan.outputPersistedFields, construction.budget, construction.depth + 1),
        construction.depth + 1,
      );
      if (value !== undefined) defineTrustedOutputValue(output, field, value);
    } else {
      const decision = evaluateAuthorizedOutputField(stage, binding, field);
      if (!(typeof decision === 'boolean' ? decision : await decision)) continue;
      const slot = Object.getOwnPropertyDescriptor(source, field)!;
      if (!('value' in slot)) authorizationError('accessor selected output');
      if (slot.value === undefined) continue;
      const path = [...(binding.scopePath ?? []), field].join('.');
      const next = { ...construction, depth: construction.depth + 1 };
      const value = readServiceOutputPolicy(plan.authorization!, binding).catalog.referencePaths?.some((entry) =>
        matchesCatalogPattern(entry, path),
      )
        ? copyAuthorizedReference(slot.value, path, next, true)
        : copyOutputValue(slot.value, plan, path, next, true);
      if (value !== undefined) {
        defineTrustedOutputValue(output, field, value);
        fields.push(field);
      }
    }
  }
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
    fields.push('_id');
  }
  retainOutputMetadata(
    output,
    source,
    readServiceOutputMetadata(plan.authorization!, binding),
    binding.scopePath ?? [],
    construction,
  );
  readDocumentStage(stage, binding);
  closeDocumentStage(stage);
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
    await resolveDocumentStage(stage, () => EMPTY_DOCUMENT_GRANTS);
    try {
      const source = documentStageSource(stage, binding);
      // This helper can only filter fields actually present on this detached
      // input. Do not plan absent embedded/virtual subtrees or query dependencies.
      // Use safe literal root names, not arbitrary input strings as select syntax.
      const present = Object.keys(source).filter((key) => !key.includes('.') && isSafeOutputPath(key));
      return await filterExistingOutput(
        source,
        planAuthorizedModelProjection({ authorization, binding, effectiveSelect: present }),
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
