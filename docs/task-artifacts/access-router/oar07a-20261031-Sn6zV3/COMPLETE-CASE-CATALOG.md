> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Original OAR-07A case inventory

Exact incoming bytes/hashes are saved under `originals/`. IDs below refer to test registration templates, not a fabricated expanded runtime case count. Every parameterized registration and enclosing matrix expression is preserved in the JSON catalog and original source.

## authorization-fast-path-owner.unit.test.ts (5 registration templates)

- **001**, line 129: checks receiving $changed for $origin/$mode through $entry [it.each(
    selections.flatMap((selection) =>
      (['request', 'runtime'] as const).flatMap((changed) =>
        (['resolve', 'derive'] as const).map((entry) => ({ ...selection, changed, entry })),
      ),
    ),
  )] — trusted related derivation retains cheap parent ownership (FP06-R1)
- **002**, line 148: authenticates the supplied source owner for $origin/$mode [it.each(selections)] — trusted related derivation retains cheap parent ownership (FP06-R1)
- **003**, line 165: does not trust a different target model/name/scope/path for %s [it.each(['list', 'read'] as const)] — trusted related derivation retains cheap parent ownership (FP06-R1)
- **004**, line 182: rejects a registered foreign $changed receiver for $origin/$mode before dispatch [it.each(
    selections.flatMap((selection) => (['request', 'runtime'] as const).map((changed) => ({ ...selection, changed }))),
  )] — trusted related derivation retains cheap parent ownership (FP06-R1)
- **005**, line 212: keeps genuine related/retry capture and target policy for $origin/$mode [it.each(selections)] — trusted related derivation retains cheap parent ownership (FP06-R1)

## authorization-fast-path-runtime.integration.test.ts (6 registration templates)

- **001**, line 222: keeps READ metadata request-only even when backend output grants allow a denied document field [it] — active real query assembly, targets, getters and private inputs
- **002**, line 243: retains target-own gates/grants, metadata/dotted includes and builder-known membership; hydrated=%s [it.each([false, true])] — active real query assembly, targets, getters and private inputs
- **003**, line 300: shares only an actual fetched populate target, including one hydrated conversion; hydrated=%s [it.each([false, true])] — active real query assembly, targets, getters and private inputs
- **004**, line 321: keeps private argument-four admission/isolation, public masks and child-before-parent views [it] — active real query assembly, targets, getters and private inputs
- **005**, line 354: keeps legacy/correlated include source collisions separate from grants and preserves order/count semantics [it] — active real query assembly, targets, getters and private inputs
- **006**, line 389: matches current all-eight ON ordinary READ/LIST/root output while retaining actual active handles [it] — active real query assembly, targets, getters and private inputs

## authorization-fast-path-runtime.unit.test.ts (26 registration templates)

- **001**, line 132: omits stage/grant/context/source/graph passes for six dynamic rows, embedded=%s [it.each([false, true])] — genuine trusted query work, not publication fusion
- **002**, line 211: only the matching active %s flag removes copies; opposite/off/dormant retain them [it.each(['list', 'read'] as const)] — genuine trusted query work, not publication fusion
- **003**, line 255: retains ordered async field rules and only shares mutable grants in %s mode [it.each(['off', 'dormant', 'active'] as const)] — explicit intentional risks, with current all-eight ON comparisons
- **004**, line 292: borrowed source/grant mutations change a later denial to allowance; active=%s [it.each([false, true])] — explicit intentional risks, with current all-eight ON comparisons
- **005**, line 331: omitted fetch-only %s observations can change denial to allowance without skipping the hook [it.each(['Date', 'BSON'] as const)] — explicit intentional risks, with current all-eight ON comparisons
- **006**, line 374: trusted root authority survives descendant replacement, but never wrong roots; active=%s [it.each([false, true])] — explicit intentional risks, with current all-eight ON comparisons
- **007**, line 421: keeps concurrent same-ID rows/calls independent and actual hook work bounded [it] — cheap authority and independent decision owners
- **008**, line 469: rechecks cheap caller bindings at actual async resume and shares its failed memo, without graph passes [it] — cheap authority and independent decision owners
- **009**, line 502: rejects all ten wrong tuple/root/stage/forgery cases with zero graph or snapshot observations [it] — cheap authority and independent decision owners
- **010**, line 545: keeps stale allow/deny memo and resolves a different row child with THIS parent grants, not its handle [it] — cheap authority and independent decision owners
- **011**, line 585: shares actual pending decisions/failures per stage, never between same-ID stages or requests [it] — cheap authority and independent decision owners
- **012**, line 640: keeps issued embedded roots on metadata dotted spines without graph transfers or a stronger association [it] — actual state, safe selected values and metadata
- **013**, line 669: defines selected helper and virtual return slots safely after native code installs inherited setters [it] — actual state, safe selected values and metadata
- **014**, line 711: preserves nested issued spine membership and the original leaf memo during helper filtering [it] — actual state, safe selected values and metadata
- **015**, line 740: takes compatible %s root fallback BEFORE its single hook [it.each(['proxy', 'symbol', 'non-enumerable', 'unsafe'] as const)] — actual state, safe selected values and metadata
- **016**, line 769: copies an exotic ordinary grant fallback once without rerunning the hook or per-field grant copies [it] — actual state, safe selected values and metadata
- **017**, line 807: budgets and safely filters a supported BSON wire fallback that expands into a selected container [it] — actual state, safe selected values and metadata
- **018**, line 824: controls new embedded-array traversal and retained-helper replacement budgets/cycles [it] — actual state, safe selected values and metadata
- **019**, line 850: mixes trusted/copy-fallback rows before hooks and retains strict graph handling on the copied row [it] — actual state, safe selected values and metadata
- **020**, line 887: converts a hydrated root exactly once with virtuals:false/flattenMaps:true and still runs its hook [it] — actual state, safe selected values and metadata
- **021**, line 901: builds metadata once with separate map/borrowed leaves; metadata=%s [it.each([true, false, 'dotted'] as const)] — actual state, safe selected values and metadata
- **022**, line 947: copies a selected native once but never observes unselected huge/cyclic/exotic source leaves [it] — actual state, safe selected values and metadata
- **023**, line 964: rejects selected %s with a controlled error, no hook rerun or partial publication [it.each([
    ['proxy', () => new Proxy({}, {})],
    ['custom', () => new (class Value {})()],
    ['function', () => () => true],
    ['symbol', () => Symbol('value')],
    [
      'cycle',
      () => {
        const value: any = {};
        value.self = value;
        return value;
      },
    ],
    ['slots', () => Array(20001)],
    [
      'depth',
      () => {
        let value: any = {};
        for (let index = 0; index < 101; index++) value = { nested: value };
        return value;
      },
    ],
  ] as const)] — actual state, safe selected values and metadata
- **024**, line 1004: flattens selected Maps, drops protected keys, and supports a native subclass fallback once [it] — actual state, safe selected values and metadata
- **025**, line 1025: reconstructs a named Map branch once without visiting unrelated Map values [it] — actual state, safe selected values and metadata
- **026**, line 1055: retains stable per-getter document views and staged returns without grant/context deep copies [it] — actual state, safe selected values and metadata

## document-authorization-validation.unit.test.ts (16 registration templates)

