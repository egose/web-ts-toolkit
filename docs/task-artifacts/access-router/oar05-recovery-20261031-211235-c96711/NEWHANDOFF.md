> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-05 fresh sequential recovery handoff

**Outcome: OAR-05 is complete within its authorized helper/escape scope; every
required bounded gate passes on the delivered source.** The coordinator owns task
reconciliation. No task file was edited and **OAR-06 was not started**. This is not
full-package, release-candidate, performance or independent-review acceptance.

Authority read: `AGENTS.md`; the shared owned-authorization task C1–C6, resolved
OAR-01 and OAR-05; OAR-01 architecture/helper/utility/guard/context inventory,
amendment A4, implementation handoff and measurement plan; OAR-02 recovery/ledger;
OAR-03 handoff/ledger; OAR-04 handoff/ledger; and the actual incoming partial source,
tests, manifests and failure logs. Package/task skills were loaded. No delegation.

## Exact delta and preserved incoming work

All product paths below are relative to `packages/access-router/`.

- Combined OAR-05 delta relative to the **original before manifest**: **16 files**,
  comprising seven source files and nine test/fixture files (two new).
- Recovery delta relative to its **new incoming baseline**: **five test/fixture
  files only**. No runtime/source behavior was changed by this recovery, and no
  access-router-deco source/test change was needed. Existing source fixes, all 27
  new owned-helper cases, the 60/7/45-case migrations and OAR-01–04 work are retained.
- Exact before/after hashes: `audit-final-02.json` (`oar05Delta`, `recoveryDelta`).
  Original seven source contents were reconstructed in scratch and verified against
  the original hashes, not restored into the checkout or compared only with HEAD's
  much larger OAR-01–04 diff. See `incoming-source-diff-verification.json` and
  `legacy-diff-identities.json`.

### Seven incoming source files retained

| File | Actual OAR-05 change |
| --- | --- |
| `src/validation/public-admission.ts` | Native proxy rejection before control preflight traps/descriptor work. |
| `src/core.ts` | Normalize explicit utility metadata before any row-visibility callback/query; clarify fresh helpers/negative predicates and hook-to-facts DATA utility. |
| `src/acl/output-field-filter.ts` | Metadata exposure applies to top-level entries only; retained `_view`/`_edit` descendants stay DATA and remain bounded. |
| `src/helpers/document.ts` | `getDocPermissions` documents serialized metadata DATA, not authority. |
| `src/interfaces/service-authorization.ts` | Raw output helper JSDoc warns that empty-fact negative predicates are not current-document proof. |
| `src/services/base.ts` | Remove stale helper-handle guidance and distinguish fresh raw helpers from explicit hook/metadata/row-visibility presentation utilities. |
| `src/services/service.ts` | Describe `captureVirtualSnapshot` as bounded detached inspection, not a certificate/live captured policy alias. |

The private engine, guard consumer, materializer and concurrency fixes from earlier
tasks remain in place. `src/helpers/concurrency.ts` and
`src/acl/trusted-output-materialization.ts` have **no OAR-05-specific delta** against
the original before manifest. No old DocumentAuthorization engine, flag options,
loop/validation stubs, DTO certificate, child issuer or public replacement token.

### Recovery's five files

- `test/owned-authorization-helpers.runtime.fixture.mjs`: fixes the actual guard
  error-channel setup using the public router's existing response handler; bounded
  status/body/transport diagnostics; current raw grammar/negative-fact/explicit scoped
  grants, same/spread/JSON/replaced-child/metadata DTO and readonly diagnostic probes;
  real Mongo refresh/guard/row counts; public HTTP/root/advanced retired-control
  probes; and **all DB method** zero-work assertions. Existing assertions are retained
  or made more exact. No synthetic access-router response or unrelated factory.
- `test/packed-consumer-compatibility.test.ts`: retains the permanent new thirteenth
  OAR-05 gate, production transform/pack/unpack setup, public imports and consumer
  behavior. Adds all-14 current-byte checks plus packed strict positive hooks and
  separate actual removed-symbol/options/diagnostics negative compilation in `.mts`
  and `.cts`, with peer diagnostics forbidden. Preserves fresh evidence.
