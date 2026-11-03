> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-10 independent review — BLOCKED on installed documentation

## Findings first

### F1 — P2 / required documentation blocker: live README still promises removed output handles

**Paths and statements:**

- `packages/access-router/README.md:251–252`: “Output handles remain bound to their original request/runtime/model/scope” and cannot be reused by a replacement runtime.
- `packages/access-router/README.md:1390–1391`: “same-execution handle picks retain the original decisions” after private hook inputs and permission metadata are removed.
- `packages/access-router/README.md:2384`: include results have the target's “own authorization and document handle”.
- `packages/access-router/README.md:3202` also retains “output copying/handles” terminology.

These are present-tense instructions in live runtime/migration/include guidance, **not** historical before-examples. They contradict the same README's no-handle contract, shipped `MIGRATION.md` M3, removed `DocumentAuthorization`/helper options and the actual implementation. In particular, the 1390 promise tells an installed consumer that a later pick can retain document-dependent decisions after private inputs have been trimmed. It cannot: raw picks deliberately use EMPTY facts and no document hook/read. Normal current-document authorization requires a fresh normal operation.

**Reproduction/evidence:** the actual flattened production tarball and fresh extracted installed README have SHA-256 `f7ef32eb5ac2cd111b04ecb0483442a5239ee37824af0e4f087d0144d9b3fa6b`, equal to the current source README. `EVIDENCE-AUDIT.json` rehashes all four saved installed layouts. Fresh packed tests 2/6 and 4/8 demonstrate raw picks dropping document-dependent fields, zero added reads/hooks, fresh normal calls resolving new facts and DTO/metadata replay supplying no authority. The strict installed negatives reject the removed handle import/context/option.

**Impact:** contradictory authorization-migration guidance ships to consumers/assistants, despite correct runtime rejection/EMPTY semantics. This is not a demonstrated runtime authorization bypass. Required complete, truthful installed migration guidance is not met: **C5, M3/M5, OAR-08 and OAR-10**. The performance exception does not waive documentation.

**Required resolution by a separate authorized implementer:** correct the live prose to DTO-as-data/fresh-query semantics and private in-flight target construction, without restoring handles or changing runtime behavior. Audit the remaining live handle references in the shipped README; preserve explicitly labeled historical examples. Add a focused prose regression check. Reconcile actual packed docs and their byte manifests, then independently re-review.

### F2 — P2 / required documentation blocker: data-helper callback arity is described incorrectly

`packages/access-router/README.md:1543–1546` says request-only data permission functions receive original-request `this` and **“only its permissions argument.”** Current `DataCore.genAllowedFields`, `pickAllowedFields`, and `genSelect` instead supply `[permissions, EMPTY_DOCUMENT_GRANTS]` (`src/core-data.ts:96–99,119–122,147–150`); shared schema invocation passes the second argument (`src/core-shared.ts:337–340`). The public `FieldPermissionHook` is two-argument. Request-only means **empty document facts**, not one argument. Operation `GuardHook` remains one-argument and should not be conflated with field callbacks.

The inaccurate statement is in the same byte-identical shipped README as F1. It contradicts **C3, M5 and the OAR-08 installed-contract requirement**. Consumers implementing/migrating shared model/data field functions receive incompatible instructions. No runtime defect is claimed. A separate documentation owner should state the two-argument EMPTY contract and preserve the one-argument operation-guard distinction, with a focused prose/type/runtime check.

## Verdict and scope

**OAR-10 acceptance is blocked by F1/F2.** No product fix or task-status change was made. Investigation stopped on confirmed required-documentation defects; this is not a “no blocking findings” verdict, security certification, commit permission or release authorization. The coordinator alone reconciles the shared task and assigns any implementation/re-review.

The review considered the redesign from `58b22c0d6d3abd4ecce03533e3867d148ff21233` through user HEAD `a1996e10f8339d89fc8a0aa2b10f7b531f5a07ca`, plus the incoming uncommitted helper/guard/collection/benchmark changes and new files, not merely the HEAD diff. `committed-redesign.diff`, `incoming.diff`, entry/exit source manifests and the traceability below define the scope. Source review was risk-focused, not a claim that every changed test/line or every application integration was exhaustively reviewed.

This reviewer is fresh and not an implementer/integrator/measurer; no agents were delegated. The interrupted independent review packet was read-only. Its code/proofs were audited before reuse; copied runtime/auditor execution used this new exclusive packet and a fresh Mongo data directory. The current reviewed/tested/measured root ESM is:

`e131659e5cdd9f5052cd15060b498669f5e044c559b35f3abbe0780f18753f4e`.

