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

Supported peer versions:

- `mongoose >= 8` (tested with Mongoose 8.24.x and 9.x)
- `@egose/keycloak-fluent >=0.12.1 <0.15.0` for the Keycloak user-sync subpath (tested floor `0.12.1`, current `0.14.x`)

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

`uniqueNullableString` allows repeating `null`/missing values while rejecting duplicate strings (partial index on `{ $type: 'string' }`); `uniqueEmptiableString` additionally ignores `''` (partial index on `{ $type: 'string', $gt: '' }`). Extra overrides are spread over the defaults and reflected in the inferred return type. `isObjectId` is a strict canonical guard: only 24-character lowercase hex strings and `mongoose.Types.ObjectId` instances pass.

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

// Keep result types free of the CartDocument alias (plain values, not the
// document) so the aliases never circularly reference each other.
type CartMethods = ModelFunctionInstanceMethods<'applyDiscount', [suffix: string, priceChange: number], number> &
  ModelFunctionInstanceMethods<'applyDiscountAsync', [suffix: string, priceChange: number], Promise<number>>;

type CartDocument = ModelDocument<Cart, CartMethods>;

type CartModel = Model<Cart, {}, CartMethods> &
  ModelFunctionStaticMethods<'applyDiscount', CartDocument, [suffix: string, priceChange: number], number> &
  ModelFunctionStaticMethods<
    'applyDiscountAsync',
    CartDocument,
    [suffix: string, priceChange: number],
    Promise<number>
  >;

const cartSchema = new mongoose.Schema<Cart, CartModel, CartMethods>({
  name: { type: String, required: true },
  price: { type: Number, required: true },
});

// No explicit plugin generics: the method name, argument tuple, and result
// are inferred from the options.
cartSchema.plugin(modelFunctionPlugin, {
  fnName: 'applyDiscount',
  fn: (cart: CartDocument, suffix: string, priceChange: number) => {
    cart.price += priceChange;
    return cart.price;
  },
});

cartSchema.plugin(modelFunctionPlugin, {
  fnName: 'applyDiscountAsync',
  fn: async (cart: CartDocument, suffix: string, priceChange: number) => {
    cart.price += priceChange;
    return cart.price;
  },
});
```

Each registration adds an instance method, a static taking the document first, and a `ById` static that returns `null` when no document matches. Wrong argument types fail compilation; representative examples plus negative cases are compiler-checked from the packed package by `test/moo.typed-consumer.test.ts`.

### New document plugin

```ts
import { newDocumentPlugin } from '@web-ts-toolkit/moo/plugins/new-document';

userSchema.plugin(newDocumentPlugin, {
  async fn(user) {
    await sendWelcomeEmail(user.email);
  },
});
```

The plugin stores `isNew` before Mongoose saves the document, then runs `fn` after the first successful `save()`. Later saves of the same document do not trigger the callback. Only document `save()` is observed; query inserts, `insertMany()` fast paths that skip document middleware, and updates to existing documents never trigger it. This is a post-save notification, not durable delivery: the callback runs after MongoDB persistence, cannot roll back the write, and carries no outbox, retry, or exactly-once guarantee across transaction retries. Applications needing transactional delivery should record their own outbox intent inside the transaction and process it after commit.

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

type FileDependents = Partial<CascadeDeleteDependencyMap<typeof referenceModelName, Reference>> &
  Record<string, unknown[]>;

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
  const dependents: FileDependents = await file.findDependents();
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

Relationship mode (`localField` + `foreignField`) is fail-closed: missing/`null`/empty-string local keys and empty reference arrays resolve to zero dependents and delete nothing, so unrelated records with a missing/`null` foreign key survive. A local field omitted by a projection is distinguished from an intentionally empty relation — when the path is provably deselected the lookup throws instead of silently reporting zero dependents. Supplemental `extraForeignFilter` constraints are composed conjunctively (`{ $and: [relationship, extra] }`), so an extra filter on the relationship field (including `$or`/`$and` payloads) can only narrow, never replace or widen, the deletion set. Explicit full-filter mode (`foreignFilter`) is a separate contract: the resolved filter is used as-is and any `extraForeignFilter` is ignored; resolvers returning `null`/`undefined`/non-objects resolve to zero dependents. Empty full filters (`{}`) are rejected by default at registration and at runtime because they would match the whole dependent collection; there is currently no broad-delete opt-in. Invalid `model`/field combinations and non-object static filters throw at `schema.plugin(...)` time.

Deletion always removes fully hydrated dependent documents through their own document `deleteOne()` (never bulk writes), so nested cascades and custom document hooks observe required fields across multi-level custom-`localField` chains. Internal deletion traversal pages dependent `_id`s (`batchSize`, default `100`) and bounds in-flight deletes (`maxConcurrency`, default `8`; forced to `1` inside an active transaction), instead of materializing and deleting the whole set at once. Public `findDependents()` still returns an array. A dependent-hook failure rejects the parent `deleteOne()` after the parent is already removed (fail-fast, remaining batches skipped; abort the transaction to restore everything when in one); already-deleted rows are skipped. Repeated references delete once per level; diamonds/cycles terminate with at-least-once hook delivery.

Only document `deleteOne()` is intercepted (`pre`/`post('deleteOne', { document: true, query: false })`); query deletes and query updates bypass the cascade. The `pre` hook validates the execution context before the parent is removed, while the `post` hook runs after the parent is already removed. Typed filters accept per-field MongoDB operators (`{ price: { $gt: 5 } }`) forwarded to Mongoose unchanged, and the no-argument `findDependents()`/`findOrphans()` overloads return `Partial` maps with unsupported entries omitted. `findOrphans()` supports scalar `_id` relations and `[{ type: ObjectId, ref }]` arrays; dotted paths, `{ type: [ObjectId], ref }` syntax, dynamic `refPath`, `foreignFilter`-only relationships, and non-`_id` local keys resolve to `null` (see `docs/tasks/20260912-130000-moo-07-orphan-query-evidence.md`).

### Keycloak user sync

Install `@egose/keycloak-fluent`, create a managed service-account client, and attach it to the user schema through the direct Keycloak subpath:

```ts
import { createManagedKeycloakClient, keycloakUserSyncPlugin } from '@web-ts-toolkit/moo/plugins/keycloak-user-sync';

