> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Coordinator-applied OAR contract resolutions

Investigation has resolved these technical choices; no user decision is required.
Coordinator should incorporate the following before handing off OAR-02. This file
does not amend shared task status by itself. It makes no implementation claim.

## A1 — C2: private stage state, close and publication scope

1. Call ownership captures request/runtime/model/name/response scope plus primitive
   access and a private execution identity before hooks/awaits. Retain actual receiving
   service guard (`readServiceExecution` and related derivation); neither a shared
   configuration nor parent call authenticates a different request/runtime receiver.
2. One stage state machine: `created -> resolving -> ready -> building -> closed`.
   `closed` retains success/failure only for deterministic rejection; it cannot resolve,
   evaluate, admit children, mutate memo or publish again. A failure can close from
   any earlier state. Keep a single resolution promise and per-key field pending/
   fulfilled/rejected record, including shared failure. Actual synchronous callbacks
   can finish synchronously; actual async callbacks yield. Check open/generation after
   every resume and immediately before commit. Do not add graph validation wrappers.
3. Facts/field memo are row+stage-local. An equal ID/object value cannot identify a
   stage; same source instance used for another row/call gets another stage. Genuine
   embedded occurrences share ONLY their owning immutable facts/preparation; they
   have authenticated extended scopes and independent decisions. Ancestor rule
   evaluation may explicitly use its still-live owning stage. Related targets have
   separate facts/bindings, original actor, and their own captured source modes.
4. The private publication owner is established when root output rows are admitted,
   BEFORE includes/populate/native work. It owns child stages, output budget(s),
   cancellation/failure and pending work. Complete child fields/metadata, includes,
   virtuals and parent permission metadata before closing/publishing that row.
   Child stage closes after its own private builder is complete; parent getter sees
   the ordinary filtered child value, never a child handle. Dedicated parent fact
   stage stays open until all scoped child decisions complete.
5. Close the authorization stage BEFORE trusted application presentation (`decorate`,
   `decorateAll`, optional ServiceOutputDecorator, tasks). Such callbacks receive
   only immutable diagnostic facts and already-filtered DTOs; no automatic second
   authorization pass, stage reopening, or later memo access. Private orchestration
   that decorates metadata while building may consume its live private stage. This
   preserves useful callbacks without keeping public authority alive. Immutable facts
   in a returned context remain diagnostics after close, not a bearer capability.
6. Each service operation owns its publication/failure group. LIST stages may finish
   independently but returned data is buffered until all rows/count work succeeds;
   one controlled structural/grant failure yields no partial list. Root batch entries
   remain independent operations, not a transaction. Successful child results under
   an uncommitted parent are private construction results, not public capabilities.
7. On error/cancellation set failure/closed FIRST, stop admission of later output
   work, and drain already-admitted library tasks with `allSettled`/an equivalent
   tracked barrier BEFORE returning/rejecting. Preserve SharedHookGate FIFO/depth-64
   reentry/draining and persistence pools; never hold a persistence permit over hooks.
   The current row-map `Promise.all` is insufficient: surviving workers keep running
   after its first rejection. Do not change gate concurrency semantics to compensate.
8. There is no new public cancellation/token option. Existing handled request aborts
   or private driver cancellation close the group; do not interpret normal IncomingMessage
   `close` as an abort after a completely read body. Detached application work is not
   a cancellable sandbox: if it later enters a closed stage, reject cheaply; if it
   starts an independent service call, that is a new call under normal admission.
   Never wait for arbitrary untracked closure activity. Clear sources/memo/builders
   from closed owner records once tracked work drains, retain only the minimum closed
   tombstone. No result-keyed WeakMap or issued-document membership remains.

## A2 — C3: literal facts, callback signatures, fulfilled-result admission

- Export `DocumentGrants = Readonly<Record<string, boolean>>`, `FieldPermissionHook`
  with exactly `(permissions, grants)` and original-request `this`, and a separate
  `FieldValidation` for existing bool/string/string-array/function field grammar.
  `GuardHook`/`Validation` remain request-only and one-argument. Decouple OperationAccess
  from FieldOperationAccess so a required second field argument is not a guard type.
