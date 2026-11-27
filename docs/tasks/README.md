# Task Files — Repo-Scoped Conventions

Task files under `docs/tasks/` are shared and committed. They must stay
machine-independent so any checkout on any host can read and reproduce them.

## Open Work

Reviewed 2026-11-26. This index links the outstanding verification gates and
selected deferred or proposed follow-ups found in the committed task records.
The plans contain their full criteria, historical results, and other deferrals.

### Blocked

- [CI-DAG-05 — CI rollout](20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-05-verify-rollout-measure-tradeoffs-and-update-testing-guidance): corrective acceptance, hosted verification, and maintainer rollout decisions are still outstanding. The recorded hosted runs failed during installation.
- [OAM-05 — access-router output authorization](20261103-172737-access-router-output-authorization-modes.md#task-oam-05-verify-integration-and-reconcile-the-delivered-contract): scoped review passed; the required serialized root test remains open after the example app's browser failure.
- [AIH-01 — asset-inliner containment](20260908-073603-asset-inliner-health-follow-up.md#task-aih-01-reject-cross-volume-traversal-escapes): the portable fix and native test runner are in the repository. A Windows runner with distinct drive volumes and UNC servers is still needed.
- [JFB-09 — JSON Frame integration review](20260908-180959-json-frame-boundary-health-follow-up.md#task-jfb-09-perform-independent-integration-and-contract-review): subsequent plans verified the package follow-ups; this review has no recorded passing final repository gate.

### Deferred or Proposed

- [AR-17 — access-router strict type checking](20260804-124249-access-router-review-remediation.md#task-ar-17-incrementally-enable-strict-type-checking): [ARF-14](20260805-192300-access-router-remediation-follow-up.md#task-arf-14-execute-incremental-strict-type-slices) delivered `noImplicitAny` and strict consumer checks. Further compiler-flag changes remain deferred.
- [ARCPU-05](20261028-005846-access-router-list-cpu-remediation.md#task-arcpu-05-direct-clone-common-bson-authorization-leaves-without-changing-semantics) and [SNAPCPU-04](20261028-121231-access-router-snapshot-validation-cpu.md#task-snapcpu-04-compare-ordinary-snapshot-structure-without-rebuilding-it): BSON cloning and snapshot comparison optimizations were withdrawn after correctness regressions.
- [ARPC-02](20261105-084939-access-router-performance-cleanup.md#task-arpc-02-amortize-safe-finalizer-and-selected-copy-preparation) and [ARPC-05](20261105-084939-access-router-performance-cleanup.md#task-arpc-05-defer-filter-summaries-until-debug-logging-is-enabled): finalizer reuse and lazy logging candidates were withdrawn after inconclusive performance results.
- [HTE-08 — HTTP error resource bounds](20260813-105538-http-errors-review-remediation.md#task-hte-08-benchmark-before-adding-resource-bounds-or-removing-utilities): benchmarking is recorded; production limits and utility removal remain deferred pending policy or stronger evidence.
- [MOO-12 and MOO-13 — orphan queries](20260912-130000-moo-07-orphan-query-evidence.md#6-follow-up-tasks): relationship correctness and the dependent server-side lookup are proposed and unscheduled.
- [CARMSF-08F — starter deployment context](20260908-230752-create-access-router-mongo-starter-boundary-follow-up.md#task-carmsf-08-establish-a-consistent-netlify-context-and-scope-contract): live provider context and scope checks require an authorized disposable site.
- [CARMSF-16F1/F2 — starter performance](20260908-230752-create-access-router-mongo-starter-boundary-follow-up.md#decisions-and-deliberate-deferrals): index and provider-read optimizations await workload evidence.
- [CARMSF-17F1 — starter race-test follow-up](20260908-230752-create-access-router-mongo-starter-boundary-follow-up.md#task-carmsf-17-independently-verify-the-follow-up-boundaries): the race assertions were updated; the post-race reads and ten-run acceptance evidence are still missing.

## Keep Task Files Repo-Scoped

Task files are shared and committed. Never record machine-specific absolute
paths (e.g. `/home/<user>/...`, `/tmp/...` outside the repo, `$HOME/...`).

- Use the `<repo-root>` placeholder for the repository root in commands,
  examples, and completion evidence: `TMPDIR='<repo-root>' ...`,
  `node scripts/build-<map-id>-zone.mjs --root '<repo-root>'`.
  Replace the placeholder with the actual checkout path before execution;
  never run a command with the literal placeholder text.
- Use repo-relative paths for files and fixtures (`docs/tasks/...`,
  `apps/client/...`). Use `$PWD` / `$(pwd)` only when a tool strictly
  requires an absolute path at runtime, and note it is the repo checkout.
- This applies to objectives, requirements, acceptance criteria, verification
  commands, and completion evidence. Scrub shell output (cwd prefixes, TMPDIR
  expansions, container mount paths) before pasting it.

## Placeholders

| Placeholder                | Meaning                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<repo-root>`              | Repository checkout root (`$PWD` at runtime).                                                                                                             |
| `<repo-root>/_tmp...`      | Ignored repository-local temp dir (e.g. `<repo-root>/_tmp-<topic>`). Use with `TMPDIR=<repo-root>/_tmp-<topic>` when tests use `os.tmpdir()`.             |
| `<system-tmp>`             | System temp dir placeholder. Only for describing genuine system-temp behavior (e.g. a tool default); never for new task evidence. Prefer repo-local temp. |
| `<tool-output>`            | Scrubbed harness/tool log location. Originals were machine-local and ephemeral.                                                                           |
| `the task-as-you-go skill` | The shared task workflow skill. Do not paste a machine-local skill path.                                                                                  |

## Temporary work

- Use ignored repository-local `_tmp*` directories for temporary testing/probes,
  fixtures, consumer installations, logs and other scratch work. Choose a fresh
  directory per task/run and create it before setting `TMPDIR`. Maintained
  tests/fixtures stay in their normal locations.
- Set `TMPDIR` to a repo-local absolute directory at runtime when a tool
  requires it, but record it as `TMPDIR='<repo-root>/_tmp-<topic>'` in the task
  file. Example: `TMPDIR='<repo-root>/_tmp-air07' pnpm --filter
@web-ts-toolkit/asset-inliner test`.
- Confirm the temp dir is ignored (`git check-ignore`). Git ignore status does
  not guarantee that lint/build tools exclude it. Do not create consumer work under
  machine-local temp outside the repo.
- Do not paste `$HOME`, `/home/<user>/...`, `/tmp/...`, tool-output dump
  paths, or `cwd=` prefixes. Scrub them to the placeholders above.

## Preserve referenced evidence before handoff

- Before finalizing work or handing it off, review referenced scratch contents and
  move useful designs, handoffs, test-migration ledgers, review/acceptance reports
  and necessary supporting evidence to
  `docs/task-artifacts/<package-name>/<task-or-run-id>/`. Use the repository package
  directory name (for example, `access-router`), not its scoped npm name.
- Update task/document references to the preserved files and verify they resolve.
  Follow [the preservation checklist](../task-artifacts/README.md) for selection,
  privacy scrubbing, provenance and omitted-data/reproducibility limits. Do not
  commit entire scratch trees, dependencies, caches or generated consumers.
- Copy rather than move when original paths/bytes are needed by active work or
  historical seals. Leave those originals unchanged, and clean only your own
  disposable files after checking that nothing depends on them.
- A `TMPDIR` example uses a fresh local directory. A saved `_tmp*` path may record
  where evidence originally lived. If a continuation needs a specific input,
  link the tracked file or explain how to regenerate it. Label old commands
  that require omitted scratch inputs as historical.
- The [artifact index](../task-artifacts/README.md#find-the-evidence) links the
  preserved reports and explains what can be reproduced from the archive.

## Historical note

Task records written before this convention used machine-local paths such as
`/home/<user>/...` for the checkout, `/tmp/opencode/...` for scratch
probes/logs, and harness tool-output dump paths. Those have been scrubbed to
`<repo-root>`, `<repo-root>/_tmp/...`, and `<tool-output>/...`. System-temp
defaults that must be named use `<system-tmp>/...`. Pre-convention runs are
otherwise unchanged.
