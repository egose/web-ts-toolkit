/** Private document/stage owners; independent of the shared immutable call policy. */
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
  readServiceAuthorization,
  resolveServiceAuthorization,
} from './service-authorization';
import type {
  AuthorizationBinding,
  ResolvedServiceAuthorization,
  ResolveServiceAuthorizationInput,
} from './service-authorization';
import {
  authorizationError,
  authorizationRecord,
  copyAuthorizationValue,
  matchesAuthorizationSnapshot,
  outputIdentities,
} from './authorization-snapshot';

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

interface StageRecord {
  call: ResolvedServiceAuthorization;
  binding: AuthorizationBinding;
  input: object;
  snapshot: Readonly<Record<string, unknown>>;
  result?: Promise<DocumentAuthorization>;
}
interface DocumentRecord {
  stage: DocumentAuthorizationStage;
  grants: Grants;
  decisions: Map<string, Promise<boolean>>;
}
interface OutputRecord {
  handle: DocumentAuthorization;
  snapshot: unknown;
  identities: readonly object[];
}
const stages = new WeakMap<DocumentAuthorizationStage, StageRecord>();
const documents = new WeakMap<DocumentAuthorization, DocumentRecord>();
const outputs = new WeakMap<object, OutputRecord>();

/** Callable private admission seam for the later named helper overloads. No field evaluation. */
export function normalizeOutputAuthorizationOptions(
  input: Omit<ResolveServiceAuthorizationInput, 'authorization' | 'applicability' | 'binding'> & {
    readonly binding: Omit<AuthorizationBinding, 'scopePath'>;
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
    const stage = stageRecord(documentRecord(handle).stage);
    // Public handle overloads have no scope option: derive it from the authenticated
    // owner, while still checking the service's request/runtime/model identities.
    const binding = Object.freeze({ ...input.binding, scopePath: stage.binding.scopePath });
    assertAuthorizationBinding(stage.call, binding);
    const access = readServiceAuthorization(stage.call, binding).access;
    if (input.access.outputAccess !== access.outputAccess) authorizationError('document access mismatch');
    return Object.freeze({ kind: 'document', documentAuthorization: handle, binding });
  }
  if (value.scopePath !== undefined && !Array.isArray(value.scopePath))
    authorizationError('scopePath must be an array');
  return Object.freeze({
    kind: 'policy',
    authorization: resolveServiceAuthorization({
      ...input,
      binding: {
        ...input.binding,
        scopePath: copyAuthorizationValue(value.scopePath) as readonly string[] | undefined,
      },
      authorization: value.authorization,
      applicability: 'output',
    }),
  });
}

function stageRecord(stage: DocumentAuthorizationStage): StageRecord {
  const record = stages.get(stage);
  if (!record) authorizationError('invalid document stage');
  if (!matchesAuthorizationSnapshot(record.input, record.snapshot)) authorizationError('changed document snapshot');
  return record;
}

function documentRecord(handle: DocumentAuthorization): DocumentRecord {
  const record = documents.get(handle);
  if (!record) authorizationError('invalid document handle');
  stageRecord(record.stage);
  return record;
}

/** Accept the untrimmed projected plain snapshot, not a hydrated persistence document. */
export function createDocumentAuthorizationStage(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  projectedSnapshot: Readonly<Record<string, unknown>>,
): DocumentAuthorizationStage {
  assertAuthorizationBinding(call, binding);
  authorizationRecord(projectedSnapshot, 'projected document snapshot');
  const stage = Object.freeze(Object.create(null)) as DocumentAuthorizationStage;
  stages.set(stage, {
    call,
    binding: Object.freeze({ ...binding, scopePath: Object.freeze([...(binding.scopePath ?? [])]) }),
    input: projectedSnapshot,
    snapshot: copyAuthorizationValue(projectedSnapshot, 'document'),
  });
  return stage;
}

/** A retained post-fetch stage may be consumed only with its original call and projected values. */
export function assertDocumentAuthorizationStage(
  stage: DocumentAuthorizationStage,
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  projectedSnapshot: object,
): void {
  const record = stageRecord(stage);
  assertAuthorizationBinding(record.call, binding);
  if (
    record.call !== call ||
    record.input !== projectedSnapshot ||
    !matchesAuthorizationSnapshot(projectedSnapshot, record.snapshot)
  ) {
    authorizationError('document call/stage/snapshot mismatch');
  }
}

