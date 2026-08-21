/**
 * Consumer CJS entry exercised by ARR-H08 packed-tarball install test.
 *
 * `require()` resolves `@web-ts-toolkit/access-router-react` from a fresh
 * `node_modules` containing the produced npm tarball (no workspace path
 * mapping). The script exercises the published CJS entry through a real hook
 * render using the installed React peer deps plus a minimal model-service
 * stub, so bundling/externalization mistakes fail against the shipped
 * artifact rather than in-repo source imports.
 */
const { runHookSmoke } = require('./hooks-smoke-core.cjs');

runHookSmoke({
  mode: 'CJS',
  packageEntryPath: require.resolve('@web-ts-toolkit/access-router-react'),
  accessRouterReact: require('@web-ts-toolkit/access-router-react'),
  accessRouterClient: require('@web-ts-toolkit/access-router-client'),
  react: require('react'),
  testingLibrary: require('@testing-library/react'),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
