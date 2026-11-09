import {
  createAccessRuntime,
  getDefaultModelOption,
  getDefaultModelOptions,
  setDefaultModelOption,
  setDefaultModelOptions,
  setModelOption,
  setModelOptions,
  setGlobalOption,
  setGlobalOptions,
} from '@web-ts-toolkit/access-router';
import type {
  DefaultModelRouterOptions as RootModelDefaults,
  DataRouterOptions,
  ExtendedDefaultModelRouterOptions,
  ExtendedModelRouterOptions,
  GlobalOptions,
  ModelRouterOptions,
  RootRouterOptions,
  ServiceAuthorization,
} from '@web-ts-toolkit/access-router';
import type {
  GlobalOptions as AdvancedGlobals,
  AdvancedReadBody,
  Defaults,
  DefaultModelRouterOptions,
  ModelRouterOptions as AdvancedModels,
  ExtendedModelRouterOptions as AdvancedExtendedModels,
  ExtendedDefaultModelRouterOptions as AdvancedExtendedDefaults,
  Filter,
  FindArgs,
  FindOptions,
  ModelRequest,
  Populate,
  PublicReadOptions,
  RootModelReadByIdQueryEntry,
  SubdocumentReadOptions,
} from '@web-ts-toolkit/access-router/advanced';
import type { Model } from 'mongoose';

type Flag = 'requireOperationAccessForPopulateQueries' | 'requireOperationAccessForPopulateDependencies';
type LegacyFlag = 'requireRegisteredPopulateModels' | 'requireReadOperationAccessForPopulateDependencies';
type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type NoFlag<T> = Extract<keyof T, Flag> extends never ? true : false;
export type RootBoolean = Assert<Equal<ModelRouterOptions[Flag], boolean | undefined>>;
export type AdvancedBoolean = Assert<Equal<DefaultModelRouterOptions[Flag], RootModelDefaults[Flag]>>;
export type AdvancedModelBoolean = Assert<Equal<AdvancedModels[Flag], boolean | undefined>>;
export type ModelDefaultBoolean = Assert<Equal<RootModelDefaults[Flag], boolean | undefined>>;
export type ExtendedBoolean = Assert<Equal<ExtendedModelRouterOptions[Flag], ExtendedDefaultModelRouterOptions[Flag]>>;
export type ExtendedModelBoolean = Assert<Equal<ExtendedModelRouterOptions[Flag], boolean | undefined>>;
export type AdvancedExtendedBoolean = Assert<Equal<AdvancedExtendedModels[Flag], boolean | undefined>>;
export type AdvancedExtendedDefaultBoolean = Assert<Equal<AdvancedExtendedDefaults[Flag], boolean | undefined>>;
export type OptionalModelFlags = Assert<Equal<{} extends Pick<ModelRouterOptions, Flag> ? true : false, true>>;
export type OptionalDefaultFlags = Assert<Equal<{} extends Pick<RootModelDefaults, Flag> ? true : false, true>>;
export type RootLegacyAbsent = Assert<Equal<Extract<keyof GlobalOptions, LegacyFlag>, never>>;
export type AdvancedLegacyAbsent = Assert<Equal<Extract<keyof AdvancedGlobals, LegacyFlag>, never>>;
export type ModelLegacyAbsent = Assert<Equal<Extract<keyof ModelRouterOptions, LegacyFlag>, never>>;
export type ModelDefaultLegacyAbsent = Assert<Equal<Extract<keyof RootModelDefaults, LegacyFlag>, never>>;
export type GlobalBoundary = Assert<NoFlag<GlobalOptions>>;
export type AdvancedGlobalBoundary = Assert<NoFlag<AdvancedGlobals>>;
export type RootBoundary = Assert<NoFlag<RootRouterOptions>>;
export type DataBoundary = Assert<NoFlag<DataRouterOptions>>;
export type AuthorityBoundary = Assert<NoFlag<ServiceAuthorization>>;
export type ArgsBoundary = Assert<NoFlag<FindArgs>>;
export type OptionsBoundary = Assert<NoFlag<FindOptions>>;
export type PublicBoundary = Assert<NoFlag<PublicReadOptions>>;
export type ChildBoundary = Assert<NoFlag<SubdocumentReadOptions>>;
export type PopulateBoundary = Assert<NoFlag<Populate>>;
export type DefaultsBoundary = Assert<NoFlag<NonNullable<Defaults['findOptions']>>>;
export type WireBoundary = Assert<NoFlag<NonNullable<AdvancedReadBody['options']>>>;
export type BatchBoundary = Assert<NoFlag<NonNullable<RootModelReadByIdQueryEntry['options']>>>;

