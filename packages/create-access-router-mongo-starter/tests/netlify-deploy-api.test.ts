// @vitest-environment node
/**
 * DEPLOY-02: CLI-free API deploy (`scripts/netlify-deploy-api.ts`).
 *
 * Uses an injected mock `NetlifyApiClient` + real temp dirs (offline):
 * manifest maps, draft/branch derivation, required-only upload, retry,
 * poll-to-ready, error-state throw, timeout, dry-run zero calls, and
 * `#`/`?` filename rejection.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  collectStaticFiles,
  createSingleFileZip,
  performApiDeploy,
  type PerformApiDeployOptions,
} from '../scripts/netlify-deploy-api';
import type { NetlifyApiClient } from '../scripts/netlify-api';

function makeClient(overrides: Record<string, unknown> = {}): Record<string, Mock> {
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

/** Build a temp fixture: dist/{index.html, assets/app.js} + functions/<name>.cjs */
function makeFixture(functionsName = 'api'): { distAbs: string; functionsAbs: string } {
  const root = mkdtempSync(join(tmpdir(), 'api-deploy-'));
  const distAbs = join(root, 'dist');
  const functionsAbs = join(root, 'functions');
  mkdirSync(join(distAbs, 'assets'), { recursive: true });
  mkdirSync(functionsAbs, { recursive: true });
  writeFileSync(join(distAbs, 'index.html'), '<html>hi</html>');
  writeFileSync(join(distAbs, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(join(functionsAbs, `${functionsName}.cjs`), 'module.exports.handler = async () => ({})');
  return { distAbs, functionsAbs };
}

function baseOptions(
  fixture: { distAbs: string; functionsAbs: string },
  client: Record<string, Mock>,
  overrides: Partial<PerformApiDeployOptions> = {},
): PerformApiDeployOptions {
  return {
    authToken: 'test-token',
    siteId: 'site-123',
    distAbs: fixture.distAbs,
    functionsAbs: fixture.functionsAbs,
    functionsName: 'api',
    prod: false,
    dryRun: false,
    log: () => {},
    client: client as unknown as NetlifyApiClient,
    // Fast deterministic polling for tests (fake clock advanced by sleep).
    ...(() => {
      let now = 0;
      return {
        deps: {
          sleep: async (ms: number): Promise<void> => {
            now += ms;
          },
          now: (): number => now,
        },
        pollIntervalMs: 10,
        diffTimeoutMs: 500,
        deployTimeoutMs: 500,
      };
    })(),
    ...overrides,
  };
}

const sha1 = (s: string): string => createHash('sha1').update(Buffer.from(s)).digest('hex');

describe('collectStaticFiles', () => {
  it('walks recursively with unix-normalized rel paths, sorted', async () => {
    const { readdir } = await import('node:fs/promises');
    const fixture = makeFixture();
    const files = await collectStaticFiles(fixture.distAbs, (dir: string) => readdir(dir, { withFileTypes: true }));
    expect(files.map((f) => f.relPath)).toEqual(['assets/app.js', 'index.html']);
  });

  it('rejects # and ? filenames (CLI parity)', async () => {
    const { readdir } = await import('node:fs/promises');
    const root = mkdtempSync(join(tmpdir(), 'api-deploy-bad-'));
    writeFileSync(join(root, 'a#b.html'), 'x');
    await expect(collectStaticFiles(root, (dir: string) => readdir(dir, { withFileTypes: true }))).rejects.toThrow(
      /Invalid filename a#b\.html/,
    );
  });
});

describe('createSingleFileZip', () => {
  it('produces a deterministic single-entry deflate zip that round-trips', () => {
    const data = Buffer.from('module.exports.handler = 1');
    const a = createSingleFileZip('api.cjs', data);
    const b = createSingleFileZip('api.cjs', data);
    expect(a.equals(b)).toBe(true);
    expect(a.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(a.readUInt16LE(8)).toBe(8); // deflate
    const nameLen = a.readUInt16LE(26);
    expect(a.subarray(30, 30 + nameLen).toString('utf8')).toBe('api.cjs');
    const compLen = a.readUInt32LE(18);
    const payload = a.subarray(30 + nameLen, 30 + nameLen + compLen);
    expect(Buffer.from(inflateRawSync(payload)).equals(data)).toBe(true);
  });
});

describe('performApiDeploy manifests', () => {
  it('sends sha1 file map + sha256 function map to createSiteDeploy', async () => {
    const fixture = makeFixture();
    const client = makeClient();
    client.createSiteDeploy.mockResolvedValue({ id: 'd1', required: [], required_functions: [] });
    client.getSiteDeploy.mockResolvedValue({
      id: 'd1',
      state: 'ready',
      deploy_ssl_url: 'https://d1--site.netlify.app',
      ssl_url: 'https://site.netlify.app',
      admin_url: 'https://app.netlify.com/sites/site',
    });
    await performApiDeploy(baseOptions(fixture, client));
    const params = client.createSiteDeploy.mock.calls[0][0] as {
      siteId: string;
      title?: string;
      body: { files: Record<string, string>; functions: Record<string, string> };
    };
    expect(params.siteId).toBe('site-123');
    expect(params.body.files).toEqual({
      'assets/app.js': sha1('console.log(1)'),
      'index.html': sha1('<html>hi</html>'),
    });
    expect(Object.keys(params.body.functions)).toEqual(['api']);
    expect(params.body.functions.api).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('draft/branch derivation', () => {
  async function captureBody(opts: Partial<PerformApiDeployOptions>): Promise<{
    draft?: boolean;
    branch?: string;
  }> {
    const fixture = makeFixture();
    const client = makeClient();
    client.createSiteDeploy.mockResolvedValue({ id: 'd1', required: [], required_functions: [] });
    client.getSiteDeploy.mockResolvedValue({ id: 'd1', state: 'ready' });
    await performApiDeploy(baseOptions(fixture, client, opts));
    return (client.createSiteDeploy.mock.calls[0][0] as { body: { draft?: boolean; branch?: string } }).body;
  }

  it('prod deploy → draft:false, no branch', async () => {
    expect(await captureBody({ prod: true })).toMatchObject({ draft: false, branch: undefined });
  });

  it('alias deploy → draft:false + branch:alias', async () => {
    expect(await captureBody({ alias: 'preview-1' })).toMatchObject({ draft: false, branch: 'preview-1' });
  });

  it('plain deploy → draft:true', async () => {
    expect(await captureBody({})).toMatchObject({ draft: true, branch: undefined });
  });

  it('passes message as title', async () => {
    const fixture = makeFixture();
    const client = makeClient();
    client.createSiteDeploy.mockResolvedValue({ id: 'd1', required: [], required_functions: [] });
    client.getSiteDeploy.mockResolvedValue({ id: 'd1', state: 'ready' });
    await performApiDeploy(baseOptions(fixture, client, { message: 'hello' }));
    expect((client.createSiteDeploy.mock.calls[0][0] as { title?: string }).title).toBe('hello');
  });
});

describe('upload behavior', () => {
  it('uploads only required files + required functions', async () => {
    const fixture = makeFixture();
    const client = makeClient();
    const wanted = sha1('<html>hi</html>');
    client.createSiteDeploy.mockImplementation(async () => {
      return { id: 'd1', required: [wanted], required_functions: [] as string[] };
    });
    client.uploadDeployFile.mockResolvedValue({});
    client.getSiteDeploy.mockResolvedValue({ id: 'd1', state: 'ready' });
    await performApiDeploy(baseOptions(fixture, client));
    expect(client.uploadDeployFile).toHaveBeenCalledTimes(1);
    expect((client.uploadDeployFile.mock.calls[0][0] as { path: string }).path).toBe('index.html');
    expect(client.uploadDeployFunction).not.toHaveBeenCalled();
  });

  it('uploads the function when required_functions contains its sha', async () => {
    const fixture = makeFixture();
    const client = makeClient();
    client.createSiteDeploy.mockImplementation(async (params: unknown) => {
      const body = (params as { body: { functions: Record<string, string> } }).body;
      return { id: 'd1', required: [], required_functions: [body.functions.api] };
    });
    client.uploadDeployFunction.mockResolvedValue({});
    client.getSiteDeploy.mockResolvedValue({ id: 'd1', state: 'ready' });
    await performApiDeploy(baseOptions(fixture, client));
    expect(client.uploadDeployFile).not.toHaveBeenCalled();
    expect(client.uploadDeployFunction).toHaveBeenCalledTimes(1);
    expect((client.uploadDeployFunction.mock.calls[0][0] as { name: string }).name).toBe('api');
  });

  it('retries transient upload failures', async () => {
    const fixture = makeFixture();
    const client = makeClient();
    client.createSiteDeploy.mockImplementation(async (params: unknown) => {
      const body = (params as { body: { files: Record<string, string> } }).body;
      return { id: 'd1', required: Object.values(body.files), required_functions: [] as string[] };
    });
    const transient = Object.assign(new Error('bad gateway'), { status: 502 });
    client.uploadDeployFile.mockRejectedValueOnce(transient).mockResolvedValue({});
    client.getSiteDeploy.mockResolvedValue({ id: 'd1', state: 'ready' });
    await performApiDeploy(baseOptions(fixture, client));
    // 2 files, first upload fails once then succeeds: 3 calls total.
    expect(client.uploadDeployFile).toHaveBeenCalledTimes(3);
  });

  it('does not retry 422 upload errors', async () => {
    const fixture = makeFixture();
    const client = makeClient();
    client.createSiteDeploy.mockResolvedValue({ id: 'd1', required: ['anysha'], required_functions: [] });
    client.uploadDeployFile.mockRejectedValue(Object.assign(new Error('unprocessable'), { status: 422 }));
    await expect(performApiDeploy(baseOptions(fixture, client))).rejects.toThrow('unknown file sha');
  });
});

describe('polling', () => {
  it('polls getSiteDeploy until ready and derives urls', async () => {
    const fixture = makeFixture();
    const client = makeClient();
    client.createSiteDeploy.mockResolvedValue({ id: 'd9', required: [], required_functions: [] });
    client.getSiteDeploy
      .mockResolvedValueOnce({ id: 'd9', state: 'uploading' })
      .mockResolvedValueOnce({ id: 'd9', state: 'uploading' })
      .mockResolvedValue({
        id: 'd9',
        state: 'ready',
        deploy_ssl_url: 'https://d9--site.netlify.app',
        deploy_url: 'http://d9--site.netlify.app',
        ssl_url: 'https://site.netlify.app',
        url: 'http://site.netlify.app',
        admin_url: 'https://app.netlify.com/sites/site',
      });
    const result = await performApiDeploy(baseOptions(fixture, client));
    expect(client.getSiteDeploy).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      deployUrl: 'https://d9--site.netlify.app',
      sslUrl: 'https://site.netlify.app',
      logsUrl: 'https://app.netlify.com/sites/site/deploys/d9',
      deployId: 'd9',
    });
  });

  it('waits for diff when create response has no required list', async () => {
    const fixture = makeFixture();
    const client = makeClient();
    client.createSiteDeploy.mockResolvedValue({ id: 'd2' });
    client.getSiteDeploy
      .mockResolvedValueOnce({ id: 'd2', state: 'preparing' })
      .mockResolvedValueOnce({ id: 'd2', state: 'prepared', required: [], required_functions: [] })
      .mockResolvedValue({ id: 'd2', state: 'ready' });
    const result = await performApiDeploy(baseOptions(fixture, client));
    expect(client.getSiteDeploy.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(result.deployId).toBe('d2');
  });

  it('throws with error_message on error state', async () => {
    const fixture = makeFixture();
    const client = makeClient();
    client.createSiteDeploy.mockResolvedValue({ id: 'd3', required: [], required_functions: [] });
    client.getSiteDeploy.mockResolvedValue({ id: 'd3', state: 'error', error_message: 'build exploded' });
    await expect(performApiDeploy(baseOptions(fixture, client))).rejects.toThrow('build exploded');
  });

  it('throws on deploy timeout', async () => {
    const fixture = makeFixture();
    const client = makeClient();
    client.createSiteDeploy.mockResolvedValue({ id: 'd4', required: [], required_functions: [] });
    client.getSiteDeploy.mockResolvedValue({ id: 'd4', state: 'uploading' });
    await expect(performApiDeploy(baseOptions(fixture, client))).rejects.toThrow(/Timeout while waiting for deploy/);
  });
});

describe('dryRun', () => {
  it('computes + logs counts/hashes with zero API calls and no client', async () => {
    const fixture = makeFixture();
    const client = makeClient();
    const logs: string[] = [];
    const result = await performApiDeploy({
      ...baseOptions(fixture, client),
      client: undefined,
      dryRun: true,
      log: (m = '') => {
        logs.push(m);
      },
    });
    expect(result).toEqual({});
    expect(client.createSiteDeploy).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('Static files: 2');
    expect(logs.join('\n')).toContain('Functions: 1 (api sha256:');
    expect(logs.join('\n')).toContain('index.html sha1:');
  });
});
