# OAM-04: post-remediation V2 revalidation

**OAM-04 V2 and integration criteria pass on the remediated inputs; no OAM-04
blocker or integration correction was found.** Original INTEGRATE-04, 2026-11-04,
`c68451e` plus coordinator-reconciled uncommitted OAM work. Ready for the same
independent REVIEW-05 recheck, **not final feature/V3 acceptance**.

Read the complete updated [task](../../../tasks/20261103-172737-access-router-output-authorization-modes.md),
[remediation handoff](../oam-20261103-172737-runtime-remediation/README.md) and
[verification](../oam-20261103-172737-runtime-remediation/verification.json), original
[independent rejection](../oam-20261103-172737-review/README.md), root instructions
and artifact workflow. Previous [integration evidence](../oam-20261103-172737-integration/README.md),
its initial failures and later successes remain historical, unchanged observations.
This new bundle contains only this README and [verification.json](verification.json).

## Inputs and scope

The five remediation inputs matched the prior owner's delivered hashes before
validation and stayed identical afterward:

- `packages/access-router/src/acl/service-authorization.ts` — record-owned/null-prototype provenance.
- `packages/access-router/src/acl/document-stage.ts` — source+call roots and publication-owned counted references.
- `packages/access-router/src/services/service.ts` — scoped production reference lookups.
- `packages/access-router/test/write-output-origin-ownership.unit.test.ts` — 14 cases.
- `packages/access-router/test/write-output-source-lifetime.unit.test.ts` — 25 cases.

All **61 protected incoming files** and HEAD remained unchanged; **51** non-remediated
inputs still match the original review's hashes. These include public guidance,
configuration, package/build metadata and earlier tests. The JSON preserves the five
delivered hashes and complete input-set aggregate/selection. Only the two new evidence
files are added here; no maintained source/test/docs correction, task/status edit,
agent, commit, dependency change, publication, Docker/system change or Redis harness
change was made. Normal packed-consumer suites installed their isolated consumers.

## Fresh commands and results

Every command ran **serially from repository root** with installed dependencies and
MongoDB prerequisites, Node `v26.12.1`, pnpm `11.18.0`, Vitest `4.1.11`. Fresh scratch
`_tmp-oam04-revalidation-20261104-070756` was created and confirmed ignored using
`git check-ignore`. Every runtime/build/type/test/lint/format command used its
absolute checkout path as `TMPDIR`; benchmark/verifier commands also used it as
`WTT_BENCH_TMP`. The two benchmark commands additionally used the original baseline
artifact as `WTT_BENCH_LEGACY_ROOT` and current checkout as `WTT_BENCH_CANDIDATE_ROOT`.

Exact required command bodies follow (log redirections omitted). Prefix each with
`TMPDIR='<repo-root>/_tmp-oam04-revalidation-20261104-070756'`, replacing the quoted
placeholder before execution:

```sh
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router test --reporter=default --reporter=json --outputFile.json=../../_tmp-oam04-revalidation-20261104-070756/access-router-v2.json
pnpm --filter @web-ts-toolkit/access-router-deco test --reporter=default --reporter=json --outputFile.json=../../_tmp-oam04-revalidation-20261104-070756/access-router-deco-v2.json
node _tmp-oam04-revalidation-20261104-070756/baseline-readonly.mjs before
node --test --test-concurrency=1 scripts/benchmarks/access-router-owned.test.mjs scripts/benchmarks/access-router-owned-batch.test.mjs
node _tmp-oam04-revalidation-20261104-070756/baseline-readonly.mjs after-owned
node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs
node _tmp-oam04-revalidation-20261104-070756/baseline-readonly.mjs after-shared
```

Additional environment on each `node --test` command (replace quoted placeholders):

```sh
WTT_BENCH_TMP='<repo-root>/_tmp-oam04-revalidation-20261104-070756' WTT_BENCH_LEGACY_ROOT='<repo-root>/_tmp-oar01-20261031-153820/baseline-artifact' WTT_BENCH_CANDIDATE_ROOT='<repo-root>'
```

| Gate                                                                   | Fresh result                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Access-router typecheck, including transitive build                    | Passed.                                                                                    |
| Full unfiltered access-router script                                   | **201 files / 6,964 passed**, zero failed/pending.                                         |
| Included F1/F2 maintained regressions                                  | **14 + 25 passed**; no separate independent adversarial review claimed.                    |
| Included strict / packed / documentation consumers                     | **49 / 13 / 92 passed**, respectively.                                                     |
| Full unfiltered decorator script, including transitive build/typecheck | **23 files / 779 passed**, zero failed/pending.                                            |
| Included decorator strict / packed / documentation / mode suites       | **6 / 4 / 18 / 77 passed**, respectively.                                                  |
| Full owned + batch selection                                           | **29/29 passed**, including 9 B1 cases, four old/current public/structural profile probes. |
| Full shared-runner + integration selection                             | **29/29 passed**, including 16 historical workers.                                         |

