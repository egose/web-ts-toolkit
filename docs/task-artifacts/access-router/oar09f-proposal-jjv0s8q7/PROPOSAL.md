> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09F — one explicit collection output-helper operation

**Proposal only; awaiting user approval.** No implementation, public API addition, gate change or measured gain is delivered.
Task: `docs/tasks/20261031-153020-access-router-owned-authorization-redesign.md` (C1–C6, M3, OAR-09F).

## 1. Recommendation and alternatives

Add **`pickAllowedFieldsMany(rows, access, options?)`**, returning data only, to model `Base` and `Core` (Core prepends `modelName`).
Keep the three existing helpers unchanged: `genAllowedFields`, `pickAllowedFields`, `trimOutputFields` (the last is an alias).
Use existing `OutputFieldOptions<TModel, TVirtuals>`; do not invent a batch option type, three batch aliases, a `purpose` switch, or a new policy dimension.

| Choice | Decision / consumer cost |
|---|---|
| Distinct `pickAllowedFieldsMany` | **Recommend** for raw collections needing the same backend output policy: one explicitly shared capture, separate row decisions. Name follows `pickAllowedFields` and existing `find`/`findOne` collection distinction. |
| Keep independent picks / no new API | Correct when every call must independently capture current authority; retain its measured cost. For presentation-only DTO subsets this is usually unnecessary: use ordinary application projection instead. |
| `filterOutputBatch` returning `{data, fields}` per row | Reject for now: unrelated terminology and an extra result contract where consumers primarily need data. Existing `genAllowedFields` remains a separate fresh operation, not a same-batch certificate. |

No `Array.isArray(doc)` overload on `pickAllowedFields`: its unconstrained `T` can already be array-valued at the type boundary; nested arrays also have existing value semantics.
Current model helper **runtime root** admission rejects non-null scalar/array documents (`document-stage.ts:500–530`); do not silently reinterpret such input as multiple rows or change that rule.
An array *inside* a row remains a value; an array used *as* a row still rejects. Only the new method's outer collection denotes root positions.

## 2. Proposed public declarations (not shipped)

Current `Promise<T>` picks do not prove field presence. Neither `PublicOutput` / `SelectedPublicOutput` nor shallow `ModelVirtualDoc` is a safe deep-partial helper result (`interfaces/query-types.ts:29–34,65–91`; `router-hooks.ts:167–172`).
Propose exactly one **new** exported type, `FilteredOutput<T>`; do not mislabel it as an existing export:

```ts
import type { Document } from 'mongoose';
import type { Buffer } from 'node:buffer';

type FilteredValue<T, D extends readonly unknown[]> =
  unknown extends T ? unknown : D['length'] extends 8 ? unknown :
  T extends Document ? unknown :
  T extends Date ? Date : T extends RegExp ? RegExp :
  T extends Buffer ? Buffer :
  T extends { readonly _bsontype: string } ? unknown :
  T extends ReadonlyMap<infer K, infer V> ?
    [K] extends [string] ? Readonly<Record<string,
      FilteredValue<V, [unknown, ...D]> | undefined>> : unknown :
  T extends readonly (infer E)[] ?
    ReadonlyArray<FilteredValue<E, [unknown, ...D]> | null | undefined> :
  T extends object ? { readonly [K in Extract<keyof T, string>]?:
    FilteredValue<T[K], [unknown, ...D]> } :
  T extends string | number | boolean | bigint | null | undefined ? T : unknown;

export type FilteredOutput<T> = FilteredValue<T, []>;
```

Use these members in the existing classes; `SelectAccess` is the existing advanced interface type:

```ts
// Core member
pickAllowedFieldsMany<T, TModel = unknown,
  TVirtuals extends object = Record<never, never>>(
  modelName: string, rows: readonly T[], access: SelectAccess,
  options?: OutputFieldOptions<TModel, TVirtuals>,
): Promise<readonly FilteredOutput<T>[]>;

// Base<TModel = unknown, TVirtuals extends object = Record<never, never>> member
pickAllowedFieldsMany<T>(
  rows: readonly T[], access: SelectAccess,
  options?: OutputFieldOptions<TModel, TVirtuals>,
): Promise<readonly FilteredOutput<T>[]>;
```

