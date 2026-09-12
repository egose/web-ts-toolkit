import type { HydratedDocument, Schema } from 'mongoose';

export interface NewDocumentPluginOptions<TDocument = unknown, TResult = unknown> {
  /**
   * Runs once, after the first successful `save()` of a newly inserted
   * document. This is a post-save notification, not durable delivery: a
   * throwing callback rejects the post-save hook but cannot roll back the
   * committed write, and no outbox, retry, or exactly-once guarantee across
   * transaction retries is provided. Applications needing transactional
   * delivery should record their own outbox intent and process it after
   * commit.
   */
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
 *
 * Supported operations: only document `save()` is observed, via a `pre('save')`
 * snapshot of `isNew` plus a `post('save')` invocation. Query inserts,
 * `insertMany()` fast paths that skip document middleware, and updates to
 * existing documents never trigger the callback. Later saves of the same
 * document do not re-trigger it.
 *
 * Delivery scope: post-save notification, not durable delivery. The callback
 * runs after MongoDB persistence; its failure cannot roll back the write,
 * and transaction retries/reentrant saves carry no exactly-once guarantee.
 * Write an application-owned outbox record inside the transaction when
 * exactly-once downstream delivery is required.
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
