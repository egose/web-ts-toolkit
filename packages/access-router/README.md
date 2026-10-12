# `@web-ts-toolkit/access-router`

ACL-aware Express routers and in-memory data services for Mongoose-backed APIs.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router express mongoose
```

Peer dependencies:

- `express >= 5`
- `mongoose >= 8`

Use Node.js 22 or newer. The package ships bundled CommonJS/ESM entrypoints and
matching declarations; prefer default `acl` for the shared runtime or named
`createAccessRuntime` for isolation.

## Highlights

- generated model CRUD routers
- generated in-memory data routers
- access control, field permissions, and request-time hooks
- root batch router for grouped operations
- request validation adapters
- generated OpenAPI JSON and Swagger UI routes

### Public request admission and backend options

All authorization input described below is **trusted server-only**. Acquire a
service through `router.getService(req)` or `req.macl.getService(modelName)` after
the owning runtime's middleware initializes the request. Keep policy in server
code; never copy it from a request body/query, OpenAPI option, client or React call.

Generated routes, root batches, public service wrappers (`_list`, `_read`,
`_readFilter`, mutations and `_new`), include/subquery options and populate
descriptors are request-only. Supplying `authorization`, `overrides`,
`documentAuthorization`, or private prepared/execution controls in their control
slots returns BadRequest, including after a custom request validator transforms an
envelope. Legacy include overrides that were silently ignored now fail admission.
Unknown options are not forwarded to internal target services.

Router `defaults` (including dotted setters) support query/presentation settings,
not per-call authorization or legacy overrides. Move backend authority out of
defaults and public/nested request options into explicit internal service calls.
Direct service row/output/related policies, named output helpers and internal result
contexts are available. The complete service `overrides` container is removed in
this breaking release; see the migration table below.

These restrictions apply to control slots, not business fields: payloads and
filters may still contain persisted fields named `authorization` or `overrides`,
and selections may request those names under ordinary field permissions. The
configured model `overrideFilter` hook/setter remains supported.

For populate and legacy/correlated includes, `authorization.related` is keyed by
the exact requested relationship/attachment path. Each entry must name the exact
registered target `model`; unused, ambiguous and mismatched entries reject before
target persistence. Child `operation`, `rows` and `outputFields` policies are
independent and default to request authority. A parent relationship-field grant
permits the source field but does not authorize target fields or operations.
Nested policies belong under the immediate target's `related` entry. Count targets
accept only `model`, `operation` and `rows`.

Target output grants remain selection-limited, including schema-hidden fields and
virtuals. Populate match, include filter, ref IDs and join/correlation constraints
remain ANDed with the target scope after query transformation in every row mode.
Populate policies also apply after create/update/upsert. Neither parent nor related
grants flow into request-controlled `$$sq` queries. For a same-execution target pick,
use `result.context.getDocumentAuthorization(child)` (or the corresponding list-row
context) with **that target model's** helper. Private dependencies and join keys do
not become output grants; related copies retain their own document results.

The existing `requireRegisteredPopulateModels: false` configuration remains an
explicit compatibility opt-out for requested unregistered populate targets. Those
values retain the descriptor's projection, have no target authorization handle,
and cannot receive `related` policies. It does not make an unassociated object
passed to a raw-policy helper into authorized target output.

### Selection, grants and document results

For business fields, output is **selected AND (request-authorized OR explicitly
granted)**. `outputFields.mode` is `request` (the default), additive `grant`, or
`unrestricted` over selected eligible catalog fields. An empty grant adds nothing.
With omitted select, normal defined request fields plus explicit grant paths are
candidates; unrestricted uses the captured persisted/registered-virtual catalog.
Explicit selections/exclusions and `requireExplicitSelect` still apply. Grants
cannot fabricate missing values or guarantee a required result field exists.

Backend model `genSelect(access, select, options)` and its `genQuerySelect` alias
now accept named output-planning options, for example
`{ authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } }`.
They return a persisted **fetch projection**, including private identity and
dependency inputs; this is not an output allowlist. Grants are additive to
request rules, never add to an explicit selection, and never override an
exclusion. A container grant covers its selected eligible subtree; a descendant
grant admits only the minimal ancestor structure, not sibling fields. Optional
`scopePath: ['contacts']` uses response segments; grant paths remain relative to
the owning model. The catalog includes declared `select: false` fields, embedded
schemas and registered virtuals; safe explicitly named Mixed/Map branches are
supported. Virtual names themselves never enter the database projection.

An opaque Mixed/Map root grant covers its existing safe subtree, subject to
descendant exclusions such as `-payload.secret`. A descendant-only selection or
grant does not authorize a scalar ancestor value: that value is omitted (or a
`null` placeholder in an array). A grant to the root itself can authorize its
scalar value when that root is selected.

Planning defers document-dependent rules and never runs permission functions or
virtual getters. Document hooks receive projected input: configure additional
persisted hook dependencies with `alwaysSelectFields`. Internal dependency fetches
do not grant output, even when the same path is also a private include join key.
Captured row/document hooks retain exact-access → `.default` → bare-hook resolution;
only an undefined entry falls through. Positional helper overloads retain request/input compatibility.
Backend model output helpers also accept named options:
`pickAllowedFields(doc, access, { authorization })`, its `trimOutputFields` alias,
and `genAllowedFields(doc, access, { authorization, purpose: 'output' })`. Core
provides the same overloads with `modelName` first. They filter existing values,
including nested/array paths; they do not apply a selection, compute virtuals,
restore absent fields, check rows, or authorize writes. An empty named options
object starts fresh request-mode output evaluation. Positional/omitted-options
calls remain the legacy request/input helpers.

The shared finalizer now consumes retained authorization plans and privately
memoizes full document grants and field decisions. For a subsequent same-execution
pick, use `{ documentAuthorization }` with the package-issued output context's
handle, rather than resupplying the raw policy. Handles validate the unchanged
output identity, request/runtime/model, scope, access and document stage; caller
spreads, matching IDs and `_permissions` are not provenance. Raw policy on a known
trimmed output retains unconditional request fields and explicit grants, but does
not rerun the document hook or recover document-dependent decisions. Metadata
stripping/exposure switches are independent of internal grants. Target models
require their own authorization; parent grants cover the relationship only.

Internal `findOne`/`findById`/`find`, `create`, `updateOne`/`updateById`, `upsert`
and `new` now consume the captured call policy throughout output finalization.
Single results expose `context.documentAuthorization`; list/create results expose
one `contexts[index]` per row. These opaque handles are non-enumerable context
properties, never attached to `data`. `context.getDocumentAuthorization(value)`
looks up an unchanged registered output in that result's graph.

<!-- doc-example: partial -->

```ts
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
declare const req: ModelRequest;
const service = req.macl.getService<{ status?: string; internalNote?: string }>('Order');
declare const orderId: string;
const result = await service.findOne(
  { _id: orderId },
  { select: ['status', 'internalNote'] },
  { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } },
);
if (result.success) {
  const picked = await service.pickAllowedFields(result.data, 'read', {
    documentAuthorization: result.context.documentAuthorization,
  });
  console.log(picked);
}
```

The selected stored note survives false/missing request rules; `status` still
requires normal request authorization. Ordinary document grants now apply even
under `skim` and metadata-disabled/stripped postures. Declare private hook inputs
with `alwaysSelectFields`; later handle picks reuse the original results after
those inputs are removed. Metadata describes request permissions, not backend grants.

Mutations use ordinary `args.select`. Output grants never admit protected writes;
validation, prepare/transform/afterPersist/change hooks and save semantics remain.
Update admission and post-write output have separate document stages. Upsert keeps
its initiating operation with create/update branch accesses. `new()` continues to
ignore `select`, including empty/exclusion projections. Trusted presentation hooks
run after finalization and may intentionally remove/construct output. There is no
automatic second authorization pass; arbitrary mutations/replacements do not acquire
provenance. For an unchanged output, use its handle at the **output access**: `read`
for ordinary reads/create/update/upsert output, `list` for lists or reads using list
access, and `create` for `new()`.

The immutable **call policy** captures authority once for planning and execution.
Each document/scope/access stage separately owns its hook grants and field decisions;
two list rows never share those results. Reusing the same raw policy is fresh
evaluation, not a substitute for a document handle. A fresh unassociated input must
contain the projected hook dependencies; a recognized trimmed output cannot rerun
the hook to reconstruct lost decisions. Use either `authorization` or
`documentAuthorization` in a named helper, never both. When extracting policy from a
full call, construct `{ outputFields: policy.outputFields }` for output-only helpers;
`create` accepts output/related only, and `new` accepts output only.

### Runnable authorization and handle reuse

This complete example uses an installed package, Express and MongoDB. Save it as
`authorization-example.mts` and run `node authorization-example.mts` on Node 22.18+
(or compile it with TypeScript/NodeNext first). `MONGODB_URL` defaults to local
MongoDB. It creates and removes its own uniquely named example database, serves one
loopback test request, and exits after its assertions pass. The route's policy and
example actor (`alice`) are server-owned constants, never HTTP inputs.

<!-- doc-example: complete-runtime -->

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import {
  createAccessRuntime,
  type OutputAuthorization,
  type ServiceAuthorization,
} from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';

type Order = {
  status?: string;
  internalNote?: string;
  ownerId?: string;
  tenantId: string;
  contacts?: { email?: string; ssn?: string }[];
  customer?: mongoose.Types.ObjectId;
};
type Virtuals = { summary: string };

async function runServiceAuthorizationExample() {
  const connection = await mongoose
    .createConnection(process.env.MONGODB_URL ?? 'mongodb://127.0.0.1:27017', {
      dbName: `authorization_example_${randomUUID().replaceAll('-', '')}`,
    })
    .asPromise();
  let server: Server | undefined;
  try {
    const api = createAccessRuntime();
    api.setGlobalOptions({ globalPermissions: () => [] }); // no user grant for the note
    const Customer = connection.model(
      'ExampleCustomer',
      new mongoose.Schema({
        name: String,
        billingEmail: String,
        tenantId: String,
      }),
    );
    const OrderModel = connection.model<Order>(
      'ExampleOrder',
      new mongoose.Schema<Order>({
        status: String,
        internalNote: { type: String, select: false },
        ownerId: String,
        tenantId: String,
        contacts: [{ email: String, ssn: String }],
        customer: { type: mongoose.Schema.Types.ObjectId, ref: Customer.modelName },
      }),
    );
    const customerRouter = api.createRouter(Customer, {
      operationAccess: { read: false },
      baseFilter: { read: () => false },
      permissionSchema: { name: true, billingEmail: false },
      stripPermissionsField: true,
    });
    let documentHookCalls = 0;
    let queryTransforms = 0;
    const router = api.createRouter<Order, Virtuals>(OrderModel, {
      basePath: '/orders',
      operationAccess: { read: true },
      stripPermissionsField: true,
      baseFilter: { read: () => ({ tenantId: 'request-tenant' }) },
      overrideFilter: {
        read: (filter) => {
          queryTransforms++;
          return filter;
        },
      },
      alwaysSelectFields: { read: ['ownerId'] }, // private projected document-hook input
      docPermissions: {
        read: (doc) => {
          documentHookCalls++;
          return { owner: doc !== null && typeof doc === 'object' && 'ownerId' in doc && doc.ownerId === 'alice' };
        },
      },
      permissionSchema: { status: { read: 'owner' }, internalNote: false, summary: false },
      virtuals: {
        summary: {
          dependsOn: ['status'],
          read: (doc) => (doc.status === undefined ? undefined : `Status: ${doc.status}`),
        },
      },
    });
    const customer = await Customer.create({ name: 'Ada', billingEmail: 'billing@example.test', tenantId: 'backend' });
    const rows = await OrderModel.insertMany([
      {
        status: 'ready',
        internalNote: 'server note',
        ownerId: 'alice',
        tenantId: 'backend',
        customer: customer._id,
        contacts: [{ email: 'alice@example.test', ssn: 'hidden' }],
      },
      { status: 'closed', internalNote: 'other note', ownerId: 'bob', tenantId: 'backend' },
      { status: 'draft', ownerId: 'alice', tenantId: 'backend' }, // note is absent
    ]);
    const output = {
      outputFields: { mode: 'grant', paths: ['internalNote'] },
    } as const satisfies OutputAuthorization<Order>;
    const authorization = {
      ...output,
      rows: { mode: 'scope', filter: { tenantId: 'backend' } },
    } as const satisfies ServiceAuthorization<Order, Virtuals>;
    const quiet = { skim: true, lean: true, includePermissions: false, includeFieldPermissions: false };
    const selected = { select: ['status', 'internalNote', '-_id'] };

    async function verifyServiceAuthorization(req: ModelRequest) {
      const service = router.getService(req); // alternatively req.macl.getService<Order, Virtuals>(OrderModel.modelName)
      const result = await service.findOne({ _id: rows[0]._id }, selected, { ...quiet, authorization });
      assert.ok(result.success);
      assert.deepEqual(result.data, { status: 'ready', internalNote: 'server note' });
      // ownerId and _permissions are absent, yet this handle retains both decisions.
      const reuse = { documentAuthorization: result.context.documentAuthorization };
      const picked = await service.pickAllowedFields(result.data, 'read', reuse);
      assert.deepEqual(await service.trimOutputFields(picked, 'read', reuse), result.data);
      assert.equal(documentHookCalls, 1);
      const fresh = await service.pickAllowedFields(result.data, 'read', { authorization: output });
      assert.deepEqual(fresh, { internalNote: 'server note' }); // no original owner decision
      assert.equal(documentHookCalls, 1); // never rerun the hook against this trimmed DTO

      const deniedStatus = await service.findOne({ _id: rows[1]._id }, selected, { ...quiet, authorization });
      assert.ok(deniedStatus.success);
      assert.deepEqual(deniedStatus.data, { internalNote: 'other note' });
      const unselected = await service.findOne(
        { _id: rows[0]._id },
        { select: ['status', '-_id'] },
        { ...quiet, authorization },
      );
      assert.ok(unselected.success);
      assert.deepEqual(unselected.data, { status: 'ready' }); // grant does not select the note
      const absent = await service.findOne({ _id: rows[2]._id }, selected, { ...quiet, authorization });
      assert.ok(absent.success);
      assert.deepEqual(absent.data, { status: 'draft' }); // grant does not create a value
      const requestRows = await service.findOne({ _id: rows[0]._id }, selected, { ...quiet, authorization: output });
      assert.equal(requestRows.success, false); // output grant cannot replace request row scope
      if (!requestRows.success) assert.equal(requestRows.code, 'not_found');

      router.setOption('permissionSchema', { status: { read: 'owner' } }); // note rule now missing
      const missingRule = await service.findOne({ _id: rows[0]._id }, selected, { ...quiet, authorization });
      assert.ok(missingRule.success);
      assert.equal(missingRule.data.internalNote, 'server note');
      const before = queryTransforms;
      await service.findOne({ _id: rows[0]._id }, selected, {
        ...quiet,
        authorization: { ...output, rows: { mode: 'unrestricted' } },
      });
      assert.equal(queryTransforms, before + 1); // unrestricted still runs overrideFilter

      const related = await service.findOne(
        { _id: rows[0]._id },
        {
          select: ['summary', 'contacts.email', 'customer', '-_id'],
          populate: [{ path: 'customer', select: ['name', 'billingEmail'] }],
        },
        {
          ...quiet,
          authorization: {
            rows: authorization.rows,
            outputFields: { mode: 'grant', paths: ['internalNote', 'summary', 'contacts.email', 'customer'] },
            related: {
              customer: {
                model: Customer.modelName,
                operation: { mode: 'grant' },
                rows: { mode: 'scope', filter: { tenantId: 'backend' } },
                outputFields: { mode: 'grant', paths: ['billingEmail'] },
              },
            },
          },
        },
      );
      assert.ok(related.success);
      assert.equal(Reflect.get(related.data, 'summary'), 'Status: ready');
      assert.equal(related.data.internalNote, undefined); // granted, still unselected
      assert.equal(related.data.contacts?.[0].email, 'alice@example.test');
      assert.equal(related.data.contacts?.[0].ssn, undefined);
      const child: unknown = Reflect.get(related.data, 'customer');
      assert.ok(child && typeof child === 'object');
      const childHandle = related.context.getDocumentAuthorization(child);
      assert.ok(childHandle);
      const childPick = await customerRouter
        .getService(req)
        .pickAllowedFields(child, 'read', { documentAuthorization: childHandle });
      assert.equal(Reflect.get(childPick, 'billingEmail'), 'billing@example.test');
      assert.equal(Reflect.get(childPick, 'tenantId'), undefined);
    }

    router.router.post('/verify', async (req, res) => {
      await verifyServiceAuthorization(req as ModelRequest); // router middleware has initialized req.macl
      res.json({ ok: true });
    });
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/orders/verify`, { method: 'POST' });
    assert.equal(response.status, 200, await response.text());
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
    await connection.dropDatabase(); // only the unique example database created above
    await connection.close();
  }
}

