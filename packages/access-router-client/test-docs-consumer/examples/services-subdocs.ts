/**
 * ARC-20: extracted from website services.mdx "Subqueries" + "Subdocument
 * Helpers" examples. Mirrors the documented subquery `sq` option, the
 * subdocument `id(parentId).subs('field')` shape and the `create(...)`
 * array-or-object contract, and the plain (non-Model) subdocument response.
 *
 * `SubDocumentListResponse<S>` is the discriminated `Response<S[], S[]>`
 * union plus `count`, so `data` is `null` on the `success: false` branch —
 * every access narrows on `result.success`. The compile test catches a
 * regression that exposes `data: S[]` unconditionally.
 */
import { createAdapter, type SubDocumentListResponse } from '@web-ts-toolkit/access-router-client';

interface User {
  _id?: string;
  name: string;
  role: string;
  statusHistory: Array<{ _id?: string; label: string; flag: string }>;
}

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const orgService = adapter.createModelService<{ _id?: string; name: string }>({
  modelName: 'Org',
  basePath: 'orgs',
});
const userService = adapter.createModelService<User>({
  modelName: 'User',
  basePath: 'users',
});

const orgs = await orgService.listAdvanced(
  {
    _id: userService.readAdvancedFilter({ name: 'lucy2' }, undefined, { sq: { path: 'orgs', compact: true } }),
  },
  { select: ['name'] },
);
void orgs;

const userId = 'user-id-1';
const subId = 'sub-1';
const statusHistory = userService.id(userId).subs('statusHistory');

await statusHistory.update(subId, { label: 'processed' });
await statusHistory.create({ label: 'queued', flag: 'orange' });
await statusHistory.bulkUpdate([{ _id: subId, label: 'processed' }]);
await statusHistory.delete(subId);

const created = await statusHistory.create({
  label: 'queued',
  flag: 'orange',
});
if (created.success) {
  const newDoc = created.data[created.data.length - 1];
  void newDoc;
}

const createdMany = await statusHistory.create([
  { label: 'queued', flag: 'orange' },
  { label: 'in-review', flag: 'blue' },
]);
if (createdMany.success) {
  const added = createdMany.data.slice(-2);
  void added;
}

const listed = await statusHistory.list();
void listed;

const bulkUpdated = await statusHistory.bulkUpdate([
  { _id: 'sub-1', label: 'approved', flag: 'green' },
  { _id: 'sub-2', label: 'rejected', flag: 'red' },
]);
void bulkUpdated;

const updated = await statusHistory.update('sub-1', { label: 'processed' });
void updated;

const read = await statusHistory.read('sub-1');
void read;

// Sanity: SubDocumentListResponse is a named type export and carries `count`
// (the server field), never `totalCount`. The discriminated narrowing below
// enforces that on the success branch `data` is the plain array; on the
// failure branch `data` is `null`. Any regression to `totalCount` or to a
// non-null `data` on failures would break the type assertions that follow.
const subList = {} as SubDocumentListResponse<{ label: string; flag: string }>;
subList.count satisfies number;
if (subList.success) {
  subList.data satisfies { label: string; flag: string }[];
} else {
  subList.data satisfies null;
  subList.count satisfies number;
}
