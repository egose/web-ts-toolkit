/** Private document/stage owners; independent of the shared immutable call policy. */
import { types } from 'node:util';
import type { AccessRouterRequest } from '../interfaces/request';
import type { ModelHookContext } from '../interfaces/base';
import type { AccessRouterPermissions } from '../permission';
import type { DocumentAuthorization, ServiceOutputContext } from '../interfaces/service-authorization';
import { Document } from 'mongoose';
import {
  assertAuthorizationBinding,
  assertAuthorizationKeys,
  getAuthorizationPermissions,
  getAuthorizationProvenance,
  readServiceAuthorizationAccess,
  readServiceOutputPolicy,
  readAuthorizationFastPath,
  requiresDocumentSnapshotChecks,
  requiresOutputSnapshotChecks,
  skipsInitialOutputSnapshotCopy,
  resolveServiceAuthorization,
} from './service-authorization';
import type {
  AuthorizationBinding,
  AuthorizationConfiguration,
  ResolvedServiceAuthorization,
  ResolveServiceAuthorizationInput,
} from './service-authorization';
import {
  authorizationError,
  authorizationRecord,
  copyAuthorizationValue,
  matchesAuthorizationSnapshot,
  outputIdentities,
  tryOutputIdentitiesWithoutSnapshot,
} from './authorization-snapshot';
import type { VirtualProjectionPlan } from './virtual-projection';
import { copyOutputDecisionFields, readStaticOutputPlanFields } from './output-projection';
import { staticFieldPolicy, prepareStaticOutputPaths, type StaticOutputPath } from './output-field-policy';
import { assertNoServerModelControls } from '../validation/public-admission';
import {
  isBorrowableAuthorizationRecord,
  prepareTrustedAuthorizationSource,
  createTrustedOutputBudget,
  visitTrustedOutput,
  type TrustedOutputBudget,
} from './trusted-output-materialization';

declare const documentStageBrand: unique symbol;
export interface DocumentAuthorizationStage {
  readonly [documentStageBrand]: true;
}

type Grants = Readonly<Record<string, unknown>>;
export type DocumentGrantResolver = (
  this: AccessRouterRequest,
  projectedSnapshot: Readonly<Record<string, unknown>>,
  permissions: AccessRouterPermissions,
) => Grants | Promise<Grants>;
export type DocumentFieldDecision = (
  this: AccessRouterRequest,
  permissions: AccessRouterPermissions,
  fullDocumentGrants: Grants,
) => boolean | Promise<boolean>;

interface StageOwner {
  readonly call: ResolvedServiceAuthorization;
  readonly binding: AuthorizationBinding;
  readonly input: object;
  result?: Promise<DocumentAuthorization>;
  resolutionState: 'unresolved' | 'pending' | 'fulfilled' | 'rejected';
}
type StageRecord = StageOwner &
  (
    | { readonly sourceState: 'trusted'; readonly source: Readonly<Record<string, unknown>> }
    | {
        readonly sourceState: 'copied';
        readonly snapshot: Readonly<Record<string, unknown>>;
        readonly validateSnapshot: boolean;
      }
  );
interface DocumentRecord {
  stage: DocumentAuthorizationStage;
  grants: Grants;
  grantState: 'borrowed' | 'copied';
  decisions: Map<string, FieldDecisionRecord>;
}
interface FieldDecisionRecord {
  readonly promise: Promise<boolean>;
  state: 'pending' | 'fulfilled' | 'rejected';
  value?: boolean;
}
type OutputRecord = {
  handle: DocumentAuthorization;
} & (
  | { readonly snapshotState: 'trusted'; readonly members: ReadonlySet<object> }
  | {
      readonly snapshotState: 'copied';
      readonly snapshot: unknown;
      readonly validateSnapshot: boolean;
      readonly identities: readonly object[];
      readonly members?: ReadonlySet<object>;
    }
  | {
      readonly snapshotState: 'omitted';
      readonly validateSnapshot: false;
      readonly identities: readonly object[];
      readonly members?: ReadonlySet<object>;
    }
);
const stages = new WeakMap<DocumentAuthorizationStage, StageRecord>();
const documents = new WeakMap<DocumentAuthorization, DocumentRecord>();
const outputs = new WeakMap<object, OutputRecord>();
const unresolvedDocuments = new WeakSet<DocumentAuthorization>();
const owningDocuments = new WeakMap<
  DocumentAuthorization,
  { handle: DocumentAuthorization; binding: AuthorizationBinding }
>();

/** Private resolution handoff; no authority is attached to the output or public plan. */
export function bindOutputDocumentOwner(
  handle: DocumentAuthorization,
  knownOutput?: boolean,
  owner?: DocumentAuthorization,
  binding?: AuthorizationBinding,
): void {
  lookupDocumentOwner(handle);
  if (knownOutput || (owner && unresolvedDocuments.has(owner))) unresolvedDocuments.add(handle);
  if (owner) {
    lookupDocumentOwner(owner);
    owningDocuments.set(handle, { handle: owner, binding: binding! });
  }
}

export function readOutputDocumentOwner(handle: DocumentAuthorization) {
  return owningDocuments.get(handle);
}

export function isUnresolvedOutputDocument(handle: DocumentAuthorization): boolean {
  return unresolvedDocuments.has(handle);
}

