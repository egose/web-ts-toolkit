import { z, type RefinementCtx } from 'zod';

export const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

export const queryBooleanString = z.enum(['true', 'false']);
export const positiveIntegerString = z.string().regex(/^\d+$/, 'Expected a non-negative integer');
export const nonNegativeIntegerSchema = z.number().int().min(0);

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
export const includeItemSchema = z
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
export const includeSchema = z.union([includeItemSchema, z.array(includeItemSchema)]);
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
