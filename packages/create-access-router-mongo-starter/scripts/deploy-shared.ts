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
import { readOptionValue, splitEqualsOption, unknownOptionError } from '../src/shared/arg-parser';
import { bail } from '../src/shared/bail';
import { isMongoConnectionString } from '../template/src/shared/mongo-connection-string';
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

// ---------------------------------------------------------------------------
// Destructive-output safety
// ---------------------------------------------------------------------------

/**
 * Narrowed destructive-output contract (CARMSF-05).
 *
 * Both builders delete before they write (`vite build --emptyOutDir` empties
 * the frontend directory; the serverless bundler clears its output
 * directory). Every output therefore must be a disposable directory that is
 * strictly inside the deploy directory, canonically disjoint from the other
 * output, and clear of dependency/input/config locations:
 *
 * - `node_modules` (or any path beneath it) is never a disposable output.
 *   In sandbox modes the helper-owned `node_modules` symlink points outside
 *   the sandbox, so emptying it would delete project dependencies.
 * - In project mode the deploy directory is the project root itself, so the
 *   project root, its ancestors, anything outside it, and the reserved
 *   input/config subtrees (`api`, `src`, `public`, `.git` plus
 *   `node_modules`) are rejected, including symlink aliases.
 * - Frontend and functions outputs must be canonically disjoint: equal paths
 *   or either ancestry direction is rejected so the backend clean cannot
 *   erase frontend output (or nest functions beneath public static output).
 * - Anything outside the deploy directory is rejected rather than treated
 *   as disposable ("external" handling = refuse before any runner runs).
 */
export const RESERVED_DEPENDENCY_SEGMENT = 'node_modules';

export const RESERVED_PROJECT_SUBPATHS = ['node_modules', 'api', 'src', 'public', '.git'] as const;

function pathSegments(path: string): string[] {
  return path.split(/[\\/]+/u).filter((segment) => segment.length > 0);
}

/**
 * Canonical destructive-output safety applied in every mode after owned
 * links exist and before builders run. Uses symlink-aware canonical paths
 * so aliases (`link -> src`, sandbox `escape` links, and the helper-created
 * `node_modules` link) cannot bypass the checks.
 */
