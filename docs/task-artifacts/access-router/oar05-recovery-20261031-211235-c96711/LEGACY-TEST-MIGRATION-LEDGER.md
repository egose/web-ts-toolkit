> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-05 legacy-test and failure ledger

OAR-05 is a bounded helper/escape migration, **not a full V3/V4/V7 pass**. No
permanent test file was deleted, skipped, excluded or renamed to manufacture
integration success. The package's permanent test configuration is unchanged.
The full 12-file final focused run executes all **543 cases**; the separate packed
run selects two existing gates and leaves eleven later-owned cases unselected.

## Original-before evidence and scope

- Authoritative OAR-05 before: `_tmp-oar05-20261031-205550/product-before.json`.
  The recovery captures its own incoming baseline in `product-before.json`.
  `audit-final-02.json` distinguishes the combined **16-file OAR-05 delta** from
  this recovery's **five test/fixture-file delta**. No source/runtime file changed
  during this recovery; the seven incoming OAR-05 source changes are retained.
- `incoming-source-diff-verification.json` reconstructs all seven original source
  files in ignored scratch, applies the preserved OAR-04 diff in memory, and checks
  the result against the original OAR-05 hashes. `legacy-diff-identities.json`
  similarly verifies the five tracked pre-existing test/fixture files. Original
  untracked type fixtures retain their before hashes and older staged evidence;
  no reconstruction of unavailable original bytes is claimed.
- The predecessor's `regression-before.log` has **90 passed / 4 failed / 94 loaded
  cases**, plus the service-finalizer suite failing to load the removed private
  module. These are real preserved observations, not a passing original baseline.
- Its `helpers-01.log` has **134 passed / 5 failed / 139 cases** after the first
  migration/fixes. Its `focused-02.log` has **543 passed / 12 files**. The fresh
  recovery reruns those twelve complete files successfully in `focused-final-01.log`.

## Retained assertions and intentionally changed expectations

| File / retired premise | Current assertion and preserved security purpose |
| --- | --- |
| `field-helper-removal.contract.test.ts`: raw/hydrated helpers previously resolved a document hook and retained `owned`/`fn` values. | All **60 cases** retained. Three canonical raw helpers use empty facts, omit document-dependent values, run no document hook/getter, preserve hydrated input and absent/unsupported-value behavior, and retain scope, selected additive grants and denied siblings. Omitted/undefined/named options remain checked. |
| Same file: data field callback had one argument. | Now asserts exactly two arguments, original request `this`, the existing immutable actor and frozen empty facts. Whole-container picks, data selection intersections, no Mongoose-catalog dependence and no backend elevation remain. |
| Same file: explicit `_view`/`_edit` presentation used serialized boolean metadata. | Retained as **DATA**. The explicit utility may perform its documented row-visibility work, but never makes an output helper or write/input allowlist authoritative. The positive metadata assertions remain, including private row-ID bookkeeping used internally. |
| `field-helper-request-boundaries.integration.test.ts`: optional rich grant parameter. | All **7 cases** retained; the parameter is a required readonly boolean map. `distinct` still defers function rules instead of inventing facts; sort/distinct stay request-only, source private fetch does not grant population, and retained hydrated `getParentDoc` applies target request fields/private inputs/row scope. |
| `field-helper-consumer.runtime.fixture.ts`: installed raw helper expected `owned` and one document hook. | Actual packed **ESM and CJS** now require only the global/request fields, **zero hooks**, explicit output grant of `secret`, no missing-value fabrication, and unchanged request-only data behavior. All positional-removal/extra-argument probes remain. No new factory/export was added. |
| `service-authorization-finalizer.unit.test.ts`: removed private `document-authorization` import, public handles and retained field decisions. | All **45 cases** execute using authenticated private stages and fresh helpers. Wrong source/call/receiver, equal-ID rows, distinct pre-resolved stages, closure/reuse rejection and immutable diagnostic facts replace the retired mechanism, not its security purpose. No old engine alias or validation stub was restored. |
| Same file: context/DTO/child lookup reused memo after trimming or mutation. | Old helper options reject by presence; no context/child capability exists. Same object, spread, JSON, equal IDs, changed values, access/model/request/runtime changes carry no authority. Fresh helpers evaluate current values with globals/empty facts and optional explicit output grants. Original-stage hook counts remain once per row. |
| Same file: rich/native/certified output assumptions. | Supported Date/Buffer/BSON/RegExp/Map/hydrated values remain detached where needed, current helper values are freshly filtered, and originals remain unchanged. Selection, dotted scope, denied siblings/protected keys, native controls and child-before-parent virtual ordering remain. |
| Same file: four field callbacks expected after two row stages plus two raw DTO picks. | Exactly **three** are observed: two original row decisions and one fresh pick for the only DTO still containing `status`; absent values do not invoke a field policy. Both row hooks and distinct row facts remain asserted. |
| Same file: upsert/update virtual `v` could be retained through a read-shaped helper. | The original stage still returns `v` once at its captured update virtual access. A fresh raw READ helper has no read-applicable `v` descriptor and omits it even with an explicit path grant; it never reruns the update getter. Captured actor/config/access and mismatch rejection remain. |
| Same file: denied ancestor raw helper expected the entire array container absent. | Existing fresh helper construction retains `{ contacts: [{}, {}] }` while denied child values stay absent. Original ancestor/leaf/virtual once-per-stage counts and fresh parent/virtual callback counts remain checked. |
| `owned-authorization-hooks.types.fixture.ts` and `owned-authorization-cutover.invalid.types.fixture.ts`. | Positive root/advanced field/fact/guard/output/mode/decoration examples compile without casts/suppressed errors; processors remains publicly reachable. Separate negative fixtures reject removed capabilities/private stages/context members/helper options/old flags/invalid modes and readonly mutation. Packed current-peer `.mts` and `.cts` negatives are actually compiled, not accepted because of unrelated peer errors. |

