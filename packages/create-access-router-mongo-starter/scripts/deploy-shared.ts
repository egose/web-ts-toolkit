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
 *
 * When used as a package bin, the project root defaults to the caller's
 * working directory. Override with `--project-root <path>` when the deploy
 * target is not the current directory.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const SOURCE_DIR = resolve(process.cwd());
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
  projectRoot: string;
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

export function projectRootOf(options: SharedDeployOptions): string {
  return resolve(options.projectRoot);
}

export const SHARED_DEFAULTS: SharedDeployOptions = {
  projectRoot: SOURCE_DIR,
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

export function linkNodeModules(deployDir: string, projectRoot: string, dry: boolean): void {
  const target = resolve(deployDir, 'node_modules');
  if (existsSync(target)) return;
  if (dry) return;
  symlinkSync(resolve(projectRoot, 'node_modules'), target, 'dir');
}

export function resolvePaths(options: SharedDeployOptions): DeployPaths {
  const projectRoot = projectRootOf(options);

  if (options.ephemeral) {
    if (options.sandboxDir) {
      bail('--ephemeral and --sandbox-dir are mutually exclusive.');
    }
    const prefix = join(EPHEMERAL_ROOT, 'access-router-mongo-starter-deploy-');
    const deployDir = options.dryRun ? `${prefix}<tmp>` : mkdtempSync(prefix);
    linkNodeModules(deployDir, projectRoot, options.dryRun);
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
    linkNodeModules(deployDir, projectRoot, options.dryRun);
    return {
      deployDir,
      distAbs: resolve(deployDir, options.distDir),
      functionsAbs: resolve(deployDir, options.functionsDir),
      isEphemeral: false,
    };
  }

  return {
    deployDir: projectRoot,
    distAbs: resolve(projectRoot, options.distDir),
    functionsAbs: resolve(projectRoot, options.functionsDir),
    isEphemeral: false,
  };
}

// ---------------------------------------------------------------------------
// Command runner
// ---------------------------------------------------------------------------

/**
 * Redact known secret values from a command pretty-print string so auth
 * tokens and connection strings don't leak into stdout or CI logs.
 *
 * Each value in `secrets` that appears in the command string is replaced
 * with `[REDACTED]`.
 */
export function redactCommand(pretty: string, secrets: Iterable<string>): string {
  let result = pretty;
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      result = result.split(secret).join('[REDACTED]');
    }
  }
  return result;
}

/**
 * Build the set of secret values to redact from command pretty-prints.
 * Collects truthy, non-empty strings into an array.
 */
export function collectSecrets(...values: (string | undefined)[]): string[] {
  return values.filter((v): v is string => !!v && v.length > 0);
}

function formatCommandLog(cmd: string, args: string[], cwd: string, secrets: string[]): string {
  const pretty = `${cmd} ${args.join(' ')}`;
  const redacted = secrets.length > 0 ? redactCommand(pretty, secrets) : pretty;
  const cwdTag = cwd !== SOURCE_DIR ? `  (cwd: ${cwd})` : '';
  return `$ ${redacted}${cwdTag}`;
}

/**
 * Run a command. Build commands run from projectRoot (so relative source
 * paths like `./api/app.ts` resolve); deploy commands run from the provided
 * cwd (the sandbox or repo dir).
 *
 * Pass `secrets` to redact sensitive values from the logged command line.
 * The actual spawned process still receives the real values — only the
 * console log is masked.
 */
export function run(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  dry: boolean,
  cwd: string = SOURCE_DIR,
  secrets: string[] = [],
): void {
  console.log(`\n${formatCommandLog(cmd, args, cwd, secrets)}`);
  if (dry) return;
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd, env, shell: false });
  if (r.error) {
    if ((r.error as NodeJS.ErrnoException).code === 'ENOENT') {
      bail(`Command not found: ${cmd}. Install it or add it to PATH.`);
    }
    throw r.error;
  }
  if (r.status !== 0) bail(`Command failed (exit ${r.status}): ${formatCommandLog(cmd, args, cwd, secrets)}`);
}

/**
 * Run a command and capture stdout (stderr is inherited for live output).
 * Returns the raw stdout string. In dry-run mode, prints the command and
 * returns an empty string.
 *
 * Pass `secrets` to redact sensitive values from the logged command line.
 */
