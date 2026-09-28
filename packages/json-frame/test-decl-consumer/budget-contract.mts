import {
  fromOrient,
  type FromOrientOptions,
  type ResolvedOrient,
  type ToJSONStringOptions,
  type ToTableOptions,
} from '@web-ts-toolkit/json-frame';

const ingestion: FromOrientOptions = { orient: 'records', maxNodes: 3 };
const frame = fromOrient([{ n: 1 }], ingestion);
const raw = fromOrient('[{"n":1}]', { maxNodes: 3 });
const explicit = fromOrient<{ n: number }>([{ n: 1 }], { maxNodes: 3 });
const serialization: ToJSONStringOptions = { maxNodes: 100 };
const tableSerialization: ToJSONStringOptions = { indexField: 'row_id', maxNodes: 100 };
const orients: readonly ResolvedOrient[] = ['records', 'index', 'columns', 'values', 'split', 'table'];
for (const orient of orients) {
  const json: string = frame.toJSONString(orient, serialization);
  void json;
}
const table: string = frame.toJSONString('table', tableSerialization);
const tableOnly: ToTableOptions = { indexField: 'row_id' };
frame.toJSONString('table', tableOnly); // existing options remain assignable
frame.toTable(tableOnly);

// @ts-expect-error maxNodes is numeric, never a coerced string
fromOrient([], { orient: 'records', maxNodes: '3' });
// @ts-expect-error maxNodes is not nullable
const nullable: FromOrientOptions = { maxNodes: null };
// @ts-expect-error every serialization orient requires numeric maxNodes
frame.toJSONString('records', { maxNodes: '3' });
// @ts-expect-error table combination retains the indexField string contract
frame.toJSONString('table', { maxNodes: 3, indexField: 1 });
// @ts-expect-error budget applies to string serialization, not toTable payload construction
frame.toTable({ maxNodes: 3 });
// @ts-expect-error internal traversal helpers must not become public
type InternalBudget = typeof import('@web-ts-toolkit/json-frame').createNodeBudget;

void [raw, explicit, table, nullable, 0 as InternalBudget | 0];
