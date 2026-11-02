/** One private document-stage engine. Source admission is the only mode branch. */
import { types } from 'node:util';
import { Document } from 'mongoose';
import type { AccessRouterRequest, DocumentGrants } from '../interfaces';
import type { AccessRouterPermissions } from '../permission';
import {
  assertAuthorizationBinding,
  getAuthorizationPermissions,
  getAuthorizationProvenance,
  readServiceAuthorizationAccess,
  readServiceAuthorizationMode,
  readServiceOutputMetadata,
  readServiceOutputPolicy,
  type AuthorizationBinding,
  type ResolvedServiceAuthorization,
} from './service-authorization';
import { authorizationError } from './authorization-snapshot';
import { normalizeDocumentGrants } from './document-grants';
import {
  assertOutputPublication,
  bindOutputPublication,
  failOutputPublication,
  outputPublicationFor,
  retainPublicationStage,
  trackPublicationWork,
  type OutputPublication,
} from './output-publication';
import {
  createTrustedOutputBudget,
  isBorrowableAuthorizationRecord,
  materializeTrustedOutputValue,
  shallowTrustedOutput,
  unsetTrustedOutputPath,
  visitTrustedOutput,
  type TrustedOutputBudget,
} from './trusted-output-materialization';

declare const documentStageBrand: unique symbol;
export interface DocumentStage {
  readonly [documentStageBrand]: true;
}
export type DocumentGrantResolver = (
  this: AccessRouterRequest,
  sourceView: Readonly<Record<string, unknown>>,
  permissions: AccessRouterPermissions,
) => DocumentGrants | Promise<DocumentGrants>;
export type DocumentFieldDecision = (
  this: AccessRouterRequest,
  permissions: AccessRouterPermissions,
  grants: DocumentGrants,
) => boolean | Promise<boolean>;
type StageState = 'created' | 'resolving' | 'ready' | 'building' | 'closed';
type StageAccess = ReturnType<typeof readServiceAuthorizationAccess> & {
  readonly authorization: ResolvedServiceAuthorization;
};
type FieldDecision = {
  state: 'pending' | 'fulfilled' | 'rejected';
  promise?: Promise<boolean>;
  fulfill?: (value: boolean) => void;
  reject?: (error: unknown) => void;
  value?: boolean;
};
interface StageRecord {
  state: StageState;
  generation: number;
  failure?: unknown;
  call?: ResolvedServiceAuthorization;
  binding?: AuthorizationBinding;
  publication?: OutputPublication;
  source?: Record<string, unknown>;
  borrowed: boolean;
  result?: Promise<DocumentGrants>;
  grants?: DocumentGrants;
  access?: StageAccess;
  view?: StageAccess & { readonly grants: DocumentGrants };
  decisions: Map<string, FieldDecision>;
  owning?: { stage: DocumentStage; binding: AuthorizationBinding };
}
const stages = new WeakMap<DocumentStage, StageRecord>();

function stageRecord(stage: DocumentStage): StageRecord {
  const record = stages.get(stage);
  if (!record) authorizationError('invalid document stage');
  return record;
}

function assertOpen(record: StageRecord, generation = record.generation): void {
  if (record.state === 'closed' || record.generation !== generation) authorizationError('closed document stage');
  assertOutputPublication(record.publication!);
  if (record.owning) readDocumentStageAccess(record.owning.stage, record.owning.binding);
}

/** Closed tombstones are checked before any binding, source, grant or memo read. */
export function assertDocumentStage(
  stage: DocumentStage,
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  source?: object,
): void {
  const record = stageRecord(stage);
  assertOpen(record);
  assertAuthorizationBinding(record.call!, binding);
  if (record.call !== call || (source !== undefined && record.source !== source))
    authorizationError('document call/stage/source mismatch');
}

export function createDocumentStage(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  input: unknown,
  owning?: { stage: DocumentStage; binding: AuthorizationBinding },
): DocumentStage {
  return admitDocumentStage(call, binding, input, owning);
}

