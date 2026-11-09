import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditContractGraph, checkLayerSets } from '../../scripts/check-test-layers.mjs';

const repositoryRoot = path.resolve(__dirname, '../../../..');
const entry = 'test/contracts/public.test.ts';
const packageName = '@web-ts-toolkit/access-router';
const emptyPolicy = { inputs: [], documents: [], reviews: [], negatives: [], negativeResolves: [] };
let root: string;
let previousTmpdir: string | undefined;

function put(file: string, source: string) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, source);
}

function audit(source: string, options: Record<string, unknown> = {}) {
  put(entry, source);
  return auditContractGraph({ root, entries: [entry], policy: emptyPolicy, ...options });
}

beforeEach(() => {
  root = mkdtempSync(path.join(repositoryRoot, '_tmp-arts-test-layer-'));
  expect(execFileSync('git', ['check-ignore', root], { cwd: repositoryRoot, encoding: 'utf8' }).trim()).toBe(root);
  previousTmpdir = process.env.TMPDIR;
  process.env.TMPDIR = root;
  expect(os.tmpdir()).toBe(root);
  put('src/secret.ts', 'export const secret = true;');
  put('dist/index.mjs', "export * from '../src/secret';");
  put('dist/advanced.js', "export * from '../src/secret';");
  put('dist/processors.d.ts', "export * from '../src/secret';");
  put('dist/private-chunk.mjs', 'export const secret = true;');
  put('dist/private-chunk.d.ts', 'export type Secret = true;');
  put('test/support/private/helper.ts', 'export const secret = true;');
  put('test/internal/private.test.ts', 'export const secret = true;');
  put('test/invariants/private.test.ts', 'export const secret = true;');
  put('test/access-router-crud-fixture.ts', 'export const secret = true;');
  put('test/support/private/service-authorization.types.fixture.ts', 'export const secret = true;');
});

