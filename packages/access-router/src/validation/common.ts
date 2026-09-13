import { z, type RefinementCtx } from 'zod';
import { isPlainObject } from '@web-ts-toolkit/utils';
import {
  containsParentMarkerShape,
  findArgsMarkerIssue,
  isValidCorrelatedOutputPath,
  isValidParentRefPath,
  validateCorrelatedFilterTemplate,
} from '../correlated-includes';

export const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

const safeIntegerString = (min: number, message: string) =>
  z
    .string()
    .regex(/^\d+$/, message)
    .refine((value) => Number.isSafeInteger(Number(value)), 'Expected a safe integer')
    .refine((value) => Number(value) >= min, message);

export const queryBooleanString = z.enum(['true', 'false']);
export const nonNegativeIntegerString = safeIntegerString(0, 'Expected a non-negative integer');
export const positiveIntegerString = safeIntegerString(1, 'Expected a positive integer');
export const nonNegativeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const positiveIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const unknownRecord = z.record(z.string(), z.unknown());
export const projectionObjectSchema = z.record(z.string(), z.union([z.literal(1), z.literal(-1)]));
export const projectionSchema = z.union([z.string(), z.array(z.string()), projectionObjectSchema]);
export const sortOrderSchema = z.union([
  z.literal(-1),
  z.literal(1),
  z.literal('asc'),
  z.literal('ascending'),
  z.literal('desc'),
  z.literal('descending'),
]);
export const sortSchema = z.union([
  z.string(),
  z.record(z.string(), sortOrderSchema),
  z.array(z.tuple([z.string(), sortOrderSchema])),
  z.null(),
]);
export const populateSchema = z.union([
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
export const subPopulateSchema = z.union([
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
const legacyIncludeItemSchema = z
  .object({
    mode: z.enum(['legacy']).optional(),
    model: z.string().min(1),
    op: z.enum(['list', 'read', 'count']),
    path: z.string().min(1),
    filter: z.record(z.string(), z.unknown()).optional(),
    localField: z.string().min(1),
    foreignField: z.string().min(1),
    args: z
      .unknown()
      .optional()
      .describe('Forwarded to list/read includes. Count includes ignore pagination fields so counts remain exact.'),
    options: z.unknown().optional(),
  })
  .passthrough()
  .superRefine((entry, ctx) => {
    if (entry.filter !== undefined && containsParentMarkerShape(entry.filter)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Legacy includes must not contain $parent markers; use a correlated include (mode: "correlated")',
        path: ['filter'],
      });
    }
  });

const parentRefSchema = z
  .object({ $parent: z.string().min(1) })
  .strict()
  .superRefine((value, ctx) => {
    if (!isValidParentRefPath(value.$parent)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid $parent reference path: ${value.$parent}`,
        path: ['$parent'],
      });
    }
  });

const correlatedIdSchema = z.union([z.string().min(1), parentRefSchema]);

const correlatedFilterSchema = z.record(z.string(), z.unknown()).superRefine((filter, ctx) => {
  for (const issue of validateCorrelatedFilterTemplate(filter)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: issue.message,
      path: issue.path.map(String),
    });
  }
});

const correlatedEmptyOptionsSchema = z
  .unknown()
  .refine(
    (value) => value === undefined || (isPlainObject(value) && Object.keys(value).length === 0),
    'Correlated include options must be absent or empty',
  )
  .optional();

const correlatedPathSchema = z
  .string()
  .min(1)
  .superRefine((path, ctx) => {
    if (!isValidCorrelatedOutputPath(path)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid correlated include output path: ${path}`,
        path: [],
      });
    }
  });

const checkArgsMarkers = (select: unknown, sort: unknown, ctx: RefinementCtx) => {
  const selectIssue = findArgsMarkerIssue(select, 'args.select');
  if (selectIssue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: selectIssue.message, path: ['select'] });
  }
  const sortIssue = findArgsMarkerIssue(sort, 'args.sort');
  if (sortIssue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: sortIssue.message, path: ['sort'] });
  }
};

