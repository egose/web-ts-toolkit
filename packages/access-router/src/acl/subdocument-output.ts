/** Private dedicated output adapter; receives only captured, validated child output authority. */
import type { Service } from '../services/service';
import type { ModelHookContext, Populate, Projection } from '../interfaces';
import { createServiceExecution, getServiceExecutors, readServiceExecution } from './service-execution';
import {
  getAuthorizationPermissions,
  readServiceAuthorization,
  resolveServiceAuthorization,
  serviceAuthorizationInput,
} from './service-authorization';
import { planAuthorizedModelProjection } from './output-projection';
import { resolveOutputDocumentAuthorization } from './output-field-filter';
import { isolateDocForOutput } from '../helpers/document';
import { transferDocumentAuthorizationGraph } from './document-authorization';
import { finalizeModelOutputs } from '../output/finalize-model-output';
import type { FinalizeSnapshot } from '../output/finalize-model-output';
import { SharedHookGate } from '../helpers/concurrency';
import { captureRelatedTargets } from './related-execution';
import type { AuthorizationConfiguration } from './service-authorization';
import type { AccessRouterPermissions } from '../permission';
import type { OutputAuthorization } from '../interfaces';

interface SubdocumentOutputPlan {
  execution: import('./service-execution').ServiceExecutionContext;
  state: ReturnType<typeof readServiceExecution>;
  plan: import('./virtual-projection').VirtualProjectionPlan;
  populate: Populate[];
}

// Keep the canonical population executor private rather than adding a service option/method.
const populateExecutors = new WeakMap<
  object,
  (execution: SubdocumentOutputPlan['execution'], populate: Populate[]) => Promise<Populate[]>
>();
export function registerSubdocumentPopulateExecutor(
  service: object,
  execute: (execution: SubdocumentOutputPlan['execution'], populate: Populate[]) => Promise<Populate[]>,
): void {
  populateExecutors.set(service, execute);
}
export function prepareSubdocumentPopulate(service: object, prepared: SubdocumentOutputPlan): Promise<Populate[]> {
  return populateExecutors.get(service)!(prepared.execution, prepared.populate);
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
  return { execution, state, plan, populate: populate ?? [] };
}

export async function finalizeSubdocumentRows<T, V extends object>(
  service: Service<T, V>,
  prepared: SubdocumentOutputPlan,
  parent: unknown,
  rows: unknown[],
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return [];
  const { state, plan } = prepared;
  const context: ModelHookContext = {
    modelName: state.binding.modelName,
    mongooseModel: state.binding.model as ModelHookContext['mongooseModel'],
    operation: state.access.operation,
  };
  const limit = service.getVirtualHookConcurrencyLimit();
  const gate = new SharedHookGate(limit);
  const owningDocument = await resolveOutputDocumentAuthorization({
    authorization: state.authorization,
    binding: state.binding,
    snapshot: isolateDocForOutput(parent) as Record<string, unknown>,
    context,
    hookGate: gate,
  });
  return finalizeModelOutputs({
    receivingModelName: state.binding.modelName,
    inputs: rows,
    plan,
    snapshot: readServiceAuthorization(state.authorization, state.binding).configuration as FinalizeSnapshot,
    request: service.getServiceRequest(),
    context,
    ...state.access,
    owningDocument,
    owningBinding: state.binding,
    concurrencyLimit: limit,
    sharedGate: gate,
  });
}

/** Output copies preserve populated target handles without changing persistence documents. */
export function copySubdocumentParent(parent: unknown): Record<string, unknown> {
  const copy = isolateDocForOutput(parent) as Record<string, unknown>;
  transferDocumentAuthorizationGraph(parent, copy);
  return copy;
}
