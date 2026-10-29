/** Package-only related descriptor capture and target derivation. */
import type { AccessRuntime } from '../runtime';
import type { SchemaType } from 'mongoose';
import type { Defaults, Include, Populate } from '../interfaces';
import type { Service } from '../services/service';
import { assertPublicAdmission, forwardPublicOptions } from '../validation/public-admission';
import { assertPopulateAccess } from './populate-access';
import { captureModelAuthorizationConfiguration } from './model-output-planning';
import { capturePopulateTargetBinding } from './populate-target-configuration';
import { authorizationError } from './authorization-snapshot';
import { createServiceExecution, getServiceExecutors, withExecutionQueryIntent } from './service-execution';
import { captureModelServiceIntent } from '../services/model-service-intent';
import { capturePopulatePolicyDefaults, type PopulatePolicyDefaultsToken } from './populate-policy';
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

function staticObjectIdReference(runtime: AccessRuntime, source: string, path: string, target: string): boolean {
  const model = runtime.getModelInstance(source),
    related = runtime.getModelInstance(target);
  if (!model || !related || model.db !== related.db || related.schema.path('_id')?.instance !== 'ObjectId')
    return false;
  const parts = path.split('.');
  if (parts.some((part) => part.startsWith('$'))) return false;
  for (let n = 1; n < parts.length; n++) {
    const parent = model.schema.path(parts.slice(0, n).join('.'));
    if (parent?.instance === 'Map' || parent?.instance === 'Mixed' || parent?.options?.ref || parent?.options?.refPath)
      return false;
  }
  const type = model.schema.path(path) as
    | (SchemaType & { $embeddedSchemaType?: SchemaType; embeddedSchemaType?: SchemaType; caster?: SchemaType })
    | undefined;
  const scalar =
    type?.instance === 'Array' ? (type.$embeddedSchemaType ?? type.embeddedSchemaType ?? type.caster) : type;
  return (
    scalar?.instance === 'ObjectId' &&
    (type?.options?.ref ?? scalar.options?.ref) === target &&
    type?.options?.refPath === undefined &&
    scalar.options?.refPath === undefined
  );
}
export function captureRelatedTargets(
  runtime: AccessRuntime,
  modelName: string,
  args: { populate?: unknown; include?: unknown } = {},
  depth = 0,
  populatePolicyDefaults: PopulatePolicyDefaultsToken = capturePopulatePolicyDefaults(runtime),
): AuthorizationRelatedTarget[] {
  if (depth > 32) authorizationError('related descriptor depth exceeded');
  assertPublicAdmission(args.populate, 'populate');
  assertPublicAdmission(args.include, 'include');
  const targets: AuthorizationRelatedTarget[] = [];
  const entries = <T>(value: unknown): T[] => (value == null ? [] : ((Array.isArray(value) ? value : [value]) as T[]));
  for (const entry of entries<Populate | string>(args.populate)) {
    const path = typeof entry === 'string' ? entry : entry.path;
    if (typeof entry !== 'string') assertPopulateAccess(entry.access);
    const target = capturePopulateTargetBinding(runtime, modelName, path);
    if (target) {
      targets.push({
        path,
        modelName: target.modelName,
        model: target.model,
        configuration: captureModelAuthorizationConfiguration(
          runtime,
          target.modelName,
          target.options,
          populatePolicyDefaults,
        ),
        staticObjectIdReference: staticObjectIdReference(runtime, modelName, path, target.modelName),
      });
    }
  }
  for (const entry of entries<Include>(args.include)) {
    if (!runtime.hasModel(entry.model)) authorizationError(`Model ${entry.model} not found`);
    const model = runtime.getModelInstance(entry.model);
    if (!model) authorizationError(`unknown receiving model: ${entry.model}`);
    const configuration = captureModelAuthorizationConfiguration(
      runtime,
      entry.model,
      undefined,
      populatePolicyDefaults,
    );
    const queryIntent =
      entry.op === 'count'
        ? undefined
        : captureModelServiceIntent(
            {
              defaults: (configuration.defaults as Defaults | undefined) ?? {},
              getPermissionsPosture: () => ({
                stripPermissionsField: !!configuration.stripPermissionsField,
                disableFieldPermissions: !!configuration.disableFieldPermissions,
              }),
            },
            entry.op === 'list' ? 'find' : 'findOne',
            entry.args,
            {
              ...forwardPublicOptions(entry.options, entry.op),
              access: 'read',
              includePermissions: false,
              includeFieldPermissions: false,
              includeCount: false,
            },
          );
    targets.push({
      path: entry.path,
      modelName: entry.model,
      model,
      kind: entry.op === 'count' ? 'count' : 'output',
      configuration,
      queryIntent,
      operationGuard: runtime.getModelOption(entry.model, `operationAccess.${entry.op}`),
      relatedTargets: captureRelatedTargets(
        runtime,
        entry.model,
        queryIntent?.args ?? entry.args ?? {},
        depth + 1,
        populatePolicyDefaults,
      ),
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
  const receiving = getServiceExecutors(receiver).binding();
  if (
    (policy && !target) ||
    (target &&
      (target.modelName !== receiving.modelName || (target.model !== undefined && target.model !== receiving.model)))
  )
    authorizationError(`related model mismatch: ${path}`);
  const execution = createServiceExecution(
    receiver,
    access,
    policy ? serviceAuthorizationInput(policy, target?.relatedTargets ?? []) : undefined,
    'service',
    target?.relatedTargets ?? [],
    parent,
    target?.configuration,
    getAuthorizationPermissions(parent, binding),
    access.operation === 'list' ? 'find' : 'findOne',
    { kind: 'related', parentBinding: binding, path },
  );
  return target?.queryIntent ? withExecutionQueryIntent(receiver, execution, target.queryIntent) : execution;
}
