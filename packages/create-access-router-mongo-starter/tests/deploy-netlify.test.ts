// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveDeployContext } from '../scripts/deploy-netlify';

describe('resolveDeployContext', () => {
  it('defaults preview deploys to deploy-preview', () => {
    expect(resolveDeployContext({ prod: false, context: undefined })).toBe('deploy-preview');
  });

  it('preserves explicit preview contexts when not deploying to production', () => {
    expect(resolveDeployContext({ prod: false, context: 'branch:staging' })).toBe('branch:staging');
  });

  it('forces production context when --prod is set', () => {
    expect(resolveDeployContext({ prod: true, context: 'branch:staging' })).toBe('production');
  });
});
