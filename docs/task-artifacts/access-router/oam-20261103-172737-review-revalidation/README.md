# OAM-05 independent re-review after F1/F2 remediation

## Decision

**ACCEPT the scoped OAM-01–04 code/contract delivery, including F1/P1 and F2/P2
remediation. OAM-05 overall remains BLOCKED: required root `pnpm test` failed.**
No new substantive OAM code finding was established. This is not complete repository
acceptance, security certification or performance certification.

The completed logs supersede the anticipated blocker: **Docker-backed Redis tests
passed in this round.** Root testing instead failed in `mongoose-rxdb` BroadcastChannel
Unix-socket setup. The supplementary no-bail run also recorded an unexplained
`express-oidc-vault` `ECONNRESET`. Therefore this is **not a Docker-only blocker**;
nor is the second failure established to be infrastructure-only.

Same independent **REVIEW-05**, 2026-11-04, resuming the original review, not an
implementer. Read the updated [task](../../../tasks/20261103-172737-access-router-output-authorization-modes.md),
new [runtime remediation](../oam-20261103-172737-runtime-remediation/README.md) and
[integration revalidation](../oam-20261103-172737-integration-revalidation/README.md),
both verification records, original rejection, source and maintained regressions.
Prior-owner reports were references, not substitutes for fresh verification.

The [original rejecting review](../oam-20261103-172737-review/README.md) and its
input hashes remain unchanged. This new README and [verification.json](verification.json)
are the only new nonignored deliverables. No product/maintained-test/docs fixes,
task/status edits, agents, commits, publication, manual dependency changes,
Docker/system changes or Redis-harness changes were made. Normal maintained
packed-consumer suites performed their own isolated consumer installations.

## Input identity and incremental review

HEAD stayed `c68451e40b99ca545dc52a46c287b32949980d26`, plus incoming uncommitted
OAM work: **37 modified tracked files / 17 untracked files**. All **69 protected
incoming inputs** stayed byte-identical throughout this review, including the
coordinator task, original rejection and new handoffs. Their sorted compact
path-to-SHA256 JSON aggregate is
`4f140efbc9793c0cdb6bcf6a4ee320663b877734209b51ec13a1afb61a2ea3bc`.
An additional **13 inspected source/harness files** matched HEAD and stayed unchanged.

Against the original review's 55 inputs, **51 remain identical**; the only changes
are the coordinator-updated task and the three delivered production fixes below.
The two new regression suites also match the implementer's delivered hashes.
Exact hashes are preserved in the JSON.

- `packages/access-router/src/acl/service-authorization.ts`: all four record stores.
- `packages/access-router/src/acl/document-stage.ts`: source/root/reference ownership,
  capture registration, scoped readers and cleanup.
- `packages/access-router/src/services/service.ts`: every production reference reader,
  recipient registration, cache identity and finalization.
- `packages/access-router/test/write-output-origin-ownership.unit.test.ts`: 14 cases.
- `packages/access-router/test/write-output-source-lifetime.unit.test.ts`: 25 cases.

Reviewed actual incremental diffs, not only the total diff against HEAD. The first
two reviewed-source scratch copies matched original review hashes before comparison.
For `service.ts`, reversing only the inspected scoped-reader edits in memory reproduced
the original reviewed SHA256 exactly. No historical source was restored or overwritten.
Current root ESM SHA256 is
`897ab60e087dc749044d85a96bbd4626e0cac98d12bd21ec50e2d4af2521230c`.

## Finding resolutions and independent adversarial evidence

**Fresh independent probes: 1 file / 15 passed; zero failed, pending or todo.**
The original four scenarios were reconstructed in fresh scratch, with expanded
ownership/copy checks. Original post-close _bug observations_ were not retained as
desired behavior: raw identity is positively checked while active, then absence is
required after settlement. No maintained assertion was weakened or skipped.

### F1/P1 — resolved: provenance absence belongs to the record

`service-authorization.ts:storeCallRecord` (line 187) is the sole `calls.set` site;
generic resolution, write-entry issuance, output-child issuance and query/related/
embedded derivation all use it. The stored record has a null prototype and owned
data slots for absent `queryOrigin`, `writeOrigin`, `writeOutputBranch`,
`fieldPolicyOwner` and lazy `view`. Internal literal/spread construction does not
consult inherited marker getters. Genuine branch/binding/purpose checks remain.

