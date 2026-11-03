> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09F-I: hydrated-source pre-copy accounting blocker

Implementation stopped before product edits. This is a narrow implementation
blocker, not rejection of the approved collection API and not a claim that no
larger redesign could solve it.

## Conflicting boundaries

The approved contract simultaneously requires:

1. The existing isolated raw/hydrated source admission, reusing the current stage
   and materializer rather than replacing the prototype.
2. One 16 MiB cumulative copied/prepared payload owner, including every actual
   source/native copy and replacement, debited **before** supported-state copying.
3. Existing single-row semantics unchanged; no dependency changes.

`packages/access-router/src/acl/document-stage.ts:512–520` delegates hydrated
source normalization to `input.toObject({ virtuals: false, flattenMaps: true })`
before `copyDocumentView(raw)` creates the bounded materializer admission. The
normalizer can also fall back to `_doc` after an exception. No byte-accounting or
copy-admission callback is passed into Mongoose.

The installed Mongoose 9.11.4 implementation performs its own copies inside this
delegation:

- `lib/document.js:4307`: `clone(this._doc, options)` precedes transforms.
- `lib/helpers/clone.js:49–93`: supported Mongoose values delegate to `toObject`.
- `lib/types/buffer.js:189–193`: the supported MongooseBuffer method constructs
  `new Binary(Buffer.from(this), subtype)`.

These are ordinary supported-state copies in the dependency, not arbitrary
application allocations. An application transform can subsequently discard that
native value; a ledger attached only to our eventual source/materializer cannot
observe its size or debit it before the copy. The structural-work owner would
also need to include the dependency's actual source-copy traversal, not only the
later materializer traversal.

## Actual bounded evidence

`hydration-accounting-boundary.test.ts` invokes the **current source Core helper**
without changing its normalizer, budgets, stages, policies or evaluator. The only
spies observe real `Buffer.from` calls and the existing materializer input.

All three tests passed:

| Probe | Observed native source copy | Event order | Eventual source |
| --- | --- | --- | --- |
| One hydrated row | One `Buffer.from` of 17,825,792 bytes (17 MiB) | native-copy → application transform → materializer | `{ name: 'kept' }` |
| Five sequential independent calls with the same hydrated object | Five `Buffer.from` calls of 4,194,304 bytes; 20,971,520 bytes (20 MiB) observed in total | Same order per call | Five separate `{ name: 'kept' }` inputs |
| Earlier normalization effect replaces later stored native state | Stored payload is initially 1 byte; an allocation-free `valueOf` swaps in a preexisting native; Mongoose subsequently copies 17,825,792 bytes | normalization-hook → native-copy → transform → materializer | `{ name: 'kept' }` |

These observed byte totals are lower bounds for these particular dependency
copies, **not** total-allocation or RSS measurements. The second probe is five
independent existing calls, **not** a new batch or a performance comparator. It
demonstrates why repeated hydrated occurrences would need actual accounting at
the delegated normalization boundary; it makes no assertion that old calls have
a collection-wide limit. The third uses the canonical inherited
`Document.prototype.toObject`, not an overridden root method. Its application
callback allocates nothing: the demonstrated large copy is made by the standard
MongooseBuffer normalizer **after** the callback returns. A prescan of the initial
raw storage therefore does not suffice either. Rejecting this admitted hydrated
shape or snapshotting/replacing its normalization behavior would change the
required existing source-admission boundary.

Command, environment, output and exit status are retained under
`logs/02-boundary-probe.*` (three tests, exit 0). The earlier two-test pass remains
under `logs/01-boundary-probe.*`; the third proof was then added and the complete
file rerun. No failed test attempt was discarded. Vite emitted a
configuration-loader compatibility warning; all assertions passed.

## Why I stopped

Threading a ledger through the current library budget owners alone cannot meet
the approved pre-copy contract. Counting the transformed result afterwards
undercounts demonstrated copies; precharging a guessed maximum or counting only
the initial raw graph is not exact accounting of the opaque normalizer's actual
copies, as the third probe demonstrates.
Running normalization speculatively to discover cost would allocate before
admission and repeat observable normalization effects.

The existing dependency boundary exposes no budget/debit seam. Closing it needs
an accounting-aware hydration design that covers dependency-owned copying before
execution, or a decision to alter that boundary. I have not implemented a second
hydration normalizer, patched Mongoose, excluded these copies as arbitrary hook
work, narrowed the API to raw rows, changed the limit, or shipped an incomplete
public method/type. Any of those would conceal or change the approved contract.

The coordinator needs to resolve this exact boundary before F-I can resume.
The approved API itself, normal helper freshness, EMPTY facts and H4 facts-only
guard remain untouched. Nothing here authorizes migration advice, timing,
benchmark/gate changes, OAR-09 acceptance or OAR-10.