void runServiceAuthorizationExample().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

The target policy explicitly supplies **operation, row and output** authority. A
parent `customer` grant only admits that relationship; ref IDs and requested match/
join predicates still constrain target rows. A virtual grant permits selected getter
evaluation with its private dependencies, not database filtering/sorting or writes.
Getter failure/undefined and missing dependencies can still omit its output.

### Backend row authorization and filter migration

Internal `find`, `findOne`, `findById`, `updateOne`, `updateById` and `upsert`
accept a per-call `options.authorization.rows` policy:

<!-- doc-example: partial -->

```ts
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
declare const req: ModelRequest;
const service = req.macl.getService<{ status: string; tenantId: string }>('Order');
declare const tenantId: string;
const result = await service.find(
  { status: 'open' },
  { select: ['status'], limit: 20 },
  {
    includeCount: true,
    authorization: { rows: { mode: 'scope', filter: { tenantId } } },
  },
);
```

| Row mode            | Effective predicate                                                     |
| ------------------- | ----------------------------------------------------------------------- |
| `request` (default) | Configured query transform AND request `baseFilter`                     |
| `scope`             | Same query transform AND supplied trusted scope, replacing `baseFilter` |
| `unrestricted`      | Same query transform, without request `baseFilter`                      |

`overrideFilter.<access>` always transforms the ordinary predicate **once**. It
can intentionally rewrite query input, and its restrictions/false denial remain
effective in every row mode. Mandatory reference/join constraints and trusted
scope are ANDed afterward. A trusted scope is an inert database predicate:
`$$sq`/`$$date` values in it are never expanded. `{}` explicitly allows all rows
within the transformed query; null/undefined/malformed scope filters reject.

False query, identifier, or trusted scope is terminal before parser/identifier
work as applicable. Transform/base-filter false is terminal before primary
persistence or subsequent populate/include dispatch, but a read/list transform
receives the parsed query: necessary template subqueries may already have run.
Mutation lookup predicates retain their existing inert, non-client-parsing
behavior; mutation **data** still follows normal parsing and write admission.
An allowed upsert miss may create; lookup scope does not stamp values into input.

Private prepared execution reuses the authorized predicate for upsert's update
branch, include reads/lists/counts and `find.totalCount`. Correlated read/list
templates parse before parent substitution; substituted marker-shaped parent data
stays inert. Correlated count templates retain their non-parsing behavior. These
tokens are identity-bound internal objects, never arguments, JSON options or DTO
properties. Standalone `exists`, `count`, `delete` and `distinct` retain their
request-policy signatures; sort/distinct permission checks remain independent
of output grants. Original request/user permissions remain intact across calls.