New `owned-authorization-helpers.unit.test.ts` retains all **27** incoming cases:
actual bool/string/AND/OR/function/async grammar; negative `!grants.suspended` may
be true on empty facts but is not current-document proof; all ten old controls,
two new modes and two handle/stage slots across own/inherited/non-enumerable/
accessor forms; scoped output-only grants versus rows/input/related/metadata;
captured scope; proxy rejection before traps; same/JSON/spread/replaced-child/
metadata DTOs; exact diagnostics; explicit utilities; and strip/exposure/forged/
removed-presentation guards. Formatting alone changed this file during recovery;
`format-proof.json` verifies its semantic AST against the incoming partial bytes.

## Confirmed source defects fixed by the first child and preserved here

| Preserved failing evidence | Actual correction |
| --- | --- |
| `regression-before.log`: proxy helper options execute a trap and throw an application Error instead of controlled 400. | `validation/public-admission.ts` rejects a proxy by native brand before prototype, descriptor or control-slot observations. The unchanged 27-case security test now passes. |
| `regression-before.log`: malformed utility metadata reaches `getService().exists()` and buffers an actual Mongoose query before validation. | `core.ts` moves the single metadata-to-boolean normalization ahead of callback/row-query work. Invalid metadata now returns controlled 400 with zero callback/query admission; no utility authority is issued. |
| `helpers-01.log`: empty exposure keys recursively erase retained `_view`/`_edit` contents, including dotted metadata. | `acl/output-field-filter.ts` applies exposure selection only to top-level metadata entries. Retained presentation descendants remain DATA and still charge the common selected/native budget; no boolean fact or backend grant is recovered. Both former metadata failures pass. |

The other seven-file source changes are focused JSDoc clarifications for raw helper
freshness, negative predicates, utilities, metadata readers and detached configuration
inspection. Concurrency/materializer/source-engine fixes from OAR-03/04 are unchanged.

## Packed interruption and recovery diagnoses

All earlier logs remain read-only in `_tmp-oar05-20261031-205550/`.

