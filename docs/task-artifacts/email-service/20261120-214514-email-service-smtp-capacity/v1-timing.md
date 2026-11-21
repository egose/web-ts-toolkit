# V1 SMTP timing: verified TLS, serial RCPT

**Measured:** all 155 timed V1 submissions accepted one synthetic message, with up to 50 recipients and
delays up to 60 ms per RCPT reply. V1 did not pipeline, even when the test peer advertised PIPELINING.
51 recipients were rejected before connecting. The maintained V1 SMTP suite also passed 51/51.

**Extrapolated, not measured at 1,000:** current serial SMTP is a plausible opt-in only on a qualified
relay. A 15 ms reply delay already exhausts the 15 s default at 1,000 before connection or transfer;
a 60 ms delay exhausts the 60 s maximum. A 10 ms or 50 ms delay respectively fits the small-message
loopback model, but neither guarantees the required non-RCPT/headroom budget in practice. Keep existing
deadline ranges and protocol, and verify the conditional target in SMTP-CAP-03.

## Method

- Used the maintained [`openLoopbackSmtp`](../../../../packages/email-service/test/smtp/loopback.ts) and
  [`createSmtpTlsFixture`](../../../../packages/email-service/test/smtp/tls-fixture.ts) unchanged. The peer
  listened on `127.0.0.1` on an ephemeral port and did not relay or deliver to any mailbox. The TCP target
  was the IP, so no DNS time. The public [`createSmtpProvider`](../../../../packages/email-service/src/smtp.ts)
  ran with SNI and hostname verification `smtp.loopback.invalid`, the fixture CA as sole explicit trust root
  and short synthetic AUTH PLAIN credentials. No verification override. Successful sessions negotiated
  TLS 1.3; this exercise did not add TLS 1.2 evidence beyond the maintained suite.
- Started a fresh, non-pooled connection for each sample; one transaction at a time, peer/socket closed
  before the next. Both modes had one warmup (1 recipient, no injected delay); excluded from timings below.
  Fixture CA/key generation and peer startup are outside the timing interval. Public `prepare` and `submit`
  measured separately by `performance.now()`. `submit` spans provider startup, TCP/TLS, SMTP greeting,
  EHLO/STARTTLS as appropriate, AUTH, MAIL, all RCPT exchanges, MIME DATA and final acknowledgement,
  normalized result and local synchronous teardown initiation; awaiting the remote peer's close is after
  the monotonic measurement. No registry, queue, DB, worker lease, or finish operation is timed.
- Sent an ordinary `version: 1` snapshot with no names/attachments, short ASCII text, and `1, 10, 25, 50`
  unique synthetic recipients `r0@example.invalid` onward, distributed round-robin across To/Cc/Bcc
  (index modulo 3). From was `sender@example.invalid`, provider key `loopback`, template `probe` revision
  `v1`, `preparedAt: 1000`, `expiresAt: 10000`, priority `0`, correlation `{}`, and job/attempt IDs fresh
  UUIDv4s. Subject was `Synthetic V1 timing probe`; text `Synthetic V1 SMTP timing sample.\n` (LF), no
  HTML. At 50 the MIME DATA body including headers was 1,072 bytes; it is not a maximum-payload workload.
- On **secure** EHLO advertise PIPELINING and AUTH PLAIN. For delay zero, answer each RCPT immediately.
  For each nonzero delay `d`, suppress the fixture's immediate reply and schedule one real `setTimeout(d)`
  from arrival of the command to writing a complete synthetic `250` reply. All other replies are immediate.
  Delays model additional per-recipient wait, not network RTT, jitter, TLS latency, relay load or bandwidth.
  `rcpt_wait_ms` is cumulative elapsed arrival-to-timer-callback time *before* writing the replies, including
  timer overshoot. It is zero for synchronous replies. Serial assertion: a delayed RCPT cannot arrive
  while the previous reply is withheld, and DATA cannot start until all RCPT replies have been issued.
- In each of five serial replicates, run authenticated STARTTLS for delay `0, 5, 10, 15, 25, 50, 60` ms at
  each count, then implicit TLS at 50 recipients for `0, 15, 60` ms. Provider timeout 15,000 ms throughout.
  Assert exact To/Cc/Bcc wire order, complete normalized accepted group/index evidence, exactly one
  MAIL and DATA and one message, and no Bcc header/address in DATA. In STARTTLS only EHLO and STARTTLS
  appear in cleartext; implicit TLS has no cleartext SMTP commands. In all cases assert actual peer close.

