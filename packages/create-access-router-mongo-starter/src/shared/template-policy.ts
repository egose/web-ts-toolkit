export const GITIGNORE_FILE = '.gitignore';
export const GITIGNORE_STAGING_ALIAS = '_gitignore';
export const GENERATED_LOCKFILE = 'pnpm-lock.yaml';

export interface TemplatePathPolicy {
  name: string;
  excludedPaths: readonly string[];
  gitignore: 'stage-as-alias' | 'restore-from-alias';
  lockfile: 'generate-and-ship' | 'preserve-shipped';
}

export const PUBLISH_TEMPLATE_POLICY: TemplatePathPolicy = {
  name: 'publish-template',
  excludedPaths: ['node_modules', 'dist', '.tmp', '.netlify', 'netlify', 'netlify.toml', 'api/functions'],
  gitignore: 'stage-as-alias',
  lockfile: 'generate-and-ship',
};

export const SCAFFOLD_TEMPLATE_POLICY: TemplatePathPolicy = {
  name: 'scaffold-template',
  excludedPaths: ['node_modules', 'dist', 'api/functions', 'netlify', '.netlify', '.tmp', '.env'],
  gitignore: 'restore-from-alias',
  lockfile: 'preserve-shipped',
};

export function normalizeTemplatePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
}

export function isTemplatePathExcluded(policy: TemplatePathPolicy, relativePath: string): boolean {
  const normalized = normalizeTemplatePath(relativePath);
  return policy.excludedPaths.some((excluded) => normalized === excluded || normalized.startsWith(`${excluded}/`));
}
