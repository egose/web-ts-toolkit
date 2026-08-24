import { z } from 'zod';

export const TODO_TITLE_MAX_LENGTH = 200;
export const CATEGORY_NAME_MAX_LENGTH = 80;

const normalizedRequiredString = (label: string, maxLength: number) =>
  z.string().trim().min(1, `${label} is required`).max(maxLength, `${label} must be at most ${maxLength} characters`);

const todoTitleSchema = normalizedRequiredString('Title', TODO_TITLE_MAX_LENGTH);

export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a 24-character hexadecimal ObjectId');

export const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a six-digit hex color such as #6366f1')
  .transform((value) => value.toLowerCase());

export const todoCreateSchema = z.strictObject({
  title: todoTitleSchema,
  completed: z.boolean().optional().default(false),
  categoryId: objectIdSchema.optional().nullable(),
});

export const todoUpdateSchema = z.strictObject({
  title: todoTitleSchema.optional(),
  completed: z.boolean().optional(),
  categoryId: objectIdSchema.nullable().optional(),
});

export const categoryCreateSchema = z.strictObject({
  name: normalizedRequiredString('Name', CATEGORY_NAME_MAX_LENGTH),
  color: colorSchema.optional(),
});

export const categoryUpdateSchema = z.strictObject({
  name: normalizedRequiredString('Name', CATEGORY_NAME_MAX_LENGTH).optional(),
  color: colorSchema.optional(),
});

export const todoResponseSchema = z.strictObject({
  _id: objectIdSchema,
  title: todoTitleSchema,
  completed: z.boolean(),
  categoryId: objectIdSchema.nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const categoryResponseSchema = z.strictObject({
  _id: objectIdSchema,
  name: normalizedRequiredString('Name', CATEGORY_NAME_MAX_LENGTH),
  color: colorSchema,
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const todoFormSchema = z.object({
  title: todoTitleSchema,
  completed: z.boolean(),
  categoryId: z.union([objectIdSchema, z.literal('')]).optional(),
});

export type TodoCreateInput = z.input<typeof todoCreateSchema>;
export type TodoUpdateInput = z.input<typeof todoUpdateSchema>;
export type CategoryCreateInput = z.input<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.input<typeof categoryUpdateSchema>;
export type TodoFormInput = z.input<typeof todoFormSchema>;
export type TodoResponse = z.output<typeof todoResponseSchema>;
export type CategoryResponse = z.output<typeof categoryResponseSchema>;
