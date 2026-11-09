# Access-router test separation — accepted post-F1 index

**Accepted on 2026-11-09 after independent ARTS06-F1 re-review and every post-repair
V3/V4 gate. No unresolved blocker remains.** The same non-implementer reviewer
verified the repair and retained the earlier blocked history unchanged.

The coordinator owns the [shared task/status](../../../tasks/20261108-094712-access-router-test-contract-separation.md).
This new index records acceptance; it does not edit that status or rewrite the
historical [FINAL.md](FINAL.md), [first review](arts-06-review.md), or baseline
[README](README.md). Their earlier blocked/pending statements describe prior phases.

## Actual post-repair results

| Complete selection | Passed cases | Passed files |
| --- | ---: | ---: |
| Standalone contracts | 3,158 | 103 |
| Standalone invariants | 3,078 | 64 |
| Standalone internal | 1,498 | 51 |
| Exhaustive default, once on repaired identity | **7,734** | **218** |

All had **zero failures, skips/pending cases or todos**. Layer discovery/dependency
check, fresh filtered build/typecheck, scoped ESLint and the final new F1 preservation
checkpoint passed. Foreground sequential shell gates used 3,000,000 ms timeouts;
none timed out, and no complete runtime selector was used. Saved unchanged-identity
standalone passes were verified after interruption, not needlessly repeated.
The historical 7,717 default and current 7,734 default are **two reviewer executions
overall, exactly one per identity**.

- [Independent repaired-source/context review, findings, gates and limits](arts-06-f1-review.md)
- [Exact argv/exits/times, reviewed hashes, full declarations, probe observations and audits](arts-06-f1-verification.json)
- [All 7,734 actual default case observations and standalone/default joins](arts-06-f1-cases.jsonl)

All **7,565 original cases + 93 companions + 59 old guards + 17 F1 guards** passed
in both standalone/default. Full original bytes/AST/assertions/setup/parameter
records remain protected across **248 originals / 1,093 exact repairs**. Default
files equal the disjoint physical/discovered **103 + 64 + 51** union.

Raw case-set equality is **not claimed**: exactly two unchanged original Date/
ObjectId constructor titles vary. **7,732 raw standalone/default identities match**;
the two exact constructor/ordinal/location mappings and every historical/current
raw observation are preserved. No blanket normalization or original-test edit.
The narrowly mapped logical union is exact, including occurrence-qualified duplicates.

## Phase provenance

| Phase | Authoritative evidence | Meaning |
| --- | --- | --- |
| ARTS-01 baseline/classification | [Report](arts-01-report.md), [identities](identities.json), [declarations](declarations.json), [surfaces](public-surfaces.json), [classification](classification.md), [gaps](coverage-gaps.md), [verification](verification.json), [manifest](bundle-manifest.json) | Actual original 7,565/211 baseline; then-planned moves/gaps remain historical. |
| Original joins | [Migration ledger](migration-ledger.json), [preservation records](preservation-ledger.jsonl), [expanded baseline cases](runtime-cases.jsonl), [support callers](support-callers.json), [starting patch](starting.patch) | Stable F001–F248 identities; no original case retirement or behavioral rewrite. |
| ARTS-02 moves | [Report](arts-02-report.md), [exact repairs](arts-02-preservation.jsonl), [path audit](arts-02-path-audit.json), [focused cases](arts-02-focused-cases.jsonl), [verification](arts-02-verification.json), [manifest](arts-02-manifest.json) | Whole-file 97/64/50 migration and 37 support files; exact inverse/AST proof, focused 1,145/26 pass. |
| ARTS-03 original tooling | [Report](arts-03-report.md), [59 guard cases/verification](arts-03-verification.json), [manifest](arts-03-manifest.json), [old checkpoint](arts-03-verify-checkpoint.mjs) | Original command/guard delivery; later found to have F1. Old three tooling hashes are historical. |
| ARTS-04 public companions | [Report](arts-04-report.md), [coverage guide](arts-04-coverage.md), [executable matrix](arts-04-coverage.json), [verification](arts-04-verification.json), [manifest](arts-04-manifest.json) | 93 additive cases / six contract files; 34 gap rows, 23 surfaces, 97 original public files retained. |
| Exporter cleanup | [Report](arts-04-cleanup.md), [exact edits/cases](arts-04-cleanup-verification.json), [manifest](arts-04-cleanup-manifest.json) | Supersedes one file identity only; same two cases, not extra coverage. |
| ARTS-05 guidance | [Report](arts-05-report.md), [reconciliation](arts-05-reconciliation.md), [verification](arts-05-verification.json), [maintained guide](../../../../packages/access-router/test/README.md) | Documentation/static reconciliation, not the subsequent full runtime result. |
| ARTS-06 first independent review | [Blocked review](arts-06-review.md), [verification](arts-06-verification.json), [7,717 cases](arts-06-cases.jsonl), [historical index](FINAL.md) | All pre-repair gates passed, but actual exact-public-name TS alias bypass blocked acceptance. |
| ARTS06-F1 implementation | [Handoff](arts-03-f1-report.md), [exact patch](arts-03-f1-changes.patch), [new identities](arts-03-f1-manifest.json), [red/green and 59+17 cases](arts-03-f1-verification.json), [new checkpoint](arts-03-f1-verify-checkpoint.mjs) | Three-file repair; repository versus finite installed contexts, context-qualified caches, 17 appended guards. Focused implementation verification, not self-acceptance. |
| ARTS-06 post-F1 acceptance | [Independent review](arts-06-f1-review.md), [verification](arts-06-f1-verification.json), [7,734 cases](arts-06-f1-cases.jsonl) | Actual corrected independent 20-probe campaign, every complete post-repair V3 gate and original/evidence preservation audit passed. F1 closed. |

