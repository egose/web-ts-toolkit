/** Package-only related descriptor capture and target derivation. */
import type { AccessRuntime } from '../runtime';
import type { Include, Populate } from '../interfaces';
import type { Service } from '../services/service';
import { getModelRef } from '../meta';
import { assertPublicAdmission } from '../validation/public-admission';
import { assertPopulateAccess } from './populate-access';
import { captureModelAuthorizationConfiguration } from './model-output-planning';
import { authorizationError } from './authorization-snapshot';
import { createServiceExecution, getServiceExecutors } from './service-execution';
import {
  getAuthorizationPermissions,
  readServiceAuthorization,
  serviceAuthorizationInput,
} from './service-authorization';
import type {
  AuthorizationAccess,
  AuthorizationBinding,
  AuthorizationRelatedTarget,
  ResolvedServiceAuthorization,
} from './service-authorization';

export function captureRelatedTargets(
  runtime: AccessRuntime,
  modelName: string,
  args: { populate?: unknown; include?: unknown } = {},
  depth = 0,
): AuthorizationRelatedTarget[] {
  if (depth > 32) authorizationError('related descriptor depth exceeded');
  assertPublicAdmission(args.populate, 'populate');
  assertPublicAdmission(args.include, 'include');
  const targets: AuthorizationRelatedTarget[] = [];
  const entries = <T>(value: unknown): T[] => (value == null ? [] : ((Array.isArray(value) ? value : [value]) as T[]));
  for (const entry of entries<Populate | string>(args.populate)) {
    const path = typeof entry === 'string' ? entry : entry.path;
    if (typeof entry !== 'string') assertPopulateAccess(entry.access);
    const model = getModelRef(modelName, path);
    if (model && runtime.hasModel(model))
      targets.push({ path, modelName: model, configuration: captureModelAuthorizationConfiguration(runtime, model) });
    else if (model && !runtime.getGlobalOption('requireRegisteredPopulateModels', true)) {
      // Capture the existing explicit opt-out at the requested path. No target
      // policy or document handle can be issued for an unregistered model.
      targets.push({ path, modelName: model, kind: 'passthrough', configuration: { catalog: { paths: [] } } });
    }
  }
  for (const entry of entries<Include>(args.include)) {
    if (!runtime.hasModel(entry.model)) authorizationError(`Model ${entry.model} not found`);
    targets.push({
      path: entry.path,
      modelName: entry.model,
      kind: entry.op === 'count' ? 'count' : 'output',
      configuration: captureModelAuthorizationConfiguration(runtime, entry.model),
      relatedTargets: captureRelatedTargets(runtime, entry.model, entry.args ?? {}, depth + 1),
    });
  }
  if (new Set(targets.map((target) => target.path)).size !== targets.length)
    authorizationError('ambiguous related descriptor path');
  return targets;
}

export function relatedPolicy(
  parent: ResolvedServiceAuthorization | undefined,
  binding: AuthorizationBinding,
  path: string,
) {
  if (!parent) return undefined;
  return readServiceAuthorization(parent, binding).authorization.related[path];
}

export function createRelatedExecution<T, V extends object>(
  receiver: Service<T, V>,
  access: AuthorizationAccess,
  parent: ResolvedServiceAuthorization | undefined,
  binding: AuthorizationBinding,
  path: string,
) {
  if (!parent) return createServiceExecution(receiver, access);
  const captured = readServiceAuthorization(parent, binding);
  const target = captured.relatedTargets.find((entry) => entry.path === path);
  const policy = captured.authorization.related[path];
  if (policy && (!target || target.modelName !== getServiceExecutors(receiver).binding().modelName))
    authorizationError(`related model mismatch: ${path}`);
  return createServiceExecution(
    receiver,
    access,
    policy ? serviceAuthorizationInput(policy, target?.relatedTargets ?? []) : undefined,
    'service',
    target?.relatedTargets ?? [],
    parent,
    target?.configuration,
    getAuthorizationPermissions(parent, binding),
  );
}
