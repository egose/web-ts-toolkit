import { isDeepStrictEqual } from 'node:util';
import type { OperationBudget } from '../../internal/budget';
import { invalid } from '../../internal/validation';
import { batch, doc, SIMPLE, type Binding, type BsonDocument, type MongoConnection } from './connection';
import { activityValidator, jobValidator } from './records';

type Index = Readonly<{
  name: string;
  key: Readonly<Record<string, 1 | -1>>;
  unique?: true;
  partialFilterExpression?: BsonDocument;
  expireAfterSeconds?: 0;
}>;

export const JOB_ID = 'v1_job_identity';
export const ADMISSION_ID = 'v1_admission_identity';
export const ACTIVITY_ID = 'v1_activity_identity';
export const ACTIVITY_PAGE = 'v1_activity_page';
export const JOB_ACTIVITY_PAGE = 'v1_job_activity_page';

export const dueIndexes = {
  nextAt: { name: 'v1_due_claim', state: 'queued', sort: { nextAt: 1, priority: -1, jobId: 1 } },
  expiresAt: { name: 'v1_due_expiry', state: 'queued', sort: { expiresAt: 1, jobId: 1 } },
  leaseEndsAt: { name: 'v1_due_lease', state: 'leased', sort: { leaseEndsAt: 1, jobId: 1 } },
  pendingAt: { name: 'v1_due_projection', state: null, sort: { pendingAt: 1, jobId: 1 } },
  nextCleanupAt: { name: 'v1_due_cleanup', state: null, sort: { nextCleanupAt: 1, jobId: 1 } },
} as const satisfies Record<string, { name: string; state: string | null; sort: Index['key'] }>;

export type DueKey = keyof typeof dueIndexes;
export const activityOrder = { finishedAt: -1, jobId: 1, attemptId: 1 } as const;
export const jobActivityOrder = { finishedAt: -1, attemptId: 1 } as const;

const jobIndexes: readonly Index[] = [
  { name: JOB_ID, key: { scope: 1, jobId: 1 }, unique: true },
  { name: ADMISSION_ID, key: { scope: 1, admissionKey: 1 }, unique: true },
  ...Object.entries(dueIndexes).map(
    ([field, { name, state, sort }]): Index => ({
      name,
      key: { scope: 1, ...(state ? { state: 1 } : {}), ...sort } as Index['key'],
      partialFilterExpression: { [field]: { $exists: true } },
    }),
  ),
];
const activityIndexes: readonly Index[] = [
  { name: ACTIVITY_ID, key: { scope: 1, jobId: 1, attemptId: 1 }, unique: true },
  { name: ACTIVITY_PAGE, key: { scope: 1, ...activityOrder }, partialFilterExpression: { complete: true } },
  {
    name: JOB_ACTIVITY_PAGE,
    key: { scope: 1, jobId: 1, ...jobActivityOrder },
    partialFilterExpression: { complete: true },
  },
  { name: 'v1_activity_stub_ttl', key: { stubDeleteAt: 1 }, expireAfterSeconds: 0 },
];

export type CollectionSchema = Readonly<{ name: string; validator: BsonDocument; indexes: readonly Index[] }>;

export function jobSchema(name: string): CollectionSchema {
  return { name, validator: jobValidator(), indexes: jobIndexes };
}

export function activitySchema(name: string): CollectionSchema {
  return { name, validator: activityValidator(), indexes: activityIndexes };
}

function simple(collation: unknown): boolean {
  // MongoDB omits the collation document for binary comparisons.
  return collation === undefined || isDeepStrictEqual(collation, SIMPLE);
}

async function getCollection(io: MongoConnection, binding: Binding, budget: OperationBudget, name: string) {
  const result = await io.read(binding, budget, { listCollections: 1, filter: { name }, cursor: { batchSize: 2 } });
  const rows = batch(result, 1, `${binding.db.databaseName}.$cmd.listCollections`);
  return rows[0] === undefined ? undefined : doc(rows[0], 'store_incompatible');
}

