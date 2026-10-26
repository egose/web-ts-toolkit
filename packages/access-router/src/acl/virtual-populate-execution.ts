/** One-hop raw fetch work. No output grants, target finalization, or getter execution. */
import { Document, mongo, type Model } from 'mongoose';
import { isDeepStrictEqual } from 'node:util';
import { isPlainObject } from '@web-ts-toolkit/utils';
import type { AccessRuntime } from '../runtime';
import type { Filter, HydrationMode, ModelRequest, Populate, Validation } from '../interfaces';
import type { AccessRouterPermissions } from '../permission';
import { Cache } from '../cache';
import { evaluateRouteGuard, intersectFilters, resolveAccessFilterParts } from '../core-shared';
import { deepIsolateValue, isolateDocForOutput } from '../helpers/document';
import { getRequestWorkState } from '../helpers/request-work';
import { warn } from '../logger-helpers';
import { getCapturedAuthorizationOption } from './model-output-planning';
import { compactPersistedProjection } from './output-projection';
import { getPopulateTargetMeta } from './populate-target';
import { getRequestRowCache } from './filter-resolution';
import type { AuthorizationConfiguration } from './service-authorization';
import type { VirtualProjectionPlan } from './virtual-projection';
import type { CapturedVirtualPopulateDependency, VirtualPopulateTarget } from './virtual-populate-dependencies';

export type VirtualPopulateAddress = readonly (string | number)[];
declare const batchBrand: unique symbol;
declare const rowBrand: unique symbol;
export interface VirtualPopulateBatch {
  readonly [batchBrand]: true;
}
export interface VirtualPopulateRow {
  readonly [rowBrand]: true;
}
export type VirtualPopulateInputs =
  | { readonly available: false }
  | { readonly available: true; readonly populated: Record<string, unknown> };

interface OriginalReference {
  present: boolean;
  value: unknown;
}
interface Occurrence {
  address: VirtualPopulateAddress;
  plan: VirtualProjectionPlan;
  refs: Map<string, OriginalReference>;
  dependencies: Map<string, { dependency: CapturedVirtualPopulateDependency; request: FetchRequest }[]>;
}
interface FetchBinding {
  runtime: AccessRuntime;
  model: Model<unknown>;
  schema: object;
  configuration: AuthorizationConfiguration;
}
interface FetchRequest {
  binding: FetchBinding;
  /** Only exact request read semantics can join a private group. */
  requestRead: boolean;
  access: string;
  filter?: Filter;
  target?: VirtualPopulateTarget;
  original: OriginalReference;
  selection: readonly string[];
  publicSelection?: readonly string[];
  publicPlan?: VirtualProjectionPlan;
  address?: VirtualPopulateAddress;
  available: boolean;
  rows?: Map<string, Record<string, unknown>>;
}
interface RowRecord {
  batch: BatchRecord;
  source: Record<string, unknown>;
  sourceSelection: readonly string[];
  plan: VirtualProjectionPlan;
  occurrences: Map<string, Occurrence>;
  publicRequests: FetchRequest[];
  publicIdentity?: object;
}
interface BatchRecord {
  owner: {
    request: ModelRequest;
    runtime: AccessRuntime;
    family: object;
    permissions: AccessRouterPermissions;
    hydration: HydrationMode;
    core?: object;
  };
  rows: RowRecord[];
  requests: FetchRequest[];
  pending?: Promise<void>;
  completed?: boolean;
  rowCache: Cache<string, unknown>;
}
const batches = new WeakMap<VirtualPopulateBatch, BatchRecord>();
const rows = new WeakMap<VirtualPopulateRow, RowRecord>();
// Intermediate output copies only. Never associated with finalized DTOs/authorization handles.
const outputRows = new WeakMap<object, VirtualPopulateRow>();
const fetchedPublicIdentities = new WeakMap<object, object>();
const publicViewIdentities = new WeakMap<object, object>();
interface RawFetch {
  owner: BatchRecord['owner'];
  request: FetchRequest;
  capture: object | undefined;
  ids: Set<string>;
  selection: string[];
  pending: Promise<Map<string, Record<string, unknown>>>;
}
// Repeated correlated output calls may belong to the same captured execution
// family. Reuse successful covered raw work, never finalized output or failures.
const familyRawFetches = new WeakMap<object, RawFetch[]>();
const addressKey = (address: VirtualPopulateAddress) => JSON.stringify(address);
const storage = (value: unknown): Record<string, unknown> | undefined =>
  value instanceof Document
    ? (value as Document & { _doc: Record<string, unknown> })._doc
    : isPlainObject(value)
      ? (value as Record<string, unknown>)
      : undefined;
