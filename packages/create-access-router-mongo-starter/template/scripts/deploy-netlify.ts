#!/usr/bin/env tsx
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
 * Run with `pnpm deploy:netlify`. Pass `-i / --interactive` to be prompted
 * for any flag that was not supplied on the command line.
 *
 * Sandbox mode (`--ephemeral` or `--sandbox-dir <path>`) builds into a
 * self-contained deploy directory instead of the package root, so no
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
  keepSandboxOnFailure,
  resolvePaths,
  run,
  SHARED_DEFAULTS,
  SOURCE_DIR,
  BailError,
  type DeployPaths,
  type SharedDeployOptions,
} from './deploy-shared';

// ---------------------------------------------------------------------------
// Netlify API
// ---------------------------------------------------------------------------

const NETLIFY_API = 'https://api.netlify.com/api/v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i;

const defaultApiBaseUrl = (functionsName: string) => `/.netlify/functions/${functionsName}`;

interface NetlifySite {
  id?: string;
  site_id?: string;
  name?: string;
}

function bailOnAuth(status: number, body: string, action: string): never {
  const msg =
    status === 401
      ? 'Netlify auth token is invalid or expired. The API responded with 401 Access Denied.'
      : `Netlify API error (${status}) during ${action}: ${body}`;
  bail(msg);
}

