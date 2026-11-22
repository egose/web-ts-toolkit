import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { ContainerClient } from '@azure/storage-blob';
import { createEmailRelay, createSmtpAcceptanceResult } from '@web-ts-toolkit/email-service';
import { createAzureAttachmentStore } from '@web-ts-toolkit/email-service/attachments/azure';
import { openStore } from './readme-build/readme-mongoose.mjs';
import { bindAzureAttachments as bindEsmAzureAttachments } from './readme-build/readme-managed-azure.mjs';
import { bindMongoAttachments } from './readme-build/readme-managed-mongoose.mjs';
import { bindSeaweedAttachments } from './readme-build/readme-managed-seaweedfs.mjs';
import { makeInvoiceWorker } from './readme-build/readme-managed-worker.mjs';

const require = createRequire(import.meta.url);
const scope = 'managed-example';
const bucket = 'private-delivery';
const region = 'eu-west-2';
const credentials = { accessKeyId: 'synthetic-fixture', secretAccessKey: 'synthetic-fixture' };
const awsNS = 'b6f95fc4-6594-4382-a892-631dcc9de100';
const weedNS = '039d0ded-5239-45a6-9bc9-03893702c370';
const day = 86_400_000;
const pdf = Buffer.from('synthetic invoice');
const csv = Buffer.from('column\nexample\n');
const termsBytes = Buffer.from('synthetic terms');
const terms = {
  resolverKey: 'project-terms',
  id: 'terms',
  version: 'v1',
  filename: 'terms.txt',
  contentType: 'text/plain',
  byteLength: termsBytes.length,
  sha256: createHash('sha256').update(termsBytes).digest('hex'),
};

// Strict loopback HTTP fixture for the installed SDK and native attachment handler. The worker
// gets only fixture object state, not the producer client, capture server or receipts.
async function startS3Capture({ mode, existing }) {
  const weed = mode !== 'aws';
  const reader = mode === 'reader';
  const namespace = weed ? weedNS : awsNS;
  const prefix = `delivery/ma1/${namespace}/`;
  const rule = `emailattachmentsv1${namespace.replaceAll('-', '')}`;
  const state = { calls: [], object: existing, anchor: existing?.anchor ?? Date.now() };
  const errors = [];
  const server = createServer();
  server.listen({ host: '127.0.0.1', port: 0, exclusive: true });
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const receive = async (request, response) => {
    const { method, headers, url } = request;
    const { pathname: path, search } = new URL(url, endpoint);
    const reply = (status, data = '', replyHeaders = {}) => {
      const body = Buffer.from(data);
      response.writeHead(status, { 'content-length': String(body.length), ...replyHeaders });
      response.end(body);
    };
    const accessKey = reader ? 'synthetic-reader' : credentials.accessKeyId;
    assert.equal(headers.host, new URL(endpoint).host);
    assert(
      headers.authorization?.startsWith(`AWS4-HMAC-SHA256 Credential=${accessKey}/`) &&
        headers.authorization.includes(`/${region}/s3/aws4_request,`),
      'request must be signed for the expected role, region and service',
    );
    const query = new URLSearchParams(search);
    const operation = query.has('lifecycle') ? 'lifecycle' : query.has('versioning') ? 'versioning' : method;
    state.calls.push(operation);
    if (operation === 'lifecycle' || operation === 'versioning') {
      assert(weed && !reader);
      assert.equal(method, 'GET');
      assert.equal(path, `/${bucket}/`);
      return reply(
        200,
        operation === 'versioning'
          ? '<VersioningConfiguration/>'
          : `<LifecycleConfiguration><Rule><ID>${rule}</ID><Status>Enabled</Status>` +
              `<Filter><Prefix>${prefix}</Prefix></Filter><Expiration><Days>32</Days></Expiration>` +
              '</Rule></LifecycleConfiguration>',
      );
    }
    assert(url.startsWith(`/${bucket}/${prefix}${scope}/`));
    if (method === 'PUT') {
      assert(!reader);
      assert.equal(headers['if-none-match'], '*');
      const expected = Number(headers['content-length']);
      assert(Number.isInteger(expected) && expected > 0 && expected <= 2 * 1024 * 1024);
      let length = 0;
      const chunks = [];
      for await (const bytes of request) {
        length += bytes.length;
        assert(length <= expected);
        chunks.push(bytes);
      }
      const body = Buffer.concat(chunks, length);
      assert.equal(length, expected);
      assert.equal(headers['x-amz-checksum-sha256'], createHash('sha256').update(body).digest('base64'));
      if (state.object) {
        assert.equal(path, state.object.path);
        return reply(412, '<Error><Code>PreconditionFailed</Code></Error>');
      }
      // Keep only storage headers; never serialize a signed SDK request.
      const storedHeaders = Object.fromEntries(
        Object.entries(headers).filter(([name]) => /^(content-type|content-length|x-amz-meta-[a-z0-9]+)$/.test(name)),
      );
      state.object = { path, headers: storedHeaders, bytes: [...body], anchor: state.anchor };
      return reply(200);
    }
    assert.equal(method, 'GET');
    assert.equal(path, state.object.path);
    const { anchor } = state;
    const expiration = `expiry-date="${new Date(anchor + 32 * day).toUTCString()}", rule-id="${rule}"`;
    return reply(200, state.object.bytes, {
      ...state.object.headers,
      'last-modified': new Date(anchor).toUTCString(),
      ...(weed ? {} : { 'x-amz-expiration': expiration }),
    });
  };
  server.on('request', (request, response) => {
    void receive(request, response).catch((error) => {
      errors.push(error);
      response.destroy();
    });
  });
  return {
    state,
    endpoint,
    async close() {
      await new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      });
      assert.deepEqual(errors, []);
    },
  };
}