const originalRef = (source: unknown, key: string): OriginalReference => {
  const record = storage(source);
  return {
    present: !!record && Object.hasOwn(record, key),
    value: copyOriginalValue(record?.[key]),
  };
};
// Array.map preserves sparse own-property presence as well as explicit undefined/null slots.
const copyOriginalValue = (value: unknown): unknown =>
  Array.isArray(value) ? value.map((id) => deepIsolateValue(id)) : deepIsolateValue(value);

/** Positive leaf projection, preserving embedded array shape/presence and native mutable leaves. */
export function projectVirtualPopulateView(
  source: unknown,
  selection: readonly string[],
  structurePaths: readonly string[] = [],
): Record<string, unknown> {
  interface Mask {
    whole?: boolean;
    children: Map<string, Mask>;
  }
  const root: Mask = { children: new Map() };
  for (const path of compactPersistedProjection(selection)) {
    let node = root;
    for (const part of path.split('.')) {
      if (!node.children.has(part)) node.children.set(part, { children: new Map() });
      node = node.children.get(part)!;
    }
    if (!structurePaths.includes(path)) node.whole = true;
  }
  const project = (value: unknown, mask: Mask): unknown => {
    if (mask.whole) return deepIsolateValue(value);
    if (Array.isArray(value)) return value.map((entry) => project(entry, mask));
    const record = storage(value);
    if (!record) return deepIsolateValue(value);
    const out: Record<string, unknown> = {};
    for (const [key, child] of mask.children) if (Object.hasOwn(record, key)) out[key] = project(record[key], child);
    return out;
  };
  return project(source, root) as Record<string, unknown>;
}

/** Conservative BSON-aware comparison. Literal document key order is significant. */
export function equivalentVirtualPopulatePredicate(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof mongo.BSON.BSONValue || right instanceof mongo.BSON.BSONValue) {
    if (!(left instanceof mongo.BSON.BSONValue) || !(right instanceof mongo.BSON.BSONValue)) return false;
    return Buffer.from(mongo.BSON.serialize({ value: left })).equals(
      Buffer.from(mongo.BSON.serialize({ value: right })),
    );
  }
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => equivalentVirtualPopulatePredicate(entry, right[index]))
    );
  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const a = Object.keys(left as object),
      b = Object.keys(right as object);
    return (
      a.length === b.length &&
      a.every(
        (key, index) =>
          key === b[index] &&
          equivalentVirtualPopulatePredicate(
            (left as Record<string, unknown>)[key],
            (right as Record<string, unknown>)[key],
          ),
      )
    );
  }
  return isDeepStrictEqual(left, right);
}

const readPolicy = (configuration: AuthorizationConfiguration, access: string) =>
  ['operationAccess', 'baseFilter', 'overrideFilter'].map((key) => {
    const option = getCapturedAuthorizationOption(configuration, `${key}.${access}`);
    // The existing row resolver ignores non-functions (including absent terminal slots).
    return key === 'operationAccess' || typeof option === 'function' ? option : undefined;
  });
