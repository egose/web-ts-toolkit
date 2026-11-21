# SMTP-CAP-02 — Verification handoff

Scope: the [approved binding and storage contract](implementation-contract.md), on the uncommitted
implementation over `bc086cc6`. The queue/state machine, DTO version and SMTP transport are unchanged;
the new limits are selected only by explicit trusted SMTP factory configuration.

## Observed

- [Memory lifecycle](../../../../packages/email-service/test/lifecycle/smtp-capacity.test.ts):
  50/51 V1 boundary, 51/52 at a lower opt-in cap, 1,000/1,001 at the maximum, two independent
  opt-in bindings and V1 in one process, staged scope/binding/hash checks, batch replay and item
  rejection, exact 2,097,152-byte canonical snapshot and rejection at 2,097,153 before insert or
  provider preflight. Direct SMTP `prepare` checked the accepted maximum without calling `submit`.
- [Shared ledger fixture](../../../../packages/email-service/test/conformance/smtp-capacity-fixture.ts):
  334 To, 333 Cc and 333 Bcc, 254-byte addresses, 128-byte display names, both body parts at
  their individual limits and five attachment references. Nine complete transient refusals,
  one ambiguous attempt and one explicit duplicate-risk redrive reach 11 commits with the
  original snapshot on every attempt. The last commit preserves all 1,000 mixed outcomes;
  an altered same-operation ACK and one unavailable proof led to the exact finish replay,
  not another provider invocation. A conflicting replay was rejected. Projection preceded pruning.
- [Mongo integration](../../../../packages/email-service/test/mongodb/smtp-capacity.test.ts):
  MongoDB 8.2.6 single-node WiredTiger replica set. Exact definition setup/resume and cap races,
  rejection with no driver calls for all 17 legacy/wrong-bound primitives, scoped reads, four
  in-flight primitives/four projected due IDs, job and activity BSON limits enforced by the server,
  and cursor-bound 8/16 redacted pages over 18 activities (17-row initial read, no `getMore`).
  Retained intent and snapshot digests detect corruption; history retains group/index/status,
  not addresses, payloads, attachment refs, or private digests.
- Real Mongo rollback fixture: an insert was committed but both its ACK and exact proof were
  unavailable. V1 continued separately without touching that V2 job or accepting V2 staged
  work. A new V2 handle replayed the original receipt, refused a conflicting intent, drained
  the queued and staged work, then pruned, retired and purged in the original lane.
  The fixture aged an already-pruned test row to reach the retention boundary; the actual
  maintenance predicates and writes still used real Mongo server time. V1 catalog/indexes
  were unchanged across these operations.

## Reproduce

Use an existing ignored checkout-local `_tmp*` directory and a prepared MongoDB 8.2.6 binary
(set `MONGOMS_SYSTEM_BINARY` if the fixture cannot discover it). Run from the repo root:

```sh
export TMPDIR='<repo-root>/_tmp-smtp-cap02'
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:lifecycle smtp-capacity.test.ts --reporter=dot
pnpm --filter @web-ts-toolkit/email-service test:mongodb smtp-capacity.test.ts --reporter=dot
```

Verification: package build and typecheck, package ESLint, Prettier on changed package files,
and `git diff --check`. Initial V1 Mongo regression: 95 passed; the final store/readiness
subset passed all 32 V1 tests. Unit 228, lifecycle 32 (including 5 capacity tests), SMTP 51
and SendGrid 91 passed. Two early Mongo reruns with the test helper's 500 ms failover
heartbeat observed `store_unavailable` on a second-page read. Other runs passed. The
healthy capacity fixture now uses the normal 10 s heartbeat because Mongoose treats two
missed intervals as disconnected, including during synchronous work. All four focused
Mongo tests passed on that final fixture. No production heartbeat or store deadline changed.

The full Mongo ledger test uses the existing longer admin reconciliation budget; the
default elapsed budget did not finish all 11 projections in a single invocation on this
fixture. This was not a throughput test.

## Independent old/current runtime audit

The coordinator built the four runtime entrypoints from an archived `bc086cc6` source tree and
ran its ESM core and Mongoose adapter beside the current ESM core and CommonJS Mongoose adapter,
on a disposable MongoDB 8.2.6 replica set. The check passed on Node 26.12.1 and on a separate
Node 24.0.0 rerun:

- Both runtimes rejected 51 in V1, produced identical 50-recipient staged values, fingerprint
  and snapshot hash, and read the same collections/indexes and history. The new worker processed
  an old staged job; the old worker processed a new V1 job and reconciled it after rollback.
- The old Mongoose factory rejected the opt-in namespace as a V1 collection alias. An actual old
  core worker passed the opt-in store returned `store_error`, with zero claims, zero provider
  calls and identical raw queued BSON before and after. V1 could not see or claim the opt-in job.
- A new handle using a conflicting cap could not become ready. A matching restarted handle
  replayed the original staged receipt and processed the parked 1,000-recipient job. The
  redacted history retained index 999; the original V1 catalog and indexes remained identical.

This audit used synthetic results, not SMTP on the wire. It was a local source-baseline comparison,
not a separately installed 0.72.0 tarball. The scratch audit driver, generated builds,
logs, dependency trees and disposable database files were not archived. The maintained
capacity tests above cover the corresponding queue, fence, and rollback invariants. No external
sends, publication, or wire/packing qualification was performed in this step.
