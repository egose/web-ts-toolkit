> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Original OAR-07A case inventory

Exact incoming bytes/hashes are saved under `originals/`. IDs below refer to test registration templates, not a fabricated expanded runtime case count. Every parameterized registration and enclosing matrix expression is preserved in the JSON catalog and original source.

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

