// @vitest-environment node
/**
 * DEPLOY-01 baseline contract, updated for the DEPLOY-03 API deploy path.
 *
 * What changed in DEPLOY-03 and why:
 *   - `runDeploy` no longer spawns `netlify deploy` via `runCapture`, so the
 *     old CLI arg-vector assertions (`--no-build --dir --functions --site
 *     [--prod] [--alias] [--message] --json`, auth-token child env, JSON
 *     stdout parsing) are obsolete. They are replaced by equivalent
 *     `performDeploy` call-contract assertions below: the same option values
 *     (site, prod, alias incl. `--branch` synthesis, message, dryRun) now
 *     flow as structured `PerformDeployArgs`, and the token flows via the
 *     `authToken` param (never a child env).
 *   - DEPLOY-04 deleted the `resolveCli`/`runCapture` service slots entirely,
 *     so there is no spawn seam left to assert against — the contract is that
 *     `performDeploy` receives the token as an explicit parameter.
 *   - URL selection genuinely changed at the log level (the one case this
 *     file's DEPLOY-01 rule forbade changing silently): the old CLI rule was
 *     `alias ? deploy_url : url ?? deploy_url ?? ssl_url`, i.e. non-alias
 *     deploys preferred the mutable site `url`. `performApiDeploy`
 *     normalizes the deploy object to `{ deployUrl = deploy_ssl_url ??
 *     deploy_url, sslUrl = ssl_url ?? url }` and `runDeploy` logs
 *     `deployUrl ?? sslUrl`, so the immutable per-deploy permalink is now
 *     logged even for production deploys. The "non-alias prefers url" test
 *     below is updated to "prefers deployUrl" for this reason; all other
 *     URL/logs cases (fallback, omission, logs-only-when-present) are
 *     behavior-preserving.
 *   - The unparseable-stdout fallback test is removed: the API path returns
 *     structured URLs, nothing JSON-parses CLI stdout anymore.
 *
 * All tests use injected services only (performDeploy mocks): no network,
 * no `netlify` binary.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  runDeploy,
  type NetlifyDeployServices,
  type NetlifyOptions,
  type PerformDeployArgs,
} from '../scripts/deploy-netlify';
import type { ApiDeployUrls } from '../scripts/netlify-deploy-api';
import { SHARED_DEFAULTS, type DeployPaths } from '../scripts/deploy-shared';

const AUTH_TOKEN = 'deploy-01-probe-token';
const MONGO_URI = 'mongodb://localhost/probe';

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
    mongodbUri: MONGO_URI,
    ...overrides,
  };
}

const probePaths: DeployPaths = {
  deployDir: '/probe-sandbox',
  distAbs: '/probe-sandbox/dist',
  functionsAbs: '/probe-sandbox/functions',
  isEphemeral: false,
};

interface DriveResult {
  deployCalls: PerformDeployArgs[];
  logs: string[];
  report: { remoteMutations: Array<{ operation: string; status: string }> };
  spies: {
    setSiteEnvVar: ReturnType<typeof vi.fn>;
    verifySiteEnvVar: ReturnType<typeof vi.fn>;
    resolveSiteId: ReturnType<typeof vi.fn>;
    ensureLinkedSite: ReturnType<typeof vi.fn>;
    performDeploy: ReturnType<typeof vi.fn>;
  };
}

async function driveDeploy(options: NetlifyOptions, urls: ApiDeployUrls = {}): Promise<DriveResult> {
  const deployCalls: PerformDeployArgs[] = [];
  const logs: string[] = [];
  const spies = {
    setSiteEnvVar: vi.fn(async () => undefined),
    verifySiteEnvVar: vi.fn(async () => ({ status: 'verified' as const })),
    resolveSiteId: vi.fn(async () => 'probe-site-id'),
    ensureLinkedSite: vi.fn(() => undefined),
    performDeploy: vi.fn(async (args: PerformDeployArgs) => {
      deployCalls.push(args);
      return urls;
    }),
  };
  const services: Partial<NetlifyDeployServices> = {
    parentEnv: { PATH: '/probe/bin' },
    buildArtifacts: () => ({ paths: probePaths, options, frontendEnv: {}, backendEnv: {} }),
    inspectArtifacts: () => undefined,
    checkBuildTools: () => undefined,
    ensureNetlifyToml: () => undefined,
    resolveSiteId: spies.resolveSiteId,
    ensureLinkedSite: spies.ensureLinkedSite,
    setSiteEnvVar: spies.setSiteEnvVar,
    verifySiteEnvVar: spies.verifySiteEnvVar,
    performDeploy: spies.performDeploy,
    log: (message = '') => {
      logs.push(message);
    },
  };
  const report = await runDeploy(options, probePaths, services);
  return { deployCalls, logs, report, spies };
}

describe('DEPLOY-01 (API path): performDeploy call contract', () => {
  it('prod deploy passes siteId + prod:true with no alias/message', async () => {
    const { deployCalls } = await driveDeploy(baseOptions({ prod: true, publicDemoAcknowledged: true }));
    expect(deployCalls).toHaveLength(1);
    expect(deployCalls[0]).toMatchObject({
      authToken: AUTH_TOKEN,
      siteId: 'probe-site-id',
      distAbs: probePaths.distAbs,
      functionsAbs: probePaths.functionsAbs,
      prod: true,
      dryRun: false,
    });
    expect(deployCalls[0].alias).toBeUndefined();
    expect(deployCalls[0].message).toBeUndefined();
  });

  it('alias draft deploy passes alias and prod:false', async () => {
    const { deployCalls } = await driveDeploy(baseOptions({ alias: 'staging' }));
    expect(deployCalls).toHaveLength(1);
    expect(deployCalls[0]).toMatchObject({ siteId: 'probe-site-id', prod: false, alias: 'staging' });
  });

  it('branch-override deploy synthesizes alias and never forwards branch/context', async () => {
    const { deployCalls } = await driveDeploy(baseOptions({ branch: 'staging' }));
    expect(deployCalls).toHaveLength(1);
    expect(deployCalls[0]).toMatchObject({ alias: 'staging', prod: false });
    expect(deployCalls[0]).not.toHaveProperty('branch');
    expect(deployCalls[0]).not.toHaveProperty('context');
  });

  it('message deploy forwards the message', async () => {
    const { deployCalls } = await driveDeploy(baseOptions({ message: 'ship it' }));
    expect(deployCalls).toHaveLength(1);
    expect(deployCalls[0]).toMatchObject({ siteId: 'probe-site-id', message: 'ship it' });
  });

  it('plain draft deploy carries prod:false and no alias/message', async () => {
    const { deployCalls } = await driveDeploy(baseOptions());
    expect(deployCalls).toHaveLength(1);
    expect(deployCalls[0]).toMatchObject({ siteId: 'probe-site-id', prod: false, dryRun: false });
    expect(deployCalls[0].alias).toBeUndefined();
    expect(deployCalls[0].message).toBeUndefined();
  });

  it('deploys via the API: token flows via the authToken param, never a child env', async () => {
    const { deployCalls, spies } = await driveDeploy(baseOptions({ alias: 'staging' }));
    expect(spies.performDeploy).toHaveBeenCalledTimes(1);
    expect(deployCalls[0].authToken).toBe(AUTH_TOKEN);
  });

  it('dry-run calls performDeploy with dryRun=true and records no remote mutations', async () => {
    const { deployCalls, report, spies } = await driveDeploy(baseOptions({ dryRun: true }));
    expect(deployCalls).toHaveLength(1);
    expect(deployCalls[0]).toMatchObject({ siteId: 'probe-site-id', dryRun: true });
    // No remote mutation is recorded or performed on dry runs.
    expect(report.remoteMutations).toEqual([]);
    expect(spies.resolveSiteId).not.toHaveBeenCalled();
    expect(spies.ensureLinkedSite).not.toHaveBeenCalled();
    expect(spies.setSiteEnvVar).not.toHaveBeenCalled();
    expect(spies.verifySiteEnvVar).not.toHaveBeenCalled();
  });

  it('records a completed deploy mutation on success', async () => {
    const { report } = await driveDeploy(baseOptions(), { deployUrl: 'https://d--probe.netlify.app' });
    expect(report.remoteMutations).toContainEqual({
      operation: 'deploy to site probe-site-id',
      status: 'completed',
    });
  });
});

describe('DEPLOY-01 (API path): result URL / logs selection', () => {
  const DEPLOY_URL = 'https://alias--probe.netlify.app';
  const SITE_URL = 'https://probe.netlify.app';
  const LOGS_URL = 'https://app.netlify.com/sites/probe/deploys/d1';

  function deployUrlLines(logs: string[]): string[] {
    return logs.filter((line) => line.includes('Deploy URL:'));
  }

  function logsLines(logs: string[]): string[] {
    return logs.filter((line) => line.includes('Logs:'));
  }

  it('logs deployUrl even when sslUrl differs (alias-originated deploy)', async () => {
    const { logs } = await driveDeploy(baseOptions({ alias: 'staging' }), {
      deployUrl: DEPLOY_URL,
      sslUrl: SITE_URL,
      logsUrl: LOGS_URL,
    });
    const urlLines = deployUrlLines(logs);
    expect(urlLines).toHaveLength(1);
    expect(urlLines[0]).toContain(DEPLOY_URL);
    expect(urlLines[0]).not.toContain(SITE_URL);
  });

  it('prefers deployUrl over sslUrl (CHANGED from the CLI url-first rule; see header)', async () => {
    const { logs } = await driveDeploy(baseOptions(), { deployUrl: DEPLOY_URL, sslUrl: SITE_URL });
    const urlLines = deployUrlLines(logs);
    expect(urlLines).toHaveLength(1);
    expect(urlLines[0]).toContain(DEPLOY_URL);
  });

  it('falls back to sslUrl when deployUrl is absent', async () => {
    const { logs } = await driveDeploy(baseOptions(), { sslUrl: SITE_URL });
    const urlLines = deployUrlLines(logs);
    expect(urlLines).toHaveLength(1);
    expect(urlLines[0]).toContain(SITE_URL);
  });

  it('omits Deploy URL / Logs lines when the result carries no URLs', async () => {
    const { logs } = await driveDeploy(baseOptions(), {});
    expect(deployUrlLines(logs)).toEqual([]);
    expect(logsLines(logs)).toEqual([]);
  });

  it('logs the Logs line only when logsUrl is present', async () => {
    const withLogs = await driveDeploy(baseOptions(), { deployUrl: DEPLOY_URL, logsUrl: LOGS_URL });
    expect(logsLines(withLogs.logs)).toHaveLength(1);
    expect(logsLines(withLogs.logs)[0]).toContain(LOGS_URL);

    const withoutLogs = await driveDeploy(baseOptions(), { deployUrl: DEPLOY_URL });
    expect(logsLines(withoutLogs.logs)).toEqual([]);
    expect(deployUrlLines(withoutLogs.logs)).toHaveLength(1);
  });
});