/** Callable private admission seam for the later named helper overloads. No field evaluation. */
export function normalizeOutputAuthorizationOptions(
  input: Omit<ResolveServiceAuthorizationInput, 'authorization' | 'applicability' | 'binding' | 'configuration'> & {
    readonly binding: Omit<AuthorizationBinding, 'scopePath'>;
    readonly configuration: AuthorizationConfiguration | (() => AuthorizationConfiguration);
  },
  options: unknown,
  purpose?: 'output',
):
  | { readonly kind: 'policy'; readonly authorization: ResolvedServiceAuthorization }
  | {
      readonly kind: 'document';
      readonly documentAuthorization: DocumentAuthorization;
      readonly binding: AuthorizationBinding;
    } {
  assertNoServerModelControls(options, authorizationError);
  const value = authorizationRecord(options, 'output options');
  // Validate descriptors without cloning the opaque handle or invoking accessors.
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !('value' in descriptor) || !descriptor.enumerable) {
      authorizationError('invalid output option property');
    }
  }
  assertAuthorizationKeys(
    value,
    ['authorization', 'scopePath', 'documentAuthorization', ...(purpose ? ['purpose'] : [])],
    'output options',
  );
  if (purpose && value.purpose !== purpose) authorizationError('genAllowedFields requires purpose: output');
  if (Object.prototype.hasOwnProperty.call(value, 'documentAuthorization')) {
    if (
      Object.prototype.hasOwnProperty.call(value, 'authorization') ||
      Object.prototype.hasOwnProperty.call(value, 'scopePath')
    ) {
      authorizationError('document handle cannot be mixed with raw policy/scope');
    }
    const handle = value.documentAuthorization as DocumentAuthorization;
    const { stage } = validateDocumentOwner(handle);
    // Public handle overloads have no scope option: derive it from the authenticated
    // owner, while still checking the service's request/runtime/model identities.
    const binding = Object.freeze({ ...input.binding, scopePath: stage.binding.scopePath });
    assertAuthorizationBinding(stage.call, binding);
    const access = readServiceAuthorizationAccess(stage.call, binding);
    if (input.access.outputAccess !== access.outputAccess) authorizationError('document access mismatch');
    return Object.freeze({ kind: 'document', documentAuthorization: handle, binding });
  }
  if (value.scopePath !== undefined && !Array.isArray(value.scopePath))
    authorizationError('scopePath must be an array');
  return Object.freeze({
    kind: 'policy',
    authorization: resolveServiceAuthorization({
      ...input,
      configuration: typeof input.configuration === 'function' ? input.configuration() : input.configuration,
      binding: {
        ...input.binding,
        scopePath: copyAuthorizationValue(value.scopePath) as readonly string[] | undefined,
      },
      authorization: value.authorization,
      applicability: 'output',
    }),
  });
}

/** Owner lookup authenticates identity only, never the current document values. */
function lookupStageOwner(stage: DocumentAuthorizationStage): StageRecord {
  const record = stages.get(stage);
  if (!record) authorizationError('invalid document stage');
  return record;
}

function lookupDocumentOwner(handle: DocumentAuthorization): DocumentRecord {
  const record = documents.get(handle);
  if (!record) authorizationError('invalid document handle');
  return record;
}

function validateStageOwner(record: StageRecord): void {
  if (record.sourceState === 'trusted') {
    assertAuthorizationBinding(record.call, record.binding);
    return;
  }
  // TEMPORARY UNSAFE read/list escape hatches. TODO: remove/revisit when query validation
  // CPU is addressed. Keep identity/binding, permissions and independent output mode;
  // never replace the detached snapshot with application data or use an ambient flag.
  if (!record.validateSnapshot) return;
  if (!matchesAuthorizationSnapshot(record.input, record.snapshot)) authorizationError('changed document snapshot');
}

/** Strict mode retains both legacy observations: even an ordinary own-data graph can execute
 * application code during normalization (e.g. Symbol.hasInstance) or Node equality
 * (e.g. an inherited Symbol.toStringTag getter). The first match may itself
 * change an earlier source value; ordinary shape does not prove passivity.
 * A returned owner is not a validation certificate across binding reads,
 * native/grant copies, callbacks or microtasks; their later checks stay separate.
 */
function validateDocumentOwner(handle: DocumentAuthorization) {
  const document = lookupDocumentOwner(handle);
  const stage = lookupStageOwner(document.stage);
  validateStageOwner(stage);
  // Preserve the second observation for mutations triggered during the first check.
  // This is not a stability guarantee: application hooks can also mutate the input
  // during this second check, and no fixed number of checks eliminates that risk.
  validateStageOwner(stage);
  return { document, stage };
}

/** Accept the untrimmed projected plain snapshot, not a hydrated persistence document. */
export function createDocumentAuthorizationStage(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  projectedSnapshot: Readonly<Record<string, unknown>>,
): DocumentAuthorizationStage {
  assertAuthorizationBinding(call, binding);
  authorizationRecord(projectedSnapshot, 'projected document snapshot');
  return createStage(
    call,
    binding,
    projectedSnapshot,
    readAuthorizationFastPath(call, binding)?.mode === 'active' && isBorrowableAuthorizationRecord(projectedSnapshot)
      ? 'trusted'
      : 'copied',
  );
}

function createStage(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  source: Readonly<Record<string, unknown>>,
  sourceState: 'trusted' | 'copied',
): DocumentAuthorizationStage {
  const stage = Object.freeze(Object.create(null)) as DocumentAuthorizationStage;
  const ownedBinding = Object.freeze({ ...binding, scopePath: Object.freeze([...(binding.scopePath ?? [])]) });
  const owner: StageOwner = {
    call,
    binding: ownedBinding,
    input: source,
    result: undefined,
    resolutionState: 'unresolved',
  };
  stages.set(
    stage,
    sourceState === 'trusted'
      ? { ...owner, sourceState, source }
      : {
          ...owner,
          sourceState,
          snapshot: copyAuthorizationValue(source, 'document'),
          validateSnapshot: requiresDocumentSnapshotChecks(call, binding),
        },
  );
  return stage;
}