export function configure(req: ModelRequest) {
  const api = createAccessRuntime();
  const options = {
    requireOperationAccessForPopulateQueries: false,
    requireOperationAccessForPopulateDependencies: false,
  } satisfies DefaultModelRouterOptions;
  api.setDefaultModelOptions(options);
  setDefaultModelOptions(options);
  setDefaultModelOption('requireOperationAccessForPopulateQueries', false);
  setDefaultModelOption('requireOperationAccessForPopulateDependencies', false);
  const defaultSnapshot: RootModelDefaults = getDefaultModelOptions();
  const defaultQuery: boolean | undefined = getDefaultModelOption('requireOperationAccessForPopulateQueries');
  api.setModelOptions('Thing', options);
  setModelOptions('Thing', options);
  setModelOption('Thing', 'requireOperationAccessForPopulateDependencies', undefined);
  api.setModelOption('Thing', 'requireOperationAccessForPopulateQueries', undefined);
  api.runtime.setModelOptions('Thing', options);
  api.runtime.setModelOption('Thing', 'requireOperationAccessForPopulateDependencies', true);
  api.runtime.setDefaultModelOptions(options);
  api.runtime.setDefaultModelOption('requireOperationAccessForPopulateQueries', undefined);
  const router = api.createRouter('Thing', options);
  router.setOptions(options);
  router.setOption('requireOperationAccessForPopulateQueries', false);
  router.setOption('requireOperationAccessForPopulateDependencies', undefined);
  router.set('requireOperationAccessForPopulateQueries', undefined);
  router.set({ requireOperationAccessForPopulateDependencies: false });
  api.setDefaultModelOption('permissionSchema', { name: true });
  const mode: boolean | undefined = api.getModelOption('Thing', 'requireOperationAccessForPopulateDependencies');
  const queryMode: boolean | undefined = api.getDefaultModelOption('requireOperationAccessForPopulateQueries');
  const snapshot: ModelRouterOptions = api.getModelOptions('Thing');
  void [mode, queryMode, snapshot, defaultSnapshot, defaultQuery];
  // @ts-expect-error no string-to-boolean coercion in the public option
  api.setModelOptions('Thing', { requireOperationAccessForPopulateDependencies: 'false' });
  // @ts-expect-error no numeric bypass
  api.setModelOption('Thing', 'requireOperationAccessForPopulateDependencies', 0);
  // @ts-expect-error query operation admission is boolean too
  api.setDefaultModelOptions({ requireOperationAccessForPopulateQueries: 'false' });
  // @ts-expect-error query operation admission is boolean too
  api.setDefaultModelOption('requireOperationAccessForPopulateQueries', 0);
  // @ts-expect-error optional booleans are not nullable
  router.setOption('requireOperationAccessForPopulateQueries', null);
  // @ts-expect-error moved flags are no longer global bulk configuration
  api.setGlobalOptions(options);
  // @ts-expect-error no named-root global bulk capability
  setGlobalOptions(options);
  // @ts-expect-error no named-root global exact capability
  setGlobalOption('requireOperationAccessForPopulateQueries', false);
  // @ts-expect-error the runtime's exact global surface excludes dependencies too
  api.runtime.setGlobalOption('requireOperationAccessForPopulateDependencies', false);
  // @ts-expect-error global aliases do not broadcast model defaults
  api.set(options);
  // @ts-expect-error exact global aliases cannot clear a model override
  api.set('requireOperationAccessForPopulateDependencies', undefined);
  // @ts-expect-error removed registration capability has no alias
  api.setGlobalOptions({ requireRegisteredPopulateModels: false });
  // @ts-expect-error removed private flag has no alias
  api.setGlobalOptions({ requireReadOperationAccessForPopulateDependencies: false });
  // @ts-expect-error removed registration capability is not a typed setter key
  api.setGlobalOption('requireRegisteredPopulateModels', false);
  // @ts-expect-error removed private flag is not an alias key
  api.set('requireReadOperationAccessForPopulateDependencies', false);
  // @ts-expect-error no removed named-root setter overload
  setGlobalOption('requireRegisteredPopulateModels', false);
  const service = req.macl.getService('Thing');
  // @ts-expect-error target-model capability is not per-service authority
  void service.findOne({}, {}, options);
  // @ts-expect-error target-model capability is not query intent
  void service.find({}, options);
  // @ts-expect-error target-model capability is not a wire option
  const body: AdvancedReadBody = { options };
  void body;
  // @ts-expect-error no model or policy capability on ordinary Populate descriptors
  const callerModel: Populate = { path: 'account', model: targetModel };
  // @ts-expect-error a default-model record is not a method presentation-default bucket
  service.defaults = { findOptions: options };
  void callerModel;
}

interface BusinessRecord {
  requireOperationAccessForPopulateQueries: boolean;
  requireOperationAccessForPopulateDependencies: boolean;
}
declare const targetModel: Model<BusinessRecord>;
export const businessFilter: Filter<BusinessRecord> = {
  requireOperationAccessForPopulateQueries: false,
  requireOperationAccessForPopulateDependencies: false,
};
export const businessArgs: FindArgs<BusinessRecord> = {
  select: ['requireOperationAccessForPopulateQueries', 'requireOperationAccessForPopulateDependencies'],
};
export const businessFields: ModelRouterOptions<BusinessRecord> = {
  permissionSchema: {
    requireOperationAccessForPopulateQueries: true,
    requireOperationAccessForPopulateDependencies: true,
  },
};
