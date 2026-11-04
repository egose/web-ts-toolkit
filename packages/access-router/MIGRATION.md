# Access router: breaking migration

This guide describes the **breaking contract implemented by this package**.
Deploy a tested matching application/library revision. There are no legacy
aliases or mixed-version rolling-compatibility flags. Start with `isolated`.

One engine captures actor/policy at operation entry, normalizes facts once per
document stage, and publishes an ordinary filtered DTO. A DTO, its metadata and
its diagnostic context have **no reusable authorization authority**. Neither mode
is a callback sandbox, database transaction, rollback mechanism, external-cache
freshness guarantee, blanket security-equivalence claim or performance promise.

## Breaking change: nested operation access

**Hard removal, no compatibility period.** Flat operation-access variants and their
public flat-name type are removed. There are no aliases, automatic translation, or
warning-only deprecations. Model, model-default and data bulk/dotted/fluent updates
reject removed keys before publishing partial policy, including keys set to undefined.

### Replace flat variants with per-operation rules

Each operation accepts either a scalar `Validation` or an object with four optional
`Validation` members: `default`, `basic`, `advanced`, and `root`. `Validation` still
means boolean, permission string, permission-string array, or a synchronous/async
request-bound guard; the new structure is not limited to booleans.

Before (historical):

```text
operationAccess: {
  read: 'canRead',
  basicRead: true,
  advancedRead: 'admin',
  subs: {
    comments: { read: 'canReadComments', advancedRead: 'moderator' },
  },
}
```

After (public target types, compiled through root and `./advanced` declarations):

<!-- doc-example: partial -->

```ts
import type { OperationAccess, OperationAccessContext, OperationAccessRule } from '@web-ts-toolkit/access-router';
import type { OperationAccessVariants } from '@web-ts-toolkit/access-router/advanced';

const context: OperationAccessContext = 'root';
const read: OperationAccessVariants = {
  default: 'canRead',
  basic: true,
  advanced: 'admin',
  [context]: 'canRead', // optional: omitted root already falls back to default
};
const rule: OperationAccessRule = read;
const operationAccess: OperationAccess = {
  read: rule,
  subs: {
    comments: {
      read: { default: 'canReadComments', advanced: 'moderator' },
    },
  },
};
void operationAccess;
```

Move the old base operation guard to its nested `default` when adding variant
members. An omitted `root` inherits that default, preserving the old root entry
guard; the explicit `root: 'canRead'` above is optional. Set `root: false` to deny
that target's read entries through the root/batch router independently of direct
read endpoints. Scalar operation rules, e.g. `read: 'canRead'`, remain supported.

| Removed operation-access keys       | Replacement members                   |
| ----------------------------------- | ------------------------------------- |
| `basicList`, `advancedList`         | `list.basic`, `list.advanced`         |
| `basicRead`, `advancedRead`         | `read.basic`, `read.advanced`         |
| `basicCreate`, `advancedCreate`     | `create.basic`, `create.advanced`     |
| `basicUpdate`, `advancedUpdate`     | `update.basic`, `update.advanced`     |
| `basicUpsert`, `advancedUpsert`     | `upsert.basic`, `upsert.advanced`     |
| `basicCount`, `advancedCount`       | `count.basic`, `count.advanced`       |
| `basicDistinct`, `advancedDistinct` | `distinct.basic`, `distinct.advanced` |

Inside `subs.<field>`, replace the former four flat list/read variants in the same
way: `subs.comments.basicRead` becomes `subs.comments.read.basic`. Subdocument
create/update/delete also accept scalar-or-object rules. Defined field scalars such
as `subs.attachments: true` continue to supply that field's operation fallback.
Remove imports of the flat-name `RouteVariantAccess` type. Use
`OperationAccessContext`, `OperationAccessVariants` and `OperationAccessRule` from
the package root or `./advanced`, rather than concatenated key names.
Removed flat configuration keys reject with migration diagnostics rather than
being interpreted as custom accesses or automatically translated.

### Entry points and fallback

All seven pairs select independent members (paths relative to the target base):

| Operation  | Basic direct endpoint  | Advanced direct endpoint                      | Root entry member |
| ---------- | ---------------------- | --------------------------------------------- | ----------------- |
| `list`     | `GET /`                | `POST /__query`                               | `list.root`       |
| `read`     | `GET /:id`             | `POST /__query/:id`, `POST /__query/__filter` | `read.root`       |
| `create`   | `POST /`               | `POST /__mutation`                            | `create.root`     |
| `update`   | `PATCH /:id`           | `PATCH /__mutation/:id`                       | `update.root`     |
| `upsert`   | `PUT /`                | `PUT /__mutation`                             | `upsert.root`     |
| `count`    | `GET /count`           | `POST /count`                                 | `count.root`      |
| `distinct` | `GET /distinct/:field` | `POST /distinct/:field`                       | `distinct.root`   |

Paths are relative to the target's base path and use default route segments.
Data-router list/read and subdocument list/read follow the same context mapping.
HEAD follows its GET's basic member. Unpaired direct new/delete and subdocument mutation
routes choose `basic`; their root counterparts choose `root`. Both root
`subUpdate` and `subBulkUpdate` use the field's `update.root`. No new advanced
endpoint or root wire `op` name is introduced. Setting `advanced` on an unpaired
operation does not create an endpoint. Context is explicit server-owned dispatch
metadata, not inferred from POST or a caller-selected access string.

Top-level fallback is:

```text
operation.<basic | advanced | root>
  -> operation.default (or the operation's scalar rule)
  -> operationAccess.default (or scalar operationAccess shorthand)
  -> deny
```

Only `undefined` inherits. A selected false/empty-array/false-returning guard
denies immediately; it is not combined with another guard. An empty top-level
operation object can inherit `operationAccess.default`. Model runtime exact-path
defaults still participate before general fallback: a runtime-default
`read.advanced` can outrank a model's scalar `read` or `read.default`. Set the model's
own context member to override it. Configuration still replaces objects shallowly;
this is not recursive merging of model and runtime-default objects. The selected
operation object supplies its own `default`; a defined model `read: {}` does not
independently inherit a runtime `read.default`. A whole operation inherited by the
existing base lookup can supply its own default. These defaults always belong to
the same runtime as the model; they are not process-global catch-alls.