const compatible = (a: FetchRequest, b: FetchRequest) =>
  a.binding.runtime === b.binding.runtime &&
  a.binding.model === b.binding.model &&
  a.binding.schema === b.binding.schema &&
  a.access === b.access &&
  a.requestRead === b.requestRead &&
  // Different captures may share only an equivalent terminal persisted binding/policy.
  equivalentVirtualPopulatePredicate(
    a.binding.configuration.catalog.persistedPaths,
    b.binding.configuration.catalog.persistedPaths,
  ) &&
  equivalentVirtualPopulatePredicate(
    readPolicy(a.binding.configuration, a.access),
    readPolicy(b.binding.configuration, b.access),
  ) &&
  equivalentVirtualPopulatePredicate(a.filter, b.filter);

export function createVirtualPopulateBatch(owner: BatchRecord['owner']): VirtualPopulateBatch {
  const batch = Object.freeze(Object.create(null)) as VirtualPopulateBatch;
  batches.set(batch, {
    owner: { ...owner },
    rows: [],
    requests: [],
    rowCache: (owner.core && getRequestRowCache(owner.core)) || new Cache(),
  });
  return batch;
}

/** Paths requiring pre-populate capture, relative to this output node (including embedded occurrences). */
export function virtualPopulateSourcePaths(plan: VirtualProjectionPlan): string[] {
  return [
    ...new Set([
      ...plan.candidates.flatMap((candidate) => candidate.populateDependencies?.map((dep) => dep.path) ?? []),
      ...Object.entries(plan.childPlans).flatMap(([name, child]) =>
        virtualPopulateSourcePaths(child).map((path) => `${name}.${path}`),
      ),
    ]),
  ];
}

/** Preserve the adapter API: only participating static refs move to detached batch work. */
export function planVirtualPopulateQuery(plan: VirtualProjectionPlan, populate: readonly Populate[]) {
  const paths = virtualPopulateSourcePaths(plan);
  const requiresCapture =
    paths.length > 0 ||
    populate.some((entry) => {
      const target = getPopulateTargetMeta(entry);
      return target && virtualPopulateSourcePaths(target.plan).length > 0;
    });
  const publicPopulate = populate.filter(
    (entry) =>
      paths.includes(entry.path) ||
      (requiresCapture && getPopulateTargetMeta(entry)?.fetchBinding?.staticObjectIdReference),
  );
  return {
    requiresCapture,
    queryPopulate: populate.filter((entry) => !publicPopulate.includes(entry)),
    publicPopulate,
  };
}

