export type PrimitiveType = 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'mixed';

export interface SchemaLike {
  paths: Map<string, any>;
  options: Record<string, any>;
  [k: string]: any;
}

export interface SchemaTypeOptions<T = any> {
  type?: any;
  required?: boolean | ((this: any) => boolean) | [boolean, string];
  default?: T | (() => T);
  enum?: T[];
  min?: number;
  max?: number;
  match?: RegExp;
  select?: boolean;
  validate?:
    | ((value: T) => boolean | Promise<boolean>)
    | { validator: (value: T) => boolean | Promise<boolean>; message?: string };
  get?: (value: T, doc: any) => T;
  set?: (value: T, doc: any) => T;
  ref?: string;
  immutable?: boolean;
  alias?: string;
  auto?: boolean;
  index?: boolean;
  unique?: boolean;
  sparse?: boolean;
  expires?: number;
}

export type SchemaDefinitionProperty =
  | String
  | Number
  | Boolean
  | DateConstructor
  | typeof Object
  | ArrayConstructor
  | Array<SchemaDefinitionProperty>
  | { type: SchemaDefinitionProperty; [k: string]: any }
  | SchemaLike
  | (SchemaTypeOptions & { [k: string]: any });

export type SchemaDefinition<T = any> = {
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
  subSchema?: SchemaLike;
}

export interface SchemaOptions {
  _id?: boolean;
  versionKey?: string | false;
  timestamps?: boolean | { createdAt?: string; updatedAt?: string };
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

export type PreHookFn<T = any> = (this: T, next: (err?: Error) => void) => void | Promise<void>;
export type PostHookFn<T = any, R = any> = (this: T, result: R) => void | Promise<void>;
export type ErrorHookFn<T = any> = (this: T, err: Error) => void | Promise<void>;
export interface VirtualType<T = any> {
  name: string;
  options: { ref?: string; localField?: string; foreignField?: string; justOne?: boolean };
  getter?: (this: T, value: any, virtualType: VirtualType<T>, doc: T) => any;
  setter?: (this: T, value: any, virtualType: VirtualType<T>, doc: T) => void;
  get(fn: VirtualType<T>['getter']): VirtualType<T>;
  set(fn: VirtualType<T>['setter']): VirtualType<T>;
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

export type FilterQuery<T = any> = {
  [K in keyof T]?:
    | T[K]
    | {
        $gt?: T[K];
        $gte?: T[K];
        $lt?: T[K];
        $lte?: T[K];
        $ne?: T[K];
        $in?: T[K][];
        $nin?: T[K][];
        $exists?: boolean;
        $regex?: string | RegExp;
        $options?: string;
      };
} & {
  $and?: FilterQuery<T>[];
  $or?: FilterQuery<T>[];
  $nor?: FilterQuery<T>[];
  _id?: string | { $gt?: string; $lt?: string; $ne?: string; $in?: string[] };
} & Record<string, any>;

export type UpdateQuery<T = any> = {
  $set?: Partial<T>;
  $unset?: Partial<Record<keyof T, 1 | '' | true>>;
  $inc?: Partial<Record<keyof T, number>>;
  $push?: Partial<Record<keyof T, any>>;
  $pull?: Partial<Record<keyof T, any>>;
  $addToSet?: Partial<Record<keyof T, any>>;
  $mul?: Partial<Record<keyof T, number>>;
  $min?: Partial<T>;
  $max?: Partial<T>;
} & Partial<T>;