- Accept Object.prototype/null-prototype plain maps only. Test `types.isProxy` BEFORE
  prototype/keys/descriptors. Reject ALL symbols, accessors, non-enumerable slots,
  nested/rich/native/function/undefined/nonboolean values and protected keys
  `__proto__`, `constructor`, `prototype`, `_doc`, `$__`, `__v`, `_permissions`,
  `_view`, `_edit` (plus exact configured document-metadata field name). Keys otherwise
  remain arbitrary strings (including prefixed/dotted permission names); do not invent
  an identifier-only permission DSL. Reserve one root slot + one slot per fact under
  20,000, so at most 19,999 facts. No truthiness coercion or partial accepted map.
- One package-owned null-prototype map, safe own definitions, freeze once; never
  freeze/retain application return. Missing hook gives singleton frozen empty facts
  without warning; thrown/rejected hook gives empty facts plus fixed-category warning once per owning resolution; logger
  failure cannot affect denial/publication. Fulfilled invalid result gives controlled
  `ServiceAuthorizationError`/400, outside application-error catch. No fallback hook.
- Validation itself must never invoke map getters/traps/coercion. Avoid automatic
  promise assimilation of arbitrary SYNC maps/proxies in library wrappers: invoke
  callback within a boxed scheduler result; recognize actual Promise with native
  brand checking, await it only when genuinely asynchronous, then normalize fulfilled
  value outside catch. Arbitrary thenables are not a new hook-return API. Promise
  machinery/application async code may already have performed assimilation before
  delivery; the library cannot promise a JS sandbox or undo those effects. A returned
  sync record with accessor `then` must reject without reading it. Add this test.
- Preserve existing field grammar, truthiness/error-denial behavior for untyped field
  callback RETURNS and short circuit; the new public return type remains boolean/
  Promise<boolean>. Literal-boolean strictness applies to grant VALUES, not a newly
  invented field policy language. Planning still defers function rules (no imaginary
  document facts), including functions that ignore the second argument.
- Adopt ARCHITECTURE.md's write-admission clarification: existing-document update/
  upsert-update and dedicated existing-parent input are separate document-bearing
  pre-write fact stages. Create/request-only input, data and raw output helpers get
  empty facts. All field callbacks see the two args consistently, with original actor.
- All actual hook invocations (including explicit genDocPermissions utility, pre-write,
  output/new/dedicated parent/unbound-lane removal) use the ONE normalizer. No utility
  permits rich facts to come back through another path. Embedded shares owned facts
  without revalidation/copying. Invalid pre-write facts fail before save. Invalid
  post-write output facts still 400 with no DTO; this does NOT roll back persistence.

## A3 — C4: source-only modes, configuration and target origins

- New options are exactly `readAuthorizationMode?: 'isolated' | 'trusted'` and
  `listAuthorizationMode?: 'isolated' | 'trusted'`, both effective defaults isolated.
  Setters accept literal enums or undefined to restore inheritance; null, booleans,
  coercible objects, arrays and dotted subproperties of a scalar mode reject.
  No coercion/prerequisites/dormant state, client/per-call selector or old-engine fallback.
- Capture root READ mode even when effective visibility retries under LIST. A retry
  uses a fresh stage/facts but same initiating capture/receiver. Embedded inherits
  owning mode. Related output uses target's captured mode for ITS effective read/list
  access (not root mode). Independent nested callback calls capture fresh model mode.
  Writes/new/dedicated origins always isolated; their read-shaped outputs are not
  READ origins. Related targets continue independent target operation/row/private policy.
- Trusted only permits ordinary source/document-hook borrowing. It does NOT borrow
  grant maps, actor map, authority/configuration/native policy leaves, diagnostics,
  getter/private-populate views, returned virtual values, another parent's mutable DTO,
  or any output certificate. Hidden unvisited source subgraphs need no whole-source
  shape/bound traversal. Isolated detaches full admitted projection once, and supplies
  disposable hook/getter views; argument mutations are not output writes. Neither mode
  guarantees closure/database freshness or mutation-free application/native callbacks.
