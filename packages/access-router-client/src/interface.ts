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
  includePermissions?: boolean;
  includeCount?: boolean;
  includeExtraHeaders?: boolean;
  ignoreCache?: boolean;
}

export interface DataListAdvancedArgs<TSelect extends Projection = Projection> {
  select?: TSelect;
  sort?: Sort;
  skip?: string | number;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
}

export interface DataListAdvancedOptions {
  includePermissions?: boolean;
  includeCount?: boolean;
  includeExtraHeaders?: boolean;
  ignoreCache?: boolean;
}

export interface DataReadOptions {
  includePermissions?: boolean;
  ignoreCache?: boolean;
}

export interface DataReadAdvancedArgs<TSelect extends Projection = Projection> {
  select?: TSelect;
  ignoreCache?: boolean;
}

export interface DataReadAdvancedOptions {
  includePermissions?: boolean;
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
