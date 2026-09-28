import { fromOrient, type DataFrame, type FromOrientOptions, type JsonRow } from '@web-ts-toolkit/json-frame';

function expectType<T>(_value: T): void {
  void _value;
}

// row() is a readonly snapshot; compare exact field types and optionality.
type CellShape<T> = { -readonly [K in keyof T]: T[K] };
type Equal<A, B> = (<T>() => T extends CellShape<A> ? 1 : 2) extends (<T>() => T extends CellShape<B> ? 1 : 2) ? true : false;
type OptionalMembers = { id: string; toString?: string; constructor?: string; valueOf?: string };

// Compiled against source, workspace declarations, and installed ESM/CJS declarations.
// This function is deliberately not executed: negative examples must only typecheck.
export function inferenceContract(): void {
  const mutableValues = [[1]];
  const tupleValues = [[1]] as const;
  const omitted = fromOrient(mutableValues, { columns: ['n'] });
  const auto = fromOrient(tupleValues, { orient: 'auto', columns: ['n'] });
  const values = fromOrient(tupleValues, { orient: 'values', columns: ['n'] });
  expectType<DataFrame<JsonRow>>(omitted);
  expectType<DataFrame<JsonRow>>(auto);
  expectType<DataFrame<JsonRow>>(values);
  expectType<DataFrame<JsonRow>>(fromOrient(tupleValues, { columns: ['n'] }));
  expectType<DataFrame<JsonRow>>(fromOrient(mutableValues, { orient: 'auto', columns: ['n'] }));
  expectType<DataFrame<JsonRow>>(fromOrient(mutableValues, { orient: 'values', columns: ['n'] }));
  // @ts-expect-error values rows are objects, not input arrays
  omitted.row(0).map((n: number) => n.toFixed());
  // @ts-expect-error readonly tuples also become object rows
  auto.rows()[0].slice();
  // @ts-expect-error explicit values rows are objects too
  values.filter((row) => row.includes(1));

  const sparse = fromOrient([{ n: 1 }, {}]);
  expectType<number | null | undefined>(sparse.row(1).n);
  // @ts-expect-error missing cells normalize to null, not only undefined
  expectType<number | undefined>(sparse.row(1).n);
  sparse.filter((row) => {
    if (row.n !== undefined) {
      // @ts-expect-error an undefined-only guard leaves runtime null
      return row.n.toFixed() === '1';
    }
    return false;
  });
  sparse.filter((row) => row.n != null && row.n.toFixed() === '1');
  sparse.sort((left, right) => (left.n ?? 0) - (right.n ?? 0));

  const heterogeneous = fromOrient([{ n: 1, kind: 'number' }, { label: 'x', kind: 'label' }] as const, {
    orient: 'records',
  });
  expectType<1 | null | undefined>(heterogeneous.row(0).n);
  expectType<'x' | null | undefined>(heterogeneous.row(0).label);
  expectType<'number' | 'label'>(heterogeneous.row(0).kind);
  // @ts-expect-error a key missing from a union member is nullable
  expectType<1 | undefined>(heterogeneous.row(0).n);
  // @ts-expect-error the second heterogeneous key also includes null
  expectType<'x' | undefined>(heterogeneous.row(0).label);

  interface OptionalRow {
    id: string;
    n?: number;
  }
  const optionalInput: readonly OptionalRow[] = [{ id: 'a', n: 1 }, { id: 'b' }];
  const optional = fromOrient(optionalInput, { orient: 'auto' });
  expectType<string>(optional.row(0).id);
  expectType<number | null | undefined>(optional.row(0).n);
  // @ts-expect-error optional declared properties acquire null filling
  expectType<number | undefined>(optional.row(0).n);
  const absentInput: readonly OptionalRow[] = [{ id: 'a' }];
  const absent = fromOrient(absentInput);
  // @ts-expect-error an optional column can be absent from the whole payload
  expectType<number | null>(absent.row(0).n);

  const homogeneous = fromOrient([{ n: 1, nested: { name: 'a' } }, { n: 2, nested: { name: 'b' } }]);
  expectType<DataFrame<{ n: number; nested: { name: string } }>>(homogeneous);
  homogeneous.filter((row) => row.n.toFixed() === '1' && row.nested.name.toUpperCase() === 'A');
  homogeneous.sort((left, right) => left.n - right.n);
  const literal = fromOrient([{ n: 1 }, { n: 2 }] as const);
  expectType<1 | 2>(literal.row(0).n);
  const mixed = fromOrient([{ n: 1 }, { n: 'x' }]);
  expectType<number | string>(mixed.row(0).n);
  const nested = fromOrient([{ cell: { n: 1 } }, { cell: {} }]);
  // Null filling is shallow: nested objects are not rectangularized.
  expectType<number | undefined>(nested.row(0).cell.n);

  interface DomainRow { n: number }
  const domainInput: readonly DomainRow[] = [{ n: 1 }];
  expectType<DataFrame<DomainRow>>(fromOrient<DomainRow>(domainInput));
  expectType<DataFrame<DomainRow>>(fromOrient<DomainRow>(domainInput, { orient: 'records' }));
  expectType<DataFrame<DomainRow>>(fromOrient<DomainRow>(tupleValues, { columns: ['n'] }));
  expectType<DataFrame<OptionalRow>>(fromOrient<OptionalRow>(optionalInput));
  expectType<DataFrame<DomainRow>>(fromOrient<DomainRow>('[{"n":1},{}]'));

  const broadOptions: FromOrientOptions = {};
  expectType<DataFrame<JsonRow>>(fromOrient([{ n: 1 }], broadOptions));
  const dictionaryRows: Record<string, number>[] = [{ n: 1 }, {}];
  expectType<DataFrame<JsonRow>>(fromOrient(dictionaryRows));
  const numericDictionaryRows: Record<number, number>[] = [{ 0: 1 }, {}];
  expectType<DataFrame<JsonRow>>(fromOrient(numericDictionaryRows));
}