## Checks actually executed in this finalization

All execution was foreground, sequential and awaited; exact argv/environment/exits are under `logs/` and in `COMMANDS.json`.

| New check | Actual result / provenance |
| --- | --- |
| Entry preservation against interrupted reviewer entry | PASS: same HEAD/status; 1,999 source, 67 dist and 247 focused evidence records; 69 incoming status paths. New capture protects 147 old-review fixture/log/package/link records, excluding old caches/Mongo storage. |
| Read-only G-A verifier at entry and finalization (`02`, `12`) | PASS: all 614 source/19 tool/681 candidate files/48 links/67 dist/595 F-V product records; original 134 packages/3,510 files and tool 293 packages/10,545 files; runtime binaries/lock; 5,055 prep packet entries/39 bindings. Only coordinator task excluded from measured source pins. The verifier's historical `NOT_MEASURED` label is preparation metadata, not this review's campaign disposition. |
| Actual packed API + real Mongo runtime (`05`) | **26/26 pass**, zero failed/skipped/cancelled. Byte-identical copied prior fixture; five actual production tarballs, 81 closure files/19 core files, read-only installed dependency links; NOT a fresh registry install or new minimum-peer matrix. New Mongo data path only. |
| Four complete source cross-path suites (`07`) | **405/405 pass**, zero failed/pending: `owned-authorization-stage`, `owned-authorization-modes`, `owned-authorization-publication`, `authorization-fast-path-native`. Private fresh Vitest config/cache; no package script or shared-dist rebuild. Includes wrong bindings, target-local modes, READ retry, write/new/dedicated origins, closed/late generation, native/receiver bounds, poison/drain and no partial output. Existing suites, not newly authored cases. |
| New strict installed consumer (`08`) | Five compiler conditions: Bundler, Node16 ESM/CJS, NodeNext ESM/CJS; **skipLibCheck=false + strict + noUncheckedIndexedAccess**. Thirteen type equalities and all three method/getter forms compile; 18 distinct unsuppressed negative statements reject in each condition (23 actual diagnostics/condition, 115 total). No `any`/assertion casts or error suppressions. Real eight shipped DTS files, root/advanced/processors public imports only. |
| Independent raw mathematics (`06`) | Inspected prior independent-review stdlib-only auditor, copied byte-for-byte and freshly executed; imports no benchmark math. Original **456 jobs / 39,200 responses**, exact order/repeats/fingerprints/counts/raw stats/pairs/gates; B1 **124 / 12,400**, exact descriptive triggers. Both new outputs byte-equal prior review calculations. No benchmark/worker/timing rerun. |
| Prior evidence integrity (`11`) | F-V 2,741 packet files/16 bindings; G-B 2,518 files/seven links/67 bindings rehashed. All ten required prior command/result/log identities and exits audited; actual JSON assertion counts checked. Four saved installed 19-file layouts, verification/compiled fixtures and document hashes rehashed. Former transient peer `node_modules` trees are not retained; actual peer versions are recorded prior-run evidence, not freshly inspected installed peers. |
| Exit preservation and process closure | See `exit-preservation-result.json`, `CLOSURE.json`, `final-processes.txt` and review/packet seals. No product/status/old focused-evidence changes; no owned Mongo/build/test/server jobs. |

### Failed attempts, retained rather than relabeled

- New `03`: setup/auditor expected Node TAP `#` summary strings; the old log used Node spec reporter `ℹ`. Saved `prepare-checks-attempt01.py`; corrected only the evidence parser and reused this packet's partial private extraction. `04` passed. Its `links: 0` meant zero **newly created** links on that attempt; `consumer-actual-links.json` independently inventories **37 actual read-only dependency links**.
- New `09`: evidence auditor used checkout-relative rather than packet-relative G-B seal bindings. Saved `evidence-audit-attempt01.py`.
- New `10`: evidence auditor assumed old transient consumer `node_modules` still existed. Saved `evidence-audit-attempt02.py`; corrected to the preserved actual `installed/` bytes plus hashed verification/compiled evidence. `11` passed. No product/evidence-byte correction or test waiver.
- Prior interrupted reviewer: runtime attempt01 missing private `@fast-csv/format` link; attempt02 20 pass/6 fail; attempt03 26 pass. The exact fixture delta adds declared private `ownerId`/`suspended` inputs and confines actor/fact identity assertions to the document stage while retaining raw EMPTY checks (`prior-fixture-correction.diff`). Its initial raw audit failed an overly exact dependency-object assertion; corrected code checks actual required versions without discarding extra metadata. All originals/logs remain untouched.
- The copied fixture's 17 MiB allocation is inside its **own overridden `toObject` callback**. It tests opaque callback exclusion/normalized-return rejection; it is **not** a fresh proof of canonical Mongoose allocation. The separate actual canonical observation remains historical F-I/F-V/G-A evidence, not relabeled here.

