# EMAIL-11 installed consumers and workspace activation

Evidence for [EMAIL-11](../../../tasks/20261118-223259-email-service-package.md#email-11--verify-installed-package-docs-and-workspace-integration)
and the installed-consumer row in the [V1 verification matrix](v1-contract.md#verification-matrix). This stage
preserves the four public entrypoints and both optional peer ranges; no runtime API or persistence semantics changed.

## What the installed checks exercise

- [The packed lane](../../../../packages/email-service/test/packed-consumer/packaging.test.mjs) uses
  `npm pack --json --ignore-scripts` for the ordinary package and for the flattened release layout. It resolves
  `@repo-toolkit/publish-package` from the root's installed `@repo-toolkit/publish-packages`, copies only the root
  manifest and LICENSE and email-service's manifest, README and build output to a private scratch tree, then runs
  its real default `preparePackageArtifacts` path with the version from `VERSION`, `skipBuild: true`, and a runner
  that throws on any subprocess. Only that scratch copy is staged. The returned `dist` is the tarball root;
  manifest paths no longer contain `dist/`, root metadata and LICENSE are present, and no scripts, dev dependencies,
  placeholders, source tree or test files ship. The ordinary tarball still has the development placeholders and
  uses `dist/` paths. No `npm publish` or dry-run publish was invoked.
- Fresh pnpm apps for both layouts install with automatic peer installation enabled, no checkout aliases or
  ambient application types. Manifest checks cover runtime and declaration conditions; Node resolves and executes
  both ESM and CommonJS with exact runtime exports. Native module hooks reject file loads outside the consumer and
  nonpublic deep imports are denied. Import smoke guards timers and network. Strict TypeScript uses NodeNext
  `.mts`/`.cts` and Bundler resolution with `skipLibCheck: false`, and checks the actual loaded declarations.
  For exports with a peer, the app and installed package resolve the same exact peer manifest.
- [The shipped README](../../../../packages/email-service/README.md) labels its 13 TypeScript fences. Tests read
  those fences from the installed README and supply only their stated prior setup and test invocations. Nine core
  examples run with neither peer; all 13 are checked with both. The assertions cover local escape/rendering, typed
  SendGrid data and preflight, enqueue/replay, outbox serialization and idempotent relay, memory readiness, a bounded
  worker run, batches and redacted result history. The outbox commit callback is a serialization fixture, not a
  transaction implementation. The SendGrid result is injected through the public provider port after real adapter
  preflight. SMTP is constructed and prepares without network; the batch's real-profile run is pre-aborted.
  Mongoose opens, readies, queries and closes a caller connection against a fresh one-member loopback replica set
  for each tarball. Runtime guards allow only that exact database socket in the storage example; no provider traffic.
- The build contains 16 public artifacts (four entrypoints × ESM, CJS and their declarations) and four private
  declaration chunks. Tests check that every shipped declaration is reachable in the appropriate form, and inspect
  JSDoc on 15 public symbols or members in both forms. The emitted root in particular carries the new
  `EmailCommand` retry-identity comment, `defineSendGridTemplate` remote-version limit and `enqueuePrepared`
  transaction/expiry warning. The documentation test is not a snapshot of generator internals or chunk hashes.

<!-- prettier-ignore -->
| Consumer installation | Mongoose | Nodemailer | Expected boundary |
| --- | --- | --- | --- |
| Neither | Absent | Absent | Core and SendGrid work; Mongoose module imports, but its declaration requires Mongoose. SMTP types resolve; SMTP runtime import requires Nodemailer. |
| Nodemailer only | Absent | 10.6.0 | SMTP ESM and CJS instantiate and prepare; Mongoose declaration still reports the missing peer. |
| Mongoose only | 9.12.2 | Absent | Mongoose declarations and caller-owned adapter work; SMTP types remain peer-free and SMTP runtime still needs Nodemailer. |
| Both | 9.12.2 | 10.6.0 | All four entries and the full installed README execute with the advertised dependencies. |

The TypeScript compiler comes from the verified checkout toolchain; its own standard libraries are the only
declarations outside each app allowed by the closure check. It does not supply workspace source or application
ambient types. The packed lane covers pnpm installs of both npm-format tarballs, not other installer versions,
every later Node/peer/TypeScript version, or a registry publication.

## Workspace wiring and scope

The canonical package `build` delegates to `build:package`. `test` runs one build, typecheck and all six lanes
serially, stopping on a failed subprocess. It reuses an existing, writable, real, gitignored checkout `_tmp*`
directory (including CI's short resource directory). Otherwise it creates and verifies a fresh `_tmpXXXXXX` at
the repository root, exports that as `TMPDIR` for every child, and removes only the scratch it owns.

Group 2 now has email-service exactly once. Its sibling jobs have no Mongo or compiled output conflict with it.
The package reads its own build plus root metadata/tools and builds only its own `dist`; there is no test-access
override. The static `test-email-service` job needs only `ci-prepare` and uses the existing SHA/attempt-scoped
restore and test action. Package Mongo resource preparation uses the existing 8.2.6 default, not a new version or
an application database. There are 26 package jobs, 28 aggregate results, 29 generated main jobs, 32 total jobs,
32 build roots and nine Mongo jobs. The 26 declared workspace test gates plus one existing fixture gate, the
aggregate's `always()`/fail-closed policy, and the three independent jobs are unchanged.

A narrow static comparison matched the new job to the existing one-node job template and confirmed that removing
only that job and its aggregate entry yields the prior workflow, including triggers and independent lanes. The CI
and group validators and their contract tests were **not run**. No unrelated package suite, repository-wide build,
lint or test, hosted workflow, required-check change, release build, publication, live mail or commit was performed.
Hosted rollout and required-check confirmation remain maintainer-gated.

## Reproduction and results

Run from `<repo-root>` with dependencies already installed. The checked-in runner creates canonical scratch when
`TMPDIR` is unset. Use a separate fresh ignored directory for the standalone floor run. The explicit offline install
switch needs a populated pnpm cache for both exact peers and their transitive dependencies; without the switch the
packed fixture prefers the cache but can fetch missing dependencies. The Mongo binary is a pre-existing executable
for the local platform, not an external database, and runtime download is disabled here.

```sh
export MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false EMAIL_SERVICE_CONSUMER_OFFLINE=1
export MONGOMS_SYSTEM_BINARY='<absolute path to a prepared mongod 8.2.6>'
timeout --kill-after=20s 900s env -u TMPDIR -u TMP -u TEMP -u EMAIL_SERVICE_CONSUMER_NODE \
  pnpm --filter @web-ts-toolkit/email-service test

export TMPDIR="$(mktemp -d '<repo-root>/_tmp-e11-floor.XXXXXX')"
git check-ignore -- "$TMPDIR"
EMAIL_SERVICE_CONSUMER_NODE='<absolute path to the Node 24.0.0 executable>' \
  timeout --kill-after=20s 440s pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
```

Toolchain: Linux x64, Node 26.12.1, pnpm 11.24.0, npm 11.20.0, TypeScript 6.0.3, tsup 8.5.1,
Vitest 4.1.12, and `@repo-toolkit/publish-packages`/`publish-package` 0.41.2. The flattened release test used
version 0.71.0 from `VERSION`. The prepared server is MongoDB 8.2.6 WiredTiger; Mongo lanes use
`mongodb-memory-server`/core 11.3.0, Mongoose 9.12.2 and MongoDB Node driver 7.8.0.
Local rendering uses Handlebars 4.7.10 and SMTP uses Nodemailer 10.6.0.
The consumer apps that need Mongoose also install `@types/node` 26.6.6 explicitly; it is not a package peer.
The Node 24.0.0 override applies to installed consumers and their TypeScript invocations, not to pnpm,
`npm pack`, the staging harness, or the full package suite.

### Final serial pass (2026-11-20)

The canonical package command exited 0 with one delegated build, successful typecheck and a fresh runner-owned
`TMPDIR`. Every required lane ran unfiltered; no failures, skips or todos.

| Lane                      | Passing tests | Files or matrix                                      |
| ------------------------- | ------------: | ---------------------------------------------------- |
| Unit                      |           228 | 19 files                                             |
| Memory lifecycle          |            27 | 1 file                                               |
| SMTP                      |            51 | 1 file                                               |
| SendGrid                  |            91 | 3 files                                              |
| MongoDB                   |            95 | 7 files; 297.84 seconds                              |
| Packed, Node 26.12.1      |            12 | 2 tarball shapes × 4 peer profiles; 173.72 seconds   |
| Packed, Node 24.0.0 rerun |            12 | Same complete matrix and peer floors; 173.58 seconds |

The canonical run passed **492 Vitest cases plus the 12 Node test-runner results**. Each packed count includes
eight consumer cases, the scratch test and three enclosing results. The Node 24 rerun followed the complete
canonical pass, reused the build read-only and exited 0. Both matrices resolved the exact versions above with
offline peer installs. The provider lanes use synthetic loopback SMTP/HTTPS as in [EMAIL-10](email-10-robustness.md).

### Preflight corrections

The first packed preflight found two harness issues: TypeScript's JSDoc accessor needs parent-linked syntax nodes,
and the runtime guard must allow the actual emitted Handlebars import
(`handlebars/dist/cjs/handlebars.js`). Both were corrected; a separate ordinary-tarball smoke then compiled and
ran the README against the two peer floors, including loopback Mongo. That smoke did not replace the full matrix.

The first canonical run passed the build, typecheck and all 492 Vitest cases, but the flattened tarball's storage
example timed out during the first MongoDB handshake. It shared the ordinary tarball's fixture across synchronous
compiler and runner subprocesses. The packed harness now starts a fresh replica set per tarball and executes the
storage example asynchronously so `mongodb-memory-server` can keep draining the server's pipes. The failed run
does not count as a canonical pass.

Hygiene: Prettier 4.0.0-alpha.13 and ESLint 10.12.0 (`pnpm exec eslint --max-warnings=0`) on the changed paths
only (ESLint for code).
The workflow retains the existing generator's YAML indentation, already flagged by Prettier at `HEAD`;
its changed block was checked by the static comparison above. Checked `git diff --check` for tracked changes
and `git diff --no-index --check /dev/null <file>` for touched untracked files, plus local links/anchors, privacy
and nonignored evidence destination. Inspected the actual emitted `.d.ts` and `.d.mts` comments.

The examples use maintained synthetic data. No raw logs, staged packages, archives, dependency trees, databases,
keys or binaries are preserved here. Prior stage evidence and the frozen contract are unchanged.
