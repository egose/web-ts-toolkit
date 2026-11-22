import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createRequire, isBuiltin, registerHooks, syncBuiltinESMExports } from 'node:module';
import { basename, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const consumer = realpathSync(process.cwd()) + sep;
const packageDir = realpathSync(join(consumer, 'node_modules/@web-ts-toolkit/email-service')) + sep;
const packageUrl = pathToFileURL(packageDir).href;
const externals = {
  index: (specifier) => specifier === 'handlebars/dist/cjs/handlebars.js',
  smtp: (specifier) => specifier.startsWith('nodemailer/'),
  'attachments-s3': (specifier) => specifier === '@aws-sdk/client-s3',
  'attachments-azure': (specifier) => specifier === '@azure/storage-blob',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromPackage = context.parentURL?.startsWith(packageUrl);
    if (fromPackage && !isBuiltin(specifier)) {
      const file = basename(fileURLToPath(context.parentURL));
      assert(
        externals[file.replace(/\.m?js$/, '')]?.(specifier),
        `unexpected runtime dependency from ${file}: ${specifier}`,
      );
    }
    const result = nextResolve(specifier, context);
    if (isBuiltin(result.url)) return result;
    assert(result.url.startsWith('file:'), `unexpected module URL for ${specifier}`);
    const path = realpathSync(fileURLToPath(result.url));
    assert(path.startsWith(consumer), `module resolution escaped the installed consumer: ${specifier}`);
    return result;
  },
});

let blockedCalls = 0;
const blocked = () => {
  blockedCalls++;
  assert.fail('installed examples must not contact providers, DNS, or other external services');
};
globalThis.fetch = blocked;
const http = require('node:http');
const request = http.request;
const s3Enabled = process.env.EMAIL_SERVICE_README_S3_LOOPBACK === '1';
const s3Ports = new Set();
const s3Socket = (host, port) => host === '127.0.0.1' && s3Ports.has(Number(port));
http.request = function (options, ...rest) {
  if (options?.protocol === 'http:' && s3Socket(options.hostname, options.port) && options.path?.startsWith('/')) {
    return request.call(this, options, ...rest);
  }
  return blocked();
};
http.get = blocked;
Object.assign(require('node:https'), { request: blocked, get: blocked });
const loopback = '127.0.0.1';
let bindingS3Fixture = false;
Object.assign(require('node:dns'), {
  Resolver: blocked,
  lookup(host, options, callback) {
    // Node's listen() calls dns.lookup even for a numeric bind address. Resolve only that
    // literal for the duration of the guarded listen call, without performing an actual lookup.
    if (bindingS3Fixture && host === loopback && options?.all === true && typeof callback === 'function') {
      process.nextTick(callback, null, [{ address: loopback, family: 4 }]);
      return;
    }
    return blocked();
  },
  resolve: blocked,
  resolveSrv: blocked,
});
Object.assign(require('node:dns/promises'), {
  Resolver: blocked,
  lookup: blocked,
  resolve: blocked,
  resolveSrv: blocked,
});
require('node:tls').connect = blocked;
const net = require('node:net');
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (options, ...rest) {
  if (
    !s3Enabled ||
    !(this instanceof http.Server) ||
    options?.host !== loopback ||
    options.port !== 0 ||
    options.exclusive !== true
  )
    return blocked();
  this.once('listening', () => {
    const { address, port } = this.address();
    assert.equal(address, loopback);
    assert(port > 0);
    s3Ports.add(port);
    this.once('close', () => s3Ports.delete(port));
  });
  bindingS3Fixture = true;
  try {
    return listen.call(this, options, ...rest);
  } finally {
    bindingS3Fixture = false;
  }
};

// Only the Mongo README runner receives a URI, from its own loopback fixture.
// Guard the actual socket call so alternate net.connect overloads cannot dial.
const mongo = process.env.EMAIL_SERVICE_README_MONGO_URI
  ? new URL(process.env.EMAIL_SERVICE_README_MONGO_URI)
  : undefined;
if (mongo) {
  assert.equal(mongo.protocol, 'mongodb:');
  assert.equal(mongo.hostname, loopback);
  assert(Number(mongo.port) > 0);
}
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (
    !options?.path &&
    (s3Socket(options?.host, options?.port) ||
      (mongo && options?.host === mongo.hostname && Number(options.port) === Number(mongo.port)))
  )
    return socketConnect.apply(this, args);
  return blocked();
};
syncBuiltinESMExports();
process.on('exit', () => assert.equal(blockedCalls, 0, 'unexpected network call, even if caught by the package'));
