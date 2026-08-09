import { Projection, Sort, Populate, PopulateAccess, Include, Task } from './types';

export interface SubQueryOptions {
  path?: string;
  compact?: boolean;
}

export interface ListArgs {
  skip?: number;
  limit?: number;
  page?: number;
  pageSize?: number;
}

export interface ListOptions {
  skim?: boolean;
  includePermissions?: boolean;
  includeCount?: boolean;
  includeExtraHeaders?: boolean;
  ignoreCache?: boolean;
  sq?: SubQueryOptions;
}

export interface ListAdvancedArgs<TSelect extends Projection = Projection> {
  select?: TSelect;
  populate?: Populate[] | Populate | string;
  include?: Include | Include[];
  sort?: Sort;
  skip?: string | number;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
  tasks?: Task | Task[];
}

export interface ListAdvancedOptions {
  skim?: boolean;
  includePermissions?: boolean;
  includeCount?: boolean;
  includeExtraHeaders?: boolean;
  ignoreCache?: boolean;
  populateAccess?: PopulateAccess;
  sq?: SubQueryOptions;
}

export interface ReadOptions {
  includePermissions?: boolean;
  tryList?: boolean;
  ignoreCache?: boolean;
  sq?: SubQueryOptions;
}

export interface ReadAdvancedArgs<TSelect extends Projection = Projection> {
  select?: TSelect;
  sort?: Sort;
  populate?: Populate[] | Populate | string;
  include?: Include | Include[];
  tasks?: Task | Task[];
}

export interface ReadAdvancedOptions {
  skim?: boolean;
  includePermissions?: boolean;
  tryList?: boolean;
  populateAccess?: PopulateAccess;
  ignoreCache?: boolean;
  sq?: SubQueryOptions;
}

export interface CreateOptions {
  includePermissions?: boolean;
}

export interface CreateAdvancedArgs<TSelect extends Projection = Projection> {
  select?: TSelect;
  populate?: Populate[] | Populate | string;
  tasks?: Task | Task[];
}

export interface CreateAdvancedOptions {
  includePermissions?: boolean;
  populateAccess?: PopulateAccess;
}

export interface UpdateOptions {
  returningAll?: boolean;
  includePermissions?: boolean;
}

export interface UpdateAdvancedArgs<TSelect extends Projection = Projection> {
  select?: TSelect;
  populate?: Populate[] | Populate | string;
  tasks?: Task | Task[];
}

export interface UpdateAdvancedOptions {
  returningAll?: boolean;
  includePermissions?: boolean;
  populateAccess?: PopulateAccess;
}

export type UpsertOptions = UpdateOptions;
export type UpsertAdvancedArgs<TSelect extends Projection = Projection> = UpdateAdvancedArgs<TSelect>;
export type UpsertAdvancedOptions = UpdateAdvancedOptions;

export interface Defaults {
  listArgs?: ListArgs;
  listOptions?: ListOptions;
  listAdvancedArgs?: ListAdvancedArgs;
  listAdvancedOptions?: ListAdvancedOptions;
  readOptions?: ReadOptions;
  readAdvancedArgs?: ReadAdvancedArgs;
  readAdvancedOptions?: ReadAdvancedOptions;
  createOptions?: CreateOptions;
  createAdvancedArgs?: CreateAdvancedArgs;
  createAdvancedOptions?: CreateAdvancedOptions;
  updateOptions?: UpdateOptions;
  updateAdvancedArgs?: UpdateAdvancedArgs;
  updateAdvancedOptions?: UpdateAdvancedOptions;
  upsertOptions?: UpsertOptions;
  upsertAdvancedArgs?: UpsertAdvancedArgs;
  upsertAdvancedOptions?: UpsertAdvancedOptions;
}

export interface DataListArgs {
  skip?: number;
  limit?: number;
  page?: number;
  pageSize?: number;
}

export interface DataListOptions {
  includeCount?: boolean;
  includeExtraHeaders?: boolean;
  ignoreCache?: boolean;
}

export interface DataListAdvancedArgs<TSelect extends Projection = Projection> {
  select?: TSelect;
  sort?: string;
  skip?: string | number;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
}

export interface DataListAdvancedOptions {
  includeCount?: boolean;
  includeExtraHeaders?: boolean;
  ignoreCache?: boolean;
}

export interface DataReadOptions {
  ignoreCache?: boolean;
}

export interface DataReadAdvancedArgs<TSelect extends Projection = Projection> {
  select?: TSelect;
}

/**
 * Options for `DataService.readAdvanced` and `DataService.readAdvancedFilter`.
 *
 * `ignoreCache` is the documented cache-bypass knob for advanced reads. It
 * lives here — not on `DataReadAdvancedArgs` — so callers use `{ ignoreCache:
 * true }` in the options position to skip an existing cache entry, matching
 * the placement used by the basic `list`, `listAdvanced`, and `read` service
 * methods.
 *
 * `includePermissions` is intentionally absent. The access-router data
 * router body schema for advanced reads (`dataReadByIdBodySchema` and
 * `dataReadFilterBodySchema`) explicitly rejects the `options` key, and the
 * root router drops `item.options` when dispatching data operations
 * server-side (root-router.ts passes `{}` as the options argument to
 * `findById`/`findOne`). Advertising `includePermissions` here was a
 * type-level promise the server cannot honor and the grouped path silently
 * passed through `__query.options.includePermissions` only for the root
 * router to discard it — a direct/grouped asymmetry. The fix removes the
 * dead-letter field from the type and from `__query.options` so direct and
 * grouped advanced reads compose identical payloads.
 */
export interface DataReadAdvancedOptions {
  ignoreCache?: boolean;
}

export interface DataDefaults {
  listArgs?: DataListArgs;
  listOptions?: DataListOptions;
  listAdvancedArgs?: DataListAdvancedArgs;
  listAdvancedOptions?: DataListAdvancedOptions;
  readOptions?: DataReadOptions;
  readAdvancedArgs?: DataReadAdvancedArgs;
  readAdvancedOptions?: DataReadAdvancedOptions;
}

export interface AdditionalReqConfig {
  throwOnError?: boolean;
}
