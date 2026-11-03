/** Private construction inputs and completed attachments, not returned-DTO authority. */
import { isPlainObject } from '@web-ts-toolkit/utils';
import { getQueryOutputOriginal, prepareQueryOutputSource } from '../acl/document-stage';
import type { AuthorizationBinding, ResolvedServiceAuthorization } from '../acl/service-authorization';
import { outputPublicationFor, retainPublicationResource } from '../acl/output-publication';
import { authorizationError } from '../acl/authorization-snapshot';
import type { OutputMaterialization } from '../acl/output-field-filter';
import {
  defineTrustedOutputValue,
  materializeTrustedOutputValue,
  setTrustedOutputPath,
  type TrustedOutputBudget,
} from '../acl/trusted-output-materialization';
import { isolateDocForOutput } from '../helpers/document';

interface IncludeConstruction {
  original: unknown;
  source: Record<string, unknown>;
  attachments: Array<{ path: string; value: unknown }>;
  budget?: TrustedOutputBudget;
}
const constructions = new WeakMap<object, IncludeConstruction>();
const stateFor = (doc: unknown) => (doc && typeof doc === 'object' ? constructions.get(doc) : undefined);

/** Shallow private working rows keep raw hook projections separate from attachment replacements. */
export function prepareIncludeOutput<T>(
  doc: T,
  call?: ResolvedServiceAuthorization,
  binding?: AuthorizationBinding,
  budget?: TrustedOutputBudget,
): T {
  if (stateFor(doc)) return doc;
  const source = call && binding ? prepareQueryOutputSource(call, binding, doc).source : isolateDocForOutput(doc);
  if (!isPlainObject(source)) authorizationError('include output requires an ordinary source');
  const working: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const slot = Object.getOwnPropertyDescriptor(source, key)!;
    if (!('value' in slot)) authorizationError('accessor include source');
    defineTrustedOutputValue(working, key, slot.value);
  }
  constructions.set(working, {
    original: getQueryOutputOriginal(doc, call),
    source,
    attachments: [],
    budget,
  });
  if (call) retainPublicationResource(outputPublicationFor(call), () => constructions.delete(working));
  return working as T;
}

export function getIncludeBudget(doc: unknown): TrustedOutputBudget {
  const budget = stateFor(doc)?.budget;
  if (!budget) authorizationError('related output requires a receiving root-row budget');
  return budget;
}

export function attachIncludeOutput(doc: unknown, path: string, value: unknown): void {
  const state = stateFor(doc);
  if (!state) authorizationError('include attachment requires a private construction row');
  // Per-parent isolation is legitimate construction work and charges BEFORE copying.
  const budget = getIncludeBudget(doc);
  const copy = materializeTrustedOutputValue(value, path, budget, { keep: () => true }, path.split('.').length);
  state.attachments.push({ path, value: copy });
  setTrustedOutputPath(doc as Record<string, unknown>, path, copy, budget);
}

export function getIncludeSource(doc: unknown): unknown {
  return stateFor(doc)?.source ?? doc;
}
export function getIncludeAttachments(doc: unknown): readonly { path: string; value: unknown }[] {
  return stateFor(doc)?.attachments ?? [];
}
export function getIncludeOriginal(doc: unknown, call?: ResolvedServiceAuthorization): unknown {
  return stateFor(doc)?.original ?? getQueryOutputOriginal(doc, call);
}

export function restoreIncludeOutput(
  doc: unknown,
  output: Record<string, unknown>,
  construction: OutputMaterialization,
): void {
  for (const { path, value } of stateFor(doc)?.attachments ?? []) {
    // This exact private value was already isolated for this parent, before any
    // getter exposure. Getter views are disposable; publication transfers ownership.
    setTrustedOutputPath(output, path, value, construction.budget, construction.depth);
  }
}