**Breaking-release migration:** old object `overrides.filter` bypassed both
filter hooks. Replace it with an ordinary predicate plus explicit row policy.
Move replaceable user row restrictions from `overrideFilter` into `baseFilter`;
there is no query-transform bypass option. Use `findOne`/`updateOne` for custom
lookup predicates instead of `overrides.idFilter`. Release guidance is maintained
here and in the task record.

### Breaking release: service overrides migration

Explicit authorization and complete service-container removal ship together.
`overrides` is absent from internal service argument/default types and is rejected
at service entry with an actionable `bad_request` ErrorResult **before parsing,
identifier generation, child dispatch or persistence**. This includes `{}`, `null`,
`undefined`, inherited/non-enumerable JS slots, and mixtures with valid new
authorization. Delete the old property entirely; setting it to `undefined` is not
a migration. Moving it from args to options also rejects. There is no deprecated
adapter or alternate legacy authority path.

| Removed usage (before)                                                                               | Replacement (after)                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overrides.select: ['internalNote']`                                                                 | `findOne(query, { select: ['status', 'internalNote'] }, { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } })`. Selection describes output; the grant supplies additive authority.                                                             |
| `overrides.filter: trustedPredicate` for row authority                                               | Pass the desired ordinary query, then `authorization: { rows: { mode: 'scope', filter: trustedScope } }` or `rows: { mode: 'unrestricted' }`. The configured query transform still runs once.                                                                             |
| `overrides.filter: preparedPredicate` for package query reuse                                        | Package-owned upsert/includes/counts now use authenticated private prepared-query execution. Backend consumers pass ordinary predicates to service methods; no prepared/skip flag is exposed.                                                                             |
| `overrides.populate: [{ path: 'customer', select: ['name', 'internalNote'] }]`                       | Ordinary `populate` plus a parent `outputFields` grant for `customer` when needed and `related.customer: { model: 'Customer', operation: { mode: 'grant' }, outputFields: { mode: 'grant', paths: ['internalNote'] } }` for the independently needed target capabilities. |
| `overrides.idFilter: { slug }`                                                                       | `findOne({ slug }, args, options)` / `updateOne({ slug }, data, args, options)` with explicit row policy when needed. By-ID calls always use normal identifier resolution.                                                                                                |
| `overrides.effectiveSelect: ['status']`                                                              | `create(data, { select: ['status'] }, options)` / `updateOne(query, data, { select: ['status'] }, options)` / `upsert(query, data, { select: ['status'] }, options)`. Public `returningAll: false` computes this ordinary selection once.                                 |
| `overrides.operation: 'upsert'`                                                                      | Call `upsert(query, data, args, options)`. Private execution retains initiating `upsert` while create/update branch accesses govern getters, output and document grants.                                                                                                  |
| `pickAllowedFields(doc, 'read', ['internalNote'])` using helper `baseFields` as visibility authority | `pickAllowedFields(doc, 'read', { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } })`, or reuse the original `documentAuthorization` handle for same-execution document decisions.                                                            |
| `genSelect('read', select, true)` using helper `skipChecks` for provisional fetching                 | `genSelect('read', select, { authorization: { outputFields: { mode: 'request' } } })` / `genQuerySelect(...)`. Named planning defers document-dependent rules; use an explicit output grant when backend visibility is required.                                          |

The last two positional helper overloads remain isolated compatibility APIs until
SVA-F03. Canonical service output uses retained policy plans and document handles.
Helper `baseFields`/`skipChecks` are not options on the new named overloads.

Old nullish filter/ID overrides meant normal generation: omit the container and
omit `authorization.rows` (or use `{ mode: 'request' }`). Old terminal
`overrides.filter: false` becomes an ordinary `false` query or
`authorization.rows: { mode: 'scope', filter: false }`; the latter also prevents
by-ID resolution and persistence-bearing client subqueries. A normal identifier
hook returning false remains terminal in every row mode. `{ mode: 'scope', filter: {} }`
is an explicit all-row scope within the transformed query; a supplied null/undefined
scope filter is BadRequest, not request fallback. Output grants never revive row denial.

For example, migrate population through explicit source and target policies:

<!-- doc-example: partial -->

```ts
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
declare const req: ModelRequest;
declare const orderId: string;
const service = req.macl.getService<{ status: string; customer: string }>('Order');
const result = await service.findOne(
  { _id: orderId },
  { select: ['status', 'customer'], populate: [{ path: 'customer', select: ['name', 'internalNote'] }] },
  {
    authorization: {
      outputFields: { mode: 'grant', paths: ['customer'] },
      related: {
        customer: {
          model: 'Customer',
          operation: { mode: 'grant' },
          outputFields: { mode: 'grant', paths: ['internalNote'] },
        },
      },
    },
  },
);
```

Target rows still use request scope here; explicitly scope them if needed. Parent
authority never grants target fields/operations implicitly. Ordinary populate now
uses the same target-policy contract for reads and post-create/update/upsert output;
the old create behavior that ignored `overrides.populate` has been removed.

**Ordinary document-grant behavior also changes in this release:** previously a
skim read with metadata disabled and no virtual candidates could skip the document
hook, losing otherwise allowed persisted fields. Full internal document grants
are now resolved once per projected document/access stage regardless of `skim`,
`includePermissions`, `includeFieldPermissions`, stripping or exposed-key limits.
Only serialized metadata changes with those settings. Configure required private
hook inputs with `alwaysSelectFields`; same-execution handle picks retain the
original decisions after those inputs and `_permissions` are removed. Temporary
backend grants do not forge request-user `_view`/`_edit` or document-hook metadata.

Input/write authorization, validation and persistence hooks remain request-scoped;
an output grant cannot write a protected field. `new()` retains its ignored-select
template behavior. Dedicated subdocument authority, input-field elevation and
standalone row-only API expansion are outside this release. Business payload/filter
properties called `overrides` or `authorization` remain valid under ordinary rules.

## Quick Start

<!-- doc-example: partial -->

```ts
import express from 'express';
import mongoose from 'mongoose';
import acl, { permissionsPlugin } from '@web-ts-toolkit/access-router';

// 1. Configure how request permissions are resolved globally.
acl.setGlobalOptions({
  requestPermissionField: '_permissions',
  // Set to false only when legacy clients populate models without createRouter().
  requireRegisteredPopulateModels: true,
  globalPermissions(req) {
    return req.headers.user === 'admin' ? ['isAdmin'] : [];
  },
});

// 2. Register a Mongoose model and schema. The schema opts in to the
//    permissions plugin so generated routers can enforce field access.
const userSchema = new mongoose.Schema({ name: String, role: String, public: Boolean });
userSchema.plugin(permissionsPlugin, { modelName: 'User' });
const UserModel = mongoose.model('User', userSchema);

// 3. Create routers. Pass either the model name or the mongoose.Model
//    instance. Passing the instance preserves an explicit connection
//    (useful for multi-connection setups) and registers it with the
//    active runtime.
const userRouter = acl.createRouter('User', {
  basePath: '/users',
  operationAccess: { list: true, create: true, read: true, update: true, delete: true },
  permissionSchema: { name: true, role: 'isAdmin', public: true },
});

const fruitRouter = acl.createDataRouter('fruit', {
  basePath: '/fruit',
  idParam: 'id',
  idField: 'id',
  operationAccess: { list: true, read: true },
  data: [{ id: 'apple', name: 'Apple', public: true }],
  permissionSchema: { id: true, name: 'isAdmin', public: true },
});

const docsRouter = acl.createOpenApiRouter({
  title: 'Example API',
  version: '1.0.0',
});

// 4. Mount routers under an Express app.
const app = express();
app.use(express.json());
app.use(userRouter.routes);
app.use(fruitRouter.routes);
app.use(docsRouter);

// 5. Connect to MongoDB before accepting traffic. A failed connection throws
//    and exits before the server calls `app.listen`, so the service never
//    publishes routes it cannot serve.
const port = Number(process.env.PORT ?? 3000);
const mongoUrl = process.env.MONGODB_URL ?? 'mongodb://localhost:27017/example';
try {
  await mongoose.connect(mongoUrl);
} catch (err) {
  console.error(`Failed to connect to MongoDB at ${mongoUrl}:`, err);
  process.exit(1);
}

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
```

In-memory data routers default `listHardLimit` to `1000`, matching model routers. A list request without
`limit`/`pageSize`, or with a malformed limit passed through a trusted service call, is capped at that finite
default unless the router sets `listHardLimit` explicitly. `meta.totalCount` still reflects the full authorized
match set when counts are requested; only returned rows are trimmed and decorated. Per-row data trim/decorate
hooks run with bounded concurrency controlled by `requestComplexity.maxHookConcurrency` (default `10`).
Runtime options and data-router records are copied when configured, and option getter results are frozen
snapshots. Mutating the original options object, a fetched options snapshot, or the original `data` array does
not change live runtime policy or served in-memory records. Replace configured data through `router.data(next)`
or `setDataOption(name, 'data', next)`.

ACL filter hooks may return `false` to deny a query. That denial is terminal through identifier, override, and
base-filter composition. `overrideFilter` is a trusted hook that may replace an ordinary client or identifier
filter before the base filter is applied, but it is not called for an existing `false` filter and cannot revive
that denial. Returning `false` from `overrideFilter` also denies the query. Empty or absent filters retain their
normal unrestricted meaning unless a base filter restricts them.

**Model service denial contract:** internal `findOne`/`find`/`updateOne`/`upsert`
ordinary false queries, false identifier results and explicit false row scopes are
terminal. Early known false returns a `forbidden` ErrorResult without fallback
generation or persistence-bearing parsing. Omitted row authority uses request policy;
scope/unrestricted replace only its base scope. The removed service `overrides`
control instead returns `bad_request`, including when its old filter value is false.

`Service.exists(filter, { access: 'read', includeId: false })` returns a successful
boolean for allowed queries; `includeId: true` returns an `{ _id }` record or `null`.
Explicit/base/override terminal false now returns `forbidden` **before adapter dispatch**
in both modes, rather than a successful false/null. An allowed filter that matches no
visible row is still a successful miss. Check `result.success` before using `result.data`.

Public `_read` and `_readFilter` with `tryList: true` (the default) never retry Forbidden
or BadRequest. An authorized read miss can still fall back to list policy, subject to
list operation access. This deliberately removes list fallback for terminal read denial.
Public `_upsert` with an `_id` propagates denied update-policy existence as Forbidden
(previously Unauthorized); an allowed miss remains Unauthorized and neither case creates.
Generated direct routes map Forbidden to HTTP 403; root batches use per-entry 403 within
HTTP 200. **Custom Express routes own HTTP serialization:** returning an ErrorResult or
calling `res.json(result)` does not automatically set HTTP 403; map its code explicitly.

Advanced mutation validators drive dispatch: nested `data` validators run first, then the whole-body (`default`)
validator sees that transformed envelope, and the service persists only the final parsed `data`, `select`,
`populate`, `tasks`, and allowed `options`. Missing body options fall back to `returning_all`/`include_permissions`
query params; only `includePermissions`/`includeFieldPermissions`/`populateAccess` (plus `returningAll` for update/upsert) are forwarded.

## Basic and advanced operation access

Configure generated endpoint guards in `operationAccess`. A base rule such as `read`
covers both variants unless an exact `basicRead` or `advancedRead` rule overrides it.
Variants authorize **route entry**; field grants remain in `permissionSchema` under
base names such as `read` and `list`.

<!-- doc-example: partial -->

```ts
import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';

