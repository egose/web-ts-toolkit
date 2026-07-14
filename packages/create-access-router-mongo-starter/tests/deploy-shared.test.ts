// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  resolvePaths,
  bail,
  BailError,
  SHARED_DEFAULTS,
  SOURCE_DIR,
  type SharedDeployOptions,
} from '../scripts/deploy-shared';

function repoOptions(overrides: Partial<SharedDeployOptions> = {}): SharedDeployOptions {
  return { ...SHARED_DEFAULTS, ...overrides };
}

describe('SHARED_DEFAULTS', () => {
  it('has sensible defaults', () => {
    expect(SHARED_DEFAULTS.distDir).toBe('dist');
    expect(SHARED_DEFAULTS.functionsDir).toBe('netlify/functions');
    expect(SHARED_DEFAULTS.functionsName).toBe('main');
    expect(SHARED_DEFAULTS.dryRun).toBe(false);
    expect(SHARED_DEFAULTS.ephemeral).toBe(false);
    expect(SHARED_DEFAULTS.noBuild).toBe(false);
  });
});

describe('resolvePaths', () => {
  it('resolves to SOURCE_DIR in repo mode', () => {
    const paths = resolvePaths(repoOptions());
    expect(paths.deployDir).toBe(SOURCE_DIR);
    expect(paths.isEphemeral).toBe(false);
    expect(paths.distAbs).toBe(`${SOURCE_DIR}/dist`);
    expect(paths.functionsAbs).toBe(`${SOURCE_DIR}/netlify/functions`);
  });

  it('respects custom dist/functions dirs in repo mode', () => {
    const paths = resolvePaths(repoOptions({ distDir: 'build', functionsDir: 'functions' }));
    expect(paths.distAbs).toBe(`${SOURCE_DIR}/build`);
    expect(paths.functionsAbs).toBe(`${SOURCE_DIR}/functions`);
  });

  it('throws when --ephemeral and --sandbox-dir are both set', () => {
    expect(() => resolvePaths(repoOptions({ ephemeral: true, sandboxDir: '/tmp/some-dir' }))).toThrow();
  });

  it('creates sandbox dir and returns non-ephemeral paths', () => {
    const sandboxDir = '/tmp/opencode/test-sandbox-paths';
    const paths = resolvePaths(repoOptions({ sandboxDir }));
    expect(paths.isEphemeral).toBe(false);
    expect(paths.deployDir).toBe(sandboxDir);
    expect(paths.distAbs).toBe(`${sandboxDir}/dist`);
  });
});

describe('bail', () => {
  it('throws a BailError', () => {
    try {
      bail('something went wrong');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BailError);
      expect((err as Error).message).toBe('something went wrong');
    }
  });
});
