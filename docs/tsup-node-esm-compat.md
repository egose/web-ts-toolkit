# tsup Node ESM Compatibility

## Summary

Packages in this workspace that publish `.mjs` entrypoints for direct Node runtime use should not use `tsup` with `bundle: false` when their source uses bundler-style relative specifiers such as `export * from './plugins'` or `import './utils'`.

Node ESM does not resolve:

- directory imports such as `./plugins`
- extensionless relative imports such as `./create-handler`

Build tools such as `tsx` or an application bundler may hide this during development, but plain `node` will fail at runtime when it loads the published `.mjs` files from `node_modules`.

## Symptom

Typical runtime error:

```text
Error [ERR_UNSUPPORTED_DIR_IMPORT]: Directory import '.../node_modules/@web-ts-toolkit/moo/plugins' is not supported resolving ES modules imported from .../node_modules/@web-ts-toolkit/moo/index.mjs
```

## Root Cause

With `bundle: false`, `tsup` preserves internal ESM specifiers in the emitted files.

Example:

```ts
export * from './plugins';
```

becomes:

```js
export * from './plugins';
```

That output is not valid for direct execution under plain Node ESM.

## Workspace Fix

Prefer bundled package output for these packages:

```ts
export default defineConfig({
  format: ['cjs', 'esm'],
  bundle: true,
  splitting: false,
});
```

This lets `tsup` rewrite internal imports into Node-runnable output while preserving the public package API and `exports` map.

## When This Matters

This issue is most likely when all of the following are true:

1. A package publishes `.mjs` files.
2. Those `.mjs` files are loaded directly by plain `node`.
3. The source uses bundler-style relative specifiers.
4. `tsup` is configured with `bundle: false`.

## Notes

- This is a package build and publish issue, not a consumer app issue.
- A consumer app bundler may appear to "fix" it only because the dependency is bundled or resolved by a more permissive loader.
- If a bad package version is already published, changing the repo config is not enough; publish a new package version and update the consumer.
- This belongs in repo documentation, not an OpenCode skill. A skill would only make sense if we were teaching OpenCode a reusable workflow for package publishing decisions.

## Bundled Multi-Entry Caveat

When a package publishes both a root entrypoint and subpath entrypoints, bundling can duplicate class definitions across those outputs.

That means checks like these can become unreliable across entrypoints:

```ts
value instanceof Response;
value instanceof CSVResponse;
```

Example failure mode:

1. A consumer creates an object from a subpath entry such as `@web-ts-toolkit/express-response-handler/responses/success`.
2. The root bundle checks it against a class in `@web-ts-toolkit/express-response-handler`.
3. The classes are structurally identical but not the same runtime identity.
4. `instanceof` returns `false`.

For bundled multi-entry packages, prefer stable cross-entry checks such as:

- shared `Symbol.for(...)` brands
- explicit shape checks
- discriminant properties

Avoid relying on cross-entry `instanceof` unless the class is guaranteed to come from a single shared runtime module.
