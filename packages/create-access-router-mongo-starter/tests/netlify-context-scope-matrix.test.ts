// @vitest-environment node
/**
 * CARMSF-08 investigation evidence (offline, no network, no live writes).
 *
 * Bound to the pinned toolchain:
 *   - `netlify-cli` 26.2.0 (devDependency of this package)
 *   - `@netlify/api` ^15.1.0 via `scripts/netlify-api.ts`
 *
 * Pinned-CLI facts captured offline (`netlify deploy --help`, 26.2.0):
 *   - `--alias`: "doesn't create a branch deploy and can't be used in
 *     conjunction with the branch subdomain feature."
 *   - `--context`: "Specify a deploy context for environment variables read
 *     during the build" — i.e. a build-time input. This deployer always
 *     invokes the CLI as `deploy --no-build`, so forwarding `--context` to
 *     the CLI could not associate the deployment with a branch at runtime.
 *   - `netlify env:set --context branch:<name>` writes a branch-context env
 *     value; `netlify deploy --alias <name>` produces only an alias draft URL.
 *     These are independent operations — nothing links them.
 *
 * This file therefore reproduces, with stubbed services only:
 *   1. The context/branch/alias/production matrix: which option values reach
 *      the env-write path (`setSiteEnvVar` context) versus the deploy argv
 *      (`--alias` / `--prod`, never `--context` / `--branch`).
 *   2. The setter/verifier scope divergence: the free-tier setter preserves
 *      pre-existing Functions-only scopes (no visibility broadening), while
 *      the free-tier verifier expects all scopes — a deterministic
 *      post-mutation verification mismatch for vars left over from a prior
 *      paid-tier deployment, including hidden (unreadable secret) values.
 *
 * Provider behavior NOT provable offline (which runtime context a draft /
 * alias deploy actually reads at request time) is left to the blocked
 * disposable-site live check recorded on CARMSF-08, not guessed here.
 */
import { describe, expect, it, vi } from 'vitest';
import { runDeploy, type NetlifyDeployServices, type NetlifyOptions } from '../scripts/deploy-netlify';
import { setSiteEnvVar, verifySiteEnvVar, type NetlifyApiClient } from '../scripts/netlify-api';
import { SHARED_DEFAULTS, type DeployPaths } from '../scripts/deploy-shared';

const AUTH_TOKEN = 'carmsf-08-probe-token';

function baseOptions(overrides: Partial<NetlifyOptions> = {}): NetlifyOptions {
  return {
    ...SHARED_DEFAULTS,
    projectRoot: '/probe-project',
    interactive: false,
    authToken: AUTH_TOKEN,
    site: 'probe-site-id',
    siteName: undefined,
    team: undefined,
    prod: false,
    publicDemoAcknowledged: false,
    paidTier: false,
    message: undefined,
    alias: undefined,
    context: 'deploy-preview',
    branch: undefined,
    mongodbUri: 'mongodb://localhost/probe',
    ...overrides,
  };
}

const probePaths: DeployPaths = {
  deployDir: '/probe-sandbox',
  distAbs: '/probe-sandbox/dist',
  functionsAbs: '/probe-sandbox/functions',
  isEphemeral: false,
};

interface ProbeCapture {
  envCalls: Array<{ key: string; context: string | undefined; paidTier: boolean | undefined }>;
  deployArgs: string[] | undefined;
}

async function driveDeploy(options: NetlifyOptions): Promise<ProbeCapture> {
  const capture: ProbeCapture = { envCalls: [], deployArgs: undefined };
  const services: Partial<NetlifyDeployServices> = {
    parentEnv: { PATH: '/probe/bin' },
    buildArtifacts: () => ({ paths: probePaths, options, frontendEnv: {}, backendEnv: {} }),
    inspectArtifacts: () => undefined,
    checkBuildTools: () => undefined,
    ensureNetlifyToml: () => undefined,
    resolveSiteId: async () => 'probe-site-id',
    ensureLinkedSite: () => undefined,
    setSiteEnvVar: async (_token, _site, key, _value, opts) => {
      capture.envCalls.push({ key, context: opts.context, paidTier: opts.paidTier });
    },
    verifySiteEnvVar: async () => ({ status: 'verified' }),
    resolveCli: () => ({ command: '/probe/bin/netlify', argsPrefix: [] }),
    runCapture: (_cli, args) => {
      capture.deployArgs = args;
      return '{}';
    },
    log: () => undefined,
  };
  await runDeploy(options, probePaths, services);
  return capture;
}

