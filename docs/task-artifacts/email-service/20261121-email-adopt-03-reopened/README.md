# EMAIL-ADOPT-03 — Reopened resolution, 2026-11-21

Follow-up to [finding 1 and the per-reason `Extract` note](../20261121-email-adopt-10/README.md#findings-to-resolve-before-acceptance),
on `39848121` plus the shared EMAIL-ADOPT-01–09 work. The [initial implementation handoff](../20261121-email-adopt-03/README.md) is unchanged.

- [`ProviderResult`](../../../../packages/email-service/src/contracts/provider.ts) requires a nonempty readonly
  all-accepted tuple for `smtp_accepted` and checked status evidence for `smtp_partial`. For dynamically built
  lists, the named, no-peer `createSmtpAcceptanceResult(recipients, messageId?)` checks the list and returns
  the appropriate branch. It copies and freezes the result, array, and entries in the supplied order.
  The partial proof is declaration-only and compatible across ESM/CJS; no marker is written or required at runtime.
- The bundled SMTP adapter uses the constructor only after the final DATA acknowledgement. No SMTP commands,
  persisted `AttemptResult` or retry/cancellation behavior changed. The worker still checks the actual envelope,
  capacity, order, attempt ID, profile mode and timeliness. Per-reason extraction now works for all transport
  reasons. The [installed migration note and example](../../../../packages/email-service/README.md#implement-a-custom-provider)
  show the checked construction path without unsafe casts.
- Packed [ESM](../../../../packages/email-service/test/packed-consumer/fixtures/esm.mts) and
  [CJS](../../../../packages/email-service/test/packed-consumer/fixtures/cjs.cts) type fixtures accept literal full
  acceptance, dynamic mixed construction and per-reason `Extract`, and reject explicit empty and both forms of
  same-status partial evidence. [Packed runtime coverage](../../../../packages/email-service/test/packed-consumer/fixtures/provider-results-runtime.mjs)
  checks malformed inputs, detached immutable evidence, and cross-build capacity acceptance in To/Cc/Bcc order.
  The worker records `unknown / transport_uncertain` for raw empty/full or all-accepted/partial evidence and
  for a checked list in the wrong capacity order. None resends. [Unit coverage](../../../../packages/email-service/test/unit/worker-fences.test.ts)
  also advances past the retry window and confirms no second submission.

## Verification

Use Node 26.12.1, pnpm 11.24.0 and TypeScript 6.0.3. From `<repo-root>` with an ignored fresh `TMPDIR`, each
script ran serially as `pnpm --filter @web-ts-toolkit/email-service <script>`.

| Script                 | Result                                                                          |
| ---------------------- | ------------------------------------------------------------------------------- |
| `typecheck`            | Passed                                                                          |
| `build`                | Passed; both declaration formats carry the proof, no runtime bundle contains it |
| `test:unit`            | 269 passed in 21 files                                                          |
| `test:lifecycle`       | 34 passed in 3 files                                                            |
| `test:smtp`            | 65 passed in 2 files; two optional timing cases skipped                         |
| `test:sendgrid`        | 91 passed in 3 files                                                            |
| `test:packed-consumer` | 12 passed, none skipped; both tarballs and all four peer profiles               |

```sh
cd '<repo-root>'
set -e
scratch="$(mktemp -d "$PWD/_tmpXXXXXX")"
git check-ignore -q -- "$scratch"
export TMPDIR="$scratch"
unset SMTP_CAPACITY_TIMING
export EMAIL_SERVICE_CONSUMER_OFFLINE=1 MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false
export MONGOMS_SYSTEM_BINARY='<absolute path to local mongod 8.2.6>'
for script in typecheck build test:unit test:lifecycle test:smtp test:sendgrid test:packed-consumer; do
  pnpm --filter @web-ts-toolkit/email-service "$script"
done
```

The packed lane ran offline from a warm pnpm store with disposable MongoDB 8.2.6. It exercised strict NodeNext
ESM/CJS, Bundler declarations, and the 18 installed README TypeScript examples. `pnpm lint`, targeted
`pnpm exec prettier --check` (including `worker-fences.test.ts`), and whitespace checks passed.

This follow-up did not exercise the standalone Mongo suite, live providers, the minimum Node version, or
`SMTP_CAPACITY_TIMING=1` (the 25 ms and 50 ms extended loopback cases). Raw logs, tarballs, dependencies and
disposable database files are omitted; the maintained tests reproduce the checks. EMAIL-ADOPT-09's greeting
follow-up and task statuses were not edited.
