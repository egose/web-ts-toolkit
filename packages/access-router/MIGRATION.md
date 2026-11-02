# Owned authorization: breaking migration

This guide describes the **next breaking contract**, not an already-published
version. Deploy a tested matching application/library revision. There are no legacy
aliases or mixed-version rolling-compatibility flags. Start with `isolated`.

One engine captures actor/policy at operation entry, normalizes facts once per
document stage, and publishes an ordinary filtered DTO. A DTO, its metadata and
its diagnostic context have **no reusable authorization authority**. Neither mode
is a callback sandbox, database transaction, rollback mechanism, external-cache
freshness guarantee, blanket security-equivalence claim or performance promise.

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
  alwaysSelectFields: ['ownerId'], // fetched privately, not selected/authorized output
  docPermissions: {
    async read(doc): Promise<DocumentGrants> {
      const membership = await loadMembership(this, doc);
      return { canReadSalary: membership.canReadSalary === true };
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
      alwaysSelectFields: ['ownerId'],
      stripPermissionsField: true,
      baseFilter: { read: () => ({ visible: true }) },
      permissionSchema: {
        name: 'reader',
        salary: { read: salaryRule },
        bonus: { read: 'reader doc:canReadSalary' }, // AND
        allowance: { read: ['isHR', 'doc:canReadSalary'] }, // OR
      },
      docPermissions: {
        async read(doc, _permissions, context): Promise<DocumentGrants> {
          hooks++;
          assert.ok(Object.isFrozen(context));
          assert.equal('currentDocument' in context, false);
          const membership = await loadMembership(this, doc);
          return { canReadSalary: membership.canReadSalary === true };
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

`guard({ modelName, id, condition })` consumes a **private fresh read stage**, not
metadata or post-decorate output, with one query and one owning document hook.
Ordinary denied/missing guards are 401; invalid facts/structure are 400. Stripping,
exposing no keys or forging metadata in presentation cannot authorize the guard.
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