const keycloak = createManagedKeycloakClient({ baseUrl, authRealm: 'master', clientId, clientSecret });

// Mapped attribute paths must exist in the schema. pendingPassword is a
// virtual below and is never persisted to MongoDB.
const userSchema = new Schema({
  providerId: String,
  username: String,
  email: String,
  roles: [String],
  tier: String,
  tenantId: String,
  subscription: { plan: String },
});

userSchema
  .virtual('pendingPassword') // pragma: allowlist secret
  .get(function (this: { $locals: Record<string, unknown> }) {
    return this.$locals.pendingPassword as string | undefined;
  })
  .set(function (this: { $locals: Record<string, unknown> }, value: string | undefined) {
    this.$locals.pendingPassword = value;
  });

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
  rolePaths: ['tier'],
  passwordPaths: ['pendingPassword'],
  mapRoles(_roles, document) {
    return document.get('tier') === 'pro' ? ['editor'] : [];
  },
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

The managed client authenticates lazily with `client_credentials`, checks token expiration when a request arrives, and shares one authentication attempt across concurrent requests. It uses no background timer, which makes it suitable for long-running processes and serverless functions. Declare it outside a serverless handler to let warm invocations reuse the current token. A `clientSecret` resolver can load a rotated secret when authentication is required. Applications using custom grants can construct and authenticate `KeycloakAdminClientFluent` directly instead.

The plugin syncs document saves and document `deleteOne()` calls. It handles changed emails, verification emails, realm-role reconciliation, dynamic user attributes, opt-in password updates, custom field paths, per-field enablement, duplicate-email safety, redacted structured logging, and custom error handling. Email comparison is case-insensitive. Initial linking to an existing Keycloak user with the same email preserves the remote `emailVerified` value and sends no verification email. Persisted local email changes and detected remote email drift reset `emailVerified` and send VERIFY_EMAIL by default; set `sendVerificationEmailOnChange: false` to skip the email action, or `syncFields.emailVerified: false` to disable all email-verification writes. Attribute values are normalized to Keycloak string arrays. Existing unmanaged Keycloak attributes are preserved; set `managedAttributes` for keys the plugin may replace or remove. Password sync is disabled by default; enable `syncFields.password` only for a short-lived, non-persisted pending-password virtual such as the example above — never an ordinary stored plaintext path or a stored hash. Passwords are not sent in create or profile-update payloads; created and existing users are updated through Keycloak's reset-password endpoint using `passwordTemporary`, and a partially provisioned account stays disabled until its required credentials succeed. A newly resolved Keycloak ID is stored before optional password, role, and verification-email work so retries can target the same remote user. The application owns that plaintext input's lifecycle and should keep it short-lived, non-persisted, and out of logs, traces, or error reporters. Mapper dependencies are explicit (`attributePaths`, `rolePaths`, `passwordPaths`, honored only while the corresponding `syncFields` entry is enabled), and the password mapper runs lazily — for creation or an actual password-sync intent only. Error loggers receive only the allowlisted `{ operation, localDocumentId, error: { name, code?, status? } }` summary, never the message, stack, cause, or transport data, while `onError` keeps the original error. Set `includeDocumentInErrorContext: true` only for private error handlers that can receive the full sensitive Mongoose document. Logger and `onError` failures do not replace the original sync error; with `throwOnError: false`, they are swallowed as best-effort observer failures. Query updates and deletes bypass document middleware. Post-save Keycloak errors cannot roll back the MongoDB save, so use an outbox when atomic delivery is required.