For a defined subdocument field, use its operation's context member, then its scalar
or nested `default`, then deny. Missing operations in a defined field object do
**not** inherit top-level operations or `operationAccess.default`. An absent field
rule uses the corresponding top-level operation/context. A field-level
`subs.comments.default` is not a new wildcard fallback, and scalar `subs` is not
made an umbrella guard. Existing runtime exact-path specificity still applies.

Omitting model `operationAccess` inherits configured model defaults; without any
applicable grant, model operations deny. `operationAccess: true` explicitly supplies
the scalar allow fallback. Explicit model `operationAccess: undefined` retains its
existing exact-key-only runtime fallback, not inheritance of runtime bare/outer
`.default` catch-alls. Data routers do not inherit model defaults. Invalid defined
JavaScript values deny instead of falling through to an allowed default.

The root router's **own** scalar `operationAccess` still guards the outer batch
endpoint. A target's `read.root` is an additional per-entry decision, not a
replacement for that outer guard. Root being POST does not select `advanced`.
Direct denials remain 401; root target denials keep per-entry unauthorized results.
Denied routes remain registered and visible in endpoint listings/OpenAPI.

<!-- doc-example: partial -->

```ts
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

const api = createAccessRuntime();
const data = api.createDataRouter('Catalog', {
  basePath: '/catalog',
  idParam: 'id',
  idField: 'id',
  data: [{ id: 'one', name: 'One' }],
  operationAccess: { list: true, read: { default: false, basic: false, advanced: false, root: true } },
  permissionSchema: { id: true, name: true },
});
const batch = api.createRouter({ basePath: '/batch', operationAccess: 'canBatch' });
// Mount data.routes and batch.routes in an Express app with express.json().
// A root read still requires the independent outer canBatch guard; both direct reads deny.
void [data, batch];
```

### Keep transport entry separate from base policy

Existing context-free operation checks select the operation's scalar or nested
`default`, followed by the applicable outer fallback. They never choose `basic`,
`advanced`, or `root` merely because the initiating request used that entry point.
This includes existing populate/include target checks, private populated dependency
checks when required by target policy, READ-to-LIST retry, and subdocument mutation
response visibility. Existing populate-policy flags and trusted service admission
remain unchanged. Transport grants do not grant fields or related targets;
`permissionSchema`, row policy, and hook access names continue to use base operations.

For example, `read: { default: false, root: true }` permits root read entry, but does
not grant context-free target read admission. Use `default` deliberately when
migrating old base guards; putting them only under `basic` would change secondary
and root behavior.

### Update setters, not unrelated schema names

Replace `router.operationAccess('basicRead', false)` with
`router.operationAccess('read.basic', false)`. Replace
`router.setOption('operationAccess.advancedRead', rule)` with
`router.setOption('operationAccess.read.advanced', rule)`, and use the same nested
paths for runtime model/default/data setters. Nested `undefined` restores the
documented fallback; whole-object assignment remains shallow replacement.

<!-- doc-example: partial -->

```ts
import mongoose from 'mongoose';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

const api = createAccessRuntime();
const Post = mongoose.model('MigrationPost', new mongoose.Schema({ title: String, comments: [{ text: String }] }));
const router = api.createRouter(Post, {
  operationAccess: {
    default: false,
    read: { default: 'canRead', basic: true, advanced: 'admin' },
    subs: {
      comments: { read: { default: 'canReadComments', root: false }, create: { basic: 'canComment', root: false } },
      closed: {}, // missing operations deny; outer default never opens this field
      attachments: true, // scalar field fallback; absent fields instead use top-level rules
    },
  },
});
router.operationAccess('read.basic', false);
router.operationAccess('subs.comments.read.advanced', 'moderator');
router.setOption('operationAccess.read.root', false);
router.operationAccess('read.basic', undefined); // clear a member, not a whole permission string assignment
api.setModelOption(Post.modelName, 'operationAccess.read', { default: 'canRead', root: false });
api.setDefaultModelOption('operationAccess.read.advanced', 'admin');
const data = api.createDataRouter('MigrationData', { data: [], operationAccess: true }); // scalar shorthand
data.setOption('operationAccess.read', { default: true, root: false }); // keep scalar meaning explicitly
data.runtime.setDataOption('MigrationData', 'operationAccess.read.basic', true);
```

Updating beneath a scalar replaces it with an object; explicitly keep its old guard
under `default` if needed. Generic `getModelOption`/`getDataOption` remain raw generic
fallback lookups, not the final entry resolver (they can return an operation object).
Exact getters inspect a path; they do not evaluate a route. Setters remain live for
fresh work, construction snapshots remain frozen, and in-flight captured policy
retains its owning actor/runtime/defaults across updates.

Search operation-access configurations and their dotted/fluent paths for removed
flat names. Do **not** rename `requestSchemas.advancedRead`, request-schema exports,
client read/list method names, business fields, or permission names. Nested context
paths are configuration, not new request-selectable operations or populate access
values. Wire populate access remains `read`/`list`; retired and nested route-only
selectors must not become alternate target-authorization capabilities.

## Field permission maps are disabled by default

`disableFieldPermissions` now defaults to `true`. `_view`/`_edit` maps and their
placeholders are no longer computed or emitted, even when a request or method
default sets `includeFieldPermissions: true`. Permission enforcement and
`docPermissions`-hook keys (controlled by `includePermissions`) are unchanged.

To retain field maps, explicitly set `disableFieldPermissions: false` on the model
or use `api.setDefaultModelOptions({ disableFieldPermissions: false })` for runtime
model defaults. Use `stripPermissionsField: true` to remove the metadata field entirely.

## Replace global private-fetch inputs with document-permission descriptors

`alwaysSelectFields` is removed entirely: no option, dotted option, fluent setter,
default or compatibility alias. For each hook that needs extra projected data,
replace its function with `{ dependsOn: ['ownerId'], get: existingFunction }`.
Functions remain valid and add no private fetch inputs. Direct descriptors and
per-access/default/custom entries share the same contract; use `get`, not `getter`.

Only the active `docPermissionsAccess` supplies inputs (exact entry, then `default`
if undefined); it is not unioned with output/read or virtual access. Declare each
definition's actual inputs, not a global union. Hook/dependencies are captured as a
pair before awaits. Absent/empty dependencies add nothing. Missing/undefined values
never skip `get`. Inputs grant no output: selection and authorization still apply,
including exclusions and denied fields. Virtuals retain their own dependencies.

