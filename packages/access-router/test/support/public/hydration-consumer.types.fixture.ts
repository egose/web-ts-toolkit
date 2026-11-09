import { createAccessRuntime } from '@web-ts-toolkit/access-router';
import type {
  HydrationMode,
  ModelHydrationOptions,
  ModelRouter,
  ModelRouterOptions,
  DefaultModelRouterOptions,
  GlobalOptions,
  DataRouterOptions,
  RootRouterOptions,
} from '@web-ts-toolkit/access-router';
import type {
  HydrationMode as AdvancedMode,
  ModelHydrationOptions as AdvancedHydration,
  ModelRequest,
  Defaults,
  PublicListOptions,
  PublicReadOptions,
  FindOptions,
  FindOneOptions,
  FindByIdOptions,
  SubdocumentParentOptions,
  RootModelListQueryEntry,
  RootModelReadByIdQueryEntry,
  RootModelReadByFilterQueryEntry,
  AdvancedListBody,
  AdvancedReadBody,
  AdvancedReadFilterBody,
  Populate,
  SubPopulate,
} from '@web-ts-toolkit/access-router/advanced';

type Assert<T extends true> = T;
type Equal<A, B> = [A, B] extends [B, A] ? true : false;
export type ModeParity = Assert<Equal<HydrationMode, AdvancedMode>>;
export type ConfigurationParity = Assert<Equal<ModelHydrationOptions, AdvancedHydration>>;
export type ExactMethods = Assert<
  Equal<keyof ModelHydrationOptions, 'publicList' | 'publicRead' | 'find' | 'findOne' | 'findById'>
>;
type NoControls<T> = Extract<keyof T, 'lean' | 'hydration'> extends never ? true : false;
export type PublicListBoundary = Assert<NoControls<PublicListOptions>>;
export type PublicReadBoundary = Assert<NoControls<PublicReadOptions>>;
export type FindBoundary = Assert<NoControls<FindOptions>>;
export type FindOneBoundary = Assert<NoControls<FindOneOptions>>;
export type FindByIdBoundary = Assert<NoControls<FindByIdOptions>>;
export type ParentBoundary = Assert<NoControls<SubdocumentParentOptions>>;
export type DefaultsBoundary = Assert<NoControls<Defaults>>;
export type GlobalBoundary = Assert<NoControls<GlobalOptions>>;
export type DataBoundary = Assert<NoControls<DataRouterOptions>>;
export type RootBoundary = Assert<NoControls<RootRouterOptions>>;
export type RootListBoundary = Assert<NoControls<NonNullable<RootModelListQueryEntry['options']>>>;
export type RootIdReadBoundary = Assert<NoControls<NonNullable<RootModelReadByIdQueryEntry['options']>>>;
export type RootFilterReadBoundary = Assert<NoControls<NonNullable<RootModelReadByFilterQueryEntry['options']>>>;
export type AdvancedListBoundary = Assert<NoControls<NonNullable<AdvancedListBody['options']>>>;
export type AdvancedReadBoundary = Assert<NoControls<NonNullable<AdvancedReadBody['options']>>>;
export type AdvancedFilterReadBoundary = Assert<NoControls<NonNullable<AdvancedReadFilterBody['options']>>>;
export type PopulateBoundary = Assert<NoControls<Populate>>;
export type SubPopulateBoundary = Assert<NoControls<SubPopulate>>;

export function hydrationContract(req: ModelRequest, router: ModelRouter) {
  const api = createAccessRuntime();
  const hydration = {
    publicList: 'hydrated',
    publicRead: 'lean',
    find: 'lean',
    findOne: 'hydrated',
    findById: 'lean',
  } satisfies ModelHydrationOptions;
  const options = { hydration } satisfies ModelRouterOptions;
  const defaults = { hydration } satisfies DefaultModelRouterOptions;
  api.setDefaultModelOptions(defaults);
  api.setModelOptions('Thing', options);
  api.setModelOption('Thing', 'hydration', undefined);
  for (const key of ['publicList', 'publicRead', 'find', 'findOne', 'findById'] as const) {
    api.setDefaultModelOption(`hydration.${key}`, 'lean');
    api.setModelOption('Thing', `hydration.${key}`, undefined);
    router.setOption(`hydration.${key}`, 'hydrated');
  }
  // @ts-expect-error no scalar shorthand
  api.setModelOption('Thing', 'hydration', 'lean');
  // @ts-expect-error only exact method keys are supported
  api.setModelOption('Thing', 'hydration.default', 'lean');
  // @ts-expect-error modes are not booleans
  api.setDefaultModelOption('hydration.find', true);
  // @ts-expect-error old defaults must be migrated
  api.setModelOption('Thing', 'defaults.findOptions', { lean: true });
  const service = req.macl.getService('Thing');
  const publicService = req.macl.getPublicService('Thing');
  // @ts-expect-error internal list hydration is server-owned
  void service.find({}, {}, { lean: true });
  // @ts-expect-error internal read hydration is server-owned
  void service.findOne({}, {}, { lean: false });
  // @ts-expect-error inherited options also omit lean
  void service.findById('id', {}, { lean: true });
  // @ts-expect-error no renamed per-call knob
  void service.find({}, {}, { hydration: 'lean' });
  // @ts-expect-error public list has no caller hydration
  void publicService._list({}, {}, { lean: true });
  // @ts-expect-error public read has no caller hydration
  void publicService._read('id', {}, { lean: false });
  // @ts-expect-error filter read has no replacement knob
  void publicService._readFilter({}, {}, { hydration });
  // @ts-expect-error raw helpers are fixed hydrated
  void service.getParentDoc('id', 'children', {}, { lean: true });
  // @ts-expect-error raw adapter helper cannot accept a lean spread backdoor
  void service.findRawParentDoc({ filter: {}, select: '', populate: [], lean: true });
  // @ts-expect-error service defaults are presentation-only
  service.defaults = { findOneOptions: { hydration: 'lean' } };
}
