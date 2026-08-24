export type PrimitiveType = 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'mixed';

export type AnyDocument = Record<string, unknown>;
export type DocumentId = { _id?: string };
export type RawDocument<T extends object = AnyDocument> = Omit<T, '_rev' | '_meta' | '_attachments' | '_deleted'>;
export type RawDocumentWithId<T extends object = AnyDocument> = RawDocument<T> & DocumentId;
export type LeanResult<T extends object = AnyDocument> = RawDocumentWithId<T>;
export type HydratedDocument<
  T extends object = AnyDocument,
  TMethods extends object = {},
  TVirtuals extends object = {},
> = import('./document').Document<T> & RawDocumentWithId<T> & TMethods & TVirtuals;

export interface UpdateResult {
  matchedCount: number;
  modifiedCount: number;
  upsertedCount?: number;
  upsertedId?: string;
}

export interface DeleteResult {
  deletedCount: number;
}

export interface SchemaLike {
  paths: Map<string, any>;
  options: Record<string, any>;
  getCompiledSchema?: () => CompiledSchemaRepresentation;
  [k: string]: any;
}

export interface CompiledSchemaRepresentation {
  paths: ReadonlyMap<string, CompiledPath>;
  jsonSchema: any;
  rxProperties: Record<string, any>;
  required: string[];
  indexes: string[][];
}

export interface SchemaTypeOptions<T = any> {
  type?: any;
  required?: boolean | ((this: any) => boolean) | [boolean, string];
  default?: T | (() => T);
  enum?: T[];
  min?: number;
  max?: number;
  match?: RegExp;
  validate?:
    | ((value: T) => boolean | Promise<boolean>)
    | { validator: (value: T) => boolean | Promise<boolean>; message?: string };
  immutable?: boolean;
  index?: boolean;
}

export type SchemaDefinitionProperty =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | DateConstructor
  | typeof Object
  | ArrayConstructor
  | Array<SchemaDefinitionProperty>
  | SchemaLike
  | SchemaTypeOptions;

export type SchemaDefinition<T extends object = AnyDocument> = {
  [K in keyof T]?: SchemaDefinitionProperty;
};

export interface CompiledPath {
  name: string;
  type: PrimitiveType;
  options: SchemaTypeOptions;
  definition: SchemaDefinitionProperty;
  nested: boolean;
  isArray: boolean;
  arrayItemType?: PrimitiveType;
  arrayItemOptions?: SchemaTypeOptions;
  subSchema?: SchemaLike;
}

export interface SchemaOptions {
  _id?: boolean;
  collection?: string;
  validateBeforeSave?: boolean;
}

export type Hook =
  | 'validate'
  | 'save'
  | 'remove'
  | 'deleteOne'
  | 'deleteMany'
  | 'updateOne'
  | 'updateMany'
  | 'findOne'
  | 'find'
  | 'findOneAndUpdate'
  | 'findOneAndDelete'
  | 'insertMany'
  | 'init';

export type HookNext = (err?: Error) => void;
export type PreHookFn<T = any> = (this: T, next: HookNext, ...args: any[]) => void | Promise<void>;
export type PostHookFn<T = any, R = any> = (this: T, result: R, next?: HookNext) => void | Promise<void>;
export type ErrorHookFn<T = any> = (this: T, err: Error, next?: HookNext) => void | Promise<void>;
export interface VirtualType<T = any, TValue = any> {
  name: string;
  options: { ref?: string; localField?: string; foreignField?: string; justOne?: boolean };
  getter?: (this: T, value: TValue | undefined, virtualType: VirtualType<T, TValue>, doc: T) => TValue;
  setter?: (this: T, value: TValue, virtualType: VirtualType<T, TValue>, doc: T) => void;
  get(fn: VirtualType<T, TValue>['getter']): VirtualType<T, TValue>;
  set(fn: VirtualType<T, TValue>['setter']): VirtualType<T, TValue>;
}

export interface QueryOptions {
  sort?: Record<string, 1 | -1 | 'asc' | 'desc'>;
  limit?: number;
  skip?: number;
  projection?: Record<string, 0 | 1> | string;
  lean?: boolean;
  upsert?: boolean;
  new?: boolean;
  returnDocument?: 'before' | 'after';
  runValidators?: boolean;
  setDefaultsOnInsert?: boolean;
}

export interface InsertManyOptions {
  ordered?: boolean;
}

