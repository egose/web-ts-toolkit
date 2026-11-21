# SMTP-CAP-04 — Installed contract and acceptance

Scope: CAP-04 on the uncommitted implementation over `bc086cc6`. No publication or downstream change.
The [approved contract](implementation-contract.md) governs the package API. The [shipped README](../../../../packages/email-service/README.md#opt-in-to-larger-smtp-envelopes)
and both declaration formats describe the same immutable binding on the existing factories. The
[CAP-03 timing](cap-03-timing.md) is verified-TLS loopback evidence, not an external relay guarantee.

## Maintained acceptance checks

The [packed harness](../../../../packages/email-service/test/packed-consumer/packaging.test.mjs) installs ordinary and
flattened release-layout npm tarballs into fresh pnpm consumers with neither peer, Nodemailer only, Mongoose only,
and both at the supported floors. It checks exact runtime exports and strict NodeNext ESM/CJS and Bundler
declarations, including the literal `version: 1` types. It compiles the TypeScript examples from the installed
README and checks installed JSDoc in `.d.mts` and `.d.ts`.

The [mixed-format fixture](../../../../packages/email-service/test/packed-consumer/fixtures/capacity-mixed.mts)
compiles under strict NodeNext and runs beside the README on the same disposable MongoDB replica set for each
tarball's both-peer profile. It checks separate V1 and two independent opt-in Mongo queues, scoped and cross-queue
reads, invalid factory and readiness combinations, 50/51, 51/52 and 1,000/1,001, cross-build batch admission,
and real SMTP preflight without submitting. The no-peer runtime also exercises a bound memory store from the root.
Aggregate byte limits, outcomes, redaction, SMTP wire and recovery are exercised in the canonical package suites
and the earlier [CAP-02](cap-02-verification.md) and [CAP-03](cap-03-verification.md) focused evidence.

## Results — 2026-11-21 UTC

The canonical Node v26.12.1 command completed in **604.99 s** (exit 0), including the build and typecheck.
The identical packed lane then completed in **167.14 s** (exit 0); each of its eight installed consumer profiles
reported Node v24.0.0.

| Lane                 | Passed | Skipped | Coverage                               |
| -------------------- | -----: | ------: | -------------------------------------- |
| Unit                 |    228 |       0 | 19 files                               |
| Memory lifecycle     |     32 |       0 | 2 files                                |
| SMTP                 |     65 |       2 | 2 files; default and opt-in SMTP       |
| SendGrid             |     91 |       0 | 3 files; live and sandbox modes        |
| MongoDB              |     99 |       0 | 8 files; MongoDB 8.2.6 WiredTiger      |
| Packed, Node 26.12.1 |     12 |       0 | 2 tarball shapes × 4 peer profiles     |
| Packed, Node 24.0.0  |     12 |       0 | Same matrix; read-only reuse of `dist` |

The packed counts include eight installed app cases, one scratch test and three enclosing results. Both matrices
used pnpm 11.24.0, npm 11.20.0, TypeScript 6.0.3, Handlebars 4.7.10 and exact peer floors (Nodemailer 10.6.0,
Mongoose 9.12.2 with MongoDB driver 7.8.0). The 0.41.2 release helper staged a local tarball with the version
from `VERSION` (0.71.0); this did not exercise publishing. The packed tests checked the installed JSDoc in both
declaration formats, and the emitted comments were also inspected directly. Prettier on changed paths,
package ESLint (`--max-warnings=0`), tracked and untracked whitespace checks, and evidence links passed.

The two skipped SMTP cases are opt-in extended timing cases, already run and recorded in
[CAP-03 timing](cap-03-timing.md). The ordinary-tarball preflight on Node v26.12.1 also passed the neither and
both peer profiles before the unfiltered runs.

## Reproduce

Run from `<repo-root>` with installed workspace dependencies, a populated pnpm offline cache, a prepared local
MongoDB 8.2.6 binary, and Node v26.12.1. Use fresh ignored checkout-local scratch directories, verified with
`git check-ignore`, and run serially because both lanes use the same package `dist`:

```sh
export EMAIL_SERVICE_CONSUMER_OFFLINE=1 MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false
export MONGOMS_SYSTEM_BINARY='<absolute path to prepared mongod 8.2.6>'
unset SMTP_CAPACITY_TIMING NODE_TLS_REJECT_UNAUTHORIZED
export TMPDIR='<repo-root>/_tmp-cap04-canonical-<run-id>'
env -u EMAIL_SERVICE_CONSUMER_NODE pnpm --filter @web-ts-toolkit/email-service test

export TMPDIR='<repo-root>/_tmp-cap04-floor-<run-id>'
EMAIL_SERVICE_CONSUMER_NODE='<absolute path to Node v24.0.0>' \
  pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
```

The floor override runs the installed examples, runtime checks and TypeScript compiler under Node v24.0.0;
pnpm, `npm pack`, and the package test harness still run under Node v26.12.1. Allow at least 15 minutes for the
two serial commands together.

This report does not archive raw logs, database files, dependencies, executables, generated declarations or
tarballs. All message and connection fixtures are synthetic and local; no external SMTP or SendGrid requests.
