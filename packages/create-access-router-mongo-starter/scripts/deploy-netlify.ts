/**
 * Netlify deployment adapter for the access-router-mongo-starter.
 *
 * Consumes the shared build/deploy preparation from `deploy-shared.ts` and
 * adds Netlify-specific concerns:
 *   - site lookup / creation via the `@netlify/api` SDK
 *   - direct `.netlify/state.json` writing (no `netlify link` CLI needed)
 *   - minimal `netlify.toml` generation for build/functions settings
 *   - `netlify deploy` CLI invocation (the only remaining CLI usage)
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
 * Ephemeral sandboxes live under `/tmp/opencode` and are removed on success
 * unless `--keep-sandbox` is passed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { cancel, confirm, intro, isCancel, outro, password, select, text } from '@clack/prompts';
import {
  bail,
  buildArtifacts,
  cleanupSandbox,
  collectSecrets,
  keepSandboxOnFailure,
  projectRootOf,
  resolvePaths,
  runCapture,
  SHARED_DEFAULTS,
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

interface NetlifyCli {
  command: string;
  argsPrefix: string[];
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

export function planRuntimeSiteEnvVars(apiBaseUrl: string, mongodbUri?: string): Array<{ key: string; value: string }> {
  const envVars = [{ key: 'API_BASE_URL', value: apiBaseUrl }];
  if (mongodbUri) envVars.push({ key: 'MONGODB_URI', value: mongodbUri });
  return envVars;
}

function resolveNetlifyCli(): NetlifyCli {
  if (typeof require !== 'function') {
    bail(
      'The Netlify deploy bin must run from the built package so it can resolve its bundled netlify-cli dependency.',
    );
  }

  try {
    const packageJsonPath = require.resolve('netlify-cli/package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { bin?: string | Record<string, string> };
    const binPath = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.netlify;
    if (!binPath)
      bail('Could not resolve the installed netlify-cli binary. Reinstall create-access-router-mongo-starter.');
    return {
      command: process.execPath,
      argsPrefix: [resolve(dirname(packageJsonPath), binPath)],
    };
  } catch {
    bail('Could not find the bundled netlify-cli dependency. Reinstall create-access-router-mongo-starter.');
  }
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

export function readLinkedSite(stateFile: string): LinkedSite | null {
  if (!existsSync(stateFile)) return null;
  try {
    const data = JSON.parse(readFileSync(stateFile, 'utf8')) as LinkedSite;
    if (data.siteId || data.siteName) return data;
  } catch {
    /* ignore malformed state */
  }
  return null;
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
function ensureLinkedSite(stateFile: string, siteId: string, dryRun: boolean): void {
  const linked = readLinkedSite(stateFile);
  if (linked?.siteId === siteId) {
    console.log(`• Site link already present at ${stateFile}`);
    return;
  }

  console.log(`\n• Linking deploy directory to site "${siteId}" …`);
  if (!dryRun) {
    mkdirSync(resolve(stateFile, '..'), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ siteId }, null, 2) + '\n');
  }
  console.log(`  OK — ${stateFile} now points at site ${siteId}.`);
}