function makeMockClient(overrides: Partial<NetlifyApiClient> = {}): NetlifyApiClient {
  return {
    getSite: vi.fn(overrides.getSite ?? (async () => ({ id: 'probe-site', account_id: 'probe-acc' }))),
    listSites: vi.fn(overrides.listSites ?? (async () => [])),
    createSite: vi.fn(overrides.createSite ?? (async () => ({ id: 'new-site', name: 'probe' }))),
    createSiteInTeam: vi.fn(overrides.createSiteInTeam ?? (async () => ({ id: 'new-site', name: 'probe' }))),
    getEnvVars: vi.fn(overrides.getEnvVars ?? (async () => [])),
    getSiteEnvVars: vi.fn(overrides.getSiteEnvVars ?? (async () => [])),
    createEnvVars: vi.fn(overrides.createEnvVars ?? (async () => ({}))),
    updateEnvVar: vi.fn(overrides.updateEnvVar ?? (async () => ({}))),
    setEnvVarValue: vi.fn(overrides.setEnvVarValue ?? (async () => ({}))),
  };
}

describe('CARMSF-08 matrix: env-write target vs deploy target (offline, stubbed)', () => {
  it('default preview: env uses deploy-preview, deploy is a plain draft with no alias/prod/context flags', async () => {
    const capture = await driveDeploy(baseOptions());
    expect(capture.envCalls.map((c) => c.context)).toEqual(['deploy-preview', 'deploy-preview']);
    expect(capture.deployArgs).toBeDefined();
    expect(capture.deployArgs).not.toContain('--alias');
    expect(capture.deployArgs).not.toContain('--prod');
    // The deploy argv never carries --context/--branch: nothing associates
    // the deployment itself with the context the env vars were written to.
    expect(capture.deployArgs).not.toContain('--context');
    expect(capture.deployArgs).not.toContain('--branch');
  });

  it('context-only (--context branch:staging): env targets the branch but the deploy stays a plain draft — DIVERGENT', async () => {
    const capture = await driveDeploy(baseOptions({ context: 'branch:staging' }));
    expect(capture.envCalls.map((c) => c.context)).toEqual(['branch:staging', 'branch:staging']);
    expect(capture.deployArgs).not.toContain('--alias');
    expect(capture.deployArgs).not.toContain('--context');
    expect(capture.deployArgs).not.toContain('--branch');
  });

  it('alias-only (--alias staging): deploy gets a predictable URL but env stays deploy-preview, and alias is not a branch deploy — DIVERGENT', async () => {
    const capture = await driveDeploy(baseOptions({ alias: 'staging' }));
    expect(capture.envCalls.map((c) => c.context)).toEqual(['deploy-preview', 'deploy-preview']);
    expect(capture.deployArgs).toContain('--alias');
    // Pinned CLI 26.2.0: "alias doesn't create a branch deploy".
    expect(capture.deployArgs).not.toContain('--branch');
  });

  it('--branch staging: env targets branch:staging but the deploy is still only an alias draft — DIVERGENT, alias is not branch proof', async () => {
    const capture = await driveDeploy(baseOptions({ branch: 'staging' }));
    // applyBranchOverride synthesizes alias + context before any mutation.
    expect(capture.envCalls.map((c) => c.context)).toEqual(['branch:staging', 'branch:staging']);
    const aliasIndex = capture.deployArgs!.indexOf('--alias');
    expect(aliasIndex).toBeGreaterThan(-1);
    expect(capture.deployArgs![aliasIndex + 1]).toBe('staging');
    expect(capture.deployArgs).not.toContain('--branch');
    expect(capture.deployArgs).not.toContain('--context');
  });

  it('production (--prod): env context is forced to production and the deploy targets production — the only fully-associated combo', async () => {
    const capture = await driveDeploy(
      baseOptions({ prod: true, publicDemoAcknowledged: true, context: 'branch:staging' }),
    );
    expect(capture.envCalls.map((c) => c.context)).toEqual(['production', 'production']);
    expect(capture.deployArgs).toContain('--prod');
    expect(capture.deployArgs).not.toContain('--alias');
  });

  it('rejects --prod combined with --alias/--branch before any mutation', async () => {
    const forbidden = vi.fn();
    await expect(
      runDeploy(baseOptions({ prod: true, publicDemoAcknowledged: true, alias: 'staging' }), probePaths, {
        parentEnv: { PATH: '/probe/bin' },
        buildArtifacts: forbidden,
        inspectArtifacts: forbidden,
        runCapture: forbidden,
        log: () => undefined,
      }),
    ).rejects.toThrow('--prod cannot be combined with --alias or --branch');
    expect(forbidden).not.toHaveBeenCalled();
  });
});

