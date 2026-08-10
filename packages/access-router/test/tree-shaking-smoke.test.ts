import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const packageRoot = path.resolve(__dirname, '..');
const esbuildBin = path.resolve(workspaceRoot, 'node_modules', '.bin', 'esbuild');

/**
 * Files that esbuild must be able to resolve when bundling a consumer of
 * `@web-ts-toolkit/access-router` through the package's `exports` map. Their
 * presence and non-zero size is the precondition for the smoke tests; missing
 * or empty files here are the failure mode AGENTS.md's dist write-race produces
 * (esbuild resolving a half-written `dist/index.js` and silently dropping the
 * `AccessRuntime` side-effect chain).
 */
const requiredDistEntries = ['dist/index.js', 'dist/index.mjs', 'dist/advanced.js', 'dist/advanced.mjs'];

const tempDirs: string[] = [];
const sideEffectCandidates = requiredDistEntries;

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

type SmokeResult = {
  bundlePath: string;
  bundleSize: number;
  bundle: string;
  stdout: string;
  parsed: {
    ok: boolean;
    schemaType: string;
    schemaFields: string[];
    hasJsonSchema: string;
    hasRuntime: string;
  };
};

const runWithEnv = (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): string => {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...env },
  });
};

const runSmoke = (mode: 'minify' | 'tree-shake' = 'minify'): SmokeResult => {
  const work = mkdtempSync(path.join(os.tmpdir(), 'arf15-tree-shake-'));
  tempDirs.push(work);

  const scopedDir = path.join(work, 'node_modules', '@web-ts-toolkit');
  mkdirSync(scopedDir, { recursive: true });
  // ARF-15: stage a real, isolated copy of the package rather than a symlink
  // to the live workspace tree. esbuild reads `dist/index.{js,mjs}` from this
  // copy, so a concurrent `tsup` rebuild of `packages/access-router/dist`
  // (the race AGENTS.md warns about) cannot produce a half-written bundle
  // where the `AccessRuntime` side-effect chain is dropped. Copying the
  // package manifest preserves `exports` / `sideEffects` so esbuild's
  // tree-shaking semantics still match the published layout.
  const stagedPackageDir = path.join(scopedDir, 'access-router');
  mkdirSync(stagedPackageDir, { recursive: true });
  const distSource = path.join(packageRoot, 'dist');
  // Fail loudly with the precondition that actually failed if the pre-build
  // did not run (or raced) before this test, instead of letting esbuild emit
  // an opaque "Could not resolve" error downstream.
  for (const required of requiredDistEntries) {
    const resolved = path.join(packageRoot, required);
    expect(existsSync(resolved), `required build artifact ${required} is missing`).toBe(true);
    expect(statSync(resolved).size, `required build artifact ${required} is empty`).toBeGreaterThan(0);
  }
  cpSync(distSource, path.join(stagedPackageDir, 'dist'), { recursive: true });
  writeFileSync(
    path.join(stagedPackageDir, 'package.json'),
    readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );

  const consumerPath = path.join(work, 'consumer.cjs');
  writeFileSync(
    consumerPath,
    [
      "const { createAccessRuntime } = require('@web-ts-toolkit/access-router');",
      "const mongoose = require('mongoose');",
      '',
      'const runtime = createAccessRuntime();',
      'const schema = new mongoose.Schema({ name: String, secret: String, public: Boolean });',
      `const modelName = 'Arf15TreeShake' + Date.now();`,
      'const model = mongoose.model(modelName, schema);',
      'runtime.registerModelInstance(modelName, model);',
      '',
      'const ok = typeof model.jsonSchema === "function";',
      'if (!ok) {',
      '  console.log(JSON.stringify({ ok: false, hasJsonSchema: typeof model.jsonSchema, hasRuntime: typeof runtime.createRouter }));',
      "  throw new Error('jsonSchema was tree-shaken away');",
      '}',
      'const json = model.jsonSchema();',
      'console.log(JSON.stringify({',
      '  ok: true,',
      '  schemaType: json && json.type,',
      '  schemaFields: Object.keys((json && json.properties) || {}),',
      '  hasJsonSchema: typeof model.jsonSchema,',
      '  hasRuntime: typeof runtime.createRouter,',
      '}));',
      '',
    ].join('\n'),
  );

  const bundlePath = path.join(work, 'bundled.cjs');
  const args = [
    consumerPath,
    '--bundle',
    '--format=cjs',
    '--platform=node',
    '--external:mongoose',
    '--external:express',
    `--outfile=${bundlePath}`,
  ];
  if (mode === 'minify') args.push('--minify');

  runWithEnv(esbuildBin, args, work, {
    NODE_PATH: [path.join(work, 'node_modules'), path.join(packageRoot, 'node_modules')].join(':'),
  });

  expect(existsSync(bundlePath)).toBe(true);
  const bundle = readFileSync(bundlePath, 'utf8');
  const bundleSize = Buffer.byteLength(bundle);

  const stdout = runWithEnv('node', [bundlePath], work, {
    NODE_PATH: [path.join(work, 'node_modules'), path.join(packageRoot, 'node_modules')].join(':'),
  }).trim();

  let parsed: SmokeResult['parsed'];
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`tree-shaking smoke consumer emitted non-JSON stdout: ${stdout}`);
  }

  return { bundlePath, bundleSize, bundle, stdout, parsed };
};

