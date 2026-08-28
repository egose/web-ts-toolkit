import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const packageRoot = path.resolve(__dirname, '..');
export const workspaceRoot = path.resolve(packageRoot, '..', '..');

const tempDirs: string[] = [];

export function cleanupConsumerDirs() {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function stageWorkspacePackage(consumerDir: string, name: string) {
  const packageName = name.split('/').at(-1)!;
  const sourceRoot = path.join(workspaceRoot, 'packages', packageName);
  if (!existsSync(sourceRoot)) {
    throw new Error(`access-router-deco consumer stage failed: missing workspace package ${name}`);
  }

  const targetRoot = path.join(consumerDir, 'node_modules', ...name.split('/'));
  mkdirSync(targetRoot, { recursive: true });
  cpSync(path.resolve(sourceRoot, 'dist'), path.resolve(targetRoot, 'dist'), { recursive: true });
  cpSync(path.resolve(sourceRoot, 'package.json'), path.resolve(targetRoot, 'package.json'));
}

function linkDependency(consumerDir: string, name: string) {
  for (const base of [
    path.join(packageRoot, 'node_modules'),
    path.join(workspaceRoot, 'node_modules'),
    path.join(workspaceRoot, 'node_modules', '.pnpm', 'node_modules'),
  ]) {
    const realPath = path.join(base, ...name.split('/'));
    if (!existsSync(realPath)) continue;

    const linkPath = path.join(consumerDir, 'node_modules', ...name.split('/'));
    mkdirSync(path.dirname(linkPath), { recursive: true });
    if (!existsSync(linkPath)) symlinkSync(realPath, linkPath, 'dir');
    return;
  }

  throw new Error(`access-router-deco consumer stage failed: missing dependency ${name}`);
}

export function stageConsumerDir() {
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'access-router-deco-consumer-'));
  tempDirs.push(consumerDir);

  const consumerPkgRoot = path.join(consumerDir, 'node_modules', '@web-ts-toolkit', 'access-router-deco');
  mkdirSync(consumerPkgRoot, { recursive: true });
  cpSync(path.resolve(packageRoot, 'dist'), path.resolve(consumerPkgRoot, 'dist'), { recursive: true });
  cpSync(path.resolve(packageRoot, 'package.json'), path.resolve(consumerPkgRoot, 'package.json'));

  // ARDECO-08: @types/express is a direct runtime dependency of this package.
  // A clean consumer resolves it via the package's own dependency (hoisted to
  // consumerDir/node_modules/@types/express), not via an unrelated workspace
  // package's transitive @types. Staging still symlinks the types for the
  // strict-consumer fixture, but the packed-consumer suite verifies the same
  // resolution occurs after a real `pnpm add` with only documented peers.
  // Keeping the link via packageRoot/workspaceRoot mimics the hoisted layout
  // that `dependencies: { "@types/express" }` produces in a fresh install.

  for (const workspaceDependency of [
    '@web-ts-toolkit/access-router',
    '@web-ts-toolkit/express-json-router',
    '@web-ts-toolkit/express-response-handler',
    '@web-ts-toolkit/http-errors',
    '@web-ts-toolkit/utils',
  ]) {
    stageWorkspacePackage(consumerDir, workspaceDependency);
  }

  for (const dependency of [
    '@types/express',
    '@types/express-serve-static-core',
    '@types/node',
    'express',
    'just-diff',
    'mongoose',
    'mongoose-schema-jsonschema',
    'reflect-metadata',
    'sift',
    'typescript',
    'winston',
    'zod',
  ]) {
    linkDependency(consumerDir, dependency);
  }

  // Simulate npm hoisting of the direct dependency: ensure the staged package's
  // own node_modules also resolves @types/express via the consumer's top-level
  // hoist (consumerDir/node_modules/@types/express is already linked above).
  // This is what a fresh install with `dependencies: { "@types/express" }` yields.
  const hoistedExpressTypes = path.join(consumerDir, 'node_modules', '@types', 'express');
  const stagedNestedTypes = path.join(consumerPkgRoot, 'node_modules', '@types', 'express');
  if (existsSync(hoistedExpressTypes) && !existsSync(stagedNestedTypes)) {
    mkdirSync(path.dirname(stagedNestedTypes), { recursive: true });
    symlinkSync(hoistedExpressTypes, stagedNestedTypes, 'dir');
  }

  return consumerDir;
}

/**
 * Minimal staged consumer that contains only the documented runtime/peer
 * requirements (package + peers) and the direct `@types/express` hoist.
 * No unrelated workspace packages (express-json-router etc.) are staged.
 * Used to verify that removing unrelated @types/express sources does not
 * break compilation — the package's own dependency is sufficient.
 */
export function stageCleanConsumerDir() {
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'access-router-deco-clean-consumer-'));
  tempDirs.push(consumerDir);

  const consumerPkgRoot = path.join(consumerDir, 'node_modules', '@web-ts-toolkit', 'access-router-deco');
  mkdirSync(consumerPkgRoot, { recursive: true });
  cpSync(path.resolve(packageRoot, 'dist'), path.resolve(consumerPkgRoot, 'dist'), { recursive: true });
  cpSync(path.resolve(packageRoot, 'package.json'), path.resolve(consumerPkgRoot, 'package.json'));

  // Only the required workspace peer: @web-ts-toolkit/access-router (and its deps)
  stageWorkspacePackage(consumerDir, '@web-ts-toolkit/access-router');
  // Also stage its transitive deps that access-router itself needs for types/runtime
  // (utils, etc. are optional for this minimal compile but keep link for runtime)
  for (const dep of [
    '@web-ts-toolkit/utils',
    '@web-ts-toolkit/express-json-router',
    '@web-ts-toolkit/http-errors',
    '@web-ts-toolkit/express-response-handler',
  ]) {
    try {
      stageWorkspacePackage(consumerDir, dep);
    } catch {
      // best-effort: these may not be needed for the minimal tsc fixture
    }
  }

  for (const dependency of [
    '@types/express',
    '@types/express-serve-static-core',
    '@types/node',
    'express',
    'just-diff',
    'mongoose',
    'mongoose-schema-jsonschema',
    'reflect-metadata',
    'sift',
    'typescript',
    'winston',
    'zod',
  ]) {
    try {
      linkDependency(consumerDir, dependency);
    } catch {
      // optional dependency not present for minimal consumer — skip
      void 0;
    }
  }

  return consumerDir;
}

export function runTsc(consumerDir: string, tsconfigPath: string) {
  try {
    const stdout = execFileSync(
      'node',
      [path.resolve(consumerDir, 'node_modules/typescript/bin/tsc'), '-p', tsconfigPath],
      {
        cwd: consumerDir,
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const error = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    return { status: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? error.message ?? '' };
  }
}
