# ARTS-06 post-F1 independent reacceptance — accepted

**Accepted on the repaired identity: ARTS06-F1 is closed, and every post-repair
V3/V4 gate passed.** This is the same independent non-implementer reviewer who
reported the original blocker, not an implementation self-acceptance. The reviewer
changed only disposable review work and these four new acceptance artifacts.

The [first blocked review](arts-06-review.md), its [verification](arts-06-verification.json),
and historical [FINAL.md](FINAL.md) remain unchanged. They describe the earlier
identity, not this result. [ACCEPTANCE.md](ACCEPTANCE.md) is the new phase index;
the coordinator alone owns the [task/status](../../../tasks/20261108-094712-access-router-test-contract-separation.md).

## Repaired identity and finding resolution

Reviewed baseline: `fe50475fd026d70aad52bc54b1c6d3d41dbc885b` plus the delivered
uncommitted separation, companions, cleanup, guide and exact three-file F1 repair.
The [repair patch](arts-03-f1-changes.patch), [manifest](arts-03-f1-manifest.json)
and [handoff](arts-03-f1-report.md) were checked against the actual maintained code,
not accepted solely from the implementer's green report.

| Maintained F1 file | Reviewed SHA-256 |
| --- | --- |
| `packages/access-router/scripts/check-test-layers.mjs` | `0cc36200e1e443f31660dcc270736921c17ad1b8e0230a4eaa2b3d52feec69da` |
| `packages/access-router/scripts/test-layer-consumers.mjs` | `1cf87d0d32147969acd3656d138e32d80d071b083a83a133f441c4ab59521334` |
| `packages/access-router/test/internal/test-layer-boundaries.unit.test.ts` | `cc6b884c3551ade2be9bb4a805f937ecc11042ddf6751fec8bf64a1136a433b4` |

