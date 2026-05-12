import express from 'express';
import mongoose, { Document } from 'mongoose';
import { Diff } from 'deep-diff';
import { Core } from '../core';
import { DataCore } from '../core-data';
import { Codes } from '../enums';

export type Validation = boolean | string | string[] | Function;

export interface KeyValueProjection {
  [key: string]: 1 | -1;
}

export type Projection = string[] | string | KeyValueProjection;

export type SortOrder = -1 | 1 | 'asc' | 'ascending' | 'desc' | 'descending';

export type Sort = string | { [key: string]: SortOrder } | [string, SortOrder][] | undefined | null;

export type Filter = false | Record<string, unknown>;

export interface Include {
  model: string;
  op: 'list' | 'read' | 'count';
  path: string;
  filter?: Filter;
  localField: string;
  foreignField: string;
  args?: unknown;
  options?: unknown;
}

export type FindAccess = 'list' | 'read';
export type PopulateAccess = 'list' | 'read';

export interface Populate {
  path: string;
  select?: Projection;
  match?: unknown;
  access?: PopulateAccess;
}

export interface SubPopulate {
  path: string;
  select?: Projection;
}

interface keyValue {
  [key: string]: unknown;
}

export interface MiddlewareContext {
  modelName: string;
  model: mongoose.Model<unknown>;
  originalDocObject?: Record<string, unknown>;
  finalDocObject?: Record<string, unknown>;
  diff?(doc: Document): void;
  currentDoc?: keyValue;
  originalData?: Record<string, unknown>;
  preparedData?: Record<string, unknown>;
  modifiedPaths?: string[];
  changes?: Diff<unknown>[];
  docPermissions?: keyValue;
  fieldPermissionAccess?: {
    readIds?: Set<string>;
    updateIds?: Set<string>;
  };
}

export interface DataMiddlewareContext {}

export interface RootQueryEntry {
  model: string;
  op: string;
  id?: string;
  field?: string;
  filter?: Filter;
  data?: unknown;
  args?: unknown;
  options?: unknown;
  order?: number;
}

export interface SubQueryEntry extends RootQueryEntry {
  sqOptions?: {
    path?: string;
    compact?: boolean;
  };
}

export interface Task {
  type: string;
  args: unknown;
  options: Record<string, unknown>;
}

export interface Request extends express.Request {
  query: Record<
    | 'skip'
    | 'limit'
    | 'page'
    | 'page_size'
    | 'try_list'
    | 'skim'
    | 'include_permissions'
    | 'include_count'
    | 'include_extra_headers'
    | 'returning_all',
    string
  >;
  macl: Core;
  dacl: DataCore;
}

export interface ErrorResult<TError = unknown, TQuery = unknown> {
  success: false;
  code: Codes.BadRequest | Codes.Unauthorized | Codes.Forbidden | Codes.NotFound;
  errors?: TError[];
  query?: TQuery;
}

export interface SingleResult<T = unknown, TInput = unknown, TQuery = unknown> {
  success: true;
  kind: 'single';
  code: Codes.Success | Codes.Created;
  data: T;
  input?: TInput;
  query?: TQuery;
  context?: MiddlewareContext;
}

export interface ListResult<T = unknown, TInput = unknown, TQuery = unknown> {
  success: true;
  kind: 'list';
  code: Codes.Success | Codes.Created;
  data: T[];
  count: number;
  totalCount?: number | null;
  input?: TInput;
  query?: TQuery;
  contexts?: MiddlewareContext[];
}

export type ServiceResult<T = unknown, TError = unknown, TInput = unknown, TQuery = unknown> =
  | SingleResult<T, TInput, TQuery>
  | ListResult<T, TInput, TQuery>
  | ErrorResult<TError, TQuery>;