export function runCapture(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  dry: boolean,
  cwd: string = SOURCE_DIR,
  secrets: string[] = [],
): string {
  console.log(`\n${formatCommandLog(cmd, args, cwd, secrets)}`);
  if (dry) return '';
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], cwd, env, shell: false, encoding: 'utf-8' });
  if (r.error) {
    if ((r.error as NodeJS.ErrnoException).code === 'ENOENT') {
      bail(`Command not found: ${cmd}. Install it or add it to PATH.`);
    }
    throw r.error;
  }
  if (r.status !== 0) bail(`Command failed (exit ${r.status}): ${formatCommandLog(cmd, args, cwd, secrets)}`);
  return r.stdout ?? '';
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
  const projectRoot = projectRootOf(options);

  if (options.noBuild) {
    console.log('\n─ Skipping build steps (--no-build) ─');
    return { paths, options, buildEnv };
  }

  console.log('\n─ Building frontend (vite build) ─');
  run('vite', ['build', '--outDir', paths.distAbs, '--emptyOutDir'], buildEnv, options.dryRun, projectRoot);

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
    projectRoot,
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

// ---------------------------------------------------------------------------
// CLI entrypoint (bin)
// ---------------------------------------------------------------------------

const SHARED_HELP = `access-router-mongo-starter deploy-shared

Provider-agnostic build preparation for the access-router-mongo-starter.
Runs the frontend (Vite) and serverless (wtt-express-runtime) builds and
prints the prepared artifact paths. Provider adapters (e.g. deploy-netlify)
call this internally; you usually don't need to run it directly.

Usage: create-access-router-mongo-starter-deploy-shared [options]

Options:
      --project-root <path>  Target app directory (default: current directory)
      --api-base-url <url>   VITE_API_BASE_URL for the frontend build
      --mongodb-uri <uri>    MONGODB_URI for the serverless function
                             (env: MONGODB_URI)
      --dist-dir <path>      Frontend publish dir (default: "dist")
      --functions-dir <path> Serverless output dir (default: "netlify/functions")
      --functions-name <name> Serverless function name (default: "main")
      --no-build             Skip the build steps; report existing artifacts
      --ephemeral            Build into a temp dir under /tmp/opencode and
                             remove it on success (keep with --keep-sandbox)
      --sandbox-dir <path>   Build into the given directory (persistent)
      --keep-sandbox         With --ephemeral, keep the sandbox after build
      --dry-run              Print the commands without running them
  -h, --help                 Show this help
`;

function parseSharedArgs(argv: string[]): SharedDeployOptions {
  const o: SharedDeployOptions = {
    ...SHARED_DEFAULTS,
    projectRoot: process.cwd(),
    mongodbUri: process.env.MONGODB_URI,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-')) throw new Error(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case '--project-root':
        o.projectRoot = next();
        break;
      case '--api-base-url':
        o.apiBaseUrl = next();
        o.apiBaseUrlExplicit = true;
        break;
      case '--mongodb-uri':
        o.mongodbUri = next();
        break;
      case '--dist-dir':
        o.distDir = next();
        break;
      case '--functions-dir':
        o.functionsDir = next();
        break;
      case '--functions-name':
        o.functionsName = next();
        break;
      case '--no-build':
        o.noBuild = true;
        break;
      case '--ephemeral':
        o.ephemeral = true;
        break;
      case '--sandbox-dir':
        o.sandboxDir = next();
        break;
      case '--keep-sandbox':
        o.keepSandbox = true;
        break;
      case '--dry-run':
        o.dryRun = true;
        break;
      case '-h':
      case '--help':
        process.stdout.write(SHARED_HELP);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${a}\n\n${SHARED_HELP}`);
    }
  }
  return o;
}

export function main() {
  let options: SharedDeployOptions;
  try {
    options = parseSharedArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`\n✖ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const paths = resolvePaths(options);
  buildArtifacts(options, paths);
  cleanupSandbox(paths, options.keepSandbox, options.dryRun);
  console.log('\n✓ Build finished.');
  console.log(`  distAbs:      ${paths.distAbs}`);
  console.log(`  functionsAbs: ${paths.functionsAbs}`);
}
