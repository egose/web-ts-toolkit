> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-10-R — independent final re-review

## Findings first

**No blocking findings in scoped final review. F1 and F2 are independently resolved.**
This supersedes only their open disposition in this reviewer's unchanged
`docs/task-artifacts/access-router/oar10-final-x4mMa3Th/REVIEW.md`; it does not rewrite that blocked review or its
historical package identities. The separate OAR-10-D owner implemented the fixes.
The coordinator alone reconciles OAR-10-R/OAR-10 task status. This is not release,
commit or publication authorization, or a blanket security certification.

| Original finding | Independent disposition and current locations |
| --- | --- |
| **F1 — live promises of removed output handles** | **Resolved.** `packages/access-router/README.md:251–253` binds private calls/stages, not DTOs/diagnostics, to their owner. Lines **1390–1397** explicitly distinguish private hook inputs from published data: later raw picks use captured globals + frozen EMPTY + explicit output-only policy, not retained document decisions; current document facts require a new normal read/list with suitable selection/private inputs and additional read/hook work. Lines **2388–2398** keep target-owned policy/facts/filtering in private include construction and attached DTOs non-authoritative. Lines **3167–3170** remove the nonexistent document-handle recipient without weakening private-input isolation; **3211–3212** correctly place cleanup before publication/presentation. |
| **F2 — data field callback incorrectly described as one-argument** | **Resolved.** `packages/access-router/README.md:1548–1557`, specifically **1550–1553**, states original-request `this`, `(permissions, grants)`, and the built-in frozen empty record. It explicitly distinguishes one-argument operation `GuardHook`. This agrees with `src/core-data.ts:93–100,115–123,143–151`, `src/core-shared.ts:329–340`, and `src/interfaces/access.ts:4–8,22–37` (all under `packages/access-router/`). Fresh source, actual packed ESM/CJS and strict public declaration checks agree. |

Neither original finding was a demonstrated runtime bypass. Their required installed
documentation/migration corrections are now present in the **actual final tarball**,
not merely source or an intermediate pack. No new defect requiring a separate
implementer was established in this bounded re-review.

### Remaining live references were reviewed semantically

`README-INDEPENDENT-INVENTORY.{md,json}` records this reviewer's decisions, with
`README-REFERENCE-CONTEXTS.md` preserving the independently collected paragraph text.
The independent broad scan found **44** matches in 38 paragraph contexts; the owner's
different scan found **37**. They share 36 lines, so all **45 union lines** were
independently classified, including the owner's `unhandled` substring at line 2131.
A second semantic scan found 22 lines, including **13 additional** contexts: **58
distinct matched lines** in total. Corrected private-input and cleanup paragraphs
were also re-read outside the lexical inventory.

No equivalent live DTO-certificate/retained-decision promise or one-argument data
field instruction was found in these contexts. Valid examples of request/cache,
embedded-stage, prepared-predicate, fetch-batching and hook-admission reuse are not
public output authority. Explicit removed-name rejection, the labeled before/after
table, ordinary configuration identities and ordinary error-handling verbs should
remain. This conclusion is contextual review, not a blanket word ban or proof by
absence of five old phrases.

## Exact reviewed identity and scope

| Item | SHA-256 / scope |
| --- | --- |
| User HEAD | `a1996e10f8339d89fc8a0aa2b10f7b531f5a07ca` |
| **Final source / tar / extracted installed README** | `aff3e416addae22e65a80150f8279fe38ed15436062d50f581979d40902c1c46` — 223,025 bytes |
| New permanent test | `e6a1237f57e5c4a36bdfb14b39f739a8b1370f5c1d5c7176f665268a7b1e12eb` — `packages/access-router/test/documentation-authorization-guidance.test.ts` |
| **Final actual production core tarball** | `39cf36e02155e6c0d000d1958306375bcef03726a79e15fb0ac07faacb1fe1a9` — 662,535 bytes |
| Unchanged reviewed/tested/measured root ESM | `e131659e5cdd9f5052cd15060b498669f5e044c559b35f3abbe0780f18753f4e` |
| Unchanged lock | `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` |
| Separately protected incoming coordinator task | `33e23efc283c7afed4c05a2f7e95635da85f01d49320527002b2650ade4a8dec` |