All record fields, including `_id`, are optional recursively. Tuples/cardinality are not inferred from types; successful runtime results preserve outer positions/order.
Nested arrays remain arrays (holes/omissions/null embedded placeholders require `undefined | null`); string-keyed Maps normalize to records, **not Maps**, matching the current materializer (`trusted-output-materialization.ts:647–660`).
Date/RegExp/Buffer retain canonical base types, not custom subclasses. Other BSON values (especially Code.scope / DBRef.fields), hydrated document outputs and type recursion beyond eight levels are deliberately `unknown`: narrow/validate them, never assert that normalization preserves every input member.
This is not a supported-input validator, JSON-only shape, frozen-native guarantee, or exact-selected-field inference. `readonly` is an inspection aid; returned data has no authority.
Do not change old single-row return declarations in this additive packet; disclose their existing weakness instead of copying it into the new API.
Export `FilteredOutput` from `src/index.ts`, `interfaces/index.ts` and thus `/advanced`; use existing root/advanced entrypoints and ESM/CJS declarations, no new subpath/deep import.
`Service` and `PublicService` inherit the Base member, discoverable through both Core and router `getService` / `getPublicService`; the latter does not turn a direct helper call into an HTTP operation.

## 3. Operation entry, freshness and ownership

1. Synchronously authenticate exact receiving request/Core/runtime/model ownership and validate arity, access and every control/options container before source/native/application work. Omitted/undefined options mean `{}`; unsupported extra arguments reject in Base **and** Core.
2. Capture the **effective initialized actor permission view**, model identity, primitive access/scope, current output catalog/configuration and normalized output-only policy **once**, before any await/field callback. Capture actor primitives before native configuration exposure. No schema-identity cache or cross-call actor/rule memo.
3. Validate/detach the outer collection and **admit/own every row source before invoking any field callback**, not merely before awaiting the first one. Admission must consume the aggregate ledger; no lazy ownership of later raw rows. Every occurrence, including duplicate references, gets a separate detached source and stage.
4. Give each non-null row its own stage/generation/memo and built-in frozen EMPTY facts, then use the existing selection kernel, evaluator and materializer. Genuine embedded occurrences derive only from that row's owned subtree and retain local child stages; never derive one root from another.
5. Buffer indexed outputs under one publication/failure owner; close/drain and clear source/stage/memo/preparation references on success and every failure. Return ordinary data only. Nothing is reusable after settlement.

Actor-view replacement, setter/policy/scope changes and schema mutation **after entry** affect the next independent call, not later rows of this batch.
This is an intentional freshness difference from a sequential loop of independently awaited picks; even `Promise.all(rows.map(pick))` has separate capture boundaries and can differ after synchronous callback mutations.
Initialization is unchanged: mutating `req.user` alone does not rerun the global-permissions resolver; only an effective actor-view replacement visible at helper entry is captured (`Core.setPermissions` / initialized owner semantics).
Every independent batch, existing helper call or nested application service call captures again. Two identical IDs/objects in one batch do not share function decisions, source leaves or memo entries.
Only immutable call preparation (catalog/path eligibility and rule definitions) is amortized; do **not** amortize row field callbacks. A 100×24 all-function fixture must still perform 2,400 evaluations and 100 source admissions/root stages.
Logical entry capture is not actor-map reconstruction: existing privately immutable actor views may already be reused safely. Promise/binding/map-copy counts require actual later instrumentation, not a claimed 100-fold reduction.

Callbacks remain trusted server code with original-request `this`, captured permission argument and EMPTY fact argument. Capturing a function does not freeze its closure, live request properties, caches, DB state or native normalization hooks.
Preflight guarantees ownership against **later field callbacks**; hydration/native normalization may itself execute application code while sources are captured. This is no atomic multi-object snapshot, JS sandbox or external/database freshness guarantee, including across awaits.
No document hooks, virtual execution, row/operation/target admission, query expansion, correlated-reference provenance recovery, population, hidden DB reads or omitted-field restoration is added. Native/application code's own I/O is outside this library-work claim.
Negative EMPTY predicates such as `!facts.suspended` may allow a field: that is **not** current-document authority. Metadata, result contexts and explicit output grants do not substitute for a normal current-authority READ/LIST.