/** Query source admission retains ACTUAL copied/trusted state, including before-hook compatibility fallback. */
export function prepareQueryDocumentAuthorization(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  input: unknown,
):
  | {
      readonly source: Record<string, unknown>;
      readonly stage: DocumentAuthorizationStage;
      readonly sourceState: 'trusted' | 'copied';
      readonly budget?: TrustedOutputBudget;
    }
  | undefined {
  const prepared = prepareQueryOutputSource(call, binding, input, 'hook');
  if (!prepared) return;
  authorizationRecord(prepared.source, 'projected document snapshot');
  return { ...prepared, stage: createStage(call, binding, prepared.source, prepared.sourceState) };
}

interface QuerySourceRecord {
  readonly sourceState: 'trusted' | 'copied';
  readonly budget?: TrustedOutputBudget;
}
const querySources = new WeakMap<object, WeakMap<ResolvedServiceAuthorization, QuerySourceRecord>>();
const queryOriginals = new WeakMap<object, object>();
const referenceOriginals = new WeakMap<object, object>();

/** Normalization/transport origins, NOT output authority. Unknown replacements have no original target key. */
export function getQueryOutputOriginal(input: unknown, call?: ResolvedServiceAuthorization): unknown {
  return input && typeof input === 'object' && call && querySources.get(input)?.has(call)
    ? (queryOriginals.get(input) ?? input)
    : input;
}
export function getQueryReferenceOriginal(input: object): object | undefined {
  return referenceOriginals.get(input);
}

/** Known reference slots only; no arbitrary data graph or recursive eligibility preflight. */
function captureNormalizedReferenceOrigins(
  original: object,
  normalized: object,
  paths: readonly string[],
  budget: TrustedOutputBudget,
): void {
  const storage = (value: object) => (value instanceof Document ? (value as Document & { _doc: object })._doc : value);
  const walk = (raw: unknown, copy: unknown, parts: readonly string[], index: number, depth: number): void => {
    visitTrustedOutput(budget, depth);
    if (
      !raw ||
      !copy ||
      typeof raw !== 'object' ||
      typeof copy !== 'object' ||
      types.isProxy(raw) ||
      types.isProxy(copy)
    )
      return;
    if (Array.isArray(raw) && Array.isArray(copy)) {
      visitTrustedOutput(budget, depth, copy.length);
      for (let slot = 0; slot < copy.length; slot++) {
        const source = Object.getOwnPropertyDescriptor(raw, String(slot)),
          target = Object.getOwnPropertyDescriptor(copy, String(slot));
        if (source && target && 'value' in source && 'value' in target)
          walk(source.value, target.value, parts, index, depth + 1);
      }
      return;
    }
    if (index === parts.length) {
      if (raw !== copy && isBorrowableAuthorizationRecord(copy)) referenceOriginals.set(copy, raw);
      return;
    }
    const source = Object.getOwnPropertyDescriptor(storage(raw), parts[index]),
      target = Object.getOwnPropertyDescriptor(copy, parts[index]);
    if (source && target && 'value' in source && 'value' in target)
      walk(source.value, target.value, parts, index + 1, depth + 1);
  };
  for (const path of paths) walk(original, normalized, path.split('.'), 0, 0);
}

/** Data-free per-call normalization state, not a grant/result cache or public marker. */
export function prepareQueryOutputSource(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  input: unknown,
  purpose?: 'hook',
):
  | {
      readonly source: Record<string, unknown>;
      readonly sourceState: 'trusted' | 'copied';
      readonly budget?: TrustedOutputBudget;
    }
  | undefined {
  if (readAuthorizationFastPath(call, binding)?.mode !== 'active') return;
  const existing = input && typeof input === 'object' ? querySources.get(input)?.get(call) : undefined;
  if (existing && (purpose !== 'hook' || existing.sourceState === 'copied' || isBorrowableAuthorizationRecord(input)))
    return { source: input as Record<string, unknown>, ...existing };
  const prepared = prepareTrustedAuthorizationSource(input);
  const budget = existing?.budget ?? (!binding.scopePath?.length ? createTrustedOutputBudget() : undefined);
  if (input && typeof input === 'object' && prepared.source !== input) {
    queryOriginals.set(prepared.source, input);
    if (budget && prepared.kind === 'trusted')
      captureNormalizedReferenceOrigins(
        input,
        prepared.source,
        readServiceOutputPolicy(call, binding).catalog.referencePaths ?? [],
        budget,
      );
  }
  let captures = querySources.get(prepared.source);
  if (!captures) querySources.set(prepared.source, (captures = new WeakMap()));
  captures.set(call, { sourceState: prepared.kind, budget });
  return { source: prepared.source, sourceState: prepared.kind, budget };
}

export function isTrustedDocumentAuthorization(handle: DocumentAuthorization, binding: AuthorizationBinding): boolean {
  const stage = lookupStageOwner(lookupDocumentOwner(handle).stage);
  if (stage.sourceState !== 'trusted') return false;
  assertAuthorizationBinding(stage.call, binding);
  return true;
}

export function isTrustedDocumentAuthorizationStage(
  stage: DocumentAuthorizationStage,
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
): boolean {
  const record = lookupStageOwner(stage);
  assertAuthorizationBinding(record.call, binding);
  if (record.call !== call) authorizationError('document call/stage mismatch');
  return record.sourceState === 'trusted';
}

