# Durable task artifacts

Use ignored repository-local `_tmp*` directories freely for temporary testing,
probes, fixtures, consumer installations, logs and other scratch work. Before
finalizing a task or handing work off, promote referenced contents that deserve
preservation here so another checkout does not depend on ignored local files.

## Location

Store artifacts under:

```text
docs/task-artifacts/<package-name>/<task-or-run-id>/
```

Use the package's repository directory name, such as `access-router` or
`asset-inliner`, rather than its scoped npm name. Choose a stable, descriptive,
unique task/run directory; do not overwrite earlier evidence. For cross-package
work, use the primary package and link to it from related tasks instead of
duplicating the bundle. Placeholders must be replaced before executing commands.

## What to preserve

- Designs and decisions whose rationale is not captured in maintained documentation.
- Handoffs needed to resume unfinished work.
- Test-migration or retirement ledgers explaining retained coverage.
- Review findings, resolutions, acceptance reports and meaningful performance results.
- Selected protocols, data or logs needed to support or reproduce those claims.

Do not preserve something merely because a historical command mentions its path.
References to disposable `TMPDIR` locations may remain when clearly identified as
historical scratch work, not required evidence or execution prerequisites.

Do not commit dependency trees, caches, database files, browser profiles/binaries,
generated consumers/builds/tarballs or redundant intermediate output. Convert useful
regression probes into maintained package tests, and reusable benchmark drivers
into the existing benchmark location, rather than keeping scratch implementations
as documentation artifacts.

## Promotion checklist

1. Review referenced scratch contents before final completion/handoff. Select the
   smallest useful set, including supporting files required by its intended use.
2. Move selected files into the package/task directory. If original paths/bytes are
   still needed by active work or integrity seals, copy and curate instead; do not
   invalidate those records or rewrite old hashes to imply a new verification run.
3. Scrub credentials, full private session identifiers, machine-local paths and
   identifying URLs. Use task-local aliases, repo-relative paths and quoted
   `<repo-root>` placeholders. Review structured data and logs as well as Markdown.
4. Add a short bundle index stating purpose, related task(s), provenance, historical
   status and limitations. If copying/transformation matters to evidence integrity,
   distinguish original and archived paths/hashes in a manifest. Keep historical
   failures and later resolutions distinguishable.
5. Update task files, handoffs and other documentation to reference the preserved
   files. Repair internal links and runnable commands where appropriate; do not
   redirect a whole directory when only selected files were preserved.
6. State explicitly which raw data, dependencies or executable artifacts were omitted.
   A summary-only archive is not a self-contained reproduction bundle. Historical
   commands or protocols that require omitted inputs must be labeled non-runnable
   from the archive; preserve necessary raw observations if claiming recalculation.
7. Check links/references, structured-file validity, privacy-sensitive content and
   `git diff --check`. Confirm destinations are not ignored with `git check-ignore`.
   Report what was actually checked; archiving does not rerun or recertify old results.
   Pre-commit hooks (including Prettier and gitleaks) do not scan
   `docs/task-artifacts/` — see the global `exclude` in `.pre-commit-config.yaml`
   and its `.gitleaks.toml` allowlist — so this manual review is the only check.
8. Only clean up your own scratch files when no active work or preservation need
   depends on them. Never delete unrelated temporary work, or commit/push artifacts
   without authorization.

See [task-file conventions](../tasks/README.md) for scratch-directory usage and
machine-independent evidence records.

## Existing bundles

- [Access-router historical evidence](access-router/README.md)