async function stage({ connection, store }) {
  // Stage in CommonJS; read later from independently created ESM entry instances.
  const { stageInvoice } = require('./readme-build/readme-managed-producer.cjs');
  const { bindMongoAttachments, mongoAttachmentBinding } = require('./readme-build/readme-managed-mongoose.cjs');
  const { createMongooseAttachmentStore } = require('@web-ts-toolkit/email-service/attachments/mongoose');
  const { bindSeaweedAttachments } = require('./readme-build/readme-managed-seaweedfs.cjs');
  const { bindAwsAttachments } = require('./readme-build/readme-managed-aws.cjs');
  const { bindAzureAttachments } = require('./readme-build/readme-managed-azure.cjs');
  const { createAzureAttachmentStore: bindCjsAzure } = require('@web-ts-toolkit/email-service/attachments/azure');

  const url = 'https://example.blob.core.windows.net/private-container';
  const azure = bindAzureAttachments(url);
  const esmAzure = bindEsmAzureAttachments(url);
  assert.equal(azure.client.containerName, 'private-container');
  assert.equal(azure.store.resolverKey, 'invoice-details-azure');
  assert.equal(esmAzure.store.resolverKey, azure.store.resolverKey);
  const azureBinding = { resolverKey: azure.store.resolverKey, namespace: awsNS, prefix: 'delivery/' };
  assert.throws(() => bindCjsAzure(new ContainerClient(url), azureBinding), { code: 'invalid_config' });
  assert.throws(() => createAzureAttachmentStore(azure.client, azureBinding), { code: 'invalid_config' });
  assert.throws(() => bindCjsAzure(esmAzure.client, azureBinding), { code: 'invalid_config' });

  await createMongooseAttachmentStore(connection, mongoAttachmentBinding).ready({ install: true });
  const mongo = await bindMongoAttachments(connection);
  const resources = new AsyncDisposableStack();
  try {
    const fresh = await startS3Capture({ mode: 'aws' });
    resources.defer(fresh.close);
    const aws = bindAwsAttachments(bucket, { endpoint: fresh.endpoint, forcePathStyle: true, region, credentials });
    resources.defer(() => aws.client.destroy());
    const weed = await startS3Capture({ mode: 'seaweed' });
    resources.defer(weed.close);
    const seaweed = bindSeaweedAttachments(weed.endpoint, bucket, region, credentials);
    resources.defer(() => seaweed.client.destroy());
    const deliverBy = Date.now() + 60 * 60_000;
    const candidate = {
      scope,
      id: 'fixture-aws',
      revision: 'r3',
      deliverBy,
      bytes: csv,
      filename: 'details.csv',
      contentType: 'text/csv',
    };
    await assert.rejects(azure.store.put(candidate, { signal: AbortSignal.abort() }), { code: 'aborted' });
    assert.equal((await aws.store.put(candidate)).deliverBy, deliverBy);
    assert.deepEqual(fresh.state.calls, ['PUT', 'GET']);
    fresh.state.anchor = Date.now() - 31 * day;
    fresh.state.calls.length = 0;
    await assert.rejects(aws.store.put(candidate), { code: 'attachment_retention' }); // Still present, but fails grace.
    assert.deepEqual(fresh.state.calls, ['PUT', 'GET']);

    const writers = { pdf: mongo, csv: seaweed.store, all: [mongo, seaweed.store, aws.store, azure.store] };
    const files = { eventId: 'paid-6042', revision: 'r3', deliverBy, pdf, csv, terms };
    let staged;
    const commit = async (dto) => {
      assert(Object.isFrozen(dto) && Object.isFrozen(dto.snapshot));
      assert.equal(staged, undefined);
      staged = JSON.stringify(dto);
    };
    await assert.rejects(stageInvoice(scope, { ...files, expiresAt: deliverBy + 1 }, writers, commit), {
      code: 'attachment_retention',
    });
    assert.equal(staged, undefined, 'checking a later frozen expiry must fail before commit');
    await stageInvoice(scope, { ...files, expiresAt: deliverBy - 60_000 }, writers, commit);
    const payload = JSON.parse(staged);
    assert.equal(payload.snapshot.expiresAt, deliverBy - 60_000);
    for (const ref of payload.snapshot.attachments)
      assert.deepEqual(Object.keys(ref).sort(), Object.keys(terms).sort(), 'only ordinary refs are staged');
    assert.doesNotMatch(staged, /"(?:bytes|deliverBy|receipts|prefix)"|127\.0\.0\.1|synthetic-fixture/);
    const relay = createEmailRelay({ scope, store });
    const first = await relay.enqueuePrepared(payload);
    assert.equal(first.status, 'enqueued');
    assert.equal((await relay.enqueuePrepared(payload)).status, 'replayed');
    assert.deepEqual(weed.state.calls, [
      'PUT',
      'GET',
      'lifecycle',
      'versioning',
      'PUT',
      'GET',
      'lifecycle',
      'versioning',
    ]);
    writeFileSync('readme-managed-stage.json', staged);
    writeFileSync('readme-s3-fixture-object.json', JSON.stringify(weed.state.object)); // Synthetic storage, separate from DTO.
  } finally {
    await resources.disposeAsync();
  }
}