function checkCollection(row: BsonDocument | undefined, schema: CollectionSchema): void {
  if (row?.name !== schema.name || row.type !== 'collection') invalid('store_incompatible');
  const options = doc(row.options, 'store_incompatible');
  const known = ['validator', 'validationLevel', 'validationAction', 'collation'];
  if (
    Object.keys(options).some((key) => !known.includes(key)) ||
    !simple(options.collation) ||
    (options.validationLevel ?? 'strict') !== 'strict' ||
    (options.validationAction ?? 'error') !== 'error' ||
    !isDeepStrictEqual(options.validator, schema.validator)
  )
    invalid('store_incompatible');
}

function matchesIndex(raw: BsonDocument, index: Index): boolean {
  const fields = ['v', 'name', 'key', 'unique', 'partialFilterExpression', 'expireAfterSeconds', 'collation'];
  const key = doc(raw.key, 'store_incompatible');
  return (
    raw.v === 2 &&
    raw.name === index.name &&
    simple(raw.collation) &&
    isDeepStrictEqual(Object.entries(key), Object.entries(index.key)) &&
    raw.unique === index.unique &&
    raw.expireAfterSeconds === index.expireAfterSeconds &&
    isDeepStrictEqual(raw.partialFilterExpression, index.partialFilterExpression) &&
    Object.keys(raw).every((field) => fields.includes(field))
  );
}

async function missingIndexes(
  io: MongoConnection,
  binding: Binding,
  budget: OperationBudget,
  { name, indexes }: CollectionSchema,
): Promise<Index[]> {
  const max = 64; // MongoDB's maximum indexes per collection.
  const result = await io.read(binding, budget, { listIndexes: name, cursor: { batchSize: max + 1 } });
  const defs = batch(result, max, `${binding.db.databaseName}.${name}`);
  const required: readonly Index[] = [{ name: '_id_', key: { _id: 1 } }, ...indexes];
  const seen = new Set<string>();
  for (const def of defs) {
    const raw = doc(def, 'store_incompatible');
    const expected = required.find((index) => index.name === raw.name);
    // These are private collections. An extra TTL or uniqueness rule (even under another name)
    // can change lifecycle semantics; don't adopt indexes or try to repair them.
    if (!expected || seen.has(expected.name) || !matchesIndex(raw, expected)) invalid('store_incompatible');
    seen.add(expected.name);
  }
  if (!seen.has('_id_')) invalid('store_incompatible');
  return indexes.filter((index) => !seen.has(index.name));
}

/** Install missing definitions only. Never modify existing options, validators or indexes. */
export async function prepareCollection(
  io: MongoConnection,
  binding: Binding,
  budget: OperationBudget,
  schema: CollectionSchema,
): Promise<void> {
  if (!(await getCollection(io, binding, budget, schema.name))) {
    // NamespaceExists is OK only if the reread confirms the same schema (concurrent setup).
    const result = await io.write(
      binding,
      budget,
      {
        create: schema.name,
        collation: SIMPLE,
        validator: schema.validator,
        validationLevel: 'strict',
        validationAction: 'error',
      },
      [48, 2, 9, 72, 115],
    );
    if (result.kind === 'definite_error' && result.code !== 48) invalid('store_incompatible');
  }
  checkCollection(await getCollection(io, binding, budget, schema.name), schema);
  const missing = await missingIndexes(io, binding, budget, schema);
  if (missing.length) {
    const result = await io.write(
      binding,
      budget,
      {
        createIndexes: schema.name,
        indexes: missing.map((index) => ({ ...index, collation: SIMPLE })),
      },
      [2, 67, 68, 72, 85, 86, 11000],
    );
    if (result.kind === 'definite_error') invalid('store_incompatible');
    if ((await missingIndexes(io, binding, budget, schema)).length) invalid('store_incompatible');
  }
}