- Unsupported source/hydrated shapes may reject or normalize ONCE BEFORE hook;
  native normalization state is private and explicit, never a third copied engine.
  Keep actual hydration/Mongoose/BSON controls. No rerun of document hook on fallback.
  Library source/native serializers use bounded admitted data, not unbounded raw
  Code.scope/DBRef.fields/wire containers. Intrinsic/raw hydrated conversion must
  honor supported source semantics; arbitrary custom `toObject` work is trusted code,
  not something an Object.freeze makes bounded/immutable.
- Retire all ten old names listed C4. Recognize them ONLY for presence-based rejection
  in model/default/global/data/root settings and all control namespaces, including
  inherited/nonenumerable JS slots and false/undefined. New modes also reject in
  non-model/default-model config and HTTP/root/per-call/include/populate/subquery/
  defaults policy namespaces BEFORE hooks/DB work. Same-named business data fields
  stay inert; don't recursively treat every `options`-looking payload as authority.
- Validate complete bulk setter payload before publication; no partial update/warning
  if one key invalid. Undefined model override restores captured runtime defaults for
  NEW calls, default undefined restores built-in isolated. In-flight calls retain old
  capture. Emit fixed-structure warning once per effective transition into trusted
  per configuration owner/access (model or default target); repeat same assignment
  emits none, transition back isolated emits none. No prerequisite warning categories
  survive. Logger throw never changes committed configuration, return or security.

## A4 — C5/C6: contexts, capabilities and actually reachable special cases

- Adopt EXACT context table in ARCHITECTURE.md. No output source/snapshot aliases or
  mutable model/native backing state; no spreading mutation contexts. Keep legitimate
  ModelHookContext mutation data unfrozen. `ServiceOutputContext` diagnostics only.
  Return DTOs have no hidden symbol, reusable stage/cert, member or WeakMap authority.
- Fresh named output-policy helpers never run doc hooks/DB/virtuals/row admission,
  on raw or previously trimmed data. Every function uses same evaluator and empty
  facts. Remove known-output distinctions/overloads; explicit output policy is still
  server-only and independent of input/rows. A document fact name supplied in DTO
  metadata must not become grants. Source model trusted does not change helper mode.
- Preserve `guard({modelName,id,condition})` by internal fresh read-stage evaluation,
  not returned metadata or public callback/handle. One normal query path, exact row/
  request/target admission, same permitted READ retry behavior. Controlled invalid
  grants/structure are 400, ordinary denied/missing guard is Unauthorized as today.
- Explicit metadata generators remain utilities, not authority; private integrated
  metadata consumes live stage facts. Remove obsolete unbound supplied-parentGrants
  finalizer lane (`resolveFinalizerDocPermissions`, getSubParentGrants and old raw-plan
  sub-row finalizer chain), not useful raw hydrated parent APIs. Inventory all reachable
  declarations and migration guidance rather than keeping aliases to a closed stage.
- Post-save dedicated visibility currently catches ALL errors into empty output
  (`model-subdocument-service.ts:154-177`). Preserve ordinary visibility/policy/getter
  failure semantics, but RE-THROW package-controlled invalid-facts/selected-budget/
  structural failures to 400, no partial response. This is a required breaking error
  reporting change: persistence may have succeeded; callers must not auto-retry.
  Do not roll back writes, bypass validation, or repeat hooks/persistence to hide it.

## A5 — C6: exact budget owners, selected/native accounting and poison

Budget is a private resource owner, NOT an authorization certificate. Keep depth 100
inclusive, reject 101; at most 20,000 consumed slots, reject next. Failure poisons owner
permanently even if an intermediate callback/catch swallows the thrown exception.

