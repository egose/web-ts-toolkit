import JsonRouter from '@web-ts-toolkit/express-json-router';
import { z, type RefinementCtx } from 'zod';
import type { Filter, Include, Populate, Projection, Sort, SubPopulate, Task } from '../interfaces';

type ValidationError = {
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

const clientErrors = JsonRouter.clientErrors;

const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

const queryBooleanString = z.enum(['true', 'false']);
const positiveIntegerString = z.string().regex(/^\d+$/, 'Expected a non-negative integer');
const nonNegativeIntegerSchema = z.number().int().min(0);

const unknownRecord = z.record(z.string(), z.unknown());
const projectionObjectSchema = z.record(z.string(), z.union([z.literal(1), z.literal(-1)]));
const projectionSchema = z.union([z.string(), z.array(z.string()), projectionObjectSchema]);
const sortOrderSchema = z.union([
  z.literal(-1),
  z.literal(1),
  z.literal('asc'),
  z.literal('ascending'),
  z.literal('desc'),
  z.literal('descending'),
]);
const sortSchema = z.union([
  z.string(),
  z.record(z.string(), sortOrderSchema),
  z.array(z.tuple([z.string(), sortOrderSchema])),
  z.null(),
]);
const populateSchema = z.union([
  z.string(),
  z.array(
    z.union([
      z.string(),
      z
        .object({
          path: z.string().min(1),
          select: projectionSchema.optional(),
          match: z.unknown().optional(),
          access: z.enum(['list', 'read']).optional(),
        })
        .passthrough(),
    ]),
  ),
  z
    .object({
      path: z.string().min(1),
      select: projectionSchema.optional(),
      match: z.unknown().optional(),
      access: z.enum(['list', 'read']).optional(),
    })
    .passthrough(),
]);
const subPopulateSchema = z.union([
  z.string(),
  z.array(
    z.union([
      z.string(),
      z
        .object({
          path: z.string().min(1),
          select: projectionSchema.optional(),
        })
        .passthrough(),
    ]),
  ),
  z
    .object({
      path: z.string().min(1),
      select: projectionSchema.optional(),
    })
    .passthrough(),
]);
const includeItemSchema = z
  .object({
    model: z.string().min(1),
    op: z.enum(['list', 'read', 'count']),
    path: z.string().min(1),
    filter: z.record(z.string(), z.unknown()).optional(),
    localField: z.string().min(1),
    foreignField: z.string().min(1),
    args: z.unknown().optional(),
    options: z.unknown().optional(),
  })
  .passthrough();
const includeSchema = z.union([includeItemSchema, z.array(includeItemSchema)]);
const fieldsSchema = z.array(z.string().min(1));

const taskSchema = z.object({
  type: z.string().min(1),
  args: z.unknown(),
  options: unknownRecord.optional(),
});

const tasksSchema = z.union([taskSchema, z.array(taskSchema)]);
const objectOrArraySchema = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);

const listQuerySchema = z
  .object({
    skip: positiveIntegerString.optional(),
    limit: positiveIntegerString.optional(),
    page: positiveIntegerString.optional(),
    page_size: positiveIntegerString.optional(),
    skim: queryBooleanString.optional(),
    include_permissions: queryBooleanString.optional(),
    include_count: queryBooleanString.optional(),
    include_extra_headers: queryBooleanString.optional(),
  })
  .passthrough();

const createQuerySchema = z
  .object({
    include_permissions: queryBooleanString.optional(),
  })
  .passthrough();

const readQuerySchema = z
  .object({
    include_permissions: queryBooleanString.optional(),
    try_list: queryBooleanString.optional(),
  })
  .passthrough();

const updateQuerySchema = z
  .object({
    returning_all: queryBooleanString.optional(),
    include_permissions: queryBooleanString.optional(),
  })
  .passthrough();

const upsertQuerySchema = z
  .object({
    returning_all: queryBooleanString.optional(),
    include_permissions: queryBooleanString.optional(),
  })
  .passthrough();

