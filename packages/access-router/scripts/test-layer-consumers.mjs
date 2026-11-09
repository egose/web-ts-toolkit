// Finite consumer inputs and entry-scoped reviews. See README.md in this directory.
// These are readable source/file inventories, not hashes or whole-file exemptions.
const publicInput = (name) => `test/support/public/${name}`;
const contract = (name) => `test/contracts/${name}.test.ts`;
const packed = contract('packed-consumer-compatibility');
const strict = contract('strict-consumer-types');
const docs = contract('documentation-examples');
const inputs = [
  'authorization-fast-path-consumer.types.fixture.ts',
  'authorization-fast-path-native.runtime.fixture.mjs',
  'document-permissions-dependencies.types.fixture.ts',
  'field-helper-consumer.runtime.fixture.ts',
  'field-helper-migration.types.fixture.ts',
  'grouped-count-consumer.types.fixture.ts',
  'hydration-consumer.types.fixture.ts',
  'nested-operation-access-consumer.types.fixture.ts',
  'nested-operation-access.invalid.types.fixture.ts',
  'output-publication-fusion-withdrawal.types.fixture.ts',
  'owned-authorization-cutover.invalid.types.fixture.ts',
  'owned-authorization-helpers.runtime.fixture.mjs',
  'owned-authorization-hooks.invalid.types.fixture.ts',
  'owned-authorization-hooks.types.fixture.ts',
  'owned-authorization-many-consumer.runtime.fixture.ts',
  'owned-authorization-many-consumer.types.fixture.ts',
  'owned-authorization-many.invalid.types.fixture.ts',
  'owned-authorization-many.types.fixture.ts',
  'owned-authorization-migration.invalid.types.fixture.ts',
  'private-populate-read-policy.types.fixture.ts',
  'service-authorization-boundary.types.fixture.ts',
  'service-authorization-consumer.types.fixture.ts',
  'service-authorization-migration.types.fixture.ts',
  'virtuals-populate-dependencies.consumer.runtime.fixture.ts',
  'virtuals-populate-dependencies.types.fixture.ts',
  'arts04-exports.mjs',
  'arts04-exports.cjs',
  'arts04-export-assertions.cjs',
].map(publicInput);

const documents = [
  { file: 'README.md' },
  { file: 'MIGRATION.md' },
  { file: 'llms.txt' },
  ...['configuration', 'routing', 'services', 'hooks'].map((name) => ({
    file: `../../website/docs/packages/access-router/${name}.mdx`, markedOnly: true,
  })),
];

const source = (file, lines, expression, reason) => ({ file, lines, expression, kind: 'source', reason });
const inspection = (lines, expression, reason) => ({ file: packed, lines, expression, kind: 'read', role: 'inspection', reason });

