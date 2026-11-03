> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FUSE-03 coordinator-ready handoff

**Disposition: implemented and boundary-verified private prototype, but performance
retention remains provisional / not established.** Do not treat reduced operation
counts or one anomalously slow OFF batch as sufficient retention evidence. No
security equivalence, historical/v0.51.0 parity, release or full-package claim.

Only FUSE-03 was implemented, plus the expressly permitted minimal independent
worker/core flag plumbing. The coordinator owns all task/status edits. This child
did not edit `docs/tasks`, spawn agents, commit/publish, change dependencies/locks,
or revert/discard any work. OIDC/example/client/root ESLint work was not edited.

Evidence directory: `_tmp-publication-fusion-fuse03-runtime-20261030-c92e/`.
All commands below ran from the repo root, serially. Paths are repo-relative.

## Changed files

Runtime (six files; the two already touched by FUSE-02 retain that earlier work):

- `packages/access-router/src/services/service.ts`
- `packages/access-router/src/output/finalize-model-output.ts`
- `packages/access-router/src/acl/document-authorization.ts`
- `packages/access-router/src/acl/output-projection.ts`
- `packages/access-router/src/acl/service-authorization.ts`
- `packages/access-router/src/output/include-output.ts`

New ordinary passing regressions (no `it.fails`, no legacy tests amended):

- `packages/access-router/test/output-publication-fusion-work.unit.test.ts` — 20
- `packages/access-router/test/output-publication-fusion-runtime.unit.test.ts` — 47
- `packages/access-router/test/output-publication-fusion-runtime.integration.test.ts` — 11

Minimal benchmark plumbing moved forward from FUSE-04:

- `scripts/benchmarks/access-router-core.mjs`
- `scripts/benchmarks/access-router-worker.mjs`

No README, release-note, website, interactive runner, runner-test, package metadata
or lock edits. Ignored scripts/artifacts are separate new evidence, not public APIs.

## Internal architecture and exact boundary

1. `Service.finalizeDirectOutput(execution, args)` now receives the genuine package
   execution from all actual query/write/template callers. `readServiceExecution`
   authenticates receiver/call; the output plan must own that call. Writes and
   write-derived reads retain the original tail, not an output-access heuristic.
2. Only active captured applicability selects module-private
   `finalizeServiceModelOutput(args, publication)`. Its **separate second argument**
   contains the package receiver/execution/source/completion closure. It checks the
   genuine issued root plan (`isServiceOutputPlan` uses existing planner ownership),
   exact request/model/root scope/accesses and pre-resolved stage/input, again at
   the synchronous tail. The fourth lexical argument to `finalizeSingleDoc` is
   not on public finalizer args, traversal `parentArgs`, a plan, context, DTO or handle.
   Recursive children never receive this completion.
3. `serviceOutputPublicationField` reads the stored configuration capture, not a
   native-normalized metadata copy. Eligible metadata is literally stripped, with
   a primitive safe top-level field name. `hasProducedIncludeOutput` checks actual
   attachments, including explicit empty attachments, not requested include paths.
4. `tryAssociateServiceOutputPublication` admits an ordinary fresh unassociated root
   and ordinary captured owner bindings. It retains the current bounded clone-free
   graph operation and exact root/descendant identities. Known embedded descendants
   must retain their exact association, same provenance/access/model and actual
   owning-document chain to **this row handle**, not merely an equal ID or call.
   Stale/replaced children reject; no association is refreshed or mutated.
5. Context creation remains the real `createServiceOutputContext`. On service async
   resume, the real execution and issued plan are reauthenticated, and
   `assertServiceOutputPublication` freshly re-admits the final graph and children.
   No earlier graph proof is retained across context/native work or an await.
6. A final seam check found inherited root setters can expose an intermediate root
   and then remove themselves. Before every eligible root write, **after selected
   value/native copying**, a local rejection-history latch records possible escape.
   Original writes/setter callbacks still run. Any such history forces the legacy
   detached copy, even if the setter removed itself. This latch is lexical, not a
   graph/owner certificate or public selector. Default/child writes retain their
   original assignments; children still get no completion or extra context.

