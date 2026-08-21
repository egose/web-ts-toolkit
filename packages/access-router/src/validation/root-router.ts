import { z } from 'zod';
import {
  includeSchema,
  fieldsSchema,
  nonNegativeIntegerSchema,
  nonNegativeIntegerString,
  objectOrArraySchema,
  positiveIntegerSchema,
  populateSchema,
  positiveIntegerString,
  projectionSchema,
  rejectKeys,
  sortSchema,
  subPopulateSchema,
  tasksSchema,
} from './common';

const rootEntryBaseSchema = {
  target: z.enum(['model', 'data']),
  name: z.string().min(1),
  order: nonNegativeIntegerSchema.optional(),
};

const rootModelListArgsSchema = z
  .object({
    select: projectionSchema.optional(),
    populate: populateSchema.optional(),
    include: includeSchema.optional(),
    sort: sortSchema.optional(),
    skip: z.union([nonNegativeIntegerSchema, nonNegativeIntegerString]).optional(),
    limit: z.union([positiveIntegerSchema, positiveIntegerString]).optional(),
    page: z.union([nonNegativeIntegerSchema, nonNegativeIntegerString]).optional(),
    pageSize: z.union([positiveIntegerSchema, positiveIntegerString]).optional(),
    tasks: tasksSchema.optional(),
  })
  .passthrough();

const rootModelListOptionsSchema = z
  .object({
    skim: z.boolean().optional(),
    includePermissions: z.boolean().optional(),
    includeCount: z.boolean().optional(),
    populateAccess: z.unknown().optional(),
    lean: z.boolean().optional(),
  })
  .passthrough();

const rootModelReadArgsSchema = z
  .object({
    select: projectionSchema.optional(),
    populate: populateSchema.optional(),
    include: includeSchema.optional(),
    tasks: tasksSchema.optional(),
  })
  .passthrough();

const rootModelReadFilterArgsSchema = rootModelReadArgsSchema.extend({
  sort: sortSchema.optional(),
});

const rootModelReadOptionsSchema = z
  .object({
    skim: z.boolean().optional(),
    includePermissions: z.boolean().optional(),
    tryList: z.boolean().optional(),
    populateAccess: z.unknown().optional(),
    lean: z.boolean().optional(),
  })
  .passthrough();

const rootModelCreateArgsSchema = z
  .object({
    select: projectionSchema.optional(),
    populate: populateSchema.optional(),
    tasks: tasksSchema.optional(),
  })
  .passthrough();

const rootModelCreateOptionsSchema = z
  .object({
    skim: z.boolean().optional(),
    includePermissions: z.boolean().optional(),
    populateAccess: z.unknown().optional(),
  })
  .passthrough();

const rootModelUpdateArgsSchema = z
  .object({
    select: projectionSchema.optional(),
    populate: populateSchema.optional(),
    tasks: tasksSchema.optional(),
  })
  .passthrough();

const rootModelUpdateOptionsSchema = z
  .object({
    skim: z.boolean().optional(),
    returningAll: z.boolean().optional(),
    includePermissions: z.boolean().optional(),
    populateAccess: z.unknown().optional(),
  })
  .passthrough();

const rootModelUpsertArgsSchema = rootModelUpdateArgsSchema;
const rootModelUpsertOptionsSchema = rootModelUpdateOptionsSchema;

const rootModelSubListArgsSchema = z
  .object({
    select: fieldsSchema.optional(),
  })
  .passthrough();

const rootModelSubReadArgsSchema = z
  .object({
    select: fieldsSchema.optional(),
    populate: subPopulateSchema.optional(),
  })
  .passthrough();

const rootModelCountOptionsSchema = z.object({}).strict().optional();

