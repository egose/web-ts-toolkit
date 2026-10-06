import { forEach, get, isPlainObject, pick } from '@web-ts-toolkit/utils';
import { filterCollection, findElement, findElementById, genSubPopulate, toObject } from '../helpers';
import { applyUpdate } from '../helpers/apply-update';
import type {
  ErrorResult,
  Filter,
  ListResult,
  SingleResult,
  SubdocumentBulkRecord,
  SubdocumentBulkUpdateInput,
  SubdocumentCreateInput,
  SubdocumentCreateOptions,
  SubdocumentId,
  SubdocumentListOptions,
  SubdocumentName,
  SubdocumentParentArgs,
  SubdocumentParentOptions,
  SubdocumentReadOptions,
  SubdocumentRecord,
} from '../interfaces';
import { Codes } from '../enums';
import { sanitizeSubScopeVirtualKeys, stripSubVirtualKeysFromFilter, validateClientFilter } from './base';
import type { Service } from './service';
import type { FinalizeSnapshot } from '../output/finalize-model-output';
import type { VirtualProjectionPlan } from '../acl/virtual-projection';

type IsOperationAllowed = (access: string) => Promise<boolean>;
type Persist = <T>(operation: () => T | PromiseLike<T>) => Promise<T>;

/**
 * VIRT-06 helpers: embedded scopes (`virtuals.<field>.sub.<name>.<access>`).
 *
 * - `dependsOn` resolves relative to `[field,'sub']` (VIRT-00A D5); literal
 *   `.sub` never becomes a DB/response name (planner strips `.sub.` tokens,
 *   finalizer uses scope-aware `scopePath`).
 * - Dedicated routes reuse owning-parent internal `read` grants with scoped
 *   `permissionSchema.<field>.sub` rules (VIRT-00A D2); no independent
 *   embedded `docPermissions` family. `operation` stays initiating
 *   (`subList`/`subRead`/`subCreate`/`subUpdate`/`subBulkUpdate`).
 * - Existing row/operation filters run BEFORE getters; hidden rows never
 *   reach the finalizer (no getter for hidden rows). Denial contracts
 *   preserved: list/read denial stays Forbidden/NotFound; denied post-persist
 *   visibility succeeds with `[]`/`null`.
 * - Bounded via `Service.finalizeSubRowsWithVirtuals` (ONE bounded row map +
 *   shared gate, stable order, limit-1 completes, no persistence permits).
 */

type SubVirtualAccess = 'list' | 'create' | 'read' | 'update';

const isVirtualContainerValue = (value: unknown): value is { sub: Record<string, unknown> } =>
  isPlainObject(value) && 'sub' in (value as Record<string, unknown>);

