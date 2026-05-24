import { Projection, Sort, Populate, PopulateAccess, Include, Task } from './types';

export interface SubQueryOptions {
  path?: string;
  compact?: boolean;
}

export type sqOptions = SubQueryOptions;

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

export interface ListAdvancedArgs {
  select?: Projection;
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

export interface ReadAdvancedArgs {
  select?: Projection;
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

export interface CreateAdvancedArgs {
  select?: Projection;
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

export interface UpdateAdvancedArgs {
  select?: Projection;
  populate?: Populate[] | Populate | string;
  tasks?: Task | Task[];
}

export interface UpdateAdvancedOptions {
  returningAll?: boolean;
  includePermissions?: boolean;
  populateAccess?: PopulateAccess;
}

export type UpsertOptions = UpdateOptions;
export type UpsertAdvancedArgs = UpdateAdvancedArgs;
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

export interface DataListAdvancedArgs {
  select?: Projection;
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

export interface DataReadAdvancedArgs {
  select?: Projection;
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
