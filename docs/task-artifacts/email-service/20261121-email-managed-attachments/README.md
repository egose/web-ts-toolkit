# Managed email attachments: design and verification

This bundle records the completed optional managed attachment work (ATT-01 through ATT-07)
for `packages/email-service` over baseline `13ca5acf`. The seven tasks were executed
sequentially by separate subagents, with an independent final review and re-review.

- [ATT-01 decision record and known limits](contract.md)
- [ATT-02 common implementation](att-02-handoff.md)
- [ATT-03 MongoDB adapter and replica-set evidence](att-03-handoff.md)
- [ATT-04 target update: SeaweedFS qualification and retention proof](seaweedfs.md)
- [ATT-04 S3 adapter and pinned SeaweedFS/AWS SDK evidence](att-04-handoff.md)
- [ATT-05 Azure adapter, client setup and pinned Azurite evidence](att-05-handoff.md)
- [ATT-06 mixed delivery, replay, and cleanup evidence](att-06-handoff.md)
- [ATT-07 installed boundaries, operations, and initial integration verification](att-07-handoff.md)
- [Independent review: two S3 transport findings](independent-review.md)
- [ATT-04 transport remediation and re-review handoff](att-04-remediation.md)
- [Independent re-review: both findings closed](re-review.md)

## Final acceptance

On Linux x64 with Node 26.12.1, pnpm 11.24.0, the digest-checked MongoDB 8.2.6 executable,
`umask 022` and an ignored checkout-local `TMPDIR`, the coordinator ran
`pnpm --filter @web-ts-toolkit/email-service test` with the final loopback guard.
It exited 0 in **893.98 seconds**, including build, typecheck, **807 Vitest cases passed**,
and **16 installed-package checks passed**. The two default-skipped SMTP timing cases passed
in the opt-in rerun. The [remediation run](att-04-remediation.md#verification) also passed
16/16 installed checks on exact Node 24.0.0 with both tarball shapes and six peer profiles,
and passed lint, local CI validation (615 checks) and test-group validation (18 checks).

The [independent verdict](re-review.md) closed both S3 blockers. The package is verified
locally, not committed or published. No live AWS/Azure, production SeaweedFS topology,
cloud lifecycle purge, or GitHub rollout was qualified; see the
[remaining production qualifications](re-review.md#remaining-qualification).

## Baseline checks

Before changing package source:

| Check (repo root)                     | Result                                                        |
| ------------------------------------- | ------------------------------------------------------------- |
| `pnpm lint`                           | Passed                                                        |
| `pnpm test:groups:check`              | 18 runner checks passed; 12 groups covering 26 workspaces     |
| `pnpm test:ci:check` with `umask 022` | 615 checks passed; 26 workspace jobs agreed with the workflow |

The initial CI-helper check inherited a group-writable umask and failed the artifact
fixture mode checks (`Unsafe artifact mode: directory 775`). The rerun used `umask 022`
without weakening the fixture or production validators. Neither check runs the package suite
or proves cloud compatibility.

Machine: Linux x64; workspace Node 26.12.1, pnpm 11.24.0. Reproducible commands and summaries
are kept here; scratch toolchains, installed dependencies, generated builds, service databases,
and raw logs are not archived. No live cloud or mail endpoints were used for baseline checks.
