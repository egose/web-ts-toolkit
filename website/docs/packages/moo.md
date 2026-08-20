---
sidebar_label: Moo
sidebar_position: 16
---

# `@web-ts-toolkit/moo`

Helpers for common Mongoose patterns.

This package includes:

- partial-index helpers for nullable or empty string fields
- an `isObjectId(...)` guard for strict ObjectId checks
- document plugins for model-bound helper functions, new-document callbacks, cascade deletes, and Keycloak user sync

## Installation

```bash npm2yarn
npm install mongoose @web-ts-toolkit/moo
```

Install `@egose/keycloak-fluent` only when using the Keycloak user-sync subpath:

```bash npm2yarn
npm install @egose/keycloak-fluent
```

## What It Exposes

### Published Entry Points

Root entrypoint:

- schema helpers such as `uniqueNullableString(...)`
- `isObjectId(...)`
- non-Keycloak document plugins

Published subpaths:

- `@web-ts-toolkit/moo/schema` for schema field helpers
- `@web-ts-toolkit/moo/is` for type guards such as `isObjectId(...)`
- `@web-ts-toolkit/moo/utils` for schema and reference helpers such as `isSchema(...)`, `isObjectIdType(...)`, and `isReference(...)`
- `@web-ts-toolkit/moo/plugins` for the shared plugin entrypoint
- `@web-ts-toolkit/moo/plugins/cascade-delete` for the cascade-delete plugin
- `@web-ts-toolkit/moo/plugins/model-function` for the model-function plugin
- `@web-ts-toolkit/moo/plugins/new-document` for the new-document plugin
- `@web-ts-toolkit/moo/plugins/keycloak-user-sync` for the Keycloak user-sync plugin

The Keycloak plugin is intentionally available only from `@web-ts-toolkit/moo/plugins/keycloak-user-sync`. The root and grouped `@web-ts-toolkit/moo/plugins` entrypoints do not require the optional Keycloak peer.

Example subpath imports:

```ts
import { isObjectId } from '@web-ts-toolkit/moo/is';
import { cascadeDeletePlugin } from '@web-ts-toolkit/moo/plugins/cascade-delete';
```

## Quick Start

### Schema helpers

```ts
import { Schema } from 'mongoose';
import { uniqueEmptiableString, uniqueNullableString } from '@web-ts-toolkit/moo';

const userSchema = new Schema({
  email: uniqueNullableString('email'),
  username: uniqueEmptiableString('username'),
});
```

The dedicated schema subpath is also available when you want the import to point directly at field helpers:

```ts
import { uniqueNullableString } from '@web-ts-toolkit/moo/schema';
```

### ObjectId checks

```ts
import { isObjectId } from '@web-ts-toolkit/moo';

if (!isObjectId(value)) {
  throw new Error('expected a valid MongoDB ObjectId');
}
```

### Utilities subpath

```ts
import { Schema } from 'mongoose';
import { isReference, isSchema } from '@web-ts-toolkit/moo/utils';

const userSchema = new Schema({
  manager: { type: Schema.Types.ObjectId, ref: 'User' },
});

isSchema(userSchema);
isReference({ type: Schema.Types.ObjectId, ref: 'User' }, 'User');
```

### Model function plugin

```ts
import mongoose, { type Model } from 'mongoose';
import {
  type ModelDocument,
  type ModelFunctionInstanceMethods,
  type ModelFunctionStaticMethods,
  modelFunctionPlugin,
} from '@web-ts-toolkit/moo';

type Cart = {
  name: string;
  price: number;
};

type CartDocument = ModelDocument<Cart, CartMethods>;

type CartMethods = ModelFunctionInstanceMethods<'applyDiscount', [suffix: string, priceChange: number], CartDocument>;

type CartModel = Model<Cart, {}, CartMethods> &
  ModelFunctionStaticMethods<'applyDiscount', CartDocument, [suffix: string, priceChange: number], CartDocument>;

const cartSchema = new mongoose.Schema<Cart, CartModel, CartMethods>({
  name: { type: String, required: true },
  price: { type: Number, required: true },
});

cartSchema.plugin(modelFunctionPlugin, {
  fnName: 'applyDiscount',
  fn: (cart: CartDocument, suffix: string, priceChange: number) => {
    cart.name = `${cart.name}-${suffix}`;
    cart.price += priceChange;
    return cart;
  },
});
```