The original generic CREATE-shaped parent/related-target attack now stays isolated:
parent and target write markers are false; target mode is isolated; actual captured
target-hook mutation leaves stage value `original` and Date time `1`. Inherited
values and getters installed both before and after construction are ignored;
getters are not invoked. The maintained 14-case suite additionally covers generic
custom/dedicated negatives and own slots across positive query/retry/write/UPSERT/
embedded/related derivations.

This resolves the demonstrated trusted-process prototype issue; it does not claim
a request-only exploit, row/field bypass or general prototype-pollution immunity.

### F2/P2 — resolved: publication-owned raw-link lifetime

`document-stage.ts:450–615` stores each root original under **source + call**, not
on the returned preparation. Descendant claims count exact raw identities per
publication under weak normalized keys. Cleanup is registered **before reference
capture for every publication**, including non-collection writes, and releases
each recorded claim rather than deleting a root key and assuming descendants vanish.

`output-publication.ts:140–166` retains stop/drain/clear ordering. Production
reference readers in `service.ts` pass the actual publication at cache identity,
recipient registration, private-row lookup and traversal. Foreign or ambiguous
scope returns undefined; repeated identical claims remain counted and unambiguous.

Independent results: retained real trusted CREATE **and UPDATE** hook arguments
are detached; active root lookup returns the exact live saved document, but after
operation settlement returns only the held argument itself. Retained detached
descendants recover no raw target after closure, scoped or unscoped. Include working
rows also release originals. During admitted callback draining links remain until
terminal settlement, then clear. Conflicting sibling owners survive either close
order; same-publication ambiguity/repeated claims do not invalidate another owner.

The maintained 25-case suite additionally passed real write success/failure,
ordinary/collection owners, scalar/array/dotted references, partial-capture failure,
same-call reuse, foreign-source reuse and unvisited trusted-graph checks. These are
private exact-link lifetime checks, not public recovery or retained-heap measurements.

## Acceptance reconciliation — all groups

Source references below are within `packages/access-router/src/` unless qualified;
bare filenames refer to those named above or the `acl/` subsystem. Each group was
reconciled against current mechanisms and fresh passing V2 assertions.

