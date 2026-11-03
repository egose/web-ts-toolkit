> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Independent remaining README reference contexts

Broader lexical scan than the implementation inventory; matches are not defects by themselves.


## README.md:128–137

128: | Layer / public type                                                             | Where to put it                                                                                         | Scope and examples                                                                                                                                                                                          |
129: | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
130: | Runtime/global — `GlobalOptions`                                                | `api.setGlobalOptions({...})`, `api.setGlobalOption(key, value)`; `api.set` is an alias for these forms | That runtime's request grants (`globalPermissions`, `requestPermissionField`), logger and `requestComplexity`.                                                                                              |
131: | Model defaults — `DefaultModelRouterOptions`                                    | `api.setDefaultModelOptions({...})`, `api.setDefaultModelOption(path, value)`                           | Inherited values such as IDs, `operationAccess`, `hydration`, metadata posture and the two populate operation flags. Data/root routers do not inherit them.                                                 |
132: | Model router — `ModelRouterOptions<Model, Virtuals>`                            | `api.setModelOptions(name, {...})`, `api.createRouter(Model, {...})`, then router setters               | One registered model's guards, `permissionSchema`, hooks, virtuals, `hydration`, method defaults and target-owned populate flags. Routers for the same model/runtime share stored options.                  |
133: | Data router — `DataRouterOptions<Data>`                                         | `api.createDataRouter(name, {...})`, its setters, or `api.runtime.setDataOptions` / `setDataOption`     | Owned in-memory `data`, list/read guards, request-only fields/filters and decorators. No model `defaults` or model authorization policy. Set `idParam` and `idField` explicitly for data identifier routes. |
134: | Root router — `RootRouterOptions`                                               | Single-argument `api.createRouter({ basePath, operationAccess, ... })`                                  | The batch endpoint's scalar guard and batch/order/whole-operation limits; each target keeps its own policy.                                                                                                 |
135: | Per-method defaults — `Defaults<Model>` from `/advanced`                        | `ModelRouterOptions.defaults`, e.g. `defaults.publicListArgs` or `defaults.findOptions`                 | Query/presentation defaults for the **named method**, not hydration, global settings or trusted authority. Public wrappers and internal methods have separate buckets.                                      |
136: | Wire query / `args` / `options`                                                 | GET query, advanced body, or root entry                                                                 | Request-controlled selection, sorting, pagination and allowed presentation options; placement and spelling depend on transport (below).                                                                     |
137: | Trusted per-call policy — `ServiceAuthorization`, `MutationAuthorization`, etc. | The internal service's final `options.authorization`                                                    | Server-owned, method-specific row/input/output/related authority. Absent dimensions use request authority. Never a router default, HTTP option or reusable permission mutation.                             |


## README.md:207–213

