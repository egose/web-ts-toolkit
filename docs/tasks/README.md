# Task Files — Repo-Scoped Conventions

Task files under `docs/tasks/` are shared and committed. They must stay
machine-independent so any checkout on any host can read and reproduce them.

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
  directory per task/run; maintained tests/fixtures stay in their normal locations.
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
- Disposable `TMPDIR` paths and explicitly historical scratch references may remain;
  required continuation instructions or durable evidence must not exist only there.
- Historical access-router evidence is indexed in
  [the curated archive](../task-artifacts/access-router/README.md). Its manifest
  distinguishes preserved documents from omitted raw data and execution artifacts.

## Historical note

Task records written before this convention used machine-local paths such as
`/home/<user>/...` for the checkout, `/tmp/opencode/...` for scratch
probes/logs, and harness tool-output dump paths. Those have been scrubbed to
`<repo-root>`, `<repo-root>/_tmp/...`, and `<tool-output>/...`. System-temp
defaults that must be named use `<system-tmp>/...`. Pre-convention runs are
otherwise unchanged.
