# ARRC-03 — populate traversal and ownership vocabulary

**Implemented; scoped verification passed; no blocker.** Only ARRC-03 was changed.
The coordinator retains the shared task file; ARRC-04–06 remain outside this handoff.
No commits, resets, further delegation or background/queued jobs.

## Exact delivered scope

Only `packages/access-router/src/services/service.ts` changed, using the smaller
implementation approved in the [move ledger](arrc-01-move-ledger.md):

| Binding scope | Exact old → new vocabulary |
| --- | --- |
| All three private populate helpers | `meta` → `targetMeta`; `parentOperation` → `initiatingOperation`; `parentContext` → `parentHookContext`; `budget` → `receivingBudget`; `references` → `completedReferences` where present |
| `finalizeSinglePopulateTarget` | `rawTarget` → `targetValue`; `originalTarget` → `sourceTarget`; `outputDepth` → `receivingDepth`; `originalKey` → `sourceIdentity`; `owner` → `publicationOwner`; `cacheKey` → `targetIdentity`; `recipients` → `receivingOccurrences`; `selectedBudget` → `targetConstructionBudget`; cached `source` → `cachedTargetOutput`; `pending` → `pendingTargetOutput`; `finalized` → `finalizedTargetOutput` |
| `finalizePopulatePath` | `current` → `traversalValue`; `segments` → `pathSegments`; `segIdx` → `segmentIndex`; `original` → `originalNode`; `child` → `traversalChild`; `address` → `outputAddress`; lexical `finish` → `finalizeLeafValue` |
| `finalizePopulateForSingleDoc` | `doc` → `receivingDocument`; `segments` → `pathSegments` |

Concise role-group comments now annotate all **11 existing receiver-dispatched
calls**: two single-target, three path and six single-document calls. They identify
target policy/initiating execution, original provenance, completed handoffs,
receiving budget/publication and output position without requiring a signature
lookup. The nested leaf recursion also labels provenance/depth. A construction
comment distinguishes the combined target budget from one receiver's copy budget.
This fulfills the original call-site readability acceptance through the approved
names/comments design; no ARRC-03 work was silently deferred.

Retained: exact member names/order, argument positions/types, default evaluation
(`sourceTarget = targetValue`, `originalNode = traversalValue`, `outputAddress = []`),
all `hookLimit`/`sharedGate` forwarding and receiver dispatch. `originalChild`,
metadata/occurrence record fields, all four WeakMaps, preregistration, cache insertion,
cleanup, scalar/native paths, source detachment and every expression/await/check stay
in place. No context object, collaborator, cache, alias/pass-through type or public
signature was added. The ARRC-02 metadata module was untouched.

## Mechanical, behavior and API proof

- TypeScript **6.0.3** AST tokens plus checker-resolved bindings proved full-file
  alpha-equivalence against the accepted post-ARRC-02 service: **20,244 nontrivia
  tokens**, with only **34 approved bindings / 180 identifier tokens** substituted.
  All candidate references resolve to the corresponding renamed declaration; no
  new-name capture. Property keys, errors/strings, types, operators, punctuation and
  other identifiers were not normalized. The three helpers' **1,541 tokens** also
  match the ARRC-01 operational source baseline under that same map.
- Fresh declarations: all **8 files / 782,693 bytes**, including parser chunks,
  match both the [durable manifest](arrc-01-declarations.json) and read-only
  `_tmp-arrc-01-2nfaqj2y/baseline/declarations` byte copies. Export/manifest and 14
  public/config files remain unchanged.
- Fresh **96 CRUD + 32 preparation** records match the [work baseline](arrc-01-work-baseline.json)
  deeply and by raw JSON hash; both publication-work observations match too. These
  are work diagnostics, not timing/allocation measurements or a speedup claim.
- All **248 starting test/fixture files**, including ARRC-02's seven-test file,
  are byte-identical; all 247 ARRC-01 files still match their durable hashes. The
  metadata helper, other 151 starting source files, shared task and nine preceding
  artifacts are unchanged. All 151 ARRC-01 operational source copies remain sealed.

## Fresh verification

Commands ran sequentially from repository root, foreground timeout 2,400,000 ms,
with `TMPDIR='<repo-root>/_tmp-arrc-03-wRLHjNqG'` (replace `<repo-root>` before use).
`git check-ignore -v` confirmed `.gitignore:8:_tmp*`. Exact argv, selected suites,
per-file counts, identities and comparison details are in
[arrc-03-verification.json](arrc-03-verification.json).

| Command/check | Result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Pass; necessary filtered/transitive build plus source typecheck; 27.564 s |
| `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts …` with recorded 23-file selection/report options | **965 tests / 23 files passed**, no failures/skips/todos; 58.920 s |
| `pnpm exec eslint packages/access-router/src/services/service.ts` | Pass; 2.572 s |
| Token/binding, declaration, identity and work comparisons | All pass |
| JSON/reference/privacy/nonignored-destination audit and `git diff --check` | Pass |

Selection covers all V1 related/populate, lifetime/scheduling, mode/write/decoration
and deterministic-work suites, plus the preserved metadata characterization file.
The unchanged CRUD harness passed **434 tests**: all 16 mode tuples, READ fallback
and both UPSERT branches; independent parent/target modes and both write modes'
source-lifetime checks passed. The existing Vite native-config/ESM warning was
non-failing. Full package tests remain reserved for ARRC-06; no root/grouped/
downstream suite, root sweep, benchmark or later implementation ran.

Only this concise report and verification manifest were added to the durable bundle;
no earlier evidence was overwritten. Disposable scratch contains the inspected
source snapshot, token/check scripts, logs, assertion JSON and duplicate work data;
it is not a portable reproduction bundle. Those files, generated builds, MongoDB
files and dependencies were omitted. Reproduction requires the recorded revision,
workspace dependencies/toolchain and MongoDB memory-server prerequisites. Baseline
reconstruction guidance remains in [ARRC-01](arrc-01-report.md).
