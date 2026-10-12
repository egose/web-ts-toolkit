import { get, pick } from '@web-ts-toolkit/utils';
import { filterCollection, findElement, findElementById, genSubPopulate } from '../helpers';
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
import { assertPublicAdmission, PublicAdmissionError } from '../validation/public-admission';
import { sanitizeSubScopeVirtualKeys, stripSubVirtualKeysFromFilter, validateClientFilter } from './base';
import type { Service } from './service';
import {
  copySubdocumentParent,
  finalizeSubdocumentRows,
  prepareSubdocumentOutput,
  prepareSubdocumentPopulate,
} from '../acl/subdocument-output';

type IsOperationAllowed = (access: string) => Promise<boolean>;
type Persist = <T>(operation: () => T | PromiseLike<T>) => Promise<T>;

/** Input admission deliberately uses the existing persisted request-field evaluator. */
function subdocumentInputFields<T>(service: Service<T>, sub: string, access: 'create' | 'update') {
  return service.genQuerySelect(access, null, false, [sub, 'sub']);
}

// Keep the raw parent (including hook inputs) separate from all output copies.
// Parent visibility is rechecked after persistence using Mongo query semantics.
async function visibleMutationRows<T>(
  service: Service<T>,
  isAllowed: IsOperationAllowed,
  parentId: unknown,
  sub: SubdocumentName,
  rows: Record<string, unknown>[],
  response: 'create' | 'single' | 'bulk',
): Promise<Record<string, unknown>[]> {
  const accesses = ['read', `subs.${sub}.read`];
  if (response === 'create') accesses.push(`subs.${sub}.list`);
  if ((await Promise.all(accesses.map(isAllowed))).some((allowed) => !allowed)) return [];
  const operation = response === 'create' ? 'subCreate' : response === 'single' ? 'subUpdate' : 'subBulkUpdate';
  const prepared = prepareSubdocumentOutput(
    service,
    sub,
    operation,
    response === 'create' ? 'create' : 'update',
    'read',
  );
  const parentFilter = await service.genFilter('read', { _id: parentId } as Filter<T>);
  if (parentFilter === false) return [];
  const parent = await service.findRawParentDoc({
    filter: { $and: [{ _id: parentId }, parentFilter] } as Filter<T>,
    select: '',
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
  const [readFilter, listFilter] = await Promise.all([
    service.genFilter(`subs.${sub}.read`, targetFilter as Filter<T>),
    response === 'create' ? service.genFilter(`subs.${sub}.list`) : Promise.resolve({}),
  ]);
  if (readFilter === false || listFilter === false) return [];
  const visible = filterCollection(filterCollection(rows, listFilter), readFilter);
  try {
    return await finalizeSubdocumentRows(service, prepared, parent, visible);
  } catch {
    // The write already succeeded. Never retry it or fall back to raw output.
    return [];
  }
}

export async function listSub<T>(
  service: Service<T>,
  id: SubdocumentId,
  sub: SubdocumentName,
  options?: SubdocumentListOptions<T>,
): Promise<ListResult | ErrorResult> {
  try {
    assertPublicAdmission(options);
  } catch (error) {
    if (error instanceof PublicAdmissionError) return error.result;
    throw error;
  }
  const { filter, select } = options ?? {};
  const errors = validateClientFilter(filter as Filter<T>);
  if (errors.length) return { success: false, kind: 'error', code: Codes.BadRequest, errors };
  const prepared = prepareSubdocumentOutput(service, sub, 'subList', 'list', 'list', select);
  const stripped = stripSubVirtualKeysFromFilter(filter as Filter<T>, service.captureVirtualSnapshot(), sub);
  const parent = await getParentDoc(service, id, sub, null, { access: 'read' });
  if (!parent) return { success: false, kind: 'error', code: Codes.NotFound };
  const subFilter = await service.genFilter(`subs.${sub}.list`, stripped as Filter<T>);
  if (subFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden };
  const rows = filterCollection(get(parent, sub) as Record<string, unknown>[], subFilter);
  const data = await finalizeSubdocumentRows(service, prepared, parent, rows);
  return { success: true, kind: 'list', code: Codes.Success, data, count: data.length };
}

export async function readSub<T>(
  service: Service<T>,
  id: SubdocumentId,
  sub: SubdocumentName,
  subId: SubdocumentId,
  options?: SubdocumentReadOptions,
): Promise<SingleResult | ErrorResult> {
  try {
    assertPublicAdmission(options);
  } catch (error) {
    if (error instanceof PublicAdmissionError) return error.result;
    throw error;
  }
  const { select, populate } = options ?? {};
  const prepared = prepareSubdocumentOutput(
    service,
    sub,
    'subRead',
    'read',
    'read',
    select,
    genSubPopulate(sub, populate),
  );
  const parentFilter = await service.genFilter('read', await service.genIDFilter(id));
  if (parentFilter === false) return { success: false, kind: 'error', code: Codes.NotFound };
  const subFilter = await service.genFilter(`subs.${sub}.read`, { _id: subId } as Filter<T>);
  if (subFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden };
  const entries = await prepareSubdocumentPopulate(service, prepared);
  const parent = await service.findRawParentDoc({ filter: parentFilter, select: '', populate: entries, lean: false });
  if (!parent) return { success: false, kind: 'error', code: Codes.NotFound };
  const outputParent = copySubdocumentParent(parent);
  const row = findElement(get(outputParent, sub) as Record<string, unknown>[], subFilter);
  if (!row) return { success: false, kind: 'error', code: Codes.NotFound };
  // Only the visible row reaches target finalizers/getters. Retain the exact
  // request-mode plans used for fetching; never regenerate target authority.
  await service.finalizePopulateForSubParent({ [sub]: [row] }, entries, 'subRead');
  const data = await finalizeSubdocumentRows(service, prepared, parent, [row]);
  return { success: true, kind: 'single', code: Codes.Success, data: data[0] ?? null };
}

export async function updateSub<T>(
  service: Service<T>,
  persist: Persist,
  isAllowed: IsOperationAllowed,
  id: SubdocumentId,
  sub: SubdocumentName,
  subId: SubdocumentId,
  data: Record<string, unknown>,
): Promise<SingleResult | ErrorResult> {
  const parent = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parent) return { success: false, kind: 'error', code: Codes.NotFound };
  const [filter, fields] = await Promise.all([
    service.genFilter(`subs.${sub}.update`, { _id: subId } as Filter<T>),
    subdocumentInputFields(service, sub, 'update'),
  ]);
  if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden };
  const row = findElement(get(parent, sub) as Record<string, unknown>[], filter);
  if (!row) return { success: false, kind: 'error', code: Codes.NotFound };
  const allowed = sanitizeSubScopeVirtualKeys(pick(data, fields), service.captureVirtualSnapshot(), sub);
  applyUpdate(row, allowed, fields);
  await persist(() => parent.save());
  const visible = await visibleMutationRows(service, isAllowed, parent._id, sub, [row], 'single');
  return { success: true, kind: 'single', code: Codes.Success, data: visible[0] ?? null };
}