/** A retained post-fetch stage may be consumed only with its original call and projected values. */
export function assertDocumentAuthorizationStage(
  stage: DocumentAuthorizationStage,
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  projectedSnapshot: object,
): void {
  const record = lookupStageOwner(stage);
  validateStageOwner(record);
  assertAuthorizationBinding(record.call, binding);
  if (
    record.call !== call ||
    record.input !== projectedSnapshot ||
    (record.sourceState === 'copied' &&
      record.validateSnapshot &&
      !matchesAuthorizationSnapshot(projectedSnapshot, record.snapshot))
  ) {
    authorizationError('document call/stage/snapshot mismatch');
  }
}

/** Concurrent consumers share one promise, including failures; separate stages never share grants. */
export function resolveDocumentAuthorization(
  stage: DocumentAuthorizationStage,
  resolveGrants: DocumentGrantResolver,
): Promise<DocumentAuthorization> {
  const record = lookupStageOwner(stage);
  validateStageOwner(record);
  if (record.sourceState === 'trusted') {
    if (!record.result) {
      record.resolutionState = 'pending';
      record.result = (async () => {
        try {
          assertAuthorizationBinding(record.call, record.binding);
          const result = resolveGrants.call(
            record.binding.request,
            record.source,
            getAuthorizationPermissions(record.call, record.binding),
          );
          const grants = result && typeof (result as Promise<Grants>).then === 'function' ? await result : result;
          assertAuthorizationBinding(record.call, record.binding);
          const grantState = isBorrowableAuthorizationRecord(grants) ? 'borrowed' : 'copied';
          const value =
            grantState === 'borrowed' ? grants : copyAuthorizationValue(authorizationRecord(grants, 'document grants'));
          const handle = Object.freeze(Object.create(null)) as DocumentAuthorization;
          documents.set(handle, { stage, grants: value, grantState, decisions: new Map() });
          record.resolutionState = 'fulfilled';
          return handle;
        } catch (error) {
          record.resolutionState = 'rejected';
          throw error;
        }
      })();
    }
    return record.result;
  }
  if (!record.result) {
    record.resolutionState = 'pending';
    record.result = Promise.resolve().then(async () => {
      try {
        validateStageOwner(record);
        const result = resolveGrants.call(
          record.binding.request,
          copyAuthorizationValue(record.snapshot, 'document'),
          getAuthorizationPermissions(record.call, record.binding),
        );
        // Synchronous hook results are owned before yielding to another microtask.
        const grants = result && typeof (result as Promise<Grants>).then === 'function' ? await result : result;
        validateStageOwner(record);
        const ownedGrants = copyAuthorizationValue(authorizationRecord(grants, 'document grants'));
        const handle = Object.freeze(Object.create(null)) as DocumentAuthorization;
        documents.set(handle, { stage, grants: ownedGrants, grantState: 'copied', decisions: new Map() });
        record.resolutionState = 'fulfilled';
        return handle;
      } catch (error) {
        record.resolutionState = 'rejected';
        throw error;
      }
    });
  }
  return record.result;
}

export function readDocumentAuthorization(handle: DocumentAuthorization, binding: AuthorizationBinding) {
  const { document: record, stage } = validateDocumentOwner(handle);
  assertAuthorizationBinding(stage.call, binding);
  return Object.freeze({
    authorization: stage.call,
    stage: record.stage,
    grants: stage.sourceState === 'trusted' ? record.grants : copyAuthorizationValue(record.grants),
    sourceState: stage.sourceState,
    grantState: record.grantState,
    ...readServiceAuthorizationAccess(stage.call, binding),
  });
}

/** Identity/access-only consumers honor the captured snapshot mode and always check the call binding. */
export function readDocumentAuthorizationAccess(handle: DocumentAuthorization, binding: AuthorizationBinding) {
  const { document: record, stage } = validateDocumentOwner(handle);
  return Object.freeze({
    authorization: stage.call,
    stage: record.stage,
    sourceState: stage.sourceState,
    ...readServiceAuthorizationAccess(stage.call, binding),
  });
}

/** Memoization primitive only: SVA-03 supplies the shared field evaluator. */
export function memoizeDocumentFieldDecision(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  field: string,
  evaluate: DocumentFieldDecision,
): boolean | Promise<boolean> {
  const { document: record, stage } = validateDocumentOwner(handle);
  assertAuthorizationBinding(stage.call, binding);
  if (stage.sourceState === 'trusted') return memoizeTrustedFieldDecision(record, stage, binding, field, evaluate);
  let decision = record.decisions.get(field);
  if (decision) {
    // A settled/pending hit must not outlive mutation between lookup and use.
    // Keep the immediate checks above as well as this asynchronous boundary.
    return decision.promise.then((result) => {
      validateStageOwner(stage);
      assertAuthorizationBinding(stage.call, binding);
      return result;
    });
  } else {
    const created: FieldDecisionRecord = {
      state: 'pending',
      value: undefined,
      promise: Promise.resolve().then(async () => {
        validateStageOwner(stage);
        assertAuthorizationBinding(stage.call, binding);
        const result = await evaluate.call(
          stage.binding.request,
          getAuthorizationPermissions(stage.call, binding),
          copyAuthorizationValue(record.grants),
        );
        validateStageOwner(stage);
        assertAuthorizationBinding(stage.call, binding);
        if (typeof result !== 'boolean') authorizationError('field decision must be boolean');
        return result;
      }),
    };
    // Track the retained promise itself, not the async evaluator's return: its
    // promise-adoption microtasks are still a pending/ordering boundary.
    void created.promise.then(
      (value) => {
        created.value = value;
        created.state = 'fulfilled';
      },
      () => {
        created.state = 'rejected';
      },
    );
    decision = created;
    record.decisions.set(field, decision);
  }
  return decision.promise;
}

