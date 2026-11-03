# Node 24 CI and peer-dependency audit

Point-in-time review on 2026-11-02 of all 23 `packages/*/package.json` files,
including optional peers: 11 distinct external peers and two internal workspace
peers. This is a cross-package review, stored under `access-router` as the primary
minimum-runtime smoke-test package. It is not a task backlog or a general dependency
upgrade proposal.

## Decision

Use Node **24.0.0** for the three minimum-runtime CI jobs, matching the existing
package `engines.node: ">=24"` declarations. Keep the repository's newer Node pin
for ordinary build/install tooling and the existing React floating canary.

No external peer has a stable, non-deprecated release whose declared Node engine
minimum is 24 or higher. No peer-range bump is justified by that criterion. A peer
supporting older Node versions does not weaken this repository's Node 24 floor.
The two `workspace:*` peers already resolve to local packages declaring `>=24`;
their release-time version rewriting remains unchanged.

## Registry observations

Source: public npm registry manifests from `https://registry.npmjs.org/`.
All listed engine ranges are upstream metadata, not independently certified
runtime support. `Not declared` is not a guarantee that all runtimes work.

| External peer | Current peer range(s) | Lowest admitted stable version: Node engine | Latest stable version: Node engine |
| --- | --- | --- | --- |
| `express` | `>=5.0.0`, `^5.0.0` | `5.0.0`: `>=18` | `5.3.0`: `>=18` |
| `mongoose` | `>=8.0.0`, `>=8.0.0 <10` | `8.0.0`: `>=16.20.1` | `9.11.4`: `>=20.19.0` |
| `reflect-metadata` | `^0.1.13 || ^0.2.0` | `0.1.13`: not declared | `0.2.2`: not declared |
| `react` | `^18.0.0 || ^19.0.0` | `18.0.0`: `>=0.10.0` | `19.3.1`: `>=0.10.0` |
| `@types/express` | `^5.0.0` | `5.0.0`: not declared | `5.0.6`: not declared |
| `rxdb` | `>=17.4.0 <18` | `17.4.0`: `>=18` | `17.6.0`: `>=20` |
| `rxdb-premium` (optional) | `>=17.4.0 <18` | `17.4.0`: not declared | `17.6.0`: not declared |
| `rxjs` | `>=7.8.0 <8` | `7.8.0`: not declared | `7.8.2`: not declared |
| `sqlite3` (optional) | `>=5 <6` | `5.0.0`: not declared | `6.0.1`: `>=20.17.0` |
| `@egose/keycloak-fluent` (optional) | `>=0.12.1 <0.15.0` | `0.12.1`: `>=20` | `0.14.0`: `>=20` |
| `pdfjs-dist` | `~6.2.108` | `6.2.108`: `>=22.13.0 || >=24` | `6.5.438`: `>=22.13.0 || >=24` |

Every declared engine at the existing peer minima admits Node 24.0.0. Historical
SQLite 2.x manifests with invalid semver `&&` engine syntax were excluded from the
automated engine-floor scan; they are below the admitted SQLite 5.x range and
explicitly require obsolete Node versions, not Node 24.

Latest does not imply admitted: `sqlite3@6.0.1` is outside the existing `<6` bound,
and `pdfjs-dist@6.5.438` is outside `~6.2.108`. Neither changes the Node floor to 24,
so this review does not expand their integration-compatibility promises. Other
dependency/security/API-driven upgrades require their own compatibility review.

Internal peers:

- `access-router-deco` -> `@web-ts-toolkit/access-router`: `workspace:*`, Node `>=24`.
- `access-router-react` -> `@web-ts-toolkit/access-router-client`: `workspace:*`, Node `>=24`.

## Changes and verification

Updated `.github/workflows/test.yml` and
`.github/workflows/message-service-compatibility.yml`, their matching reproduction
instructions, and packed-package engine assertions. Minimum jobs retain the
existing minimum/current framework-peer coverage rather than replacing it with
latest-only coverage.

Local verification:

| Check | Result |
| --- | --- |
| Serial build of all 23 library packages, repository Node 26.12.1 | Passed |
| `pnpm lint` | Passed |
| Workflow YAML parsing, all three minimum-job pins, all 23 package engine floors | Passed |
| Access-router minimum Express 5.0.0 / Mongoose 8.0.0 packed ESM/CJS and type consumers, test runner Node 24.0.0 | 1 passed |
| React supported lane, installed consumers Node 24.0.0 | 6 passed |
| React floating lane, installed consumers Node 24.0.0 | 6 passed |
| Message-service minimum/current peers, installed consumers Node 24.0.0 | 2 passed |
| Package-scoped packed-metadata tests, test runner Node 24.0.0 | 11 packages passed |
| Starter packed CLI/scaffold consumer, repository Node 26.12.1 | 1 passed |
| Express-runtime deployment documentation/bundle tests, repository Node 26.12.1 | 4 passed |

An earlier repository-root Vitest command discovered historical ignored fixture
copies. Its results are not accepted verification; the metadata rerun used each
current package's own working directory. No historical task documents were updated.

This is a curated summary, not a self-contained reproduction bundle. Raw registry
packuments, temporary probes/logs, dependency trees, databases, generated consumers,
tarballs, and Node/browser binaries are omitted. Registry versions can change.
The full repository/browser suite and remote GitHub Actions were not run. Native
SQLite and licensed Premium runtime compatibility were not newly certified. Root,
website, generated-template, and previously undeclared example-app engine policies
are outside this CI/peer-range follow-up and remain unchanged.
