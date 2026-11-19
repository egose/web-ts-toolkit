# CI-DAG-05: Validation gate still fails after pnpm update

Read-only evidence, 2026-11-19. [CI-DAG-05](../../../tasks/20261118-111723-dependency-gated-ci-tests.md)
remains **in progress, changes required / blocked**. This is separate from the
completed local coordinator reconciliation and is not rollout acceptance.

## Confirmed upstream failure

The second supplied log matches [push run #1829, `ci-validate` job `135866430929`](https://github.com/egose/web-ts-toolkit/actions/runs/44610765835/job/135866430929),
attempt 1. The job name, checkout/setup timestamps and checked-out SHA
`c842f74011e0f4b8582143eeda60ba2a796b5290` match the public metadata. It is not
the original `1977fe0` run's `ci-validate` log.

| Raw log lines | Observation |
| ------------- | ----------- |
| 151–223 | Short checkout, action resolution, Node `26.12.1`, the installer boundary check and the pnpm `11.24.0` self-install succeeded. |
| 224–239 | `pnpm install --frozen-lockfile --ignore-scripts` started with `PNPM_HOME` under the owned installer destination. pnpm reported an incompatible lockfile under `<selected-root>/node_modules/.pnpm`, then reported recreating `<selected-root>/node_modules`. It separately reported the checked-in lockfile up to date. |
| 240–267 | Tarball GETs reported `error (unknown)`; the lockfile passed supply-chain policies. The install exited 1 with `Worker pnpm#2 exited with code 1`. The parent stack frame was at `<selected-root>/node_modules/.pnpm/pnpm@11.24.0/node_modules/pnpm/dist/pnpm.mjs:1018:27`. |
| 268–311 | The tools step did not run. Public metadata shows both validators skipped and `ci-checkout` post succeeded. The log warns that actions targeting Node 20 were forced onto Node 24; it does not verify Node-20 execution or post-cleanup filesystem state. |

The previous [push `unit-test` log at `1977fe0`](https://github.com/egose/web-ts-toolkit/actions/runs/44599507795/job/135827132029)
showed the same command, recreation warning, and worker exit with pnpm **11.18.0**
(stack frame `pnpm.mjs:979:27`). The new log confirms that the same failure
signature persists with **11.24.0**, and that the frozen install is the upstream
gate failure in push #1829. The lockfile also changed between these revisions;
this is not a version-only comparison. The `ci-setup` and `ci-checkout` actions
and `test.yml` were unchanged between the two SHAs.

The leading hypothesis is that the frozen install replaces files pnpm or its
workers need in the workspace virtual store. It is supported by the location of
the parent stack frame and the recreation message in both logs; neither log
verifies actual file removal for the worker or captures the underlying worker
exception. The GET warnings are not proof of a registry outage, and the
workspace lockfile was not rejected. A focused investigation should first
trace the pnpm executable and virtual-store paths across self-install and
workspace install. Any new installer investigation, probe or correction needs
renewed authorization.

## What was skipped

Both attempt-1 runs for `c842f74` ([push #1829](https://github.com/egose/web-ts-toolkit/actions/runs/44610765835)
and [PR #317, run #1830](https://github.com/egose/web-ts-toolkit/actions/runs/44610776553))
reported four successful independent jobs, two failures, and 26 skips.
`ci-validate` failed during setup; `ci-prepare` and all 25 package jobs skipped.
The [push `unit-test`](https://github.com/egose/web-ts-toolkit/actions/runs/44610765835/job/135866791107),
[PR `ci-validate`](https://github.com/egose/web-ts-toolkit/actions/runs/44610776553/job/135866469766)
and [PR `unit-test`](https://github.com/egose/web-ts-toolkit/actions/runs/44610776553/job/135866745727)
metadata show setup failures, but do not identify their internal failing commands.
Neither `unit-test` job reached the evaluator. The PR run's head SHA is reported
by metadata; its checked-out event SHA was not verified from a raw log.

Q1 formatting, complete native short-root and Node-20 behavior, R2, and R3's
controlled rollout, artifact, scheduling/required-check and cost evidence remain
separate and unresolved. No installation, probe, validator, package test or
hosted job was run for this review.

## Provenance and historical version correction

The second signed response was 27,764 bytes. The table retains selected line
references, not the raw log, signed URL, or runner-local paths and identifiers.
The [earlier hosted summary](ci-dag-05-hosted-install-failure.md) at its initial
commit `376ceb1` correctly used `11.18.0` for `1977fe0`. The later reference
update in `c842f74` replaced that version in the summary and also touched
historical evidence, including the [sealed finishing report](ci-dag-05-finishing-review.md).
The resulting copies are not the sealed pre-bump bytes; the earlier reconciliation
does not certify them. This follow-up preserves the original observation without
rewriting those records or reissuing their seals.
