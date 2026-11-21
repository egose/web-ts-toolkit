# SMTP-CAP-03 — 1,000 recipients on verified TLS

Public, opted-in SMTP provider and worker tested at the 1,000-recipient ceiling using only a synthetic
loopback relay. The tests do not modify the SMTP protocol, deadline ranges, size limits or worker
state machine. This is evidence for the conditional target in the [implementation contract](implementation-contract.md),
not a relay guarantee or release authorization. See the [timing method and samples](cap-03-timing.md).

## What the tests check

The [SMTP capacity suite](../../../../packages/email-service/test/smtp/smtp-capacity.test.ts) and
[fixtures](../../../../packages/email-service/test/smtp/capacity-fixture.ts) exercise the bound registry, service,
store, provider, worker and admin APIs. Wire tests use the real memory adapter, which is not durable across process
exit. The submit observer forwards the exact call to the real one-shot prepared provider. For deterministic retry
and recovery only the memory store's wall clock is controlled; worker and provider monotonic clocks, timers, TLS,
sockets and MIME data are real.

<!-- prettier-ignore -->
| Case | Checks at the full target |
| --- | --- |
| Wide mix, delayed replies | 334 To, 333 Cc and 333 Bcc in exactly that serial RCPT order, despite advertised PIPELINING. One connection, one MAIL, one DATA and one terminator; nothing reaches the peer before the real handoff ACK. Every visible address/name is retained in its correct header (even if RCPT was refused); no Bcc header, name or address in DATA. Fixture addresses are 254 bytes and display names 128 bytes. |
| Payload and partial outcome | Exact 2,097,152-byte snapshot; 512 KiB HTML, 256 KiB text and five attachments totaling 5 MiB (two at the 2 MiB individual cap). Exact decoded text/HTML, attachment lengths and SHA-256, and all DATA lines within 998 bytes before framing. Only the complete delayed final `250` confirms acceptance. All 1,000 group/index statuses (500 accepted, 500 rejected) match the provider result, authoritative attempt and projected admin history. No raw SMTP reply, names, addresses, payloads or refs in that evidence. A fresh worker sends nothing more. |
| Verified TLS | Authenticated STARTTLS (only EHLO/STARTTLS cleartext) and implicit TLS (no cleartext); verified DNS identity, fixture trust root and exact AUTH PLAIN on the secure connection. Untrusted CA and wrong DNS name controls stop before secure commands, credentials or MAIL and cannot retry. |
| RCPT deadline / missing or late final reply | Clipped RCPT run closes the socket with a prefix of the full envelope, no DATA and no retry. With all 1,000 RCPTs and DATA complete, no final reply, an incomplete progressing `250` until the deadline, or a truncated `451` followed by EOF all result in `unknown / never`. A completion attempted after peer close cannot undo that state. No extra peer or submit. |
| Actual cancellation | Worker abort triggered by the first body line of large DATA; provider tears down real I/O, peer never receives the terminator, attempt is `unknown / never`, and a fresh worker does not send. |
| Definitive retry | Complete transient `451` for every RCPT (no DATA), then all accepted RCPTs but a complete final `451` after DATA. Each refusal schedules one retry and nothing is sent before its stored retry timestamp. Same ordered envelope and frozen content across attempts; third attempt has all 1,000 accepted. Exactly three connections/MAIL transactions, two DATA messages received, one affirmative acceptance. |
| Handoff recovery and expiry | Handoff ACK loss before and after committing the marker: no initial SMTP connection in either case. At lease expiry the pre-handoff attempt schedules a fresh attempt that submits once when due, while the post-handoff attempt becomes `unknown / never` with no submit. Stale owners cannot mark or renew. A real, acknowledged handoff inside the launch-expiry margin also cannot start a submission. |
| Unconfirmed finalization | Full real wire acceptance followed by missing finish ACKs and unavailable point reads: two exact finish writes (same object/fence/ID/evidence) and two exact proof lookups, never a second SMTP submission. If the write committed, authoritative acceptance survives; if neither write committed, lease recovery yields sticky `unknown / never` and refuses a stale finish. One connection and one accepted DATA on each branch. |

## Verification and scope

Typecheck, ESLint and Prettier on the changed test files passed. The regular SMTP suite passed **65** tests
with **2** extended cases skipped (18.56 s wall); the recorded extended run passed all **67** (96.77 s).
Lifecycle passed **32** (38.09 s), including the shared capacity fixture regressions.
All **4** focused MongoDB 8.2.6 capacity regressions passed (64.69 s wall) in a separate serial run with
a fresh ignored `TMPDIR`; an earlier combined invocation hit its outer 120 s shell limit during MongoDB.

Use the [timing reproduction](cap-03-timing.md#reproduce) for the long cases. For the regular suite and surrounding
regressions, use the same checkout-local scratch setup, leave `SMTP_CAPACITY_TIMING` unset, and run serially:

```sh
pnpm --filter @web-ts-toolkit/email-service typecheck
env -u NODE_TLS_REJECT_UNAUTHORIZED pnpm --filter @web-ts-toolkit/email-service test:smtp
env -u NODE_TLS_REJECT_UNAUTHORIZED pnpm --filter @web-ts-toolkit/email-service test:lifecycle
# If needed, point MONGOMS_SYSTEM_BINARY at a prepared 8.2.6 binary.
pnpm --filter @web-ts-toolkit/email-service test:mongodb smtp-capacity.test.ts
git diff --check
```

CAP-02 established separate store compatibility, rollback and old-runtime fencing
([handoff](cap-02-verification.md)). CAP-03 does not rerun the historical old-runtime probe or qualify packed
consumers and Node floor behavior. No external SMTP, relay delivery, publication, or production-data access.
Certificates, command/MIME captures, scratch files, raw logs and database data are not archived.