/** Capture storage slots synchronously, before any normalization, target query or population. */
export function captureVirtualPopulateRows(
  batch: VirtualPopulateBatch,
  inputs: readonly unknown[],
  plan: VirtualProjectionPlan,
  publicPopulate: readonly Populate[] = [],
  sourceSelection: readonly string[] = plan.publicPersistedFetchSelection ?? plan.persistedFetchSelection,
): VirtualPopulateRow[] {
  const state = batches.get(batch)!;
  if (!state || state.pending) throw new Error('Private populate batch is closed');
  return inputs.map((input) => {
    const row: RowRecord = {
      batch: state,
      source: {},
      sourceSelection: [...sourceSelection],
      plan,
      occurrences: new Map(),
      publicRequests: [],
      publicIdentity: input && typeof input === 'object' ? publicViewIdentities.get(input) : undefined,
    };
    const visit = (value: unknown, currentPlan: VirtualProjectionPlan, address: VirtualPopulateAddress) => {
      if (Array.isArray(value)) {
        value.forEach((entry, index) => visit(entry, currentPlan, [...address, index]));
        return;
      }
      const record = storage(value);
      if (!record) return;
      const occurrence: Occurrence = { address, plan: currentPlan, refs: new Map(), dependencies: new Map() };
      row.occurrences.set(addressKey(address), occurrence);
      for (const candidate of currentPlan.candidates) {
        const dependencies = (candidate.populateDependencies ?? []).map((dependency) => {
          if (!occurrence.refs.has(dependency.path))
            occurrence.refs.set(dependency.path, originalRef(value, dependency.path));
          const request: FetchRequest = {
            binding: dependency.target,
            target: dependency.target,
            requestRead: true,
            access: 'read',
            original: occurrence.refs.get(dependency.path)!,
            selection: dependency.fetchSelection,
            available: false,
          };
          state.requests.push(request);
          return { dependency, request };
        });
        occurrence.dependencies.set(candidate.name, dependencies);
      }
      for (const [name, child] of Object.entries(currentPlan.childPlans))
        visit(record[name], child, [...address, name]);
    };
    visit(input, plan, []);
    // Public entries supplied here have been admitted/prepared by ordinary related execution.
    for (const entry of publicPopulate) {
      const meta = getPopulateTargetMeta(entry);
      if (!meta?.fetchBinding) throw new Error('Private populate requires a captured public target binding');
      const parts = entry.path.split('.');
      const collect = (value: unknown, index: number, address: VirtualPopulateAddress) => {
        if (Array.isArray(value)) {
          value.forEach((child, slot) => collect(child, index, [...address, slot]));
          return;
        }
        const record = storage(value);
        if (!record) return;
        const key = parts[index];
        if (index < parts.length - 1) return collect(record[key], index + 1, [...address, key]);
        const original = originalRef(value, key);
        const request: FetchRequest = {
          binding: meta.fetchBinding!,
          requestRead: meta.fetchBinding!.requestRead,
          access: meta.outputAccess,
          original,
          selection: meta.plan.persistedFetchSelection,
          publicSelection: meta.plan.publicPersistedFetchSelection ?? meta.plan.persistedFetchSelection,
          publicPlan: meta.plan,
          filter: deepIsolateValue((entry.match ?? {}) as Filter),
          address: [...address, key],
          available: true,
        };
        row.publicRequests.push(request);
        state.requests.push(request);
      };
      collect(input, 0, []);
    }
    // Capture raw own-property slots first; toObject transforms are not ref authority.
    row.source = isolateDocForOutput(input);
    state.rows.push(row);
    const token = Object.freeze(Object.create(null)) as VirtualPopulateRow;
    rows.set(token, row);
    return token;
  });
}

function referenceIds(original: OriginalReference): unknown[] {
  if (!original.present || original.value == null) return [];
  return (Array.isArray(original.value) ? original.value : [original.value]).filter((id) => id != null);
}
const idKey = (id: unknown) => String(id);
const logUnavailable = (request: FetchRequest, category: 'policy' | 'query') =>
  warn('Virtual populated dependency unavailable', { modelName: request.binding.model.modelName, category });

/** Collect first, then dispatch each compatible ID/projection union once. Safe at concurrency one. */
export function executeVirtualPopulateBatch(batch: VirtualPopulateBatch): Promise<void> {
  const state = batches.get(batch);
  if (!state) throw new Error('Unknown private populate batch');
  return (state.pending ??= execute(state));
}

