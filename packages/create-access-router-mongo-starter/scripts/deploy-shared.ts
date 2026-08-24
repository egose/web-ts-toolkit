/**
 * Provider-agnostic deployment preparation for the access-router-mongo-starter.
 *
 * Owns the parts of a deploy that are the same regardless of target cloud:
 *   - sandbox / ephemeral directory resolution
 *   - frontend (Vite) build
 *   - backend serverless bundle (`wtt-access-router-runtime build-serverless`)
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
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  type Stats,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { readRequiredOptionValue } from '../src/shared/arg-parser';
import { bail } from '../src/shared/bail';
import { normalizeApiBaseURL } from '../template/src/shared/normalize-api-base-url';

export { BailError, bail } from '../src/shared/bail';

export const SOURCE_DIR = resolve(process.cwd());
export const EPHEMERAL_ROOT = tmpdir();

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
  cleanupIdentity?: DirectoryIdentity;
}

interface DirectoryIdentity {
  realPath: string;
  dev: number;
  ino: number;
}

/** Prepared artifact metadata returned to provider adapters after building. */
export interface PreparedDeployment {
  paths: DeployPaths;
  options: SharedDeployOptions;
  frontendEnv: NodeJS.ProcessEnv;
  backendEnv: NodeJS.ProcessEnv;
}

export interface SharedDeployServices {
  parentEnv: NodeJS.ProcessEnv;
  exists(path: string): boolean;
  mkdir(path: string): void;
  mkdtemp(prefix: string): string;
  lstat(path: string): Stats;
  realpath(path: string): string;
  remove(path: string): void;
  symlink(source: string, target: string): void;
  run(command: string, args: string[], env: NodeJS.ProcessEnv, dryRun: boolean, cwd: string, secrets?: string[]): void;
  log(message?: string): void;
  error(message?: string): void;
}

export interface ArtifactInspectionServices {
  stat(path: string): Stats;
  readDirectory(path: string): string[];
}

const DEFAULT_SERVICES: SharedDeployServices = {
  parentEnv: process.env,
  exists: existsSync,
  mkdir: (path) => mkdirSync(path, { recursive: true }),
  mkdtemp: mkdtempSync,
  lstat: lstatSync,
  realpath: (path) => realpathSync(path),
  remove: (path) => rmSync(path, { recursive: true, force: true }),
  symlink: (source, target) => symlinkSync(source, target, 'dir'),
  run,
  log: (message = '') => console.log(message),
  error: (message = '') => console.error(message),
};

const DEFAULT_ARTIFACT_SERVICES: ArtifactInspectionServices = {
  stat: statSync,
  readDirectory: readdirSync,
};

/**
 * Variables required for executable lookup, temporary/home directories, basic
 * terminal behavior, and locale handling across supported platforms.
 * Application credentials and arbitrary parent configuration are deliberately
 * excluded.
 */
export const CHILD_ENV_ALLOWLIST = [
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'SYSTEMROOT',
  'ComSpec',
  'COMSPEC',
  'WINDIR',
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'CI',
] as const;

