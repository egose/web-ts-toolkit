# EMAIL-05 SMTP design, verification and handoff

Companion to [EMAIL-05](../../../tasks/20261118-223259-email-service-package.md#email-05--implement-smtp-provider)
and the [V1 contract](v1-contract.md). Only `./smtp` gained a runtime factory. The peer floor follows the
[EMAIL-01 packaging decision](email-01-packaging.md): Nodemailer `>=10.6.0 <11`, exact dev floor `10.6.0`.

## Wire and evidence boundary

- Use Nodemailer's real conditional declarations and `MailComposer` for MIME, with no file/URL access or caller
  passthrough. The V1 controlled-transport alternative owns DNS, TCP and TLS rather than calling `sendMail` or
  inferring transaction evidence from `SMTPConnection` errors. The locked connection's destroy-on-close and late
  DNS socket guards are useful, but its own DNS resolution is not exposed for cancellation and its reply handlers
  accept some loosely framed statuses. No third-party source or declarations were copied or patched.
- A validated profile owns its trust context. Custom trust accepts a nonempty list of at most 16 individual PEM X.509
  CA certificates (16 KiB per entry), replacing Node's default roots. Host is an ASCII DNS name or unscoped IP literal.
  Optional `servername` must be a DNS name; without it, verify the endpoint's configured name or IP SAN. ESMTP
  PLAIN/LOGIN is available only over a verified TLS 1.2+ socket, after a fresh EHLO on STARTTLS. Auth fields are
  nonempty, control-free UTF-8, at most 1 KiB each. There is no plaintext fallback.
- Each valid `submit` consumes the prepared object. One cancellable A/AAAA resolver selects the first usable address,
  cancels outstanding DNS queries and dials one numeric target. IP literals skip DNS. This path does not look up
  hosts-file aliases or retry other addresses. The transport deliberately does not pipeline, pool, support LMTP,
  fall back to HELO, or use another auth mechanism. It destroys the connection without waiting for `QUIT`.
- Use one absolute monotonic `createBudget`; check it before DNS/TCP/TLS/command transitions, body writes and
  acceptance of incoming evidence. Cancel DNS, destroy the body stream, and destroy both the TCP and upgraded TLS
  sockets before settling. Late completions cannot advance the session. This does not undo already transmitted bytes
  or preempt synchronous JS/event-loop stalls.
- MIME input uses a detached snapshot and ordered SHA-256-verified byte views. From, To, Cc and Reply-To keep
  validated address spelling; Bcc goes only in `RCPT TO`, including Bcc-only envelopes. Encoded words preserve the
  literal subject, including surrounding spaces or encoded-word lookalikes. Base64 preserves decoded UTF-8 bodies
  and attachment bytes through CRLF normalization. Resolved attachments are opaque MIME leaf parts; composite
  `multipart/*` and `message/*` refs fail SMTP preflight as `invalid_snapshot` rather than allowing caller MIME
  structure or sending a nonconforming Base64 composite. This is SMTP-specific; the common ref schema is unchanged.
- One complete bounded CRLF reply belongs to one outstanding command. A final `250` is accepted only after the
  complete MIME stream and terminator, with an explicit RCPT result for every frozen recipient. The result carries
  `<attemptId@email.invalid>` only on confirmed success. Any confirmed partial acceptance is terminal. All RCPTs
  refused is safe transient only if every refusal was 4xx. If a permanent RCPT refusal is followed by definitive
  final DATA nonacceptance for the remaining recipients, the result is terminal rejection, not another submission
  of the whole envelope. Only allowlisted transient faults before any body transfer can be `not_transmitted`;
  incomplete replies, unexpected statuses and post-body resets without conclusive SMTP evidence never authorize
  retry. Timeout/abort without conclusive evidence yields `unknown` even if local progress stopped early.
- Public outcomes pass through `readProviderResult`; no raw replies, backend IDs, addresses, credentials, exception
  causes or protocol logs enter a result. Acceptance is SMTP handoff, not inbox delivery or a deduplication promise.

## Reuse for SendGrid and the worker

These paths are internal source, not package exports:

- [`src/internal/provider-preparation.ts`](../../../../packages/email-service/src/internal/provider-preparation.ts):
  `readProviderSubmission(input, ref)` validates the exact payload, UUIDs, variant/profile/mode, and each ordered
  resolved reference against the canonical snapshot. It returns a detached snapshot and owned byte views (do not
  expose them). `readProviderCall` checks the actual signal and a positive integer child budget `1..60,000` ms;
  the worker's configured override floor does not apply when shortening a call.
- [`src/internal/budget.ts`](../../../../packages/email-service/src/internal/budget.ts) is the absolute clock and
  cancellation primitive. For HTTPS, independently own and close the request/socket/response on this signal,
  guard callbacks before starting the next stage and recheck before interpreting the final response. Do not reuse
  the trusted-host callback abandonment mechanism for provider I/O.
- The worker still owns lease/expiry checks, acknowledged handoff before `submit`, and safe post-handoff result
  checking/finalization. Use `readProviderResult` from
  [`src/internal/attempt-codecs.ts`](../../../../packages/email-service/src/internal/attempt-codecs.ts) again for
  injected providers. A prepared object or stable synthetic SMTP ID is not a retry/deduplication capability.
- [`test/smtp/loopback.ts`](../../../../packages/email-service/test/smtp/loopback.ts) exports `openLoopbackSmtp`
  and `latch`; script a command reply, stall TLS, or wait for the actual peer to close. It binds an ephemeral
  loopback port and does not relay mail. [`test/smtp/tls-fixture.ts`](../../../../packages/email-service/test/smtp/tls-fixture.ts)
  generates short-lived synthetic keys/certificates via bounded OpenSSL commands under the verified ignored
  `TMPDIR`. Call `close()` on both fixtures in teardown. The command/cleanup fixtures can be reused in EMAIL-07
  without using a real account or changing any process-wide Node library.

## Verification

Node 26.12.1, pnpm 11.24.0, TypeScript 6.0.3, Vitest 4.1.12, tsup 8.5.1, Nodemailer 10.6.0 and OpenSSL CLI 3.0.13.
Commands ran serially from `<repo-root>` with a fresh, gitignored repo-local `TMPDIR`.

```sh
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service test:smtp
pnpm --filter @web-ts-toolkit/email-service build:package
```

- Typecheck, all 78 unit tests and 50 SMTP tests passed. The SMTP tests use real TCP/TLS and a real cancellable
  resolver pointed only at an isolated UDP loopback fixture. They observe exact MIME and envelope bytes, both TLS
  modes, the TLS minimum, IP and DNS host verification, auth staged over TLS, explicit wire negative replies,
  partial recipient accounting, pre-/post-DATA TCP resets, truncation, and peer-observed closure during TLS, AUTH
  and DATA. The deadline tests keep sending incomplete TLS or SMTP progress; the connection still closes. Late
  successful DNS callbacks and the event-loop-stall edge are simulated at the internal resolver seam.
- The initial SMTP run exposed a PEM CRLF parsing issue; parsing now validates complete Base64 lines and the CRLF
  regression passes. The fixtures have no backing SMTP mailbox, DNS infrastructure, private keys from elsewhere,
  live delivery, revocation check or claim about keeping arbitrarily scheduled code within a wall-time SLA.
- Build emitted both runtime and declaration conditions; both SMTP declarations expose the typed factory and no
  Nodemailer types. Plain Node resolved both emitted factories through the package's own exports and completed a
  no-wire pre-abort smoke with the workspace peer. The ordinary packed-consumer fixture now covers root without
  peers, each peer independently and the SMTP factory in both formats with a pre-aborted call. It was extended
  but not run in the authorized verification set. Installed-tarball/release-shaped, minimum-Node, peer ceiling,
  worker/SendGrid and live service behavior are not verified by these checks.
- Changed paths passed formatting and applicable lint. No static CI or golden graph, test-group registration,
  lockfile or other adapter changes; coordinate activation in EMAIL-11. No workspace suite/build or live mail ran.
  No scratch input is needed to reproduce this phase. Generated keys, consumers, dependencies, caches and raw
  observations were not archived.
