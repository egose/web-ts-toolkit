import express from 'express';

const accessRouterModule = require('@web-ts-toolkit/access-router');
const acl = accessRouterModule.default ?? accessRouterModule;

const port = Number(process.env.PORT ?? 3000);

const fruitData = [
  { id: 'apple', name: 'Apple', color: 'red', stock: 12, public: true },
  { id: 'banana', name: 'Banana', color: 'yellow', stock: 8, public: true },
  { id: 'dragonfruit', name: 'Dragon Fruit', color: 'pink', stock: 2, public: false },
];

acl.setGlobalOptions({
  requestPermissionField: '_permissions',
  globalPermissions(req: express.Request) {
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
  baseFilter: {
    list(this: express.Request, permissions: { has: (key: string) => boolean }) {
      return permissions.has('isAdmin') ? {} : { public: true };
    },
    read(this: express.Request, permissions: { has: (key: string) => boolean }) {
      return permissions.has('isAdmin') ? {} : { public: true };
    },
  },
});

const app = express();

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    name: 'access-router-nodejs-sample',
    description: 'TypeScript Express sample app for @web-ts-toolkit/access-router',
    endpoints: {
      list: 'GET /fruit',
      read: 'GET /fruit/:id',
      advancedList: 'POST /fruit/__query',
      advancedRead: 'POST /fruit/__query/:id',
    },
    notes: [
      'Send the header user: admin to view admin-only fields and non-public rows.',
      'Guests only see public fruit and do not receive the stock field.',
    ],
  });
});

app.use(fruitRouter.routes);

app.listen(port, () => {
  console.log(`access-router sample listening on http://localhost:${port}`);
  console.log('Try GET /fruit and GET /fruit/apple');
  console.log('Send header user: admin to see admin-only fields.');
});