/** Direct settled hits and one retained pending/failure per stage. No observation/hit promise wrappers. */
function memoizeTrustedFieldDecision(
  record: DocumentRecord,
  stage: StageRecord,
  binding: AuthorizationBinding,
  field: string,
  evaluate: DocumentFieldDecision,
): boolean | Promise<boolean> {
  const previous = record.decisions.get(field);
  if (previous) return previous.state === 'fulfilled' ? previous.value! : previous.promise;
  let fulfill!: (value: boolean) => void, reject!: (error: unknown) => void;
  const decision: FieldDecisionRecord = {
    state: 'pending',
    value: undefined,
    promise: new Promise<boolean>((resolve, fail) => {
      fulfill = resolve;
      reject = fail;
    }),
  };
  record.decisions.set(field, decision);
  const settle = (value: unknown): boolean => {
    assertAuthorizationBinding(stage.call, binding);
    assertAuthorizationBinding(stage.call, stage.binding);
    if (typeof value !== 'boolean') authorizationError('field decision must be boolean');
    decision.value = value;
    decision.state = 'fulfilled';
    fulfill(value);
    return value;
  };
  const fail = (error: unknown): void => {
    decision.state = 'rejected';
    reject(error);
  };
  try {
    const value = evaluate.call(stage.binding.request, getAuthorizationPermissions(stage.call, binding), record.grants);
    if (value && typeof (value as Promise<boolean>).then === 'function') {
      // This await is required by the ACTUAL evaluator, not a defensive scheduling boundary.
      void (async () => {
        try {
          settle(await value);
        } catch (error) {
          fail(error);
        }
      })();
      return decision.promise;
    }
    return settle(value);
  } catch (error) {
    fail(error);
    return decision.promise;
  }
}

/** A batch cannot retain caller accessors/proxies/iterators as part of its owner tuple. */
function ordinaryDecisionBinding(binding: AuthorizationBinding): boolean {
  if (types.isProxy(binding) || Object.getPrototypeOf(binding) !== Object.prototype) return false;
  for (const key of ['request', 'runtime', 'model', 'modelName', 'scopePath']) {
    const slot = Object.getOwnPropertyDescriptor(binding, key);
    if (slot && !('value' in slot)) return false;
    if (!slot && key !== 'scopePath') return false;
    if (!slot && key in binding) return false;
  }
  const scope = Object.getOwnPropertyDescriptor(binding, 'scopePath')?.value;
  return scope === undefined || copyOutputDecisionFields(scope) !== undefined;
}

interface StaticDecisionPath {
  readonly field: string;
  readonly outputKey?: string;
  readonly policy?: StaticOutputPath;
}

/** CLOSED synchronous decision-only operation, not a callback/token/bypass scope.
 * The body sees only local primitive descriptors and package-owned memo records.
 * Validation (including native wire execution/reentry) is entirely outside it.
 * A speculative journal makes whole-batch fallback atomic: pending/rejected or
 * dynamic routes never prepopulate later fields or overwrite an earlier memo.
 */
function settleStaticFieldBatch(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  paths: readonly StaticDecisionPath[],
): Map<string, boolean> | undefined {
  const { document, stage } = validateDocumentOwner(handle);
  // Validation itself can replace caller binding slots with getters/proxies.
  // Re-prove descriptor-only admission before reading that tuple again.
  if (!ordinaryDecisionBinding(binding)) {
    validateDocumentOwner(handle);
    return;
  }
  assertAuthorizationBinding(stage.call, binding);
  const expected = new Map<string, FieldDecisionRecord | undefined>();
  const journal = new Map<string, boolean>();
  const result = new Map<string, boolean>();
  const unresolved = unresolvedDocuments.has(handle);
  let available = !owningDocuments.has(handle);

  // BEGIN pure body: no document values, schema/plan/binding reads, actor
  // methods, grant copies, application callbacks, native methods, .then or await.
  const read = (key: string): boolean | undefined => {
    const memo = document.decisions.get(key);
    expected.set(key, memo);
    if (memo) {
      if (memo.state !== 'fulfilled') available = false;
      return memo.value;
    }
    return journal.get(key);
  };
  for (const path of paths) {
    if (!available) break;
    let allowed = path.outputKey ? read(path.outputKey) : undefined;
    if (!available) break;
    if (allowed === undefined) {
      const policy = path.policy;
      if (!policy) {
        available = false;
        break;
      }
      if (path.outputKey && unresolved && !policy.granted) allowed = false;
      else if (path.outputKey && policy.backendGrant) allowed = true;
      else {
        allowed = true;
        for (const entry of policy.entries) {
          let decision = read(entry.key);
          if (!available) break;
          if (decision === undefined) {
            decision = entry.allowed;
            journal.set(entry.key, decision);
          }
          if (!decision) {
            allowed = false;
            break;
          }
        }
      }
      if (!available) break;
      if (path.outputKey) journal.set(path.outputKey, allowed);
    }
    result.set(path.field, allowed);
  }
  // END pure body. No validity is ambient, even during the checks below.

  validateDocumentOwner(handle);
  if (!ordinaryDecisionBinding(binding)) return;
  assertAuthorizationBinding(stage.call, binding);
  // A serializer may have reentered and created a conflicting pending memo.
  // Never replace it, even if it appeared during the post-body validation.
  if (
    !available ||
    owningDocuments.has(handle) ||
    unresolvedDocuments.has(handle) !== unresolved ||
    [...expected].some(([key, memo]) => document.decisions.get(key) !== memo)
  )
    return;
  for (const [key, value] of journal) {
    document.decisions.set(key, { promise: Promise.resolve(value), state: 'fulfilled', value });
  }
  return result;
}