## 4. Options, admission and finite work (new batch-specific limits)

| Input / control | Recommended contract |
|---|---|
| `options` / `authorization.outputFields` | Reuse existing exact named admission and request/grant/unrestricted grammar; grant paths stay model-relative and selection-limited. One model/scope/access/policy for the entire call, no per-row elevations. |
| `scopePath` | One detached ordinary-response-segment path (existing depth/path validation); e.g. `['contacts']`, grants `contacts.label`. |
| `purpose`, selection/query/populate, rows/inputFields/related, modes/retired controls, handles/tokens | Reject, including inherited/non-enumerable/accessor/false/undefined control presence, before field callbacks. No bypass or new wire option. Persisted same-named business fields remain inert. |
| Outer `rows` | Ordinary dense native Array, readonly/frozen accepted; **0–1,000** entries inclusive. Reject proxy before prototype/key/descriptor introspection; reject subclasses, holes, accessor/non-enumerable indices, extra string/symbol own keys. Check length before index traversal. Never read/call an iterator; iterable/async-iterable/stream inputs unsupported. |
| Row entry | Existing isolated raw/hydrated source admission, regardless of model modes. Preserve null/undefined positions without a field callback; reject unsupported roots. Reject proxies before traps and reject unsafe accessors/symbols/cycles according to existing full source admission. No root deduplication. |
| Empty collection | Still authenticate receiver/arity/access and fully validate controls, collection shape and current policy/catalog capture once; return `[]`, zero row stages/callbacks/DB/doc hooks. Invalid controls/model/policy cannot succeed just because no rows exist. |

Fixed v1 ceilings, **not** user/client options or query `limit` reuse:
- **Per root row:** existing inclusive 20,000-slot / depth-100 selected budget; embedded/native/metadata/copy/wire work shares that remainder. Independently retain existing 20,000/depth-100 source, fact-map and callback-view admission owners. EMPTY is literal built-in facts, never an application map.
- **Whole operation:** **200,000 aggregate structural-work units**, never reset per row/chunk/phase. Debit one per outer slot, source/selected/fact/view budget debit, catalog/selection-path examination, stage/memo allocation and attempted field-decision evaluation. Prepaid child slots are not charged twice for the same visit; actual repeat traversal/copy charges again. Initial policy/catalog capture is included with its existing individual limits.
- **Whole operation payload:** **16 MiB cumulative copied/prepared payload bytes** (UTF-8 string bytes and native byte storage, charged for each actual source/output/native-wire copy, including normalized replacements). Check/charge before allocating/copying/serializing supported state; count source copies and buffered outputs, not only returned fields. Do not invoke serialization to learn whether a graph fits.
- A full row may hit 20,000 while a small batch remains valid; conversely many individually valid rows can fail the aggregate cap. Source/fact allowances never replenish output; an output row does not get the whole batch's allowance. Nullish positions still cost an outer slot.
- 1,000 bounds positions/stage bookkeeping; 200,000 bounds work while all sources/results coexist; 16 MiB bounds scalar/native payload that slot counts cannot. These are conservative **new API limits proposed for approval**, not existing measured tuning or promises of exact RSS/CPU bounds. Library admission cannot bound arbitrary trusted callbacks or the engine's cost of enumerating a pre-existing object.

Account native Code.scope/DBRef.fields, Map entries, arrays/holes and wire replacements before invoking library serialization, using the same remaining row and aggregate budgets. Denied/protected selected slots charge before policy/value observation; never call a denied getter.
Collection/control descriptors are validated without executing accessors or proxy traps. Supported normalization hooks retain their documented non-sandbox effects; arbitrary thenables/iterators are not new input forms.
Do not split internally into independently recaptured batches to evade caps. Caller chunking creates **new** operations/freshness boundaries and no collection-wide atomic result.

## 5. Concurrency, failure and intentional changes

