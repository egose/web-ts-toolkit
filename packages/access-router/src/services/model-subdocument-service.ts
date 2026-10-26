import { get } from '@web-ts-toolkit/utils';
import { filterCollection, findElement, findElementById, genSubPopulate } from '../helpers';
import { deepIsolateValue, isolateDocForOutput } from '../helpers/document';
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
  SubdocumentUpdateOptions,
  SubdocumentDeleteOptions,
} from '../interfaces';
import { Codes } from '../enums';
import { assertPublicAdmission, PublicAdmissionError } from '../validation/public-admission';
import { sanitizeSubScopeVirtualKeys, validateClientFilter } from './base';
import type { Service } from './service';
import {
  copySubdocumentParent,
  finalizeSubdocumentRows,
  prepareSubdocumentPopulate,
  subdocumentRequiresPopulateCapture,
} from '../acl/subdocument-output';
import {
  prepareSubdocumentCall,
  subdocumentGateAllowed,
  subdocumentInputPolicy,
  subdocumentParentFilter,
  subdocumentRows,
} from '../acl/subdocument-authorization';
import type { SubdocumentCall } from '../acl/subdocument-authorization';
import {
  admitModelInput,
  assertModelInputComplexity,
  inputFetchPaths,
  requestInputFields,
  resolveInputDocumentGrants,
} from '../acl/model-input-admission';
import { ServiceAuthorizationError } from '../acl/service-authorization';
import { intersectFilters } from '../core-shared';
import { isExecutionRowDenied } from '../acl/prepared-query';
import { getServiceExecutors } from '../acl/service-execution';

type Persist = <T>(operation: () => T | PromiseLike<T>) => Promise<T>;
const denied = (code: ErrorResult['code'] = Codes.Forbidden): ErrorResult => ({ success: false, kind: 'error', code });
const invalid = (detail: string): ErrorResult => ({ ...denied(Codes.BadRequest), errors: [{ detail }] });

async function result<R>(run: () => Promise<R>): Promise<R | ErrorResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ServiceAuthorizationError || error instanceof PublicAdmissionError) return error.result;
    throw error;
  }
}

async function initialGates<T, V extends object>(service: Service<T, V>, call: SubdocumentCall): Promise<boolean> {
  // No new blanket guard on the historical route-owned initiating path.
  return (
    !call.scoped ||
    ((await subdocumentGateAllowed(service, call.parent)) && (await subdocumentGateAllowed(service, call.child)))
  );
}

async function initialDenial<T, V extends object>(
  service: Service<T, V>,
  call: SubdocumentCall,
): Promise<ErrorResult | undefined> {
  if (isExecutionRowDenied(service, call.parent.execution)) return denied(Codes.NotFound);
  if (isExecutionRowDenied(service, call.child.execution)) return denied();
  if (!(await initialGates(service, call))) return denied();
}

function parentSelection<T, V extends object>(service: Service<T, V>, call: SubdocumentCall): string {
  const input = inputFetchPaths(subdocumentInputPolicy(service, call).configuration.catalog);
  // Identity retention is private fetch authority, not an output/input field grant.
  return [...new Set(['_id', `${call.sub}._id`, ...input])].map((path) => `+${path}`).join(' ');
}

async function mutationParent<T, V extends object>(
  service: Service<T, V>,
  id: string,
  call: SubdocumentCall,
): Promise<{ parent: any } | { error: ErrorResult }> {
  const filter = await subdocumentParentFilter(service, call.parent, id);
  if (filter === false) return { error: denied(Codes.NotFound) };
  const parent = await service.findRawParentDoc({
    filter,
    select: parentSelection(service, call),
    populate: [],
  });
  return parent ? { parent } : { error: denied(Codes.NotFound) };
}