| Evidence | Diagnosis and disposition |
| --- | --- |
| Predecessor `packed-01.log` | Fixture environment variable mismatch; `assert.ok(uri)` fails. Delivered harness now supplies the fixture's actual `MONGODB_URL`. No product bug. |
| Predecessor `packed-02.log` | Calls nonexistent `api.createRootRouter`. Delivered fixture correctly uses the existing public `api.createRouter(options)` root overload. No unrelated public factory was added. |
| Predecessor `packed-03.log`; recovery `packed-diagnostic-01.log` | Safe status/body diagnostics establish **`/helpers/_guard`, HTTP 401, Express default HTML `UnauthorizedError`**. Custom paths/mount/root overload are valid. `guard()` uses ordinary `next(error)`; the fixture lacked application error-channel JSON formatting. Its app now sends that **original error** through the public router's existing response handler, asserting RFC-9457 problem status and no partial DTO, not fabricating an access-router result. |
| Recovery `packed-diagnostic-02.log` | A shared observation array retained nonempty facts from the previous mode's legitimate normal queries/guards. Clear old observations at the start of each fresh helper probe, then assert every actual raw callback still receives frozen empty facts. No product/evaluator change or weaker assertion. |
| Recovery `packed-diagnostic-03.log` | Undici reports `UND_ERR_SOCKET` during a persistent-connection request. No authorization response/root cause was established by this failed transport run. The correctness-only fixture uses `Connection: close`, with path/completed-status diagnostics and no retry. Subsequent fresh runs pass; no persistent-connection performance or product-defect conclusion is claimed. |
| `packed-diagnostic-04.log`, `packed-final-01.log` | Fresh public helper workflow passes; final-01 also reruns the OAR-04 native gate on the current tarball. Superseded only by stronger all-database-method instrumentation, not discarded. |
| `packed-final-02.log` | Final current-byte helper/native gates pass. Actual debug methods are exactly **insertOne:1, findOne:14, updateOne:16**; raw/explicit/retired-control probes assert zero database operations of **any** kind. Read counters also include aggregate/distinct/count families, so no hidden alternative read can be ignored. |
| `prettier-before.log`; `format-proof-01.log`, `format-proof-02.log` | Five test/fixture files need formatting. AST auditor initially compares SourceFile's raw text, then transparent parenthesized types; these are auditor mismatches, not product semantic failures. Corrected `format-proof-03.log` proves all five prepared formatting candidates equal their authored files with unchanged semantic children. A later meaningful DB-counter addition to the packed fixture is verified by final-02, not called formatting-only. |

## Later owners — not exclusions or OAR-05 blockers

- **OAR-06:** full two-mode/default/setter/atomic bulk/undefined/in-flight/target/
  retry/warning/logger/deco/control-placement matrices. The bounded helper/HTTP/root/
  advanced rejection probes here do not complete that task. Legacy flag/profile
  suites, including `authorization-fast-path-runtime.unit.test.ts`, still require
  semantic migration; no old flags, prerequisites or dormant engine are restored.
- **OAR-07:** remaining document-validation/owner/deep-import and alternate
  write/upsert/dedicated/data/deco integration suites, including
  `finalizer-preparation.unit.test.ts`, `document-authorization-validation.unit.test.ts`
  and `authorization-fast-path-owner.unit.test.ts`. Preserve their input/rows/target/
  hydration/save/error/order/native security purposes. The **45-case service-finalizer
  file is migrated here**; do not leave it listed as entirely unmigrated.
- **OAR-08:** installed `MIGRATION.md`, README/llms/deco/website/JSDoc examples and the
  remaining old README/flag/handle/consumer guide fixtures. `packed-consumer-compatibility`
  still has eleven untouched, unselected broader artifact/install/legacy-example cases.
  No installed guide or complete peer/compiler matrix is accepted by this task.
- **OAR-09/10:** full allowed-package V3/V4/V6/V7, candidate profiles and fixed
  performance/retention gates, followed by independent acceptance. No current/minimum
  peer install matrix, timing/allocation claim or full-suite pass is inferred from
  the current-peer focused gates. OAR-04's older minimum-peer evidence is preserved,
  not relabeled as a current OAR-05 tarball run.
