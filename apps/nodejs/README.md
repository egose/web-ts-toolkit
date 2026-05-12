# access-router-nodejs-sample

Small TypeScript Express app for trying `@web-ts-toolkit/access-router` with both in-memory and Mongo-backed demos.

It includes:

- an in-memory `DataRouter` at `/fruit`
- a `ModelRouter` at `/users` backed by `mongodb-memory-server`

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
- `GET /users`
- `GET /users/:id`
- `POST /users`
- `PATCH /users/:id`

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

Guest user list:

```sh
curl http://localhost:3000/users
```

Admin user list:

```sh
curl -H 'user: admin' http://localhost:3000/users
```

Admin create:

```sh
curl \
  -H 'content-type: application/json' \
  -H 'user: admin' \
  -d '{"name":"carol","role":"user","email":"carol@example.com","public":true}' \
  http://localhost:3000/users
```

Admin update:

```sh
curl \
  -X PATCH \
  -H 'content-type: application/json' \
  -H 'user: admin' \
  -d '{"public":false}' \
  http://localhost:3000/users/alice
```

## Behavior

- guests only see `public: true` records
- guests do not see the `stock` field
- admins see all rows and the `stock` field
- guests only see public users
- admins can create and update users
- `/users` uses an ephemeral MongoDB instance seeded on startup