| Budget/work | Owning scope; when a new budget is legitimate |
| --- | --- |
| Entry policy/config/captured catalog, raw query/input | Boundary-specific bounded admission owners, not a counter reset on every private read. Keep existing requestComplexity/query/bulk/persistence bounds and necessary input/policy normalizers. Entry graph must be detached before application exposure; do not remove non-output native bounds. |
| Facts | One root+keys admission per actually resolved owning document fact stage (19,999 bool keys max). Embedded uses owned facts, not new allowance; related rows and independent pre/post stages own distinct maps. |
| Isolated projected source | One bounded source admission per owning root projection, with embedded descendants inside same traversal. Related target is an independently admitted target projection, not an escape for unlimited source shape. Trusted only root-shape admission; denied/unvisited graphs not recursively probed. |
| Disposable hook/getter/private-input views | Each explicit application exposure is a separate bounded isolation copy of admitted view, per getter/slot as required. This is not output-budget replenishment or reusable proof. Never share mutable native leaves between these views or owned authority. |
| Selected output | One publication budget per externally returned root ROW (single/read/template/write row or dedicated output child), depth relative to that root. LIST array/page size is separately bounded by request/query limits, not one 20k quota for all rows. Embedded, attachment spines, related target output occurrences, selected native prep/wire expansion and metadata consume this SAME remaining root-row budget. Raw helper has one fresh invocation/output-root budget; recursive helper/child transitions reuse it. |
| Batching related targets | Retain batching/read/getter counts, but thread private budget owner edges before target construction. For a target built once for several parent occurrences, register every receiving root budget + depth offset/multiplicity first; each construction charge synchronously debits all recipients BEFORE policy/value/native work. Per-parent isolated copies of a completed child debit their own remaining root budget before copying; no getter rerun. Private construction-cost/shape ledger may avoid a second DTO walk but must live only in publication owner, never result-keyed authority. Unknown replacements cannot claim a ledger. No full fresh 20k target allowance followed by unchecked attachment into a depleted parent. |
| Independent service helper/read | A truly independent call has its own budget/actor/facts/rows. Passing a native/container between internal stages in the SAME published graph is NOT such a call and cannot reset counters/depth. |

Preserve the existing materializer's testable accounting, not a smaller new counter:

- Root value consumes one slot. Every ordinary encountered selected key consumes
  one BEFORE policy/value descriptor; its accepted child root is prepaid (zero
  extra), denied/protected key still costs one but value stays unread.
- Arrays charge length including holes PLUS encountered own index properties, as
  current primitive does; reject symbols/nonnumeric/accessor slots before value use.
- Map root/encountered keys charge, and accepted Map entry traversal consumes its
  existing child-root charge. Named-map scope planning also charges attempted keys,
  including protected names, before builtin has/get. Do not invoke subclass iterator.
- Selected Code/DBRef/wire native root consumes its root; contained scope/fields and
  oid/replacement roots charge same budget and increment effective depth. Explicit
  primitive native scalar state/bytes stays scalar. Keep current direct examples:
  Code({safe:1}) needs 3 remaining slots (native+scope+key), not 2; all-denied
  ordinary/Code/DBRef/wire tests make respectively 19,999/19,998/19,997/19,998 policy
  calls before overflow with no denied getter observations. No budget reset in wire
  replacement, nested native, DBRef fields, Map/array containers or metadata expansion.
- Keep active-ancestor cycle rejection across ordinary and native layers. Repeated
  noncyclic aliases count each output occurrence; no unique-object shortcut. Safe
  own data definitions must survive native hooks installing inherited setters.
- Poison on any selected structural/native admission error, not just size overflow.
  Application getter throws still omit field; invalid returned SELECTED native/value
  admission and budget failure are controlled whole-operation 400. The finalizer's
  current broad catch on returned trusted values cannot turn poison into omission.
  Check poison after app callbacks and before final commit, including native hooks
  that catch an inner overflow and return a small value. Invalid fulfilled fact maps
  also poison the publication owner, never partially accepted grants or partial rows.
- Bound traversal BEFORE BSON serialization; serializer must receive prepared inert
  admitted containers/native shells, not original Code.scope/DBRef.fields/wire result.
  Arbitrary native callback internals cannot be preempted; library traversal/serde can.

## Sequencing consequence

Facts/actor can be a bounded first vertical slice. Full engine cutover cannot leave
old capability aliases or silently ignore ten old live flags until OAR-05/06.
Use the atomic OAR-03 cutover boundary in IMPLEMENTATION-HANDOFF.md; later tasks own
deepening/auditing those surfaces, not keeping a compatibility engine in the interim.