- **001**, line 44: %s reader checks an ordinary stage twice [it.each(['access', 'grants'] as const)] — ordinary document owner reads retain both snapshot observations
- **002**, line 57: rejects ordinary-source mutation during $name normalization [it.each([
    { name: 'Date.hasInstance', constructor: Date, key: Symbol.hasInstance },
    { name: 'RegExp.hasInstance', constructor: RegExp, key: Symbol.hasInstance },
    { name: 'Map.hasInstance', constructor: Map, key: Symbol.hasInstance },
    { name: 'Set.hasInstance', constructor: Set, key: Symbol.hasInstance },
    { name: 'Buffer.isBuffer', constructor: Buffer, key: 'isBuffer' },
  ])] — ordinary document owner reads retain both snapshot observations
- **003**, line 91: retains scheduled/resume validation and a settled %s decision [it.each([false, true])] — ordinary document owner reads retain both snapshot observations
- **004**, line 112: retains both observations after an equal proxy replacement [it] — ordinary document owner reads retain both snapshot observations
- **005**, line 131: retains the check after binding getters in explicit stage admission [it] — ordinary document owner reads retain both snapshot observations
- **006**, line 147: keeps the access reader binding check after the full reader binding check [it] — ordinary document owner reads retain both snapshot observations
- **007**, line 160: rejects grant-native values before native methods or owner publication (OAR-02) [it] — ordinary document owner reads retain both snapshot observations
- **008**, line 176: shares owned boolean facts while still checking every receiving binding (OAR-02) [it] — ordinary document owner reads retain both snapshot observations
- **009**, line 186: does not infer live-input purity from a native normalized to an ordinary snapshot [it] — callback-capable snapshot validations retain their duplicate observations
- **010**, line 201: rejects a wire hook mutation on %s admission, including an override installed before import [it.each(['access', 'grants', 'memo'] as const)] — callback-capable snapshot validations retain their duplicate observations
- **011**, line 239: does not confer validity on a stale different stage reentered from a native callback [it] — callback-capable snapshot validations retain their duplicate observations
- **012**, line 263: checks queued %s mutation before a cold evaluator starts [it.each(['source', 'binding'])] — ordinary memo owners are revalidated at every existing asynchronous boundary
- **013**, line 273: checks queued %s mutation after a synchronous evaluator [it.each(['source', 'binding'])] — ordinary memo owners are revalidated at every existing asynchronous boundary
- **014**, line 286: checks %s mutation on both pending consumers after an await [it.each(['source', 'binding'])] — ordinary memo owners are revalidated at every existing asynchronous boundary
- **015**, line 312: checks queued %s mutation on a settled memo hit [it.each(['source', 'binding'])] — ordinary memo owners are revalidated at every existing asynchronous boundary
- **016**, line 323: authenticates %s before reusing a retained rejection [it.each(['source', 'binding'])] — ordinary memo owners are revalidated at every existing asynchronous boundary

## embedded-preparation-boundary.unit.test.ts (2 registration templates)

- **001**, line 40: retains normalization observations even on ordinary configuration (skip: $skip, copy: $copy) [it.each([false, true].flatMap((skip) => [false, true].map((copy) => ({ skip, copy }))))] — PIPE-05 embedded preparation cannot reuse resolved child calls
- **002**, line 88: keeps same-ID child grants, actor and field decisions independent after repeated derivations [it] — PIPE-05 embedded preparation cannot reuse resolved child calls

## finalizer-preparation.unit.test.ts (14 registration templates)

- **001**, line 50: does not copy a getter-only stable document when no getter can run: %s [it.each(['none', 'inactive', 'missing', 'private'] as const)] — ARCPU-03 finalizer pass preparation
- **002**, line 102: resolves the captured document hook once per pass for %s rows, not per row [it.each([1, 6])] — ARCPU-03 finalizer pass preparation
- **003**, line 124: keeps only the projected-stage and metadata document copies in an authenticated no-virtual list [it] — ARCPU-03 finalizer pass preparation
- **004**, line 143: does not duplicate a large base-context snapshot for a single no-virtual invocation [it] — ARCPU-03 finalizer pass preparation
- **005**, line 157: does not clone an unused public configuration graph for default embedded traversal [it] — ARCPU-03 finalizer pass preparation
- **006**, line 170: never hands private prepared configuration to traversal callbacks [it] — ARCPU-03 finalizer pass preparation
- **007**, line 204: does not hoist mutable function properties along a hook lookup: %s [it.each(['read', 'custom.read'])] — ARCPU-03 finalizer pass preparation
- **008**, line 240: captures the getter view before candidate permission callbacks, not after their side effects [it] — ARCPU-03 finalizer pass preparation
- **009**, line 268: preserves no-virtual lean/hydrated selection, dotted metadata and custom aliases [it] — ARCPU-03 finalizer pass preparation
- **010**, line 309: detaches native-valued metadata options before any per-row application method can use them [it] — ARCPU-03 finalizer pass preparation
- **011**, line 343: does not share Set-backed metadata option state between rows in one prepared pass [it] — ARCPU-03 finalizer pass preparation
- **012**, line 369: keeps hook documents, grants, contexts, snapshots and getter views independent at concurrency one [it] — ARCPU-03 finalizer pass preparation
- **013**, line 470: reuses scope setup without sharing mutable embedded/related getter contexts or grants [it] — ARCPU-03 finalizer pass preparation
- **014**, line 569: revalidates %s identity before consuming another prepared row [it.each(['binding', 'call'] as const)] — ARCPU-03 finalizer pass preparation

## initial-output-snapshot-copy.unit.test.ts (21 registration templates)

- **001**, line 93: keeps all eight modes distinct (mask=%s) [it.each(Array.from({ length: 256 }, (_, mask) => mask))] — initial output-copy capture and prerequisite
- **002**, line 137: does not relax fresh helpers, arbitrary parent derivations, writes or dedicated subdocuments [it] — initial output-copy capture and prerequisite
- **003**, line 156: matches identity order without cloning, freezing inputs or losing non-enumerable data/aliases [it] — bounded clone-free admission and identities
- **004**, line 181: retains node/depth/array limits and counts repeated primitive/aliased visits [it] — bounded clone-free admission and identities
- **005**, line 199: rejects cycles, accessors, functions, symbols, unsafe keys and invalid array properties [it] — bounded clone-free admission and identities
- **006**, line 221: falls back for proxies, iterated native containers, subclasses and unsupported kinds [it] — bounded clone-free admission and identities
- **007**, line 258: agrees with the copier and identity oracle on seeded ordinary graphs [it] — bounded clone-free admission and identities
- **008**, line 281: omits only an active %s initial snapshot, including package transfers [it.each(['List', 'Read'] as const)] — initial association, fallback and retained authority
- **009**, line 314: keeps strict fallback native observations and unsupported failures in the active mode [it] — initial association, fallback and retained authority
- **010**, line 327: keeps the original copy fallback for accessor/proxy ownership bindings [it] — initial association, fallback and retained authority
- **011**, line 347: explicitly drops this pass's BSON hook/validation observations only when both flags are active [it] — initial association, fallback and retained authority
- **012**, line 366: does not alias document-hook inputs, grants or native leaves; source checks remain independent [it] — initial association, fallback and retained authority
- **013**, line 396: documents a possible denial-to-allowance change from omitted normalization observations [it] — initial association, fallback and retained authority
- **014**, line 413: retains exact bindings, call/stage ownership and graph identities in active mode [it] — initial association, fallback and retained authority
- **015**, line 445: keeps concurrent same-ID finalizer rows, getter inputs and decision grants detached in active mode [it] — initial association, fallback and retained authority
- **016**, line 510: does not give independent reentry or a replacement runtime the originating copy mode [it] — initial association, fallback and retained authority
- **017**, line 543: %s inherits, normalizes, warns on dormant/active transitions and rolls back [it.each(unsafeInitialOutputCopyOptions)] — server configuration, capture and copy-specific warnings
- **018**, line 576: publishes paired inherited modes atomically, avoids failed-publication warnings and tolerates logger failure [it] — server configuration, capture and copy-specific warnings
- **019**, line 597: warns only after both options and all inherited models have been published [it] — server configuration, capture and copy-specific warnings
- **020**, line 629: retains call/handle mode across await and rollback (initial=%s) [it.each([false, true])] — server configuration, capture and copy-specific warnings
- **021**, line 664: rejects %s as a control by presence but not as business data [it.each(unsafeInitialOutputCopyOptions)] — server configuration, capture and copy-specific warnings

