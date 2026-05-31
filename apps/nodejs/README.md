# Org Access Example Backend

Express + MongoDB-memory example for a multi-tenant organization and role hierarchy app built on `@web-ts-toolkit/access-router`.

## Run

```bash
pnpm install
pnpm --filter org-access-nodejs-example dev
```

The API starts on `http://localhost:8000` and uses `mongodb-memory-server`, so no local MongoDB install is required.

Demo users seeded on startup:

- `owner@example.com`
- `ada@example.com`
- `maya@example.com`
- `sam@example.com`

The seed includes two organizations and a small reporting hierarchy. `owner@example.com`, `ada@example.com`, and `sam@example.com` already belong to at least one organization when they log in.

Key routes:

- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET|POST|PATCH /api/organizations`
- `GET|POST|PATCH /api/memberships`
- `GET /api/role-templates`
- `POST /api/root`
