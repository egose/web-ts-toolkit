import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';
import { expect } from 'vitest';
import {
  createEmailAdmin,
  createEmailRelay,
  createEmailWorker,
  type AttachmentRef,
  type AttachmentResolver,
  type ConfiguredEmailProvider,
  type PreparedEmailCommand,
  type ResolvedAttachment,
  type SmtpCapacity,
} from '../../src';
import type { ManagedAttachmentReceipt, PutManagedAttachmentInput } from '../../src/attachments';
import { createAzureAttachmentStore } from '../../src/attachments/azure';
import { createMongooseAttachmentStore } from '../../src/attachments/mongoose';
import { createS3AttachmentStore } from '../../src/attachments/s3';
import { createMongooseEmailStore } from '../../src/mongoose';
import { fixtureCall, fixtureContainerName, startAzurite } from '../azure/azurite';
import { startAzureRelay } from '../azure/relay';
import { laneCall } from '../conformance/smtp-capacity-fixture';
import { B, CALL } from '../conformance/store-fixtures';
import { ACTIVITIES, commandTrace, dbOf, fixture, JOBS, replicaSet, waitForTime } from '../mongodb/fixture';
import { startS3Relay } from '../s3/relay';
import { startSeaweedFs } from '../s3/seaweedfs';

const ATTACHMENTS = 'email_attachments';
const PREFIX = 'mixed-delivery/';
const PROJECT = 'project-terms';
const ASSETS = {
  mongo: { filename: 'invoice.pdf', contentType: 'application/pdf' },
  seaweed: { filename: 'packing-slip.bin', contentType: 'application/octet-stream' },
  azure: { filename: 'pièces-jointes.txt', contentType: 'text/plain' },
  project: { filename: 'terms.txt', contentType: 'text/plain' },
} as const;
type Backend = Exclude<keyof typeof ASSETS, 'project'>;

export type ManagedFile = ResolvedAttachment & {
  backend: Backend;
  input: PutManagedAttachmentInput;
  receipt: ManagedAttachmentReceipt;
};

export async function startStorage(lifetime: AsyncDisposableStack) {
  // The Mongo default Unix socket would create a file under /tmp, not under TMPDIR.
  const repl = await replicaSet(1, ['--nounixsocket']);
  lifetime.defer(async () => {
    await repl.stop();
  });
  const seaweed = await startSeaweedFs();
  lifetime.defer(seaweed.close);
  const azurite = await startAzurite();
  lifetime.defer(azurite.close);
  return { repl, seaweed, azurite };
}

function testBytes(scope: string, id: string) {
  // Same length and different digest in the two scopes; include non-text bytes and CRLF.
  return Buffer.concat([Buffer.of(0x00, 0xff, 0x0d, 0x0a, scope === B ? 0x02 : 0x01), Buffer.from(id)]);
}