### New document plugin

```ts
import { newDocumentPlugin } from '@web-ts-toolkit/moo/plugins/new-document';

userSchema.plugin(newDocumentPlugin, {
  async fn(user) {
    await sendWelcomeEmail(user.email);
  },
});
```

The plugin stores `isNew` before Mongoose saves the document, then runs `fn` after the first successful `save()`. Later saves of the same document do not trigger the callback.

### Cascade delete plugin

```ts
import mongoose, { type Model, type Types } from 'mongoose';
import {
  type CascadeDeleteDependencyMap,
  type CascadeDeleteDocumentMethods,
  type CascadeDeleteModelStatics,
  cascadeDeletePlugin,
} from '@web-ts-toolkit/moo/plugins';

const referenceModelName = 'Reference';

type Reference = {
  name: string;
};

type File = {
  refs: Types.ObjectId[];
};

type FileMethods = CascadeDeleteDocumentMethods<typeof referenceModelName, Reference>;

type FileModel = Model<File, {}, FileMethods> & CascadeDeleteModelStatics<typeof referenceModelName, Reference>;

type FileDependents = CascadeDeleteDependencyMap<typeof referenceModelName, Reference>;

const fileSchema = new mongoose.Schema<File, FileModel, FileMethods>({
  refs: [{ type: mongoose.Schema.Types.ObjectId, ref: referenceModelName }],
});

fileSchema.plugin(cascadeDeletePlugin, {
  model: referenceModelName,
  localField: 'refs',
  foreignField: '_id',
});

const File = mongoose.model<File, FileModel>('File', fileSchema);

async function example(file: mongoose.HydratedDocument<File, FileMethods>) {
  const dependents = (await file.findDependents()) as FileDependents;
  const references = await file.findDependents(referenceModelName);
  const orphans = await File.findOrphans(referenceModelName);

  dependents.Reference;
  references?.[0]?.name;
  orphans?.[0]?.name;
}
```

If you prefer importing the plugin from its dedicated published entrypoint instead of the grouped `plugins` subpath, use:

```ts
import { cascadeDeletePlugin } from '@web-ts-toolkit/moo/plugins/cascade-delete';
```

### Keycloak user sync

Install `@egose/keycloak-fluent`, authenticate a client, and attach it to the user schema through the direct Keycloak subpath:

```ts
import KeycloakAdminClientFluent from '@egose/keycloak-fluent';
import { keycloakUserSyncPlugin } from '@web-ts-toolkit/moo/plugins/keycloak-user-sync';

const keycloak = new KeycloakAdminClientFluent({ baseUrl, realmName: 'master' });
await keycloak.simpleAuth({ clientId, clientSecret });

userSchema.plugin(keycloakUserSyncPlugin, {
  client: keycloak,
  realm: 'application',
  identifyBy: ['providerId', 'username', 'email'],
  managedRoles: ['admin', 'editor', 'viewer'],
  managedAttributes: ['tenantId', 'plan'],
  paths: { password: 'pendingPassword' }, // pragma: allowlist secret
  syncFields: { email: true, firstName: true, lastName: true, roles: true, attributes: true, password: true },
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
    reportKeycloakSyncError(error, context);
  },
});
```

