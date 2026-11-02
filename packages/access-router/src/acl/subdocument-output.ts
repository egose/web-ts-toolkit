/** Private dedicated output adapter; receives only captured, validated child output authority. */
import type { Service } from '../services/service';
import type { Populate, Projection } from '../interfaces';
import { createServiceExecution, getServiceExecutors, readServiceExecution } from './service-execution';
import {
  getAuthorizationPermissions,
  readServiceAuthorization,
  resolveServiceAuthorization,
  serviceAuthorizationInput,
} from './service-authorization';
import { planAuthorizedModelProjection } from './output-projection';
import { resolveOutputDocumentStage } from './output-field-filter';
import { isolateDocForOutput } from '../helpers/document';
import { copyDocumentView, documentStageSource, prepareQueryDocumentStage } from './document-stage';
import { bindOutputPublication, createPublicationRowBudget, runOutputPublication } from './output-publication';
import type { TrustedOutputBudget } from './trusted-output-materialization';
import { createModelOutputContext } from '../output/model-output-context';
import { finalizeModelOutputs } from '../output/finalize-model-output';
import type { FinalizeSnapshot } from '../output/finalize-model-output';
import { captureRelatedTargets } from './related-execution';
import type { AuthorizationConfiguration } from './service-authorization';
import type { AccessRouterPermissions } from '../permission';
import type { OutputAuthorization } from '../interfaces';
import { getPopulateTargetMeta, setPopulateTargetMeta } from './populate-target';
import { loadVirtualPopulateOutputRows, planVirtualPopulateQuery } from './virtual-populate-execution';
import { getRequestWorkState } from '../helpers/request-work';
import { getCapturedPopulatePolicyDefaults } from './populate-policy';

interface SubdocumentOutputPlan {
  sub: string;
  execution: import('./service-execution').ServiceExecutionContext;
  state: ReturnType<typeof readServiceExecution>;
  plan: import('./virtual-projection').VirtualProjectionPlan;
  populate: Populate[];
}

// Keep the canonical population executor private rather than adding a service option/method.
const populateExecutors = new WeakMap<
  object,
  {
    execute: (execution: SubdocumentOutputPlan['execution'], populate: Populate[]) => Promise<Populate[]>;
    core?: object;
    finalize?: (
      execution: SubdocumentOutputPlan['execution'],
      rows: unknown[],
      populate: Populate[],
      budgets: readonly TrustedOutputBudget[],
      references: Map<string, unknown>[],
    ) => Promise<void>;
  }
>();
export function registerSubdocumentPopulateExecutor(
  service: object,
  execute: (execution: SubdocumentOutputPlan['execution'], populate: Populate[]) => Promise<Populate[]>,
  core?: object,
  finalize?: (
    execution: SubdocumentOutputPlan['execution'],
    rows: unknown[],
    populate: Populate[],
    budgets: readonly TrustedOutputBudget[],
    references: Map<string, unknown>[],
  ) => Promise<void>,
): void {
  populateExecutors.set(service, { execute, core, finalize });
}
export function prepareSubdocumentPopulate(service: object, prepared: SubdocumentOutputPlan): Promise<Populate[]> {
  return populateExecutors.get(service)!.execute(prepared.execution, prepared.populate);
}

/** The dedicated child is an output root, while ordinary population is parent-relative. */
function childPopulate(prepared: SubdocumentOutputPlan, populate: readonly Populate[]): Populate[] {
  return populate.map((entry) => {
    const local = { ...entry, path: entry.path.slice(prepared.sub.length + 1) };
    const meta = getPopulateTargetMeta(entry);
    if (meta) setPopulateTargetMeta(local, meta);
    return local;
  });
}

export function subdocumentRequiresPopulateCapture(prepared: SubdocumentOutputPlan, populate: Populate[]): boolean {
  return planVirtualPopulateQuery(prepared.plan, childPopulate(prepared, populate)).requiresCapture;
}

