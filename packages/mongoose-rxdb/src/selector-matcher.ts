import { getQueryMatcher, normalizeMangoQuery, type RxDocumentData, type RxJsonSchema } from 'rxdb';
import type { CompiledQuery } from './query-compiler';
import type { PersistenceRecord } from './rx-adapter';

// The schema-free compatibility helper and native-shaped test doubles need only
// the domain primary key. Real adapters supply their collection's JSON schema.
const DOMAIN_SCHEMA: RxJsonSchema<PersistenceRecord> = {
  version: 0,
  primaryKey: '_id',
  type: 'object',
  properties: { _id: { type: 'string', maxLength: 100 } },
  required: ['_id'],
};

/** Internal boundary for compiled selectors to RxDB's public storage matcher. */
export function createSelectorMatcher(
  selector: CompiledQuery['selector'] | undefined,
  schema: RxJsonSchema<PersistenceRecord> = DOMAIN_SCHEMA,
): (record: PersistenceRecord) => boolean {
  // Selector validation and Date normalization belong to compileQuery. Do not
  // reapply input budgets to its expanded output or reinterpret stored strings.
  const query = normalizeMangoQuery(schema, { selector: selector ?? {} }, true);
  const matcher = getQueryMatcher(schema, query);
  // RxDB types its matcher for stored documents, but selectors here address
  // domain data. No revision/deletion metadata is needed for these predicates.
  return (record) => matcher(record as RxDocumentData<PersistenceRecord>);
}