export const consumerPolicy = {
  // These finite filesystem inputs and document/JSDoc extractions are compiled
  // or executed in staged installed trees with their own config, not repo paths.
  // Ordinary imports of the very same files still inherit the importing context.
  inputs,
  documents,
  declarationExamples: true,
  installedSources: [
    ...[
      [633, "path.resolve(consumerDir, 'private-exports.cjs')"],
      [682, "path.resolve(consumerDir, 'esm.mjs')"],
      [712, "path.resolve(consumerDir, 'cjs.cjs')"],
      [744, "path.resolve(consumerDir, 'operation-access-smoke.cjs')"],
      [854, "path.resolve(consumerDir, 'operation-access.esm.mjs')"],
      [861, "path.resolve(consumerDir, 'operation-access.cjs.cjs')"],
      [874, "path.resolve(consumerDir, 'consumer.nodenext.mts')"],
      [936, "path.resolve(consumerDir, 'consumer.nodenext.cts')"],
      [994, "path.resolve(consumerDir, 'consumer.bundler.ts')"],
    ].map(([line, target]) => ({ file: packed, line, target,
      reason: 'Exact writeConsumerFiles module emitted into the staged installed consumer; compiler/runtime inputs remain audited.' })),
    ...[[528, 'path.resolve(consumerDir, sourceFile)'], [952, 'sourceFile'], [990, 'path.resolve(consumerDir, sourceFile)']]
      .map(([line, target]) => ({ file: strict, line, target,
        reason: 'Exact literal/constant module compiled by the staged strict consumer config, without repo paths.' })),
    { file: contract('tree-shaking-smoke'), line: 97, target: 'consumerPath',
      reason: 'Exact joined literal module bundled in the isolated installed package tree.' },
  ],
  inventories: [{
    file: docs, line: 159, binding: 'files', property: 'file',
    values: documents.filter((doc) => doc.file !== 'MIGRATION.md').map((doc) => doc.file),
    reason: 'The actual assembleAllBlocks filesystem table must match the audited document inventory.',
  }, {
    file: docs, line: 186, binding: 'entries',
    values: ['index.d.ts', 'index.d.mts', 'advanced.d.ts', 'advanced.d.mts'],
    reason: 'JSDoc inspection starts at public declaration entries; only the compiler follows their shared aliases.',
  }],
  generated: [
    ['collection-raw-recipe.mjs', 'export async function rawBefore('],
    ['collection-presentation-recipe.mjs', 'export function presentationSubset('],
    ['collection-current-recipe.mjs', 'export async function currentList('],
  ].map(([output, marker]) => ({
    consumer: publicInput('owned-authorization-many-consumer.runtime.fixture.ts'),
    output, document: 'MIGRATION.md', marker,
    reason: 'Exact unique M3 partial block extracted by packed writeConsumerFiles; no computed-import allowance.',
  })),
  reviews: [
    { file: docs, lines: [188], expression: "entries.map((entry) => path.resolve(packageRoot, 'dist', entry))", kind: 'compiler',
      reason: 'Exact map over the checked public declaration entry inventory above, not private declaration chunk roots.' },
    source(docs, [338], 'snippetWithFixture', 'assembleAllBlocks inputs are the document inventory and public declaration JSDoc; fixturize only appends references to existing bindings.'),
    source(docs, [386], 'block.snippet', 'The same finite document/JSDoc block inventory; complete workflows are emitted unchanged.'),
    source(packed, [521], 'hydrationExample', 'Exact marked README server-owned hydration migration block.'),
    source(packed, [549, 561], 'block.source', 'Exact marked MIGRATION partial blocks; three named collection outputs are mapped above.'),
    source(packed, [553], 'javascriptErrors', 'Exact MIGRATION javascript-errors fenced module; parser audits that module too.'),
    source(packed, [570], 'source', 'MIGRATION expected-error block and the two public migration/collection invalid fixtures; diagnostics, not successful private imports.'),
    source(packed, [574], 'fastPathExample', 'Exact MIGRATION complete-runtime block.'),
    source(packed, [578], 'privatePopulateExample', 'Exact README runPrivatePopulateExample complete-runtime block.'),
    source(packed, [587], "extension === 'cts' ? collection.replaceAll('-recipe.mjs', '-recipe.cjs') : collection", 'Public collection runtime fixture; CJS changes only the three audited recipe suffixes.'),
    source(packed, [589], 'authorizationExample', 'Exact README runServiceAuthorizationExample complete-runtime block.'),
    source(strict, [180], 'snippet', 'Exact installed MIGRATION runOwnedAuthorizationExample complete-runtime block.'),
    source(strict, [275, 306], 'block.source', 'Exact marked MIGRATION blocks, with old examples required to fail independently.'),
    { file: docs, lines: [173], expression: 'path.resolve(packageRoot, file)', kind: 'read', role: 'inspection',
      reason: 'assembleAllBlocks finite files table; documents inventory above audits the actual code fences.' },
    { file: strict, lines: [150], expression: 'path.resolve(consumerDir, file)', kind: 'read', role: 'inspection',
      reason: 'Read generated collection negative source solely to associate unsuppressed compiler diagnostics.' },
    { file: contract('tree-shaking-smoke'), lines: [143], expression: 'bundlePath', kind: 'read', role: 'inspection',
      reason: 'Inspect esbuild output text/size; the literal input module is parsed at its writeFileSync sink.' },
    inspection([1241], 'path.resolve(consumerDir, file)', 'Read already-audited generated negative sources for exact diagnostic attribution.'),
    inspection([1389], 'destination', 'SHA-256 publication evidence, not an executable consumer input.'),
    inspection([1395, 1542, 1594], 'tarball', 'SHA-256 tarball evidence, never a module edge.'),
    inspection([1402], 'consumerRequire.resolve(`${name}/package.json`)', 'Inspect installed Express/Mongoose versions; never load an access-router private module.'),
    { file: packed, lines: [1402], expression: '`${name}/package.json`', kind: 'resolve',
      reason: 'The enclosing Object.fromEntries maps exactly these five external package manifests.',
      finite: ['express/package.json', 'mongoose/package.json', 'typescript/package.json', '@types/node/package.json', '@types/express/package.json'] },
    inspection([1448, 1589, 1778, 1805], 'path.resolve(packedRoot, file)', 'Same-build bytes/JSDoc publication integrity; no consumer execution of these read strings.'),
    inspection([1449, 1590], "path.resolve(packageRoot, 'dist', file)", 'Same-build declaration byte integrity, not a private declaration import.'),
    inspection([1544, 1596], "path.resolve(packedRoot, 'index.mjs')", 'SHA-256 of public built entry for scoped evidence.'),
    inspection([1777, 1833], 'path.resolve(distRoot, file)', 'Same-build bytes for recursive dist inventory, never consumer execution.'),
    inspection([1782], 'path.resolve(packedRoot, file)', 'Publication documents byte integrity.'),
    inspection([1832], "path.resolve(artifactRoot, 'dist', file)", 'Scoped artifact dist byte integrity, never a module edge.'),
    inspection([1837], 'path.resolve(artifactRoot, file)', 'Scoped artifact documentation byte integrity.'),
  ],
  negatives: [{
    file: publicInput('service-authorization-consumer.types.fixture.ts'), line: 524,
    kind: 'type', alias: 'PrivateDeepImport', specifier: '@web-ts-toolkit/access-router/src/acl/service-authorization',
    directive: '// @ts-expect-error the export map also blocks source deep imports',
    reason: 'One unused exported negative type alias proves encapsulation; no import binding or runtime use.',
  }],
  negativeResolves: [{
    file: `${packed}#private-exports.cjs`, line: 37,
    subpaths: ['src/acl/service-authorization', 'src/acl/document-authorization', 'src/acl/service-execution',
      'src/acl/prepared-query', 'src/acl/populate-policy', 'src/options/populate-policy', 'src/acl/unsafe-snapshot-options',
      'dist/index.js', 'src/acl/output-work-ledger', 'src/acl/output-helper-many-admission'],
    reason: 'Only assert.throws(require.resolve(...), ERR_PACKAGE_PATH_NOT_EXPORTED), with this exact finite table.',
  }, {
    file: `${packed}#private-exports.cjs`, line: 41,
    subpaths: ['src/acl/captured-authorization-configuration', 'src/acl/trusted-output-materialization'],
    reason: 'Same failure-only shape; no successful require/import or exports use.',
  }],
};
