# access-router-nodejs-sample

Small TypeScript Express app for trying `@web-ts-toolkit/access-router` without MongoDB.

It uses an in-memory `DataRouter`, so you can test route guards, field permissions, filtering, and advanced query routes immediately.

## Run

From the repo root:

```sh
pnpm install
pnpm --filter access-router-nodejs-sample build
pnpm --filter access-router-nodejs-sample start
```

The app starts on `http://localhost:3000` by default.

## Endpoints

- `GET /`
- `GET /fruit`
- `GET /fruit/:id`
- `POST /fruit/__query`
- `POST /fruit/__query/:id`

## Try it

Guest list:

```sh
curl http://localhost:3000/fruit
```

Admin list:

```sh
curl -H 'user: admin' http://localhost:3000/fruit
```

Guest read:

```sh
curl http://localhost:3000/fruit/apple
```

Advanced list query:

```sh
curl \
  -H 'content-type: application/json' \
  -H 'user: admin' \
  -d '{"filter":{"name":"Apple"},"select":["id","name","stock"]}' \
  http://localhost:3000/fruit/__query
```

## Behavior

- guests only see `public: true` records
- guests do not see the `stock` field
- admins see all rows and the `stock` field
