# ARTS-06 independent final review — blocked

**Acceptance is blocked by one confirmed boundary-guard defect. All seven V3
commands passed on the delivered identity.** No implementation repair, original
test rewrite, historical evidence edit or task-status edit was made by this reviewer.

Review identity: `fe50475fd026d70aad52bc54b1c6d3d41dbc885b` plus the delivered
uncommitted migration/tooling/companions/guide. ARTS-06 was a fresh, independent
non-implementer review. The [coordinator-owned task](../../../tasks/20261108-094712-access-router-test-contract-separation.md)
remains authoritative for status and subsequent delegation.

## Blocking finding ARTS06-F1: exact public names bypass TypeScript aliases

**P1, guard false confidence; not a demonstrated production/runtime defect.**

At [check-test-layers.mjs:269](../../../../packages/access-router/scripts/check-test-layers.mjs#L269),
`moduleEdge` accepts the three exact public package names before reaching the
TypeScript resolution check at lines 299–303. Vite aliases are checked earlier,
but an effective TypeScript `paths` alias for an exact public name is not.
This contradicts the maintained guide's source-alias enforcement claim and
ARTS-03's fail-closed alias requirement. The existing regression at
[test-layer-boundaries.unit.test.ts:104](../../../../packages/access-router/test/internal/test-layer-boundaries.unit.test.ts#L104)
tests only an unrelated bare alias, `hidden`.

An independent, fresh ignored fixture reproduced the difference without loading
or changing package implementation:

```ts
// src/secret.ts
export type Secret = { privateOnly: true };

// test/contracts/public.test.ts
import type { Secret } from '@web-ts-toolkit/access-router';
export type Leaked = Secret;
```

```json
{
  "compilerOptions": {
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "paths": {
      "@web-ts-toolkit/access-router": ["./src/secret.ts"]
    }
  }
}
```

Actual observations using the installed TypeScript and delivered
`auditContractGraph({ root: fixtureRoot, entries: ['test/contracts/public.test.ts'],
policy: { inputs: [], documents: [], reviews: [], negatives: [], negativeResolves: [] } })`:

- `ts.resolveModuleName` resolved the import to **`src/secret.ts`**.
- The guard returned **zero errors**, visiting only the public test module.
- Changing the same import/config key to `hidden` produced the expected
  **`private dependency: src/secret.ts`** diagnostic. An overlap control also failed
  correctly. The probe command exited zero because it asserts this observed defect;
  that is not a passing boundary expectation.

The producer/configuration/import is finite, ordinary and directly understood by
the checker—not reflection or a novel loader covered by its documented limits.
No delivered positive contract source leak was found: physical tests use actual
built public entries; the package-name sources examined are staged installed
consumers with their own compiler configurations. That does not satisfy the
required reusable guard enforcement for subsequent tests.

**Required next action:** coordinator delegates a bounded guard fix and regression
coverage, including exact root/subpath aliases and effective compiler settings.
Keep legitimate installed/generated consumers distinct from repository compiler
contexts; do not blindly apply repository source aliases to staged consumers.
Do not rewrite originals, broaden exemptions, weaken assertions, or mutate the
historical ARTS-03 checkpoint/manifest. Record a new tooling identity and obtain
independent re-review/reverification appropriate to that change. This review does
not accept a future identity automatically.

## Fresh complete verification

All commands ran foreground, awaited and sequentially from repository root.
Every shell gate used a **3,000,000 ms tool timeout**; none timed out. Scratch was
fresh and confirmed ignored: `_tmp-arts-06-fs1dw7i0/`; `TMPDIR` was its absolute
path at runtime. Exact argv, UTC timestamps, exits and reporter identities are in
[arts-06-verification.json](arts-06-verification.json). No filtered runtime selectors
were used for complete gates and no duplicate focused rehearsal preceded them.

| Actual command | Result | Command seconds |
| --- | --- | ---: |
| `pnpm --filter @web-ts-toolkit/access-router test:layers:check` | Pass: 218 files, exact discovered union; public graph 137 files / 237 modules | 3.194 |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Pass, including normal five-package filtered/transitive build | 27.408 |
| `pnpm --filter @web-ts-toolkit/access-router test:contracts` | **3,158 passed / 103 files** | 1,457.546 |
| `pnpm --filter @web-ts-toolkit/access-router test:invariants` | **3,078 passed / 64 files** | 243.201 |
| `pnpm --filter @web-ts-toolkit/access-router test:internal` | **1,481 passed / 51 files**, including all 59 guard regressions | 134.068 |
| `pnpm --filter @web-ts-toolkit/access-router test` | **7,717 passed / 218 files**, exhaustive default exactly once | 1,807.981 |
| Scoped `pnpm exec eslint` on `src`, `test`, `scripts`, all five `vitest*.ts` files | Pass | 8.142 |

Every complete runtime run had **zero failures, skips or todos**. The default is
still one filtered build, preflight and one Vitest execution, not three chained
layers. Original Node/setup/serial-file/timeout settings are unchanged. Normal
Vite future-native-config warnings remained visible and unsuppressed.

Environment: Linux x64, Node **v26.12.1**, pnpm **11.18.0**, TypeScript **6.0.3**,
Vitest **4.1.11**, tsup **8.5.1**, Express **5.2.1**, Mongoose **9.11.4**,
mongodb-memory-server **11.2.0**. Real Mongo, minimum/current-peer packed and bounded
publication fixtures, and installed positive/negative compiles actually ran in
contracts and default. The existing prebuilt CLI fixture was read-only; no unrelated
CLI, broad release build, root/grouped/downstream suite or new performance campaign ran.
Existing bounded benchmark/tooling tests ran only inside their required layers.

## Assertion preservation and actual case comparison

The reviewer independently used the unchanged ARTS-02 verifier's exported
`restoreOriginal`/`analyze`, **not its now-inapplicable whole-tree/config `verify()`**:

- All **248 original files** match exact ARTS-02 destination bytes. Reversing only
  **1,093 logged repairs** reconstructs every Git-baseline file byte-for-byte.
- All frozen AST/body/token/value records match: **2,615 groups / 2,246 static case
  declarations / 11,254 assertion-looking call sites / 849 parameterizations /
  411 directives / 4,245 top-level statements**. Setup, cleanup, tables, expected
  values, generated strings and negative diagnostics are protected by complete
  bytes/nodes, not merely these counts. No split, retirement or weakening occurred.
- All **7,565 original expanded cases** are mapped and passed in their standalone
  layer and default. All **93 companions** and **59 guard cases** likewise map to
  prior sealed identities and passed in both. Nine excess duplicate titles across
  seven original files retain occurrence-qualified identities.
- Actual file selection is an exact disjoint standalone union equal to default
  and physical inventory: **103 + 64 + 51 = 218**. Case selection is also exact
  after the two explicitly bounded original dynamic-parameter mappings below.

### Review note ARTS06-N1: two raw titles are intentionally not equal

The first strict raw-title comparison **failed** and is retained in command
history. **7,715/7,717** standalone/default raw case identities match exactly;
**7,563/7,565** original raw titles match baseline. The only exceptions are:

1. F069, [hydration-configuration.test.ts:44–65](../../../../packages/access-router/test/contracts/hydration-configuration.test.ts#L44),
   parameter **5**, `new Date()` at line 49; reporter location **55:5**.
2. F185, [service-authorization-reads.unit.test.ts:48–55](../../../../packages/access-router/test/internal/service-authorization-reads.unit.test.ts#L48),
   parameter **3**, `new mongoose.mongo.BSON.ObjectId()`; reporter location **48:107**.

These constructors already exist in the exact Git baseline. Their generated values
are embedded in titles each run. The subsequent comparison maps only these two
specific constructors/parameter ordinals/locations and records **all observed raw
titles and hashes**, including baseline, standalone and default. All other titles,
locations and occurrences compare exactly. No generic title stripping, silent
baseline regeneration, expectation change or original-test edit was used. This is
a reproducibility limit, not evidence of case loss; literal raw-title set equality
must not be claimed. The final machine-readable comparison expressly reports it false.

[arts-06-cases.jsonl](arts-06-cases.jsonl) preserves all 7,717 current raw default
observations, original/additive identity joins and passed statuses in both runs.
Its schema and the two differing standalone observations are in the verification JSON.
ARTS-03 historical guard IDs are treated as opaque prior IDs; fresh location-bearing
IDs are recorded separately rather than rewriting their old schema.

## Actual boundary, matrix and caller review

The review inspected the actual script/config diffs, guard/policy and 59 regression
cases, all six companion files and four support files, public setup/fixture
acquisition, strict/packed/docs producers and compiler lists, baseline classification
and executed repair/caller ledgers. Risk-oriented original checks included raw
helpers versus method-spy seams, metadata/facts, retained owners, application-model
failure injection, documented callback/query bounds and public type re-exports.

- **Public closure:** direct/type/import-type/re-export/loader edges, configured
  setup and transitive fixtures, finite filesystem consumers, generated modules,
  declaration JSDoc and exact three MIGRATION recipe bodies were reviewed.
  Traversal stops at the three supported built entries; internal chunks/private
  fixtures are not positive public evidence. Failure-only deep-import exceptions
  were inspected in their actual unused-type/`assert.throws(require.resolve)`
  contexts and in installed compiler/runtime callers. Existing negative compiles
  reject their statements rather than merely observing unrelated compiler failure.
  The confirmed exact-name TypeScript alias hole remains the blocker above.
- **Acquisition and seams:** real initialized request middleware obtains services;
  no private Core/Permission/service construction, capability/stage/budget injection,
  source alias, package mock or package-method spy was found in the delivered public
  evidence. Consumer model/schema/hook spies are legitimate. Public `findRawParentDoc`
  or `trimOutputFields` calls do not authorize spying on their internal dispatch;
  the mixed original policy tests correctly remain below contracts.
- **Modes:** all 16 independent source tuples execute six real primary operations
  each (**96 operations**), distinguishing literal `output-hook` versus stored/submitted
  values and checking actual persistence, denied fields, frozen facts and executed
  UPSERT branch contexts. TARGET independently varies all four target READ/LIST pairs
  under two opposing source postures, including create/update populated results,
  sibling values, retained live native targets and stored state. CAPTURE includes
  held pending versus fresh/nested calls, defaults/restoration and warning membership;
  FALLBACK distinguishes initiating READ mode from independent LIST mode.
- **Ownership and hard failures:** DETACH independently checks caller payload,
  live lifecycle document, prepared/final snapshots, returned native/plain values
  and Mongo storage across both modes/four write branches. Its post-save error is
  a real selected native scope overflow, not an invented blanket write byte cap.
  COLLECTION really admits three predicates at gate two, holds a small row while
  two 4 MiB payload rows finish, then verifies drain-before-rejection/no publication
  and a fresh successful call. No injected private budget or promise-turn count.
- **Other rows:** actual HTTP/root omissions/errors, metadata alias/index alignment,
  non-authority, denied writes/I/O and guard-before-validation order are explicit.
  Data native views/snapshots/version ownership are separate from write lifecycle
  ownership. Callback arguments and original request receivers are checked. Invalid
  populate admission is documented forbidden global placement, consistent with
  existing non-false-to-strict normalization—not a newly invented enum restriction.
- **Exports:** new real installed ESM/CJS probes are additive semantic checks.
  Name absence alone is not used to prove encapsulation: the original packed
  failure-only deep-path resolutions and actual Bundler/NodeNext/Node16 positive
  and negative compiles ran fresh. Existing peer-library `skipLibCheck` distinctions
  remain exact, not silently strengthened or relaxed by this phase.

The executable [ARTS-04 mapping](arts-04-coverage.json) reconciles **34 gap rows,
23 surfaces, 97 retained public files and 93 unique companion cases**. No bounded
matrix omission or classification regression was found in this review.

All **37 support/caller mappings**, **25 normalized installed sources**, **16 root
derivations** and three generated recipes were independently checked. Root CRUD
benchmark fixture/setup/global setup retain exact paths/bytes; both downstream
setup imports and the benchmark caller still resolve. The dormant legacy compiler
fixture remains unchanged, private and uncompiled. Static grouped-run inspection
confirms unchanged build closure/three CLI read candidates; no grouped command ran.

## Protected identities, evidence and handoff

- Fresh final build: complete **eight-declaration inventory** equals ARTS-01 in
  names and bytes, including both shared declarations. All **152 sources**, public
  ESM/CJS export-name sets (**46/48/6**) and package metadata/dependencies/exports
  are unchanged except the approved test scripts. All **10 ARTS-03 tooling files**
  match their historical checkpoint. The only old non-test exceptions are those
  scripts and the exact shared-settings config edit.
- Current ARTS-04 file identities match, using cleanup's superseding exporter hash
  **only**. Reversing exactly its three import/type edits and appended guarded
  teardown recovers its original ARTS-04 hash. The guide matches ARTS-05's identity.
- The actual historical bundle contains **37 files** (34 pre-ARTS-05 + three
  ARTS-05 records). All remain unchanged, as do **422 captured delivered inputs**,
  including the coordinator task. Historical seal chains were validated without
  editing reports, README, manifests or verifiers.
- New JSON/JSONL, links, privacy, whitespace, ignore status and before/after identities
  were audited; exact results are in the verification JSON. [FINAL.md](FINAL.md)
  indexes all phases without replacing the sealed historical baseline README.

Raw logs/full reporter JSON, dependencies, generated consumers/tarballs/builds,
database data and disposable audit scripts are omitted. Exact reporter identities,
curated cases, command exits/times and the failed raw comparison are preserved.
Historical scratch commands require omitted scripts; the Git baseline, sealed
verifiers/ledgers and the finite finding inputs above remain available. Runtime
reproduction needs normal dependencies, Mongo/registry access and the existing
prebuilt CLI fixture. This is not a hermetic archive, universal compatibility proof,
speed claim or sandbox. Reflection/arbitrary dataflow and reviewed generator
transformations remain manual-review obligations even after the blocker is repaired.

**Handoff: blocked on ARTS06-F1.** Coordinator alone owns task status/fix delegation.
No further agents, commits, resets, implementation edits or manual deletions occurred.
Every command completed; no queued/background build/test jobs remain.
