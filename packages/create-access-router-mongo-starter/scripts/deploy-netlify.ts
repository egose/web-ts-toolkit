/**
 * Netlify deployment adapter for the access-router-mongo-starter.
 *
 * Consumes the shared build/deploy preparation from `deploy-shared.ts` and
 * adds Netlify-specific concerns:
 *   - site lookup / creation via the `@netlify/api` SDK
 *   - direct `.netlify/state.json` writing (no `netlify link` CLI needed)
 *   - minimal `netlify.toml` generation for build/functions settings
 *   - `netlify deploy` CLI invocation (the only remaining CLI usage)
 *     The `netlify` binary must be available on PATH; it is no longer bundled
 *     as a runtime dependency to keep the artifact small. Install it with
 *     `npm install -g netlify-cli` (or via your package manager) before
 *     running this bin.
 *   - runtime env (`API_BASE_URL`, `MONGODB_URI`) management via the
 *     `@netlify/api` SDK
 *
 * Run as the `create-access-router-mongo-starter-deploy-netlify` bin from the
 * target app directory. Pass `-i / --interactive` to be prompted for any flag
 * that was not supplied on the command line. Use `--project-root <path>` to
 * target a different directory.
 *
 * Sandbox mode (`--ephemeral` or `--sandbox-dir <path>`) builds into a
 * self-contained deploy directory instead of the project root, so no
 * `dist/`, `netlify/`, `.netlify/`, or `netlify.toml` are written to the repo.
 * Ephemeral sandboxes live under the platform temporary directory and are removed on success
 * unless `--keep-sandbox` is passed.
 */
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { cancel, confirm, intro, isCancel, password, select, text } from '@clack/prompts';
import { parse as parseToml, stringify as stringifyToml, type TomlTable } from 'smol-toml';
import { readRequiredOptionValue } from '../src/shared/arg-parser';
import {
  bail,
  buildArtifacts,
  cleanupSandbox,
  collectSecrets,
  createChildEnvironment,
  inspectArtifacts,
  keepSandboxOnFailure,
  projectRootOf,
  redactCommand,
  resolvePaths,
  runCapture,
  SHARED_DEFAULTS,
  validateSharedDeployOptions,
  BailError,
  type DeployPaths,
  type SharedDeployOptions,
} from './deploy-shared';
import {
  createSite,
  defaultApiBaseUrl,
  fetchSiteByName,
  resolveSiteId,
  resolveSiteTarget,
  setSiteEnvVar,
  verifySiteEnvVar,
  validateSiteName,
} from './netlify-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NetlifyDeployResultLinks {
  deploy_url?: string;
  logs?: string;
}

interface NetlifyDeployResult {
  deploy_url?: string;
  url?: string;
  ssl_url?: string;
  logs?: string;
  links?: NetlifyDeployResultLinks;
}

export interface NetlifyCli {
  command: string;
  argsPrefix: string[];
}

export interface NetlifyDeployServices {
  parentEnv: NodeJS.ProcessEnv;
  buildArtifacts: typeof buildArtifacts;
  inspectArtifacts: typeof inspectArtifacts;
  createSite: typeof createSite;
  fetchSiteByName: typeof fetchSiteByName;
  resolveSiteId: typeof resolveSiteId;
  resolveSiteTarget: typeof resolveSiteTarget;
  setSiteEnvVar: typeof setSiteEnvVar;
  verifySiteEnvVar: typeof verifySiteEnvVar;
  runCapture(
    cli: NetlifyCli,
    args: string[],
    env: NodeJS.ProcessEnv,
    dryRun: boolean,
    cwd: string,
    secrets?: string[],
  ): string;
  resolveCli(): NetlifyCli;
  checkBuildTools(options: NetlifyOptions): void;
  ensureLinkedSite(stateFile: string, siteId: string, dryRun: boolean): void;
  ensureNetlifyToml(options: NetlifyOptions, paths: DeployPaths): void;
  log(message?: string): void;
}

// ---------------------------------------------------------------------------
// Env scope label (for display)
// ---------------------------------------------------------------------------

function envScopeLabel(options: Pick<NetlifyOptions, 'paidTier'>): string {
  return options.paidTier ? 'functions' : 'all scopes (free-tier compatible)';
}

export function resolveDeployContext(options: Pick<NetlifyOptions, 'prod' | 'context'>): string {
  return options.prod ? 'production' : (options.context ?? 'deploy-preview');
}

export function planRuntimeSiteEnvVars(
  apiBaseUrl: string,
  mongodbUri: string,
): Array<{ key: string; value: string; sensitive: boolean }> {
  return [
    { key: 'API_BASE_URL', value: apiBaseUrl, sensitive: false },
    { key: 'MONGODB_URI', value: mongodbUri, sensitive: true },
  ];
}

