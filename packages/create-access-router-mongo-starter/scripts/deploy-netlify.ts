/**
 * Netlify deployment adapter for the access-router-mongo-starter.
 *
 * Consumes the shared build/deploy preparation from `deploy-shared.ts` and
 * adds Netlify-specific concerns:
 *   - site lookup / creation via the Netlify API
 *   - `netlify.toml` generation
 *   - `netlify deploy` CLI invocation
 *   - runtime env (`MONGODB_URI`) management on the Netlify site
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
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cancel, confirm, intro, isCancel, outro, password, select, text } from '@clack/prompts';
import {
  bail,
  buildArtifacts,
  cleanupSandbox,
  collectSecrets,
  keepSandboxOnFailure,
  projectRootOf,
  resolvePaths,
  run,
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
  validateSiteName,
} from './netlify-api';

// ---------------------------------------------------------------------------
// Pinned Netlify CLI spec for npx fallback
// ---------------------------------------------------------------------------

const NETLIFY_CLI_SPEC = 'netlify-cli@^18';

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

type EnvPresenceCheck = 'present' | 'missing' | 'unknown';

// ---------------------------------------------------------------------------
// Env presence helpers
// ---------------------------------------------------------------------------

function jsonContainsEnvKey(value: unknown, envKey: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => jsonContainsEnvKey(item, envKey));
  }

  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  if (record.key === envKey || record.name === envKey) return true;
  if (envKey in record) return true;

  return Object.values(record).some((item) => jsonContainsEnvKey(item, envKey));
}

function envScopeArgs(options: Pick<NetlifyOptions, 'paidTier'>): string[] {
  return options.paidTier ? ['--scope', 'functions'] : [];
}

function envScopeLabel(options: Pick<NetlifyOptions, 'paidTier'>): string {
  return options.paidTier ? 'functions' : 'all scopes (free-tier compatible)';
}

function verifyEnvPresence(
  bin: 'netlify' | 'npx',
  env: NodeJS.ProcessEnv,
  cwd: string,
  authToken: string,
  siteRef: string,
  envKey: string,
  context: string | undefined,
  paidTier: boolean,
  secrets: string[] = [],
): EnvPresenceCheck {
  const args = ['env:list', '--json', '--auth', authToken, '--site', siteRef, ...envScopeArgs({ paidTier })];
  if (context) args.push('--context', context);

  const stdout =
    bin === 'netlify'
      ? runCapture('netlify', args, env, false, cwd, secrets)
      : runCapture('npx', ['-y', '-p', NETLIFY_CLI_SPEC, 'netlify', ...args], env, false, cwd, secrets);

  if (!stdout.trim()) return 'unknown';

  try {
    const parsed = JSON.parse(stdout) as unknown;
    return jsonContainsEnvKey(parsed, envKey) ? 'present' : 'missing';
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Linked-site state
// ---------------------------------------------------------------------------

interface LinkedSite {
  siteId?: string;
  siteName?: string;
}

function readLinkedSite(stateFile: string): LinkedSite | null {
  if (!existsSync(stateFile)) return null;
  try {
    const data = JSON.parse(readFileSync(stateFile, 'utf8')) as LinkedSite;
    if (data.siteId || data.siteName) return data;
  } catch {
    /* ignore malformed state */
  }
  return null;
}

// ---------------------------------------------------------------------------
// netlify.toml generation
// ---------------------------------------------------------------------------