/** Pre-write grants belong to the original owning parent, never a child or output DTO. */
async function inputAdmission<T, V extends object>(service: Service<T, V>, call: SubdocumentCall, parent: unknown) {
  const state = subdocumentInputPolicy(service, call);
  const grants =
    call.method === 'create'
      ? {}
      : await resolveInputDocumentGrants({
          ...state,
          doc: parent,
          context: {
            modelName: state.binding.modelName,
            mongooseModel: state.binding.model as never,
            operation: state.access.operation,
          },
        });
  const requestFields = await requestInputFields({
    ...state,
    access: call.method === 'create' ? 'create' : 'update',
    grants,
    scopePath: call.sub,
  });
  return (data: Record<string, unknown>, existing?: unknown) => {
    const admitted = admitModelInput({
      data,
      existing: existing ? (isolateDocForOutput(existing) as Record<string, unknown>) : undefined,
      requestFields,
      inputFields: state.inputFields,
      catalog: state.configuration.catalog,
      scopePath: call.sub,
    });
    // Dedicated request-mode compatibility also excludes a scope's virtual names
    // within Mixed/plain nesting. Canonical admission has already detached JS data.
    sanitizeSubScopeVirtualKeys(
      admitted.allowedData,
      {
        virtuals: state.configuration.virtuals as Record<string, unknown>,
      },
      call.sub,
    );
    return admitted;
  };
}

/** Independent read stage. Persistence has succeeded; visibility never turns it into a retryable write error. */
async function visibleMutationRows<T, V extends object>(
  service: Service<T, V>,
  call: SubdocumentCall,
  parentId: unknown,
  rows: Record<string, unknown>[],
) {
  try {
    const visibility = call.visibility!;
    const gates = [visibility.parent, visibility.child, ...(visibility.list ? [visibility.list] : [])];
    if (gates.some((gate) => isExecutionRowDenied(service, gate.execution))) return [];
    for (const gate of gates) if (!(await subdocumentGateAllowed(service, gate))) return [];
    const identity = { _id: parentId } as Filter;
    const filter = await subdocumentRows(service, visibility.parent, identity, identity);
    if (filter === false) return [];
    const parent = await getServiceExecutors(service).subdocumentVisibility({
      filter: filter as Filter<T>,
      select: parentSelection(service, call),
      populate: [],
    });
    if (!parent) return [];
    const selected = call.method === 'create' ? {} : { _id: { $in: rows.map((row) => row._id) } };
    const read = await subdocumentRows(service, visibility.child, selected, selected, call.sub);
    const list = visibility.list ? await subdocumentRows(service, visibility.list, {}, {}, call.sub) : {};
    if (read === false || list === false) return [];
    const visible = filterCollection(get(parent, call.sub) as Record<string, unknown>[], intersectFilters(read, list));
    return await finalizeSubdocumentRows(service, call.output!, parent, visible);
  } catch {
    // No retry and no raw-data fallback, including when a post-save hook fails.
    return [];
  }
}

export async function listSub<T, V extends object>(
  service: Service<T, V>,
  id: SubdocumentId,
  sub: SubdocumentName,
  options?: SubdocumentListOptions<T, any, any>,
): Promise<ListResult | ErrorResult> {
  return result(async () => {
    const call = prepareSubdocumentCall(service, sub, 'list', options);
    options = deepIsolateValue(options);
    const errors = validateClientFilter(options?.filter);
    if (errors.length) return { ...denied(Codes.BadRequest), errors };
    if (options?.filter === false) return denied();
    const admission = await initialDenial(service, call);
    if (admission) return admission;
    const filter = await subdocumentParentFilter(service, call.parent, id);
    if (filter === false) return denied(Codes.NotFound);
    const childFilter = await subdocumentRows(service, call.child, options?.filter ?? {}, {}, sub);
    if (childFilter === false) return denied();
    const parent = await service.findRawParentDoc({
      filter,
      select: parentSelection(service, call),
      populate: [],
    });
    if (!parent) return denied(Codes.NotFound);
    const rows = filterCollection(get(parent, sub) as Record<string, unknown>[], childFilter);
    const data = await finalizeSubdocumentRows(service, call.output!, parent, rows);
    return { success: true as const, kind: 'list' as const, code: Codes.Success, data, count: data.length };
  });
}