function ensureNetlifyToml(options: NetlifyOptions, paths: DeployPaths): void {
  const tomlPath = resolve(paths.deployDir, 'netlify.toml');
  if (existsSync(tomlPath)) {
    console.log(`• netlify.toml already present at ${tomlPath}`);
    return;
  }

  const body = `# Generated by create-access-router-mongo-starter-deploy-netlify. Edit freely.
[build]
  base = ""
  publish = "${options.distDir}"

[functions]
  directory = "${options.functionsDir}"
  node_bundler = "esbuild"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;

  if (!options.dryRun) {
    mkdirSync(paths.deployDir, { recursive: true });
    writeFileSync(tomlPath, body);
  }

  console.log(`• Created ${tomlPath}`);
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

interface NetlifyOptions extends SharedDeployOptions {
  interactive: boolean;
  authToken: string | undefined;
  site: string | undefined;
  siteName: string | undefined;
  team: string | undefined;
  prod: boolean;
  paidTier: boolean;
  message: string | undefined;
  alias: string | undefined;
  context: string | undefined;
}

const HELP = `access-router-mongo-starter Netlify deploy

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
      --paid-tier             Use paid-tier Netlify env scoping
                               (--scope functions) when setting and
                               verifying site env vars. Default: free-tier-
                               compatible behavior with no --scope flag.
      --alias <name>          Create a draft deploy with a predictable URL:
                              https://<name>--<site-name>.netlify.app
                              Useful for staging, review apps, or named
                              previews. Cannot be combined with --prod.
      --context <ctx>         Netlify deploy context for env (e.g.
                               "production", "deploy-preview",
                               "branch-deploy", or "branch:staging").
                               (env: NETLIFY_CONTEXT, default: "deploy-preview")
                               Ignored when --prod is set; production deploys
                               always use context "production".
      --api-base-url <url>    VITE_API_BASE_URL for the frontend build and
                               API_BASE_URL for the serverless function
                               (default: "/.netlify/functions/<functions-name>")
      --mongodb-uri <uri>     MONGODB_URI for the serverless function
                              (env: MONGODB_URI). Required for production
                              deploys (startDB() throws without it).
      --dist-dir <path>       Frontend publish dir (default: "dist")
      --functions-dir <path>  Serverless output dir (default: "netlify/functions")
      --functions-name <name> Serverless function name (default: "main")
  -m, --message <msg>         Deploy log message
      --no-build              Skip the build steps; deploy existing artifacts
      --ephemeral             Build into a temp dir under /tmp/opencode and
                              remove it on success (keep with --keep-sandbox)
      --sandbox-dir <path>   Build into the given directory (persistent)
      --keep-sandbox          With --ephemeral, keep the sandbox after deploy
      --dry-run              Print the commands without running them
  -h, --help                 Show this help
`;

function parseArgs(argv: string[]): NetlifyOptions {
  const o: NetlifyOptions = {
    ...SHARED_DEFAULTS,
    projectRoot: process.cwd(),
    interactive: false,
    authToken: process.env.NETLIFY_AUTH_TOKEN,
    site: process.env.NETLIFY_SITE_ID,
    siteName: process.env.NETLIFY_SITE_NAME,
    team: process.env.NETLIFY_TEAM_SLUG,
    prod: false,
    paidTier: false,
    message: undefined,
    alias: undefined,
    context: process.env.NETLIFY_CONTEXT ?? 'deploy-preview',
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
      case '-i':
      case '--interactive':
        o.interactive = true;
        break;
      case '-t':
      case '--auth-token':
        o.authToken = next();
        break;
      case '-s':
      case '--site':
        o.site = next();
        break;
      case '--site-name':
        o.siteName = next();
        break;
      case '--team':
        o.team = next();
        break;
      case '-p':
      case '--prod':
        o.prod = true;
        break;
      case '--paid-tier':
        o.paidTier = true;
        break;
      case '--alias':
        o.alias = next();
        break;
      case '--context':
        o.context = next();
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
      case '-m':
      case '--message':
        o.message = next();
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
        process.stdout.write(HELP);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${a}\n\n${HELP}`);
    }
  }

  o.context = resolveDeployContext(o);

  return o;
}

// ---------------------------------------------------------------------------
// Interactive prompts
// ---------------------------------------------------------------------------

