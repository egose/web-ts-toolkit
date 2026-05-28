import type { Filter, Include, Populate, Projection, Sort, SubPopulate, Task } from '../interfaces';

export type ValidationError = {
  detail: string;
  pointer?: string;
  parameter?: string;
};

export type RequestSchemaIssue = {
  message: string;
  path?: Array<string | number>;
};

export type RequestSchemaSuccess<T = unknown> = {
  success: true;
  data: T;
};

export type RequestSchemaFailure = {
  success: false;
  issues: RequestSchemaIssue[];
};

export type RequestSchemaResult<T = unknown> = RequestSchemaSuccess<T> | RequestSchemaFailure;

export type RequestSchemaValidator<T = unknown> = (
  value: unknown,
) => RequestSchemaResult<T> | Promise<RequestSchemaResult<T>>;

export type RequestSchemaAdapter<T = unknown> = {
  validate: RequestSchemaValidator<T>;
};

export type StandardSchemaPathSegment = {
  key: PropertyKey;
};

export type StandardSchemaIssue = {
  message: string;
  path?: ReadonlyArray<PropertyKey | StandardSchemaPathSegment>;
};

export type StandardSchemaSuccess<T = unknown> = {
  value: T;
  issues?: undefined;
};

export type StandardSchemaFailure = {
  issues: ReadonlyArray<StandardSchemaIssue>;
};

export type StandardSchemaResult<T = unknown> = StandardSchemaSuccess<T> | StandardSchemaFailure;

export type StandardSchemaV1<Input = unknown, Output = Input> = {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
      options?: {
        readonly libraryOptions?: Record<string, unknown> | undefined;
      },
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    readonly types?: {
      readonly input: Input;
      readonly output: Output;
    };
  };
};

export type StandardSchemaInferOutput<TSchema extends StandardSchemaV1> = NonNullable<
  TSchema['~standard']['types']
>['output'];

export type RequestSchemaLike<T = unknown> = RequestSchemaValidator<T> | RequestSchemaAdapter<T> | StandardSchemaV1;

export type YupValidationErrorLike = {
  message: string;
  path?: string;
  inner?: ReadonlyArray<YupValidationErrorLike>;
};

export type YupSchemaLike<T = unknown> = {
  validate: (
    value: unknown,
    options?: {
      abortEarly?: boolean;
      stripUnknown?: boolean;
    },
  ) => Promise<T> | T;
};

export type JoiValidationErrorDetailLike = {
  message: string;
  path?: ReadonlyArray<string | number>;
};

export type JoiSchemaLike<T = unknown> = {
  validate: (
    value: unknown,
    options?: {
      abortEarly?: boolean;
      stripUnknown?: boolean;
    },
  ) =>
    | {
        value: T;
        error?: {
          details?: ReadonlyArray<JoiValidationErrorDetailLike>;
        };
      }
    | Promise<{
        value: T;
        error?: {
          details?: ReadonlyArray<JoiValidationErrorDetailLike>;
        };
      }>;
};

export type AjvErrorObjectLike = {
  message?: string;
  instancePath?: string;
  schemaPath?: string;
  params?: {
    missingProperty?: string;
  };
};

export type AjvValidatorLike<T = unknown> = {
  (value: unknown): boolean | Promise<boolean>;
  errors?: ReadonlyArray<AjvErrorObjectLike> | null;
};

export type ValibotPathItemLike = {
  key?: unknown;
};

export type ValibotIssueLike = {
  message: string;
  path?: ReadonlyArray<ValibotPathItemLike>;
};

export type ValibotSafeParseResult<T = unknown> =
  | {
      success: true;
      output: T;
      issues?: undefined;
    }
  | {
      success: false;
      output?: undefined;
      issues: ReadonlyArray<ValibotIssueLike>;
    };

export type ValibotSafeParseLike = <TSchema, TOutput = unknown>(
  schema: TSchema,
  value: unknown,
  config?: {
    abortEarly?: boolean;
  },
) => ValibotSafeParseResult<TOutput> | Promise<ValibotSafeParseResult<TOutput>>;

export type ArkTypeProblemLike = {
  path?: ReadonlyArray<string | number>;
  message?: string;
  problem?: string;
};

export type ArkTypeErrorsLike = ReadonlyArray<ArkTypeProblemLike> & {
  summary?: string;
};

export type ArkTypeLike<T = unknown> = {
  (value: unknown): T | ArkTypeErrorsLike;
  errors?: unknown;
};

export type IoTsContextEntryLike = {
  key: string;
};

export type IoTsDecodeErrorLike = {
  message?: string;
  context: ReadonlyArray<IoTsContextEntryLike>;
};

export type IoTsDecoderLike<T = unknown> = {
  decode: (value: unknown) =>
    | {
        _tag: 'Left';
        left: ReadonlyArray<IoTsDecodeErrorLike>;
      }
    | {
        _tag: 'Right';
        right: T;
      };
};

export type SuperstructFailureLike = {
  message?: string;
  path?: ReadonlyArray<string | number>;
  key?: string | number;
  branch?: ReadonlyArray<unknown>;
  failures?: () => ReadonlyArray<SuperstructFailureLike>;
};

export type SuperstructValidateLike = <TStruct, TOutput = unknown>(
  value: unknown,
  struct: TStruct,
) =>
  | readonly [failure: SuperstructFailureLike, value: undefined]
  | readonly [failure: undefined, value: TOutput]
  | Promise<
      readonly [failure: SuperstructFailureLike, value: undefined] | readonly [failure: undefined, value: TOutput]
    >;

export type VineValidationMessageLike = {
  field: string;
  message: string;
  index?: number;
};

export type VineValidationErrorLike = {
  messages: ReadonlyArray<VineValidationMessageLike>;
};

export type VineValidatorLike<T = unknown> = {
  validate: (value: unknown) => Promise<T> | T;
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