async function execute(state: BatchRecord): Promise<void> {
  const { owner } = state;
  const work = getRequestWorkState(owner.request, owner.runtime);
  const targets = new Map<object, Promise<Filter | undefined>>();
  for (const request of state.requests) {
    if (!request.target) continue;
    const target = request.target;
    let pending = targets.get(target.identity);
    if (!pending) {
      pending = (async () => {
        try {
          const allowed = await work.hookGate.run(() =>
            evaluateRouteGuard(
              owner.request,
              owner.permissions,
              getCapturedAuthorizationOption(target.configuration, 'operationAccess.read') as Validation,
            ),
          );
          if (!allowed) return undefined;
          const parts = await work.hookGate.run(() =>
            resolveAccessFilterParts({
              req: owner.request,
              permissions: owner.permissions,
              cache: state.rowCache,
              cacheKey: `${target.modelName}_baseFilter_read`,
              access: 'read',
              filter: {},
              rows: { mode: 'request' },
              getOption: (key) => getCapturedAuthorizationOption(target.configuration, key),
            }),
          );
          return parts.filter === false ? undefined : deepIsolateValue(parts.filter);
        } catch {
          logUnavailable(request, 'policy');
          return undefined;
        }
      })();
      targets.set(target.identity, pending);
    }
    request.filter = await pending;
    request.available = request.filter !== undefined;
  }

  const groups: FetchRequest[][] = [];
  for (const request of state.requests) {
    if (!request.available || !request.original.present || request.original.value === undefined) continue;
    const existing = groups.find((group) => compatible(group[0], request));
    if (existing) existing.push(request);
    else groups.push([request]);
  }
  await work.scheduler.map(groups, async (group) => {
    const first = group[0];
    try {
      const ids = [
        ...new Map(group.flatMap((request) => referenceIds(request.original)).map((id) => [idKey(id), id])).values(),
      ];
      const selection = compactPersistedProjection(['_id', ...group.flatMap((request) => [...request.selection])]);
      // Mandatory association IDs are added AFTER all transformations. Never rewrite this predicate.
      const filter = intersectFilters(first.filter, { _id: { $in: deepIsolateValue(ids) } });
      const fetched = await fetchRawGroup(owner, first, ids, selection, async () => {
        const raw = ids.length
          ? await work.scheduler.work(() => {
              const query = first.binding.model.find(filter as Record<string, unknown>).select(selection);
              if (owner.hydration === 'lean') query.lean();
              return query.exec();
            })
          : [];
        const fetched = new Map<string, Record<string, unknown>>();
        for (const target of raw) {
          const copy = isolateDocForOutput(target);
          fetched.set(idKey(copy._id), copy);
        }
        return fetched;
      });
      for (const request of group) request.rows = fetched;
    } catch (error) {
      // A real shared-public query is an ordinary public failure, never a private miss.
      if (group.some((request) => request.publicSelection)) throw error;
      for (const request of group) request.available = false;
      logUnavailable(first, 'query');
    }
  });
  state.completed = true;
}

function fetchRawGroup(
  owner: BatchRecord['owner'],
  request: FetchRequest,
  ids: unknown[],
  selection: string[],
  fetch: () => Promise<Map<string, Record<string, unknown>>>,
): Promise<Map<string, Record<string, unknown>>> {
  let cache = familyRawFetches.get(owner.family);
  if (!cache) familyRawFetches.set(owner.family, (cache = []));
  const capture = request.target?.identity ?? request.publicPlan?.authorization;
  const existing = cache.find(
    (entry) =>
      entry.capture === capture &&
      entry.owner.request === owner.request &&
      entry.owner.runtime === owner.runtime &&
      entry.owner.hydration === owner.hydration &&
      compatible(entry.request, request) &&
      ids.every((id) => entry.ids.has(idKey(id))) &&
      selection.every((path) => entry.selection.some((p) => path === p || path.startsWith(`${p}.`))),
  );
  if (existing) return existing.pending;
  const entry: RawFetch = { owner, request, capture, ids: new Set(ids.map(idKey)), selection, pending: fetch() };
  cache.push(entry);
  // Remove a rejected query before dependent stages can reuse it. Each caller
  // still applies its own ordinary-public versus dependency-only error contract.
  void entry.pending.catch(() => {
    const index = cache.indexOf(entry);
    if (index !== -1) cache.splice(index, 1);
  });
  return entry.pending;
}

/** Exact pre-populate presence/value. Includes missing target IDs, duplicates, nulls and array order. */
export function readVirtualPopulateOriginalReference(
  row: VirtualPopulateRow,
  address: VirtualPopulateAddress,
  path: string,
): OriginalReference | undefined {
  const record = rows.get(row);
  const ref =
    record?.occurrences.get(addressKey(address))?.refs.get(path) ??
    record?.publicRequests.find((request) => addressKey(request.address!) === addressKey([...address, path]))?.original;
  return ref && { present: ref.present, value: copyOriginalValue(ref.value) };
}