async function prompt(options: NetlifyOptions): Promise<NetlifyOptions> {
  const projectRoot = projectRootOf(options);
  intro('access-router-mongo-starter → Netlify deploy');

  if (!options.sandboxDir && !options.ephemeral) {
    const sandboxChoice = await select({
      message: 'Build target',
      options: [
        { value: 'repo', label: `Repo (${projectRoot})` },
        { value: 'sandbox', label: 'Persistent sandbox dir (--sandbox-dir)' },
        { value: 'ephemeral', label: 'Ephemeral temp dir (removed on success)' },
      ],
      initialValue: 'repo',
    });
    if (isCancel(sandboxChoice)) {
      cancel('Cancelled');
      process.exit(0);
    } else if (sandboxChoice === 'sandbox') {
      const v = await text({
        message: 'Sandbox directory path',
        validate: (s) => (s && s.trim() ? undefined : 'Required'),
      });
      if (isCancel(v)) {
        cancel('Cancelled');
        process.exit(0);
      } else options.sandboxDir = (v as string).trim();
    } else if (sandboxChoice === 'ephemeral') {
      options.ephemeral = true;
      const keep = await confirm({
        message: 'Keep the ephemeral sandbox after deploy?',
        initialValue: options.keepSandbox,
      });
      if (isCancel(keep)) {
        cancel('Cancelled');
        process.exit(0);
      } else options.keepSandbox = keep === true;
    }
  }

  if (!options.authToken) {
    const v = await password({
      message: 'Netlify auth token',
      validate: (s) => (s && s.trim() ? undefined : 'Required'),
    });
    if (isCancel(v)) {
      cancel('Cancelled');
      process.exit(0);
    } else options.authToken = String(v).trim();
  }

  if (!options.site && !options.siteName) {
    let teamAsked = false;
    let attempt = 0;
    while (true) {
      attempt++;
      const v = await text({
        message: attempt > 1 ? 'Try a different Netlify site name' : 'Netlify site name',
        placeholder: 'lowercase letters, digits, hyphens',
        validate: validateSiteName,
      });
      if (isCancel(v)) {
        cancel('Cancelled');
        process.exit(0);
      }
      const name = (v as string).trim();

      // 1. Try to create the site. Success = name was available.
      if (!options.team && !teamAsked) {
        const team = await text({
          message: 'Team slug for the new site',
          defaultValue: '',
          placeholder: 'optional — uses your default team if blank',
        });
        if (isCancel(team)) {
          cancel('Cancelled');
          process.exit(0);
        }
        options.team = (team as string).trim() || undefined;
        teamAsked = true;
      }
      console.log(`\n  Trying to create "${name}"…`);
      const created = await createSite(options.authToken, name, options.team);
      if (created) {
        if (!created.id) bail('Unexpected: created site has no id from Netlify.');
        console.log(`  ✓ Created new site "${name}" (${created.id}).`);
        options.site = created.id;
        break;
      }

      // 2. 422 — name is globally taken. Check if it's in the caller's account.
      console.log(`  Name is taken. Checking if it belongs to you…`);
      const existing = await fetchSiteByName(options.authToken, name);
      if (existing?.id) {
        console.log(`  ✓ Found in your account — deploying to existing site (${existing.id}).`);
        options.site = existing.id;
        break;
      }

      // 3. Taken by another user — re-prompt.
      console.log(`  ✗ "${name}.netlify.app" is already taken by another user. Try a different name.`);
    }
  } else if (options.siteName && !options.team) {
    const v = await text({
      message: 'Team slug (used only if a new site gets created)',
      defaultValue: '',
      placeholder: 'optional — uses your default team if blank',
    });
    if (isCancel(v)) {
      cancel('Cancelled');
      process.exit(0);
    } else options.team = (v as string).trim() || undefined;
  }

  const prod = await confirm({
    message: 'Deploy to production?',
    initialValue: options.prod,
  });
  if (isCancel(prod)) {
    cancel('Cancelled');
    process.exit(0);
  } else options.prod = prod === true;

  if (!options.prod && !options.alias) {
    const wantAlias = await confirm({
      message: 'Create a named draft deploy (--alias)?',
      initialValue: false,
    });
    if (isCancel(wantAlias)) {
      cancel('Cancelled');
      process.exit(0);
    } else if (wantAlias) {
      const v = await text({
        message: 'Alias name (creates https://<alias>--<site>.netlify.app)',
        placeholder: 'staging, review-pr-42, …',
        validate: (s) => (s && s.trim() ? undefined : 'Required'),
      });
      if (isCancel(v)) {
        cancel('Cancelled');
        process.exit(0);
      } else options.alias = (v as string).trim();
    }
  }

  options.context = resolveDeployContext(options);

  if (!options.mongodbUri) {
    const v = await password({
      message: options.prod
        ? 'MONGODB_URI for the serverless function (required for production)'
        : 'MONGODB_URI for the serverless function (leave empty to skip env var setup)',
      mask: '•',
      validate: (s) => (options.prod && !(s && s.trim()) ? 'Required for production deploys' : undefined),
    });
    if (isCancel(v)) {
      cancel('Cancelled');
      process.exit(0);
    } else options.mongodbUri = (v as string).trim() || undefined;
  }

  const build = await confirm({
    message: 'Run the build steps before deploying?',
    initialValue: !options.noBuild,
  });
  if (isCancel(build)) {
    cancel('Cancelled');
    process.exit(0);
  } else options.noBuild = build !== true;

  return options;
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

async function runDeploy(options: NetlifyOptions, paths: DeployPaths): Promise<void> {
  const stateFile = resolve(paths.deployDir, '.netlify/state.json');

  if (paths.isEphemeral || options.sandboxDir) {
    console.log(`\n• Sandbox: ${paths.deployDir}${paths.isEphemeral ? ' (ephemeral)' : ''}`);
  } else {
    console.log(`\n• Building into project: ${paths.deployDir}`);
  }

  let siteRef: string | undefined;

  // In sandbox/ephemeral mode the deploy directory doesn't have a
  // `.netlify/state.json`, so fall back to the project root's link if one
  // exists there.
  const linked = readLinkedSite(stateFile) ?? readLinkedSite(resolve(projectRootOf(options), '.netlify', 'state.json'));

  if (options.site) {
    siteRef = options.site;
    console.log(`• Site: ${siteRef}`);
  } else if (options.siteName) {
    if (options.dryRun) {
      console.log(`\n• [--dry-run] Skipping site lookup/create for "${options.siteName}".`);
      siteRef = options.siteName;
    } else {
      console.log(`\n• Looking up site "${options.siteName}" on Netlify…`);
      const resolved = await resolveSiteTarget(options.authToken!, options.siteName, options.team);
      if (!resolved) {
        bail(
          `Site name "${options.siteName}" is already taken by another user. ` +
            `Pass a different --site-name (or use --site <existing-id>).`,
        );
      }
      siteRef = resolved.siteId;
      console.log(
        `• ${resolved.created ? `Created new site "${options.siteName}"` : `Found existing site "${options.siteName}"`} → ${siteRef}`,
      );
    }
  } else if (linked) {
    siteRef = linked.siteName ?? linked.siteId;
    console.log(`• Site: ${siteRef} (linked via ${stateFile})`);
  } else {
    bail(
      'No deploy target specified. Pass --site <name-or-id> to look up / deploy, ' +
        'or --site-name <name> to create or reuse a site by name. Add -i for interactive prompts.',
    );
  }

  if (!options.apiBaseUrlExplicit) {
    options.apiBaseUrl = defaultApiBaseUrl(options.functionsName);
    console.log(
      `• VITE_API_BASE_URL: ${options.apiBaseUrl} (derived from --functions-name "${options.functionsName}")`,
    );
  } else {
    console.log(`• VITE_API_BASE_URL: ${options.apiBaseUrl} (overridden)`);
  }

  const envContextLabel = options.context ?? 'all contexts';
  const scopeLabel = envScopeLabel(options);

  console.log(
    `• API_BASE_URL: ${options.apiBaseUrl} (will be set on site env, scope=${scopeLabel}, context=${envContextLabel})`,
  );

  if (options.mongodbUri) {
    console.log(`• MONGODB_URI: provided (will be set on site env, scope=${scopeLabel}, context=${envContextLabel})`);
  } else if (options.prod) {
    bail('--mongodb-uri is required for production deploys (startDB() throws without it and there is no fallback).');
  } else {
    console.log(
      '• MONGODB_URI: not provided, so env var setup will be skipped. ' +
        'Pass --mongodb-uri or export MONGODB_URI if you want this script to write it to Netlify.',
    );
  }

  if (!options.dryRun && siteRef) {
    console.log(`\n• Validating site "${siteRef}" with Netlify API…`);
    const resolvedSiteId = await resolveSiteId(options.authToken!, siteRef);
    if (!resolvedSiteId) {
      bail(
        `Site "${siteRef}" was not found or is not accessible with the provided auth token. ` +
          `Check --site/--site-name or delete ${stateFile} to start fresh. ` +
          `(The Netlify CLI itself reports this as "Project not found. Please rerun netlify link".)`,
      );
    }
    if (resolvedSiteId !== siteRef) {
      console.log(`  Resolved site id: ${resolvedSiteId}`);
    }
    siteRef = resolvedSiteId;
    console.log('  OK — site is accessible.');
  }

  // --- Shared build ---
  const prepared = buildArtifacts(options, paths);

  // --- Netlify-specific deploy ---
  ensureNetlifyToml(options, paths);
  const cli = resolveNetlifyCli();
  const secrets = collectSecrets(options.authToken, options.mongodbUri);

  // Ensure the active deploy directory is linked to the resolved site before
  // running `netlify deploy`, which may fall back to `.netlify/state.json`.
  // We write the file directly — no CLI subprocess needed.
  if (!options.dryRun && siteRef) {
    ensureLinkedSite(stateFile, siteRef, options.dryRun);
  }

  // Set runtime env vars *before* deploying so the serverless function has
  // them available as soon as the deploy goes live.
  if (!options.dryRun && siteRef) {
    for (const envVar of planRuntimeSiteEnvVars(options.apiBaseUrl!, options.mongodbUri)) {
      console.log(`\n─ Setting ${envVar.key} on the site (scope=${scopeLabel}, context=${envContextLabel}) ─`);
      await setSiteEnvVar(options.authToken!, siteRef, envVar.key, envVar.value, {
        paidTier: options.paidTier,
        context: options.context,
      });
      console.log('  OK — runtime function env updated.');

      console.log(`\n─ Verifying ${envVar.key} on the site (scope=${scopeLabel}, context=${envContextLabel}) ─`);
      const presence = await verifySiteEnvVar(options.authToken!, siteRef, envVar.key, {
        context: options.context,
        paidTier: options.paidTier,
      });

      if (presence === 'present') {
        console.log(`  OK — ${envVar.key} is present on the target site/context.`);
      } else if (presence === 'missing') {
        bail(
          `Env var setup completed, but ${envVar.key} was not found afterward. ` +
            'Check the site, scope, and context being targeted.',
        );
      } else {
        console.log(`  Warning — could not verify ${envVar.key} presence from Netlify API.`);
      }
    }
  }

  const deployArgs: string[] = [
    '--no-build',
    '--dir',
    paths.distAbs,
    '--functions',
    paths.functionsAbs,
    '--auth',
    options.authToken!,
  ];
  if (siteRef) deployArgs.push('--site', siteRef);
  if (options.prod) deployArgs.push('--prod');
  if (options.alias) deployArgs.push('--alias', options.alias);
  // --context flag is only available when using the --build flag
  // if (options.context) deployArgs.push('--context', options.context);
  if (options.message) deployArgs.push('--message', options.message);

  // Use --json so we can capture the deploy URL from stdout.
  // stderr is inherited so live deploy progress remains visible.
  deployArgs.push('--json');

  console.log('\n─ Deploying to Netlify ─');
  const stdout = runCaptureNetlify(
    cli,
    ['deploy', ...deployArgs],
    prepared.buildEnv,
    options.dryRun,
    paths.deployDir,
    secrets,
  );

  if (!options.dryRun && stdout) {
    try {
      const deploy = JSON.parse(stdout) as NetlifyDeployResult;
      const url = options.alias ? deploy.deploy_url : (deploy.url ?? deploy.deploy_url ?? deploy.ssl_url);
      if (url) console.log(`\n🌐 Deploy URL: ${url}`);
      const logsUrl = deploy.logs ?? deploy.links?.logs;
      if (logsUrl) console.log(`📋 Logs:       ${logsUrl}`);
    } catch {
      // If JSON parsing fails, the user still saw the deploy output on stderr.
      console.log('\n(Could not parse deploy JSON output from Netlify CLI.)');
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let options = parseArgs(process.argv.slice(2));
  if (options.interactive) {
    intro('access-router-mongo-starter → Netlify deploy');
    options = await prompt(options);
    outro('Starting deploy');
  }

  options.context = resolveDeployContext(options);

  if (!options.authToken) bail('Netlify auth token is required (use -t / --auth-token or NETLIFY_AUTH_TOKEN).');

  if (options.prod && options.alias) {
    bail('--prod and --alias are mutually exclusive. Use --alias for draft/preview deploys or --prod for production.');
  }

  const paths = resolvePaths(options);
  let deployed = false;

  try {
    await runDeploy(options, paths);
    deployed = true;
  } catch (err) {
    if (err instanceof BailError) console.error(`\n✖ ${err.message}`);
    else console.error(err instanceof Error ? (err.stack ?? err.message) : err);

    keepSandboxOnFailure(paths);
    process.exit(1);
  }

  if (deployed) cleanupSandbox(paths, options.keepSandbox, options.dryRun);

  console.log('\n✓ Deploy finished.');
}

if (typeof require !== 'undefined' && require.main === module) {
  void main();
}
