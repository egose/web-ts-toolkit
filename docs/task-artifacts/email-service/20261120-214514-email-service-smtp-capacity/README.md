# SMTP capacity task evidence

For [Bounded large SMTP envelopes](../../../tasks/20261120-214514-email-service-smtp-capacity.md).
The approved contract is the implementation baseline. Nothing in this bundle authorizes a release.

<!-- prettier-ignore -->
| Artifact | Purpose |
| --- | --- |
| [Approved implementation contract](implementation-contract.md) | Opt-in integration, pre-mutation store fence, storage mapping, and acceptance gates. |
| [Capacity proposal](capacity-contract.md) | Design-review baseline, resource analysis and rollout/rollback rationale; the approved contract supersedes its alternative API and Mongo manifest. |
| [V1 timing and provenance](v1-timing.md) | Verified-TLS baseline, conditions for a serial 1,000-recipient target, and measurement method. |
| [V1 timing observations](v1-samples.csv) | Raw numeric observations for recalculation, including warmups and negative controls. |
| [CAP-02 verification handoff](cap-02-verification.md) | Lifecycle and real MongoDB capacity results, including the old/current runtime audit. |
| [CAP-03 verification](cap-03-verification.md) | Verified-TLS capacity, complete mixed evidence, retries, and handoff/finish recovery on loopback. |
| [CAP-03 serial timing](cap-03-timing.md) and [samples](cap-03-samples.csv) | Real 1,000-RCPT worker/provider measurements, effective deadlines and a clipped control. |
| [CAP-04 acceptance](cap-04-acceptance.md) | Installed documentation, full package tests and both packed portability matrices (Node 26.12.1 and 24.0.0). |

**V1 timing baseline:** `bc086cc640eeba668fd3bceef2f9498605ffd509`; no package
source or lockfile changes at measurement. Published comparison baseline: `0.72.0`; the probe ran checkout
source, not the published tarball. No live relay, V2 implementation, V2 MongoDB compatibility test, or
1,000-recipient submission was exercised. Certificates, credentials, command/message captures, scratch runner
files, and dependency trees are not included. See the timing report for hashes and reproduction limits.