async function deliver({ connection, store }) {
  const mongo = await bindMongoAttachments(connection);
  const resources = new AsyncDisposableStack();
  try {
    const weed = await startS3Capture({
      mode: 'reader',
      existing: JSON.parse(readFileSync('readme-s3-fixture-object.json', 'utf8')),
    });
    resources.defer(weed.close);
    const seaweed = bindSeaweedAttachments(weed.endpoint, bucket, region, {
      accessKeyId: 'synthetic-reader',
      secretAccessKey: 'synthetic-reader',
    });
    resources.defer(() => seaweed.client.destroy());
    const payload = JSON.parse(readFileSync('readme-managed-stage.json', 'utf8'));
    const relay = createEmailRelay({ scope, store });
    assert.equal((await relay.enqueuePrepared(payload)).status, 'replayed');
    const worker = makeInvoiceWorker(
      {
        scope,
        store,
        providers: [
          {
            ref: { kind: 'smtp', key: 'standard-smtp', mode: 'live' },
            prepare({ attachments }) {
              assert.deepEqual(
                attachments.map(({ ref }) => ref),
                payload.snapshot.attachments,
              );
              assert.deepEqual(
                attachments.map(({ bytes }) => Buffer.from(bytes)),
                [pdf, csv, termsBytes],
              );
              return {
                async submit() {
                  return createSmtpAcceptanceResult([{ group: 'to', index: 0, status: 'accepted' }]);
                },
              };
            },
          },
        ],
      },
      [mongo, seaweed.store],
      (ref, context) => {
        assert.equal(context.scope, scope);
        assert.deepEqual(ref, terms);
        return { status: 'found', bytes: termsBytes };
      },
    );
    resources.defer(() => worker.shutdown());
    assert.equal((await worker.run({ limit: 1 })).counts.submitted, 1);
    assert.equal((await relay.enqueuePrepared(payload)).status, 'replayed');
    assert.equal((await worker.run({ limit: 1 })).counts.providerCalls, 0);
    assert.deepEqual(weed.state.calls, ['GET']);
  } finally {
    await resources.disposeAsync();
  }
}

const uri = process.env.EMAIL_SERVICE_README_MONGO_URI;
assert(uri, 'the managed recipe uses the existing isolated replica-set fixture');
const durable = await openStore(uri);
try {
  const role = process.argv[2];
  if (role === 'stage') await stage(durable);
  else if (role === 'worker') await deliver(durable);
  else assert.fail('expected an explicit recipe role');
} finally {
  await durable.close();
}