const correlatedReadArgsSchema = z
  .object({
    select: projectionSchema.optional(),
    sort: sortSchema.optional(),
    include: z.lazy((): z.ZodTypeAny => correlatedNestedIncludeSchema).optional(),
  })
  .strict()
  .superRefine((args, ctx) => checkArgsMarkers(args.select, args.sort, ctx));

const correlatedListArgsSchema = z
  .object({
    select: projectionSchema.optional(),
    sort: sortSchema.optional(),
    skip: z.union([nonNegativeIntegerSchema, nonNegativeIntegerString]).optional(),
    limit: z.union([positiveIntegerSchema, positiveIntegerString]).optional(),
    page: z.union([nonNegativeIntegerSchema, nonNegativeIntegerString]).optional(),
    pageSize: z.union([positiveIntegerSchema, positiveIntegerString]).optional(),
    include: z.lazy((): z.ZodTypeAny => correlatedNestedIncludeSchema).optional(),
  })
  .strict()
  .superRefine((args, ctx) => checkArgsMarkers(args.select, args.sort, ctx));

const correlatedCountArgsSchema = z
  .unknown()
  .refine(
    (value) => value === undefined || (isPlainObject(value) && Object.keys(value).length === 0),
    'Count includes accept no args',
  )
  .optional();

const correlatedReadByIdSchema = z
  .object({
    mode: z.literal('correlated'),
    model: z.string().min(1),
    op: z.literal('read'),
    path: correlatedPathSchema,
    id: correlatedIdSchema,
    args: correlatedReadArgsSchema.optional(),
    options: correlatedEmptyOptionsSchema,
  })
  .strict();

const correlatedReadByFilterSchema = z
  .object({
    mode: z.literal('correlated'),
    model: z.string().min(1),
    op: z.literal('read'),
    path: correlatedPathSchema,
    filter: correlatedFilterSchema,
    args: correlatedReadArgsSchema.optional(),
    options: correlatedEmptyOptionsSchema,
  })
  .strict();

const correlatedListSchema = z
  .object({
    mode: z.literal('correlated'),
    model: z.string().min(1),
    op: z.literal('list'),
    path: correlatedPathSchema,
    filter: correlatedFilterSchema,
    args: correlatedListArgsSchema.optional(),
    options: correlatedEmptyOptionsSchema,
  })
  .strict();

const correlatedCountSchema = z
  .object({
    mode: z.literal('correlated'),
    model: z.string().min(1),
    op: z.literal('count'),
    path: correlatedPathSchema,
    filter: correlatedFilterSchema,
    args: correlatedCountArgsSchema,
    options: correlatedEmptyOptionsSchema,
  })
  .strict();

export const includeItemSchema = z.union([
  legacyIncludeItemSchema,
  correlatedReadByIdSchema,
  correlatedReadByFilterSchema,
  correlatedListSchema,
  correlatedCountSchema,
]);

const correlatedNestedIncludeSchema: z.ZodTypeAny = z.union([includeItemSchema, z.array(includeItemSchema)]);

const rejectDuplicateCorrelatedPaths = (items: unknown[], ctx: RefinementCtx) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (isPlainObject(item) && item.mode === 'correlated' && typeof item.path === 'string') {
      if (seen.has(item.path)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate correlated include output path: ${item.path}`,
          path: [index, 'path'],
        });
      } else {
        seen.add(item.path);
      }
    }
  });
};

export const includeSchema = z.union([
  includeItemSchema,
  z.array(includeItemSchema).superRefine(rejectDuplicateCorrelatedPaths),
]);
export const fieldsSchema = z.array(z.string().min(1));

export const taskSchema = z.object({
  type: z.string().min(1),
  args: z.unknown(),
  options: unknownRecord.optional(),
});

export const tasksSchema = z.union([taskSchema, z.array(taskSchema)]);
export const objectOrArraySchema = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);

export function rejectKeys(body: Record<string, unknown>, ctx: RefinementCtx, keys: string[]) {
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
