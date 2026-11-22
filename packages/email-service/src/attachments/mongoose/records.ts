import type { mongo } from 'mongoose';
import { MAX_UNIX_MS, MESSAGE_LIMITS as L } from '../../constants';
import { invalid, readRecord } from '../../internal/validation';
import type { BsonDocument } from '../../stores/mongoose/connection';
import type { ManagedAttachmentRead, ManagedAttachmentWrite } from '../backing';
import type { ManagedAttachmentBindingOptions } from '../contracts';
import {
  managedAttachmentBoundary,
  MANAGED_ATTACHMENT_CLOCK_GUARD_MS,
  MANAGED_ATTACHMENT_GRACE_MS,
  managedDeadline,
} from '../records';

const HOLD_MS = MANAGED_ATTACHMENT_GRACE_MS + MANAGED_ATTACHMENT_CLOCK_GUARD_MS;
const textWidths = {
  resolverKey: L.identifierBytes,
  revision: L.identifierBytes,
  filename: L.filenameBytes,
  contentType: L.contentTypeBytes,
  sha256: 64,
} as const;
const fields = ['_id', 'format', 'byteLength', ...Object.keys(textWidths), 'bytes', 'deliverBy', 'purgeAt'];
const byteSize = { $binarySize: '$bytes' };
const mimePart = "[-a-z0-9!#$%&'*+.^_`{|}~]+";

const isType = (field: string, type: string) => ({ $eq: [{ $type: `$${field}` }, type] });
const maxText = (field: string, max: number) => ({ $lte: [{ $strLenBytes: `$${field}` }, max] });
const inByteBounds = { $and: [{ $gte: ['$byteLength', 1] }, { $lte: ['$byteLength', L.attachmentBytes] }] };
const equalByteSize = { $eq: [byteSize, '$byteLength'] };
const token = (max: number) => `[A-Za-z0-9][A-Za-z0-9._-]{0,${max - 1}}`;
const stringPattern = (pattern: string) => ({ bsonType: 'string', pattern: String.raw`\A${pattern}\z` });

export function attachmentValidator({ namespace, resolverKey }: ManagedAttachmentBindingOptions): BsonDocument {
  const boundary = managedAttachmentBoundary(namespace);
  return {
    $and: [
      {
        $jsonSchema: {
          bsonType: 'object',
          required: fields,
          additionalProperties: false,
          properties: {
            _id: stringPattern(
              String.raw`${boundary}${token(L.scopeBytes)}/${token(L.identifierBytes)}/ma1\.[0-9a-f]{64}`,
            ),
            format: { bsonType: 'int', enum: [1] },
            byteLength: { bsonType: 'int', minimum: 1, maximum: L.attachmentBytes },
            resolverKey: { bsonType: 'string', enum: [resolverKey] },
            revision: stringPattern(token(L.identifierBytes)),
            filename: stringPattern(String.raw`(?!\.{1,2}\z)[^\x00-\x1f\x7f/\\:]+`),
            contentType: stringPattern(`${mimePart}/${mimePart}`),
            sha256: stringPattern('[0-9a-f]{64}'),
            bytes: { bsonType: 'binData' },
            deliverBy: { bsonType: 'date' },
            purgeAt: { bsonType: 'date' },
          },
        },
      },
      {
        $expr: {
          // Guard expression operands independently of evaluation order with $jsonSchema.
          $cond: [
            {
              $and: [
                isType('bytes', 'binData'),
                isType('deliverBy', 'date'),
                isType('filename', 'string'),
                isType('contentType', 'string'),
              ],
            },
            {
              $and: [
                equalByteSize,
                maxText('filename', L.filenameBytes),
                maxText('contentType', L.contentTypeBytes),
                { $gte: ['$deliverBy', new Date(0)] },
                { $lte: ['$deliverBy', new Date(MAX_UNIX_MS - HOLD_MS)] },
                { $eq: ['$purgeAt', { $add: ['$deliverBy', HOLD_MS] }] },
              ],
            },
            false,
          ],
        },
      },
    ],
  };
}

const project = (field: string, guard: BsonDocument) => ({ $cond: [guard, `$${field}`, '$$REMOVE'] });

/** Verify types and width before sending anything but bounded metadata and Binary over the wire. */
export const attachmentProjection = {
  _id: 1,
  format: project('format', isType('format', 'int')),
  byteLength: project('byteLength', isType('byteLength', 'int')),
  deliverBy: project('deliverBy', isType('deliverBy', 'date')),
  purgeAt: project('purgeAt', isType('purgeAt', 'date')),
  ...Object.fromEntries(
    Object.entries(textWidths).map(([name, max]) => [
      name,
      { $cond: [isType(name, 'string'), project(name, maxText(name, max)), '$$REMOVE'] },
    ]),
  ),
  bytes: {
    $cond: [
      isType('bytes', 'binData'),
      project('bytes', { $and: [isType('byteLength', 'int'), inByteBounds, equalByteSize] }),
      '$$REMOVE',
    ],
  },
  fieldsOnly: {
    $setIsSubset: [{ $map: { input: { $objectToArray: '$$ROOT' }, in: '$$this.k' } }, fields],
  },
};

export function attachmentBson({ metadata, bytes }: ManagedAttachmentWrite, Binary: typeof mongo.Binary) {
  const { key: _id, deliverBy, ...rest } = metadata;
  return {
    _id,
    ...rest,
    bytes: new Binary(bytes, Binary.SUBTYPE_DEFAULT),
    deliverBy: new Date(deliverBy),
    purgeAt: new Date(deliverBy + HOLD_MS),
  };
}

export function readAttachmentBson(row: unknown, Binary: typeof mongo.Binary): ManagedAttachmentRead {
  const code = 'store_incompatible';
  const {
    _id,
    bytes,
    deliverBy: deadline,
    purgeAt,
    fieldsOnly,
    ...metadata
  } = readRecord(
    row,
    [
      '_id',
      'format',
      'resolverKey',
      'revision',
      'deliverBy',
      'filename',
      'contentType',
      'byteLength',
      'sha256',
      'bytes',
      'fieldsOnly',
    ],
    ['purgeAt'],
    code,
  );
  if (
    fieldsOnly !== true ||
    !(deadline instanceof Date) ||
    !(bytes instanceof Binary) ||
    bytes.sub_type !== Binary.SUBTYPE_DEFAULT ||
    !Number.isInteger(bytes.position) ||
    bytes.position < 1 ||
    bytes.position > L.attachmentBytes ||
    bytes.position !== metadata.byteLength ||
    bytes.position > bytes.buffer.byteLength
  )
    invalid(code);
  const deliverBy = managedDeadline(deadline.getTime(), code);
  // Retention evidence is for producers. A worker can still drain a valid body
  // when a privileged mutation has damaged only the lifetime proof.
  const retainedThrough =
    purgeAt instanceof Date && purgeAt.getTime() === deliverBy + HOLD_MS
      ? purgeAt.getTime() - MANAGED_ATTACHMENT_CLOCK_GUARD_MS
      : undefined;
  return {
    status: 'found',
    metadata: { key: _id, deliverBy, ...metadata },
    body: bytes.value(),
    transportLength: bytes.position,
    ...(retainedThrough === undefined ? {} : { retainedThrough }),
  };
}