| Group                                     | Reconciled source and evidence                                                                                                                                                                                                                                            | Decision    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| OAM-01 matrix/ownership/design            | Linked design; private write/output children, canonical workers and target-local selection agree; no unresolved ownership rule.                                                                                                                                           | Pass        |
| OAM-02 four names/values/defaults         | `interfaces/root.ts`, `acl/authorization-modes.ts`, `runtime.ts`; exactly four independent optional literal modes, isolated defaults and undefined restoration.                                                                                                           | Pass        |
| Placement/atomicity/warnings/decorators   | Shared `validation/public-admission.ts`, runtime draft publication and decorator preflight; presence-based inherited/non-enumerable/dotted controls, no getter/proxy observation, atomic failure, warnings and inert business names.                                      | Pass        |
| Capture/READ-LIST compatibility           | `acl/model-output-planning.ts`, `model-service-owner.ts`, authorization/execution derivations; pre-await capture, READ retry/reentry and the independently repeated related-native reconfiguration probe.                                                                 | Pass        |
| Genuine output-only phase                 | Dedicated issuers, branch/access/binding/purpose/publication checks; generic/custom/dedicated negatives including F1; original input execution/query-token identity retained.                                                                                             | Pass        |
| Mandatory write detachment/native/bounds  | `acl/document-stage.ts` and existing materializer; both modes detach live `_doc`, payload/native storage and earlier helper fallbacks; conversion failures reject; unsupported graphs and structural limits remain enforced.                                              | Pass        |
| Input/persistence/lifecycle/facts         | Canonical `service.ts` workers and unchanged `acl/model-input-admission.ts`; hydrated pre-update hook, row/field admission, validation/preparation/save/snapshots/changes and independent frozen pre/post facts; no invented CREATE input facts or extra saves/refetches. | Pass        |
| Branches/bulk/alternate entries           | Write modes suite and real HTTP/root integration; direct/public CREATE/UPDATE, both internal/public UPSERT branches, opposite captured modes, bulk same-ID rows and initiating operation/access retained.                                                                 | Pass        |
| Embedded/related/private/getter ownership | Related derivation, finalizer/include/virtual-populate engine and write-populate/dependency suites; target-own READ/LIST modes, embedded owning facts, private argument-four/native/getter isolation and target-before-getter ordering.                                   | Pass        |
| Identity/cache/receiving budgets          | Exact scoped reference identities, per-plan cache, preregistered recipients and independent attachment copies; mixed modes, shared/equal-ID targets and depleted receiving budgets in the 49-case write-populate suite.                                                   | Pass        |
| Failure/draining/settlement               | Existing publication engine plus F2's counted releases; retained hooks, late-resume tombstones, prefix failure and active sibling owners; output failure remains nontransactional.                                                                                        | Pass        |
| Excluded origins/independent calls        | Issuer call sites and helper/dedicated/count/NEW/delete/distinct/custom negatives; separate nested READ/LIST captures never inherit write provenance.                                                                                                                     | Pass        |
| Actual omitted work                       | Fresh source/view identity and materializer assertions in maintained suites, plus two independent copy probes; counts below, no timing claim.                                                                                                                             | Pass        |
| OAM-04 installed surface/guidance         | Full strict/packed/documentation consumers, metadata/build entries and independent emitted-surface inspection; root/advanced/processors preserved, no private issuer/reader exports or supported output-prefixed alias.                                                   | Pass        |
| OAM-04 tooling/history                    | Both full benchmark selections, actual READ/LIST getter proofs and fail-closed declaration conditions; query-only labels disclaim write timing; complete original inventories unchanged.                                                                                  | Pass        |
| OAM-05 final repository gate              | V2/build/lint pass, but required root test and supplementary test run fail as detailed below.                                                                                                                                                                             | **Blocked** |

The ordinary write-stage counts remain **one mandatory source materialization in
both modes**, plus **one isolated / zero trusted disposable hook-view copies**.
The trusted hook receives the stage source; isolated does not. Write-target root
materializations remain **two isolated / one trusted**, excluding owning-parent
admission, per-attachment copies, conversion and other selected work. Native/live
storage remains detached. No speedup, allocation or heap-size claim is made.

## Fresh commands and required gate results

All top-level build/type/test commands were awaited serially. Recursive tests kept
`--workspace-concurrency=1`; the runner also supplied `npm_config_workspace_concurrency=1`.
Node `v26.12.1`, pnpm `11.18.0`, Vitest `4.1.11`; existing dependencies/Mongo/browser
prerequisites. Fresh `_tmp-oam05-revalidation-20261104-075213` was confirmed ignored.
Every runtime command used its absolute checkout path as `TMPDIR`.

Executed command bodies, repository-root workdir; replace quoted placeholders and
choose a fresh ignored scratch directory for reproduction. Prefix each body with
`TMPDIR='<repo-root>/_tmp-oam05-revalidation-20261104-075213'` and
`npm_config_workspace_concurrency=1`. The JSON preserves argv, workdirs, timestamps
and exits. These commands were not rerun after the usage-limit interruption:

```sh
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router test --reporter=default --reporter=json --outputFile.json=../../_tmp-oam05-revalidation-20261104-075213/access-router-v2.json
pnpm --filter @web-ts-toolkit/access-router-deco test --reporter=default --reporter=json --outputFile.json=../../_tmp-oam05-revalidation-20261104-075213/access-router-deco-v2.json
node --test --test-concurrency=1 scripts/benchmarks/access-router-owned.test.mjs scripts/benchmarks/access-router-owned-batch.test.mjs
node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs
pnpm build
pnpm test
pnpm lint
```

Both benchmark commands additionally used:

```sh
WTT_BENCH_TMP='<repo-root>/_tmp-oam05-revalidation-20261104-075213' WTT_BENCH_LEGACY_ROOT='<repo-root>/_tmp-oar01-20261031-153820/baseline-artifact' WTT_BENCH_CANDIDATE_ROOT='<repo-root>'
```