const hasSubVirtuals = (snapshot: FinalizeSnapshot | null | undefined, sub: string): boolean => {
  try {
    const root = (snapshot?.virtuals ?? null) as Record<string, unknown> | null;
    if (!root || !isPlainObject(root)) return false;
    const container = (root as Record<string, unknown>)[sub];
    if (container === undefined || !isVirtualContainerValue(container)) return false;
    const subVirtuals = (container as { sub: unknown }).sub;
    if (!isPlainObject(subVirtuals)) return false;
    const names = Object.entries(subVirtuals as Record<string, unknown>).filter(
      ([, v]) => v !== undefined && !isVirtualContainerValue(v),
    );
    if (names.length > 0) return true;
    // Nested containers (e.g. `contacts.sub.addresses.sub.*`) also count:
    // walk one level deeper for any `{ sub }` with leaves.
    for (const [, v] of Object.entries(subVirtuals as Record<string, unknown>)) {
      if (isVirtualContainerValue(v)) {
        const inner = (v as { sub: unknown }).sub;
        if (isPlainObject(inner) && Object.keys(inner as Record<string, unknown>).length > 0) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
};

/**
 * Deliberate owning-parent grant input (VIRT-00A D2).
 *
 * `getParentDoc` projects only `sub` and post-save visibility selects `_id`;
 * doc-permission hooks may depend on any persisted parent field. When sub
 * virtuals exist, fetch a full parent for grant computation (same
 * `read` row filter, no projection) and compute `read` grants from it.
 * Falls back to the already-fetched `parentDoc` when the full fetch misses
 * or fails. When no sub virtuals exist, returns `{}` without extra queries
 * (legacy paths do not need grants). Never substitutes a trimmed DTO for
 * the raw parent used for persistence.
 */
async function getOwningParentGrants(
  service: Service<never>,
  parentId: unknown,
  parentDoc: unknown,
  operation: string,
  snapshot: FinalizeSnapshot,
  sub: string,
): Promise<Record<string, unknown>> {
  if (!hasSubVirtuals(snapshot, sub)) return {};
  try {
    const svc = service as unknown as {
      genFilter: (access: string, filter?: unknown) => Promise<unknown>;
      genIDFilter: (id: string) => Promise<unknown>;
      findRawParentDoc: (args: {
        filter: unknown;
        select: string;
        populate: unknown;
        lean: boolean;
      }) => Promise<unknown>;
      getSubParentGrants: (doc: unknown, op: string) => Promise<Record<string, unknown>>;
    };
    const idFilter = await svc.genIDFilter(parentId as string);
    const parentFilter = await svc.genFilter('read', idFilter as never);
    if (parentFilter === false) {
      // Parent not readable: callers already map to NotFound/[]; grants stay
      // empty so any virtual evaluation denies fail-closed.
      return {};
    }
    try {
      const fullParent = await svc.findRawParentDoc({
        filter: { $and: [{ _id: parentId }, parentFilter] } as never,
        select: '',
        populate: [],
        lean: true,
      });
      const grantDoc = (fullParent ?? parentDoc) as unknown;
      if (grantDoc) {
        try {
          return (await svc.getSubParentGrants(grantDoc, operation)) ?? {};
        } catch {
          return {};
        }
      }
    } catch {
      // fall through to parentDoc fallback
    }
    try {
      return (await svc.getSubParentGrants(parentDoc, operation)) ?? {};
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

const buildSubPlan = (
  service: Service<never>,
  sub: string,
  snapshot: FinalizeSnapshot,
  virtualAccess: SubVirtualAccess,
  outputAccess: SubVirtualAccess,
  docPermissionsAccess: SubVirtualAccess,
  requestedSelect?: string[] | undefined,
): VirtualProjectionPlan => {
  const svc = service as unknown as {
    buildSubVirtualPlan: (
      sub: string,
      snapshot: FinalizeSnapshot,
      virtualAccess: SubVirtualAccess,
      outputAccess: SubVirtualAccess,
      docPermissionsAccess: SubVirtualAccess,
      requestedSelect?: unknown,
      effectiveSelect?: unknown,
    ) => VirtualProjectionPlan;
  };
  return svc.buildSubVirtualPlan(
    sub,
    snapshot,
    virtualAccess,
    outputAccess,
    docPermissionsAccess,
    requestedSelect,
    requestedSelect,
  );
};

// Mutation output uses read fields. Only create enumerates the full array, so it
// additionally requires list access/rows. Targeted updates do not require list.
// Resolve policies once for the response, never once per row. Denial hides output
// rather than turning an already-persisted write into a retryable error.
async function visibleMutationRows<TModel>(
  service: Service<TModel>,
  isAllowed: IsOperationAllowed,
  parentId: unknown,
  sub: SubdocumentName,
  rows: Record<string, unknown>[],
  response: 'create' | 'single' | 'bulk',
): Promise<Record<string, unknown>[]> {
  const accesses = ['read', `subs.${sub}.read`];
  if (response === 'create') accesses.push(`subs.${sub}.list`);
  const allowed = await Promise.all(accesses.map(isAllowed));
  if (allowed.some((value) => !value)) return [];

  const parentFilter = await service.genFilter('read', { _id: parentId } as Filter<TModel>);
  if (parentFilter === false) return [];
  // The write lookup projects only `sub`; parent row policies may depend on any
  // persisted field and need MongoDB's query/casting semantics after the save.
  const parent = await service.findRawParentDoc({
    filter: { $and: [{ _id: parentId }, parentFilter] } as Filter<TModel>,
    select: '_id',
    populate: [],
    lean: true,
  });
  if (!parent) return [];

  const targetFilter =
    response === 'create'
      ? {}
      : response === 'single'
        ? { _id: rows[0]?._id }
        : { _id: { $in: rows.map((row) => row._id) } };
  const [readFilter, listFilter, select] = await Promise.all([
    service.genFilter(`subs.${sub}.read`, targetFilter as Filter<TModel>),
    response === 'create' ? service.genFilter(`subs.${sub}.list`) : Promise.resolve({}),
    service.genQuerySelect('read', null, false, [sub, 'sub']),
  ]);
  if (readFilter === false || listFilter === false) return [];

  const visible = filterCollection(filterCollection(rows, listFilter), readFilter);
  // VIRT-06: same finalizer for mutation visible rows (existing rows
  // post-save). Existing row/operation filters above run BEFORE getters; do
  // not broaden rows. Denied visibility already returned `[]` above; hidden
  // rows never reach getters. `virtualAccess` follows the initiating write
  // (`create`/`update`/`update`), while output/row visibility stays `read`
  // with owning-parent `read` grants (VIRT-00A D1/D2).
  const snapshot = (service as unknown as { captureVirtualSnapshot: () => FinalizeSnapshot }).captureVirtualSnapshot();
  if (!hasSubVirtuals(snapshot, sub)) {
    return select ? visible.map((row) => pick(toObject(row), select.concat('_id'))) : visible;
  }
  const virtualAccess: SubVirtualAccess = response === 'create' ? 'create' : 'update';
  const operation = response === 'create' ? 'subCreate' : response === 'single' ? 'subUpdate' : 'subBulkUpdate';
  const plan = buildSubPlan(
    service as unknown as Service<never>,
    sub,
    snapshot,
    virtualAccess,
    'read',
    'read',
    undefined,
  );
  const parentGrants = await getOwningParentGrants(
    service as unknown as Service<never>,
    parentId,
    parent,
    operation,
    snapshot,
    sub,
  );
  try {
    const finalized = await (
      service as unknown as {
        finalizeSubRowsWithVirtuals: (args: {
          sub: string;
          rows: unknown[];
          plan: VirtualProjectionPlan;
          snapshot: FinalizeSnapshot;
          parentGrants: Record<string, unknown>;
          virtualAccess: SubVirtualAccess;
          outputAccess: SubVirtualAccess;
          docPermissionsAccess: SubVirtualAccess;
          operation: string;
        }) => Promise<Record<string, unknown>[]>;
      }
    ).finalizeSubRowsWithVirtuals({
      sub,
      rows: visible as unknown[],
      plan,
      snapshot,
      parentGrants,
      virtualAccess,
      outputAccess: 'read',
      docPermissionsAccess: 'read',
      operation,
    });
    return finalized;
  } catch {
    // Fail-closed: omit computed output rather than leaking raw deps.
    // Preserve cardinality contract (visible count) with stripped fallback?
    // Denied post-persist visibility succeeds with `[]`; on finalizer failure
    // return legacy stripped rows so already-persisted writes never become
    // retryable errors and hidden-row contracts stay intact.
    try {
      return select ? visible.map((row) => pick(toObject(row), select.concat('_id'))) : visible;
    } catch {
      return [];
    }
  }
}

export async function listSub<TModel>(
  service: Service<TModel>,
  id: SubdocumentId,
  sub: SubdocumentName,
  options?: SubdocumentListOptions<TModel>,
): Promise<ListResult | ErrorResult> {
  const { filter: ft, select } = options ?? {};

  const filterErrors = validateClientFilter(ft as Filter<TModel>);
  if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

  const snapshot = (service as unknown as { captureVirtualSnapshot: () => FinalizeSnapshot }).captureVirtualSnapshot();
  // VIRT-06 output-only: virtual names never filter stored rows. Strip
  // sub-scope virtual keys from the client filter before row-policy
  // resolution so virtual-only filters collapse to match-all (same posture
  // as VIRT-04 service filters), never filtering on non-persisted fields.
  const strippedClientFilter = hasSubVirtuals(snapshot, sub)
    ? (stripSubVirtualKeysFromFilter(ft as Filter<TModel>, snapshot as never, sub) as Filter<TModel>)
    : (ft as Filter<TModel>);

  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'read' });
  if (!parentDoc) return { success: false, kind: 'error', code: Codes.NotFound };
  let result = get(parentDoc, sub) as Record<string, unknown>[];

  const [subFilter, subSelect] = await Promise.all([
    service.genFilter(`subs.${sub}.list`, strippedClientFilter as Filter<TModel>),
    service.genQuerySelect('list', select, false, [sub, 'sub']),
  ]);

  if (subFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden };

  result = filterCollection(result, subFilter);
  // VIRT-06: same finalizer for listSub. Row/operation filters above run
  // before getters; `.sub` never becomes a response/DB field. Omitted
  // containers cannot leak: planner skips child work when the container is
  // not selected, fetch retains only needed DB paths, finalizer strips
  // child deps per child output plan.
  if (!hasSubVirtuals(snapshot, sub)) {
    if (subSelect) result = result.map((v) => pick(toObject(v), subSelect.concat('_id')));
    return { success: true, kind: 'list', code: Codes.Success, data: result, count: result.length };
  }
  const plan = buildSubPlan(
    service as unknown as Service<never>,
    sub,
    snapshot,
    'list',
    'list',
    'read',
    (select ?? undefined) as string[] | undefined,
  );
  const parentGrants = await getOwningParentGrants(
    service as unknown as Service<never>,
    id,
    parentDoc,
    'subList',
    snapshot,
    sub,
  );
  try {
    const finalized = await (
      service as unknown as {
        finalizeSubRowsWithVirtuals: (args: {
          sub: string;
          rows: unknown[];
          plan: VirtualProjectionPlan;
          snapshot: FinalizeSnapshot;
          parentGrants: Record<string, unknown>;
          virtualAccess: SubVirtualAccess;
          outputAccess: SubVirtualAccess;
          docPermissionsAccess: SubVirtualAccess;
          operation: string;
        }) => Promise<Record<string, unknown>[]>;
      }
    ).finalizeSubRowsWithVirtuals({
      sub,
      rows: result as unknown[],
      plan,
      snapshot,
      parentGrants,
      virtualAccess: 'list',
      outputAccess: 'list',
      docPermissionsAccess: 'read',
      operation: 'subList',
    });
    return { success: true, kind: 'list', code: Codes.Success, data: finalized, count: finalized.length };
  } catch {
    // Fail-closed without changing denial contracts (Forbidden/NotFound
    // above already returned). On finalizer failure, fall back to legacy
    // stripped rows so list denial semantics stay intact.
    if (subSelect) result = result.map((v) => pick(toObject(v), subSelect.concat('_id')));
    return { success: true, kind: 'list', code: Codes.Success, data: result, count: result.length };
  }
}

export async function readSub<TModel>(
  service: Service<TModel>,
  id: SubdocumentId,
  sub: SubdocumentName,
  subId: SubdocumentId,
  options?: SubdocumentReadOptions,
): Promise<SingleResult | ErrorResult> {
  const { select, populate } = options ?? {};

  const snapshot = (service as unknown as { captureVirtualSnapshot: () => FinalizeSnapshot }).captureVirtualSnapshot();
  const parentDoc = await getParentDoc(service, id, sub, { populate }, { access: 'read' });
  if (!parentDoc) return { success: false, kind: 'error', code: Codes.NotFound };
  const result = get(parentDoc, sub) as Record<string, unknown>[];

  const [subFilter, subSelect] = await Promise.all([
    service.genFilter(`subs.${sub}.read`, { _id: subId } as Filter<TModel>),
    service.genQuerySelect('read', select, false, [sub, 'sub']),
  ]);

  if (subFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden };

  let subdoc = findElement(result, subFilter) as Record<string, unknown> | undefined;
  if (!subdoc) return { success: false, kind: 'error', code: Codes.NotFound };

  // VIRT-06: same finalizer for readSub, incl sub-populate via VIRT-05 path.
  // Row/operation filters above run before getters; hidden rows never reach
  // getters (NotFound/Forbidden above preserved).
  if (!hasSubVirtuals(snapshot, sub)) {
    // Preserve legacy sub-populate behavior (no virtuals): Mongoose already
    // populated via getParentDoc; target trimming stays as before (no
    // virtual finalizer when no sub virtuals to avoid behavior change).
    // Still finalize populate targets when virtuals exist on targets? When
    // no sub virtuals, keep exact legacy output (pick only).
    if (subSelect) subdoc = pick(toObject(subdoc), subSelect.concat(['_id']));
    return { success: true, kind: 'single', code: Codes.Success, data: subdoc };
  }
  // Sub-populate: finalize actual targets with their own plans before sub
  // getters (VIRT-05 target path, dotted through embedded arrays supported).
  // Parent-level dotted finalization handles `sub.<path>`; sub getters then
  // see finalized related values, never raw deps.
  try {
    const svc = service as unknown as {
      genPopulate: (access: string, populate: unknown, subPaths?: string[]) => Promise<never[]>;
      finalizePopulateForSubParent: (parentDoc: unknown, entries: never[], operation: string) => Promise<void>;
    };
    if (populate && (Array.isArray(populate) ? populate.length > 0 : true)) {
      try {
        const entries = await svc.genPopulate('read', genSubPopulate(sub, populate), [sub, 'sub']);
        if (Array.isArray(entries) && entries.length > 0) {
          await svc.finalizePopulateForSubParent(parentDoc, entries, 'subRead');
          // Re-resolve subdoc after populate finalization replaced targets.
          const refreshed = get(parentDoc, sub) as Record<string, unknown>[];
          const next = findElement(refreshed, subFilter) as Record<string, unknown> | undefined;
          if (!next) return { success: false, kind: 'error', code: Codes.NotFound };
          subdoc = next;
        }
      } catch {
        // Populate admission failures already handled via genPopulate inside
        // getParentDoc (denied/unknown stays scalar). Finalization failures
        // must not broaden rows: keep raw subdoc for sub finalization.
      }
    }
  } catch {
    // never break read on populate-finalization bookkeeping
  }
  const plan = buildSubPlan(
    service as unknown as Service<never>,
    sub,
    snapshot,
    'read',
    'read',
    'read',
    (select ?? undefined) as string[] | undefined,
  );
  const parentGrants = await getOwningParentGrants(
    service as unknown as Service<never>,
    id,
    parentDoc,
    'subRead',
    snapshot,
    sub,
  );
  try {
    const finalized = await (
      service as unknown as {
        finalizeSingleSubRowWithVirtuals: (args: {
          sub: string;
          row: unknown;
          plan: VirtualProjectionPlan;
          snapshot: FinalizeSnapshot;
          parentGrants: Record<string, unknown>;
          virtualAccess: SubVirtualAccess;
          outputAccess: SubVirtualAccess;
          docPermissionsAccess: SubVirtualAccess;
          operation: string;
        }) => Promise<Record<string, unknown> | null>;
      }
    ).finalizeSingleSubRowWithVirtuals({
      sub,
      row: subdoc as unknown,
      plan,
      snapshot,
      parentGrants,
      virtualAccess: 'read',
      outputAccess: 'read',
      docPermissionsAccess: 'read',
      operation: 'subRead',
    });
    if (!finalized) return { success: false, kind: 'error', code: Codes.NotFound };
    return { success: true, kind: 'single', code: Codes.Success, data: finalized };
  } catch {
    if (subSelect) subdoc = pick(toObject(subdoc), subSelect.concat(['_id']));
    return { success: true, kind: 'single', code: Codes.Success, data: subdoc };
  }
}

export async function updateSub<TModel>(
  service: Service<TModel>,
  persist: Persist,
  isAllowed: IsOperationAllowed,
  id: SubdocumentId,
  sub: SubdocumentName,
  subId: SubdocumentId,
  data: Record<string, unknown>,
): Promise<SingleResult | ErrorResult> {
  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parentDoc) return { success: false, kind: 'error', code: Codes.NotFound };
  const result = get(parentDoc, sub) as Record<string, unknown>[];

  const [subFilter, subUpdateSelect] = await Promise.all([
    service.genFilter(`subs.${sub}.update`, { _id: subId } as Filter<TModel>),
    service.genQuerySelect('update', null, false, [sub, 'sub']),
  ]);

  if (subFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden };

  const subdoc = findElement(result, subFilter) as Record<string, unknown> | undefined;
  if (!subdoc) return { success: false, kind: 'error', code: Codes.NotFound };

  // VIRT-06 output-only write admission: registered embedded virtuals stay
  // virtual even when no getter applies. `genQuerySelect` already excludes
  // them from `subUpdateSelect`; sanitize Mixed/whole-object payloads at the
  // sub scope as well (e.g. `{ meta: { nick: 'evil' } }` where `nick` is
  // `sub.sub.nick`). Writes stay separate from computed output copies
  // (finalizer isolates); no independent model mutation hooks.
  const snapshotForWrite = (
    service as unknown as { captureVirtualSnapshot: () => FinalizeSnapshot }
  ).captureVirtualSnapshot();
  const picked = pick(data, subUpdateSelect) as Record<string, unknown>;
  const allowedData = sanitizeSubScopeVirtualKeys(picked, snapshotForWrite as never, sub) as Record<string, unknown>;
  applyUpdate(subdoc, allowedData, subUpdateSelect);

  await persist(() => parentDoc.save());
  const visible = await visibleMutationRows(service, isAllowed, parentDoc._id, sub, [subdoc], 'single');
  return { success: true, kind: 'single', code: Codes.Success, data: visible[0] ?? null };
}

export async function bulkUpdateSub<TModel>(
  service: Service<TModel>,
  persist: Persist,
  isAllowed: IsOperationAllowed,
  id: SubdocumentId,
  sub: SubdocumentName,
  data: SubdocumentBulkUpdateInput,
): Promise<ListResult | ErrorResult> {
  const { maxBulkItems } = service.getRequestComplexity();
  if (data.length > maxBulkItems) {
    return {
      success: false,
      kind: 'error',
      code: Codes.BadRequest,
      errors: [{ detail: `Bulk subdocument update exceeds maximum item count of ${maxBulkItems}` }],
    };
  }

  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parentDoc) return { success: false, kind: 'error', code: Codes.NotFound };
  let result = get(parentDoc, sub) as SubdocumentBulkRecord[];

  const [subFilter, subUpdateSelect] = await Promise.all([
    service.genFilter(`subs.${sub}.update`, { _id: { $in: data.map((v) => v._id) } } as Filter<TModel>),
    service.genQuerySelect('update', null, false, [sub, 'sub']),
  ]);

  if (subFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden };

  // A trusted override may replace the ID predicate, but only payload targets
  // are updated and eligible for this targeted mutation response.
  result = filterCollection(result, subFilter).filter((subdoc) => findElementById(data, subdoc._id as string));
  const snapshotForWrite = (
    service as unknown as { captureVirtualSnapshot: () => FinalizeSnapshot }
  ).captureVirtualSnapshot();
  forEach(result, (subdoc: SubdocumentBulkRecord) => {
    const tdata = findElementById(data, subdoc._id as string);
    if (!tdata) return;

    // VIRT-06 output-only: strip sub-scope virtuals inside Mixed/whole-object
    // payloads (same scope-aware sanitizer as single update).
    const picked = pick(tdata as object, subUpdateSelect) as Record<string, unknown>;
    const allowedData = sanitizeSubScopeVirtualKeys(picked, snapshotForWrite as never, sub) as Record<string, unknown>;
    applyUpdate(subdoc, allowedData, subUpdateSelect);
  });

  await persist(() => parentDoc.save());
  result = await visibleMutationRows(service, isAllowed, parentDoc._id, sub, result, 'bulk');
  return { success: true, kind: 'list', code: Codes.Success, data: result, count: result.length };
}

export async function createSub<TModel>(
  service: Service<TModel>,
  persist: Persist,
  isAllowed: IsOperationAllowed,
  id: SubdocumentId,
  sub: SubdocumentName,
  data: SubdocumentCreateInput,
  options?: SubdocumentCreateOptions,
): Promise<ListResult | ErrorResult> {
  const { addFirst } = options ?? {};
  const { maxBulkItems } = service.getRequestComplexity();

  if (Array.isArray(data) && data.length > maxBulkItems) {
    return {
      success: false,
      kind: 'error',
      code: Codes.BadRequest,
      errors: [{ detail: `Bulk subdocument create exceeds maximum item count of ${maxBulkItems}` }],
    };
  }

  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parentDoc) return { success: false, kind: 'error', code: Codes.NotFound };
  let result = get(parentDoc, sub) as Record<string, unknown>[];

  const subCreateSelect = await service.genQuerySelect('create', null, false, [sub, 'sub']);

  // VIRT-06 output-only: `genQuerySelect` already excludes registered
  // embedded virtuals from `subCreateSelect`; sanitize Mixed/whole-object
  // payloads at the sub scope as well. Writes stay separate from computed
  // output copies.
  const snapshotForWrite = (
    service as unknown as { captureVirtualSnapshot: () => FinalizeSnapshot }
  ).captureVirtualSnapshot();
  const sanitizeRow = (row: SubdocumentRecord): SubdocumentRecord => {
    const picked = pick(row as Record<string, unknown>, subCreateSelect) as Record<string, unknown>;
    return sanitizeSubScopeVirtualKeys(picked, snapshotForWrite as never, sub) as SubdocumentRecord;
  };
  const allowedData = Array.isArray(data)
    ? data.map((row) => sanitizeRow(row as SubdocumentRecord))
    : sanitizeRow(data as SubdocumentRecord);
  if (Array.isArray(allowedData)) {
    addFirst === true ? result.unshift(...allowedData) : result.push(...allowedData);
  } else {
    addFirst === true ? result.unshift(allowedData) : result.push(allowedData);
  }

  await persist(() => parentDoc.save());
  result = await visibleMutationRows(service, isAllowed, parentDoc._id, sub, result, 'create');
  return { success: true, kind: 'list', code: Codes.Created, data: result, count: result.length };
}

export async function deleteSub<TModel>(
  service: Service<TModel>,
  persist: Persist,
  id: SubdocumentId,
  sub: SubdocumentName,
  subId: SubdocumentId,
): Promise<SingleResult | ErrorResult> {
  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parentDoc) return { success: false, kind: 'error', code: Codes.NotFound };
  const result = get(parentDoc, sub) as Array<
    Record<string, unknown> & { _id?: unknown; deleteOne?: () => Promise<unknown>; remove?: () => Promise<unknown> }
  >;

  const subFilter = await service.genFilter(`subs.${sub}.delete`, { _id: subId } as Filter<TModel>);
  if (subFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden };

  const subdoc = findElement(result, subFilter) as
    | (Record<string, unknown> & {
        _id?: unknown;
        deleteOne?: () => Promise<unknown>;
        remove?: () => Promise<unknown>;
      })
    | undefined;
  if (!subdoc) return { success: false, kind: 'error', code: Codes.NotFound };

  await ('deleteOne' in subdoc ? subdoc.deleteOne?.() : subdoc.remove?.());
  await persist(() => parentDoc.save());
  return { success: true, kind: 'single', code: Codes.Success, data: subdoc._id };
}

export async function getParentDoc<TModel>(
  service: Service<TModel>,
  id: SubdocumentId,
  sub: SubdocumentName,
  args?: SubdocumentParentArgs,
  options?: SubdocumentParentOptions,
) {
  const { populate } = args ?? {};
  const { access = 'read', lean = false } = options ?? {};

  const parentFilter = await service.genFilter(access, await service.genIDFilter(id));

  if (parentFilter === false) return null;
  const subPopulate = await service.genPopulate('read', genSubPopulate(sub, populate), [sub, 'sub']);
  return service.findRawParentDoc({ filter: parentFilter, select: sub, populate: subPopulate, lean });
}