/** Only admitted ordinary population replaces source IDs in public output. */
export function hasVirtualPopulatePublicReference(
  row: VirtualPopulateRow,
  address: VirtualPopulateAddress,
  path: string,
): boolean {
  return !!rows
    .get(row)
    ?.publicRequests.some((request) => addressKey(request.address!) === addressKey([...address, path]));
}

/** Fresh, declaration-only private values per call/getter/slot. No finalized DTO is input authority. */
export function readVirtualPopulateInputs(
  row: VirtualPopulateRow,
  address: VirtualPopulateAddress,
  virtualName: string,
): VirtualPopulateInputs {
  const record = rows.get(row);
  if (!record?.batch.completed) return { available: false };
  const dependencies = record.occurrences.get(addressKey(address))?.dependencies.get(virtualName);
  if (!dependencies) return { available: false };
  const populated: Record<string, unknown> = {};
  for (const { dependency, request } of dependencies) {
    if (!request.available || !request.original.present || request.original.value === undefined)
      return { available: false };
    const project = (id: unknown) => {
      const raw = id == null ? undefined : request.rows?.get(idKey(id));
      return raw ? projectVirtualPopulateView(raw, dependency.selection) : null;
    };
    const original = request.original.value;
    populated[dependency.path] =
      original === null ? null : Array.isArray(original) ? Array.from(original, project) : project(original);
  }
  return { available: true, populated };
}

/** Detached ordinary source/hook view, with separately masked public targets only. */
export function readVirtualPopulatePublicRow(row: VirtualPopulateRow): Record<string, unknown> {
  const record = rows.get(row);
  if (!record?.batch.completed) throw new Error('Private populate batch has not executed');
  const result = projectVirtualPopulateView(
    record.source,
    [
      ...record.sourceSelection,
      ...record.publicRequests.map((request) => request.address!.filter((part) => typeof part === 'string').join('.')),
    ],
    record.plan.publicStructurePaths,
  );
  for (const request of record.publicRequests) {
    if (!request.original.present) continue;
    let parent: unknown = result;
    const address = request.address!;
    for (const part of address.slice(0, -1)) parent = (parent as Record<string | number, unknown>)?.[part];
    if (!parent || typeof parent !== 'object') continue;
    const project = (id: unknown) => {
      const raw = id == null ? undefined : request.rows?.get(idKey(id));
      if (!raw) return null;
      return projectPublicFetchedView(raw, request.publicSelection!, request.publicPlan?.publicStructurePaths);
    };
    const original = request.original.value;
    (parent as Record<string | number, unknown>)[address[address.length - 1]] =
      original === null || original === undefined
        ? original
        : Array.isArray(original)
          ? original.map(project).filter((value) => value !== null)
          : project(original);
  }
  outputRows.set(result, row);
  if (record.publicIdentity) publicViewIdentities.set(result, record.publicIdentity);
  return result;
}

function projectPublicFetchedView(
  raw: Record<string, unknown>,
  selection: readonly string[],
  structurePaths?: readonly string[],
): Record<string, unknown> {
  const view = projectVirtualPopulateView(raw, selection, structurePaths);
  publicViewIdentities.set(view, publicIdentityFor(raw));
  return view;
}

function publicIdentityFor(raw: object): object {
  let identity = fetchedPublicIdentities.get(raw);
  if (!identity) {
    identity = Object.freeze(Object.create(null)) as object;
    fetchedPublicIdentities.set(raw, identity);
  }
  return identity;
}

/** Resolve only an intermediate source copy; no data is attached to the object. */
export function getVirtualPopulateRow(source: object): VirtualPopulateRow | undefined {
  return outputRows.get(source);
}

/** Data-free raw-work identity for the existing per-public-plan finalization cache, never private authority. */
export function getVirtualPopulatePublicIdentity(source: object): object | undefined {
  return publicViewIdentities.get(source);
}

/**
 * Next ordinary-output stage, collected across ALL parent rows before dispatch.
 * Inputs use the target's full fetch mask (including its own auto refs), never a
 * parent's private union or a finalized DTO. Addresses identify public output
 * slots after ordinary miss/null filtering. Terminal private targets never enter
 * this list, so this transport cannot recurse through private declarations.
 */