/** Concurrent consumers share one promise, including failures; separate stages never share grants. */
export function resolveDocumentAuthorization(
  stage: DocumentAuthorizationStage,
  resolveGrants: DocumentGrantResolver,
): Promise<DocumentAuthorization> {
  const record = stageRecord(stage);
  if (!record.result) {
    record.result = Promise.resolve().then(async () => {
      stageRecord(stage);
      const result = resolveGrants.call(
        record.binding.request,
        copyAuthorizationValue(record.snapshot, 'document'),
        getAuthorizationPermissions(record.call, record.binding),
      );
      // Synchronous hook results are owned before yielding to another microtask.
      const grants = result && typeof (result as Promise<Grants>).then === 'function' ? await result : result;
      stageRecord(stage);
      const ownedGrants = copyAuthorizationValue(authorizationRecord(grants, 'document grants'));
      const handle = Object.freeze(Object.create(null)) as DocumentAuthorization;
      documents.set(handle, { stage, grants: ownedGrants, decisions: new Map() });
      return handle;
    });
  }
  return record.result;
}

export function readDocumentAuthorization(handle: DocumentAuthorization, binding: AuthorizationBinding) {
  const record = documentRecord(handle);
  const stage = stageRecord(record.stage);
  assertAuthorizationBinding(stage.call, binding);
  return Object.freeze({
    authorization: stage.call,
    stage: record.stage,
    grants: copyAuthorizationValue(record.grants),
    ...readServiceAuthorization(stage.call, binding).access,
  });
}

/** Memoization primitive only: SVA-03 supplies the shared field evaluator. */
export function memoizeDocumentFieldDecision(
  handle: DocumentAuthorization,
  binding: AuthorizationBinding,
  field: string,
  evaluate: DocumentFieldDecision,
): Promise<boolean> {
  const record = documentRecord(handle);
  const stage = stageRecord(record.stage);
  assertAuthorizationBinding(stage.call, binding);
  let decision = record.decisions.get(field);
  if (!decision) {
    decision = Promise.resolve().then(async () => {
      stageRecord(record.stage);
      const result = await evaluate.call(
        stage.binding.request,
        getAuthorizationPermissions(stage.call, binding),
        copyAuthorizationValue(record.grants),
      );
      stageRecord(record.stage);
      if (typeof result !== 'boolean') authorizationError('field decision must be boolean');
      return result;
    });
    record.decisions.set(field, decision);
  }
  return decision;
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
  if (!matchesAuthorizationSnapshot(output, record.snapshot)) return false;
  const identities = outputIdentities(output);
  return (
    identities.length === record.identities.length &&
    identities.every((identity, i) => identity === record.identities[i])
  );
}

export function assertDocumentAuthorization(handle: DocumentAuthorization, use: DocumentAuthorizationUse): void {
  const record = documentRecord(handle);
  const stage = stageRecord(record.stage);
  assertAuthorizationBinding(stage.call, use.binding);
  if (
    (use.authorization !== undefined && stage.call !== use.authorization) ||
    (use.stage !== undefined && record.stage !== use.stage) ||
    readServiceAuthorization(stage.call, use.binding).access.outputAccess !== use.outputAccess
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
): void {
  const record = documentRecord(handle);
  assertAuthorizationBinding(stageRecord(record.stage).call, binding);
  if (!output || typeof output !== 'object') authorizationError('output must be an object');
  // An existing association cannot be refreshed to legitimize a mutation or change owners.
  if (outputs.has(output)) {
    const previous = outputs.get(output)!;
    if (previous.handle !== handle || !unchangedOutput(output, previous))
      authorizationError('output already associated');
    return;
  }
  outputs.set(output, {
    handle,
    snapshot: copyAuthorizationValue(output, 'document'),
    identities: outputIdentities(output),
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

/** Package-only lookup for already-finalized children/copies; never issues authority for a DTO. */
export function getAssociatedDocumentAuthorization(
  output: object,
  call?: ResolvedServiceAuthorization,
): DocumentAuthorization | undefined {
  const record = outputs.get(output);
  if (!record || !unchangedOutput(output, record)) return undefined;
  const stage = stageRecord(documentRecord(record.handle).stage);
  if (call && getAuthorizationProvenance(stage.call) !== getAuthorizationProvenance(call)) return undefined;
  return record.handle;
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
      const stage = stageRecord(documentRecord(association.handle).stage);
      transferDocumentAuthorization(
        association.handle,
        {
          binding: stage.binding,
          output: original!,
          outputAccess: readServiceAuthorization(stage.call, stage.binding).access.outputAccess,
          authorization: stage.call,
          stage: documentRecord(association.handle).stage,
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
  const graph = new Set(root.identities);
  const call = stageRecord(documentRecord(handle).stage).call;
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
          documentRecord(handle);
          const child = stageRecord(documentRecord(association.handle).stage);
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
