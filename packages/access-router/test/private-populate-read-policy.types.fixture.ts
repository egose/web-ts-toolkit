import { createAccessRuntime } from '@web-ts-toolkit/access-router';
import type { GlobalOptions, ModelRouterOptions, RootRouterOptions } from '@web-ts-toolkit/access-router';
import type {
  GlobalOptions as AdvancedGlobals,
  AdvancedReadBody,
  Defaults,
  Filter,
  FindArgs,
  FindOptions,
  ModelRequest,
  Populate,
  PublicReadOptions,
  RootModelReadByIdQueryEntry,
  SubdocumentReadOptions,
} from '@web-ts-toolkit/access-router/advanced';

type Flag = 'requireReadOperationAccessForPopulateDependencies';
type Assert<T extends true> = T;
type Equal<A, B> = [A, B] extends [B, A] ? true : false;
type NoFlag<T> = Extract<keyof T, Flag> extends never ? true : false;
export type RootBoolean = Assert<Equal<GlobalOptions[Flag], boolean | undefined>>;
export type AdvancedBoolean = Assert<Equal<AdvancedGlobals[Flag], GlobalOptions[Flag]>>;
export type ModelBoundary = Assert<NoFlag<ModelRouterOptions>>;
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
  const options = { requireReadOperationAccessForPopulateDependencies: false } satisfies GlobalOptions;
  api.setGlobalOptions(options);
  api.setGlobalOption('requireReadOperationAccessForPopulateDependencies', true);
  api.set(options);
  api.set('requireReadOperationAccessForPopulateDependencies', undefined);
  api.runtime.setGlobalOptions(options);
  api.runtime.setGlobalOption('requireReadOperationAccessForPopulateDependencies', false);
  const mode: boolean | undefined = api.getGlobalOption('requireReadOperationAccessForPopulateDependencies');
  const snapshot: AdvancedGlobals = api.getGlobalOptions();
  void [mode, snapshot];
  // @ts-expect-error no string-to-boolean coercion in the public option
  api.setGlobalOptions({ requireReadOperationAccessForPopulateDependencies: 'false' });
  // @ts-expect-error no numeric bypass
  api.setGlobalOption('requireReadOperationAccessForPopulateDependencies', 0);
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
  requireReadOperationAccessForPopulateDependencies: boolean;
}
export const businessFilter: Filter<BusinessRecord> = { requireReadOperationAccessForPopulateDependencies: false };
export const businessArgs: FindArgs<BusinessRecord> = {
  select: ['requireReadOperationAccessForPopulateDependencies'],
};
export const businessFields: ModelRouterOptions<BusinessRecord> = {
  permissionSchema: { requireReadOperationAccessForPopulateDependencies: true },
};