// Both list and both read variants inherit their base guards.
const baseOnly = {
  operationAccess: { list: true, read: true },
  permissionSchema: { name: true },
} satisfies ModelRouterOptions;

// Among top-level routes, deny GET /users/:id only; both advanced read POSTs inherit read: true.
const advancedReadsOnly = {
  basePath: '/users',
  operationAccess: { list: true, read: true, basicRead: false },
  permissionSchema: { name: true },
} satisfies ModelRouterOptions;

// Keep GET /users, deny POST /users/__query.
const basicListsOnly = {
  basePath: '/users',
  operationAccess: { list: true, read: true, advancedList: false },
  permissionSchema: { name: true },
} satisfies ModelRouterOptions;
// Pass one of these objects to acl.createRouter(UserModel, options).
```

`basicRead: false` does not affect list, new, count, distinct, or mutation routes;
their own guards still apply. Subdocument reads follow the field precedence below.
Denied operations return **HTTP 401 Unauthorized**
before validation/service dispatch. Every route stays registered in
`router.router.getEndpoints()` and OpenAPI. Express HEAD fallback uses the
corresponding GET's basic guard, so HEAD-by-id is denied with basic read.

### Complete operation matrix

Paths are relative to `basePath`, with model defaults `idParam: 'id'`,
`queryRouteSegment: '__query'`, and `mutationRouteSegment: '__mutation'`.
Changing those route-shape options changes paths, not guard names. For data routers,
set `idParam: 'id'` explicitly to use the illustrated identifier paths.

| Base guard        | Basic endpoint → override                        | Advanced endpoint → override                                   |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `list`            | `GET /` → `basicList`                            | `POST /__query` → `advancedList`                               |
| `read`            | `GET /:id` → `basicRead`                         | `POST /__query/:id`, `POST /__query/__filter` → `advancedRead` |
| `create`          | `POST /` → `basicCreate`                         | `POST /__mutation` → `advancedCreate`                          |
| `update`          | `PATCH /:id` → `basicUpdate`                     | `PATCH /__mutation/:id` → `advancedUpdate`                     |
| `upsert`          | `PUT /` → `basicUpsert`                          | `PUT /__mutation` → `advancedUpsert`                           |
| `count`           | `GET /count` → `basicCount`                      | `POST /count` → `advancedCount`                                |
| `distinct`        | `GET /distinct/:field` → `basicDistinct`         | `POST /distinct/:field` → `advancedDistinct`                   |
| `subs.<sub>.list` | `GET /:id/<sub>` → `subs.<sub>.basicList`        | `POST /:id/<sub>/__query` → `subs.<sub>.advancedList`          |
| `subs.<sub>.read` | `GET /:id/<sub>/:subId` → `subs.<sub>.basicRead` | `POST /:id/<sub>/:subId/__query` → `subs.<sub>.advancedRead`   |

Model routers support all fourteen top-level keys. Data routers implement only
list/read: `basicList`, `advancedList`, `basicRead`, and `advancedRead`, including
both advanced read paths. Each model subdocument field supports four nested
list/read keys. Filtered count/distinct POSTs are advanced even without `__query`.

Unpaired routes retain their base guards:

| Endpoint                                      | Guard               |
| --------------------------------------------- | ------------------- |
| `GET /new`                                    | `new`               |
| `DELETE /:id`                                 | `delete`            |
| `POST /:id/<sub>`                             | `subs.<sub>.create` |
| `PATCH /:id/<sub>`, `PATCH /:id/<sub>/:subId` | `subs.<sub>.update` |
| `DELETE /:id/<sub>/:subId`                    | `subs.<sub>.delete` |

### Variant and base fallback

1. Read the exact variant from the owning runtime (model lookup includes the
   runtime's exact model-default path).
2. Only if that value is `undefined`, use the existing base operation resolution:
   exact base rule → `operationAccess.default` → scalar `operationAccess` shorthand.
   If no valid guard resolves, deny.

The selected variant **replaces** the base guard; the two are not combined or both
evaluated. Explicit false, an empty array, or a guard returning false is terminal.
Omitted and explicit undefined variants inherit. With no runtime-default variants
or other fallback configured:

| Rules                              | Basic list | Advanced list | Root list entry |
| ---------------------------------- | ---------- | ------------- | --------------- |
| `list: true`                       | allowed    | allowed       | allowed         |
| `list: false`                      | denied     | denied        | denied          |
| `list: true, basicList: false`     | denied     | allowed       | allowed         |
| `list: true, advancedList: false`  | allowed    | denied        | allowed         |
| `list: false, basicList: true`     | allowed    | denied        | denied          |
| only `basicList: true`             | allowed    | denied        | denied          |
| `list: true, basicList: undefined` | allowed    | allowed       | allowed         |

All rule values use `Validation`: `boolean | string | string[] | GuardHook`.
Space-separated permission strings AND their names; arrays OR their entries.
Hooks receive `AccessRouterPermissions`, run with `this` bound to the request,
and may return a promise. Thrown/rejected operational errors retain normal error
handling rather than permission fallback.

<!-- doc-example: partial -->

```ts
import acl, { type ModelRouterOptions } from '@web-ts-toolkit/access-router';

acl.setGlobalOptions({
  globalPermissions(req) {
    return req.headers.user === 'admin' ? ['isAdmin', 'canReadDetails'] : [];
  },
});
const permissionBased = {
  operationAccess: {
    list: true,
    read: true,
    advancedList: 'isAdmin',
    advancedRead: ['canReadDetails', 'isAdmin'],
    advancedUpdate: async function (permissions) {
      return permissions.has('isAdmin') && this.headers['x-write-mode'] === 'advanced';
    },
  },
  permissionSchema: { name: { list: true, read: true } },
} satisfies ModelRouterOptions;
```

### Shorthand and model defaults

`operationAccess: true` (or another scalar `Validation`) supplies the ordinary
base fallback. In a rule object, use `default` for that fallback:

<!-- doc-example: partial -->

```ts
import acl, { type ModelRouterOptions } from '@web-ts-toolkit/access-router';

const shorthand = { operationAccess: 'canUseApi' } satisfies ModelRouterOptions;
const withDefault = {
  operationAccess: { default: 'canUseApi', list: true, basicRead: false },
} satisfies ModelRouterOptions;

acl.setDefaultModelOptions({ operationAccess: { list: true, read: true } });
acl.setDefaultModelOption('operationAccess.advancedRead', 'isAdmin');
const defaultRead = acl.getDefaultModelOption('operationAccess.advancedRead');
const defaultsSnapshot = acl.getDefaultModelOptions();
```

Model options use shallow assignment. Supplying an `operationAccess` object
replaces that stored object rather than recursively merging default siblings.
Exact variant lookup separately falls back to the runtime's **same exact path**:
a runtime-default `advancedRead` can therefore outrank a model's `read`, `default`,
or scalar shorthand unless the model defines its own `advancedRead`.

Defaults copied into a model's stored options stay there until updated. Changing
runtime defaults does not broadcast replacements to existing model values;
setting a stored variant to undefined can expose a live runtime-default variant
before base fallback. `getDefaultModelOption` reads the requested path exactly;
it does not resolve variant/base aliases or `operationAccess.default`.
`getDefaultModelOptions()` returns a frozen snapshot. Data routers use only their
own options and never inherit model defaults.

### Subdocument field precedence

For a basic list of `comments`, resolve:

1. Exact `subs.comments.basicList`.
2. Exact `subs.comments.list`.
3. Defined `subs.comments`: evaluate a scalar guard; an object without the
   applicable key **denies**, even if top-level list/variants allow.
4. Only for an absent field rule, top-level exact `basicList`.
5. Existing top-level base `list` fallback.

The same ordering applies to advanced list and both read variants. No nested
`.default` fallback is introduced. Exact field lookups retain model-default
specificity; an inherited defined field also stays closed. The legacy scalar `subs` umbrella is still
accepted, but **does not guard absent fields**; their fallback bypasses it and
uses top-level rules. Use explicit per-field rules to guard a field.

<!-- doc-example: partial -->

```ts
import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';