## list-snapshot-checks.unit.test.ts (18 registration templates)

- **001**, line 69: stays strict for non-literal opt-in %j [it.each([undefined, false, 'true', 1, {}, new Boolean(true)])] — temporary server-only list snapshot setting
- **002**, line 79: warns once per model enable transition, not once per call or row [it] — temporary server-only list snapshot setting
- **003**, line 92: normalizes malformed model setters to strict mode and permits rollback [it] — temporary server-only list snapshot setting
- **004**, line 105: isolates model/runtime settings and ignores a same-spelled global option [it] — temporary server-only list snapshot setting
- **005**, line 115: inherits defaults on a new model without relaxing an explicitly strict existing model [it] — temporary server-only list snapshot setting
- **006**, line 137: captures mode before a suspended list hook (initial unsafe=%s) [it.each([false, true])] — temporary server-only list snapshot setting
- **007**, line 169: does not relax %s, including list-access reads [it.each(['read', 'create', 'update', 'subList'])] — temporary server-only list snapshot setting
- **008**, line 178: does not relax fresh helper, embedded or related-derived calls [it] — temporary server-only list snapshot setting
- **009**, line 200: does not accept a private list marker outside its exact output contract: %j [it.each([
    { scopePath: ['child'] },
    { access: { ...listAccess, rowAccess: 'read' } },
    { access: { ...listAccess, outputAccess: 'read' } },
    { applicability: 'output' as const },
  ])] — temporary server-only list snapshot setting
- **010**, line 226: rejects the flag in method defaults.%s [it.each(['findOptions', 'publicListOptions'])] — temporary server-only list snapshot setting
- **011**, line 233: keeps same-spelled payload/predicate fields inert rather than treating them as configuration [it] — temporary server-only list snapshot setting
- **012**, line 237: rejects per-call opt-in through %s [it.each(['args', 'options', 'authorization'])] — temporary server-only list snapshot setting
- **013**, line 253: skips source comparisons but keeps detached hook snapshots, grant reads and field decisions [it] — retained protections and explicitly weakened source checks
- **014**, line 277: deliberately stops detecting changed source %s [it.each(['value', 'date', 'bytes', 'id'] as const)] — retained protections and explicitly weakened source checks
- **015**, line 287: retains exact stage input, call, binding and unforgeable handle checks [it] — retained protections and explicitly weakened source checks
- **016**, line 303: retains independent same-ID owners and rejects structurally equal output forgeries [it] — retained protections and explicitly weakened source checks
- **017**, line 318: still rejects changed associated output %s [it.each(['value', 'date', 'bytes', 'replacement'] as const)] — retained protections and explicitly weakened source checks
- **018**, line 334: does not change structural limits or admit unsupported document values [it] — retained protections and explicitly weakened source checks

## output-field-policy-cache.unit.test.ts (25 registration templates)

- **001**, line 68: prepares three no-virtual static fields once for %s rows, not per row [it.each([1, 7])] — ARCPU-02 call-owned field-policy preparation
- **002**, line 118: consults an authenticated document memo before even the first configuration/rule preparation [it] — ARCPU-02 call-owned field-policy preparation
- **003**, line 136: keeps mixed global/document rules, stateful decisions and backend grants separate from request metadata [it] — ARCPU-02 call-owned field-policy preparation
- **004**, line 202: does not trust replaced plan fieldStates, even after another field/call has warmed the cache [it] — ARCPU-02 call-owned field-policy preparation
- **005**, line 215: preserves earlier ancestor callbacks before static denials, but bypasses them for backend grants [it] — ARCPU-02 call-owned field-policy preparation
- **006**, line 242: retains request memo decisions across exact and nested lookup routes: %s [it.each([false, true])] — ARCPU-02 call-owned field-policy preparation
- **007**, line 260: does not freeze live function-backed schema lookup properties across stages: %s [it.each(['root', 'ancestor', 'sub'] as const)] — ARCPU-02 call-owned field-policy preparation
- **008**, line 288: preserves exact dotted-rule precedence without conflating nested lookup routes: %s [it.each([false, true])] — ARCPU-02 call-owned field-policy preparation
- **009**, line 315: keeps access-specific rules, distinct stages and separate calls independent [it] — ARCPU-02 call-owned field-policy preparation
- **010**, line 358: `does not normalize invalid function-backed native rules into grants (trimmed: ${knownOutput}, array: %s)` [it.each([false, true])] — ARCPU-02 classification and native-leaf isolation > for (const knownOutput of [false, true])
- **011**, line 391: does not freeze rules normalized from native BSON when wire hooks change between stages [it] — ARCPU-02 classification and native-leaf isolation
- **012**, line 424: does not freeze a prefix normalized from native BSON between stages [it] — ARCPU-02 classification and native-leaf isolation
- **013**, line 454: does not bypass native rule rejection after an earlier stage warmed field preparation [it] — ARCPU-02 classification and native-leaf isolation
- **014**, line 475: preserves coercion receiver identity per field read and per metadata resolution [it] — ARCPU-02 classification and native-leaf isolation
- **015**, line 512: retains current classification and conservatively defers unprefixed runtime document grants [it] — ARCPU-02 classification and native-leaf isolation
- **016**, line 565: copies native-valued/coercible prefix configuration for every evaluation rather than sharing cache leaves [it] — ARCPU-02 classification and native-leaf isolation
- **017**, line 639: does not share mutable callback grants between fields or rows [it] — ARCPU-02 classification and native-leaf isolation
- **018**, line 668: never recovers deferred grants or reruns document hooks on known trimmed DTOs [it] — ARCPU-02 classification and native-leaf isolation
- **019**, line 694: rejects a mutated %s stage on a warmed static hit [it.each(['date', 'buffer', 'bson', 'nested'] as const)] — ARCPU-02 memo-hit and owning-stage validation
- **020**, line 714: revalidates %s after lookup of an already-settled memo [it.each(['snapshot', 'binding'] as const)] — ARCPU-02 memo-hit and owning-stage validation
- **021**, line 726: revalidates %s after a deferred user callback [it.each(['snapshot', 'binding'] as const)] — ARCPU-02 memo-hit and owning-stage validation
- **022**, line 786: retains owning-parent routing once and per-element leaf decisions with shared rule preparation [it] — ARCPU-02 memo-hit and owning-stage validation
- **023**, line 800: classifies ancestor rules against the routed owner, not the child permission view: %s [it.each([false, true])] — ARCPU-02 memo-hit and owning-stage validation
- **024**, line 823: validates the owning stage on static child hits (mutate after lookup: %s) [it.each([false, true])] — ARCPU-02 memo-hit and owning-stage validation
- **025**, line 837: rejects a child rule that mutates retained owning-parent values [it] — ARCPU-02 memo-hit and owning-stage validation

## output-publication-fusion-withdrawal.unit.test.ts (3 registration templates)

