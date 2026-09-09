import { Schema, SchemaConfigurationError } from './schema';
import { Document } from './document';
import { Query, MutationOptionError, QueryExecutionError } from './query';
import { Connection, defaultConnection, model, connect, disconnect } from './model';
import { ValidationError } from './document';
import { MiddlewareEngine } from './middleware';
import { convertToRxJsonSchema, castDocumentToSchema, castValue, WriteNormalizationError } from './converter';
import {
  translateFilter,
  applyUpdate,
  compileQuery,
  sanitizeFilter,
  QueryFilterError,
  QueryOptionError,
} from './query-compiler';
import { BulkWritePartialFailureError, MutationPartialFailureError, RxCollectionAdapter } from './rx-adapter';

export { Schema, SchemaConfigurationError } from './schema';
export { Document, ValidationError } from './document';
export { Query, MutationOptionError, QueryExecutionError } from './query';
export type { LeanQueryResult } from './query';
export { Model, Connection, defaultConnection, model, connect, disconnect } from './model';
export { MiddlewareEngine } from './middleware';
export { convertToRxJsonSchema, castDocumentToSchema, castValue, WriteNormalizationError } from './converter';
export {
  translateFilter,
  applyUpdate,
  compileQuery,
  sanitizeFilter,
  QueryFilterError,
  QueryOptionError,
} from './query-compiler';
/**
 * BMRX-24 public error discovery: `WriteNormalizationError` (schema/write
 * boundary) and `MutationPartialFailureError` (partial `updateMany` /
 * `deleteMany`) are intentionally public thrown errors. Import them from the
 * package root for `instanceof` narrowing; blocked deep imports are not
 * required.
 *
 * ```ts
 * import { BulkWritePartialFailureError, MutationPartialFailureError, WriteNormalizationError } from '@web-ts-toolkit/mongoose-rxdb';
 * ```
 */
export { BulkWritePartialFailureError, MutationPartialFailureError, RxCollectionAdapter } from './rx-adapter';
export type { BulkInsertOptions, BulkInsertResult, PersistenceRecord, RxLikeCollection, RxLikeDoc } from './rx-adapter';
export * from './types';

const api = {
  Schema,
  SchemaConfigurationError,
  Document,
  Query,
  MutationOptionError,
  QueryExecutionError,
  Connection,
  ValidationError,
  MiddlewareEngine,
  model,
  connect,
  disconnect,
  defaultConnection,
  BulkWritePartialFailureError,
  MutationPartialFailureError,
  WriteNormalizationError,
  RxCollectionAdapter,
  convertToRxJsonSchema,
  castDocumentToSchema,
  castValue,
  translateFilter,
  applyUpdate,
  compileQuery,
  sanitizeFilter,
  QueryFilterError,
  QueryOptionError,
};

export default api;