## Reused full gates, not new executions

F-V actual command/result/log hashes and JSON statuses establish **6,046 core/187 files**, **742 deco/23**, **827 focused/16**, source/downstream types, affected lint/format/diff and **45 original runner tests**. The first full core failure (6,045 pass/one fail) remains preserved. The source manifest was reconstructed **after** gates; chronology/reproduced diff/installed/rebuild identities support reuse, not a nonexistent pre-run cryptographic attestation.

The four original installed peer/layout matrices × five compiler conditions are reused: minimum Express 5.0.0/Mongoose 8.0.0 uses strict + skipLibCheck=true; current Express 5.2.1/Mongoose 9.11.4 uses false. Saved npm-flat versus actual assembled-dist layouts are distinct, each 19 files; the assembler's workspace manifest/file overrides are not a CLI publication. F-V's ten exact guide TS blocks and saved runtime/negative results remain evidence. New strict tests above supplement, not replace or rebrand those matrices.

G-A's 54 runner tests (45 old + nine new), 180 original smoke jobs/eight preflights/32 B1 smoke jobs and 50 copied-artifact counter observations are prior evidence. They were not rerun and are not timing acceptance. No new 6,046/742 suite, workspace check, build, registry install, minimum-peer installation, campaign or optimization occurred.

## C1–C6 and approved refinements: traceability and limits

All paths below beginning `src/` or `test/` are under `packages/access-router/`.

| Requirement | Independently examined implementation / evidence |
| --- | --- |
| C1 original actor, distinct policy dimensions, trusted-code limits | Read `src/permission.ts`, `acl/service-authorization.ts`, `model-service-owner.ts`, `model-input-admission.ts`, public admission and receiving paths. Private Permission storage/capture, exact binding and separate operation/rows/input/output/related normalization remain. Packed tests and 405 cross-path controls pass. Callback closures/native/external state are intentionally not sandboxed or guaranteed fresh. Not universal security equivalence. |
| C2 one call / private document stage / DTO publication | Read full `document-stage.ts`, `output-publication.ts`, prepared execution/query, selected finalizer and relevant service/include/related receiver construction. Private WeakMaps key opaque calls/stages/construction, not reusable returned DTO authority; generation/open checks precede async commits; publication closes/poisons then drains/clears. Source cross-path suites cover ownership/close/decorate/late work. Full original-actor/related/input test universe was not individually re-proven from scratch. |
| C3 immutable literal facts and proper callback contexts | Read sole `document-grants.ts` normalizer and invocation boxing, actor capture, shared evaluator, pre-write resolution/use, exact `model-output-context.ts` shell. Invalid fulfillment stays outside hook-error fallback. Packed invalid maps/bounds/missing/throw/reject/pre-write negative tests and new public types pass. Mutable lifecycle prepare/save remains distinct. **F2 blocks installed callback guidance.** |
| C4 two source-only modes | Read `authorization-modes.ts`, runtime atomic setters/warnings, mode/call/related/retry derivation and public controls. 405 controls include target-local mode, embedded inheritance, READ retry, write/new/dedicated isolation and both getter paths. No live ten-flag selector/third engine was observed; retired keys remain rejection inventory. |
| C5 no exported authority / fresh raw helpers | Read helper normalizer/selection/filter, Core/Base entry, public export maps and retired context/type diff. Packed ESM/CJS exports are **46/48/6**, no issuer/deep-import escape. Same-ID/DTO/metadata/replay cannot supply document facts; helpers add no document hooks/DB reads. **F1 blocks required live installed migration guidance.** |
| C6 selected/native/diagnostic work | Read full `trusted-output-materialization.ts`, bounded snapshot copier, finalizer, publication, include/populate recipient accounting and input normalizer retention. 405 tests include inclusive 20,000/depth100, denied/protected accounting before observation, Code.scope/DBRef/wire/native depleted receiving budgets, multiplicity/offsets, caught poison and late close. This is bounded library traversal, not all native internals/RSS. |
| Resolved OAR-01 details | Examined one state machine, result boxing versus thenable assimilation, EMPTY/doc-hook context allowlist, separate pre/post-write facts, stage closure before presentation, shared publication drain and diagnostic rather than handle exports. No public cancellation/condition-purpose issuer observed. Existing 07A mechanism retirements were not undone: original 295-registration/594-proof ledger is retained; not freshly remapped registration-by-registration here. |
| Approved 09E facts-only guard | Read private exact-receiver reader, `PublicService.#readById`, execution purpose/retry, shared `Service.#fetchOnePrepared` and condition consumer, middleware error mapping. One fresh prefix/stage, no output DTO/field/virtual/decoration/task/override work is intentional. Packed broken-output guard controls pass; ordinary DTO still errors. Direct service admission is not falsely described as generated HTTP operation admission. Prior hash-bound H4 zero versus normal DTO 24 controls audited as prior evidence. |
| Approved 09F collection + budget revision | Read dense descriptor/control admission, one-capture all-source-first loop, separate row/stage/memo EMPTY resolution, bounded ordered scheduler/publication and cumulative `output-work-ledger.ts`. Packed 1,000/1,001, duplicated-native isolation, fresh next-call, preflight, poison/drain/no-partial checks pass; public FilteredOutput checks pass. Opaque Mongoose/native/dependency allocation, trusted effects and engine enumeration are explicitly excluded. Normalized returns must debit router work before the next owned copy; no row reset. Exact 200,000/16 MiB canonical seam controls remain reused F-V/G-A evidence, not freshly rerun in full. |