`01` independently compared current entry with the prior review exit: exactly the
README modification, additive test and coordinator task update; versus OAR-10-D
exit, only the coordinator task differs. The whole 233-line owner correction diff
and complete 152-line new test were read, along with the final runtime/type fixtures.
The product delta is documentation plus its regression test, **not** a runtime,
declaration, tooling, dependency or lock revision. Entry/exit protect **2,000 source
records, all 67 current dist outputs, 70 incoming status paths and 813 focused old
evidence records**. No reviewer product or task changes were made.

`02` independently rehashed the **615 current doc-only source pins**. Of the old
614 measured pins, **613 still match; README is the single approved drift**. The new
test was outside those old pins. The old `verify-ready.py` was neither run nor
changed: it would now correctly fail on README. Historical README `f7ef32…`,
intermediate documentation pack `1db02e…` and old F-V/G-A seals do **not** certify
the corrected prose. This report and the new doc-only linkage certify its identity
while preserving those historical records unchanged.

The same audit rehashed 19 tool pins, 681 historical candidate files/48 links,
all 67 current outputs, runtime binaries/lock, original 134-package/3,510-file
and tool 293-package/10,545-file dependency identities. F-V, G-A, G-B, prior
independent-review and documentation-owner packet manifests/seal bindings were
verified, including all 26 OAR-10-D command records and its actual final results.
This is evidence-integrity checking, not rerunning their workloads.

`03` copied/extracted the five **final** actual tarballs into this packet alone.
Every core member was compared against the previous actual 19-member production
tarball: **README alone changed; the other 18 match byte-for-byte**, including six
JavaScript files, eight declarations, manifest, MIGRATION, llms and license. The
manifest agrees with the recorded real production transformer. Current source,
tar member and installed README are equal; runtime/declaration members equal
current dist. The fresh extracted closure has 81 files and 37 read-only dependency
links. It is **not** a new registry installation or new minimum-peer matrix.

## Checks newly executed for OAR-10-R

All commands were foreground, serial and awaited. Exact argv, private environment,
exit and output are in `COMMANDS.json` and `logs/`; `RESULTS-AUDIT.json` checks the
actual JSON/TAP/diagnostic results. No nonzero attempt occurred in this packet.

| Command / new check | Actual result |
| --- | --- |
| `01-entry-preservation` | PASS: exact approved entry delta and independent current snapshot. |
| `02-identity-audit` | PASS: current docs identity, unchanged runtime/types/tools/dependencies and historical evidence linkage as above; accepted performance IDs exactly agree. |
| `03-final-consumer-setup` | PASS: safe final-tar extraction, README-only member delta, real 81-file closure/37 links and independent context capture. |
| `04-focused-guidance` | **24/24 pass**, zero failed/pending; complete permanent file, not selected cases: five positive/negative prose checks, 18 actual DataCore/DataService/getter/alias callback paths, one separate operation guard. New private Vitest config/cache, runner config loading, one worker; no package script or build. |
| `05-final-packed-runtime` | **7/7 pass**, zero failed/skipped/cancelled: installed README identity; ESM and CJS each exercise 18 public data helper paths and one-argument guard; real Mongo in **isolated and trusted** modes proves stripped private inputs/DTO+metadata+diagnostic replay confer no retained facts, raw picks add **0 reads/0 hooks**, and a fresh normal query adds **1 read/1 hook** and observes changed owner facts. |
| `06-final-strict-types` | **All five conditions pass**: Bundler, Node16 ESM/CJS, NodeNext ESM/CJS; strict + noUncheckedIndexedAccess + skipLibCheck=false. Eight equalities/condition compile; five unsuppressed negatives/condition produce exactly five expected diagnostics (**25 total**). Root/advanced public imports load the real three applicable declarations in each condition; all eight shipped declaration bytes are unchanged. No `any`, casts or suppressions in positive/negative fixtures. |
| `07-results-and-reference-audit` | PASS: actual result counts, unchanged copied fixtures/installed closure and independent 45-line union + semantic inventory. Packet is ignored. |
| `08-exit-preservation` and final seal | See `exit-preservation-result.json`, `CLOSURE.json`, `PROCESS-AUDIT.json`, `REVIEW-SEAL.json` and packet seal: zero reviewer product/task/old-evidence changes and no owned workers left. |

Runtime/type fixtures and the type driver are byte-identical **copies of the owner's
final fixtures**, inspected before reuse; they are not newly authored adversarial
cases. Their executions/results here are new and independent. Mongo uses only this
packet's `mongo-data-final/`; the runtime test closes the connection and stops it.