- `test/owned-authorization-helpers.unit.test.ts`,
  `test/field-helper-request-boundaries.integration.test.ts`,
  `test/service-authorization-finalizer.unit.test.ts`: **formatting only** during
  recovery. Incoming security assertions and test counts are AST-equivalent
  (`format-proof.json`). Packed fixture/harness formatting is likewise verified
  against the recovery's authored candidates; the later DB assertions are meaningful
  additions, not falsely described as formatting-only.

## Packed failure diagnosis and current public behavior

The interruption's HTML failure is **not a product routing/authorization defect**.
`packed-diagnostic-01.log` establishes `/helpers/_guard` returned the expected
**HTTP 401 UnauthorizedError via Express's default HTML error channel**. Custom
routes mount correctly, and the existing `api.createRouter(options)` root overload
is valid. `guard()` calls ordinary `next(error)`, so the fixture now formats that
same original error via `router.router.responseHandler.handleResponse`; it asserts
JSON/problem status rather than manufacturing a result. Other fixture/auditor/
transport failures and all earlier logs are preserved in the migration ledger.

Final evidence: `packed-final-02/owned-helpers-w9VZj6/`,
`packed-final-02/native-budget-YiFI58/`, and `packed-surface-final-02.json`.
The tarball is newly transformed/packed from the live build in this recovery; equal
hashes across fresh packs are deterministic byte equality, **not reuse of an old
tarball as a substitute**.

### OAR-05 actual workflow, both modes

- Canonical raw helpers and explicit scoped server output grants perform **zero
  DB operations of any kind, zero document hooks and zero virtuals**. They use the
  captured global actor and frozen empty facts with the ordinary shared rule grammar.
  `!grants.suspended` is deliberately true on empty facts while the normal hook's
  `suspended:true` denies that field; a raw helper is not current-document authority.
- Initial normal query plus explicit current-authority refresh: **two findOne reads /
  two hooks total**, exactly **+1 read/+1 hook** for refresh. A presentation subset or
  raw helper on either DTO adds zero reads/hooks. The original DTO remains unchanged
  after persisted ownership changes; the fresh normal query returns current denial.
- Same DTO, spread, JSON, metadata and replaced child do not grant root/child fields.
  Explicit child scope/output grant remains separate from rows/input/operation/target
  policy. Results contain only the readonly diagnostic allowlist, no backing aliases,
  hidden symbol, public handle or child lookup. Source/declaration/unit controls also
  cover different request/runtime/model/access/equal-ID receivers.
- Document guard, for strip and expose-none postures with a forged post-filter
  decorator: successful **200** and denied **401**, **one read/one hook each**, no
  second hidden query. Its facts are consumed while the fresh stage is private,
  never recovered from returned metadata or decoration.
- Normal row-denied READ with `tryList:false`: actual **404**, **one read / zero
  hooks**, not raw fallback. Root replay and representative old/new/handle/stage
  controls: actual JSON **400**, zero reads/hooks/virtuals/field callbacks/DB writes.
  Advanced public schemas and direct services additionally reject own false/undefined,
  inherited undefined and non-enumerable false slots. The unit file covers all ten
  retired names and accessor/proxy forms before catalog/callback/data work.
- Main OAR-05 fixture: **40 HTTP requests — 8×200, 4×401, 2×404, 26×400**.
  Actual debug totals: **14 findOne reads, 12 document hooks, 8 guard-output virtuals**.
  Only DB methods observed: `insertOne:1`, `findOne:14`, `updateOne:16`; the writes are
  the fixture's explicit persistence/ownership/visibility changes, never helper work.
- Existing installed helper consumer additionally passes **four HTTP 200 checks**
  across actual emitted **ESM and CJS** workflows with zero document hooks.

