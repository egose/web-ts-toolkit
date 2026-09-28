// Staged beside the strictly compiled documentation, then executed by plain Node.
// Only the Mongoose collection boundary is replaced; routing, decorators,
// authorization, query casting, projection, and response handling are real.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import sift from 'sift';

const { createArticleApp } = await import(pathToFileURL(process.argv[2]).href);

async function main() {
  const connections = [mongoose.createConnection(), mongoose.createConnection()];
  const servers = [];
  const originalGlobalModel = mongoose.models.Article;
  let requests = 0;
  let reads = 0;
  let forbiddenPersistenceCalls = 0;
  const parsedBodies = [];
  try {
    const first = createArticleApp(connections[0]);
    const second = createArticleApp(connections[1]);
    assert.notEqual(first.runtime, second.runtime);
    assert.notEqual(first.Article, second.Article);
    assert.equal(first.Article.db, connections[0]);
    assert.equal(second.Article.db, connections[1]);
    assert.equal(mongoose.models.Article, originalGlobalModel);
    assert.equal(first.Article.schema.path('slug').options.unique, true);
    assert.equal(first.Article.schema.path('published').defaultValue, false);

    const fixtures = [first, second];
    const urls = [];
    for (const [index, fixture] of fixtures.entries()) {
      const rows = [
        {
          _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
          slug: 'welcome',
          title: `Welcome ${index}`,
          body: 'Hello',
          published: true,
          internalNotes: 'editor-only',
        },
        {
          _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439012'),
          slug: 'draft',
          title: 'Unpublished',
          body: 'Not ready',
          published: false,
          internalNotes: 'draft-only',
        },
      ];
      // Match the actual cast Mongo filter, rather than always returning a happy
      // row. Returning all stored fields also exercises output trimming even if
      // persistence were to overfetch; independently check the query projection.
      fixture.Article.collection.findOne = async (filter, options) => {
        reads++;
        const matches = sift(filter);
        assert.equal(
          matches({ ...rows[0], published: false }),
          false,
          `publication restriction reaches persistence: ${JSON.stringify(filter)}`,
        );
        assert.equal(matches({ ...rows[0], slug: 'other' }), false, 'slug identifier reaches persistence');
        assert.equal(options.projection.internalNotes, undefined);
        assert.equal(options.projection.published, undefined);
        const row = rows.find(matches);
        return row ? { ...row } : null;
      };
      for (const method of [
        'find',
        'insertOne',
        'insertMany',
        'updateOne',
        'updateMany',
        'findOneAndUpdate',
        'deleteOne',
        'deleteMany',
      ]) {
        fixture.Article.collection[method] = () => {
          forbiddenPersistenceCalls++;
          throw new Error(`Denied operation reached ${method}`);
        };
      }
      const server = fixture.app.listen(0, '127.0.0.1');
      servers.push(server);
      server.on('request', (req, res) => {
        res.on('finish', () => {
          if (req.method === 'POST') parsedBodies.push(req.body);
        });
      });
      await once(server, 'listening');
      urls.push(`http://127.0.0.1:${server.address().port}`);
    }

    async function send(base, route, status, options = {}) {
      requests++;
      const response = await fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      assert.equal(response.status, status, `${options.method || 'GET'} ${route}: ${JSON.stringify(body)}`);
      assert.doesNotMatch(JSON.stringify(body), /editor-only|draft-only|Not ready|stack|MongoServerError/);
      return body;
    }

    for (const headers of [{}, { 'x-role': 'admin' }]) {
      const published = await send(urls[0], '/api/articles/welcome', 200, { headers });
      assert.deepEqual(published, {
        _id: '507f1f77bcf86cd799439011',
        slug: 'welcome',
        title: 'Welcome 0',
        body: 'Hello',
        _permissions: { _view: { $: '_' }, _edit: { $: '_' } },
      });
      await send(urls[0], '/api/articles/draft', 404, { headers });
      // Explicitly requesting a denied field still cannot disclose it.
      const selected = await send(urls[0], '/api/articles/welcome?select=title,internalNotes', 200, { headers });
      assert.equal(selected.title, 'Welcome 0');
      assert.equal(selected.internalNotes, undefined);
      const beforeDenials = reads;
      await send(urls[0], '/api/articles', 401, { headers });
      for (const [method, route] of [
        ['POST', '/api/articles'],
        ['PATCH', '/api/articles/welcome'],
        ['DELETE', '/api/articles/welcome'],
      ]) {
        await send(urls[0], route, 401, {
          method,
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ slug: 'draft', published: true, internalNotes: 'changed' }),
        });
      }
      assert.equal(reads, beforeDenials, 'denied operations stop before any persistence');
      await send(urls[0], '/api/not-a-route', 404, { headers });
    }

    // Observe actual parsed request bodies without installing replacement middleware.
    assert.deepEqual(
      parsedBodies,
      Array.from({ length: 2 }, () => ({
        slug: 'draft',
        published: true,
        internalNotes: 'changed',
      })),
    );
    const isolated = await send(urls[1], '/api/articles/welcome', 200);
    assert.equal(isolated.title, 'Welcome 1', 'same-name model uses its owning connection');
    second.runtime.setModelOption('Article', 'operationAccess.read', false);
    await send(urls[1], '/api/articles/welcome', 401);
    assert.equal(first.runtime.getModelOption('Article', 'operationAccess.read'), true);
    const stillAllowed = await send(urls[0], '/api/articles/welcome', 200);
    assert.equal(stillAllowed.title, 'Welcome 0');
    assert.equal(forbiddenPersistenceCalls, 0);
    process.stdout.write(JSON.stringify({ requests, reads, forbiddenPersistenceCalls }));
  } finally {
    for (const server of servers) {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    for (const connection of connections) await connection.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
