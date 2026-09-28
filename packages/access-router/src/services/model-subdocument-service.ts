import { forEach, get, pick } from '@web-ts-toolkit/utils';
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
import { validateClientFilter } from './base';
import type { Service } from './service';

type IsOperationAllowed = (access: string) => Promise<boolean>;
type Persist = <T>(operation: () => T | PromiseLike<T>) => Promise<T>;

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
  return select ? visible.map((row) => pick(toObject(row), select.concat('_id'))) : visible;
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

  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'read' });
  if (!parentDoc) return { success: false, kind: 'error', code: Codes.NotFound };
  let result = get(parentDoc, sub) as Record<string, unknown>[];

  const [subFilter, subSelect] = await Promise.all([
    service.genFilter(`subs.${sub}.list`, ft as Filter<TModel>),
    service.genQuerySelect('list', select, false, [sub, 'sub']),
  ]);

  if (subFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden };

  result = filterCollection(result, subFilter);
  if (subSelect) result = result.map((v) => pick(toObject(v), subSelect.concat('_id')));

  return { success: true, kind: 'list', code: Codes.Success, data: result, count: result.length };
}

export async function readSub<TModel>(
  service: Service<TModel>,
  id: SubdocumentId,
  sub: SubdocumentName,
  subId: SubdocumentId,
  options?: SubdocumentReadOptions,
): Promise<SingleResult | ErrorResult> {
  const { select, populate } = options ?? {};

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

  if (subSelect) subdoc = pick(toObject(subdoc), subSelect.concat(['_id']));
  return { success: true, kind: 'single', code: Codes.Success, data: subdoc };
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

  const allowedData = pick(data, subUpdateSelect);
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
  forEach(result, (subdoc: SubdocumentBulkRecord) => {
    const tdata = findElementById(data, subdoc._id as string);
    if (!tdata) return;

    const allowedData = pick(tdata as object, subUpdateSelect);
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

  const allowedData = Array.isArray(data)
    ? data.map((row) => pick(row as SubdocumentRecord, subCreateSelect))
    : pick(data as SubdocumentRecord, subCreateSelect);
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
