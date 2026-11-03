> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-04 publication/native materialization handoff

**Outcome: OAR-04 is implemented and its scoped gates pass.** Coordinator owns task
status reconciliation. No task document was edited, no OAR-05 implementation was
started, and no full-package/release-candidate/performance acceptance is claimed.

Authority read: AGENTS; full C1–C6, resolved OAR-01 and OAR-04; OAR-01 amendments
A1–A5, architecture/context/budget inventory, implementation handoff, performance
gates/measurement plan; OAR-02 recovery; authoritative OAR-03 handoff/migration ledger.
Applicable package/task skills were loaded. No delegation occurred.

## Product delta: 14 files relative to incoming OAR-01–03

Paths below are within `packages/access-router/`. Exact incoming/current hashes are
in `audit-final-01.json` (`delta`), not inferred from HEAD's much larger combined diff.

### Runtime: nine files

- `src/acl/document-stage.ts`: avoid duplicate source-admission lookup/root descriptor
  traversal and unused disposable views when no application hook can run. Genuine
  embedded source traversal reuses the private parent's owned subtree, with actual
  binding/scope/access/provenance checks. Dedicated child rows only share parent facts
  and still normalize their own (including hydrated) source. Actual doc-hook and
  getter exposures remain detached in isolated mode; trusted only borrows ordinary
  source/hook input. No result-keyed source/output certificate was added.
- `src/acl/output-field-filter.ts`: prepay attempted field-metadata keys **before**
  even denied policy evaluation; correct dotted metadata depth; reference ID slots
  charge before descriptors, with controlled sticky invalid-reference rejection.
  Raw helper embedded traversal uses the same genuine private source handoff.
- `src/acl/service-execution.ts`: private receiving-budget callback can explicitly
  discard a row with no output receiver. This is not a new public policy/option.
- `src/acl/trusted-output-materialization.ts`: shared receiver failure poisons every
  registered owner; sparse-array length consumes actual element depth; empty arrays
  at depth 100 remain supported. Direct Date normalization rejects nonnumeric results
  without coercion, Buffer copies intrinsic bytes, RegExp uses intrinsic state. Removed
  unused spine-association callbacks/arrays, not safe construction or bounded native
  preparation. All native/ordinary selected accounting remains real and sticky.
- `src/helpers/concurrency.ts`: commit callback-produced output row/child arrays with
  own safe data definitions, not inherited setter-sensitive assignments. Scheduling,
  FIFO, limits and allSettled drain behavior are unchanged.
- `src/output/finalize-model-output.ts`: exact private completed references transfer
  into the parent without another DTO materialization/authority-transfer walk. Keeps
  per-getter/stable/private-input/returned-value staging, native isolation, child-first
  order and per-parent mutable-child isolation. Actual embedded source handoff is
  distinct from dedicated externally returned child rows.
- `src/output/include-output.ts`: use the admitted private population source rather
  than another shallow source shell; copy an attachment once **per parent**, keep that
  exact private copy, and transfer it at publication instead of copying it again.
  Getter views are separate and cannot write this private attachment implicitly.
- `src/services/base.ts`: exact list-include receivers match actual association-index
  semantics (missing slots do not attach; multikey/duplicate matches attach once per
  parent). Unattached rows discard before source/native admission and hooks, rather
  than consuming every parent's quota or obtaining a fresh child quota.
- `src/services/service.ts`: preregister all receiving root budgets, depths and repeated
  occurrences before selected target policy/native work. Compose exact source/fetch
  provenance, never ID equality. Bounded source-path slots/array-spine occurrence plans
  prevent callbacks from adding receivers after construction starts; they are cleared
  with the operation, not keyed by returned DTOs and not a validation certificate.
  Nested reference arrays finish all targets, native IDs detach before completed
  handoff, unsupported/accessor shapes reject without getter observations. Target mode
  stays target-owned; an already-isolated target no longer receives an unnecessary
  parent-side full copy (isolated parent/trusted target still detaches). Metadata root
  and generated map keys admit at their actual dotted depth before content callbacks.

### Permanent tests: five files

- New `test/owned-authorization-publication.unit.test.ts`: **50 cases** covering actual
  private handoffs/copy counts, both modes, root/embedded/related/native/metadata shared
  depleted budgets, exact depth/empty/sparse controls, fanout/multiplicity, callback
  mutations, readonly/native controls, denied getter/tag/policy observations, sticky
  caught poison, safe array slots, target-first/sibling/per-parent isolation, hook/read
  counts and actual source/field materialization work.
- `test/authorization-fast-path-native.unit.test.ts`: all **102** original cases
  migrated to real modes/current API; exact native/denied accounting retained.