export function assertDestructiveOutputsSafe(
  deployDir: string,
  distAbs: string,
  functionsAbs: string,
  services: Pick<SharedDeployServices, 'lstat' | 'realpath'> = DEFAULT_SERVICES,
  projectMode = false,
): void {
  const canonicalDeployDir = canonicalProjectedPath(deployDir, services as SharedDeployServices);
  const checkOutput = (option: '--dist-dir' | '--functions-dir', output: string): string => {
    const canonicalOutput = canonicalProjectedPath(output, services as SharedDeployServices);
    if (!isStrictDescendant(canonicalDeployDir, canonicalOutput)) {
      bail(`${option} must resolve to a path strictly inside the deploy directory.`);
    }
    const relativeSegments = pathSegments(relative(canonicalDeployDir, canonicalOutput));
    if (relativeSegments.includes(RESERVED_DEPENDENCY_SEGMENT)) {
      bail(`${option} must not target the reserved dependency directory "${RESERVED_DEPENDENCY_SEGMENT}".`);
    }
    return canonicalOutput;
  };

  const canonicalDist = checkOutput('--dist-dir', distAbs);
  const canonicalFunctions = checkOutput('--functions-dir', functionsAbs);

  if (projectMode) {
    const canonicalRoot = canonicalDeployDir;
    for (const option of ['--dist-dir', '--functions-dir'] as const) {
      const canonicalOutput = option === '--dist-dir' ? canonicalDist : canonicalFunctions;
      const outputRelative = relative(canonicalRoot, canonicalOutput);
      for (const reserved of RESERVED_PROJECT_SUBPATHS) {
        if (reserved === RESERVED_DEPENDENCY_SEGMENT) continue;
        const canonicalReserved = resolve(canonicalRoot, reserved);
        if (
          canonicalOutput === canonicalReserved ||
          isStrictDescendant(canonicalReserved, canonicalOutput) ||
          isStrictDescendant(canonicalOutput, canonicalReserved)
        ) {
          bail(`${option} must not target the reserved project directory "${reserved}" (got: ${outputRelative}).`);
        }
      }
    }
  }

  if (canonicalDist === canonicalFunctions) {
    bail('--dist-dir and --functions-dir must be disjoint directories (they resolve to the same path).');
  }
  if (isStrictDescendant(canonicalDist, canonicalFunctions) || isStrictDescendant(canonicalFunctions, canonicalDist)) {
    bail('--dist-dir and --functions-dir must be disjoint directories (neither may contain the other).');
  }
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
  if (value.split(/[\\/]+/u).includes(RESERVED_DEPENDENCY_SEGMENT)) {
    bail(
      `${option} must not target the reserved dependency directory "${RESERVED_DEPENDENCY_SEGMENT}" in sandbox mode.`,
    );
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
  // WHATWG `new URL` is intentionally not used: it rejects normal multi-host
  // seed lists (e.g. `mongodb://db-a:27017,db-b:27017/app?replicaSet=rs0`)
  // required for transaction-capable MongoDB. The grammar lives in the
  // template's own `src/shared` tree so generated apps never import
  // scaffolder internals. The diagnostic stays value-free so credentials in a
  // rejected URI are never echoed.
  if (!isMongoConnectionString(validated.mongodbUri)) {
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

  const outputs = {
    distAbs: resolveOutput('--dist-dir', options.distDir),
    functionsAbs: resolveOutput('--functions-dir', options.functionsDir),
  };
  // Canonical post-link check: the helper-owned node_modules symlink (or any
  // pre-existing escape link) is resolved here, so outputs that alias outside
  // the sandbox — or collide with each other — are rejected. Callers must
  // invoke this after ensureSandboxLinks equivalent work (see resolvePaths).
  assertDestructiveOutputsSafe(deployDir, outputs.distAbs, outputs.functionsAbs, services);

  return outputs;
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
    // Create the helper-owned node_modules link BEFORE resolving outputs so
    // the canonical containment check sees the same filesystem the builders
    // will see (a fresh `--dist-dir node_modules` would otherwise pass, then
    // Vite would follow the new link with --emptyOutDir). Lexical reservation
    // in validateSandboxOutputOption still covers dry-run placeholders.
    linkNodeModules(deployDir, projectRoot, options.dryRun, services);
    const outputs = resolveSandboxOutputs(deployDir, options, services);
    const cleanupIdentity = options.dryRun ? undefined : directoryIdentity(deployDir, services);
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
    // Same post-link ordering as the ephemeral branch (see above).
    linkNodeModules(deployDir, projectRoot, options.dryRun, services);
    const outputs = resolveSandboxOutputs(deployDir, options, services);
    return {
      deployDir,
      ...outputs,
      isEphemeral: false,
    };
  }

  const distAbs = resolve(projectRoot, options.distDir);
  const functionsAbs = resolve(projectRoot, options.functionsDir);
  // Project mode has no sandbox containment by construction, so apply the
  // same canonical destructive-output safety here: outputs must be strictly
  // inside the project root (root/ancestor/external rejected), clear of
  // reserved source/dependency/config subtrees (aliases included), and
  // mutually disjoint.
  assertDestructiveOutputsSafe(projectRoot, distAbs, functionsAbs, services, true);

  return {
    deployDir: projectRoot,
    distAbs,
    functionsAbs,
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
 * Whether a resolved command points at a Windows shell shim (`.cmd`, `.bat`,
 * `.ps1`). Such files cannot be executed by a shell-free `spawnSync`
 * (`shell: false`) — they require `cmd.exe` — so passing them to the shared
 * runner would fail after lookup succeeded.
 *
 * Exported for tests and provider adapters; not part of the package's public
 * surface.
 */
export function isWindowsShellShimCommand(command: string): boolean {
  const lower = command.toLowerCase();
  return lower.endsWith('.cmd') || lower.endsWith('.bat') || lower.endsWith('.ps1');
}

/**
 * Narrowed platform contract for shell-free process invocation.
 *
 * The shared `run`/`runCapture` helpers always spawn with `shell: false` and
 * an argv array so arguments are preserved literally (no shell
 * interpretation). A Windows shell shim cannot run that way; enabling a
 * shell around arbitrary arguments would be a command-injection shortcut, so
 * this bails with explicit guidance instead.
 *
 * `platform` defaults to `process.platform` so tests can exercise the
 * Windows branch on any host without mutating globals.
 */
export function assertShellFreeInvocationSupported(command: string, platform: string = process.platform): void {
  if (platform === 'win32' && isWindowsShellShimCommand(command)) {
    bail(
      `Windows shell shim "${command}" cannot be executed without a shell. ` +
        'Native Windows execution is unsupported: run this deploy from WSL2/Linux/macOS, ' +
        'or run the equivalent provider CLI manually. A shell is deliberately not enabled ' +
        'around deployment arguments.',
    );
  }
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
  // Preflight and later invocations share this contract: a Windows shim that
  // cannot run shell-free is rejected here (before mutation when called from
  // preflight) and at every later spawn, never silently sent to a shell.
  assertShellFreeInvocationSupported(cmd);
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
  // Same contract as `run`: never send a Windows shim to a shell-free spawn.
  assertShellFreeInvocationSupported(cmd);
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
  services: Pick<SharedDeployServices, 'parentEnv' | 'run' | 'log'> &
    Partial<Pick<SharedDeployServices, 'lstat' | 'realpath'>> = DEFAULT_SERVICES,
): PreparedDeployment {
  const frontendEnv = createChildEnvironment(services.parentEnv, {
    API_BASE_URL: options.apiBaseUrl,
  });
  const backendEnv = createChildEnvironment(services.parentEnv, {
    API_BASE_URL: options.apiBaseUrl,
    MONGODB_URI: options.mongodbUri,
  });
  const projectRoot = projectRootOf(options);

  // Final canonical check after owned links exist and before any destructive
  // builder runs. Re-validates here (rather than trusting resolvePaths
  // callers, which may hand-construct paths) so equal/ancestry outputs and
  // reserved/external targets reject before a runner is called.
  const fsServices = {
    lstat: services.lstat ?? DEFAULT_SERVICES.lstat,
    realpath: services.realpath ?? DEFAULT_SERVICES.realpath,
  };
  assertDestructiveOutputsSafe(
    paths.deployDir,
    paths.distAbs,
    paths.functionsAbs,
    fsServices,
    !(options.ephemeral || options.sandboxDir),
  );

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
  // The backend builder always runs with `--format cjs`, and tsup emits a
  // `.cjs` file for CJS output when the producer package is `"type": "module"`
  // (the generated template contract: `pnpm serverless` writes
  // `api/functions/main.cjs`). Inspect that exact artifact, not a `.js`
  // assumption that a valid build never produces.
  requireNonEmptyFile(resolve(paths.functionsAbs, `${options.functionsName}.cjs`), 'Serverless function artifact');
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
                             Destructive-output contract (all modes): each output must
                             resolve strictly inside the deploy directory (project
                             root in project mode); "node_modules" targets,
                             reserved project dirs (api, src, public, .git),
                             external/ancestor/root targets, symlink aliases
                             outside the deploy dir, and equal/nested
                             frontend-function outputs are rejected before any
                             build runs.
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
    const { name, value: equalsValue } = splitEqualsOption(a);
    const readValue = (): { value: string; advance: number } => readOptionValue(argv, i, name, equalsValue);
    const rejectEqualsOnFlag = (): void => {
      if (equalsValue !== undefined) throw unknownOptionError(a, SHARED_HELP);
    };
    switch (name) {
      case '--project-root': {
        const r = readValue();
        o.projectRoot = r.value;
        i += r.advance;
        break;
      }
      case '--api-base-url': {
        const r = readValue();
        o.apiBaseUrl = r.value;
        i += r.advance;
        o.apiBaseUrlExplicit = true;
        break;
      }
      case '--mongodb-uri': {
        const r = readValue();
        o.mongodbUri = r.value;
        i += r.advance;
        break;
      }
      case '--dist-dir': {
        const r = readValue();
        o.distDir = r.value;
        i += r.advance;
        break;
      }
      case '--functions-dir': {
        const r = readValue();
        o.functionsDir = r.value;
        i += r.advance;
        break;
      }
      case '--functions-name': {
        const r = readValue();
        o.functionsName = r.value;
        i += r.advance;
        break;
      }
      case '--no-build':
        rejectEqualsOnFlag();
        o.noBuild = true;
        break;
      case '--ephemeral':
        rejectEqualsOnFlag();
        o.ephemeral = true;
        break;
      case '--sandbox-dir': {
        const r = readValue();
        o.sandboxDir = r.value;
        i += r.advance;
        break;
      }
      case '--keep-sandbox':
        rejectEqualsOnFlag();
        o.keepSandbox = true;
        break;
      case '--dry-run':
        rejectEqualsOnFlag();
        o.dryRun = true;
        break;
      case '-h':
      case '--help':
        rejectEqualsOnFlag();
        return { kind: 'help' };
      default:
        throw unknownOptionError(a, SHARED_HELP);
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
    if (options.noBuild) {
      services.inspectArtifacts(options, paths);
    } else {
      services.buildArtifacts(options, paths);
      // A successful builder exit does not prove usable artifacts (a fake or
      // broken builder can exit 0 without writing them). Re-inspect newly
      // built output before reporting success. Dry runs execute no builders,
      // so there is nothing to inspect.
      if (!options.dryRun) services.inspectArtifacts(options, paths);
    }
    services.cleanupSandbox(paths, options.keepSandbox, options.dryRun);
    services.log('\n✓ Build finished.');
    services.log(`  distAbs:      ${paths.distAbs}`);
    services.log(`  functionsAbs: ${paths.functionsAbs}`);
    return 0;
  } catch (err) {
    // Parse failures occur before option collection, so redact environment
    // secrets even when no options object exists. Unknown-option diagnostics
    // themselves are value-free (see unknownOptionError).
    const raw = `\n✖ ${err instanceof Error ? err.message : err}`;
    services.error(redactCommand(raw, collectSecrets(process.env.MONGODB_URI)));
    return 1;
  }
}

export function main(): void {
  process.exitCode = runSharedCli(process.argv.slice(2));
}
