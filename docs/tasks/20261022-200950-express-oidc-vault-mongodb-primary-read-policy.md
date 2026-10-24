# Express OIDC Vault MongoDB Primary-Read Policy

Created: 2026-10-22 20:09:50 local (generated with `date +%Y%m%d-%H%M%S`).

## Objective and scope

Encapsulate the read preference required by
`@web-ts-toolkit/express-oidc-vault-mongodb-store` so callers can pass a connected
`Db` whose client/database defaults prefer secondaries without recreating vault
connection policy in every application.

This is the fifth request from the application-integration review. The four core
features are tracked in
[core application integration](20261022-200950-express-oidc-vault-app-integration.md).
Both tasks started **pending**. The source-only task-creation baseline below is
retained; OVMONGO-01's later runtime evidence and decision are recorded under its
task. OVMONGO-02 remains the separate production implementation.

Scope: existing store construction, collections, readiness reads, transactions,
authentication-state reads, regression fixtures, public operational documentation,
and installed-consumer compatibility. Keep client creation/connection/shutdown
caller-owned. Preserve the supplied database and collection namespaces.

Non-goals: a connection manager, automatic memory fallback, standalone transaction
emulation, write-concern/read-concern redesign, MongoDB-driver major upgrades,
Mongoose integration, sharded-topology certification, performance claims, or
general changes to the host application's read preference.

## Analysis coverage and baseline

Reviewed upstream revision: `33e434d`, root version `0.53.0`; the worktree was clean
before task creation. Inspected `src/store.ts`, `src/dpop-replay.ts`, options and
topology helpers, the README, package metadata, and selected replica-set tests.

The motivating external ABCLS consumer uses version `0.51.0`. In that repository's
`api-ts/auth/oidc-vault.ts`, `getOidcVaultStore` creates a separate `MongoClient`
with `readPreference: 'primary'` because the ordinary application connection
string may prefer secondaries. That reference is contextual, relative to the
external repository, and not an implementation dependency.

Current upstream observations:

- `MongoOidcVaultStore` retains `options.db` and creates collections from it without
  a store-owned read-preference override (`src/store.ts:132-167`).
- `getSession` uses the collection's inherited read policy (`:286-298`). Other
  preflight/cleanup reads also need an operation inventory.
- `getSessionRevocationContext` and inactive-alias cleanup specify snapshot read
  concern but no explicit transaction read preference (`:301-348,618-658`).
- Session rotation supplies no explicit transaction options (`:511-542`). Replay
  admission likewise specifies snapshot read concern only
  (`src/dpop-replay.ts:45-116`).
- Readiness already creates indexes, validates transaction-capable topology, and
  checks replay-capacity configuration. It is not a missing API.
- The inspected replica-set harness uses one member and a default-configured
  client (`test/mongo-memory.ts:31-43,67-90`); the DPoP peer client likewise uses
  default read preference (`test/dpop.test.ts:53-80`). Those fixtures do not
  establish behavior with a secondary-preferring caller or an actual secondary.

No runtime reproduction, build, package test, or live-provider baseline was run
for this plan. Inherited transaction failure, nontransactional routing, and the
smallest correct override boundary are questions for OVMONGO-01. Do not describe
source observations alone as proof of a particular production outage, stale
read, failover guarantee, or sharded-deployment behavior.

### Related work and deduplication

- [Original MongoDB remediation](20260813-185606-express-oidc-vault-mongodb-store-review-remediation.md):
  MDB-01/02 establish real replica-set testing and transaction-only rotation.
- [Store health follow-up](20260908-130120-oidc-vault-stores-health-follow-up.md)
  and [store business boundaries](20260927-103019-oidc-vault-store-business-boundaries.md):
  preserve ownership, alias cleanup, and provider consistency contracts.
- [Device-bound JWT work](20261002-125749-express-oidc-vault-device-bound-jwt.md),
  DBJWT-08: preserve guarded consumes and transactional replay capacity.

No dedicated caller-read-preference task was found in the inspected plans.
Primary reads are a targeted encapsulation improvement; the existing transaction,
readiness, expiry, and conflict protections are preservation requirements.

## Priority, coordination, and maintenance

- P1 denotes a reproduced integrity/availability defect; P2 denotes a contained
  correctness/portability improvement or bounded investigation. Start both tasks
  at P2 and update classification/priority only with evidence.
- Execute **OVMONGO-01 -> OVMONGO-02**. This document has no prerequisite on the
  core feature plan and can proceed independently of its initial core tasks.
