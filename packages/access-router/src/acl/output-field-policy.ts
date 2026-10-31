/** Private call-owned field preparation. Returned policy never reaches application code. */
import { types } from 'node:util';
import { isPlainObject } from '@web-ts-toolkit/utils';
import type { AccessRouterPermissions } from '../permission';
import type { FieldAuthorization } from '../interfaces/service-authorization';
import {
  assertAuthorizationBinding,
  canPrepareStaticOutputPolicy,
  getAuthorizationPermissions,
  readServiceOutputFieldAuthorization,
  serviceOutputFieldPolicyOwner,
} from './service-authorization';
import type {
  AuthorizationBinding,
  AuthorizationFieldCatalog,
  ResolvedServiceAuthorization,
} from './service-authorization';
import {
  combineFieldAuthorizationStates,
  extractOutputFieldRuleEntries,
  hasExplicitFieldGrant,
  prepareRequestFieldRule,
} from './field-authorization';
import type { FieldAuthorizationState } from './field-authorization';
import { isCatalogOutputPath } from './field-catalog';

type RequestRuleClassification = ReturnType<typeof prepareRequestFieldRule>;
export interface PreparedRequestRule {
  readonly path: string;
  readonly rule: unknown;
  readonly classifications: WeakMap<ResolvedServiceAuthorization, RequestRuleClassification>;
}
interface PreparedOutputPath {
  readonly entries: readonly PreparedRequestRule[];
  readonly state: FieldAuthorizationState | undefined;
  readonly backendGrant: boolean;
}
interface CallFieldPolicy {
  readonly schema: Record<string, unknown> | undefined;
  readonly requestPaths: readonly string[] | undefined;
  readonly prefix: unknown;
  readonly outputFields: FieldAuthorization;
  readonly catalog: AuthorizationFieldCatalog;
  readonly reusable: boolean;
  readonly accesses: Map<string, Map<string, PreparedOutputPath>>;
}
const fieldPolicies = new WeakMap<ResolvedServiceAuthorization, CallFieldPolicy>();

export function callFieldPolicy(
  authorization: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
): CallFieldPolicy {
  assertAuthorizationBinding(authorization, binding);
  const owner = serviceOutputFieldPolicyOwner(authorization, binding);
  let policy = fieldPolicies.get(owner);
  if (!policy) {
    const view = readServiceOutputFieldAuthorization(authorization, binding);
    policy = {
      schema: view.permissionSchema as Record<string, unknown> | undefined,
      requestPaths:
        view.permissionSchema == null ||
        (isPlainObject(view.permissionSchema) && Object.isFrozen(view.permissionSchema))
          ? Object.freeze(Object.keys(view.permissionSchema ?? {}))
          : undefined,
      prefix: view.modelPermissionPrefix ?? '',
      outputFields: view.outputFields,
      catalog: view.catalog,
      reusable: view.reusable,
      accesses: new Map(),
    };
    // Eligibility comes from the stored source, not an already-normalized view.
    if (view.reusable) fieldPolicies.set(owner, policy);
  }
  return policy;
}

export function requestRuleClassification(
  entry: PreparedRequestRule,
  authorization: ResolvedServiceAuthorization,
  permissions: AccessRouterPermissions,
  prefix: unknown,
): RequestRuleClassification | undefined {
  if (typeof prefix !== 'string') return undefined;
  let classification = entry.classifications.get(authorization);
  if (!classification) {
    classification = prepareRequestFieldRule(entry.rule, permissions, prefix);
    entry.classifications.set(authorization, classification);
  }
  return classification;
}

/** Legacy cache eligibility is deliberately weaker than pure-batch eligibility. */
function invariantRuleLookup(schema: unknown, path: string): boolean {
  if (schema == null) return true;
  if (!isPlainObject(schema) || !Object.isFrozen(schema)) return false;
  const exact = Object.getOwnPropertyDescriptor(schema, path);
  if (exact) {
    const raw = exact.value;
    return !raw || typeof raw !== 'object' || Array.isArray(raw) || (isPlainObject(raw) && Object.isFrozen(raw));
  }
  const [head, ...rest] = path.split('.');
  const raw = Object.getOwnPropertyDescriptor(schema, head)?.value;
  if (raw == null) return true;
  if (!isPlainObject(raw) || !Object.isFrozen(raw)) return false;
  const sub = Object.getOwnPropertyDescriptor(raw, 'sub');
  return !rest.length || !sub || invariantRuleLookup(sub.value, rest.join('.'));
}

