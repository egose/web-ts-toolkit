/** Real diagnostics, compiled separately: no declaration suppression or product casts. */
import type { HydratedDocument, Types } from 'mongoose';
import type { FilteredOutput } from '@web-ts-toolkit/access-router';
import type { DataRequest, ModelRequest } from '@web-ts-toolkit/access-router/advanced';
declare const req: ModelRequest;
declare const dataRequest: DataRequest;
type Row = { name: string; nested: { value: number }; array: { label: string }[]; map: Map<string, number> };
declare const output: readonly FilteredOutput<Row>[];
declare const hydrated: FilteredOutput<HydratedDocument<{ _id: string; name: string }>>;
declare const bson: FilteredOutput<Types.ObjectId>;
// reject-next
export const required: readonly Row[] = output;
// reject-next
export const name: string = output[0].name;
// reject-next
output[0].nested.value.toFixed();
// reject-next
output[0].array[0].label.toUpperCase();
// reject-next
output[0].map?.get('key');
// reject-next
output.push({});
// reject-next
output[0].name = 'changed';
// reject-next
hydrated.name;
// reject-next
bson.toHexString();
// reject-next
req.macl.getService('Employee').pickAllowedFieldsMany([], 'read', { purpose: 'output' });
// reject-next
req.macl
  .getPublicService('Employee')
  .pickAllowedFieldsMany([], 'read', { authorization: { rows: { mode: 'unrestricted' } } });
// reject-next
req.macl.pickAllowedFieldsMany('Employee', [], 'read', { documentAuthorization: {} });
// reject-next
req.macl.getService('Employee').pickAllowedFieldsMany([], 'read', undefined, undefined);
// reject-next
dataRequest.dacl.getService('Directory').pickAllowedFieldsMany([], 'read');
// reject-next
req.macl.getService('Employee').pickAllowedFieldsMany(new Set<Row>(), 'read');
// reject-next
req.macl.getService('Employee').pickAllowedFieldsMany([], 'read', { select: ['name'] });
