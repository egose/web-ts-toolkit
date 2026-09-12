# `@web-ts-toolkit/moo`

Mongoose helpers for schema fields, ObjectId checks, and document plugins.

## Installation

```sh
pnpm add mongoose @web-ts-toolkit/moo
```

Peer dependencies:

- `mongoose >= 8` (tested with Mongoose 8.24.x and 9.x)
- `@egose/keycloak-fluent >=0.12.1 <0.15.0` only when using `@web-ts-toolkit/moo/plugins/keycloak-user-sync` (tested floor `0.12.1`, current `0.14.x`)

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

## Model Function Plugin

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

type CartModel = Model<Cart, Record<string, never>, CartMethods> &
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
// are inferred from the options. The second type argument is the method
// *name* (for example `'applyDiscount'`), never the methods object.
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

const Cart = mongoose.model<Cart, CartModel>('Cart', cartSchema);

const cart = await Cart.create({ name: 'laptop', price: 2000 });
const syncPrice: number = Cart.applyDiscount(cart, 'premium', 100);
const instancePrice: number = cart.applyDiscount('premium', 100);
const byId: number | null = await Cart.applyDiscountById(cart._id.toString(), 'premium', 100);
const asyncById: number | null = await Cart.applyDiscountAsyncById(cart._id, 'premium', 100);
```

Each registration adds three typed surfaces: an instance method, a static taking the document first, and a `ById` static that loads the document and returns `null` when it is missing. Wrong argument types fail compilation. Typed sync/async/instance/static/ById examples plus negative cases are compiler-checked from the packed package by `test/moo.typed-consumer.test.ts` (strict NodeNext, no repo aliases or MongoDB fixtures).

## Schema Helpers

`uniqueNullableString(field, overrides?)` returns a partial-unique field definition that allows any number of `null`/missing values while rejecting duplicate strings (including `''`): the partial index only covers string-typed values (`{ [field]: { $type: 'string' } }`). `uniqueEmptiableString(field, overrides?)` additionally ignores empty strings (both `null` and `''` repeat; only duplicate non-empty strings conflict) via `{ [field]: { $type: 'string', $gt: '' } }`. Extra `overrides` are spread over the defaults at runtime and reflected in the inferred return type, so overriding `default`, `trim`, or `index` replaces the fixed default type instead of keeping it.

`isObjectId(value)` is a strict canonical guard: only 24-character lowercase hex strings and `mongoose.Types.ObjectId` instances from this package's `mongoose` copy pass. Uppercase hex, 12-byte strings, structural impostors with matching `toString()`, foreign BSON copies, buffers, and throwing accessors are rejected without invoking arbitrary coercion.

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

Supported operations: only document `save()` is observed (a `pre('save')` snapshot of `isNew` plus a `post('save')` invocation). Query inserts, `insertMany()` fast paths that skip document middleware, and updates to existing documents never trigger the callback.

Delivery scope: post-save notification, not durable delivery. The callback runs after MongoDB persistence; a throwing callback rejects the post-save hook but cannot roll back the committed write, and there is no outbox, retry, or exactly-once guarantee across transaction retries or reentrant saves. Applications that need transactional delivery should record their own outbox intent inside the MongoDB transaction and process it after commit.

## Cascade Delete Plugin

Relationship mode (`localField` + `foreignField`) is fail-closed: missing/`null`/empty-string local keys and empty reference arrays resolve to zero dependents and delete nothing, so unrelated records with a missing/`null` foreign key survive. A local field omitted by a projection is distinguished from an intentionally empty relation — when the path is provably deselected the lookup throws instead of silently reporting zero dependents. Supplemental `extraForeignFilter` constraints are composed conjunctively (`{ $and: [relationship, extra] }`), so an extra filter on the relationship field (including `$or`/`$and` payloads) can only narrow, never replace or widen, the deletion set. Explicit full-filter mode (`foreignFilter`) is a separate contract: the resolved filter is used as-is and any `extraForeignFilter` is ignored; resolvers returning `null`/`undefined`/non-objects resolve to zero dependents. Empty full filters (`{}`) are rejected by default at registration and at runtime because they would match the whole dependent collection; there is currently no broad-delete opt-in. Invalid `model`/field combinations and non-object static filters throw at `schema.plugin(...)` time.

Deletion always removes fully hydrated dependent documents through their own document `deleteOne()` (never bulk writes), so nested cascades and custom document hooks observe required fields across multi-level custom-`localField` chains. Internal deletion traversal pages dependent `_id`s (`batchSize`, default `100`) and bounds in-flight deletes (`maxConcurrency`, default `8`; forced to `1` inside an active transaction), instead of materializing and deleting the whole set at once. Public `findDependents()` still returns an array. A dependent-hook failure rejects the parent `deleteOne()` after the parent is already removed (fail-fast, remaining batches skipped; abort the transaction to restore everything when in one); already-deleted rows are skipped. Repeated references delete once per level; diamonds/cycles terminate with at-least-once hook delivery.

Supported operations and timing: only document `deleteOne()` is intercepted (`pre`/`post('deleteOne', { document: true, query: false })`). Query deletes (`deleteMany()`, `findOneAndDelete()`, query `deleteOne()`) and query updates bypass the cascade. The `pre('deleteOne')` hook validates the execution context before the parent is removed (cross-client sessions and transactions on standalone topologies reject there); the `post('deleteOne')` hook runs after the parent is already removed, so a later dependent failure rejects the parent promise without restoring the parent outside a transaction. Dependent models resolve through the owning model's connection and the effective session (explicit `deleteOne({ session })` option, else the document-bound `$session()`) flows through dependent reads and deletes including nested cascades. `maxConcurrency` and `batchSize` must be integers `>= 1` when provided and are validated at `schema.plugin(...)` time.

Typed filters accept MongoDB operators per field (`{ price: { $gt: 5 } }`, `{ price: { $in: [...] } }`, plus `$and`/`$or` payloads through the index signature) and are forwarded to Mongoose unchanged. The no-argument `findDependents()`/`findOrphans()` overloads return `Partial` maps: entries whose lookup is unsupported or resolved to nullish are omitted rather than reported as empty arrays. `findOrphans()` support (see `docs/tasks/20260912-130000-moo-07-orphan-query-evidence.md`): scalar `_id` relations and `[{ type: ObjectId, ref }]` arrays are supported; non-`_id` local keys with a hardcoded `distinct('_id')`, dotted foreign paths, `{ type: [ObjectId], ref }` syntax, dynamic `refPath`, and `foreignFilter`-only relationships are unsupported and resolve to `null` (omitted from the map) rather than silently succeeding. Null/missing foreign rows are reported as orphans; per-page `$not/$in` batching is not a correct collection-scale anti-join, so a server-side `$lookup` strategy is deferred to a follow-up.

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
  tier: String,
  tenantId: String,
  subscription: { plan: String },
  // No stored pendingPassword path: the pending credential below is a
  // virtual and is never persisted to MongoDB.
});

// Genuinely non-persisted pending-password input. Virtuals are not stored in
// MongoDB; the value lives only in memory until the Keycloak reset-password
// call. Never add a persisted `pendingPassword` schema path holding
// plaintext, and clear the virtual after sync.
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
  // Declared mapper dependencies: the mapped schema paths above must exist.
  // passwordPaths covers the non-persisted virtual backing input.
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

Configuration is validated when `schema.plugin(...)` runs. `realm`, configured paths, managed role/attribute names, and attribute/role/password trigger paths are trimmed and must be non-empty. `identifyBy` accepts one identity or a non-empty ordered list containing only `providerId`, `username`, and `email`. Built-in synced field paths must exist in the Mongoose schema; mapper-driven `attributePaths`/`rolePaths`/`passwordPaths` name the additional Mongoose paths the mapper reads (as in the example above, where `tenantId`, `subscription.plan`, `tier`, and the `pendingPassword` virtual are all declared). Register the plugin only once per schema.

The plugin snapshots its options at registration, so later mutation of the caller's options object does not change sync behavior. `providerId` is server-controlled after persistence: applications may set it while creating a new document to link an existing Keycloak user, but changing it later is rejected before any remote call so ordinary document updates cannot redirect synchronization to another Keycloak account.

Saves and deletes share one persisted-identity boundary. New local documents perform explicitly authorized initial linking through their current identity values. Existing documents resolve only through their persisted snapshot: a stored `providerId` is authoritative, and a changed username or email that resolves to a different remote user fails closed instead of relinking — the conflicting update, credential reset, role change, or delete is never sent to that other account. A stale persisted `providerId`, a missing persisted local row, or a delete of a never-persisted document is likewise rejected before any destructive remote call. These identity rejections apply independently of `throwOnError`: with `throwOnError: false` a conflicting save still succeeds locally while leaving the other account untouched, and a conflicting delete always blocks local deletion so the verified binding remains retryable. Migration implication: after adopting this contract, rows whose stored `providerId` no longer exists remotely fail closed on sync; clear or re-link the stored binding explicitly rather than changing a profile field and expecting a silent relink.

When the realm allows duplicate emails, the plugin always prioritizes configured `providerId` and `username` identities before email. An email lookup proceeds only when it has exactly one match; multiple matches are reported as an error, and no user is changed or deleted.

Use `paths` to map different Mongoose path names. Use `syncFields` to disable profile fields, role syncing, or attribute syncing. Use `mapRoles` to translate application roles. Role sync is additive-only by default: desired local roles are assigned, but unrelated existing Keycloak realm roles are preserved. Set `managedRoles` to the exact role names this plugin owns; only those roles may be removed when omitted from an explicit local roles array. An absent or non-array roles value is treated as no role-sync intent. An empty array intentionally removes currently assigned managed roles while preserving unmanaged roles. `ensureRoles` defaults to `true`, so desired missing roles are created before assignment; set it to `false` if typos or insufficient administrative privileges should fail instead of creating roles. `maxRolesPerSync` defaults to `100` and rejects larger desired role arrays before role lookup or mapping requests, bounding caller-controlled remote work.

Email comparison is case-insensitive. Linking a new local document to an existing Keycloak user with the same email preserves the remote `emailVerified` value and does not send a verification email. A persisted local email change, or a detected remote email drift corrected back to the local value, resets `emailVerified` to `false` and sends VERIFY_EMAIL by default. Set `sendVerificationEmailOnChange: false` to skip the email action. Set `syncFields.emailVerified: false` to disable all email-verification writes, including forced revocation and VERIFY_EMAIL sends.

For existing Keycloak users, owned string profile fields (`username`, `email`, `firstName`, and `lastName`) are updated when their local value is a non-empty string. Set a synced field to `null`, an empty string, or a whitespace-only string to clear the remote value. Leave it `undefined`, set `syncFields.<field>: false`, or omit the schema path from change detection to preserve unmanaged remote profile data. New-user creation omits clearing values because there is no stale remote value to remove.

Attributes are normalized to Keycloak string arrays. Use `mapAttributes` for dynamic key/value mappings and `attributePaths` to list the Mongoose fields that should trigger an attribute resync. Existing unmanaged Keycloak attributes are preserved, including when a user is resolved by email. Set `managedAttributes` to the keys this plugin owns; managed keys are replaced by the mapper result and removed when omitted, returned as `null`/`undefined`, returned as an empty array, or mapped to unsupported object values. Attribute keys named `__proto__`, `prototype`, or `constructor` are rejected.

Mapper dependencies are explicit: `attributePaths`, `rolePaths`, and `passwordPaths` declare the extra Mongoose paths that trigger the `attributes`/`roles`/`password` operations when `mapAttributes`/`mapRoles`/`mapPassword` read beyond their configured paths (as with the `tier` and virtual `pendingPassword` inputs above). Dependencies are honored only while the corresponding `syncFields` entry is enabled; disabled fields stay fully inert. Dependency arrays are validated and snapshotted at registration. The password mapper is evaluated lazily — only for creation (new remote user, exactly once, with the value reused by the same-save recovery attempt) or when a declared password change indicates actual password-sync intent — so unrelated updates never invoke it and never reset credentials; likewise `mapRoles` runs only inside role sync for creations or `roles` changes.

Password sync is disabled by default to avoid sending stored password hashes to Keycloak. Enable it only when the mapped value is a short-lived, non-persisted plaintext input such as the `pendingPassword` virtual above — never an ordinary stored plaintext schema path. Passwords are never included in user-create or profile-update payloads; both newly created users and existing users are updated through Keycloak's reset-password endpoint with the configured `passwordTemporary` value. The plugin stores a newly resolved Keycloak user ID before optional password, role, and verification-email work so a later retry can converge on the same remote user instead of creating a duplicate. A partially provisioned account stays disabled until its required credentials succeed: profile updates never carry `enabled`, and enablement follows the credential reset. The application owns the lifecycle of plaintext password inputs: keep them short-lived and non-persisted, and prevent them from being logged, traced, or sent to error reporters beyond the intended Keycloak operation.

Errors are logged to `console.error` and rethrown by default. The logger boundary receives only an allowlisted summary — `{ operation, localDocumentId, error: { name, code?, status? } }` with a validated error name and optional machine codes — and never the message, stack, cause, request/response data, or arbitrary error properties, so transport secrets cannot flow into logs. `onError` still receives the original error for private processing with the same safe context by default. Set `includeDocumentInErrorContext: true` only for private handlers that are allowed to receive the full Mongoose document, which can contain plaintext passwords, email addresses, attributes, and arbitrary application fields. Logger and `onError` failures do not replace the original Keycloak sync error; with `throwOnError: false`, those observer failures are best-effort and are swallowed.

Only document `save()` and document `deleteOne()` are intercepted. Query operations such as `updateOne()`, `findOneAndUpdate()`, and query `deleteOne()` bypass the plugin. The selected delivery contract is direct, non-atomic hooks: Keycloak work is not part of the MongoDB commit, and the plugin rejects documents saved or deleted with a Mongoose session or transaction. Applications that need transactional delivery should write their own outbox intent in the MongoDB transaction and process it after commit.

For saves, a Keycloak failure after MongoDB persistence cannot roll back the local write. With `throwOnError: true`, the original error is rethrown after the post-save hook; with `throwOnError: false`, logging and `onError` make the failure observable and the application must retry by changing/saving the document or by running its own repair job. For deletes, remote deletion runs before local deletion. If the remote delete fails, the local document deletion is blocked even when `throwOnError: false`, leaving the same provider ID available for an idempotent retry.

Remote work is field-specific after identity resolution. A single owned profile or attribute change resolves the user and performs one update, without password reset or role reconciliation. A new user with no role-sync intent skips role mapping calls. Role reconciliation is sequential and deterministic; it performs one ensure/get pair per desired owned role plus one mapping list and optional add/remove calls. Realm metadata is fetched for each sync instead of cached, so duplicate-email policy changes are observed without an invalidation API.

## Documentation

Full package documentation lives in `website/docs/packages/moo.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/moo
