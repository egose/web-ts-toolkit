import {
  createAccessRuntime,
  getGlobalOption,
  getGlobalOptions,
  setGlobalOption,
  setGlobalOptions,
} from '@web-ts-toolkit/access-router';
import type { GlobalOptions, ModelRouterOptions, RootRouterOptions } from '@web-ts-toolkit/access-router';
import type {
  GlobalOptions as AdvancedGlobals,
  AdvancedReadBody,
  Defaults,
  DefaultModelRouterOptions,
  Filter,
  FindArgs,
  FindOptions,
  ModelRequest,
  Populate,
  PublicReadOptions,
  RootModelReadByIdQueryEntry,
  SubdocumentReadOptions,
} from '@web-ts-toolkit/access-router/advanced';

type Flag = 'requireOperationAccessForPopulateQueries' | 'requireOperationAccessForPopulateDependencies';
type LegacyFlag = 'requireRegisteredPopulateModels' | 'requireReadOperationAccessForPopulateDependencies';
type Assert<T extends true> = T;
type Equal<A, B> = [A, B] extends [B, A] ? true : false;
type NoFlag<T> = Extract<keyof T, Flag> extends never ? true : false;
export type RootBoolean = Assert<Equal<GlobalOptions[Flag], boolean | undefined>>;
export type AdvancedBoolean = Assert<Equal<AdvancedGlobals[Flag], GlobalOptions[Flag]>>;
export type RootLegacyAbsent = Assert<Equal<Extract<keyof GlobalOptions, LegacyFlag>, never>>;
export type AdvancedLegacyAbsent = Assert<Equal<Extract<keyof AdvancedGlobals, LegacyFlag>, never>>;
export type ModelBoundary = Assert<NoFlag<ModelRouterOptions>>;
export type ModelDefaultsBoundary = Assert<NoFlag<DefaultModelRouterOptions>>;
export type RootBoundary = Assert<NoFlag<RootRouterOptions>>;
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
  } satisfies GlobalOptions;
  api.setGlobalOptions(options);
  setGlobalOptions(options);
  setGlobalOption('requireOperationAccessForPopulateQueries', false);
  setGlobalOption('requireOperationAccessForPopulateDependencies', false);
  const defaultSnapshot: GlobalOptions = getGlobalOptions();
  const defaultQuery: boolean | undefined = getGlobalOption('requireOperationAccessForPopulateQueries');
  api.setGlobalOption('requireOperationAccessForPopulateDependencies', true);
  api.setGlobalOption('requireOperationAccessForPopulateQueries', true);
  api.set(options);
  api.set('requireOperationAccessForPopulateDependencies', undefined);
  api.set('requireOperationAccessForPopulateQueries', undefined);
  api.runtime.setGlobalOptions(options);
  api.runtime.setGlobalOption('requireOperationAccessForPopulateDependencies', false);
  api.runtime.setGlobalOption('requireOperationAccessForPopulateQueries', false);
  api.setDefaultModelOptions({ permissionSchema: {} });
  api.setDefaultModelOption('permissionSchema', { name: true });
  const mode: boolean | undefined = api.getGlobalOption('requireOperationAccessForPopulateDependencies');
  const queryMode: boolean | undefined = api.getGlobalOption('requireOperationAccessForPopulateQueries');
  const snapshot: AdvancedGlobals = api.getGlobalOptions();
  void [mode, queryMode, snapshot, defaultSnapshot, defaultQuery];
  // @ts-expect-error no string-to-boolean coercion in the public option
  api.setGlobalOptions({ requireOperationAccessForPopulateDependencies: 'false' });
  // @ts-expect-error no numeric bypass
  api.setGlobalOption('requireOperationAccessForPopulateDependencies', 0);
  // @ts-expect-error query operation admission is boolean too
  api.setGlobalOptions({ requireOperationAccessForPopulateQueries: 'false' });
  // @ts-expect-error query operation admission is boolean too
  api.setGlobalOption('requireOperationAccessForPopulateQueries', 0);
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
  // @ts-expect-error runtime capability is not model configuration
  api.setModelOptions('Thing', options);
  const service = req.macl.getService('Thing');
  // @ts-expect-error runtime capability is not per-service authority
  void service.findOne({}, {}, options);
  // @ts-expect-error runtime capability is not query intent
  void service.find({}, options);
  // @ts-expect-error runtime capability is not a wire option
  const body: AdvancedReadBody = { options };
  void body;
}

interface BusinessRecord {
  requireOperationAccessForPopulateQueries: boolean;
  requireOperationAccessForPopulateDependencies: boolean;
}
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