/** Internal finalizer/helper entry. No caller-supplied classifications/capabilities.
 * Every invocation reauthenticates the handle/call and the planner's exact ordered
 * primitive field set, then derives rules/catalog eligibility from private policy.
 * Embedded ownership and mixed/string/coercible policy conservatively fall back.
 */
export function tryStaticOutputFieldDecisions(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  plan: VirtualProjectionPlan,
  fields: readonly string[],
): Map<string, boolean> | undefined {
  const document = lookupDocumentOwner(handle);
  const stage = lookupStageOwner(document.stage);
  if (!ordinaryDecisionBinding(binding) || owningDocuments.has(handle)) return;
  assertAuthorizationBinding(stage.call, binding);
  const canonical = readStaticOutputPlanFields(plan, stage.call);
  const ownedFields = copyOutputDecisionFields(fields);
  if (!canonical || !ownedFields) return;
  let index = 0;
  for (const field of ownedFields) {
    const next = canonical.indexOf(field, index);
    if (next < 0) return;
    index = next + 1;
  }
  const prefix = (binding.scopePath ?? []).join('.');
  const paths = ownedFields.map((field) => {
    const path = prefix ? `${prefix}.${field}` : field;
    return { field, path, outputKey: `output:${path}` };
  });
  const missing: string[] = [];
  // Output memo precedes even configuration preparation. A failure/pending result
  // must be awaited by the legacy path, never recomputed from current policy.
  for (const path of paths) {
    const memo = document.decisions.get(path.outputKey);
    if (memo && memo.state !== 'fulfilled') return;
    if (!memo) missing.push(path.path);
  }
  const access = readServiceAuthorizationAccess(stage.call, binding).outputAccess;
  const prepared = missing.length ? prepareStaticOutputPaths(stage.call, binding, missing, access) : [];
  if (!prepared) return;
  const policies = new Map(prepared.map((policy) => [policy.path, policy]));
  const decisions = settleStaticFieldBatch(
    handle,
    binding,
    paths.map((path) => ({ ...path, policy: policies.get(path.path) })),
  );
  if (decisions && !readStaticOutputPlanFields(plan, stage.call)) authorizationError('changed static output plan');
  return decisions;
}

/** Request-only metadata uses the same ordered request keys, never backend grants. */
export function tryStaticRequestFieldPaths(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  access: string,
): string[] | undefined {
  const document = lookupDocumentOwner(handle);
  const stage = lookupStageOwner(document.stage);
  if (!ordinaryDecisionBinding(binding) || owningDocuments.has(handle) || typeof access !== 'string') return;
  const policy = staticFieldPolicy(stage.call, binding);
  if (!policy?.reusable || !policy.requestPaths) return;
  const prepared = prepareStaticOutputPaths(stage.call, binding, policy.requestPaths, access, true);
  if (!prepared) return;
  const decisions = settleStaticFieldBatch(
    handle,
    binding,
    prepared.map((policy) => ({ field: policy.path, policy })),
  );
  return decisions && [...decisions].filter(([, allowed]) => allowed).map(([field]) => field);
}

export interface DocumentAuthorizationUse {
  readonly binding: AuthorizationBinding;
  readonly output: object;
  readonly outputAccess: string;
  /** Canonical internal execution checks both; a later helper derives them from the handle. */
  readonly authorization?: ResolvedServiceAuthorization;
  readonly stage?: DocumentAuthorizationStage;
}

function unchangedOutput(output: object, record: OutputRecord): boolean {
  if (record.snapshotState === 'trusted') return outputs.get(output) === record;
  // TEMPORARY UNSAFE output-value opt-out. TODO: revisit after CPU remediation.
  // Even opted-out outputs must retain their exact associated root/descendant identities.
  // The private union guarantees a copied snapshot whenever checks are enabled.
  if (record.validateSnapshot && !matchesAuthorizationSnapshot(output, record.snapshot)) return false;
  const identities = outputIdentities(output);
  return (
    identities.length === record.identities.length &&
    identities.every((identity, i) => identity === record.identities[i])
  );
}

export function assertDocumentAuthorization(handle: DocumentAuthorization, use: DocumentAuthorizationUse): void {
  const { document: record, stage } = validateDocumentOwner(handle);
  assertAuthorizationBinding(stage.call, use.binding);
  if (
    (use.authorization !== undefined && stage.call !== use.authorization) ||
    (use.stage !== undefined && record.stage !== use.stage) ||
    readServiceAuthorizationAccess(stage.call, use.binding).outputAccess !== use.outputAccess
  ) {
    authorizationError('document call/access/stage mismatch');
  }
  const association = outputs.get(use.output);
  if (!association || association.handle !== handle || !unchangedOutput(use.output, association)) {
    authorizationError('unknown, replaced or mutated authorized output');
  }
}