The OAR-04 current-tarball native gate was rerun as well: **16 LIST/READ requests**,
both modes, ordinary Code/DBRef **4×200**, oversized Code/DBRef/denied-wire **12×400**,
no partial output, **ten document hooks/four wire hooks**. It is a fresh current-peer
rerun, not relabeled old/minimum-peer evidence. Across these packed gates: **60 HTTP
requests actually execute**; no timing/CPU/allocation claim follows.

## Verification actually run — serial foreground, repo root

`run.py <label> <command...>` creates exclusive logs and a fresh recovery-local
TMPDIR per command. Every test config/cache is new within this ignored recovery
directory. Mongo uses the existing system binary read-only, with unique local paths.
Exact expanded argv/environment is in each log; `<repo-root>` below denotes this
checkout and must be replaced before executing examples.

1. **V1:** `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`
   — five affected/transitive packages only; ESM/CJS/all eight declarations pass
   (`build-final-01.log`). No runtime/source changed afterward.
2. **V2:** `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar05-recovery-20261031-211235-c96711/vitest-focused-final-01.mjs --no-file-parallelism --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=<repo-root>/_tmp-oar05-recovery-20261031-211235-c96711/focused-final-01-results.json`
   — **543 passed / 12 full files**, **no name filter**, no skipped/failed cases:

   | Package-relative file | Passed |
   | --- | ---: |
   | `test/owned-authorization-stage.unit.test.ts` | 111 |
   | `test/authorization-fast-path-native.unit.test.ts` | 102 |
   | `test/owned-authorization-boundaries.unit.test.ts` | 63 |
   | `test/field-helper-removal.contract.test.ts` | 60 |
   | `test/owned-authorization-publication.unit.test.ts` | 50 |
   | `test/service-authorization-finalizer.unit.test.ts` | 45 |
   | `test/include-permission-metadata.integration.test.ts` | 38 |
   | `test/owned-authorization-facts.unit.test.ts` | 35 |
   | `test/owned-authorization-helpers.unit.test.ts` | 27 |
   | `test/field-helper-request-boundaries.integration.test.ts` | 7 |
   | `test/permission.test.ts` | 3 |
   | `test/owned-authorization-types.test.ts` | 2 |

   Existing work probes still observe six rows/144 callbacks/one adapter read/six
   hooks; isolated whole-source materializations **12**, trusted **0**. These are
   retained structural assertions, not candidate performance measurements.