const subdocumentRules = {
  operationAccess: {
    list: true,
    read: true,
    subs: {
      comments: { list: true, read: true, basicList: false, advancedRead: 'isAdmin' },
      // Closed object: both items list routes are denied despite top-level list: true.
      items: { read: true },
      attachments: 'isAdmin',
    },
  },
} satisfies ModelRouterOptions;
```

### Live updates and option snapshots

Use setters to change request-time policy without reconstructing the router:

<!-- doc-example: partial -->

```ts
import acl from '@web-ts-toolkit/access-router';

// User must already be registered with this runtime.
const router = acl.createRouter('User', {
  basePath: '/users',
  operationAccess: { list: true, read: true },
  permissionSchema: { name: true },
});

router.operationAccess('basicRead', false); // Update one key, keep list/read rules.
router.operationAccess('subs.comments.basicRead', false);
router.set('operationAccess.advancedList', 'isAdmin');
router.setOption('operationAccess.basicRead', undefined); // Restore inheritance.
acl.setModelOption('User', 'operationAccess.basicRead', false);

// All object forms replace the whole operationAccess object, not a deep merge.
router.operationAccess({ list: true, read: true, basicRead: false });
router.setOptions({ operationAccess: { list: true, read: true, advancedList: false } });

const current = router.runtime.getModelOptions('User');
const exactVariant = router.runtime.getExactModelOption('User', 'operationAccess.basicRead');
```

`set({ operationAccess: ... })` and `setOption('operationAccess', ...)` have the
same shallow replacement semantics. Dotted paths are setter arguments, not flat
properties in constructor options. Updating a nested path under a scalar shorthand
starts an object; retain a `default` rule if you want the prior broad fallback.
Use `set`/`setOption` with undefined to clear a variant; the two-argument property
helper is intended for defined values.

`router.options` is the frozen **construction-time** snapshot. Options getter
results are also frozen snapshots; fetch again for current stored values. Ordinary
`getModelOption`/`getDataOption` use generic nested-option fallback, not the
route-specific variant-to-base resolver. Exact getters inspect the variant path
(including exact model-default fallback). Request guards read live runtime values.
Data router setters use the same forms; its owning runtime provides
`setDataOption`, `getDataOptions`, and `getExactDataOption`.

### Route guards and secondary policy

- Field grants, row filters, validation/prepare/decorate hooks, and related target
  checks retain base accesses. A variant grant does not grant fields or bypass
  target authorization.
- Model `_read`/`_readFilter` misses with `tryList: true` still require **base
  `list`** to retry. `list: false, advancedList: true` cannot grant retry;
  `list: true, basicList: false` cannot block it. Forbidden/BadRequest never retry.
- Upsert keeps its create/update branch policy; authorizing `advancedUpsert` does
  not also require `advancedCreate` or `advancedUpdate`.
- Subdocument mutation-response visibility uses base parent/subdocument read/list
  checks. Disabling basic reads does not hide otherwise readable output. Base
  response denial can still yield a successful null/empty response after a write
  (see [Subdocument writes with hidden responses](#subdocument-writes-with-hidden-responses)).
- Root batches use existing operation names and target base entry checks, with
  entry 401 inside the HTTP 200 batch envelope. Variants are not new root `op`
  values. Direct service calls remain trusted application calls with their
  existing checks; they do not infer basic/advanced access from `req.method`.

**Populate selectors:** wire `options.populateAccess` and descriptor `access`
accept only `'list' | 'read'` (`PopulateAccess` from `/advanced`). The shared Core
populate boundary also rejects all fourteen reserved variant names in effective
option/descriptor access, including generic options forwarded by legacy includes
and subqueries, before target persistence. Other trusted, non-reserved custom
access strings keep their existing runtime behavior. Invalid selectors return
controlled BadRequest (direct HTTP 400; affected root entry 400/`bad_request`).
Legacy read/list includes now propagate target BadRequest instead of silently
omitting it, so nested invalid selectors cannot disappear from the result.

### Runnable data-router split

This database-free example exercises the same four data keys after installation:

<!-- doc-example: complete-runtime -->

```ts
import { once } from 'node:events';
import express from 'express';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