/** Initial association is package-only, after finalization. Nothing is attached to the DTO. */
export function associateDocumentAuthorization(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  output: object,
  builder?: TrustedOutputMemberBuilder,
): void {
  const { stage } = validateDocumentOwner(handle);
  assertAuthorizationBinding(stage.call, binding);
  if (!output || typeof output !== 'object') authorizationError('output must be an object');
  // An existing association cannot be refreshed to legitimize a mutation or change owners.
  if (outputs.has(output)) {
    const previous = outputs.get(output)!;
    if (previous.handle !== handle || !unchangedOutput(output, previous))
      authorizationError('output already associated');
    return;
  }
  const members = builder ? finishTrustedOutputMembers(builder, handle, binding, output) : undefined;
  if (stage.sourceState === 'trusted') {
    outputs.set(output, { handle, snapshotState: 'trusted', members: members ?? new Set([output]) });
    return;
  }
  // This private lookup is not an ownership certificate: owner/binding checks
  // remain. No live output alias stands in for a snapshot, and strict/dormant/
  // fallback paths retain their copy/identity/final binding-check order.
  // An open binding can execute getters during authentication. Never carry the
  // clone-free graph result across those callbacks: use ordinary tuples only,
  // authenticate the captured mode first, then run the closed graph operation.
  if (skipsInitialOutputSnapshotCopy(stage.call) && ordinaryDecisionBinding(binding)) {
    if (requiresOutputSnapshotChecks(stage.call, binding))
      authorizationError('output snapshot copy requires skipped comparisons');
    const identities = tryOutputIdentitiesWithoutSnapshot(output);
    if (identities) {
      outputs.set(output, { handle, snapshotState: 'omitted', identities, validateSnapshot: false, members });
      return;
    }
  }
  outputs.set(output, {
    handle,
    snapshotState: 'copied',
    snapshot: copyAuthorizationValue(output, 'document'),
    identities: outputIdentities(output),
    validateSnapshot: requiresOutputSnapshotChecks(stage.call, binding),
    members,
  });
}

/** Only package-created copies may be transferred, from a still-valid associated source. */
export function transferDocumentAuthorization(
  handle: DocumentAuthorization,
  use: DocumentAuthorizationUse,
  copy: object,
): void {
  assertDocumentAuthorization(handle, use);
  associateDocumentAuthorization(handle, use.binding, copy);
}

/** Fresh raw-policy helpers use this even for stale outputs: never rerun hooks on a known trimmed DTO. */
export function isKnownAuthorizationOutput(output: object): boolean {
  return outputs.has(output);
}

export function isTrustedAuthorizationOutput(output: object, call?: ResolvedServiceAuthorization): boolean {
  const record = outputs.get(output);
  if (record?.snapshotState !== 'trusted') return false;
  const { stage } = validateDocumentOwner(record.handle);
  assertAuthorizationBinding(stage.call, stage.binding);
  return !call || getAuthorizationProvenance(stage.call) === getAuthorizationProvenance(call);
}

/** Package-only lookup for already-finalized children/copies; never issues authority for a DTO. */
export function getAssociatedDocumentAuthorization(
  output: object,
  call?: ResolvedServiceAuthorization,
): DocumentAuthorization | undefined {
  const record = outputs.get(output);
  if (!record || !unchangedOutput(output, record)) return undefined;
  const { stage } = validateDocumentOwner(record.handle);
  if (call && getAuthorizationProvenance(stage.call) !== getAuthorizationProvenance(call)) return undefined;
  return record.handle;
}

declare const memberBuilderBrand: unique symbol;
export interface TrustedOutputMemberBuilder {
  readonly [memberBuilderBrand]: true;
}
interface MemberBuilderRecord {
  readonly call: ResolvedServiceAuthorization;
  readonly binding: AuthorizationBinding;
  readonly budget: TrustedOutputBudget;
  readonly members: Set<object>;
  readonly spines: WeakMap<object, object>;
  finished: boolean;
}
const memberBuilders = new WeakMap<TrustedOutputMemberBuilder, MemberBuilderRecord>();

/** Builder-known issued document roots ONLY. Business data/arrays/native leaves are never walked. */
export function createTrustedOutputMemberBuilder(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  budget: TrustedOutputBudget,
): TrustedOutputMemberBuilder {
  if (readAuthorizationFastPath(call, binding)?.mode !== 'active') authorizationError('invalid trusted member origin');
  const builder = Object.freeze(Object.create(null)) as TrustedOutputMemberBuilder;
  memberBuilders.set(builder, { call, binding, budget, members: new Set(), spines: new WeakMap(), finished: false });
  return builder;
}

export function retainTrustedOutputMember(builder: TrustedOutputMemberBuilder, output: object): void {
  const record = memberBuilders.get(builder);
  if (!record || record.finished) authorizationError('invalid issued member builder');
  assertAuthorizationBinding(record.call, record.binding);
  const association = outputs.get(output);
  if (!association || !unchangedOutput(output, association)) authorizationError('unknown issued output member');
  const { stage } = validateDocumentOwner(association.handle);
  if (getAuthorizationProvenance(stage.call) !== getAuthorizationProvenance(record.call))
    authorizationError('issued member call mismatch');
  visitTrustedOutput(record.budget, 0);
  // An already-unioned issued root has a fixed registry; repeated attachments do not re-union it.
  if (record.members.has(output)) return;
  record.members.add(output);
  const add = (member: object) => {
    visitTrustedOutput(record.budget, 0);
    if (!record.members.has(member)) {
      record.members.add(member);
    }
  };
  for (const member of association.members ?? []) if (member !== output) add(member);
}

/** Safe dotted assembly may replace an issued root with a SHALLOW package-created spine.
 * Preserve its actual owner/mode and builder-known members, never traverse its business graph
 * or refresh the original association. A caller spread alone cannot invoke this private handoff.
 */
export function retainTrustedOutputSpine(builder: TrustedOutputMemberBuilder, source: object, copy: object): void {
  const record = memberBuilders.get(builder);
  if (!record || record.finished) authorizationError('invalid issued spine builder');
  assertAuthorizationBinding(record.call, record.binding);
  const association = outputs.get(source);
  if (!association) return;
  if (!unchangedOutput(source, association)) authorizationError('changed issued spine source');
  const { stage } = validateDocumentOwner(association.handle);
  if (getAuthorizationProvenance(stage.call) !== getAuthorizationProvenance(record.call))
    authorizationError('issued spine call mismatch');
  const child = createTrustedOutputMemberBuilder(stage.call, stage.binding, record.budget);
  const childRecord = memberBuilders.get(child)!;
  for (const member of association.members ?? []) {
    if (member === source) continue;
    visitTrustedOutput(record.budget, 0);
    childRecord.members.add(member);
    const replacement = record.spines.get(member);
    if (replacement) {
      visitTrustedOutput(record.budget, 0);
      childRecord.members.add(replacement);
    }
  }
  associateDocumentAuthorization(association.handle, stage.binding, copy, child);
  record.spines.set(source, copy);
  retainTrustedOutputMember(builder, copy);
}

