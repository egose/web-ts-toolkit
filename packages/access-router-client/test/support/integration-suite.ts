import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { z } from 'zod';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';
import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';

import { createAdapter, DataService, ModelService } from '../../src';

const MONGO_TIMEOUT = 120_000;
const USER_MODEL_NAME = 'AdapterJsIntegrationUser';
const ORG_MODEL_NAME = 'AdapterJsIntegrationOrg';

export interface Org {
  _id?: string;
  name: string;
}

export interface User {
  _id?: string;
  name: string;
  role: string;
  public: boolean;
  orgs: string[];
  statusHistory: Array<{ _id?: string; label: string; flag: string }>;
}

export interface Pet {
  name: string;
  age: number;
  sex: string;
  public: boolean;
}

const petData: Pet[] = [
  { name: 'Max', age: 1, sex: 'male', public: true },
  { name: 'Bella', age: 3, sex: 'female', public: true },
  { name: 'Rocky', age: 5, sex: 'male', public: false },
];

const orgSchema = new mongoose.Schema<Org>({
  name: { type: String, required: true },
});

const userSchema = new mongoose.Schema<User>({
  name: { type: String, required: true },
  role: { type: String, required: true },
  public: { type: Boolean, default: true },
  orgs: [{ type: mongoose.Schema.Types.ObjectId, ref: ORG_MODEL_NAME }],
  statusHistory: [
    new mongoose.Schema(
      {
        label: { type: String, required: true },
        flag: { type: String, required: true },
      },
      { _id: true },
    ),
  ],
});

const OrgModel =
  (mongoose.models[ORG_MODEL_NAME] as mongoose.Model<Org>) || mongoose.model<Org>(ORG_MODEL_NAME, orgSchema);
const UserModel =
  (mongoose.models[USER_MODEL_NAME] as mongoose.Model<User>) || mongoose.model<User>(USER_MODEL_NAME, userSchema);

