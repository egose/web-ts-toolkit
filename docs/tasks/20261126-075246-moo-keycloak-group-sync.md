# Moo: Keycloak group sync

Created: 2026-11-26 (`20261126-075246`, generated with `date +%Y%m%d-%H%M%S`).

Status: completed — KGS-01 through KGS-03 implemented and verified sequentially.

## Objective

Add `keycloakGroupSyncPlugin` to `@web-ts-toolkit/moo`. An application org document
is the source of truth for a Keycloak realm group and its desired subgroups.
For example, saving `apple` provisions `/apple`, `/apple/admin`, and
`/apple/member`. The app can define the entire role tree in code without adding
a `roles` field to its org schema.

The first release covers additive group provisioning and description updates.
Group and membership removal, user assignments, realm/client role grants, native
Keycloak Organizations, rename/reparenting, and bundled outbox delivery are out
of scope. Removing a role or deleting an org locally leaves remote groups and
their memberships available for explicit cleanup.

## Proposed API and storage

```ts
import type KeycloakAdminClientFluent from '@egose/keycloak-fluent';
import { Schema } from 'mongoose';
import { keycloakGroupSyncPlugin } from '@web-ts-toolkit/moo/plugins/keycloak-group-sync';

declare const keycloak: KeycloakAdminClientFluent; // Application-supplied managed client.

const orgSchema = new Schema({
  slug: { type: String, required: true, unique: true, immutable: true },
  description: String,
  keycloak: {
    groupId: String,
    roleGroupIds: { type: Map, of: String },
  },
});

orgSchema.plugin(keycloakGroupSyncPlugin, {
  client: keycloak,
  realm: 'application',
  paths: {
    name: 'slug',
    description: 'description',
    providerId: 'keycloak.groupId',
    roleGroupIds: 'keycloak.roleGroupIds',
  },
  roles: [
    { name: 'admin', description: 'Organization administrators' },
    'member',
    {
      name: 'engineering',
      description: 'Engineering team',
      children: [
        { name: 'admin', description: 'Engineering administrators' },
        { name: 'platform', children: ['maintainer'] },
      ],
    },
  ],
});
```

- `paths.name` reads a stable org slug. `paths.providerId` stores the root group's
  ID. `paths.roleGroupIds` stores every subgroup ID, including intermediate
  groups, in a flat map. For `apple`, the keys above are `admin`, `member`,
  `engineering`, `engineering/admin`, `engineering/platform`, and
  `engineering/platform/maintainer`. `org.keycloak.roleGroupIds.get('engineering/admin')`
  returns the Keycloak ID for `/apple/engineering/admin`.
- Use exactly one source: a fixed `roles` array or `paths.roles` pointing to an
  array on the org document. Both use the same recursive format: a string is
  shorthand for `{ name }`; objects require `name` and can specify `description`
  and `children`. Strings and objects can be mixed at any level. An empty tree
  or an absent document-backed list provisions only the root. A custom
  `mapRoles` callback can be considered later.
- Optional `paths.description` maps the root's native Keycloak description from
  Mongoose. Each subgroup object can set its own native `description`. A missing
  description leaves any existing remote description intact. A change to a
  supplied description updates the group in place.
- A post-`save()` hook reconciles the current desired tree, including on a repeat
  save with unchanged input after a partial failure. Changing a fixed catalog
  requires saving existing orgs in an application-run backfill to apply it; the
  config change alone triggers no saves.

## Starting point and baseline

- [User-sync plugin](../../packages/moo/src/plugins/keycloak-user-sync.ts) is the
  precedent for a managed client, authoritative persisted IDs, and direct
  non-atomic hooks. Its role mappings are realm-wide; group provisioning is a
  separate feature. [The user-sync remediation](20260820-125218-moo-keycloak-user-sync-review-remediation.md)
  documents the hook and identity constraints. There is no existing Moo group
  plugin or overlapping task plan.