async function fetchSiteById(authToken: string, id: string): Promise<NetlifySite | null> {
  const res = await fetch(`${NETLIFY_API}/sites/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (res.ok) return (await res.json()) as NetlifySite;
  if (res.status === 404) return null;
  const body = await res.text();
  if (res.status === 401) bailOnAuth(res.status, body, `looking up site "${id}"`);
  return null;
}

async function fetchSiteByName(authToken: string, name: string): Promise<NetlifySite | null> {
  const res = await fetch(`${NETLIFY_API}/sites?filter=${encodeURIComponent(name)}&per_page=100`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    bailOnAuth(res.status, body, 'listing sites');
  }
  const arr = (await res.json()) as NetlifySite[];
  return arr.find((s) => s.name === name) ?? null;
}

async function canAccessSite(authToken: string, siteRef: string): Promise<boolean> {
  const site = UUID_RE.test(siteRef)
    ? await fetchSiteById(authToken, siteRef)
    : await fetchSiteByName(authToken, siteRef);
  if (!site && !UUID_RE.test(siteRef)) {
    const byId = await fetchSiteById(authToken, siteRef);
    return byId !== null;
  }
  return site !== null;
}

/**
 * Create a new site on Netlify.
 *   - Returns the new site on success (name was available).
 *   - Returns `null` on HTTP 422 (name is globally taken — possibly by the
 *     caller's own account, possibly by another user). The caller should
 *     then check `fetchSiteByName` to distinguish the two cases.
 *   - Bails with a clear message on any other error.
 */
async function createSite(authToken: string, name: string, teamSlug?: string): Promise<NetlifySite | null> {
  const url = teamSlug ? `${NETLIFY_API}/sites?account_slug=${encodeURIComponent(teamSlug)}` : `${NETLIFY_API}/sites`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (res.ok) return (await res.json()) as NetlifySite;
  if (res.status === 422) return null; // name globally taken
  const body = await res.text();
  if (res.status === 401) bailOnAuth(res.status, body, `creating site "${name}"`);
  bail(`Netlify API error (${res.status}) creating site "${name}": ${body}`);
}

/**
 * Resolve a site name into a deployable target with the following rule:
 *   1. Attempt to create a new site with the name.
 *      - Success → new site, deploy to it.
 *      - 422 → name is globally taken. Fall through to step 2.
 *   2. Check if the name belongs to the caller's account.
 *      - Found → deploy to the existing site.
 *      - Not found → name is taken by another user — return null so the
 *        caller can re-prompt.
 *
 * Returns `{ siteId, created }` on success, or `null` when the name is
 * taken by another user and cannot be (re)used.
 */
async function resolveSiteTarget(
  authToken: string,
  name: string,
  teamSlug?: string,
): Promise<{ siteId: string; created: boolean } | null> {
  const created = await createSite(authToken, name, teamSlug);
  if (created) {
    if (!created.id) bail(`Unexpected: site created with no id for "${name}".`);
    return { siteId: created.id, created: true };
  }

  // 422 — name is globally taken. Check if it's in the caller's account.
  const existing = await fetchSiteByName(authToken, name);
  if (existing?.id) return { siteId: existing.id, created: false };

  // Taken by another user.
  return null;
}

function validateSiteName(name: string): string | undefined {
  if (!name.trim()) return 'Required';
  if (!SITE_NAME_RE.test(name.trim())) return 'Lowercase letters, digits, and hyphens only';
  return undefined;
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
    const body = `# Generated by scripts/deploy-netlify.ts. Edit freely.
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
  noRedirects: boolean;
  message: string | undefined;
}

const HELP = `access-router-mongo-starter Netlify deploy

Usage: pnpm deploy:netlify [options]

Options:
  -i, --interactive          Prompt for any missing option via @clack/prompts
  -t, --auth-token <token>   Netlify auth token (env: NETLIFY_AUTH_TOKEN)
  -s, --site <name-or-id>    Existing Netlify site name or id to deploy to.
                             Passed through to the CLI as --site <ref>.
                             (env: NETLIFY_SITE_ID)
      --site-name <name>     Netlify site name. If it belongs to one of your
                             sites, deploy to it; otherwise attempt to create
                             a new site with that name (bails if the name is
                             globally taken by another user). (env: NETLIFY_SITE_NAME)
      --team <slug>          Team slug if a new site gets created
                             (--site-name). (env: NETLIFY_TEAM_SLUG)
  -p, --prod                 Deploy to production (default: draft/preview)
      --api-base-url <url>   VITE_API_BASE_URL for the frontend build
                             (default: "/.netlify/functions/<functions-name>")
      --mongodb-uri <uri>    MONGODB_URI for the serverless function
                             (env: MONGODB_URI). Required for production deploys
                             (startDB() throws without it).
      --dist-dir <path>      Frontend publish dir (default: "dist")
      --functions-dir <path> Serverless output dir (default: "netlify/functions")
      --functions-name <name> Serverless function name (default: "main")
  -m, --message <msg>        Deploy log message
      --no-build             Skip the build steps; deploy existing artifacts
      --no-redirects         Do not generate a netlify.toml redirect
      --ephemeral            Build into a temp dir under /tmp/opencode and
                             remove it on success (keep with --keep-sandbox)
      --sandbox-dir <path>   Build into the given directory (persistent)
      --keep-sandbox         With --ephemeral, keep the sandbox after deploy
      --dry-run              Print the commands without running them
  -h, --help                 Show this help
`;

function parseArgs(argv: string[]): NetlifyOptions {
  const o: NetlifyOptions = {
    ...SHARED_DEFAULTS,
    interactive: false,
    authToken: process.env.NETLIFY_AUTH_TOKEN,
    site: process.env.NETLIFY_SITE_ID,
    siteName: process.env.NETLIFY_SITE_NAME,
    team: process.env.NETLIFY_TEAM_SLUG,
    prod: false,
    noRedirects: false,
    message: undefined,
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
  intro('access-router-mongo-starter → Netlify deploy');

  if (!options.sandboxDir && !options.ephemeral) {
    const sandboxChoice = await select({
      message: 'Build target',
      options: [
        { value: 'repo', label: `Repo (${SOURCE_DIR})` },
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
    console.log(`\n• Building into repo: ${paths.deployDir}`);
  }

  let siteRef: string | undefined;
  const linked = readLinkedSite(stateFile);

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

  if (options.mongodbUri) {
    console.log(`• MONGODB_URI: provided (will be set on site env, scope=functions)`);
  } else if (options.prod) {
    bail('--mongodb-uri is required for production deploys (startDB() throws without it and there is no fallback).');
  }

  if (!options.dryRun && siteRef) {
    console.log(`\n• Validating site "${siteRef}" with Netlify API…`);
    const accessible = await canAccessSite(options.authToken!, siteRef);
    if (!accessible) {
      bail(
        `Site "${siteRef}" was not found or is not accessible with the provided auth token. ` +
          `Check --site/--site-name or delete ${stateFile} to start fresh. ` +
          `(The Netlify CLI itself reports this as "Project not found. Please rerun netlify link".)`,
      );
    }
    console.log('  OK — site is accessible.');
  }

  // --- Shared build ---
  const prepared = buildArtifacts(options, paths);

  // --- Netlify-specific deploy ---
  ensureNetlifyToml(options, paths);

  const bin = netlifyBinary();
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
  if (options.message) deployArgs.push('--message', options.message);

  console.log('\n─ Deploying to Netlify ─');
  if (bin === 'netlify') {
    run('netlify', ['deploy', ...deployArgs], prepared.buildEnv, options.dryRun, paths.deployDir);
  } else {
    run(
      'npx',
      ['-y', '-p', 'netlify-cli', 'netlify', 'deploy', ...deployArgs],
      prepared.buildEnv,
      options.dryRun,
      paths.deployDir,
    );
  }

  if (options.mongodbUri && !options.dryRun && siteRef) {
    console.log('\n─ Setting MONGODB_URI on the site (scope=functions) ─');
    const envSetArgs = [
      'env:set',
      'MONGODB_URI',
      options.mongodbUri,
      '--scope',
      'functions',
      '--auth',
      options.authToken!,
      '--site',
      siteRef,
    ];
    if (bin === 'netlify') {
      run('netlify', envSetArgs, prepared.buildEnv, options.dryRun, paths.deployDir);
    } else {
      run(
        'npx',
        ['-y', '-p', 'netlify-cli', 'netlify', ...envSetArgs],
        prepared.buildEnv,
        options.dryRun,
        paths.deployDir,
      );
    }
    console.log('  OK — runtime function env updated.');
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
