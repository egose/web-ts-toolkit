/** Source-owned strict API fixture against the local build, not a packed/peer matrix. */
import mongoose, { type HydratedDocument } from 'mongoose';
import { createAccessRuntime, type FilteredOutput, type OutputFieldOptions } from '@web-ts-toolkit/access-router';
import type {
  FilteredOutput as AdvancedFilteredOutput,
  ModelRequest,
  DataRequest,
} from '@web-ts-toolkit/access-router/advanced';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Row = {
  _id: string;
  name: string;
  nested: { required: string };
  array: readonly { label: string }[];
  map: ReadonlyMap<string, { value: number }>;
  date: Date;
  regex: RegExp;
  bytes: Buffer;
  bson: mongoose.Types.ObjectId;
};
declare const request: ModelRequest;
declare const core: ModelRequest['macl'];
declare const dataRequest: DataRequest;
declare const rows: readonly Row[];
declare const data: FilteredOutput<Row>;
declare const hydrated: readonly HydratedDocument<Row>[];
const api = createAccessRuntime();
const router = api.createRouter(mongoose.model<Row>('ManySourceTypes', new mongoose.Schema({ name: String })), {});
const options: OutputFieldOptions<Row> = {
  authorization: { outputFields: { mode: 'grant', paths: ['nested.required'] } },
};

type RootAdvanced = Assert<Equal<FilteredOutput<Row>, AdvancedFilteredOutput<Row>>>;
type NestedOptional = Assert<Equal<FilteredOutput<{ x: { y: string } }>, { readonly x?: { readonly y?: string } }>>;
type Nullish = Assert<Equal<FilteredOutput<null | undefined>, null | undefined>>;
type Unknown = Assert<Equal<FilteredOutput<unknown>, unknown>>;
type Hydrated = Assert<Equal<FilteredOutput<HydratedDocument<Row>>, unknown>>;
type OtherBson = Assert<Equal<FilteredOutput<mongoose.Types.ObjectId>, unknown>>;
type NumericMap = Assert<Equal<FilteredOutput<Map<number, string>>, unknown>>;
type StringMap = Assert<Equal<FilteredOutput<Map<string, number>>, Readonly<Record<string, number | undefined>>>>;
type SymbolKeys = Assert<Equal<FilteredOutput<{ [key: symbol]: string; x: number }>, { readonly x?: number }>>;
type Tuple = Assert<
  Equal<FilteredOutput<readonly [number, string]>, ReadonlyArray<number | string | null | undefined>>
>;
type Deep = { x: { x: { x: { x: { x: { x: { x: { x: string } } } } } } } };
type DepthEight = Assert<
  Equal<
    FilteredOutput<Deep>,
    {
      readonly x?: {
        readonly x?: {
          readonly x?: { readonly x?: { readonly x?: { readonly x?: { readonly x?: { readonly x?: unknown } } } } };
        };
      };
    }
  >
>;
class DateSubclass extends Date {
  subclassOnly = true;
}
type CanonicalDate = Assert<Equal<FilteredOutput<DateSubclass>, Date>>;
type CanonicalRegExp = Assert<Equal<FilteredOutput<RegExp>, RegExp>>;
type CanonicalBuffer = Assert<Equal<FilteredOutput<Buffer>, Buffer>>;
type TypeAssertions = [
  RootAdvanced,
  NestedOptional,
  Nullish,
  Unknown,
  Hydrated,
  OtherBson,
  NumericMap,
  StringMap,
  SymbolKeys,
  Tuple,
  DepthEight,
  CanonicalDate,
  CanonicalRegExp,
  CanonicalBuffer,
];
declare const assertions: TypeAssertions;
void assertions;

async function sourceConsumers() {
  for (const service of [
    core.getService<Row>('ManySourceTypes'),
    core.getPublicService<Row>('ManySourceTypes'),
    router.getService(request),
    router.getPublicService(request),
  ]) {
    const result: readonly FilteredOutput<Row>[] = await service.pickAllowedFieldsMany(rows, 'list', options);
    const frozen = await service.pickAllowedFieldsMany(Object.freeze([{ name: 'N' }]), 'read', undefined);
    const nullish: readonly (FilteredOutput<Row> | null | undefined)[] = await service.pickAllowedFieldsMany(
      [...rows, null, undefined],
      'list',
    );
    const unknownHydrated: readonly unknown[] = await service.pickAllowedFieldsMany(hydrated, 'read');
    // @ts-expect-error filtered rows cannot prove required input fields
    const required: readonly Row[] = result;
    // @ts-expect-error readonly output is not a mutable array
    result.push({});
    // @ts-expect-error optional nested presence cannot be assumed
    result[0].nested.required.toUpperCase();
    // @ts-expect-error no unsupported helper purpose
    service.pickAllowedFieldsMany(rows, 'read', { purpose: 'output' });
    // @ts-expect-error no row authority dimension
    service.pickAllowedFieldsMany(rows, 'read', { authorization: { rows: { mode: 'unrestricted' } } });
    // @ts-expect-error no output capability
    service.pickAllowedFieldsMany(rows, 'read', { documentAuthorization: {} });
    // @ts-expect-error finite arity, including trailing undefined
    service.pickAllowedFieldsMany(rows, 'read', undefined, undefined);
    // @ts-expect-error new API exists only on model-aware services
    dataRequest.dacl.getService('NoMany').pickAllowedFieldsMany(rows, 'read');
    void [required, frozen, nullish, unknownHydrated];
  }
  const result: readonly FilteredOutput<Row>[] = await core.pickAllowedFieldsMany<Row, Row>(
    'ManySourceTypes',
    rows,
    'list',
    options,
  );
  // @ts-expect-error Core arity is finite too
  core.pickAllowedFieldsMany('ManySourceTypes', rows, 'list', undefined, undefined);
  // @ts-expect-error Core options do not accept bypass booleans
  core.pickAllowedFieldsMany('ManySourceTypes', rows, 'list', false);
  // @ts-expect-error cannot assume all string fields remain
  const name: string = data.name;
  const id: string | undefined = data._id;
  // @ts-expect-error readonly is an inspection aid, not a write-through API
  data.name = 'not writable';
  // @ts-expect-error string Map normalizes to a record, not a Map
  data.map?.get('key');
  const mapValue: number | undefined = data.map?.key?.value;
  const arrayLabel: string | undefined = data.array?.[0]?.label;
  const bytes: Buffer | undefined = data.bytes;
  const date: Date | undefined = data.date;
  const regex: RegExp | undefined = data.regex;
  // @ts-expect-error BSON normalization is deliberately unknown
  data.bson.toHexString();
  // @ts-expect-error canonical Date loses subclass members
  const subclass: DateSubclass = data.date;
  void [result, name, id, mapValue, arrayLabel, bytes, date, regex, subclass];
}
void sourceConsumers;
