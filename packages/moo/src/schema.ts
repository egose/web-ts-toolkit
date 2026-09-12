/**
 * Arbitrary Mongoose schema-type options merged over the helper defaults.
 * Provided keys win over the defaults at runtime via object spread; the
 * helpers type this with `Omit<Base, keyof TOverrides> & TOverrides` so an
 * override of `default`, `trim`, or `index` is reflected in the inferred
 * return type instead of keeping the fixed default type.
 */
export type SchemaOptionOverrides = Record<string, unknown>;

type UniqueNullableBase = {
  type: StringConstructor;
  index: {
    unique: boolean;
    partialFilterExpression: {
      [field: string]: {
        $type: string;
      };
    };
  };
  trim: boolean;
  default: null;
};

type UniqueEmptiableBase = {
  type: StringConstructor;
  index: {
    unique: boolean;
    partialFilterExpression: {
      [field: string]: {
        $type: string;
        $gt: string;
      };
    };
  };
  trim: boolean;
  default: null;
};

/**
 * Partial-unique string field that allows any number of `null` values while
 * still rejecting duplicate non-null strings (including `''`). The partial
 * index only covers string-typed values (`{ [field]: { $type: 'string' } }`),
 * so `null`/missing entries never conflict. Extra `options` are spread over
 * the defaults and reflected in the return type.
 *
 * @example
 * const userSchema = new Schema({ email: uniqueNullableString('email') });
 */
export const uniqueNullableString = <TOverrides extends SchemaOptionOverrides = Record<string, never>>(
  field: string,
  options?: TOverrides,
): Omit<UniqueNullableBase, keyof TOverrides> & TOverrides =>
  // The runtime spread applies overrides over the defaults; the cast expresses
  // that override-wins merge because TypeScript cannot narrow a generic spread.
  ({
    type: String,
    index: { unique: true, partialFilterExpression: { [field]: { $type: 'string' } } },
    trim: true,
    default: null,
    ...options,
  }) as unknown as Omit<UniqueNullableBase, keyof TOverrides> & TOverrides;

/**
 * Partial-unique string field that additionally ignores empty strings:
 * both `null` and `''` can repeat, while duplicate non-empty strings are
 * rejected. The partial index only covers strings longer than `''`
 * (`{ [field]: { $type: 'string', $gt: '' } }`). Extra `options` are spread
 * over the defaults and reflected in the return type.
 *
 * @example
 * const userSchema = new Schema({ username: uniqueEmptiableString('username') });
 */
export const uniqueEmptiableString = <TOverrides extends SchemaOptionOverrides = Record<string, never>>(
  field: string,
  options?: TOverrides,
): Omit<UniqueEmptiableBase, keyof TOverrides> & TOverrides =>
  // Same override-wins spread contract as uniqueNullableString above.
  ({
    type: String,
    index: {
      unique: true,
      partialFilterExpression: { [field]: { $type: 'string', $gt: '' } },
    },
    trim: true,
    default: null,
    ...options,
  }) as unknown as Omit<UniqueEmptiableBase, keyof TOverrides> & TOverrides;
