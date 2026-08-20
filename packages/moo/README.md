# `@web-ts-toolkit/moo`

Mongoose helpers for schema fields, ObjectId checks, and document plugins.

## Installation

```sh
pnpm add mongoose @egose/keycloak-fluent @web-ts-toolkit/moo
```

Peer dependencies:

- `mongoose >= 8`
- `@egose/keycloak-fluent ^0.7`

## Highlights

- partial-index helpers for nullable or empty-string fields
- strict `isObjectId(...)` guard
- model-function plugin
- cascade-delete plugin
- Keycloak user-sync plugin

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
- all document plugins

Subpath entrypoints:

- `@web-ts-toolkit/moo/schema` — schema field helpers
- `@web-ts-toolkit/moo/is` — type guards such as `isObjectId(...)`
- `@web-ts-toolkit/moo/utils` — mongoose utilities
- `@web-ts-toolkit/moo/plugins` — plugin entrypoint
- `@web-ts-toolkit/moo/plugins/cascade-delete` — cascade-delete plugin
- `@web-ts-toolkit/moo/plugins/model-function` — model-function plugin
- `@web-ts-toolkit/moo/plugins/keycloak-user-sync` — Keycloak user-sync plugin

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

## Keycloak User Sync

```ts
import KeycloakAdminClientFluent from '@egose/keycloak-fluent';
import { Schema } from 'mongoose';
import { keycloakUserSyncPlugin } from '@web-ts-toolkit/moo/plugins/keycloak-user-sync';

const keycloak = new KeycloakAdminClientFluent({
  baseUrl: process.env.KEYCLOAK_URL,
  realmName: 'master',
});

await keycloak.simpleAuth({
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
  onError(error, { operation, document }) {
    reportKeycloakSyncError({ error, operation, document });
  },
});
```

The plugin:

- creates or updates a Keycloak user after a document `save()`
- deletes the Keycloak user before a document `deleteOne()`
- stores the Keycloak user ID in `providerId` by default
- resets `emailVerified` and sends a verification email when an existing email changes
- creates desired realm roles by default and reconciles role mappings
- syncs Keycloak user attributes from an `attributes` path or a custom `mapAttributes` function
- can update the Keycloak password when `syncFields.password` is explicitly enabled
- reads `archived` as the inverse of Keycloak `enabled`, falling back to an `enabled` field

`identifyBy` accepts one identity or an ordered list. When the realm allows duplicate emails, the plugin always prioritizes configured `providerId` and `username` identities before email. An email lookup proceeds only when it has exactly one match; multiple matches are reported as an error, and no user is changed or deleted.

Use `paths` to map different Mongoose path names. Use `syncFields` to disable profile fields, role syncing, or attribute syncing. Use `mapRoles` to translate application roles, and `managedRoles` to limit which assigned roles may be removed. Without `managedRoles`, the configured document roles are treated as the complete desired realm-role set.

Attributes are normalized to Keycloak string arrays. Use `mapAttributes` for dynamic key/value mappings and `attributePaths` to list the Mongoose fields that should trigger an attribute resync. Existing unmanaged Keycloak attributes are preserved. Set `managedAttributes` to the keys this plugin owns; managed keys are replaced by the mapper result and removed when omitted or returned as `null`/`undefined`.

Password sync is disabled by default to avoid sending stored password hashes to Keycloak. Enable it only when the mapped value is the plaintext password intended for Keycloak, such as a short-lived `pendingPassword` field. Existing users are updated through Keycloak's reset-password endpoint; newly created users pass the password through Keycloak Fluent's user creation flow. Use `passwordTemporary: true` when Keycloak should require the user to change it.

Errors are logged to `console.error` and rethrown by default. Set `logger: false` to disable logging, provide `logger.error(...)` for structured logging, use `onError` for reporting, or set `throwOnError: false` for best-effort syncing.

Only document `save()` and document `deleteOne()` are intercepted. Query operations such as `updateOne()`, `findOneAndUpdate()`, and query `deleteOne()` bypass the plugin. A post-save Keycloak failure cannot roll back the MongoDB write; applications needing atomic delivery should use an outbox and worker.

## Documentation

Full package documentation lives in `website/docs/packages/moo.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/moo