- **001**, line 67: does not ship the former flags or private completion in declarations or installed documentation [it]
- **002**, line 85: %s keeps both publications even if JavaScript supplies the former unknown names [it.each(['direct-list', 'public-list', 'direct-read', 'public-read'] as const)] — original private publication remains for direct and public READ/LIST
- **003**, line 124: retains the third Date observation and later same-ID denial (former names supplied=%s) [it.each([false, true])]

## read-snapshot-checks.unit.test.ts (13 registration templates)

- **001**, line 72: requires a literal read opt-in: %j [it.each([undefined, false, 'true', 1, {}, new Boolean(true)])] — independent server read snapshot flag
- **002**, line 80: separates read=$read from list=$list and uses read mode for retries [it.each([false, true].flatMap((read) => [false, true].map((list) => ({ read, list }))))] — independent server read snapshot flag
- **003**, line 103: warns independently per model/flag transition and normalizes malformed setters [it] — independent server read snapshot flag
- **004**, line 119: inherits read defaults without relaxing an explicitly strict model or its list flag [it] — independent server read snapshot flag
- **005**, line 136: retains captured read mode through a suspended hook and retry (initial=%s) [it.each([false, true])] — independent server read snapshot flag
- **006**, line 177: does not inherit relaxed mode through related calls, their retries, or fresh helpers [it] — independent server read snapshot flag
- **007**, line 195: keeps %s and derived read-like output strict [it.each(['create', 'update', 'upsert', 'new', 'subRead', 'subList'])] — independent server read snapshot flag
- **008**, line 209: requires exact root-read origin/binding and declines embedded or malformed private markers [it] — independent server read snapshot flag
- **009**, line 230: declines a read marker outside the canonical read contract: %j [it.each([
    { access: access('list') },
    { access: { ...access('read'), rowAccess: 'list' } },
    { access: { ...access('read'), virtualAccess: 'create' } },
    { access: { ...access('read'), docPermissionsAccess: 'update' } },
    { applicability: 'mutation' as const },
    { applicability: 'output' as const },
    { readResponse: false },
    { readResponse: 'true' as never },
  ])] — independent server read snapshot flag
- **010**, line 259: keeps detached callback/grant copies, memos, exact handles and output mutation checks [it] — independent server read snapshot flag
- **011**, line 286: does not make a same-spelled global/payload property authority [it] — independent server read snapshot flag
- **012**, line 295: rejects read opt-out in method defaults.%s [it.each(['findOneOptions', 'findByIdOptions', 'publicReadOptions'])] — independent server read snapshot flag
- **013**, line 305: rejects per-call opt-out through %s [it.each(['args', 'options', 'authorization'])] — independent server read snapshot flag

## service-authorization-context.unit.test.ts (26 registration templates)

- **001**, line 111: owns per-call authority and captured configuration without changing the request actor/map [it] — SVA-01 private call-policy capture
- **002**, line 169: does not inherit authority across overlapping calls on the same receiver, or request permission mutations [it] — SVA-01 private call-policy capture
- **003**, line 189: detaches canonical BSON authority/configuration on every full read through wire round-trips [it] — SVA-01 private call-policy capture
- **004**, line 238: rejects malformed/unsupported policy before any execution: %j [it.each([
    null,
    true,
    'unrestricted',
    [],
    { inputFields: undefined },
    { subdocuments: {} },
    { operation: { mode: 'grant' } },
    { extra: true },
    { rows: null },
    { rows: { mode: 'wrong' } },
    { rows: { mode: 'request', filter: {} } },
    { rows: { mode: 'scope' } },
    { rows: { mode: 'scope', filter: null } },
    { rows: { mode: 'scope', filter: undefined } },
    { rows: { mode: 'scope', filter: true } },
    { rows: { mode: 'scope', filter: [] } },
    { outputFields: null },
    { outputFields: { mode: 'wrong' } },
    { outputFields: { mode: 'grant' } },
    { outputFields: { mode: 'grant', paths: 'status' } },
    { outputFields: { mode: 'request', paths: [] } },
    { outputFields: { mode: 'grant', paths: [undefined] } },
    { related: null },
  ])] — SVA-01 private call-policy capture
- **005**, line 266: rejects unsafe/protected/out-of-catalog path %s [it.each([
    '',
    '-status',
    '+status',
    'contacts.sub.email',
    'contacts..email',
    'contacts.0.email',
    'contacts[0].email',
    'contacts.*',
    'contacts.$email',
    'contacts.__proto__.email',
    'constructor',
    'prototype.x',
    ' status',
    '_doc',
    '__v',
    'meta',
    'meta.permissions',
    'meta.permissions.owner',
    'version',
    'execution.token',
    'customer.billingEmail',
    'unknown',
  ])] — SVA-01 private call-policy capture
- **006**, line 295: accepts false/empty inert scopes, empty grants, leaf/subtree and declared business control-word paths [it] — SVA-01 private call-policy capture
- **007**, line 309: rejects cycles, unsupported objects, protected object keys and accessors without invoking them [it] — SVA-01 private call-policy capture
- **008**, line 326: bounds recursive/sparse inputs and accepts shared acyclic policy values [it] — SVA-01 private call-policy capture
- **009**, line 344: captures nested target policy/configuration and applies each receiving catalog [it] — SVA-01 private call-policy capture
- **010**, line 376: checks exact requested related targets, nesting, target catalogs and count applicability [it] — SVA-01 private call-policy capture
- **011**, line 411: rejects wrong method dimensions even when explicitly undefined or request-mode [it] — SVA-01 private call-policy capture
- **012**, line 422: authenticates resolved call %s binding [it.each(['request', 'runtime', 'model', 'modelName', 'scopePath'] as const)] — SVA-01 private call-policy capture
- **013**, line 438: resolves full grants and field decisions once, preserving the original actor after private inputs/metadata are trimmed [it] — SVA-01 per-document owners and same-stage handles
- **014**, line 503: shares call policy across rows without sharing grants/decisions, even for matching IDs [it] — SVA-01 per-document owners and same-stage handles
- **015**, line 524: accepts explicit same-stage package copies, but not structural/JSON/ID/metadata forgeries [it] — SVA-01 per-document owners and same-stage handles
- **016**, line 540: rejects another call, stage, access, scope, request, model or runtime [it] — SVA-01 per-document owners and same-stage handles
- **017**, line 562: keeps pre-write/post-write and effective-access stages distinct even on the same immutable snapshot [it] — SVA-01 per-document owners and same-stage handles
- **018**, line 585: invalidates a captured snapshot changed while its permission hook is awaiting [it] — SVA-01 per-document owners and same-stage handles
- **019**, line 606: rejects stale canonical BSON document changes before cached decisions: %s [it.each(['id', 'decimal', 'long'] as const)] — SVA-01 per-document owners and same-stage handles
- **020**, line 635: rejects stale output mutation/replacement: %s [it.each(['date', 'buffer', 'bson', 'decimal', 'long', 'nested', 'replacement'] as const)] — SVA-01 per-document owners and same-stage handles
- **021**, line 663: looks up only exact registered related outputs in this result graph and keeps receiver ownership [it] — SVA-01 per-document owners and same-stage handles
- **022**, line 684: derives embedded scope from a valid handle and keeps element decisions distinct with explicit owning grants [it] — SVA-01 per-document owners and same-stage handles
- **023**, line 715: retains hook and decision failures instead of silently rerunning them [it] — SVA-01 per-document owners and same-stage handles
- **024**, line 740: type-checks strict public/internal/default/opaque-handle fixtures against emitted declarations [it] — SVA-01 named-option admission and export gate
- **025**, line 761: normalizes fresh output-only policies and rejects handle/raw mixtures, forged handles and legacy bypass slots [it] — SVA-01 named-option admission and export gate
- **026**, line 786: does not publish runtime context issuers or private execution types as values [it] — SVA-01 named-option admission and export gate

