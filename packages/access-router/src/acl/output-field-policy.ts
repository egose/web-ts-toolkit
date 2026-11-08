/** Private call-owned field preparation. Returned policy never reaches application code. */
import { isPlainObject } from '@web-ts-toolkit/utils';
import type { AccessRouterPermissions } from '../permission';
import type { FieldAuthorization } from '../interfaces/service-authorization';
import {
  assertAuthorizationBinding,
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
import { debitOutputWork } from './output-work-ledger';

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
  readonly documentDependent: boolean;
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

export function clearOutputFieldPolicy(authorization: ResolvedServiceAuthorization): void {
  const policy = fieldPolicies.get(authorization);
  policy?.accesses.clear();
  fieldPolicies.delete(authorization);
}

export function callFieldPolicy(
  authorization: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
): CallFieldPolicy {
  assertAuthorizationBinding(authorization, binding);
  const owner = serviceOutputFieldPolicyOwner(authorization, binding);
  let policy = fieldPolicies.get(owner);
  if (!policy) {
    debitOutputWork(); // call-owned preparation memo
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

/** Reuse invariant rule preparation, never a per-row field decision. */
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
    debitOutputWork(); // access memo, not a row decision
    cache = new Map();
    policy.accesses.set(access, cache);
  }
  let prepared = cache.get(path);
  if (!prepared) {
    const invariant = invariantRuleLookup(policy.schema, path);
    const permissions = getAuthorizationPermissions(authorization, binding);
    const entries: PreparedRequestRule[] = extractOutputFieldRuleEntries(policy.schema, path, access).map((entry) => {
      debitOutputWork(); // classification memo allocation
      return { ...entry, classifications: new WeakMap() };
    });
    const classifications = entries.map((entry) =>
      requestRuleClassification(entry, authorization, permissions, policy.prefix),
    );
    const backendGrant = hasExplicitFieldGrant(policy.outputFields, path);
    debitOutputWork(); // prepared-path memo allocation, before construction
    prepared = {
      entries,
      backendGrant,
      documentDependent: classifications.some((value) => value?.decision === undefined),
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
