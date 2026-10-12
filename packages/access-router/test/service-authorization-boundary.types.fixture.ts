import type {
  Defaults,
  ExtendedModelRouterOptions,
  LegacyInclude,
  SubQueryEntry,
  Populate,
  SubPopulate,
  PublicListOptions,
  PublicReadOptions,
  PublicCreateOptions,
  PublicUpdateOptions,
  PublicUpsertOptions,
  RootQueryEntry,
  FindOptions,
  CreateOptions,
  AdvancedCreateBody,
  AdvancedListBody,
  AdvancedReadBody,
  AdvancedReadFilterBody,
  AdvancedUpdateBody,
  AdvancedUpsertBody,
  PublicSubdocumentReadOptions,
  PublicSubdocumentListOptions,
  PublicSubdocumentCreateOptions,
} from '../dist/advanced.js';
import type { AccessRouterRequest } from '../dist/index.js';

type Forbidden = 'authorization' | 'overrides' | 'documentAuthorization' | 'execution' | 'preparedQuery' | 'operation';
type AssertNever<T extends never> = T;
type AllKeys<T> = T extends unknown ? keyof NonNullable<T> : never;
type DefaultValues = Defaults[keyof Defaults];
type DottedValues = ExtendedModelRouterOptions[Extract<keyof ExtendedModelRouterOptions, `defaults.${string}`>];
type Options = PublicListOptions | PublicReadOptions | PublicCreateOptions | PublicUpdateOptions | PublicUpsertOptions;
type Wire =
  | AdvancedListBody
  | AdvancedReadBody
  | AdvancedReadFilterBody
  | AdvancedCreateBody
  | AdvancedUpdateBody
  | AdvancedUpsertBody;
type WireOptions<T> = T extends { options?: infer O } ? O : never;
type NoDefaultAuthority = AssertNever<Extract<AllKeys<DefaultValues | DottedValues>, Forbidden>>;
type NoWireAuthority = AssertNever<
  Extract<
    AllKeys<
      | Options
      | Wire
      | WireOptions<Wire>
      | RootQueryEntry
      | Populate
      | SubPopulate
      | PublicSubdocumentReadOptions
      | PublicSubdocumentListOptions
      | PublicSubdocumentCreateOptions
    >,
    Forbidden
  >
>;

const defaults: Defaults = {
  findOptions: { skim: true },
  createArgs: { select: ['authorization'] },
  publicReadArgs: { select: ['overrides'] },
};
const nested: LegacyInclude = {
  model: 'Target',
  op: 'list',
  path: 'related',
  localField: 'id',
  foreignField: 'id',
  filter: { authorization: 'business', overrides: 'data' },
  args: { select: ['authorization'], limit: 2 },
  options: { skim: true },
};
const subquery: SubQueryEntry = {
  model: 'Target',
  op: 'read',
  args: { select: ['overrides'] },
  options: { tryList: false },
};
const internal: FindOptions = { authorization: { rows: { mode: 'unrestricted' } } };
const internalCreate: CreateOptions = { authorization: { outputFields: { mode: 'grant', paths: ['authorization'] } } };
// @ts-expect-error dotted defaults use the authority-free view too
const badDotted: ExtendedModelRouterOptions = { 'defaults.createOptions': { authorization: {} } };
// @ts-expect-error defaults cannot carry legacy bypasses into a public wrapper
const badDefaultArgs: Defaults = { createArgs: { overrides: {} } };
// @ts-expect-error nested options are no longer an untyped service transport
const badInclude: LegacyInclude = { ...nested, options: { authorization: {} } };
// @ts-expect-error nested args cannot carry legacy overrides
const badIncludeArgs: LegacyInclude = { ...nested, args: { overrides: {} } };
// @ts-expect-error $$sq options cannot express backend policy
const badSq: SubQueryEntry = { ...subquery, options: { authorization: {} } };
// @ts-expect-error $$sq args cannot carry private state
const badSqArgs: SubQueryEntry = { ...subquery, args: { preparedQuery: {} } };
// @ts-expect-error advanced envelopes remain request-only
const badWire: AdvancedUpdateBody = { data: {}, options: { documentAuthorization: {} } };
// @ts-expect-error root model options remain request-only
const badRoot: RootQueryEntry = { target: 'model', name: 'M', op: 'list', options: { execution: {} } };
// @ts-expect-error no capability is added to populate descriptors
const badPopulate: Populate = { path: 'customer', authorization: {} };
declare const request: AccessRouterRequest;
const publicService = request.macl!.getPublicService('M');
// @ts-expect-error public new has no raw backend policy
publicService._new({}, { authorization: {} });
publicService._new().then((result) => {
  if (!result.success) {
    const error: 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found' = result.code;
    void error;
  }
});
void [
  defaults,
  nested,
  subquery,
  internal,
  internalCreate,
  badDotted,
  badDefaultArgs,
  badInclude,
  badIncludeArgs,
  badSq,
  badSqArgs,
  badWire,
  badRoot,
  badPopulate,
];
export type { NoDefaultAuthority, NoWireAuthority };