Retained work: source isolation/populated-copy transfer/FK cleanup; row stage and
grants; original actor and every actual operation/document/field/getter callback;
detached source/hook/getter/grant/context/return inputs; early metadata-source copy
and metadata retention; independent recursive child calls/associations before the
detached parent getter; final structural admission/limits/identities/owners and the
one final root context. Limits remain 20,000 visits, depth 100, array length 20,000,
including repeated aliased/primitive visits and non-enumerable descriptor admission.

Omitted only on an eligible active root: intermediate root association/context and
package capture callback; the service post-finalizer whole-root isolation/normalization
copy; duplicate root transfer/publication. Child late owner/identity validation is
retained as a validation-only closed operation, not a transfer to the same child.

Fallback: OFF/dormant/missing/opposite prerequisites; emitted/dotted/open metadata;
produced includes/custom traversal/explicit related traversal; open bindings;
associated roots; unsupported graph shapes/native containers/subclasses; unproven,
strict, populate/related target descendants. Invalid graphs retain controlled errors.
Standalone finalizers/helpers, populate-target finalization, writes/write-derived
reads/templates and dedicated subdocuments stay original. A related LIST service's
own authenticated fresh root can be eligible; inherited mode alone never enables
standalone/populate-target publication. Assembled parents keep copy origins/fallback.

## Concrete work/risk evidence

Real six-row direct/public LIST: **12 -> 6 root contexts; 6 -> 0 post-finalizer
root copies; 6 document hooks and 1 adapter read unchanged.** Direct/public READ
and one-row LIST: **2 -> 1 contexts, 1 -> 0 copies**. Root HTTP READ+three-row LIST:
**8 -> 4 contexts, 4 -> 0 copies; 4 document hooks / 2 reads unchanged**. Opposite
READ/LIST masks reduce only their matching rows. Root admission count remains two
per eligible row because the final graph is re-admitted on async resume.

Embedded children are associated before a detached parent getter, retain their
actual handles in the final graph, and create **zero recursive ServiceOutputContexts**
(already true before fusion). Active roots keep those associated child objects;
legacy roots copy them. Same-ID child grafts across rows reject by owning-document
chain, not just provenance. Concurrent actual hooks reached peak 3, with row/call
ordering, independent handles/grants and detached mutable natives/returns retained.

Native counterexample remains explicit and ordinary passing:

| Mode | Date observations | Doc hooks | Getter | Name row rules | Virtual row rules | Later same-ID name |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Default publication (existing eight ON) | 3 | 2 | 1 | 2 | 2 | denied |
| Eligible active fusion | 2 | 2 | 1 | 2 | 2 | allowed |

The omitted third `Date.getTime` private service-copy observation changes a closure
used by the second **actual** document hook. Permissions were not skipped; their
later result changed. Default denial is unchanged. This intentionally weaker mode
is not authorization/security equivalent, even when ordinary benchmark outputs match.

## Final verification

- V1: `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`
  passed; final log `v1-final-v3.log`.
- V2: **2,547 tests in 64 files passed**, including **78 new FUSE-03 runtime tests**,
  all **356 FUSE-02 tests**, unchanged service/finalizer preparation, embedded,
  initial-copy, native snapshot/review/owner/context, public/helper/write/retry,
  include/populate/subdocument and retained-model/actor suites. Exact command/file
  list is in `v2-final-focused-v3.log` and `focused.mjs`; raw JSON is
  `v2-final-focused-v3-results.json`.
  Reproduce with `node _tmp-publication-fusion-fuse03-runtime-20261030-c92e/focused.mjs <new-alias>`.
- Scoped ESLint and Prettier over the 11 changed runtime/test/worker/core paths
  passed; commands in `v5-eslint-final-v3.log`, `v5-prettier-final-v3.log`.
  `git diff --check` passed (`v5-diff-final-v3.log`).
- Declaration/private-contract/artifact checks passed (`verification-final-v3.json`):
  16 Model/DefaultModel CJS/ESM option/JSDoc checks; unchanged public runtime export
  sets **46/48/6** and type export-name sets **186/322/17** per entry/format;
  no internal completion/selector/helper shipped as a public export or declaration.
  Public/traversal finalizer args are byte-for-byte unchanged. The legacy service
  copy/metadata/include/transfer/context tail is byte-for-byte unchanged.