Use existing request/runtime worker scheduling, capped at `min(rows.length, scheduler.limit, hookGate.limit)`; admit each row's output work through that same shared hook gate, retaining FIFO/reentry/depth rules. Do not hold a persistence permit while awaiting callbacks.
Keep each row's field order/short-circuit and sync-until-async evaluator; no parallel field expansion or unbounded `Promise.all(rows.map(...))`. Index-based own data definitions preserve result order even when rows complete out of order.
This bounds batch orchestration; it does not promise identical inter-row callback timing to callers' old Promise.all/serial loop. Existing single-row scheduling is unchanged. Admission/gate failures must map to controlled errors, not be mistaken for a false field body.
Permission callback body throw/rejection remains field denial/omission. No virtual getter is invoked. Invalid admitted structure/native result, depleted source/selected/aggregate budget or sticky poison is **whole batch controlled BadRequest/400**, even if a callback catches the originating error.
Poison/close first, stop admitting new row-output work/field callbacks, drain already-admitted library work, reject late publication, then reject the one Promise: **no partial rows/result envelope**. Already-snapshotted later sources are discarded, not evaluated after poison.
This is all-or-nothing **publication**, not a transaction: callback side effects are not rolled back; no automatic retries. Untracked detached closure work is not awaited or cancelled by a public token.

Retained: original actor/binding, output-only dimensions, grammar/metadata/ID handling, scoped grants, isolated source, one engine, per-stage decisions and native/depth/denial protections.
Intentional new contract: once-per-collection freshness, all-source preflight, finite collection/aggregate/byte caps, bounded row interleaving, one failure group and honest optional output type. Old per-row APIs keep their existing freshness/error/type contracts and cost.
Forbidden: prepared public closures/sessions/tokens/handles/context, DTO-keyed WeakMap certificates, cross-call rules/actor caches, implicit client batch routes, automatically generated policy/selection wire controls, or replacing current document facts with EMPTY/grants.

## 6. Consumer recipes (proposed batch name; public imports only)

```ts
import type { FilteredOutput, OutputFieldOptions } from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
type Contact = { email: string; label: string; address: { city: string; secret: string } };
type Employee = { name: string; contacts: Contact[] };
// Backend-owned policy, NEVER copied from request body/options.
const contactPolicy: OutputFieldOptions<Employee> = {
  scopePath: ['contacts'],
  authorization: { outputFields: { mode: 'grant', paths: ['contacts.label'] } },
};
async function before(req: ModelRequest, rows: readonly Contact[]) {
  const service = req.macl.getService<Employee>('Employee');
  return Promise.all(rows.map(row => service.pickAllowedFields(row, 'list', contactPolicy)));
}
async function after(req: ModelRequest, rows: readonly Contact[]):
  Promise<readonly FilteredOutput<Contact>[]> {
  return req.macl.getService<Employee>('Employee')
    .pickAllowedFieldsMany(rows, 'list', contactPolicy);
  // One entry capture, not N independent fresh checks. Nested properties remain optional.
}
```

Raw collection use case: imported/projected records already held by trusted backend code, no document-dependent policy, one deliberately shared global/scoped output policy. The helper does not make those rows readable under row policy.
For current document facts, do **not** change a retired handle flow into either raw recipe:

```ts
// ModelRequest / Employee are the public types above; inputs are backend-owned.
async function currentAuthority(req: ModelRequest, tenantId: string) {
  const service = req.macl.getService<Employee & { tenantId: string }>('Employee');
  const args = { select: ['name', 'contacts.email'], limit: 100 };
  const quiet = { includePermissions: false, includeFieldPermissions: false };
  const first = await service.find({ tenantId }, args, quiet);
  if (!first.success) throw new Error(`Initial LIST failed: ${first.code}`);
  // Before: retained handles reused first's facts. Raw picks/batch cannot refresh them.
  // After: a NEW normal LIST, with normal row scope and configured private hook inputs.
  const current = await service.find({ tenantId }, args, quiet);
  if (!current.success) throw new Error(`Current LIST failed: ${current.code}`);
  return current.data; // +1 explicit LIST / +one hook per returned row if configured.
}
```

Configure `alwaysSelectFields` / normal declared dependencies for document-hook inputs; raw batch metadata cannot replace them. Do not grant rows/unrestricted output to imitate a removed handle or revalidate N IDs behind a helper.
If only presentation is needed, **usually add no API call at all**:

