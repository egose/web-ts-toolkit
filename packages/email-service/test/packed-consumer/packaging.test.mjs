import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { acquireTestScratch, packageRoot, repoRoot } from '../scratch.mjs';
import { writeReadmeExamples } from './readme.mjs';

const packageName = '@web-ts-toolkit/email-service';
const entries = {
  '.': 'index',
  './smtp': 'smtp',
  './sendgrid': 'sendgrid',
  './mongoose': 'mongoose',
  './attachments': 'attachments',
  './attachments/mongoose': 'attachments-mongoose',
  './attachments/s3': 'attachments-s3',
  './attachments/azure': 'attachments-azure',
};
const aws = '@aws-sdk/client-s3';
const azure = '@azure/storage-blob';
const peerFloors = { mongoose: '9.12.2', nodemailer: '10.6.0', [aws]: '3.1167.0', [azure]: '12.34.0' };
const declarationPeers = [aws, azure, 'mongoose'];
const peerTypeEntries = {
  [aws]: ['./attachments/s3'],
  [azure]: ['./attachments/azure'],
  mongoose: ['./mongoose', './attachments/mongoose'],
};
const devOnly = ['azurite', '@azure/identity'];
const profiles = {
  neither: {},
  'nodemailer-only': { nodemailer: peerFloors.nodemailer },
  'mongoose-only': { mongoose: peerFloors.mongoose },
  's3-only': { [aws]: peerFloors[aws] },
  'azure-only': { [azure]: peerFloors[azure] },
  all: peerFloors,
};
const rootRequire = createRequire(join(repoRoot, 'package.json'));
const publisherRequire = createRequire(rootRequire.resolve('@repo-toolkit/publish-packages'));
const publisherPath = publisherRequire.resolve('@repo-toolkit/publish-package');
const { preparePackageArtifacts } = publisherRequire('@repo-toolkit/publish-package');
const publisher = readJson(join(dirname(publisherPath), 'package.json'));
const tsc = rootRequire.resolve('typescript/bin/tsc');
const typescript = rootRequire('typescript');
const nodeTypes = rootRequire('@types/node/package.json').version;
const consumerNode = process.env.EMAIL_SERVICE_CONSUMER_NODE || process.execPath;
const execFileAsync = promisify(execFile);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function run(command, args, cwd, env = process.env) {
  try {
    return execFileSync(command, args, {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${error.stdout ?? ''}${error.stderr ?? ''}`, {
      cause: error,
    });
  }
}

async function stageRelease(scratch, version, t) {
  // The default prepareOnly path writes package.json, LICENSE and README into
  // cwd/dist. Copy only this package's inputs; never point it at build outputs.
  const rootDir = join(scratch, 'release-source');
  const cwd = join(rootDir, 'packages/email-service');
  mkdirSync(cwd, { recursive: true });
  for (const name of ['package.json', 'LICENSE']) cpSync(join(repoRoot, name), join(rootDir, name));
  for (const name of ['package.json', 'README.md', 'dist'])
    cpSync(join(packageRoot, name), join(cwd, name), { recursive: true });

  const unexpected = () => assert.fail('preparePackageArtifacts must not spawn a process');
  // The helper itself prints an absolute cwd even in prepare-only mode.
  const log = t.mock.method(console, 'log', () => {});
  try {
    const stages = await preparePackageArtifacts({
      rootDir,
      cwd,
      version,
      skipBuild: true,
      internalPackageNames: new Set([packageName]),
      runner: { run: unexpected, runShell: unexpected, capture: unexpected },
    });
    assert.deepEqual(stages, [{ id: 'default', packageName, version, stageDir: join(cwd, 'dist') }]);
    return stages[0].stageDir;
  } finally {
    log.mock.restore();
  }
}

function packFrom(cwd, destination, env) {
  const [pack, ...extra] = JSON.parse(
    run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], cwd, env),
  );
  assert.deepEqual(extra, []);
  assert.equal(pack.name, packageName);
  assert.equal(pack.filename, basename(pack.filename));
  return {
    path: join(destination, pack.filename),
    version: pack.version,
    files: new Set(pack.files.map(({ path }) => path)),
  };
}

function checkManifest(packageDir, pack, release, output, version) {
  const manifest = readJson(join(packageDir, 'package.json'));
  assert.equal(manifest.name, packageName);
  assert.equal(manifest.version, version);
  assert.equal(pack.version, version);
  assert.equal(manifest.type, 'commonjs');
  assert.equal(manifest.sideEffects, false);
  assert(manifest.description.includes('email preparation'));
  assert(manifest.keywords.includes('email'));
  assert.equal(manifest.engines.node, '>=24');
  assert.deepEqual(Object.keys(manifest.exports).sort(), Object.keys(entries).sort());
  assert.deepEqual(manifest.peerDependencies, {
    [aws]: '>=3.1167.0 <4',
    [azure]: '>=12.34.0 <13',
    mongoose: '>=9.12.2 <10',
    nodemailer: '>=10.6.0 <11',
  });
  assert.deepEqual(
    manifest.peerDependenciesMeta,
    Object.fromEntries(Object.keys(peerFloors).map((peer) => [peer, { optional: true }])),
  );
  assert.deepEqual(manifest.dependencies, { handlebars: '~4.7.10' });
  assert.equal(manifest.optionalDependencies, undefined);

  const rootMeta = readJson(join(repoRoot, 'package.json'));
  if (release) {
    assert.doesNotMatch(JSON.stringify(manifest), /PLACEHOLDER|workspace:/);
    assert.deepEqual(manifest.files, ['**/*', '!**/*.map']);
    assert.equal(manifest.license, rootMeta.license);
    assert.deepEqual(manifest.repository, { ...rootMeta.repository, directory: 'packages/email-service' });
    assert.equal(manifest.author, rootMeta.author);
    assert.deepEqual(manifest.bugs, rootMeta.bugs);
    for (const excluded of ['scripts', 'devDependencies', 'private', 'packageManager'])
      assert(!Object.hasOwn(manifest, excluded), `${excluded} must not ship in the release manifest`);
    assert.deepEqual(readFileSync(join(packageDir, 'LICENSE')), readFileSync(join(repoRoot, 'LICENSE')));
  } else {
    assert.deepEqual(manifest.files, ['README.md', 'dist']);
    assert.equal(manifest.license, 'PLACEHOLDER');
    assert.equal(manifest.repository, 'PLACEHOLDER');
    for (const [peer, floor] of Object.entries(peerFloors)) assert.equal(manifest.devDependencies[peer], floor);
    assert.equal(manifest.devDependencies.azurite, '3.38.0');
  }

  const expectedFiles = new Set(['package.json', 'README.md', ...(release ? ['LICENSE'] : [])]);
  const main = release ? './' : output;
  assert.equal(manifest.main, `${main}index.js`);
  assert.equal(manifest.module, `${main}index.mjs`);
  assert.equal(manifest.types, `${main}index.d.ts`);
  for (const [specifier, name] of Object.entries(entries)) {
    const stem = `./${output}${name}`;
    const entry = manifest.exports[specifier];
    assert.equal(Object.keys(entry)[0], 'types', `${specifier} must match the type conditions first`);
    assert.deepEqual(entry, {
      types: { import: `${stem}.d.mts`, require: `${stem}.d.ts`, default: `${stem}.d.ts` },
      import: `${stem}.mjs`,
      require: `${stem}.js`,
      default: `${stem}.js`,
    });
    for (const target of [entry.import, entry.require, entry.types.import, entry.types.require])
      expectedFiles.add(target.slice(2));
  }
  for (const path of expectedFiles) {
    assert(pack.files.has(path), `tarball missing ${path}; run build:package before test:packed-consumer`);
    assert(readFileSync(join(packageDir, path)).length > 0, `empty installed file: ${path}`);
  }
  for (const path of pack.files) {
    if (expectedFiles.has(path)) continue;
    assert(
      path.startsWith(output) && /^[\w-]+\.d\.(?:mts|ts)$/.test(path.slice(output.length)),
      `unexpected file: ${path}`,
    );
  }
}

function checkJSDoc(packageDir, packedFiles) {
  const expected = {
    EmailError: /class identity[\s\S]*even within one format/,
    defineLocalTemplate: /inferred from the parsers/,
    defineSendGridTemplate: /pin a remote template version/,
    createEmailTemplateRegistry: /isolated registry/,
    EmailCommand: /scoped idempotency/,
    TemplateCommand: /widened `TemplateMap` allows either provider/,
    'TemplateDefinition.parseInput': /declared input shape[\s\S]*`command.input`[\s\S]*`prepare`/,
    scheduleAt: /Earliest eligible time[\s\S]*precede the snapshot expiry/,
    'PreparedFields.expiresAt': /24 hours from preparation[\s\S]*30 days from preparation[\s\S]*Frozen/,
    RetryPolicy: /defaults to 3 claims[\s\S]*quota deferrals[\s\S]*at or after expiry/,
    EmailRateLimiter: /deferral consumes a claim without calling `submit`/,
    PreparedEmailCommand: /sensitive outbox value/,
    SmtpCapacity: /canonical lowercase UUIDv4[\s\S]*51 to 1,000[\s\S]*DTO's `version: 1`/,
    'TemplateRegistryOptions.smtpCapacity': /same tuple/,
    'EmailServiceOptions.smtpCapacity': /match the registry and store/,
    EmailRelay: /does not need a template registry/,
    'EmailRelayOptions.smtpCapacity': /exact store binding explicitly/,
    'EmailWorkerOptions.smtpCapacity': /Only live SMTP profiles/,
    'EmailWorkerOptions.providers': /at least one configured profile; an empty array throws `invalid_config`/,
    EmailBatchAdmission: /no worker or delivery methods/,
    'EmailBatchAdmissionOptions.smtpCapacity': /exact tuple explicitly/,
    'EmailBatchServiceOptions.smtpCapacity': /exact tuple explicitly/,
    'EmailAdminOptions.smtpCapacity': /stays redacted/,
    'StoreCall.smtpCapacity': /before every primitive/,
    'MemoryEmailStoreOptions.smtpCapacity': /different namespace/,
    'SmtpProviderOptions.smtpCapacity': /Omit for the V1 cap of 50/,
    'MongooseEmailStoreOptions.smtpCapacity': /immutable binding/,
    createEmailService: /Scope-bound admission only/,
    createEmailRelay: /without a registry[\s\S]*original scope and binding/,
    enqueuePrepared: /does not join a host transaction/i,
    createEmailWorker:
      /durable handoff acknowledgement[\s\S]*empty provider array throws `invalid_config`[\s\S]*createEmailBatchAdmission/,
    createEmailBatchAdmission: /without configuring a worker[\s\S]*same batch\/item IDs/,
    enqueueBatch: /1–100 items[\s\S]*same batch\/item IDs/,
    createEmailBatchService: /serves the whole scope/,
    createEmailAdmin: /redacted history/,
    getJob: /latest authoritative outcome[\s\S]*verify a current hold/,
    listActivities: /not an inventory of open holds/,
    resolveUnknown: /exact open unknown attempt[\s\S]*`resolutions`/,
    ready: /V1 memory allows skipping readiness for legacy callers/,
    createMemoryEmailStore: /lost on restart/,
    ProviderResult: /nonempty[\s\S]*all-accepted tuple[\s\S]*`createSmtpAcceptanceResult`/,
    createSmtpAcceptanceResult: /final DATA acknowledgement[\s\S]*preserving input order[\s\S]*`invalid_command`/,
    createSmtpProvider: /not inbox delivery/,
    createSendGridProvider: /with no SDK or peer/,
    createMongooseEmailStore: /caller-owned Mongoose/,
    checkManagedAttachmentRetention: /actual snapshot expiry[\s\S]*No storage access/,
    PutManagedAttachmentInput: /same revision and deadline/,
    ManagedAttachmentReceipt: /do not persist or transfer the receipt/,
    'ManagedAttachmentStore.assertReceipt': /actual frozen expiry plus the 24-hour grace/,
    'ManagedAttachmentPreparationOptions.stores': /Exhaustive trusted bindings/,
    createMongooseAttachmentStore: /caller-owned Mongoose[\s\S]*again after a reconnect/,
    'MongooseAttachmentStore.ready': /Validate the existing attachment backing/,
    'S3AttachmentStoreOptions.retention': /`expiration-header` \(default\)[\s\S]*`bucket-policy`/,
    createS3AttachmentClient:
      /dedicated, caller-owned Node `S3Client`[\s\S]*`maxAttempts: 1`[\s\S]*`followRegionRedirects: false`/,
    createS3AttachmentStore: /`createS3AttachmentClient`[\s\S]*same ESM or CommonJS entry instance/,
    createAzureAttachmentContainerClient: /dedicated, caller-owned Node `ContainerClient`[\s\S]*fresh pipeline/,
    createAzureAttachmentStore: /audit the effective Azure account settings[\s\S]*does[\s\S]*not verify account policy/,
  };
  for (const suffix of ['.d.mts', '.d.ts']) {
    const docs = new Map();
    for (const path of packedFiles) {
      if (!path.endsWith(suffix)) continue;
      const source = typescript.createSourceFile(
        path,
        readFileSync(join(packageDir, path), 'utf8'),
        typescript.ScriptTarget.Latest,
        true,
      );
      function visit(node) {
        if (node.name && typescript.isIdentifier(node.name)) {
          const comments = typescript.getJSDocCommentsAndTags(node).filter(typescript.isJSDoc);
          let owner = '';
          if (
            (typescript.isPropertySignature(node) || typescript.isMethodSignature(node)) &&
            typescript.isTypeLiteralNode(node.parent)
          ) {
            let parent = node.parent.parent;
            while (typescript.isIntersectionTypeNode(parent) || typescript.isTypeReferenceNode(parent))
              parent = parent.parent;
            if (typescript.isTypeAliasDeclaration(parent)) owner = `${parent.name.text}.`;
          }
          if (comments.length)
            docs.set(owner + node.name.text, comments.map((comment) => comment.getText(source)).join('\n'));
        }
        typescript.forEachChild(node, visit);
      }
      visit(source);
    }
    for (const [name, description] of Object.entries(expected)) {
      assert.match(docs.get(name) ?? '', description, `missing public JSDoc for ${name} in ${suffix}`);
    }
  }
}

function checkInstalledPeers(consumer, packageDir, output, peers) {
  const appRequire = createRequire(join(consumer, 'package.json'));
  const packageRequire = createRequire(join(packageDir, output, 'index.js'));
  const storeDirs = readdirSync(join(consumer, 'node_modules', '.pnpm'));
  const versions = {};
  for (const name of [...Object.keys(peerFloors), ...devOnly]) {
    if (Object.hasOwn(peers, name)) {
      const peerFile = appRequire.resolve(`${name}/package.json`);
      assert(peerFile.startsWith(join(consumer, 'node_modules') + sep), `non-isolated ${name}`);
      assert.equal(packageRequire.resolve(`${name}/package.json`), peerFile);
      versions[name] = readJson(peerFile).version;
      assert.equal(versions[name], peers[name]);
      if (name === 'mongoose') {
        const driver = createRequire(peerFile).resolve('mongodb/package.json');
        assert(driver.startsWith(join(consumer, 'node_modules') + sep), 'non-isolated MongoDB driver');
        versions.mongodb = readJson(driver).version;
      }
    } else {
      assert.throws(() => appRequire.resolve(name), { code: 'MODULE_NOT_FOUND' });
      // pnpm can link an automatically installed peer only to the package, not the app.
      assert.throws(() => packageRequire.resolve(name), { code: 'MODULE_NOT_FOUND' });
      assert(
        !storeDirs.some((directory) => directory.startsWith(`${name.replace('/', '+')}@`)),
        `unexpected package in isolated dependency closure: ${name}`,
      );
    }
  }
  if (declarationPeers.some((name) => peers[name])) {
    versions['@types/node'] = appRequire('@types/node/package.json').version;
    assert.equal(versions['@types/node'], nodeTypes);
  }
  const handlebarsFile = packageRequire.resolve('handlebars/package.json');
  assert(handlebarsFile.startsWith(join(consumer, 'node_modules') + sep), 'non-isolated Handlebars');
  versions.handlebars = readJson(handlebarsFile).version;
  return versions;
}

function tscOptions(consumer, withNodeTypes) {
  return [
    '--ignoreConfig',
    '--strict',
    '--skipLibCheck',
    'false',
    '--exactOptionalPropertyTypes',
    '--noUncheckedIndexedAccess',
    '--verbatimModuleSyntax',
    '--noUncheckedSideEffectImports',
    '--target',
    'ES2023',
    '--lib',
    'ES2023,DOM',
    // No checkout ambient types. AbortSignal can come from the standard DOM declarations.
    '--typeRoots',
    join(consumer, 'node_modules/@types'),
    ...(withNodeTypes ? ['--types', 'node'] : []),
    '--pretty',
    'false',
  ];
}

function checkDeclarations(consumer, env, packageDir, packedFiles, output, peers, readme, profile) {
  const withNodeTypes = declarationPeers.some((peer) => peers[peer]);
  const options = tscOptions(consumer, withNodeTypes);
  const tsLib = realpathSync(join(dirname(tsc), '../lib'));
  for (const [fixture, mode, module, extension] of [
    ['esm.mts', 'NodeNext', 'NodeNext', 'd.mts'],
    ['cjs.cts', 'NodeNext', 'NodeNext', 'd.ts'],
    ['esm.mts', 'Bundler', 'ESNext', 'd.mts'],
  ]) {
    const esm = fixture === 'esm.mts';
    const fixtures = [fixture, ...(esm ? readme.esm : readme.cjs)];
    if (peers.mongoose) fixtures.push(`mongoose-${fixture}`);
    if (peers.nodemailer) fixtures.push(`smtp-${fixture}`);
    if (peers[aws]) fixtures.push(`s3-${fixture}`);
    const emit = mode === 'NodeNext' && (profile === 'all' || profile === 'neither');
    const args = [
      '--moduleResolution',
      mode,
      '--module',
      module,
      ...(emit ? ['--outDir', 'readme-build'] : ['--noEmit']),
    ];
    const loaded = new Set(
      run(consumerNode, [tsc, ...options, ...args, '--listFiles', ...fixtures], consumer, env)
        .trim()
        .split(/\r?\n/)
        .map((path) => realpathSync(resolve(consumer, path))),
    );
    const label = `${mode} ${fixture}`;
    const packageFiles = [...loaded].filter((path) => path.startsWith(packageDir + sep));
    for (const path of loaded) {
      const library = dirname(path) === tsLib && /^lib\.[\w.-]+\.d\.ts$/.test(basename(path));
      assert(library || path.startsWith(consumer + sep), `${label}: declaration escaped consumer: ${path}`);
      if (!withNodeTypes && path.startsWith(join(consumer, 'node_modules') + sep))
        assert(path.startsWith(packageDir + sep), `${label}: unexpected external declaration: ${path}`);
      assert(!path.includes(`${sep}node_modules${sep}nodemailer${sep}`), `${label}: Nodemailer leaked into types`);
    }
    const expectedEntries = [
      '.',
      './smtp',
      './sendgrid',
      './attachments',
      ...declarationPeers.filter((peer) => peers[peer]).flatMap((peer) => peerTypeEntries[peer]),
    ];
    for (const [specifier, name] of Object.entries(entries)) {
      assert.equal(
        loaded.has(join(packageDir, output, `${name}.${extension}`)),
        expectedEntries.includes(specifier),
        `${label}: unexpected declaration resolution for ${specifier}`,
      );
    }
    for (const path of packageFiles) assert(path.endsWith(`.${extension}`), `${label}: mismatched condition: ${path}`);
    for (const peer of declarationPeers) {
      const inPeer = `${sep}node_modules${sep}${peer.replace('/', sep)}${sep}`;
      assert.equal(
        [...loaded].some((path) => path.includes(inPeer)),
        Boolean(peers[peer]),
        `${label}: unexpected ${peer} declarations`,
      );
    }
    if (profile === 'all') {
      assert.deepEqual(
        packageFiles.map((path) => relative(packageDir, path)).sort(),
        [...packedFiles].filter((path) => path.endsWith(`.${extension}`)).sort(),
        `${label}: every shipped declaration must be reachable`,
      );
    }
  }
  if (profile === 'all') {
    // Deliberately mixes import and require. Compile separately from the
    // single-condition declaration inventories above.
    run(
      consumerNode,
      [tsc, ...options, '--module', 'NodeNext', '--outDir', 'readme-build', 'capacity-mixed.mts'],
      consumer,
      env,
    );
  }
}

function checkMissingPeerTypes(consumer, env, peers) {
  const missing = declarationPeers.filter((peer) => !peers[peer]);
  if (!missing.length) return;
  const source = missing
    .flatMap((peer) => peerTypeEntries[peer])
    .map((specifier) => `import type {} from '${packageName}/${specifier.slice(2)}';\n`)
    .join('');
  const files = ['missing-peers.mts', 'missing-peers.cts'];
  for (const file of files) writeFileSync(join(consumer, file), source);
  assert.throws(
    () =>
      run(
        consumerNode,
        [tsc, ...tscOptions(consumer, false), '--module', 'NodeNext', '--noEmit', ...files],
        consumer,
        env,
      ),
    (failure) => {
      const diagnostics = [
        ...failure.message.matchAll(
          /(?:\/|^)([\w-]+\.d\.m?ts)\(\d+,\d+\): error TS2307: Cannot find module '([^']+)'/gm,
        ),
      ];
      assert.deepEqual(
        diagnostics.map(([, entry, peer]) => `${entry}: ${peer}`).sort(),
        missing
          .flatMap((peer) =>
            peerTypeEntries[peer].flatMap((specifier) =>
              ['mts', 'ts'].map((extension) => `${entries[specifier]}.d.${extension}: ${peer}`),
            ),
          )
          .sort(),
      );
      assert.equal(
        [...failure.message.matchAll(/error TS\d+:/g)].length,
        diagnostics.length,
        'wrong missing-peer diagnostic',
      );
      return true;
    },
  );
}

function runRuntime(consumer, env, script, ...args) {
  return run(consumerNode, ['--import', './runtime-guard.mjs', script, ...args], consumer, env).trim();
}

function checkQuickstart(consumer, env) {
  const output = runRuntime(consumer, env, 'readme-build/readme-quickstart.mjs');
  const { admission, submitted, job } = JSON.parse(output);
  assert.equal(admission, 'enqueued');
  assert.equal(submitted, 1);
  assert.equal(job.scope, 'example-app');
  assert.deepEqual(job.key, { kind: 'single', idempotencyKey: 'receipt-order-paid-6042' });
  assert.deepEqual(job.provider, { kind: 'smtp', key: 'receipt-test', mode: 'live' });
  assert.equal(job.state, 'terminal');
  assert.equal(job.disposition, 'accepted');
  assert.equal(job.attemptCount, 1);
  assert.equal(job.latestAttempt.outcome, 'accepted');
  assert.equal(job.latestAttempt.reason, 'smtp_accepted');
  assert.equal(job.unknownOpen, false);
  assert.doesNotMatch(
    output,
    /example\.invalid|Payment received|Thank you for your payment|"(snapshot|envelope|token)"/,
  );
}

function checkCoreReadme(consumer, env) {
  checkQuickstart(consumer, env);
  runRuntime(consumer, env, 'readme-core.mjs');
}

async function runIntegrationReadme(consumer, env) {
  // Use a fresh server for each tarball. Keep the parent event loop running so
  // mongodb-memory-server can continue draining mongod's stdio while Node runs.
  const mongo = await MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION ?? '8.2.6' },
    replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' },
  });
  try {
    for (const args of [
      ['readme-integrations.mjs'],
      ['readme-managed.mjs', 'stage'],
      ['readme-managed.mjs', 'worker'],
    ]) {
      await execFileAsync(consumerNode, ['--import', './runtime-guard.mjs', ...args], {
        cwd: consumer,
        env: {
          ...env,
          EMAIL_SERVICE_README_MONGO_URI: mongo.getUri('email_readme'),
          EMAIL_SERVICE_README_S3_LOOPBACK: args[0] === 'readme-managed.mjs' ? '1' : '',
        },
        timeout: 60_000,
      });
    }
  } finally {
    await mongo.stop();
  }
}

test('test scratch is ignored and owned only on fallback; a short supplied CI path is unchanged', () => {
  const first = acquireTestScratch(null);
  const second = acquireTestScratch(packageRoot);
  try {
    assert.equal(first.owned, true);
    assert.equal(second.owned, true);
    assert.notEqual(first.directory, second.directory);
    assert.match(relative(repoRoot, first.directory), /^_tmp[a-zA-Z0-9]{6}$/);
    const supplied = acquireTestScratch(first.directory);
    assert.equal(supplied.owned, false);
    assert.equal(supplied.directory, first.directory);
    supplied.cleanup();
    assert.equal(realpathSync(first.directory), first.directory);
  } finally {
    first.cleanup();
    second.cleanup();
  }
});

test('installs npm tarballs and verifies the public package boundary', async (t) => {
  const base = acquireTestScratch();
  t.after(base.cleanup);
  const scratch = mkdtempSync(join(base.directory, 'pack-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const env = {
    ...process.env,
    TMPDIR: scratch,
    NODE_OPTIONS: '',
    NODE_PATH: '',
    npm_config_cache: join(scratch, 'npm-cache'),
    EMAIL_SERVICE_README_MONGO_URI: '',
    EMAIL_SERVICE_README_S3_LOOPBACK: '',
  };
  // Installed exercises use explicit synthetic credentials and no developer SDK settings.
  for (const name of Object.keys(env)) if (/^(?:AWS|AZURE)_/i.test(name)) delete env[name];
  env.AWS_CONFIG_FILE = join(scratch, 'no-aws-config');
  env.AWS_SHARED_CREDENTIALS_FILE = join(scratch, 'no-aws-credentials');
  const version = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();
  assert.equal(publisher.name, '@repo-toolkit/publish-package');
  t.diagnostic(
    `release helper ${publisher.version}; TypeScript ${typescript.version}; release test version ${version}`,
  );

  const originalTmpdir = process.env.TMPDIR;
  process.env.TMPDIR = scratch; // mongodb-memory-server runs in this process.
  try {
    for (const [shape, release] of [
      ['ordinary', false],
      ['flattened release', true],
    ]) {
      await t.test(shape, async (packing) => {
        const cwd = release ? await stageRelease(scratch, version, packing) : packageRoot;
        const output = release ? '' : 'dist/';
        const pack = packFrom(cwd, scratch, env);
        for (const [profile, peers] of Object.entries(profiles)) {
          await packing.test(profile, async (installed) => {
            const consumer = join(scratch, `${release ? 'release' : 'ordinary'}-${profile}`);
            cpSync(join(import.meta.dirname, 'fixtures'), consumer, { recursive: true });
            writeFileSync(
              join(consumer, 'package.json'),
              JSON.stringify({
                name: 'packed-email-service-consumer',
                private: true,
                type: 'module',
                dependencies: { [packageName]: `file:../${basename(pack.path)}`, ...peers },
                ...(declarationPeers.some((peer) => peers[peer])
                  ? { devDependencies: { '@types/node': nodeTypes } }
                  : {}),
              }),
            );
            // Keep peer auto-install enabled: an optional peer must really stay absent.
            run(
              'pnpm',
              [
                'install',
                '--ignore-workspace',
                '--ignore-scripts',
                '--no-frozen-lockfile',
                process.env.EMAIL_SERVICE_CONSUMER_OFFLINE === '1' ? '--offline' : '--prefer-offline',
              ],
              consumer,
              env,
            );
            assert.match(readFileSync(join(consumer, 'pnpm-lock.yaml'), 'utf8'), /^\s+autoInstallPeers: true$/m);
            const packageDir = realpathSync(join(consumer, 'node_modules', packageName));
            assert(packageDir.startsWith(join(consumer, 'node_modules') + sep), 'expected a locally installed tarball');
            checkManifest(packageDir, pack, release, output, release ? version : '0.0.0-PLACEHOLDER');
            const versions = checkInstalledPeers(consumer, packageDir, output, peers);

            const node = runRuntime(consumer, env, 'runtime.mjs', packageDir, output, JSON.stringify(peers));
            installed.diagnostic(`Node ${node}; ${JSON.stringify(versions)}`);
            const readme = writeReadmeExamples(readFileSync(join(packageDir, 'README.md'), 'utf8'), consumer, {
              peers,
              legacy: profile === 'neither' || profile === 'all',
            });
            checkDeclarations(consumer, env, packageDir, pack.files, output, peers, readme, profile);
            if (peers.mongoose) runRuntime(consumer, env, 'mongoose-runtime.mjs');
            checkMissingPeerTypes(consumer, env, peers);
            if (peers.nodemailer) runRuntime(consumer, env, 'smtp-runtime.mjs');

            if (profile === 'neither') {
              checkJSDoc(packageDir, pack.files);
              runRuntime(consumer, env, 'batch-runtime.mjs');
              runRuntime(consumer, env, 'admission-runtime.mjs');
              runRuntime(consumer, env, 'provider-results-runtime.mjs');
              checkCoreReadme(consumer, env);
            }
            if (profile === 'all') {
              checkCoreReadme(consumer, env);
              await runIntegrationReadme(consumer, env);
            }
          });
        }
      });
    }
  } finally {
    if (originalTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = originalTmpdir;
  }
});