export interface UpdateOneOptions {
  sort?: QueryOptions['sort'];
  upsert?: boolean;
  runValidators?: boolean;
  setDefaultsOnInsert?: boolean;
}

export interface UpdateManyOptions {
  sort?: QueryOptions['sort'];
  runValidators?: boolean;
}

export interface DeleteOneOptions {
  sort?: QueryOptions['sort'];
}

export interface DeleteManyOptions {}

export interface FindOneAndUpdateOptions {
  sort?: QueryOptions['sort'];
  upsert?: boolean;
  new?: boolean;
  returnDocument?: 'before' | 'after';
  runValidators?: boolean;
  setDefaultsOnInsert?: boolean;
}

export interface FindOneAndDeleteOptions {
  sort?: QueryOptions['sort'];
  lean?: boolean;
}

type Defined<T> = Exclude<T, undefined>;
type ArrayElement<T> = Defined<T> extends ReadonlyArray<infer U> ? U : never;
type KeysMatching<T, Constraint> = {
  [K in keyof T]-?: Defined<T[K]> extends Constraint ? K : never;
}[keyof T];
type Comparable = string | number | Date;
type FilterScalar<T> = Defined<T> extends ReadonlyArray<infer U> ? U | Defined<T> : Defined<T>;
type ComparableOps<T> =
  FilterScalar<T> extends Comparable
    ? { $gt?: FilterScalar<T>; $gte?: FilterScalar<T>; $lt?: FilterScalar<T>; $lte?: FilterScalar<T> }
    : {};
type RegexOps<T> = FilterScalar<T> extends string ? { $regex?: string | RegExp; $options?: string } : {};
type FieldOperators<T> = {
  $eq?: FilterScalar<T>;
  $ne?: FilterScalar<T>;
  $in?: ReadonlyArray<FilterScalar<T>>;
  $nin?: ReadonlyArray<FilterScalar<T>>;
  $exists?: boolean;
} & ComparableOps<T> &
  RegexOps<T>;
type FilterFields<T extends object> = {
  [K in keyof RawDocumentWithId<T>]?: FilterScalar<RawDocumentWithId<T>[K]> | FieldOperators<RawDocumentWithId<T>[K]>;
};

export type FilterQuery<T extends object = AnyDocument> = FilterFields<T> & {
  $and?: ReadonlyArray<FilterQuery<T>>;
  $or?: ReadonlyArray<FilterQuery<T>>;
  $nor?: ReadonlyArray<FilterQuery<T>>;
};

export type LooseFilterQuery<T extends object = AnyDocument> = {
  [K in keyof RawDocumentWithId<T>]?: unknown;
} & {
  $and?: ReadonlyArray<LooseFilterQuery<T>>;
  $or?: ReadonlyArray<LooseFilterQuery<T>>;
  $nor?: ReadonlyArray<LooseFilterQuery<T>>;
} & Record<string, unknown>;

type WritableDocument<T extends object> = Omit<RawDocument<T>, '_id'>;
type NumericKeys<T extends object> = KeysMatching<WritableDocument<T>, number>;
type ArrayKeys<T extends object> = KeysMatching<WritableDocument<T>, ReadonlyArray<unknown>>;
type ComparableKeys<T extends object> = KeysMatching<WritableDocument<T>, Comparable>;
type NumericUpdate<T extends object> = Partial<Record<NumericKeys<T>, number>>;
type ArrayValueUpdate<T extends object> = Partial<{ [K in ArrayKeys<T>]: ArrayElement<WritableDocument<T>[K]> }>;
type ComparableUpdate<T extends object> = Partial<Pick<WritableDocument<T>, ComparableKeys<T>>>;
type SetUpdate<T extends object> = Partial<WritableDocument<T>>;

export type UpdateOperators<T extends object = AnyDocument> = {
  $set?: SetUpdate<T>;
  $unset?: Partial<Record<keyof WritableDocument<T>, 1 | '' | true>>;
  $inc?: NumericUpdate<T>;
  $push?: ArrayValueUpdate<T>;
  $pull?: ArrayValueUpdate<T>;
  $addToSet?: ArrayValueUpdate<T>;
  $mul?: NumericUpdate<T>;
  $min?: ComparableUpdate<T>;
  $max?: ComparableUpdate<T>;
};

export type UpdateQuery<T extends object = AnyDocument> = UpdateOperators<T> | SetUpdate<T>;

export type ModelMethods = object;
export type ModelStatics = object;
export type ModelVirtuals = object;