| Gate                                       | Actual result                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 typecheck/transitive build              | Pass, exit 0                                                                                                                                                                    |
| Full unfiltered access-router script       | **201 files / 6,964 passed**, zero failed/pending                                                                                                                               |
| Full unfiltered decorator script           | **23 files / 779 passed**, zero failed/pending                                                                                                                                  |
| Full owned + batch benchmark selection     | **29/29**, zero failed/cancelled/skipped/todo                                                                                                                                   |
| Full shared-runner + integration selection | **29/29**, zero failed/cancelled/skipped/todo                                                                                                                                   |
| V3 root build                              | Pass; **31 top-level completed workspace build entries**, exit 0                                                                                                                |
| V3 required root test                      | **Exit 1**, stopped at mongoose-rxdb; **5,907 passed / 21 failed / 1 todo**, zero automatic skips in completed lane summaries; **323 unhandled rejections** separately reported |
| V3 root lint                               | Pass, exit 0                                                                                                                                                                    |
| Independent probes                         | **1 file / 15 passed**, zero failed/pending/todo                                                                                                                                |
| Independent emitted surface                | Pass: 64 optional exact-mode properties, 14 private names absent; runtime exports **46/48/6**, declarations **200/336/17**, both conditions                                     |
| Historical inventories                     | Six identical passing snapshots, including post-resume read-only verification                                                                                                   |

Fresh full-package assertions include **14 + 25** remediation cases, prior write
suites **40 + 47 + 49**, strict consumers **49 + 6**, packed consumers **13 + 4**,
documentation cases **92 + 18**, and decorator mode cases **77**. Combined V2
packages: **224 files / 7,743 passed**. No name filters or test weakening. Shipped
MIGRATION bytes and current source match; scoped guidance/source searches and
declaration alias/inheritance inspection agree with the four-option contract.

The independent scratch command was:

```sh
pnpm exec vitest run --config _tmp-oam05-revalidation-20261104-075213/vitest.config.mts --reporter=verbose --reporter=json --outputFile.json=_tmp-oam05-revalidation-20261104-075213/review-probes.json
```

Its temporary implementation is omitted, not an archived continuation dependency.
The scenarios above and maintained regression paths preserve the useful protocol.

## Remaining root-gate blockers and exact next owner action

### B1 — review-run temporary path exceeds Unix-socket capacity

Required root testing completed the earlier packages and **all five attestation
lanes** (Node/Redis/Mongo/browser/packed: **618/62/31/141/12 passed**), then failed
mongoose-rxdb: **9 failed / 36 passed files; 21 failed / 611 passed assertions**.
All 21 primary failures report `listen EINVAL` from `broadcast-channel@7.4.0`,
`dist/esnode/methods/node.js:333`, below this run's `pubkey.bc` temporary directory.
The recorded socket addresses are **123–124 bytes**. The dependency derives these
addresses from `os.tmpdir()` and explicitly notes the socket-path length limit.

A bounded socket-only diagnostic under this run's scratch confirmed **93-byte
listen succeeds; 123- and 124-byte listens fail with EINVAL**. The review's chosen
long TMPDIR is therefore an unsuitable test environment for this dependency. This
is not a demonstrated OAM or SQLite mutation regression. Supplementary reuse of
that failed temporary area also produced BroadcastChannel channel-count errors.
No directory clearing, dependency patch, backend substitution or test bypass was attempted.

**Environment/test owner:** choose a **fresh, short-named ignored repo-local
`_tmp*` directory**, check its resolved absolute socket paths fit the platform
limit, set absolute `TMPDIR` accordingly, and rerun the complete root `pnpm test`
serially. Do not reuse/clear another run's BroadcastChannel directory or disable
the SQLite tests. This proposed rerun was **not performed** and is not a pass claim.

### B2 — supplementary logout request reset remains unexplained

Authorized supplementary command, same root workdir and runtime environment:

```sh
pnpm -r --if-present --workspace-concurrency=1 --no-bail test
```

It completed **25 package test scripts: 23 passed / 2 failed**, exit 1. Across 34
completed Vitest lanes: **19,521 passed / 22 failed / 1 todo**, zero skipped in
summaries, plus **323 unhandled rejections**. The failures were mongoose-rxdb again
and `packages/express-oidc-vault/test/logout-navigation.test.ts`, case
`rejects text/plain before form parsing`: **`Error: read ECONNRESET`**, before its
expected 415 assertion could complete. That package had passed **2,449/2,449** in
the mandatory root run; this supplementary invocation had **2,448 passed / 1 failed**.