## Observations

Median `submit` times in ms; each cell has five independent connections. Parentheses give min–max at 50.
Numbers are derived from [the raw CSV](v1-samples.csv).

| RCPT reply delay | STARTTLS · 1 | STARTTLS · 10 | STARTTLS · 25 | STARTTLS · 50 | Implicit TLS · 50 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 ms | 11.8 | 13.5 | 16.2 | 13.0 (12.0–16.7) | 22.7 (22.1–24.2) |
| 5 ms | 11.5 | 62.4 | 150.9 | 290.0 (288.9–300.0) | — |
| 10 ms | 22.4 | 118.0 | 279.7 | 544.8 (535.5–548.8) | — |
| 15 ms | 26.9 | 170.0 | 402.6 | 793.5 (791.3–796.2) | 797.4 (791.8–804.3) |
| 25 ms | 35.4 | 267.2 | 653.7 | 1,294.8 (1,290.5–1,298.6) | — |
| 50 ms | 62.5 | 517.8 | 1,277.9 | 2,543.6 (2,541.9–2,544.8) | — |
| 60 ms | 70.7 | 618.7 | 1,528.3 | 3,045.2 (3,041.6–3,050.8) | 3,050.7 (3,048.5–3,054.1) |

At 50 via STARTTLS, median timer wait per recipient for the nonzero settings was 5.156, 10.139, 15.142,
25.150, 50.152 and 60.183 ms. Median local `prepare` at 50 across STARTTLS cells was 1.160–2.560 ms,
excluding TLS fixture and provider-factory setup.

| Negative control | Evidence |
| --- | --- |
| STARTTLS, 50 recipients, 25 ms reply delay, **400 ms** deadline | Submit settled at 401.737 ms; peer closed after 16 RCPT commands, 15 replies, no DATA and no message. `unknown / never`, `envelope`, `provider_timeout`. |
| STARTTLS, fixture CA not configured | `provider_configuration` / `never` at TLS, zero secure SMTP commands and messages. No unverified fallback. |
| Implicit TLS provider, 51-recipient V1 snapshot | `prepare` raised `invalid_snapshot`, zero peers; no network call. |

## Budget for 1,000 (not a V2 measurement)

The [serial loop](../../../../packages/email-service/src/providers/smtp/submit.ts#L99-L111) awaits each
`connection.command(RCPT)` before issuing the next. Model `T = A + N × L`, where `L` is the effective
per-recipient wait (round trip, relay policy/processing and local work) and `A` covers the other work,
including opening and verifying the connection, non-RCPT exchanges, and transmitting DATA. Fit ordinary
least squares independently for each delay to the four STARTTLS cell medians, i.e.
`L = sum((N - mean(N)) × (T - mean(T))) / sum((N - mean(N))²)` and `A = mean(T) - L × mean(N)`.
Multiply the fitted slope by 1,000 and add the intercept; there are no observations past 50.

| Injected delay | Fit slope, ms / recipient | Fitted 1,000, s | Versus 15 s | Versus 60 s |
| ---: | ---: | ---: | --- | --- |
| 0 ms | 0.023 | 0.04 | under (no-delay loopback only) | under (no-delay loopback only) |
| 5 ms | 5.693 | 5.70 | under | under |
| 10 ms | 10.668 | 10.68 | under | under |
| 15 ms | 15.626 | 15.64 | over | under |
| 25 ms | 25.702 | 25.71 | over | under |
| 50 ms | 50.639 | 50.65 | over | under, limited headroom |
| 60 ms | 60.692 | 60.70 | over | over |

The zero-delay fit is noisy (only a few ms of difference, nonmonotone medians) and not a usable latency
estimate. The timers and same-machine network at nonzero delay also do not model relay throttles, load,
deadline tails, or how an entire 1,000-reply transaction behaves. Do not use the fitted intercept as a
production reserve. If a host reserves a measured **5 s** for all non-RCPT work and jitter, 1,000 needs
effective waits **strictly below 10 ms** at 15 s, **below 55 ms** at 60 s; use a larger measured reserve
if required for MIME size, connection or payload throughput. Even the 10 ms synthetic setting consumed
~10.68 s in the fit; it is not evidence for meeting 15 s **with** a separate 5 s reserve. Set a lower cap
when those inequalities or a relay's recipient/`SIZE` constraints do not hold.

The worker's actual provider window may be shorter than either setting: it is clipped by remaining run
time and by the conservative remaining lease minus finalize grace; expiry and the acknowledged handoff
also gate launch. SMTP-CAP-03 must verify actual 1,000-recipient measured timings, including representative
delays with headroom, both TLS modes, nontrivial MIME, mixed results and timeout/recovery cases. If actual
budget evidence does not support the intended cap/relay, get a capacity, deadline or separately reviewed
protocol decision before changing them. No new relay claims are made here.

## Provenance and reproducibility

- Checked-out source: `bc086cc640eeba668fd3bceef2f9498605ffd509` (`packages/email-service` and
  `pnpm-lock.yaml` clean). The tracked suite used the same code; published baseline `0.72.0` was not installed
  as the measurement target. Linux x64; Node `v26.12.1` (OpenSSL `3.5.9`); fixture CLI OpenSSL `3.0.13`;
  pnpm `11.24.0`; Vitest `4.1.12`; resolved Nodemailer `10.6.0`. No system resource isolation or load
  measurement, and no results on the Node 24 floor, external relay, V2 code or MongoDB.
- Probe executed on 2026-11-20 23:59:22 UTC through 2026-11-21 00:00:58 UTC; Vitest passed 1/1 with
  94.85 s in the test. The source imports in the scratch probe were the public provider and the two
  maintained fixtures linked above. It used Vitest's Node transform against workspace source (not an
  independently built or mocked provider).
