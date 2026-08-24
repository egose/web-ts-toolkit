import { Schema, SchemaConfigurationError } from './schema';
import { Document } from './document';
import { Query, MutationOptionError, QueryExecutionError } from './query';
import { Connection, defaultConnection, model, connect, disconnect } from './model';
import { ValidationError } from './document';
import { MiddlewareEngine } from './middleware';
import { convertToRxJsonSchema, castDocumentToSchema, castValue } from './converter';
import {
  translateFilter,
  applyUpdate,
  compileQuery,
  sanitizeFilter,
  QueryFilterError,
  QueryOptionError,
} from './query-compiler';
import { BulkWritePartialFailureError, RxCollectionAdapter } from './rx-adapter';

export { Schema, SchemaConfigurationError } from './schema';
export { Document, ValidationError } from './document';
export { Query, MutationOptionError, QueryExecutionError } from './query';
export { Model, Connection, defaultConnection, model, connect, disconnect } from './model';
export { MiddlewareEngine } from './middleware';
export { convertToRxJsonSchema, castDocumentToSchema, castValue } from './converter';
export {
  translateFilter,
  applyUpdate,
  compileQuery,
  sanitizeFilter,
  QueryFilterError,
  QueryOptionError,
} from './query-compiler';
export { BulkWritePartialFailureError, RxCollectionAdapter } from './rx-adapter';
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
