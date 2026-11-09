# ARTS-01: baseline and test-contract classification

Fresh investigation for [ARTS-01](../../../tasks/20261108-094712-access-router-test-contract-separation.md#task-arts-01-freeze-baseline-and-classify-assertions-against-supported-usage).
Revision: `fe50475fd026d70aad52bc54b1c6d3d41dbc885b`, no starting tracked diff.
This bundle freezes the baseline and **planned** migration; it does not implement
test moves, layer commands, public companions or final acceptance.

## Start here

- [Outcome and handoff](arts-01-report.md)
- [Every file's classification and rationale](classification.md)
- [Public behavior matrix, all 16 source tuples and bounded gaps](coverage-gaps.md)
- [Exact migration destinations/import repairs](migration-ledger.json)
- [Support callers and path-sensitive generated/filesystem inputs](support-callers.json)
- [Source/config/doc/caller identities, environment, commands and baseline results](identities.json)
- [Complete generated declaration inventory](declarations.json)
- [Runtime and named declaration exports](public-surfaces.json)
- [Static assertion/group/parameter/setup preservation records](preservation-ledger.jsonl)
- [All expanded runtime case identities/results](runtime-cases.jsonl)
- [Read-only baseline verifier](verify-baseline.mjs), [curation checks](verification.json)
  and [bundle hashes](bundle-manifest.json)

## Reading the ledgers

`migration-ledger.json` assigns stable `Fnnn` IDs to all **248** original files.
Each has a `from`, planned `to`, decision, repair list and original identities.
Every original assertion/group/parameter/setup/cleanup inherits its file's planned
destination, unchanged apart from explicitly reviewed mechanical/public-equivalent
repairs. **No splits or retirement are approved.** Companions are additive work.

`preservation-ledger.jsonl` has one JSON object per file/group/assertion/
parameterization/directive. File records also hash every top-level statement,
protecting fixture data, closure definitions, imports, setup and cleanup. Group
records retain original title expressions and full node/body hashes. Assertion
hashes include matchers, arguments, expected values and negative checks. Parameter
hashes protect `.each`/`.for` expressions; whole-file hashes additionally protect
referenced tables and arbitrary dynamic case builders. Directives protect exact
line content for expected-error/ignore/nocheck/check and `// reject-next` markers,
including generated source literals. These are static call sites, not runtime
assertion counts, and chained calls can produce multiple records.

Normalization uses TypeScript **6.0.3**: recursively encode
`[SyntaxKind, ...children]`, with token text for token nodes; SHA-256 the compact
JSON. Trivia is excluded from normalized AST hashes, so raw byte hashes and
separately recorded negative directives are also mandatory. The verifier carries
the same algorithm; the temporary inventory generator is not needed.

`runtime-cases.jsonl` rows are arrays with columns:

```text
[fileID, caseSHA256, fullTitle, originalLine, originalColumn, titleOccurrence, status]
```

Case SHA-256 is over compact JSON
`[originalRepoRelativePath, fullTitle, line, column, titleOccurrence]`.
Occurrence is one-based within a file/full-title pair in report order. Thus all
7,565 cases retain unique identities, including nine excess duplicate titles in
seven files. Original locations support review; they are not a promise that line
numbers survive later import edits. Future moves must retain occurrence/title
multiplicity and map location changes, not regenerate a baseline to hide changes.
Static bodies/table hashes protect the semantics behind duplicate/dynamic titles.

## Reconstruct and verify without scratch

The tracked baseline is the exact recorded Git revision plus
[starting.patch](starting.patch), a **zero-byte** patch with the SHA-256 recorded in
`identities.json`. It does not require a scratch source copy. The sole starting
untracked file was the coordinator's task document, not a runtime/compiler input.

From repository root, with installed recorded dependencies:

```sh
node docs/task-artifacts/access-router/20261108-094712-test-contract-separation/verify-baseline.mjs --git-baseline
```

This reads original files using `git show`; it does not checkout/reset/write any
source. Add `--declarations` to compare the current generated declaration inventory
after an authorized filtered build. Omit `--git-baseline` to verify an unchanged
working-tree baseline. Both modes passed with `--declarations` during ARTS-01.
The utility is a one-off evidence check, **not** the future dependency/layer checker
or proof that relocated tests preserved behavior. Mechanical changes must be
reviewed against the old nodes/values and explicitly ledgered in ARTS-02.

Fresh runtime reproduction needs the recorded source, dependency installation,
MongoDB binary availability, consumer-install access and the existing prebuilt CLI
fixture. Historical exact argv/TMPDIR/elapsed/exit codes are in `identities.json`.
Any `<repo-root>` placeholder must be replaced and quoted before execution; use a
fresh ignored repository-local `_tmp*` directory and set its absolute path as
`TMPDIR`. Do not run build/test commands concurrently or expand package scope.

## Provenance and limitations

- Curated from the fresh ARTS-01 run in ignored
  `_tmp-arts-01-20261108-095305/`; that directory is historical scratch, **not** a
  required artifact dependency. Originals were left intact for active evidence.
- Retained every runtime case status/title/location/occurrence, original static
  identities, decisions and necessary caller/declaration metadata. Absolute report
  paths became repo-relative file mappings. Timings per case, empty failures,
  metadata and raw report/log bulk were omitted; the original report hash/size
  identifies the transformation, not a file shipped here.
- Source snapshots, full raw logs/report, generated consumers/builds/tarballs,
  node_modules, MongoDB binaries/database data, caches and unrelated tracked-file
  inventory are omitted. Git supplies the source; this is **not** a hermetic
  runtime reproduction bundle or an archive from which omitted logs can be
  recalculated. The read-only CLI's curation-time hash does not rebuild it.
- The full test baseline passed, but current public-eligible files still need their
  ledgered import/literal/path repairs and a dependency guard. Public companions
  remain unimplemented; private-only mode coverage is not counted as public proof.
- One legacy support fixture is dormant and still describes removed handles; it is
  explicitly private-dormant, not a passing current consumer compile.
- No independent final review, new performance campaign or universal compatibility
  proof is claimed. The shared task file remains coordinator-owned and unchanged.
