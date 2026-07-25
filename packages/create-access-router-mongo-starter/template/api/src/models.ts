import { Schema, type InferSchemaType } from 'mongoose';

const categorySchemaDefinition = {
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#6366f1' },
};

const todoSchemaDefinition = {
  title: { type: String, required: true, trim: true },
  completed: { type: Boolean, default: false },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
};

export const categorySchema = new Schema(categorySchemaDefinition, { timestamps: true });
export const todoSchema = new Schema(todoSchemaDefinition, { timestamps: true });

export type CategoryRecord = InferSchemaType<typeof categorySchema>;
export type TodoRecord = InferSchemaType<typeof todoSchema>;
