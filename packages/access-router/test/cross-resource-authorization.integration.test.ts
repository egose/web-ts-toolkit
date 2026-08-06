import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import acl, { permissionsPlugin, setGlobalOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let modelCounter = 0;

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });
};

const createCrossResourceAuthApp = async () => {
  const orgModelName = `AclMongoCrossOrg${++modelCounter}`;
  const userModelName = `AclMongoCrossUser${modelCounter}`;

  const Org = mongoose.model(
    orgModelName,
    new mongoose.Schema({
      name: String,
    }),
  );

  const userSchema = new mongoose.Schema({
    name: String,
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: orgModelName },
  });
  userSchema.plugin(permissionsPlugin, { modelName: userModelName });
  const User = mongoose.model(userModelName, userSchema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions(req: express.Request) {
      return String(req.headers['x-perms'] ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    },
  });

  const orgRouter = acl.createRouter(orgModelName, {
    basePath: '/cross-orgs',
    operationAccess: {
      list: 'canListOrgs',
      read: 'canReadOrgs',
      count: 'canCountOrgs',
    },
    permissionSchema: {
      name: true,
    },
  });

  const userRouter = acl.createRouter(userModelName, {
    basePath: '/cross-users',
    operationAccess: {
      list: true,
      read: true,
    },
    permissionSchema: {
      name: true,
      orgId: true,
    },
  });

  const org = await Org.create({ name: 'org-1' });
  await User.create([{ name: 'user-1', orgId: org._id }]);

  const app = express();
  app.use(express.json());
  app.use(orgRouter.routes);
  app.use(userRouter.routes);

  return { app, orgModelName, orgId: String(org._id) };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoCrossOrg.*/);
  mongoose.deleteModel(/AclMongoCrossUser.*/);
});

describe('cross-resource authorization (AR-06)', () => {
  it('requires target list access for include list', async () => {
    const { app, orgModelName } = await createCrossResourceAuthApp();

    const response = await request(app)
      .post('/cross-users/__query')
      .send({
        include: {
          model: orgModelName,
          op: 'list',
          path: 'orgs',
          localField: 'orgId',
          foreignField: '_id',
        },
      })
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toMatchObject({
      title: 'Unauthorized',
      detail: 'Unauthorized',
      status: 401,
    });
  });

  it('requires target read access for include read', async () => {
    const { app, orgModelName } = await createCrossResourceAuthApp();

    const response = await request(app)
      .post('/cross-users/__query')
      .set('x-perms', 'canListOrgs')
      .send({
        include: {
          model: orgModelName,
          op: 'read',
          path: 'org',
          localField: 'orgId',
          foreignField: '_id',
        },
      })
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body.status).toBe(401);
  });

  it('requires target count access for include count', async () => {
    const { app, orgModelName } = await createCrossResourceAuthApp();

    const response = await request(app)
      .post('/cross-users/__query')
      .set('x-perms', 'canListOrgs')
      .send({
        include: {
          model: orgModelName,
          op: 'count',
          path: 'orgCount',
          localField: 'orgId',
          foreignField: '_id',
        },
      })
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body.status).toBe(401);
  });

  it('rejects unknown include targets with a controlled bad request', async () => {
    const { app } = await createCrossResourceAuthApp();

    const response = await request(app)
      .post('/cross-users/__query')
      .send({
        include: {
          model: 'MissingCrossModel',
          op: 'list',
          path: 'orgs',
          localField: 'orgId',
          foreignField: '_id',
        },
      })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
    });
  });

  it('requires target list access for subquery list', async () => {
    const { app, orgModelName } = await createCrossResourceAuthApp();

    const response = await request(app)
      .post('/cross-users/__query')
      .send({
        filter: {
          orgId: {
            $in: {
              $$sq: {
                model: orgModelName,
                op: 'list',
                sqOptions: { path: '_id', compact: true },
              },
            },
          },
        },
      })
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body.status).toBe(401);
  });

  it('requires target read access for subquery read', async () => {
    const { app, orgId, orgModelName } = await createCrossResourceAuthApp();

    const response = await request(app)
      .post('/cross-users/__query')
      .set('x-perms', 'canListOrgs')
      .send({
        filter: {
          orgId: {
            $in: {
              $$sq: {
                model: orgModelName,
                op: 'read',
                id: orgId,
                sqOptions: { path: '_id', compact: true },
              },
            },
          },
        },
      })
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body.status).toBe(401);
  });

  it('rejects unknown subquery targets with a controlled bad request', async () => {
    const { app, orgId } = await createCrossResourceAuthApp();

    const response = await request(app)
      .post('/cross-users/__query')
      .send({
        filter: {
          orgId: {
            $in: {
              $$sq: {
                model: 'MissingCrossModel',
                op: 'read',
                id: orgId,
                sqOptions: { path: '_id', compact: true },
              },
            },
          },
        },
      })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body.status).toBe(400);
  });

  it('allows cross-resource include and subquery when the target operation is allowed', async () => {
    const { app, orgId, orgModelName } = await createCrossResourceAuthApp();

    const response = await request(app)
      .post('/cross-users/__query')
      .set('x-perms', 'canListOrgs,canReadOrgs,canCountOrgs')
      .send({
        filter: {
          orgId: {
            $in: {
              $$sq: {
                model: orgModelName,
                op: 'read',
                id: orgId,
                sqOptions: { path: '_id', compact: true },
              },
            },
          },
        },
        include: [
          {
            model: orgModelName,
            op: 'list',
            path: 'orgs',
            localField: 'orgId',
            foreignField: '_id',
          },
          {
            model: orgModelName,
            op: 'read',
            path: 'org',
            localField: 'orgId',
            foreignField: '_id',
          },
          {
            model: orgModelName,
            op: 'count',
            path: 'orgCount',
            localField: 'orgId',
            foreignField: '_id',
          },
        ],
      })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toMatchObject({
      data: [
        {
          name: 'user-1',
          orgCount: 1,
          org: { name: 'org-1' },
          orgs: [{ name: 'org-1' }],
        },
      ],
    });
  });
});