- `test/authorization-fast-path-native.runtime.fixture.mjs`: actual packed public
  READ/LIST, both modes, ordinary Code/DBRef 200 and oversized Code/DBRef/denied-wire 400.
- `test/packed-consumer-compatibility.test.ts`: only focused native gate title changes;
  real production-transformed tarball setup retained.
- `test/private-populate-read-policy.runtime.test.ts`: all **88** cases retained;
  obsolete backing snapshot/handle assertions become absence + fresh-helper assertions.

See `LEGACY-TEST-MIGRATION-LEDGER.md` for explicit old-to-new security-purpose mapping,
regression-before evidence, fixture corrections and later-owned unmigrated suites.
No old file was deleted/skipped/excluded to claim full integration.

## Verification actually run, serial foreground, repo root

All logs/configs/output/cache directories are unique under this new ignored directory.
`run.py <label> <command...>` records exact argv and creates a new TMPDIR per command.

1. **V1 final:** `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`
   — five packages only, ESM/CJS/all eight declarations pass (`build-final-02.log`).
2. **V2 final:** `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar04-20261031-200901/vitest-final-03.mjs --no-file-parallelism --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=<repo-root>/_tmp-oar04-20261031-200901/vitest-final-03-results.json`
   — **524 passed / 12 full files**, no filtered cases (`focused-final-03.log`):

   | Package-relative file | Passed |
   | --- | ---: |
   | test/owned-authorization-stage.unit.test.ts | 111 |
   | test/authorization-fast-path-native.unit.test.ts | 102 |
   | test/owned-authorization-publication.unit.test.ts | 50 |
   | test/owned-authorization-boundaries.unit.test.ts | 63 |
   | test/private-populate-read-policy.runtime.test.ts | 88 |
   | test/include-permission-metadata.integration.test.ts | 38 |
   | test/owned-authorization-facts.unit.test.ts | 35 |
   | test/virtuals-populate-dependencies.capture-boundaries.review.test.ts | 14 |
   | test/virtuals-populate-dependencies.review.test.ts | 12 |
   | test/document-isolation-builder.unit.test.ts | 6 |
   | test/owned-authorization-types.test.ts | 2 |
   | test/permission.test.ts | 3 |

   The Mongo suites use the existing system binary read-only and new scratch DB paths;
   all servers/jobs settle. Installed type controls are strict current-peer ESM/CJS
   NodeNext with skipLibCheck:false, not the entire V7 compiler matrix.
