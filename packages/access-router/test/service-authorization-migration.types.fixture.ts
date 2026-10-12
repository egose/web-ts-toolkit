/** Shared strict source-surface and installed-consumer contract for SVA-09. */
import type { AccessRouterRequest, ServiceAuthorization } from '@web-ts-toolkit/access-router';
import type {
  CreateArgs,
  Defaults,
  ExtendedModelRouterOptions,
  FindArgs,
  FindByIdArgs,
  FindOneArgs,
  NewArgs,
  UpdateByIdArgs,
  UpdateOneArgs,
  UpsertArgs,
} from '@web-ts-toolkit/access-router/advanced';

interface Order {
  status: string;
  internalNote?: string;
  authorization: string;
  overrides: { filter: string };
}
type Assert<T extends true> = T;
type Keys<T> = T extends unknown ? keyof T : never;
type Args =
  | FindArgs<Order>
  | FindOneArgs<Order>
  | FindByIdArgs<Order>
  | CreateArgs
  | UpdateOneArgs<Order>
  | UpdateByIdArgs<Order>
  | UpsertArgs<Order>
  | NewArgs;
type Retired = 'overrides' | 'idFilter' | 'effectiveSelect' | 'operation';
export type ArgsHaveNoLegacyControls = Assert<Extract<Keys<Args>, Retired> extends never ? true : false>;
export type DefaultsHaveNoLegacyControls = Assert<
  Extract<Keys<NonNullable<Defaults<Order>[keyof Defaults<Order>]>>, Retired> extends never ? true : false
>;

// Every formerly exported argument container is gone, including empty/nullish slots.
// @ts-expect-error use an ordinary predicate plus authorization.rows
const badFind: FindArgs<Order> = { overrides: { filter: {} } };
// @ts-expect-error use ordinary select plus authorization.outputFields
const badFindOne: FindOneArgs<Order> = { overrides: { select: ['internalNote'] } };
// @ts-expect-error custom lookups use findOne
const badFindById: FindByIdArgs<Order> = { overrides: { idFilter: {} } };
// @ts-expect-error ordinary populate and scoped related policies replace this container
const badCreate: CreateArgs = { overrides: { populate: [{ path: 'customer' }] } };
// @ts-expect-error mutation select is an ordinary argument
const badUpdate: UpdateOneArgs<Order> = { overrides: { effectiveSelect: ['internalNote'] } };
// @ts-expect-error initiating operation is private execution state
const badUpdateById: UpdateByIdArgs<Order> = { overrides: { operation: 'upsert' } };
// @ts-expect-error even an empty container was removed
const badUpsert: UpsertArgs<Order> = { overrides: {} };
// @ts-expect-error new does not accept legacy controls either
const badNew: NewArgs = { overrides: undefined };
// @ts-expect-error null does not restore the old nullish fallback
const badNull: FindOneArgs<Order> = { overrides: null };

const defaults: Defaults<Order> = {
  findOneArgs: { select: ['status'] },
  findArgs: { limit: 5 },
  createArgs: { select: ['status'] },
  updateOneArgs: { select: ['status'] },
};
// @ts-expect-error read defaults cannot carry a service container
const badReadDefaults: Defaults<Order> = { findOneArgs: { overrides: {} } };
// @ts-expect-error mutation defaults cannot carry a service container
const badMutationDefaults: Defaults<Order> = { upsertArgs: { overrides: undefined } };
// @ts-expect-error dotted defaults share the same removed-property contract
const badDottedDefaults: ExtendedModelRouterOptions<Order> = { 'defaults.updateByIdArgs': { overrides: {} } };

declare const req: AccessRouterRequest;
const service = req.macl!.getService<Order>('Order');
const authorization: ServiceAuthorization<Order> = {
  rows: { mode: 'scope', filter: { status: 'ready' } },
  outputFields: { mode: 'grant', paths: ['internalNote', 'overrides', 'authorization'] },
};
const select = ['status', 'internalNote'];
service.find({}, { select }, { authorization });
service.findOne({}, { select }, { authorization });
service.findById('id', { select }, { authorization });
service.create({}, { select }, { authorization: { outputFields: authorization.outputFields } });
service.updateOne({}, {}, { select }, { authorization });
service.updateById('id', {}, { select }, { authorization });
service.upsert({}, {}, { select }, { authorization });
service.new({}, { authorization: { outputFields: authorization.outputFields } });

// Ordinary business data and query fields with these names remain valid.
service.create({ authorization: 'invoice', overrides: { filter: 'preference' } });
service.findOne(
  { authorization: 'invoice', overrides: { filter: 'preference' } },
  {
    select: ['authorization', 'overrides'],
  },
);

// @ts-expect-error mixed old/new authority is never accepted
service.findOne({}, { select, overrides: { select } }, { authorization });
// @ts-expect-error JS presence rejection agrees with a removed TypeScript property
service.find({}, { overrides: undefined });
// @ts-expect-error custom identifier predicates use findOne/updateOne
service.findById('id', { overrides: { idFilter: {} } });
// @ts-expect-error legacy populate is removed from create
service.create({}, { overrides: { populate: [] } });
// @ts-expect-error effective selection is ordinary select
service.updateOne({}, {}, { overrides: { effectiveSelect: [] } });
// @ts-expect-error nullish legacy control is not a fallback
service.updateById('id', {}, { overrides: null });
// @ts-expect-error an empty legacy container is still invalid
service.upsert({}, {}, { overrides: {} });
// @ts-expect-error new rejects all legacy containers at runtime too
service.new({ overrides: {} });
// @ts-expect-error moving the old container into options does not retain it
service.findOne({}, {}, { authorization, overrides: {} });
// @ts-expect-error no replacement public prepared-query switch
service.findOne({}, {}, { preparedFilter: {} });
// @ts-expect-error initiating operation remains private, not a renamed option
service.create({}, {}, { operation: 'upsert' });

// Isolated positional helper compatibility remains; canonical output uses named policy.
service.genSelect('read', select, true);
service.pickAllowedFields({}, 'read', ['internalNote']);
service.genSelect('read', select, { authorization: { outputFields: authorization.outputFields } });
service.pickAllowedFields({}, 'read', { authorization: { outputFields: authorization.outputFields } });

void [
  badFind,
  badFindOne,
  badFindById,
  badCreate,
  badUpdate,
  badUpdateById,
  badUpsert,
  badNew,
  badNull,
  defaults,
  badReadDefaults,
  badMutationDefaults,
  badDottedDefaults,
];