export async function deliveryFixture(
  lifetime: AsyncDisposableStack,
  { repl, seaweed, azurite }: Awaited<ReturnType<typeof startStorage>>,
  smtpCapacity?: SmtpCapacity,
) {
  const mongo = await fixture(repl);
  lifetime.defer(mongo.close);
  const firstDb = dbOf(mongo.first);
  const secondDb = dbOf(mongo.second);
  expect(await secondDb.admin().command({ buildInfo: 1, maxTimeMS: 1_000 })).toMatchObject({ version: '8.2.6' });
  const lane = smtpCapacity ? { smtpCapacity } : {};
  const primary = smtpCapacity ? createMongooseEmailStore(mongo.first, lane) : mongo.primary;
  const peer = smtpCapacity ? createMongooseEmailStore(mongo.second, lane) : mongo.peer;
  await primary.ready();
  await peer.ready();

  const bucket = `mail-${randomUUID()}`;
  const container = fixtureContainerName();
  const bindings = {
    mongo: { resolverKey: 'managed-mongo', namespace: randomUUID() },
    seaweed: { resolverKey: 'managed-seaweed', namespace: randomUUID() },
    azure: { resolverKey: 'managed-azure', namespace: randomUUID() },
  };
  const s3Options = { ...bindings.seaweed, prefix: PREFIX, bucket, retention: 'bucket-policy' } as const;
  const azureOptions = { ...bindings.azure, prefix: PREFIX };
  const azureControl = azurite.control(container);
  await seaweed.control.send(new CreateBucketCommand({ Bucket: bucket }), fixtureCall());
  await seaweed.control.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: `emailattachmentsv1${bindings.seaweed.namespace.replaceAll('-', '')}`,
            Status: 'Enabled',
            Filter: { Prefix: `${PREFIX}ma1/${bindings.seaweed.namespace}/` },
            Expiration: { Days: 32 },
          },
        ],
      },
    }),
    fixtureCall(),
  );
  await azureControl.create(fixtureCall());

  const s3Write = await startS3Relay(seaweed.endpoint);
  lifetime.defer(s3Write.close);
  const s3Read = await startS3Relay(seaweed.endpoint);
  lifetime.defer(s3Read.close);
  const azWrite = await startAzureRelay(azurite.endpoint);
  lifetime.defer(azWrite.close);
  const azRead = await startAzureRelay(azurite.endpoint);
  lifetime.defer(azRead.close);
  const s3Writer = seaweed.client(s3Write.endpoint);
  lifetime.defer(() => s3Writer.destroy());
  const s3Reader = seaweed.client(s3Read.endpoint, 'worker');
  lifetime.defer(() => s3Reader.destroy());

  const writers = {
    mongo: createMongooseAttachmentStore(mongo.first, bindings.mongo),
    seaweed: createS3AttachmentStore(s3Writer, s3Options),
    azure: createAzureAttachmentStore(azurite.delegated(container, azWrite.endpoint, 'rw'), azureOptions),
  };
  const readers = {
    mongo: createMongooseAttachmentStore(mongo.second, bindings.mongo),
    seaweed: createS3AttachmentStore(s3Reader, s3Options),
    azure: createAzureAttachmentStore(azurite.delegated(container, azRead.endpoint, 'r'), azureOptions),
  };
  await writers.mongo.ready({ install: true });
  await readers.mongo.ready();
  const writerTrace = commandTrace(mongo.first);
  const readerTrace = commandTrace(mongo.second);
  lifetime.defer(() => {
    writerTrace.close();
    readerTrace.close();
  });

  const projectFiles = new Map<string, ResolvedAttachment>();
  const resolutions: { scope: string; ref: AttachmentRef; status: 'pending' | 'found' | 'unavailable' }[] = [];
  const projectRead: AttachmentResolver = (ref, { scope }) => {
    const asset = projectFiles.get(scope);
    return asset && isDeepStrictEqual(asset.ref, ref)
      ? { status: 'found', bytes: Buffer.from(asset.bytes) }
      : { status: 'unavailable' };
  };
  const observe =
    (resolve: AttachmentResolver): AttachmentResolver =>
    async (ref, context) => {
      const entry = { scope: context.scope, ref, status: 'pending' } satisfies (typeof resolutions)[number];
      const index = resolutions.push(entry) - 1;
      const result = await resolve(ref, context);
      resolutions[index] = { ...entry, status: result.status };
      return result;
    };
  const attachmentResolvers = Object.fromEntries([
    ...Object.values(readers).map(({ resolverKey, resolve }) => [resolverKey, observe(resolve)] as const),
    [PROJECT, observe(projectRead)],
  ]);
  const qualified = smtpCapacity && `email_smtp_v2.${smtpCapacity.namespace}`;
  const jobsName = qualified ? `${qualified}.jobs` : JOBS;
  const activitiesName = qualified ? `${qualified}.activities` : ACTIVITIES;
  const jobs = secondDb.collection<{
    scope: string;
    jobId: string;
    snapshot?: PreparedEmailCommand['snapshot'];
    snapshotHash: string;
    fingerprint: string;
  }>(jobsName);
  const physicalKey = (backend: Backend, scope: string, ref: AttachmentRef) =>
    `${backend === 'mongo' ? '' : PREFIX}ma1/${bindings[backend].namespace}/${scope}/${ref.id}/${ref.version}`;
  const s3Object = (file: ManagedFile) => ({
    Bucket: bucket,
    Key: physicalKey('seaweed', file.input.scope, file.ref),
  });
  const traceMongoAttachments = ({ commands }: ReturnType<typeof commandTrace>) =>
    commands
      .filter(({ commandName, command }) => command[commandName] === ATTACHMENTS)
      .map(({ commandName, command }) => [commandName, command.filter?._id ?? command.documents?.[0]?._id]);
  const azContainerPath = new URL(azurite.containerUrl(container)).pathname;
  const traffic = () => ({
    mongoWrites: traceMongoAttachments(writerTrace),
    mongoReads: traceMongoAttachments(readerTrace),
    s3Writes: s3Write.calls.map(({ method, path, query, status }) => [
      method,
      path,
      query.has('lifecycle') ? 'lifecycle' : query.has('versioning') ? 'versioning' : 'object',
      status,
    ]),
    s3Reads: s3Read.calls.map(({ method, path, status }) => [method, path, status]),
    azWrites: azWrite.calls.map(({ method, path, status }) => [method, path, status]),
    azReads: azRead.calls.map(({ method, path, status }) => [method, path, status]),
    resolutions: [...resolutions],
  });
  return {
    ...mongo,
    lane,
    primary,
    peer,
    firstDb,
    secondDb,
    jobs,
    jobsName,
    activitiesName,
    call: smtpCapacity ? laneCall(smtpCapacity) : CALL,
    waitUntil: (until: number) => waitForTime(mongo.second, until),
    writers,
    writerTrace,
    readerTrace,
    traffic,
    relay(scope: string, store = primary) {
      return createEmailRelay({ scope, store, ...lane, retention: { payloadMs: 0 } });
    },
    admin(scope: string) {
      return createEmailAdmin({ scope, store: peer, ...lane });
    },
    worker(scope: string, provider: ConfiguredEmailProvider) {
      const worker = createEmailWorker({ scope, store: peer, providers: [provider], attachmentResolvers, ...lane });
      lifetime.defer(async () => {
        expect(await worker.shutdown()).toMatchObject({ status: 'stopped' });
      });
      return worker;
    },
    async put(
      backend: Backend,
      scope: string,
      deliverBy: number,
      id: string = `${backend}-asset`,
    ): Promise<ManagedFile> {
      const bytes = testBytes(scope, id);
      const input = { ...ASSETS[backend], scope, id, revision: 'release-r3', deliverBy, bytes };
      const receipt = await writers[backend].put(input);
      expect(receipt.ref).toEqual({
        ...ASSETS[backend],
        id,
        resolverKey: bindings[backend].resolverKey,
        version: expect.stringMatching(/^ma1\.[a-f0-9]{64}$/),
        byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      // Wire expectations use the original put inputs, rather than values obtained from a resolver.
      return { backend, input, receipt, ref: receipt.ref, bytes };
    },
    project(scope: string): ResolvedAttachment {
      const id = 'external-legal-terms';
      const bytes = testBytes(scope, id);
      const ref = {
        ...ASSETS.project,
        resolverKey: PROJECT,
        id,
        version: 'published-v2',
        byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      const value = { ref, bytes };
      projectFiles.set(scope, value);
      return value;
    },
    async purgeS3Orphan(file: ManagedFile) {
      const target = s3Object(file);
      expect(await seaweed.control.send(new HeadObjectCommand(target), fixtureCall())).toMatchObject({
        ContentLength: file.bytes.byteLength,
      });
      await seaweed.control.send(new DeleteObjectCommand(target), fixtureCall());
      await expect(seaweed.control.send(new HeadObjectCommand(target), fixtureCall())).rejects.toMatchObject({
        $metadata: { httpStatusCode: 404 },
      });
    },
    async removeAzureBytes(file: ManagedFile) {
      const blob = azureControl.getBlobClient(physicalKey('azure', file.input.scope, file.ref));
      await blob.delete(fixtureCall());
      expect(await blob.exists(fixtureCall())).toBe(false);
    },
    expectWrites(files: readonly ManagedFile[], explicitRetry?: ManagedFile) {
      const t = traffic();
      const putS3 = ({ input: { scope }, ref }: ManagedFile, status: number) => {
        const path = `/${bucket}/${physicalKey('seaweed', scope, ref)}`;
        return [
          ['PUT', path, 'object', status],
          ['GET', path, 'object', 200],
          ['GET', `/${bucket}/`, 'lifecycle', 200],
          ['GET', `/${bucket}/`, 'versioning', 200],
        ];
      };
      expect(t.mongoWrites).toEqual(
        files
          .filter(({ backend }) => backend === 'mongo')
          .map(({ input: { scope }, ref }) => ['insert', physicalKey('mongo', scope, ref)]),
      );
      expect(t.s3Writes).toEqual([
        ...files.filter(({ backend }) => backend === 'seaweed').flatMap((file) => putS3(file, 200)),
        ...(explicitRetry ? putS3(explicitRetry, 412) : []),
      ]);
      expect(t.azWrites).toEqual(
        files
          .filter(({ backend }) => backend === 'azure')
          .flatMap(({ input: { scope }, ref }) => {
            const path = `${azContainerPath}/${physicalKey('azure', scope, ref)}`;
            return [
              ['PUT', path, 201],
              ['GET', path, 200],
            ];
          }),
      );
    },
    expectReads(...runs: { scope: string; files: readonly ResolvedAttachment[]; missing?: ResolvedAttachment }[]) {
      const t = traffic();
      const expected = runs.flatMap(({ scope, files, missing }) =>
        files.map(({ ref }) => ({ scope, ref, status: ref === missing?.ref ? 'unavailable' : 'found' })),
      );
      expect(t.resolutions).toEqual(expected);
      const forBackend = (backend: Backend) =>
        expected.filter(({ ref }) => ref.resolverKey === bindings[backend].resolverKey);
      expect(t.mongoReads).toEqual(
        forBackend('mongo').map(({ scope, ref }) => ['find', physicalKey('mongo', scope, ref)]),
      );
      expect(t.s3Reads).toEqual(
        forBackend('seaweed').map(({ scope, ref }) => ['GET', `/${bucket}/${physicalKey('seaweed', scope, ref)}`, 200]),
      );
      expect(t.azReads).toEqual(
        forBackend('azure').map(({ scope, ref, status }) => [
          'GET',
          `${azContainerPath}/${physicalKey('azure', scope, ref)}`,
          status === 'unavailable' ? 404 : 200,
        ]),
      );
    },
  };
}

export type DeliveryFixture = Awaited<ReturnType<typeof deliveryFixture>>;
