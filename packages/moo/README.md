# `@web-ts-toolkit/moo`

Mongoose helpers for schema fields, ObjectId checks, and document plugins.

## Installation

```sh
pnpm add mongoose @web-ts-toolkit/moo
```

Peer dependencies:

- `mongoose >= 8`
- `@egose/keycloak-fluent ^0.7` only when using `@web-ts-toolkit/moo/plugins/keycloak-user-sync`

## Highlights

- partial-index helpers for nullable or empty-string fields
- strict `isObjectId(...)` guard
- model-function plugin
- new-document plugin
- cascade-delete plugin
- optional Keycloak user-sync plugin through a dedicated subpath

## Quick Start

```ts
import { Schema } from 'mongoose';
import { uniqueEmptiableString, uniqueNullableString } from '@web-ts-toolkit/moo';

const userSchema = new Schema({
  email: uniqueNullableString('email'),
  username: uniqueEmptiableString('username'),
});
```

## Main Exports

Root entrypoint (`@web-ts-toolkit/moo`):

- schema helpers such as `uniqueNullableString(...)`
- `isObjectId(...)`
- document plugins except Keycloak user sync

Subpath entrypoints:

- `@web-ts-toolkit/moo/schema` — schema field helpers
- `@web-ts-toolkit/moo/is` — type guards such as `isObjectId(...)`
- `@web-ts-toolkit/moo/utils` — mongoose utilities
- `@web-ts-toolkit/moo/plugins` — plugin entrypoint
- `@web-ts-toolkit/moo/plugins/cascade-delete` — cascade-delete plugin
- `@web-ts-toolkit/moo/plugins/model-function` — model-function plugin
- `@web-ts-toolkit/moo/plugins/new-document` — new-document plugin
- `@web-ts-toolkit/moo/plugins/keycloak-user-sync` — Keycloak user-sync plugin

The Keycloak plugin is intentionally not re-exported from the root or grouped `@web-ts-toolkit/moo/plugins` entrypoints. Non-Keycloak consumers only need `mongoose`; Keycloak consumers should install `@egose/keycloak-fluent` and import `keycloakUserSyncPlugin` from the direct subpath.

### Subpath import example

```ts
import { Schema } from 'mongoose';
import { uniqueEmptiableString } from '@web-ts-toolkit/moo';
import { cascadeDeletePlugin } from '@web-ts-toolkit/moo/plugins/cascade-delete';

const userSchema = new Schema({
  email: uniqueEmptiableString('email'),
});

userSchema.plugin(cascadeDeletePlugin, {
  model: 'Session',
  localField: '_id',
  foreignField: 'userId',
});
```

## New Document Plugin

```ts
import { Schema } from 'mongoose';
import { newDocumentPlugin } from '@web-ts-toolkit/moo/plugins/new-document';

const userSchema = new Schema({
  email: String,
});

userSchema.plugin(newDocumentPlugin, {
  async fn(user) {
    await sendWelcomeEmail(user.email);
  },
});
```

The plugin runs `fn` after the first successful `save()` of a new document. Later saves of the same document do not run it.

## Keycloak User Sync

Install the optional Keycloak peer before using this entrypoint:

```sh
pnpm add @egose/keycloak-fluent
```

```ts
import { Schema } from 'mongoose';
import { createManagedKeycloakClient, keycloakUserSyncPlugin } from '@web-ts-toolkit/moo/plugins/keycloak-user-sync';

const keycloak = createManagedKeycloakClient({
  baseUrl: process.env.KEYCLOAK_URL,
  authRealm: 'master',
  clientId: process.env.KEYCLOAK_CLIENT_ID,
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
});

const userSchema = new Schema({
  providerId: String,
  username: String,
  email: String,
  emailVerified: Boolean,
  firstName: String,
  lastName: String,
  archived: Boolean,
  roles: [String],
  pendingPassword: String,
});

userSchema.plugin(keycloakUserSyncPlugin, {
  client: keycloak,
  realm: 'application',
  identifyBy: ['providerId', 'username', 'email'],
  managedRoles: ['admin', 'editor', 'viewer'],
  managedAttributes: ['tenantId', 'plan'],
  paths: {
    password: 'pendingPassword', // pragma: allowlist secret
  },
  syncFields: {
    firstName: true,
    lastName: true,
    email: true,
    roles: true,
    attributes: true,
    password: true,
  },
  passwordTemporary: true,
  mapPassword(document) {
    return document.get('pendingPassword') as string | undefined;
  },
  attributePaths: ['tenantId', 'subscription.plan'],
  mapAttributes(document) {
    return {
      tenantId: document.get('tenantId'),
      plan: document.get('subscription.plan'),
    };
  },
  onError(error, context) {
    reportKeycloakSyncError({ error, context });
  },
});
```

`createManagedKeycloakClient` is provided by `@egose/keycloak-fluent` and re-exported here for convenience. It authenticates lazily, shares one authentication attempt across concurrent requests, and creates no timer, so the same client can be declared outside a serverless handler and reused by warm invocations. The default mode is `client_credentials`; pass `authMode: 'user_credentials'` with lazy `username` and `password` resolvers when direct user credentials are required. Service accounts remain recommended for background synchronization.

The plugin:

- creates or updates a Keycloak user after a document `save()`
- deletes the Keycloak user before a document `deleteOne()`
- stores the Keycloak user ID in `providerId` by default
- resets `emailVerified` and sends a verification email when an existing email changes and email-verification syncing is enabled
- creates desired realm roles by default and removes assigned roles only within `managedRoles`
- syncs Keycloak user attributes from an `attributes` path or a custom `mapAttributes` function
- can update the Keycloak password when `syncFields.password` is explicitly enabled
- reads `archived` as the inverse of Keycloak `enabled`, falling back to an `enabled` field