// Keep these public-root checks reusable in every source/installed consumer mode.
export function propertyKeyInferenceContract(
  optionalMembers: readonly OptionalMembers[],
  absentMembers: readonly OptionalMembers[],
): void {
  const readonlySparse = [{ toString: 'ok', constructor: 'ctor', valueOf: 'value' }, {}] as const;
  for (const frame of [
    fromOrient(readonlySparse),
    fromOrient(readonlySparse, { orient: 'auto' }),
    fromOrient(readonlySparse, { orient: 'records' }),
  ]) {
    expectType<Equal<ReturnType<typeof frame.row>, {
      toString?: 'ok' | null; constructor?: 'ctor' | null; valueOf?: 'value' | null;
    }>>(true);
    // @ts-expect-error inherited Object members do not supply missing cells
    frame.row(1).toString.toUpperCase();
    // @ts-expect-error a declared constructor column can be null
    frame.row(1).constructor.toUpperCase();
    // @ts-expect-error a declared valueOf column can be null
    frame.row(1).valueOf.toUpperCase();
    // @ts-expect-error undefined-only guards leave normalization null
    frame.filter((row) => row.toString !== undefined && row.toString.toUpperCase() === 'OK');
    // @ts-expect-error undefined-only guards leave normalization null
    frame.filter((row) => row.constructor !== undefined && row.constructor.toUpperCase() === 'CTOR');
    // @ts-expect-error undefined-only guards leave normalization null
    frame.filter((row) => row.valueOf !== undefined && row.valueOf.toUpperCase() === 'VALUE');
    // @ts-expect-error sort callbacks require null-safe cells too
    frame.sort((a, b) => a.toString.localeCompare(b.toString));
    // @ts-expect-error sort callbacks require null-safe cells too
    frame.sort((a, b) => a.constructor.localeCompare(b.constructor));
    // @ts-expect-error sort callbacks require null-safe cells too
    frame.sort((a, b) => a.valueOf.localeCompare(b.valueOf));
    frame.filter((row) => row.toString != null && row.constructor != null && row.valueOf != null
      && row.toString.toUpperCase() === 'OK' && row.constructor.toUpperCase() === 'CTOR'
      && row.valueOf.toUpperCase() === 'VALUE');
    frame.sort((a, b) => (a.toString ?? '').localeCompare(b.toString ?? '')
      || (a.constructor ?? '').localeCompare(b.constructor ?? '') || (a.valueOf ?? '').localeCompare(b.valueOf ?? ''));
  }

  // Preserve the actual inferred empty-object type; object/unknown changes this regression.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  const mutableSparse: ({ toString: string; constructor: string; valueOf: string } | {})[] = [
    { toString: 'ok', constructor: 'ctor', valueOf: 'value' }, {},
  ];
  for (const frame of [
    fromOrient(mutableSparse),
    fromOrient(mutableSparse, { orient: 'auto' }),
    fromOrient(mutableSparse, { orient: 'records' }),
  ]) {
    expectType<Equal<ReturnType<typeof frame.row>, {
      toString?: string | null; constructor?: string | null; valueOf?: string | null;
    }>>(true);
    // @ts-expect-error mutable sparse Object-member cells also need guards
    frame.row(1).toString.toUpperCase();
    // @ts-expect-error mutable sparse Object-member cells also need guards
    frame.row(1).constructor.toUpperCase();
    // @ts-expect-error mutable sparse Object-member cells also need guards
    frame.row(1).valueOf.toUpperCase();
    // @ts-expect-error undefined-only guards leave normalization null
    frame.filter((row) => row.toString !== undefined && row.toString.toUpperCase() === 'OK');
    // @ts-expect-error undefined-only guards leave normalization null
    frame.filter((row) => row.constructor !== undefined && row.constructor.toUpperCase() === 'CTOR');
    // @ts-expect-error undefined-only guards leave normalization null
    frame.filter((row) => row.valueOf !== undefined && row.valueOf.toUpperCase() === 'VALUE');
    // @ts-expect-error sort callbacks require null-safe cells too
    frame.sort((a, b) => a.toString.localeCompare(b.toString));
    // @ts-expect-error sort callbacks require null-safe cells too
    frame.sort((a, b) => a.constructor.localeCompare(b.constructor));
    // @ts-expect-error sort callbacks require null-safe cells too
    frame.sort((a, b) => a.valueOf.localeCompare(b.valueOf));
    frame.filter((row) => row.toString != null && row.constructor != null && row.valueOf != null);
    frame.sort((a, b) => (a.toString ?? '').localeCompare(b.toString ?? '')
      || (a.constructor ?? '').localeCompare(b.constructor ?? '') || (a.valueOf ?? '').localeCompare(b.valueOf ?? ''));
  }

  type OptionalNumeric = { 1?: number } | { '1': string };
  const optionalNumeric: readonly OptionalNumeric[] = [{ 1: 1 }, { '1': 'x' }, {}];
  const absentNumeric: readonly { 1?: number; id: string }[] = [{ id: 'a' }];
  const mutableDense = [{ toString: 'ok', constructor: 'ctor', valueOf: 'value' }];
  const mutableNumeric = [{ 1: 1 }, { '1': 'x' }];

  for (const options of [undefined, { orient: 'auto' }, { orient: 'records' }] as const) {
    for (const input of [optionalMembers, absentMembers]) {
      const frame = fromOrient(input, options);
      expectType<Equal<ReturnType<typeof frame.row>, {
        id: string; toString?: string | null; constructor?: string | null; valueOf?: string | null;
      }>>(true);
      // @ts-expect-error entirely absent optional Object-member columns also allow undefined
      expectType<string | null>(frame.row(0).toString);
    }
    const dense = fromOrient([{ toString: 'ok', constructor: 'ctor', valueOf: 'value' }] as const, options);
    expectType<Equal<ReturnType<typeof dense.row>, { toString: 'ok'; constructor: 'ctor'; valueOf: 'value' }>>(true);
    const widened = fromOrient(mutableDense, options);
    expectType<Equal<ReturnType<typeof widened.row>, { toString: string; constructor: string; valueOf: string }>>(true);
    // Required JSON object cells must not be mistaken for inherited Object functions.
    const objectCells = fromOrient([{ toString: {}, constructor: {}, valueOf: {} }] as const, options);
    // Exact equality with the compiler's empty object-literal inference is intentional.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    expectType<Equal<ReturnType<typeof objectCells.row>, { toString: {}; constructor: {}; valueOf: {} }>>(true);

    const numeric = fromOrient([{ 1: 1 }, { 1: 2 }] as const, options);
    expectType<Equal<ReturnType<typeof numeric.row>, { '1': 1 | 2 }>>(true);
    const string = fromOrient([{ '1': 1 }, { '1': 2 }] as const, options);
    expectType<Equal<ReturnType<typeof string.row>, { '1': 1 | 2 }>>(true);
    for (const frame of [
      fromOrient([{ 1: 1 }, {}] as const, options),
      fromOrient([{ '1': 1 }, {}] as const, options),
    ]) {
      expectType<Equal<ReturnType<typeof frame.row>, { '1'?: 1 | null }>>(true);
      expectType<1 | null | undefined>(frame.row(0)[1]);
    }
    const mixed = fromOrient([{ 1: 1 }, { '1': 'x' }] as const, options);
    expectType<Equal<ReturnType<typeof mixed.row>, { '1': 1 | 'x' }>>(true);
    expectType<1 | 'x'>(mixed.row(0)[1]);
    expectType<1 | 'x'>(mixed.row(0)['1']);
    const reversed = fromOrient([{ '1': 'x' }, { 1: 1 }] as const, options);
    expectType<Equal<ReturnType<typeof reversed.row>, { '1': 1 | 'x' }>>(true);
    mixed.filter((row) => typeof row[1] === 'number' && row[1].toFixed() === '1');
    mixed.sort((a, b) => String(a['1']).localeCompare(String(b[1])));
    const widenedNumeric = fromOrient(mutableNumeric, options);
    expectType<Equal<ReturnType<typeof widenedNumeric.row>, { '1': number | string }>>(true);

    const sparseNumeric = fromOrient([{ 1: 1 }, { '1': 'x' }, {}] as const, options);
    expectType<Equal<ReturnType<typeof sparseNumeric.row>, { '1'?: 1 | 'x' | null }>>(true);
    expectType<1 | 'x' | null | undefined>(sparseNumeric.row(2)[1]);
    // @ts-expect-error sparse numeric aliases include normalization null
    expectType<1 | 'x' | undefined>(sparseNumeric.row(2)['1']);
    const common = fromOrient([{ id: 'a', 1: 1 }, { id: 'b', '1': 'x' }] as const, options);
    expectType<Equal<ReturnType<typeof common.row>, { id: 'a' | 'b'; '1': 1 | 'x' }>>(true);
    const optional = fromOrient(optionalNumeric, options);
    expectType<Equal<ReturnType<typeof optional.row>, { '1'?: number | string | null }>>(true);
    const absent = fromOrient(absentNumeric, options);
    expectType<Equal<ReturnType<typeof absent.row>, { id: string; '1'?: number | null }>>(true);
    // @ts-expect-error an entirely absent numeric column may be undefined
    expectType<number | null>(absent.row(0)[1]);
    const otherSpellings = fromOrient([{ [-1]: 1, 1.5: 2, '01': 3 }, { '-1': 'x', '1.5': 'y', '01': 4 }] as const, options);
    expectType<Equal<ReturnType<typeof otherSpellings.row>, { '-1': 1 | 'x'; '1.5': 2 | 'y'; '01': 3 | 4 }>>(true);
    // These values exist to capture generic inference in the exact type assertions above.
    void [dense, widened, objectCells, numeric, string, reversed, widenedNumeric, common, optional, otherSpellings];
  }

  const flattened = fromOrient([{ kind: 'member', toString: 'ok' }, { kind: 'numeric', 1: 1 }] as const);
  flattened.filter((row) => {
    if (row.kind === 'member') {
      // @ts-expect-error flattened columns are not discriminant-correlated
      return row.toString.toUpperCase() === 'OK';
    }
    return false;
  });
  const shallow = fromOrient([{ cell: { 1: 1 } }, { cell: {} }]);
  expectType<number | undefined>(shallow.row(0).cell[1]);
  const numericDictionary: readonly (Record<number, number> | { '1': string })[] = [{ 1: 1 }, { '1': 'x' }, {}];
  const dictionary = fromOrient(numericDictionary);
  expectType<Equal<ReturnType<typeof dictionary.row>, JsonRow>>(true);
  const stringDictionary: readonly (Record<string, number> | { '1': string })[] = [{ n: 1 }, { '1': 'x' }, {}];
  const broadString = fromOrient(stringDictionary);
  expectType<Equal<ReturnType<typeof broadString.row>, JsonRow>>(true);
  type Domain = { toString: string; 1: number };
  const asserted = fromOrient<Domain>([{ toString: 'ok', 1: 1 }]);
  expectType<Equal<ReturnType<typeof asserted.row>, Domain>>(true);
  void [dictionary, broadString, asserted];
}