## Identity and verifier boundaries

Only the three maintained tooling identities listed in the F1 manifest differ
from original ARTS-03. All old guard bytes remain the exact 16,006-byte prefix.
All **152 production sources**, **eight fresh declaration files**, public ESM/CJS
export-name sets (**46/48/6**), runtime metadata/dependencies/exports, companion
bytes and guides remain protected. All **46 prior artifacts / 422 delivered inputs**
were unchanged throughout review; the coordinator task entry is a review-time
snapshot, not a prohibition on the coordinator's subsequent status handoff.

- Use [arts-03-f1-verify-checkpoint.mjs](arts-03-f1-verify-checkpoint.mjs) for the
  repaired identity. It passed again after the final default build. The old
  ARTS-03 checkpoint intentionally expects three old hashes; it was not represented
  as a passing current gate or edited to conceal the repair.
- ARTS-02's complete `verify()` expects its old config/tree. The independent review
  instead uses its preserved `restoreOriginal` / `analyze` exports for complete
  original byte/AST/assertion comparison, plus the new F1 checkpoint for current
  source/API/tooling identities.
- Current finite installed inventory is **28 = 25 originals + three ARTS-04 export
  modules**, plus **13 exact literal producer sinks**. The unchanged checker guide's
  “25” is clarified in the [new review](arts-06-f1-review.md#finite-installed-context-review-and-inventory-clarification),
  not used as a broad exemption or silently rewritten historical claim.

## Reproduction and limits

Exact commands are preserved with quoted `<repo-root>` placeholders; replace them
before execution. Use fresh ignored repository-local scratch and absolute runtime
`TMPDIR`; serialize all builds/test commands. Historical scratch utility commands
are provenance and cannot run from the archive alone. Curated cases, two dynamic
raw-title mappings, probe protocol/results, identities and final audit are retained;
full logs/reporters/timings, disposable scripts/fixtures, consumers/tarballs/builds,
dependencies and Mongo data are omitted.

This is not a hermetic archive: recorded tools/dependencies, runnable Mongo,
registry/cache availability and the existing read-only prebuilt CLI fixture remain
prerequisites. No root/grouped/downstream tests, unrelated CLI/release build, new
benchmark campaign, runtime-speed claim or universal compatibility proof is implied.
Static boundary enforcement is not a sandbox; reflection/arbitrary dataflow and
reviewed generator/configuration transformations still require manual review.

All new JSON/JSONL, links/anchors, hashes, privacy, ignore status and whitespace,
historical/input preservation and `git diff --check` passed final audit. No build/
test/package-manager/Mongo job remains from the review. No implementation, original
test, shared task or historical artifact was edited by the reviewer; no further
agent, commit, reset or manual deletion occurred.