- The installed `@egose/keycloak-fluent@0.14.0` exposes `GroupHandle.childGroup()`
  and further nesting, and its installed admin-client `GroupRepresentation` has
  `description`. The existing `ensure()` implementation can update a group found
  by name; the new plugin must verify ownership before taking that path.
- [Moo package metadata](../../packages/moo/package.json) declares the optional
  peer `@egose/keycloak-fluent >=0.12.1 <0.15.0`. The existing packed-consumer
  matrix covers the user plugin at the floor and current version. The group APIs
  needed by this task still need compatibility verification at the floor.
- Planning inspected source, installed client types and group implementation,
  and the existing MongoDB and packed-consumer test entry points. The worktree
  was clean before creating this file. No build, tests, or live Keycloak
  operations were run for this planning document.

### Implementation notes

- The published `@egose/keycloak-fluent@0.12.1` declarations expose `client.core`,
  group lookups and nested group handles, and declare the same
  `@keycloak/keycloak-admin-client ^26.5.7` dependency as `0.14.0`. This checks the
  declared API only; the packed-consumer check is still part of KGS-03.
- Keycloak `26.5.7`'s [root](https://github.com/keycloak/keycloak/blob/26.5.7/services/src/main/java/org/keycloak/services/resources/admin/GroupsResource.java)
  and [child](https://github.com/keycloak/keycloak/blob/26.5.7/services/src/main/java/org/keycloak/services/resources/admin/GroupResource.java)
  create endpoints return a conflict for existing siblings when the payload
  omits `id`. Supplying an `id` is a move path. Apply description changes to the
  verified group through `PUT /groups/{id}` with its current `name` and the
  desired `description`; omitting `attributes` preserves them. This is source
  inspection, not live-server verification.
- A Node probe from `packages/moo` against the installed managed client with
  mocked `fetch` confirmed lazy authentication, the ID from a root create's
  Location header, `error.response.status` on child-create conflicts, group
  lookup by ID, and the description PUT payload. No live server was used.

## Tasks

P1 is the core contract and runtime behavior. P2 is packaging and consumer
verification after the runtime is ready. Both are required to finish.

### Task KGS-01: Define and validate the group sync configuration

Status: completed. Kind: improvement. Priority: P1 — the shape and keys determine
which groups are reconciled. Dependencies: none.

Primary ownership: `packages/moo/src/plugins/keycloak-group-sync.ts`, private
configuration/planning code if needed, and focused configuration tests.

Finding: the existing [`KeycloakUserSyncPluginOptions`](../../packages/moo/src/plugins/keycloak-user-sync.ts#L98)
maps a flat list of realm roles, so it cannot describe groups at multiple depths
or attach descriptions to individual nodes.

Requirements:

1. Type and validate the recursive roles format and the dotted Mongoose paths.
   Require string paths for the name and root ID and a `Map` of strings for the
   subgroup IDs. Check optional paths, validate role sources, and snapshot the
   fixed configuration on registration. Static roles require no schema role path.
2. Plan parent-first using org-relative path keys. Validate the complete desired
   tree before any Keycloak writes. Reject ambiguous paths (including `/` inside
   a group name), invalid Mongoose map keys, duplicate siblings, and cyclic or
   oversized trees. Define and document finite depth and group-count limits.

Acceptance criteria: the example compiles and produces all six relative keys;
`admin` and `engineering/admin` are distinct. A doc-backed tree has the same
shape. Invalid inputs fail without remote writes, and changes to the input
options after plugin registration do not change the fixed tree.

Verification: configuration cases in the Moo package tests and source typecheck
below.

Completion evidence:

- Added `packages/moo/src/plugins/keycloak-group-sync.ts`, its `planner.ts`, and
  `packages/moo/test/keycloak-group-sync-planner.test.ts`. The public options
  enforce one role source. The planner supports 16 levels and 500 subgroups,
  preserves on missing description, and treats `''` as a request to clear.
- `normalizeKeycloakGroupSyncOptions()` captures the immutable configuration.
  `planKeycloakGroups(config, leanDocument)` returns the validated org group and
  parent-first role groups with `key` and `parentKey`. A `null` `parentKey`
  identifies a direct child of the org root.
- Verified from the repo root: the Moo-filtered Vitest planner run passed
  56/56 (also rerun by the coordinator); the Moo source and strict NodeNext
  planner-test typechecks, package ESLint, and changed-file Prettier passed.
  pnpm was run with `--config.verify-deps-before-run=false` using installed
  dependencies after the default auto-install stopped at the workspace's
  build-approval gate. No workspace-wide tests ran.

### Task KGS-02: Reconcile owned groups and persist their IDs on save

Status: completed. Kind: improvement. Priority: P1 — required for org isolation and
recovery from partially successful saves. Dependencies: KGS-01.

Primary ownership: `packages/moo/src/plugins/keycloak-group-sync.ts`, its
reconciliation code, and `packages/moo/test/keycloak-group-sync-plugin.test.ts`.

Finding: [user sync's save hooks](../../packages/moo/src/plugins/keycloak-user-sync.ts#L921-L954)
run Keycloak changes after MongoDB persistence. A group tree can be partially
created or updated before either system reports an error.

Requirements:

1. Reconcile the org and then the descendants for document `save()` and
   `Model.create()`. Read authoritative persisted inputs and IDs, including when
   the saved document was loaded with a projection. Treat the slug and bindings
   as stable; reject caller-supplied or reassigned IDs before persistence.
2. Verify a stored ID against the expected realm, owner, and parent/path. Mark
   each newly created group with a stable, source-scoped org identifier in the
   create request. This lets a retry recognize a group created before its ID
   was stored. A missing or mismatched stored binding or an unowned path
   conflict must surface without relinking to or updating another group.
3. Persist the root ID and map entries as the tree is resolved. Guard writes so
   overlapping saves cannot overwrite a different binding or lose an unrelated
   map entry. Re-read and check ownership on create conflicts. Update only
   supplied descriptions that differ; preserve unrelated group metadata.
4. Reject session-backed saves before persistence, including sessions supplied
   through Mongoose's transaction async-local storage. Report post-save
   failures to the caller even when the local write succeeded.
   Query and bulk operations bypass reconciliation. A fresh ordinary save can
   retry a partially completed tree; it must leave previously resolved IDs and
   unmanaged groups intact.

Acceptance criteria: with real Mongoose persistence and a behavior-accurate
Keycloak double, an org with no `roles` field creates the example tree and reloads
the same IDs. Repeat saves make no remote writes when in sync. Cover description
changes and omission, same leaf name in different branches, projected documents,
session/query boundaries, caller-supplied IDs, stale bindings, an unowned
collision, overlapping saves, and failure after remote creation or during ID
persistence.
Retry completes the tree without duplicates. Removing a role issues no delete.

Verification: group plugin tests within the shared Moo package test command;
reuse [`useMongoTestDatabase`](../../packages/moo/test/setup.ts) and the
[user-sync test pattern](../../packages/moo/test/keycloak-user-sync-plugin.test.ts).

Completion evidence:

- Added `reconcile.ts` and `save.ts` under `packages/moo/src/plugins/keycloak-group-sync/`,
  wired them into the plugin, and added the MongoDB-backed plugin test. The
  owner marker is a hash of the realm, database and collection names, and BSON
  `_id`. The plugin verifies the group ID, path, direct parent, and marker.
  MongoDB update pipelines write each binding conditionally and merge it into
  existing maps. A successful save also reflects the bindings in the hydrated
  document without marking them dirty.
- From the repo root, the coordinator reran both focused Vitest files with
  `pnpm --config.verify-deps-before-run=false --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/keycloak-group-sync-planner.test.ts test/keycloak-group-sync-plugin.test.ts`:
  79/79 passed with Mongoose 9.12.2. `pnpm --config.verify-deps-before-run=false --filter @web-ts-toolkit/moo exec tsc --noEmit`
  passed. The implementation checks also passed on Mongoose 8.23.1 (79 tests)
  and 8.0.0 (78 passed; one skipped because async-local transaction support was
  unavailable), plus scoped lint, formatting, and strict test typechecking.
  The runtime tests used MongoDB 8.2.6 and a Keycloak double.

### Task KGS-03: Ship the direct subpath and document the contract

Status: completed. Kind: improvement. Priority: P2 — confirms the runtime is usable
from an installed package. Dependencies: KGS-02.

Primary ownership: `packages/moo/package.json`, `packages/moo/tsup.config.ts`,
Moo export and packed-consumer tests, `packages/moo/README.md`,
`packages/moo/llms.txt`, and `website/docs/packages/moo.md`.

Finding: the [build entries](../../packages/moo/tsup.config.ts) and
[packed-consumer checks](../../packages/moo/test/moo.packed-consumer.test.ts) already
isolate user sync from consumers that do not install the optional Keycloak peer.

Requirements: add matching bundled ESM/CJS exports and declarations at
`@web-ts-toolkit/moo/plugins/keycloak-group-sync`. Keep root and grouped imports
usable without the peer. Verify the selected group APIs at the current peer and
the advertised floor before shipping. Document the example, path keys,
description ownership, supported hooks, errors, and how to retry or backfill
with ordinary saves outside a session.

Acceptance criteria: installed consumers import the plugin and type-check a
mixed nested configuration using the existing packed matrix. Core imports still
work without Keycloak. The existing user plugin passes its tests. Shipped docs
match actual runtime behavior, including what a post-save error means and the
fact that provisioning groups does not grant membership or permissions.

Verification: [export](../../packages/moo/test/package-exports.test.ts) and
packed-consumer checks within the shared package tests, plus source typecheck
and lint.

Completion evidence:

- The manifest and `tsup` entry publish `keycloakGroupSyncPlugin` through the
  direct subpath in ESM and CJS. Both emitted declaration files retain the
  four public types and their JSDoc. The [shipped README](../../packages/moo/README.md#keycloak-group-sync),
  `llms.txt`, and website docs describe the same API and save behavior.
- The packed matrix verified runtime registration and all six group API methods
  at Keycloak Fluent `0.12.1` and current `0.14.x`, strict NodeNext usage, and
  core imports without Keycloak. The README example also type-checked. The
  Keycloak fixture uses the existing upstream `skipLibCheck` workaround; the
  peer-free core fixture keeps that check enabled.
- All shared verification commands below passed: **423 tests in 20 Moo test
  files**, source typecheck, and package ESLint. Scope did not include other
  packages' tests. The coordinator also reran the built group plugin, planner,
  and export tests (**82/82**) and checked the declarations and diff. Runtime
  verification used a Keycloak double and inspected the upstream API; it did
  not connect to a live Keycloak server.

## Verification and definition of done

From `'<repo-root>'` (replace the placeholder with the checkout path), with
workspace dependencies installed and the Moo MongoDB test binary and consumer
dependencies available:

```sh
pnpm --config.verify-deps-before-run=false --filter @web-ts-toolkit/moo test
pnpm --config.verify-deps-before-run=false --filter @web-ts-toolkit/moo exec tsc --noEmit
pnpm --config.verify-deps-before-run=false exec eslint packages/moo
```

Run only the Moo package test suite. Its test script builds its dependency
closure without running other packages' tests. The pnpm flag uses the installed
dependencies without triggering a workspace auto-install. Keep builds/tests
serialized in this checkout as required by `AGENTS.md`. Reuse the existing
ignored `_tmp*` directories convention for disposable consumer fixtures and
logs. Record exact results, any live-server verification limits, and the paths
of durable evidence in this task file. Complete the plan only after all three
tasks meet their acceptance criteria and the checks pass.
