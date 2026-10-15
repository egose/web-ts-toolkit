import { Filter, Projection, FindAccess, Sort } from './base';

export type DataFilter<T = unknown> = Filter<T>;

/**
 * Named request-only options for DataCore/DataService field helpers. Omission or
 * undefined equals {}. Scope uses response segments (['contacts'], never 'sub');
 * selection and returned field names are relative to that permission-schema scope.
 * No Mongoose catalog, document hooks, automatic identity/metadata retention or
 * backend elevation. Retired positional booleans/arrays/extra arguments reject.
 * genSelect intersects requested tokens with request fields; an empty result means
 * no additional projection in DataService, after request-only output trimming.
 */
export interface DataFieldOptions {
  readonly scopePath?: readonly string[];
  /** Model output policies are not data authority, including pretyped options. */
  readonly authorization?: never;
  readonly documentAuthorization?: never;
}

export interface DataFindOneArgs<T = unknown, TSelect extends Projection | undefined = Projection | undefined> {
  select?: TSelect;
}

export interface DataFindOneOptions {
  access?: FindAccess;
}

export interface DataFindArgs<T = unknown, TSelect extends Projection | undefined = Projection | undefined> {
  select?: TSelect;
  sort?: Sort;
  skip?: string | number;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
}

export interface DataFindOptions {}