- The byte-for-byte archived CSV has 160 observations (2 excluded warmups, 155 timed, 3 negative controls)
  plus the header; SHA-256 at original and archived paths:
  `64a65c505ef301d4a772a5ca8043ed865b01d4b6cc7d72feb3c5323947cda37d`.
  A blank numeric field in the over-cap row is an unstarted operation, not a measured zero.
- Historical probe command below used the gitignored scratch path whose timing test SHA-256 was
  `0bf97d35cbef53fd4fd3040ce38357cab9389bcb6c42615c7b09f774686077e0` and Vitest config SHA-256 was
  `5e708ea2897d9cb0a3e7782995ff5d2f87f50b67fc4a904ea3ef3447547fdc9f`.
  **Not runnable from the archive**: the disposable harness and logs are not archived. The method above
  specifies the protocol for reconstructing it with the maintained fixtures; the CSV supports
  recalculation without the harness. No SMTP commands, message captures, raw fixture certificates or
  keys, dependency/build outputs, host credentials or local paths are preserved.

```sh
# Historical probe only. Do not expect the ignored config to be present in another checkout.
env -u NODE_TLS_REJECT_UNAUTHORIZED TMPDIR='<repo-root>/_tmp-smtp-cap-01-v1-20261120' \
  pnpm exec vitest run --config _tmp-smtp-cap-01-v1-20261120/vitest.config.mts
```

The **maintained** smoke command is runnable from a checkout of the source baseline with dependencies
installed, working loopback sockets and OpenSSL CLI. In both commands, replace `<repo-root>` with the
absolute checkout path; create a fresh ignored `_tmp*` directory first and confirm `git check-ignore`.
The maintained run on 2026-11-21 00:04 UTC passed 51/51, duration 2.17 s. It is regression evidence, not the
timing source.

```sh
env -u NODE_TLS_REJECT_UNAUTHORIZED TMPDIR='<repo-root>/_tmp-smtp-cap-01-v1-20261120' \
  pnpm --filter @web-ts-toolkit/email-service test:smtp
```

Check input provenance in the commit tree or against these source SHA-256s:

| Repo-relative source | SHA-256 |
| --- | --- |
| `packages/email-service/test/smtp/loopback.ts` | `b4028a1bfe3fc9352c8598f62e629d66229c53aec9f919a7dce1b13d7b1a7dc3` |
| `packages/email-service/test/smtp/tls-fixture.ts` | `a3d4fc124334a954a7c328bfd665a2d640d7f4394180f31313f7acf24c9482d0` |
| `packages/email-service/src/providers/smtp/submit.ts` | `25a8504627401c5ba54e9fb74ffc0c2b82f1e9104faa17791cdfc03c9ad576b4` |
| `packages/email-service/src/smtp.ts` | `30fb6a97da62f35431f39d43b6b0ac60908a5037203f638c8e1eac1d0e750b7e` |
| `pnpm-lock.yaml` | `1cf867ea9c0d60ecd98615cccee024c93fbb69753d49870e8248ae505f9b82c7` |
