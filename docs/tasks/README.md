# Task Files — Repo-Scoped Conventions

Task files under `docs/tasks/` are shared and committed. They must stay
machine-independent so any checkout on any host can read and reproduce them.

## Keep Task Files Repo-Scoped

Task files are shared and committed. Never record machine-specific absolute
paths (e.g. `/home/<user>/...`, `/tmp/...` outside the repo, `$HOME/...`).

- Use the `<repo-root>` placeholder for the repository root in commands,
  examples, and completion evidence: `TMPDIR=<repo-root> ...`,
  `node scripts/build-<map-id>-zone.mjs --root <repo-root>`.
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

- Use ignored repository-local `_tmp*` directories for temporary
  fixtures/consumer installations.
- Set `TMPDIR` to a repo-local absolute directory at runtime when a tool
  requires it, but record it as `TMPDIR=<repo-root>/_tmp-<topic>` in the task
  file. Example: `TMPDIR=<repo-root>/_tmp-air07 pnpm --filter
@web-ts-toolkit/asset-inliner test`.
- Confirm the temp dir is ignored (`git check-ignore`) and clean fixtures
  when done. Do not create consumer work under machine-local temp outside
  the repo.
- Do not paste `$HOME`, `/home/<user>/...`, `/tmp/...`, tool-output dump
  paths, or `cwd=` prefixes. Scrub them to the placeholders above.

## Historical note

Task records written before this convention used machine-local paths such as
`/home/<user>/...` for the checkout, `/tmp/opencode/...` for scratch
probes/logs, and harness tool-output dump paths. Those have been scrubbed to
`<repo-root>`, `<repo-root>/_tmp/...`, and `<tool-output>/...`. System-temp
defaults that must be named use `<system-tmp>/...`. Pre-convention runs are
otherwise unchanged.
