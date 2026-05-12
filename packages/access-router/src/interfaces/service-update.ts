import { Filter, Projection, Populate, PopulateAccess, Task } from './base';

export interface PublicUpdateArgs {
  select?: Projection;
  populate?: Populate[] | string;
  tasks?: Task | Task[];
}

export interface UpdateOneArgs<T = unknown> extends Omit<PublicUpdateArgs, 'select' | 'tasks'> {
  overrides?: {
    filter?: Filter<T>;
    populate?: Populate[] | string;
  };
}

export interface UpdateByIdArgs<T = unknown> extends Omit<UpdateOneArgs<T>, 'overrides'> {
  overrides?: {
    populate?: Populate[] | string;
    idFilter?: Filter<T>;
  };
}

export interface UpsertArgs<T = unknown> extends UpdateOneArgs<T> {}

export interface PublicUpdateOptions {
  skim?: boolean;
  returningAll?: boolean;
  includePermissions?: boolean;
  populateAccess?: PopulateAccess;
}

export interface UpdateOneOptions extends Omit<PublicUpdateOptions, 'returningAll'> {}
export interface UpdateByIdOptions extends UpdateOneOptions {}
export interface UpsertOptions extends UpdateOneOptions {}