export function prepareSubdocumentOutput<T, V extends object>(
  service: Service<T, V>,
  sub: string,
  operation: string,
  virtualAccess: string,
  outputAccess: string,
  select?: Projection,
  populate?: Populate[],
  captured?: {
    configuration: AuthorizationConfiguration;
    permissions: AccessRouterPermissions;
    authorization: OutputAuthorization;
  },
): SubdocumentOutputPlan {
  const configuration = { ...(captured?.configuration ?? getServiceExecutors(service).configuration()) };
  // Dedicated child routes have their own operation/row gates. Their field
  // schema is local: the parent's relationship output rule is not a route gate.
  const schema = configuration.permissionSchema as Record<string, unknown>;
  configuration.permissionSchema = { ...schema, [sub]: { ...(schema?.[sub] as object), [outputAccess]: true } };
  const execution = createServiceExecution(
    service,
    { operation, rowAccess: 'read', virtualAccess, outputAccess, docPermissionsAccess: 'read' },
    captured?.authorization,
    'service',
    captureRelatedTargets(
      getServiceExecutors(service).binding().runtime as import('../runtime').AccessRuntime,
      service.getServiceModelName(),
      { populate },
      0,
      getCapturedPopulatePolicyDefaults(configuration),
    ),
    undefined,
    configuration,
    captured?.permissions,
  );
  const state = readServiceExecution(service, execution);
  const binding = { ...state.binding, scopePath: [sub] };
  const view = readServiceAuthorization(state.authorization, state.binding);
  const authorization = resolveServiceAuthorization({
    ...view,
    authorization: serviceAuthorizationInput(view.authorization, view.relatedTargets),
    binding,
    parent: state.authorization,
    requestPermissions: getAuthorizationPermissions(state.authorization, state.binding),
  });
  const plan = planAuthorizedModelProjection({ authorization, binding, requestedSelect: select });
  bindOutputPublication(authorization, state.publication);
  return { sub, execution, state, plan, populate: populate ?? [] };
}

export async function finalizeSubdocumentRows<T, V extends object>(
  service: Service<T, V>,
  prepared: SubdocumentOutputPlan,
  parent: unknown,
  rows: unknown[],
  populate: Populate[] = [],
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return [];
  const { state, plan } = prepared;
  return runOutputPublication(state.publication, async () => {
    const context = createModelOutputContext({ modelName: state.binding.modelName, ...state.access });
    const parentStage = prepareQueryDocumentStage(state.authorization, state.binding, parent);
    const owningDocument = await resolveOutputDocumentStage({
      authorization: state.authorization,
      binding: state.binding,
      snapshot: documentStageSource(parentStage.stage, state.binding),
      stage: parentStage.stage,
      context,
    });
    const localPopulate = childPopulate(prepared, populate);
    const rowBudgets = rows.map(() => createPublicationRowBudget(state.publication));
    const rowReferences = rows.map(() => new Map<string, unknown>());
    const population = planVirtualPopulateQuery(plan, localPopulate);
    let inputs = rows;
    if (population.requiresCapture) {
      // Parent hooks keep their raw owning-document input. Only visible children
      // enter this collected batch; never populate persistence documents.
      const runtime = state.binding.runtime as import('../runtime').AccessRuntime;
      inputs = await loadVirtualPopulateOutputRows(
        {
          request: service.getServiceRequest(),
          runtime,
          family: state.family,
          core: populateExecutors.get(service)?.core,
          permissions: getAuthorizationPermissions(state.authorization, state.binding),
          hydration: ['subCreate', 'subUpdate', 'subBulkUpdate'].includes(state.access.operation) ? 'lean' : 'hydrated',
        },
        rows,
        plan,
        population.publicPopulate,
        [...plan.publicPersistedFetchSelection, ...localPopulate.map((entry) => entry.path)],
        population.queryPopulate,
        population.queryPopulate.length
          ? (output) =>
              getRequestWorkState(service.getServiceRequest(), runtime).scheduler.work(() =>
                (state.binding.model as import('mongoose').Model<unknown>).populate(
                  { [prepared.sub]: output },
                  populate.filter((entry) =>
                    population.queryPopulate.some((local) => entry.path === `${prepared.sub}.${local.path}`),
                  ),
                ),
              )
          : undefined,
      );
    }
    if (populate.length)
      await populateExecutors.get(service)!.finalize!(
        prepared.execution,
        inputs,
        localPopulate,
        rowBudgets,
        rowReferences,
      );
    return finalizeModelOutputs({
      receivingModelName: state.binding.modelName,
      inputs,
      plan,
      snapshot: readServiceAuthorization(state.authorization, state.binding).configuration as FinalizeSnapshot,
      request: service.getServiceRequest(),
      context,
      ...state.access,
      owningDocument,
      owningBinding: state.binding,
      publication: state.publication,
      rowBudgets,
      rowReferences,
    });
  });
}

/** Output copies preserve populated target handles without changing persistence documents. */
export function copySubdocumentParent(parent: unknown): Record<string, unknown> {
  return copyDocumentView(isolateDocForOutput(parent)) as Record<string, unknown>;
}
