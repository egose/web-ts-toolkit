// CommonJS require semantics, rather than an ESM interop shim, are the test input.
const root = require('@web-ts-toolkit/access-router'); // eslint-disable-line @typescript-eslint/no-require-imports
const advanced = require('@web-ts-toolkit/access-router/advanced'); // eslint-disable-line @typescript-eslint/no-require-imports
const processors = require('@web-ts-toolkit/access-router/processors'); // eslint-disable-line @typescript-eslint/no-require-imports
const check = require('./arts04-export-assertions.cjs'); // eslint-disable-line @typescript-eslint/no-require-imports

check(root, advanced, processors);
process.stdout.write('ARTS04-EXPORTS-PASS\n');
