# EMAIL-ADOPT-04 implementation handoff

Verification for [EMAIL-ADOPT-04](../../../tasks/20261121-022138-email-service-cross-project-adoption.md#email-adopt-04--preserve-template-inference-in-shared-typescript-code), on `39848121` plus the shared EMAIL-ADOPT-01–03 changes and this item. Task status remains with the coordinator.

## Behavior and coverage

- [`TemplateCommand`](../../../../packages/email-service/src/contracts/template.ts) now indexes the template-kind-to-provider mapping. `TemplateCommand<TemplateMap>` accepts live SMTP and live or sandbox SendGrid. Code consuming a widened command must check its provider kind before assuming one provider; the widened map does not retain per-key business input types.
- The [source type fixture](../../../../packages/email-service/test/unit/template-types.ts) reproduced the old SMTP rejection (`TS2345`: `'smtp'` is not assignable to `'sendgrid'`). It now passes with both providers and preserves concrete key inference across registry preparation, service admission and batch admission. The packed [ESM](../../../../packages/email-service/test/packed-consumer/fixtures/esm.mts) and [CommonJS](../../../../packages/email-service/test/packed-consumer/fixtures/cjs.cts) cases accept both providers with a widened map, reject invalid modes, and reject wrong business inputs and cross-kind refs for concrete keys.
- The [local README example](../../../../packages/email-service/README.md#prepare-a-local-template) uses `satisfies TemplateMap` and validates the declared input synchronously in `parseInput`. `prepare` trims the name into prepared values. The installed example checks the command's padded input and the rendered, trimmed subject and escaped HTML. The existing admission and batch snippets still use this command. The packed test checks the `parseInput` and `TemplateCommand` JSDoc in both declaration formats.
- The command input type is still inferred from the return type of `parseInput`. There is no new raw-input generic, parser behavior, runtime validation change, entrypoint, dependency or stored format. All eight emitted `.js` and `.mjs` files matched their pre-change SHA-256 hashes.

## Serial verification

Node 26.12.1, pnpm 11.24.0, TypeScript 6.0.3. Each script was invoked as `pnpm --filter @web-ts-toolkit/email-service <script>`, with a fresh short, ignored checkout-local `TMPDIR`.

- `typecheck`: Passed after the intentional baseline failure above.
- `test:unit`: 235 passed in 19 files.
- `build`: Passed; inspected ESM and CJS declarations.
- `test:packed-consumer`: 12 passed, none skipped. Both ordinary and flattened-release tarballs exercised four optional-peer profiles apiece, with strict NodeNext ESM/CJS and Bundler ESM fixtures. All 15 installed README TypeScript examples compiled in the both-peer profile of each tarball; core examples also compiled and ran without peers.

`pnpm lint`, targeted formatting of package files, and `git diff --check` passed. The packed consumer uses a warm pnpm store (`EMAIL_SERVICE_CONSUMER_OFFLINE=1`) and a local 8.2.6 executable (`MONGOMS_SYSTEM_BINARY`, `MONGOMS_VERSION=8.2.6`, `MONGOMS_RUNTIME_DOWNLOAD=false`) for disposable loopback replica sets.

The standalone lifecycle, SMTP, SendGrid, and MongoDB lanes and other Node versions are outside this verification. No external mail was sent. Raw logs, generated packages, dependencies, and disposable databases are omitted; the maintained fixtures are the reproduction inputs.
