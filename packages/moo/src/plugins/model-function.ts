import mongoose, { type HydratedDocument, type Model, type Schema, type Types } from 'mongoose';

/**
 * Hydrated document for a raw doc type with the given instance methods.
 */
export type ModelDocument<TRawDocType, TInstanceMethods = Record<string, never>> = HydratedDocument<
  TRawDocType,
  TInstanceMethods
>;

/**
 * Instance-method surface added by one `modelFunctionPlugin` registration.
 * Keep method result types free of the enclosing `ModelDocument` alias (use
 * `void` for in-place mutation or a plain value) to avoid circular
 * `CartDocument`/`CartMethods` aliases, which fail with TS2456.
 */
export type ModelFunctionInstanceMethods<
  TMethodName extends string,
  TArgs extends unknown[] = unknown[],
  TResult = unknown,
> = {
  [K in TMethodName]: (...args: TArgs) => TResult;
};

/**
 * Static-method surface added by one registration: `fnName(doc, ...args)`
 * plus the `fnNameById(docId, ...args)` loader, which returns `null` when no
 * document matches.
 */
export type ModelFunctionStaticMethods<
  TMethodName extends string,
  TDocument,
  TArgs extends unknown[] = unknown[],
  TResult = unknown,
> = {
  [K in TMethodName]: (doc: TDocument, ...args: TArgs) => TResult;
} & {
  [K in `${TMethodName}ById`]: (docId: Types.ObjectId | string, ...args: TArgs) => Promise<Awaited<TResult> | null>;
};

export interface ModelFunctionPluginOptions<
  TMethodName extends string,
  TDocument,
  TArgs extends unknown[] = unknown[],
  TResult = unknown,
> {
  fnName: TMethodName;
  fn(doc: TDocument, ...args: TArgs): TResult;
}

const invokePluginFunction = <TDocument, TArgs extends unknown[], TResult>(
  fn: (doc: TDocument, ...args: TArgs) => TResult,
  document: TDocument,
  args: TArgs,
): TResult => {
  // Preserve the historical mongoose-bound callback context for existing consumers.
  return fn.call(mongoose, document, ...args);
};

/**
 * Registers one sync or async helper as an instance method, a static method
 * taking the document first, and a `ById` static that loads the document
 * (returning `null` when missing) before invoking `fn`. The helper runs with
 * the historical mongoose-bound callback context and receives the document
 * as its first argument.
 *
 * Prefer inference over explicit generics: `schema.plugin(modelFunctionPlugin,
 * { fnName, fn })` infers the method name, argument tuple, and result from
 * the options. When explicit type arguments are needed, the second argument
 * is the method *name* (`'applyDiscount'`), not the methods object. Keep
 * `TResult` free of the enclosing document alias to avoid circular types.
 *
 * @example
 * type Cart = { name: string; price: number };
 * type CartMethods =
 *   ModelFunctionInstanceMethods<'applyDiscount', [suffix: string, priceChange: number], void> &
 *   ModelFunctionInstanceMethods<'applyDiscountAsync', [suffix: string, priceChange: number], Promise<void>>;
 * type CartDocument = ModelDocument<Cart, CartMethods>;
 * type CartModel = Model<Cart, Record<string, never>, CartMethods> &
 *   ModelFunctionStaticMethods<'applyDiscount', CartDocument, [suffix: string, priceChange: number], void> &
 *   ModelFunctionStaticMethods<'applyDiscountAsync', CartDocument, [suffix: string, priceChange: number], Promise<void>>;
 *
 * const cartSchema = new Schema<Cart, CartModel, CartMethods>({ name: String, price: Number });
 * cartSchema.plugin(modelFunctionPlugin, {
 *   fnName: 'applyDiscount',
 *   fn: (cart: CartDocument, suffix: string, priceChange: number) => {
 *     cart.name = `${cart.name}-${suffix}`;
 *     cart.price += priceChange;
 *   },
 * });
 */
export function modelFunctionPlugin<
  TRawDocType,
  TMethodName extends string = string,
  TInstanceMethods = Record<string, never>,
  TDocument = ModelDocument<TRawDocType, TInstanceMethods>,
  TArgs extends unknown[] = unknown[],
  TResult = unknown,
>(
  schema: Schema<TRawDocType, Model<TRawDocType>, TInstanceMethods>,
  options: ModelFunctionPluginOptions<TMethodName, TDocument, TArgs, TResult>,
) {
  const { fnName, fn } = options;

  schema.static(fnName, function staticFn(doc: TDocument, ...args: TArgs) {
    return invokePluginFunction(fn, doc, args);
  });

  schema.method(fnName, function methodFn(this: TDocument, ...args: TArgs) {
    return invokePluginFunction(fn, this, args);
  });

  schema.static(
    `${fnName}ById`,
    async function staticByIdFn(this: Model<TRawDocType>, docId: Types.ObjectId | string, ...args: TArgs) {
      const model = (await this.findById(docId)) as TDocument | null;

      if (!model) return null;

      return invokePluginFunction(fn, model, args);
    },
  );
}