## service-authorization-reads.unit.test.ts (10 registration templates)

- **001**, line 88: shares only validated primitive projections and one frozen permission view per call [it] — ARCPU-01 authenticated narrow authorization reads
- **002**, line 140: rejects non-string catalog paths instead of sharing mutable/malformed leaves: %s [it.each([new Date(1), Buffer.from([1]), new mongo.BSON.ObjectId(), new Map(), true, undefined])] — ARCPU-01 authenticated narrow authorization reads
- **003**, line 153: rejects sparse/native catalog arrays and non-string access values before sharing [it] — ARCPU-01 authenticated narrow authorization reads
- **004**, line 174: keeps open field-rule configuration and full-policy native leaves detached on every read [it] — ARCPU-01 authenticated narrow authorization reads
- **005**, line 219: authenticates every narrow read and warm permission/decision lookup against %s [it.each(['request', 'runtime', 'model', 'modelName', 'scopePath'] as const)] — ARCPU-01 authenticated narrow authorization reads
- **006**, line 273: detaches finalizer, hook-lookup and metadata native slices on every read [it] — ARCPU-01 authenticated narrow authorization reads
- **007**, line 320: validates changed snapshots before narrow reads and cached field decisions [it] — ARCPU-01 authenticated narrow authorization reads
- **008**, line 332: does not copy grants for identity/access reads, but keeps grant-bearing reads detached [it] — ARCPU-01 authenticated narrow authorization reads
- **009**, line 347: does zero unrelated Date copies across repeated access/catalog/rule/document and output-value reads [it] — ARCPU-01 authenticated narrow authorization reads
- **010**, line 370: prepares ordinary no-virtual list setup once for %s rows [it.each([1, 2, 7])] — ARCPU-01 authenticated narrow authorization reads

## service-list-preparation.unit.test.ts (7 registration templates)

- **001**, line 76: %s amortizes captured primitive catalog work in the actual service row loop [it.each(entries)] — ARCPU-07 canonical list output preparation
- **002**, line 124: %s list does not copy unrelated configuration once per row with zero virtuals [it.each(entries)] — ARCPU-07 canonical list output preparation
- **003**, line 187: title [it.each([
      ['quiet', {}, quiet],
      ['grants', {}, { ...quiet, includePermissions: true }],
      ['field maps', {}, { ...quiet, includeFieldPermissions: true }],
      ['disabled maps', { disableFieldPermissions: true }, { ...quiet, includeFieldPermissions: true }],
      ['stripped', { stripPermissionsField: true }, { ...quiet, includePermissions: true }],
      ['exposed subset', { exposedDocPermissionKeys: ['public'] }, { ...quiet, includePermissions: true }],
    ] as const)] — ARCPU-07 canonical list output preparation > for (const entry of entries)
- **004**, line 344: %s keeps native metadata option method receivers detached per row [it.each(entries)] — ARCPU-07 canonical list output preparation
- **005**, line 385: %s retains in-flight policy and observes replacement on the next list call [it.each(entries)] — ARCPU-07 canonical list output preparation
- **006**, line 409: keeps native rule wire normalization resolution-local across real direct list rows [it] — ARCPU-07 canonical list output preparation
- **007**, line 441: %s keeps mutable function-backed document hook lookups per row [it.each(entries)] — ARCPU-07 canonical list output preparation

## service-snapshot-builder.unit.test.ts (1 registration templates)

- **001**, line 161: $entry/$operation comparison-skips=$checks initial-copy-skips=$initial [it.each(
    ['direct', 'public'].flatMap((entry) =>
      ['list', 'read'].flatMap((operation) =>
        [false, true].flatMap((checks) =>
          [false, true].map((initial) => ({
            entry: entry as 'direct' | 'public',
            operation: operation as 'list' | 'read',
            checks,
            initial,
          })),
        ),
      ),
    ),
  )] — PIPE-02 real query paths preserve observations with fewer record definitions

## snapshot-review-regressions.unit.test.ts (2 registration templates)

- **001**, line 37: retains the second observation when BSON hasInstance executes code for an ordinary nested value [it] — SNAPCPU-05 live ordinary-shape purity review
- **002**, line 69: retains the second observation when ordinary equality inherits a toStringTag getter [it] — SNAPCPU-05 live ordinary-shape purity review

## snapshot-validation-amplification.unit.test.ts (2 registration templates)

- **001**, line 142: `${entry}: $count rows / $width selected fields / $nativeLeaves fetch-only BSON leaves / unsafe=$unsafe` [it.each(
      [false, true].flatMap((unsafe) =>
        [1, 10].flatMap((count) =>
          [4, 24].flatMap((width) => [0, 1, 24].map((nativeLeaves) => ({ count, width, nativeLeaves, unsafe }))),
        ),
      ),
    )] — real-list snapshot validation work (no virtuals) > for (const entry of entries)
- **002**, line 253: $method / $width fields / independent list flag=$listFlag [it.each(
    ['findOne', 'findById', '_read', '_readFilter'].flatMap((method) =>
      [4, 24].flatMap((width) => [false, true].map((listFlag) => ({ method, width, listFlag }))),
    ),
  )] — real single-read snapshot validation work

## static-output-field-batch.unit.test.ts (24 registration templates)

- **001**, line 126: uses no actor method or native grant copy, and populates the original request keys [it] — closed static decision batch ownership and memo authority
- **002**, line 144: cannot enlarge the privately owned primitive field set: %s [it.each(['forged', 'reordered', 'duplicated', 'enlarged', 'proxy', 'accessor'] as const)] — closed static decision batch ownership and memo authority
- **003**, line 170: does not treat plan states or appended paths as authority [it] — closed static decision batch ownership and memo authority
- **004**, line 179: does not accept another call, a forged handle or a changed exact binding [it] — closed static decision batch ownership and memo authority
- **005**, line 193: retains a settled conflicting %s decision and equal-ID row isolation [it.each(['output:first', 'request:read:first'])] — closed static decision batch ownership and memo authority
- **006**, line 208: falls back without populating later fields for a pending %s decision [it.each(['output:first', 'request:read:first'])] — closed static decision batch ownership and memo authority
- **007**, line 227: retains a rejected %s promise instead of recomputing it [it.each(['output:first', 'request:read:first'])] — closed static decision batch ownership and memo authority
- **008**, line 243: does not mark an evaluator return fulfilled before its retained promise settles [it] — closed static decision batch ownership and memo authority
- **009**, line 259: does not prepopulate later static decisions beyond an earlier dynamic callback [it] — closed static decision batch ownership and memo authority
- **010**, line 276: does not add a speculative configuration copy before %s fallback [it.each(['native-schema', 'native-prefix', 'coercible-prefix'] as const)] — closed static decision batch ownership and memo authority
- **011**, line 301: retains exact/dotted request-key reuse when static request metadata runs first [it] — closed static decision batch ownership and memo authority
- **012**, line 326: keeps backend grants out of request metadata and preserves known-trimmed denial [it] — closed static decision batch ownership and memo authority
- **013**, line 359: rejects $kind mutation before a static batch (cold: $cold) [it.each(['ordinary', 'date', 'buffer', 'bson'].flatMap((kind) => [false, true].map((cold) => ({ kind, cold }))))] — static pass observable-boundary validation and reentry
- **014**, line 385: rejects input mutation by native validation observation %s (before/after the pure body) [it.each([1, 3])] — static pass observable-boundary validation and reentry
- **015**, line 406: does not overwrite a memo created by post-validation native reentry [it] — static pass observable-boundary validation and reentry
- **016**, line 429: rejects plan enlargement by a wire method outside the pure body [it] — static pass observable-boundary validation and reentry
- **017**, line 440: does not read a binding getter installed by native admission validation inside a decision batch [it] — static pass observable-boundary validation and reentry
- **018**, line 462: checks queued %s mutation on the finalizer batch resume [it.each(['source', 'binding', 'plan'] as const)] — static pass observable-boundary validation and reentry
- **019**, line 483: never confers validity on a stale different stage reentered by a native wire hook [it] — static pass observable-boundary validation and reentry
- **020**, line 506: keeps a queued native-wire mutation observable before consuming batch decisions [it] — static pass observable-boundary validation and reentry
- **021**, line 527: does not let native-wire reentry pass a stale different handle through the public helper [it] — static pass observable-boundary validation and reentry
- **022**, line 557: revalidates an associated output mutated by its native snapshot check before using static decisions [it] — static pass observable-boundary validation and reentry
- **023**, line 567: keeps owning-parent checks and ancestor callbacks on the conservative child path [it] — static pass observable-boundary validation and reentry
- **024**, line 595: retains immediate pending handle-helper $kind mutation rejection (cold: $cold) [it.each(['output', 'native', 'source'].flatMap((kind) => [false, true].map((cold) => ({ kind, cold }))))] — static pass observable-boundary validation and reentry

