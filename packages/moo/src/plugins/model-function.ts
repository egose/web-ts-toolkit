import mongoose, { type HydratedDocument, type Model, type Schema, type Types } from 'mongoose';

export type ModelDocument<TRawDocType, TInstanceMethods = Record<string, never>> = HydratedDocument<
  TRawDocType,
  TInstanceMethods
>;

export type ModelFunctionInstanceMethods<
  TMethodName extends string,
  TArgs extends unknown[] = unknown[],
  TResult = unknown,
> = {
  [K in TMethodName]: (...args: TArgs) => TResult;
};

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
