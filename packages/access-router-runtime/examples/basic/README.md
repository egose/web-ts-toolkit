# Basic Example

Starter config for `@web-ts-toolkit/access-router-runtime`.

Files:

- `access-router.config.ts` defines MongoDB, model/data routers, root router, OpenAPI, and Express hooks.

Run it locally from a consumer app or this workspace:

```sh
wtt-access-router-runtime dev ./examples/basic/access-router.config.ts --env .env --port 3000
```

Required environment:

```sh
MONGODB_URI=mongodb://127.0.0.1:27017/access-router-runtime-example
```