3. Source-only TypeScript:
   `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
   — passes (`source-types-final-01.log`), not a full legacy test-typecheck claim.
4. Necessary downstream compilation:
   `pnpm --filter @web-ts-toolkit/access-router-deco build` — ESM/CJS/DTS pass
   (`deco-build-final-01.log`); no broad V4/deco test acceptance.
5. **Changed V5:** `check-changed.py lint` invokes `pnpm exec eslint --no-cache --max-warnings=0`
   on exactly the **16 files** in `changed-files.json`; `check-changed.py format`
   invokes changed-file `pnpm exec prettier --check`. Final logs
   `lint-final-02.log` / `prettier-final-02.log` pass. `git diff --check` passes
   (`diff-check-final-02.log`). No workspace-wide lint or unrelated reformat.
6. **Fresh packed bounded gates:**
   `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar05-recovery-20261031-211235-c96711/vitest-packed-final-02.mjs --no-file-parallelism --maxWorkers=1 -t 'OAR-0[45]' --reporter=default --reporter=json --outputFile.json=<repo-root>/_tmp-oar05-recovery-20261031-211235-c96711/packed-final-02-results.json`
   — **two selected gates pass / eleven unselected later-owned cases**, current
   Express **5.2.1**, Mongoose **9.11.4**, Node **26.12.1**. Real production manifest
   transform → fresh pack → unpack; helper ESM/CJS compile/run, root/advanced positive
   hook declarations, separate expected negative `.mts`/`.cts` compilation all pass
   with `strict:true`, **skipLibCheck:false** and no peer declaration diagnostics.
7. `node _tmp-oar05-recovery-20261031-211235-c96711/packed-surface.mjs 02 packed-final-02/owned-helpers-w9VZj6`
   — same fresh tarball independently unpacked; all **14 live/packed files byte equal**;
   root/advanced/processors public ESM and CJS export sets agree (**46/48/6** names),
   no private stage/capture/budget/capability public symbols and no source/tests shipped.
8. `audit.py final-02` — original evidence/task/lock/dependency/baseline preservation,
   exact product delta/source/dist identities, declarations and job checks pass.
   `format-proof-03.log` / `format-proof.json` record the separate formatting proof.

All diagnostics/failed attempts are retained; see `LEGACY-TEST-MIGRATION-LEDGER.md`.
No workspace-wide build/lint/test, full V3/V4/V7, benchmark runner/candidate timing,
minimum-peer install, dependency/lock change, commit, publish, reset/revert or task edit.

## Final identities, preservation and jobs

- HEAD unchanged: `58b22c0d6d3abd4ecce03533e3867d148ff21233`; work remains uncommitted.
- Current root ESM SHA256:
  `84ba8393a1e0c24edb19130049329fae7fa3d1553817db98aa3da3691d5499e3`.
- Current root CJS SHA256:
  `4da410ad8ab17de41762aba769fffccbe5e4404a98739357aa64795bba883d95`.
- Fresh packed tarball SHA256:
  `d99b3996d615279e8622e4ab318843fbe5700d63ad1899d011b61824444b656f`.
- Combined access-router/deco source manifest SHA256:
  `0e7e130e224d346decaf72d830ab0512a5bd8fd4cd80db25199b9182247669f1`.
- Current 14-output manifest SHA256:
  `ba2eb9638f9406eae7f0ce185b9e0e6872a316ccaf37466f976be44fc3486fef`.
- Lock unchanged SHA256:
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- **47,746** captured incoming evidence/task/lock paths checked; **zero changed**.
  Includes all predecessor logs/caches/raw notes/partial evidence with no invented
  predecessor handoff. Earlier sealed baseline artifacts remain intact; root ESM
  stays `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`.
- Authoritative dependency closure separately reverified: **134 packages / 3,510
  files, zero changed**. Necessary transitive builds did not change external bytes.
- `predecessor-preservation-at-recovery.json`: the only difference against the first
  child's old preservation manifest was the shared owned-authorization task document,
  the expected coordinator reconciliation after interruption. It was captured as-is
  in the **new recovery baseline** and remains unchanged; no overwrite/reversion.
- Every declaration is free of public DocumentAuthorization/DocumentStage/old control
  slots/budget issuers. Return contexts are diagnostics only; raw metadata is DATA.
- **No owned jobs remain.** Every build/test/compiler/Mongo/HTTP process was serial,
  foreground, awaited and finished; fixture servers disconnect/close in `finally`,
  MongoMemoryServer stops in awaited test cleanup, and audit matching-job lists are empty.

## Limits and next owner

No known OAR-05 blocker remains. Callbacks/closures/native application work are
trusted server code, not a sandbox or transaction. Immutable facts do not certify
future external state, and presentation callbacks do not reopen a stage or trigger
a second automatic authorization pass. Current document-dependent authority requires
an explicit fresh normal query; a raw helper cannot substitute for it or issue a row/
write/target grant. Explicit metadata utilities retain their separate presentation
purposes and documented work.

Full two-mode/configuration coverage is **OAR-06**, complete alternate/deco/deep-import
integration **OAR-07**, installed migration/docs/old examples **OAR-08**, full scoped
integration/peer/performance gates **OAR-09**, and independent review **OAR-10**.
Untouched legacy flag/deep-import/README/full-consumer tests remain later-owned and
are not called passing. The 45-case service-finalizer helper file is now migrated.
OAR-04's older minimum-peer evidence stays historical; this recovery does not claim
the full minimum-peer compiler/install matrix. Coordinator alone updates shared tasks.