207: `router.options` is a frozen **construction-time snapshot**. Runtime option getters
208: return frozen effective snapshots; read them again for current values. Ordinary plain
209: option containers are copied/frozen; hook functions, Mongoose models and other
210: non-plain handles keep their identities, and the logger is retained by reference.
211: Data has the stronger
212: [data-specific ownership contract](#in-memory-data-ownership), including detached
213: native-valued getter copies.


## README.md:234–243

234: Route guards and request-schema lookups read live policy. A retained model service
235: reads its originating runtime's current presentation options/defaults on each call;
236: model authorization calls capture
237: their current policy/configuration before awaiting hooks and keep it coherent for
238: that call. Each document/scope/access stage has separate grants. A data service
239: captures its data version at construction. Acquire a new service for replacement
240: data. Request permission initialization is reused within its owning request/runtime.
241: Base-filter results are reused for the same model/access and policy function;
242: replacing that function starts a fresh cache entry. Hook/persistence
243: limits are captured together on first work-state use and retained by that owner.


## README.md:245–253

245: Model services and public services retain their originating core, actor, row cache,
246: model connection and registry even if another runtime later initializes the same
247: Express request. This includes scalar counts/distinct, ID lookups, mutations, includes,
248: populate, subdocuments and field helpers. Services acquired later from a retained core
249: also belong to that core. The request's current `macl` slot still belongs to the new
250: runtime; acquiring a service there uses the new runtime's independent authority.
251: Each model authorization call and its private in-flight document stages remain owned
252: by the originating request/runtime/model/scope. Published DTOs and diagnostic contexts
253: are ordinary data, not reusable authority for either runtime.


## README.md:264–268

264: There is one document-stage engine and exactly two independent server options:
265: `readAuthorizationMode` / `listAuthorizationMode`, each `'isolated' | 'trusted'`,
266: default **isolated**. See the shipped [breaking migration guide](MIGRATION.md) for
267: before/after examples, all ten removed flags, errors and rollout guidance. No old
268: flag combination, dormant mode, output handle or compatibility alias remains.


## README.md:566–572

566: Generated routes, root batches, public service wrappers (`_list`, `_read`,
567: `_readFilter`, mutations and `_new`), include/subquery options and populate
568: descriptors are request-only. Supplying `authorization`, `overrides`,
569: `documentAuthorization`, or private prepared/execution controls in their control
570: slots returns BadRequest, including after a custom request validator transforms an
571: envelope. Legacy include overrides that were silently ignored now fail admission.
572: Unknown options are not forwarded to internal target services.


## README.md:595–601

595: Target output grants remain selection-limited, including schema-hidden fields and
596: virtuals. Populate match, include filter, ref IDs and join/correlation constraints
597: remain ANDed with the target scope after query transformation in every row mode.
598: Populate policies also apply after create/update/upsert. Neither parent nor related
599: grants flow into request-controlled `$$sq` queries. Related output is already-filtered
600: DATA; no child handles/lookups remain. A current target-dependent decision needs a
601: new normal target read/list. Private dependencies/join keys do not grant output.


## README.md:661–664

661: The finalizer owns a private stage, resolves boolean `DocumentGrants` once and
662: memoizes field decisions only until publication. Each row/call/target/pre-/post-write
663: stage is independent; genuine embedded scopes reuse their owner's facts. Returned
664: DTOs carry **no capability**, hidden authority symbol or reusable document handle.


## README.md:690–694

690: Raw output helpers use captured global permissions + frozen **empty document facts**
691: and explicit output-only server policy. They perform zero DB operations/document hooks,
692: no row checks, virtuals or omitted-value recovery. `!facts.suspended` may be true on
693: empty facts; that is not current-document proof. Metadata (`getDocPermissions` included)
694: is DATA, not authority. Never replace a retired handle with unrestricted/client grants.


## README.md:701–706

701: Mutations retain ordinary `args.select`, independent input admission, validation,
702: prepare/transform/save/afterPersist/change roles and separate pre-/post-write facts.
703: `new()` still ignores select. Presentation callbacks run after stage closure and may
704: construct data, with no automatic second filtering pass. Extract only
705: `{ outputFields: policy.outputFields }` for output helpers; full row/input/related
706: policies reject. There is no helper handle option or child lookup.


## README.md:710–715

710: Trusted server code can use **`authorization.inputFields`** on model `create`,
711: `updateOne`, `updateById`, and both `upsert` branches. `MutationAuthorization<TModel,
712: TVirtuals>` adds this dimension to the read policy; `CreateAuthorization` also
713: accepts it but rejects `rows`. `ServiceAuthorization` remains the read policy.
714: Reads (even with a mutation access name), `new`, output helpers, related read/count
715: targets and public options reject input authority, including reusable typed policies.


## README.md:779–798

779: Validation sees admitted data; prepare, transform, Mongoose casting/validation/save,
780: afterPersist and change hooks remain active. Trusted prepare additions and explicit
781: transform setters keep their business-write contract. Input/prepare values are
782: isolated; virtuals and control metadata are excluded even in permissive whole
783: containers and prepared JS values. Trusted prepare additions are business writes,
784: not a second input-policy grant.
785: JS class/hydrated containers are normalized to their data before admission; native
786: Date/Buffer/BSON leaves retain their types. Functions/symbols are not persisted input.
787: Mutation payloads, including class/Map contents and sparse arrays, obey
788: `requestComplexity` before parsing and input hooks; cycles return BadRequest. Input
789: admission and prepared-container sanitization also have hard structural ceilings of
790: 100 levels and 20,000 nodes. Grants do not bypass these limits. Unmodified persisted
791: virtual values outside the write boundary are preserved; they remain excluded from
792: ordinary output.
793: Pre-write update grants resolve once from the full hydrated persisted document, with input
794: structure (including schema-hidden roots and embedded fields) fetched privately. They are passed through
795: `context.docPermissions`, not stored on the document or reconstructed from input
796: `_permissions`. Create keeps request-only pre-document rules and resolves its document
797: hook after persistence. Post-write output gets fresh document grants; input authority
798: does not become an output handle or forge `_view`/`_edit` permissions.


## README.md:893–905

893: Child input uses the input rules above: descendant grants preserve denied siblings
894: and patch existing nested array objects by index; explicit nested-container grants
895: replace their eligible subtree. Only create/delete change the **outer** array's
896: membership. Virtuals/control metadata/identity cannot be elevated. Dedicated input
897: also retains the virtual-name scrub within Mixed/plain nesting; grants matching
898: those aliases reject before effects. Update document grants resolve once from the
899: original hydrated **owning parent**, including hidden
900: persisted inputs; create retains request-only pre-document admission. Output
901: resolves a fresh raw-parent read-stage result, independently of serialized metadata.
902: Virtual access is list/read/create/update respectively; output fields use list for
903: list and read otherwise, with document grants using read. Shared finalization
904: remains active. Dedicated operations retain Mongoose casting/validation/save hooks;
905: they do not invoke model-root validate/prepare/transform/afterPersist chains on a child.


## README.md:1088–1120

1088:       const related = await service.findOne(
1089:         { _id: rows[0]._id },
1090:         {
1091:           select: ['summary', 'contacts.email', 'customer', '-_id'],
1092:           populate: [{ path: 'customer', select: ['name', 'billingEmail'] }],
1093:         },
1094:         {
1095:           ...quiet,
1096:           authorization: {
1097:             rows: authorization.rows,
1098:             outputFields: { mode: 'grant', paths: ['internalNote', 'summary', 'contacts.email', 'customer'] },
1099:             related: {
1100:               customer: {
1101:                 model: Customer.modelName,
1102:                 operation: { mode: 'grant' },
1103:                 rows: { mode: 'scope', filter: { tenantId: 'backend' } },
1104:                 outputFields: { mode: 'grant', paths: ['billingEmail'] },
1105:               },
1106:             },
1107:           },
1108:         },
1109:       );
1110:       assert.ok(related.success);
1111:       assert.equal(Reflect.get(related.data, 'summary'), 'Status: ready');
1112:       assert.equal(related.data.internalNote, undefined); // granted, still unselected
1113:       assert.equal(related.data.contacts?.[0].email, 'alice@example.test');
1114:       assert.equal(related.data.contacts?.[0].ssn, undefined);
1115:       const child: unknown = Reflect.get(related.data, 'customer');
1116:       assert.ok(child && typeof child === 'object');
1117:       assert.equal(Reflect.get(child, 'billingEmail'), 'billing@example.test');
1118:       assert.equal(Reflect.get(child, 'tenantId'), undefined);
1119:       const targetRaw = await customerRouter.getService(req).pickAllowedFields(child, 'read');
1120:       assert.equal(Reflect.get(targetRaw, 'billingEmail'), undefined); // no retained target authority


## README.md:1250–1257

1250: Private prepared execution reuses the authorized predicate for upsert's update
1251: branch, include reads/lists/counts and `find.totalCount`. Correlated read/list
1252: templates parse before parent substitution; substituted marker-shaped parent data
1253: stays inert. Correlated count templates retain their non-parsing behavior. These
1254: tokens are identity-bound internal objects, never arguments, JSON options or DTO
1255: properties. Standalone `exists`, `count`, `delete` and `distinct` retain their
1256: request-policy signatures; sort/distinct permission checks remain independent
1257: of output grants. Original request/user permissions remain intact across calls.


## README.md:1275–1299

1275: - The requested persisted path needs an explicit request `read` rule, either a flat
1276:   dotted key or a nested `.sub` entry. A child grant does not authorize its parent.
1277:   Nested entries use ordinary ancestor gates and exact dotted-rule precedence.
1278:   Scalar `_id` retains its implicit identity access.
1279: - Declared scalar values (including native BSON scalar types), scalar reference IDs,
1280:   and scalar arrays are eligible. Closed nested objects, single-nested documents and
1281:   embedded document arrays require request-proven access to **every** declared returned
1282:   descendant. Missing or denied child rules reject the entire distinct operation.
1283: - Mixed values/descendants, arrays containing Mixed, whole Maps, unknown types,
1284:   recursive object schemas, discriminator-dependent composites and non-strict composites
1285:   cannot prove a complete safe value and reject, including when nested inside an otherwise
1286:   allowed container. A shared discriminator scalar path must have a scalar type in every
1287:   registered variant. An explicitly granted named Map key may qualify when its schema value
1288:   is a scalar or a fully allowed closed object. Admission never infers a type from the
1289:   current stored values.
1290: - Named nested policy restrictions are checked even when that path is absent from the
1291:   current Mongoose schema: stale/unknown policy branches do not authorize raw stored keys.
1292: - Permission metadata paths and their containers, protected stored descendants, and
1293:   registered virtual paths and their containers reject. Distinct never runs getters.
1294: - Boolean grants and permission expressions already satisfied by the original request
1295:   can authorize disclosure. Document-dependent grants and **all field-rule callbacks**
1296:   reject: executing a callback with fabricated empty document grants cannot prove that
1297:   the returned values are readable. Neither `docPermissions`, backend `outputFields`
1298:   grants nor a prior document handle supplies distinct authority. Evaluation failures
1299:   also deny; they do not retry through a more permissive field allowlist.


## README.md:1326–1336

1326: | Removed usage (before)                                                                               | Replacement (after)                                                                                                                                                                                                                                                       |
1327: | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
1328: | `overrides.select: ['internalNote']`                                                                 | `findOne(query, { select: ['status', 'internalNote'] }, { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } })`. Selection describes output; the grant supplies additive authority.                                                             |
1329: | `overrides.filter: trustedPredicate` for row authority                                               | Pass the desired ordinary query, then `authorization: { rows: { mode: 'scope', filter: trustedScope } }` or `rows: { mode: 'unrestricted' }`. The configured query transform still runs once.                                                                             |
1330: | `overrides.filter: preparedPredicate` for package query reuse                                        | Package-owned upsert/includes/counts now use authenticated private prepared-query execution. Backend consumers pass ordinary predicates to service methods; no prepared/skip flag is exposed.                                                                             |
1331: | `overrides.populate: [{ path: 'customer', select: ['name', 'internalNote'] }]`                       | Ordinary `populate` plus a parent `outputFields` grant for `customer` when needed and `related.customer: { model: 'Customer', operation: { mode: 'grant' }, outputFields: { mode: 'grant', paths: ['internalNote'] } }` for the independently needed target capabilities. |
1332: | `overrides.idFilter: { slug }`                                                                       | `findOne({ slug }, args, options)` / `updateOne({ slug }, data, args, options)` with explicit row policy when needed. By-ID calls always use normal identifier resolution.                                                                                                |
1333: | `overrides.effectiveSelect: ['status']`                                                              | `create(data, { select: ['status'] }, options)` / `updateOne(query, data, { select: ['status'] }, options)` / `upsert(query, data, { select: ['status'] }, options)`. Public `returningAll: false` computes this ordinary selection once.                                 |
1334: | `overrides.operation: 'upsert'`                                                                      | Call `upsert(query, data, args, options)`. Private execution retains initiating `upsert` while create/update branch accesses govern getters, output and document grants.                                                                                                  |
1335: | `pickAllowedFields(doc, 'read', ['internalNote'])` using helper `baseFields` as visibility authority | `pickAllowedFields(doc, 'read', { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } })`. For document-dependent decisions, use a new normal service query; presentation can use the already-filtered DTO.                                       |
1336: | `genSelect('read', select, true)` using helper `skipChecks` for provisional fetching                 | `genSelect('read', select, { authorization: { outputFields: { mode: 'request' } } })` / `genQuerySelect(...)`. Named planning defers document-dependent rules; use an explicit output grant when backend visibility is required.                                          |


## README.md:1385–1397

1385: **Ordinary document-grant behavior also changes in this release:** previously a
1386: skim read with metadata disabled and no virtual candidates could skip the document
1387: hook, losing otherwise allowed persisted fields. Full internal document grants
1388: are now resolved once per projected document/access stage regardless of `skim`,
1389: `includePermissions`, `includeFieldPermissions`, stripping or exposed-key limits.
1390: Only serialized metadata changes with those settings. Configure required private
1391: hook inputs with `alwaysSelectFields`; the published DTO is data, not an authorization
1392: certificate after those inputs and `_permissions` are removed. A later raw helper pick
1393: uses captured global permissions, frozen empty document facts and explicit output-only
1394: server policy, not retained document decisions. For current document-dependent facts,
1395: issue a new normal read/list with suitable selection/private hook inputs. This adds
1396: read/hook work; raw picks perform no hidden refresh. Temporary backend grants do not
1397: forge request-user `_view`/`_edit` or document-hook metadata.


## README.md:1421–1437

1421: - Planning defers document-dependent rules without running permission functions,
1422:   excludes definitely denied fields, strips virtual names from DB projections and
1423:   retains canonical private identity/dependency inputs. Omitted select uses ordinary
1424:   request candidates, or only identity output when `requireExplicitSelect` is true.
1425:   For compatibility, explicit null/empty select considers all candidates even with
1426:   that setting, still subject to request rules or explicit policy. It is no grant.
1427:   A fetch projection never proves response or population permission.
1428: - Pick/trim isolate hydrated or plain inputs rather than mutating persistence
1429:   documents, using captured globals, frozen empty document facts and explicit server
1430:   output policy. They run **no document hooks or hidden reads**. Serialized
1431:   `_permissions` and already-trimmed DTOs carry no authority or reusable handle.
1432:   Nested/array output rules, private `_id` retention and configured metadata posture
1433:   still apply. Unsupported scalar/array root documents reject; an array inside a row
1434:   remains a value. `genAllowedFields` only reports existing paths.
1435: - Request/input and query-field checks remain separate. Migrate writes to service
1436:   mutations with independent `authorization.inputFields`; output picks never admit
1437:   writes. Distinct/sort and request-user `_view`/`_edit` do not inherit output grants.


## README.md:1453–1459

1453: `service.pickAllowedFieldsMany<T>(rows, access, options?)` returns
1454: `Promise<readonly FilteredOutput<T>[]>`. Both `getService` and `getPublicService`
1455: inherit it; `req.macl.pickAllowedFieldsMany(modelName, rows, access, options?)`
1456: is the Core form. There is no DataService member, generated route, client control,
1457: batch alias, reusable preparer or output capability. Existing single-row helpers
1458: remain independently fresh, including their weaker `Promise<T>` declarations
1459: (which never proved that required fields survived).


## README.md:1461–1468

1461: Use this **optional** API for existing backend-held raw records only when the backend
1462: deliberately wants **one** initialized actor/model/catalog/configuration/scope/output
1463: policy capture before awaits or field predicates. It is **not semantically equivalent**
1464: to N fresh independent calls, nor a default handle/H3 migration recommendation.
1465: Later actor-view, schema or options changes apply to the next call, not later rows.
1466: Changing `req.user` alone does not rerun the initialized permission resolver. Trusted
1467: closures, live request properties, external state and native normalization effects
1468: are not frozen: this is not an atomic multi-object/database snapshot or sandbox.


## README.md:1491–1502

1491: Scope paths use ordinary response segments; grants remain **model-relative**
1492: (`contacts.label`, not `label`). Only output policy is accepted, never row/input/
1493: related authority, selection, handles, tokens, `purpose` or mode controls. Every row
1494: occurrence gets an independent isolated source/stage/memo in **all modes**, including
1495: repeated references. All sources are owned before the **first** field predicate;
1496: field evaluations are not shared between rows. The helper uses globals + literal
1497: frozen EMPTY facts + explicit output policy: **0 DB operations / 0 document hooks**,
1498: no virtuals, row/operation/related checks, reference-provenance recovery or restoration.
1499: `!facts.suspended` on EMPTY is not current-document authority. Presentation subsets
1500: normally need **zero helpers**; current document facts require a **new normal READ/LIST**
1501: with normal row policy/private hook inputs. See the executable alternatives in
1502: [M3](MIGRATION.md#m3-remove-handles-choose-presentation-or-a-fresh-normal-query).


## README.md:1529–1536

1529: `FilteredOutput<T>` is a **type-only** root/advanced export: recursively optional
1530: readonly string properties (including `_id`), nullish array elements without tuple/
1531: cardinality inference, string Maps normalized to readonly records, and canonical
1532: Date/RegExp/Buffer base types. Other BSON, hydrated documents (including string-ID
1533: documents), unknown inputs and recursion at depth eight become `unknown`; narrow or
1534: validate them. Readonly does not freeze native methods. The type is not a supported-
1535: input validator, exact-selected-field inference or authority certificate. No speedup,
1536: old performance-gate substitution or performance acceptance is implied.


## README.md:1548–1557

1548: These helpers retain the **request-only data evaluator**: no Mongoose registration
1549: or catalog, model document hooks, virtual computation, or DataService authorization.
1550: Field permission functions receive the original request as `this` and
1551: `(permissions, grants)`: `grants` is the built-in frozen empty document-facts record. Request-only
1552: means no model document facts, not a one-argument field callback. Operation `GuardHook`
1553: remains separate: it receives only `permissions`, with the original request as `this`.
1554: Allowed-fields returns a schema allowlist even with a null/empty document;
1555: pick/trim select existing values from it. An allowed container remains a whole value;
1556: use a scoped helper to filter a child. `_id` and metadata require ordinary data-field
1557: rules, with no automatic retention.


## README.md:1567–1570

1567: Data positional `skipChecks` never elevated data fields; remove that argument.
1568: Old arbitrary `baseFields` elevation is **removed and unsupported**, with no new
1569: bypass switch or data-grant capability. Model output policies/handles, positional
1570: arrays/booleans, unknown options and extra arguments reject on data helpers too.


## README.md:1654–1660

1654: Functions, symbol values/keys, cycles, proxies, arbitrary classes (including Mongoose documents/ObjectIds),
1655: native subclasses/custom native properties, foreign object/native prototypes, WeakMap/WeakSet/Promise and
1656: other unlisted instances are rejected inside `data`. Shared, resizable and detached binary storage also rejects.
1657: Admission throws a path-bearing `TypeError` before publishing any keys of that data-options update;
1658: an accessor that throws propagates its error and likewise leaves the update unapplied. Convert unsupported
1659: application objects into supported data first. This data-specific contract preserves the identities of
1660: hook functions, Mongoose models, validators and runtime handles in ordinary options.


## README.md:1662–1667

1662: Option getter results and `router.options` remain frozen snapshots. **Data snapshot plain containers are
1663: frozen; native-valued properties return fresh, detached mutable copies on each access.** This includes
1664: `runtime.getDataOptions(name).data`, `getDataSnapshot`, `getDataOption`/`getExactDataOption`, and bootstrap
1665: snapshots. Mutating a native copy or its Map/Set contents cannot alter that snapshot or later readers;
1666: native identity across property reads is not stable. Repeated ordinary option/snapshot reads reuse the
1667: safe frozen data view without traversing the whole dataset.


## README.md:1709–1712

1709: Advanced mutation validators drive dispatch: nested `data` validators run first, then the whole-body (`default`)
1710: validator sees that transformed envelope, and the service persists only the final parsed `data`, `select`,
1711: `populate`, `tasks`, and allowed `options`. Missing body options fall back to `returning_all`/`include_permissions`
1712: query params; only `includePermissions`/`includeFieldPermissions`/`populateAccess` (plus `returningAll` for update/upsert) are forwarded.


## README.md:1812–1816

1812: All rule values use `Validation`: `boolean | string | string[] | GuardHook`.
1813: Space-separated permission strings AND their names; arrays OR their entries.
1814: Hooks receive `AccessRouterPermissions`, run with `this` bound to the request,
1815: and may return a promise. Thrown/rejected operational errors retain normal error
1816: handling rather than permission fallback.


## README.md:1967–1982

1967: - Field grants, row filters, validation/prepare/decorate hooks, and related target
1968:   checks retain base accesses. A variant grant does not grant fields or bypass
1969:   target authorization.
1970: - Model `_read`/`_readFilter` misses with `tryList: true` still require **base
1971:   `list`** to retry. `list: false, advancedList: true` cannot grant retry;
1972:   `list: true, basicList: false` cannot block it. Forbidden/BadRequest never retry.
1973: - Upsert keeps its create/update branch policy; authorizing `advancedUpsert` does
1974:   not also require `advancedCreate` or `advancedUpdate`.
1975: - Subdocument mutation-response visibility uses base parent/subdocument read/list
1976:   checks. Disabling basic reads does not hide otherwise readable output. Base
1977:   response denial can still yield a successful null/empty response after a write
1978:   (see [Subdocument writes with hidden responses](#subdocument-writes-with-hidden-responses)).
1979: - Root batches use existing operation names and target base entry checks, with
1980:   entry 401 inside the HTTP 200 batch envelope. Variants are not new root `op`
1981:   values. Direct service calls remain trusted application calls with their
1982:   existing checks; they do not infer basic/advanced access from `req.method`.


## README.md:2198–2208

2198: Cross-runtime composition on a shared request keeps independent runtime-owned state. When one request passes through
2199: middleware from runtime A and then runtime B, B initializes its own core, resolves its own `globalPermissions`, and
2200: uses its own base-filter cache; it never reuses A's permissions or cached filters, even when both runtimes use the
2201: same `requestPermissionField` name. A sync/async `globalPermissions` result of `null` or `undefined` establishes an empty
2202: permission map, replacing any prior runtime-owned grants. Missing or non-callable resolvers follow the same empty-grants
2203: rule. Middleware awaits asynchronous resolution before publishing the new core and continuing. Repeating the same
2204: runtime's middleware on one request reuses that runtime's state without rerunning its resolver. Permission maps (including
2205: `{}`) supplied in `requestPermissionField` before any runtime middleware runs are treated as application-owned and
2206: preserved. Migration: if you relied on B silently inheriting A's resolved
2207: permissions on a shared request, set those permissions explicitly before the chain or configure B's `globalPermissions`
2208: to resolve them.


## README.md:2388–2398

2388: Include output is tracked separately from the original projected source. Document
2389: permission hooks and virtual dependencies see the source values even when a successful
2390: attachment replaces the same business field (for example, `restricted`). Only results
2391: actually produced by include execution are attached after source selection and field
2392: filtering using the target's own captured policy, facts and output filtering during
2393: private in-flight construction. Attached results are ordinary DTO data, not reusable
2394: target authority. A legacy read miss or omitted result never turns an existing source
2395: value into an attachment: that field still requires source selection and permission.
2396: Correlated empty results remain explicit
2397: `null`/`[]`/`0` attachments. This separation also applies to nested targets and each list
2398: row; include output does not mutate fetched persistence documents.


## README.md:2645–2660

2645: Coverage: every document-bearing public model output uses its own model's
2646: definitions, permissions, selection, and effective access — direct
2647: list/read/create/update/upsert/`new`-template outputs, Mongoose `populate`
2648: targets, legacy + correlated `include` targets (including nested includes),
2649: and embedded-subdocument outputs. Embedded scopes mirror
2650: `permissionSchema.<field>.sub` (for example `contacts.sub.displayName` with
2651: `virtuals.contacts.sub.displayName`), support nested arrays/single-nested
2652: objects, and reuse the owning parent's internally computed grants; dedicated
2653: `listSub`/`readSub`/`createSub`/`updateSub`/`bulkUpdateSub` routes finalize
2654: visible rows only (hidden rows never run getters; denied post-save mutation
2655: rows stay `[]`/`null`). Populate and include targets are trimmed with the
2656: target model's policy — including registered targets without virtual
2657: definitions. `select` keeps its arbitrary-string grammar (`?select=name,
2658: fullAddress`, space/repeated query forms, body arrays/objects, and
2659: `['-fullAddress']` exclusions all work); `select` on `populate` entries and
2660: embedded fields follows the same rule.


## README.md:2678–2683

2678: A create-only getter runs only on create/upsert-create responses; an
2679: update-only getter only on update/upsert-update responses. On other responses
2680: the name stays a registered virtual: omitted from output and never entering
2681: persisted projections, write admission, or sort/filter/distinct handling. A
2682: known-denied virtual adds no dependency-only fetch and never runs its getter;
2683: a document-dependent rule may fetch inputs before real grants deny the getter.


## README.md:3286–3293

3286: Measured batching: with two compatible target groups, **1 and 24 source rows both
3287: issued 1 parent find + 2 target finds**, in lean and hydrated modes. Getter counts
3288: were 4 and 96; observed persistence/getter peaks were 1/1 or 2/2 at matching limits.
3289: Compatible rows/virtuals/scopes batch and deduplicate fetched IDs, not reconstructed
3290: slots or public authorization. Covered raw work can be reused only within its
3291: captured request/runtime/family/private-read mode, hydration and ID/projection coverage. Different scopes
3292: still query separately; ordinary per-parent correlated public queries remain
3293: per-parent. This is not a constant-query-count promise for independent includes.


## README.md:3351–3354

3351: Put security in operation/row/fact hooks, not output side effects. If a caller needs
3352: a DTO or business effects, perform a separate ordinary authorized read, check success
3353: and handle errors at its explicit additional read/hook/output cost. See the shipped
3354: [guard migration](MIGRATION.md#model-conditions-are-facts-only-not-an-implicit-dto-read).


## README.md:3373–3380

3373: **Awaiting another service from a hook is supported, including at limit `1`.**
3374: Its descendant hooks reuse the admitted chain through private async context.
3375: Every live callback scope admits **one immediate child branch at a time**, FIFO,
3376: including that child's descendant drain. Thus `Promise.all` of nested service
3377: calls cannot bypass the limit: sibling hook stages serialize in that chain.
3378: At most `maxHookConcurrency` independent leaf branches are admitted; recursively
3379: waiting ancestor callbacks still exist and do **not** consume extra permits.
3380: The setting does not promise that all unsettled callback frames fit within it.


## README.md:3470–3478

3470: These boundary fixes preserve public entrypoints and require no new dependency or
3471: option. Move computed include output away from permission metadata. Nested leaf edits
3472: now preserve protected siblings; prepare hooks relying on omission to delete a parent
3473: must replace it explicitly in transform. Handle successful null/empty subdocument
3474: responses as completed writes. Legacy counts now cast schema values and report invalid
3475: operands as BadRequest; they remain grouped and independent of list pagination.
3476: Persistence admission is shared across nested work within each request/runtime, so
3477: timing may change. It does not provide transactions, idempotency or optimistic
3478: concurrency protection for competing edits.