Combined packages: **224 files / 7,743 passed**. Both benchmark selections have zero
failed/cancelled/skipped/todo cases. No test-name filters or weakened fixtures. Fresh
JSON assertion lists, both complete benchmark logs and all three baseline reports
were inspected. Every V2 command passed on its first invocation in this round; the
existing Vite CommonJS-config warning was non-fatal. These fresh results replace
pre-remediation greens as evidence for the remediated inputs, without rewriting them.

Tool exclusions were reviewed, not inferred from Git ignore: router Vitest includes
only `test/**/*.test.ts`; both source typechecks include `src/**/*.ts`; builds use
configured entries. Decorator Vitest runs within its package, outside root scratch.
ESLint explicitly ignores root `_tmp*/**` and was invoked on 17 explicit affected
code/test paths; Prettier also used explicit paths. No scratch consumer entered a
source typecheck or root directory lint scan.

## Historical baseline — verified read-only

Used the existing original `_tmp-oar01-20261031-153820/baseline-artifact`, original
descriptor/dependency identities and inspected sealer algorithm. The sealer was
**never executed/imported**; no original artifact, dependency, seal, old scratch or
historical document was rebuilt, installed, restored, overwritten or deleted.
The fresh verifier wrote reports only into this round's scratch.

Complete recorded inventories passed before use, after owned+batch and after shared:

- **552 artifact files**, **14 build files / 8 declarations**, all **7** explicitly
  recorded historical source entries and the unsafe-source fixture.
- **134 dependency packages / 3,510 files**, package metadata/manifests, **214 installed
  edges / 6 originally absent optional edges**, **33 package links / 39 symlink identities**.
- Required Mongoose/Express/TypeScript **9.11.4 / 5.2.1 / 6.0.3** resolve. Original
  descriptor SHA-256 is `ebf499b00923e35e7fd5404a2d4aa42dec058e22b01f65ce6664f8900ca6dbd9`;
  artifact inventory is `7229a35eeb5a712707d32d47fb9bc4177b8d9e033f86d782cf0f0ef5c3f45f9a`.

All three snapshots are identical, including original descriptor/sealer/dependency
records, captured links, full inventories and current candidate ESM. Curated hashes
and counts are in the JSON. This verifies compared inventories/availability, not an
authenticated signature or every original timing claim. Original exclusions remain
exclusions; dependency bytes/edges and symlink identity were checked separately.
No old timing campaign or seal was relabeled as write-output evidence.

## Surface, guidance and hygiene

Fresh checker inspection followed all root/advanced declaration aliases in both
conditions: **64** exact optional literal-mode properties, **16** emitted examples;
root/advanced/processors declaration counts **200/336/17**, runtime counts **46/48/6**
under both CJS/ESM conditions. All **14** checked private names remain unexported.
Root `/advanced`/`/processors` metadata remains intact; shipped MIGRATION bytes match
source. Full strict/packed/docs suites above exercise installed imports, positive
four-option configuration and malformed/request selector negatives.

Guidance remains byte-identical to the reviewed inputs. Maintained source/docs
search found no supported output-prefixed alias, stale blanket isolated-write claim
or old mode-section anchor. No public/input/persistence scope change was inferred.
Supplementary command bodies were `node _tmp-oam04-revalidation-20261104-070756/inspect-surface.mjs`
and `node _tmp-oam04-revalidation-20261104-070756/capture-inputs.mjs before` / `after`.

Scoped ESLint/Prettier, bundle links/references, JSON validity, privacy/credential-pattern
review, ignore status and tracked/untracked whitespace checks passed. New evidence
is not ignored; scratch is ignored. This is bounded hygiene, not general security
certification. Checked **6 relative links / 5 source references**, all curated counts
against fresh reports and equality of the three baseline snapshots. The first
format check flagged only these two new evidence files; formatting was corrected
with patch, without altering maintained inputs. The JSON records the exact 17-file
lint/format argument set. Final hygiene used
`node _tmp-oam04-revalidation-20261104-070756/verify-evidence.mjs`, `git diff --check`
and untracked-file `git diff --no-index --check` for each new evidence file.

## Remaining limits and handoff

**OAM-04 has no remaining blocker.** The same independent reviewer must now recheck
F1/F2 and final acceptance on these inputs, then own fresh V2/V3. Root V3 was not run
here and remains separately blocked by the recorded unrelated
`express-request-attestation` Docker/live-Redis prerequisite (no local socket,
configured desktop daemon unavailable). That environment was neither modified,
retried nor bypassed; no lanes were skipped or substituted to claim a root pass.

Only this curated README/JSON are preserved. Scratch assertion logs, generated
consumers/builds/tarballs, databases and caches are omitted, as is the old artifact/
dependency tree. The historical fixture is an environment-dependent disposable
prerequisite, not a vendored replay bundle; maintained tests/scripts plus intact
matching inputs are the reproduction route. Disposable verifier scripts are not
archived continuation dependencies. No new performance/heap claim, rollback,
freshness or universal callback-isolation certification is made.
