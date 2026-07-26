import mongoose from 'mongoose';
import { defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';
import { MongoMemoryServer } from 'mongodb-memory-server';

const OPEN_ACCESS = {
  list: true,
  read: true,
  create: true,
  update: true,
  delete: true,
} as const;

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, default: 'user' },
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

let databaseUrl = process.env.DATABASE_URL;
let mongod: MongoMemoryServer | null = null;

export default defineRuntimeConfig({
  db: {
    url: databaseUrl,
  },
  async init() {
    if (databaseUrl || mongoose.connection.readyState === 1) {
      return;
    }

    mongod = await MongoMemoryServer.create();
    databaseUrl = mongod.getUri();
    await mongoose.connect(databaseUrl);
  },
  async shutdown() {
    if (!mongod) {
      return;
    }

    await mongoose.disconnect();
    await mongod.stop();
    mongod = null;
  },
  dev: {
    watch: ['.'],
    ext: ['ts', 'js', 'mjs', 'cjs', 'json'],
    delay: 500,
  },
  globalOptions: {
    globalPermissions(req) {
      return req.headers['x-role'] === 'admin' ? ['isAdmin'] : [];
    },
  },
  defaultModelOptions: {
    operationAccess: false,
  },
  models: [
    {
      name: 'ExampleUser',
      schema: UserSchema,
      router: {
        basePath: '/api/users',
        operationAccess: OPEN_ACCESS,
        permissionSchema: {
          email: 'isAdmin',
          name: OPEN_ACCESS,
          role: 'isAdmin',
          active: OPEN_ACCESS,
        },
      },
    },
  ],
  data: [
    {
      name: 'health',
      router: {
        basePath: '/api/health',
        idField: 'id',
        operationAccess: { list: true, read: true },
        data: [{ id: 'status', ok: true, service: 'access-router-runtime-example' }],
        permissionSchema: {
          id: true,
          ok: true,
          service: true,
        },
      },
    },
  ],
  rootRouter: {
    basePath: '/api/root',
    operationAccess: true,
  },
  openApi: {
    title: 'Access Router Runtime Example',
    version: '1.0.0',
    jsonPath: '/api/openapi.json',
  },
  express: {
    finalize(app) {
      app.get('/api', (_req, res) => {
        res.json({ ok: true, name: 'access-router-runtime-example' });
      });
    },
    errorHandler(error, _req, res, next) {
      void next;
      console.error(error);
      res.status(500).json({ success: false, message: 'Unexpected server error.' });
    },
  },
});
