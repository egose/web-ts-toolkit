import { pick } from '@web-ts-toolkit/utils';
import { normalizeSelect, toObject } from '../helpers';
import { Service } from './service';
import {
  Filter,
  Sort,
  MiddlewareContext,
  FindAccess,
  PublicListArgs,
  PublicListOptions,
  PublicReadArgs,
  PublicReadOptions,
  PublicCreateArgs,
  PublicCreateOptions,
  PublicUpdateArgs,
  PublicUpdateOptions,
  DistinctArgs,
  ErrorResult,
  ListResult,
  BaseFilterAccess,
  SingleResult,
} from '../interfaces';

export class PublicService extends Service {
  async _list(filter: Filter, args?: PublicListArgs, options?: PublicListOptions): Promise<ListResult | ErrorResult> {
    const { select, populate, include, sort, skip, limit, page, pageSize, tasks } = this.resolvePublicListArgs(args);
    const { skim, includePermissions, includeCount, populateAccess, lean } = this.resolvePublicListOptions(options);

    const result = await this.find(
      filter,
      { select, populate, include, sort, skip, limit, page, pageSize },
      { skim, includePermissions, includeCount, populateAccess, lean },
      async (doc, context: MiddlewareContext) => {
        doc = toObject(doc);
        return this.decorate(doc, 'list', context);
      },
    );

    if (!result.success) {
      return result;
    }

    let docs = result.data;
    docs = await this.decorateAll(docs, 'list', { model: this.model.model, modelName: this.modelName });
    docs = docs.map((row) => this.runTasks(row as Record<string, unknown>, tasks));

    result.data = docs;
    return result;
  }

  async _create(data, args?: PublicCreateArgs, options?: PublicCreateOptions): Promise<ListResult | ErrorResult> {
    const { select, populate, tasks } = this.resolvePublicCreateArgs(args);
    const { skim, includePermissions, populateAccess } = this.resolvePublicCreateOptions(options);

    const result = await this.create(
      data,
      { populate },
      { skim, includePermissions, populateAccess },
      async (doc, context: MiddlewareContext) => {
        doc = toObject(doc);
        doc = await this.decorate(doc, 'create', context);
        doc = this.runTasks(doc as Record<string, unknown>, tasks);

        if (select) doc = pick(doc, [...normalizeSelect(select), ...this.baseFieldsExt]);
        return doc;
      },
    );

    return result;
  }

  async _new(): Promise<SingleResult> {
    return this.new();
  }

  async _read(id: string, args?: PublicReadArgs, options?: PublicReadOptions): Promise<SingleResult | ErrorResult> {
    const { select, populate, include, tasks } = this.resolvePublicReadArgs(args);
    const { skim, includePermissions, tryList, populateAccess, lean } = this.resolvePublicReadOptions(options);

    let access: FindAccess = 'read';
    const idFilter = await this.genIDFilter(id);

    let result = await this.findById(
      id,
      {
        select,
        populate,
        include,
        overrides: { idFilter },
      },
      { skim, includePermissions, access, populateAccess, lean },
    );

    // if not found, try to get the doc with 'list' access
    if (tryList && (!result.success || !result.data)) {
      access = 'list';

      result = await this.findById(
        id,
        {
          select,
          populate,
          overrides: { idFilter },
        },
        { skim, includePermissions, access, populateAccess, lean },
      );
    }

    if (!result.success) {
      return result;
    }

    let doc = toObject(result.data);
    doc = await this.decorate(doc, access, result.context);
    doc = this.runTasks(doc as Record<string, unknown>, tasks);

    result.data = doc;
    return result;
  }

  async _readFilter(
    filter: Filter,
    args?: PublicReadArgs & { sort?: Sort },
    options?: PublicReadOptions,
  ): Promise<SingleResult | ErrorResult> {
    const { select, sort, populate, include, tasks } = this.resolvePublicReadFilterArgs(args);
    const { skim, includePermissions, tryList, populateAccess, lean } = this.resolvePublicReadOptions(options);

    let access: FindAccess = 'read';

    let result = await this.findOne(
      filter,
      {
        select,
        sort,
        populate,
        include,
        overrides: {},
      },
      { skim, includePermissions, access, populateAccess, lean },
    );

    // if not found, try to get the doc with 'list' access
    if (tryList && (!result.success || !result.data)) {
      access = 'list';

      result = await this.findOne(
        filter,
        {
          select,
          sort,
          populate,
          overrides: {},
        },
        { skim, includePermissions, access, populateAccess, lean },
      );
    }

    if (!result.success) {
      return result;
    }

    let doc = toObject(result.data);
    doc = await this.decorate(doc, access, result.context);
    doc = this.runTasks(doc as Record<string, unknown>, tasks);

    result.data = doc;
    return result;
  }