3. Source TypeScript: `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
   — passes (`source-types-final-01.log`).
4. `pnpm --filter @web-ts-toolkit/access-router-deco build` — ESM/CJS/DTS pass
   (`deco-build-final-01.log`), no deco product changes by this task, no broad V4 claim.
5. Changed-file ESLint `--no-cache` / Prettier check on exactly the 14 paths above —
   pass (`lint-final-01.log`, `prettier-final-01.log`, `changed-files-03.json`).
   `git diff --check` passes (`diff-check-final-01.log`). Formatting candidates came
   from the current authored contents and were applied through patch operations,
   never a restoration from HEAD or earlier user work.
6. Focused fresh packed test:
   `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar04-20261031-200901/vitest-packed-final-02.mjs --no-file-parallelism --maxWorkers=1 -t OAR-04 --reporter=default`
   — **1 selected test passes / 11 unselected**, actual **16 HTTP requests** at current
   Express **5.2.1** / Mongoose **9.11.4** (`packed-final-02.log`). Fresh production
   transform → pack → unpack; unpacked JS/declarations match live outputs. Evidence:
   `packed-final-02/native-budget-smO2Xo/` (tarball, fixture, result JSON).
7. Actual minimum-peer runtime, **same fresh tarball / same 16-request fixture**:
   `node _tmp-oar04-20261031-200901/packed-minimum-peer.mjs minimum-peer-final-01 _tmp-oar04-20261031-200901/packed-final-02/native-budget-smO2Xo/web-ts-toolkit-access-router-0.99.0-test.tgz`
   — passes on Express **5.0.0** / Mongoose **8.0.0** (driver **6.2.0**, BSON **6.10.4**)
   (`minimum-native-final-01.log`, `minimum-peer-final-01/result.json`). The script
   stages the tarball and necessary unchanged workspace dependency bytes with all
   workspace peer resolutions pointing at these minimum peers. Existing cached CAS
   bytes were materialized read-only, digest-verified: **95 packages / 1,681 files**
   (`cached-min-peers-02.json`). No install/network/lock/manifest/cache rewrite. This
   is a proportionate native/runtime peer check, not all minimum-peer type workflows.

   Both peer runs: ordinary values return 200; all three invalid families return
   controlled 400/no partial DTO in both modes/origins. Each run has **10 actual
   document hooks / 4 native wire hooks**: isolated invalid source admission rejects
   before its document hook, never a fallback rehook. Servers/Mongo close in finally.
8. `compare-work.py`, `audit.py final-01` — pass; work comparison and identity/job
   manifests are preserved. No full V3/V4/V7, benchmark runner/candidate timing,
   workspace-wide build/lint/test, commit, publication, install or dependency change.

Placeholders above denote the checkout and must be substituted before execution;
the actual expanded argv/environment is recorded in each ignored log.

## Actual structural work comparison, not latency/CPU/allocation claims

`work-before-02.log` ran the incoming OAR-03 ESM **before rebuilding**;
`work-final-01.log` ran the final ESM with the unchanged scratch driver. Six rows,
24 function fields plus one Date field; explicit adapters, **zero Mongo reads**.
Every pair preserves full response fingerprint, **144 field callbacks**, actual
hook/getter counts and adapter reads. `work-comparison-final-01.json` asserts this.

| Mode / scenario | Date normalizations before → after | Hooks / getters / adapter reads |
| --- | ---: | --- |
| isolated / no-hook | 18 → 12 | 0 / 0 / 1 |
| isolated / facts | 18 → 18 | 6 / 0 / 1 |
| isolated / two getters | 36 → 30 | 0 / 12 / 1 |
| isolated / shared include | 33 → 20 | 0 / 0 / 2 |
| trusted / no-hook | 6 → 6 | 0 / 0 / 1 |
| trusted / facts | 6 → 6 | 6 / 0 / 1 |
| trusted / two getters | 24 → 24 | 0 / 12 / 1 |
| trusted / shared include | 19 → 13 | 0 / 0 / 2 |

The getter/stable views remain; only an unused hook view and redundant attachment
publication work disappear. A permanent source-spy probe separately observes
**12 whole-source materializations isolated / 0 trusted**, **144 selected scalar
materializations**, six hooks and one adapter read for six rows/24 fields. The 12
are one owned source + one genuine disposable hook view per row, not per field.
Additional tests observe one attachment isolation materialization with no DTO
re-walk at restore and zero independent child-root source copies for genuine owned
embedded occurrences. Per-parent copies still debit root-row budgets. No optimized
DTO construction-cost certificate/ledger or claimed CPU/latency saving was introduced.
Allocation/retained-heap counters were not measured. OAR-09's fixed gates are untouched.

## Final identities and preservation

- HEAD unchanged: `58b22c0d6d3abd4ecce03533e3867d148ff21233`.
- Current root ESM SHA256:
  `2a307e6684f8976fcd4bcaba8661d77adb363b75fe777a6956ed206366ed0159`.
- Current root CJS SHA256:
  `93aed8acbbc68070e66abc03618c94adb3cf96d72d260edd66f9ba8be4cf9fac`.
- Fresh tarball SHA256 (both peer probes):
  `d0feea01836d72fddf0ce9b28722517ae432fcded86d8731b99eb338ee7264e1`.
- Lock unchanged SHA256:
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- `audit-final-01.json`: **42,517 incoming evidence/task/lock paths checked, zero
  changed**. Authoritative baseline dependency closure independently reverified:
  **134 packages / 3,510 files, zero changed**. All earlier logs/caches/artifacts,
  task documents and incoming OAR-01–03 product work remain intact except the exact
  scoped OAR-04 delta. Sealed baseline ESM remains `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`.
- All 14 current access-router output identities and 155 access-router/deco source
  identities are recorded in the audit. No private stage/budget issuer or old public
  capability appears in declarations. No owned build/test/compiler/Mongo/server/worker
  jobs remain; every command was foreground, awaited and serial.

## Limits and next owner

OAR-04's publication/native scope is ready for coordinator acceptance; no known
OAR-04 verification blocker remains. This is not a full proof/sandbox/transaction,
universal performance claim, rolling compatibility promise or final release state.
Trusted external closures/native application work remain trusted code. Mandatory
callback/private-input/per-parent isolation and native staging remain necessary.

- OAR-05 next: broad helper/forgery/control/context escape migration and fresh-query
  versus zero-read helper behavior. No old output authority machinery was restored.
- OAR-06: exhaustive mode/setter/default/in-flight/warning/admission/deco matrix.
- OAR-07: broad write/upsert/dedicated/data/deco integration and remaining old private
  finalizer/deep-import suites; preserve their security assertions as in the ledger.
- OAR-08: installed migration/README/website/guide fixtures. Old docs remain pending.
- OAR-09: full allowed-package suites/types/exports/packed-guide/peer workflows,
  benchmark runner profiles and unchanged performance/retention protocol. Runtime
  minimum-peer success here is not full minimum-peer type or install-matrix acceptance.
- OAR-10: independent review by a fresh separate owner. Coordinator alone updates tasks.