## read-snapshot-checks.integration.test.ts (3 registration templates)

- **001**, line 89: retains single-read field/row rules with read=$read and list=$list [it.each([false, true].flatMap((read) => [false, true].map((list) => ({ read, list }))))] — read snapshot opt-out retains ACL and public boundaries
- **002**, line 156: keeps list-access retry gates/rules with independent read=$read and list=$list [it.each([false, true].flatMap((read) => [false, true].map((list) => ({ read, list }))))] — read snapshot opt-out retains ACL and public boundaries
- **003**, line 197: rejects client opt-out in %s before document hooks [it.each(['query', 'body', 'options', 'root'])] — read snapshot opt-out retains ACL and public boundaries

## list-snapshot-checks.integration.test.ts (3 registration templates)

- **001**, line 87: preserves row/document/field rules through direct, public and HTTP lists (unsafe=%s) [it.each([false, true])] — server list snapshot flag does not turn off ACL
- **002**, line 124: keeps root list output and denied root reads identical (unsafe=%s) [it.each([false, true])] — server list snapshot flag does not turn off ACL
- **003**, line 140: cannot enable the flag from %s control slots [it.each(['body', 'options', 'root', 'query'])] — server list snapshot flag does not turn off ACL

## authorization-snapshot.unit.test.ts (15 registration templates)

- **001**, line 85: matches wire type/bits and owns each mutable $name clone through serialization [it.each(canonicalCases)] — ARCPU-05 canonical BSON snapshots
- **002**, line 122: clones repeated canonical leaves separately in nested records, arrays, Maps and Sets [it] — ARCPU-05 canonical BSON snapshots
- **003**, line 153: does not preserve a stale ObjectId hex cache instead of its serialized bits [it] — ARCPU-05 canonical BSON snapshots
- **004**, line 252: retains serializer normalization/type/subtype for $name [it.each(fallbackCases)] — ARCPU-05 BSON wire compatibility
- **005**, line 268: does not bypass serializer rejection of $name [it.each([
    { name: 'null Decimal128 bytes', create: () => Object.assign(bson.Decimal128.fromString('1.2'), { bytes: null }) },
    {
      name: 'missing ObjectId serializer',
      create: () => Object.assign(new bson.ObjectId(hex), { serializeInto: null }),
    },
    {
      name: 'wrong BSON version',
      create: () => Object.defineProperty(new bson.Long(1, 2), Symbol.for('@@mdb.bson.version'), { value: -1 }),
    },
  ])] — ARCPU-05 BSON wire compatibility
- **006**, line 286: retains wire normalization/rejection for malformed ObjectId words or the other BSON version's storage layout [it] — ARCPU-05 BSON wire compatibility
- **007**, line 310: invokes %s own accessors only as required by serialization [it.each(['id', 'decimal', 'long'] as const)] — ARCPU-05 BSON wire compatibility
- **008**, line 331: does not inspect extra %s own native getters [it.each(['id', 'decimal', 'long'] as const)] — ARCPU-05 BSON wire compatibility
- **009**, line 349: preserves wire semantics without reading an application byteLength accessor [it] — ARCPU-05 BSON wire compatibility
- **010**, line 362: retains inherited toBSON normalization without extra accessor calls [it] — ARCPU-05 BSON wire compatibility
- **011**, line 379: does not bypass changed prototype wire methods or invoke their accessors twice [it] — ARCPU-05 BSON wire compatibility
- **012**, line 397: retains serializer validation of a changed inherited BSON version getter [it] — ARCPU-05 BSON wire compatibility
- **013**, line 417: retains wire overrides installed before the snapshot module loaded: %s [it.each(['Long bits', 'ObjectId bytes', 'BSON version'] as const)] — ARCPU-05 BSON wire compatibility
- **014**, line 471: handles null/plain records through descriptors, not BSON-looking properties or application accessors [it] — ARCPU-05 snapshot safeguards remain in force
- **015**, line 487: retains non-enumerable data handling, unsafe-key/cycle rejection and structural limits around BSON leaves [it] — ARCPU-05 snapshot safeguards remain in force

## authorization-snapshot-copy-builder.unit.test.ts (7 registration templates)

- **001**, line 19: removes per-record-property descriptor materialization without dropping array definitions or freezes [it] — PIPE-02 observation-preserving snapshot record builder
- **002**, line 37: agrees with the independent original copier on 512 seeded graphs in all three modes [it] — PIPE-02 observation-preserving snapshot record builder
- **003**, line 64: does not invoke inherited setters and publishes normal-prototype frozen data properties [it] — PIPE-02 observation-preserving snapshot record builder
- **004**, line 88: rechecks inherited keys after native normalization installs a setter [it] — PIPE-02 observation-preserving snapshot record builder
- **005**, line 117: does not traverse a target prototype replaced during recursive native work [it] — PIPE-02 observation-preserving snapshot record builder
- **006**, line 151: retains wire/native/proxy observation order in mode %s [it.each([false, true, 'document'] as const)] — PIPE-02 observation-preserving snapshot record builder
- **007**, line 192: keeps independent aliases, mutable leaves, Map/Set normalization and configuration functions [it] — PIPE-02 observation-preserving snapshot record builder

## authorization-snapshot-differential.unit.test.ts (44 registration templates)

