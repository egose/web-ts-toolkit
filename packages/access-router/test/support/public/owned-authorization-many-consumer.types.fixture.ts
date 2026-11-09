/** Strict installed-publication additions; the original 14-equality fixture also runs unchanged. */
import type { HydratedDocument, Types } from 'mongoose';
import type { FilteredOutput } from '@web-ts-toolkit/access-router';
import type { FilteredOutput as AdvancedFilteredOutput, ModelRequest } from '@web-ts-toolkit/access-router/advanced';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type StringIdHydrated = Assert<Equal<FilteredOutput<HydratedDocument<{ _id: string; name: string }>>, unknown>>;
type MapArray = Assert<
  Equal<
    FilteredOutput<ReadonlyMap<string, readonly { label: string }[]>>,
    Readonly<Record<string, ReadonlyArray<{ readonly label?: string } | null | undefined> | undefined>>
  >
>;
type Getter = Assert<Equal<FilteredOutput<{ readonly label: string }>, { readonly label?: string }>>;
type Advanced = Assert<Equal<FilteredOutput<{ id: Types.ObjectId }>, AdvancedFilteredOutput<{ id: Types.ObjectId }>>>;
type CanonicalBuffer = Assert<Equal<FilteredOutput<Buffer & { subclassOnly: true }>, Buffer>>;
type NullishRows = Assert<
  Equal<FilteredOutput<{ name: string } | null | undefined>, { readonly name?: string } | null | undefined>
>;
export type InstalledAssertions = [StringIdHydrated, MapArray, Getter, Advanced, CanonicalBuffer, NullishRows];

export async function inferredConsumer(req: ModelRequest) {
  const service = req.macl.getService<{ name: string }>('Employee');
  const inferred = await service.pickAllowedFieldsMany(
    Object.freeze([{ name: 'N', nested: { value: 1 } }] as const),
    'list',
  );
  const name: 'N' | undefined = inferred[0].name;
  const value: 1 | undefined = inferred[0].nested?.value;
  const nullish = await req.macl.getPublicService('Employee').pickAllowedFieldsMany([null, undefined], 'read');
  const empty: null | undefined = nullish[0];
  const core = await req.macl.pickAllowedFieldsMany('Employee', [{ name: 'N' }], 'read');
  const coreName: string | undefined = core[0].name;
  return { name, value, empty, coreName };
}
