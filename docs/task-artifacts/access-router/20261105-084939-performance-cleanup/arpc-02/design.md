# ARPC-02: bounded preparation reuse

This records the candidate design, not performance acceptance. The shared task
file remains coordinator-owned. Original ARPC-01/v1/v2 evidence and the original
baseline seal are unchanged.

## Selected-copy preparation

`prepareSelectedOutputCopy` owns immutable copies of normalized selection strings
and scope strings, plus the authenticated call/binding and its captured primitive
catalog. It prepares the existing exclusion/materialization policy lazily at the
first actual selected-value copy. Persisted and virtual values use the same lane.

Every consumption compares the current call, binding, scope and selection
contents against those explicit inputs. An edited/replaced private plan or
selection falls back to the original one-value preparation. A subsequent awaited
field rule can therefore change a selection without receiving a stale policy.
The cached lane still asserts the binding and publication/work ledger and still
materializes every selected value under that row's current budget/depth/prepaid
arguments. It does not cache field decisions, source values or materialized DTOs.
Binding validation also precedes initial selection capture and each reuse
comparison. Its private lazy copy slot is an explicit own `undefined` data
property, never an inherited process-prototype lookup.

This deliberately retains **O(selection length) comparisons per copy**. The
deterministic reduction is preparation arrays/closures and exclusion construction,
not a claim of constant-time eligibility, fewer actual copies or measured heap
savings. Singleton overhead and mutable-plan fallback must not be averaged away.

Raw output helpers keep their existing per-document preparation. No service,
request-wide, source-identity, ID or long-lived plan-identity cache is introduced.

## Ordinary LIST and CREATE rows

`createModelOutputFinalizer` is allocated in the actual service LIST and CREATE
row groups. Its first invocation prepares captured finalizer configuration and
the document-stage resolver **after** that row's populate handoff. Subsequent
rows reuse only those captured inputs, checking the current call/binding again.
Selected-copy preparation is shared by that same row-group closure.

The row mapper, concurrency admission, failure draining and finalizer await graph
are unchanged. The exported private single-row entry is a non-async forwarding
function to the original async body: it adds no Promise/adoption turn. Each row
still creates/uses its own admitted stage, facts, context, references, budget,
metadata completion and post-publication decoration. The closure is local to the
row-group invocation and is not attached to the service or a returned context.
No source mode is selected or weakened here; both modes use the same engine.

READ/UPDATE/UPSERT retain the single-row service entry and gain selected-copy
reuse within that construction. Existing helper batches and embedded array
construction share selected-copy preparation only within their already prepared
scope. Embedded preparation is **not** newly shared across different parent rows;
related target calls keep their own authorization and preparation.

## Current hook proof, not the old no-hoist assumption

- `captureModelAuthorizationConfiguration` validates document-permission
  definitions before call publication. `captureDocumentPermissionsDefinition`
  accepts callable leaves, or closed own-enumerable-data plain descriptors/access
  records. Descriptor `get` is callable and dependencies are validated strings.
- `resolveDocumentPermissionsDefinition` uses exact own access then own default,
  or the direct callable/descriptor. A callable's attached `.read`, `.list`,
  `.create`, custom-access or `.get` slots are not configuration parents.
- Owned configuration copying freezes containers and retains callable leaves.
  The finalizer configuration reader only wraps these captured slices; it does
  not make another native configuration copy on every row.
- Resolver preparation selects a captured hook reference; invocation remains
  inside `resolveDocumentStage`. In particular `hook.call` is still looked up
  for **each invocation**, with the original request receiver, arguments, gate,
  stage checks and context. Replacing runtime options in one hook changes only
  the next service call. It does not replace the hook captured by later rows of
  the current call.

New real LIST/bulk-CREATE tests in both modes and direct/public entries exercise
callable attached getters that must not run, observable `.call` getters that must
run once per row, per-row facts, and next-call-only option replacement. Existing
finalizer/preparation tests retain descriptor/default/custom-access and embedded
ordering coverage.

## Explicit no-change boundaries

- **Virtual-name traversal/classification is not hoisted across ordinary service
  rows.** It remains in row preparation at the original pre-stage boundary,
  including scope lookup and inspection of captured entries. Capturing a container
  alone is not used as proof that every virtual/native observation is inert.
  The already-existing helper batch preparation boundary is unchanged.
- Getter descriptor invocation, native selected copying/hydration, target
  population/includes, metadata queries and field-map callbacks stay row-local.
- No empty-map/absent-hook scheduler shortcut, sort capture, metadata coalescing,
  disabled-log optimization, dead-code removal or public API redesign is included.
- Preparation does not skip selected-output node/depth/payload/work admission,
  protected/opaque/reference/catalog rules or negative selects. No budget or
  document-stage owner is shared between rows.

## Verification/measurement boundary

Real-service work counts, focused checks, sealed source-selection diagnostics and
the bounded v2 calibration outcome belong in the companion implementation report.
The original core-v2 timeout packet is unusable and is never reconstructed into a
passing calibration. A new focused packet uses the unchanged maintained protocol,
seven paired rounds times two repeats, original baseline source, and unchanged
20% noise cap/warmup/window/slowdown rules. No candidate timing can establish
acceptance for a failed calibration cell.

Specialized related/native/embedded, failure/reentry/limit, public singleton
controls and allocation/retained-heap performance evidence remain required for
their corresponding claims. Passing behavior/work counts do not supply them.
