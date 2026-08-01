import { Schema } from './schema';
import { Document } from './document';
import { Query } from './query';
import { Connection, defaultConnection, model, connect, disconnect } from './model';
import { ValidationError } from './document';
import { MiddlewareEngine } from './middleware';
import { convertToRxJsonSchema, castDocumentToSchema, castValue } from './converter';
import { translateFilter, applyUpdate, compileQuery, sanitizeFilter } from './query-compiler';
import { RxCollectionAdapter } from './rx-adapter';

export { Schema } from './schema';
export { Document, ValidationError } from './document';
export { Query } from './query';
export { Model, Connection, defaultConnection, model, connect, disconnect } from './model';
export { MiddlewareEngine } from './middleware';
export { convertToRxJsonSchema, castDocumentToSchema, castValue } from './converter';
export { translateFilter, applyUpdate, compileQuery, sanitizeFilter } from './query-compiler';
export { RxCollectionAdapter } from './rx-adapter';
export type { RxLikeCollection, RxLikeDoc } from './rx-adapter';
export * from './types';

const api = {
  Schema,
  Document,
  Query,
  Connection,
  ValidationError,
  MiddlewareEngine,
  model,
  connect,
  disconnect,
  defaultConnection,
  RxCollectionAdapter,
  convertToRxJsonSchema,
  castDocumentToSchema,
  castValue,
  translateFilter,
  applyUpdate,
  compileQuery,
  sanitizeFilter,
};

export default api;
