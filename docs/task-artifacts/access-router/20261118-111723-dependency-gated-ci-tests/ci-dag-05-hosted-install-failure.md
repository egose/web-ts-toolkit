# CI-DAG-05: Hosted workspace install failure

Observed on 2026-11-19. This is a read-only review of existing runs, separate from
the [local corrective review](ci-dag-05-corrective-review.md) and its
[coordinator reconciliation](ci-dag-05-corrective-review-coordinator-support/README.md).
The [authoritative task](../../../tasks/20261118-111723-dependency-gated-ci-tests.md)
remains **in progress, changes required / blocked**.

## What failed

The supplied raw log is from [`unit-test`, job `135827132029`](https://github.com/egose/web-ts-toolkit/actions/runs/44599507795/job/135827132029)
in push run `44599507795`, attempt 1. The job name, checked-out SHA
`1977fe018e354b6c7f0e497cd31cfc57c76c78ac`, and checkout/setup timestamps match
the public job metadata. This is **not** the `ci-validate` log.

The first failing command was `pnpm install --frozen-lockfile --ignore-scripts`
in the `install` step of [`.github/actions/ci-setup/action.yml`](../../../../.github/actions/ci-setup/action.yml).
The checkout action, Node setup, `--check-install` and the pinned pnpm action's
self-install all succeeded before it. The install used pnpm `11.18.0` with
Node `26.12.1` and failed with `Worker pnpm#2 exited with code 1`.

| Raw log lines | Observation |
| ------------- | ----------- |
| 151–188       | Selected checkout and pinned action resolution reached setup. The emitted sibling root and `TMPDIR` were 34 and 45 UTF-8 bytes, respectively. `../c/.tool-versions` resolved to Node `26.12.1`. |
| 189–223       | The installer boundary check passed. `pnpm/action-setup` received `../c/package.json` and `<selected-root>/_tmp-pnpm-XXXXXX` as inputs and reported a successful self-install. |
| 224–239       | The workspace install started. pnpm said the existing `<selected-root>/node_modules/.pnpm/lock.yaml` was incompatible, then reported recreating `<selected-root>/node_modules`. The checked-in lockfile was reported up to date. |
| 240–274       | Tarball GETs reported `error (unknown)`. The lockfile passed supply-chain policies. The worker exited with code 1; its parent stack frame was in `<selected-root>/node_modules/.pnpm/pnpm@11.18.0/node_modules/pnpm/dist/pnpm.mjs:979:27`, inside the tree pnpm reported recreating. |
| 275–318       | The tools step was skipped. Public metadata reports `ci-checkout` post success, not an independent filesystem cleanup check. The runner warned that the actions targeting Node 20 were forced to run on Node 24; the workspace command used the separately installed Node 26. |

The shared `node_modules` path is a concrete lead: the install may have replaced
files needed by the running pnpm or its workers. The log does not establish what
created the existing virtual-store lockfile, whether worker files disappeared,
or why the worker exited. The unknown GET warnings also do not establish a
registry outage. No package test, artifact restore, or Unix socket workload in
the gated path was reached by this job.

## What the two runs establish

Both attempt-1 runs report the same head SHA. Only the push `unit-test` checkout
SHA is confirmed from a raw log; the PR run's selected event SHA was not verified
from its checkout log.

| Run | `ci-validate` | `unit-test` |
| --- | ------------- | ----------- |
| [Push #1826](https://github.com/egose/web-ts-toolkit/actions/runs/44599507795) | [Job `135826745504`](https://github.com/egose/web-ts-toolkit/actions/runs/44599507795/job/135826745504): setup failed before validators; internal command unverified. | [Job `135827132029`](https://github.com/egose/web-ts-toolkit/actions/runs/44599507795/job/135827132029): frozen install failed; evaluator skipped. |
| [PR #317, run #1827](https://github.com/egose/web-ts-toolkit/actions/runs/44599521509) | [Job `135826791276`](https://github.com/egose/web-ts-toolkit/actions/runs/44599521509/job/135826791276): setup failed before validators; internal command unverified. | [Job `135827066330`](https://github.com/egose/web-ts-toolkit/actions/runs/44599521509/job/135827066330): setup failed; internal command unverified and evaluator skipped. |

Each run reported **4 successful independent jobs, 2 failed jobs, and 26 skipped
jobs**. The primary gate was `ci-validate`: its setup failure prevented both
validators from running, and `ci-prepare` and all 25 package jobs skipped.
`unit-test` did start as configured, but failed in its own setup before evaluating
the 27 `needs` results. This shows validation-gate skipping and independent job
continuation, not package-to-package failure propagation or a hosted invocation
of the fail-closed evaluator. The matching setup step failures in the other jobs
do not establish that they share the exact pnpm error.

## Limits and next evidence

- **Q1:** The local workflow formatting failure remains separate and undisposed.
- **Runtime:** This log shows actual short-root action resolution and main/post
  outcomes for one failed job, not successful workspace installation, a complete
  native short-root workload, actual Node-20 action execution, or independently
  checked post-cleanup effects.
- **R2:** This job did not exercise the attestation failure, abort behavior,
  timing neutrality or packed-consumer completion.
- **R3:** Neither run satisfies controlled V6 evidence. Healthy coverage,
  package-level dependency skipping, artifact transfer, evaluator outcomes,
  required-check configuration, comparable timing/quota/billing and maintainer
  decisions remain outstanding.

The highest-value additional evidence is the existing push `ci-validate` log,
particularly the first failure inside `ci-setup`. An attachment or pasted
excerpt is sufficient; a rerun or credentials are not needed. A focused installer
investigation or any correction/execution requires renewed authorization.

Provenance: the supplied signed response was 28,878 bytes. The table is a curated
summary with line references, not an exact copy. Raw job output, signed URLs,
runner-local paths and generated IDs are omitted; public stable run/job links are
retained. No workflow, source, tests, settings or historical evidence were changed,
and no CI job or workspace command was rerun for this review.