export function prepareOutputPath(
  policy: CallFieldPolicy,
  authorization: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  path: string,
  access: string,
): PreparedOutputPath {
  let cache = policy.accesses.get(access);
  if (!cache) {
    cache = new Map();
    policy.accesses.set(access, cache);
  }
  let prepared = cache.get(path);
  if (!prepared) {
    const invariant = invariantRuleLookup(policy.schema, path);
    const permissions = getAuthorizationPermissions(authorization, binding);
    const entries: PreparedRequestRule[] = extractOutputFieldRuleEntries(policy.schema, path, access).map((entry) => ({
      ...entry,
      classifications: new WeakMap(),
    }));
    const classifications = entries.map((entry) =>
      requestRuleClassification(entry, authorization, permissions, policy.prefix),
    );
    const backendGrant = hasExplicitFieldGrant(policy.outputFields, path);
    prepared = {
      entries,
      backendGrant,
      state: backendGrant
        ? 'granted'
        : classifications.every((value) => value !== undefined)
          ? combineFieldAuthorizationStates(classifications.map((value) => value.state))
          : undefined,
    };
    if (invariant) cache.set(path, prepared);
  }
  return prepared;
}

function ordinaryContainer(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.isFrozen(value)
  );
}

/** Prove the *lookup route*, not just its final classification. No function,
 * coercion, inherited slot, native or proxy can participate in this proof.
 * Strings/arrays deliberately remain on the legacy classifier/evaluator path.
 */
function booleanRuleLookup(schema: unknown, path: string, access: string): boolean {
  if (schema == null) return true;
  if (!ordinaryContainer(schema)) return false;
  const booleanRule = (raw: unknown): boolean => {
    if (typeof raw === 'boolean' || raw === undefined) return true;
    if (!ordinaryContainer(raw)) return false;
    const slot = Object.getOwnPropertyDescriptor(raw, access);
    return !!slot && 'value' in slot && (typeof slot.value === 'boolean' || slot.value === undefined);
  };
  const exact = Object.getOwnPropertyDescriptor(schema, path);
  if (exact) return 'value' in exact && booleanRule(exact.value);
  const [head, ...rest] = path.split('.');
  const slot = Object.getOwnPropertyDescriptor(schema, head);
  // Legacy nested extraction also reads schema[head], including inherited slots.
  if (!slot) return !(head in schema);
  if (!('value' in slot) || !booleanRule(slot.value)) return false;
  if (!rest.length || slot.value == null) return true;
  if (!ordinaryContainer(slot.value)) return false;
  const sub = Object.getOwnPropertyDescriptor(slot.value, 'sub');
  if (!sub) return !('sub' in slot.value);
  if (!('value' in sub)) return false;
  return !sub.value || booleanRuleLookup(sub.value, rest.join('.'), access);
}

export interface StaticOutputPath {
  readonly path: string;
  readonly backendGrant: boolean;
  readonly granted: boolean;
  readonly entries: readonly { readonly key: string; readonly allowed: boolean }[];
}

export function staticFieldPolicy(authorization: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  return canPrepareStaticOutputPolicy(authorization, binding) ? callFieldPolicy(authorization, binding) : undefined;
}

/** Admission/preparation only, always OUTSIDE the closed synchronous decision body. */
export function prepareStaticOutputPaths(
  authorization: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  paths: readonly string[],
  access: string,
  requestOnly = false,
): readonly StaticOutputPath[] | undefined {
  const policy = staticFieldPolicy(authorization, binding);
  if (!policy?.reusable || typeof policy.prefix !== 'string') return undefined;
  const { catalog } = policy;
  if (
    paths.some(
      (path) =>
        (!requestOnly && !isCatalogOutputPath(catalog, path)) || !booleanRuleLookup(policy.schema, path, access),
    )
  )
    return undefined;
  return paths.map((path) => {
    const prepared = prepareOutputPath(policy, authorization, binding, path, access);
    return {
      path,
      backendGrant: !requestOnly && prepared.backendGrant,
      granted: prepared.backendGrant || prepared.entries.every((entry) => entry.rule === true),
      entries: prepared.entries.map((entry) => ({
        key: `request:${access}:${entry.path}`,
        allowed: entry.rule === true,
      })),
    };
  });
}
