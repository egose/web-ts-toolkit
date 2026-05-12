import { Filter, Projection, FindAccess } from './base';

export type DataFilter<T = unknown> = Filter<T>;

export interface DataFindOneArgs<T = unknown, TSelect extends Projection | undefined = Projection | undefined> {
  select?: TSelect;
}

export interface DataFindOneOptions {
  access?: FindAccess;
}

export interface DataFindArgs<T = unknown, TSelect extends Projection | undefined = Projection | undefined> {
  select?: TSelect;
  sort?: string;
  skip?: string | number;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
}

export interface DataFindOptions {}
