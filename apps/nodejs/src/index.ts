import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import acl, { permissionsPlugin } from '@web-ts-toolkit/access-router';

const port = Number(process.env.PORT ?? 3000);
const modelName = 'SampleUser';

type Fruit = {
  id: string;
  name: string;
  color: string;
  stock: number;
  public: boolean;
};

type User = {
  name: string;
  role: string;
  email: string;
  public: boolean;
};

const fruitData: Fruit[] = [
  { id: 'apple', name: 'Apple', color: 'red', stock: 12, public: true },
  { id: 'banana', name: 'Banana', color: 'yellow', stock: 8, public: true },
  { id: 'dragonfruit', name: 'Dragon Fruit', color: 'pink', stock: 2, public: false },
];

acl.setGlobalOptions({
  requestPermissionField: '_permissions',
  globalPermissions(req) {
    req.requestId = String(req.headers['x-request-id'] ?? 'sample-request');
    return req.headers.user === 'admin' ? ['isAdmin'] : [];
  },
});

const fruitRouter = acl.createDataRouter('sample-fruit', {
  basePath: '/fruit',
  identifier: 'id',
  routeGuard: {
    list: true,
    read: true,
  },
  data: fruitData,
  permissionSchema: {
    id: true,
    name: true,
    color: true,
    stock: 'isAdmin',
    public: true,
  },
  decorate(item, permissions) {
    if (permissions.isAdmin && this.requestId) {
      return { ...item, requestId: this.requestId };
    }

    return item;
  },
  baseFilter: {
    list(permissions) {
      return permissions.isAdmin ? {} : { public: true };
    },
    read(permissions) {
      return permissions.isAdmin ? {} : { public: true };
    },
  },
});

const fruitServiceTypecheck = fruitRouter.getService(
  {} as express.Request as Parameters<typeof fruitRouter.getService>[0],
);
void fruitServiceTypecheck;

async function createUserRouter() {
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    email: String,
    public: Boolean,
  });

  schema.plugin(permissionsPlugin, { modelName });

  const UserModel = mongoose.model<User>(modelName, schema);

  const userRouter = acl.createRouter(UserModel, {
    basePath: '/users',
    identifier(id: string) {
      return { name: id };
    },
    routeGuard: {
      list: true,
      read: true,
      create: 'isAdmin',
      update: 'isAdmin',
    },
    permissionSchema: {
      name: { list: true, read: true, create: true, update: true },
      role: { list: 'isAdmin', read: 'isAdmin', create: 'isAdmin', update: 'isAdmin' },
      email: { list: 'isAdmin', read: 'isAdmin', create: 'isAdmin', update: 'isAdmin' },
      public: { list: true, read: true, create: true, update: true },
    },
    baseFilter(permissions) {
      return permissions.isAdmin ? {} : { public: true };
    },
    decorate(doc, permissions) {
      if (permissions.isAdmin && this.requestId) {
        return { ...doc, requestId: this.requestId };
      }

      return doc;
    },
    afterDelete(aa, bb) {},
  });

  // userRouter.afterDelete(async (contenxt) => {
  //   contenxt.
  // });

  const typedService = userRouter.getService({} as express.Request as Parameters<typeof userRouter.getService>[0]);
  void typedService;

  await mongoose.model(modelName).create([
    { name: 'admin', role: 'admin', email: 'admin@example.com', public: false },
    { name: 'alice', role: 'user', email: 'alice@example.com', public: true },
    { name: 'bob', role: 'user', email: 'bob@example.com', public: false },
  ]);

  return userRouter;
}

async function start() {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'access-router-sample' });

  const userRouter = await createUserRouter();
  const app = express();

  const shutdown = async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({
      name: 'nodejs-sample',
      description: 'TypeScript Express sample app for trying @web-ts-toolkit packages',
      endpoints: {
        fruitList: 'GET /fruit',
        fruitRead: 'GET /fruit/:id',
        fruitAdvancedList: 'POST /fruit/__query',
        fruitAdvancedRead: 'POST /fruit/__query/:id',
        userList: 'GET /users',
        userRead: 'GET /users/:id',
        userCreate: 'POST /users',
        userUpdate: 'PATCH /users/:id',
      },
      notes: [
        'Send the header user: admin to view admin-only fields and non-public rows.',
        'Guests only see public fruit and public users.',
        'The /users routes are backed by mongodb-memory-server and seeded on startup.',
      ],
    });
  });

  app.use(fruitRouter.routes);
  app.use(userRouter.routes);

  app.listen(port, () => {
    console.log(`access-router sample listening on http://localhost:${port}`);
    console.log('Try GET /fruit, GET /users, and GET /users/alice');
    console.log('Send header user: admin to see admin-only fields and private records.');
  });
}

void start();
