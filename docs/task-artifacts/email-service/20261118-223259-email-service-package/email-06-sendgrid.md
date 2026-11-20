# EMAIL-06 SendGrid verification and handoff

Companion to [EMAIL-06](../../../tasks/20261118-223259-email-service-package.md#email-06--implement-sendgrid-template-provider)
and the [V1 contract](v1-contract.md#outcomes-and-provider-contract). This phase finishes the one-shot
`./sendgrid` runtime factory. It does not add a worker, queue guarantees, an SDK peer, template administration,
or an external delivery test.

## Implementation and evidence boundary

- `createSendGridProvider({ key, apiKey, mode? })` copies instance credentials and freezes the profile ref.
  The only destination is the verified TLS 1.2+ `api.sendgrid.com:443`, `POST /v3/mail/send`. The adapter owns a
  cancellable resolver, uses the first usable numeric A/AAAA answer for one dial, and checks the configured host
  for both SNI and certificate identity. The HTTP request starts only on that verified socket. There are no
  redirects, proxies, shared agents, implicit key lookup/mutation, or retries. There is no public transport
  or trust override. Node's normal trust roots apply.
- `prepare` validates/detaches the frozen input, including profile kind/key/mode and ordered attachment refs
  and byte hashes, with no I/O. It builds at most 8 MiB of UTF-8 JSON: one personalization with exact ordered
  To/Cc/Bcc and `dynamic_template_data`, top-level From/Reply-To, `template_id`, and optional ordinary padded
  base64 attachments. Only sandbox sets `mail_settings.sandbox_mode.enable`. Job/attempt IDs, correlation and
  local batch info are not sent. The resolved template ID does not pin the remote active template version.
- One monotonic budget covers DNS, TCP/TLS, request and response. Abort/deadline fences late callbacks before
  canceling DNS or destroying the request, response and socket. `submit` waits for local socket closure, not
  a peer acknowledgement of closure. The last validity check is before accepting a completed response; later
  cancellation cannot rewrite captured evidence. Closure cannot recall bytes already sent, and event-loop
  suspension can delay the local shutdown.
- The strict HTTP parser and a bounded wire check must agree. Accept one complete HTTP/1.0 or 1.1 final frame
  with a single decimal `Content-Length`, or an ordinary, unextended HTTP/1.1 chunked frame without trailers.
  The 64 KiB ceiling includes response headers, body and chunk overhead. The adapter rejects close-delimited
  bodies, compressed/unsupported coding, informational and upgrade responses, conflicting framing and surplus
  bytes observed with the final frame. It closes after a complete frame; it does not listen indefinitely for
  further bytes. The opaque body is not decompressed, parsed as diagnostics, or exported.
- Complete live `202` is request `accepted`; complete sandbox `200` is `validated`. Only the former can emit a
  single bounded, unambiguous `X-Message-Id` token; duplicate or invalid IDs are dropped. There are no SendGrid
  recipient results. Complete `429` is `rejected` / `safe_transient`; keep both a valid `Retry-After` delay and
  the later valid absolute floor from an HTTP date or `X-RateLimit-Reset`. The store chooses the latest floor
  at finalization. Valid overflow saturates; malformed single hints are ignored, while duplicate hint fields
  make the response uncertain rather than lowering a potentially valid floor.
- The only other HTTP nonacceptance evidence is a complete `400`, `401`, `403`, `404`, `405` or `413` (permanent
  rejection). Unexpected statuses including all `5xx`, mismatched success mode, malformed/truncated/oversized
  responses and wire errors after entering the HTTP phase are `unknown` / `never`. `not_transmitted` requires
  an allowlisted transient error before the HTTP request could exist. Known permanent certificate/configuration
  failures at that point are `unsubmitted` / `never`. An abort/timeout without confirmed evidence is `unknown`,
  not permission to retry even if local progress stopped early. No raw errors, response text or headers are
  returned. Neither acceptance nor validation implies inbox delivery.

## Reuse for EMAIL-07

- Use the [shared provider preparation and result contracts](../../../../packages/email-service/src/contracts/provider.ts).
  Resolve and verify ordered attachments before `provider.prepare`; use the snapshot's exact profile kind, key
  and mode. Invoke the resulting one-shot `submit` only after the exact timely positive handoff acknowledgement
  and the launch checks in the [worker contract](v1-contract.md#worker-deadlines-and-errors). Pass the bounded child
  `ProviderCall` (`1..60,000` ms) and its cancellation signal. A valid pre-aborted direct call consumes the object
  without I/O; this is not the worker's distinct proof that `submit` was never invoked.
- Revalidate external provider results with
  [`readProviderResult`](../../../../packages/email-service/src/internal/attempt-codecs.ts), including provider,
  mode and envelope context. Use the existing store decision for retry hints, backoff, budget and expiry; do not
  interpret a provider exception as no wire effect or shorten a floor. Handoff and finish ACK ambiguities,
  recovery, shutdown ownership and result projection are still worker/store concerns. Never call a provider a
  second time to confirm a finish.
- For isolated worker integration, use
  [`createSendGridProfile(options, io)`](../../../../packages/email-service/src/providers/sendgrid/profile.ts)
  with [`test/sendgrid/fixtures.ts`](../../../../packages/email-service/test/sendgrid/fixtures.ts) and the shared
  [SMTP TLS generator](../../../../packages/email-service/test/smtp/tls-fixture.ts). These are package-internal
  source paths, not published imports. The fixture supplies synthetic DNS replies, an ephemeral loopback port
  and a synthetic CA at the transport seam; the request authority and TLS hostname checks remain unchanged.
  Await fixture teardown and use the server-side peer-close barrier to distinguish actual socket shutdown from
  a promise that simply stopped waiting.

## Verification

Ran serially from `<repo-root>` with a fresh, verified gitignored repo-local `TMPDIR`. Node 26.12.1, pnpm 11.24.0,
TypeScript 6.0.3, Vitest 4.1.12, tsup 8.5.1, npm 11.20.0 and OpenSSL CLI 3.0.13.

```sh
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:sendgrid
pnpm --filter @web-ts-toolkit/email-service test:smtp
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service build:package
pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
pnpm exec eslint 'packages/email-service/**/*.{ts,tsx,js,mjs,mts,cts}'
```

- **SendGrid:** 90 tests across three files.
  [`https.test.ts`](../../../../packages/email-service/test/sendgrid/https.test.ts) observed real loopback HTTPS
  request bytes under overlapping profiles, isolated bearer keys, TLS trust/hostname/minimum version,
  exact status and ID cases, 429 floors, malformed/truncated/oversized HTTP, and local and peer socket closure on
  abort and deadline. DNS results and late callbacks at cancellation, request socket assignment and exact
  clock equality were injected; normal TLS/HTTP, timeout under response progress and socket destruction were
  not mocked. [`profile.test.ts`](../../../../packages/email-service/test/sendgrid/profile.test.ts) verifies strict
  no-I/O preflight and one-shot ownership. [`retry-hint.test.ts`](../../../../packages/email-service/test/sendgrid/retry-hint.test.ts)
  checks strict HTTP dates, saturation and later-floor selection by the existing store reducer.
- **Regressions and package:** 50 SMTP and 78 unit tests passed. The build emitted both runtime/declaration
  formats. The ordinary tarball installed without optional peers and with each peer floor separately. The
  installed SendGrid named factory worked in ESM/CJS under I/O guards with a no-wire pre-abort, and strict
  NodeNext ESM/CJS and bundler type checks passed. Both emitted declarations retain the factory documentation
  and do not expose the private seam. Root imports do not expose the provider factory. Package ESLint,
  changed-path Prettier, handoff links and change whitespace passed.
- No minimum-Node, release-shaped tarball, MongoDB runtime, worker, workspace or CI lane ran in EMAIL-06.
  No live SendGrid, external DNS lookup in the SendGrid fixture, or email delivery was attempted. Fixtures are
  synthetic and maintained in the package, including the reused SMTP key generator. No keys, tarballs,
  installed consumers, dependencies, raw wire records or scratch cache were archived; reproducing the
  checked lanes needs the repo and the described toolchain, not previous scratch files.
