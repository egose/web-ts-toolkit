import { Filter, Projection, FindAccess } from './base';

export type DataFilter = Filter;

export interface DataFindOneArgs {
  select?: Projection;
}

export interface DataFindOneOptions {
  access?: FindAccess;
}

export interface DataFindArgs {
  select?: Projection;
  sort?: string;
  skip?: string | number;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
}

export interface DataFindOptions {}
