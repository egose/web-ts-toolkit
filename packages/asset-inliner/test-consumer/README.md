# Installed-consumer verification

From the repository root (Node >=22.15 for the test-only `registerHooks` guard):

```sh
mkdir -p "$PWD/_tmp-asset-inliner"
export TMPDIR="$PWD/_tmp-asset-inliner"
pnpm --filter @web-ts-toolkit/asset-inliner build
pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/readme-examples.test.ts
```

`test/readme-examples.test.ts` owns the pack/install/cleanup lifecycle. It runs
`npm pack --dry-run --json`, packs the actual package, and installs that tarball
with its declared dependencies plus TypeScript and Node types in a fresh ignored
repo-local consumer. npm has its own manifest, lock, config files, and cache;
the workspace manifests/lock are compared before/after. The first install needs
registry access; the repo-local npm cache is reusable. No build occurs inside
Vitest; the package test script already builds first.

Each shipped README `<!-- runnable: ID -->` block is extracted verbatim into a
standalone `.mts` module. All seven IDs are required. Every block is compiled
under strict NodeNext (including library checking, exact optional properties,
and unchecked-index checking), executed unchanged, then executed again with
outcome assertions appended. Assertions never supply missing example bindings.
The disk block cleans its assets in `finally`; the test removes the consumer.

- `contracts.mts`: public options/resolver/policy/error types and negative type
  assertions; compile-only, since it deliberately contains invalid operations.
- `runtime.mjs`: named package-root ESM imports, real lazy content detection,
  policy defaults/caps, style/srcset/base/depth/patch regressions, and both file APIs.
- `resolution-guard.mjs`: preloaded before every runtime check, rejects every
  non-builtin resolution outside the consumer, including realpath/symlink escapes
  and transitive/dynamic imports. The runtime also checks the root entry's exact
  ownership and direct dependency versions/resolution from the installed package.

The harness checks every TypeScript source/library realpath is consumer-owned
and that `dist/index.d.mts` was loaded. Negative controls remove local `parse5`
and attempt to import the existing workspace entry; both must fail. Thus an
ancestor `node_modules`, workspace symlink, package self-reference, global type
root, or inherited Node preload cannot silently make a broken install pass.

No fixtures, tests, or internal helpers are added to the published export surface.