afterEach(() => {
  if (previousTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previousTmpdir;
  rmSync(root, { recursive: true, force: true });
});

describe('contract dependency boundary', () => {
  it('accepts public runtime/type entries and transitive public support; stops at entry implementation', () => {
    put(
      'test/support/public/helper.ts',
      `export { api } from '${packageName}';\nexport type T = import('../../../dist/processors.d.ts').T;`,
    );
    put('test/setup.ts', "import 'mongoose';");
    put('test/global-setup.ts', "import '../dist/index.mjs';");
    const result = audit(
      `import '../../dist/index.mjs';\nimport type { T } from '../../dist/advanced.js';\nimport '../support/public/helper';\nimport '../setup';`,
      {
        setup: ['test/global-setup.ts'],
      },
    );
    expect(result.errors).toEqual([]);
  });

  it.each([
    ["import '../../src/secret';", 'src/secret.ts'],
    ["import type { Secret } from '../../src/secret';", 'src/secret.ts'],
    ["export * from '../../src/secret';", 'src/secret.ts'],
    ["export type { Secret } from '../../src/secret';", 'src/secret.ts'],
    ["type T = import('../../src/secret').Secret;", 'src/secret.ts'],
    ["const value = require('../../src/secret');", 'src/secret.ts'],
    ["import secret = require('../../src/secret');", 'src/secret.ts'],
    ["void import('../../src/secret');", 'src/secret.ts'],
    ["import '../support/private/helper';", 'test/support/private/helper.ts'],
    ["import '../internal/private.test';", 'test/internal/private.test.ts'],
    ["import '../invariants/private.test';", 'test/invariants/private.test.ts'],
    ["import '../access-router-crud-fixture';", 'test/access-router-crud-fixture.ts'],
    [
      "import '../support/private/service-authorization.types.fixture';",
      'test/support/private/service-authorization.types.fixture.ts',
    ],
    ["import '../../dist/private-chunk.mjs';", 'dist/private-chunk.mjs'],
    ["import type { Secret } from '../../dist/private-chunk.d.ts';", 'dist/private-chunk.d.ts'],
  ])('rejects direct/typed/re-export/loader/private fixture edges: %s', (source, target) => {
    expect(audit(source).errors.join('\n')).toContain(`private dependency: ${target}`);
  });

  it('reports the transitive dependency chain', () => {
    put('test/support/public/first.ts', "export * from './second';");
    put('test/support/public/second.ts', "import type { Secret } from '../../../src/secret';");
    const output = audit("import '../support/public/first';").errors.join('\n');
    expect(output).toContain('src/secret.ts');
    expect(output).toContain('public.test.ts -> test/support/public/first.ts -> test/support/public/second.ts');
  });

  it.each([
    "const name = '../support/public/helper'; void import(name);",
    "const name = '../../src/secret'; require(name);",
    'void import(`../../src/${part}`);',
    "const load = require; load('../../src/secret');",
    "import { createRequire as cr } from 'node:module'; const load = cr(import.meta.url); load('../../src/secret');",
    "import '#private';",
    `import '${packageName}/dist/index.js';`,
    `import '${packageName}/src/secret';`,
    "import '../support/public/missing';",
  ])('fails closed on computed, unresolved, aliased or private package edges: %s', (source) => {
    expect(audit(source).errors.length).toBeGreaterThan(0);
  });

  it('rejects tsconfig path aliases to private source', () => {
    put('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { hidden: ['./src/secret.ts'] } } }));
    expect(audit("import 'hidden';").errors.join('\n')).toContain('private dependency: src/secret.ts');
  });

  it('does not let a Vitest alias replace the supported public entry with source', () => {
    const aliases = [{ find: packageName, replacement: path.join(root, 'src/secret.ts') }];
    expect(audit(`import '${packageName}';`, { aliases }).errors.join('\n')).toContain(
      'private dependency: src/secret.ts',
    );
  });

  it('audits configured setup and its transitive support', () => {
    put('test/global-setup.ts', "import './support/public/setup';");
    put('test/support/public/setup.ts', "export * from '../../../src/secret';");
    expect(audit(`import '${packageName}';`, { setup: ['test/global-setup.ts'] }).errors.join('\n')).toContain(
      'src/secret.ts',
    );
    expect(audit('', { setup: ['test/access-router-crud-fixture.ts'] }).errors.join('\n')).toContain(
      'private dependency',
    );
  });

  it('parses emitted consumer module contexts, including joined source and local generated siblings', () => {
    const good = `writeFileSync(path.join(out, 'helper.cjs'), "module.exports = require('${packageName}');");
writeFileSync(path.join(out, 'main.cjs'), "require('./helper.cjs');");`;
    expect(audit(good).errors).toEqual([]);
    expect(
      audit(
        `writeFileSync(path.join(out, 'main.cjs'), ["const secret = require('${packageName}/src/secret');", 'void secret;'].join('\\n'));`,
      ).errors.join('\n'),
    ).toContain('private/aliased package import');
    // Mentioning an import in an expected-error message is not a module edge.
    expect(audit(`expect(message).toContain("import('${packageName}/src/secret')");`).errors).toEqual([]);
  });

  it.each([
    "readFileSync(path.join(packageRoot, 'test/support/private/helper.ts'));",
    "writeFileSync(file, readFileSync(path.join(packageRoot, 'src', 'secret.ts')));",
    "const config = { files: ['../../src/secret.ts'] };",
    "const config = { include: ['dist/private-chunk.d.ts'] };",
    "ts.createProgram(['src/secret.ts'], {});",
    'ts.createProgram(computed, {});',
    "writeFileSync(file, `${prefix} import('${privatePath}')`);",
  ])('rejects private filesystem/file-list inputs and unreviewed computed generated sources: %s', (source) => {
    expect(audit(source).errors.length).toBeGreaterThan(0);
  });

  it('audits finite compiler fixture lists instead of trusting their string paths', () => {
    put('test/support/public/leak.ts', `import '${packageName}/src/secret';`);
    const source =
      "const files = ['leak.ts']; for (const file of files) readFileSync(path.join(packageRoot, 'test/support/public', file));";
    expect(audit(source).errors.join('\n')).toContain('private/aliased package import');
  });

  it('maps only exact finite generated documentation outputs and audits their bodies', () => {
    put('MIGRATION.md', `<!-- doc-example: partial -->\n\`\`\`ts\nexport function recipe() {}\n\`\`\`\n`);
    const policy = {
      ...emptyPolicy,
      generated: [
        { consumer: entry, output: 'recipe.mjs', document: 'MIGRATION.md', marker: 'export function recipe(' },
      ],
    };
    expect(audit("import './recipe.mjs';", { policy }).errors).toEqual([]);
    expect(audit("import './other.mjs';", { policy }).errors.join('\n')).toContain('unresolved local input');
    put(
      'MIGRATION.md',
      `<!-- doc-example: partial -->\n\`\`\`ts\nimport '${packageName}/src/secret'; export function recipe() {}\n\`\`\`\n`,
    );
    expect(audit("import './recipe.mjs';", { policy }).errors.join('\n')).toContain('private/aliased package import');
  });

  it('does not let an inspection-only read review become executable consumer source', () => {
    const expression = 'path.resolve(output, file)';
    const policy = {
      ...emptyPolicy,
      reviews: [
        { file: entry, lines: [1], expression, kind: 'read', role: 'inspection', reason: 'byte integrity only' },
      ],
    };
    expect(audit(`readFileSync(${expression});`, { policy }).errors).toEqual([]);
    expect(audit(`writeFileSync(target, readFileSync(${expression}));`, { policy }).errors.join('\n')).toContain(
      'unreviewed filesystem/source read',
    );
  });

  it('ties reviewed document-generator file lists to readable finite inventories', () => {
    const policy = { ...emptyPolicy, inventories: [{ file: entry, line: 1, binding: 'files', values: ['README.md'] }] };
    expect(audit("const files = ['README.md'];", { policy }).errors).toEqual([]);
    expect(audit("const files = ['private.md'];", { policy }).errors.join('\n')).toContain(
      'file-list inventory changed',
    );
  });

  it('allows one unused failure-only deep type alias, never a binding or successful use', () => {
    const specifier = `${packageName}/src/secret`;
    const source = `export type Blocked =\n  // @ts-expect-error blocked deep import\n  import('${specifier}').Secret;`;
    const policy = {
      ...emptyPolicy,
      negatives: [
        {
          file: entry,
          line: 3,
          kind: 'type',
          specifier,
          directive: '// @ts-expect-error blocked deep import',
          reason: 'encapsulation failure',
        },
      ],
    };
    expect(audit(source, { policy }).errors).toEqual([]);
    expect(audit(source + '\ntype Use = Blocked;', { policy }).errors.join('\n')).toContain(
      'private/aliased package import',
    );
    expect(
      audit(`\n// @ts-expect-error blocked deep import\nimport type { Secret } from '${specifier}';`, {
        policy,
      }).errors.join('\n'),
    ).toContain('private/aliased package import');
  });

  it('requires exact assert.throws shape and finite subpaths for negative resolution', () => {
    const source = `for (const subpath of ['src/secret']) {\nassert.throws(() => require.resolve('@web-ts-toolkit/access-router/' + subpath), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });\n}`;
    const policy = {
      ...emptyPolicy,
      negativeResolves: [{ file: entry, line: 2, subpaths: ['src/secret'], reason: 'encapsulation failure' }],
    };
    expect(audit(source, { policy }).errors).toEqual([]);
    expect(audit(source.replace('require.resolve', 'require'), { policy }).errors.join('\n')).toContain(
      'computed/unresolved module edge',
    );
    expect(audit(source.replace("['src/secret']", "['src/other']"), { policy }).errors.join('\n')).toContain(
      'computed/unresolved module edge',
    );
    expect(
      audit(source.replace("{ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }", '{}'), { policy }).errors.join('\n'),
    ).toContain('computed/unresolved module edge');
  });

  it('forbids consuming or re-exporting the negative-only alias from another module', () => {
    const file = 'test/support/public/negative.ts';
    const specifier = `${packageName}/src/secret`;
    put(file, `export type Blocked =\n// @ts-expect-error blocked deep import\nimport('${specifier}').Secret;`);
    const policy = {
      ...emptyPolicy,
      negatives: [
        {
          file,
          line: 3,
          kind: 'type',
          alias: 'Blocked',
          specifier,
          directive: '// @ts-expect-error blocked deep import',
          reason: 'encapsulation failure',
        },
      ],
    };
    expect(audit("import type { Blocked } from '../support/public/negative';", { policy }).errors.join('\n')).toContain(
      'negative-encapsulation alias must not be consumed',
    );
    expect(audit("export * from '../support/public/negative';", { policy }).errors.join('\n')).toContain(
      'negative-encapsulation alias must not be consumed',
    );
  });

  it.each([
    `import { vi } from 'vitest'; vi.mock('${packageName}', () => ({}));`,
    `import { vi } from 'vitest'; vi['mock']('${packageName}', () => ({}));`,
    "import { vi as mocker } from 'vitest'; mocker.doMock('../support/public/helper');",
    "import { vi } from 'vitest'; vi.spyOn(service, 'genIDFilter');",
    `import { ModelRouter } from '${packageName}'; vi.spyOn(ModelRouter.prototype, 'getService');`,
    `import { createAccessRuntime } from '${packageName}'; const api = createAccessRuntime(); const router = api.createRouter('x'); vi.spyOn(router, 'getPublicService');`,
    "service['processOp'] = () => ({});",
    "Object.defineProperty(service, 'trimOutputFields', { value() {} });",
    `import { createAccessRuntime } from '${packageName}'; const api = createAccessRuntime(); const router = api.createRouter('x'); const service = router.getService(req); service.findOne = vi.fn();`,
  ])('rejects common package mock/private patch escapes: %s', (source) => {
    expect(audit(source).errors.join('\n')).toMatch(/mock|spy\/patch|assignment|property patch/);
  });

  it('allows application hooks, Mongoose/model spies and supported service defaults', () => {
    expect(
      audit(`import { vi } from 'vitest'; import mongoose from 'mongoose';
const Model = mongoose.model('x'); vi.spyOn(Model, 'findOne'); vi.spyOn(Model.prototype, 'save');
const hook = vi.fn(); api.setModelOption('x', 'decorate', hook);
const service = req.macl.getService('x'); service.defaults = { findOneOptions: {} };
req._permissions = {};`).errors,
    ).toEqual([]);
  });
});

describe('exhaustive disjoint layer selection', () => {
  const contracts = 'test/contracts/public.test.ts';
  const invariants = 'test/invariants/safety.test.ts';
  const internal = 'test/internal/helper.test.ts';
  const baseline = () => ({
    runnable: [contracts, invariants, internal],
    all: [contracts, invariants, internal],
    selected: { contracts: [contracts], invariants: [invariants], internal: [internal] },
  });

  it('accepts exactly one owner per nonempty suite and the exact default union', () => {
    expect(checkLayerSets(baseline())).toEqual([]);
  });

  it.each(['test/orphan.test.ts', 'test/support/public/orphan.test.ts', 'src/orphan.test.ts'])(
    'rejects runnable outside layers: %s',
    (file) => {
      const input = baseline();
      input.runnable.push(file);
      input.all.push(file);
      expect(checkLayerSets(input).join('\n')).toContain('orphan/support runnable');
    },
  );

  it('rejects overlaps, empty layers, exclusions, unselected tests and wrong ownership', () => {
    const overlap = baseline();
    overlap.selected.internal.push(contracts);
    expect(checkLayerSets(overlap).join('\n')).toContain('overlap');
    const empty = baseline();
    empty.selected.invariants = [];
    expect(checkLayerSets(empty).join('\n')).toContain('empty layer: invariants');
    expect(checkLayerSets(empty).join('\n')).toContain('unselected');
    const excluded = baseline();
    excluded.all.pop();
    expect(checkLayerSets(excluded).join('\n')).toContain('default/union mismatch');
    const wrong = baseline();
    wrong.selected = { contracts: [internal], internal: [contracts], invariants: [invariants] };
    expect(checkLayerSets(wrong).join('\n')).toContain('wrong layer');
  });
});

import ts from 'typescript';

describe('ARTS06-F1 compiler-context boundaries', () => {
  const options = (paths: Record<string, string[]>) => ({
    compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', paths },
  });
  const resolved = (name: string) => {
    const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    return ts.resolveModuleName(name, path.join(root, entry), parsed.options, ts.sys).resolvedModule?.resolvedFileName;
  };

  it('reproduces ARTS06-F1 exact public root alias resolving to private source', () => {
    put('src/secret.ts', 'export type Secret = { privateOnly: true };');
    put('tsconfig.json', JSON.stringify(options({ [packageName]: ['./src/secret.ts'] })));
    expect(resolved(packageName)).toBe(path.join(root, 'src/secret.ts'));
    expect(
      audit(`import type { Secret } from '${packageName}'; export type Leaked = Secret;`).errors.join('\n'),
    ).toContain('private dependency: src/secret.ts');
  });

  it.each([
    ['root runtime', packageName, `import { secret } from '${packageName}';`],
    ['root type', packageName, `import type { Secret } from '${packageName}';`],
    ['advanced runtime', `${packageName}/advanced`, `const advanced = require('${packageName}/advanced');`],
    ['advanced type', `${packageName}/advanced`, `export type { Secret } from '${packageName}/advanced';`],
    ['processors runtime', `${packageName}/processors`, `void import('${packageName}/processors');`],
    ['processors type', `${packageName}/processors`, `type T = import('${packageName}/processors').Secret;`],
  ])('checks effective aliases before trusting a public name (%s)', (_label, name, source) => {
    put('tsconfig.json', JSON.stringify(options({ [name]: ['./src/secret.ts'] })));
    expect(resolved(name)).toBe(path.join(root, 'src/secret.ts'));
    expect(audit(source).errors.join('\n')).toContain('private dependency: src/secret.ts');
  });

  it.each([
    ['exact root', packageName, { [packageName]: ['./src/secret.ts'] }, 'src/secret.ts'],
    ['wildcard subpath', `${packageName}/advanced`, { [`${packageName}/*`]: ['./src/*'] }, 'src/advanced.ts'],
  ])('uses inherited paths and the declaring config baseUrl (%s)', (_label, name, paths, target) => {
    put('src/advanced.ts', 'export type Secret = true;');
    put('config/base.json', JSON.stringify({ compilerOptions: { ...options(paths).compilerOptions, baseUrl: '..' } }));
    put('tsconfig.json', JSON.stringify({ extends: './config/base.json' }));
    expect(resolved(name)).toBe(path.join(root, target));
    expect(audit(`import type { Secret } from '${name}';`).errors.join('\n')).toContain(
      `private dependency: ${target}`,
    );
  });

  it('checks baseUrl resolution even without an explicit paths entry', () => {
    put('src/@web-ts-toolkit/access-router/index.ts', 'export type Secret = true;');
    put('tsconfig.json', JSON.stringify({ compilerOptions: { ...options({}).compilerOptions, baseUrl: './src' } }));
    expect(resolved(packageName)).toBe(path.join(root, 'src/@web-ts-toolkit/access-router/index.ts'));
    expect(audit(`import '${packageName}';`).errors.join('\n')).toContain(
      'private dependency: src/@web-ts-toolkit/access-router/index.ts',
    );
  });

  it('accepts no-alias public names and aliases resolving to actual public built entries', () => {
    const source = `import '${packageName}'; import '${packageName}/advanced'; import type { T } from '${packageName}/processors';`;
    expect(audit(source).errors).toEqual([]);
    put(
      'tsconfig.json',
      JSON.stringify(
        options({
          [packageName]: ['./dist/index.mjs'],
          [`${packageName}/advanced`]: ['./dist/advanced.js'],
          [`${packageName}/processors`]: ['./dist/processors.d.ts'],
        }),
      ),
    );
    expect(resolved(packageName)).toBe(path.join(root, 'dist/index.mjs'));
    expect(audit(source).errors).toEqual([]);
  });

  it('keeps finite installed filesystem inputs separate from ordinary imports of the very same file', () => {
    const file = 'test/support/public/consumer.ts';
    put('config/base.json', JSON.stringify(options({ [packageName]: ['../src/secret.ts'] })));
    put('tsconfig.json', JSON.stringify({ extends: './config/base.json' }));
    put(file, `import type { Secret } from '${packageName}';`);
    const policy = { ...emptyPolicy, inputs: [file] };
    const read = `readFileSync(path.join(packageRoot, '${file}'));`;
    expect(audit(read, { policy }).errors).toEqual([]);
    // Installed is visited first: caches must not suppress the later repo audit.
    expect(audit(`${read}\nimport '../support/public/consumer';`, { policy }).errors.join('\n')).toContain(
      'private dependency: src/secret.ts',
    );
    expect(auditContractGraph({ root, entries: [file], policy }).errors.join('\n')).toContain(
      'private dependency: src/secret.ts',
    );
    put(file, "import '../private/helper';");
    expect(audit(read, { policy }).errors.join('\n')).toContain('private dependency: test/support/private/helper.ts');
  });

  it('does not infer installed compilation from a public support path or a file read', () => {
    const file = 'test/support/public/not-a-declared-consumer.ts';
    put('tsconfig.json', JSON.stringify(options({ [packageName]: ['./src/secret.ts'] })));
    put(file, `import '${packageName}';`);
    expect(audit(`readFileSync(path.join(packageRoot, '${file}'));`).errors.join('\n')).toContain(
      'private dependency: src/secret.ts',
    );
  });

  it('requires a finite installed producer and propagates repo context through ordinary generated-module imports', () => {
    put('tsconfig.json', JSON.stringify(options({ [packageName]: ['./src/secret.ts'] })));
    const source = `writeFileSync(path.join(out, 'consumer.mts'), "import '${packageName}';");`;
    const policy = {
      ...emptyPolicy,
      installedSources: [{ file: entry, line: 1, target: "path.join(out, 'consumer.mts')" }],
    };
    expect(audit(source, { policy }).errors).toEqual([]);
    expect(audit(source).errors.join('\n')).toContain('private dependency: src/secret.ts');
    expect(audit(source + "\nimport './consumer.mts';", { policy }).errors.join('\n')).toContain(
      'private dependency: src/secret.ts',
    );
  });

  it('propagates the importing context into exact generated recipe bodies', () => {
    const file = 'test/support/public/recipe-consumer.ts';
    put('tsconfig.json', JSON.stringify(options({ [packageName]: ['./src/secret.ts'] })));
    put(
      'MIGRATION.md',
      `<!-- doc-example: partial -->\n\`\`\`ts\nimport '${packageName}'; export function recipe() {}\n\`\`\`\n`,
    );
    put(file, "import './recipe.mjs';");
    const policy = {
      ...emptyPolicy,
      inputs: [file],
      generated: [
        { consumer: file, output: 'recipe.mjs', document: 'MIGRATION.md', marker: 'export function recipe(' },
      ],
    };
    expect(audit('', { policy }).errors).toEqual([]);
    expect(audit("export * from '../support/public/recipe-consumer';", { policy }).errors.join('\n')).toContain(
      'private dependency: src/secret.ts',
    );
  });

  it.each(['configured setup', 'transitive type re-export'])('propagates repo aliases through %s', (kind) => {
    put('tsconfig.json', JSON.stringify(options({ [`${packageName}/advanced`]: ['./src/secret.ts'] })));
    put('test/support/public/reexport.ts', `export type { Secret } from '${packageName}/advanced';`);
    put('test/global-setup.ts', "import './support/public/reexport';");
    const result =
      kind === 'configured setup'
        ? audit('', { setup: ['test/global-setup.ts'] })
        : audit("export * from '../support/public/reexport';");
    expect(result.errors.join('\n')).toContain('private dependency: src/secret.ts');
    expect(result.errors.join('\n')).toContain('test/support/public/reexport.ts');
  });
});