function resolveNetlifyCli(): NetlifyCli {
  const binName = process.platform === 'win32' ? 'netlify.cmd' : 'netlify';
  const found = lookupInPath(binName);
  if (!found) {
    bail(
      'Could not find the `netlify` CLI on PATH. Install it with `npm install -g netlify-cli` ' +
        '(or your package manager), then re-run this command. The `netlify-cli` package is no longer ' +
        'bundled with this starter to keep the install small.',
    );
  }
  return { command: found, argsPrefix: [] };
}

/**
 * Resolve an executable by name using PATH lookup, mirroring shell semantics.
 * Returns the absolute path if found and executable, otherwise undefined.
 *
 * Defaults `pathValue` to `process.env.PATH` so callers (and tests) can pass an
 * isolated `PATH` to assert lookup behaviour without mutating the real env.
 *
 * Exported for tests; not part of the package's public surface.
 */
export function lookupInPath(binName: string, pathValue: string | undefined = process.env.PATH): string | undefined {
  const pathSegments = (pathValue ?? '').split(delimiter).filter(Boolean);
  const isExecutable = (p: string): boolean => {
    try {
      accessSync(p, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };

  for (const dir of pathSegments) {
    if (!dir) continue;
    const candidate = resolve(dir, binName);
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
}

function runCaptureNetlify(
  cli: NetlifyCli,
  args: string[],
  env: NodeJS.ProcessEnv,
  dryRun: boolean,
  cwd: string,
  secrets: string[] = [],
): string {
  return runCapture(cli.command, [...cli.argsPrefix, ...args], env, dryRun, cwd, secrets);
}

// ---------------------------------------------------------------------------
// Linked-site state (write directly, no CLI needed)
// ---------------------------------------------------------------------------

export interface LinkedSite {
  siteId?: string;
  siteName?: string;
}

const MANAGED_TOML_HEADER =
  '# Managed by create-access-router-mongo-starter-deploy-netlify. Do not add user configuration to this file.';

function readLinkedSiteState(stateFile: string): { linked: LinkedSite; data: Record<string, unknown> } | null {
  if (!existsSync(stateFile)) return null;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch (error) {
    bail(`Cannot read malformed Netlify link state at ${stateFile}: ${(error as Error).message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    bail(`Invalid Netlify link state at ${stateFile}: expected a JSON object.`);
  }
  const record = data as Record<string, unknown>;
  if (record.siteId !== undefined && typeof record.siteId !== 'string') {
    bail(`Invalid Netlify link state at ${stateFile}: "siteId" must be a string.`);
  }
  if (record.siteName !== undefined && typeof record.siteName !== 'string') {
    bail(`Invalid Netlify link state at ${stateFile}: "siteName" must be a string.`);
  }
  const linked = { siteId: record.siteId as string | undefined, siteName: record.siteName as string | undefined };
  if (!linked.siteId && !linked.siteName) {
    bail(`Invalid Netlify link state at ${stateFile}: expected a non-empty "siteId" or "siteName".`);
  }
  return { linked, data: record };
}

export function readLinkedSite(stateFile: string): LinkedSite | null {
  return readLinkedSiteState(stateFile)?.linked ?? null;
}

/**
 * Ensure a `.netlify/state.json` exists in the active deploy directory pointing
 * at the resolved site id before running `netlify deploy`, which may fall back
 * to the local link state.
 *
 * Writes the file directly instead of shelling out to `netlify link`, so no
 * CLI subprocess is needed and nothing in the real project root is mutated
 * when running from a sandbox/ephemeral dir.
 */
export function ensureLinkedSite(stateFile: string, siteId: string, dryRun: boolean): void {
  const existing = readLinkedSiteState(stateFile);
  const linked = existing?.linked;
  if (linked?.siteId === siteId) {
    console.log(`• Site link already present at ${stateFile}`);
    return;
  }

  console.log(`\n• Linking deploy directory to site "${siteId}" …`);
  if (!dryRun) {
    mkdirSync(resolve(stateFile, '..'), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ ...existing?.data, siteId }, null, 2) + '\n');
  }
  console.log(`  OK — ${stateFile} now points at site ${siteId}.`);
}

function netlifyConfig(options: NetlifyOptions): TomlTable {
  const directFunctionPath = defaultApiBaseUrl(options.functionsName);
  const apiBaseUrl = options.apiBaseUrl ?? directFunctionPath;
  const redirects: TomlTable[] = [];
  if (apiBaseUrl !== directFunctionPath) {
    redirects.push({
      from: `${apiBaseUrl}/*`,
      to: `${directFunctionPath}/:splat`,
      status: 200,
    });
  }
  redirects.push({ from: '/*', to: '/index.html', status: 200 });
  return {
    build: { base: '', publish: options.distDir },
    functions: { directory: options.functionsDir, node_bundler: 'esbuild' },
    redirects,
  };
}

export function serializeNetlifyToml(options: NetlifyOptions): string {
  return `${MANAGED_TOML_HEADER}\n${stringifyToml(netlifyConfig(options))}`;
}

function isTable(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sameRequiredNetlifyConfig(actual: TomlTable, expected: TomlTable): boolean {
  if (!isTable(actual.build) || !isTable(expected.build)) return false;
  if (!isTable(actual.functions) || !isTable(expected.functions)) return false;
  const actualRedirects = actual.redirects;
  const expectedRedirects = expected.redirects;
  if (!Array.isArray(actualRedirects) || !Array.isArray(expectedRedirects)) return false;
  const redirectsMatch =
    actualRedirects.length === expectedRedirects.length &&
    actualRedirects.every((redirect, index) => {
      const expectedRedirect = expectedRedirects[index];
      return (
        isTable(redirect) &&
        isTable(expectedRedirect) &&
        redirect.from === expectedRedirect.from &&
        redirect.to === expectedRedirect.to &&
        redirect.status === expectedRedirect.status
      );
    });
  return (
    actual.build.base === expected.build.base &&
    actual.build.publish === expected.build.publish &&
    actual.functions.directory === expected.functions.directory &&
    actual.functions.node_bundler === expected.functions.node_bundler &&
    redirectsMatch
  );
}

function hasExactlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    keys
      .slice()
      .sort()
      .every((key, index) => actual[index] === key)
  );
}

function isUnmodifiedManagedConfig(actual: TomlTable): boolean {
  const redirects = actual.redirects;
  return (
    hasExactlyKeys(actual, ['build', 'functions', 'redirects']) &&
    isTable(actual.build) &&
    hasExactlyKeys(actual.build, ['base', 'publish']) &&
    isTable(actual.functions) &&
    hasExactlyKeys(actual.functions, ['directory', 'node_bundler']) &&
    Array.isArray(redirects) &&
    redirects.length >= 1 &&
    redirects.length <= 2 &&
    redirects.every((redirect) => isTable(redirect) && hasExactlyKeys(redirect, ['from', 'status', 'to']))
  );
}

export function ensureNetlifyToml(options: NetlifyOptions, paths: DeployPaths): void {
  const tomlPath = resolve(paths.deployDir, 'netlify.toml');
  const expected = netlifyConfig(options);
  const existed = existsSync(tomlPath);
  if (existed) {
    const source = readFileSync(tomlPath, 'utf8');
    let actual: TomlTable;
    try {
      actual = parseToml(source);
    } catch (error) {
      bail(`Cannot use malformed Netlify configuration at ${tomlPath}: ${(error as Error).message}`);
    }
    if (sameRequiredNetlifyConfig(actual, expected)) {
      console.log(`• Existing netlify.toml matches the requested deploy configuration at ${tomlPath}`);
      return;
    }
    if (!source.startsWith(`${MANAGED_TOML_HEADER}\n`) || !isUnmodifiedManagedConfig(actual)) {
      bail(
        `Existing user-owned Netlify configuration at ${tomlPath} conflicts with the requested build, functions, ` +
          'or SPA redirect settings. It was not changed; reconcile those settings explicitly and rerun.',
      );
    }
  }

  const body = serializeNetlifyToml(options);

  if (!options.dryRun) {
    mkdirSync(paths.deployDir, { recursive: true });
    writeFileSync(tomlPath, body);
  }

  console.log(`• ${existed ? 'Updated managed' : 'Created'} ${tomlPath}`);
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface NetlifyOptions extends SharedDeployOptions {
  interactive: boolean;
  authToken: string | undefined;
  site: string | undefined;
  siteName: string | undefined;
  team: string | undefined;
  prod: boolean;
  publicDemoAcknowledged: boolean;
  paidTier: boolean;
  message: string | undefined;
  alias: string | undefined;
  context: string | undefined;
  branch: string | undefined;
}

export type NetlifyCollectionResult =
  | { kind: 'help' }
  | { kind: 'cancel' }
  | { kind: 'options'; options: NetlifyOptions };

export interface NetlifyPromptServices {
  intro(message: string): void;
  cancel(message: string): void;
  select(options: Parameters<typeof select>[0]): ReturnType<typeof select>;
  confirm(options: Parameters<typeof confirm>[0]): ReturnType<typeof confirm>;
  text(options: Parameters<typeof text>[0]): ReturnType<typeof text>;
  password(options: Parameters<typeof password>[0]): ReturnType<typeof password>;
  isCancel(value: unknown): boolean;
}

export const HELP = `access-router-mongo-starter Netlify deploy

Usage: create-access-router-mongo-starter-deploy-netlify [options]

Options:
      --project-root <path>   Target app directory (default: current directory)
  -i, --interactive           Prompt for any missing option via @clack/prompts
  -t, --auth-token <token>    Netlify auth token (env: NETLIFY_AUTH_TOKEN)
  -s, --site <name-or-id>     Existing Netlify site name or id to deploy to.
                              Passed through to the CLI as --site <ref>.
                              (env: NETLIFY_SITE_ID)
      --site-name <name>      Netlify site name. If it belongs to one of your
                              sites, deploy to it; otherwise attempt to create
                              a new site with that name (bails if the name is
                              globally taken by another user). (env: NETLIFY_SITE_NAME)
      --team <slug>           Team slug if a new site gets created
                              (--site-name). (env: NETLIFY_TEAM_SLUG)
  -p, --prod                  Deploy to production (default: draft/preview)
      --acknowledge-public-demo
                              Required with --prod. Confirms that this starter
                              exposes anonymous public create/update/delete
                              routes and that host abuse controls are your responsibility.
      --paid-tier             Use paid-tier Netlify env scoping
                               (--scope functions) when setting and
                               verifying site env vars. Default: free-tier-
                               compatible behavior with no --scope flag.
--alias <name>          Create a draft deploy with a predictable URL:
                               https://<name>--<site-name>.netlify.app
                               Useful for staging, review apps, or named
                               previews. Cannot be combined with --prod.
       --branch <name>         Shorthand for a branch deploy: forces
                               --alias <name> and --context branch:<name>,
                               overriding any explicit --alias / --context.
                               Produces https://<name>--<site-name>.netlify.app
                               and scopes site env vars to that branch.
                               Cannot be combined with --prod.
       --context <ctx>         Netlify deploy context for env (e.g.
                                "production", "deploy-preview",
                                "branch-deploy", or "branch:staging").
                                (env: NETLIFY_CONTEXT, default: "deploy-preview")
                                Ignored when --prod is set; production deploys
                                always use context "production".
                                Overridden by --branch.
      --api-base-url <path>   Path-only API_BASE_URL for the frontend build,
                               redirects, and serverless function
                               (default: "/.netlify/functions/<functions-name>")
      --mongodb-uri <uri>     Required MONGODB_URI for the serverless function
                               (prefer env: MONGODB_URI). Required for every
                               deploy because all artifacts include the backend.
      --dist-dir <path>       Frontend publish dir (default: "dist"); must be a
                               contained relative path in sandbox modes
      --functions-dir <path>  Serverless output dir (default: "netlify/functions");
                               must be a contained relative path in sandbox modes
      --functions-name <name> Serverless function name (default: "main")
  -m, --message <msg>         Deploy log message
      --no-build              Skip the build steps; deploy existing artifacts
      --ephemeral             Build in a platform temporary directory and
                              remove it on success (keep with --keep-sandbox)
      --sandbox-dir <path>   Build into the given directory (persistent)
      --keep-sandbox          With --ephemeral, keep the sandbox after deploy
      --dry-run              Print the commands without running them
  -h, --help                 Show this help
`;

export function collectCliOptions(argv: string[]): NetlifyCollectionResult {
  const o: NetlifyOptions = {
    ...SHARED_DEFAULTS,
    projectRoot: process.cwd(),
    interactive: false,
    authToken: process.env.NETLIFY_AUTH_TOKEN,
    site: process.env.NETLIFY_SITE_ID,
    siteName: process.env.NETLIFY_SITE_NAME,
    team: process.env.NETLIFY_TEAM_SLUG,
    prod: false,
    publicDemoAcknowledged: false,
    paidTier: false,
    message: undefined,
    alias: undefined,
    context: process.env.NETLIFY_CONTEXT ?? 'deploy-preview',
    branch: undefined,
    mongodbUri: process.env.MONGODB_URI,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--project-root':
        o.projectRoot = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '-i':
      case '--interactive':
        o.interactive = true;
        break;
      case '-t':
      case '--auth-token':
        o.authToken = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '-s':
      case '--site':
        o.site = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--site-name':
        o.siteName = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--team':
        o.team = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '-p':
      case '--prod':
        o.prod = true;
        break;
      case '--paid-tier':
        o.paidTier = true;
        break;
      case '--acknowledge-public-demo':
        o.publicDemoAcknowledged = true;
        break;
      case '--alias':
        o.alias = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--branch':
        o.branch = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--context':
        o.context = readRequiredOptionValue(argv, i, a);
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
      case '-m':
      case '--message':
        o.message = readRequiredOptionValue(argv, i, a);
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
        throw new Error(`Unknown option: ${a}\n\n${HELP}`);
    }
  }

  return { kind: 'options', options: o };
}

/**
 * When `--branch <name>` is supplied it takes precedence over any explicit
 * `--alias` / `--context`, synthesizing `alias = <name>` and
 * `context = branch:<name>`. Call after option collection (both after CLI
 * parsing and after interactive prompting) to keep the invariant consistent.
 */
export function applyBranchOverride(o: Pick<NetlifyOptions, 'branch' | 'alias' | 'context'>): void {
  if (!o.branch) return;
  o.alias = o.branch;
  o.context = `branch:${o.branch}`;
}

function validateIdentifier(option: string, value: string | undefined): string | undefined {
  const normalized = value?.trim() || undefined;
  if (normalized && validateSiteName(normalized)) {
    bail(
      `${option} must contain only lowercase letters, digits, and hyphens, start with a letter or digit, and be at most 63 characters.`,
    );
  }
  return normalized;
}

export function validateNetlifyOptions(options: NetlifyOptions): NetlifyOptions {
  const normalized: NetlifyOptions = {
    ...options,
    authToken: options.authToken?.trim() || undefined,
    site: options.site?.trim() || undefined,
    siteName: options.siteName?.trim() || undefined,
    team: options.team?.trim() || undefined,
    message: options.message,
    alias: options.alias?.trim() || undefined,
    context: options.context?.trim() || undefined,
    branch: options.branch?.trim() || undefined,
  };

  applyBranchOverride(normalized);
  normalized.context = resolveDeployContext(normalized);
  if (!normalized.apiBaseUrlExplicit) normalized.apiBaseUrl = defaultApiBaseUrl(normalized.functionsName.trim());
  Object.assign(normalized, validateSharedDeployOptions(normalized));

  if (!normalized.authToken) bail('Netlify auth token is required (use -t / --auth-token or NETLIFY_AUTH_TOKEN).');
  if (normalized.site && normalized.siteName) bail('--site and --site-name are mutually exclusive.');
  normalized.site = validateIdentifier('--site', normalized.site);
  normalized.siteName = validateIdentifier('--site-name', normalized.siteName);
  normalized.team = validateIdentifier('--team', normalized.team);
  normalized.alias = validateIdentifier('--alias', normalized.alias);
  normalized.branch = validateIdentifier('--branch', normalized.branch);
  if (!normalized.context || !/^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]{0,62})?$/u.test(normalized.context)) {
    bail('--context must be a lowercase Netlify context name, optionally followed by a valid :branch-name.');
  }
  if (normalized.prod && (normalized.alias || normalized.branch)) {
    bail(
      '--prod cannot be combined with --alias or --branch. ' +
        'Use --alias/--branch for draft/preview deploys or --prod for production.',
    );
  }
  if (normalized.prod && !normalized.publicDemoAcknowledged) {
    bail(
      'Production deploy blocked: this public-demo starter allows anyone to create, update, and delete data. ' +
        'Review the warning and host abuse controls, then pass --acknowledge-public-demo.',
    );
  }
  return normalized;
}

function checkBuildTools(options: NetlifyOptions): void {
  if (options.noBuild || options.dryRun) return;
  for (const command of ['vite', 'wtt-access-router-runtime']) {
    if (!lookupInPath(command)) bail(`Could not find \`${command}\` on PATH. Install dependencies before deploying.`);
  }
}

// ---------------------------------------------------------------------------
// Interactive prompts
// ---------------------------------------------------------------------------

const DEFAULT_PROMPT_SERVICES: NetlifyPromptServices = { intro, cancel, select, confirm, text, password, isCancel };

export async function collectInteractiveOptions(
  initialOptions: NetlifyOptions,
  prompts: NetlifyPromptServices = DEFAULT_PROMPT_SERVICES,
): Promise<NetlifyCollectionResult> {
  const options = { ...initialOptions };
  const projectRoot = projectRootOf(options);
  prompts.intro('access-router-mongo-starter → Netlify deploy');
  const cancelled = (): NetlifyCollectionResult => {
    prompts.cancel('Cancelled');
    return { kind: 'cancel' };
  };

  if (!options.sandboxDir && !options.ephemeral) {
    const sandboxChoice = await prompts.select({
      message: 'Build target',
      options: [
        { value: 'repo', label: `Repo (${projectRoot})` },
        { value: 'sandbox', label: 'Persistent sandbox dir (--sandbox-dir)' },
        { value: 'ephemeral', label: 'Ephemeral temp dir (removed on success)' },
      ],
      initialValue: 'repo',
    });
    if (prompts.isCancel(sandboxChoice)) {
      return cancelled();
    } else if (sandboxChoice === 'sandbox') {
      const v = await prompts.text({
        message: 'Sandbox directory path',
        validate: (s) => (s && s.trim() ? undefined : 'Required'),
      });
      if (prompts.isCancel(v)) {
        return cancelled();
      } else options.sandboxDir = (v as string).trim();
    } else if (sandboxChoice === 'ephemeral') {
      options.ephemeral = true;
      const keep = await prompts.confirm({
        message: 'Keep the ephemeral sandbox after deploy?',
        initialValue: options.keepSandbox,
      });
      if (prompts.isCancel(keep)) {
        return cancelled();
      } else options.keepSandbox = keep === true;
    }
  }

  if (!options.authToken) {
    const v = await prompts.password({
      message: 'Netlify auth token',
      validate: (s) => (s && s.trim() ? undefined : 'Required'),
    });
    if (prompts.isCancel(v)) {
      return cancelled();
    } else options.authToken = String(v).trim();
  }

  if (!options.site && !options.siteName) {
    const v = await prompts.text({
      message: 'Netlify site name',
      placeholder: 'lowercase letters, digits, hyphens',
      validate: validateSiteName,
    });
    if (prompts.isCancel(v)) return cancelled();
    options.siteName = String(v).trim();
    if (!options.team) {
      const team = await prompts.text({
        message: 'Team slug for the new site',
        defaultValue: '',
        placeholder: 'optional — uses your default team if blank',
      });
      if (prompts.isCancel(team)) return cancelled();
      options.team = (team as string).trim() || undefined;
    }
  } else if (options.siteName && !options.team) {
    const v = await prompts.text({
      message: 'Team slug (used only if a new site gets created)',
      defaultValue: '',
      placeholder: 'optional — uses your default team if blank',
    });
    if (prompts.isCancel(v)) {
      return cancelled();
    } else options.team = (v as string).trim() || undefined;
  }

  const prod = await prompts.confirm({
    message: 'Deploy to production?',
    initialValue: options.prod,
  });
  if (prompts.isCancel(prod)) {
    return cancelled();
  } else options.prod = prod === true;

  if (options.prod && !options.publicDemoAcknowledged) {
    const acknowledged = await prompts.confirm({
      message:
        'PUBLIC DEMO WARNING: anyone on the Internet can create, edit, and delete all Todo and Category data. ' +
        'Have you accepted this risk and configured appropriate Netlify abuse controls?',
      initialValue: false,
    });
    if (prompts.isCancel(acknowledged) || acknowledged !== true) return cancelled();
    options.publicDemoAcknowledged = true;
  }

  if (!options.prod && !options.branch && !options.alias) {
    const wantAlias = await prompts.confirm({
      message: 'Create a named draft deploy (--alias)?',
      initialValue: false,
    });
    if (prompts.isCancel(wantAlias)) {
      return cancelled();
    } else if (wantAlias) {
      const v = await prompts.text({
        message: 'Alias name (creates https://<alias>--<site>.netlify.app)',
        placeholder: 'staging, review-pr-42, …',
        validate: (s) => (s && s.trim() ? undefined : 'Required'),
      });
      if (prompts.isCancel(v)) {
        return cancelled();
      } else options.alias = (v as string).trim();
    }
  }

  options.context = resolveDeployContext(options);

  if (!options.mongodbUri) {
    const v = await prompts.password({
      message: 'MONGODB_URI for the serverless function (required for every deploy)',
      mask: '•',
      validate: (s) => (s && s.trim() ? undefined : 'Required for every deploy'),
    });
    if (prompts.isCancel(v)) {
      return cancelled();
    } else options.mongodbUri = (v as string).trim() || undefined;
  }

  const build = await prompts.confirm({
    message: 'Run the build steps before deploying?',
    initialValue: !options.noBuild,
  });
  if (prompts.isCancel(build)) {
    return cancelled();
  } else options.noBuild = build !== true;

  return { kind: 'options', options };
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

const DEFAULT_DEPLOY_SERVICES: NetlifyDeployServices = {
  parentEnv: process.env,
  buildArtifacts,
  inspectArtifacts,
  createSite,
  fetchSiteByName,
  resolveSiteId,
  resolveSiteTarget,
  setSiteEnvVar,
  verifySiteEnvVar,
  runCapture: runCaptureNetlify,
  resolveCli: resolveNetlifyCli,
  checkBuildTools,
  ensureLinkedSite,
  ensureNetlifyToml,
  log: (message = '') => console.log(message),
};

export interface RemoteMutationRecord {
  operation: string;
  status: 'completed' | 'completion-unknown';
}

export interface DeploymentReport {
  remoteMutations: RemoteMutationRecord[];
}

export class DeployFailure extends Error {
  readonly report: DeploymentReport;

  constructor(error: unknown, report: DeploymentReport) {
    super(error instanceof Error ? error.message : String(error));
    this.name = 'DeployFailure';
    this.stack = error instanceof Error ? error.stack : this.stack;
    this.report = report;
  }
}

export async function runDeploy(
  options: NetlifyOptions,
  paths: DeployPaths,
  overrides: Partial<NetlifyDeployServices> = {},
): Promise<DeploymentReport> {
  options = validateNetlifyOptions(options);
  const services = { ...DEFAULT_DEPLOY_SERVICES, ...overrides };
  const stateFile = resolve(paths.deployDir, '.netlify/state.json');
  const report: DeploymentReport = { remoteMutations: [] };
  const pendingMutation = (operation: string): RemoteMutationRecord => {
    const mutation: RemoteMutationRecord = { operation, status: 'completion-unknown' };
    report.remoteMutations.push(mutation);
    return mutation;
  };

  try {
    if (paths.isEphemeral || options.sandboxDir) {
      services.log(`\n• Sandbox: ${paths.deployDir}${paths.isEphemeral ? ' (ephemeral)' : ''}`);
    } else {
      services.log(`\n• Building into project: ${paths.deployDir}`);
    }

    const linked =
      readLinkedSite(stateFile) ?? readLinkedSite(resolve(projectRootOf(options), '.netlify', 'state.json'));
    if (!options.site && !options.siteName && !linked) {
      bail(
        'No deploy target specified. Pass --site <name-or-id> to look up / deploy, ' +
          'or --site-name <name> to create or reuse a site by name. Add -i for interactive prompts.',
      );
    }

    services.log(
      `• Frontend API_BASE_URL: ${options.apiBaseUrl} (${options.apiBaseUrlExplicit ? 'overridden' : `derived from --functions-name "${options.functionsName}"`})`,
    );
    const envContextLabel = options.context ?? 'all contexts';
    const scopeLabel = envScopeLabel(options);
    services.log(
      `• API_BASE_URL: ${options.apiBaseUrl} (will be set on site env, scope=${scopeLabel}, context=${envContextLabel})`,
    );
    services.log(`• MONGODB_URI: provided (will be set on site env, scope=${scopeLabel}, context=${envContextLabel})`);
    services.log(
      '• PUBLIC DEMO WARNING: anonymous users can create, update, and delete all application data. ' +
        'Configure host rate limits, traffic controls, monitoring, and spend alerts before sharing this deploy.',
    );

    // Preflight and local phases complete before any site or environment mutation.
    const cli = services.resolveCli();
    services.checkBuildTools(options);
    if (options.noBuild) services.inspectArtifacts(options, paths);
    else services.buildArtifacts(options, paths);
    services.ensureNetlifyToml(options, paths);

    let siteRef = options.site ?? linked?.siteId ?? linked?.siteName;
    if (options.siteName) {
      if (options.dryRun) {
        services.log(`\n• [--dry-run] Skipping site lookup/create for "${options.siteName}".`);
        siteRef = options.siteName;
      } else {
        services.log(`\n• Looking up or creating site "${options.siteName}" on Netlify…`);
        const siteMutation = pendingMutation(`site creation for "${options.siteName}"`);
        const resolved = await services.resolveSiteTarget(options.authToken!, options.siteName, options.team);
        if (!resolved) {
          report.remoteMutations.pop();
          bail(
            `Site name "${options.siteName}" is already taken by another user. ` +
              `Pass a different --site-name (or use --site <existing-id>).`,
          );
        }
        if (resolved.created) siteMutation.status = 'completed';
        else report.remoteMutations.pop();
        siteRef = resolved.siteId;
        services.log(
          `• ${resolved.created ? `Created new site "${options.siteName}"` : `Found existing site "${options.siteName}"`} → ${siteRef}`,
        );
      }
    } else if (siteRef) {
      services.log(`• Site: ${siteRef}${!options.site && linked ? ` (linked via ${stateFile})` : ''}`);
    }

    if (!options.dryRun && siteRef) {
      services.log(`\n• Validating site "${siteRef}" with Netlify API…`);
      const resolvedSiteId = await services.resolveSiteId(options.authToken!, siteRef);
      if (!resolvedSiteId) {
        bail(
          `Site "${siteRef}" was not found or is not accessible with the provided auth token. ` +
            `Check --site/--site-name or delete ${stateFile} to start fresh. ` +
            `(The Netlify CLI itself reports this as "Project not found. Please rerun netlify link".)`,
        );
      }
      siteRef = resolvedSiteId;
      services.log('  OK — site is accessible.');
    }

    const secrets = collectSecrets(options.authToken, options.mongodbUri);
    if (!options.dryRun && siteRef) services.ensureLinkedSite(stateFile, siteRef, options.dryRun);

    if (!options.dryRun && siteRef) {
      for (const envVar of planRuntimeSiteEnvVars(options.apiBaseUrl!, options.mongodbUri!)) {
        services.log(`\n─ Setting ${envVar.key} on the site (scope=${scopeLabel}, context=${envContextLabel}) ─`);
        const envMutation = pendingMutation(`environment variable ${envVar.key} on site ${siteRef}`);
        await services.setSiteEnvVar(options.authToken!, siteRef, envVar.key, envVar.value, {
          paidTier: options.paidTier,
          context: options.context,
          sensitive: envVar.sensitive,
        });
        envMutation.status = 'completed';
        services.log('  OK — runtime function env updated.');

        services.log(`\n─ Verifying ${envVar.key} on the site (scope=${scopeLabel}, context=${envContextLabel}) ─`);
        const presence = await services.verifySiteEnvVar(options.authToken!, siteRef, envVar.key, {
          context: options.context,
          paidTier: options.paidTier,
          sensitive: envVar.sensitive,
        });

        if (presence.status === 'verified') {
          services.log(`  OK — ${envVar.key} context, scope, and sensitivity match the deployment plan.`);
        } else if (presence.status === 'missing') {
          bail(
            `Env var setup completed, but ${envVar.key} was not found afterward. ` +
              'Check the site, scope, and context being targeted.',
          );
        } else if (presence.status === 'mismatch') {
          bail(
            `Env var setup completed, but ${envVar.key} has mismatched ${presence.mismatches.join(', ')} metadata. ` +
              'Check the site environment configuration before deploying.',
          );
        } else {
          services.log(
            `  Warning — Netlify did not provide enough evidence to verify ${envVar.key} ` +
              `${presence.unavailable.join(', ')} metadata for the requested deployment.`,
          );
        }
      }
    }

    const deployArgs: string[] = ['--no-build', '--dir', paths.distAbs, '--functions', paths.functionsAbs];
    if (siteRef) deployArgs.push('--site', siteRef);
    if (options.prod) deployArgs.push('--prod');
    if (options.alias) deployArgs.push('--alias', options.alias);
    if (options.message) deployArgs.push('--message', options.message);
    deployArgs.push('--json');

    services.log('\n─ Deploying to Netlify ─');
    const deployMutation = options.dryRun ? undefined : pendingMutation(`deploy to site ${siteRef}`);
    const stdout = services.runCapture(
      cli,
      ['deploy', ...deployArgs],
      createChildEnvironment(services.parentEnv, { NETLIFY_AUTH_TOKEN: options.authToken }),
      options.dryRun,
      paths.deployDir,
      secrets,
    );
    if (deployMutation) deployMutation.status = 'completed';

    if (!options.dryRun && stdout) {
      try {
        const deploy = JSON.parse(stdout) as NetlifyDeployResult;
        const url = options.alias ? deploy.deploy_url : (deploy.url ?? deploy.deploy_url ?? deploy.ssl_url);
        if (url) services.log(`\nDeploy URL: ${url}`);
        const logsUrl = deploy.logs ?? deploy.links?.logs;
        if (logsUrl) services.log(`Logs:       ${logsUrl}`);
      } catch {
        services.log('\n(Could not parse deploy JSON output from Netlify CLI.)');
      }
    }
    return report;
  } catch (error) {
    throw new DeployFailure(error, report);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export interface NetlifyCliServices {
  collectInteractive(options: NetlifyOptions): Promise<NetlifyCollectionResult>;
  resolvePaths(options: SharedDeployOptions): DeployPaths;
  runDeploy(options: NetlifyOptions, paths: DeployPaths): Promise<DeploymentReport>;
  cleanupSandbox(paths: DeployPaths, keepSandbox: boolean, dryRun: boolean): void;
  keepSandboxOnFailure(paths: DeployPaths): void;
  log(message?: string): void;
  error(value: unknown): void;
}

const DEFAULT_CLI_SERVICES: NetlifyCliServices = {
  collectInteractive: collectInteractiveOptions,
  resolvePaths,
  runDeploy,
  cleanupSandbox,
  keepSandboxOnFailure,
  log: (message = '') => console.log(message),
  error: (value) => console.error(value),
};

export async function runNetlifyCli(argv: string[], overrides: Partial<NetlifyCliServices> = {}): Promise<number> {
  const services = { ...DEFAULT_CLI_SERVICES, ...overrides };
  let options: NetlifyOptions | undefined;
  let paths: DeployPaths | undefined;

  try {
    let collected = collectCliOptions(argv);
    if (collected.kind === 'help') {
      services.log(HELP);
      return 0;
    }
    if (collected.kind === 'cancel') return 0;
    options = collected.options;
    if (options.interactive) {
      collected = await services.collectInteractive(options);
      if (collected.kind === 'help') {
        services.log(HELP);
        return 0;
      }
      if (collected.kind === 'cancel') return 0;
      options = collected.options;
      services.log('Starting deploy');
    }

    options = validateNetlifyOptions(options);
    paths = services.resolvePaths(options);
    await services.runDeploy(options, paths);
    services.cleanupSandbox(paths, options.keepSandbox, options.dryRun);
    services.log('\n✓ Deploy finished.');
    return 0;
  } catch (err) {
    const failure =
      err instanceof BailError || err instanceof DeployFailure
        ? `\n✖ ${err.message}`
        : err instanceof Error
          ? (err.stack ?? err.message)
          : String(err);
    services.error(redactCommand(failure, collectSecrets(options?.authToken, options?.mongodbUri)));

    if (err instanceof DeployFailure && err.report.remoteMutations.length > 0) {
      services.error('\nRemote state may remain; automatic rollback was not attempted:');
      for (const mutation of err.report.remoteMutations) {
        services.error(`  - ${mutation.status}: ${mutation.operation}`);
      }
    }

    if (paths) services.keepSandboxOnFailure(paths);
    return 1;
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runNetlifyCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? `\n✖ ${error.message}` : error);
      process.exitCode = 1;
    });
}
