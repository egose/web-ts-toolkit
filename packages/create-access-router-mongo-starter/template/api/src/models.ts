import { Schema, type InferSchemaType } from 'mongoose';
import { CATEGORY_NAME_MAX_LENGTH, TODO_TITLE_MAX_LENGTH } from '../../src/shared/entity-schemas';
import {
  abortIntegrityWrite,
  beginCategoryIntegrityDelete,
  beginTodoIntegrityWrite,
  commitIntegrityWrite,
} from './integrity';

const categorySchemaDefinition = {
  name: { type: String, required: true, trim: true, maxlength: CATEGORY_NAME_MAX_LENGTH },
  color: { type: String, default: '#6366f1', match: /^#[0-9a-fA-F]{6}$/ },
  integrityVersion: { type: Number, default: 0, select: false },
};

const todoSchemaDefinition = {
  title: { type: String, required: true, trim: true, maxlength: TODO_TITLE_MAX_LENGTH },
  completed: { type: Boolean, default: false },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
};

export const categorySchema = new Schema(categorySchemaDefinition, { timestamps: true });
export const todoSchema = new Schema(todoSchemaDefinition, { timestamps: true });

categorySchema.index({ name: 1 }, { unique: true });
todoSchema.index({ categoryId: 1, _id: -1 });
todoSchema.index({ completed: 1, _id: -1 });

todoSchema.pre('save', function () {
  return beginTodoIntegrityWrite(this);
});
todoSchema.pre('deleteOne', { document: true, query: false }, function () {
  return beginTodoIntegrityWrite(this);
});
categorySchema.pre('deleteOne', { document: true, query: false }, function () {
  return beginCategoryIntegrityDelete(this);
});

for (const schema of [todoSchema, categorySchema]) {
  schema.post('save', (document) => commitIntegrityWrite(document));
  schema.post('deleteOne', { document: true, query: false }, (document) => commitIntegrityWrite(document));
  schema.post('save', (error: Error, document: object, next: (error: Error) => void) => {
    abortIntegrityWrite(document).then(() => next(error), next);
  });
  schema.post(
    'deleteOne',
    { document: true, query: false },
    (error: Error, document: object, next: (error: Error) => void) => {
      abortIntegrityWrite(document).then(() => next(error), next);
    },
  );
}

export type CategoryRecord = InferSchemaType<typeof categorySchema>;
export type TodoRecord = InferSchemaType<typeof todoSchema>;
