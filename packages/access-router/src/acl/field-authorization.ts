/** Shared model output rules. Input/data admission retains its request-only evaluator. */
import { createValidator } from '../helpers';
import type { FieldAuthorization } from '../interfaces/service-authorization';

export type FieldAuthorizationState = 'granted' | 'deferred' | 'denied';
export type FieldPermissions = { has(key: string): boolean };

/** Access-key presence matters: an explicit false must never fall back to the record. */
export function extractScopedOutputRule(
  schema: Record<string, unknown> | null | undefined,
  field: string,
  access: string,
): unknown {
  if (!schema || !Object.prototype.hasOwnProperty.call(schema, field)) return undefined;
  const raw = schema[field];
  return raw && typeof raw === 'object' && !Array.isArray(raw) && Object.prototype.hasOwnProperty.call(raw, access)
    ? (raw as Record<string, unknown>)[access]
    : raw;
}

/** Ordinary response paths, with explicit child rules gated by their request ancestors. */
export function extractOutputFieldRules(
  schema: Record<string, unknown> | null | undefined,
  path: string,
  access: string,
): unknown[] {
  return extractOutputFieldRuleEntries(schema, path, access).map((entry) => entry.rule);
}

/** Rule identities allow an ancestor predicate to be memoized once, even across selected descendants. */
export function extractOutputFieldRuleEntries(
  schema: Record<string, unknown> | null | undefined,
  path: string,
  access: string,
  prefix = '',
): { path: string; rule: unknown }[] {
  if (!schema) return [{ path: `${prefix}${path}`, rule: undefined }];
  if (Object.prototype.hasOwnProperty.call(schema, path))
    return [{ path: `${prefix}${path}`, rule: extractScopedOutputRule(schema, path, access) }];
  const [head, ...rest] = path.split('.');
  const rule = extractScopedOutputRule(schema, head, access);
  const raw = schema[head] as { sub?: Record<string, unknown> } | undefined;
  const entry = { path: `${prefix}${head}`, rule };
  if (!rest.length || !raw?.sub) return [entry];
  return [entry, ...extractOutputFieldRuleEntries(raw.sub, rest.join('.'), access, `${prefix}${head}.`)];
}

export const stripModelPermissionPrefix = (key: string, prefix: string): string =>
  prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;

/** Exact/subtree authority only. A descendant grant does not authorize its ancestor's value. */
export function hasExplicitFieldGrant(policy: FieldAuthorization | undefined, path: string): boolean {
  return (
    policy?.mode === 'unrestricted' ||
    (policy?.mode === 'grant' && policy.paths.some((grant) => path === grant || path.startsWith(`${grant}.`)))
  );
}

export function hasDescendantFieldGrant(policy: FieldAuthorization | undefined, path: string): boolean {
  return policy?.mode === 'grant' && policy.paths.some((grant) => grant.startsWith(`${path}.`));
}

/** Never invokes a permission function. Unknown document decisions survive until after fetch. */
export function classifyRequestFieldRule(
  rule: unknown,
  permissions: FieldPermissions,
  modelPermissionPrefix = '',
): FieldAuthorizationState {
  if (typeof rule === 'boolean') return rule ? 'granted' : 'denied';
  if (typeof rule === 'function') return 'deferred';
  const validator = createValidator((key) => permissions.has(key));
  if (typeof rule !== 'string' && !Array.isArray(rule)) return 'denied';
  if (typeof rule === 'string' ? validator.stringHandler(rule) : validator.arrayHandler(rule)) return 'granted';
  // Evaluate again with all potential document grants. This respects AND/OR
  // expressions: a definitely false global conjunct cannot become deferred.
  const possible = createValidator(
    (key) => permissions.has(key) || !modelPermissionPrefix || key.startsWith(modelPermissionPrefix),
  );
  return (typeof rule === 'string' ? possible.stringHandler(rule) : possible.arrayHandler(rule))
    ? 'deferred'
    : 'denied';
}

/** Classification retains the planner's prefix semantics. A runtime denial must
 * also account for the legacy evaluator's unprefixed document-grant fallback.
 * Neither pass invokes functions or exposes configuration values to callbacks.
 */
export function prepareRequestFieldRule(
  rule: unknown,
  permissions: FieldPermissions,
  modelPermissionPrefix = '',
): { readonly state: FieldAuthorizationState; readonly decision: boolean | undefined } {
  const state = classifyRequestFieldRule(rule, permissions, modelPermissionPrefix);
  const invariant = state === 'denied' && modelPermissionPrefix ? classifyRequestFieldRule(rule, permissions) : state;
  return Object.freeze({ state, decision: invariant === 'deferred' ? undefined : invariant === 'granted' });
}

export function combineFieldAuthorizationStates(states: readonly FieldAuthorizationState[]): FieldAuthorizationState {
  return states.includes('denied') ? 'denied' : states.includes('deferred') ? 'deferred' : 'granted';
}

export function classifyEffectiveFieldAuthorization(args: {
  path: string;
  rules: readonly unknown[];
  outputFields?: FieldAuthorization;
  globalPermissions: FieldPermissions;
  modelPermissionPrefix?: string;
}): FieldAuthorizationState {
  if (hasExplicitFieldGrant(args.outputFields, args.path)) return 'granted';
  const states = args.rules.map((rule) =>
    classifyRequestFieldRule(rule, args.globalPermissions, args.modelPermissionPrefix),
  );
  return combineFieldAuthorizationStates(states);
}

/** Final request decision; functions receive the original actor and full document grants. */
export async function evaluateScopedAccessRule(args: {
  req: unknown;
  rule: unknown;
  globalPermissions: FieldPermissions | null | undefined;
  docPermissions: Record<string, unknown> | null | undefined;
  modelPermissionPrefix: string;
}): Promise<boolean> {
  const { req, rule, globalPermissions, docPermissions, modelPermissionPrefix } = args;
  if (typeof rule === 'boolean') return rule;
  const validator = createValidator((key) => {
    try {
      if (globalPermissions?.has(key)) return true;
    } catch {
      /* continue with document grants */
    }
    try {
      return Boolean((docPermissions ?? {})[stripModelPermissionPrefix(key, modelPermissionPrefix)]);
    } catch {
      return false;
    }
  });
  if (typeof rule === 'string') return validator.stringHandler(rule);
  if (Array.isArray(rule)) return validator.arrayHandler(rule);
  if (typeof rule === 'function') {
    try {
      return Boolean(await rule.call(req, globalPermissions, docPermissions));
    } catch {
      return false;
    }
  }
  return false;
}

/** Selection/catalog eligibility is separate; callers only evaluate eligible existing paths. */
export async function evaluateEffectiveFieldAuthorization(args: {
  path: string;
  rules: readonly unknown[];
  outputFields?: FieldAuthorization;
  req: unknown;
  globalPermissions: FieldPermissions;
  docPermissions: Record<string, unknown>;
  modelPermissionPrefix: string;
  evaluateRule?: (rule: unknown, index: number) => Promise<boolean>;
}): Promise<boolean> {
  if (hasExplicitFieldGrant(args.outputFields, args.path)) return true;
  for (const [index, rule] of args.rules.entries()) {
    if (!(await (args.evaluateRule ? args.evaluateRule(rule, index) : evaluateScopedAccessRule({ ...args, rule }))))
      return false;
  }
  return true;
}