```ts
async function presentationOnly(req: ModelRequest) {
  const service = req.macl.getService<Employee>('Employee');
  const result = await service.find({}, { select: ['name'], limit: 100 },
    { includePermissions: false, includeFieldPermissions: false });
  if (!result.success) throw new Error(`LIST failed: ${result.code}`);
  // Before (unnecessary): Promise.all(result.data.map(row => service.pickAllowedFields(row, 'list'))).
  // After: a presentation subset of already-filtered DATA, NOT a current-permission check.
  return result.data.map(row => Object.hasOwn(row, 'name') ? { name: row.name } : {});
  // Subset adds 0 reads / 0 document hooks / 0 helper captures.
}
```

## 7. Implementation/verification boundary after separate authorization

Primary runtime outline: Core/Base admission/forwarding → private one-call preparation in `output-field-filter.ts` → bounded all-source admission and distinct stages → existing shape/evaluator/materializer → shared publication close/drain. Add aggregate debits without changing single-row budget semantics or creating another evaluator.
Extend helper/stage/publication/native/control suites: mutation between rows/awaits and next calls; repeated IDs/references; preflight later bad row before first callback; first callback mutating later original/native leaf; EMPTY negative predicates/scoped grants/metadata forgery; dense/empty/1,000/1,001, proxy/getter/symbol/sparse/extra/cycle cases; per-row exact/depleted 20k/depth100; aggregate exact/overflow and native payload expansion; caught poison/drain/late continuations/gate reentry; deterministic positions and no partial result.
Instrument actual 1/10/100-row captures/catalogs/stages/callbacks/source copies, DB/doc-hook/virtual counts, binding/Promise work and cleared state. Compare unchanged independent helpers; do not infer zero work from labels or promise gains.
Add source types and installed strict positive/negative consumers: nested omissions, arrays/Map normalization/native/unknown branches, no assignment to required `T[]`, readonly inputs, supported nullish rows, forbidden controls; discover through both service getters and Core. No `any`, casts masking omissions or declaration suppressions in migration examples.
Future authorized verification: serialized V1–V7, actual root/advanced/processors ESM/CJS packs, minimum/current peers and Bundler/Node16/NodeNext; check JSDoc/declarations/examples/exports and no private issuers shipped. Existing scripts rebuild shared dist: no concurrent builds/tests.
Ship README helper table/JSDoc plus MIGRATION M3 and executable public examples/CHANGELOG together; preserve guard refinement. Correct the inspected stale README `1422–1427` paragraph (it still claims hooks/handles), using current C5/MIGRATION semantics, not those obsolete instructions. No docs are edited by this proposal.

## 8. Approval and measurement are separate decisions

See `MEASUREMENT-APPROVAL-CHECKLIST.md`: API implementation needs explicit user approval; migration recommendation and any old-gate replacement/exception need **separate** approval.
Current historical H3-global/100 remains **+14.25% / +3.9816 ms median**, **+15.82% / +5.3927 ms CPU**; H3-global/10 CPU **+18.01% / +1.2266 ms**, confirmed in all four pairs. Fifteen other unresolved-sign gates remain blocking, not fixed by a collection API.
Do not substitute one batch for 100 independent helper calls and relabel H3 as passing. New `helper/B1-global-many/{10,100}` would be a separately named workflow: retain H3-global's string/global rules, same rows/output/2,400 business-field checks at 100 rows, **zero function callbacks/doc hooks/extra DB reads**, and explicit **1 versus N helper capture boundaries**. The 2,400-callback all-function control above is separate untimed proof, not a rewrite of H3-global.
Compare actual new batch versus unchanged current N raw calls, actual sealed old raw global-only helper flow with no doc hook configured, and historical old query+handle workflow as **separate labeled comparators**; there is no old batch API to invent. Query cost and freshness differences stay visible, not subtracted or pooled.
Original thresholds/samples/pairing/repeat/sign/retention rules and all four campaigns (75/90, 81/90, 78/90, 73/90) remain untouched. No timing, projected speedup, irreducible-cost proof, OAR-09 completion or OAR-10/release acceptance follows from this packet.