export function createChildEnvironment(
  parentEnv: NodeJS.ProcessEnv,
  additions: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    if (parentEnv[key] !== undefined) env[key] = parentEnv[key];
  }
  for (const [key, value] of Object.entries(additions)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
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

function tryLstat(path: string, services: SharedDeployServices): Stats | undefined {
  try {
    return services.lstat(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
    throw error;
  }
}

function canonicalProjectedPath(path: string, services: SharedDeployServices): string {
  const absolutePath = resolve(path);
  let ancestor = absolutePath;

  while (!tryLstat(ancestor, services)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) bail(`Cannot resolve an existing ancestor for path: ${path}`);
    ancestor = parent;
  }

  return resolve(services.realpath(ancestor), relative(ancestor, absolutePath));
}

function isStrictDescendant(parent: string, candidate: string): boolean {
  const remainder = relative(parent, candidate);
  return remainder.length > 0 && remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder);
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function validateSandboxOutputOption(option: '--dist-dir' | '--functions-dir', value: string): void {
  if (!value.trim()) bail(`${option} must be a non-empty relative path in sandbox mode.`);
  if (hasControlCharacters(value)) bail(`${option} must not contain control characters.`);
  if (isAbsolute(value) || win32.isAbsolute(value)) {
    bail(`${option} must be a relative path in sandbox mode.`);
  }
  if (value.split(/[\\/]+/u).includes('..')) {
    bail(`${option} must not contain ".." path segments in sandbox mode.`);
  }
}

export function validateSharedDeployOptions(options: SharedDeployOptions): SharedDeployOptions {
  const validated = { ...options };
  validated.projectRoot = validated.projectRoot.trim();
  validated.distDir = validated.distDir.trim();
  validated.functionsDir = validated.functionsDir.trim();
  validated.functionsName = validated.functionsName.trim();
  validated.sandboxDir = validated.sandboxDir?.trim() || undefined;
  validated.apiBaseUrl = validated.apiBaseUrl?.trim() || undefined;
  validated.mongodbUri = validated.mongodbUri?.trim() || undefined;

  if (!validated.projectRoot) bail('--project-root must not be empty.');
  if (!validated.distDir) bail('--dist-dir must not be empty.');
  if (!validated.functionsDir) bail('--functions-dir must not be empty.');
  if (hasControlCharacters(validated.distDir)) {
    bail('--dist-dir must not contain control characters.');
  }
  if (hasControlCharacters(validated.functionsDir)) {
    bail('--functions-dir must not contain control characters.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/u.test(validated.functionsName)) {
    bail('--functions-name must be 1-63 letters, digits, hyphens, or underscores and start with a letter or digit.');
  }
  if (validated.ephemeral && validated.sandboxDir) bail('--ephemeral and --sandbox-dir are mutually exclusive.');
  if (validated.ephemeral || validated.sandboxDir) {
    validateSandboxOutputOption('--dist-dir', validated.distDir);
    validateSandboxOutputOption('--functions-dir', validated.functionsDir);
  }
  if (validated.apiBaseUrl) validated.apiBaseUrl = normalizeApiBaseURL(validated.apiBaseUrl, '--api-base-url');
  if (!validated.mongodbUri) {
    bail('--mongodb-uri or MONGODB_URI is required because every deployment includes the serverless backend.');
  }
  try {
    const parsed = new URL(validated.mongodbUri);
    if (
      !['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.hash ||
      /\s/u.test(validated.mongodbUri) ||
      (parsed.protocol === 'mongodb+srv:' && parsed.port)
    ) {
      throw new Error('invalid MongoDB URI');
    }
  } catch {
    bail('--mongodb-uri or MONGODB_URI must be a valid MongoDB connection string.');
  }
  return validated;
}

function resolveSandboxOutputs(
  deployDir: string,
  options: SharedDeployOptions,
  services: SharedDeployServices,
): Pick<DeployPaths, 'distAbs' | 'functionsAbs'> {
  validateSandboxOutputOption('--dist-dir', options.distDir);
  validateSandboxOutputOption('--functions-dir', options.functionsDir);

  const canonicalDeployDir = canonicalProjectedPath(deployDir, services);
  const resolveOutput = (option: '--dist-dir' | '--functions-dir', value: string): string => {
    const output = resolve(deployDir, value);
    const canonicalOutput = canonicalProjectedPath(output, services);
    if (!isStrictDescendant(canonicalDeployDir, canonicalOutput)) {
      bail(`${option} must resolve to a path strictly inside the sandbox directory.`);
    }
    return output;
  };

  return {
    distAbs: resolveOutput('--dist-dir', options.distDir),
    functionsAbs: resolveOutput('--functions-dir', options.functionsDir),
  };
}

function directoryIdentity(path: string, services: SharedDeployServices): DirectoryIdentity {
  const stat = services.lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    bail(`Expected the ephemeral sandbox to be a directory: ${path}`);
  }
  return { realPath: services.realpath(path), dev: stat.dev, ino: stat.ino };
}

export function linkNodeModules(
  deployDir: string,
  projectRoot: string,
  dry: boolean,
  services: SharedDeployServices = DEFAULT_SERVICES,
): void {
  const target = resolve(deployDir, 'node_modules');
  if (services.exists(target)) return;
  if (dry) return;
  services.symlink(resolve(projectRoot, 'node_modules'), target);
}

export function resolvePaths(
  options: SharedDeployOptions,
  services: SharedDeployServices = DEFAULT_SERVICES,
): DeployPaths {
  const projectRoot = projectRootOf(options);

  if (options.ephemeral) {
    if (options.sandboxDir) {
      bail('--ephemeral and --sandbox-dir are mutually exclusive.');
    }
    validateSandboxOutputOption('--dist-dir', options.distDir);
    validateSandboxOutputOption('--functions-dir', options.functionsDir);
    const prefix = join(EPHEMERAL_ROOT, 'create-access-router-mongo-starter-deploy-');
    const deployDir = options.dryRun ? `${prefix}<tmp>` : services.mkdtemp(prefix);
    const outputs = resolveSandboxOutputs(deployDir, options, services);
    const cleanupIdentity = options.dryRun ? undefined : directoryIdentity(deployDir, services);
    linkNodeModules(deployDir, projectRoot, options.dryRun, services);
    return {
      deployDir,
      ...outputs,
      isEphemeral: true,
      cleanupIdentity,
    };
  }

  if (options.sandboxDir) {
    validateSandboxOutputOption('--dist-dir', options.distDir);
    validateSandboxOutputOption('--functions-dir', options.functionsDir);
    const deployDir = resolve(options.sandboxDir);
    if (!options.dryRun) services.mkdir(deployDir);
    const outputs = resolveSandboxOutputs(deployDir, options, services);
    linkNodeModules(deployDir, projectRoot, options.dryRun, services);
    return {
      deployDir,
      ...outputs,
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
 * paths like `./api/access-router.config.ts` resolve); deploy commands run from the provided
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
 * Build the frontend (Vite) and serverless backend (`wtt-access-router-runtime
 * build-serverless`). Returns the prepared deployment metadata for provider adapters.
 */
export function buildArtifacts(
  options: SharedDeployOptions,
  paths: DeployPaths,
  services: Pick<SharedDeployServices, 'parentEnv' | 'run' | 'log'> = DEFAULT_SERVICES,
): PreparedDeployment {
  const frontendEnv = createChildEnvironment(services.parentEnv, {
    API_BASE_URL: options.apiBaseUrl,
  });
  const backendEnv = createChildEnvironment(services.parentEnv, {
    API_BASE_URL: options.apiBaseUrl,
    MONGODB_URI: options.mongodbUri,
  });
  const projectRoot = projectRootOf(options);

  if (options.noBuild) {
    services.log('\n─ Skipping build steps (--no-build) ─');
    return { paths, options, frontendEnv, backendEnv };
  }

  services.log('\n─ Building frontend (vite build) ─');
  services.run('vite', ['build', '--outDir', paths.distAbs, '--emptyOutDir'], frontendEnv, options.dryRun, projectRoot);

  services.log('\n─ Building serverless backend (wtt-access-router-runtime build-serverless) ─');
  services.run(
    'wtt-access-router-runtime',
    [
      'build-serverless',
      './api/access-router.config.ts',
      '--out-dir',
      paths.functionsAbs,
      '--out-name',
      options.functionsName,
      '--format',
      'cjs',
      '--target',
      'node22',
    ],
    backendEnv,
    options.dryRun,
    projectRoot,
  );

  return { paths, options, frontendEnv, backendEnv };
}

export function inspectArtifacts(
  options: SharedDeployOptions,
  paths: DeployPaths,
  services: ArtifactInspectionServices = DEFAULT_ARTIFACT_SERVICES,
): void {
  const requireNonEmptyFile = (path: string, label: string): void => {
    let stat: Stats;
    try {
      stat = services.stat(path);
    } catch {
      bail(`${label} is missing: ${path}`);
    }
    if (!stat.isFile() || stat.size === 0) {
      bail(`${label} must be a non-empty file: ${path}`);
    }
  };
  const requireNonEmptyDirectory = (path: string, label: string): void => {
    let stat: Stats;
    try {
      stat = services.stat(path);
    } catch {
      bail(`${label} is missing: ${path}`);
    }
    if (!stat.isDirectory() || services.readDirectory(path).length === 0) {
      bail(`${label} must be a non-empty directory: ${path}`);
    }
  };

  requireNonEmptyDirectory(paths.distAbs, 'Frontend artifact directory');
  requireNonEmptyFile(resolve(paths.distAbs, 'index.html'), 'Frontend entry artifact');
  requireNonEmptyDirectory(paths.functionsAbs, 'Functions artifact directory');
  requireNonEmptyFile(resolve(paths.functionsAbs, `${options.functionsName}.js`), 'Serverless function artifact');
}

// ---------------------------------------------------------------------------
// Sandbox cleanup
// ---------------------------------------------------------------------------

export function cleanupSandbox(
  paths: DeployPaths,
  keepSandbox: boolean,
  dryRun: boolean,
  services: SharedDeployServices = DEFAULT_SERVICES,
): void {
  if (!paths.isEphemeral || dryRun) return;
  if (keepSandbox) {
    services.log(`\n• Ephemeral sandbox kept at ${paths.deployDir} (--keep-sandbox)`);
    return;
  }
  const identity = paths.cleanupIdentity;
  if (!identity) bail(`Refusing to clean an ephemeral sandbox not created by this invocation: ${paths.deployDir}`);
  const current = tryLstat(paths.deployDir, services);
  if (
    !current ||
    !current.isDirectory() ||
    current.isSymbolicLink() ||
    current.dev !== identity.dev ||
    current.ino !== identity.ino ||
    services.realpath(paths.deployDir) !== identity.realPath
  ) {
    bail(`Refusing to clean an ephemeral sandbox that was replaced after creation: ${paths.deployDir}`);
  }
  services.log(`\n─ Cleaning up ephemeral sandbox: ${paths.deployDir} ─`);
  services.remove(paths.deployDir);
  services.log('  Removed.');
}

export function keepSandboxOnFailure(paths: DeployPaths, services: SharedDeployServices = DEFAULT_SERVICES): void {
  if (paths.isEphemeral) {
    services.error(`\n✖ Ephemeral sandbox kept at ${paths.deployDir} for debugging.`);
  }
}

// ---------------------------------------------------------------------------
// CLI entrypoint (bin)
// ---------------------------------------------------------------------------

export const SHARED_HELP = `access-router-mongo-starter deploy-shared

Provider-agnostic build preparation for the access-router-mongo-starter.
Runs the frontend (Vite) and serverless (wtt-access-router-runtime) builds and
prints the prepared artifact paths. Provider adapters (e.g. deploy-netlify)
call this internally; you usually don't need to run it directly.

Usage: create-access-router-mongo-starter-deploy-shared [options]

Options:
      --project-root <path>  Target app directory (default: current directory)
      --api-base-url <path>  Path-only API_BASE_URL for frontend and backend
      --mongodb-uri <uri>    Required MONGODB_URI for the serverless function
                             (prefer env: MONGODB_URI, to keep it out of shell history)
      --dist-dir <path>      Frontend publish dir (default: "dist"); must be a
                             contained relative path in sandbox modes
      --functions-dir <path> Serverless output dir (default: "netlify/functions");
                             must be a contained relative path in sandbox modes
      --functions-name <name> Serverless function name (default: "main")
      --no-build             Skip builds after verifying existing artifacts
      --ephemeral            Build in a platform temporary directory and
                             remove it on success (keep with --keep-sandbox)
      --sandbox-dir <path>   Build into the given directory (persistent)
      --keep-sandbox         With --ephemeral, keep the sandbox after build
      --dry-run              Print the commands without running them
  -h, --help                 Show this help
`;

type SharedCollectionResult = { kind: 'help' } | { kind: 'options'; options: SharedDeployOptions };

function parseSharedArgs(argv: string[]): SharedCollectionResult {
  const o: SharedDeployOptions = {
    ...SHARED_DEFAULTS,
    projectRoot: process.cwd(),
    mongodbUri: process.env.MONGODB_URI,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--project-root':
        o.projectRoot = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--api-base-url':
        o.apiBaseUrl = readRequiredOptionValue(argv, i, a);
        i += 1;
        o.apiBaseUrlExplicit = true;
        break;
      case '--mongodb-uri':
        o.mongodbUri = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--dist-dir':
        o.distDir = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--functions-dir':
        o.functionsDir = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--functions-name':
        o.functionsName = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--no-build':
        o.noBuild = true;
        break;
      case '--ephemeral':
        o.ephemeral = true;
        break;
      case '--sandbox-dir':
        o.sandboxDir = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--keep-sandbox':
        o.keepSandbox = true;
        break;
      case '--dry-run':
        o.dryRun = true;
        break;
      case '-h':
      case '--help':
        return { kind: 'help' };
      default:
        throw new Error(`Unknown option: ${a}\n\n${SHARED_HELP}`);
    }
  }
  return { kind: 'options', options: o };
}

export interface SharedCliServices {
  resolvePaths(options: SharedDeployOptions): DeployPaths;
  buildArtifacts(options: SharedDeployOptions, paths: DeployPaths): PreparedDeployment;
  inspectArtifacts(options: SharedDeployOptions, paths: DeployPaths): void;
  cleanupSandbox(paths: DeployPaths, keepSandbox: boolean, dryRun: boolean): void;
  log(message?: string): void;
  error(message?: string): void;
}

const DEFAULT_SHARED_CLI_SERVICES: SharedCliServices = {
  resolvePaths,
  buildArtifacts,
  inspectArtifacts,
  cleanupSandbox,
  log: (message = '') => console.log(message),
  error: (message = '') => console.error(message),
};

export function runSharedCli(argv: string[], overrides: Partial<SharedCliServices> = {}): number {
  const services = { ...DEFAULT_SHARED_CLI_SERVICES, ...overrides };
  try {
    const collected = parseSharedArgs(argv);
    if (collected.kind === 'help') {
      services.log(SHARED_HELP);
      return 0;
    }
    const options = validateSharedDeployOptions(collected.options);
    const paths = services.resolvePaths(options);
    if (options.noBuild) services.inspectArtifacts(options, paths);
    else services.buildArtifacts(options, paths);
    services.cleanupSandbox(paths, options.keepSandbox, options.dryRun);
    services.log('\n✓ Build finished.');
    services.log(`  distAbs:      ${paths.distAbs}`);
    services.log(`  functionsAbs: ${paths.functionsAbs}`);
    return 0;
  } catch (err) {
    services.error(`\n✖ ${err instanceof Error ? err.message : err}`);
    return 1;
  }
}

export function main(): void {
  process.exitCode = runSharedCli(process.argv.slice(2));
}
