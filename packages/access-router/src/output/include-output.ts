/** Package-private include provenance. Requested paths and source values confer no attachment authority. */
import { set } from '@web-ts-toolkit/utils';
import { transferDocumentAuthorizationGraph } from '../acl/document-authorization';
import { deepIsolateValue, isolateDocForOutput } from '../helpers/document';

interface IncludeOutput {
  original: unknown;
  source: Record<string, unknown>;
  attachments: Array<{ path: string; value: unknown }>;
}

const outputs = new WeakMap<object, IncludeOutput>();

const stateFor = (doc: unknown): IncludeOutput | undefined =>
  doc !== null && typeof doc === 'object' ? outputs.get(doc) : undefined;

/** A per-row working view preserves sequential legacy joins without mutating persistence or hook inputs. */
export function prepareIncludeOutput<T>(doc: T): T {
  if (stateFor(doc)) return doc;
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
  set(doc, path, deepIsolateValue(value));
}

/** Source authorization, populate finalization and virtual dependencies never consume include replacements. */
export function getIncludeSource(doc: unknown): unknown {
  return stateFor(doc)?.source ?? doc;
}

/** Preserve hydrated presentation behavior without retaining a persistence document in the returned output. */
export function getIncludeOriginal(doc: unknown): unknown {
  return stateFor(doc)?.original ?? doc;
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