Use top-level persisted schema keys only, like virtuals. Dotted, unsafe, unknown and
virtual inputs reject. Move old nested paths such as `profile.ownerId` to the whole
`profile` container. Dotted access setters such as
`router.set('docPermissions.read', { dependsOn: ['ownerId'], get: hook })` replace
whole definitions; partial `.get`/`.dependsOn` edits reject. Those member names are
reserved, not custom accesses. Malformed definitions, including null/false or mixed
descriptor/access keys, reject rather than silently disabling calculation. To override
default with no facts, provide an exact callback returning `{}`. Move inputs used only by virtuals onto their virtual
descriptors; remove forced fields with no consumer rather than inventing a hook.

Embedded scopes inherit owning-document facts; dedicated subdocument routes prepare
their owning parent. Populate/include targets resolve their own hook and inputs.
Pre-/post-write stages stay independent; raw output helpers do no hidden query or
document-hook computation. See the [typed shapes](README.md#document-permission-dependencies-breaking-change).

## M1. Replace rich grants with immutable boolean facts

Before (historical, not a target example):

```text
docPermissions.read = async doc => ({ membership: await loadMembership(doc), expiresAt: new Date() });
salary.read = (_permissions, grants) => grants.membership.canReadSalary;
```

After: calculate decisions inside the document hook. `loadMembership` below is an
**application function**, supplied here, not a library export. Global permission
queries and document facts are different inputs. This typed function rule and the
prefixed string rule use the same evaluator; neither is an unconditional grant.

<!-- doc-example: partial -->

```ts
import { createAccessRuntime, type DocumentGrants, type FieldPermissionHook } from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';

async function loadMembership(request: ModelRequest, doc: unknown) {
  // Fixed server-owned example identity; replace with a verified principal / membership lookup.
  if (!request.macl) throw new Error('Missing owning request middleware');
  return {
    canReadSalary: doc !== null && typeof doc === 'object' && 'ownerId' in doc && doc.ownerId === 'alice',
  };
}
const salaryRule: FieldPermissionHook = function (permissions, facts) {
  return permissions.has('isHR') || facts.canReadSalary === true;
};
const api = createAccessRuntime();
api.setModelOptions('Employee', {
  modelPermissionPrefix: 'doc:',
  docPermissions: {
    read: {
      dependsOn: ['ownerId'], // fetched privately, not selected/authorized output
      async get(doc): Promise<DocumentGrants> {
        const membership = await loadMembership(this, doc);
        return { canReadSalary: membership.canReadSalary === true };
      },
    },
  },
  permissionSchema: {
    salary: { read: salaryRule },
    bonus: { read: 'isHR doc:canReadSalary' }, // space = AND
    allowance: { read: ['isHR', 'doc:canReadSalary'] }, // array = OR
  },
});
void salaryRule;
```

Supply the model, middleware and original request as in the complete workflow
below. For a production actor, use authenticated middleware and verified membership,
not the fixed example identity or client-supplied claims. Strings first check the global permission with that exact name, then a
document fact with the optional `doc:` prefix stripped. Unprefixed strings still
have global-OR-document behavior; the prefix is not an exclusive namespace or a
way to revoke a global grant. Boolean/string/
string-array rules, short-circuit order and effective base-operation access remain.

`DocumentGrants = Readonly<Record<string, boolean>>`: only own enumerable string
keys on a plain record and **literal booleans**. One root + one slot per key means
at most **19,999 keys**. No generic escape hatch accepts rich grants. Nested values,
Date/Buffer/BSON/Map/Set, undefined, getters/accessors, proxies, symbols,
non-enumerables and protected keys reject without getter execution or truthiness
coercion. Protected keys: `__proto__`, `constructor`, `prototype`, `_doc`, `$__`,
`__v`, `_permissions`, `_view`, `_edit` and the configured metadata field name.
Other string keys, including dotted/prefixed names, remain valid.

The library copies once into its own frozen null-prototype facts, never freezes or
retains the application's returned map. Mutating that map later cannot change the
stage in **either mode**. Do not mutate supplied facts, compare grant-object
identities, or store rich mutable context state. A missing hook yields empty facts;
a thrown/rejected hook yields empty facts plus a fixed-category warning. A **fulfilled invalid map** is a
whole-operation controlled **400**, not empty success. Arbitrary thenables are not
supported; application Promise assimilation is not sandboxed.

Facts are computed once even if an expensive fact goes unused. Closures, an
external cache or database state can change after an await; a captured function
does not keep them current. Design expensive loading/freshness explicitly.

Existing-document update/upsert-update and existing-parent subdocument input
admission use normalized **pre-write** facts, including negative predicates such
as `!facts.suspended`. Post-write output has a **separate fresh stage**. Do not
empty pre-write facts or derive write authority from output. DataService, standalone
raw helpers and new/create-input request-only evaluation receive frozen **empty
facts**. Pre-fetch planning defers functions rather than inventing facts.

## M2. Replace output-context mutation with explicit business work

Before (historical):

```text
docPermissions.read = (doc, permissions, context) => {
  context.originalDocumentSnapshot.lastReviewed = new Date();
  context.currentDocument.save();
  return { owner: true };
};
```

After: use local application values to compute facts, and a separate normal write
for an intended persisted change. Do not move read side effects into a closure.

<!-- doc-example: partial -->

```ts
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
async function recordReview(req: ModelRequest, id: string, reviewedAt: Date) {
  const service = req.macl.getService<{ lastReviewed?: Date }>('Employee');
  const written = await service.updateById(id, { lastReviewed: reviewedAt }, { select: ['lastReviewed'] });
  if (!written.success) throw new Error(`Review write failed: ${written.code}`);
  return written.data; // ordinary row/input/output rules and persistence hooks apply
}
void recordReview;
```

`ModelOutputContext` is the frozen context for document hooks (including pre-write),
virtuals, `decorate`, `decorateAll` and result diagnostics. **Exact allowlist**:

| Member                                                  | Meaning                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `modelName`, `receivingModelName`                       | Definition/receiving model names, not a raw Mongoose Model                                       |
| `operation`                                             | Initiating operation, not overwritten by fallback/effective output access                        |
| `scopePath`                                             | Frozen definition segments, including `sub` markers                                              |
| `virtualAccess`, `outputAccess`, `docPermissionsAccess` | Effective access strings                                                                         |
| `docPermissions`                                        | Frozen boolean facts; empty in the document hook and decorateAll                                 |
| `resolvedQuery?`                                        | Frozen `select`/`populate`/`sort` canonical string arrays, numeric `skip`/`limit`; **NO filter** |

Removed from **output** contexts, with no renamed backing aliases:

| Removed member                                                         | Replacement                                                                                        |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `mongooseModel`                                                        | Use an application-owned registered model for explicit business work; diagnostic names for logging |
| `originalDocumentSnapshot`, `finalDocumentSnapshot`, `currentDocument` | Explicit hook argument for calculation; normal write for persistence                               |
| `originalData`, `allowedData`, `preparedData`                          | Explicit local application variables or mutation lifecycle hook                                    |
| `allowedFields`, `modifiedPaths`, `changes`                            | Use genuine mutation lifecycle bookkeeping, not output authorization                               |
| `resolvedQuery.filter`                                                 | Keep your application's query input separately; do not recover private row policy                  |
| `documentAuthorization`, `getDocumentAuthorization`                    | No output-authority replacement; see M3                                                            |

`ModelHookContext` remains mutable in real validate/prepare/transform/save
(`afterPersist`)/delete/change lifecycle work, including its legitimate document,
data, query and diff fields. Use `ModelOutputHook` / `ModelOutputListHook` for
presentation annotations instead of lifecycle `ModelHook` / `ModelListHook`.

In `isolated`, doc hooks get disposable detached projected views, including
supported mutable native leaves. In `trusted`, an admitted ordinary projected
source/doc-hook input may be borrowed: mutations can affect values and facts the
hook computes, and hidden unvisited source graphs are not whole-document bounded.
**Only source borrowing relaxes**; captured actor, private policy and normalized
facts remain immutable. Neither Object.freeze nor a readonly native type makes
arbitrary Date/Buffer/BSON/Map methods immutable.

Virtual getters keep separate disposable views, private populated argument-four
isolation and **return staging in both modes**. Mutating an argument is not an
implicit output write; return the intended value. Trusted post-filter presentation
callbacks may construct/replace data but run after stage closure, with **no automatic
second authorization pass**. No callback sandbox, transaction or rollback is implied.

**Model guards no longer construct an output document.** Business interception in
an overridden `_read`, field callbacks, virtual getters, decorators, tasks or include
attachment work no longer runs during `guard({ modelName, id, condition })`. Move
security decisions to operation/row policy or the document-fact hook; move business
validation/effects to an explicit application boundary. Ordinary DTO reads still run
all selected-field checks, virtuals and presentation, with their normal errors.

## M3. Remove handles; choose presentation or a fresh normal query

Before (historical):

```text
service.pickAllowedFields(row, 'list', { documentAuthorization: context.documentAuthorization });
context.getDocumentAuthorization(child);
```

`DocumentAuthorization`, the helper option, result-context handle and child lookup
are removed entirely. There is no public issuer, callback replacement, hidden DTO
symbol or result-keyed authority. A serialized/copied/forged old token is not
accepted. `getDocPermissions` reads metadata **DATA**, not authority; changing
`_permissions` or the non-enumerable presentation alias cannot grant access.

- **Presentation only:** use the already-filtered DTO, or `{ name: result.data.name }`.
  This adds **0 reads / 0 document hooks** and does **not check current permissions**.
- **Raw output-only evaluation:** `pickAllowedFields`, `trimOutputFields` and
  `genAllowedFields` evaluate current supplied values, captured global permissions,
  frozen empty facts and optional explicit scoped server `outputFields`. They do
  **0 DB operations / 0 document hooks**, no row admission, hidden refresh, virtuals
  or omitted-field recovery. `!facts.suspended` may be true on empty facts; that is
  **not proof** the current document is unsuspended.
- **Optional raw collection:** `pickAllowedFieldsMany` uses one deliberate capture
  with separate isolated sources/stages/decisions, not N independently fresh picks.
  It is not a default migration or a replacement for current document facts.
- **Current document-dependent authorization:** issue a **new normal service READ
  or LIST**, with suitable selection/private hook inputs and normal row scope.
  One single-row refresh in the workflow adds **1 read / 1 document hook**. It is
  not a hidden helper cost or a transaction/freshness promise after completion.

Never replace an old handle with `unrestricted` policy, automatically grant all
old fields, or accept client-supplied grants. Explicit backend grants are a
separate deliberate server decision. Example scoped helper, no hidden query:

<!-- doc-example: partial -->

```ts
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
async function presentContact(req: ModelRequest, contact: { email?: string; label?: string }) {
  return req.macl
    .getService<{ contacts: { email?: string; label?: string }[] }>('Employee')
    .pickAllowedFields(contact, 'read', {
      scopePath: ['contacts'],
      authorization: { outputFields: { mode: 'grant', paths: ['contacts.label'] } },
    }); // grant paths remain model-relative; this is not current-document authority
}
void presentContact;
```

### Optional raw collection, not N fresh calls

Use this only for backend-held records whose output policy deliberately needs one
capture. All row sources are owned before the first field predicate; duplicate
references share no decisions. Actor/model/catalog/config/scope/output policy are
captured before awaits or predicates. Later actor-view/schema/options changes affect
the **next call**, not later rows; setting `req.user` alone does not refresh initialized
permissions. Closures, live request state and native effects are not frozen.

The following three exact target blocks are compiled and executed by installed
consumer tests. They are application functions, not new library exports.

<!-- doc-example: partial -->

```ts
import type { FilteredOutput, OutputFieldOptions } from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
export type Contact = { label: string; email: string; address: { city: string } };
type Employee = { contacts: Contact[] };
// Server-owned only: NEVER copy these controls from request input.
const contactPolicy: OutputFieldOptions<Employee> = {
  scopePath: ['contacts'],
  authorization: { outputFields: { mode: 'grant', paths: ['contacts.label'] } },
};
export async function rawBefore(req: ModelRequest, rows: readonly Contact[]) {
  const service = req.macl.getService<Employee>('Employee');
  const output = [];
  for (const row of rows) output.push(await service.pickAllowedFields(row, 'list', contactPolicy));
  return output; // N independently fresh captures; existing Promise<T> does not prove field presence
}
export async function rawMany(
  req: ModelRequest,
  rows: readonly Contact[],
): Promise<readonly FilteredOutput<Contact>[]> {
  return req.macl.getService<Employee>('Employee').pickAllowedFieldsMany(rows, 'list', contactPolicy);
  // ONE capture, not semantically equivalent to rawBefore. Every nested field can be omitted.
}
```

The scope uses ordinary response segments; grant paths stay **model-relative**
(`contacts.label`). One output-only policy applies to the whole call; row/input/
related controls, selection, `purpose`, handles/tokens and modes reject. No DB,
document hooks, virtuals, row/operation/target checks, reference provenance or omitted
value restoration is added. Negative EMPTY predicates do not prove current facts.

If existing DTOs only need a presentation subset, normally use **zero helpers**:

<!-- doc-example: partial -->

```ts
export function presentationSubset(rows: readonly { readonly name?: string }[]) {
  // Already-filtered DATA only. No current-permission assertion or omitted-field restoration.
  return rows.map((row) => (Object.hasOwn(row, 'name') ? { name: row.name } : {}));
  // Subset adds 0 reads / 0 document hooks / 0 helper captures.
}
```

For current document-dependent facts, use a **new normal LIST**, not either raw
recipe or an output grant. Configure the applicable `docPermissions.dependsOn` for
private hook inputs on the model; keep normal row policy. After an earlier LIST:

<!-- doc-example: partial -->

```ts
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
type Employee = { tenantId: string; name: string; salary: number; ownerId: string };
export async function currentList(req: ModelRequest, tenantId: string) {
  const current = await req.macl.getService<Employee>('Employee').find(
    { tenantId }, // trusted application filter, still subject to normal row policy
    { select: ['name', 'salary', '-_id'], limit: 100 },
    { includePermissions: false, includeFieldPermissions: false },
  );
  if (!current.success) throw new Error(`Current LIST failed: ${current.code}`);
  return current.data; // +1 explicit LIST; configured document hook runs per returned row
}
```

The installed runtime test changes private owner facts between LISTs: presentation
adds no work, while the fresh two-row LIST adds one query/two hooks and removes the
now-denied salary. This is not a transaction or freshness guarantee after completion.

Collection admission requires an ordinary dense Array of **0–1,000** positions;
readonly/frozen is accepted, nullish positions preserved. Proxies reject before
traps; subclasses, holes, accessor/non-enumerable indices, extra own strings/symbols
and iterables reject without reading an iterator. Empty input still validates all
controls/model/policy/catalog. Every row remains isolated in both source modes.
Separate per-row source/fact/view/selected **20,000-slot / depth-100** owners remain,
with native/embedded/metadata/copy/wire work sharing the relevant remainder.

One **200,000 work-unit / 16 MiB cumulative payload** ledger covers the entire call's
**router-controlled admission, staging, traversal and explicit copies**, including
configuration/preparation and all rows/phases. No row/chunk transition resets it.
**Excluded:** opaque Mongoose/native normalization internals and dependency-owned
allocations/traversals, arbitrary trusted closure/callback effects and engine
enumeration costs. This is **not** a total-memory/RSS, whole-normalization, CPU-operation
or sandbox cap. Canonical normalization can copy 17 MiB and discard it into a tiny
admitted row. A returned oversized normalized value rejects **before the next explicit
router copy**; explicit router-owned native/wire preparation is not excluded.

Bounded row scheduling uses the minimum row/scheduler/shared-hook-gate limits,
retaining FIFO/reentry/depth, stable outer order and per-row field order/sync-until-async
evaluation. Structural/native/router-budget poison is one controlled **400**, even if
caught: close admission, drain admitted library work, clear state and prohibit late
publication. Ordinary predicate-body failures omit fields. There is no partial result,
callback-side-effect rollback, automatic retry, persistence permit while waiting or
untracked detached-closure wait. Caller chunking starts new fresh operations, not one
atomic batch. Existing singles retain their independent freshness and error contracts.

The new root/advanced **type-only** `FilteredOutput<T>` makes string properties
recursively optional/readonly, including `_id`. Arrays include null/undefined without
tuple/cardinality inference; string Maps become readonly records; Date/RegExp/Buffer
use canonical base types. Other BSON/hydrated values (including string-ID documents),
unknown inputs and branches at depth eight are `unknown`: narrow/validate them.
Readonly is not native freezing, an input validator, exact field inference or authority.
Do not assign filtered rows to required `T[]` or cast away omissions. Both service
getters and Core expose the method (Core prepends `modelName`); DataService, HTTP and
clients do not. No new default migration, H3 replacement, gate waiver or speedup claim.

### Complete public workflow: facts, helper costs and checked refresh

Compile as `.mts` or `.cts` with TypeScript NodeNext/Node16, or bundle using public
imports. Requires Node >=22, Express >=5, Mongoose >=8 and MongoDB. The example
creates/drops only its unique database and closes its server/connection. The
server-owned example actor is not an authentication implementation.

<!-- doc-example: complete-runtime -->

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { createAccessRuntime, type DocumentGrants, type FieldPermissionHook } from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';

async function runOwnedAuthorizationExample() {
  const connection = await mongoose
    .createConnection(process.env.MONGODB_URL ?? 'mongodb://127.0.0.1:27017', {
      dbName: `owned_authorization_${randomUUID().replaceAll('-', '')}`,
    })
    .asPromise();
  let server: Server | undefined;
  let reads = 0,
    hooks = 0;
  const observations: unknown[] = [];
  try {
    const api = createAccessRuntime();
    api.setGlobalOptions({ globalPermissions: () => ['reader'], logger: { warn() {} } });
    type Employee = {
      name: string;
      salary: number;
      bonus: number;
      allowance: number;
      ownerId: string;
      visible: boolean;
    };
    const schema = new mongoose.Schema<Employee>({
      name: String,
      salary: Number,
      bonus: Number,
      allowance: Number,
      ownerId: String,
      visible: Boolean,
    });
    schema.pre('findOne', function () {
      reads++;
    });
    const EmployeeModel = connection.model('MigrationEmployee', schema);
    const salaryRule: FieldPermissionHook = function (permissions, facts) {
      assert.ok(Object.isFrozen(facts));
      return permissions.has('isHR') || facts.canReadSalary === true;
    };
    async function loadMembership(request: ModelRequest, doc: unknown) {
      assert.ok(request.macl); // the original initialized request, not an elevated actor
      return { canReadSalary: doc !== null && typeof doc === 'object' && 'ownerId' in doc && doc.ownerId === 'alice' };
    }
    const router = api.createRouter(EmployeeModel, {
      basePath: '/employees',
      operationAccess: { read: true },
      hydration: { findById: 'lean' },
      modelPermissionPrefix: 'doc:',
      stripPermissionsField: true,
      baseFilter: { read: () => ({ visible: true }) },
      permissionSchema: {
        name: 'reader',
        salary: { read: salaryRule },
        bonus: { read: 'reader doc:canReadSalary' }, // AND
        allowance: { read: ['isHR', 'doc:canReadSalary'] }, // OR
      },
      docPermissions: {
        read: {
          dependsOn: ['ownerId'],
          async get(doc, _permissions, context): Promise<DocumentGrants> {
            hooks++;
            assert.ok(Object.isFrozen(context));
            assert.equal('currentDocument' in context, false);
            const membership = await loadMembership(this, doc);
            return { canReadSalary: membership.canReadSalary === true };
          },
        },
      },
    });
    const row = await EmployeeModel.create({
      name: 'Ada',
      salary: 100,
      bonus: 10,
      allowance: 5,
      ownerId: 'alice',
      visible: true,
    });
    function initializedRequest(req: express.Request): req is ModelRequest {
      return 'macl' in req; // the owning router middleware must have run first
    }
    router.router.post('/verify', async (req, res) => {
      assert.ok(initializedRequest(req), 'Missing owning router middleware');
      const service = router.getService(req);
      const before = { reads, hooks };
      const query = { select: ['name', 'salary', 'bonus', 'allowance', '-_id'] };
      const quiet = { includePermissions: false, includeFieldPermissions: false };
      const first = await service.findById(String(row._id), query, quiet);
      if (!first.success) throw new Error(`Initial read failed: ${first.code}`);
      assert.deepEqual(first.data, { name: 'Ada', salary: 100, bonus: 10, allowance: 5 });
      assert.deepEqual({ reads, hooks }, { reads: before.reads + 1, hooks: before.hooks + 1 });
      assert.deepEqual({ name: first.data.name }, { name: 'Ada' }); // presentation DATA, not reauthorization
      assert.deepEqual(await service.pickAllowedFields(first.data, 'read'), { name: 'Ada' });
      assert.deepEqual(
        await service.pickAllowedFields(first.data, 'read', {
          authorization: { outputFields: { mode: 'grant', paths: ['salary', 'bonus', 'allowance'] } },
        }),
        first.data,
      ); // explicit server-only output decision, NOT replacement handle authority
      assert.deepEqual({ reads, hooks }, { reads: before.reads + 1, hooks: before.hooks + 1 });
      // Simulate independent application change. No DTO/context can keep this fresh.
      await EmployeeModel.collection.updateOne({ _id: row._id }, { $set: { ownerId: 'bob' } });
      const current = await service.findById(String(row._id), query, quiet);
      if (!current.success) throw new Error(`Refresh failed: ${current.code}`);
      assert.deepEqual(current.data, { name: 'Ada' });
      assert.equal(first.data.salary, 100); // the old DTO remains DATA, not a current certificate
      assert.deepEqual({ reads, hooks }, { reads: before.reads + 2, hooks: before.hooks + 2 });
      observations.push({
        mode: api.getModelOption(EmployeeModel.modelName, 'readAuthorizationMode'),
        initial: { reads: 1, hooks: 1 },
        helperExtra: { reads: 0, hooks: 0 },
        currentExtra: { reads: 1, hooks: 1 },
      });
      await EmployeeModel.collection.updateOne({ _id: row._id }, { $set: { ownerId: 'alice' } });
      res.json({ ok: true });
    });
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const statuses: number[] = [];
    for (const mode of ['isolated', 'trusted'] as const) {
      api.setModelOption(EmployeeModel.modelName, 'readAuthorizationMode', mode);
      const response: globalThis.Response = await fetch(`http://127.0.0.1:${address.port}/employees/verify`, {
        method: 'POST',
      });
      statuses.push(response.status);
      assert.equal(response.status, 200, await response.text());
    }
    // Untyped/JS wire control is controlled 400 BEFORE a DB read/hook, even false.
    const beforeInvalid = { reads, hooks };
    const invalid = await fetch(`http://127.0.0.1:${address.port}/employees/__query/${row._id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ select: ['name'], options: { readAuthorizationMode: false } }),
    });
    statuses.push(invalid.status);
    assert.equal(invalid.status, 400, await invalid.text());
    assert.deepEqual({ reads, hooks }, beforeInvalid);
    api.setModelOption(EmployeeModel.modelName, 'readAuthorizationMode', 'isolated'); // NEW calls only
    console.log(JSON.stringify({ guide: 'owned-authorization', statuses, observations, reads, hooks }));
  } finally {
    if (server)
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
    await connection.dropDatabase();
    await connection.close();
  }
}
void runOwnedAuthorizationExample().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

### Model conditions are facts-only, not an implicit DTO read

`guard({ modelName, id, condition })` consumes a **private fresh read stage**, not
metadata or post-decorate output. A visible row and a fresh owning document hook are
required even for a global-only condition. Strings/arrays keep the same grammar and
look up global permission OR a literal-true document fact, without field prefixes.
Stripping, exposing no keys or forging metadata cannot authorize the guard.

The normal public by-ID defaults, identifier/query/row/sort admission, root DB
projection, hydration and pre-output hook source remain the same. Ordinary/private
populate preparation needed for that source retains target-local operation/row/mode
admission and private-input masks. Include descriptors still undergo preflight, but
**output-only include attachment queries and target DTO hooks do not run**.

No DTO, field metadata, selected-output traversal, embedded/target DTO finalization,
virtual getter, decoration or task is built/run. Thus an invalid virtual/output-only
native return, throwing decorator or output-only include error no longer vetoes a
guard. Source/fact/necessary-dependency structural failures still fail with controlled
400 and cannot be caught to authorize. Ordinary denied/missing guards remain 401.

A successful visible-row guard normally costs one root read/one root hook and **zero
output-field callbacks**. An admitted miss may retry once using the captured LIST
operation gate and initiating READ source mode; true and false conditions are both
terminal, as are 400/403. Required dependency queries may add reads. This request-only
service path, like direct `_read`, does **not** run the generated HTTP route's initial
READ operation gate. Compose the appropriate existing route/global guard when both
checks are required; generated routes retain their operation checks unchanged.

If the caller also needs data or output/business effects, perform a separate ordinary
authorized read, check `result.success`, and handle its errors. That adds its normal
read/hook/output cost; the library does not silently fetch a second DTO for a guard.

<!-- doc-example: partial -->

```ts
import { guard } from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
const ownerCondition = guard({ modelName: 'Employee', id: { type: 'param', key: 'id' }, condition: 'owner' });
async function readEmployeeForBusinessWork(req: ModelRequest, id: string) {
  // Explicit additional ordinary read, not a reusable guard result/capability.
  const result = await req.macl.getPublicService('Employee')._read(id, { select: ['name'] });
  if (!result.success) throw new Error(`Employee read failed: ${result.code}`);
  return result.data;
}
void ownerCondition;
void readEmployeeForBusinessWork;
```

Related targets use **their own** captured policy/facts/mode; the unchanged
README runnable service/related example demonstrates separate scoped policies.

## M4. Replace ten switches with two independent server modes

Before: combinations of comparison/copy/fast-path booleans. There is **no one-to-one
mapping** for old mixed configurations and no dormant prerequisite combination.

<!-- doc-example: partial -->

```ts
import { createAccessRuntime } from '@web-ts-toolkit/access-router';
const api = createAccessRuntime();
api.setDefaultModelOptions({ readAuthorizationMode: 'isolated', listAuthorizationMode: 'isolated' });
api.setModelOptions('Employee', { readAuthorizationMode: 'isolated', listAuthorizationMode: 'trusted' });
api.setModelOptions('Payroll', { readAuthorizationMode: 'isolated', listAuthorizationMode: 'isolated' });
api.setModelOption('Employee', 'listAuthorizationMode', undefined); // restore live default inheritance
api.setDefaultModelOption('listAuthorizationMode', 'isolated');
```

Model/router/default bulk and exact setters accept only literal `isolated` /
`trusted`, or `undefined` restoration. Omission preserves an override; explicit
undefined clears it. Defaults inherit live for future calls; bulk failure is
atomic. `getModelOption` and `getModelOptions` expose effective modes, while a
router's `options` is its construction-time snapshot. Logger failures cannot abort
committed configuration; warn once per effective owner/access transition into
trusted, not on every request or repeated assignment.

Every retired key below rejects **by presence**, including `false`, `undefined`,
inherited and non-enumerable slots. Delete the keys, not just their truthy values:

1. `unsafeSkipListDocumentSnapshotChecks`
2. `unsafeSkipReadDocumentSnapshotChecks`
3. `unsafeSkipListOutputSnapshotChecks`
4. `unsafeSkipReadOutputSnapshotChecks`
5. `unsafeSkipListNestedDocumentSnapshotChecks`
6. `unsafeSkipReadNestedDocumentSnapshotChecks`
7. `unsafeSkipListInitialOutputSnapshotCopy`
8. `unsafeSkipReadInitialOutputSnapshotCopy`
9. `unsafeUseListAuthorizationFastPath`
10. `unsafeUseReadAuthorizationFastPath`

Untyped JavaScript is checked too. This executable error example deliberately
tests rejected inputs; it is not an adapter that translates old flags:

<!-- doc-example: javascript-errors -->

```js
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';
const api = createAccessRuntime();
const Employee = mongoose.model('Employee', new mongoose.Schema({ name: String }));
api.registerModelInstance('Employee', Employee); // configuration needs a real registered model; no DB connection here
const retired = [
  'unsafeSkipListDocumentSnapshotChecks',
  'unsafeSkipReadDocumentSnapshotChecks',
  'unsafeSkipListOutputSnapshotChecks',
  'unsafeSkipReadOutputSnapshotChecks',
  'unsafeSkipListNestedDocumentSnapshotChecks',
  'unsafeSkipReadNestedDocumentSnapshotChecks',
  'unsafeSkipListInitialOutputSnapshotCopy',
  'unsafeSkipReadInitialOutputSnapshotCopy',
  'unsafeUseListAuthorizationFastPath',
  'unsafeUseReadAuthorizationFastPath',
];
for (const key of retired) {
  for (const options of [
    { [key]: false },
    { [key]: undefined },
    Object.create({ [key]: false }),
    Object.defineProperty({}, key, { value: undefined, enumerable: false }),
  ])
    assert.throws(() => api.setModelOptions('Employee', options), /was removed; migrate/);
}
for (const mode of [true, false, null, 1, 'false', {}]) {
  assert.throws(() => api.setModelOption('Employee', 'readAuthorizationMode', mode), /literal isolated or trusted/);
}
api.setModelOptions('Employee', { readAuthorizationMode: 'isolated', listAuthorizationMode: 'isolated' });
assert.throws(
  () =>
    api.setModelOptions('Employee', {
      readAuthorizationMode: 'trusted',
      listAuthorizationMode: false,
    }),
  /literal isolated or trusted/,
);
assert.equal(api.getModelOption('Employee', 'readAuthorizationMode'), 'isolated'); // bulk was atomic
assert.throws(() => api.setGlobalOption('readAuthorizationMode', 'trusted'), /server model\/default-model/);
console.log(JSON.stringify({ retiredPresenceRejections: 40, invalidModes: 6, atomicBulk: true }));
```

The new keys are also prohibited in HTTP/query/body/root-batch, per-call/helper,
method-default, include/populate and subquery **authority namespaces**. Persisted
business data/filter fields with the same names remain inert ordinary data.

Capture happens before hooks/awaits. Embedded scopes inherit a genuine owning
model; related targets select their own model/access mode plus private policy and
facts. A trusted parent cannot lower an isolated target. READ-to-LIST retry keeps
the initiating READ mode and creates a fresh stage. Independent callback service
calls are fresh calls. Writes/write-derived output, new templates and dedicated
subdocument origins are **always isolated**, not trusted because a response looks
like a read.

For decorators, configure modes on `@Router`/`@RouterOptions`, or factory
`defaultModelOptions`, never request input. Decorated hook `this` is the **class
instance**; obtain the original request with `@Request()`. See the matching
access-router-deco README's executable owned-authorization module.

Roll out a tested matching application/library revision, default isolated, inspect
workload behavior and then opt individual READ/LIST owners into trusted deliberately.
Switching back to isolated affects **new calls only**; in-flight captures do not
change. Deployment rollback requires a tested matching application **and library**
revision, not adding removed flags to this version or assuming mixed rolling safety.

## M5. Mechanical checklist, preserved APIs and errors

Also audit model guards semantically: search for `_read` overrides and field/getter/
decorate/task/include effects used as business checks. Those output effects no longer
intercept a guard. Search alone cannot identify a security dependency on their side
effects. Keep such decisions in operation/row/fact hooks, or explicitly run and check
a normal DTO read at the application boundary (see M2/M3).

Search application configuration, computed/spread defaults, wrappers, decorators,
tests, generated clients and dependency adapters for:

- All ten M4 names; also remove unshipped `unsafeFuseListOutputPublication` /
  `unsafeFuseReadOutputPublication` if copied from a prototype (never an API).
- `DocumentAuthorization`, `documentAuthorization`, `getDocumentAuthorization`;
  old helper options and child-handle caches/lookups/serialization/replay.
- Every removed M2 output member, `resolvedQuery.filter`, `ModelHookContext` /
  `ModelHook` / `ModelListHook` annotations used for output callbacks; use the
  diagnostic/output types instead, **not** for legitimate lifecycle hooks.
- Rich or mutated docPermissions returns, identity comparisons, closures retaining
  source/context/facts and document-dependent raw-helper predicates.
- Positional `baseFields`, `skipChecks`, `subPaths`, old `overrides`, private
  prepared/execution options and deep `src`/`dist` imports. Named helpers accept
  `OutputFieldOptions` / `AllowedOutputFieldOptions`, not legacy overloads.

Search cannot decide whether a use is presentation or current authority, whether
`!facts.suspended` incorrectly admits empty facts, whether dependencies are fetched,
whether expensive unused facts are worth loading, or whether side effects belonged
in a real write. Review those semantics explicitly. No casts, `any` escape hatches
or suppressed declaration errors are a migration strategy.

Unchanged: `authorization.rows`, `inputFields`, `outputFields`, `related` are
independent server dimensions; parent grants do not elevate target operations/rows/
fields. Input grants do not grant output. Field boolean/string/array grammar,
selection/exclusions **versus authority**, private hook/dependency fetches,
hydration/native support, raw-parent business APIs and mutable persistence hooks
remain. Supported native/hydrated values can normalize at their actual boundary;
that is not arbitrary native support or identical native side effects in both modes.
Permission metadata remains **request-user facts**, never backend grants. Strip/
exposure/include flags affect metadata, not internal fact resolution or enforcement.

`FieldPermissionHook` has `(permissions, facts)` and original-request `this`;
`GuardHook`/operationAccess still has **one permissions argument**. Root and
`/advanced` export the same new types (`AuthorizationMode`, `DocumentGrants`,
`FieldPermissionHook`, `FieldValidation`, `ModelOutputContext`, `ModelOutputHook`,
`ModelOutputListHook`); `/processors` remains data transformation, not an issuer.
`FilteredOutput<T>` is also available from root and `/advanced`, only as a type.
There are no new entrypoints or legacy aliases. ESM imports select `.d.mts` +
`.mjs`; CJS requires select `.d.ts` + `.js` (factory under `.default` / named
`createAccessRuntime`). Use strict Bundler, Node16 or NodeNext module resolution.
Actual minimum/current peer workflows are tested; minimum-peer declaration checking
retains its existing `skipLibCheck` distinction, current peers check declarations.

### TypeScript before: intentionally rejected, compile separately

This exact old-style source is a **negative fixture**, not a target example. Do
not compile it alongside the positive examples or suppress these errors:

<!-- doc-example: expected-error -->

```ts
import type {
  DocumentAuthorization,
  ModelRouterOptions,
  ModelOutputContext,
  OutputFieldOptions,
} from '@web-ts-toolkit/access-router';
const oldMode: ModelRouterOptions = { unsafeUseReadAuthorizationFastPath: false };
const invalidMode: ModelRouterOptions = { readAuthorizationMode: true };
const rich: ModelRouterOptions = { docPermissions: () => ({ membership: { owner: true } }) };
declare const context: ModelOutputContext;
context.currentDocument;
context.resolvedQuery?.filter;
context.getDocumentAuthorization({});
const oldHelper: OutputFieldOptions = { documentAuthorization: context };
void [oldMode, invalidMode, rich, oldHelper];
export type OldHandle = DocumentAuthorization;
```

### Error reference (also applies to untyped JavaScript)

| Input / failure                                                                           | Result and action                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retired control presence, illegal new-mode placement, legacy handle/helper option         | Controlled BadRequest 400 before work; configuration setters throw an actionable error synchronously. Delete/move it; do not coerce false/undefined. |
| Invalid mode (`true`, `false`, null, number, arbitrary string/object)                     | Reject, no coercion; failed bulk setter publishes none of the update.                                                                                |
| Fulfilled invalid/rich/protected/accessor/proxy/over-budget facts                         | Whole operation 400, no partial result; fix the hook return.                                                                                         |
| Missing document hook / throwing or rejected hook                                         | Empty facts; only throwing/rejected hooks emit the fixed-category warning. Normal global rules still apply, not an unconditional deny-all override.  |
| Field predicate throw                                                                     | Denies that field; operation guard remains request-only.                                                                                             |
| Getter body throw / `undefined`                                                           | Omits that field.                                                                                                                                    |
| Invalid selected getter return or selected/native structural overflow/cycle/depth failure | Sticky whole-operation 400, even if inner application code catches it; no partial publication.                                                       |
| Ordinary row miss / guard denial                                                          | Normal checked error result (`not_found`, or guard 401); do not treat it as successful data.                                                         |
| Post-save output/fact/budget failure                                                      | Controlled 400 **may follow persistence**. No rollback and **no automatic retry**; reconcile persisted business state explicitly.                    |

Selected root-row work retains inclusive **20,000 slots / depth 100**, shared with
embedded/related/native/metadata output, including denied/protected encountered
keys before reading values. No child/helper/native transition replenishes it.
Document-source, facts and explicit callback views have separate bounded owners.
No source profile disables row/operation/field/target rules or the original actor.

Untyped JavaScript uses the same checked result/error handling as the workflow:
`{ options: { readAuthorizationMode: false } }` on an HTTP request returns 400
before reads/hooks. Do not depend on TypeScript alone to protect a wire boundary.
