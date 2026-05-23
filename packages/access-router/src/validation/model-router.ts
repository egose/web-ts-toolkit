import { z } from 'zod';
import {
  fieldsSchema,
  includeSchema,
  nonNegativeIntegerSchema,
  objectOrArraySchema,
  populateSchema,
  positiveIntegerString,
  projectionSchema,
  queryBooleanString,
  rejectKeys,
  sortSchema,
  subPopulateSchema,
  tasksSchema,
} from './common';

export const listQuerySchema = z
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

export const createQuerySchema = z
  .object({
    include_permissions: queryBooleanString.optional(),
  })
  .passthrough();

export const readQuerySchema = z
  .object({
    include_permissions: queryBooleanString.optional(),
    try_list: queryBooleanString.optional(),
  })
  .passthrough();

export const updateQuerySchema = z
  .object({
    returning_all: queryBooleanString.optional(),
    include_permissions: queryBooleanString.optional(),
  })
  .passthrough();

export const upsertQuerySchema = z
  .object({
    returning_all: queryBooleanString.optional(),
    include_permissions: queryBooleanString.optional(),
  })
  .passthrough();

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

export const requestSchemas = {
  listQuery: listQuerySchema,
  createQuery: createQuerySchema,
  readQuery: readQuerySchema,
  updateQuery: updateQuerySchema,
  upsertQuery: upsertQuerySchema,
};