describe('CARMSF-08 scope policy: free-tier setter vs verifier on pre-existing Functions-only vars', () => {
  it('free-tier setter preserves Functions-only scopes (no broadening of the Mongo secret), then the free-tier verifier reports a scope mismatch', async () => {
    // A MONGODB_URI left over from a prior paid-tier deploy: Functions-only
    // scopes, secret, readable deploy-preview value.
    const client = makeMockClient({
      getEnvVars: async () => [
        {
          key: 'MONGODB_URI',
          is_secret: true,
          scopes: ['functions'],
          values: [{ context: 'deploy-preview', value: 'mongodb://localhost/old' }],
        },
      ],
    });
    await setSiteEnvVar(
      AUTH_TOKEN,
      'probe-site',
      'MONGODB_URI',
      'mongodb://localhost/new',
      {
        sensitive: true,
      },
      client,
    );
    // Setter: desiredScopes is undefined on free tier, so scopeMatches is
    // true and only the value is replaced — scopes stay ['functions'] and
    // is_secret stays true (Mongo secret visibility is never broadened).
    expect(client.setEnvVarValue).toHaveBeenCalledTimes(1);
    expect(client.updateEnvVar).not.toHaveBeenCalled();
    expect(client.createEnvVars).not.toHaveBeenCalled();

    // Verifier under the same default (free-tier) options insists on all
    // scopes, so the preserved Functions-only var deterministically mismatches
    // AFTER the mutation above has already run.
    const readClient = makeMockClient({
      getEnvVars: async () => [
        {
          key: 'MONGODB_URI',
          is_secret: true,
          scopes: ['functions'],
          values: [{ context: 'deploy-preview', value: 'mongodb://localhost/new' }],
        },
      ],
    });
    const result = await verifySiteEnvVar(
      AUTH_TOKEN,
      'probe-site',
      'MONGODB_URI',
      {
        context: 'deploy-preview',
        sensitive: true,
      },
      readClient,
    );
    expect(result).toEqual({ status: 'mismatch', mismatches: ['scope'] });
  });

  it('free-tier setter refuses to reconcile hidden secret values when sensitivity differs, without mutating', async () => {
    // Secret values are not readable via the API (no `value` field); with a
    // sensitivity mismatch the replace-all update cannot preserve every
    // context value, so the setter must bail instead of guessing.
    const client = makeMockClient({
      getEnvVars: async () => [
        {
          key: 'MONGODB_URI',
          is_secret: false,
          scopes: ['functions'],
          values: [{ context: 'deploy-preview' }],
        },
      ],
    });
    await expect(
      setSiteEnvVar(
        AUTH_TOKEN,
        'probe-site',
        'MONGODB_URI',
        'mongodb://localhost/new',
        {
          sensitive: true,
        },
        client,
      ),
    ).rejects.toThrow(/preserve every context value/);
    expect(client.updateEnvVar).not.toHaveBeenCalled();
    expect(client.setEnvVarValue).not.toHaveBeenCalled();
    expect(client.createEnvVars).not.toHaveBeenCalled();
  });
});