Actual [moduleEdge](../../../../packages/access-router/scripts/check-test-layers.mjs#L255)
now checks effective TypeScript resolution before trusting an exact public name
in repository context. Inherited `paths`, wildcard subpaths and `baseUrl` targets
are checked; private targets are rejected and actual built public entries remain
valid. Vite alias handling remains ahead of the boundary return.

Context follows the incoming edge, not a public-support pathname or synthetic
filename. Ordinary imports, setup, type re-exports, generated siblings and exact
recipe bodies retain their importing context. Finite staged installed inputs use
their own compiler/runtime context. Both physical-file and parsed-module caches
include that context, so an installed-first visit cannot hide a repository edge.
Installed context still rejects private source/chunk/deep imports.

### Independent negative and positive probes

A fresh independent fixture campaign passed **20 probes**, without importing or
editing production implementation. Complete curated observations and protocol are
in [arts-06-f1-verification.json](arts-06-f1-verification.json):

- All three exact public names, runtime/type edges, direct/inherited aliases:
  installed TypeScript independently resolved the targets to private source, and
  the repaired checker rejected them (**12 probes**).
- Inherited wildcard advanced/processors aliases (**2**) and baseUrl-only root/
  advanced/processors aliases (**3**) likewise rejected actual private resolutions.
- An installed-first read followed by ordinary import of the same fixture still
  rejected the repository private alias; changing the installed input to a private
  deep name also rejected it (**1 compound probe**).
- A finite installed producer accepted its legitimate public module, but unlisted
  producers, ordinary generated-sibling imports, private generated sources and a
  stale target did not gain a waiver (**1 compound probe**).
- Aliases to the three actual built public declaration entries passed (**1**).

The implementer's preserved red-before/green-after evidence remains in
[arts-03-f1-verification.json](arts-03-f1-verification.json). Its expected old-guard
failure and initial appended-import lint failure are historical, not concealed.
The new independent probes assert corrected rejection, unlike the first review's
exit-zero probe that successfully reproduced the bypass. No new blocker was found.

### Finite installed-context review and inventory clarification

The actual packed/strict/doc/tree-shaking producers, emitted file lists, package
staging and compiler/runtime invocation paths were inspected. Their staged configs
do not extend repository configs or inherit repository `paths`/`baseUrl`. The
role distinction therefore avoids inventing source edges in legitimate installed
consumers; it does not excuse a repository import merely because the file is also
compiled elsewhere.

Current policy has **28 filesystem-fed installed inputs = 25 unchanged original
consumers + three unchanged ARTS-04 installed export modules**, plus **13 exact
literal/constant/joined producer sinks**, keyed by file, line and write target.
The audit independently matched each sink to one actual `writeFileSync` call and
recorded its complete call hash. Ordinary imports remain repository edges; the
three recipes, document inventories and failure-only exceptions remain finite.
There is no whole-file, public-support-directory or all-generated-source waiver.

The unchanged [checker guide](../../../../packages/access-router/scripts/README.md#consumer-modules-and-reviews)
still says “25”; that is the original consumer inventory, not the current total
after explicitly listing the three ARTS-04 modules. This supplement records the
narrow clarification without rewriting either protected guide or an old seal.
Novel generators/config inheritance still require manual review.

## Actual complete post-repair gates

All commands ran **foreground, awaited and sequentially**, from repository root,
with shell tool timeout **3,000,000 ms**. Fresh scratch
`_tmp-arts-06-f1-q3rnc64f/` was confirmed ignored; `TMPDIR` was its absolute path
at runtime. No complete runtime command used a file/name selector. Exact argv,
UTC timestamps, exits, elapsed times and raw reporter identities are preserved
in [the new verification record](arts-06-f1-verification.json).

| Actual command | Actual result | Command seconds |
| --- | --- | ---: |
| `pnpm --filter @web-ts-toolkit/access-router test:layers:check` | Pass: exact disjoint 218-file union; public graph 137 files / 237 modules | 3.052 |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Pass, including normal five-package filtered/transitive build | 27.853 |
| `pnpm --filter @web-ts-toolkit/access-router test:contracts` | **3,158 passed / 103 files** | 1,480.671 |
| `pnpm --filter @web-ts-toolkit/access-router test:invariants` | **3,078 passed / 64 files** | 252.611 |
| `pnpm --filter @web-ts-toolkit/access-router test:internal` | **1,498 passed / 51 files**, including all 76 guards | 134.543 |
| `pnpm --filter @web-ts-toolkit/access-router test` | **7,734 passed / 218 files**, one exhaustive post-repair default | 1,930.697 |
| Scoped `pnpm exec eslint` on `src`, `test`, `scripts`, all five `vitest*.ts` files | Pass | 9.127 |

Every full runtime report has success true and **zero failed, pending/skipped or
todo cases**. All post-repair gate commands exited zero; none timed out. Normal
Vite future-native-config warnings remained visible and unsuppressed. The final
default ran from **2026-11-09 14:56:28.813543Z to 15:28:39.510927Z**.

After the interruption, saved standalone command records and complete reporters
were parsed and all **46 historical artifacts / 422 delivered inputs** rehashed
against the pre-run snapshot before default continued. They were unchanged, so
the completed standalone layers were not repeated. Each complete layer ran once
on this identity. There have been **two reviewer default executions overall**:
the historical pre-repair 7,717 pass and this post-repair 7,734 pass, one per identity.

Environment: Linux x64; Node **v26.12.1**, pnpm **11.18.0**, TypeScript **6.0.3**,
Vitest **4.1.11**, tsup **8.5.1**, Express **5.2.1**, Mongoose **9.11.4**,
mongodb-memory-server **11.2.0**. Real Mongo integration, existing scoped packed/
bounded publication fixtures and installed Bundler/NodeNext/Node16 positive and
negative consumer compiles ran in contracts and default. The existing prebuilt
CLI fixture was read-only. No root/grouped/downstream suite, unrelated CLI build,
broad release build or new benchmark campaign ran. Existing benchmark/protocol
tests ran only as part of their required package layers; no speed claim is made.

## Original preservation and actual case joins

The reviewer independently repeated original preservation after the final default
build, using ARTS-02's exported `restoreOriginal` / `analyze`, not its obsolete
whole-tree/config `verify()`:

- All **248 original test/support files** match exact relocated identities.
  Reversing only the **1,093 logged repairs** reconstructs every Git-baseline file
  byte-for-byte. Complete AST/group/body/assertion/parameter/directive/statement
  records match, including setup, cleanup, expected values and negative diagnostics.
- Verified totals: **2,615 groups, 2,246 static cases, 11,254 assertion-looking calls,
  849 parameterizations, 411 directives, 4,245 top-level statements**. These counts
  supplement full bytes and record equality; they are not the preservation proof.
- All **7,565 original expanded cases + 93 companions + 59 old guards + 17 appended
  F1 guards = 7,734** map to actual standalone/default observations and passed in
  both. The old 7,717 review joins remain intact; the delta is exactly the 17 F1
  additions, not duplicate exporter cleanup runs or repaired original expectations.
- Every old guard body/location remains in the exact **16,006-byte prefix**,
  SHA-256 `598a101c59855c35c910622150991b457a2830e8c357f8c0e0045df8047cd6d7`.
  The 59 runtime titles/locations/occurrences also match the old review and F1 seal.
- All 93 companions and their 10 test/support files retain approved bytes, with
  only the earlier exporter-cleanup hash supersession. Reversing its precise edits
  and appended teardown still recovers its original ARTS-04 identity.
- Actual reporter file sets and current file hashes form an exact disjoint union:
  **103 + 64 + 51 = 218**, equal to actual default/Vitest discovery/physical inventory.
  Nine excess duplicate titles across seven original files remain occurrence-qualified.

### Two explicitly bounded dynamic-title observations

Literal raw standalone/default case-set equality is **false**: **7,732/7,734** raw
identities match. **7,563/7,565** original raw titles match baseline. The only two
differences are the original constructors already preserved in baseline bytes:

1. F069 [hydration configuration](../../../../packages/access-router/test/contracts/hydration-configuration.test.ts#L44),
   parameter **5**, `new Date()` at line **49**, reporter **55:5**, baseline ID
   `7808e59186dafb8ccc3f348e112fa0b5bf6b2728bf3d97301d78fdee18758be4`.
2. F185 [authorization reads](../../../../packages/access-router/test/internal/service-authorization-reads.unit.test.ts#L48),
   parameter **3**, `new mongoose.mongo.BSON.ObjectId()` at line **48**, reporter
   **48:107**, baseline ID
   `3ab8981df936a03553fd539563a031d2b4f3b732b5281329331a621bcad115ea`.

Only those exact full-title shapes, file IDs, constructors, ordinals, locations and
occurrences are joined to their baseline IDs. All baseline, historical pre-repair,
new standalone and new default raw titles/IDs are preserved in the new verification
record. All other titles/locations/occurrences compare exactly, including every
companion and old/new guard. No generic Date/ObjectId/title stripping or original
test rewrite occurred. The resulting narrowly mapped logical case union is exact.

[arts-06-f1-cases.jsonl](arts-06-f1-cases.jsonl) preserves all 7,734 raw current
default observations, original/additive joins and both passed statuses. The two
different standalone observations are separately preserved in verification JSON.
Old ARTS-03 IDs remain opaque historical IDs; F1 case IDs are derived from the
sealed full title/location/occurrence tuple, not retroactively added to its record.

## Matrix, source, API and evidence checks

The actual acquisition/mode/ownership/denial/callback/export/consumer review in
the [first independent review](arts-06-review.md#actual-boundary-matrix-and-caller-review)
remains applicable: complete bytes of all originals/companions/guides are unchanged,
and every runtime family was executed afresh on the repaired tooling. The F1 change
does not replace those checks with the compiler-context role inventory.

The executable [ARTS-04 matrix](arts-04-coverage.json) still reconciles **34 gap rows,
23 surfaces, 97 retained public files and 93 unique companions**. All 16 source
mode tuples retain their six primary operations (**96 actual operations**), with
independent target READ/LIST, capture/fallback/upsert/detachment, real overflow/
drain and public metadata/HTTP/data/parser/processor/installed-entry obligations.
No private constructor, capability/stage/budget fabrication, package mock or
package-method spy was introduced. Consumer-owned model/hook seams remain legitimate.

All **37 support/caller mappings**, **25 normalized original installed sources**,
**16 root derivations** and **three exact recipes** were independently rechecked.
Stable CRUD/setup/global setup paths remain intact; dormant legacy private source
is unchanged and uncompiled. Unchanged grouped build/read assumptions were reviewed
statically, not tested through an out-of-scope grouped run.

The new [F1 checkpoint](arts-03-f1-verify-checkpoint.mjs) passed both before gates
and **after the final fresh default build**. It reverses only the exact three-file
repair in memory, matches all preimages to sealed ARTS-03, and checks the unchanged
old guard prefix/statements. The old ARTS-03 checkpoint is **not a valid positive
gate for the new hashes** and was not invoked or relabelled passing.

All **152 production sources**, package metadata/dependencies/export maps and
unchanged script/config inputs remain protected. Only the original approved test
scripts/shared-config migration and exact three F1 tooling edits differ from their
respective historical states. All **eight rebuilt declaration filenames and bytes**
match baseline, and ESM/CJS export-name sets remain **46 / 48 / 6**.

All **46 prior artifacts**, including both blocked-review seals and F1 repair
evidence, remained byte-identical throughout. All **422 captured delivered inputs**,
including the coordinator task snapshot, remained unchanged during this review.
Only these four new durable records were added. The verification record includes
the historical inventory, reviewed identities and final strict JSON/JSONL, case-ID,
link/anchor, privacy, whitespace, ignore, preservation and no-jobs audit results.

## Limits and handoff

Full raw logs/reporters, per-case timings, disposable audit/probe implementations,
fixture/consumer trees, tarballs/builds, dependencies and database data are omitted.
Their relevant report identities, command provenance, curated cases and finite
probe observations are retained. Historical scratch commands need omitted utilities;
they are provenance, not runnable archive entrypoints. Normal dependencies, Mongo/
registry availability and an existing prebuilt CLI fixture remain reproduction
prerequisites. The preserved verifiers/ledgers and current maintained gates can be
run with fresh ignored repository-local scratch and absolute runtime `TMPDIR`.

The guard is not a sandbox, general taint/interprocedural analysis or universal
semantic-independence/compatibility proof. Reflection, novel loader/filesystem/
process/compiler APIs, arbitrary object/closure dataflow and transformations inside
reviewed generators still require manual review. Two original generated title
values are nondeterministic; their raw-title inequality is explicit, not hidden.

**Handoff: accepted; no unresolved blocker.** Coordinator may reconcile shared task
status using this supplement. No shared-task/historical/implementation/original-test
edit, further agent, commit, reset or manual deletion was performed by this reviewer.
All commands completed; no queued/background build/test/package-manager/Mongo job
remains from this work.