export function setupIntegrationSuite() {
  let mongoServer: MongoMemoryServer;
  let server: Server;
  let adapter: ReturnType<typeof createAdapter>;
  let cacheRouteRequestCount = 0;

  const services = {} as {
    userService: ModelService<User>;
    userServiceWithError: ModelService<User>;
    orgService: ModelService<Org>;
    petService: DataService<Pet>;
  };

  const endpoints = {} as {
    apple: ReturnType<ReturnType<typeof createAdapter>['wrapGet']>;
    chairman: ReturnType<ModelService<Org>['wrapPost']>;
  };

  const seedState = {} as {
    admin: mongoose.HydratedDocument<User>;
    lucy2: mongoose.HydratedDocument<User>;
    org1: mongoose.HydratedDocument<Org>;
    org2: mongoose.HydratedDocument<Org>;
  };

  async function listen(app: express.Express) {
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
  }

  async function seedDatabase() {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));

    const [org1, org2] = await OrgModel.create([{ name: 'red' }, { name: 'blue' }]);
    const [admin, lucy2] = await UserModel.create([
      {
        name: 'admin-user',
        role: 'admin',
        public: true,
        orgs: [org1._id, org2._id],
        statusHistory: [
          { label: 'created', flag: 'green' },
          { label: 'reviewed', flag: 'blue' },
        ],
      },
      {
        name: 'lucy2',
        role: 'user',
        public: true,
        orgs: [org1._id, org2._id],
        statusHistory: [{ label: 'invited', flag: 'yellow' }],
      },
    ]);

    Object.assign(seedState, { admin, lucy2, org1, org2 });
  }

  const requestSchemas = {
    advancedCreate: {
      data: z
        .object({ name: z.string().min(3), role: z.string().min(2), public: z.boolean().optional() })
        .passthrough(),
    },
    advancedUpdate: {
      data: z.object({ role: z.string().min(2) }).passthrough(),
    },
    advancedUpsert: {
      data: z.record(z.string(), z.unknown()),
    },
  } as unknown as NonNullable<ModelRouterOptions<User>['requestSchemas']>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), { dbName: 'access-router-client-test' });

    const runtime = createAccessRuntime();
    runtime.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: (req) => (req.headers.user === 'admin' ? ['isAdmin'] : []),
    });

    const app = express();
    app.use(express.json());

    const userRouter = runtime.createRouter(USER_MODEL_NAME, {
      basePath: '/api/users',
      operationAccess: {
        new: true,
        list: true,
        read: true,
        create: true,
        update: true,
        upsert: true,
        delete: true,
        distinct: true,
        count: true,
        subs: {
          statusHistory: {
            list: true,
            read: true,
            create: true,
            update: true,
            delete: true,
          },
        },
      },
      permissionSchema: {
        name: true,
        role: true,
        public: true,
        orgs: true,
        statusHistory: {
          list: true,
          read: true,
          create: true,
          update: true,
          sub: {
            label: { list: true, read: true, create: true, update: true },
            flag: { list: true, read: true, create: true, update: true },
          },
        },
      },
      requestSchemas,
    });

    const orgRouter = runtime.createRouter(ORG_MODEL_NAME, {
      basePath: '/api/orgs',
      queryRouteSegment: '_extra',
      operationAccess: {
        new: true,
        list: true,
        read: true,
        create: true,
        update: true,
        upsert: true,
        delete: true,
        distinct: true,
        count: true,
      },
      permissionSchema: {
        name: true,
      },
    });

    const petRouter = runtime.createDataRouter('pet-data', {
      basePath: '/api/pets',
      idField: 'name',
      operationAccess: {
        list: true,
        read: true,
      },
      data: petData,
      permissionSchema: {
        name: true,
        age: true,
        sex: true,
        public: true,
      },
    });

    const rootRouter = runtime.createRouter({
      basePath: '/api/root',
      operationAccess: true,
    });

    app.get('/api/apple/:name', (req, res) => {
      res.json({ pathParams: req.params, queryParams: req.query });
    });
    app.post('/api/orgs/chairman', (req, res) => {
      res.json({ name: 'chairman', flag: req.body.flag });
    });
    app.put('/api/test/wrap-success/:name', (req, res) => {
      res.json({ method: 'put', pathParams: req.params, queryParams: req.query, body: req.body });
    });
    app.patch('/api/test/wrap-success/:name', (req, res) => {
      res.json({ method: 'patch', pathParams: req.params, queryParams: req.query, body: req.body });
    });
    app.delete('/api/test/wrap-success/:name', (req, res) => {
      res.json({ method: 'delete', pathParams: req.params, queryParams: req.query });
    });

    app.get('/api/root/group-success', (req, res) => {
      res.json({ success: true, message: 'success' });
    });

    app.get('/api/root/group-fail', (req, res) => {
      res.status(500).json({ success: false, message: 'internal error' });
    });

    app.get('/api/test/wrap-error-404/:name', (req, res) => {
      res.status(404).json({ error: 'not found' });
    });

    app.get('/api/test/wrap-error-500/:name', (req, res) => {
      res.status(500).json({ error: 'internal server error' });
    });

    app.post('/api/test/wrap-error-500/:name', (req, res) => {
      res.status(500).json({ error: 'internal server error' });
    });

    app.get('/api/test/cache-user', (req, res) => {
      cacheRouteRequestCount += 1;
      res.json({ user: req.headers.user ?? 'anonymous', requestCount: cacheRouteRequestCount });
    });

    app.use(userRouter.routes);
    app.use(orgRouter.routes);
    app.use(petRouter.routes);
    app.use(rootRouter.routes);

    const baseUrl = await listen(app);
    adapter = createAdapter({ baseURL: `${baseUrl}/api` });

    services.userService = adapter.createModelService<User>({ modelName: USER_MODEL_NAME, basePath: 'users' });
    services.userServiceWithError = adapter.createModelService<User>({
      modelName: USER_MODEL_NAME,
      basePath: 'users',
      throwOnError: true,
    });
    services.orgService = adapter.createModelService<Org>({
      modelName: ORG_MODEL_NAME,
      basePath: 'orgs',
      queryPath: '_extra',
    });
    services.petService = adapter.createDataService<Pet>({ dataName: 'pet-data', basePath: 'pets' });

    endpoints.apple = adapter.wrapGet('/apple/{{name}}');
    endpoints.chairman = services.orgService.wrapPost('/chairman');
  }, MONGO_TIMEOUT);

  beforeEach(async () => {
    cacheRouteRequestCount = 0;
    await seedDatabase();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await mongoose.disconnect();
    await mongoServer.stop();
  }, MONGO_TIMEOUT);

  return {
    get adapter() {
      return adapter;
    },
    services,
    endpoints,
    seedState,
  };
}
