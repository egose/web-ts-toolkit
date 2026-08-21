import { z } from 'zod';
import {
  nonNegativeIntegerSchema,
  nonNegativeIntegerString,
  objectOrArraySchema,
  positiveIntegerSchema,
  positiveIntegerString,
  projectionSchema,
  rejectKeys,
  sortSchema,
} from './common';

export const dataListBodySchema = z
  .object({
    filter: objectOrArraySchema.optional(),
    select: projectionSchema.optional(),
    sort: sortSchema.optional(),
    skip: z.union([nonNegativeIntegerSchema, nonNegativeIntegerString]).optional(),
    limit: z.union([positiveIntegerSchema, positiveIntegerString]).optional(),
    page: z.union([nonNegativeIntegerSchema, nonNegativeIntegerString]).optional(),
    pageSize: z.union([positiveIntegerSchema, positiveIntegerString]).optional(),
    options: z
      .object({
        includeCount: z.boolean().optional(),
        includeExtraHeaders: z.boolean().optional(),
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

export const dataReadByIdBodySchema = z
  .object({
    select: projectionSchema.optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => rejectKeys(body, ctx, ['options']));