Configuration is validated when `schema.plugin(...)` runs. `realm`, configured paths, managed role/attribute names, and attribute trigger paths are trimmed and must be non-empty. `identifyBy` accepts one identity or a non-empty ordered list containing only `providerId`, `username`, and `email`. Built-in synced field paths must exist in the Mongoose schema; mapper-driven `attributePaths` can name dynamic fields that the mapper reads. Register the plugin only once per schema.

The plugin snapshots its options at registration, so later mutation of the caller's options object does not change sync behavior. `providerId` is server-controlled after persistence: applications may set it while creating a new document to link an existing Keycloak user, but changing it later is rejected before any remote call so ordinary document updates cannot redirect synchronization to another Keycloak account.

When the realm allows duplicate emails, the plugin always prioritizes configured `providerId` and `username` identities before email. An email lookup proceeds only when it has exactly one match; multiple matches are reported as an error, and no user is changed or deleted.

Use `paths` to map different Mongoose path names. Use `syncFields` to disable profile fields, role syncing, or attribute syncing. Use `mapRoles` to translate application roles. Role sync is additive-only by default: desired local roles are assigned, but unrelated existing Keycloak realm roles are preserved. Set `managedRoles` to the exact role names this plugin owns; only those roles may be removed when omitted from an explicit local roles array. An absent or non-array roles value is treated as no role-sync intent. An empty array intentionally removes currently assigned managed roles while preserving unmanaged roles. `ensureRoles` defaults to `true`, so desired missing roles are created before assignment; set it to `false` if typos or insufficient administrative privileges should fail instead of creating roles. `maxRolesPerSync` defaults to `100` and rejects larger desired role arrays before role lookup or mapping requests, bounding caller-controlled remote work.

Email comparison is case-insensitive. Linking a new local document to an existing Keycloak user with the same email preserves the remote `emailVerified` value and does not send a verification email. A persisted local email change, or a detected remote email drift corrected back to the local value, resets `emailVerified` to `false` and sends VERIFY_EMAIL by default. Set `sendVerificationEmailOnChange: false` to skip the email action. Set `syncFields.emailVerified: false` to disable all email-verification writes, including forced revocation and VERIFY_EMAIL sends.

For existing Keycloak users, owned string profile fields (`username`, `email`, `firstName`, and `lastName`) are updated when their local value is a non-empty string. Set a synced field to `null`, an empty string, or a whitespace-only string to clear the remote value. Leave it `undefined`, set `syncFields.<field>: false`, or omit the schema path from change detection to preserve unmanaged remote profile data. New-user creation omits clearing values because there is no stale remote value to remove.

Attributes are normalized to Keycloak string arrays. Use `mapAttributes` for dynamic key/value mappings and `attributePaths` to list the Mongoose fields that should trigger an attribute resync. Existing unmanaged Keycloak attributes are preserved, including when a user is resolved by email. Set `managedAttributes` to the keys this plugin owns; managed keys are replaced by the mapper result and removed when omitted, returned as `null`/`undefined`, returned as an empty array, or mapped to unsupported object values. Attribute keys named `__proto__`, `prototype`, or `constructor` are rejected.

Password sync is disabled by default to avoid sending stored password hashes to Keycloak. Enable it only when the mapped value is the plaintext password intended for Keycloak, such as a short-lived `pendingPassword` field. Passwords are never included in user-create or profile-update payloads; both newly created users and existing users are updated through Keycloak's reset-password endpoint with the configured `passwordTemporary` value. The plugin stores a newly resolved Keycloak user ID before optional password, role, and verification-email work so a later retry can converge on the same remote user instead of creating a duplicate. The application owns the lifecycle of plaintext password fields: keep them short-lived and prevent them from being persisted, logged, traced, or sent to error reporters beyond the intended Keycloak operation.

Errors are logged to `console.error` and rethrown by default. The default logger context is redacted to safe metadata such as `operation` and `localDocumentId`; it never includes the Mongoose document, profile payload, email address, or password. `onError` receives the same safe context by default. Set `includeDocumentInErrorContext: true` only for private handlers that are allowed to receive the full Mongoose document, which can contain plaintext passwords, email addresses, attributes, and arbitrary application fields. Logger and `onError` failures do not replace the original Keycloak sync error; with `throwOnError: false`, those observer failures are best-effort and are swallowed.

Only document `save()` and document `deleteOne()` are intercepted. Query operations such as `updateOne()`, `findOneAndUpdate()`, and query `deleteOne()` bypass the plugin. The selected delivery contract is direct, non-atomic hooks: Keycloak work is not part of the MongoDB commit, and the plugin rejects documents saved or deleted with a Mongoose session or transaction. Applications that need transactional delivery should write their own outbox intent in the MongoDB transaction and process it after commit.

For saves, a Keycloak failure after MongoDB persistence cannot roll back the local write. With `throwOnError: true`, the original error is rethrown after the post-save hook; with `throwOnError: false`, logging and `onError` make the failure observable and the application must retry by changing/saving the document or by running its own repair job. For deletes, remote deletion runs before local deletion. If the remote delete fails, the local document deletion is blocked even when `throwOnError: false`, leaving the same provider ID available for an idempotent retry.

Remote work is field-specific after identity resolution. A single owned profile or attribute change resolves the user and performs one update, without password reset or role reconciliation. A new user with no role-sync intent skips role mapping calls. Role reconciliation is sequential and deterministic; it performs one ensure/get pair per desired owned role plus one mapping list and optional add/remove calls. Realm metadata is fetched for each sync instead of cached, so duplicate-email policy changes are observed without an invalidation API.

## Documentation

Full package documentation lives in `website/docs/packages/moo.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/moo
