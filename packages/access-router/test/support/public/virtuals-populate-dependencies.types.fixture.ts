import type { Types } from 'mongoose';
import type {
  AccessRouterPermissions,
  ModelRouterOptions,
  ModelVirtualAccessRecord,
  ModelVirtualContext,
  ModelVirtualDescriptor,
  ModelVirtualDoc,
  ModelVirtualGetter,
  ModelVirtualLeaf,
  ModelVirtualPopulateDependency,
  ModelVirtualPopulateInputs,
  ModelVirtuals,
} from '@web-ts-toolkit/access-router';
import type {
  AccessRouterFieldKey,
  AdvancedReadBody,
  Filter,
  FindArgs,
  FindOptions,
  ModelRequest,
  ModelVirtualPopulateDependency as AdvancedDependency,
  ModelVirtualPopulateInputs as AdvancedInputs,
  Projection,
  PublicCreateArgs,
  SelectedPublicOutput,
  SubPopulate,
} from '@web-ts-toolkit/access-router/advanced';

interface Order {
  total: number;
  account: Types.ObjectId | null;
  accounts?: readonly (Types.ObjectId | null)[] | null;
  unknownAccount: unknown;
}
interface AccountInputs {
  balance: number;
  creditLimit: number;
  profile: { name: string; history: { amount: number }[] };
  at: Date;
  id: Types.ObjectId;
  bytes: Buffer;
  decimal: Types.Decimal128;
}
type Inputs = { account: AccountInputs; accounts: AccountInputs; unknownAccount: AccountInputs };
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type ExportParity = Assert<Equal<ModelVirtualPopulateInputs<Order, Inputs>, AdvancedInputs<Order, Inputs>>>;
export type DependencyParity = Assert<Equal<ModelVirtualPopulateDependency<Order>, AdvancedDependency<Order>>>;
export type PersistedInput = Assert<Equal<ModelVirtualDoc<Order>, Readonly<Partial<Order>>>>;
export type EmptyDefault = Assert<Equal<keyof ModelVirtualPopulateInputs<Order>, never>>;
export type OptionalFourth = Assert<Equal<Parameters<ModelVirtualGetter<Order>>['length'], 3 | 4>>;

export const key: AccessRouterFieldKey<Order> = 'account';
export const projection: Projection = { balance: 1, _id: -1 };
export const dependency: ModelVirtualPopulateDependency<Order> = { path: key, select: projection };
export const descriptor: ModelVirtualDescriptor<Order, boolean, Inputs> = {
  dependsOn: ['total'],
  dependsOnPopulate: [dependency],
  get(doc, _permissions, context, populated = {}) {
    const account = populated.account;
    const balance: number | undefined = account?.balance;
    const date: Date | undefined = account?.at;
    const id: Types.ObjectId | undefined = account?.id;
    const bytes: Buffer | undefined = account?.bytes;
    const decimal: Types.Decimal128 | undefined = account?.decimal;
    const amount: number | undefined = account?.profile?.history?.[0]?.amount;
    const arrayBalance: number | undefined = populated.accounts?.[0]?.balance;
    void [balance, date, id, bytes, decimal, amount, arrayBalance];
    // @ts-expect-error persisted ObjectIds are not private target records
    doc.account?.balance;
    // @ts-expect-error context does not transport populated inputs
    context.populated;
    // @ts-expect-error no undeclared source keys
    populated.other;
    // @ts-expect-error no guessed target fields
    account?.secret;
    // @ts-expect-error known arrays do not become scalar views
    populated.accounts?.balance;
    // @ts-expect-error source scalar does not become an array
    account?.[0];
    // @ts-expect-error nested target properties are readonly
    if (account?.profile) account.profile.name = 'mutated';
    // @ts-expect-error target arrays are readonly
    account?.profile?.history?.push({ amount: 1 });
    // @ts-expect-error source arrays are readonly
    populated.accounts?.push(null);
    // @ts-expect-error missing target fields must be guarded
    const definite: number = account?.balance;
    void definite;
    if (doc.total === undefined || account?.balance === undefined || account.creditLimit === undefined)
      return undefined;
    return doc.total <= account.balance + account.creditLimit;
  },
};