// Open index domains describe allowed names, not required own properties.
export function patternIndexInferenceContract(): void {
  const prefix: Record<`metric_${string}`, number>[] = [{ metric_n: 1 }, {}];
  const numeric: readonly Readonly<Record<`${number}`, number>>[] = [{ 1: 1 }, {}];
  const suffix: readonly Record<`${string}_metric`, number>[] = [{ n_metric: 1 }, {}];
  const infix: Record<`pre_${string}_post`, number>[] = [{ pre_n_post: 1 }, {}];
  const bigint: Record<`${bigint}`, number>[] = [{ 1: 1 }, {}];
  const intrinsic: Record<Uppercase<string>, number>[] = [{ N: 1 }, {}];
  const union: readonly (Record<`metric_${string}`, number> | { id: string })[] = [{ metric_n: 1 }, { id: 'a' }];
  const intersection: (Record<`metric_${string}`, number> & { id: string; toString: string })[] = [
    { id: 'a', toString: 'ok', metric_n: 1 }, { id: 'b', toString: 'yes' },
  ];
  const numericIntersection: readonly (Record<`${number}`, number> & { id: string })[] = [{ id: 'a', 1: 1 }, { id: 'b' }];
  const patternUnion: Record<`metric_${string}` | `${number}`, number>[] = [{ metric_n: 1 }, { 1: 2 }, {}];
  const absent: readonly Record<`metric_${string}`, number>[] = [{}];
  const readonlyPrefix: readonly Readonly<Record<`metric_${string}`, number>>[] = prefix;
  const mutableNumeric: Record<`${number}`, number>[] = [{ 1: 1 }, {}];
  const intersectedPatterns: Record<`pre_${string}` & `${string}_post`, number>[] = [{ pre_n_post: 1 }, {}];
  const matchingKnown: (Record<`metric_${string}`, number> & { metric_fixed: 2 })[] = [{ metric_fixed: 2, metric_n: 1 }, { metric_fixed: 2 }];

  // Omitted options and literal auto/records each select the inference overload.
  for (const options of [undefined, { orient: 'auto' }, { orient: 'records' }] as const) {
    const prefixed = fromOrient(prefix, options);
    expectType<Equal<ReturnType<typeof prefixed.row>, JsonRow>>(true);
    const value = prefixed.row(1).metric_n;
    // @ts-expect-error undefined-only guards leave null (and other JsonValue types)
    if (value !== undefined) value.toFixed();
    // @ts-expect-error filter requires a scalar guard, not only an undefined guard
    prefixed.filter(row => row.metric_n !== undefined && row.metric_n.toFixed() === '1');
    // @ts-expect-error sort requires the same guard
    prefixed.sort(a => a.metric_n !== undefined ? Number(a.metric_n.toFixed()) : 0);

    const numbered = fromOrient(numeric, options);
    expectType<Equal<ReturnType<typeof numbered.row>, JsonRow>>(true);
    const numberValue = numbered.row(1)['1'];
    // @ts-expect-error numeric-string patterns are also open dictionaries
    if (numberValue !== undefined) numberValue.toFixed();
    // @ts-expect-error numeric-string filter cells can be null
    numbered.filter(row => row['1'] !== undefined && row['1'].toFixed() === '1');
    // @ts-expect-error numeric-string sort cells can be null
    numbered.sort(a => a['1'] !== undefined ? Number(a['1'].toFixed()) : 0);
    if (typeof numberValue === 'number') numberValue.toFixed();
    numbered.filter(row => typeof row['1'] === 'number' && row['1'].toFixed() === '1');
    numbered.sort((a, b) => (typeof a['1'] === 'number' ? a['1'] : 0) - (typeof b['1'] === 'number' ? b['1'] : 0));

    const suffixed = fromOrient(suffix, options);
    expectType<Equal<ReturnType<typeof suffixed.row>, JsonRow>>(true);
    const infixed = fromOrient(infix, options);
    expectType<Equal<ReturnType<typeof infixed.row>, JsonRow>>(true);
    const bigints = fromOrient(bigint, options);
    expectType<Equal<ReturnType<typeof bigints.row>, JsonRow>>(true);
    const upper = fromOrient(intrinsic, options);
    expectType<Equal<ReturnType<typeof upper.row>, JsonRow>>(true);
    const united = fromOrient(union, options);
    expectType<Equal<ReturnType<typeof united.row>, JsonRow>>(true);
    const intersected = fromOrient(intersection, options);
    expectType<Equal<ReturnType<typeof intersected.row>, JsonRow>>(true);
    const numericKnown = fromOrient(numericIntersection, options);
    expectType<Equal<ReturnType<typeof numericKnown.row>, JsonRow>>(true);
    const patterns = fromOrient(patternUnion, options);
    expectType<Equal<ReturnType<typeof patterns.row>, JsonRow>>(true);
    const missing = fromOrient(absent, options);
    expectType<Equal<ReturnType<typeof missing.row>, JsonRow>>(true);
    const readonlyFrame = fromOrient(readonlyPrefix, options);
    expectType<Equal<ReturnType<typeof readonlyFrame.row>, JsonRow>>(true);
    const mutableFrame = fromOrient(mutableNumeric, options);
    expectType<Equal<ReturnType<typeof mutableFrame.row>, JsonRow>>(true);
    const intersectedDomains = fromOrient(intersectedPatterns, options);
    expectType<Equal<ReturnType<typeof intersectedDomains.row>, JsonRow>>(true);
    const overlappingKnown = fromOrient(matchingKnown, options);
    expectType<Equal<ReturnType<typeof overlappingKnown.row>, JsonRow>>(true);
    // @ts-expect-error no matching column need exist anywhere in the input
    expectType<number>(missing.row(0).metric_n);
    // @ts-expect-error known properties do not make pattern-index cells required
    intersected.filter(row => row.metric_n !== undefined && row.metric_n.toFixed() === '1');
    // @ts-expect-error numeric patterns remain open alongside required fields
    numericKnown.sort(a => a['1'] !== undefined ? Number(a['1'].toFixed()) : 0);

    for (const frame of [prefixed, numbered, suffixed, infixed, bigints, upper, united, intersected, numericKnown, patterns, missing,
      readonlyFrame, mutableFrame, intersectedDomains, overlappingKnown]) {
      const cell = frame.row(0).metric_n;
      if (typeof cell === 'number') cell.toFixed();
      frame.filter(row => typeof row.metric_n === 'number' && row.metric_n.toFixed() === '1');
      frame.sort((a, b) => (typeof a.metric_n === 'number' ? a.metric_n : 0)
        - (typeof b.metric_n === 'number' ? b.metric_n : 0));
    }

    // Finite templates must retain required/optional fields, including Object keys.
    const finite: readonly Record<`metric_${'a' | 'b'}`, number>[] = [{ metric_a: 1, metric_b: 2 }];
    const finiteFrame = fromOrient(finite, options);
    expectType<Equal<ReturnType<typeof finiteFrame.row>, { metric_a: number; metric_b: number }>>(true);
    finiteFrame.filter(row => row.metric_a.toFixed() === '1');
    finiteFrame.sort((a, b) => a.metric_b - b.metric_b);
    const finiteOptional: Partial<Record<`metric_${'a' | 'b'}`, number>>[] = [{ metric_a: 1 }, {}];
    const optionalFrame = fromOrient(finiteOptional, options);
    expectType<Equal<ReturnType<typeof optionalFrame.row>, { metric_a?: number | null; metric_b?: number | null }>>(true);
    const finiteNumeric: readonly (Record<`${1 | 2}`, number> | { 1: 'x'; 2: 'y' })[] = [{ 1: 1, 2: 2 }, { 1: 'x', 2: 'y' }];
    const aliases = fromOrient(finiteNumeric, options);
    expectType<Equal<ReturnType<typeof aliases.row>, { '1': number | 'x'; '2': number | 'y' }>>(true);
    expectType<number | 'x'>(aliases.row(0)[1]);
    expectType<number | 'x'>(aliases.row(0)['1']);
    const members: readonly Record<`${'toString' | 'constructor' | 'valueOf' | '__proto__'}`, number>[] = [
      { toString: 1, constructor: 2, valueOf: 3, ['__proto__']: 4 },
    ];
    const memberFrame = fromOrient(members, options);
    expectType<Equal<ReturnType<typeof memberFrame.row>, { toString: number; constructor: number; valueOf: number; __proto__: number }>>(true);
    const finiteBoolean: Record<`flag_${boolean}`, number>[] = [{ flag_true: 1, flag_false: 0 }];
    const booleanFrame = fromOrient(finiteBoolean, options);
    expectType<Equal<ReturnType<typeof booleanFrame.row>, { flag_true: number; flag_false: number }>>(true);
    const asserted = fromOrient<Record<`metric_${string}`, number>>(prefix, options);
    expectType<Equal<ReturnType<typeof asserted.row>, Record<`metric_${string}`, number>>>(true);
    void [optionalFrame, memberFrame, booleanFrame, asserted];
  }
  const omitted = fromOrient(prefix);
  expectType<Equal<ReturnType<typeof omitted.row>, JsonRow>>(true);
  void omitted;
}
