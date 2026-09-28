/** AIR-06: test the shipped README text and declarations in a real npm consumer.
 * Prerequisite: package build. Uses a repo-local ignored `_tmp*` directory for
 * TMPDIR (defaults to `<repoRoot>/_tmp` when TMPDIR is unset or outside the repo).
 * npm uses its own consumer manifest/lock and repo-local cache/config files.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = path.resolve(packageRoot, '../..');
const name = '@web-ts-toolkit/asset-inliner';
const read = (file: string) => readFileSync(file, 'utf8');
const manifest = JSON.parse(read(path.join(packageRoot, 'package.json')));
const rootManifest = JSON.parse(read(path.join(repoRoot, 'package.json')));
const protectedFiles = ['package.json', 'pnpm-lock.yaml', 'packages/asset-inliner/package.json'];
const baseline = protectedFiles.map((file) => read(path.join(repoRoot, file)));

// Assertions are appended AFTER the verbatim block, never substituted for it.
// Keep IDs stable: removal/renaming of a designated block must fail the test.
const checks: Record<string, string> = {
  encode: `assert.equal(asset.mediaType, 'image/png'); assert.equal(asset.dataUrl, 'data:image/png;base64,iVBORw=='); assert.deepEqual(syncAsset, asset);`,
  format: `assert.equal(formatCssUrl(png), 'url(data:image/png;base64,AQID)'); assert.equal(formatFontSource(woff2), "url(data:font/woff2;base64,BAUG) format('woff2')");`,
  css: `assert.equal(result.modified, true); assert.equal(result.replacements.length, 2); assert.deepEqual(result.diagnostics, []); assert.ok(result.content.includes("format('woff2')"));`,
  html: `assert.equal(out.modified, true); assert.equal(out.replacements.length, 2); assert.deepEqual(out.diagnostics, []); assert.ok(out.content.includes('data:image/png;base64,AQ==')); assert.ok(out.content.includes('data:image/png;base64,Ag=='));`,
  files: `assert.equal(existsSync(dir), false);`,
  'custom-kind': `assert.equal(result.replacements.length, 1); assert.deepEqual(result.diagnostics, []); assert.ok(result.content.includes('data:audio/mpeg;base64,AQID'));`,
  resolver: `assert.equal(aliasHits, 1); assert.equal(result.replacements.length, 1); assert.deepEqual(result.diagnostics, []); assert.equal(result.replacements[0]?.originalUrl, 'legacy.png'); assert.ok(result.content.includes('data:image/jxl;base64,AQID'));`,
};

let consumer: string;
let installed: string;
let env: NodeJS.ProcessEnv;
let dryFiles: string[];
let packedFiles: string[];
let compilerFiles: string;

function run(command: string, args: string[], cwd = consumer): string {
  try {
    return execFileSync(command, args, {
      cwd,
      env,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    const details = error as { message?: string; stdout?: string; stderr?: string };
    throw new Error([details.message, details.stdout, details.stderr].filter(Boolean).join('\n'), { cause: error });
  }
}

function node(file: string): string {
  return run(process.execPath, ['--import', './resolution-guard.mjs', file]);
}

beforeAll(() => {
  let tmp = process.env.TMPDIR;
  const isRepoLocalTmp = (dir: string): boolean => {
    try {
      return path.isAbsolute(dir) && path.relative(repoRoot, realpathSync(dir)).startsWith('_tmp');
    } catch {
      return false;
    }
  };
  if (!tmp || !isRepoLocalTmp(tmp)) {
    tmp = path.join(repoRoot, '_tmp');
    mkdirSync(tmp, { recursive: true });
  }
  consumer = mkdtempSync(path.join(tmp, 'asset-inliner-consumer-'));
  installed = path.join(consumer, 'node_modules', name);
  const cache = path.join(tmp, 'npm-cache');
  mkdirSync(cache, { recursive: true });
  writeFileSync(path.join(consumer, 'user.npmrc'), '');
  writeFileSync(path.join(consumer, 'global.npmrc'), '');
  env = {
    ...process.env,
    TMPDIR: tmp,
    NODE_OPTIONS: '',
    NODE_PATH: '',
    npm_config_cache: cache,
    npm_config_userconfig: path.join(consumer, 'user.npmrc'),
    npm_config_globalconfig: path.join(consumer, 'global.npmrc'),
    npm_config_update_notifier: 'false',
  };
  const dry = JSON.parse(run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], packageRoot))[0];
  dryFiles = dry.files.map((file: { path: string }) => file.path).sort();
  const packed = JSON.parse(
    run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', consumer], packageRoot),
  )[0];
  packedFiles = packed.files.map((file: { path: string }) => file.path).sort();
  writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({
      name: 'asset-inliner-installed-consumer',
      private: true,
      type: 'module',
      dependencies: { [name]: `file:./${packed.filename}` },
      devDependencies: {
        typescript: rootManifest.devDependencies.typescript,
        '@types/node': rootManifest.devDependencies['@types/node'],
      },
    }),
  );
  run('npm', ['install', '--prefix', consumer, '--workspaces=false', '--ignore-scripts', '--no-audit', '--no-fund']);
  run('npm', ['ls', '--all', '--prefix', consumer, '--workspaces=false']);

  const shippedReadme = read(path.join(installed, 'README.md'));
  const snippets = [...shippedReadme.matchAll(/<!-- runnable: ([\w-]+) -->\n```ts\n([\s\S]*?)\n```/g)];
  expect(snippets.map((match) => match[1]).sort()).toEqual(Object.keys(checks).sort());
  for (const [, id, source] of snippets) {
    const assertions = `${id === 'files' ? "import { existsSync } from 'node:fs';" : "import assert from 'node:assert/strict';"}\n${checks[id]}\n`;
    // Compile/run the unaltered block on its own, as well as the asserted copy.
    writeFileSync(path.join(consumer, `readme-${id}.mts`), source);
    writeFileSync(path.join(consumer, `checked-${id}.mts`), `${source}\n${assertions}`);
  }
  for (const fixture of ['contracts.mts', 'runtime.mjs', 'resolution-guard.mjs']) {
    cpSync(path.join(packageRoot, 'test-consumer', fixture), path.join(consumer, fixture));
  }
  writeFileSync(
    path.join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: false,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        types: ['node'],
        typeRoots: ['./node_modules/@types'],
        outDir: './compiled',
      },
      include: ['*.mts'],
    }),
  );
  compilerFiles = run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--listFiles']);
}, 240_000);

afterAll(() => {
  try {
    expect(protectedFiles.map((file) => read(path.join(repoRoot, file)))).toEqual(baseline);
  } finally {
    if (consumer) rmSync(consumer, { recursive: true, force: true });
  }
});

describe('real installed README and consumer contracts (AIR-06)', () => {
  it('packs the advertised root entrypoint, declarations and exact README', () => {
    expect(packedFiles).toEqual(dryFiles);
    expect(packedFiles).toEqual(
      expect.arrayContaining(['package.json', 'README.md', 'dist/index.mjs', 'dist/index.d.mts']),
    );
    expect(
      packedFiles.every((file) => file === 'package.json' || file === 'README.md' || file.startsWith('dist/')),
    ).toBe(true);
    expect(read(path.join(installed, 'README.md'))).toBe(read(path.join(packageRoot, 'README.md')));
    expect(JSON.parse(read(path.join(installed, 'package.json')))).toEqual(manifest);
    for (const entry of [manifest.main, manifest.module, manifest.types, ...Object.values(manifest.exports['.'])]) {
      expect(existsSync(path.resolve(installed, entry as string))).toBe(true);
    }
    expect(existsSync(path.join(consumer, 'package-lock.json'))).toBe(true);
    expect(realpathSync(installed)).toBe(installed); // real install, no workspace symlink
  });

  it('resolves strict NodeNext declarations and compiler libraries only within this consumer', () => {
    const files = compilerFiles.trim().split(/\r?\n/);
    expect(files).toContain(path.join(installed, 'dist/index.d.mts'));
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      expect(path.isAbsolute(file), file).toBe(true);
      expect(realpathSync(file).startsWith(`${consumer}${path.sep}`), file).toBe(true);
    }
    const declarations = read(path.join(installed, 'dist/index.d.mts'));
    for (const text of [
      'readonly resolutionBaseDir?: string',
      'readonly maxSyntaxDepth?: number',
      'default 256',
      'maximum 512',
      'HTML_BASE_UNMAPPABLE',
      'interior commas',
      'unquoted values gain double quotes',
      'HTML-spec recovery',
      'maxInlineBytes',
      'has no default',
      'quotes/escaping',
    ])
      expect(declarations).toContain(text);
    for (const internal of [
      'assembleSourcePatches',
      'tokenizeSrcset',
      'createDepthLimitedTreeAdapter',
      'HTML_BASE_CONTEXT',
    ]) {
      expect(declarations).not.toContain(internal);
    }
  });

  for (const id of Object.keys(checks)) {
    it(`executes the exact shipped runnable:${id} block and checks its outcome`, () => {
      node(`compiled/readme-${id}.mjs`);
      node(`compiled/checked-${id}.mjs`);
    });
  }

  it('runs plain Node ESM regressions and dynamic detection with locally owned dependencies', () => {
    expect(node('runtime.mjs')).toContain('Packed runtime contracts passed');
  });

  it('fails closed when a runtime dependency is missing instead of using ancestor node_modules', () => {
    // An existing workspace entry must also fail: absence of an ancestor copy
    // of parse5 alone is not proof that the resolution guard is effective.
    const workspaceEntry = pathToFileURL(path.join(packageRoot, 'dist/index.mjs')).href;
    expect(() =>
      run(process.execPath, [
        '--import',
        './resolution-guard.mjs',
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(workspaceEntry)})`,
      ]),
    ).toThrow(/consumer boundary/);
    const local = path.join(consumer, 'node_modules/parse5');
    const hidden = path.join(consumer, 'hidden-parse5');
    renameSync(local, hidden);
    try {
      expect(() => node('runtime.mjs')).toThrow(/consumer boundary|Cannot find package 'parse5'/);
    } finally {
      renameSync(hidden, local);
    }
  });
});