The plugin syncs document saves and document `deleteOne()` calls. It handles changed emails, verification emails, realm-role reconciliation, dynamic user attributes, opt-in password updates, custom field paths, per-field enablement, duplicate-email safety, redacted structured logging, and custom error handling. Email comparison is case-insensitive. Initial linking to an existing Keycloak user with the same email preserves the remote `emailVerified` value and sends no verification email. Persisted local email changes and detected remote email drift reset `emailVerified` and send VERIFY_EMAIL by default; set `sendVerificationEmailOnChange: false` to skip the email action, or `syncFields.emailVerified: false` to disable all email-verification writes. Attribute values are normalized to Keycloak string arrays. Existing unmanaged Keycloak attributes are preserved; set `managedAttributes` for keys the plugin may replace or remove. Password sync is disabled by default; enable `syncFields.password` only for a plaintext pending password value, not a stored hash. Passwords are not sent in create or profile-update payloads; created and existing users are updated through Keycloak's reset-password endpoint using `passwordTemporary`. A newly resolved Keycloak ID is stored before optional password, role, and verification-email work so retries can target the same remote user. The application owns that plaintext field's lifecycle and should keep it short-lived, avoid persistence where possible, and prevent it from entering logs, traces, or error reporters. Error logger metadata and `onError` context include safe fields such as `operation` and `localDocumentId` by default, not the document, email address, password, or payload. Set `includeDocumentInErrorContext: true` only for private error handlers that can receive the full sensitive Mongoose document. Logger and `onError` failures do not replace the original sync error; with `throwOnError: false`, they are swallowed as best-effort observer failures. Query updates and deletes bypass document middleware. Post-save Keycloak errors cannot roll back the MongoDB save, so use an outbox when atomic delivery is required.

For existing Keycloak users, synced string profile fields (`username`, `email`, `firstName`, and `lastName`) are cleared when the local value is `null`, an empty string, or a whitespace-only string. `undefined` values and disabled `syncFields` preserve unmanaged remote profile data. New-user creation omits clearing values. Existing unmanaged Keycloak attributes are preserved, including after email-based resolution. Managed attributes are removed when omitted, mapped to `null`/`undefined`, mapped to an empty array, or mapped to unsupported object values. Attribute keys named `__proto__`, `prototype`, or `constructor` are rejected.

The selected delivery contract is direct, non-atomic hooks. Keycloak work is not part of the MongoDB commit, and the plugin rejects documents saved or deleted with a Mongoose session or transaction. Applications that need transactional delivery should write their own outbox intent in the MongoDB transaction and process it after commit. Save failures after MongoDB persistence are observable through thrown errors/logging/callbacks but require an application-owned retry. Delete failures block the local deletion even when `throwOnError: false`, so the same provider ID remains available for retry.

Configuration is validated during `schema.plugin(...)`: `realm`, configured paths, managed names, and attribute trigger paths must be non-empty; `identifyBy` must be a supported non-empty identity list; and built-in synced field paths must exist in the schema. Mapper-driven `attributePaths` may name dynamic fields that the mapper reads. Options are snapshotted at registration, duplicate registration on the same schema is rejected, and `providerId` is immutable after persistence so document updates cannot redirect synchronization to another Keycloak user.

Role sync is additive-only by default: desired local roles are assigned, but unrelated existing Keycloak realm roles are preserved. Set `managedRoles` to the exact role names this plugin owns; only those roles may be removed when omitted from an explicit local roles array. An absent or non-array roles value is treated as no role-sync intent, while an empty array removes assigned managed roles and preserves unmanaged roles. `ensureRoles` defaults to `true`, so desired missing roles are created before assignment; set it to `false` if typos or insufficient administrative privileges should fail instead. `maxRolesPerSync` defaults to `100` and rejects larger desired role arrays before role lookup or mapping requests.

Remote work is field-specific after identity resolution. A single owned profile or attribute change resolves the user and performs one update, without password reset or role reconciliation. A new user with no role-sync intent skips role mapping calls. Role reconciliation is sequential and deterministic; it performs one ensure/get pair per desired owned role plus one mapping list and optional add/remove calls. Realm metadata is fetched for each sync instead of cached, so duplicate-email policy changes are observed without an invalidation API.

## Related Packages

- [`@web-ts-toolkit/access-router`](./access-router)
- [`@web-ts-toolkit/access-router-runtime`](./access-router-runtime)