const rootQueryEntrySchema = z
  .object({
    model: z.string().min(1),
    op: z.string().min(1),
    id: z.string().min(1).optional(),
    field: z.string().min(1).optional(),
    filter: objectOrArraySchema.optional(),
    data: z.unknown().optional(),
    args: unknownRecord.optional(),
    options: unknownRecord.optional(),
    order: z.number().int().optional(),
  })
  .passthrough();

export const rootQuerySchema = z.array(rootQueryEntrySchema);

export const listBodySchema = z
  .object({
    filter: objectOrArraySchema.optional(),
    select: projectionSchema.optional(),
    sort: sortSchema.optional(),
    populate: populateSchema.optional(),
    include: includeSchema.optional(),
    tasks: tasksSchema.optional(),
    skip: z.union([nonNegativeIntegerSchema, positiveIntegerString]).optional(),
    limit: z.union([nonNegativeIntegerSchema, positiveIntegerString]).optional(),
    page: z.union([nonNegativeIntegerSchema, positiveIntegerString]).optional(),
    pageSize: z.union([nonNegativeIntegerSchema, positiveIntegerString]).optional(),
    options: z
      .object({
        skim: z.boolean().optional(),
        includePermissions: z.boolean().optional(),
        includeCount: z.boolean().optional(),
        includeExtraHeaders: z.boolean().optional(),
        populateAccess: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => rejectKeys(body, ctx, ['query']));

export const dataListBodySchema = z
  .object({
    filter: objectOrArraySchema.optional(),
    select: projectionSchema.optional(),
    sort: z.string().optional(),
    skip: z.union([nonNegativeIntegerSchema, positiveIntegerString]).optional(),
    limit: z.union([nonNegativeIntegerSchema, positiveIntegerString]).optional(),
    page: z.union([nonNegativeIntegerSchema, positiveIntegerString]).optional(),
    pageSize: z.union([nonNegativeIntegerSchema, positiveIntegerString]).optional(),
    options: z
      .object({
        includeCount: z.boolean().optional(),
        includeExtraHeaders: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const countBodySchema = z
  .object({
    filter: objectOrArraySchema.optional(),
    options: z
      .object({
        access: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => rejectKeys(body, ctx, ['query', 'access']));

export const readFilterBodySchema = z
  .object({
    filter: objectOrArraySchema.optional(),
    select: projectionSchema.optional(),
    sort: sortSchema.optional(),
    populate: populateSchema.optional(),
    include: includeSchema.optional(),
    tasks: tasksSchema.optional(),
    options: z
      .object({
        skim: z.boolean().optional(),
        includePermissions: z.boolean().optional(),
        tryList: z.boolean().optional(),
        populateAccess: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const dataReadFilterBodySchema = z
  .object({
    filter: objectOrArraySchema.optional(),
    select: projectionSchema.optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => rejectKeys(body, ctx, ['options']));

export const readByIdBodySchema = z
  .object({
    select: projectionSchema.optional(),
    populate: populateSchema.optional(),
    include: includeSchema.optional(),
    tasks: tasksSchema.optional(),
    options: z
      .object({
        skim: z.boolean().optional(),
        includePermissions: z.boolean().optional(),
        tryList: z.boolean().optional(),
        populateAccess: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const dataReadByIdBodySchema = z
  .object({
    select: projectionSchema.optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => rejectKeys(body, ctx, ['options']));

export const advancedCreateBodySchema = z
  .object({
    data: z.unknown(),
    select: projectionSchema.optional(),
    populate: populateSchema.optional(),
    tasks: tasksSchema.optional(),
    options: z
      .object({
        includePermissions: z.boolean().optional(),
        populateAccess: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const createBodySchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.record(z.string(), z.unknown())),
]);
export const updateBodySchema = z.record(z.string(), z.unknown());

export const advancedUpdateBodySchema = z
  .object({
    data: z.unknown(),
    select: projectionSchema.optional(),
    populate: populateSchema.optional(),
    tasks: tasksSchema.optional(),
    options: z
      .object({
        returningAll: z.boolean().optional(),
        includePermissions: z.boolean().optional(),
        populateAccess: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const upsertBodySchema = z.record(z.string(), z.unknown());

export const advancedUpsertBodySchema = z
  .object({
    data: z.record(z.string(), z.unknown()),
    select: projectionSchema.optional(),
    populate: populateSchema.optional(),
    tasks: tasksSchema.optional(),
    options: z
      .object({
        returningAll: z.boolean().optional(),
        includePermissions: z.boolean().optional(),
        populateAccess: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const distinctBodySchema = z
  .object({
    filter: objectOrArraySchema.optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => rejectKeys(body, ctx, ['query']));

export const subListBodySchema = z
  .object({
    filter: z.record(z.string(), z.unknown()).optional(),
    select: fieldsSchema.optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => rejectKeys(body, ctx, ['fields']));
export const subMutationBodySchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.record(z.string(), z.unknown())),
]);
export const subReadBodySchema = z
  .object({
    select: fieldsSchema.optional(),
    populate: subPopulateSchema.optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => rejectKeys(body, ctx, ['fields']));

export function parsePathParam(value: string | string[] | undefined, parameter: string) {
  const result = stringOrStringArray.safeParse(value);
  if (!result.success) {
    throwValidationError(result.error.issues, parameter, 'parameter');
  }

  const param = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!param) {
    throw new clientErrors.BadRequestError('Bad Request', {
      errors: [{ detail: 'Required', parameter } satisfies ValidationError],
    });
  }

  return param;
}

export function parseQuery<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throwValidationError(result.error.issues, undefined, 'parameter');
  }

  return result.data;
}

export function parseBody<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    throwValidationError(result.error.issues, undefined, 'pointer');
  }

  return result.data;
}

export function parseBodyWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  userSchema?: z.ZodTypeAny,
): z.output<TSchema> {
  const body = parseBody(schema, value);
  return isZodSchema(userSchema) ? (parseUserSchema(userSchema, body) as z.output<TSchema>) : body;
}

export function parseNestedBodyWithSchema(
  schema: z.ZodTypeAny,
  value: unknown,
  nestedKey: string,
  userSchema?: z.ZodTypeAny,
): Record<string, unknown> {
  const body = parseBody(schema, value) as Record<string, unknown>;
  if (!isZodSchema(userSchema)) return body;

  return {
    ...body,
    [nestedKey]: parseUserSchema(userSchema, body?.[nestedKey], [nestedKey]),
  };
}

function throwValidationError(
  issues: z.ZodIssue[],
  key?: string,
  location: 'pointer' | 'parameter' = 'pointer',
): never {
  const errors = issues.map((issue) => formatIssue(issue, key, location));
  throw new clientErrors.BadRequestError('Bad Request', { errors });
}

function parseUserSchema(schema: z.ZodTypeAny, value: unknown, prefix: string[] = []) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      ...issue,
      path: prefix.concat(issue.path.map(String)),
    })) as z.ZodIssue[];

    throwValidationError(issues, undefined, 'pointer');
  }

  return result.data;
}

function isZodSchema(schema: unknown): schema is z.ZodTypeAny {
  return (
    typeof schema === 'object' && schema !== null && 'safeParse' in schema && typeof schema.safeParse === 'function'
  );
}

function formatIssue(issue: z.ZodIssue, key?: string, location: 'pointer' | 'parameter' = 'pointer'): ValidationError {
  const path = issue.path.map(String);
  const joinedPath = path.join('.');

  if (location === 'parameter') {
    return {
      detail: issue.message,
      parameter: (key ?? joinedPath) || undefined,
    };
  }

  return {
    detail: issue.message,
    pointer: buildPointer(path),
  };
}

function buildPointer(path: string[]) {
  return path.length === 0 ? '#' : `#/${path.join('/')}`;
}

function rejectKeys(body: Record<string, unknown>, ctx: RefinementCtx, keys: string[]) {
  for (const key of keys) {
    if (key in body) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported field: ${key}`,
        path: [key],
      });
    }
  }
}

export const requestSchemas = {
  listQuery: listQuerySchema,
  createQuery: createQuerySchema,
  readQuery: readQuerySchema,
  updateQuery: updateQuerySchema,
  upsertQuery: upsertQuerySchema,
};