function admitDocumentStage(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  input: unknown,
  owning?: { stage: DocumentStage; binding: AuthorizationBinding },
  inheritedSource = false,
): DocumentStage {
  assertAuthorizationBinding(call, binding);
  if (owning) {
    const parent = readDocumentStage(owning.stage, owning.binding);
    const child = readServiceAuthorizationAccess(call, binding);
    assertAuthorizationBinding(parent.authorization, { ...binding, scopePath: owning.binding.scopePath });
    const parentScope = owning.binding.scopePath ?? [],
      childScope = binding.scopePath ?? [];
    if (
      getAuthorizationProvenance(call) !== getAuthorizationProvenance(parent.authorization) ||
      childScope.length <= parentScope.length ||
      !parentScope.every((part, index) => childScope[index] === part) ||
      ['operation', 'rowAccess', 'virtualAccess', 'outputAccess', 'docPermissionsAccess'].some(
        (key) => child[key as keyof typeof child] !== parent[key as keyof typeof parent],
      )
    )
      authorizationError('owning document stage scope/access mismatch');
    bindOutputPublication(call, stageRecord(owning.stage).publication!);
  }
  const publication = outputPublicationFor(call);
  assertOutputPublication(publication);
  // A genuine embedded occurrence comes directly from the owning stage's
  // selected source traversal. Its isolated parent already owns this subtree;
  // copying/revalidating it per embedded stage would repeat whole-source work.
  // Borrowed parents retain only shallow root admission, never a hidden graph
  // certificate. All actual application getter views still detach separately.
  let prepared: PreparedSource;
  if (owning && inheritedSource) {
    const parent = stageRecord(owning.stage);
    if (
      !input ||
      typeof input !== 'object' ||
      types.isProxy(input) ||
      (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
    )
      authorizationError('embedded source must be an ordinary projected document');
    if (parent.borrowed && !isBorrowableAuthorizationRecord(input))
      authorizationError('unsupported borrowed embedded source');
    prepared = { source: input as Record<string, unknown>, borrowed: parent.borrowed };
  } else prepared = prepareQueryOutputSource(call, binding, input);
  const stage = Object.freeze(Object.create(null)) as DocumentStage;
  const record: StageRecord = {
    state: 'created',
    generation: 0,
    failure: undefined,
    result: undefined,
    grants: undefined,
    access: Object.freeze({ authorization: call, ...readServiceAuthorizationAccess(call, binding) }),
    view: undefined,
    call,
    publication,
    binding: Object.freeze({ ...binding, scopePath: Object.freeze([...(binding.scopePath ?? [])]) }),
    source: prepared.source,
    borrowed: prepared.borrowed,
    decisions: new Map(),
    owning,
  };
  stages.set(stage, record);
  retainPublicationStage(publication, (error, clear) => closeDocumentStage(stage, error, clear));
  return stage;
}

/** Only actual embedded source traversal uses this private ownership handoff.
 * Dedicated child rows merely share parent facts: they still admit their own source. */
export function prepareEmbeddedDocumentStage(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  input: unknown,
  owning: { stage: DocumentStage; binding: AuthorizationBinding },
) {
  const stage = admitDocumentStage(call, binding, input, owning, true);
  const { source, borrowed } = stageRecord(stage);
  return { source: source!, borrowed, stage };
}

export function prepareQueryDocumentStage(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  input: unknown,
  owning?: { stage: DocumentStage; binding: AuthorizationBinding },
) {
  const stage = createDocumentStage(call, binding, input, owning);
  const { source, borrowed } = stageRecord(stage);
  return { source: source!, borrowed, stage };
}

export function documentStageSource(stage: DocumentStage, binding: AuthorizationBinding): Record<string, unknown> {
  const record = stageRecord(stage);
  assertOpen(record);
  assertAuthorizationBinding(record.call!, binding);
  return record.source!;
}

/** Private fetch-only transport cleanup, before the one hook resolution or any field memo. */
export function excludeDocumentStagePath(stage: DocumentStage, binding: AuthorizationBinding, path: string): void {
  const record = stageRecord(stage);
  assertOpen(record);
  assertAuthorizationBinding(record.call!, binding);
  if (record.state !== 'created') authorizationError('document projection cleanup must precede resolution');
  const budget = createTrustedOutputBudget();
  const projected = shallowTrustedOutput(record.source!, budget);
  unsetTrustedOutputPath(projected, path, budget);
  record.source = projected;
}

/** Resolution owns one promise and facts. A synchronous fact map is never then-assimilated. */
export function resolveDocumentStage(
  stage: DocumentStage,
  resolve: DocumentGrantResolver,
  exposeSource = true,
): Promise<DocumentGrants> {
  const record = stageRecord(stage);
  assertOpen(record);
  if (record.result) return record.result;
  const generation = record.generation;
  let fulfill!: (facts: DocumentGrants) => void, reject!: (error: unknown) => void;
  record.result = new Promise<DocumentGrants>((done, fail) => {
    fulfill = done;
    reject = fail;
  });
  void record.result.catch(() => {});
  record.state = 'resolving';
  trackPublicationWork(record.publication!, record.result);
  const commit = (value: unknown) => {
    assertOpen(record, generation);
    assertAuthorizationBinding(record.call!, record.binding!);
    const facts = normalizeDocumentGrants(
      value,
      readServiceOutputMetadata(record.call!, record.binding!).documentPermissionField,
    );
    assertOpen(record, generation);
    record.grants = facts;
    record.view = Object.freeze({ ...record.access!, grants: facts });
    record.state = 'ready';
    fulfill(facts);
  };
  const fail = (error: unknown) => {
    record.failure = error;
    failOutputPublication(record.publication!, error);
    reject(error);
  };
  try {
    const source = !exposeSource || record.borrowed ? record.source! : copyDocumentView(record.source!);
    const value = resolve.call(
      record.binding!.request,
      source,
      getAuthorizationPermissions(record.call!, record.binding!),
    );
    if (types.isPromise(value)) {
      void value.then((facts) => {
        try {
          commit(facts);
        } catch (error) {
          fail(error);
        }
      }, fail);
    } else commit(value);
  } catch (error) {
    fail(error);
  }
  return record.result;
}

export function readDocumentStageAccess(stage: DocumentStage, binding: AuthorizationBinding) {
  const record = stageRecord(stage);
  assertOpen(record);
  assertAuthorizationBinding(record.call!, binding);
  return record.access!;
}

export function readDocumentStage(stage: DocumentStage, binding: AuthorizationBinding) {
  const record = stageRecord(stage);
  readDocumentStageAccess(stage, binding);
  if (record.state !== 'ready' && record.state !== 'building') authorizationError('document facts are not ready');
  return record.view!;
}

export function readOwningDocumentStage(stage: DocumentStage) {
  const record = stageRecord(stage);
  assertOpen(record);
  return record.owning;
}

export function beginDocumentStageOutput(stage: DocumentStage, binding: AuthorizationBinding): void {
  readDocumentStage(stage, binding);
  stageRecord(stage).state = 'building';
}

function pendingFieldDecision(decision: FieldDecision): Promise<boolean> {
  if (!decision.promise) {
    decision.promise = new Promise<boolean>((done, fail) => {
      decision.fulfill = done;
      decision.reject = fail;
    });
    void decision.promise.catch(() => {});
  }
  return decision.promise;
}

/** An exact stage key may already have settled through another lookup route. */
export function readStageFieldDecision(stage: DocumentStage, binding: AuthorizationBinding, key: string) {
  readDocumentStage(stage, binding);
  const previous = stageRecord(stage).decisions.get(key);
  return previous ? (previous.state === 'fulfilled' ? previous.value! : pendingFieldDecision(previous)) : undefined;
}

/** Synchronous settled evaluations stay synchronous; async resumes recheck generation before memo commit. */
export function memoizeStageFieldDecision(
  stage: DocumentStage,
  binding: AuthorizationBinding,
  key: string,
  evaluate: DocumentFieldDecision,
): boolean | Promise<boolean> {
  const { authorization, grants } = readDocumentStage(stage, binding);
  const record = stageRecord(stage),
    generation = record.generation;
  // Most field predicates settle synchronously. Create a promise only for an
  // actual async result or synchronous reentry into a pending decision.
  const previous = record.decisions.get(key);
  if (previous) return previous.state === 'fulfilled' ? previous.value! : pendingFieldDecision(previous);
  const decision: FieldDecision = {
    state: 'pending',
    // Own this lazy slot before application/native work can install an inherited setter.
    value: undefined,
    promise: undefined,
    fulfill: undefined,
    reject: undefined,
  };
  record.decisions.set(key, decision);
  const commit = (value: unknown): boolean => {
    assertOpen(record, generation);
    assertAuthorizationBinding(authorization, binding);
    if (typeof value !== 'boolean') authorizationError('field decision must be boolean');
    decision.value = value;
    decision.state = 'fulfilled';
    decision.fulfill?.(value);
    return value;
  };
  const fail = (error: unknown) => {
    decision.state = 'rejected';
    pendingFieldDecision(decision);
    decision.reject!(error);
    failOutputPublication(record.publication!, error);
  };
  try {
    const value = evaluate.call(record.binding!.request, getAuthorizationPermissions(authorization, binding), grants);
    if (types.isPromise(value)) {
      const promise = pendingFieldDecision(decision);
      trackPublicationWork(record.publication!, promise);
      void value.then((result) => {
        try {
          commit(result);
        } catch (error) {
          fail(error);
        }
      }, fail);
      return promise;
    }
    return commit(value);
  } catch (error) {
    fail(error);
    return pendingFieldDecision(decision);
  }
}

export function closeDocumentStage(stage: DocumentStage, error?: unknown, clear = false): void {
  const record = stageRecord(stage);
  if (record.state !== 'closed') {
    record.state = 'closed';
    record.generation++;
  }
  record.failure ??= error;
  if (clear) {
    record.source = undefined;
    record.grants = undefined;
    record.access = undefined;
    record.view = undefined;
    record.call = undefined;
    record.binding = undefined;
    record.publication = undefined;
    record.owning = undefined;
    record.result = undefined;
    record.decisions.clear();
  }
}

/** Each explicit callback exposure owns a bounded detached view, including native leaves. */
export function copyDocumentView<T>(value: T): T {
  return materializeTrustedOutputValue(value, '', createTrustedOutputBudget(), { keep: () => true }) as T;
}

interface PreparedSource {
  source: Record<string, unknown>;
  borrowed: boolean;
}
const sources = new WeakMap<object, WeakMap<ResolvedServiceAuthorization, PreparedSource>>();
const originals = new WeakMap<object, object>();
const referenceOriginals = new WeakMap<object, object>();

export function getQueryOutputOriginal(input: unknown, call?: ResolvedServiceAuthorization): unknown {
  return input && typeof input === 'object' && call && sources.get(input)?.has(call)
    ? (originals.get(input) ?? input)
    : input;
}
export function getQueryReferenceOriginal(input: object): object | undefined {
  return referenceOriginals.get(input);
}

/** Exact reference provenance only, not a result graph, stage lookup or authorization certificate. */
function captureReferenceOrigins(
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
      for (let n = 0; n < copy.length; n++) {
        const a = Object.getOwnPropertyDescriptor(raw, String(n)),
          b = Object.getOwnPropertyDescriptor(copy, String(n));
        if (a && b && 'value' in a && 'value' in b) walk(a.value, b.value, parts, index, depth + 1);
      }
      return;
    }
    if (index === parts.length) {
      if (raw !== copy && isBorrowableAuthorizationRecord(copy)) referenceOriginals.set(copy, raw);
      return;
    }
    const a = Object.getOwnPropertyDescriptor(storage(raw), parts[index]),
      b = Object.getOwnPropertyDescriptor(copy, parts[index]);
    if (a && b && 'value' in a && 'value' in b) walk(a.value, b.value, parts, index + 1, depth + 1);
  };
  for (const path of paths) walk(original, normalized, path.split('.'), 0, 0);
}

