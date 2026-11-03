> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Precisely bounded OAR-08 failure inventory

Final unfiltered diagnostic: 180 files, 5,761 registered cases; 5,740 passed, 21 failed, zero pending/skipped. One documentation suite fails during collection before registering cases. No runtime failure is classified as a documentation failure. The independent non-documentation gate passes all 5,662 cases in 176 full files.

No OAR-08 work was implemented. The full names and raw compiler/stack messages are retained in `OAR08-REMAINING-FAILURES.json` and the original final Vitest result.

## `documentation-examples.test.ts`

0 passed / 0 failed.

Collection error: Cannot read properties of undefined (reading 'getJsDocTags')


## `export-contract.test.ts`

43 passed / 4 failed.

- AR-14 published export contract dist artifact sanity FP-04 ships truthful optional fast-path/handle hover without private issuers in d.ts
- AR-14 published export contract dist artifact sanity FP-04 ships truthful optional fast-path/handle hover without private issuers in d.mts
- AR-14 published export contract dist artifact sanity SVA-10 exports consumer policy/handle types with editor JSDoc in d.ts
- AR-14 published export contract dist artifact sanity SVA-10 exports consumer policy/handle types with editor JSDoc in d.mts

## `packed-consumer-compatibility.test.ts`

9 passed / 4 failed.

- ARF-09 packed-package compatibility using the real release-artifact pipeline supports minimum peers from release-artifact tarballs across ESM, CJS, NodeNext, and Bundler consumers
  - Compiler diagnostics only in: `authorization-fast-path-consumer.types.fixture.cts`, `authorization-fast-path-consumer.types.fixture.mts`, `authorization-fast-path.readme.cts`, `authorization-fast-path.readme.mts`, `output-publication-fusion-withdrawal.types.fixture.cts`, `output-publication-fusion-withdrawal.types.fixture.mts`, `service-authorization-consumer.types.fixture.cts`, `service-authorization-consumer.types.fixture.mts`.
  - 146 diagnostic lines; node_modules/peer errors: False.
- ARF-09 packed-package compatibility using the real release-artifact pipeline supports current majors from release-artifact tarballs across ESM, CJS, NodeNext, and Bundler consumers
  - Compiler diagnostics only in: `authorization-fast-path-consumer.types.fixture.cts`, `authorization-fast-path-consumer.types.fixture.mts`, `authorization-fast-path.readme.cts`, `authorization-fast-path.readme.mts`, `output-publication-fusion-withdrawal.types.fixture.cts`, `output-publication-fusion-withdrawal.types.fixture.mts`, `service-authorization-consumer.types.fixture.cts`, `service-authorization-consumer.types.fixture.mts`.
  - 146 diagnostic lines; node_modules/peer errors: False.
- ARF-09 packed-package compatibility using the real release-artifact pipeline supports minimum peers from the actual build-artifact package tree across ESM, CJS, NodeNext, and Bundler consumers
  - Compiler diagnostics only in: `authorization-fast-path-consumer.types.fixture.cts`, `authorization-fast-path-consumer.types.fixture.mts`, `authorization-fast-path.readme.cts`, `authorization-fast-path.readme.mts`, `output-publication-fusion-withdrawal.types.fixture.cts`, `output-publication-fusion-withdrawal.types.fixture.mts`, `service-authorization-consumer.types.fixture.cts`, `service-authorization-consumer.types.fixture.mts`.
  - 146 diagnostic lines; node_modules/peer errors: False.
- ARF-09 packed-package compatibility using the real release-artifact pipeline supports current majors from the actual build-artifact package tree across ESM, CJS, NodeNext, and Bundler consumers
  - Compiler diagnostics only in: `authorization-fast-path-consumer.types.fixture.cts`, `authorization-fast-path-consumer.types.fixture.mts`, `authorization-fast-path.readme.cts`, `authorization-fast-path.readme.mts`, `output-publication-fusion-withdrawal.types.fixture.cts`, `output-publication-fusion-withdrawal.types.fixture.mts`, `service-authorization-consumer.types.fixture.cts`, `service-authorization-consumer.types.fixture.mts`.
  - 146 diagnostic lines; node_modules/peer errors: False.

## `strict-consumer-types.test.ts`

26 passed / 13 failed.

- ARF-14 strict packed-consumer types FP-04 checks installed optional flags, opaque handles and the exact runnable example (Bundler / ts)
- ARF-14 strict packed-consumer types FP-04 checks installed optional flags, opaque handles and the exact runnable example (NodeNext / mts)
- ARF-14 strict packed-consumer types FP-04 checks installed optional flags, opaque handles and the exact runnable example (NodeNext / cts)
- ARF-14 strict packed-consumer types FP-04 checks installed optional flags, opaque handles and the exact runnable example (Node16 / mts)
- ARF-14 strict packed-consumer types FP-04 checks installed optional flags, opaque handles and the exact runnable example (Node16 / cts)
- ARF-14 strict packed-consumer types FUSE-05 keeps the original eight options without unshipped fusion controls (Bundler / ts)
- ARF-14 strict packed-consumer types FUSE-05 keeps the original eight options without unshipped fusion controls (NodeNext / mts)
- ARF-14 strict packed-consumer types FUSE-05 keeps the original eight options without unshipped fusion controls (NodeNext / cts)
- ARF-14 strict packed-consumer types FUSE-05 keeps the original eight options without unshipped fusion controls (Node16 / mts)
- ARF-14 strict packed-consumer types FUSE-05 keeps the original eight options without unshipped fusion controls (Node16 / cts)
- ARF-14 strict packed-consumer types SVA-10 checks installed authorization types and public boundaries (ts)
- ARF-14 strict packed-consumer types SVA-10 checks installed authorization types and public boundaries (mts)
- ARF-14 strict packed-consumer types SVA-10 checks installed authorization types and public boundaries (cts)

## Infrastructure is no longer the failure

- All isolated offline installs finish using a fresh private store/index and correctly placed XDG pnpm registry metadata. No ERR_PNPM_NO_OFFLINE_META failure remains.
- Actual release-artifact assembly succeeds in a fresh bounded staging tree. The assembler discovers one existing real compiled CLI, copied read-only without an unrelated build. No No-CLI-bin failure remains.
- The two numeric API minimum/current peer matrices pass Bundler/NodeNext/Node16. Minimum peers retain the existing skipLibCheck distinction; current peers use skipLibCheck:false.
- Four full packed guide/consumer matrix cases now fail strictly on the old flag/handle/readme/type recipes (exactly four fixture/recipe families in .mts and .cts), not on install, artifact plumbing or peer declarations.
- OAR-04/OAR-05 current public tarball runtime/type gates pass, with sixty actual HTTP requests, all fourteen packed/live outputs byte-identical, and separate expected removed-API negative compilation.
