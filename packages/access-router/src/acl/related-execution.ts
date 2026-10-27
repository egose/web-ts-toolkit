/** Package-only related descriptor capture and target derivation. */
import type { AccessRuntime } from '../runtime';
import type { SchemaType } from 'mongoose';
import type { Defaults, GlobalOptions, Include, Populate } from '../interfaces';
import type { Service } from '../services/service';
import { getModelRef } from '../meta';
import { assertPublicAdmission, forwardPublicOptions } from '../validation/public-admission';
import { assertPopulateAccess } from './populate-access';
import { captureModelAuthorizationConfiguration } from './model-output-planning';
import { capturePopulateTargetConfiguration } from './populate-target-configuration';
import { authorizationError } from './authorization-snapshot';
import { createServiceExecution, getServiceExecutors, withExecutionQueryIntent } from './service-execution';
import { captureModelServiceIntent } from '../services/model-service-intent';
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
  globalOptions: Pick<
    GlobalOptions,
    'requireOperationAccessForPopulateQueries' | 'requireOperationAccessForPopulateDependencies'
  > = runtime.getGlobalOptions(),
): AuthorizationRelatedTarget[] {
  if (depth > 32) authorizationError('related descriptor depth exceeded');
  assertPublicAdmission(args.populate, 'populate');
  assertPublicAdmission(args.include, 'include');
  const targets: AuthorizationRelatedTarget[] = [];
  const entries = <T>(value: unknown): T[] => (value == null ? [] : ((Array.isArray(value) ? value : [value]) as T[]));
  for (const entry of entries<Populate | string>(args.populate)) {
    const path = typeof entry === 'string' ? entry : entry.path;
    if (typeof entry !== 'string') assertPopulateAccess(entry.access);
    const model = getModelRef(modelName, path, runtime);
    if (model) {
      const target = capturePopulateTargetConfiguration(runtime, model, `${modelName}.${path}`);
      targets.push({
        path,
        modelName: model,
        configuration: captureModelAuthorizationConfiguration(runtime, model, target.options, globalOptions),
        staticObjectIdReference: staticObjectIdReference(runtime, modelName, path, model),
      });
    }
  }
  for (const entry of entries<Include>(args.include)) {
    if (!runtime.hasModel(entry.model)) authorizationError(`Model ${entry.model} not found`);
    const configuration = captureModelAuthorizationConfiguration(runtime, entry.model, undefined, globalOptions);
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
      kind: entry.op === 'count' ? 'count' : 'output',
      configuration,
      queryIntent,
      operationGuard: runtime.getModelOption(entry.model, `operationAccess.${entry.op}`),
      relatedTargets: captureRelatedTargets(
        runtime,
        entry.model,
        queryIntent?.args ?? entry.args ?? {},
        depth + 1,
        globalOptions,
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
  if (policy && (!target || target.modelName !== getServiceExecutors(receiver).binding().modelName))
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
  );
  return target?.queryIntent ? withExecutionQueryIntent(receiver, execution, target.queryIntent) : execution;
}
