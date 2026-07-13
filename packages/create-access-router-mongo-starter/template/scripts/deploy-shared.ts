/**
 * Provider-agnostic deployment preparation for the access-router-mongo-starter.
 *
 * Owns the parts of a deploy that are the same regardless of target cloud:
 *   - sandbox / ephemeral directory resolution
 *   - frontend (Vite) build
 *   - backend serverless bundle (`wtt-express-runtime build`)
 *   - artifact path metadata returned to provider adapters
 *
 * Provider-specific concerns (site lookup, config generation, CLI calls, env
 * management) live in the corresponding adapter script (e.g.
 * `deploy-netlify.ts`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const SOURCE_DIR = resolve(import.meta.dirname, '..');
export const EPHEMERAL_ROOT = '/tmp/opencode';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BailError';
  }
}

export function bail(msg: string): never {
  throw new BailError(msg);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SharedDeployOptions {
  apiBaseUrl: string | undefined;
  apiBaseUrlExplicit: boolean;
  mongodbUri: string | undefined;
  distDir: string;
  functionsDir: string;
  functionsName: string;
  noBuild: boolean;
  dryRun: boolean;
  ephemeral: boolean;
  sandboxDir: string | undefined;
  keepSandbox: boolean;
}

export interface DeployPaths {
  deployDir: string;
  distAbs: string;
  functionsAbs: string;
  isEphemeral: boolean;
}

/** Prepared artifact metadata returned to provider adapters after building. */
export interface PreparedDeployment {
  paths: DeployPaths;
  options: SharedDeployOptions;
  buildEnv: NodeJS.ProcessEnv;
}

export const SHARED_DEFAULTS: SharedDeployOptions = {
  apiBaseUrl: undefined,
  apiBaseUrlExplicit: false,
  mongodbUri: undefined,
  distDir: 'dist',
  functionsDir: 'netlify/functions',
  functionsName: 'main',
  noBuild: false,
  dryRun: false,
  ephemeral: false,
  sandboxDir: undefined,
  keepSandbox: false,
};

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

export function linkNodeModules(deployDir: string, dry: boolean): void {
  const target = resolve(deployDir, 'node_modules');
  if (existsSync(target)) return;
  if (dry) return;
  symlinkSync(resolve(SOURCE_DIR, 'node_modules'), target, 'dir');
}

export function resolvePaths(options: SharedDeployOptions): DeployPaths {
  if (options.ephemeral) {
    if (options.sandboxDir) {
      bail('--ephemeral and --sandbox-dir are mutually exclusive.');
    }
    const prefix = join(EPHEMERAL_ROOT, 'access-router-mongo-starter-deploy-');
    const deployDir = options.dryRun ? `${prefix}<tmp>` : mkdtempSync(prefix);
    linkNodeModules(deployDir, options.dryRun);
    return {
      deployDir,
      distAbs: resolve(deployDir, options.distDir),
      functionsAbs: resolve(deployDir, options.functionsDir),
      isEphemeral: true,
    };
  }

  if (options.sandboxDir) {
    const deployDir = resolve(options.sandboxDir);
    if (!options.dryRun) mkdirSync(deployDir, { recursive: true });
    linkNodeModules(deployDir, options.dryRun);
    return {
      deployDir,
      distAbs: resolve(deployDir, options.distDir),
      functionsAbs: resolve(deployDir, options.functionsDir),
      isEphemeral: false,
    };
  }

  return {
    deployDir: SOURCE_DIR,
    distAbs: resolve(SOURCE_DIR, options.distDir),
    functionsAbs: resolve(SOURCE_DIR, options.functionsDir),
    isEphemeral: false,
  };
}

// ---------------------------------------------------------------------------
// Command runner
// ---------------------------------------------------------------------------

/**
 * Run a command. Build commands run from SOURCE_DIR (so relative source paths
 * like `./api/app.ts` resolve); deploy commands run from the provided cwd
 * (the sandbox or repo dir).
 */
export function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, dry: boolean, cwd: string = SOURCE_DIR): void {
  const pretty = `${cmd} ${args.join(' ')}`;
  const cwdTag = cwd !== SOURCE_DIR ? `  (cwd: ${cwd})` : '';
  console.log(`\n$ ${pretty}${cwdTag}`);
  if (dry) return;
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd, env, shell: false });
  if (r.error) {
    if ((r.error as NodeJS.ErrnoException).code === 'ENOENT') {
      bail(`Command not found: ${cmd}. Install it or add it to PATH.`);
    }
    throw r.error;
  }
  if (r.status !== 0) bail(`Command failed (exit ${r.status}): ${pretty}`);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Build the frontend (Vite) and serverless backend (`wtt-express-runtime
 * build`). Returns the prepared deployment metadata for provider adapters.
 */
export function buildArtifacts(options: SharedDeployOptions, paths: DeployPaths): PreparedDeployment {
  const buildEnv: NodeJS.ProcessEnv = {
    ...process.env,
    VITE_API_BASE_URL: options.apiBaseUrl,
  };
  if (options.mongodbUri) buildEnv.MONGODB_URI = options.mongodbUri;

  if (options.noBuild) {
    console.log('\n─ Skipping build steps (--no-build) ─');
    return { paths, options, buildEnv };
  }

  console.log('\n─ Building frontend (vite build) ─');
  run('vite', ['build', '--outDir', paths.distAbs, '--emptyOutDir'], buildEnv, options.dryRun, SOURCE_DIR);

  console.log('\n─ Building serverless backend (wtt-express-runtime build) ─');
  run(
    'wtt-express-runtime',
    [
      'build',
      './api/app.ts',
      '--init',
      './api/init.ts',
      '--out-dir',
      paths.functionsAbs,
      '--out-name',
      options.functionsName,
      '--format',
      'cjs',
      '--target',
      'node20',
    ],
    buildEnv,
    options.dryRun,
    SOURCE_DIR,
  );

  return { paths, options, buildEnv };
}

// ---------------------------------------------------------------------------
// Sandbox cleanup
// ---------------------------------------------------------------------------

export function cleanupSandbox(paths: DeployPaths, keepSandbox: boolean, dryRun: boolean): void {
  if (!paths.isEphemeral || dryRun) return;
  if (keepSandbox) {
    console.log(`\n• Ephemeral sandbox kept at ${paths.deployDir} (--keep-sandbox)`);
    return;
  }
  console.log(`\n─ Cleaning up ephemeral sandbox: ${paths.deployDir} ─`);
  rmSync(paths.deployDir, { recursive: true, force: true });
  console.log('  Removed.');
}

export function keepSandboxOnFailure(paths: DeployPaths): void {
  if (paths.isEphemeral) {
    console.error(`\n✖ Ephemeral sandbox kept at ${paths.deployDir} for debugging.`);
  }
}
