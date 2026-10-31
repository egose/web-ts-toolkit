/** Package-private include provenance. Requested paths and source values confer no attachment authority. */
import { set } from '@web-ts-toolkit/utils';
import { transferDocumentAuthorizationGraph } from '../acl/document-authorization';
import {
  getAssociatedDocumentAuthorization,
  getQueryOutputOriginal,
  prepareQueryOutputSource,
  readDocumentAuthorizationAccess,
  retainTrustedOutputMember,
  retainTrustedOutputSpine,
} from '../acl/document-authorization';
import {
  readServiceAuthorization,
  type AuthorizationBinding,
  type ResolvedServiceAuthorization,
} from '../acl/service-authorization';
import { authorizationError } from '../acl/authorization-snapshot';
import type { TrustedOutputMaterialization } from '../acl/output-field-filter';
import {
  createTrustedOutputBudget,
  materializeTrustedOutputValue,
  setTrustedOutputPath,
  shallowTrustedOutput,
  shallowTrustedOutputArray,
  visitTrustedOutput,
  type TrustedOutputBudget,
} from '../acl/trusted-output-materialization';
import { deepIsolateValue, isolateDocForOutput } from '../helpers/document';

interface IncludeOutput {
  original: unknown;
  source: Record<string, unknown>;
  attachments: Array<{ path: string; value: unknown }>;
  trusted?: { call: ResolvedServiceAuthorization; binding: AuthorizationBinding; budget: TrustedOutputBudget };
}

const outputs = new WeakMap<object, IncludeOutput>();

const stateFor = (doc: unknown): IncludeOutput | undefined =>
  doc !== null && typeof doc === 'object' ? outputs.get(doc) : undefined;

/** A per-row working view preserves sequential legacy joins without mutating persistence or hook inputs. */
export function prepareIncludeOutput<T>(
  doc: T,
  call?: ResolvedServiceAuthorization,
  binding?: AuthorizationBinding,
): T {
  if (stateFor(doc)) return doc;
  const prepared = call && binding ? prepareQueryOutputSource(call, binding, doc) : undefined;
  if (prepared) {
    const source = prepared.source;
    const budget = prepared.budget ?? createTrustedOutputBudget();
    const trusted = prepared.sourceState === 'trusted' ? { call: call!, binding: binding!, budget } : undefined;
    const working = trusted ? shallowTrustedOutput(source, budget) : deepIsolateValue(source);
    outputs.set(working, { original: getQueryOutputOriginal(doc, call), source, attachments: [], trusted });
    return working as T;
  }
  const source = isolateDocForOutput(doc);
  transferDocumentAuthorizationGraph(doc, source);
  const working = deepIsolateValue(source);
  outputs.set(working, { original: doc, source, attachments: [] });
  return working as T;
}

/** Called only when an executor actually produces a finalized target result or an explicit empty result. */
export function attachIncludeOutput(doc: unknown, path: string, value: unknown): void {
  const state = stateFor(doc);
  if (!state) throw new Error('Include attachment requires a prepared output row');
  state.attachments.push({ path, value });
  // Later legacy includes may read/overwrite this view, never the finalized target's authenticated DTO.
  if (state.trusted) setTrustedOutputPath(doc as Record<string, unknown>, path, value, state.trusted.budget);
  else set(doc, path, deepIsolateValue(value));
}

/** Already-finalized target roots are retained by exact authenticated identity, not per-occurrence deep copies. */
export function restoreTrustedIncludeOutput(
  doc: unknown,
  output: Record<string, unknown>,
  materialization: TrustedOutputMaterialization,
): void {
  const state = stateFor(doc);
  if (!state?.attachments.length) return;
  for (const { path, value } of state.attachments) {
    const target = state.trusted
      ? readServiceAuthorization(state.trusted.call, state.trusted.binding).relatedTargets.find(
          (entry) => entry.path === path,
        )
      : undefined;
    const active = new WeakSet<object>();
    const retain = (input: unknown, depth: number): unknown => {
      visitTrustedOutput(materialization.budget, depth);
      if (Array.isArray(input)) {
        if (active.has(input)) authorizationError('cyclic include output');
        active.add(input);
        try {
          return shallowTrustedOutputArray(input, materialization.budget, depth).map((entry) =>
            retain(entry, depth + 1),
          );
        } finally {
          active.delete(input);
        }
      }
      if (input && typeof input === 'object') {
        const handle = target ? getAssociatedDocumentAuthorization(input, state.trusted!.call) : undefined;
        if (!handle) authorizationError('unknown finalized include output');
        readDocumentAuthorizationAccess(handle, {
          ...state.trusted!.binding,
          modelName: target!.modelName,
          model: target!.model!,
          scopePath: [],
        });
        retainTrustedOutputMember(materialization.members, input);
        return input;
      }
      return materializeTrustedOutputValue(input, path, materialization.budget, { keep: () => true }, depth);
    };
    setTrustedOutputPath(
      output,
      path,
      retain(value, materialization.depth + 1),
      materialization.budget,
      materialization.depth,
      (source, copy) => retainTrustedOutputSpine(materialization.members, source, copy),
    );
  }
}

/** Source authorization, populate finalization and virtual dependencies never consume include replacements. */
export function getIncludeSource(doc: unknown): unknown {
  return stateFor(doc)?.source ?? doc;
}

/** Preserve hydrated presentation behavior without retaining a persistence document in the returned output. */
export function getIncludeOriginal(doc: unknown, call?: ResolvedServiceAuthorization): unknown {
  return stateFor(doc)?.original ?? getQueryOutputOriginal(doc, call);
}

/** Apply only produced values after source filtering. Graph association happens after all output writes. */
export function restoreIncludeOutput(
  doc: unknown,
  output: Record<string, unknown>,
): WeakMap<object, object> | undefined {
  const attachments = stateFor(doc)?.attachments;
  if (!attachments?.length) return undefined;
  const origins = new WeakMap<object, object>();
  for (const { path, value } of attachments) {
    const copy = deepIsolateValue(value);
    if (copy !== null && typeof copy === 'object') origins.set(copy, value as object);
    set(output, path, copy);
  }
  return origins;
}
