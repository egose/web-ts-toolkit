import { forEach, get, pick } from '@web-ts-toolkit/utils';
import { filterCollection, findElement, findElementById, genSubPopulate, toObject } from '../helpers';
import type { BaseFilterAccess, ErrorResult, Filter, ListResult, SingleResult, SubPopulate } from '../interfaces';
import { Codes } from '../enums';
import type { Service } from './service';

export async function listSub<TModel>(
  service: Service<TModel>,
  id,
  sub,
  options?: { filter: Filter; select: string[] },
): Promise<ListResult | ErrorResult> {
  const { filter: ft, select } = options ?? {};

  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'read' });
  if (!parentDoc) return { success: false, code: Codes.NotFound };
  let result = get(parentDoc, sub) as Record<string, unknown>[];

  const [subFilter, subSelect] = await Promise.all([
    service.genFilter(`subs.${sub}.list`, ft as Filter<TModel>),
    service.genQuerySelect('list', select, false, [sub, 'sub']),
  ]);

  if (subFilter === false) return { success: false, code: Codes.Forbidden };

  result = filterCollection(result, subFilter);
  if (subSelect) result = result.map((v) => pick(toObject(v), subSelect.concat('_id')));

  return { success: true, kind: 'list', code: Codes.Success, data: result, count: result.length };
}

export async function readSub<TModel>(
  service: Service<TModel>,
  id,
  sub,
  subId,
  options?: { select: string[]; populate: SubPopulate | SubPopulate[] },
): Promise<SingleResult | ErrorResult> {
  const { select, populate } = options ?? {};

  const parentDoc = await getParentDoc(service, id, sub, { populate }, { access: 'read' });
  if (!parentDoc) return { success: false, code: Codes.NotFound };
  const result = get(parentDoc, sub) as Record<string, unknown>[];

  const [subFilter, subSelect] = await Promise.all([
    service.genFilter(`subs.${sub}.read`, { _id: subId }),
    service.genQuerySelect('read', select, false, [sub, 'sub']),
  ]);

  if (subFilter === false) return { success: false, code: Codes.Forbidden };

  let subdoc = findElement(result, subFilter) as Record<string, unknown> | undefined;
  if (!subdoc) return { success: false, code: Codes.NotFound };

  if (subSelect) subdoc = pick(toObject(subdoc), subSelect.concat(['_id']));
  return { success: true, kind: 'single', code: Codes.Success, data: subdoc };
}

export async function updateSub<TModel>(
  service: Service<TModel>,
  id,
  sub,
  subId,
  data,
): Promise<SingleResult | ErrorResult> {
  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parentDoc) return { success: false, code: Codes.NotFound };
  const result = get(parentDoc, sub) as Record<string, unknown>[];

  const [subFilter, subReadSelect, subUpdateSelect] = await Promise.all([
    service.genFilter(`subs.${sub}.update`, { _id: subId }),
    service.genQuerySelect('read', null, false, [sub, 'sub']),
    service.genQuerySelect('update', null, false, [sub, 'sub']),
  ]);

  if (subFilter === false) return { success: false, code: Codes.Forbidden };

  let subdoc = findElement(result, subFilter) as Record<string, unknown> | undefined;
  if (!subdoc) return { success: false, code: Codes.NotFound };

  const allowedData = pick(data, subUpdateSelect);
  Object.assign(subdoc, allowedData);

  await parentDoc.save();
  if (subReadSelect) subdoc = pick(toObject(subdoc), subReadSelect.concat(['_id']));
  return { success: true, kind: 'single', code: Codes.Success, data: subdoc };
}

export async function bulkUpdateSub<TModel>(
  service: Service<TModel>,
  id,
  sub,
  data,
): Promise<ListResult | ErrorResult> {
  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parentDoc) return { success: false, code: Codes.NotFound };
  let result = get(parentDoc, sub) as Array<Record<string, unknown> & { _id?: unknown }>;

  const [subFilter, subReadSelect, subUpdateSelect] = await Promise.all([
    service.genFilter(`subs.${sub}.update`, { _id: { $in: data.map((v) => v._id) } }),
    service.genQuerySelect('read', null, false, [sub, 'sub']),
    service.genQuerySelect('update', null, false, [sub, 'sub']),
  ]);

  if (subFilter === false) return { success: false, code: Codes.Forbidden };

  result = filterCollection(result, subFilter);
  forEach(result, (subdoc: Record<string, unknown> & { _id?: unknown }) => {
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
  id,
  sub,
  data,
  options?: { addFirst: boolean },
): Promise<ListResult | ErrorResult> {
  const { addFirst } = options ?? {};

  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parentDoc) return { success: false, code: Codes.NotFound };
  let result = get(parentDoc, sub) as Record<string, unknown>[];

  const [subCreateSelect, subReadSelect] = await Promise.all([
    service.genQuerySelect('create', null, false, [sub, 'sub']),
    service.genQuerySelect('read', null, false, [sub, 'sub']),
  ]);

  const allowedData = pick(data, subCreateSelect);
  addFirst === true ? result.unshift(allowedData) : result.push(allowedData);

  await parentDoc.save();
  if (subReadSelect) result = result.map((v) => pick(toObject(v), subReadSelect.concat(['_id'])));
  return { success: true, kind: 'list', code: Codes.Created, data: result, count: result.length };
}

export async function deleteSub<TModel>(service: Service<TModel>, id, sub, subId): Promise<SingleResult | ErrorResult> {
  const parentDoc = await getParentDoc(service, id, sub, null, { access: 'update' });
  if (!parentDoc) return { success: false, code: Codes.NotFound };
  const result = get(parentDoc, sub) as Array<
    Record<string, unknown> & { _id?: unknown; deleteOne?: () => Promise<unknown>; remove?: () => Promise<unknown> }
  >;

  const subFilter = await service.genFilter(`subs.${sub}.delete`, { _id: subId });
  if (subFilter === false) return { success: false, code: Codes.Forbidden };

  const subdoc = findElement(result, subFilter) as
    | (Record<string, unknown> & {
        _id?: unknown;
        deleteOne?: () => Promise<unknown>;
        remove?: () => Promise<unknown>;
      })
    | undefined;
  if (!subdoc) return { success: false, code: Codes.NotFound };

  await ('deleteOne' in subdoc ? subdoc.deleteOne?.() : subdoc.remove?.());
  await parentDoc.save();
  return { success: true, kind: 'single', code: Codes.Success, data: subdoc._id };
}

export async function getParentDoc<TModel>(
  service: Service<TModel>,
  id,
  sub,
  args?: { populate?: SubPopulate | SubPopulate[] },
  options?: { access?: BaseFilterAccess; lean?: boolean },
) {
  const { populate } = args ?? {};
  const { access = 'read', lean = false } = options ?? {};

  const parentFilter = await service.genFilter(access, await service.genIDFilter(id));

  if (parentFilter === false) return null;
  return service.model.findOne({ filter: parentFilter, select: sub, populate: genSubPopulate(sub, populate), lean });
}
