import { forEach, get, pick } from '@web-ts-toolkit/utils';
import { filterCollection, findElement, findElementById, genSubPopulate, toObject } from '../helpers';
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
  id: SubdocumentId,
  sub: SubdocumentName,
  subId: SubdocumentId,
  data: Record<string, unknown>,
): Promise<SingleResult | ErrorResult> {
  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parentDoc) return { success: false, kind: 'error', code: Codes.NotFound };
  const result = get(parentDoc, sub) as Record<string, unknown>[];

  const [subFilter, subReadSelect, subUpdateSelect] = await Promise.all([
    service.genFilter(`subs.${sub}.update`, { _id: subId } as Filter<TModel>),
    service.genQuerySelect('read', null, false, [sub, 'sub']),
    service.genQuerySelect('update', null, false, [sub, 'sub']),
  ]);

  if (subFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden };

  let subdoc = findElement(result, subFilter) as Record<string, unknown> | undefined;
  if (!subdoc) return { success: false, kind: 'error', code: Codes.NotFound };

  const allowedData = pick(data, subUpdateSelect);
  Object.assign(subdoc, allowedData);

  await parentDoc.save();
  if (subReadSelect) subdoc = pick(toObject(subdoc), subReadSelect.concat(['_id']));
  return { success: true, kind: 'single', code: Codes.Success, data: subdoc };
}

export async function bulkUpdateSub<TModel>(
  service: Service<TModel>,
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

  const [subFilter, subReadSelect, subUpdateSelect] = await Promise.all([
    service.genFilter(`subs.${sub}.update`, { _id: { $in: data.map((v) => v._id) } } as Filter<TModel>),
    service.genQuerySelect('read', null, false, [sub, 'sub']),
    service.genQuerySelect('update', null, false, [sub, 'sub']),
  ]);

  if (subFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden };

  result = filterCollection(result, subFilter);
  forEach(result, (subdoc: SubdocumentBulkRecord) => {
    const tdata = findElementById(data, subdoc._id as string);
    if (!tdata) return;

    const allowedData = pick(tdata as object, subUpdateSelect);
    Object.assign(subdoc, allowedData);
  });

  await parentDoc.save();
  if (subReadSelect) result = result.map((v) => pick(toObject(v), subReadSelect.concat(['_id'])));
  return { success: true, kind: 'list', code: Codes.Success, data: result, count: result.length };
}

export async function createSub<TModel>(
  service: Service<TModel>,
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

  const [subCreateSelect, subReadSelect] = await Promise.all([
    service.genQuerySelect('create', null, false, [sub, 'sub']),
    service.genQuerySelect('read', null, false, [sub, 'sub']),
  ]);

  const allowedData = Array.isArray(data)
    ? data.map((row) => pick(row as SubdocumentRecord, subCreateSelect))
    : pick(data as SubdocumentRecord, subCreateSelect);
  if (Array.isArray(allowedData)) {
    addFirst === true ? result.unshift(...allowedData) : result.push(...allowedData);
  } else {
    addFirst === true ? result.unshift(allowedData) : result.push(allowedData);
  }

  await parentDoc.save();
  if (subReadSelect) result = result.map((v) => pick(toObject(v), subReadSelect.concat(['_id'])));
  return { success: true, kind: 'list', code: Codes.Created, data: result, count: result.length };
}

export async function deleteSub<TModel>(
  service: Service<TModel>,
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
  await parentDoc.save();
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
  return service.findRawParentDoc({ filter: parentFilter, select: sub, populate: genSubPopulate(sub, populate), lean });
}