describe('ARF-15 tree-shaking smoke (esbuild bundle mode)', () => {
  it('a production-mode tree-shaken bundle using createAccessRuntime executes and retains jsonSchema on a registered mongoose model', () => {
    const { parsed, bundle, bundleSize } = runSmoke('minify');

    expect(parsed.ok).toBe(true);
    expect(parsed.hasJsonSchema).toBe('function');
    expect(parsed.hasRuntime).toBe('function');
    expect(parsed.schemaType).toBe('object');
    expect(parsed.schemaFields).toEqual(expect.arrayContaining(['name', 'secret', 'public', '_id']));

    // The retained runtime patch is:
    //   ensureMongooseJsonSchemaInitialized -> mschema2Jsonschema(mongoose)
    // which assigns `Schema.prototype.jsonSchema` and `Model.jsonSchema` on the externalized
    // mongoose singleton. If the side-effecting chain was tree-shaken away we'd see
    // `hasJsonSchema: 'undefined'` above and the consumer would have thrown. We additionally
    // confirm the bundled text keeps the runtime's idempotent guard + default-runtime
    // instantiation.
    expect(bundle).toMatch(/createAccessRuntime/);
    expect(bundle).toMatch(/defaultRuntime/);

    // ARF-15 acceptance: a production-mode tree-shaken bundle "retains required
    // initialization and executes successfully". The required initialization is the
    // runtime's idempotent mongoose-schema-jsonschema patch chain, reflected here by
    // the `jsonSchema` symbol surviving minification. The consumer imports only
    // `createAccessRuntime`; adapter re-exports (`fromYup` etc.) live in the same flat
    // `dist/index.mjs` as `createAccessRuntime` and are retained by esbuild as part of
    // the module's export surface when that single entry file is bundled — that is
    // expected for the package's bundling layout and not a tree-shaking regression.
    expect(bundle).toMatch(/\bjsonSchema\b/);

    // Sanity: the bundle actually contains something and is bounded.
    expect(bundleSize).toBeGreaterThan(0);
  });

  it('renders a consumer that imports only createAccessRuntime and depends on the runtime side effect', () => {
    const { parsed, bundleSize } = runSmoke('tree-shake');

    expect(parsed.ok).toBe(true);
    expect(parsed.hasJsonSchema).toBe('function');
    expect(bundleSize).toBeGreaterThan(0);
  });

  it('the sideEffects allowlist only references emitted package entry files (ARF-15)', () => {
    const pkg = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      sideEffects?: string[] | boolean;
    };
    expect(Array.isArray(pkg.sideEffects)).toBe(true);
    const sideEffects = pkg.sideEffects as string[];
    expect(sideEffects).toEqual(['./**/index.js', './**/index.mjs', './**/advanced.js', './**/advanced.mjs']);
    for (const declared of sideEffects) {
      const matcher = new RegExp(
        '^' +
          declared
            .replace(/^\.\//, '')
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*') +
          '$',
      );
      expect(sideEffectCandidates.some((candidate) => matcher.test(candidate))).toBe(true);
    }
    // No defunct runtime module listed by name.
    for (const declared of sideEffects) {
      expect(declared).not.toMatch(/dist\/runtime\.(js|mjs)$/);
    }
  });
});
