// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  resolvePaths,
  bail,
  BailError,
  SHARED_DEFAULTS,
  SOURCE_DIR,
  redactCommand,
  collectSecrets,
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

describe('redactCommand', () => {
  it('replaces secret values with [REDACTED]', () => {
    const cmd = 'netlify deploy --auth secret-token-123 --site my-site';
    const redacted = redactCommand(cmd, ['secret-token-123']);
    expect(redacted).toBe('netlify deploy --auth [REDACTED] --site my-site');
  });

  it('redacts multiple secrets', () => {
    const cmd = 'netlify env:set MONGODB_URI mongodb://user:pass@host --auth token123 --site abc';
    const redacted = redactCommand(cmd, ['mongodb://user:pass@host', 'token123']);
    expect(redacted).toBe('netlify env:set MONGODB_URI [REDACTED] --auth [REDACTED] --site abc');
  });

  it('does not modify the command when no secrets match', () => {
    const cmd = 'netlify deploy --site my-site --prod';
    const redacted = redactCommand(cmd, ['nonexistent']);
    expect(redacted).toBe(cmd);
  });

  it('redacts auth token from a netlify link command', () => {
    const cmd = 'netlify link --auth secret-token-123 --id site-abc';
    const redacted = redactCommand(cmd, ['secret-token-123']);
    expect(redacted).toBe('netlify link --auth [REDACTED] --id site-abc');
  });

  it('ignores empty secret strings', () => {
    const cmd = 'netlify deploy --auth abc --site my-site';
    const redacted = redactCommand(cmd, ['', 'abc']);
    expect(redacted).toBe('netlify deploy --auth [REDACTED] --site my-site');
  });
});

describe('collectSecrets', () => {
  it('collects truthy non-empty strings', () => {
    const result = collectSecrets('token-123', 'mongodb://uri', undefined, '', 'site-name');
    expect(result).toEqual(['token-123', 'mongodb://uri', 'site-name']);
  });

  it('returns empty array when all values are falsy', () => {
    const result = collectSecrets(undefined, '', undefined);
    expect(result).toEqual([]);
  });

  it('handles single value', () => {
    const result = collectSecrets('secret');
    expect(result).toEqual(['secret']);
  });
});