- Verified **540 official before regular files**, **2,051 earlier query-evidence
  files**, **3,498 baseline runtime dependency files / 134 package records** and
  **548 final candidate regular files**. All **14 current dist files** match the
  measured final artifact; all **8 declarations** are retained. Other four workspace
  runtime dependencies' dist, lock, package metadata and public entry sources match
  the official baseline. Worker workload/response-check block and scenario definitions
  were verified unchanged against the official baseline hashes/source.
- Six real final-worker strict/dormant smoke jobs passed, separately for wide,
  document-rules and embedded (`strict-dormant-smoke-v3/summary.json`). These are
  smoke results, not retention timings. Requested/effective flags, both actual
  getter paths, hash/declaration manifests, output, hook/getter/read checks passed.
- **V6 is NOT green:** `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs`
  ran on the final build: **20 passed, 1 failed**. The unchanged assertion at
  `scripts/benchmarks/access-router.test.mjs:97` scans every raw-source quoted
  `unsafeSkip*SnapshotChecks` occurrence, so FUSE-02's prerequisite tuples produce
  12 occurrences instead of the six-name group. Actual six/two groups are unchanged.
  Leave the runner-test correction/third-group test completion to FUSE-04.
  Log: `v6-existing-runner-final-v3.log`; this is not mislabeled a passed gate.
- Final process check is `final-process-check.json`; no active build/test/Mongo/
  benchmark jobs or tool background jobs remain. All foreground drivers awaited
  worker closure and stopped their owned Mongo servers in `finally`.

First new concurrent-fixture run had one incorrect test setup: `_permissions` was
missing while Core reads that field, so row rules denied. Added the original actor's
map to the new fixture, not runtime permission changes; final runs pass. The
inherited-setter seam refinement above was necessary eligibility narrowing, not an
expansion. Vitest's future native-config-loader warning is non-fatal and unchanged.

## Fresh final artifact and paired uninstrumented timings

**Use `candidate-v3/`, not v1/v2, for the final source.** Earlier candidates/results
are retained separately, never overwritten. Metadata: `candidate-v3-metadata.json`.
Official before remains `_tmp-publication-fusion-fuse01-seam-baseline-20261030-a1f4/before-v1/`.

| Identity | Final candidate SHA-256 |
| --- | --- |
| ESM | `6a25bd0d008333f4261bda6f58285456501c56a573456f863c047a8aacae0ec4` |
| CJS | `62bd06f8a5b31f2d270585f68d1c07d0a12a635f83f024ee866cb8bbe3db983a` |
| Runner declaration hash | `86fb30b7bc7745783a600ea91aceeed819b6351dd352f7b2510697b01d62cd5a` |
| Dist manifest | `874b0e7d5875e774165509bee071fa8b23e4e8a0c98ace2c5180afae0c11f7ea` |
| Lock (unchanged) | `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` |
| Worker | `193210e5a393a530cde5a5cef98db14bab592da7ea786c41110740798d6cc547` |
| Core plumbing | `465e5baa0c25f1e9786b5a4998fee601c63c238c84bac352570d61b4458d6eb7` |

Before ESM is still `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca`;
before runner declaration hash `85a7fa10ea3fb85b55523f746015f99944aebc753548a6c710d42d562fd8f65e`.
HEAD is unchanged `46d85e87743b49f5891d5844233f5b7bdf6d31f0`, VERSION `0.62.0`.
Node `26.12.1`, pnpm `11.18.0`; actual measured peers Mongoose **9.11.4**, Express
**5.2.1**, Zod **4.4.3**, MongoDB **8.2.6**, identical across groups.

Final pilot: **18 uninstrumented jobs**, three independent unchanged workloads,
100 rows / 24 fields / 32 bytes / 1 client / hook concurrency 10 / 5 warmups /
50 measured requests each. Two alternating repetitions:
before-OFF -> candidate-OFF -> candidate-ON, then reverse group/scenario order.
Six comparison + two initial-copy flags requested/effective ON in every timed
group. Before has zero fusion declarations and runs supported OFF (no fake flags).
Candidate OFF/ON have two declarations and separately verified actual single/bag
getters on Source and Target; ON reports active LIST/READ prerequisites. **Only LIST
is timed**; READ settings have getters/runtime regression checks, not READ latency.

