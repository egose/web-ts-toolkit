import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createRequire, isBuiltin, registerHooks, syncBuiltinESMExports } from 'node:module';
import { basename, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const consumer = realpathSync(process.cwd()) + sep;
const packageDir = realpathSync(join(consumer, 'node_modules/@web-ts-toolkit/email-service')) + sep;
const packageUrl = pathToFileURL(packageDir).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromPackage = context.parentURL?.startsWith(packageUrl);
    if (fromPackage && !isBuiltin(specifier) && !specifier.startsWith('.')) {
      const file = basename(fileURLToPath(context.parentURL));
      assert(
        (/^index\.m?js$/.test(file) && specifier === 'handlebars/dist/cjs/handlebars.js') ||
          (/^smtp\.m?js$/.test(file) && specifier.startsWith('nodemailer/')),
        `unexpected runtime dependency from ${file}: ${specifier}`,
      );
    }
    const result = nextResolve(specifier, context);
    if (isBuiltin(result.url)) return result;
    assert(result.url.startsWith('file:'), `unexpected module URL for ${specifier}`);
    const path = realpathSync(fileURLToPath(result.url));
    assert(path.startsWith(consumer), `module resolution escaped the installed consumer: ${specifier}`);
    if (fromPackage && specifier.startsWith('.'))
      assert(path.startsWith(packageDir), `relative resolution escaped the installed package: ${specifier}`);
    return result;
  },
});

let blockedCalls = 0;
const blocked = () => {
  blockedCalls++;
  assert.fail('installed examples must not contact providers, DNS, or other external services');
};
globalThis.fetch = blocked;
for (const name of ['node:http', 'node:https']) Object.assign(require(name), { request: blocked, get: blocked });
Object.assign(require('node:dns'), { Resolver: blocked, lookup: blocked, resolve: blocked, resolveSrv: blocked });
Object.assign(require('node:dns/promises'), {
  Resolver: blocked,
  lookup: blocked,
  resolve: blocked,
  resolveSrv: blocked,
});
require('node:tls').connect = blocked;
const net = require('node:net');
net.Server.prototype.listen = blocked;

// Only the Mongo README runner receives a URI, from its own loopback fixture.
// Guard the actual socket call so alternate net.connect overloads cannot dial.
const mongo = process.env.EMAIL_SERVICE_README_MONGO_URI
  ? new URL(process.env.EMAIL_SERVICE_README_MONGO_URI)
  : undefined;
if (mongo) {
  assert.equal(mongo.protocol, 'mongodb:');
  assert.equal(mongo.hostname, '127.0.0.1');
  assert(Number(mongo.port) > 0);
}
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (mongo && options?.host === mongo.hostname && Number(options.port) === Number(mongo.port) && !options.path)
    return socketConnect.apply(this, args);
  return blocked();
};
syncBuiltinESMExports();
process.on('exit', () => assert.equal(blockedCalls, 0, 'unexpected network call, even if caught by the package'));
