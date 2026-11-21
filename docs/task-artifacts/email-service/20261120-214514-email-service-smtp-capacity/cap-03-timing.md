# SMTP-CAP-03 — Serial 1,000-recipient SMTP timing

**Measured at 1,000:** Three single transactions completed on verified TLS with an 8.18 MiB synthetic MIME payload.
At 5 ms added per RCPT, the default 15 s provider limit left 9.15 s of observed submission headroom. At 25 and
50 ms, the extended 60 s limit left 33.99 and 9.02 s, respectively. Each run persisted all 1,000 outcomes.
The result supports the [conditional 1,000-recipient target](implementation-contract.md) without changing the
serial transport or deadlines. It does not establish capacity of an external relay.

## Recorded samples

One sample per row, serial executions; [machine-readable observations](cap-03-samples.csv) retain millisecond
measurements to three decimal places.

<!-- prettier-ignore -->
| RCPT timer setting and TLS mode | Worker run / lease / provider limits | Effective provider call | RCPT commands / peer replies | Submit / worker run elapsed | Observed result |
| --- | --- | ---: | ---: | ---: | --- |
| 5 ms · STARTTLS | 30 s / 60 s / 15 s (defaults) | 14,999 ms | 1,000 / 1,000 | 5.851 s / 6.150 s | 1 DATA, 500 accepted + 500 rejected |
| 25 ms · implicit TLS | 75 s / 90 s / 60 s | 59,999 ms | 1,000 / 1,000 | 26.004 s / 26.250 s | 1 DATA, 500 accepted + 500 rejected |
| 50 ms · implicit TLS | 75 s / 90 s / 60 s | 59,999 ms | 1,000 / 1,000 | 50.980 s / 51.246 s | 1 DATA, 500 accepted + 500 rejected |
| 60 ms · implicit TLS (clipped control) | 2 s / 60 s / 15 s | 1,956 ms | 33 / 32 | 1.958 s / 2.006 s | Socket closed waiting for RCPT, no DATA, `unknown / never`, `provider_timeout` |

The 60 ms control admitted 1,000 but deliberately used a **2,000 ms** worker run, not a failed 60-second
full-budget experiment. The elapsed observation includes timer dispatch and settlement, so a few milliseconds
past an integer timeout are possible. It proves that a clipped deadline cancels real I/O rather than continuing
the envelope, acknowledging it or retrying it. At 60 ms for every reply, 1,000 serialized waits would spend 60 s
before connection or DATA even without timer overhead; qualification at the 60 s maximum would require faster
replies and reserve for other work.

## Method

- [Maintained capacity tests](../../../../packages/email-service/test/smtp/smtp-capacity.test.ts) forward the exact
  submit call from the actual bound worker to the actual bound provider, observing its timeout, elapsed time and
  normalized result. Each run uses a fresh opted-in memory store and a new, unpooled connection to `127.0.0.1`
  (no DNS lookup). The synthetic fixture CA is the explicit trust root, SNI/verification name
  `smtp.loopback.invalid`, with AUTH PLAIN over TLS. All four measured connections negotiated TLS 1.3.
- Successful cases use the same 2,097,152-byte snapshot shape, 334 To / 333 Cc / 333 Bcc, with 254-byte addresses,
  128-byte display names, 512 KiB HTML, 256 KiB text and 5 MiB total in five attachments. The loopback peer counted
  **8,582,415** MIME bytes, including encoded headers and CRLF framing, excluding the SMTP dot terminator and
  command/TLS overhead. It advertises PIPELINING on secure EHLO but verifies that no RCPT overlapped a pending
  reply and DATA did not begin until all replies were issued. Each reply cycles through `250`, `450`, `251`,
  `550` in envelope order; the final complete acceptance is withheld and then written on a real 30 ms timer.
- `submit_ms` uses `performance.now()` immediately around the actual prepared provider's await. It covers
  TCP/TLS, greeting/EHLO, AUTH, envelope, streaming MIME DATA, the final reply, normalizing the result and
  initiating teardown. The independent peer-close check is after this interval. `run_ms` adds worker claim,
  attachment resolution, preflight, acknowledgement of the handoff, result validation and attempt finalization.
  Before returning the real handoff ACK and before beginning the final-reply timer, the test observes the
  handed-off job; these checks are included in the relevant intervals. TLS fixture startup, registry staging,
  store readiness/admission, admin projection and subsequent idle runs are outside `run_ms`.
- Real `setTimeout(d)` models **additional wait on each RCPT**, from command arrival to issuing the reply.
  `rcpt_wait_ms` is the sum of arrival-to-callback elapsed time for issued replies, including timer overshoot.
  At the three success settings that averaged 5.151, 25.202 and 50.153 ms. The remaining measured provider
  time (`submit_ms` minus `rcpt_wait_ms`) was 0.700–0.827 s, including local per-command and socket overhead,
  MIME, other exchanges and the delayed final ACK. This is not a production reserve.
- The worker passes the integer remaining budget, clipped by the remaining run and conservative lease
  window after finalize grace (default 10 s) and clock margin (1 s). The 90 s lease and 75 s run keep the
  unmodified 60 s provider cap binding in the extended cases; a 60 s provider setting alone would not do so.
  The 60 ms negative control intentionally binds on the run, with the default provider and lease limits.
  The normal CI fault cases use bounded waits: 2 s configured at the provider for missing/late finals, with
  no long timeout tests required. No fake timers for active I/O.

The positive measurements are consistent with the direction of the [V1 extrapolation](v1-timing.md#budget-for-1000-not-a-v2-measurement),
now with actual large SMTP envelopes and MIME. These are single samples, not percentiles. Same-host delay
injection omits relay throttling/`SIZE` constraints, DNS jitter, other network/relay latency, congestion, and
production payload throughput. No MongoDB round-trip times, concurrent jobs, or load isolation were measured.
Keep measured reserve for TLS, DATA, final acknowledgement, scheduler jitter and worker/store operations; use
a lower recipient limit if the effective provider budget or the relay's constraints require it.

## Reproduce

Workspace source over `bc086cc640eeba668fd3bceef2f9498605ffd509`, including the CAP-02 opt-in and these tests.
Observed 2026-11-21 starting 02:18:16 UTC, Linux x86-64, Node `v26.12.1` (OpenSSL `3.5.9`), fixture CLI
OpenSSL `3.0.13`, pnpm `11.24.0`, Vitest `4.1.12`, Nodemailer `10.6.0`. The runner transforms workspace
source, not a tarball. The maintained opt-in measurement runs in the normal SMTP suite with `fileParallelism:
false` and uses only loopback and the existing fixture. Do not run other suites concurrently when measuring.

From the repo root, use installed dependencies, working loopback sockets and OpenSSL CLI. Create a
fresh `_tmp*` directory first, confirm it is ignored with `git check-ignore`, and replace the placeholder:

```sh
export TMPDIR='<repo-root>/_tmp-smtp-cap03-<run-id>'
env -u NODE_TLS_REJECT_UNAUTHORIZED SMTP_CAPACITY_TIMING=1 \
  pnpm --filter @web-ts-toolkit/email-service test:smtp --reporter=verbose
```

`SMTP_CAPACITY_TIMING=1` is test-only. It enables the two lengthy 25/50 ms cases (85 s harness cap each)
and emits scalar `SMTP_CAPACITY_SAMPLE` lines for the three successful transactions and the clipped control.
The CSV is a curated transcription of those four observations, not a copied runner log. No SMTP commands,
MIME capture, credentials, certificates or keys, raw logs, dependencies or generated builds are archived.
The [verification report](cap-03-verification.md) records the state and recovery coverage separately.