For existing Keycloak users, synced string profile fields (`username`, `email`, `firstName`, and `lastName`) are cleared when the local value is `null`, an empty string, or a whitespace-only string. `undefined` values and disabled `syncFields` preserve unmanaged remote profile data. New-user creation omits clearing values. Existing unmanaged Keycloak attributes are preserved, including after email-based resolution. Managed attributes are removed when omitted, mapped to `null`/`undefined`, mapped to an empty array, or mapped to unsupported object values. Attribute keys named `__proto__`, `prototype`, or `constructor` are rejected.

The selected delivery contract is direct, non-atomic hooks. Keycloak work is not part of the MongoDB commit, and the plugin rejects documents saved or deleted with a Mongoose session or transaction. Applications that need transactional delivery should write their own outbox intent in the MongoDB transaction and process it after commit. Save failures after MongoDB persistence are observable through thrown errors/logging/callbacks but require an application-owned retry. Delete failures block the local deletion even when `throwOnError: false`, so the same provider ID remains available for retry.

Configuration is validated during `schema.plugin(...)`: `realm`, configured paths, managed names, and attribute/role/password trigger paths must be non-empty; `identifyBy` must be a supported non-empty identity list; and built-in synced field paths must exist in the schema. Mapper-driven `attributePaths`/`rolePaths`/`passwordPaths` name the additional Mongoose paths the mapper reads (as in the example above). Options are snapshotted at registration, duplicate registration on the same schema is rejected, and `providerId` is immutable after persistence so document updates cannot redirect synchronization to another Keycloak user.

Saves and deletes share one persisted-identity boundary. New local documents perform explicitly authorized initial linking through their current identity values. Existing documents resolve only through their persisted snapshot: a stored `providerId` is authoritative, and a changed username or email that resolves to a different remote user fails closed instead of relinking — the conflicting update, credential reset, role change, or delete is never sent to that other account. A stale persisted `providerId`, a missing persisted local row, or a delete of a never-persisted document is likewise rejected before any destructive remote call. Identity protection applies independently of `throwOnError`: with `throwOnError: false` a conflicting save still succeeds locally while leaving the other account untouched, and a conflicting delete always blocks local deletion so the verified binding remains retryable. Migration implication: rows whose stored `providerId` no longer exists remotely fail closed on sync; clear or re-link the stored binding explicitly rather than changing a profile field and expecting a silent relink.

Role sync is additive-only by default: desired local roles are assigned, but unrelated existing Keycloak realm roles are preserved. Set `managedRoles` to the exact role names this plugin owns; only those roles may be removed when omitted from an explicit local roles array. An absent or non-array roles value is treated as no role-sync intent, while an empty array removes assigned managed roles and preserves unmanaged roles. `ensureRoles` defaults to `true`, so desired missing roles are created before assignment; set it to `false` if typos or insufficient administrative privileges should fail instead. `maxRolesPerSync` defaults to `100` and rejects larger desired role arrays before role lookup or mapping requests.

Remote work is field-specific after identity resolution. A single owned profile or attribute change resolves the user and performs one update, without password reset or role reconciliation. A new user with no role-sync intent skips role mapping calls. Role reconciliation is sequential and deterministic; it performs one ensure/get pair per desired owned role plus one mapping list and optional add/remove calls. Realm metadata is fetched for each sync instead of cached, so duplicate-email policy changes are observed without an invalidation API.

## Related Packages

- [`@web-ts-toolkit/access-router`](./access-router)
- [`@web-ts-toolkit/access-router-runtime`](./access-router-runtime)