export async function bulkUpdateSub<T>(
  service: Service<T>,
  persist: Persist,
  isAllowed: IsOperationAllowed,
  id: SubdocumentId,
  sub: SubdocumentName,
  data: SubdocumentBulkUpdateInput,
): Promise<ListResult | ErrorResult> {
  const { maxBulkItems } = service.getRequestComplexity();
  if (data.length > maxBulkItems)
    return {
      success: false,
      kind: 'error',
      code: Codes.BadRequest,
      errors: [{ detail: `Bulk subdocument update exceeds maximum item count of ${maxBulkItems}` }],
    };
  const parent = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parent) return { success: false, kind: 'error', code: Codes.NotFound };
  const [filter, fields] = await Promise.all([
    service.genFilter(`subs.${sub}.update`, { _id: { $in: data.map((row) => row._id) } } as Filter<T>),
    subdocumentInputFields(service, sub, 'update'),
  ]);
  if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden };
  const rows = filterCollection(get(parent, sub) as SubdocumentBulkRecord[], filter).filter((row) =>
    findElementById(data, row._id as string),
  );
  const snapshot = service.captureVirtualSnapshot();
  for (const row of rows) {
    const input = findElementById(data, row._id as string);
    if (input) applyUpdate(row, sanitizeSubScopeVirtualKeys(pick(input as object, fields), snapshot, sub), fields);
  }
  await persist(() => parent.save());
  const visible = await visibleMutationRows(service, isAllowed, parent._id, sub, rows, 'bulk');
  return { success: true, kind: 'list', code: Codes.Success, data: visible, count: visible.length };
}

