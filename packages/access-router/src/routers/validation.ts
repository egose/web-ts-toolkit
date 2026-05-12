import JsonRouter from '@web-ts-toolkit/express-json-router';
import { z } from 'zod';

type ValidationError = {
  detail: string;
  pointer?: string;
  parameter?: string;
};

const clientErrors = JsonRouter.clientErrors;

const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

const queryBooleanString = z.enum(['true', 'false']);
const positiveIntegerString = z.string().regex(/^\d+$/, 'Expected a non-negative integer');

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

const listQuerySchema: z.ZodTypeAny = z
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

const createQuerySchema: z.ZodTypeAny = z
  .object({
    include_permissions: queryBooleanString.optional(),
  })
  .passthrough();

const readQuerySchema: z.ZodTypeAny = z
  .object({
    include_permissions: queryBooleanString.optional(),
    try_list: queryBooleanString.optional(),
  })
  .passthrough();

const updateQuerySchema: z.ZodTypeAny = z
  .object({
    returning_all: queryBooleanString.optional(),
  })
  .passthrough();

const upsertQuerySchema: z.ZodTypeAny = z
  .object({
    returning_all: queryBooleanString.optional(),
    include_permissions: queryBooleanString.optional(),
  })
  .passthrough();

const rootQueryEntrySchema: z.ZodTypeAny = z
  .object({
    model: z.string().min(1),
    op: z.string().min(1),
    id: z.string().min(1).optional(),
    field: z.string().min(1).optional(),
    filter: objectOrArraySchema.optional(),
    data: z.unknown().optional(),
    args: z.unknown().optional(),
    options: z.unknown().optional(),
    order: z.number().int().optional(),
  })
  .passthrough();

export const rootQuerySchema: z.ZodTypeAny = z.array(rootQueryEntrySchema);

export const listBodySchema: z.ZodTypeAny = z
  .object({
    query: objectOrArraySchema.optional(),
    filter: objectOrArraySchema.optional(),
    select: projectionSchema.optional(),
    sort: sortSchema.optional(),
    populate: populateSchema.optional(),
    include: includeSchema.optional(),
    tasks: tasksSchema.optional(),
    skip: z.union([z.number(), positiveIntegerString]).optional(),
    limit: z.union([z.number(), positiveIntegerString]).optional(),
    page: z.union([z.number(), positiveIntegerString]).optional(),
    pageSize: z.union([z.number(), positiveIntegerString]).optional(),
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
  .passthrough();

export const dataListBodySchema: z.ZodTypeAny = z
  .object({
    filter: objectOrArraySchema.optional(),
    select: projectionSchema.optional(),
    sort: sortSchema.optional(),
    skip: z.union([z.number(), positiveIntegerString]).optional(),
    limit: z.union([z.number(), positiveIntegerString]).optional(),
    page: z.union([z.number(), positiveIntegerString]).optional(),
    pageSize: z.union([z.number(), positiveIntegerString]).optional(),
    options: z
      .object({
        includeCount: z.boolean().optional(),
        includeExtraHeaders: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const countBodySchema: z.ZodTypeAny = z
  .object({
    query: objectOrArraySchema.optional(),
    filter: objectOrArraySchema.optional(),
    access: z.unknown().optional(),
  })
  .passthrough();

export const readFilterBodySchema: z.ZodTypeAny = z
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

export const dataReadFilterBodySchema: z.ZodTypeAny = z
  .object({
    filter: objectOrArraySchema.optional(),
    select: projectionSchema.optional(),
    options: z.object({}).passthrough().optional(),
  })
  .passthrough();

export const readByIdBodySchema: z.ZodTypeAny = z
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

export const dataReadByIdBodySchema: z.ZodTypeAny = z
  .object({
    select: projectionSchema.optional(),
    options: z.object({}).passthrough().optional(),
  })
  .passthrough();

export const advancedCreateBodySchema: z.ZodTypeAny = z
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

export const createBodySchema: z.ZodTypeAny = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.record(z.string(), z.unknown())),
]);
export const updateBodySchema: z.ZodTypeAny = z.record(z.string(), z.unknown());

export const advancedUpdateBodySchema: z.ZodTypeAny = z
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

export const upsertBodySchema: z.ZodTypeAny = z.record(z.string(), z.unknown());

export const advancedUpsertBodySchema: z.ZodTypeAny = z
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

export const distinctBodySchema: z.ZodTypeAny = z
  .object({
    query: objectOrArraySchema.optional(),
    filter: objectOrArraySchema.optional(),
  })
  .passthrough();

export const subListBodySchema: z.ZodTypeAny = z
  .object({
    filter: z.record(z.string(), z.unknown()).optional(),
    fields: fieldsSchema.optional(),
  })
  .passthrough();
export const subMutationBodySchema: z.ZodTypeAny = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.record(z.string(), z.unknown())),
]);
export const subReadBodySchema: z.ZodTypeAny = z
  .object({
    fields: fieldsSchema.optional(),
    populate: subPopulateSchema.optional(),
  })
  .passthrough();

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

export function parseQuery(schema: z.ZodTypeAny, value: unknown): any {
  const result = schema.safeParse(value);
  if (!result.success) {
    throwValidationError(result.error.issues, undefined, 'parameter');
  }

  return result.data;
}

export function parseBody(schema: z.ZodTypeAny, value: unknown): any {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    throwValidationError(result.error.issues, undefined, 'pointer');
  }

  return result.data;
}

export function parseBodyWithSchema(schema: z.ZodTypeAny, value: unknown, userSchema?: z.ZodTypeAny) {
  const body = parseBody(schema, value);
  return isZodSchema(userSchema) ? parseUserSchema(userSchema, body) : body;
}

export function parseNestedBodyWithSchema(
  schema: z.ZodTypeAny,
  value: unknown,
  nestedKey: string,
  userSchema?: z.ZodTypeAny,
) {
  const body = parseBody(schema, value);
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

export const requestSchemas = {
  listQuery: listQuerySchema,
  createQuery: createQuerySchema,
  readQuery: readQuerySchema,
  updateQuery: updateQuerySchema,
  upsertQuery: upsertQuerySchema,
};