export const virtuals: ModelVirtuals<Order, { canOrder: boolean }> = { canOrder: descriptor };
export const options: ModelRouterOptions<Order, { canOrder: boolean }> = { virtuals };
export const accessRecord: ModelVirtualAccessRecord<Order, boolean, Inputs> = {
  dependsOnPopulate: [dependency],
  default: descriptor.get,
  read: { get: descriptor.get, dependsOnPopulate: [] },
};
export const recordVirtuals: ModelVirtuals<Order, { canOrder: boolean }> = { canOrder: accessRecord };
export const leaf: ModelVirtualLeaf<Order, boolean, Inputs> = descriptor;
export const legacy: ModelVirtualGetter<Order, boolean> = (doc, _permissions, _context) => doc.total === 0;
export const typedLegacy: ModelVirtualGetter<Order, boolean, Inputs> = legacy;
export const erasedTyped: ModelVirtualGetter<Order, boolean> = descriptor.get;
export function directCalls(request: ModelRequest, permissions: AccessRouterPermissions, context: ModelVirtualContext) {
  descriptor.get.call(request, {}, permissions, context);
  descriptor.get.call(request, { total: 0 }, permissions, context, { account: { balance: 0 } });
  legacy.call(request, {}, permissions, context);
}

export const unannotated: ModelVirtualGetter<Order, boolean> = (_doc, _permissions, _context, populated = {}) => {
  // @ts-expect-error unannotated targets have no guessed shape
  return populated.account?.balance === 1;
};
export const guarded: ModelVirtualGetter<Order, boolean, { account: AccountInputs }> = (
  _doc,
  _permissions,
  _context,
  populated,
) => {
  // @ts-expect-error optional fourth argument must be defaulted or guarded
  populated.account;
  return populated?.account?.balance === 0;
};

export const optionalInputs: ModelVirtualPopulateInputs<Order, Inputs> = {};
export const partialInputs: ModelVirtualPopulateInputs<Order, Inputs> = {
  account: { profile: {} },
  accounts: [null, {}, { balance: 0 }],
  unknownAccount: [{ creditLimit: 0 }],
};
export const nullInputs: ModelVirtualPopulateInputs<Order, Inputs> = { account: null, accounts: null };
export const unknownScalar: ModelVirtualPopulateInputs<unknown, { account: AccountInputs }> = {
  account: { balance: 0 },
};
export const unknownArray: ModelVirtualPopulateInputs<unknown, { account: AccountInputs }> = { account: [null, {}] };
type UnionSource = { account: Types.ObjectId | Types.ObjectId[] };
export const unionScalar: ModelVirtualPopulateInputs<UnionSource, { account: AccountInputs }> = { account: {} };
export const unionArray: ModelVirtualPopulateInputs<UnionSource, { account: AccountInputs }> = { account: [{}] };
// @ts-expect-error explicit maps reject unknown source keys even when another key is valid
export type UnknownMap = ModelVirtualPopulateInputs<Order, { account: AccountInputs; typo: AccountInputs }>;
// @ts-expect-error descriptor generic rejects unknown source keys
export type UnknownDescriptor = ModelVirtualDescriptor<Order, boolean, { typo: AccountInputs }>;
// @ts-expect-error declaration paths are known persisted keys
export const unknownPath: ModelVirtualPopulateDependency<Order> = { path: 'typo' };
// @ts-expect-error descriptors cannot add a private access override
export const badAccess: ModelVirtualPopulateDependency<Order> = { path: 'account', access: 'list' };
// @ts-expect-error 0 is not the projection grammar
export const badProjection: ModelVirtualPopulateDependency<Order> = { path: 'account', select: { balance: 0 } };
// @ts-expect-error target maps do not widen persisted write shapes
export const badWrite: Partial<Order> = { account: { balance: 1 } };
// @ts-expect-error target fields do not become persisted filter paths
export const badFilter: Filter<Order> = { 'account.balance': 1 };
export type PublicRef = Assert<Equal<SelectedPublicOutput<Order, ['account']>['account'], Types.ObjectId | null>>;
// @ts-expect-error private inputs do not widen selected public output
export const badPublic: SelectedPublicOutput<Order, ['account']> = { account: { balance: 1 } };
// @ts-expect-error no private dependency service query control
export const badArgs: FindArgs<Order> = { dependsOnPopulate: [dependency] };
// @ts-expect-error no private dependency service authority option
export const badOptions: FindOptions<Order> = { dependsOnPopulate: [dependency] };
// @ts-expect-error no private dependency wire control
export const badWire: PublicCreateArgs = { dependsOnPopulate: [dependency] };
// @ts-expect-error populated inputs are not a service query control
export const badPopulated: FindArgs<Order> = { populated: { account: { balance: 1 } } };
// @ts-expect-error no private declaration authority on advanced read wire bodies
export const badReadWire: AdvancedReadBody = { dependsOnPopulate: [dependency] };
// @ts-expect-error subdocument public population remains path/select-only
export const badSubPopulate: SubPopulate = { path: 'account', match: { balance: 1 } };
