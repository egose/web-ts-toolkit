type SchemaOptionOverrides = Record<string, unknown>;

export const uniqueNullableString = (field: string, options: SchemaOptionOverrides = {}) => ({
  type: String,
  index: { unique: true, partialFilterExpression: { [field]: { $type: 'string' } } },
  trim: true,
  default: null,
  ...options,
});

export const uniqueEmptiableString = (field: string, options: SchemaOptionOverrides = {}) => ({
  type: String,
  index: {
    unique: true,
    partialFilterExpression: { [field]: { $type: 'string', $gt: '' } },
  },
  trim: true,
  default: null,
  ...options,
});
