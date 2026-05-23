import type { Filter, Include, Populate, Projection, Sort, SubPopulate, Task } from '../interfaces';

export type ValidationError = {
  detail: string;
  pointer?: string;
  parameter?: string;
};

export type ListQueryInput = {
  skip?: string;
  limit?: string;
  page?: string;
  page_size?: string;
  skim?: 'true' | 'false';
  include_permissions?: 'true' | 'false';
  include_count?: 'true' | 'false';
  include_extra_headers?: 'true' | 'false';
};

export type CreateQueryInput = {
  include_permissions?: 'true' | 'false';
};

export type ReadQueryInput = {
  include_permissions?: 'true' | 'false';
  try_list?: 'true' | 'false';
};

export type UpdateQueryInput = {
  returning_all?: 'true' | 'false';
};

export type UpsertQueryInput = {
  returning_all?: 'true' | 'false';
  include_permissions?: 'true' | 'false';
};

export type AdvancedListBody = {
  filter?: Filter | unknown[];
  select?: Projection;
  sort?: Sort;
  populate?: Populate[] | string;
  include?: Include | Include[];
  tasks?: Task | Task[];
  skip?: string | number;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
  options?: {
    skim?: boolean;
    includePermissions?: boolean;
    includeCount?: boolean;
    includeExtraHeaders?: boolean;
    populateAccess?: unknown;
  };
};

export type CountBody = {
  filter?: Filter | unknown[];
  options?: {
    access?: unknown;
  };
};

export type AdvancedReadFilterBody = {
  filter?: Filter | unknown[];
  select?: Projection;
  sort?: Sort;
  populate?: Populate[] | string;
  include?: Include | Include[];
  tasks?: Task | Task[];
  options?: {
    skim?: boolean;
    includePermissions?: boolean;
    tryList?: boolean;
    populateAccess?: unknown;
  };
};

export type AdvancedReadBody = {
  select?: Projection;
  populate?: Populate[] | string;
  include?: Include | Include[];
  tasks?: Task | Task[];
  options?: {
    skim?: boolean;
    includePermissions?: boolean;
    tryList?: boolean;
    populateAccess?: unknown;
  };
};

export type AdvancedCreateBody = {
  data: unknown;
  select?: Projection;
  populate?: Populate[] | string;
  tasks?: Task | Task[];
  options?: {
    includePermissions?: boolean;
    populateAccess?: unknown;
  };
};

export type AdvancedUpdateBody = {
  data: unknown;
  select?: Projection;
  populate?: Populate[] | string;
  tasks?: Task | Task[];
  options?: {
    returningAll?: boolean;
    includePermissions?: boolean;
    populateAccess?: unknown;
  };
};

export type AdvancedUpsertBody = {
  data: Record<string, unknown>;
  select?: Projection;
  populate?: Populate[] | string;
  tasks?: Task | Task[];
  options?: {
    returningAll?: boolean;
    includePermissions?: boolean;
    populateAccess?: unknown;
  };
};

export type DistinctBody = {
  filter?: Filter | unknown[];
};

export type SubListBody = {
  filter?: Filter;
  select?: string[];
};

export type SubReadBody = {
  select?: string[];
  populate?: SubPopulate | SubPopulate[] | string | string[];
};