const rootDataListArgsSchema = z
  .object({
    select: projectionSchema.optional(),
    sort: sortSchema.optional(),
    skip: z.union([nonNegativeIntegerSchema, nonNegativeIntegerString]).optional(),
    limit: z.union([positiveIntegerSchema, positiveIntegerString]).optional(),
    page: z.union([nonNegativeIntegerSchema, nonNegativeIntegerString]).optional(),
    pageSize: z.union([positiveIntegerSchema, positiveIntegerString]).optional(),
  })
  .passthrough();

const rootDataListOptionsSchema = z
  .object({
    includeCount: z.boolean().optional(),
  })
  .passthrough();

const rootDataReadArgsSchema = z
  .object({
    select: projectionSchema.optional(),
  })
  .passthrough();

const rootModelNewArgsSchema = z
  .object({
    select: projectionSchema.optional(),
  })
  .passthrough();

const rootModelNewOptionsSchema = z
  .object({
    skim: z.boolean().optional(),
    includePermissions: z.boolean().optional(),
  })
  .passthrough();

const rootModelQueryEntrySchema = z.union([
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('new'),
      args: rootModelNewArgsSchema.optional(),
      options: rootModelNewOptionsSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('list'),
      filter: objectOrArraySchema.optional(),
      args: rootModelListArgsSchema.optional(),
      options: rootModelListOptionsSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('read'),
      id: z.string().min(1),
      args: rootModelReadArgsSchema.optional(),
      options: rootModelReadOptionsSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('read'),
      filter: objectOrArraySchema,
      args: rootModelReadFilterArgsSchema.optional(),
      options: rootModelReadOptionsSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('create'),
      data: z.unknown(),
      args: rootModelCreateArgsSchema.optional(),
      options: rootModelCreateOptionsSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('update'),
      id: z.string().min(1),
      data: z.unknown(),
      args: rootModelUpdateArgsSchema.optional(),
      options: rootModelUpdateOptionsSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('upsert'),
      data: z.record(z.string(), z.unknown()),
      args: rootModelUpsertArgsSchema.optional(),
      options: rootModelUpsertOptionsSchema.optional(),
    })
    .passthrough(),
  z
    .object({ ...rootEntryBaseSchema, target: z.literal('model'), op: z.literal('delete'), id: z.string().min(1) })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('subList'),
      id: z.string().min(1),
      sub: z.string().min(1),
      filter: z.record(z.string(), z.unknown()).optional(),
      args: rootModelSubListArgsSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('subRead'),
      id: z.string().min(1),
      sub: z.string().min(1),
      subId: z.string().min(1),
      args: rootModelSubReadArgsSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('subCreate'),
      id: z.string().min(1),
      sub: z.string().min(1),
      data: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown()))]),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('subUpdate'),
      id: z.string().min(1),
      sub: z.string().min(1),
      subId: z.string().min(1),
      data: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown()))]),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('subBulkUpdate'),
      id: z.string().min(1),
      sub: z.string().min(1),
      data: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown()))]),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('subDelete'),
      id: z.string().min(1),
      sub: z.string().min(1),
      subId: z.string().min(1),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('distinct'),
      field: z.string().min(1),
      filter: objectOrArraySchema.optional(),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('model'),
      op: z.literal('count'),
      filter: objectOrArraySchema.optional(),
      options: rootModelCountOptionsSchema.optional(),
    })
    .passthrough()
    .superRefine((body, ctx) => rejectKeys(body, ctx, ['access'])),
]);

const rootDataQueryEntrySchema = z.union([
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('data'),
      op: z.literal('list'),
      filter: objectOrArraySchema.optional(),
      args: rootDataListArgsSchema.optional(),
      options: rootDataListOptionsSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('data'),
      op: z.literal('read'),
      id: z.string().min(1),
      args: rootDataReadArgsSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      ...rootEntryBaseSchema,
      target: z.literal('data'),
      op: z.literal('read'),
      filter: objectOrArraySchema,
      args: rootDataReadArgsSchema.optional(),
    })
    .passthrough(),
]);

export const rootQuerySchema = z.array(z.union([rootModelQueryEntrySchema, rootDataQueryEntrySchema]));