/** Normalize supported hydration once BEFORE the hook. Both modes feed the same private stage. */
export function prepareQueryOutputSource(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  input: unknown,
): PreparedSource {
  assertAuthorizationBinding(call, binding);
  assertOutputPublication(outputPublicationFor(call));
  const existing = input && typeof input === 'object' ? sources.get(input)?.get(call) : undefined;
  if (existing) return existing;
  if (!input || typeof input !== 'object' || types.isProxy(input)) authorizationError('unsupported output source');
  let raw: unknown = input;
  if (input instanceof Document) {
    try {
      raw = input.toObject({ virtuals: false, flattenMaps: true });
    } catch {
      raw = (input as Document & { _doc: object })._doc;
    }
  }
  const borrowed = readServiceAuthorizationMode(call, binding) === 'trusted' && isBorrowableAuthorizationRecord(raw);
  const source = borrowed ? (raw as Record<string, unknown>) : (copyDocumentView(raw) as Record<string, unknown>);
  assertOutputPublication(outputPublicationFor(call));
  // The materializer already admitted every detached descriptor. Do not walk
  // that owned root again merely to prove the same shape after normalization.
  if (
    !borrowed &&
    (!source ||
      typeof source !== 'object' ||
      (Object.getPrototypeOf(source) !== Object.prototype && Object.getPrototypeOf(source) !== null))
  )
    authorizationError('output source must be an ordinary projected document');
  const prepared = { source, borrowed };
  let captures = sources.get(source);
  if (!captures) sources.set(source, (captures = new WeakMap()));
  captures.set(call, prepared);
  if (source !== input) {
    originals.set(source, input);
    captureReferenceOrigins(
      input,
      source,
      readServiceOutputPolicy(call, binding).catalog.referencePaths ?? [],
      createTrustedOutputBudget(),
    );
  }
  return prepared;
}