export function readVirtualPopulatePublicTargets(row: VirtualPopulateRow): {
  address: VirtualPopulateAddress;
  plan: VirtualProjectionPlan;
  input: Record<string, unknown>;
}[] {
  const record = rows.get(row);
  if (!record?.batch.completed) throw new Error('Private populate batch has not executed');
  return record.publicRequests.flatMap((request) => {
    const matches = referenceIds(request.original).flatMap((id) => {
      const target = request.rows?.get(idKey(id));
      return target ? [projectPublicFetchedView(target, request.selection)] : [];
    });
    return matches.map((input, index) => ({
      address: Array.isArray(request.original.value) ? [...request.address!, index] : request.address!,
      plan: request.publicPlan!,
      input,
    }));
  });
}

/**
 * Shared output orchestration: collect source/embedded occurrences before I/O,
 * then collect ordinary targets' own terminal dependencies before finalization.
 * Every returned row is detached and hook-masked; tokens remain in WeakMaps.
 */
export async function loadVirtualPopulateOutputRows(
  owner: BatchRecord['owner'],
  inputs: readonly unknown[],
  plan: VirtualProjectionPlan,
  publicPopulate: readonly Populate[] = [],
  sourceSelection?: readonly string[],
  adapterPopulate: readonly Populate[] = [],
  populateAdapter?: (output: Record<string, unknown>[]) => Promise<unknown>,
): Promise<Record<string, unknown>[]> {
  const batch = createVirtualPopulateBatch(owner);
  const captured = captureVirtualPopulateRows(batch, inputs, plan, publicPopulate, sourceSelection);
  await executeVirtualPopulateBatch(batch);
  const output = captured.map(readVirtualPopulatePublicRow);
  // Writes/templates/dedicated children populate only these detached rows,
  // after exact storage-slot capture. Reads already did adapter-only population.
  if (populateAdapter) await populateAdapter(output);
  const targets = captured.flatMap((row, index) =>
    readVirtualPopulatePublicTargets(row)
      .filter((target) => virtualPopulateSourcePaths(target.plan).length > 0)
      .map((target) => ({ ...target, index })),
  );
  // Non-static ordinary refs remain on Mongoose's adapter population path.
  // Collect their target inputs before any public snapshot/clone loses auto refs.
  for (const entry of adapterPopulate) {
    const meta = getPopulateTargetMeta(entry);
    if (!meta || !virtualPopulateSourcePaths(meta.plan).length) continue;
    const parts = entry.path.split('.');
    const visit = (value: unknown, part: number, address: VirtualPopulateAddress, index: number) => {
      if (Array.isArray(value)) {
        value.forEach((child, slot) => visit(child, part, [...address, slot], index));
        return;
      }
      const record = storage(value);
      if (!record) return;
      if (part < parts.length) {
        visit(record[parts[part]], part + 1, [...address, parts[part]], index);
        return;
      }
      publicViewIdentities.set(value as object, publicIdentityFor(value as object));
      targets.push({ address, index, input: value as Record<string, unknown>, plan: meta.plan });
    };
    (populateAdapter ? output : inputs).forEach((input, index) => visit(input, 0, [], index));
  }
  if (targets.length) {
    const next = createVirtualPopulateBatch(owner);
    const tokens = targets.map((target) => captureVirtualPopulateRows(next, [target.input], target.plan)[0]);
    await executeVirtualPopulateBatch(next);
    for (const [index, target] of targets.entries()) {
      let parent: unknown = output[target.index];
      for (const part of target.address.slice(0, -1)) parent = (parent as Record<string | number, unknown>)?.[part];
      if (parent && typeof parent === 'object')
        (parent as Record<string | number, unknown>)[target.address[target.address.length - 1]] =
          readVirtualPopulatePublicRow(tokens[index]);
    }
  }
  return output;
}