  async _update(
    id: string,
    data,
    args?: PublicUpdateArgs,
    options?: PublicUpdateOptions,
  ): Promise<SingleResult | ErrorResult> {
    const { select, populate, tasks } = this.resolvePublicUpdateArgs(args);
    const { skim, returningAll, includePermissions, populateAccess } = this.resolvePublicUpdateOptions(options);

    const result = await this.updateById(
      id,
      data,
      { populate },
      { skim, includePermissions, populateAccess },
      async (doc, context: MiddlewareContext) => {
        doc = toObject(doc);
        doc = await this.decorate(doc, 'update', context);
        doc = this.runTasks(doc, tasks);

        if (select) doc = pick(doc, [...normalizeSelect(select), ...this.baseFieldsExt]);
        else if (!returningAll) doc = pick(doc, [...Object.keys(data), '_id']);

        return doc;
      },
    );

    return result;
  }

  async _delete(id: string): Promise<SingleResult | ErrorResult> {
    const result = await this.delete(id);
    return result;
  }

  async _distinct(field: string, options: DistinctArgs = {}): Promise<ListResult | ErrorResult> {
    const result = await this.distinct(field, options);
    return result;
  }

  async _count(filter, access: BaseFilterAccess = 'list'): Promise<SingleResult<number> | ErrorResult> {
    const result = await this.count(filter, access);
    return result;
  }

  private resolvePublicListArgs(args: PublicListArgs = {}) {
    return {
      select: args.select ?? this.defaults.publicListArgs?.select,
      populate: args.populate ?? this.defaults.publicListArgs?.populate,
      include: args.include ?? this.defaults.publicListArgs?.include,
      sort: args.sort ?? this.defaults.publicListArgs?.sort,
      skip: args.skip ?? this.defaults.publicListArgs?.skip,
      limit: args.limit ?? this.defaults.publicListArgs?.limit,
      page: args.page ?? this.defaults.publicListArgs?.page,
      pageSize: args.pageSize ?? this.defaults.publicListArgs?.pageSize,
      tasks: args.tasks ?? this.defaults.publicListArgs?.tasks ?? [],
    };
  }

  private resolvePublicListOptions(options: PublicListOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.publicListOptions?.skim ?? true,
      includePermissions: options.includePermissions ?? this.defaults.publicListOptions?.includePermissions ?? false,
      includeCount: options.includeCount ?? this.defaults.publicListOptions?.includeCount ?? false,
      populateAccess: options.populateAccess ?? this.defaults.publicListOptions?.populateAccess ?? 'read',
      lean: options.lean ?? this.defaults.publicListOptions?.lean ?? true,
    };
  }

  private resolvePublicCreateArgs(args: PublicCreateArgs = {}) {
    return {
      select: args.select ?? this.defaults.publicCreateArgs?.select,
      populate: args.populate ?? this.defaults.publicCreateArgs?.populate,
      tasks: args.tasks ?? this.defaults.publicCreateArgs?.tasks ?? [],
    };
  }

  private resolvePublicCreateOptions(options: PublicCreateOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.publicCreateOptions?.skim ?? false,
      includePermissions: options.includePermissions ?? this.defaults.publicCreateOptions?.includePermissions ?? true,
      populateAccess: options.populateAccess ?? this.defaults.publicCreateOptions?.populateAccess ?? 'read',
    };
  }

  private resolvePublicReadArgs(args: PublicReadArgs = {}) {
    return {
      select: args.select ?? this.defaults.publicReadArgs?.select,
      populate: args.populate ?? this.defaults.publicReadArgs?.populate,
      include: args.include ?? this.defaults.publicReadArgs?.include,
      tasks: args.tasks ?? this.defaults.publicReadArgs?.tasks ?? [],
    };
  }

  private resolvePublicReadFilterArgs(args: PublicReadArgs & { sort?: Sort } = {}) {
    const resolvedArgs = this.resolvePublicReadArgs(args);

    return {
      ...resolvedArgs,
      sort: args.sort ?? this.defaults.publicListArgs?.sort,
    };
  }

  private resolvePublicReadOptions(options: PublicReadOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.publicReadOptions?.skim ?? false,
      includePermissions: options.includePermissions ?? this.defaults.publicReadOptions?.includePermissions ?? true,
      tryList: options.tryList ?? this.defaults.publicReadOptions?.tryList ?? true,
      populateAccess: options.populateAccess ?? this.defaults.publicReadOptions?.populateAccess,
      lean: options.lean ?? this.defaults.publicReadOptions?.lean ?? false,
    };
  }

  private resolvePublicUpdateArgs(args: PublicUpdateArgs = {}) {
    return {
      select: args.select ?? this.defaults.publicUpdateArgs?.select,
      populate: args.populate ?? this.defaults.publicUpdateArgs?.populate,
      tasks: args.tasks ?? this.defaults.publicUpdateArgs?.tasks ?? [],
    };
  }

  private resolvePublicUpdateOptions(options: PublicUpdateOptions = {}) {
    return {
      skim: options.skim ?? this.defaults.publicUpdateOptions?.skim ?? false,
      returningAll: options.returningAll ?? this.defaults.publicUpdateOptions?.returningAll ?? true,
      includePermissions: options.includePermissions ?? this.defaults.publicUpdateOptions?.includePermissions ?? true,
      populateAccess: options.populateAccess ?? this.defaults.publicUpdateOptions?.populateAccess ?? 'read',
    };
  }
}
