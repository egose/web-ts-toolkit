import { isDeepStrictEqual } from 'node:util';
import type { mongo } from 'mongoose';
import { invalid } from '../../internal/validation';
import { batch, doc, SIMPLE, type BsonDocument } from '../../stores/mongoose/connection';
import type { ManagedAttachmentOperation } from '../backing';
import type { MongoAttachmentCommands, MongoAttachmentConnection } from './connection';
import { attachmentProjection } from './records';

const INCOMPATIBLE = 'store_incompatible';
const ID = { v: 2, name: '_id_', key: { _id: 1 } };
const TTL_SPEC = { name: 'ma1_purge', key: { purgeAt: 1 }, expireAfterSeconds: 0 };
const TTL = { v: 2, ...TTL_SPEC };
const INSTALL_REJECTED = new Set([2, 9, 13, 18, 20, 26, 59, 67, 68, 72, 73, 85, 86, 115, 242, 323, 361, 371, 40415]);
const simple = (collation: unknown) => collation === undefined || isDeepStrictEqual(collation, SIMPLE);

function matchesIndex(raw: unknown, expected: typeof ID | typeof TTL): boolean {
  const { collation, ...actual } = doc(raw, INCOMPATIBLE);
  return simple(collation) && isDeepStrictEqual(actual, expected);
}

export function attachmentFind(name: string, uuid: mongo.UUID, key: string): BsonDocument {
  return {
    find: name,
    collectionUUID: uuid,
    filter: { _id: key },
    projection: attachmentProjection,
    hint: '_id_',
    collation: SIMPLE,
    readConcern: { level: 'linearizable' },
    singleBatch: true,
    limit: 1,
    batchSize: 1,
  };
}

export async function prepareAttachmentCollection(
  io: MongoAttachmentCommands,
  op: ManagedAttachmentOperation,
  binding: MongoAttachmentConnection,
  name: string,
  validator: BsonDocument,
  probeKey: string,
  install: boolean,
  expectedUuid?: string,
): Promise<mongo.UUID> {
  async function getCollection() {
    const reply = await io.catalog(op, binding, { listCollections: 1, filter: { name }, cursor: { batchSize: 2 } });
    const [row] = batch(reply, 1, `${binding.db.databaseName}.$cmd.listCollections`);
    return row === undefined ? undefined : doc(row, INCOMPATIBLE);
  }

  async function provision(command: BsonDocument, raceCode?: number) {
    const result = await op.request((request) => io.run(binding, request, command, 'write'));
    if (result.kind === 'ack' && !Object.hasOwn(result.value, 'writeErrors')) return;
    if (result.kind === 'failure' && result.code !== undefined) {
      if (result.code === raceCode) return; // Check that the other provisioner installed the exact definitions.
      if (INSTALL_REJECTED.has(result.code)) invalid(INCOMPATIBLE);
    }
    invalid('write_unconfirmed');
  }

  let row = await getCollection();
  if (!row && install && expectedUuid === undefined) {
    await provision(
      { create: name, collation: SIMPLE, validator, validationLevel: 'strict', validationAction: 'error' },
      48,
    );
    row = await getCollection();
  }
  if (row?.name !== name || row.type !== 'collection' || !matchesIndex(row.idIndex, ID)) invalid(INCOMPATIBLE);
  const { validator: actual, validationLevel, validationAction, collation, ...extra } = doc(row.options, INCOMPATIBLE);
  const { readOnly, uuid } = doc(row.info, INCOMPATIBLE);
  if (
    Object.keys(extra).length !== 0 ||
    !simple(collation) ||
    (validationLevel !== undefined && validationLevel !== 'strict') ||
    (validationAction !== undefined && validationAction !== 'error') ||
    !isDeepStrictEqual(actual, validator) ||
    readOnly !== false ||
    !(uuid instanceof io.driver.UUID) ||
    (expectedUuid !== undefined && uuid.toHexString() !== expectedUuid)
  )
    invalid(INCOMPATIBLE);

  async function hasTtl() {
    // Mongo allows at most 64 indexes. Never follow an unbounded catalog cursor.
    const reply = await io.catalog(op, binding, { listIndexes: name, cursor: { batchSize: 65 } });
    const indexes = batch(reply, 2, `${binding.db.databaseName}.${name}`);
    const ids = indexes.filter((index) => matchesIndex(index, ID)).length;
    const ttls = indexes.filter((index) => matchesIndex(index, TTL)).length;
    if (ids !== 1 || ttls !== indexes.length - ids) invalid(INCOMPATIBLE);
    return ttls === 1;
  }

  if (!(await hasTtl())) {
    if (!install) invalid(INCOMPATIBLE);
    // The UUID prevents provisioning against a collection replaced since the catalog read.
    await provision({ createIndexes: name, collectionUUID: uuid, indexes: [{ ...TTL_SPEC, collation: SIMPLE }] });
    if (!(await hasTtl())) invalid(INCOMPATIBLE);
  }
  // Test the actual data read path with an identity the validator will never allow.
  // The UUID also checks that the catalog above is still the bound collection.
  const probe = await io.catalog(op, binding, attachmentFind(name, uuid, probeKey));
  batch(probe, 0, `${binding.db.databaseName}.${name}`);
  return uuid;
}
