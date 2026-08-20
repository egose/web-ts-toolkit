import type { HydratedDocument, Schema } from 'mongoose';

export interface NewDocumentPluginOptions<TDocument = unknown, TResult = unknown> {
  /** Runs after the first successful save for a newly inserted document. */
  fn(this: TDocument, document: TDocument): TResult | Promise<TResult>;
}

type NewDocumentPluginState = {
  wasNew: boolean;
};

type PluginDocument = {
  isNew: boolean;
  $locals: Record<string, unknown>;
};

const stateKey = 'newDocumentPlugin';

/**
 * Runs a callback once, after a newly inserted document is successfully saved.
 * Existing documents saved later do not trigger the callback.
 */
export function newDocumentPlugin<TRawDocType, TDocument = HydratedDocument<TRawDocType>>(
  schema: Schema<TRawDocType>,
  options: NewDocumentPluginOptions<TDocument>,
) {
  schema.pre('save', function newDocumentPluginPreSave(this: PluginDocument) {
    this.$locals[stateKey] = { wasNew: this.isNew } satisfies NewDocumentPluginState;
  });

  schema.post('save', async function newDocumentPluginPostSave(this: PluginDocument & TDocument, document: TDocument) {
    const state = this.$locals[stateKey] as NewDocumentPluginState | undefined;
    if (!state?.wasNew) return;

    await options.fn.call(this, document);
  });
}