**Vault/test owner:** investigate the request-reset discrepancy and establish a
passing complete root run; do not dismiss it as harmless flakiness or infrastructure
without evidence. The failing package paths match HEAD and are outside the OAM
diff, but no clean-baseline root test was run and no cause/regression attribution
is claimed. No unrelated code/test fix is included in this review.

The no-bail run independently passed access-router **6,964**, decorator **779**,
client **954 + 10**, runtime **135**, React **268 + 268 + 18**, and all Redis-store
tests **462**, among the other successful scripts. It exposes remaining lanes;
it does **not replace or turn green** the mandatory failed root command.

An early read-only Docker diagnostic did report the configured Desktop daemon
unavailable. Later actual mandatory **and supplementary** Redis lanes passed with
unchanged real-Docker harnesses and no skips. Preserve both observations: the early
diagnostic is not proof of Docker failure during the completed gates. This reviewer
made no daemon/context/configuration change and does not attribute that transition.
The original review's 62 automatic Redis skips are historical, **not this run's result**.

## Historical artifact preservation

Used the original `_tmp-oar01-20261031-153820/baseline-artifact` as legacy root,
never the current candidate. Read the original descriptor, dependency identities,
sealer algorithm and curated baseline provenance. The sealer was never imported or
executed; no artifact/dependency/historical evidence was built, installed, resealed,
restored, overwritten or deleted. A fresh verifier wrote only this run's scratch.

Full inventories passed **before**, **after-owned**, **after-shared**, **after-v3**,
**after-supplementary** and **after-resume**, with identical snapshots:

- **552 artifact files**, **14 build files / 8 declarations**, all **7** recorded
  source entries and the unsafe-source fixture.
- **134 dependency packages / 3,510 files**, full recorded manifests/package metadata,
  **214 installed edges / 6 originally absent optional edges**, **33 package links /
  39 symlink identities**; Mongoose/Express/TypeScript **9.11.4/5.2.1/6.0.3**.
- Original descriptor SHA256
  `ebf499b00923e35e7fd5404a2d4aa42dec058e22b01f65ce6664f8900ca6dbd9`;
  artifact inventory SHA256
  `7229a35eeb5a712707d32d47fb9bc4177b8d9e033f86d782cf0f0ef5c3f45f9a`.

The JSON preserves remaining inventory hashes/counts. This checks compared bytes,
recorded edges and observed symlink identities, not authenticated signatures,
hermetic installation or old timing claims. Original exclusions remain exclusions;
the environment-dependent historical artifact/dependencies are not vendored here.

## Hygiene, omissions and handoff

Reviewed the scratch inventory; only this curated README/JSON merits preservation.
Raw assertion/log trees, disposable probe/verifier code, generated consumers/builds/
tarballs, caches, databases, sockets and original historical dependency/artifact
trees are omitted. This is not a self-contained executable replay bundle. Diagnostic
socket/channel identities and machine-local paths are intentionally not archived.

Final checks **passed**: JSON/count/hash reconciliation, both files' Prettier checks,
**133 relative links/anchors** across this report and six guidance files,
**23 source/file references**, targeted privacy/credential review, scratch
ignore/durable non-ignore checks, tracked and all untracked whitespace checks, and
unchanged protected inputs/HEAD. Only new-file formatting and the scratch checker's
website directory-index resolution needed correction; maintained guidance stayed
unchanged. ESLint explicitly ignores root `_tmp*/**`; package test/type/build scopes
exclude root scratch. Git ignore alone was not treated as tool exclusion. No
successful feature gate was rerun after interruption.

**Coordinator:** F1/F2 and scoped OAM-01–04 code acceptance are resolved. Keep OAM-05
**blocked**, reconcile B1/B2 with their environment/test owners, then require a
complete passing root `pnpm test` without substitutions/skips. Task/status belongs
to the coordinator and was not edited. No blanket callback isolation, external
freshness, rollback, retained-heap, remote-exploit or universal speedup claim is made.
