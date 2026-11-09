# Access-router test separation — final review index

**Current outcome: blocked on ARTS06-F1 (exact public-name TypeScript alias bypass).**
The fresh independent [ARTS-06 review](arts-06-review.md) reports all V3 commands
passing, but does **not** accept the boundary guard. The coordinator owns the
[task/status](../../../tasks/20261108-094712-access-router-test-contract-separation.md).
A fix must receive a new identity and independent acceptance; no historical seal
should be edited to imply this tree already contained it.

## Actual final-run evidence on this identity

| Selection | Passed cases | Passed files |
| --- | ---: | ---: |
| Standalone contracts | 3,158 | 103 |
| Standalone invariants | 3,078 | 64 |
| Standalone internal | 1,481 | 51 |
| Exhaustive default, once | **7,717** | **218** |

No failures/skips/todos. Layer guard command, source typecheck with filtered build,
and scoped ESLint also passed. These green commands do not detect ARTS06-F1.
Full commands ran serially, foreground, without filtered runtime selections.

- [Command exits/times, tested identities, full declarations, finding and comparisons](arts-06-verification.json)
- [All actual current case observations and original/additive joins](arts-06-cases.jsonl)
- [Independent source/fixture/config/matrix review and precise blocker](arts-06-review.md)

All **7,565 original cases + 59 guard cases + 93 companions** passed in standalone
and default. Exact file union/disjointness is verified. **7,715 raw case identities
match between runs**; two pre-existing Date/ObjectId-generated titles are explicitly
mapped by unchanged constructor/parameter/location, with every raw title retained.
Do not describe that as literal raw-title equality. All 248 original file bodies
reconstruct baseline bytes by reversing only the 1,093 logged repairs; all eight
fresh declarations and 152 sources remain intact.

## Phase provenance and authoritative records

The initial [README](README.md) and [baseline manifest](bundle-manifest.json) are
**sealed historical ARTS-01 evidence**, not a current status index. They and all
later historical records remain unchanged. This new index supersedes none of them.

| Phase | Read these records | Status/provenance distinction |
| --- | --- | --- |
| ARTS-01 baseline/classification | [Report](arts-01-report.md), [identities](identities.json), [declarations](declarations.json), [exports/surfaces](public-surfaces.json), [classification](classification.md), [gap plan](coverage-gaps.md), [verification](verification.json) | Fresh original 7,565/211 baseline; planned destinations and then-open public gaps are historical. |
| Original file/assertion/caller joins | [Migration ledger](migration-ledger.json), [preservation ledger](preservation-ledger.jsonl), [baseline expanded cases](runtime-cases.jsonl), [support callers](support-callers.json), [starting patch](starting.patch) | F001–F248 remain stable; whole-file preservation, not retired or replaced cases. |
| ARTS-02 mechanical moves | [Report](arts-02-report.md), [exact repairs](arts-02-preservation.jsonl), [path audit](arts-02-path-audit.json), [focused cases](arts-02-focused-cases.jsonl), [verification](arts-02-verification.json), [manifest](arts-02-manifest.json) | Whole-file 97/64/50 move and 37 supports; focused 1,145/26 pass, not final full verification. |
| ARTS-03 commands/guard | [Report](arts-03-report.md), [verification/59 guard IDs](arts-03-verification.json), [manifest](arts-03-manifest.json), [checkpoint verifier](arts-03-verify-checkpoint.mjs), [maintained guard guide](../../../../packages/access-router/scripts/README.md) | Historical accepted delivery and known development failures; final reviewer found ARTS06-F1 on this exact tooling identity. |
| ARTS-04 companions | [Report](arts-04-report.md), [coverage guide](arts-04-coverage.md), [34 gap/23 surface/93 case mapping](arts-04-coverage.json), [verification](arts-04-verification.json), [manifest](arts-04-manifest.json) | Additive public cases, actual 93/6 focused pass; no original rewrites. |
| ARTS-04 exporter cleanup | [Report](arts-04-cleanup.md), [exact edit/case verification](arts-04-cleanup-verification.json), [manifest](arts-04-cleanup-manifest.json) | Supersedes only the exporter file hash; its two case titles/assertions/locations are unchanged. Not two extra cases. |
| ARTS-05 contributor guidance | [Report](arts-05-report.md), [reconciliation](arts-05-reconciliation.md), [verification](arts-05-verification.json), [maintained test guide](../../../../packages/access-router/test/README.md) | Documentation/static reconciliation, not a runtime/full-run pass. |
| ARTS-06 independent review | [Review](arts-06-review.md), [verification](arts-06-verification.json), [fresh cases](arts-06-cases.jsonl) | All full gates actually executed; acceptance blocked by the concrete guard reproducer. |

## Verifier and reproduction boundaries

- [Baseline verifier](verify-baseline.mjs) can inspect recorded Git-baseline inputs;
  it is not the current maintained public boundary gate.
- [ARTS-02 verifier](arts-02-verify-preservation.mjs)'s complete `verify()` intentionally
  expects the old config/tree. It is **not valid against the delivered ARTS-03+
  configuration**. Do not rewrite it. ARTS-06 separately used its exported
  `restoreOriginal`/`analyze` for exact original-byte/AST checks and used the unchanged
  [ARTS-03 checkpoint](arts-03-verify-checkpoint.mjs) for current tooling/metadata.
- The final verification JSON identifies all **37 historical artifacts**, applicable
  seal chains, current companion/cleanup/guide identities and fresh declarations.
  Future repair evidence must append a new identity, not change these records.
- Commands using `'<repo-root>'` require replacement before execution. Scratch paths
  are historical disposable locations, not required archive inputs. Use a fresh
  ignored repo-local directory and absolute `TMPDIR`; serialize package builds/tests.

Curated case rows omit full reporter/log metadata and per-case timings. Dependency
trees, generated consumers/tarballs/builds, Mongo data and scratch audit utilities
are not preserved. The archive is not hermetic: runtime reproduction still needs
the recorded tools/dependencies, Mongo/installation access and existing read-only
prebuilt CLI fixture. No root/grouped/downstream suite, unrelated CLI/release build,
new benchmark campaign, speed claim or universal compatibility proof is implied.
Manual reflection/dataflow/generator review remains necessary; a static gate is not
a sandbox. No jobs remain from this review.