export async function createSub<T>(
  service: Service<T>,
  persist: Persist,
  isAllowed: IsOperationAllowed,
  id: SubdocumentId,
  sub: SubdocumentName,
  data: SubdocumentCreateInput,
  options?: SubdocumentCreateOptions,
): Promise<ListResult | ErrorResult> {
  try {
    assertPublicAdmission(options);
  } catch (error) {
    if (error instanceof PublicAdmissionError) return error.result;
    throw error;
  }
  const { maxBulkItems } = service.getRequestComplexity();
  if (Array.isArray(data) && data.length > maxBulkItems)
    return {
      success: false,
      kind: 'error',
      code: Codes.BadRequest,
      errors: [{ detail: `Bulk subdocument create exceeds maximum item count of ${maxBulkItems}` }],
    };
  const parent = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parent) return { success: false, kind: 'error', code: Codes.NotFound };
  const rows = get(parent, sub) as Record<string, unknown>[];
  const fields = await subdocumentInputFields(service, sub, 'create');
  const snapshot = service.captureVirtualSnapshot();
  const sanitize = (row: SubdocumentRecord) =>
    sanitizeSubScopeVirtualKeys(pick(row as Record<string, unknown>, fields), snapshot, sub);
  const allowed = Array.isArray(data) ? data.map(sanitize) : [sanitize(data as SubdocumentRecord)];
  if (options?.addFirst) rows.unshift(...allowed);
  else rows.push(...allowed);
  await persist(() => parent.save());
  const visible = await visibleMutationRows(service, isAllowed, parent._id, sub, rows, 'create');
  return { success: true, kind: 'list', code: Codes.Created, data: visible, count: visible.length };
}

export async function deleteSub<T>(
  service: Service<T>,
  persist: Persist,
  id: SubdocumentId,
  sub: SubdocumentName,
  subId: SubdocumentId,
): Promise<SingleResult | ErrorResult> {
  const parent = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parent) return { success: false, kind: 'error', code: Codes.NotFound };
  const filter = await service.genFilter(`subs.${sub}.delete`, { _id: subId } as Filter<T>);
  if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden };
  const row = findElement(get(parent, sub) as Record<string, unknown>[], filter) as
    | { _id: unknown; deleteOne?: () => Promise<unknown>; remove?: () => Promise<unknown> }
    | undefined;
  if (!row) return { success: false, kind: 'error', code: Codes.NotFound };
  await ('deleteOne' in row ? row.deleteOne?.() : row.remove?.());
  await persist(() => parent.save());
  return { success: true, kind: 'single', code: Codes.Success, data: row._id };
}

export async function getParentDoc<T>(
  service: Service<T>,
  id: SubdocumentId,
  sub: SubdocumentName,
  args?: SubdocumentParentArgs,
  options?: SubdocumentParentOptions,
) {
  const { access = 'read', lean = false } = options ?? {};
  const filter = await service.genFilter(access, await service.genIDFilter(id));
  if (filter === false) return null;
  const populate = await service.genPopulate('read', genSubPopulate(sub, args?.populate), [sub, 'sub']);
  return service.findRawParentDoc({ filter, select: access === 'read' ? '' : sub, populate, lean });
}
