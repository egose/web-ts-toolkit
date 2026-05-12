import { Include, Projection, Sort, Filter, Populate, PopulateAccess, FindAccess } from './base';

export interface FindArgs<T = unknown> {
  select?: Projection;
  populate?: Populate[] | string;
  include?: Include | Include[];
  sort?: Sort;
  skip?: string | number;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
  overrides?: {
    filter?: Filter<T>;
    select?: Projection;
    populate?: Populate[] | string;
  };
}

export interface FindOptions {
  skim?: boolean;
  includePermissions?: boolean;
  includeCount?: boolean;
  populateAccess?: PopulateAccess;
  lean?: boolean;
}

export interface FindOneArgs<T = unknown> {
  select?: Projection;
  sort?: Sort;
  populate?: Populate[] | string;
  include?: Include | Include[];
  overrides?: {
    filter?: Filter<T>;
    select?: Projection;
    populate?: Populate[] | string;
  };
}

export interface FindOneOptions {
  access?: FindAccess;
  populateAccess?: PopulateAccess;
  skim?: boolean;
  lean?: boolean;
  includePermissions?: boolean;
}

export interface FindByIdArgs<T = unknown> {
  select?: Projection;
  populate?: Populate[] | string;
  include?: Include | Include[];
  overrides?: {
    select?: Projection;
    populate?: Populate[] | string;
    idFilter?: Filter<T>;
  };
}

export interface FindByIdOptions extends FindOneOptions {}