## M1–M5 installed-package agreement

- **M1:** inspected MIGRATION facts grammar, typed function/string/array examples, expensive-unused-fact costs, invalid-map errors and empty-versus-throw behavior; compiled public types and runtime facts controls agree.
- **M2:** inspected removed-member inventory, immutable allowlist versus legitimate lifecycle work, isolated/trusted native/closure caveats and guard output-effect migration. Source contexts/packed checks agree within examined paths.
- **M3:** inspected raw EMPTY/presentation/fresh normal query alternatives, private hook inputs, checked success, +1 explicit read costs and no default Many migration. MIGRATION is explicit and correct on these points; **live README F1 contradicts it**.
- **M4:** inspected all ten keys, atomic/restoration/warning behavior, target mode/READ retry/write-origin/deco/rollback guidance. Historical CHANGELOG flag notes are explicitly superseded at lines 42–51, not treated as live guidance or a reason for unrelated cleanup.
- **M5:** inspected root/advanced/processors package metadata, tsup bundled ESM setup, both declaration forms, public type-only result, JSDoc and negative removed APIs. Metadata/types/new compiled cases pass. **README F2 contradicts the public two-argument data field contract**. These are actual shipped prose gaps, not a request for cosmetic/source-comment cleanup.

## Performance honesty and accepted exception

The independently executed raw auditor confirms **70/90**, not 90/90: three confirmed trusted adverse comparisons and 18 sign-unstable comparisons overlap once, leaving exactly **20** failed IDs. They match the task's explicit accepted list **exactly**; all three isolated primary benefits, six retained-heap gates and six fresh-read allowances pass. Original 360 + 96 jobs and B1 64 + 60 jobs/repeat settings/order/fingerprints/raw CPU/nearest-rank p95 and paired deltas remain unchanged.

The accepted trusted adverse observations remain virtuals/100 median +15.87% / 2.7914 ms and p95 +17.51% / 3.6618 ms; H3-global/10 CPU +19.48% / 1.7608 ms; H3-global/100 median +25.12% / 8.5167 ms, p95 +27.41% / 10.6866 ms and CPU +26.32% / 10.9531 ms. Both H4 misses are sign instability, not a reopened guard-semantic blocker.

B1 has **zero acceptance gates**. Many's roughly 5–6% higher 100-row latency versus current independent helpers and generally lower CPU remain disclosed; trusted historical query-plus-handle median is +19.31%/+41.59% at 10/100 rows. One capture, N fresh captures and old issued handles are not freshness/authority-equivalent. No default migration, historical Many API, H3 substitution, query-p95 arithmetic, pooled cross-campaign causality, true allocation totals, Mongo CPU or statistical certainty is inferred. Five historical campaigns remain 75/81/78/73/70, separately preserved.

The user's explicit performance exception is respected at the task-disposition layer. Immutable numerical seals correctly retain acceptance=false. **F1/F2 are documentation defects, not an attempt to reopen accepted performance or authorize optimization/timing.**

## Handoff boundary

Return F1/F2 to the coordinator for a separate authorized documentation owner and independent re-review. Preserve this blocked review and all old failures. No blanket runtime/security acceptance is claimed for remaining unexamined application behavior or alternate paths. No task completion, commit, publish or release action is authorized by this packet.
