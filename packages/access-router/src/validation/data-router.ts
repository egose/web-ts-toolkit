import { z } from 'zod';
import {
  nonNegativeIntegerSchema,
  objectOrArraySchema,
  positiveIntegerString,
  projectionSchema,
  rejectKeys,
} from './common';

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
