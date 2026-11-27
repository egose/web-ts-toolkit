# Durable task artifacts

Use ignored repository-local `_tmp*` directories freely for temporary testing,
probes, fixtures, consumer installations, logs and other scratch work. Before
finalizing a task or handing work off, promote referenced contents that deserve
preservation here so another checkout does not depend on ignored local files.

## Reading `_tmp*` references

- `TMPDIR` in a new command is a workspace for files that command will create.
  Make a fresh ignored directory in your checkout and use its absolute path.
- A manifest's original path or a command under historical results describes the
  checkout where the work ran. Follow the archived path or summary for the
  retained evidence. A fresh clone does not contain the original scratch files.
- A command that **reads** an old scratch script, build, or data file needs that
  input. Link to a tracked replacement or give a regeneration procedure if the
  command is meant to be runnable. Otherwise, state which input is missing and
  label the command as historical.

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

Start with the decision, result, and link to the task. A task record and a pinned
Git revision often suffice. Keep detailed logs, source snapshots, or per-case data
when a specific audit, calculation, or follow-up depends on them. A path listed
in a manifest records what was captured; it does not by itself justify keeping
every captured file in future bundles.

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

## Find the evidence

Start with the task record or one of the indexes below. Source paths in older
reports reflect the reviewed revision. The [maintained access-router test guide](../../packages/access-router/test/README.md)
describes the current test layout. Links inside captured source excerpts are
relative to their original checkout.

### Access Router and workspace CI

- [Access-router historical evidence](access-router/README.md): ownership design, migrations, and performance reports.
- [Test-contract separation acceptance](access-router/20261108-094712-test-contract-separation/ACCEPTANCE.md): final review and the ledgers used to check test preservation.
- [Dependency-gated CI](access-router/20261118-111723-dependency-gated-ci-tests/README.md): rollout blockers, local checks, and hosted failure evidence.
- [Performance cleanup outcome](access-router/20261105-084939-performance-cleanup/FINAL.md) and [write-input optimization review](access-router/20261112-084753-create-update-input-optimization/cwo-07/README.md): retained changes, withdrawn candidates, and measurement limits.

### Email Service

- [V1 contract](email-service/20261118-223259-email-service-package/v1-contract.md) and [package acceptance](email-service/20261118-223259-email-service-package/email-12-acceptance.md).
- [SMTP capacity](email-service/20261120-214514-email-service-smtp-capacity/README.md): approved contract, measurements, and acceptance.
- [Cross-project adoption re-review](email-service/20261121-email-adopt-10/re-review.md).
- [Managed attachments](email-service/20261121-email-managed-attachments/README.md): design decisions, independent re-review, and remaining production qualifications.