## Prior deep review reused, not re-executed or enlarged

This reviewer's `docs/task-artifacts/access-router/oar10-final-x4mMa3Th/REVIEW.md:69–91` remains the C1–C6 and
M1–M5 source/public/packed traceability record. It covered the committed redesign
from `58b22c0d6d3abd4ecce03533e3867d148ff21233` through current user HEAD and the
incoming uncommitted changes, rather than just the HEAD diff. Its unchanged
**26 packed runtime tests, 405 source cross-path tests, five broader strict public
conditions (13 equalities/18 negative statements), and independently recalculated
original/B1 raw evidence** are reused through byte linkage. None was rerun here.

- **C1/C2/C4/C6:** prior actor/dimension/ownership, private stage/publication,
  source-only modes, selected/native/budget/diagnostic review stands on unchanged
  product and declaration bytes, with its risk-focused coverage limits retained.
- **C3/C5:** previous runtime/type conclusions stand; F2's two-argument EMPTY
  contract and F1's no-public-capability/raw-helper guidance are now independently
  reconciled in the actual installed package.
- **M1/M2/M4:** unchanged shipped migration facts grammar, context/lifecycle roles,
  two-mode/rollback and trusted-code caveats retain prior review evidence.
  **M3/M5:** fresh normal-query versus presentation/raw EMPTY and public
  field-versus-guard semantics no longer contradict the live README.

The hash-bound F-V full gates remain **6,046 core/187 files, 742 deco/23, 827
focused/16**, associated source/downstream types, affected lint/format/diff and 45
original runner tests. G-A's 54 runner tests, smoke/preflight/counter observations
and the four prior installed peer/layout matrices × five compiler conditions remain
prior evidence, not new runs. Minimum peers used skipLibCheck=true; current peers
used false. Former transient peer installations are not retained. The full-gate
source manifest was reconstructed after execution; it is not a nonexistent pre-run
attestation. Old failed/intermediate attempts remain preserved and explained by
their original handoffs; none is relabeled as a final success. No new full suite,
workspace-wide check, build, pack, dependency install or timing campaign was run.

## Accepted performance exception and retained limitations

The original independent raw calculation is unchanged: **456 jobs / 39,200
responses; 70/90 numerical comparisons, not 90/90**. Three confirmed trusted adverse
and 18 sign-unstable comparisons overlap once: exactly **20 accepted failed IDs**.
`IDENTITY-AUDIT.json` retains that list and independently matches it to the current
task's explicit user disposition. No quality/security requirement is waived.

The documented adverse virtuals/100 median +15.87% / p95 +17.51%, H3-global/10 CPU
+19.48%, and H3-global/100 median +25.12% / p95 +27.41% / CPU +26.32% remain costs,
not successes. The historical campaigns remain separate 75/81/78/73/70 results.
No raw timing calculation or benchmark was repeated in this re-review.

**B1 remains report-only: 124 jobs / 12,400 responses, zero acceptance gates.**
Many's roughly 5–6% higher 100-row latency versus current independent helpers,
generally lower CPU, and trusted historical query-plus-handle median +19.31%/+41.59%
at 10/100 rows stay disclosed. One capture is not N fresh captures or old issued
handles. No freshness equivalence, default migration, H3 replacement, universal
speedup, arithmetic query-p95 composition, pooled cross-campaign causal claim,
allocation total, Mongo CPU or statistical certainty is inferred. Numerical seals
retain acceptance=false; user task disposition is an explicit exception, not a
numerical pass or release permission.

Library normalization/traversal bounds are not total native/dependency allocation,
RSS or an application sandbox. The prior 17 MiB overridden-`toObject` fixture is
opaque-callback/normalized-return evidence, **not** canonical Mongoose allocation
proof. Exact canonical seams remain reused F-V/G-A evidence. Trusted callbacks,
closures, live request/native/external state and deliberate presentation outputs
are not frozen, universally fresh or automatically re-filtered. This is scoped,
risk-focused review, not exhaustive application/integration/security certification.

## Handoff

`NEWHANDOFF.md` and the sealed packet carry this independent finding disposition
and its limitations to the coordinator. Only `_tmp-oar10-rereview-TqXpu08b/` was
writable. No delegation, product fix, task/status edit, optimization, commit,
publication or release action was performed or authorized.
