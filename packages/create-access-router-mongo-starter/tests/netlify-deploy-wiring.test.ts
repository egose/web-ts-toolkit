// @vitest-environment node
/**
 * DEPLOY-03: wire the API deploy into `runDeploy`, preserving report semantics.
 *
 * Exercises the DEFAULT `performDeploy` service (the real
 * `defaultPerformDeploy` → `performApiDeploy` wrapper, with a mock
 * `@netlify/api` client injected via the `getClient` cache) against real
 * temp fixture dirs — no network, no `netlify` binary:
 *   - success: deploy mutation completes, `Deploy URL:` / `Logs:` lines logged.
 *   - API failure after deploy creation: deploy mutation stays
 *     `completion-unknown`, surfaces via `DeployFailure.report`, and the
 *     draft is best-effort cancelled via `cancelSiteDeploy` (exactly once —
 *     `performApiDeploy` itself never cancels).
 *   - cancel failure is swallowed: the original deploy error still surfaces.
 *   - dry run: no deploy mutation recorded, zero API calls, secrets never logged.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  defaultPerformDeploy,
  DeployFailure,
  runDeploy,
  type NetlifyDeployServices,
  type NetlifyOptions,
} from '../scripts/deploy-netlify';
import { _resetClient, getClient } from '../scripts/netlify-api';
import { SHARED_DEFAULTS, type DeployPaths } from '../scripts/deploy-shared';

const AUTH_TOKEN = 'wiring-probe-token';
const MONGO_URI = 'mongodb://localhost/wiring-probe-secret';

afterEach(() => {
  _resetClient();
});

function makeFixture(functionsName = 'main'): { paths: DeployPaths } {
  const root = mkdtempSync(join(tmpdir(), 'deploy-wiring-'));
  const distAbs = join(root, 'dist');
  const functionsAbs = join(root, 'functions');
  mkdirSync(distAbs, { recursive: true });
  mkdirSync(functionsAbs, { recursive: true });
  writeFileSync(join(distAbs, 'index.html'), '<html>wiring</html>');
  writeFileSync(join(functionsAbs, `${functionsName}.cjs`), 'module.exports.handler = async () => ({})');
  return { paths: { deployDir: root, distAbs, functionsAbs, isEphemeral: false } };
}

function baseOptions(overrides: Partial<NetlifyOptions> = {}): NetlifyOptions {
  return {
    ...SHARED_DEFAULTS,
    projectRoot: '/probe-project',
    interactive: false,
    authToken: AUTH_TOKEN,
    site: 'site-id',
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

function makeApiClient(overrides: Record<string, unknown> = {}): Record<string, Mock> {
  return {
    getSite: vi.fn(),
    listSites: vi.fn(),
    createSite: vi.fn(),
    createSiteInTeam: vi.fn(),
    getEnvVars: vi.fn(),
    getSiteEnvVars: vi.fn(),
    createEnvVars: vi.fn(),
    updateEnvVar: vi.fn(),
    setEnvVarValue: vi.fn(),
    createSiteDeploy: vi.fn(),
    uploadDeployFile: vi.fn(),
    uploadDeployFunction: vi.fn(),
    getSiteDeploy: vi.fn(),
    cancelSiteDeploy: vi.fn(),
    ...overrides,
  } as Record<string, Mock>;
}

async function seedClientCache(token: string, client: Record<string, Mock>): Promise<void> {
  await getClient(token, (async () => client) as unknown as Parameters<typeof getClient>[1]);
}

interface DriveResult {
  logs: string[];
  report: { remoteMutations: Array<{ operation: string; status: string }> };
}

async function driveWithDefaultDeploy(
  options: NetlifyOptions,
  paths: DeployPaths,
  apiClient: Record<string, Mock>,
): Promise<{ logs: string[]; outcome: { report: DriveResult['report'] } | { failure: DeployFailure } }> {
  await seedClientCache(options.authToken!, apiClient);
  const logs: string[] = [];
  // Every service except `performDeploy` is stubbed: the default API deploy
  // wrapper runs for real against the cached mock API client.
  const services: Partial<NetlifyDeployServices> = {
    parentEnv: { PATH: '/probe/bin' },
    buildArtifacts: () => ({ paths, options, frontendEnv: {}, backendEnv: {} }),
    inspectArtifacts: () => undefined,
    checkBuildTools: () => undefined,
    ensureNetlifyToml: () => undefined,
    resolveSiteId: async () => 'site-id',
    ensureLinkedSite: () => undefined,
    setSiteEnvVar: async () => undefined,
    verifySiteEnvVar: async () => ({ status: 'verified' as const }),
    log: (message = '') => {
      logs.push(message);
    },
  };
  try {
    const report = await runDeploy(options, paths, services);
    return { logs, outcome: { report } };
  } catch (error) {
    if (!(error instanceof DeployFailure)) throw error;
    return { logs, outcome: { failure: error } };
  }
}

describe('DEPLOY-03 wiring: success', () => {
  it('completes the deploy mutation and logs Deploy URL / Logs lines', async () => {
    const { paths } = makeFixture();
    const apiClient = makeApiClient();
    apiClient.createSiteDeploy.mockResolvedValue({ id: 'd1', required: [], required_functions: [] });
    apiClient.getSiteDeploy.mockResolvedValue({
      id: 'd1',
      state: 'ready',
      deploy_ssl_url: 'https://d1--site.netlify.app',
      ssl_url: 'https://site.netlify.app',
      admin_url: 'https://app.netlify.com/sites/site',
    });

    const { logs, outcome } = await driveWithDefaultDeploy(baseOptions(), paths, apiClient);
    expect('report' in outcome).toBe(true);
    if (!('report' in outcome)) return;
    expect(outcome.report.remoteMutations).toContainEqual({
      operation: 'deploy to site site-id',
      status: 'completed',
    });
    const urlLines = logs.filter((line) => line.includes('Deploy URL:'));
    expect(urlLines).toHaveLength(1);
    expect(urlLines[0]).toContain('https://d1--site.netlify.app');
    const logsLines = logs.filter((line) => line.includes('Logs:'));
    expect(logsLines).toHaveLength(1);
    expect(logsLines[0]).toContain('https://app.netlify.com/sites/site/deploys/d1');
    // Secrets never reach the log output.
    expect(logs.join('\n')).not.toContain(AUTH_TOKEN);
    expect(logs.join('\n')).not.toContain(MONGO_URI);
  });
});

describe('DEPLOY-03 wiring: deploy failure', () => {
  it('records a completion-unknown deploy mutation, surfaces via DeployFailure, and cancels the draft once', async () => {
    const { paths } = makeFixture();
    const apiClient = makeApiClient();
    apiClient.createSiteDeploy.mockResolvedValue({ id: 'd9', required: [], required_functions: [] });
    apiClient.getSiteDeploy.mockResolvedValue({ id: 'd9', state: 'error', error_message: 'deploy exploded' });
    apiClient.cancelSiteDeploy.mockResolvedValue({});

    const { outcome } = await driveWithDefaultDeploy(baseOptions(), paths, apiClient);
    expect('failure' in outcome).toBe(true);
    if (!('failure' in outcome)) return;
    expect(outcome.failure).toBeInstanceOf(DeployFailure);
    expect(outcome.failure.message).toContain('deploy exploded');
    expect(outcome.failure.report.remoteMutations).toContainEqual({
      operation: 'deploy to site site-id',
      status: 'completion-unknown',
    });
    // Exactly one cancel, for the created deploy — `performApiDeploy` itself
    // never cancels (single cancel site in `defaultPerformDeploy`).
    expect(apiClient.cancelSiteDeploy).toHaveBeenCalledTimes(1);
    expect(apiClient.cancelSiteDeploy).toHaveBeenCalledWith({ deployId: 'd9' });
  });

  it('still surfaces the original error when best-effort cancel fails', async () => {
    const { paths } = makeFixture();
    const apiClient = makeApiClient();
    apiClient.createSiteDeploy.mockResolvedValue({ id: 'd9', required: [], required_functions: [] });
    apiClient.getSiteDeploy.mockResolvedValue({ id: 'd9', state: 'error', error_message: 'deploy exploded' });
    apiClient.cancelSiteDeploy.mockRejectedValue(new Error('cancel offline'));

    const { outcome } = await driveWithDefaultDeploy(baseOptions(), paths, apiClient);
    expect('failure' in outcome).toBe(true);
    if (!('failure' in outcome)) return;
    expect(outcome.failure.message).toContain('deploy exploded');
    expect(outcome.failure.message).not.toContain('cancel offline');
  });
});

describe('DEPLOY-03 wiring: dry run', () => {
  it('records no deploy mutation and makes zero API calls', async () => {
    const { paths } = makeFixture();
    const apiClient = makeApiClient();
    const { logs, outcome } = await driveWithDefaultDeploy(baseOptions({ dryRun: true }), paths, apiClient);
    expect('report' in outcome).toBe(true);
    if (!('report' in outcome)) return;
    expect(outcome.report.remoteMutations).toEqual([]);
    expect(apiClient.createSiteDeploy).not.toHaveBeenCalled();
    expect(apiClient.uploadDeployFile).not.toHaveBeenCalled();
    expect(apiClient.uploadDeployFunction).not.toHaveBeenCalled();
    expect(apiClient.getSiteDeploy).not.toHaveBeenCalled();
    expect(apiClient.cancelSiteDeploy).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('[dry-run]');
    expect(logs.join('\n')).not.toContain(AUTH_TOKEN);
    expect(logs.join('\n')).not.toContain(MONGO_URI);
  });

  it('defaultPerformDeploy dry-run resolves without touching any client', async () => {
    const { paths } = makeFixture();
    const logs: string[] = [];
    // Fresh token with an empty client cache: a dry run must not need (or
    // resolve) an API client at all.
    const result = await defaultPerformDeploy({
      authToken: 'fresh-token-without-cached-client',
      siteId: 'site-id',
      distAbs: paths.distAbs,
      functionsAbs: paths.functionsAbs,
      functionsName: 'main',
      prod: false,
      dryRun: true,
      log: (message = '') => {
        logs.push(message);
      },
    });
    expect(result).toEqual({});
    expect(logs.join('\n')).toContain('[dry-run]');
  });
});