| Scenario / round | Before OFF median / p95 / CPU | Candidate OFF median / p95 / CPU | Candidate ON median / p95 / CPU |
| --- | --- | --- | --- |
| wide / 1 | 17.607 / 21.196 / 22.457 | 17.292 / 20.040 / 22.392 | 17.415 / 19.403 / 22.049 |
| wide / 2 | 17.120 / 19.984 / 22.430 | 17.177 / 20.209 / 21.945 | 17.361 / 20.283 / 22.061 |
| document-rules / 1 | 21.682 / 24.569 / 26.871 | 21.778 / 24.604 / 29.730 | 21.671 / 25.003 / 26.720 |
| document-rules / 2 | 21.287 / 26.035 / 27.926 | 24.280 / 26.750 / 29.933 | 21.610 / 23.367 / 26.569 |
| embedded / 1 | 53.305 / 58.498 / 64.150 | 53.042 / 57.999 / 63.833 | 53.491 / 58.079 / 65.854 |
| embedded / 2 | 52.813 / 60.759 / 64.532 | 53.227 / 58.597 / 63.343 | 52.070 / 55.956 / 62.403 |

All numbers ms/request. Every timed job is genuinely **lean**, 50 measured reads
(1/request), zero getters. Document-rules runs 5,000 document hooks (100/request);
other scenarios zero. The unchanged worker does not count individual field callbacks;
the separate native/concurrent regressions do. CPU is Node server+client, excluding
MongoDB; HTTP latency includes loopback/serialization/parsing. Setup/warmup excluded.

Fingerprints match each scenario across every before/OFF/ON job:

- wide `165d378f09870e575203f9e2c8f012b0778715ecc0c2fdd9b03f4bd436536ea3`
- document-rules `1c6e7ecaf6f8e6c2f4d6b57530734750466ff5a9a96869ed3d05641979c070ae`
- embedded `4a32e28713aa14dc5248f87eda344bb089958fc984d4c50598c278651f656f13`

Original first/final exact response, ordinal order, hidden denial, 24-field denial
on 50 non-owner document-rule rows and four filtered embedded children remain checked.
Raw jobs/samples/getter/flag/hook/read/fingerprint evidence is in `pilot-v3/summary.json`
and its 18 job/result/log sets. V1/V2 exploratory 18-job sets remain in `pilot-v1/`
and `pilot-v2/`, but precede the final setter-escape eligibility refinement.

**Gain is not established.** Final wide ON is 0.7–1.1% slower than same-candidate OFF;
embedded is +0.85% then -2.18%. The document-rules -11% second OFF comparison is
confounded by an anomalous 24.28-ms OFF batch; ON is essentially unchanged / +1.52%
versus the official before. p95/CPU differences vary. Earlier exploratory pilots
also showed small/inconsistent latency benefit. Do not claim a relevant repeatable
gain or silently expand unsafe omissions to improve these numbers.

## FUSE-04 / FUSE-05 handoff and remaining gates

- Core now supplies independent `UNSAFE_OUTPUT_PUBLICATION_FUSION_FLAGS`, declaration
  discovery, OFF/ON/BOTH candidate construction, literal flag options and
  off/dormant/active prerequisite labels. Original six/two ON meanings are unchanged.
- Worker requires the declaration/hash manifest, applies only supported flags,
  verifies both actual getter paths and records requested flags, per-operation
  effective modes and getter evidence outside timing. Workload/response checks are
  unchanged. Ignored `flag-plumbing-checks.mjs` passed old/partial/comment-only/duplicate/
  unknown support rejection, independent eight-candidate cross-product, all eight
  missing prerequisite checks and ignored getter failures.
- FUSE-04 still owns interactive selection/report columns/docs, committed runner
  third-group/old/partial/dormant tests, the raw-source-regex failure, packed/examples/
  release/publication contract completion. Do not interpret minimal pilot plumbing
  as delivery of that whole task.
- FUSE-05 must decide retention/withdrawal from repeatable relevant gain and guard
  evidence. Current evidence supports only a **provisional prototype**, not retention.
  Full V3 package/typecheck/packed/docs, V4 downstream, completed V6 and 10/100-row
  narrow/hydrated/global/large-config/populate/virtual guard/performance gates remain
  unrun/incomplete here. FUSE-06 independent review also remains separate.
- If the relevant gain cannot be established, withdraw/reconcile the runtime mode
  rather than retaining additional security risk from operation counts alone. This
  child stopped before FUSE-04 and did not expand the private seam after the pilot.