function ensureNetlifyToml(options: NetlifyOptions, paths: DeployPaths): void {
  if (options.noRedirects) return;
  const tomlPath = resolve(paths.deployDir, 'netlify.toml');
  const fn = options.functionsName;
  const redirectFrom = options.apiBaseUrl!.startsWith('/.netlify/functions/')
    ? `/api/*`
    : `${options.apiBaseUrl!.replace(/\/$/, '')}/*`;
  const redirectTo = `/.netlify/functions/${fn}/:splat`;
  const redirectBlock = `[[redirects]]
  from = "${redirectFrom}"
  to = "${redirectTo}"
  status = 200
  force = true
`;

  if (!options.dryRun) mkdirSync(paths.deployDir, { recursive: true });
  const exists = existsSync(tomlPath);
  if (!exists) {
    const body = `# Generated by create-access-router-mongo-starter-deploy-netlify. Edit freely.
[build]
  base = ""
  publish = "${options.distDir}"

[functions]
  directory = "${options.functionsDir}"
  node_bundler = "esbuild"

${redirectBlock}`;
    if (!options.dryRun) writeFileSync(tomlPath, body);
    console.log(`\n✓ Created ${tomlPath}`);
    return;
  }

  const existing = readFileSync(tomlPath, 'utf8');
  if (existing.includes('[[redirects]]') && existing.includes(`to = "${redirectTo}"`)) {
    console.log(`\n• ${tomlPath} already has the API redirect`);
    return;
  }
  const updated = `${existing.replace(/\s+$/, '')}\n\n${redirectBlock}`;
  if (!options.dryRun) writeFileSync(tomlPath, updated);
  console.log(`\n✓ Appended API redirect to ${tomlPath}`);
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
  noRedirects: boolean;
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
                              verifying MONGODB_URI. Default: free-tier-
                              compatible behavior with no --scope flag.
      --alias <name>          Create a draft deploy with a predictable URL:
                              https://<name>--<site-name>.netlify.app
                              Useful for staging, review apps, or named
                              previews. Cannot be combined with --prod.
      --context <ctx>         Netlify deploy context for env (e.g.
                              "production", "deploy-preview",
                              "branch-deploy", or "branch:staging").
                              Passed to netlify deploy and env:set.
      --api-base-url <url>    VITE_API_BASE_URL for the frontend build
                              (default: "/.netlify/functions/<functions-name>")
      --mongodb-uri <uri>     MONGODB_URI for the serverless function
                              (env: MONGODB_URI). Required for production
                              deploys (startDB() throws without it).
      --dist-dir <path>       Frontend publish dir (default: "dist")
      --functions-dir <path>  Serverless output dir (default: "netlify/functions")
      --functions-name <name> Serverless function name (default: "main")
  -m, --message <msg>         Deploy log message
      --no-build              Skip the build steps; deploy existing artifacts
      --no-redirects          Do not generate a netlify.toml redirect
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
    noRedirects: false,
    message: undefined,
    alias: undefined,
    context: undefined,
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
      case '--no-redirects':
        o.noRedirects = true;
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

  if (!options.context) {
    const wantContext = await confirm({
      message: 'Set a Netlify deploy context (--context)?',
      initialValue: false,
    });
    if (isCancel(wantContext)) {
      cancel('Cancelled');
      process.exit(0);
    } else if (wantContext) {
      const v = await text({
        message: 'Deploy context',
        placeholder: 'production, deploy-preview, branch-deploy, branch:staging',
        validate: (s) => (s && s.trim() ? undefined : 'Required'),
      });
      if (isCancel(v)) {
        cancel('Cancelled');
        process.exit(0);
      } else options.context = (v as string).trim();
    }
  }

  if (!options.mongodbUri) {
    const v = await password({
      message: options.prod
        ? 'MONGODB_URI for the serverless function (required for production)'
        : 'MONGODB_URI for the serverless function (leave empty to skip env-set)',
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

  const redirects = await confirm({
    message: 'Generate netlify.toml redirect for the API?',
    initialValue: !options.noRedirects,
  });
  if (isCancel(redirects)) {
    cancel('Cancelled');
    process.exit(0);
  } else options.noRedirects = redirects !== true;

  return options;
}

// ---------------------------------------------------------------------------
// Netlify binary resolution
// ---------------------------------------------------------------------------

function netlifyBinary(): 'netlify' | 'npx' {
  const r = spawnSync('netlify', ['--version'], { stdio: 'ignore', shell: false });
  return r.status === 0 ? 'netlify' : 'npx';
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

  if (options.mongodbUri) {
    console.log(`• MONGODB_URI: provided (will be set on site env, scope=${scopeLabel}, context=${envContextLabel})`);
  } else if (options.prod) {
    bail('--mongodb-uri is required for production deploys (startDB() throws without it and there is no fallback).');
  } else {
    console.log(
      '• MONGODB_URI: not provided, so Netlify env:set will be skipped. ' +
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

  const bin = netlifyBinary();
  const secrets = collectSecrets(options.authToken, options.mongodbUri);

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
  if (options.context) deployArgs.push('--context', options.context);
  if (options.message) deployArgs.push('--message', options.message);

  // Use --json so we can capture the deploy URL from stdout.
  // stderr is inherited so live deploy progress remains visible.
  deployArgs.push('--json');

  console.log('\n─ Deploying to Netlify ─');
  let stdout: string;
  if (bin === 'netlify') {
    stdout = runCapture(
      'netlify',
      ['deploy', ...deployArgs],
      prepared.buildEnv,
      options.dryRun,
      paths.deployDir,
      secrets,
    );
  } else {
    stdout = runCapture(
      'npx',
      ['-y', '-p', NETLIFY_CLI_SPEC, 'netlify', 'deploy', ...deployArgs],
      prepared.buildEnv,
      options.dryRun,
      paths.deployDir,
      secrets,
    );
  }

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

  if (options.mongodbUri && !options.dryRun && siteRef) {
    console.log(`\n─ Setting MONGODB_URI on the site (scope=${scopeLabel}, context=${envContextLabel}) ─`);
    const envSetArgs = [
      'env:set',
      'MONGODB_URI',
      options.mongodbUri,
      '--auth',
      options.authToken!,
      '--site',
      siteRef,
      ...envScopeArgs(options),
    ];
    if (options.context) envSetArgs.push('--context', options.context);
    if (bin === 'netlify') {
      run('netlify', envSetArgs, prepared.buildEnv, options.dryRun, paths.deployDir, secrets);
    } else {
      run(
        'npx',
        ['-y', '-p', NETLIFY_CLI_SPEC, 'netlify', ...envSetArgs],
        prepared.buildEnv,
        options.dryRun,
        paths.deployDir,
        secrets,
      );
    }
    console.log('  OK — runtime function env updated.');

    console.log(`\n─ Verifying MONGODB_URI on the site (scope=${scopeLabel}, context=${envContextLabel}) ─`);
    const presence = verifyEnvPresence(
      bin,
      prepared.buildEnv,
      paths.deployDir,
      options.authToken!,
      siteRef,
      'MONGODB_URI',
      options.context,
      options.paidTier,
      secrets,
    );

    if (presence === 'present') {
      console.log('  OK — MONGODB_URI is present on the target site/context.');
    } else if (presence === 'missing') {
      bail(
        'Netlify env:set completed, but MONGODB_URI was not found afterward. ' +
          'Check the site, scope, and context being targeted.',
      );
    } else {
      console.log('  Warning — could not verify MONGODB_URI presence from Netlify CLI JSON output.');
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

main();
