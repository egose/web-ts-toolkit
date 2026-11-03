import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const { createOwnedAuthorizationApp } = await import(pathToFileURL(process.argv[2]).href);
const connection = await mongoose
  .createConnection(process.env.MONGODB_URL, {
    dbName: `deco_owned_${randomUUID().replaceAll('-', '')}`,
  })
  .asPromise();
let server;
try {
  const { app, runtime, EmployeeModel, Team, counts } = createOwnedAuthorizationApp(connection);
  const team = await Team.create({ label: 'Engineering', privateNote: 'not output' });
  const row = await EmployeeModel.create({ name: 'Ada', salary: 100, ownerId: 'alice', teamId: team._id });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/employees`;
  const statuses = [];
  for (const mode of ['isolated', 'trusted']) {
    runtime.setModelOption(EmployeeModel.modelName, 'readAuthorizationMode', mode);
    assert.equal(runtime.getModelOption(Team.modelName, 'readAuthorizationMode'), 'isolated');
    assert.equal(runtime.getModelOptions(Team.modelName).listAuthorizationMode, 'isolated');
    const before = counts();
    const response = await fetch(`${base}/__query/${row._id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ select: ['name', 'salary', 'teamId'], populate: [{ path: 'teamId', select: ['label'] }] }),
    });
    statuses.push(response.status);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.name, 'Ada');
    assert.equal(data.salary, 100);
    assert.equal(Object.hasOwn(data, 'ownerId'), false);
    assert.equal(data.teamId.label, 'Engineering');
    assert.equal(Object.hasOwn(data.teamId, 'privateNote'), false);
    assert.deepEqual(counts(), {
      reads: before.reads + 1,
      hooks: before.hooks + 1,
      decorations: before.decorations + 1,
    });
  }
  await EmployeeModel.collection.updateOne({ _id: row._id }, { $set: { ownerId: 'bob' } });
  const changed = await fetch(`${base}/${row._id}?select=name,salary`);
  statuses.push(changed.status);
  assert.equal(changed.status, 200);
  const current = await changed.json();
  assert.equal(current.name, 'Ada');
  assert.equal(Object.hasOwn(current, 'salary'), false);
  const beforeInvalid = counts();
  const invalid = await fetch(`${base}/__query/${row._id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ options: { readAuthorizationMode: 'trusted' } }),
  });
  statuses.push(invalid.status);
  assert.equal(invalid.status, 400);
  assert.deepEqual(counts(), beforeInvalid);
  console.log(JSON.stringify({ statuses, ...counts(), targetMode: 'isolated' }));
} finally {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await connection.dropDatabase();
  await connection.close();
}