function finishTrustedOutputMembers(
  builder: TrustedOutputMemberBuilder,
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  output: object,
): ReadonlySet<object> {
  const record = memberBuilders.get(builder);
  const { stage } = validateDocumentOwner(handle);
  if (!record || record.finished || record.call !== stage.call) authorizationError('invalid issued member publication');
  assertAuthorizationBinding(record.call, binding);
  if (!record.members.has(output)) {
    visitTrustedOutput(record.budget, 0);
    record.members.add(output);
  }
  record.finished = true;
  return record.members;
}

/** An embedded handle is reusable only for an intentionally issued member of THIS owning parent. */
export function getIssuedEmbeddedDocumentAuthorization(
  root: object,
  child: object,
  owner: DocumentAuthorization,
  binding: AuthorizationBinding,
): DocumentAuthorization | undefined {
  const rootRecord = outputs.get(root);
  if (
    !rootRecord ||
    rootRecord.handle !== owner ||
    rootRecord.snapshotState !== 'trusted' ||
    !rootRecord.members.has(child)
  )
    return;
  const childRecord = outputs.get(child);
  if (!childRecord) return;
  const owning = owningDocuments.get(childRecord.handle);
  if (owning?.handle !== owner) return;
  const { stage } = validateDocumentOwner(childRecord.handle);
  assertAuthorizationBinding(stage.call, binding);
  return childRecord.handle;
}

/** Membership is issuance, not current reachability. This never admits a replacement object. */
export function isIssuedOutputMember(root: object, member: object): boolean {
  const record = outputs.get(root);
  if (!record || record.snapshotState !== 'trusted' || !record.members.has(member)) return false;
  const { stage } = validateDocumentOwner(record.handle);
  assertAuthorizationBinding(stage.call, stage.binding);
  return outputs.has(member);
}

/** Preserve authenticated descendants of package-created copies. Include assembly may supply exact
 * finalized origins for replacement roots; neither output paths nor DTO values establish ownership.
 */
export function transferDocumentAuthorizationGraph(
  source: unknown,
  copy: unknown,
  copyOrigins?: WeakMap<object, object>,
): void {
  const seen = new WeakSet<object>();
  const visit = (source: unknown, copy: unknown): void => {
    if (!copy || typeof copy !== 'object' || seen.has(copy)) return;
    seen.add(copy);
    source = copyOrigins?.get(copy) ?? source;
    if (source instanceof Document) source = (source as unknown as { _doc: object })._doc;
    const original = source && typeof source === 'object' ? source : undefined;
    if (!original && !copyOrigins) return;
    const association = original && outputs.get(original);
    if (association) {
      const { document, stage } = validateDocumentOwner(association.handle);
      const outputAccess = readServiceAuthorizationAccess(stage.call, stage.binding).outputAccess;
      // Keep the later check after access validation, independently of the
      // adjacent owner reads above (native matching may itself execute code).
      validateStageOwner(stage);
      transferDocumentAuthorization(
        association.handle,
        {
          binding: stage.binding,
          output: original!,
          outputAccess,
          authorization: stage.call,
          stage: document.stage,
        },
        copy,
      );
    }
    for (const key of Object.keys(copy)) {
      const descriptor = original && Object.getOwnPropertyDescriptor(original, key);
      if (descriptor && 'value' in descriptor) {
        visit(descriptor.value, (copy as Record<string, unknown>)[key]);
      } else if (copyOrigins) {
        // A new dotted attachment can create containers absent from source output.
        visit(undefined, (copy as Record<string, unknown>)[key]);
      }
    }
  };
  visit(source, copy);
}

/** Non-enumerable immutable authority properties; legacy diagnostics stay separate and editable. */
export function createServiceOutputContext(
  diagnostic: ModelHookContext,
  handle: DocumentAuthorization,
  use: DocumentAuthorizationUse,
): ServiceOutputContext {
  assertDocumentAuthorization(handle, use);
  const rootOutput = use.output;
  const root = outputs.get(rootOutput)!;
  const graph = root.snapshotState === 'trusted' ? root.members : new Set(root.identities);
  const { stage } = validateDocumentOwner(handle);
  const call = stage.call;
  const context = { ...diagnostic } as ServiceOutputContext;
  Object.defineProperties(context, {
    documentAuthorization: { value: handle, enumerable: false, writable: false, configurable: false },
    getDocumentAuthorization: {
      enumerable: false,
      writable: false,
      configurable: false,
      value(output: object): DocumentAuthorization | undefined {
        if (!graph.has(output) || !unchangedOutput(rootOutput, root)) return undefined;
        const association = outputs.get(output);
        if (!association || !unchangedOutput(output, association)) return undefined;
        try {
          validateStageOwner(lookupStageOwner(lookupDocumentOwner(handle).stage));
          const { stage: child } = validateDocumentOwner(association.handle);
          assertAuthorizationBinding(call, use.binding);
          assertAuthorizationBinding(child.call, child.binding);
          if (getAuthorizationProvenance(child.call) !== getAuthorizationProvenance(call)) return undefined;
          return association.handle;
        } catch {
          return undefined;
        }
      },
    },
  });
  return context;
}