- Complete OVMONGO-02 before
  [OVAPP-05](20261022-200950-express-oidc-vault-app-integration.md#task-ovapp-05-implement-shared-expiring-logout-ticket-storage)
  edits MongoDB ticket storage. That task must apply the resulting read policy
  to its new operations. This prevents shared `store.ts`/options/test conflicts;
  it does not add navigation tickets to this document's scope.
- The coordinated final review is
  [OVAPP-08](20261022-200950-express-oidc-vault-app-integration.md#task-ovapp-08-verify-integrated-contracts-and-consumer-simplification).
  OVMONGO-02 can finish its own acceptance/package checks without waiting for
  the core features; later shared changes require rerunning affected checks.
- Inspect current status/diffs before implementation. Preserve unrelated changes,
  caller-client ownership, and generated-output conventions. Serialize all
  build/test processes as required by `AGENTS.md`.
- Record the selected policy before implementation. A defer/no-action conclusion
  requires explicit revision of OVMONGO-02 and the cross-document dependencies;
  a cancelled prerequisite does not count as completed.
- Append changed paths, exact checks/results, and limitations before marking a
  task completed. Missing required prerequisites/checks keep it blocked. Public
  operational changes need shipped README/website migration notes; leave root
  `CHANGELOG.md` to the release workflow.

## Shared verification

Commands run from `<repo-root>` unless stated otherwise; replace placeholders
before execution. Prerequisites are installed workspace dependencies, supported
Node/pnpm, cached/downloadable `mongod`, loopback process support, and package
installation access for packed-consumer checks. Use disposable test databases
and the existing harness. Do not run failpoints or topology experiments against
an application database.

Provision an ignored repo-local `_tmp*` directory for tests using `os.tmpdir()`,
verify it with `git check-ignore`, set `TMPDIR` at runtime, and record only a
repo-scoped placeholder in evidence. Clean clients/sessions/servers/fixtures even
on failure. All build/test/packing commands run serially.

- **M1 - Focused reproduction/regressions.**
  `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store... build`, then
  from `packages/express-oidc-vault-mongodb-store` run
  `pnpm exec vitest run --config ../../vitest.config.ts test/<actual-file>.test.ts`.
  Extend the replica-set/command-monitoring harness as needed; record actual
  topology/member count, driver/server versions, options, and commands. A
  one-member replica set can exercise transaction-option errors, but cannot
  prove routing away from a live secondary or resistance to replication lag.
- **M2 - Package and shared-core integration.**
  `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test`, then
  `pnpm --filter @web-ts-toolkit/express-oidc-vault test`. These include existing
  conformance and packed-consumer checks; inspect any skips. Run after the
  implementation is coherent and rerun when later shared changes affect it.
- **M3 - Public surface and hygiene.** Extend the MongoDB packed-consumer fixture
  if the usage/typing contract changes. After builds, run
  `npm pack --dry-run --json` from the MongoDB package; inspect fresh declarations
  and README/website parity. Run targeted ESLint on changed TypeScript and
  `git diff --check` from the repository root. Run `pnpm build`, `pnpm lint`, and
  `pnpm test` at the coordinated OVAPP-08 integration gate, or before a separate
  release of this improvement. Record unresolved required checks as blockers.
- **M4 - Investigation/document evidence.** Review the operation/policy matrix,
  reproduction evidence, recommendation, compatibility notes, and task links.
  Task-file creation itself requires content/link/formatting checks, including
  `pnpm exec prettier --check <actual-task-file-paths>`, rather than runtime tests.

## Tasks

### Task OVMONGO-01: Establish read-preference inheritance and the override boundary

Status: completed

Kind: investigation

Priority: P2 - establish actual driver/topology behavior before changing store-wide policy.

Dependencies: none.

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/test/mongo-memory.ts` and a focused read-preference regression fixture.
- The operation/policy decision record appended to this task.
- Read-only inspection of store, replay, readiness, and driver option inheritance.

Finding:

Store collections and transactions can inherit caller configuration. The consumer
works around this with a separate primary-configured client, while inspected
tests use default-configured clients. Exact behavior differs between transaction
options and nontransactional collection reads and requires targeted evidence.

References:

- `packages/express-oidc-vault-mongodb-store/src/store.ts:132-167,286-348,511-542,618-658`.
- `packages/express-oidc-vault-mongodb-store/src/dpop-replay.ts:20-116`.
- `packages/express-oidc-vault-mongodb-store/src/topology.ts` (`assertTransactionSupport`).
- `packages/express-oidc-vault-mongodb-store/test/mongo-memory.ts` (client construction and one-member replica set).
- `packages/express-oidc-vault-mongodb-store/test/dpop.test.ts:53-80` (independent store clients).

Requirements:

1. Reproduce behavior with primary-default control clients and callers configured
   through client/URI and `Db` options as `secondaryPreferred` and `secondary`.
   Test readiness, session create/read, rotation, revocation context, deletion/
   alias cleanup, and replay reservation. Record exact failures or successful
   routing; do not assume every path fails or that all drivers inherit identically.
2. Inventory collection reads, administrative/readiness operations, implicit
   sessions, and explicit transactions. Determine which policy must be set on
   collections/operations and which must be explicit in `withTransaction`.
3. Use an actual secondary or deterministic operation evidence for read-routing
   claims. Separate read-your-write observations from broader consistency claims;
   primary selection alone does not promise linearizable reads or failover
   durability. Keep current read/write concerns unless separately justified.
4. Recommend the smallest internal primary-read policy that preserves database
   identity, custom names, caller client/Db defaults, and unrelated collection
   behavior. Consider existing readiness and future ticket reads. Identify any
   compatibility effect or operation that needs a documented exception.

Acceptance criteria:

- Append an operation matrix with configured/default/effective preference,
  observed behavior, topology/version evidence, and the selected override point.
- A meaningful regression reproduces the relevant inherited-policy failure or
  unintended routing before production changes, with a passing primary control.
  If the reported problem is disproved, record that result and revise follow-ups.
- The recommendation explicitly covers all current transaction call sites and
  authentication-state preflight/readiness reads without mutating caller options.
- No driver-version expansion, write-concern change, or multi-node consistency
  claim is implied by a narrower experiment.

Verification: M1 for the bounded experiment and M4 evidence review. Capture
expected pre-fix failures as reproduction evidence, not passing package checks.

Execution notes (OVMONGO-01 investigation):

- Sole assigned investigation owner; sequential execution, no nested agents.
  Read repository/task instructions, shared M1-M4, prior core evidence and the
  adopted OVAPP-04 ticket contract. Preserve the existing core worktree and both
  preexisting untracked task documents. Production implementation is OVMONGO-02.
- Environment reconfirmed: Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`.
  Inspecting actual installed driver inheritance/selection and disposable
  replica-set behavior before selecting the boundary. Builds/tests run serially.

#### OVMONGO-01 decision: implement collection and transaction primary boundaries

Recommendation: **implement OVMONGO-02**. The installed driver has two materially
different inheritance paths. Store-owned collection handles need
`readPreference: 'primary'` for ordinary reads; **all four** `withTransaction`
call sites also need explicit `readPreference: 'primary'`. Collection options
alone do not override the client's transaction preference. Transaction options
alone leave readiness and authentication-state preflight reads on secondaries.
No production policy change is part of this investigation.

##### Experiment and actual versions

- Base revision `33e434d`, with completed OVAPP-01/02/03 work and OVAPP-04's
  adopted contract present. Rechecked status on resumption; preserved that work
  and the unrelated skill-file deletion. No nested agents, commits or pushes.
- Linux x64; Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`, Vitest `4.1.11`.
  Package range is `mongodb: ^6.20.0`; **actual installed application driver is
  `6.21.0`**, not a claim about every version admitted by that range.
  `mongodb-memory-server` is `11.2.0`; actual `buildInfo.version` is **`8.2.6`**.
- Real `MongoMemoryReplSet`, **two data-bearing WiredTiger members**. Before the
  experiment, `replSetGetStatus` confirmed one PRIMARY and one SECONDARY;
  `serverStatus.storageEngine.name` confirmed `wiredTiger`. Command-started
  addresses are matched to those member addresses and reported only as `P`/`S`.
  This is evidence of actual routing, not an inference from a successful read.
- `getDefaultRWConcern` reported read concern `{ level: 'local' }` and write
  concern `{ w: 'majority', wtimeout: 0 }`. Store concerns were not changed.
  Rotation retains unset transaction concerns; revocation context, alias cleanup
  and replay retain their existing snapshot transaction read concern.
- Seven configurations: primary-default control; `secondaryPreferred` and
  `secondary` separately at URI, `MongoClient`, and `Db` levels. Caller clients
  use command monitoring, `serverSelectionTimeoutMS: 5000`, `timeoutMS: 10000`;
  each test has a 120-second cap. No application service/database is involved.
- Each case has an independent caller client and primary-configured setup
  client sharing a unique disposable database. Cold readiness uses unseeded
  collections. Subsequent inventory uses primary-seeded state and an explicit
  test-only majority-write/secondary-majority-read `afterClusterTime` barrier.
  That barrier makes setup visible without replication sleeps and is excluded
  from store-operation traces. It changes no store options or production concern.
- No mock/proxy replaces driver inheritance, sessions, server selection or
  transactions in this fixture. All observed store commands have `lsid`; only
  explicit transactions have `autocommit: false`/`startTransaction`. Logs expose
  session presence, never session identifiers. Implicit sessions do not turn
  independently issued secondary reads into a shared causal workflow.

##### Configured, inherited, and effective preference

`R` below means the configured mode, tested separately as `secondaryPreferred`
and `secondary`. Both modes selected the live secondary for inherited ordinary
reads in these runs. The primary control uses no preference option.

| Configuration                                              | Client default | Db / unoverridden collection default | Transaction default | Observed effective selection                                                              |
| ---------------------------------------------------------- | -------------- | ------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------- |
| Primary control                                            | primary        | primary                              | primary             | All store commands P; control workflows pass.                                             |
| URI `readPreference=R`                                     | R              | R                                    | R                   | Ordinary reads S; transaction reads rejected by driver; writes P.                         |
| `new MongoClient(uri, { readPreference: R })`              | R              | R                                    | R                   | Same as URI.                                                                              |
| `client.db(name, { readPreference: R })` on primary client | primary        | R                                    | primary             | Ordinary reads S; transaction reads/writes P and workflows succeed after readiness setup. |

Actual driver inspection, relative to
`packages/express-oidc-vault-mongodb-store/node_modules/mongodb/`:

- `src/db.ts` (`Db.readPreference`) and `src/collection.ts`
  (`Collection.readPreference`): collection -> Db -> client inheritance.
- `src/sessions.ts:408-421` (`ClientSession.startTransaction`): explicit
  transaction options -> session default transaction options -> client options;
  **the Db is not in that chain**.
- `src/utils.ts:530-575` (`resolveOptions`) and
  `src/read_preference.ts:151-180` (`ReadPreference.fromOptions`): operation
  options/session transaction preference are resolved before collection fallback.
  A transaction with a client-inherited R therefore defeats a primary collection
  fallback, while explicit primary transaction options defeat a secondary Db.
- `src/operations/operation.ts:73-85` (`AbstractOperation`): write-aspect operations
  force primary. `src/operations/execute_operation.ts:74-128` creates/ends implicit
  sessions and rejects non-primary transactional reads before sending them.
- `src/admin.ts:76-85` (`Admin.command`): passes only the command's explicit
  preference, otherwise defaulting to primary, rather than inheriting Db/client
  policy. Compiled `lib/admin.js`, `lib/read_preference.js` and `lib/sessions.js`
  were also inspected and agree with these packaged source implementations.

##### Evidence-backed operation matrix

References in this table are relative to
`packages/express-oidc-vault-mongodb-store/`. `T(R)` is exactly
`MongoTransactionError: Read preference in a transaction must be primary, not: secondaryPreferred`
or the corresponding message ending `secondary`. `T(R)` occurs in the driver,
not as a server rejection. The primary control passed every inventoried path.

| Operation / source boundary                                                                | Primary control                                                  | URI/client R                                                                                                        | Db-only R                                                  | Required override / action                                                                                  |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Index creation, `src/topology.ts:18-56`                                                    | 11 `createIndexes` commands P                                    | P, success                                                                                                          | P, success                                                 | Write aspect already forces P; retain indexes and concerns.                                                 |
| Topology readiness, `assertTransactionSupport`                                             | `hello` P                                                        | P, success                                                                                                          | P, success                                                 | Already primary in this driver; no additional override required for this admin command.                     |
| Replay readiness, `src/dpop-replay.ts:21`                                                  | `listIndexes` P                                                  | S; cold startup can fail with namespace-not-found                                                                   | S; same readiness risk                                     | Primary capacity-collection handle, including index inspection.                                             |
| Replay configuration upsert, `:26-38`                                                      | `update` P                                                       | P if index inspection completed                                                                                     | P if index inspection completed                            | Write already primary.                                                                                      |
| Replay configuration validation, `:42`                                                     | `find` P; ready succeeds                                         | S; cold startup can reject inconsistent/missing capacity                                                            | S; same failure, even with primary client                  | Primary capacity-collection handle.                                                                         |
| Session create; authorization/exchange creates, `src/store.ts:177-183,225-229,270-283`     | `update` P, success                                              | P, success after replicated readiness                                                                               | P, success after replicated readiness                      | Writes already primary; avoid describing all store paths as broken.                                         |
| `getAuthorizationTransaction`, `getExchangeCode`, `getSession`, `:201-207,247-253,286-298` | `find` P                                                         | S; seeded records returned successfully                                                                             | S; seeded records returned successfully                    | Primary authorization, exchange, and session collection handles.                                            |
| Expired session read/cleanup, `:661-670`                                                   | `find` P, conditional `delete` P, null                           | `find` S, `delete` P, null                                                                                          | Same as URI/client                                         | Primary read handle; keep conditional expiry deletion. Future fixture clock avoids relying on physical TTL. |
| Legacy and guarded authorization/exchange consumes, `:186-223,232-267`                     | `findAndModify` P, success                                       | P, success                                                                                                          | P, success                                                 | Write-aspect atomic consumes already select P; retain guarded filters/expiry.                               |
| Rotation preflight, `normalizeRotatedSession`                                              | Ordinary `find` P                                                | Ordinary `find` S, succeeds on seeded source                                                                        | Ordinary `find` S, succeeds                                | Primary session handle is needed even after fixing the transaction.                                         |
| Rotation transaction, `rotateSessionWithTransaction`                                       | `find`, `insert`, `delete`, alias `delete/update`, commit: P     | `T(R)` on first transactional `find`; no transactional command sent                                                 | All P, commit succeeds                                     | Explicit primary in this `withTransaction`; retain unset concerns and conflict checks.                      |
| Live and alias revocation context, `:301-348`                                              | Two/three `find`s + commit P; snapshot on first command          | `T(R)` before first `find` is sent                                                                                  | P; both contexts succeed                                   | Explicit primary transaction; primary session/alias handles also cover ordinary reads.                      |
| `deleteSession` session/alias preflight, `:377-404`                                        | One/two `find`s P                                                | One/two `find`s S                                                                                                   | One/two `find`s S                                          | Primary session and alias handles.                                                                          |
| Subject/provider-session enumeration, `deleteSessionsAndAliasesByFilter`                   | `find` P, delete and cleanup, final `find` P                     | Enumeration S; delete P then cleanup `T(R)`                                                                         | Enumeration S; delete/cleanup succeed, final enumeration S | Primary session handle plus explicit primary cleanup transaction.                                           |
| Session/lineage deletion followed by inactive-alias cleanup, `:406-411,618-658`            | Deletion P then snapshot `find`, alias `delete`, commit P        | Deletion P **commits before** cleanup `T(R)`                                                                        | Deletion and cleanup P, success                            | Explicit primary cleanup transaction; preserve post-deletion ordering and rejection semantics.              |
| Backchannel JTI first/duplicate/expired reuse, `:414-450`                                  | `findAndModify`/`insert` P; true/false/true                      | Same P outcomes                                                                                                     | Same P outcomes                                            | No additional write routing override required. Duplicate insert is caught as intended.                      |
| Replay reserve/duplicate, `src/dpop-replay.ts:45-116`                                      | Snapshot `findAndModify`, reads, writes and commit P; true/false | First capacity `findAndModify` is sent to P and starts transaction; next `find` throws `T(R)`; `abortTransaction` P | All P; true/false                                          | Explicit primary replay transaction; collection-only policy cannot repair this.                             |

Cold-readiness behavior is timing-dependent; the routing defect is not. In the
final full run's inventory, all six R cases rejected cold readiness: five with
`OIDC vault MongoDB replay capacity configuration/accounting is inconsistent.`
and client/secondaryPreferred with
`MongoServerError: ns does not exist: <test-db>.oidc_vault_dpop_replay_capacity`.
In that run's separate readiness regressions, Db/secondaryPreferred happened to
complete readiness but still failed the deterministic route assertion:
`hello/listIndexes/find` selected `[P, S, S]`, expected `[P, P, P]`. Therefore do
not require a particular race/error string to reproduce the readiness defect.
All seven replicated-readiness cases succeeded after the setup barrier.

The independent primary inspection after deletion confirmed the selected live
session was absent even when the R-configured caller's cleanup rejected. After
both failed replay attempts, URI/client R had **zero proof rows and capacity
entries 0**; primary/Db-only controls had one row and entries 1 after true/false
admission. These are observed partial-deletion and aborted-replay outcomes, not
a claim that every write fails or that a cleanup rejection confirms full logout.

##### Smallest correct boundary and compatibility handoff

The raw-driver boundary experiment tried inherited, collection-only,
transaction-only, and combined overrides for all seven configurations:

| Overrides                         | Ordinary read with caller R | Transaction with URI/client R     | Transaction with Db-only R |
| --------------------------------- | --------------------------- | --------------------------------- | -------------------------- |
| None                              | S                           | `T(R)`, no `find` sent            | P, success                 |
| Collection primary only           | P                           | Still `T(R)`, no `find` sent      | P, success                 |
| Explicit transaction primary only | Still S                     | P, snapshot read + commit succeed | P, success                 |
| Both                              | P                           | P, snapshot read + commit succeed | P, success                 |

OVMONGO-02 should apply `{ readPreference: 'primary' }` when creating store-owned
collection handles from the **supplied Db** and add primary to the four existing
`withTransaction` option objects/calls. The necessary ordinary-read roles today
are authorization transactions, exchange codes, sessions, rotated aliases, and
replay capacity. Applying one narrow collection factory/policy to all seven
store-owned roles is the smallest shared enforcement point; the JTI/proof roles
currently gain no additional write-routing behavior from that uniform policy.
Preserve snapshot concern on the three existing snapshot transactions and leave
rotation's other concern options unset. Keep `this.db` and client session ownership.

Do not reconfigure the caller client/Db, create a second client or replacement Db,
copy client settings into a new connection, or add preference flags to every
application call. Existing custom collection-name resolution and database identity
stay authoritative. The fixture checks Db/unrelated-collection preference
preservation and uses real independent clients; custom-name/bson/concern/tag option
preservation and unavailable-primary regressions still belong to OVMONGO-02.
When adding collection options, update any fault-injection proxy that currently
forwards only the collection name so it does not silently discard those options.

The admin `hello` path already meets the policy in the inspected driver: no extra
readiness client or global admin policy is needed. Explicit primary there is an
optional documentation-of-intent choice, not the missing fix. Atomic consumes,
ordinary writes and backchannel-JTI writes also already route primary; preserve
their semantics. There is no secondary-read exception for authentication state.

Operational compatibility changes: vault ordinary reads stop honoring caller
secondary preferences; an unavailable primary must produce the existing store
error rather than fall back to a secondary or memory. Unrelated collections keep
the caller's routing. This policy does **not** add linearizable read concern,
causal sessions across store calls, stronger write concern, failover durability,
or sharded-topology certification. No election, induced replication lag or primary
outage was tested. The barrier proves setup visibility only; member-address
monitoring proves routing. Readiness races above are observed without lag injection.

**OVAPP-05 future-operation handoff:** use the same collection policy for both
`logoutNavigationTicketsCollectionName` (default
`oidc_vault_logout_navigation_tickets`) and
`logoutNavigationCapacityCollectionName` (default
`oidc_vault_logout_navigation_capacity`). All ticket/ledger lookups, `listIndexes`,
paired-collection/maxEntries configuration reads and any liveness/collision/
expiry preflight reads need primary collection handles. Explicitly set primary
on **every create, consume and expiry-accounting/cleanup transaction**, including
write-first serialization-row transactions: the replay experiment shows that a
successful first write does not make the next inherited transaction read valid.
Keep the adopted payload TTL/non-TTL ledger, bounded cleanup/count atomicity,
existing concerns, collection-name isolation and caller-owned lifecycle. This
is guidance for the
[adopted OVAPP-04 contract](20261022-200950-express-oidc-vault-app-integration.md#ovapp-04-decision-implement-the-following-contract);
no ticket implementation or ticket runtime result is delivered here.

##### M1 execution evidence and remaining verification scope

Changed in OVMONGO-01 only:

- `packages/express-oidc-vault-mongodb-store/test/mongo-memory.ts`: opt-in two-member
  topology; one-member default retained; failed-connect/client/server cleanup.
- `packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts` (new):
  real routing/operation inventory, four-way raw-driver boundary experiment and
  ordinary fail-before OVMONGO-02 regressions. Assertions are not marked expected
  failures/skips to make the package appear green.
- This task document: evidence, decision and next-owner handoff.

Commands below were run serially; substitute the actual checkout for
`<repo-root>` before execution. Repo-root preparation and M1 dependency build:

```sh
ls -d . node_modules .bin && mkdir -p "_tmp-ovmongo01" && git check-ignore "_tmp-ovmongo01" && git rev-parse --short HEAD
TMPDIR='<repo-root>/_tmp-ovmongo01' pnpm --filter '@web-ts-toolkit/express-oidc-vault-mongodb-store...' build
```

Passed: core and MongoDB CJS/ESM/declaration builds. Server data/fixtures use the
ignored repo-local TMPDIR; the download directory below is likewise repo-local
(an already cached binary may be reused). All fixture clients/sessions close in
finally blocks and replica sets stop in teardown, including failing regressions.

M1, working directory `packages/express-oidc-vault-mongodb-store`:

```sh
TMPDIR='<repo-root>/_tmp-ovmongo01' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovmongo01/binaries' pnpm exec vitest run --config ../../vitest.config.ts test/read-preference.test.ts
TMPDIR='<repo-root>/_tmp-ovmongo01' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovmongo01/binaries' pnpm exec vitest run --config ../../vitest.config.ts test/read-preference.test.ts -t 'investigation operation inventory|driver boundary experiment' --disableConsoleIntercept --reporter=verbose
TMPDIR='<repo-root>/_tmp-ovmongo01' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovmongo01/binaries' pnpm exec vitest run --config ../../vitest.config.ts test/read-preference.test.ts --disableConsoleIntercept --reporter=dot
TMPDIR='<repo-root>/_tmp-ovmongo01' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovmongo01/binaries' pnpm exec vitest run --config ../../vitest.config.ts test/alias-cleanup.test.ts test/dpop.test.ts
```

- Initial full reproduction before the cold-readiness regression was added:
  **18 passed / 10 failed (28)**. Six actual-secondary routing assertions failed;
  four URI/client transaction workflows rejected. Primary controls passed.
- Focused observation run: **14 passed / 14 filtered skips (28)**. The skipped
  cases were the intentionally red regressions selected out with `-t`, not live
  MongoDB availability skips. `--disableConsoleIntercept` was needed to expose
  successful-case evidence that the default reporter did not print.
- Final expanded/post-format full reproduction: **19 passed / 16 failed (35),
  no skips**. All 14 inventory/boundary cases passed; the 21 ordinary regression
  cases had **five passes and 16 pre-fix failures**: six cold-readiness failures
  (including route assertions when readiness succeeds), six session-read routes
  `[S]` instead of `[P]`, four URI/client `MongoTransactionError` cases. The five
  passing regressions are all three primary controls and both Db-only transaction
  workflows. This is the required failing reproduction, **not a package pass**.
- Existing default-topology alias/replay fixtures: **two files / 42 passed**, no
  skips. This preserves evidence that normal primary-configured paths still work.
  No full package/core/packed-consumer or workspace-green claim is made.

Additional hygiene/type checks, working directory `<repo-root>`:

```sh
pnpm exec eslint packages/express-oidc-vault-mongodb-store/test/mongo-memory.ts packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts
pnpm exec prettier --check packages/express-oidc-vault-mongodb-store/test/mongo-memory.ts packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts
pnpm exec tsc --noEmit -p packages/express-oidc-vault-mongodb-store/tsconfig.json
pnpm exec tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --types node --ignoreDeprecations 6.0 packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts packages/express-oidc-vault-mongodb-store/test/mongo-memory.ts
```

ESLint, formatted fixtures and the targeted strict fixture typecheck passed.
The optional tsconfig-wide command **failed**, including on rerun: ES2018 lib
versus `Object.hasOwn`, Node16/CommonJS versus JOSE/import.meta and older BSON/test
typing errors in files outside this assignment. Initial new-fixture timestamp/
string-ID/import.meta typing issues were corrected; the rerun reports no errors
in either changed fixture. No broader typecheck success or pristine-baseline
claim is inferred. The supported package build above passed. The existing Vite
future-native-loader advisory was non-failing. M2/package/installed-consumer and
M3 public-surface checks remain OVMONGO-02/OVAPP-08 work, not missing OVMONGO-01
investigation prerequisites.

Completion evidence (M4 and cleanup, 2026-10-23):

- Reviewed the configuration/operation/boundary matrices against the actual
  command traces, driver source, all four transaction sites and the adopted
  ticket contract. Existing local task links resolve; OVAPP-04 decision,
  OVAPP-05 storage, OVAPP-08 integration and OVMONGO-02 anchors match their
  headings. Dependencies remain acyclic; OVMONGO-02 still gates MongoDB ticket
  implementation. No unresolved OVMONGO-01 decision or required check remains.
- Task/fixture formatting and whitespace checks, working directory `<repo-root>`:

  ```sh
  pnpm exec prettier --check docs/tasks/20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  git diff --check
  git diff --no-index --check -- /dev/null packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts
  git diff --no-index --check -- /dev/null docs/tasks/20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md
  ```

  Passed after applying formatter whitespace/table-padding diffs with apply_patch.
  No-index checks include the new fixture and preexisting untracked task file;
  the core task file is preserved. Evidence contains no machine-local absolute
  paths or private session identifiers. Final status/diff review is scoped to
  the three changed paths listed above; unrelated work is preserved.

- Teardown left only the Node compile cache in the ignored temporary directory,
  with no remaining MongoDB data/fixture directories. From `<repo-root>`,
  `ls -d . "_tmp-ovmongo01" && git check-ignore "_tmp-ovmongo01" && rm -rf -- "_tmp-ovmongo01"`
  removed that remaining investigation scratch directory. All clients and replica
  sets were closed/stopped by fixture teardown, including the failing test run.
- OVMONGO-01 is **completed as an investigation** with an implement decision and
  reproducible red regressions. **OVMONGO-02 remains pending** for the next fresh
  assigned owner. Its first action is the two-boundary policy above, followed by
  M1 pass-after, M2/M3 and M4; extend regression coverage to the remaining matrix
  and caller/custom-option preservation rather than treating this red run as a
  green package result. No production or ticket implementation is delivered here.

### Task OVMONGO-02: Encapsulate the primary-read policy

Status: completed

Kind: improvement

Priority: P2 - removes application-specific connection workarounds while preserving store correctness.

Dependencies: OVMONGO-01 and its concrete implement recommendation.

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/src/store.ts` and `src/dpop-replay.ts`.
- Narrowly necessary options/topology/read-policy helpers and regression fixtures.
- MongoDB README/public JSDoc, `website/docs/packages/express-oidc-vault-mongodb-store.md`, and packed-consumer coverage.

Finding:

The store should establish the read policy necessary for its own operations
instead of requiring every application to create a separate primary-configured
client. OVMONGO-01 supplies the observed failure/routing evidence and selected
enforcement boundary; this task must follow that evidence.

References:

- OVMONGO-01's completed operation matrix and regressions.
- `packages/express-oidc-vault-mongodb-store/src/options.ts` (caller ownership and readiness contract).
- `packages/express-oidc-vault-mongodb-store/README.md` (Startup And Client Ownership; Device-Binding Store Capabilities; Per-Request DPoP Replay).
- `packages/express-oidc-vault-mongodb-store/test/packed-consumer.test.ts`.

Requirements:

1. Apply the selected primary policy at store-owned collection/operation and
   transaction boundaries, including readiness and nontransactional preflight
   reads identified by OVMONGO-01. Avoid repetitive application-facing wrappers.
2. Do not modify/close the supplied client, mutate caller configuration, create a
   second client, alter unrelated collections, or select another database.
   Preserve existing read/write concerns, atomicity, expiry cleanup, conflict
   behavior, lineage authority, replay capacity, and transaction-only topology.
3. Document the override as an operational contract, its effect on callers that
   prefer secondaries, and the scope of consistency guarantees. Keep `ready()`
   and fail-closed backend-error behavior. Primary unavailability must not silently
   select a secondary or memory backend for an operation requiring primary.
4. Add regressions for URI/client and Db-level defaults, independent clients,
   representative state transitions, caller-option preservation, and the
   remaining operation matrix. Reuse the actual-secondary evidence strategy;
   avoid timing-sensitive replication-sleep assertions.
5. Give OVAPP-05 a concise handoff explaining how new MongoDB ticket collections,
   reads, and transactions inherit the policy. Changes to ticket storage remain
   owned by that task. The selected
   [OVAPP-04 contract](20261022-200950-express-oidc-vault-app-integration.md#ovapp-04-decision-implement-the-following-contract)
   adds `logoutNavigationTicketsCollectionName` and
   `logoutNavigationCapacityCollectionName` (defaults
   `oidc_vault_logout_navigation_tickets` and
   `oidc_vault_logout_navigation_capacity`). Include their readiness/configuration
   reads and create/consume/expiry-accounting transactions in the policy handoff;
   preserve existing concerns and caller ownership. This is future-operation
   guidance, not a new prerequisite or ticket implementation in OVMONGO-02.

Acceptance criteria:

- A supported secondary-preferring caller can await readiness and perform the
  covered session/rotation/revocation/replay workflows without an extra client or
  per-operation application override; OVMONGO-01's regression passes after changes.
- All inventoried reads/transactions follow the selected policy, with evidence
  for routing/transaction options rather than incidental single-node success.
- Caller options/Db namespace and unrelated collection behavior remain unchanged;
  the caller can continue using and later close its client normally.
- Existing standalone rejection, alias cleanup, concurrent rotation, duplicate
  replay, capacity, and failure rollback tests pass. Required-primary failure
  remains a store error rather than a successful authentication-state operation.
- Public declarations/examples and migration notes agree; required package and
  installed-consumer checks pass, and coverage limitations are recorded.

Verification: M1 fail-before/pass-after regressions, M2, M3, and M4. Subsequent
OVAPP-05 edits invalidate affected MongoDB evidence and must rerun relevant checks.

Execution notes (OVMONGO-02 implementation):

- Sole fresh implementation owner; OVMONGO-01 is completed with the concrete
  two-boundary recommendation. Read its evidence/matrices and the adopted
  OVAPP-04/05 contract before starting. Preserve prior core changes, both task
  documents, the red read-preference fixture and the unrelated skill deletion.
  Only OVMONGO-02 advances status; no nested agents, commits/pushes or changelog edits.
- Environment reconfirmed: Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`, base
  revision `33e434d`. All builds/tests/packing will run serially with ignored
  repository-local TMPDIR and fixture/client/server cleanup.
- Selected implementation: one internal primary collection factory applied to all
  seven store-owned roles on the supplied Db, and explicit primary on rotation,
  revocation-context, inactive-alias cleanup and replay transactions. Retain the
  three existing snapshot concerns and rotation's otherwise-unset concerns.
  Extend the real-secondary regressions, installed consumers and operational
  README/JSDoc/website guidance; ticket persistence remains OVAPP-05 work.
- First expanded M1: all 35 original cases passed; three new fixture cases failed.
  Corrected concern expectations (transaction concerns inherit from the client,
  not Db; CSOT strips wire `wtimeout`), strict Db ReadConcern typing, and the
  outage setup. Graceful primary shutdown can hand off primary, so the outage
  fixture now crashes only its owned process, awaits exit, and clears the
  memory-server stale process reference before normal cleanup. Corrected M1:
  **38 passed**, no skips.
- First M2: **183 passed / two failed (185), seven files**. Both failures were
  `MongoWriteConcernError` code 11602 (`InterruptedDueToReplStateChange`) during
  new two-member fixture setup/readiness, before the intended assertions. The
  memory-server default election timeout is 500ms; concurrent package fixtures
  can trigger an election under load. Updating only opt-in multi-member harnesses
  to MongoDB's normal 10000ms election timeout and awaiting all members' actual
  PRIMARY/SECONDARY states before handing out the fixture. No product retry,
  concern change, skip or broadened packed-consumer retry is added.

#### OVMONGO-02 completion and OVAPP-05 policy handoff

Delivered policy:

- `src/read-policy.ts` provides internal `primaryCollection<T>(db, name)`;
  `src/store.ts` uses it for all seven roles, retaining the exact supplied Db and
  resolved names. Ordinary authentication/preflight, alias/liveness and replay
  readiness `listIndexes`/configuration reads now select primary.
- All four existing `withTransaction` boundaries explicitly set
  `readPreference: 'primary'`: rotation, revocation context, inactive-alias cleanup
  and DPoP replay. The three snapshot concerns remain; rotation still inherits
  other transaction concerns from the client. No concern, namespace, client,
  fallback, expiry, generation/conflict, deletion-order or atomicity redesign.
- OVMONGO-01's operation inventory is now an asserted pass-after matrix for every
  configuration, including immediate create/read without a replication barrier
  between store calls. Its raw-driver four-way experiment remains intact. The
  21 original readiness/read/transaction regressions all pass; no expected-failure
  markers or availability skips hide the original 16 failures.
- Two new caller-preservation cases cover all seven custom names, unchanged
  caller Db/client preferences (including tags and max staleness), BSON Long and
  ignoreUndefined behavior, read/write concern inheritance, unrelated reads on
  the real secondary, and independently started caller transaction defaults.
  The caller remains usable and owns shutdown. A separate two-voter fixture
  crashes its primary process and verifies get/rotation/revocation/replay and cold
  readiness fail, with no authentication-state commands sent to the surviving
  secondary; unrelated caller reads still succeed there. This is an unavailable-
  primary check, not a failover-durability experiment.
- Fault-injection collection proxies now forward collection options rather than
  silently dropping the primary policy. Existing alias/concurrency, standalone,
  conformance, expiry, capacity and rollback suites pass with the real policy.
- Shipped README, factory/options/provider JSDoc and website explain primary
  routing, connection reuse/migration, caller ownership, unavailable-primary
  errors and limited consistency guarantees. Fresh CJS/ESM declarations retain
  the same public exports; the collection helper is internal.

Changed paths (all abbreviated `src/`, `test/`, `test-packed-consumer/` paths in
this list are relative to `packages/express-oidc-vault-mongodb-store`):

- `src/read-policy.ts` (new), `src/store.ts`, `src/dpop-replay.ts`, `src/index.ts`,
  `src/options.ts`.
- `test/read-preference.test.ts` (extended existing untracked OVMONGO-01 fixture),
  `test/mongo-memory.ts`, `test/index.test.ts`, `test/alias-cleanup.test.ts`,
  `test/dpop.test.ts`, `test/input-ownership.test.ts`, `test/packed-consumer.test.ts`,
  `test-packed-consumer/consumer/read-policy.mjs` (new).
- `packages/express-oidc-vault-mongodb-store/README.md`,
  `website/docs/packages/express-oidc-vault-mongodb-store.md`, this task document,
  and the OVAPP-05 handoff in
  `docs/tasks/20261022-200950-express-oidc-vault-app-integration.md`.

Completion evidence (2026-10-23, sequential uncommitted worktree at `33e434d`):

- Actual environment: Linux x64, Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`,
  tsup `8.5.1`, TypeScript `6.0.3`, Vitest `4.1.11`. Real two-data-bearing-member
  WiredTiger replica sets; application and installed-consumer driver `6.21.0`,
  memory-server `11.2.0`, server `8.2.6`. Initial server defaults remain local read
  concern and majority write concern (`wtimeout: 0`). Final opt-in multi-member
  harness uses `electionTimeoutMillis: 10000`, confirms PRIMARY/SECONDARY states,
  and retains the test-only majority-write/secondary-majority afterClusterTime
  setup barrier. One-member fixtures retain their original election settings.
  No test uses a replication sleep as a read-routing assertion.
- M1 build and temporary-directory preparation, working directory `<repo-root>`:

  ```sh
  ls -d . node_modules .bin && node --version && pnpm --version && npm --version && git rev-parse --short HEAD
  mkdir -p "_tmp-ovmongo02" && git check-ignore "_tmp-ovmongo02" && TMPDIR='<repo-root>/_tmp-ovmongo02' pnpm --filter '@web-ts-toolkit/express-oidc-vault-mongodb-store...' build
  ```

  Passed core/Mongo CJS/ESM/declaration builds; temporary directory is ignored.

- M1 commands, working directory `packages/express-oidc-vault-mongodb-store`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovmongo02' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovmongo02/binaries' pnpm exec vitest run --config ../../vitest.config.ts test/read-preference.test.ts --reporter=dot
  TMPDIR='<repo-root>/_tmp-ovmongo02' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovmongo02/binaries' pnpm exec vitest run --config ../../vitest.config.ts test/read-preference.test.ts -t 'preserves custom namespaces|actual primary outage' --reporter=verbose --disableConsoleIntercept
  TMPDIR='<repo-root>/_tmp-ovmongo02' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovmongo02/binaries' pnpm exec vitest run --config ../../vitest.config.ts test/read-preference.test.ts -t 'actual primary outage' --reporter=verbose --disableConsoleIntercept
  TMPDIR='<repo-root>/_tmp-ovmongo02' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovmongo02/binaries' pnpm exec vitest run --config ../../vitest.config.ts test/read-preference.test.ts --reporter=dot --silent
  ```

  Initial full run: **35 passed / three new fixture failures**. Focused new cases:
  two passed / one graceful-handoff failure / 35 filtered skips. First crash-only
  outage run exposed memory-server cleanup's stale exited-process reference;
  corrected rerun: one passed / 37 filtered skips. Final full focused run:
  **38 passed, no skips**. The final harness adjustment is additionally verified
  by the subsequent complete MongoDB package run below.

- M2 commands, working directory `<repo-root>`, executed separately and serially:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovmongo02' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovmongo02/binaries' pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test
  TMPDIR='<repo-root>/_tmp-ovmongo02' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovmongo02/binaries' pnpm --filter @web-ts-toolkit/express-oidc-vault test
  ```

  MongoDB first run: **183 passed / two setup-election failures**, detailed above.
  Corrected final MongoDB run: **seven files / 185 passed**, no skips. Includes
  all 38 routing/preservation/outage cases, standalone rejection, real concurrent
  rotation/alias/guarded consumes/replay capacity and failure rollback. Core:
  **39 files / 2233 passed**, no skips, preserving OVAPP-01/02/03 integrations.
  Both scripts rebuilt dependencies serially.

- Installed-consumer coverage within MongoDB M2: release-transformed tarballs,
  actual ESM and CJS runtimes on two members with independent clients, URI/client
  secondary defaults and Db-level secondary defaults, command-address primary
  assertions for vault readiness/reads/transactions, guarded consumes, rotation,
  alias cleanup, duplicate/capacity replay and unrelated secondary routing.
  Strict NodeNext ESM/CJS and Bundler declaration compilation passed, as did the
  installed quick start and new read-policy example. The packed fixture checks
  byte-identical README/website policy text. Seven release-stage files, including
  LICENSE, are verified by the existing packing contract. No workspace-source
  import substitutes for an installed runtime. Only Node `v26.10.0` was exercised.

- M3 pack/declaration review, working directory
  `packages/express-oidc-vault-mongodb-store`:

  ```sh
  npm pack --dry-run --json
  ```

  Passed: six intended workspace-package files (README, package manifest, four
  built JS/declaration entries), no bundled dependencies. Inspected fresh
  `dist/index.d.ts` and `dist/index.d.mts`: matching public JSDoc/exports, no
  helper/internal export or handwritten generated change.

- Final strict fixture typecheck, targeted ESLint and formatting, working
  directory `<repo-root>`:

  ```sh
  pnpm exec tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --types node --ignoreDeprecations 6.0 packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts packages/express-oidc-vault-mongodb-store/test/mongo-memory.ts
  pnpm exec eslint packages/express-oidc-vault-mongodb-store/src/read-policy.ts packages/express-oidc-vault-mongodb-store/src/store.ts packages/express-oidc-vault-mongodb-store/src/dpop-replay.ts packages/express-oidc-vault-mongodb-store/src/options.ts packages/express-oidc-vault-mongodb-store/src/index.ts packages/express-oidc-vault-mongodb-store/test/mongo-memory.ts packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts packages/express-oidc-vault-mongodb-store/test/index.test.ts packages/express-oidc-vault-mongodb-store/test/alias-cleanup.test.ts packages/express-oidc-vault-mongodb-store/test/dpop.test.ts packages/express-oidc-vault-mongodb-store/test/input-ownership.test.ts packages/express-oidc-vault-mongodb-store/test/packed-consumer.test.ts packages/express-oidc-vault-mongodb-store/test-packed-consumer/consumer/read-policy.mjs
  pnpm exec prettier --check packages/express-oidc-vault-mongodb-store/src/read-policy.ts packages/express-oidc-vault-mongodb-store/src/store.ts packages/express-oidc-vault-mongodb-store/src/dpop-replay.ts packages/express-oidc-vault-mongodb-store/src/options.ts packages/express-oidc-vault-mongodb-store/src/index.ts packages/express-oidc-vault-mongodb-store/test/mongo-memory.ts packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts packages/express-oidc-vault-mongodb-store/test/index.test.ts packages/express-oidc-vault-mongodb-store/test/alias-cleanup.test.ts packages/express-oidc-vault-mongodb-store/test/dpop.test.ts packages/express-oidc-vault-mongodb-store/test/input-ownership.test.ts packages/express-oidc-vault-mongodb-store/test/packed-consumer.test.ts packages/express-oidc-vault-mongodb-store/test-packed-consumer/consumer/read-policy.mjs docs/tasks/20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  git diff --check
  git diff --no-index --check -- /dev/null packages/express-oidc-vault-mongodb-store/src/read-policy.ts
  git diff --no-index --check -- /dev/null packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts
  git diff --no-index --check -- /dev/null packages/express-oidc-vault-mongodb-store/test-packed-consumer/consumer/read-policy.mjs
  ```

  Passed. Initial formatting findings in six changed code files were corrected
  with apply_patch. The first extended strict fixture typecheck required a native
  `ReadConcern` for Db options; corrected and final runs pass. The optional
  tsconfig-wide failure recorded under OVMONGO-01 was not rerun or treated as a
  green baseline; no unrelated code was changed to conceal it.

**OVAPP-05 handoff:** import internal `primaryCollection` from `src/read-policy.ts`
for both new ticket roles on the supplied Db:
`logoutNavigationTicketsCollectionName` (default
`oidc_vault_logout_navigation_tickets`) and
`logoutNavigationCapacityCollectionName` (default
`oidc_vault_logout_navigation_capacity`). This covers payload/ledger lookups,
`listIndexes`, paired-collection/maxEntries validation and liveness/collision/
expiry preflight. Explicitly pass `readPreference: 'primary'` to **every create,
consume and expiry-accounting/cleanup transaction**, including a write-first
serialization-row transaction; primary collections alone cannot override its
client-inherited transaction preference. Retain the adopted payload TTL/non-TTL
ledger, bounded cleanup/count atomicity, current concerns, collection isolation
and caller lifecycle. Extend these same secondary-preferring/installed fixtures
and rerun affected M1/M2/M3 checks after adding operations. No ticket storage is
implemented here; OVAPP-05 remains pending and its other prerequisites stand.

- M4 review passed: checked all seven collection roles and four transaction
  boundaries against OVMONGO-01's matrix, guarded/expiry/conflict/replay behavior,
  emitted declaration JSDoc, migration/website parity, caller ownership and the
  adopted OVAPP-04 ticket contract. An ignored temporary validation script checked
  **nine MongoDB-task and 15 core-task local links/anchors**, plus absence of
  machine-local absolute paths and private session identifiers. Commands, working
  directory `<repo-root>`:

  ```sh
  node _tmp-ovmongo02/check-task-links.mjs
  pnpm exec prettier --check docs/tasks/20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  git diff --check
  git diff --no-index --check -- /dev/null docs/tasks/20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md
  git diff --no-index --check -- /dev/null docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  ```

  Passed. No-index checks include both preexisting untracked task documents.
  Only OVMONGO-02 advances from in_progress to completed; earlier completion
  evidence/statuses and the unrelated core/skill-file changes are preserved.

- Cleanup: all clients/sessions/servers closed by teardown, including failed
  iterations. Process check `pgrep -af '[_]tmp-ovmongo02|[m]ongo_killer.js'` returned
  no matches (exit 1). Inspection found only the compile cache, the temporary
  link-check script and a stopped failed-iteration MongoDB data directory. From
  `<repo-root>`, the following removed the entire ignored scratch directory:

  ```sh
  ls -d . "_tmp-ovmongo02" && git check-ignore "_tmp-ovmongo02" && rm -rf -- "_tmp-ovmongo02"
  ```

  No unresolved M1/M2/M3/M4 check remains. OVAPP-05 is ready for its next assigned
  owner, with OVAPP-03/04 and OVMONGO-02 prerequisites satisfied.

Limitations: selected driver/server/runtime only, no induced replication-lag or
linearizability proof, successful election/recovery, failover/restore durability,
sharded certification or throughput claim. Primary selection does not establish
cross-call causal sessions or stronger concerns. Vite's existing native-loader
advisory remains non-failing. Full-workspace `pnpm build`, `pnpm lint`, `pnpm test`
and independent integrated review remain OVAPP-08; no pristine-baseline or wider
optional-typecheck pass is claimed.

Coordinated independent integration evidence (OVAPP-08, 2026-10-23):

- The fresh independent reviewer checked the delivered primary collection factory,
  all nine collection roles and original/ticket transaction boundaries against
  OVMONGO-01's matrix and OVAPP-04's adopted ticket contract. Caller Db/client
  ownership, namespace/concern inheritance and unavailable-primary fail-closed
  behavior remain intact. No substantive production defect was established.
- The first root integration run exposed a fixture-only readiness timeout in
  `test/read-preference.test.ts`: the actual-outage client's 2000-ms CSOT also
  covered index creation, and `Collection.createIndex` timed out before the
  primary crash. OVAPP-08 changed that test's operation budget to the normal
  10000 ms while retaining 1000-ms primary selection and every real-outage/routing
  assertion. No product timeout, retry, read/write concern or policy changed.
- Subsequent complete MongoDB package executions passed **eight files / 246
  tests**, including actual-secondary routing, all nine custom names, new ticket
  operations, real primary outage, rollback/concurrency and release-transformed
  installed ESM/CJS/strict consumers. Final root `pnpm build`, `pnpm lint` and the
  complete serial `pnpm test` pass with the integrated core/provider/client work.
  MongoDB package dry-run packing also passes (six intended workspace files).
- Exact commands, earlier failed/interrupted attempts, final counts, review
  attribution, limitations and cleanup are recorded in
  [OVAPP-08 independent integration evidence](20261022-200950-express-oidc-vault-app-integration.md#ovapp-08-fresh-verification-evidence).
  Existing OVMONGO-01/02 completion records and statuses are preserved.

## Definition of done

OVMONGO-01 has an evidence-backed decision; OVMONGO-02 implements it with the
required regressions and package/consumer checks. Documentation states the
policy without overstating consistency guarantees. The core plan receives the
new-operation handoff and verifies combined behavior at OVAPP-08. Missing required
evidence remains a recorded blocker, not a completed task.
