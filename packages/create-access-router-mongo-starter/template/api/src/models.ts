import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

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

export const CategoryModel =
  (mongoose.models.Category as Model<CategoryRecord>) || mongoose.model<CategoryRecord>('Category', categorySchema);

export const TodoModel = (mongoose.models.Todo as Model<TodoRecord>) || mongoose.model<TodoRecord>('Todo', todoSchema);