export async function readSub<T, V extends object>(
  service: Service<T, V>,
  id: SubdocumentId,
  sub: SubdocumentName,
  subId: SubdocumentId,
  options?: SubdocumentReadOptions<T, any, any>,
): Promise<SingleResult | ErrorResult> {
  return result(async () => {
    const call = prepareSubdocumentCall(service, sub, 'read', options);
    const admission = await initialDenial(service, call);
    if (admission) return admission;
    const filter = await subdocumentParentFilter(service, call.parent, id);
    if (filter === false) return denied(Codes.NotFound);
    const identity = { _id: subId };
    const childFilter = await subdocumentRows(service, call.child, identity, identity, sub);
    if (childFilter === false) return denied();
    const entries = await prepareSubdocumentPopulate(service, call.output!);
    const capture = subdocumentRequiresPopulateCapture(call.output!, entries);
    const parent = await service.findRawParentDoc({
      filter,
      select: parentSelection(service, call),
      populate: capture ? [] : entries,
    });
    if (!parent) return denied(Codes.NotFound);
    const row = findElement(
      get(capture ? parent : copySubdocumentParent(parent), sub) as Record<string, unknown>[],
      childFilter,
    );
    if (!row) return denied(Codes.NotFound);
    const data = await finalizeSubdocumentRows(service, call.output!, parent, [row], entries);
    return { success: true as const, kind: 'single' as const, code: Codes.Success, data: data[0] ?? null };
  });
}

export async function updateSub<T, V extends object>(
  service: Service<T, V>,
  persist: Persist,
  id: SubdocumentId,
  sub: SubdocumentName,
  subId: SubdocumentId,
  data: Record<string, unknown>,
  options?: SubdocumentUpdateOptions<T, any, any>,
): Promise<SingleResult | ErrorResult> {
  return result(async () => {
    const call = prepareSubdocumentCall(service, sub, 'update', options);
    assertModelInputComplexity(data, service.getRequestComplexity());
    assertPublicAdmission(data, 'data');
    const admission = await initialDenial(service, call);
    if (admission) return admission;
    const lookup = await mutationParent(service, id, call);
    if ('error' in lookup) return lookup.error;
    const { parent } = lookup;
    const identity = { _id: subId };
    const filter = await subdocumentRows(service, call.child, identity, identity, sub);
    if (filter === false) return denied();
    const row = findElement(get(parent, sub) as Record<string, unknown>[], filter);
    if (!row) return denied(Codes.NotFound);
    const original = isolateDocForOutput(row);
    const admit = await inputAdmission(service, call, parent);
    const { allowedData, allowedFields } = admit(data, original);
    applyUpdate(row, allowedData, allowedFields);
    await persist(() => parent.save());
    const visible = await visibleMutationRows(service, call, parent._id, [row]);
    return { success: true as const, kind: 'single' as const, code: Codes.Success, data: visible[0] ?? null };
  });
}

export async function bulkUpdateSub<T, V extends object>(
  service: Service<T, V>,
  persist: Persist,
  id: SubdocumentId,
  sub: SubdocumentName,
  data: SubdocumentBulkUpdateInput,
  options?: SubdocumentUpdateOptions<T, any, any>,
): Promise<ListResult | ErrorResult> {
  return result(async () => {
    const call = prepareSubdocumentCall(service, sub, 'bulkUpdate', options);
    const { maxBulkItems } = service.getRequestComplexity();
    if (data.length > maxBulkItems)
      return invalid(`Bulk subdocument update exceeds maximum item count of ${maxBulkItems}`);
    assertModelInputComplexity(data, service.getRequestComplexity());
    assertPublicAdmission(data, 'data');
    const admission = await initialDenial(service, call);
    if (admission) return admission;
    const lookup = await mutationParent(service, id, call);
    if ('error' in lookup) return lookup.error;
    const { parent } = lookup;
    const selected = { _id: { $in: data.map((row) => row._id) } };
    const filter = await subdocumentRows(service, call.child, selected, selected, sub);
    if (filter === false) return denied();
    const rows = filterCollection(get(parent, sub) as SubdocumentBulkRecord[], filter);
    const originals = rows.map((row) => isolateDocForOutput(row));
    const admit = await inputAdmission(service, call, parent);
    for (const [index, row] of rows.entries()) {
      const input = findElementById(data, row._id as string);
      if (input) {
        const { allowedData, allowedFields } = admit(input, originals[index]);
        applyUpdate(row, allowedData, allowedFields);
      }
    }
    await persist(() => parent.save());
    const visible = await visibleMutationRows(service, call, parent._id, rows);
    return { success: true as const, kind: 'list' as const, code: Codes.Success, data: visible, count: visible.length };
  });
}