- **001**, line 44: agrees on 512 deterministic generated graphs, changed sources and changed snapshots [it] — SNAPCPU-04 ordinary snapshot differential
- **002**, line 82: $name [it.each([
    { name: 'NaN', value: NaN, snapshot: NaN, expected: true },
    { name: 'negative zero', value: -0, snapshot: 0, expected: false },
    { name: 'bigint', value: 123n, snapshot: 123n, expected: true },
    { name: 'undefined', value: { value: undefined }, snapshot: { value: undefined }, expected: true },
    { name: 'missing vs undefined', value: {}, snapshot: { value: undefined }, expected: false },
    { name: 'different key order', value: { b: 1, a: 2 }, snapshot: { a: 2, b: 1 }, expected: true },
    { name: 'non-enumerable document data', value: hidden(1), snapshot: { hidden: 1 }, expected: true },
    { name: 'snapshot non-enumerable data is not normalized', value: hidden(1), snapshot: hidden(1), expected: false },
    { name: 'snapshot-only hidden data', value: {}, snapshot: hidden(1), expected: true },
    {
      name: 'null source prototype',
      value: Object.assign(Object.create(null), { a: 1 }),
      snapshot: { a: 1 },
      expected: true,
    },
    {
      name: 'null target prototype',
      value: { a: 1 },
      snapshot: Object.assign(Object.create(null), { a: 1 }),
      expected: false,
    },
    { name: 'array holes', value: Array(3), snapshot: Array(3), expected: true },
    { name: 'holes are not undefined', value: Array(1), snapshot: [undefined], expected: false },
    { name: 'different array length', value: Array(2), snapshot: Array(3), expected: false },
    {
      name: 'hidden array index',
      value: Object.defineProperty(Array(2), '1', { value: 1 }),
      snapshot: Object.assign(Array(2), { 1: 1 }),
      expected: true,
    },
    {
      name: 'hidden target array index',
      value: [1],
      snapshot: Object.defineProperty(Array(1), '0', { value: 1 }),
      expected: true,
    },
    { name: 'null array prototype', value: Object.setPrototypeOf([1], null), snapshot: [1], expected: true },
    { name: 'array subclass', value: new (class extends Array {})(1, 2), snapshot: [1, 2], expected: true },
    {
      name: 'large non-index array property',
      value: Object.assign([], { 4294967295: 1 }),
      snapshot: Object.assign([], { 4294967295: 1 }),
      expected: true,
    },
    {
      name: 'huge numeric array property',
      value: Object.assign([], { ['999999999999999999999']: 1 }),
      snapshot: Object.assign([], { ['999999999999999999999']: 1 }),
      expected: true,
    },
  ])] — SNAPCPU-04 ordinary snapshot differential
- **003**, line 135: rejects unsafe own key %s, even for identity/frozen targets [it.each(['__proto__', 'constructor', 'prototype', Symbol('own')])] — SNAPCPU-04 ordinary snapshot differential
- **004**, line 145: rejects invalid array key %s [it.each(['01', '-1', '1.0', 'extra', '__proto__', 'constructor', 'prototype', Symbol('array')])] — SNAPCPU-04 ordinary snapshot differential
- **005**, line 153: rejects unsupported input %# [it.each([
    () => true,
    Symbol('value'),
    { value: () => true },
    { value: Symbol('nested') },
    Object.create({ value: 1 }),
  ])] — SNAPCPU-04 ordinary snapshot differential
- **006**, line 164: rejects %s-enumerable accessors without invoking them [it.each([false, true])] — SNAPCPU-04 ordinary snapshot differential
- **007**, line 178: tracks active cycles, not repeated aliases or snapshot identity [it] — SNAPCPU-04 ordinary snapshot differential
- **008**, line 192: preserves $name [it.each([
    { name: 'depth 100', source: () => nested(100), expected: true },
    { name: 'depth 101', source: () => nested(101), expected: false },
    { name: '20,000 total nodes', source: () => Array(19999).fill(0), expected: true },
    { name: '20,001 total nodes', source: () => Array(20000).fill(0), expected: false },
    { name: '20,000 sparse length', source: () => Array(20000), expected: true },
    { name: '20,001 sparse length', source: () => Array(20001), expected: false },
    { name: 'repeated aliases within budget', source: () => Array(9999).fill({ value: 0 }), expected: true },
    { name: 'repeated aliases exceed budget', source: () => Array(10000).fill({ value: 0 }), expected: false },
    {
      name: 'Map shares enclosing node budget',
      source: () => ({ prefix: Array(9998).fill(0), map: new Map([[0, Array(9997).fill(0)]]) }),
      expected: true,
    },
    {
      name: 'Map cannot reset enclosing node budget',
      source: () => ({ prefix: Array(9998).fill(0), map: new Map([[0, Array(9998).fill(0)]]) }),
      expected: false,
    },
    {
      name: 'Set shares enclosing node budget',
      source: () => ({ prefix: Array(9999).fill(0), set: new Set([Array(9997).fill(0)]) }),
      expected: true,
    },
    {
      name: 'Set cannot reset enclosing node budget',
      source: () => ({ prefix: Array(9999).fill(0), set: new Set([Array(9998).fill(0)]) }),
      expected: false,
    },
    { name: 'Map cannot reset depth', source: () => nested(100, new Map([[0, 1]])), expected: false },
    { name: 'Set cannot reset depth', source: () => nested(100, new Set([0])), expected: false },
  ])] — SNAPCPU-04 ordinary snapshot differential
- **009**, line 262: keeps actual index %s distinct from non-index properties without large allocation [it.each(['2147483647', '4294967294'])] — SNAPCPU-04 numeric non-index array fallback
- **010**, line 282: delegates $name extra-property getters before $shape array indices [it.each(
    nonIndexArrayKeys.flatMap(({ name, key }) =>
      ['dense', 'sparse', 'hidden source', 'nested'].map((shape) => ({ name, key, shape })),
    ),
  )] — SNAPCPU-04 numeric non-index array fallback
- **011**, line 312: handles a target-only $name extra (enumerable: $enumerable) before any fast index denial [it.each(nonIndexArrayKeys.flatMap(({ name, key }) => [false, true].map((enumerable) => ({ name, key, enumerable }))))] — SNAPCPU-04 numeric non-index array fallback
- **012**, line 342: normalizes a source-only hidden $name extra before Node checks index getters [it.each(nonIndexArrayKeys)] — SNAPCPU-04 numeric non-index array fallback
- **013**, line 360: does not replay wire normalization when a hook introduces a $name extra [it.each(nonIndexArrayKeys)] — SNAPCPU-04 numeric non-index array fallback
- **014**, line 405: retains the conservative copy cost for a $name extra [it.each(nonIndexArrayKeys)] — SNAPCPU-04 numeric non-index array fallback
- **015**, line 413: retains bounded %s array normalization after tape withdrawal [it.each(['dense', 'sparse'])] — SNAPCPU-04 numeric non-index array fallback
- **016**, line 430: does not inspect an arbitrary %s target before normalization completes [it.each(['plain', 'array', 'throw', 'constructor', 'tag', 'proxy'] as const)] — SNAPCPU-04 normalization/equality observation order
- **017**, line 490: compares a snapshot-native accessor only during the original equality operation [it] — SNAPCPU-04 normalization/equality observation order
- **018**, line 506: retains equality callback/short-circuit order with %s [it.each([
    'native allow',
    'native deny',
    'early deny',
    'hidden later data',
    'ignored getter',
    'reordered getter',
  ] as const)] — SNAPCPU-04 normalization/equality observation order
