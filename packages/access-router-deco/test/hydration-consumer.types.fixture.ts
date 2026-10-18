import 'reflect-metadata';
import type { Model } from 'mongoose';
import type { HydrationMode, ModelHydrationOptions } from '@web-ts-toolkit/access-router';
import type { ModelHydrationOptions as AdvancedHydration, ModelRequest } from '@web-ts-toolkit/access-router/advanced';
import {
  DefaultModelOption,
  GlobalOption,
  ModelOption,
  Module,
  Router,
  RouterOptions,
} from '@web-ts-toolkit/access-router-deco';

type Thing = { name: string; lean: string; hydration: string };
declare const ThingModel: Model<Thing>;
declare const req: ModelRequest;
const mode: HydrationMode = 'lean';
const hydration: AdvancedHydration = { publicList: 'hydrated', publicRead: mode, findById: 'lean' };

@RouterOptions({ hydration })
class StartingDefaults {
  @DefaultModelOption('hydration')
  hydration: ModelHydrationOptions = { publicRead: 'lean' };

  @DefaultModelOption('hydration.publicList')
  list: HydrationMode = 'hydrated';
}

@RouterOptions(ThingModel, {
  hydration: { publicRead: 'hydrated', findOne: 'lean' },
  defaults: { publicListOptions: { includeCount: true } },
})
class ThingOptions {
  @ModelOption('hydration.find')
  find: HydrationMode = 'lean';
}

@Router(ThingModel, { hydration, permissionSchema: { name: true, lean: true, hydration: true } })
class ThingRouter {
  @ModelOption('hydration')
  hydration: ModelHydrationOptions = { findOne: 'lean' };

  @ModelOption('hydration.findById')
  id: HydrationMode | undefined = undefined;

  @ModelOption('hydration.publicRead')
  read: HydrationMode = 'lean';
}

@Module({ routers: [ThingRouter], routerOptions: [ThingOptions, StartingDefaults] })
class AppModule {}

for (const method of ['publicList', 'publicRead', 'find', 'findOne', 'findById'] as const) {
  ModelOption(`hydration.${method}`);
  DefaultModelOption(`hydration.${method}`);
}

// @ts-expect-error hydration is model configuration, not a global/module option
GlobalOption('hydration');
// @ts-expect-error only the five method-specific entries exist
ModelOption('hydration.default');
// @ts-expect-error default providers cannot invent hydration buckets
DefaultModelOption('hydration.include');

// @ts-expect-error root routers have no hydration configuration
@Router({ basePath: '/root', hydration: { publicList: 'lean' } })
class InvalidRoot {}
// @ts-expect-error no scalar shorthand
@Router('Thing', { hydration: 'lean' })
class InvalidScalar {}
// @ts-expect-error modes are strings, not retired lean booleans
@RouterOptions('Thing', { hydration: { publicRead: false } })
class InvalidMode {}
// @ts-expect-error default providers use the same bounded record
@RouterOptions({ hydration: { default: 'lean' } })
class InvalidDefaults {}
// @ts-expect-error migrate defaults.publicListOptions.lean to hydration.publicList
@Router('Thing', { defaults: { publicListOptions: { lean: false } } })
class LegacyDefaults {}
// @ts-expect-error hydration cannot be placed in per-call defaults either
@RouterOptions('Thing', { defaults: { findOneOptions: { hydration: 'lean' } } })
class MisplacedDefaults {}

const service = req.macl.getService<Thing>('Thing');
const publicService = req.macl.getPublicService<Thing>('Thing');
// @ts-expect-error retired per-call lean controls cannot return through decorator declarations
service.find({}, {}, { lean: true });
// @ts-expect-error replacement configuration is not a per-call option
service.findOne({}, {}, { hydration: { findOne: 'lean' } });
// @ts-expect-error inherited findById options expose no caller hydration control
service.findById('id', {}, { lean: false });
// @ts-expect-error public list has no caller hydration control
publicService._list({}, {}, { lean: true });
// @ts-expect-error public read has no caller hydration control
publicService._read('id', {}, { hydration: 'lean' });
// @ts-expect-error assigned defaults are presentation/query defaults, not hydration configuration
service.defaults = { findOptions: { lean: true } };

// Business fields are not controls. This remains valid data/filter/selection.
service.find({ lean: 'business', hydration: 'business' }, { select: ['lean', 'hydration'] });
void [AppModule, InvalidRoot, InvalidScalar, InvalidMode, InvalidDefaults, LegacyDefaults, MisplacedDefaults];
