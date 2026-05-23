import type {
  CreateArgs,
  CreateOptions,
  ExistsOptions,
  FindArgs,
  FindByIdArgs,
  FindByIdOptions,
  FindOneArgs,
  FindOneOptions,
  FindOptions,
  UpdateByIdArgs,
  UpdateByIdOptions,
  UpdateOneArgs,
  UpdateOneOptions,
  UpsertArgs,
  UpsertOptions,
} from '../interfaces';
import type { Service } from './service';

export function resolveFindOneArgs<TModel>(service: Service<TModel>, args: FindOneArgs<TModel> = {}) {
  return {
    select: args.select ?? service.defaults.findOneArgs?.select,
    sort: args.sort ?? service.defaults.findOneArgs?.sort,
    populate: args.populate ?? service.defaults.findOneArgs?.populate,
    include: args.include ?? service.defaults.findOneArgs?.include,
    overrides: args.overrides ?? {},
  };
}

export function resolveFindOneOptions<TModel>(service: Service<TModel>, options: FindOneOptions = {}) {
  return {
    skim: options.skim ?? service.defaults.findOneOptions?.skim ?? false,
    includePermissions: options.includePermissions ?? service.defaults.findOneOptions?.includePermissions ?? true,
    access: options.access ?? service.defaults.findOneOptions?.access ?? 'read',
    populateAccess: options.populateAccess ?? service.defaults.findOneOptions?.populateAccess,
    lean: options.lean ?? service.defaults.findOneOptions?.lean ?? false,
  };
}

export function resolveFindByIdArgs<TModel>(service: Service<TModel>, args: FindByIdArgs<TModel> = {}) {
  return {
    select: args.select ?? service.defaults.findByIdArgs?.select,
    populate: args.populate ?? service.defaults.findByIdArgs?.populate,
    include: args.include ?? service.defaults.findByIdArgs?.include,
    overrides: args.overrides ?? {},
  };
}

export function resolveFindByIdOptions<TModel>(service: Service<TModel>, options: FindByIdOptions = {}) {
  return {
    skim: options.skim ?? service.defaults.findByIdOptions?.skim ?? false,
    includePermissions: options.includePermissions ?? service.defaults.findByIdOptions?.includePermissions ?? true,
    access: options.access ?? service.defaults.findByIdOptions?.access ?? 'read',
    populateAccess: options.populateAccess ?? service.defaults.findByIdOptions?.populateAccess,
    lean: options.lean ?? service.defaults.findByIdOptions?.lean ?? false,
  };
}

export function resolveFindArgs<TModel>(service: Service<TModel>, args: FindArgs<TModel> = {}) {
  return {
    select: args.select ?? service.defaults.findArgs?.select,
    populate: args.populate ?? service.defaults.findArgs?.populate,
    include: args.include ?? service.defaults.findArgs?.include,
    sort: args.sort ?? service.defaults.findArgs?.sort,
    skip: args.skip ?? service.defaults.findArgs?.skip,
    limit: args.limit ?? service.defaults.findArgs?.limit,
    page: args.page ?? service.defaults.findArgs?.page,
    pageSize: args.pageSize ?? service.defaults.findArgs?.pageSize,
    overrides: args.overrides ?? {},
  };
}

export function resolveFindOptions<TModel>(service: Service<TModel>, options: FindOptions = {}) {
  return {
    skim: options.skim ?? service.defaults.findOptions?.skim ?? false,
    includePermissions: options.includePermissions ?? service.defaults.findOptions?.includePermissions ?? true,
    includeCount: options.includeCount ?? service.defaults.findOptions?.includeCount ?? false,
    populateAccess: options.populateAccess ?? service.defaults.findOptions?.populateAccess ?? 'read',
    lean: options.lean ?? service.defaults.findOptions?.lean ?? false,
  };
}

export function resolveCreateArgs<TModel>(service: Service<TModel>, args: CreateArgs = {}) {
  return {
    populate: args.populate ?? service.defaults.createArgs?.populate,
  };
}

export function resolveCreateOptions<TModel>(service: Service<TModel>, options: CreateOptions = {}) {
  return {
    skim: options.skim ?? service.defaults.createOptions?.skim ?? false,
    includePermissions: options.includePermissions ?? service.defaults.createOptions?.includePermissions ?? true,
    populateAccess: options.populateAccess ?? service.defaults.createOptions?.populateAccess ?? 'read',
  };
}

export function resolveUpdateOneArgs<TModel>(service: Service<TModel>, args: UpdateOneArgs<TModel> = {}) {
  return {
    populate: args.populate ?? service.defaults.updateOneArgs?.populate,
    overrides: args.overrides ?? {},
  };
}

export function resolveUpdateOneOptions<TModel>(service: Service<TModel>, options: UpdateOneOptions = {}) {
  return {
    skim: options.skim ?? service.defaults.updateOneOptions?.skim ?? false,
    includePermissions: options.includePermissions ?? service.defaults.updateOneOptions?.includePermissions ?? true,
    populateAccess: options.populateAccess ?? service.defaults.updateOneOptions?.populateAccess ?? 'read',
  };
}

export function resolveUpdateByIdArgs<TModel>(service: Service<TModel>, args: UpdateByIdArgs<TModel> = {}) {
  return {
    populate: args.populate ?? service.defaults.updateByIdArgs?.populate,
    overrides: args.overrides ?? {},
  };
}

export function resolveUpdateByIdOptions<TModel>(service: Service<TModel>, options: UpdateByIdOptions = {}) {
  return {
    skim: options.skim ?? service.defaults.updateByIdOptions?.skim ?? false,
    includePermissions: options.includePermissions ?? service.defaults.updateByIdOptions?.includePermissions ?? true,
    populateAccess: options.populateAccess ?? service.defaults.updateByIdOptions?.populateAccess ?? 'read',
  };
}

export function resolveUpsertArgs<TModel>(service: Service<TModel>, args: UpsertArgs<TModel> = {}) {
  return {
    populate: args.populate ?? service.defaults.upsertArgs?.populate,
    overrides: args.overrides ?? {},
  };
}

export function resolveUpsertOptions<TModel>(service: Service<TModel>, options: UpsertOptions = {}) {
  return {
    skim: options.skim ?? service.defaults.upsertOptions?.skim ?? false,
    includePermissions: options.includePermissions ?? service.defaults.upsertOptions?.includePermissions ?? true,
    populateAccess: options.populateAccess ?? service.defaults.upsertOptions?.populateAccess ?? 'read',
  };
}

export function resolveExistsOptions<TModel>(service: Service<TModel>, options: ExistsOptions = {}) {
  return {
    access: options.access ?? service.defaults.existsOptions?.access ?? 'read',
    includeId: options.includeId ?? service.defaults.existsOptions?.includeId ?? false,
  };
}