- **019**, line 559: performs target constructor observations even when an ordinary field already differs [it] — SNAPCPU-04 normalization/equality observation order
- **020**, line 573: does not inspect array index accessors when Node would reject the length first [it] — SNAPCPU-04 normalization/equality observation order
- **021**, line 588: retains exact %s source proxy observations on whole-tree fallback [it.each(['record', 'array'] as const)] — SNAPCPU-04 normalization/equality observation order
- **022**, line 614: does not reread an earlier primitive/record after a later wire hook mutates it [it] — SNAPCPU-04 normalization/equality observation order
- **023**, line 635: compares earlier snapshot fields only after wire normalization has finished [it] — SNAPCPU-04 normalization/equality observation order
- **024**, line 651: retains array length %s assigned by a wire hook after earlier indices were normalized [it.each([0, 1, 3, 20001])] — SNAPCPU-04 normalization/equality observation order
- **025**, line 674: normalizes a proxy array final length (%s) before visiting the next field [it.each(['coercible', 'invalid', 'string'] as const)] — SNAPCPU-04 normalization/equality observation order
- **026**, line 708: handles a wire hook introducing a later %s without replaying earlier hooks [it.each(['Map', 'Set', 'Date', 'proxy', 'accessor', 'deleted', 'added', 'cycle'] as const)] — SNAPCPU-04 normalization/equality observation order
- **027**, line 748: counts a native-introduced fallback subtree against already-visited nodes [it] — SNAPCPU-04 normalization/equality observation order
- **028**, line 764: preserves %s eager iteration before entry normalization and unordered equality [it.each(['Map', 'Set'] as const)] — SNAPCPU-04 normalization/equality observation order
- **029**, line 804: retains live own-key iteration normalization: %s [it.each(['reordered', 'duplicate', 'omitted', 'changed list', 'hidden unsafe key', 'hidden symbol'] as const)] — SNAPCPU-04 normalization/equality observation order
- **030**, line 847: does not add $name application callbacks during comparison/fallback eligibility [it.each([
    { name: 'Set.has', prototype: Set.prototype, key: 'has' },
    { name: 'WeakSet.has', prototype: WeakSet.prototype, key: 'has' },
    { name: 'WeakSet.add', prototype: WeakSet.prototype, key: 'add' },
    { name: 'WeakSet.delete', prototype: WeakSet.prototype, key: 'delete' },
  ])] — SNAPCPU-04 normalization/equality observation order
- **031**, line 876: retains native normalization to a large opaque wire value, not a reset or extra structural budget [it] — SNAPCPU-04 normalization/equality observation order
- **032**, line 882: retains Node equality for a prototype-replaced exotic target %# [it.each([
    new Date(1),
    /value/g,
    new Number(1),
    new String('s'),
    new Boolean(true),
    new Error('error'),
    new ArrayBuffer(2),
    new DataView(new ArrayBuffer(2)),
    new Uint8Array(2),
    new Map(),
    new Set(),
    new WeakMap(),
    new WeakSet(),
    Promise.resolve(1),
  ])] — SNAPCPU-04 normalization/equality observation order
- **033**, line 904: delegates unusual target prototypes to Node, including its version-specific constructor comparison [it] — SNAPCPU-04 normalization/equality observation order
- **034**, line 909: delegates a BSON-derived target opposite an ordinary %s-populated record to Node [it.each([false, true])] — SNAPCPU-04 normalization/equality observation order
- **035**, line 928: retains exact nested $name proxy/wire observations without replay [it.each([
    { name: 'ObjectId', create: () => new bson.ObjectId(hex) },
    { name: 'Long', create: () => new bson.Long(1, 2) },
    { name: 'Decimal128', create: () => bson.Decimal128.fromString('1.20') },
  ])] — SNAPCPU-04 native differential
- **036**, line 959: matches/mismatches normalized $name without changing ownership copying [it.each([
    { name: 'ObjectId', create: () => new bson.ObjectId(hex) },
    { name: 'ObjectId subclass', create: () => new (class extends bson.ObjectId {})(hex) },
    { name: 'Long subclass', create: () => new (class extends bson.Long {})(1, 2, true) },
    { name: 'Decimal128', create: () => bson.Decimal128.fromString('1.20') },
    { name: 'Double NaN', create: () => new bson.Double(NaN) },
    { name: 'Double -0', create: () => new bson.Double(-0) },
    { name: 'Binary', create: () => new bson.Binary(Buffer.from([1, 2, 3]), 128) },
    { name: 'Code with scope', create: () => new bson.Code('value', { nested: { value: new bson.Long(1, 2) } }) },
    { name: 'BSON RegExp', create: () => new bson.BSONRegExp('value', 'mi') },
    {
      name: 'wire primitive string',
      create: () => Object.assign(new bson.ObjectId(hex), { toBSON: () => 'normalized' }),
    },
    { name: 'wire primitive null', create: () => Object.assign(new bson.ObjectId(hex), { toBSON: () => null }) },
    {
      name: 'wire ordinary object',
      create: () => Object.assign(new bson.ObjectId(hex), { toBSON: () => ({ value: 'normalized' }) }),
    },
    { name: 'Date', create: () => new Date(123) },
    { name: 'invalid Date', create: () => new Date(NaN) },
    { name: 'RegExp lastIndex', create: () => Object.assign(/abc/g, { lastIndex: 2 }) },
    { name: 'Buffer', create: () => Buffer.from([1, 2, 3]) },
    { name: 'Map', create: () => new Map([[{ value: 1 }, { values: [1, undefined] }]]) },
    { name: 'Set', create: () => new Set([{ value: 1 }, { value: 2 }]) },
  ])] — SNAPCPU-04 native differential
- **037**, line 995: preserves overridden %s methods/accessors and rejection observations [it.each(['Date', 'RegExp', 'Buffer', 'ObjectId', 'Long', 'version rejection', 'malformed ObjectId'] as const)] — SNAPCPU-04 native differential
- **038**, line 1085: retains unsafe native-constructor normalization behavior rather than inventing a trusted-constructor path [it] — SNAPCPU-04 native differential
- **039**, line 1091: delegates native inherited %s accessors without invoking them during eligibility [it.each(['constructor', 'tag'] as const)] — SNAPCPU-04 native differential
- **040**, line 1117: does not change acceptance/observations for an overridden BSON hasInstance returning %s [it.each([false, true])] — SNAPCPU-04 native differential
- **041**, line 1149: rejects active %s cycles but permits repeated aliased entries [it.each(['Map', 'Set'] as const)] — SNAPCPU-04 native differential
- **042**, line 1175: keeps complete graph copies/freezes on matches and mismatches without per-record-key descriptors [it] — PIPE-02 complete normalization with fewer record definitions
- **043**, line 1195: keeps one detached $name wire clone per occurrence with the lower-allocation record builder [it.each([
    { name: 'ObjectId', create: () => new bson.ObjectId(hex) },
    { name: 'Long', create: () => new bson.Long(1, 2) },
  ])] — PIPE-02 complete normalization with fewer record definitions
- **044**, line 1233: normalizes a complex graph once without repeating native hooks or resetting limits [it] — PIPE-02 complete normalization with fewer record definitions

## snapshot-review-comparator-regressions.unit.test.ts (1 registration templates)

- **001**, line 6: compares non-index numeric property $key before array indices (repair: $repairIndex) [it.each(
    ['4294967295', '999999999999999999999'].flatMap((key) =>
      [false, true].map((repairIndex) => ({ key, repairIndex })),
    ),
  )] — SNAPCPU-05 array comparison observation order

## query-snapshot-work.unit.test.ts (1 registration templates)

- **001**, line 103: $operation/$entry/$placement: root=$root nested=$nested output=$output [it.each(
    ['read', 'list'].flatMap((operation) =>
      ['direct', 'public'].flatMap((entry) =>
        ['model', 'default-before', 'default-after'].flatMap((placement) =>
          Array.from({ length: 8 }, (_, mask) => ({
            operation: operation as 'read' | 'list',
            entry,
            placement: placement as 'model' | 'default-before' | 'default-after',
            root: !!(mask & 1),
            nested: !!(mask & 2),
            output: !!(mask & 4),
          })),
        ),
      ),
    ),
  )] — real query/finalizer/helper snapshot comparisons