const runtime = createAccessRuntime();
const router = runtime.createDataRouter('VariantFruit', {
  basePath: '/fruit',
  idParam: 'id',
  idField: 'id',
  data: [{ id: 'apple', name: 'Apple' }],
  operationAccess: { list: true, read: true, basicRead: false },
  permissionSchema: { id: true, name: true },
});
const app = express();
app.use(express.json());
app.use(router.routes);
const server = app.listen(0, '127.0.0.1');
try {
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  const url = `http://127.0.0.1:${address.port}/fruit`;
  const basic = await fetch(`${url}/apple`);
  const advanced = await fetch(`${url}/__query/apple`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (basic.status !== 401 || advanced.status !== 200) throw new Error('Read split failed');
  const fruit = await advanced.json();
  if (fruit.name !== 'Apple') throw new Error('Expected the authorized fruit');
  router.operationAccess('basicRead', true);
  if ((await fetch(`${url}/apple`)).status !== 200) throw new Error('Live update failed');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
```

## Basic model GET queries

`GET /users?select=name&sort=name%20-createdAt` projects `name` and sorts by
name ascending, then createdAt descending. GET list `sort` is a single
space-separated signed-field string; `-` means descending. Sorting runs before
pagination and can use permitted fields omitted from `select`. Malformed or
disallowed sort fields return HTTP 400 before the model query executes.

Model options `sortableFields` allow additional sorting fields without granting
output visibility, and `stripDisallowedSort: true` drops disallowed sort keys
instead of rejecting the request (malformed fields still fail). When no sort is
supplied, normal model service defaults apply; `?sort=` explicitly disables them.
GET-by-id reads also accept `select` as a query param.

Two router options lock down permission metadata regardless of client input or
per-operation `defaults`: `stripPermissionsField: true` removes the whole
permissions field from outputs (equivalent to `includePermissions: false` with
the field — including its placeholder — deleted; enforcement still runs), and
`disableFieldPermissions: true` never computes `_view`/`_edit` maps while still
honoring `includePermissions` for `docPermissions`-hook keys.

## Main Exports

Root entrypoint (`@web-ts-toolkit/access-router`):

- default export `acl` — the default-runtime API (functions bound to the shared `AccessRuntime`)
- `createAccessRuntime()` — create an isolated runtime with its own options and model registry
- `AccessRuntime`, `RootRouter`, `ModelRouter`, `DataRouter` — router/runtime classes
- `registerModelInstance(name, model)`, `hasModelInstance(name)`, `getModelInstance(name)` — explicit runtime-owned model registry helpers
- `guard(...)` and `GuardModelCondition`, `GuardModelConditionID` types
- `combineRoutes(...)` and `createOpenApiRouter(runtime, options)` (note: prefer `acl.createOpenApiRouter(options)` for the default runtime)
- validation adapters: `defineRequestSchema(...)`, `fromZod(...)`, `fromYup(...)`, `fromJoi(...)`, `fromAjv(...)`, `fromStandardSchema(...)`, `fromValibot(...)`, `fromArkType(...)`, `fromIoTs(...)`, `fromSuperstruct(...)`, `fromVine(...)`
- `permissionsPlugin` (src/plugins.ts) — Mongoose schema plugin used as `schema.plugin(permissionsPlugin, { modelName })`
- logger helpers: `redactFilter`, `redactPayload`, `safeStringify`, `isLevelEnabled` + `OpLogContext` type
- option helpers: `setGlobalOptions`, `setGlobalOption`, `getGlobalOptions`, `getGlobalOption`, `setModelOptions`, `setModelOption`, `getModelOptions`, `getModelOption`, `getModelNames`, `getModelJsonSchema`, `setDefaultModelOptions`, `setDefaultModelOption`, `getDefaultModelOptions`, `getDefaultModelOption`
- route-policy types: `OperationAccess`, `SubOperationAccess`, `Validation`, `GuardHook`, `RouteVariantAccess`, `ModelRouterOptions`, `DefaultModelRouterOptions`, `DataRouterOptions`, `ExtendedModelRouterOptions`, `ExtendedDefaultModelRouterOptions`, and `ExtendedDataRouterOptions` for typed setters; `PermissionSchema` / `FieldOperationAccess` are separate base-operation field grants. These types are also available from `/advanced`.
- trusted service policy types (also `/advanced`): `ServiceAuthorization`, `CreateAuthorization`, `OutputAuthorization`, `FieldAuthorization`, `RowAuthorization`, `OperationAuthorization`, `RelatedAuthorization`, `OutputFieldPath`. Use typed persisted/virtual shapes for checked dotted paths, or the explicit unknown-model string fallback; grant arrays may be readonly.
- named helper/result types (also `/advanced`): `OutputPlanningOptions`, `OutputFieldOptions`, `AllowedOutputFieldOptions`, opaque `DocumentAuthorization`, `ServiceOutputContext`, `ServiceOutputDecorator`, `AuthorizedSingleResult`, `AuthorizedListResult`, `NewArgs`, `NewOptions`. Acquire the service from a router/request; there is no standalone `Service` export or public issuer/execution/prepared API.

Subpath entrypoints:

- `@web-ts-toolkit/access-router/advanced` — request/service/option interfaces and include wire types, symbols (`MIDDLEWARE`, `DATA_MIDDLEWARE`, `PERMISSIONS`, ...), enums (`Codes`, `StatusCodes`), and validation helpers (`parseBody`, `parseQuery`, `parseBodyWithSchema`, request schemas). Runtime-context functions are internal; use root exports such as `createAccessRuntime`, `AccessRuntime`, and `defaultRuntime` for runtime ownership. `/advanced` does not export runtime instances or router-creation helpers.
- `@web-ts-toolkit/access-router/processors` — `copyAndDepopulate`, `copyPaths`, `movePaths`, `sliceArrays`, `countPaths`, `maskPaths` and processor option types (`ProcessCopy`, `CopyAndDepopulateOptions`, `CopyAndDepopulateOutput`, `ProcessorOptions`, `SliceProcessorOptions`, `ProcessSlice`, `ProcessCount`, `ProcessMask`, `ProcessorOutput`) for transforming populated documents.

## AJV validation contract

Install `ajv` in your application when using `fromAjv`; it is not a mandatory
access-router runtime dependency. Import the helper and `AjvValidatorLike` type
from `@web-ts-toolkit/access-router`.

- Synchronous validators return boolean **verdicts**: true returns the input
  (including any in-place AJV mutations), false returns normalized issues. Mutable
  `validate.errors` are snapshotted before any suspension or next validation call.
- Validators tagged `$async: true` return promises/thenables of **validated data**.
  Every fulfillment succeeds, including `false`, `true`, `null`, scalars and objects;
  the fulfilled value is returned, not substituted with the input. Shared
  `validate.errors` is never read on this path. Real AJV `ValidationError` rejections
  (`ajv: true`, `validation: true`, an `errors` array) provide input-local diagnostics
  under concurrency. Other exceptions propagate unchanged as operational failures.
- Untagged promises/thenables now reject with a configuration `TypeError`; their
  rejections are observed to avoid unhandled rejection. Sync non-boolean results
  also reject with `TypeError`.

<!-- doc-example: complete-runtime -->

```ts
import { Ajv, type AsyncSchema } from 'ajv';
import { fromAjv } from '@web-ts-toolkit/access-router';

const ajv = new Ajv();
const sync = fromAjv<boolean>(ajv.compile<boolean>({ type: 'boolean' }));
const asyncSchema: AsyncSchema = { $async: true, type: 'boolean' };
const asyncData = fromAjv(ajv.compile<boolean>(asyncSchema));
const syncResult = await sync(false);
const asyncResult = await asyncData(false);
if (!syncResult.success || syncResult.data !== false || !asyncResult.success || asyncResult.data !== false) {
  throw new Error('Both AJV validators must preserve valid false data');
}
```

**Migration:** pass genuine compiled AJV sync/async validators directly, without
casts or wrappers that discard `$async`. `AjvValidatorLike<T>` now separates sync
boolean and tagged async data signatures; use a literal tag (`$async: true as const`)
for structural async adapters. An async boolean-verdict wrapper must instead return
the original validated data or reject with an AJV validation error; merely adding
the tag changes false/true into successful data. Alternatively implement a
`RequestSchemaValidator` returning `{ success, data }` / `{ success: false, issues }`.
Rejections with only an `errors` property are operational, not AJV validation errors.
AJV's overloaded `AsyncValidateFunction<T>` extends its sync `ValidateFunction<T>`;
TypeScript can erase the tag in that base type, so runtime checks remain necessary.
Genuine AJV sync/async output types are inferred via their type-guard overload;
structural async output is inferred from the promise. Use `fromAjv<T>(syncValidator)`
for a structural boolean validator without a type guard. An inline schema can select AJV's earlier
sync overload even with `$async: true`; an `AsyncSchema`-typed schema, as above,
selects its async overload without casts (also for `compileAsync`). Runtime
behavior follows the validator's actual tag in either case.

## Default runtime vs. isolated runtime

The default export `acl` is bound to a single shared `AccessRuntime`, which is fine for most services.
For tests, multi-tenant services, or libraries that must avoid global state, create an isolated runtime:

<!-- doc-example: complete-runtime -->

```ts
import mongoose, { type Model } from 'mongoose';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

type User = { name?: string };

const runtime = createAccessRuntime();
runtime.setGlobalOptions({ globalPermissions: () => [] });
const userSchema = new mongoose.Schema<User>({ name: String });
const UserModel: Model<User> = mongoose.model<User>('ReadmeRuntimeUser', userSchema);
const userRouter = runtime.createRouter(UserModel, { basePath: '/users' });

// `runtime.createDataRouter(...)`, `runtime.createOpenApiRouter(...)`,
// `runtime.registerModelInstance(...)`, ...
void userRouter;
```

Two isolated runtimes with the same model name resolve against their own model registry and options without interference.
An isolated runtime does not look up process-global `mongoose.models` by string name; pass a `mongoose.Model` instance
to `runtime.createRouter(model, options)` or call `runtime.registerModelInstance(name, model)` before constructing a
string-name router. The default `acl` runtime retains string-name compatibility with `mongoose.model(name, schema)` and
adopts that exact global model instance into its registry on first lookup.

Cross-runtime composition on a shared request keeps independent runtime-owned state. When one request passes through
middleware from runtime A and then runtime B, B initializes its own core, resolves its own `globalPermissions`, and
uses its own base-filter cache; it never reuses A's permissions or cached filters, even when both runtimes use the
same `requestPermissionField` name. Repeating the same runtime's middleware on one request reuses that runtime's state
without rerunning its resolver. Values already present in `requestPermissionField` before any runtime middleware runs
are treated as application-supplied and preserved. Migration: if you relied on B silently inheriting A's resolved
permissions on a shared request, set those permissions explicitly before the chain or configure B's `globalPermissions`
to resolve them.

## createRouter overloads

`createRouter(modelName, options)` — on the default `acl` runtime, accept the Mongoose model name registered with `mongoose.model(name, schema)`. On isolated runtimes, the name must already be registered with that runtime.

`createRouter(model, options)` — accept a `mongoose.Model` instance directly. The instance is registered with the active runtime's registry, so a model attached to a non-default `mongoose.createConnection()` works without polluting the global registry.

<!-- doc-example: partial -->

```ts
import mongoose from 'mongoose';
import acl, { permissionsPlugin } from '@web-ts-toolkit/access-router';

// `uri` is the MongoDB connection string for the non-default connection.
const uri = process.env.MONGODB_URL_TENANT ?? 'mongodb://localhost:27017/tenant';
const conn = await mongoose.createConnection(uri).asPromise();
const schema = new mongoose.Schema({ name: String });
schema.plugin(permissionsPlugin, { modelName: 'TenantUser' });
const TenantUser = conn.model('TenantUser', schema);

const tenantRouter = acl.createRouter(TenantUser, { basePath: '/tenant-users' });
```

## Include Cardinality

Advanced read/list requests can attach related model data with `include` entries.
`op: 'count'` returns exact authorized counts and ignores include pagination fields such as `args.limit`.
`op: 'list'` materializes authorized related rows through the target model's normal list path, so target `limit`, `page`, `pageSize`, and `listHardLimit` bounds still apply to included rows.

Legacy count joins use one grouped aggregate for all parents per include execution.
They count distinct target documents in the authorized count scope: duplicate local
keys, repeated foreign array entries, or one document matching multiple local keys
do not inflate a parent's count. No matches produce `0`.

The target Mongoose schema casts both the complete authorized filter (including
tenant filters) and foreign-key operands, including after array unwind. ObjectId/String
joins and query setters retain association to the original parent keys. Invalid
schema operands/filters produce controlled `BadRequest` (direct HTTP 400; root entry
`statusCode: 400`, `code: 'bad_request'`) rather than misleading zero counts. Count
operation denials still prevent target work; a terminal `false` count row policy
retains legacy omitted include output and a grouped-service Forbidden result.

This is query-schema/setter parity, not execution of `countDocuments` middleware or
plugins: casting is synchronous and performs no query. Aggregate middleware still
belongs to the aggregate operation. Express router count authorization through
`operationAccess` and row-filter hooks. Arbitrary pipelines passed to
`router.model.aggregate(...)` are not automatically cast.

### Safe include output paths

Treat `path` as output only: put an invoice's related count at `lineItemCount`, for
example, rather than inside permission metadata. Legacy and correlated read/list/count
paths must not equal, descend from, or be an ancestor of the receiving model's
`documentPermissionField` (default `_permissions`). With `auth.policy.permissions`,
`auth`, `auth.policy`, and `auth.policy.permissions.canReadSecret` all reject;
`auth.policy.permissionsExtra` is an ordinary sibling. Equivalent legacy bracket
paths follow the same rule.

The include tree is preflighted before target persistence, including every supported
nested level using that receiving target's configuration. Overlaps return BadRequest
(direct HTTP 400; affected root entry 400/`bad_request` within its HTTP 200 batch
envelope), even if the relationship would be empty. Malformed reads do not retry
through list access. Ordinary output-field replacement remains supported; generated
include data cannot grant source-field permission.

## Correlated Includes

Besides the legacy `localField`/`foreignField` joins, `include` entries accept
a correlated variant (`mode: 'correlated'`) that runs a target query **per
parent document** using values from that parent. References are explicit
structural markers — `{ "$parent": "<field>" }`, dotted paths allowed —
recognized only in filter _value_ positions (bare values, field operators
such as `$eq`/`$in`, `$in` array elements, `$and`/`$or`/`$nor` clauses,
`$elemMatch` subtrees) and as the whole `id` of identifier reads. Plain
strings are never references: `'$special'` keeps its literal query meaning.
Match a literal `{ "$parent": "x" }` object with
`{ "$escape": { "$parent": "x" } }`. In a bare field position,
`{ "note": { "$escape": { "$parent": "x" } } }` resolves to
`{ "note": { "$eq": { "$parent": "x" } } }`, just like bare substituted
parent objects. The explicit spelling
`{ "note": { "$eq": { "$escape": { "$parent": "x" } } } }` remains
equivalent. Operator operands and array elements receive the literal object
without another `$eq` wrapper. Escapes are resolved once and never read parent
data; missing, null or changed `parent.x` cannot change the literal. Malformed
escapes are rejected, and expanded operands still consume complexity budgets.
This bare-position correction requires an updated server; older servers with
the bare-escape defect still require the explicit `$eq` spelling.

Wire shapes (the originating method fixes `op`; there is no override):

```json
{ "mode": "correlated", "model": "Org", "op": "read", "path": "org", "id": { "$parent": "orgId" } }
{ "mode": "correlated", "model": "Org", "op": "read", "path": "org",
  "filter": { "_id": { "$parent": "orgId" }, "active": true }, "args": { "select": ["name"] } }
{ "mode": "correlated", "model": "Post", "op": "list", "path": "posts",
  "filter": { "authorId": { "$parent": "_id" }, "title": "$special" },
  "args": { "select": ["title"], "sort": { "createdAt": -1 }, "limit": 5 } }
{ "mode": "correlated", "model": "Post", "op": "count", "path": "postCount",
  "filter": { "authorId": { "$parent": "_id" } } }
```

Semantics:

- References resolve against the **immediate parent** document as fetched
  from persistence (including internally loaded reference fields), before
  include attachment, `decorate` hooks, and task mutation. Nested
  `args.include` entries bind to the target doc of the enclosing include.
  Sibling include output never feeds references.
- A missing (`undefined`) or `null` reference short-circuits that parent's
  execution to the no-match shape with no target query: `read` attaches
  `null`, `list` attaches `[]`, `count` attaches `0`. Target misses produce
  the same shapes. The output path is always set.
- Identifier reads use the target's configured identifier behavior
  (`resolveIdentifierFilter`/`genIDFilter`, custom `resolveIdFilter`
  honored) with no read-to-list fallback. Counts use explicit count access
  with count semantics, independent of any list limit. List pagination
  (`skip`/`limit`/`page`/`pageSize`) applies **per parent** — contrast with
  legacy batched list includes, whose pagination applies across the parent
  set. Substituted parent values are data: objects match literally (never
  become operators) and arrays are never flattened.
- Each correlated entry counts toward `maxIncludeCount`; expanded filters
  are revalidated against `maxNodes`/`maxDepth`/`maxInValues`/
  `maxLogicalClauses`. Total inner executions per request/runtime are bounded by
  `maxCorrelatedQueries` (default `100`) and nesting by
  `maxCorrelatedDepth` (default `5`); exceeding any bound fails the whole
  request/affected root entry. Fan-out shares request-and-runtime-owned
  persistence admission (see below). Target authorization denials fail the
  request/affected root entry with zero target persistence queries; target
  runtime errors also fail that request/entry.
  `path` must be a non-empty valid field path (not `_id`, not `$`-prefixed);
  duplicates in one include array are `BadRequest`; collisions with parent
  fields overwrite except for the permission-metadata overlaps described above.
- Referenced parent fields are added to the parent DB select like legacy
  `localField`s, then trimmed unless allowed by field policy and selected.
  A policy-forbidden reference still resolves — only its query effects are
  visible, never the value.
- Direct count parents carry no `include`; correlated _count_ includes
  attach to read/list parents only. Correlated entries are accepted in both
  direct (`model-router.ts`) and root (`root-router.ts`) validators with
  identical verdicts; malformed correlated input is a controlled
  `BadRequest`, never a silent drop. Legacy entries also enforce safe output paths, and
  legacy-shaped entries carrying `$parent` markers are rejected.

The TypeScript wire types (`ParentRef`, `CorrelatedInclude`, `Include`) are
reachable without deep imports via `@web-ts-toolkit/access-router/advanced`
(which re-exports `./interfaces`). See the website `services`,
`configuration`, `validation`, and `openapi` pages for the full contract.

## Nested updates and trusted hooks

Partial updates follow **authorized policy paths**, not a generic deep merge. For a
customer profile editor, grant only the editable leaf and send nested JSON:

<!-- doc-example: partial -->

```ts
import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';

// Non-generic options accept dotted policy paths.
const options: ModelRouterOptions = {
  operationAccess: { update: true },
  permissionSchema: { 'profile.public': { update: true } },
};
const updateBody = { profile: { public: 'New display name' } };
// Pass options to acl.createRouter(CustomerModel, options); send updateBody to PATCH.
// Existing profile.secret and omitted siblings survive.
void [options, updateBody];
```

This applies to `updateOne`, `updateById`, existing-row upsert, and single/bulk
subdocument updates, including Mongoose nested and single-nested schemas. Authorized
leaves can initialize missing/null containers. Authorizing `profile` itself instead
allows whole replacement and removes omitted children; whole grants take priority
over overlapping leaf grants. An authorized object leaf replaces just that leaf.
Arrays replace as a whole when authorized as a whole; an explicit `items.0.public`
grant patches that indexed leaf. Omitted fields remain unchanged, admitted `null`
clears the selected field, and authorized empty objects/arrays replace it (Mongoose
`minimize` may omit empty objects in storage). A null/empty/malformed client container
does not supply descendant leaves and cannot clear a protected parent. Casting and
validation still apply. Literal dotted/bracket client keys are ignored by field
selection; they are not `$set`/`$unset` instructions.

Model `prepare` and `transform` hooks are trusted application code. Validation sees
selected client data before prepare. Prepare output is not re-filtered: it can add
protected/server-only fields, including dotted Mongoose paths. At strict ancestors of
admitted paths, supplied children of plain-object/array prepare output are applied
while omitted siblings survive. Other prepare paths remain whole assignments.
An empty partial container or omitted parent does not delete siblings; explicit
`{ profile: null }` / `{ profile: undefined }` can clear/unset it. An entirely
null/undefined prepare result supplies no assignments.

For deliberate parent replacement, trusted `transform.update` can call
`doc.set('profile', replacement)`. Do not blindly reintroduce unfiltered
`context.originalData`. The update order remains validation → prepare →
assigned-document transform → save → afterPersist → changes; snapshots/diffs reflect
persisted changes. Subdocument operations retain their own lifecycle and do not gain
model prepare/transform hooks.

## Subdocument writes with hidden responses

Appending an attachment or updating a line item can succeed without permission to
read it. After saving, mutation responses require the parent's read operation/row
access, checked against post-save state. Full-array **create** responses (including
POST `[]`) additionally require both `subs.<sub>.list` and `.read` operation guards
and row filters. **Single/bulk update** responses require subdocument read access
only and return readable mutation targets; they do not require list access.

All three use read-field projection plus `_id`. Counts reflect visible returned
rows, not stored/updated totals. Filtering preserves stored array order, including
service `addFirst` insertion order; bulk request order does not reorder the response.
`addFirst` remains a service option, not a new generated HTTP option.

When a response guard denies access, a row policy returns `false`, or no readable
parent/rows match, the committed write still succeeds:

| Operation     | Service/root result fields                                         | Direct HTTP body/status; root entry status |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| Create        | `success: true, kind: 'list', code: 'created', data: [], count: 0` | `[]`, 201; 201                             |
| Bulk update   | `success: true, kind: 'list', code: 'success', data: [], count: 0` | `[]`, 200; 200                             |
| Single update | `success: true, kind: 'single', code: 'success', data: null`       | JSON `null`, 200; 200                      |

Root batches retain their HTTP 200 envelope. **Do not retry a successful write just
because its output is empty.** Actual write denials and validation/persistence failures
retain their errors. Response visibility needs at most one extra parent query and
resolves applicable row policies once per mutation, rather than once per returned row.

## Virtuals (computed fields)

Package-level computed output fields ("virtuals") are async, request-aware
derived fields that behave like first-class response fields. The persisted
model below has **no** `fullAddress` field; the virtual defines it, the
permission schema authorizes it, `select` requests it, and the selected output
keeps it optional (authorization, absent dependencies, `undefined`, and
fail-closed errors can all omit it).

Canonical import shape: default `acl` for the runtime API (named
`createAccessRuntime` for an isolated runtime); virtual output types live on
the existing `./advanced` barrel — no new subpaths.

<!-- doc-example: partial -->

```ts
import acl, { type ModelRouterOptions } from '@web-ts-toolkit/access-router';
import type { SelectedPublicOutput } from '@web-ts-toolkit/access-router/advanced';

interface User {
  name: string;
  address: string;
}
interface UserVirtuals {
  fullAddress: string;
}

// The persisted model lacks fullAddress; the virtual computes it.
const options: ModelRouterOptions<User, UserVirtuals> = {
  basePath: '/users',
  permissionSchema: {
    name: { read: true },
    address: { read: 'canViewAddress' },
    fullAddress: { read: 'canViewAddress' },
  },
  virtuals: {
    fullAddress: {
      dependsOn: ['address'],
      read: async function (doc) {
        if (doc.address === undefined) return undefined;
        return `addr:${doc.address}`;
      },
    },
  },
};

// Selected output keeps the virtual optional: present when authorized and
// computed, omitted otherwise.
type Selected = SelectedPublicOutput<User, ['name', 'fullAddress'], UserVirtuals>;
const present: Selected = { name: 'Ada', fullAddress: 'addr:a1' };
const omitted: Selected = { name: 'Ada' };
// Pass options to acl.createRouter(UserModel, options); request with
// select: ['name', 'fullAddress']. Live updates use router.virtuals({...})
// or router.set('virtuals.fullAddress.read', { get, dependsOn }).
void [options, present, omitted];
```

There is one public `select` for persisted and virtual fields; the package
derives internal fetch vs output plans. `dependsOn` names are top-level
persisted fields relative to the definition's scope (dotted paths and
virtual-to-virtual dependencies are rejected). Dependencies are fetched
internally even when the caller may not receive them, then stripped unless
independently in the original authorized/requested output. Unknown persisted
getter fields are type errors (and configuration rejections at runtime).
Virtual names are never added to persisted `Filter`, sort/distinct inputs, or
client write types.

Lean/hydrated parity: getters always receive an isolated, stable plain-object
view (`toObject({ virtuals: false })` for documents, recursively isolated
copies for lean results, with `Date`/`Buffer`/`ObjectId` cloned by their own
constructors), so package virtuals compute for both lean and hydrated results.
Only returned field values are committed via document-aware helpers;
`undefined` omits the field; a throw omits it fail-closed with a structural
log (no raw values or secret-bearing text). Sibling virtual values are never
visible regardless of completion order, and mutating getter input cannot change
response data or lifecycle snapshots. Related documents finalize before parent
getters run, and embedded children finalize before their parent getter.

Coverage: every document-bearing public model output uses its own model's
definitions, permissions, selection, and effective access — direct
list/read/create/update/upsert/`new`-template outputs, Mongoose `populate`
targets, legacy + correlated `include` targets (including nested includes),
and embedded-subdocument outputs. Embedded scopes mirror
`permissionSchema.<field>.sub` (for example `contacts.sub.displayName` with
`virtuals.contacts.sub.displayName`), support nested arrays/single-nested
objects, and reuse the owning parent's internally computed grants; dedicated
`listSub`/`readSub`/`createSub`/`updateSub`/`bulkUpdateSub` routes finalize
visible rows only (hidden rows never run getters; denied post-save mutation
rows stay `[]`/`null`). Populate and include targets are trimmed with the
target model's policy — including registered targets without virtual
definitions. `select` keeps its arbitrary-string grammar (`?select=name,
fullAddress`, space/repeated query forms, body arrays/objects, and
`['-fullAddress']` exclusions all work); `select` on `populate` entries and
embedded fields follows the same rule.

Access matrix (`context.operation` always carries the initiating public
operation; the three accesses carry effective visibility):

| Output path                                                                     | `virtualAccess`                       | `outputAccess`                      | grants source                        |
| ------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------- | ------------------------------------ |
| list                                                                            | `list`                                | `list`                              | `list`                               |
| read / readFilter (incl. `read` using `list` fallback: all three become `list`) | `read` (or fallback `list`)           | same                                | same                                 |
| create / create branch of upsert                                                | `create`                              | `read`                              | `create`                             |
| update / update branch of upsert                                                | `update`                              | `read`                              | `update`                             |
| new template                                                                    | `create`                              | `create`                            | `create`                             |
| populated target                                                                | target's effective `read`/`list`      | same target access                  | same target access                   |
| included target (legacy + correlated, incl. nested)                             | include `op` (`read`/`list`)          | same target access                  | same target access                   |
| embedded values inside a model output                                           | owning output's getter access         | owning output's field-policy access | owning document's internal grants    |
| listSub / readSub                                                               | `list`/`read`                         | `list`/`read`                       | owning-parent internal `read` grants |
| createSub / updateSub / bulkUpdateSub response (existing rows post-save)        | initiating `create`/`update`/`update` | `read`                              | owning-parent internal `read` grants |

A create-only getter runs only on create/upsert-create responses; an
update-only getter only on update/upsert-update responses. On other responses
the name stays a registered virtual: omitted from output and never entering
persisted projections, write admission, or sort/filter/distinct handling. A
read-denied virtual (explicit deny, or document grants fail the rule) never
runs its getter on any path and fetches nothing for it; a document-dependent
rule defers to post-fetch evaluation with real grants.

Output-only database/write restrictions: registered virtual names for any
access (including bare `permissionSchema: true` rules and inapplicable
descriptors) are excluded from persisted projections, client create/update
admission (including whole-object/array grants and permissive/Mixed schemas),
and database sort/filter/distinct field authorization at the model-aware
service boundary. `delete` (identity only), `exists`, `distinct`, `count`, and
`countTrusted` never run getters. No submitted or computed virtual value is
persisted.

Trusted `decorate`/`decorateAll`/tasks boundary: virtuals evaluate before
`decorate`/`decorateAll`/tasks; internal-only dependency fields are stripped
before those hooks see the object. Trusted hooks may deliberately construct new
output from trusted context; no second authorization pass after those hooks is
promised.

Performance (measured, VIRT-11): prefer authorized finalized populate/include
data over per-row database calls. On a 24-row list with 2 getters at
`maxHookConcurrency: 4`, a virtual doing `Address.findById` per document issued
25 driver reads (1 list + 24 per-row) with peak active getter work 4; the same
label via `populate: [{ path: 'addrId', select: ['label'] }]` and a getter
reading the finalized `doc.addrId` object issued 2 driver reads (batched `$in`)
with identical output and the same peak bound. `maxHookConcurrency` (default
`10`) is a per-request/per-runtime ceiling on concurrently awaited getter +
row-finalization orchestration only — not a per-row multiplier, not leaf
persistence admission, not a process-wide connection limit; trusted getter
DB/network I/O runs outside the leaf persistence ceiling. Bounds limit
simultaneous work, not query counts: they do not collapse N+1 into 1.
Nested/related/embedded work shares the same bounded scheduling (limit-1
completes without deadlock; input order is preserved). Parent getters see only
finalized related/embedded outputs and must not rely on a related model's
stripped private fields.

### Virtuals compatibility notes

These notes describe approved external output/validation behavior; they are
not silent backward compatibility:

- Target-model populate trimming now applies to populated documents,
  including registered targets without virtual definitions (previously only
  query-level `select`/`match` restricted populate output, while includes
  trimmed via target `Service.find`/`findOne`). Populated responses may now
  omit fields that previously leaked (for example `alwaysSelect`-forced
  internal fields). This is an intended behavior change.
- Selection grammar is unchanged: arbitrary select strings remain accepted
  (no stricter signed-field/path grammar was adopted), so there is no
  malformed-path rejection guarantee and no grammar compatibility break.
  Registered-but-inapplicable virtual names remain virtual.
- Embedded recursion applies the scope's `permissionSchema.<field>.sub` rules
  with children finalized before parents; database fetches retain only the
  needed containers/dependencies (never `.sub` definition paths, and never
  both a container and its child path in one projection, avoiding path
  collisions). An omitted parent container is never exposed just because a
  child virtual uses it internally.
- Mutation/new selection behavior is unchanged: effective virtual selection is
  computed before evaluation and carried into the shared finalizer; public
  `_create` picks by explicit `select` after decorate/tasks and `_update`
  picks by explicit `select` (else the implicit `returningAll: false` pick);
  `new()` continues to ignore `args.select` (all applicable `create` virtuals
  are considered, subject to explicit exclusion). Any future honoring of
  `new.args.select` is an explicit contract change, not applied here.
- Release notes for this feature are generated from conventional commits via
  `pnpm changelog` (`repo-toolkit-changelog`) into the workspace
  `CHANGELOG.md`; that generated file is intentionally not hand-edited in this
  task (per repository constraint). The compatibility notes above live in this
  README section as the shipped consumer record.

## Persistence concurrency and resource limits

`requestComplexity.maxBulkConcurrency` (default `10`) bounds simultaneous awaited
**adapter/document persistence operations** for access-router model services sharing
one request and runtime. Direct service calls, root entries, subqueries, legacy
includes and nested correlated includes share admission. Different requests and
different runtimes have independent pools and correlated-query totals. Services
capture their owning runtime at construction; later ambient runtime changes do not
move their persistence to another pool.

Admission covers lazy adapter query settlement, document save/delete, and
service-triggered post-write populate. Bulk create submits one admitted singleton-array
adapter call per item, preserves result order, and still submits every item if one
rejects. Internal custom adapters must preserve array-in/array-out create semantics.
Their optional synchronous `castFilter` must cast a copy and preserve `$in` operand
order/cardinality; without it they retain identity casting.

Recursive orchestration holds no persistence permit while waiting for descendants,
so limit `1` supports nested includes. Internal map/run loops remain bounded per
invocation. `RootRouter.maxConcurrentOperations` separately bounds whole root
operations within each order group, with results in input-index order. Permits
release on success or error and pass FIFO to waiting work; release neither cancels
submitted siblings nor refunds the cumulative `maxCorrelatedQueries` budget (default
`100`). `maxCorrelatedDepth` (default `5`) separately bounds template nesting.

The ceiling is **not a MongoDB driver-command count**: one admitted operation can
run Mongoose middleware/populate that issues multiple commands. Router ACL, prepare,
afterPersist, decorate and recursive include orchestration are outside the permit;
Mongoose's own middleware runs inside the awaited operation. Direct database/network
calls from trusted hooks are not governed. This is neither a process-wide connection
pool limit nor a throughput guarantee. Controlled nested-query instrumentation reduced
peak active collection calls from 9 to 3 at limit 3 for the tested paths; it is not a
production benchmark or a guarantee about middleware/populate fan-out.

### Compatibility notes

These boundary fixes preserve public entrypoints and require no new dependency or
option. Move computed include output away from permission metadata. Nested leaf edits
now preserve protected siblings; prepare hooks relying on omission to delete a parent
must replace it explicitly in transform. Handle successful null/empty subdocument
responses as completed writes. Legacy counts now cast schema values and report invalid
operands as BadRequest; they remain grouped and independent of list pagination.
Persistence admission is shared across nested work within each request/runtime, so
timing may change. It does not provide transactions, idempotency or optimistic
concurrency protection for competing edits.

## Import styles

The package ships both a default export and named exports:

<!-- doc-example: partial -->

```ts
// default export (preferred for the runtime API)
import acl from '@web-ts-toolkit/access-router';

// named exports (useful when you only need specific helpers)
import { createAccessRuntime, fromZod } from '@web-ts-toolkit/access-router';
```

### Subpath import example

<!-- doc-example: complete-runtime -->

```ts
import { copyAndDepopulate } from '@web-ts-toolkit/access-router/processors';

type DepopulatedItems = {
  items: string[];
  itemsSnapshot: Array<{ _id: string; name: string }>;
};

const { items, itemsSnapshot } = copyAndDepopulate<DepopulatedItems>(
  { items: [{ _id: 'a1', name: 'Apple' }] },
  [{ src: 'items', dest: 'itemsSnapshot' }],
  { mutable: false },
);
// `items` is now `['a1']`; `itemsSnapshot` holds the original objects.
```

Without an explicit output type, `copyAndDepopulate(...)` returns the conservative `CopyAndDepopulateOutput`
record because runtime `src` and `dest` path strings can replace populated objects with ids and add new fields.
Unsafe paths or records missing the configured id field throw plain `Error` instances with descriptive messages.

## Documentation

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/access-router
- source docs live in the website/docs package of this repository; paths may move as the docs site evolves.
