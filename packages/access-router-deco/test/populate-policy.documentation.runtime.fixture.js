// Execute the exact strictly compiled README/website module through installed packages.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';
import { EgoseFactoryStatic } from '@web-ts-toolkit/access-router-deco';

const { createPopulateModule } = await import(pathToFileURL(process.argv[2]).href);
const connection = await mongoose
  .createConnection(process.env.MONGODB_URL, {
    dbName: `deco_populate_docs_${randomUUID().replaceAll('-', '')}`,
  })
  .asPromise();
let server;
try {
  const api = createAccessRuntime();
  const app = express();
  app.use(express.json());
  EgoseFactoryStatic.create(api).bootstrap(createPopulateModule(connection), app);
  const Document = connection.model('Document');
  const User = connection.model('User');
  const Project = connection.model('Project');
  assert.equal(api.getModelInstance('Document'), Document);
  assert.equal(api.getModelInstance('User'), User);
  assert.equal(api.getModelOption('Document', 'requireOperationAccessForPopulateQueries'), false);
  assert.equal(api.getModelOption('Document', 'requireOperationAccessForPopulateDependencies'), false);
  assert.equal(api.getModelOption('User', 'requireOperationAccessForPopulateQueries'), true);
  assert.equal(api.getModelOption('User', 'requireOperationAccessForPopulateDependencies'), true);
  assert.deepEqual(api.getModelOption('User', 'permissionSchema'), {});
  const defaultSnapshot = api.getDefaultModelOptions();
  const documentSnapshot = api.getModelOptions('Document');
  const main = await Document.create({ name: 'Main' });
  const user = await User.create({ name: 'Ada' });
  const documentIds = [main._id, new mongoose.Types.ObjectId(), main._id];
  const userIds = [user._id, new mongoose.Types.ObjectId()];
  const project = await Project.create({ documentIds, userIds });
  let userReads = 0;
  const userFind = User.collection.find.bind(User.collection);
  User.collection.find = (...args) => {
    userReads++;
    return userFind(...args);
  };
  const root = api.createRouter({ basePath: '/batch', operationAccess: true });
  app.use(root.routes);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const args = {
    select: ['documentIds', 'userIds', '-_id'],
    populate: [
      { path: 'documentIds', select: 'name -_id' },
      { path: 'userIds', select: 'name' },
    ],
  };
  const original = { documentIds: documentIds.map(String), userIds: userIds.map(String) };
  async function read(extra = {}) {
    const response = await fetch(`${origin}/projects/__query/${project._id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...args, ...extra }),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  }
  for (const hydration of ['lean', 'hydrated']) {
    api.setModelOption('Project', 'hydration.publicRead', hydration);
    assert.deepEqual(await read(), { documentIds: [{ name: 'Main' }, { name: 'Main' }], userIds: original.userIds });
    assert.equal(userReads, 0, 'source/Document false cannot admit the strict User');
    assert.deepEqual(await read({ populate: [] }), original);
    assert.deepEqual(
      await read({ populate: [{ path: 'documentIds', select: 'name -_id', match: { name: 'missing' } }] }),
      {
        documentIds: [],
        userIds: original.userIds,
      },
    );
    assert.deepEqual(await read({ select: ['userIds', '-_id'] }), { userIds: original.userIds });
  }
  api.setModelOptions('Document', {
    requireOperationAccessForPopulateQueries: undefined,
    requireOperationAccessForPopulateDependencies: undefined,
  });
  assert.deepEqual(await read(), original); // existing Document now inherits strict defaults
  api.setDefaultModelOptions({
    requireOperationAccessForPopulateQueries: false,
    requireOperationAccessForPopulateDependencies: false,
  });
  api.setModelOptions('Document', { stripPermissionsField: true });
  assert.deepEqual(await read(), { documentIds: [{ name: 'Main' }, { name: 'Main' }], userIds: original.userIds });
  assert.equal(api.getModelOptions('Document').requireOperationAccessForPopulateQueries, undefined);
  assert.equal(defaultSnapshot.requireOperationAccessForPopulateQueries, true);
  assert.equal(documentSnapshot.requireOperationAccessForPopulateQueries, false);
  assert.equal(Object.isFrozen(defaultSnapshot), true);
  assert.equal(userReads, 0);
  // An admitted ordinary target with {} policy returns only identity, never business fields.
  api.setModelOption('User', 'requireOperationAccessForPopulateQueries', false);
  assert.deepEqual(await read(), {
    documentIds: [{ name: 'Main' }, { name: 'Main' }],
    userIds: [{ _id: String(user._id) }],
  });
  assert.equal(userReads, 1);
  const batch = await fetch(`${origin}/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([
      { target: 'model', name: 'Document', op: 'read', id: String(main._id) },
      { target: 'model', name: 'User', op: 'list' },
    ]),
  });
  assert.equal(batch.status, 200);
  for (const entry of await batch.json()) {
    assert.equal(entry.statusCode, 401);
    assert.equal(entry.result.code, 'unauthorized');
  }
  assert.throws(
    () => Reflect.apply(api.setGlobalOptions, undefined, [{ requireOperationAccessForPopulateQueries: false }]),
    /target-model configuration.*setModelOptions.*setDefaultModelOptions/,
  );
  assert.deepEqual((await Project.findById(project._id).lean()).documentIds, documentIds);
  process.stdout.write(JSON.stringify({ hydrationModes: 2, strictUserReads: 0, closedUserReads: userReads }));
} finally {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await connection.dropDatabase();
  await connection.close();
}