export async function createSub<T, V extends object>(
  service: Service<T, V>,
  persist: Persist,
  id: SubdocumentId,
  sub: SubdocumentName,
  data: SubdocumentCreateInput,
  options?: SubdocumentCreateOptions<T, any, any>,
): Promise<ListResult | ErrorResult> {
  return result(async () => {
    const call = prepareSubdocumentCall(service, sub, 'create', options);
    const addFirst = options?.addFirst;
    const { maxBulkItems } = service.getRequestComplexity();
    if (Array.isArray(data) && data.length > maxBulkItems)
      return invalid(`Bulk subdocument create exceeds maximum item count of ${maxBulkItems}`);
    assertModelInputComplexity(data, service.getRequestComplexity());
    assertPublicAdmission(data, 'data');
    const admission = await initialDenial(service, call);
    if (admission) return admission;
    const lookup = await mutationParent(service, id, call);
    if ('error' in lookup) return lookup.error;
    const { parent } = lookup;
    const rows = get(parent, sub) as Record<string, unknown>[];
    const admit = await inputAdmission(service, call, parent);
    const allowed = (Array.isArray(data) ? data : [data]).map((row) => admit(row).allowedData);
    if (addFirst) rows.unshift(...allowed);
    else rows.push(...allowed);
    await persist(() => parent.save());
    const visible = await visibleMutationRows(service, call, parent._id, rows);
    return { success: true as const, kind: 'list' as const, code: Codes.Created, data: visible, count: visible.length };
  });
}

export async function deleteSub<T, V extends object>(
  service: Service<T, V>,
  persist: Persist,
  id: SubdocumentId,
  sub: SubdocumentName,
  subId: SubdocumentId,
  options?: SubdocumentDeleteOptions<T, any>,
): Promise<SingleResult | ErrorResult> {
  return result(async () => {
    const call = prepareSubdocumentCall(service, sub, 'delete', options);
    const admission = await initialDenial(service, call);
    if (admission) return admission;
    const lookup = await mutationParent(service, id, call);
    if ('error' in lookup) return lookup.error;
    const { parent } = lookup;
    const identity = { _id: subId };
    const filter = await subdocumentRows(service, call.child, identity, identity, sub);
    if (filter === false) return denied();
    const row = findElement(get(parent, sub) as Record<string, unknown>[], filter) as
      | { _id: unknown; deleteOne?: () => Promise<unknown>; remove?: () => Promise<unknown> }
      | undefined;
    if (!row) return denied(Codes.NotFound);
    await ('deleteOne' in row ? row.deleteOne?.() : row.remove?.());
    await persist(() => parent.save());
    return { success: true as const, kind: 'single' as const, code: Codes.Success, data: row._id };
  });
}

/** Legacy request-only raw parent helper. Dedicated policy calls use the private scoped boundary. */
export async function getParentDoc<T, V extends object>(
  service: Service<T, V>,
  id: SubdocumentId,
  sub: SubdocumentName,
  args?: SubdocumentParentArgs,
  options?: SubdocumentParentOptions,
) {
  assertPublicAdmission({ args, options });
  const { access = 'read' } = options ?? {};
  const identity = deepIsolateValue(await service.genIDFilter(id));
  const filter = intersectFilters(identity, await service.genFilter(access, deepIsolateValue(identity)));
  if (filter === false) return null;
  const populate = await service.genPopulate('read', genSubPopulate(sub, args?.populate), { scopePath: [sub] });
  return service.findRawParentDoc({
    filter: filter as Filter<T>,
    select: access === 'read' ? '' : sub,
    populate,
  });
}
