import { BaseFilterAccess } from './access';
import { Filter } from './base';
import { SubPopulate } from './query-types';

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
