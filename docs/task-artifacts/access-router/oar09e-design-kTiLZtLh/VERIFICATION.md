> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Architecture-only verification

All commands ran at repo root, serial/foreground/awaited. All writes were inside
`_tmp-oar09e-design-kTiLZtLh/`; no old runner or cache wrapper was executed.

## Current-artifact probes

- `node _tmp-oar09e-design-kTiLZtLh/probe-helper.mjs` — exit 0. Exact emitted source
  hash checked before copying; all instrumented entry seams require exactly one
  match. 1/10/100 helper DTOs/ordered paths verified. `HELPER-WORK.json` and log retain
  actual function counts and query-plan array lengths. No candidate or timing data.
- `node _tmp-oar09e-design-kTiLZtLh/probe-guard.mjs` — exit 1, preserved. The initial
  fixture's scalar `baseFilter:false` did not mean a denying row hook. No product
  change or acceptance claim followed.
- `node _tmp-oar09e-design-kTiLZtLh/probe-guard-v2.mjs` — exit 0; corrected fixture
  uses `baseFilter.read: () => false`. Five fake-adapter guard cases verify current
  field/decoration counts, invalid virtual 400, decoration throw, row 401 and initial
  direct-service versus HTTP-route operation-gate distinction. No Mongo was started.

## Preservation and document checks

- `git check-ignore docs/task-artifacts/access-router/oar09e-design-kTiLZtLh/DESIGN.md` — confirms ignored packet.
- `python3 _tmp-oar09e-design-kTiLZtLh/audit.py entry` and `... final` — all **3,231
  entry identities unchanged**, same user HEAD, same sole coordinator task change.
  All **622** 09D candidate metadata records match archived bytes. Live outputs/tools/
  declarations match; one inherited source-test line-wrap difference is explained
  with entry/user-HEAD hashes and the saved inspected diff. Original strict seal-
  comparison failure is retained in `PRESERVATION-METADATA-DIAGNOSTIC.json`.
- `node node_modules/prettier/bin/prettier.cjs --ignore-path .prettierignore --write`
  and `--check` on the three new Markdown documents — formatting only these new notes.
  The first write without an explicit ignore path skipped the ignored packet; the
  explicit-ignore-path invocation processes the actual files. No product formatting.
- Direct `prettier.check` on each file's loaded contents also passes all three files,
  independently of ignore matching; `DOCUMENT-CHECK.json` records their nonzero byte
  lengths. Trailing-whitespace and final-newline assertions pass.
- `git diff --check` — pass; the coordinator task modification remains untouched.
- Final read-only process observation: `processes-final.json`. No owned probe,
  build/test/worker/server/Mongo job remains. No background commands were used.

The hash audit includes all tracked files, metadata-listed live/candidate files,
original baseline regular payload and named historical contracts/reports. It does
not claim a recursive historical-cache or external dependency/tool-closure audit.
No dependency/cache tree was written by the commands above. Original baseline ESM
remains `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`;
current ESM remains `7faeb957631bd5761e8b828835f4b600634db1afa740e229549bfc4ba6a74a4f`.

## Not run / not claimed

No implementation, committed test/tool/doc edits, build, lint, full/focused package
test gate, packed consumer gate, 180-job smoke or V8 campaign. Existing OAR-09D
passing gates and three failed campaigns remain historical evidence. Proposed count
reductions, G1–G5 semantics, output-selection equivalence and performance still need
implementation verification, a new seal, fresh fixed measurement and later review.
