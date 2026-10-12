import { BaseFilterAccess } from './access';
import { Filter } from './base';
import { SubPopulate } from './query-types';
import type { OutputAuthorization } from './service-authorization';

/** Template selection is historically ignored, including empty/exclusion selections. */
export interface NewArgs {
  select?: string[];
}

/** Create-template output options. new() ignores select; rows/related policies are unsupported. */
export interface NewOptions<TModel = unknown, TVirtuals extends object = Record<never, never>> {
  skim?: boolean;
  includePermissions?: boolean;
  includeFieldPermissions?: boolean;
  /** Trusted server-only output authority; no persistence or target dispatch is authorized. */
  readonly authorization?: OutputAuthorization<TModel, TVirtuals>;
}

export interface DistinctArgs<T = unknown> {
  filter?: Filter<T>;
}

export type SubdocumentId = string;
export type SubdocumentName = string;
export type SubdocumentRecord = Record<string, unknown>;
export type SubdocumentBulkRecord = SubdocumentRecord & { _id?: unknown };
export type SubdocumentCreateInput = SubdocumentRecord | SubdocumentRecord[];
export type SubdocumentBulkUpdateInput = SubdocumentBulkRecord[];

export interface SubdocumentListOptions<T = unknown> {
  filter?: Filter<T>;
  select?: string[];
}

export interface SubdocumentReadOptions {
  select?: string[];
  populate?: SubPopulate | SubPopulate[];
}

export interface SubdocumentCreateOptions {
  addFirst?: boolean;
}

export interface SubdocumentParentArgs {
  populate?: SubPopulate | SubPopulate[];
}

export interface SubdocumentParentOptions {
  access?: BaseFilterAccess;
  lean?: boolean;
}
